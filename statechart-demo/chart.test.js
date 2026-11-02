const test = require('node:test');
const assert = require('node:assert/strict');
const sc = require('./chart.js');

function ids(state) {
  return state.active.slice().sort();
}

function boot() {
  return sc.boot().state;
}

function send(state, event) {
  return sc.send(state, event);
}

function until(state, id, event, cap) {
  let current = state;
  for (let i = 0; i < (cap || 8); i++) {
    if (sc.has(current, id)) return current;
    current = send(current, event).state;
  }
  return current;
}

function ready() {
  let state = boot();
  state = send(state, 'PLACE_CUP').state;
  state = send(state, 'FILL').state;
  state = send(state, 'FILL').state;
  state = send(state, 'FILL').state;
  state = send(state, 'FILL').state;
  state = send(state, 'POWER').state;
  state = until(state, 'on.boiler.hot', 'HEAT');
  return state;
}

test('a cold start is only off, and the tank and cup are empty', () => {
  const state = boot();
  assert.deepEqual(ids(state), ['off', 'root']);
  assert.equal(state.context.cup, false);
  assert.equal(state.context.water, 0);
  assert.equal(state.context.temp, 20);
  assert.equal(state.context.poured, 0);
});

test('power enters the three regions at their initial states', () => {
  const state = send(boot(), 'POWER').state;
  ['on', 'on.boiler', 'on.boiler.cold', 'on.cycle', 'on.cycle.idle', 'on.wand', 'on.wand.parked'].forEach(function (id) {
    assert.equal(sc.has(state, id), true, id);
  });
  assert.equal(sc.has(state, 'off'), false);
  assert.equal(sc.phaseText(state).indexOf('Cold'), 0);
});

test('brew is refused without a cup, and refused again with a cup but no water', () => {
  let state = send(boot(), 'POWER').state;
  const dry = send(state, 'BREW');
  assert.equal(dry.steps[0].kind, 'ignore');
  assert.match(dry.steps[0].text, /no cup/);
  assert.equal(sc.has(dry.state, 'on.cycle.idle'), true);
  state = send(state, 'PLACE_CUP').state;
  const empty = send(state, 'BREW');
  assert.match(empty.steps[0].text, /tank is empty/);
  assert.equal(sc.has(empty.state, 'on.cycle.idle'), true);
});

