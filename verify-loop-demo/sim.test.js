const assert = require('node:assert/strict');
const test = require('node:test');
const sim = require('./sim.js');

const NONE = {};
const ORDERED = { orderedLog: true };
const ONCE = { orderedLog: true, idempotent: true };
const ATOMIC = { orderedLog: true, idempotent: true, atomic: true };
const ALL = { orderedLog: true, idempotent: true, atomic: true, indexRead: true };

test('the happy path passes with every bug still in, and with every fix on', function () {
  [NONE, ORDERED, ONCE, ATOMIC, ALL].forEach(function (fixes) {
    const report = sim.unitTests(fixes);
    assert.equal(report.loaded, true);
    assert.equal(report.ok, true);
    assert.equal(report.tests.length, 4);
    report.tests.forEach(function (item) { assert.equal(item.pass, true, item.name); });
  });
  const names = sim.unitTests(NONE).tests.map(function (item) { return item.name; });
  assert.match(names[2], /rejected/);
  assert.match(names[3], /clock skew/);
});

test('a seed replays the identical failure, and another seed differs', function () {
  const a = sim.runSeed(1, NONE);
  const b = sim.runSeed(1, NONE);
  assert.deepEqual(a, b);
  assert.equal(a.ok, false);
  assert.equal(a.violation.bug, 'snapshot-reorder');
  assert.equal(a.events[a.violation.at].tone, 'bad');
  assert.ok(a.events.some(function (event) { return event.kind === 'reorder'; }));
  assert.match(a.events.find(function (event) { return event.kind === 'reorder'; }).text, /before message/);
  assert.match(a.violation.detail, /Replica is/);
  assert.equal(a.hash, b.hash);
  const other = sim.runSeed(2, NONE);
  assert.notEqual(a.hash, other.hash);
  assert.equal(other.violation.bug, 'snapshot-reorder');
  assert.notDeepEqual(a.spec, other.spec);
});

test('every seed in the budget hits snapshot reorder until the log is ordered', function () {
  for (let seed = 1; seed <= sim.BUDGET; seed += 1) {
    const run = sim.runSeed(seed, NONE);
    assert.equal(run.violation.bug, 'snapshot-reorder');
    assert.equal(run.spec.t1.amount, 10);
    assert.notEqual(run.spec.t1.from, run.spec.t1.to);
    assert.ok(run.spec.skew >= 40 && run.spec.skew < 90);
  }
  const masked = sim.runSeed(4, { idempotent: true, atomic: true, indexRead: true });
  assert.equal(masked.violation.bug, 'snapshot-reorder');
});

test('each scripted fix reveals the next bug, in order', function () {
  for (let seed = 1; seed <= sim.BUDGET; seed += 1) {
    assert.equal(sim.runSeed(seed, ORDERED).violation.bug, 'double-apply');
    assert.equal(sim.runSeed(seed, ONCE).violation.bug, 'torn-transfer');
    assert.equal(sim.runSeed(seed, ATOMIC).violation.bug, 'stale-read');
    assert.equal(sim.runSeed(seed, ALL).ok, true);
    assert.equal(sim.runSeed(seed, ALL).violation, null);
  }

  const doubled = sim.runSeed(1, ORDERED);
  assert.ok(doubled.events.some(function (event) { return event.kind === 'drop'; }));
  assert.match(doubled.violation.detail, /2 times/);
  assert.equal(doubled.events[doubled.violation.at].tone, 'bad');

  const torn = sim.runSeed(1, ONCE);
  assert.ok(torn.events.some(function (event) { return /between the debit and the credit/.test(event.text); }));
  assert.match(torn.violation.detail, /sums to 290/);
  assert.match(torn.violation.invariant, /300/);

  const stale = sim.runSeed(3, ATOMIC);
  assert.ok(stale.events.some(function (event) { return event.kind === 'skew'; }));
  assert.match(stale.violation.detail, new RegExp(stale.spec.t6.to));
  assert.match(stale.violation.detail, /clock is ahead/);

  const clean = sim.runSeed(3, ALL);
  assert.ok(clean.events.some(function (event) {
    return event.kind === 'read' && event.tone === 'ok' && event.text.indexOf(clean.spec.t6.to) !== -1;
  }));
  assert.ok(clean.events.some(function (event) { return /does nothing/.test(event.text); }));
  assert.ok(clean.events.some(function (event) { return /Books sum to 300/.test(event.text); }));
  assert.deepEqual(clean, sim.runSeed(3, ALL));
});

test('discovery stops at the first bad seed, and the rectify loop clears the budget', function () {
  const open = sim.discover(NONE, sim.BUDGET);
  assert.equal(open.ok, false);
  assert.equal(open.first.seed, 1);
  assert.equal(open.first.violation.bug, 'snapshot-reorder');
  assert.equal(open.runs.length, 8);
  assert.ok(open.runs.every(function (run) { return run.ok === false; }));

  const loop = sim.rectifyLoop(sim.BUDGET);
  assert.equal(loop.ok, true);
  assert.deepEqual(loop.rounds.map(function (round) { return round.bug; }), [
    'snapshot-reorder',
    'double-apply',
    'torn-transfer',
    'stale-read',
  ]);
  assert.deepEqual(loop.rounds.map(function (round) { return round.key; }), [
    'orderedLog',
    'idempotent',
    'atomic',
    'indexRead',
  ]);
  assert.equal(loop.fixes.orderedLog, true);
  assert.equal(loop.fixes.idempotent, true);
  assert.equal(loop.fixes.atomic, true);
  assert.equal(loop.fixes.indexRead, true);
  assert.equal(loop.discover.runs.length, 8);
  assert.ok(loop.discover.runs.every(function (run) { return run.ok; }));
  loop.rounds.forEach(function (round) {
    assert.equal(round.hash, sim.runSeed(round.seed, fixesBefore(round.key)).hash);
  });
  assert.equal(sim.REMEDIES['stale-read'].key, 'indexRead');
  assert.equal(sim.INVARIANTS.length, 4);
  assert.deepEqual(sim.fixList(ALL), ['ordered log', 'idempotent ids', 'atomic record', 'index read']);
  assert.deepEqual(sim.fixList(NONE), []);
});

function fixesBefore(key) {
  const fixes = {};
  const order = ['orderedLog', 'idempotent', 'atomic', 'indexRead'];
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] === key) break;
    fixes[order[i]] = true;
  }
  return fixes;
}
