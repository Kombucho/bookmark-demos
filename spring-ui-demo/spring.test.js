const test = require('node:test');
const assert = require('node:assert/strict');
const spring = require('./spring.js');

test('damping ratio is c over two root k m', () => {
  assert.equal(spring.dampingRatio(20, 0, 1), 0);
  assert.equal(spring.regime(0), 'underdamped');
  const critical = 2 * Math.sqrt(20 * 2);
  assert.equal(spring.dampingRatio(20, critical, 2), 1);
  assert.equal(spring.regime(1), 'critical');
  assert.equal(spring.regime(1.2), 'overdamped');
  assert.equal(spring.regime(0.4), 'underdamped');
  assert.equal(spring.accel(1, 0, 0, {k: 20, c: 0, m: 1}), -20);
  assert.equal(spring.accel(0, 2, 0, {k: 20, c: 4, m: 1}), -8);
});

test('a spring step seeks the target and does not mutate the previous state', () => {
  const start = {x: 1, v: 0, target: 0, a: 0};
  const next = spring.integrate(start, 1 / 60, spring.PRESETS.right);
  assert.equal(start.x, 1);
  assert.equal(start.v, 0);
  assert.ok(next.x < 1);
  assert.ok(next.v < 0);
  assert.equal(next.target, 0);
  assert.ok(Number.isFinite(next.x));
  assert.ok(Number.isFinite(next.v));
});

test('presets separate a dead stop, a small overshoot, a wobble, and a straight line', () => {
  const stiff = spring.simulate(1, 0, spring.PRESETS.stiff, 4, 60);
  const right = spring.simulate(1, 0, spring.PRESETS.right, 4, 60);
  const wobbly = spring.simulate(1, 0, spring.PRESETS.wobbly, 8, 60);
  const linear = spring.simulate(1, 0, spring.PRESETS.linear, 2, 60);

  assert.equal(spring.PRESETS.stiff.mode, 'spring');
  assert.equal(spring.PRESETS.linear.mode, 'linear');
  assert.equal(spring.regime(spring.dampingRatio(
    spring.PRESETS.right.k,
    spring.PRESETS.right.c,
    spring.PRESETS.right.m
  )), 'underdamped');
  assert.equal(spring.regime(spring.dampingRatio(
    spring.PRESETS.wobbly.k,
    spring.PRESETS.wobbly.c,
    spring.PRESETS.wobbly.m
  )), 'underdamped');

  assert.ok(stiff.peakPast < 0.02);
  assert.ok(right.peakPast > 0.08 && right.peakPast < 0.25);
  assert.ok(wobbly.peakPast > right.peakPast + 0.2);
  assert.ok(linear.peakPast < 1e-9);

  assert.ok(stiff.settle != null && stiff.settle < 0.55);
  assert.ok(right.settle != null && right.settle < 0.9);
  assert.ok(wobbly.settle != null && wobbly.settle > right.settle);
  assert.ok(linear.settle != null && linear.settle < 0.45);
  assert.ok(Math.abs(stiff.state.x) < 0.02);
  assert.ok(Math.abs(right.state.x) < 0.02);
  assert.ok(Math.abs(wobbly.state.x) < 0.02);
  assert.equal(linear.state.x, 0);
  assert.equal(linear.state.v, 0);
});

test('stiff arrives sooner than a straight line, and linear never passes the target', () => {
  let stiff = spring.create(1, 0);
  let linear = spring.create(1, 0);
  for (let i = 0; i < 6; i++) {
    stiff = spring.integrate(stiff, 1 / 60, spring.PRESETS.stiff);
    linear = spring.integrate(linear, 1 / 60, spring.PRESETS.linear);
  }
  assert.ok(Math.abs(stiff.x) < Math.abs(linear.x));
  assert.ok(linear.x > 0);

  let rising = spring.create(0, 1);
  for (let i = 0; i < 40; i++) {
    rising = spring.integrate(rising, 1 / 60, spring.PRESETS.linear);
    assert.ok(rising.x <= 1);
    assert.ok(rising.x >= 0);
  }
  assert.equal(rising.x, 1);
});

test('more mass, same stiffness and damping, accelerates less at the start', () => {
  const lightParams = {k: 180, c: 16, m: 0.5, mode: 'spring'};
  const heavyParams = {k: 180, c: 16, m: 2.4, mode: 'spring'};
  let light = spring.create(1, 0);
  let heavy = spring.create(1, 0);
  for (let i = 0; i < 4; i++) {
    light = spring.integrate(light, 1 / 60, lightParams);
    heavy = spring.integrate(heavy, 1 / 60, heavyParams);
  }
  assert.ok(heavy.x > light.x);
  assert.ok(heavy.x < 1);
  assert.ok(Math.abs(heavy.v) < Math.abs(light.v));
});

test('a stiff hitch and an undamped spring stay finite', () => {
  let state = spring.create(1, 0);
  const harsh = {k: 640, c: 2, m: 0.3, mode: 'spring'};
  for (let i = 0; i < 90; i++) {
    state = spring.integrate(state, 1 / 30, harsh);
    assert.ok(Number.isFinite(state.x));
    assert.ok(Number.isFinite(state.v));
    assert.ok(Math.abs(state.x) < 8);
  }

  let bare = spring.create(1, 0);
  const undamped = {k: 200, c: 0, m: 1, mode: 'spring'};
  let peak = 0;
  for (let i = 0; i < 180; i++) {
    bare = spring.integrate(bare, 1 / 60, undamped);
    peak = Math.max(peak, Math.abs(bare.x));
  }
  assert.ok(peak < 1.35);
  assert.ok(Number.isFinite(bare.v));
});

test('linear mode ignores a wild stiffness and stops on the target', () => {
  const params = {k: 900, c: 0, m: 0.2, mode: 'linear', linearSpeed: spring.LINEAR_SPEED};
  const run = spring.simulate(1, 0, params, 1, 60);
  assert.ok(run.peakPast < 1e-9);
  assert.equal(run.state.x, 0);
  let halfway = spring.create(0, 1);
  for (let i = 0; i < 10; i++) halfway = spring.integrate(halfway, 1 / 60, params);
  const expected = 10 * spring.LINEAR_SPEED / 60;
  assert.ok(Math.abs(halfway.x - expected) < 0.02);
  assert.ok(halfway.x < 1);
});
