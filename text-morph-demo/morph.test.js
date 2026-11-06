const test = require('node:test');
const assert = require('node:assert/strict');
const morph = require('./morph.js');

function findGlyph(glyphs, ch, role) {
  return glyphs.find(function (g) { return g.char === ch && g.role === role; });
}

test('currency keeps the comma, the cents, and a leading dollar', () => {
  assert.equal(morph.formatMoney(9642.18), '$9,642.18');
  assert.equal(morph.formatMoney(1000), '$1,000.00');
  assert.equal(morph.formatMoney(0), '$0.00');
  assert.equal(morph.formatMoney(1.005), '$1.01');
  assert.equal(morph.formatCount(12840), '12,840');
  assert.equal(morph.formatCount(326), '326');
});

test('a formatted string tokenizes back into itself', () => {
  ['$9,642.18', '$1,000.00', '$999.99', '$10,000.00', '12,840', '326', '$0.00'].forEach(function (s) {
    assert.equal(morph.tokensOf(s).map(function (t) { return t.ch; }).join(''), s);
  });
  assert.equal(morph.numericValue('$9,642.18'), 9642.18);
  assert.equal(morph.numericValue('12,840'), 12840);
});

test('an upward carry rolls 9 to 0 and makes room for the new place', () => {
  const atStart = morph.numberFrame('$999.99', '$1,000.00', 0);
  const ones = atStart.find(function (c) { return c.key === 'int:0'; });
  assert.equal(ones.phase, 'roll');
  assert.deepEqual(ones.chars, ['9', '0']);
  const sep = atStart.find(function (c) { return c.key === 'sep:3'; });
  assert.equal(sep.phase, 'enter');
  assert.equal(sep.widthFactor, 0);
  const prefix = atStart.find(function (c) { return c.key === 'prefix'; });
  assert.equal(prefix.phase, 'steady');
  assert.deepEqual(prefix.chars, ['$']);
  assert.equal(morph.readColumns(atStart), '$999.99');
  assert.equal(morph.readColumns(morph.numberFrame('$999.99', '$1,000.00', 1)), '$1,000.00');
});

test('a digit rolls through the steps in the direction of the value', () => {
  assert.deepEqual(morph.roll('0', '6', 1), ['0', '1', '2', '3', '4', '5', '6']);
  assert.deepEqual(morph.roll('6', '0', -1), ['6', '5', '4', '3', '2', '1', '0']);
  const mid = morph.numberFrame('$10.00', '$16.00', 0.5);
  const ones = mid.find(function (c) { return c.key === 'int:0'; });
  assert.deepEqual(ones.chars, ['0', '1', '2', '3', '4', '5', '6']);
  assert.equal(ones.offset, 6 * morph.ease(0.5));
  const tens = mid.find(function (c) { return c.key === 'int:1'; });
  assert.equal(tens.phase, 'steady');
  assert.equal(morph.readColumns(morph.numberFrame('$9,642.18', '$9,642.18', 0.4)), '$9,642.18');
});

test('shared letters keep their order and the others enter or leave', () => {
  const plan = morph.matchChars('cat', 'car');
  assert.deepEqual(plan.matches.map(function (m) { return m.char; }), ['c', 'a']);
  assert.deepEqual(plan.removed, [2]);
  assert.deepEqual(plan.added, [2]);
  const measure = function () { return 10; };
  const at0 = morph.glyphFrame('cat', 'car', measure, 0, 8);
  const at1 = morph.glyphFrame('cat', 'car', measure, 1, 8);
  assert.equal(findGlyph(at0, 'a', 'keep').x - findGlyph(at0, 'c', 'keep').x, 10);
  assert.equal(findGlyph(at0, 't', 'exit').opacity, 1);
  assert.equal(findGlyph(at0, 't', 'exit').y, 0);
  assert.equal(findGlyph(at0, 'r', 'enter').opacity, 0);
  assert.equal(findGlyph(at0, 'r', 'enter').y, 8);
  assert.equal(findGlyph(at1, 't', 'exit').opacity, 0);
  assert.equal(findGlyph(at1, 't', 'exit').y, -8);
  assert.equal(findGlyph(at1, 'r', 'enter').opacity, 1);
  assert.equal(findGlyph(at1, 'r', 'enter').y, 0);
  assert.ok(findGlyph(at1, 'r', 'enter').x > findGlyph(at1, 'a', 'keep').x);
  assert.equal(morph.shownText(at0), 'cat');
  assert.equal(morph.shownText(at1), 'car');
});

test('a status line keeps matching characters in reading order', () => {
  const plan = morph.matchChars(morph.PHRASES[0], morph.PHRASES[1]);
  assert.ok(plan.matches.length >= 2);
  for (let i = 1; i < plan.matches.length; i++) {
    assert.ok(plan.matches[i].oldIndex > plan.matches[i - 1].oldIndex);
    assert.ok(plan.matches[i].newIndex > plan.matches[i - 1].newIndex);
  }
  const same = morph.matchChars('On my way.', 'On my way.');
  assert.equal(same.removed.length, 0);
  assert.equal(same.added.length, 0);
  assert.equal(same.matches.length, 'On my way.'.length);
});

test('the money walk stays in range and repeats from a seed', () => {
  const once = morph.stepMoney(9642.18, morph.mulberry32(5));
  const twice = morph.stepMoney(9642.18, morph.mulberry32(5));
  assert.equal(once, twice);
  assert.ok(once >= 40 && once <= 80000);
  assert.notEqual(once, 9642.18);
  const count = morph.stepCount(326, morph.mulberry32(9), 40, 12, 4000);
  assert.equal(count, morph.stepCount(326, morph.mulberry32(9), 40, 12, 4000));
  assert.ok(count >= 12 && count <= 4000);
});
