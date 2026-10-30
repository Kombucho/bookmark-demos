const test = require('node:test');
const assert = require('node:assert/strict');
const Toy = require('./runtime.js');

function boot(options) {
  const hosts = [Toy.createMemoryHost(), Toy.createMemoryHost()];
  const runtime = Toy.createRuntime(Object.assign({ hosts: hosts, budgetMs: 5, unitCostMs: 1 }, options || {}));
  const demo = runtime.createDemo();
  runtime.mount(demo.element);
  return { runtime: runtime, demo: demo, hosts: hosts };
}

function text(host) {
  return Toy.flattenText(host.container);
}

test('the highest lane is the rightmost bit', () => {
  const both = Toy.SyncLane | Toy.TransitionLane;
  assert.equal(Toy.getHighestPriorityLane(both), Toy.SyncLane);
  assert.ok(Toy.SyncLane < Toy.TransitionLane);
});

test('mount commits the same tree through every host, and a step does not', () => {
  const rig = boot();
  const first = rig.runtime.step();
  assert.equal(first.phase, 'render');
  assert.equal(text(rig.hosts[0]), '');
  assert.equal(text(rig.hosts[1]), '');
  rig.runtime.finish();
  const screen = text(rig.hosts[0]);
  assert.match(screen, /Northglass/);
  assert.match(screen, /1 pin/);
  assert.match(screen, /Amber vial/);
  assert.match(screen, /Reed pen/);
  assert.equal(text(rig.hosts[1]), screen);
  const ascii = Toy.treeToAscii(rig.hosts[0].container);
  assert.match(ascii, /header\.mast/);
  assert.match(ascii, /Linen swatch/);
  const json = JSON.stringify(Toy.treeToJSON(rig.hosts[0].container));
  assert.match(json, /Cedar rule/);
});

test('a transition yields to the budget and the screen stays on the previous commit', () => {
  const rig = boot();
  rig.runtime.finish();
  const before = text(rig.hosts[0]);
  rig.demo.bridge.log.length = 0;
  rig.demo.bridge.filter('linen');
  const mid = rig.runtime.slice();
  assert.equal(mid.phase, 'yield');
  assert.equal(mid.lane, 'TransitionLane');
  assert.equal(mid.blocking, false);
  assert.ok(mid.units >= 1);
  assert.ok(mid.units <= 5);
  assert.equal(text(rig.hosts[0]), before);
  assert.equal(rig.demo.bridge.log.some(function (line) { return line === 'effect: filter linen'; }), false);
});

test('SyncLane ignores the budget and commits in one slice', () => {
  const rig = boot({ budgetMs: 1, unitCostMs: 5 });
  rig.runtime.finish();
  rig.demo.bridge.pin();
  const done = rig.runtime.slice();
  assert.equal(done.phase, 'idle');
  assert.match(text(rig.hosts[0]), /2 pins/);
  assert.ok(done.lastCommit);
  assert.equal(done.lastCommit.lane, 'SyncLane');
  assert.ok(done.sliceSpent > done.budgetMs);
});

test('stepping stops on the effect list before the hosts update', () => {
  const rig = boot();
  rig.runtime.finish();
  rig.demo.bridge.pin();
  let snap = null;
  let guard = 0;
  do {
    snap = rig.runtime.step();
    guard += 1;
  } while (snap.phase !== 'commit-ready' && guard < 500);
  assert.equal(snap.phase, 'commit-ready');
  assert.ok(snap.effects.length >= 1);
  assert.ok(snap.effects.some(function (effect) {
    return effect.flags.indexOf('Update') !== -1 || effect.flags.indexOf('Passive') !== -1;
  }));
  assert.match(text(rig.hosts[0]), /1 pin/);
  const committed = rig.runtime.step();
  assert.match(text(rig.hosts[0]), /2 pins/);
  assert.match(text(rig.hosts[1]), /2 pins/);
  assert.ok(committed.lastCommit.calls.some(function (call) { return call.indexOf('commitTextUpdate') === 0; }));
  assert.ok(committed.lastCommit.passive.indexOf('Mast') !== -1);
});

test('a click throws away an unfinished transition, and the filter commits once', () => {
  const rig = boot();
  rig.runtime.finish();
  rig.demo.bridge.log.length = 0;
  const before = text(rig.hosts[0]);
  rig.demo.bridge.filter('linen');
  const mid = rig.runtime.slice();
  assert.equal(mid.phase, 'yield');
  rig.demo.bridge.pin();
  const interrupted = rig.runtime.snapshot();
  assert.equal(interrupted.discard.kind, 'interrupt');
  assert.ok(interrupted.discard.count > 0);
  assert.equal(interrupted.lane, 'SyncLane');
  assert.equal(text(rig.hosts[0]), before);
  assert.equal(rig.demo.bridge.log.some(function (line) { return line.indexOf('filter linen') !== -1; }), false);

  const afterSync = rig.runtime.finish();
  const synced = text(rig.hosts[0]);
  assert.match(synced, /2 pins/);
  assert.match(synced, /All specimens/);
  assert.equal(synced.indexOf('Filter: linen'), -1);
  assert.equal(afterSync.lane, 'TransitionLane');
  assert.equal(rig.demo.bridge.log.filter(function (line) { return line === 'effect: 2 pins'; }).length, 1);

  rig.runtime.finish();
  const finalText = text(rig.hosts[0]);
  assert.match(finalText, /2 pins/);
  assert.match(finalText, /Filter: linen/);
  assert.match(finalText, /Linen swatch/);
  assert.equal(finalText.indexOf('Amber vial'), -1);
  assert.equal(finalText.indexOf('Cedar rule'), -1);
  assert.equal(text(rig.hosts[1]), finalText);
  assert.equal(rig.demo.bridge.log.filter(function (line) { return line === 'effect: filter linen'; }).length, 1);
  const commit = rig.runtime.snapshot().lastCommit;
  assert.ok(commit.effects.some(function (effect) { return effect.flags.indexOf('ChildDeletion') !== -1; }));
});

test('setting state to the value it already has does not render', () => {
  const rig = boot();
  rig.runtime.finish();
  const logLength = rig.runtime.snapshot().log.length;
  rig.demo.bridge.filter('all');
  const snap = rig.runtime.snapshot();
  assert.equal(snap.phase, 'idle');
  assert.equal(snap.log.length, logLength);
});

test('a hook call outside a component is refused', () => {
  const rig = boot();
  rig.runtime.finish();
  const message = rig.demo.bridge.outside();
  assert.match(message, /Invalid hook call/);
});