test('a cup and water before the boiler is hot wait, then start when heat arrives', () => {
  let state = boot();
  state = send(state, 'PLACE_CUP').state;
  state = send(state, 'FILL').state;
  state = send(state, 'POWER').state;
  const waited = send(state, 'BREW');
  assert.equal(waited.steps[0].id, 'brew-wait');
  assert.equal(sc.has(waited.state, 'on.cycle.waiting'), true);
  assert.equal(sc.has(waited.state, 'on.boiler.cold'), true);
  state = send(waited.state, 'HEAT').state;
  assert.equal(sc.has(state, 'on.boiler.heating'), true);
  state = until(state, 'on.boiler.hot', 'HEAT');
  assert.equal(sc.has(state, 'on.boiler.hot'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling.preinfuse'), true);
  assert.equal(state.context.temp >= 90, true);
});

test('a hot machine brews through preinfuse and pouring, and the parent shot can be cancelled', () => {
  let state = ready();
  const started = send(state, 'BREW');
  assert.equal(started.steps[0].id, 'brew-now');
  assert.equal(sc.has(started.state, 'on.cycle.pulling.preinfuse'), true);
  state = send(started.state, 'BREW_TICK').state;
  assert.equal(sc.has(state, 'on.cycle.pulling.pouring'), true);
  state = send(state, 'LIFT_CUP').state;
  assert.equal(sc.has(state, 'on.cycle.idle'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling'), false);
  assert.equal(state.context.cup, false);
  assert.equal(state.context.poured, 0);
});

test('shallow history reopens the group head on the phase it left', () => {
  let state = ready();
  state = send(state, 'BREW').state;
  state = send(state, 'BREW_TICK').state;
  assert.equal(sc.has(state, 'on.cycle.pulling.pouring'), true);
  state = send(state, 'LATCH').state;
  assert.equal(sc.has(state, 'on.cycle.held'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling'), false);
  assert.equal(state.history['on.cycle.pulling'].id, 'on.cycle.pulling.pouring');
  state = send(state, 'LATCH').state;
  assert.equal(sc.has(state, 'on.cycle.pulling.pouring'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling.preinfuse'), false);
});

test('deep history restores boiler, brew, and wand together', () => {
  let state = ready();
  state = send(state, 'BREW').state;
  state = send(state, 'BREW_TICK').state;
  state = send(state, 'STEAM').state;
  assert.equal(sc.has(state, 'on.wand.steaming'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling.pouring'), true);
  assert.equal(sc.has(state, 'on.boiler.hot'), true);
  const temp = state.context.temp;
  state = send(state, 'POWER').state;
  assert.deepEqual(ids(state), ['off', 'root']);
  assert.equal(state.history.on.kind, 'parallel');
  assert.equal(state.history.on.saved['on.boiler'], 'on.boiler.hot');
  assert.equal(state.history.on.saved['on.cycle'], 'on.cycle.pulling.pouring');
  assert.equal(state.history.on.saved['on.wand'], 'on.wand.steaming');
  assert.equal(state.context.temp, temp);
  state = send(state, 'POWER').state;
  assert.equal(sc.has(state, 'on.boiler.hot'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling.pouring'), true);
  assert.equal(sc.has(state, 'on.wand.steaming'), true);
  assert.equal(sc.has(state, 'on.boiler.cold'), false);
  assert.equal(state.context.temp, temp);
});

test('steam is guarded on heat, and a cooling wand leaves hot and parks', () => {
  let state = send(boot(), 'POWER').state;
  const blocked = send(state, 'STEAM');
  assert.equal(blocked.steps[0].kind, 'ignore');
  assert.match(blocked.steps[0].text, /not hot/);
  state = ready();
  state = send(state, 'STEAM').state;
  assert.equal(sc.has(state, 'on.wand.steaming'), true);
  assert.equal(sc.has(state, 'on.boiler.hot'), true);
  state = send(state, 'STEAM_TICK').state;
  assert.equal(sc.has(state, 'on.boiler.hot'), true);
  state = send(state, 'STEAM_TICK').state;
  assert.equal(sc.has(state, 'on.boiler.heating'), true);
  assert.equal(sc.has(state, 'on.wand.parked'), true);
  assert.equal(state.context.temp < 80, true);
});

test('a shot finishes on the third pour, and the regions stay orthogonal', () => {
  let state = ready();
  state = send(state, 'STEAM').state;
  state = send(state, 'BREW').state;
  state = send(state, 'BREW_TICK').state;
  assert.equal(sc.has(state, 'on.wand.steaming'), true);
  assert.equal(sc.has(state, 'on.cycle.pulling.pouring'), true);
  state = send(state, 'BREW_TICK').state;
  state = send(state, 'BREW_TICK').state;
  const last = send(state, 'BREW_TICK');
  assert.equal(sc.has(last.state, 'on.cycle.done'), true);
  assert.equal(last.state.context.poured, 3);
  assert.equal(sc.has(last.state, 'on.wand.steaming'), true);
  const names = last.steps.map(function (step) { return step.id; });
  assert.ok(names.indexOf('pour-tick') !== -1);
  assert.ok(names.indexOf('pour-done') !== -1);
});

test('the clock names the events the running regions are waiting on', () => {
  let state = send(boot(), 'POWER').state;
  assert.deepEqual(sc.dueEvents(state), ['HEAT']);
  state = send(state, 'HEAT').state;
  assert.deepEqual(sc.dueEvents(state), ['HEAT']);
  state = ready();
  state = send(state, 'BREW').state;
  assert.deepEqual(sc.dueEvents(state), ['BREW_TICK']);
  state = send(state, 'STEAM').state;
  assert.deepEqual(sc.dueEvents(state), ['STEAM_TICK', 'BREW_TICK']);
  state = send(state, 'BREW_TICK').state;
  state = send(boot(), 'POWER').state;
  state = until(state, 'on.boiler.hot', 'HEAT');
  state = send(state, 'STEAM').state;
  assert.deepEqual(sc.dueEvents(state), ['STEAM_TICK']);
});

test('the flat machine is the product of the three regions, and every arrow is copied', () => {
  const count = sc.explosion();
  assert.equal(count.chartStates, 18);
  assert.equal(count.boiler, 3);
  assert.equal(count.cycle, 6);
  assert.equal(count.wand, 2);
  assert.equal(count.product, 36);
  assert.equal(count.flatStates, 37);
  assert.equal(count.chartTransitions > 10, true);
  assert.equal(count.flatTransitions > count.chartTransitions * 2, true);
  assert.equal(sc.flatCells().length, 37);
  const current = sc.currentFlat(ready());
  assert.equal(current.parts.indexOf('on.boiler.hot') !== -1, true);
  assert.equal(current.parts.indexOf('on.cycle.idle') !== -1, true);
  assert.equal(current.parts.indexOf('on.wand.parked') !== -1, true);
});

test('every state has a box inside its parent, and every transition names a real state', () => {
  const seen = {};
  sc.eachTransition(function (item) {
    assert.equal(seen[item.id], undefined, item.id);
    seen[item.id] = true;
    if (!item.target) return;
    const parsed = sc.parseTarget(item.target);
    assert.ok(sc.LAYOUT[parsed.id], item.target);
  });
  Object.keys(sc.LAYOUT).forEach(function (id) {
    const box = sc.LAYOUT[id];
    assert.equal(box.x >= 0 && box.y >= 0, true, id);
    assert.equal(box.x + box.w <= sc.VIEW.width, true, id);
    assert.equal(box.y + box.h <= sc.VIEW.height, true, id);
    const parentId = id.indexOf('.') === -1 ? null : id.slice(0, id.lastIndexOf('.'));
    if (parentId && sc.LAYOUT[parentId]) {
      const parent = sc.LAYOUT[parentId];
      assert.equal(box.x >= parent.x, true, id);
      assert.equal(box.y >= parent.y, true, id);
      assert.equal(box.x + box.w <= parent.x + parent.w, true, id);
      assert.equal(box.y + box.h <= parent.y + parent.h, true, id);
    }
  });
  assert.equal(Object.keys(sc.LAYOUT).length, 17);
});

test('the diagram svg marks the active states and the arrow that just fired', () => {
  const state = send(boot(), 'POWER').state;
  const svg = sc.renderDiagram(state, ['power-on']);
  assert.match(svg, /class="state atomic active" data-state="on\.boiler\.cold"/);
  assert.match(svg, /class="state atomic" data-state="off"/);
  assert.match(svg, /class="edge fired" data-edge="power-on"/);
  assert.match(svg, /H\*/);
  assert.match(svg, /aria-label="Statechart/);
  assert.equal(svg.indexOf('<script'), -1);
});
