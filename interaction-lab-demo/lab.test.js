const test = require('node:test');
const assert = require('node:assert/strict');
const lab = require('./lab.js');

test('damping ratio is c over two root k m, and the names sit on either side of 1', () => {
  assert.equal(lab.dampingRatio(20, 0, 1), 0);
  assert.equal(lab.regime(0), 'underdamped');
  const critical = 2 * Math.sqrt(20 * 2);
  assert.equal(lab.dampingRatio(20, critical, 2), 1);
  assert.equal(lab.regime(1), 'critical');
  assert.equal(lab.regime(1.2), 'overdamped');
  assert.equal(lab.springAccel(1, 0, 20, 0, 1, 0), -20);
  assert.equal(lab.springAccel(0, 2, 20, 4, 1, 0), -8);
});

test('a released spring falls back toward rest and a damped one settles', () => {
  const params = {k: 30, c: 0, m: 1, x0: 0};
  let state = {x: 1, v: 0, a: 0};
  state = lab.springIntegrate(state, 1 / 60, params);
  assert.ok(state.x < 1);
  assert.ok(state.v < 0);

  const damped = {k: 40, c: 6, m: 1, x0: 0};
  let s = {x: 1, v: 0, a: 0};
  for (let i = 0; i < 60 * 8; i++) s = lab.springIntegrate(s, 1 / 60, damped);
  assert.ok(Math.abs(s.x) < 0.02);
  assert.ok(Math.abs(s.v) < 0.05);
  assert.equal(lab.regime(lab.dampingRatio(40, 6, 1)), 'underdamped');
});

test('cubic-bezier y of x matches the parametric curve, and 60 frames span the second', () => {
  const x1 = 0.4;
  const y1 = 0;
  const x2 = 0.2;
  const y2 = 1;
  assert.equal(lab.easeY(0, x1, y1, x2, y2), 0);
  assert.ok(Math.abs(lab.easeY(1, x1, y1, x2, y2) - 1) < 1e-9);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = lab.bezierCoord(t, x1, x2);
    const y = lab.bezierCoord(t, y1, y2);
    assert.ok(Math.abs(lab.easeY(x, x1, y1, x2, y2) - y) < 1e-6);
  }
  // Matched controls make y(x) the identity, which is cubic-bezier(x1, x1, x2, x2).
  assert.ok(Math.abs(lab.easeY(0.35, 0.2, 0.2, 0.8, 0.8) - 0.35) < 1e-6);

  const frames = lab.frameSamples(x1, y1, x2, y2, 60);
  assert.equal(frames.length, 61);
  assert.equal(frames[0].frame, 0);
  assert.equal(frames[60].frame, 60);
  assert.equal(frames[0].x, 0);
  assert.equal(frames[60].x, 1);
  let sum = 0;
  for (let i = 0; i < frames.length; i++) sum += frames[i].dy;
  assert.ok(Math.abs(sum - 1) < 1e-6);
});

test('the loupe window is the lens divided by magnification, and it stays inside the page', () => {
  const mid = lab.loupeWindow(100, 80, 40, 4, 400, 300);
  assert.equal(mid.size, 20);
  assert.equal(mid.x, 90);
  assert.equal(mid.y, 70);
  assert.equal((40 * 2) / mid.size, 4);

  const corner = lab.loupeWindow(0, 0, 40, 4, 400, 300);
  assert.equal(corner.x, 0);
  assert.equal(corner.y, 0);
  assert.ok(corner.x + corner.size <= 400);
  assert.ok(corner.y + corner.size <= 300);
});

test('mercury attracts across a gap and repels when the beads overlap', () => {
  const far = lab.pairForce(30, 0, 16, 2);
  assert.ok(far.fx > 0);
  assert.equal(far.fy, 0);
  const near = lab.pairForce(4, 0, 16, 2);
  assert.ok(near.fx < 0);

  const params = {
    rest: 18,
    cohesion: 4,
    damping: 3.2,
    range: 90,
    width: 220,
    height: 120,
    pad: 6,
  };
  let apart = [
    {x: 40, y: 60, vx: 0, vy: 0},
    {x: 100, y: 60, vx: 0, vy: 0},
  ];
  for (let i = 0; i < 180; i++) apart = lab.mercuryStep(apart, 1 / 60, params);
  const gap = Math.abs(apart[0].x - apart[1].x);
  assert.ok(gap < 28);
  assert.ok(gap > 12);

  let piled = [
    {x: 80, y: 60, vx: 0, vy: 0},
    {x: 84, y: 60, vx: 0, vy: 0},
  ];
  piled = lab.mercuryStep(piled, 0.05, params);
  assert.ok(Math.abs(piled[0].x - piled[1].x) > 4);
});

test('torch intensity is zero outside the cone, and brighter on axis and up close', () => {
  const half = 0.45;
  const reach = 80;
  const onAxis = lab.torchIntensity(40, 0, 0, 0, 1, 0, half, reach, 2);
  const wide = lab.torchIntensity(40, 40, 0, 0, 1, 0, half, reach, 2);
  const outside = lab.torchIntensity(0, 40, 0, 0, 1, 0, half, reach, 2);
  const closer = lab.torchIntensity(15, 0, 0, 0, 1, 0, half, reach, 2);
  assert.equal(outside, 0);
  assert.ok(onAxis > wide);
  assert.ok(closer > onAxis);
  assert.ok(onAxis > 0);
  assert.ok(onAxis <= 1);
});

test('liquid keeps a level surface, conserves area, and spills over the mouth', () => {
  const upright = lab.liquidAt(100, 140, 7000, 0);
  assert.ok(Math.abs(upright.contained - 7000) < 1e-4);
  assert.ok(upright.spilled < 1e-6);
  assert.ok(upright.surface.length >= 2);
  const ys = upright.surface.map(function (p) { return p[1]; });
  assert.ok(Math.max.apply(null, ys) - Math.min.apply(null, ys) < 1e-3);
  assert.ok(Math.abs(ys[0] - 70) < 1e-2);

  const tilt = 0.45;
  const held = lab.liquidAt(100, 140, 7000, tilt);
  assert.ok(Math.abs(held.contained - 7000) < 1);
  assert.ok(held.spilled < 1);
  assert.ok(held.surface.length >= 2);
  const screenY = held.surface.map(function (p) {
    return lab.toScreen(p[0], p[1], tilt, 100, 140)[1];
  });
  const spread = Math.max.apply(null, screenY) - Math.min.apply(null, screenY);
  assert.ok(spread < 0.05);

  const mirror = lab.liquidAt(100, 140, 7000, -tilt);
  assert.ok(Math.abs(mirror.contained - held.contained) < 1e-3);

  const flood = lab.liquidAt(100, 100, 10000, Math.PI / 3);
  assert.ok(flood.spilled > 1000);
  assert.ok(flood.contained < 10000);
  assert.ok(Math.abs(flood.contained - flood.maxHold) < 1e-2);

  const inverted = lab.liquidAt(100, 140, 7000, Math.PI);
  assert.ok(inverted.contained < 1);
  assert.ok(inverted.spilled > 6990);

  const gentle = lab.liquidAt(100, 140, 7000, 0.25);
  assert.ok(gentle.spilled < 1e-6);
});
