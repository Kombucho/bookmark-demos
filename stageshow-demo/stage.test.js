const test = require('node:test');
const assert = require('node:assert/strict');
const stage = require('./stage.js');

test('the one sentence is the skill’s sentence', () => {
  assert.equal(
    stage.IDEA,
    'It reads as a real product, simplified to what the viewer needs, framed with intent, and every motion has a cause.'
  );
  assert.equal(stage.RULES.length, 6);
});

test('notes quote the skill’s failures and the motion rule', () => {
  const byId = {};
  stage.RULES.forEach(function (rule) { byId[rule.id] = rule.note; });
  assert.equal(byId.simplify.indexOf('Real text in every row') !== -1, true);
  assert.equal(byId.recognize.indexOf('Two gray blobs and a button') !== -1, true);
  assert.equal(byId.frame.indexOf('screenshot pasted in') !== -1, true);
  assert.equal(byId.weight.indexOf('same bordered card') !== -1, true);
  assert.equal(byId.look.indexOf('no purple as the AI color') !== -1, true);
  assert.equal(byId.motion.indexOf('every motion has a cause') !== -1, true);
});

test('every rule off is the wireframe, boxed, flat, and bland', () => {
  const view = stage.scene(stage.allOff());
  assert.deepEqual(view.faults, ['Wireframe', 'Boxed', 'Flat', 'Bland']);
  assert.deepEqual(view.strings, ['Continue']);
  assert.equal(view.bleed, false);
  assert.equal(view.satellite, 'card');
  assert.equal(view.motion, 'poster');
});

test('every rule on stays inside the word budget and crops the hero', () => {
  const view = stage.scene(stage.allOn());
  assert.deepEqual(view.faults, []);
  assert.equal(view.stringCount >= 3 && view.stringCount <= 7, true);
  assert.equal(view.strings.indexOf('Mira Holt') !== -1, true);
  assert.equal(view.strings.indexOf('10×') === -1, true);
  assert.equal(view.strings.indexOf('Dashboard') === -1, true);
  assert.equal(view.bleed, true);
  assert.equal(view.satellite, 'straddle');
  assert.equal(view.motion, 'assign');
  assert.equal(view.poster, false);
});

test('a recognizable screen without simplification is too much', () => {
  const packed = stage.scene({
    recognize: true,
    look: true,
    frame: true,
    weight: true,
    motion: true
  });
  const quiet = stage.scene(stage.allOn());
  assert.equal(packed.faults.indexOf('Too much') !== -1, true);
  assert.equal(packed.stringCount > 7, true);
  assert.equal(packed.strings[0], 'Berths');
  assert.equal(quiet.stringCount < packed.stringCount, true);
  assert.equal(packed.bleed, true);
  assert.equal(packed.satellite, 'straddle');
});

test('the bland title appears only when the look is off and the screen is packed', () => {
  const bland = stage.scene({ recognize: true });
  const quietPacked = stage.scene({ recognize: true, look: true });
  assert.equal(bland.strings[0], 'Dashboard');
  assert.equal(bland.faults.indexOf('Bland') !== -1, true);
  assert.equal(quietPacked.strings[0], 'Berths');
  assert.equal(quietPacked.faults.indexOf('Bland') === -1, true);
});

test('motion without a product presses Continue and does not crop by itself', () => {
  const view = stage.scene({ motion: true });
  assert.equal(view.motion, 'continue');
  assert.equal(view.bleed, false);
  assert.equal(view.faults.indexOf('Wireframe') !== -1, true);
});
