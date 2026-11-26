const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Mood = require('./mood.js');
const Checkout = require('./checkout.js');

function probsOf(events, now, options) {
  return Mood.probabilities(Mood.rollingFeatures(events, now, options));
}

function top(probs) {
  return Mood.dominant(probs);
}

test('a blank desk is neutral, and the five bars sum to one', function () {
  const features = Mood.rollingFeatures([], 1000, { sessionStart: 1000 });
  Mood.FEATURES.forEach(function (key) {
    assert.ok(features[key] >= 0 && features[key] <= 1, key);
    assert.equal(features[key], 0);
  });
  const probs = Mood.probabilities(features);
  const sum = Mood.MOODS.reduce(function (acc, mood) { return acc + probs[mood]; }, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(top(probs), 'neutral');
  assert.ok(probs.neutral > 0.45);
  assert.equal(Mood.adaptation('neutral'), 'none');
  assert.equal(Mood.adaptation('frustrated'), 'explain-pay');
  assert.equal(Mood.adaptation('confused'), 'next-step');
  assert.equal(Mood.adaptation('lost'), 'find-setting');
  assert.equal(Mood.adaptation('away'), 'pause');
});

test('rage on a disabled control, and the same invalid submit, read as frustrated', function () {
  const downs = [];
  for (let i = 0; i < 5; i += 1) {
    downs.push({ t: 1000 + i * 80, kind: 'down', x: 50, y: 40, target: 'disabled' });
  }
  const rage = probsOf(downs, 1400, { lastInputAt: 1400 });
  assert.equal(top(rage), 'frustrated', JSON.stringify(rage));
  assert.ok(rage.frustrated >= Mood.ALERT);

  const submits = [
    { t: 0, kind: 'submit', valid: false, repeated: false },
    { t: 400, kind: 'submit', valid: false, repeated: true },
    { t: 800, kind: 'submit', valid: false, repeated: true },
  ];
  const invalid = probsOf(submits, 800, { lastInputAt: 800 });
  assert.equal(top(invalid), 'frustrated', JSON.stringify(invalid));
});

test('circling, hovering, and delete-then-type read as confused', function () {
  const circle = [];
  for (let i = 0; i <= 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    circle.push({ t: i * 50, kind: 'move', x: 100 + 30 * Math.cos(a), y: 100 + 30 * Math.sin(a), near: false });
  }
  const circled = Mood.rollingFeatures(circle, 1800, { lastInputAt: 1800 });
  assert.ok(circled.circle > 0.55, JSON.stringify(circled));
  const circleProbs = Mood.probabilities(circled);
  assert.equal(top(circleProbs), 'confused', JSON.stringify(circleProbs));

  const hover = [];
  for (let i = 0; i < 30; i += 1) {
    hover.push({ t: i * 80, kind: 'move', x: 20 + i * 0.15, y: 40, near: true });
  }
  const hovered = Mood.rollingFeatures(hover, 29 * 80, { lastInputAt: 29 * 80 });
  assert.ok(hovered.hover > 0.8, JSON.stringify(hovered));
  assert.equal(top(Mood.probabilities(hovered)), 'confused');

  const keys = [];
  for (let i = 0; i < 4; i += 1) {
    keys.push({ t: i * 400, kind: 'key', key: 'delete' });
    keys.push({ t: i * 400 + 180, kind: 'key', key: 'char' });
  }
  assert.equal(top(probsOf(keys, 1600, { lastInputAt: 1600 })), 'confused');
});

test('scroll that turns around, plus clicks on nothing, reads as lost', function () {
  const events = [];
  for (let i = 0; i < 8; i += 1) events.push({ t: i * 180, kind: 'scroll', dy: i % 2 ? 48 : -48 });
  for (let i = 0; i < 4; i += 1) events.push({ t: 2000 + i * 120, kind: 'down', x: 10 + i * 40, y: 20, target: 'dead' });
  const features = Mood.rollingFeatures(events, 2500, { lastInputAt: 2360 });
  assert.equal(features.scroll, 1);
  assert.equal(features.dead, 1);
  assert.equal(top(Mood.probabilities(features)), 'lost');
});

test('a hidden tab or a long idle reads as away, even over a rage burst', function () {
  const idle = Mood.rollingFeatures([], 8000, { lastInputAt: 0 });
  assert.equal(idle.idle, 1);
  assert.equal(top(Mood.probabilities(idle)), 'away');

  const burst = [];
  for (let i = 0; i < 5; i += 1) burst.push({ t: 1000 + i * 70, kind: 'down', x: 12, y: 12, target: 'disabled' });
  const hidden = Mood.rollingFeatures(burst, 1400, { lastInputAt: 1400, absent: true });
  assert.equal(hidden.idle, 1);
  assert.equal(top(Mood.probabilities(hidden)), 'away');
});

test('straight typing stays neutral, and a mood holds then releases', function () {
  const calm = [];
  for (let i = 0; i < 8; i += 1) calm.push({ t: i * 100, kind: 'move', x: i * 18, y: 40, near: false });
  calm.push({ t: 900, kind: 'down', x: 80, y: 40, target: 'control' });
  calm.push({ t: 1000, kind: 'key', key: 'char' });
  calm.push({ t: 1100, kind: 'key', key: 'char' });
  const calmProbs = probsOf(calm, 1100, { lastInputAt: 1100 });
  assert.equal(top(calmProbs), 'neutral', JSON.stringify(calmProbs));

  const rageEvents = [];
  for (let i = 0; i < 5; i += 1) rageEvents.push({ t: i * 80, kind: 'down', x: 4, y: 4, target: 'disabled' });
  const hot = Mood.probabilities(Mood.rollingFeatures(rageEvents, 400, { lastInputAt: 400 }));
  let reading = Mood.freshReading();
  reading = Mood.stepReading(reading, hot, Mood.STEP_MS);
  assert.equal(reading.mood, 'frustrated');

  const calmBlank = Mood.probabilities(Mood.blankFeatures());
  reading = Mood.stepReading(reading, calmBlank, Mood.STEP_MS);
  reading = Mood.stepReading(reading, calmBlank, Mood.STEP_MS);
  reading = Mood.stepReading(reading, calmBlank, Mood.STEP_MS);
  assert.equal(reading.mood, 'frustrated');
  reading = Mood.stepReading(reading, calmBlank, Mood.STEP_MS);
  assert.equal(reading.mood, 'neutral');

  reading = Mood.stepReading(Mood.freshReading(), hot, Mood.STEP_MS);
  const away = Mood.stepReading(reading, calmBlank, 0, { absent: true });
  assert.equal(away.mood, 'away');
  let back = away;
  for (let i = 0; i < 3; i += 1) back = Mood.stepReading(back, calmBlank, Mood.STEP_MS);
  assert.equal(back.mood, 'away');
  back = Mood.stepReading(back, calmBlank, Mood.STEP_MS);
  assert.equal(back.mood, 'neutral');
});

test('the ship date is strict, Pay stays locked, and the setting search finds the lot line', function () {
  assert.equal(Checkout.parseShipDate('25/11/2026').ok, true);
  assert.equal(Checkout.parseShipDate('29/02/2024').ok, true);
  assert.equal(Checkout.parseShipDate('29/02/2025').ok, false);
  assert.equal(Checkout.parseShipDate('2026-11-25').ok, false);
  assert.equal(Checkout.parseShipDate('5/11/2026').ok, false);
  assert.equal(Checkout.parseShipDate('31/02/2026').ok, false);

  const open = { name: 'Ada Marin', street: '18 Kiln Lane', date: '25/11/2026', terms: true };
  assert.equal(Checkout.payLock(open).locked, false);
  assert.equal(Checkout.nextStep(open).id, 'pay');

  const buried = { name: 'Ada Marin', street: '18 Kiln Lane', date: '25/11/2026', terms: false };
  const lock = Checkout.payLock(buried);
  assert.equal(lock.locked, true);
  assert.match(lock.clear, /Warehouse terms/);
  assert.equal(Checkout.nextStep(buried).id, 'delivery');

  const badDate = Checkout.payLock({ name: 'Ada Marin', street: '18 Kiln Lane', date: '11-25', terms: true });
  assert.match(badDate.clear, /DD\/MM\/YYYY/);
  assert.equal(Checkout.nextStep({ name: 'Ada Marin', street: '18 Kiln Lane', date: '', terms: false }).id, 'date');
  assert.equal(Checkout.nextStep({ name: '', street: '', date: '', terms: false }).id, 'name');

  assert.equal(Checkout.findSettings('').length, 4);
  assert.equal(Checkout.findSettings('LOT')[0].id, 'lots');
  assert.equal(Checkout.findSettings('gift note')[0].focus, 'gift');
  assert.equal(Checkout.findSettings('nope').length, 0);
  assert.equal(Checkout.promoDisabled('no'), true);
  assert.equal(Checkout.promoDisabled('SAVE'), false);
  assert.ok(Checkout.SAVE_MS >= 1500);
  assert.equal(Checkout.payLock(buried).signature, Checkout.payLock(buried).signature);
  assert.notEqual(
    Checkout.payLock(buried).signature,
    Checkout.payLock({ name: 'Ada Marin', street: '18 Kiln Lane', date: '26/11/2026', terms: false }).signature
  );
});

test('the page, the index, and the readme name the post and the five moods', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(html, /https:\/\/x\.com\/Jakubantalik\/status\/2125273238414721460/);
  assert.match(html, /https:\/\/libraries\.dev\/mood-recognition/);
  assert.match(html, /value="Ada Marin"/);
  assert.match(html, /Delivery notes/);
  assert.match(html, /Lot numbers/);
  assert.match(app, /Mood\.STEP_MS/);
  assert.match(app, /Mood\.WINDOW_MS/);
  assert.match(app, /data-signal/);
  assert.match(index, /href="mood-read-demo\/"/);
  assert.match(readme, /\[Mood read\]\(mood-read-demo\/\)/);
  assertCatalogCount(index, readme);
});

function assertCatalogCount(index, readme) {
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const cards = index.match(/href="[a-z0-9-]+-demo\/"/g) || [];
  const entries = readme.match(/^- \[[^\]]+\]\([a-z0-9-]+-demo\/\)/gm) || [];
  assert.equal(cards.length, entries.length);
  assert.ok(cards.length >= 20 && cards.length < 100);
  const ten = Math.floor(cards.length / 10);
  const one = cards.length % 10;
  const words = (one ? tens[ten] + '-' + ones[one] : tens[ten]);
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  assert.match(index, new RegExp('>' + label + ' tools<'));
  assert.match(index, new RegExp(label + ' browser tools'));
  assert.match(readme, new RegExp('^' + label + ' static tools:', 'm'));
}
