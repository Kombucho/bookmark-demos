const test = require('node:test');
const assert = require('node:assert/strict');
const dither = require('./dither.js');

function tones(result) {
  return result.cells.map(function (cell) { return cell.tone; });
}

test('Bayer tiles are the usual integers, and 8x8 is a permutation of 0..63', () => {
  assert.deepEqual(dither.bayer(2), [[0, 2], [3, 1]]);
  assert.deepEqual(dither.bayer(4), [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ]);
  assert.equal(dither.bayer(3), null);
  const eight = dither.bayer(8);
  assert.deepEqual(eight[0], [0, 32, 8, 40, 2, 34, 10, 42]);
  const flat = eight.flat();
  assert.equal(new Set(flat).size, 64);
  assert.equal(Math.min.apply(null, flat), 0);
  assert.equal(Math.max.apply(null, flat), 63);
});

test('a Bayer threshold is (value + 1/2) / n² and the tile repeats', () => {
  assert.equal(dither.thresholdAt('bayer2', 0, 0, 0, 1), 0.5 / 4);
  assert.equal(dither.thresholdAt('bayer2', 1, 0, 0, 1), 2.5 / 4);
  assert.equal(dither.thresholdAt('bayer4', 5, 1, 0, 1), dither.thresholdAt('bayer4', 1, 1, 0, 1));
  assert.equal(dither.matrixValue('bayer4', 5, 1), 4);
  assert.equal(dither.thresholdAt('threshold', 9, 9, 4, 1), 0.5);
  assert.equal(dither.thresholdAt('nope', 0, 0, 0, 1), null);
});

test('equal to the threshold stays ink, and a brighter sample is paper', () => {
  assert.equal(dither.decide(0.5, 0.5), 'ink');
  assert.equal(dither.decide(0.5, 0.499), 'paper');
});

test('white noise is deterministic, stays in 0..1, and moves when the frame changes', () => {
  const a = dither.hash01(3, 4, 0, 1);
  assert.equal(dither.hash01(3, 4, 0, 1), a);
  assert.ok(a >= 0 && a < 1);
  assert.notEqual(dither.hash01(3, 4, 1, 1), a);
  assert.notEqual(dither.hash01(4, 4, 0, 1), a);
  let below = 0;
  let above = 0;
  for (let i = 0; i < 64; i += 1) {
    const value = dither.hash01(i, 2, 0, 1);
    if (value < 0.5) below += 1;
    else above += 1;
  }
  assert.ok(below > 0 && above > 0);
});

test('constant fields and a mid-grey Bayer tile land on the expected tones', () => {
  const dark = dither.paint(new Float32Array(16).fill(0), 4, 4, 'bayer8', 0, 1);
  const light = dither.paint(new Float32Array(16).fill(1), 4, 4, 'random', 2, 1);
  const mid = dither.paint(new Float32Array(16).fill(0.5), 4, 4, 'bayer4', 0, 1);
  assert.equal(tones(dark).every(function (tone) { return tone === 'ink'; }), true);
  assert.equal(tones(light).every(function (tone) { return tone === 'paper'; }), true);
  assert.equal(tones(mid).filter(function (tone) { return tone === 'paper'; }).length, 8);
  const named = dither.paint([0.875, 0, 0, 0], 2, 2, 'bayer2', 0, 1);
  assert.equal(named.cells[0].tone, 'paper');
  assert.equal(named.cells[0].matrixValue, 0);
  assert.match(dither.explain(named.cells[0], 'bayer2'), /Bayer 2x2 value 0/);
  assert.match(dither.explain(named.cells[0], 'bayer2'), /paper/);
});

