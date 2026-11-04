const test = require('node:test');
const assert = require('node:assert/strict');
const sketch = require('./sketch.js');
const pencil = require('./vendor/inkra-pencil.js');

const KNOWN_PATH = 'M 0.00 10.26 L 17.43 10.05 L 34.21 8.82 L 50.77 8.83 L 68.37 8.90 L 85.69 8.83 L 102.94 8.80 L 120.00 10.18';

test('the vendored pencil module matches Inkra 0.15.0 path output', () => {
  assert.equal(
    pencil.createPencilPath({ seed: 7, width: 120, height: 20, roughness: 1.4, points: 8 }),
    KNOWN_PATH
  );
  const again = pencil.createPencilPoints({ seed: 'box', width: 40, height: 16, roughness: 2, points: 5 });
  assert.equal(again.length, 5);
  assert.equal(again[0][0], 0);
  assert.equal(again[4][0], 40);
});

test('a seed rebuilds the same outline, and another seed does not', () => {
  const spec = { shape: 'rect', roughness: 2, strokeWidth: 1.4, width: 180, height: 64 };
  const first = sketch.renderShape(pencil.createPencilPoints, Object.assign({ seed: 1 }, spec));
  const second = sketch.renderShape(pencil.createPencilPoints, Object.assign({ seed: 2 }, spec));
  const repeat = sketch.renderShape(pencil.createPencilPoints, Object.assign({ seed: 1 }, spec));
  assert.equal(first.paths[0].pass, 'main');
  assert.equal(first.paths[0].d, repeat.paths[0].d);
  assert.notEqual(first.paths[0].d, second.paths[0].d);
  assert.equal(first.paths[0].d.startsWith('M'), true);
  assert.equal(first.paths[0].d.endsWith('Z'), true);
  assert.equal(first.paths.some(function (path) { return path.pass === 'grain'; }), true);
});

test('roughness 0 is a straight stroke, and more roughness wobbles further', () => {
  function spread(roughness) {
    const samples = sketch.strokeSamples(pencil.createPencilPoints, {
      seed: 'rule',
      length: 120,
      roughness: roughness,
      points: 11
    });
    return Math.max.apply(null, samples.map(function (point) { return Math.abs(point[1]); }));
  }
  assert.equal(spread(0), 0);
  assert.equal(spread(3) > spread(0.4), true);
  assert.equal(spread(0.4) > 0, true);
});

test('checkbox, slider, and margin marks follow the component state', () => {
  const box = { shape: 'check', seed: 4, roughness: 1.2, strokeWidth: 1.4, width: 28, height: 28 };
  const off = sketch.renderShape(pencil.createPencilPoints, box);
  const on = sketch.renderShape(pencil.createPencilPoints, Object.assign({ checked: true }, box));
  assert.equal(off.paths.some(function (path) { return path.pass === 'fill'; }), false);
  assert.equal(on.paths.filter(function (path) { return path.pass === 'fill'; }).length, 2);
  assert.equal(off.paths.some(function (path) { return path.pass === 'grain'; }), false);

  const range = { shape: 'range', seed: 9, roughness: 1.5, strokeWidth: 1.4, width: 220, height: 36 };
  const left = sketch.renderShape(pencil.createPencilPoints, Object.assign({ value: 0 }, range));
  const right = sketch.renderShape(pencil.createPencilPoints, Object.assign({ value: 1 }, range));
  function thumb(result) {
    return result.paths.find(function (path) { return path.pass === 'thumb'; }).d;
  }
  assert.equal(left.paths.some(function (path) { return path.pass === 'fill'; }), false);
  assert.notEqual(thumb(left), thumb(right));
  assert.equal(sketch.thumbCenter(220, 36, 1.4, 0).x < sketch.thumbCenter(220, 36, 1.4, 1).x, true);

  const card = sketch.renderShape(pencil.createPencilPoints, {
    shape: 'rect',
    seed: 3,
    roughness: 1,
    strokeWidth: 1.4,
    width: 320,
    height: 200,
    margin: true
  });
  assert.equal(card.paths.some(function (path) { return path.pass === 'margin'; }), true);
});
