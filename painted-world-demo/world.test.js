const test = require('node:test');
const assert = require('node:assert/strict');
const world = require('./world.js');

function groundAt(built, x, z) {
  return world.sampleHeight(built, x, z);
}

test('the same seed builds the same hills, and another seed does not', () => {
  const a = world.buildWorld('ridge-walk');
  const b = world.buildWorld('ridge-walk');
  const c = world.buildWorld('glass-hill');
  assert.equal(a.heights.length, (world.GRID + 1) * (world.GRID + 1));
  assert.equal(a.span, world.SPAN);
  assert.deepEqual(a.heights, b.heights);
  assert.notEqual(a.heights[20], c.heights[20]);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < a.heights.length; i += 1) {
    assert.equal(Number.isFinite(a.heights[i]), true);
    if (a.heights[i] < min) min = a.heights[i];
    if (a.heights[i] > max) max = a.heights[i];
  }
  assert.ok(max - min > 2, 'the heightfield has relief');
  assert.ok(min > -1 && max < 14);
});

test('trees and rocks sit on the map, clear of the spawn', () => {
  const built = world.buildWorld('ridge-walk');
  assert.ok(built.trees.length >= 12, 'trees ' + built.trees.length);
  assert.ok(built.rocks.length >= 6, 'rocks ' + built.rocks.length);
  built.trees.concat(built.rocks).forEach(function (prop) {
    assert.ok(prop.x > 1 && prop.x < built.span - 1);
    assert.ok(prop.z > 1 && prop.z < built.span - 1);
    assert.ok(Math.hypot(prop.x - built.spawn.x, prop.z - built.spawn.z) > 2);
  });
  assert.equal(world.meshOk(built.land), true);
  assert.equal(world.meshOk(built.sky), true);
  assert.ok(built.land.indices.length < 120000);
});

test('height samples match the grid and stay between the corners', () => {
  const built = world.buildWorld('low-fog');
  const n = built.grid;
  const x = (10 / n) * built.span;
  const z = (12 / n) * built.span;
  assert.equal(groundAt(built, x, z), built.heights[12 * (n + 1) + 10]);
  const x2 = ((10.5) / n) * built.span;
  const z2 = ((12.5) / n) * built.span;
  const h00 = built.heights[12 * (n + 1) + 10];
  const h10 = built.heights[12 * (n + 1) + 11];
  const h01 = built.heights[13 * (n + 1) + 10];
  const h11 = built.heights[13 * (n + 1) + 11];
  const mid = groundAt(built, x2, z2);
  const lo = Math.min(h00, h10, h01, h11) - 1e-6;
  const hi = Math.max(h00, h10, h01, h11) + 1e-6;
  assert.ok(mid >= lo && mid <= hi);
  assert.equal(Number.isFinite(groundAt(built, -10, built.span + 4)), true);
});

test('the first ground triangle faces up', () => {
  const built = world.buildWorld('ridge-walk');
  const mesh = built.land;
  const ia = mesh.indices[0];
  const ib = mesh.indices[1];
  const ic = mesh.indices[2];
  function at(i) {
    return [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
  }
  const a = at(ia);
  const b = at(ib);
  const c = at(ic);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ny = ab[2] * ac[0] - ab[0] * ac[2];
  assert.ok(ny > 0);
});

test('walking faces the look direction and stays above the ground', () => {
  const built = world.buildWorld('ridge-walk');
  const start = world.spawnPlayer(built);
  assert.ok(start.y > groundAt(built, start.x, start.z));
  const ahead = world.stepPlayer(start, { forward: 1, strafe: 0, lookX: 0, lookY: 0 }, built, 1);
  assert.ok(ahead.z < start.z);
  assert.ok(Math.abs(ahead.x - start.x) < 5);
  const right = world.stepPlayer(start, { forward: 0, strafe: 1, lookX: 0, lookY: 0 }, built, 1);
  assert.ok(right.x > start.x);
  const turned = world.stepPlayer(start, { forward: 0, strafe: 0, lookX: 0.4, lookY: 3 }, built, 0.016);
  assert.equal(turned.yaw, start.yaw + 0.4);
  assert.equal(turned.pitch, 1.15);
  const edge = world.stepPlayer(
    { x: 0.2, y: 4, z: built.span, yaw: 0, pitch: 0 },
    { forward: 1, strafe: -1, lookX: 0, lookY: 0 },
    built,
    1
  );
  assert.ok(edge.x >= 1.5 && edge.x <= built.span - 1.5);
  assert.ok(edge.z >= 1.5 && edge.z <= built.span - 1.5);
  assert.ok(edge.y > groundAt(built, edge.x, edge.z));
});

test('the brush slider maps to a radius and a strength', () => {
  assert.deepEqual(world.brushSettings(0), { radius: 1, strength: 0.4 });
  assert.deepEqual(world.brushSettings(100), { radius: 4, strength: 1 });
  assert.equal(world.brushSettings(50).radius, 3);
  assert.equal(world.brushSettings(-10).radius, 1);
  assert.equal(world.brushSettings(1000).strength, 1);
});
