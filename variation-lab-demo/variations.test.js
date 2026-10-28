const test = require('node:test');
const assert = require('node:assert/strict');
const Lab = require('./variations.js');

test('twenty variations are split evenly across five axes', () => {
  assert.equal(Lab.AXES.length, 5);
  assert.deepEqual(Lab.AXES.map(function (axis) { return axis.id; }), ['layout', 'type', 'color', 'copy', 'radius']);
  assert.equal(Lab.optionCount(), 20);
  for (const axis of Lab.AXES) {
    assert.equal(axis.options.length, 4);
    const ids = axis.options.map(function (item) { return item.id; });
    assert.equal(new Set(ids).size, 4);
  }
});

test('describe returns the fictional card for a selection', () => {
  const spec = Lab.describe(Lab.defaultSelection());
  assert.equal(spec.fictional, true);
  assert.equal(spec.product, 'Paper Kettle');
  assert.equal(spec.price, '$48');
  assert.equal(spec.plan, 'Pro, yearly');
  assert.equal(spec.layout, 'banner');
  assert.equal(spec.color.accent, Lab.COLORS.tide.accent);
  assert.throws(function () { Lab.describe({layout: 'nope', type: 'editorial', color: 'tide', copy: 'plain', radius: 'flat'}); });
});

test('the simulated rate is deterministic and the parts add up', () => {
  const selection = {layout: 'banner', type: 'poster', color: 'clay', copy: 'urgent', radius: 'lifted'};
  const a = Lab.simulate(selection);
  const b = Lab.simulate(selection);
  assert.equal(a.simulated, true);
  assert.equal(b.rate, a.rate);
  assert.equal(a.visits, 2000);
  const sum = a.parts.reduce(function (total, part) { return total + part.tenths; }, 0);
  assert.equal(sum, a.tenths);
  assert.equal(a.clicks, Math.round(2000 * a.rate / 100));
  assert.match(a.formula, /Simulated/);
  const quiet = Lab.simulate({layout: 'compact', type: 'technical', color: 'night', copy: 'quiet', radius: 'flat'});
  assert.notEqual(quiet.rate, a.rate);
  assert.ok(a.parts.some(function (part) { return part.id === 'mix' && part.tenths === 4; }));
  assert.ok(quiet.parts.some(function (part) { return part.id === 'mix' && part.tenths === -2; }));
});

test('pins keep a copy, ignore duplicates, and stop at six', () => {
  let pins = [];
  const first = Lab.defaultSelection();
  const added = Lab.addPin(pins, first);
  pins = added.pins;
  assert.equal(added.added, true);
  first.layout = 'stacked';
  assert.equal(pins[0].selection.layout, 'banner');
  const again = Lab.addPin(pins, pins[0].selection);
  assert.equal(again.added, false);
  assert.equal(again.reason, 'already');

  pins = [];
  const layouts = ['stacked', 'split', 'banner', 'compact'];
  const copies = ['plain', 'quiet'];
  for (let i = 0; i < 6; i++) {
    const result = Lab.addPin(pins, {
      layout: layouts[i % 4],
      type: 'editorial',
      color: 'ink',
      copy: copies[i < 4 ? 0 : 1],
      radius: i < 2 ? 'flat' : 'soft',
    });
    assert.equal(result.added, true);
    pins = result.pins;
  }
  assert.equal(pins.length, Lab.MAX_PINS);
  const overflow = Lab.addPin(pins, {layout: 'stacked', type: 'editorial', color: 'tide', copy: 'quiet', radius: 'sharp'});
  assert.equal(overflow.reason, 'full');
  assert.equal(Lab.removePin(pins, pins[0].key).length, pins.length - 1);
});
