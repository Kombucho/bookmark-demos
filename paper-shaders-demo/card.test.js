const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const card = require('./card.js');

const vendor = path.join(__dirname, 'vendor/paper-shaders');

test('the vendored package is the pinned 0.0.82 build, with LICENSE and NOTICE', async function () {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(vendor, 'package.json'), 'utf8'));
  assert.equal(pkgJson.name, '@paper-design/shaders');
  assert.equal(pkgJson.version, '0.0.82');
  assert.equal(pkgJson.license, 'Apache-2.0');
  assert.match(fs.readFileSync(path.join(vendor, 'LICENSE'), 'utf8'), /Apache License/);
  assert.match(fs.readFileSync(path.join(vendor, 'NOTICE'), 'utf8'), /Paper Shaders/);
  const pkg = await import('./vendor/paper-shaders/dist/index.js');
  assert.equal(typeof pkg.ShaderMount, 'function');
  assert.equal(typeof pkg.getShaderColorFromString, 'function');
  ['meshGradientFragmentShader', 'dotOrbitFragmentShader', 'liquidMetalFragmentShader', 'paperTextureFragmentShader', 'flutedGlassFragmentShader', 'ditheringFragmentShader'].forEach(function (name) {
    assert.equal(typeof pkg[name], 'string');
    assert.match(pkg[name], /fragColor/);
  });
  assert.equal(pkg.LiquidMetalShapes.diamond, card.METAL_SHAPE.diamond);
  assert.equal(pkg.DitheringTypes['4x4'], card.DITHER_TYPE['4x4']);
  assert.equal(pkg.LiquidMetalShapes.none, 0);
  for (const hex of ['#243056', '#e25b45', '#fff', '#7eb8a2']) {
    assert.deepEqual(card.vec4(hex), pkg.getShaderColorFromString(hex));
  }
});

test('the sample picture is a file in this folder', function () {
  const bytes = fs.readFileSync(path.join(__dirname, 'sample.png'));
  assert.equal(bytes.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(bytes.length > 1000);
});

test('six shaders, and the letter mark is a built-in liquid-metal shape', function () {
  assert.deepEqual(card.SHADERS.map(function (item) { return item.id; }), [
    'mesh', 'dots', 'metal', 'paper', 'glass', 'dither',
  ]);
  const state = card.initialState(false);
  const assets = {noise: 'noise', glass: 'glass', empty: 'empty'};
  const mark = card.uniforms(card.selectShader(state, 'metal'), assets, 'mark');
  const fill = card.uniforms(card.selectShader(state, 'metal'), assets, 'fill');
  assert.equal(mark.u_isImage, false);
  assert.equal(mark.u_shape, card.METAL_SHAPE.diamond);
  assert.equal(mark.u_fit, 1);
  assert.equal(fill.u_shape, card.METAL_SHAPE.none);
  assert.equal(fill.u_image, 'empty');
  assert.match(card.blurb('metal'), /letter mark/);
  const daisy = card.setChoice(card.selectShader(state, 'metal'), 'metalShape', 'daisy');
  assert.equal(card.uniforms(daisy, assets, 'mark').u_shape, card.METAL_SHAPE.daisy);
  assert.equal(card.setChoice(daisy, 'metalShape', 'nope').metalShape, 'daisy');
});

test('pause forces speed to zero, and reduced motion starts paused', function () {
  const live = card.initialState(false);
  assert.equal(live.paused, false);
  assert.equal(card.playbackSpeed(live), 0.35);
  const paused = card.setPaused(live, true);
  assert.equal(card.playbackSpeed(paused), 0);
  assert.equal(card.playbackSpeed(card.initialState(true)), 0);
  const fast = card.setNumber(live, 'speed', 9);
  assert.equal(fast.speed, 1.5);
  assert.equal(card.setNumber(fast, 'scale', 0).scale, 0.25);
});

test('mesh distortion and swirl, dither type, and the four swatches', function () {
  let state = card.initialState(false);
  assert.deepEqual(card.controlVisible('mesh'), {
    distortion: true, swirl: true, metalShape: false, ditherType: false,
  });
  assert.equal(card.controlVisible('dither').ditherType, true);
  assert.equal(card.controlVisible('metal').metalShape, true);
  assert.equal(card.controlVisible('glass').distortion, false);
  state = card.setNumber(state, 'distortion', 0.2);
  state = card.setNumber(state, 'swirl', 0.9);
  const mesh = card.uniforms(state, {}, 'fill');
  assert.equal(mesh.u_distortion, 0.2);
  assert.equal(mesh.u_swirl, 0.9);
  assert.equal(mesh.u_colorsCount, 4);
  assert.equal(mesh.u_colors.length, card.COLOR_COUNT);
  assert.deepEqual(mesh.u_colors[0], card.vec4('#243056'));
  assert.deepEqual(mesh.u_colors[4], [0, 0, 0, 0]);
  state = card.setColor(state, 2, '#112233');
  assert.equal(state.colors[2], '#112233');
  assert.equal(card.setColor(state, 2, 'red').colors[2], '#112233');
  const dither = card.uniforms(card.setChoice(card.selectShader(state, 'dither'), 'ditherType', '2x2'), {}, 'fill');
  assert.equal(dither.u_type, card.DITHER_TYPE['2x2']);
  assert.equal(dither.u_shape, 7);
  assert.deepEqual(card.colorJobs('dither'), ['Ink', 'Ground', 'Not used here', 'Not used here']);
  const glass = card.uniforms(card.selectShader(state, 'glass'), {glass: 'picture'}, 'fill');
  assert.equal(glass.u_image, 'picture');
  assert.equal(glass.u_shape, 1);
});
