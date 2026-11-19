const test = require('node:test');
const assert = require('node:assert/strict');
const TM = require('./model.js');

test('a wrong guess burns weights and a right guess does not', () => {
  const model = TM.createModel('the machine', { seed: 4 });
  const ctx = [0, 0, 0, 0, model.idOf('t')];
  const pred = model.predict(ctx);
  const wrong = (pred + 1) % model.vocab;
  const before = model.checksum();
  const burned = model.burned();
  const step = model.observe(ctx, wrong);
  assert.equal(step.correct, false);
  assert.equal(step.updated, true);
  assert.equal(model.burned(), burned + 1);
  assert.notEqual(model.checksum(), before);

  const trained = TM.createModel(TM.PRESETS.metaphor, { seed: 11 });
  const trainer = TM.createTrainer(trained, TM.PRESETS.metaphor);
  let found = null;
  for (let i = 0; i < 6000 && !found; i++) {
    const event = trainer.step();
    if (event.correct) found = event;
  }
  assert.ok(found, 'expected a correct guess while training');
  const ctx2 = found.lanes.map(function (ch) { return trained.idOf(ch); });
  const held = trained.checksum();
  const again = trained.observe(ctx2, trained.idOf(found.said));
  if (again.correct) {
    assert.equal(again.updated, false);
    assert.equal(trained.checksum(), held);
  }
});

test('the five-character window is what separates two guesses', () => {
  const model = TM.createModel('abcdef', { seed: 2, lr: 0.28, lrBigram: 0.2, lrTrigram: 0.15 });
  const A = model.idOf('a');
  const B = model.idOf('b');
  const C = model.idOf('c');
  const D = model.idOf('d');
  const E = model.idOf('e');
  const ctx1 = [A, B, C, C, C];
  const ctx2 = [D, E, C, C, C];
  for (let i = 0; i < 500; i++) {
    model.observe(ctx1, A);
    model.observe(ctx2, B);
  }
  assert.equal(model.charAt(model.predict(ctx1)), 'a');
  assert.equal(model.charAt(model.predict(ctx2)), 'b');
});

test('accuracy on the metaphor text rises from a low start', () => {
  const model = TM.createModel(TM.PRESETS.metaphor, { seed: 7 });
  const early = TM.rollingAccuracy(model, TM.PRESETS.metaphor, 0, 120);
  const late = TM.rollingAccuracy(model, TM.PRESETS.metaphor, 900, 300);
  assert.ok(early.rate < 0.4, 'early ' + early.rate);
  assert.ok(late.rate > early.rate + 0.2, 'early ' + early.rate + ' late ' + late.rate);
  assert.ok(late.rate > 0.45, 'late ' + late.rate);
});

test('reset weights returns the metaphor run to a low accuracy', () => {
  const model = TM.createModel(TM.PRESETS.metaphor, { seed: 7 });
  const trained = TM.rollingAccuracy(model, TM.PRESETS.metaphor, 1800, 200);
  assert.ok(trained.rate > 0.5, 'trained ' + trained.rate);
  model.reset();
  assert.equal(model.burned(), 0);
  const fresh = TM.rollingAccuracy(model, TM.PRESETS.metaphor, 0, 120);
  assert.ok(fresh.rate < trained.rate - 0.2, 'fresh ' + fresh.rate + ' trained ' + trained.rate);
  assert.ok(fresh.rate < 0.45, 'fresh ' + fresh.rate);
});

test('each step reports the five-character lane and the counts', () => {
  const model = TM.createModel(TM.PRESETS.metaphor, { seed: 1 });
  const trainer = TM.createTrainer(model, TM.PRESETS.metaphor);
  const event = trainer.step();
  assert.equal(event.lanes.length, 5);
  assert.equal(event.pos, 0);
  assert.equal(event.said, 't');
  assert.equal(event.waiting, TM.PRESETS.metaphor.length - 1);
  assert.equal(event.step, 1);
  assert.equal(event.letters, 1);
  assert.equal(typeof event.next, 'string');
  assert.equal(event.next.length, 1);
});

test('a sample is eighty characters from the alphabet', () => {
  const model = TM.createModel(TM.PRESETS.times, { seed: 3 });
  const ctx = new Int32Array(TM.CONTEXT);
  for (let i = 0; i < TM.CONTEXT; i++) ctx[i] = model.idOf(' ');
  const out = TM.generate(model, ctx, 80, 0.6, function () { return 0.2; });
  assert.equal(out.length, 80);
  for (const ch of out) assert.ok(model.chars.includes(ch), ch);
});

test('loss stays finite across a long run', () => {
  const model = TM.createModel(TM.PRESETS.alice, { seed: 9 });
  const trainer = TM.createTrainer(model, TM.PRESETS.alice);
  for (let i = 0; i < 2500; i++) {
    const event = trainer.step();
    assert.equal(Number.isFinite(event.loss), true);
  }
  assert.ok(trainer.event.hits > 200);
});
