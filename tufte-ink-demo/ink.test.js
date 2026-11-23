const test = require('node:test');
const assert = require('node:assert/strict');
const ink = require('./ink.js');

function ratio(id) {
  const scene = ink.build(ink.flagsForStep(id));
  return ink.measure(ink.sceneMarks(scene)).ratio;
}

test('the example is four stalls across twelve weeks', function () {
  assert.equal(ink.SERIES.length, 4);
  ink.SERIES.forEach(function (series) {
    assert.equal(series.values.length, 12);
  });
  assert.match(ink.NOTE, /Example data/);
  const span = ink.extent(ink.allValues());
  assert.equal(span.min, 22);
  assert.equal(span.max, 84);
});

test('junk keeps the hatch, the ground, and the legend box', function () {
  const scene = ink.build(ink.flagsForStep('junk'));
  const kinds = scene.marks.map(function (mark) { return mark.kind + ':' + mark.role; });
  assert.ok(kinds.some(function (kind) { return kind === 'hatch:nondata'; }));
  assert.ok(scene.marks.some(function (mark) {
    return mark.kind === 'rect' && mark.role === 'nondata' && mark.fill === '#efe4cf';
  }));
  assert.ok(scene.marks.some(function (mark) {
    return mark.kind === 'rect' && mark.role === 'nondata' && mark.w === 176;
  }));
  assert.equal(scene.pele, null);
});

test('erasing non-data ink removes the hatch and the filled ground', function () {
  const scene = ink.build(ink.flagsForStep('nondata'));
  assert.equal(scene.marks.some(function (mark) { return mark.kind === 'hatch'; }), false);
  assert.equal(scene.marks.some(function (mark) {
    return mark.kind === 'rect' && mark.fill === '#efe4cf';
  }), false);
  assert.ok(scene.marks.some(function (mark) { return mark.role === 'redundant' && mark.kind === 'rect'; }));
});

test('erasing redundant ink leaves stems and drops the digits and fills', function () {
  const scene = ink.build(ink.flagsForStep('redundant'));
  assert.equal(scene.marks.some(function (mark) {
    return mark.role === 'redundant' && mark.kind === 'rect' && mark.h > 20;
  }), false);
  assert.ok(scene.marks.some(function (mark) {
    return mark.role === 'redundant' && mark.w === 18;
  }));
  assert.equal(scene.marks.some(function (mark) {
    return mark.kind === 'text' && mark.size === 9;
  }), false);
  const stems = scene.marks.filter(function (mark) { return mark.kind === 'line' && mark.role === 'data'; });
  assert.equal(stems.length, 48);
});

test('direct labels name the stalls and delete the legend', function () {
  const scene = ink.build(ink.flagsForStep('labels'));
  assert.equal(scene.marks.some(function (mark) { return mark.w === 176; }), false);
  ink.SERIES.forEach(function (series) {
    assert.ok(scene.marks.some(function (mark) {
      return mark.kind === 'text' && mark.role === 'data' && mark.text === series.name;
    }));
  });
});

test('the range frame stops at the example min and max', function () {
  const scene = ink.build(ink.flagsForStep('range'));
  assert.equal(scene.mode, 'lines');
  assert.equal(scene.bounds.y0, 22);
  assert.equal(scene.bounds.y1, 84);
  assert.equal(scene.pele, null);
  const vertical = scene.marks.find(function (mark) {
    return mark.kind === 'line' && mark.role === 'nondata' && mark.x === mark.x2;
  });
  assert.ok(vertical);
  assert.equal(scene.marks.some(function (mark) { return mark.kind === 'rect' && mark.role === 'nondata' && mark.fill === 'none'; }), false);
});

test('the maximized line is a Pele xychart of the example', function () {
  const scene = ink.build(ink.flagsForStep('ratio'));
  assert.match(scene.pele, /xychart-beta/);
  assert.match(scene.pele, /y-axis "cups" 22 --> 84/);
  assert.match(scene.pele, /line "North quay" \[42, 46, 44/);
  assert.match(scene.pele, /line "Old customs"/);
  assert.equal(scene.marks.filter(function (mark) { return mark.via === 'series'; }).length, 4);
});

test('small multiples share one scale and a sparkline has four lines', function () {
  const scene = ink.build(ink.flagsForStep('spark'));
  assert.equal(scene.mode, 'multiples');
  assert.equal(scene.bounds.y0, 22);
  assert.equal(scene.bounds.y1, 84);
  assert.equal(scene.marks.filter(function (mark) { return mark.via === 'series'; }).length, 4);
  assert.equal(scene.spark.filter(function (mark) { return mark.via === 'spark'; }).length, 4);
  assert.equal(scene.pele, null);
  const ys = scene.marks.filter(function (mark) { return mark.kind === 'text' && mark.text === '84'; });
  assert.equal(ys.length, 4);
});

test('the data-ink ratio climbs as the rules stack', function () {
  const ids = ink.STEPS.map(function (step) { return step.id; });
  const ratios = ids.map(ratio);
  ratios.forEach(function (value, index) {
    assert.ok(value > 0 && value < 1, ids[index] + ' ' + value);
  });
  assert.ok(ratios[1] > ratios[0], 'erasing non-data ink');
  assert.ok(ratios[2] > ratios[1], 'erasing redundant ink');
  assert.ok(ratios[3] > ratios[2], 'direct labels');
  assert.ok(ratios[3] > 0.7);
  assert.ok(ratios[4] > 0.7, 'range frame stays high');
  assert.ok(ratios[5] > 0.7, 'thin lines stay high');
  assert.ok(ratios[6] > ratios[0] * 5, 'small multiples');
  assert.ok(ratios[7] > ratios[6], 'the sparkline sentence is mostly data');
  assert.ok(ratios[0] < 0.05);
});

test('a mixed toggle still builds, and an exact stack names its step', function () {
  const mixed = ink.build({
    eraseNonData: true,
    eraseRedundant: false,
    directLabels: true,
    rangeFrame: false,
    thinLines: false,
    multiples: false,
    sparkline: true,
  });
  assert.equal(mixed.mode, 'bars');
  assert.ok(mixed.spark.length > 0);
  assert.equal(ink.stepForFlags(ink.flagsForStep('labels')), 'labels');
  assert.equal(ink.stepForFlags({
    eraseNonData: false,
    eraseRedundant: true,
    directLabels: false,
    rangeFrame: false,
    thinLines: false,
    multiples: false,
    sparkline: false,
  }), null);
});
