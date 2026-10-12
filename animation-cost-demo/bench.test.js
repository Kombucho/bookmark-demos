const test = require('node:test');
const assert = require('node:assert/strict');
const bench = require('./bench.js');

test('blur over 20px breaks the skill line, and 2–5px is the soften range', () => {
  assert.equal(bench.blurVerdict(48), 'over-limit');
  assert.equal(bench.blurVerdict(20.1), 'over-limit');
  assert.equal(bench.blurVerdict(20), 'under-limit');
  assert.equal(bench.blurVerdict(12), 'under-limit');
  assert.equal(bench.blurVerdict(4), 'soften');
  assert.equal(bench.blurVerdict(2), 'soften');
  assert.equal(bench.blurVerdict(5), 'soften');
  assert.equal(bench.blurVerdict(-1), 'invalid');
});

test('tiers match the skill: transform and opacity composite, box-shadow paint, width layout', () => {
  assert.equal(bench.tierOf('transform'), 'composite');
  assert.equal(bench.tierOf('opacity'), 'composite');
  assert.equal(bench.tierOf('filter'), 'composite');
  assert.equal(bench.tierOf('box-shadow'), 'paint');
  assert.equal(bench.tierOf('border-radius'), 'paint');
  assert.equal(bench.tierOf('width'), 'layout');
  assert.equal(bench.tierOf('top'), 'layout');
  assert.equal(bench.SKILL_SHADOW_SWAP, 'drop-shadow');
});

test('the expensive side breaks only the rules you are contrasting', () => {
  const all = bench.scenePlan({blur: true, shadow: true, variable: true});
  assert.ok(all.expensive.blur.max > bench.BLUR_LIMIT_PX);
  assert.equal(all.expensive.shadow, 'box-shadow');
  assert.equal(all.expensive.motion, 'inherited-variable');
  assert.ok(all.cheap.blur.max <= bench.BLUR_SOFTEN.max);
  assert.equal(all.cheap.shadow, 'opacity');
  assert.equal(all.cheap.motion, 'transform');
  assert.deepEqual(bench.findings(all.expensive), ['blur-over-20', 'shadow-paint', 'inherited-variable']);
  assert.deepEqual(bench.findings(all.cheap), ['blur-within-20', 'shadow-opacity', 'direct-transform']);

  const blurOff = bench.scenePlan({blur: false, shadow: true, variable: true});
  assert.ok(blurOff.expensive.blur.max <= bench.BLUR_SOFTEN.max);
  assert.equal(blurOff.expensive.shadow, 'box-shadow');

  const calm = bench.scenePlan({blur: false, shadow: false, variable: false});
  assert.deepEqual(bench.findings(calm.expensive), bench.findings(calm.cheap));
});

test('an inherited variable dirties every card and its descendants', () => {
  assert.equal(bench.recalcTargets(20, 'inherited-variable'), 20 * (1 + bench.DESCENDANTS_PER_CARD));
  assert.equal(bench.recalcTargets(20, 'transform'), 1);
  assert.equal(bench.recalcTargets(0, 'transform'), 0);
});

test('frame summary uses the 16.7ms and 8ms budgets', () => {
  const steady = bench.summarizeFrames([16.7, 16.7, 16.7]);
  assert.equal(steady.frames, 3);
  assert.ok(Math.abs(steady.fps - (1000 / 16.7)) < 0.001);
  assert.equal(steady.over60, 0);
  assert.equal(steady.over120, 3);

  const mixed = bench.summarizeFrames([
    {frameMs: 8, hotMs: 1, coolMs: 0.2},
    {frameMs: 16.8, hotMs: 9, coolMs: 0.4},
    {frameMs: 40, hotMs: 30, coolMs: 0.4},
  ]);
  assert.equal(mixed.over60, 2);
  assert.equal(mixed.over120, 2);
  assert.equal(mixed.maxMs, 40);
  assert.ok(Math.abs(mixed.hotAvg - (40 / 3)) < 1e-9);
  assert.equal(bench.summarizeFrames([]).fps, 0);
});

test('count clamps into the bench range', () => {
  assert.equal(bench.clampCount(1), bench.COUNT_MIN);
  assert.equal(bench.clampCount(20), 20);
  assert.equal(bench.clampCount(500), bench.COUNT_MAX);
  assert.equal(bench.clampCount('nope'), bench.COUNT_DEFAULT);
});

test('blur and drift stay inside the ranges they were given', () => {
  for (let t = 0; t < 3200; t += 100) {
    const soft = bench.blurAt(t, bench.BLUR_SOFTEN);
    const hard = bench.blurAt(t, bench.BLUR_EXPENSIVE);
    assert.ok(soft >= 2 && soft <= 5);
    assert.ok(hard >= 24 && hard <= 48);
    assert.ok(Math.abs(bench.driftPx(t)) <= 18);
    const fade = bench.shadowOpacity(t);
    assert.ok(fade >= 0.28 && fade <= 0.9);
  }
});

test('the device note refuses a fast-machine pass', () => {
  assert.match(bench.DEVICE_NOTE, /this device/);
  assert.match(bench.DEVICE_NOTE, /16\.7ms/);
  assert.match(bench.DEVICE_NOTE, /8ms/);
});
