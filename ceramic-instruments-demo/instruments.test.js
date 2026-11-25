const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Kit = require('./instruments.js');

test('four instrument SVGs are paths in the page, with no empty geometry', function () {
  assert.equal(Kit.instruments.length, 4);
  Kit.instruments.forEach(function (inst) {
    assert.match(inst.svg, /<svg/);
    assert.match(inst.svg, /viewBox="/);
    assert.match(inst.svg, /<path/);
    assert.match(inst.svg, /data-proud="/);
    assert.ok(!inst.svg.includes('NaN'), inst.id);
    assert.ok(!inst.svg.includes('undefined'), inst.id);
    const paths = inst.svg.match(/<path\b/g);
    assert.ok(paths.length >= 4, inst.id);
  });
  assert.deepEqual(Kit.instruments.map(function (inst) { return inst.id; }), ['dial', 'gauge', 'ruler', 'knob']);
});

test('draw range eases in, and the divider stays on the canvas', function () {
  assert.equal(Kit.drawCount(0, 1000, 8), 0);
  assert.equal(Kit.drawCount(-5, 1000, 8), 0);
  assert.equal(Kit.drawCount(1000, 1000, 8), 8);
  assert.equal(Kit.drawCount(500, 1000, 8), Math.round(8 * (1 - Math.pow(0.5, 3))));
  assert.equal(Kit.drawCount(20, 0, 8), 8);
  let prev = -1;
  for (let t = 0; t <= 1000; t += 40) {
    const count = Kit.drawCount(t, 1000, 24);
    assert.ok(count >= prev);
    prev = count;
  }
  assert.equal(Kit.splitRatio(50, 0, 100), 0.5);
  assert.equal(Kit.splitRatio(-20, 0, 100), 0.08);
  assert.equal(Kit.splitRatio(400, 0, 100), 0.92);
  assert.equal(Kit.splitRatio(10, 0, 0), 0.5);

  const spots = Kit.layout(4, 0);
  assert.equal(spots.length, 4);
  assert.ok(Math.abs(spots[0].x) < 1e-9);
  assert.equal(spots[0].scale, 1);
  assert.ok(spots[1].x > 0);
  assert.ok(spots[1].scale < 1);
  assert.ok(spots[1].z < spots[0].z);
});

test('the scene uses the four techniques, and the index links the demo', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const scene = fs.readFileSync(path.join(__dirname, 'scene.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(html, /https:\/\/x\.com\/0xcinzano\/status\/2124933842192502905/);
  assert.match(html, /SVGLoader/);
  assert.match(html, /setDrawRange/);
  assert.match(html, /setScissor/);
  assert.match(html, /overrideMaterial/);
  assert.match(scene, /SVGLoader/);
  assert.match(scene, /MeshPhysicalMaterial/);
  assert.match(scene, /clearcoat/);
  assert.match(scene, /setDrawRange/);
  assert.match(scene, /setScissorTest/);
  assert.match(scene, /overrideMaterial/);
  assert.match(scene, /RoomEnvironment/);
  assert.match(index, /href="ceramic-instruments-demo\/"/);
  assert.match(readme, /\[Ceramic instruments\]\(ceramic-instruments-demo\/\)/);
});
