const test = require('node:test');
const assert = require('node:assert/strict');
const lines = require('./lines.js');

function square() {
  return [[0, 0], [100, 0], [100, 100], [0, 100]];
}

test('horizontal hatch stays inside the square and is actually horizontal', () => {
  const segs = lines.hatchPolygon(square(), 0, 25, 0);
  assert.equal(segs.length, 3);
  segs.forEach(function (seg) {
    assert.ok(Math.abs(seg.y1 - seg.y2) < 1e-6);
    assert.ok(Math.abs(seg.x1 - 0) < 1e-6);
    assert.ok(Math.abs(seg.x2 - 100) < 1e-6);
    assert.ok(seg.y1 > 0 && seg.y1 < 100);
    assert.equal(seg.role, 'hatch');
  });
});

test('a right angle turns the same square into vertical strokes', () => {
  const segs = lines.hatchPolygon(square(), 90, 25, 0);
  assert.equal(segs.length, 3);
  segs.forEach(function (seg) {
    assert.ok(Math.abs(seg.x1 - seg.x2) < 1e-6);
    assert.ok(seg.x1 > 0 && seg.x1 < 100);
    assert.ok(Math.abs(Math.min(seg.y1, seg.y2) - 0) < 1e-6);
    assert.ok(Math.abs(Math.max(seg.y1, seg.y2) - 100) < 1e-6);
  });
});

test('a hole splits a stroke instead of shading across it', () => {
  const hole = [[40, 40], [60, 40], [60, 60], [40, 60]];
  const segs = lines.hatchPolygon(square(), 0, 10, 0, [hole]);
  const through = segs.filter(function (seg) { return Math.abs(seg.y1 - 50) < 1e-6; });
  assert.ok(through.length >= 2);
  through.forEach(function (seg) {
    const mid = (seg.x1 + seg.x2) / 2;
    assert.ok(mid < 40 || mid > 60);
  });
});

test('point in polygon agrees with the square', () => {
  assert.equal(lines.pointInPoly(50, 50, square()), true);
  assert.equal(lines.pointInPoly(120, 50, square()), false);
  assert.equal(lines.pointInPoly(-1, 50, square()), false);
});

test('three presets stay straight, seeded, and recognizable', () => {
  assert.deepEqual(lines.PRESETS.map(function (p) { return p.id; }), ['portrait', 'mountains', 'spiral']);
  assert.equal(lines.buildScene('nope', 1), null);

  const portrait = lines.buildScene('portrait', 1);
  const face = portrait.regions.find(function (r) { return r.id === 'face'; });
  const pupil = portrait.regions.find(function (r) { return r.id === 'pupil-l'; });
  let px = 0;
  let py = 0;
  pupil.points.forEach(function (p) { px += p[0]; py += p[1]; });
  px /= pupil.points.length;
  py /= pupil.points.length;
  assert.equal(lines.pointInPoly(px, py, face.points), true);
  assert.equal(face.holes.length, 2);
  assert.ok(portrait.regions.some(function (r) { return r.id === 'hair' && r.tone > 0.8; }));

  const again = lines.buildScene('portrait', 1);
  assert.deepEqual(again.regions[0].points, portrait.regions[0].points);
  const other = lines.buildScene('portrait', 2);
  assert.notDeepEqual(other.regions.find(function (r) { return r.id === 'hair'; }).points, portrait.regions.find(function (r) { return r.id === 'hair'; }).points);

  const mountains = lines.buildScene('mountains', 4);
  assert.ok(mountains.regions.filter(function (r) { return r.id === 'peak-l' || r.id === 'peak-r'; }).length >= 6);
  assert.ok(mountains.regions.some(function (r) { return r.id === 'water'; }));
  assert.ok(mountains.lines.some(function (l) { return l.id === 'sun'; }));

  const spiral = lines.buildScene('spiral', 3);
  assert.ok(spiral.lines.some(function (l) { return l.id === 'spiral' && l.points.length > 40; }));
  assert.ok(spiral.regions.filter(function (r) { return r.id === 'chamber'; }).length >= 8);
  const moved = lines.buildScene('spiral', 8);
  assert.notDeepEqual(
    spiral.lines.find(function (l) { return l.id === 'spiral'; }).points[10],
    moved.lines.find(function (l) { return l.id === 'spiral'; }).points[10]
  );
});

test('every preset emits only finite straight segments, and a block-in adds more', () => {
  ['portrait', 'mountains', 'spiral'].forEach(function (id) {
    [1, 2, 99].forEach(function (seed) {
      const scene = lines.buildScene(id, seed);
      const segs = lines.linesFor(scene, { angle: 37, spacing: 16 });
      assert.ok(segs.length > 40, id + ' ' + seed);
      segs.forEach(function (seg) {
        assert.ok(Number.isFinite(seg.x1 + seg.y1 + seg.x2 + seg.y2));
        assert.ok(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) > 0);
        assert.ok(seg.role === 'hatch' || seg.role === 'edge');
        assert.equal(Object.prototype.hasOwnProperty.call(seg, 'cx'), false);
      });
    });
  });

  const scene = lines.buildScene('portrait', 1);
  const plain = lines.linesFor(scene, { angle: 0, spacing: 20 });
  const extra = lines.linesFor(scene, {
    angle: 0,
    spacing: 20,
    extraRegions: [{ id: 'block', tone: 0.8, edge: true, points: square().map(function (p) { return [p[0] + 40, p[1] + 40]; }) }],
  });
  assert.ok(extra.length > plain.length);
});