test('Floyd–Steinberg spreads the leftover and can leave a value outside 0 to 1', () => {
  const half = dither.paint([0.5, 0.5, 0.5, 0.5], 2, 2, 'floyd', 0, 1);
  assert.deepEqual(tones(half), ['ink', 'paper', 'paper', 'ink']);
  assert.ok(Math.abs(half.cells[1].adjusted - 0.71875) < 1e-6);
  assert.equal(half.cells[0].threshold, 0.5);
  const weights = dither.FLOYD.reduce(function (sum, weight) { return sum + weight.num; }, 0);
  assert.equal(weights, 16);

  const pushed = dither.paint([0.4, 0.9], 2, 1, 'floyd', 0, 1);
  assert.ok(pushed.cells[1].adjusted > 1);
  assert.match(dither.explain(pushed.cells[1], 'floyd'), /outside 0 to 1/);
  assert.match(dither.explain(pushed.cells[1], 'floyd'), /7\/16 right/);

  const flat = dither.paint(new Float32Array(4).fill(0), 2, 2, 'floyd', 0, 1);
  assert.equal(tones(flat).every(function (tone) { return tone === 'ink'; }), true);
  const white = dither.paint(new Float32Array(4).fill(1), 2, 2, 'floyd', 0, 1);
  assert.equal(tones(white).every(function (tone) { return tone === 'paper'; }), true);
});

test('the gradient climbs, the sphere ignores time, and the moving sources do not', () => {
  const width = 40;
  const height = 24;
  assert.equal(dither.sample('gradient', 0, 3, width, height, 0), 0.5 / width);
  assert.ok(dither.sample('gradient', width - 1, 0, width, height, 0) > dither.sample('gradient', 0, 0, width, height, 0));
  assert.equal(dither.sample('gradient', 4, 0, width, height, 0), dither.sample('gradient', 4, height - 1, width, height, 5));

  const center = dither.sample('sphere', width / 2, height / 2, width, height, 0);
  assert.equal(dither.sample('sphere', 0, 0, width, height, 0), 1);
  assert.ok(center > 0.6);
  assert.equal(dither.sample('sphere', width / 2, height / 2, width, height, 4), center);
  let darkest = 1;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const x = Math.round(width / 2 + Math.cos(angle) * width * 0.28);
    const y = Math.round(height / 2 + Math.sin(angle) * height * 0.28);
    darkest = Math.min(darkest, dither.sample('sphere', x, y, width, height, 0));
  }
  assert.ok(darkest < center);

  const swirlA = dither.sample('swirl', 10, 8, width, height, 0);
  const swirlB = dither.sample('swirl', 10, 8, width, height, 0.7);
  assert.ok(swirlA >= 0 && swirlA <= 1);
  assert.notEqual(swirlA, swirlB);

  const globeA = dither.sample('globe', width / 2, height / 2, width, height, 0);
  const globeB = dither.sample('globe', width / 2, height / 2, width, height, Math.PI);
  assert.equal(dither.sample('globe', 0, 0, width, height, 1), 1);
  assert.ok(globeA > globeB);
  assert.equal(dither.sample('nope', 0, 0, width, height, 0), null);
  assert.equal(dither.samplesFrom('nope', 4, 4, 0), null);
});

test('cell sizes divide the field, and a bad grid is refused', () => {
  dither.CELL_SIZES.forEach(function (cell) {
    const grid = dither.gridFor(cell);
    assert.equal(grid.width * cell, dither.FIELD_W);
    assert.equal(grid.height * cell, dither.FIELD_H);
  });
  assert.equal(dither.gridFor(5), null);
  assert.equal(dither.paint([0, 1], 2, 2, 'threshold', 0, 1).ok, false);
  assert.equal(dither.paint([0], 1, 1, 'missing', 0, 1).ok, false);
});

test('palettes are two distinct colours, and the threshold sentence names ink', () => {
  assert.equal(dither.PALETTES.length, 4);
  dither.PALETTES.forEach(function (item) {
    assert.match(item.ink, /^#[0-9a-f]{6}$/);
    assert.match(item.paper, /^#[0-9a-f]{6}$/);
    assert.notEqual(item.ink, item.paper);
  });
  assert.equal(dither.palette('newsprint').name, 'Newsprint');
  assert.equal(dither.palette('missing'), null);
  const cell = dither.paint([0.2], 1, 1, 'threshold', 0, 1).cells[0];
  assert.equal(cell.tone, 'ink');
  assert.match(dither.explain(cell, 'threshold'), /single threshold is 1\/2/);
  const noisy = dither.paint([0.2], 1, 1, 'random', 3, 1).cells[0];
  assert.match(dither.explain(noisy, 'random'), /frame 3/);
});
