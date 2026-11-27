const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const usage = require('./usage.js');

const NOW = Date.UTC(2026, 10, 27, 15, 4, 5);

test('four simulated tools, each window separate, Codex 5-hour soonest', function () {
  const state = usage.createState(NOW);
  assert.deepEqual(state.tools.map(function (tool) { return tool.name; }), ['Antigravity', 'Claude', 'Codex', 'Cursor']);
  assert.equal(state.tools.reduce(function (sum, tool) { return sum + tool.windows.length; }, 0), 7);
  state.tools.forEach(function (tool) {
    tool.windows.forEach(function (specWindow) {
      assert.ok(specWindow.limit > specWindow.used);
      assert.equal(usage.left(specWindow), specWindow.limit - specWindow.used);
      assert.equal(usage.usedLine(specWindow), specWindow.used + ' used / ' + usage.left(specWindow) + ' left');
    });
  });
  const next = usage.nextReset(state);
  assert.equal(next.toolId, 'codex');
  assert.equal(next.windowId, '5h');
  assert.equal(next.inMs, 12 * usage.MIN);
  assert.match(next.text, /Codex · 5-hour rolling/);
  assert.equal(usage.band({ used: 69, limit: 100 }), 'ok');
  assert.equal(usage.band({ used: 70, limit: 100 }), 'warm');
  assert.equal(usage.band({ used: 90, limit: 100 }), 'hot');
  assert.equal(usage.band({ used: 100, limit: 100 }), 'full');
  assert.equal(usage.worstBand(usage.toolById(state, 'codex')), 'hot');
  assert.equal(usage.pressure(state).band, 'hot');
});

test('the clock rolls a window back to empty and the next reset follows', function () {
  const state = usage.createState(NOW);
  const codex = usage.toolById(state, 'codex').windows[0];
  const claude = usage.toolById(state, 'claude').windows[0];
  assert.equal(usage.advance(state, NOW + 12 * usage.MIN - 1).length, 0);
  assert.equal(codex.used, 90);

  const crossed = usage.advance(state, NOW + 12 * usage.MIN);
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].toolId, 'codex');
  assert.equal(crossed[0].windowId, '5h');
  assert.equal(codex.used, 0);
  assert.equal(codex.resetsAt, NOW + 12 * usage.MIN + 5 * usage.HOUR);
  assert.equal(codex.resetTick, 1);
  assert.equal(claude.used, 20);
  assert.equal(usage.nextReset(state).toolId, 'antigravity');

  const jump = usage.createState(NOW);
  const rolled = usage.toolById(jump, 'codex').windows[0];
  rolled.resetsAt = NOW;
  rolled.used = 40;
  const many = usage.advance(jump, NOW + 12 * usage.HOUR);
  const hit = many.find(function (item) { return item.toolId === 'codex' && item.windowId === '5h'; });
  assert.equal(hit.periods, 3);
  assert.equal(rolled.used, 0);
  assert.equal(rolled.resetsAt, NOW + 15 * usage.HOUR);
  assert.equal(rolled.resetTick, 3);
});

test('a prompt spends the same amount on every window of that tool, and stops at a full one', function () {
  const state = usage.createState(NOW);
  const codex = usage.toolById(state, 'codex');
  const other = usage.toolById(state, 'claude').windows[0].used;
  assert.equal(usage.sendPrompt(state, 'codex').ok, true);
  assert.equal(codex.windows[0].used, 95);
  assert.equal(codex.windows[1].used, 23);
  assert.equal(usage.toolById(state, 'claude').windows[0].used, other);
  assert.equal(usage.sendPrompt(state, 'codex').ok, true);
  assert.equal(codex.windows[0].used, 100);
  assert.equal(usage.band(codex.windows[0]), 'full');
  const blocked = usage.sendPrompt(state, 'codex');
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /5-hour rolling has 0 left/);
  assert.equal(codex.windows[0].used, 100);
  assert.equal(codex.windows[1].used, 28);
  assert.equal(usage.sendPrompt(state, 'nope').ok, false);
});

