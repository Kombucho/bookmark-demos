const test = require('node:test');
const assert = require('node:assert/strict');
const world = require('./world.js');

function cell(map, x, y) {
  return map.heights[y * map.size + x];
}

test('the same seed builds the same island, and another seed does not', () => {
  const a = world.generateWorld('lakeside-lantern');
  const b = world.generateWorld('lakeside-lantern');
  assert.deepEqual(a, b);
  const c = world.generateWorld('copper-wharf-17');
  const sum = function (map) {
    return map.heights.reduce(function (total, height) { return total + height; }, 0);
  };
  assert.notEqual(Math.round(sum(a)), Math.round(sum(c)));
  assert.equal(a.seed, 'lakeside-lantern');
  assert.equal(world.generateWorld('').seed, world.DEFAULT_SEED);
});

test('the house sits on land above the water, and trees are not in the pond', () => {
  const seeds = ['lakeside-lantern', 'quiet-orchard', 'mossy-ferry-4', 'amber-ridge', 'willow-hearth'];
  for (let i = 0; i < seeds.length; i += 1) {
    const map = world.generateWorld(seeds[i]);
    assert.equal(map.waterCells > 20, true, seeds[i] + ' water');
    assert.equal(map.landCells > 80, true, seeds[i] + ' land');
    assert.equal(map.house.ground > map.water, true, seeds[i] + ' house');
    for (let t = 0; t < map.trees.length; t += 1) {
      const tree = map.trees[t];
      const h = cell(map, Math.floor(tree.x), Math.floor(tree.y));
      assert.equal(h > map.water, true, seeds[i] + ' tree ' + t);
    }
    const footprint = cell(map, map.house.x, map.house.y);
    assert.equal(Math.abs(footprint - map.house.ground) < 0.0001, true);
    assert.equal(map.trees.length >= 8, true, seeds[i]);
  }
});

test('the hash is the seed, and a seed= prefix is accepted', () => {
  assert.equal(world.seedFromHash(''), null);
  assert.equal(world.seedFromHash('#lakeside-lantern'), 'lakeside-lantern');
  assert.equal(world.seedFromHash('#seed=quiet-orchard'), 'quiet-orchard');
  assert.equal(world.seedFromHash('#Amber%20Ridge'), 'Amber-Ridge');
  assert.equal(world.hashForSeed('lakeside-lantern'), '#lakeside-lantern');
  const described = world.describeWorld(world.generateWorld('lakeside-lantern'));
  assert.match(described, /trees/);
  assert.match(described, /pond|shore/);
});