test('countdowns, the clock, the 7-day axis, and the speed slider', function () {
  assert.equal(usage.countdown(0), '0m 00s');
  assert.equal(usage.countdown(90000), '1m 30s');
  assert.equal(usage.countdown(3 * usage.HOUR + 2 * usage.MIN + 1000), '3h 02m 01s');
  assert.equal(usage.countdown(2 * usage.DAY + 3 * usage.HOUR + 4 * usage.MIN), '2d 3h 4m');
  assert.equal(usage.formatClock(NOW), 'Fri 27 Nov 15:04:05 UTC');

  const state = usage.createState(NOW);
  const marks = usage.timeline(state);
  assert.equal(marks.rows.length, 7);
  assert.equal(marks.span, usage.WEEK);
  const codex = marks.rows.find(function (row) { return row.toolId === 'codex' && row.kind === '5h'; });
  assert.ok(codex.marks.length >= 30 && codex.marks.length <= 36);
  assert.ok(codex.marks.every(function (mark, index) {
    return mark.fraction >= 0 && mark.fraction <= 1 && (index === 0 || mark.at > codex.marks[index - 1].at);
  }));
  const ticks = usage.dayTicks(NOW);
  assert.equal(ticks[0].label, 'now');
  assert.equal(ticks[ticks.length - 1].label, '+7d');
  assert.equal(ticks.length, 8);
  assert.ok(ticks.slice(1, -1).every(function (tick) { return tick.fraction < 0.86; }));

  assert.equal(usage.speedFromUnit(0), 1);
  assert.equal(usage.speedFromUnit(0.5), 60);
  assert.equal(usage.speedFromUnit(1), 3600);
  assert.equal(usage.clampSpeed(9000), 3600);
  assert.equal(usage.speedCaption(1), '1× · 1 real second is 1 simulated second');
  assert.equal(usage.speedCaption(3600), '3600× · 1 real second is 1 simulated hour');
  assert.ok(Math.abs(usage.unitFromSpeed(60) - 0.5) < 1e-9);
});

test('simulated state round-trips and catches up at the saved speed', function () {
  const state = usage.createState(NOW);
  usage.sendPrompt(state, 'claude');
  const raw = usage.snapshot(state, 3600, 1_000);
  const memory = {
    value: null,
    getItem: function () { return this.value; },
    setItem: function (key, value) {
      assert.equal(key, usage.STORAGE_KEY);
      this.value = value;
    },
  };
  assert.equal(usage.save(memory, state, 3600, 1_000), true);
  const caught = usage.load(memory, 1_000 + 1000);
  assert.equal(caught.speed, 3600);
  assert.equal(usage.toolById(caught.state, 'codex').windows[0].used, 0);
  assert.equal(usage.toolById(caught.state, 'claude').windows[0].used, 28);
  assert.equal(caught.state.now, NOW + 1000 * 3600);
  assert.equal(raw.v, 1);

  assert.equal(usage.load({ getItem: function () { return '{'; } }, NOW), null);
  assert.equal(usage.load({ getItem: function () { return 'null'; } }, NOW), null);
  assert.equal(usage.restore({ v: 1, simNow: NOW, anchorReal: NOW, speed: 1, tools: [] }, NOW), null);
  const bad = usage.snapshot(usage.createState(NOW), 1, NOW);
  bad.tools[0].windows[0].used = 140;
  assert.equal(usage.restore(bad, NOW), null);
  assert.equal(usage.STORAGE_KEY, 'bookmark-demos.usage-reset.v1');
});

test('the catalog links the demo, and the page credits the post', function () {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.match(index, /href="usage-reset-demo\/"/);
  assert.match(page, /akacronos\/status\/2123645811116687846/);
  assert.match(page, /simulation of the Uzzy concept/i);
  assert.match(readme, /usage-reset-demo/);
  assert.doesNotMatch(page, /<(script|link)[^>]+https?:/);
  assert.match(page, /Simulated/);
});
