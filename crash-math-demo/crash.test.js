const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crash = require('./crash.js');

function close(actual, expected, tol) {
  const limit = tol == null ? 1e-6 : tol;
  assert.ok(Math.abs(actual - expected) < limit, actual + ' vs ' + expected);
}

test('the hole is x / (1 − x), and the years match the worked examples', function () {
  close(crash.recoveryGain(0.5), 1);
  close(crash.recoveryGain(0.2), 0.25);
  close(crash.recoveryGain(0.25), 1 / 3);
  close(crash.recoveryGain(0), 0);
  close(crash.yearsToRecover(0.5, 0.08), 9.006, 1e-3);
  close(crash.yearsToRecover(0.25, 0.1), 3.018, 1e-3);
  close(crash.yearsToRecover(0, 0.1), 0);
  assert.throws(function () { crash.recoveryGain(1); }, RangeError);
  assert.throws(function () { crash.recoveryGain(-0.1); }, RangeError);
  assert.throws(function () { crash.yearsToRecover(0.2, 0); }, RangeError);
  const curve = crash.recoveryCurve(0.08, 9);
  assert.equal(curve.length, 10);
  close(curve[0].gain, 0);
  close(curve[curve.length - 1].loss, 0.9);
  close(curve[curve.length - 1].gain, 9);
  assert.equal(crash.formatPercent(0.5, 0), '50%');
  assert.equal(crash.formatPercent(-0.35, 0), '−35%');
  assert.equal(crash.formatSignedPercent(0.08, 1), '+8.0%');
  assert.equal(crash.formatYears(9.006), '9.0');
});

test('max drawdown, recovery, CAGR, and a flat Sharpe', function () {
  close(crash.maxDrawdown([100, 120, 90, 130, 104]), 0.25);
  const healed = crash.drawdownStats([100, 120, 90, 130]);
  close(healed.maxDrawdown, 0.25);
  assert.equal(healed.recovered, true);
  assert.equal(healed.recoveryDays, 1);
  const stuck = crash.drawdownStats([1, 1, 0.5, 0.4]);
  assert.equal(stuck.recovered, false);
  assert.equal(stuck.recoveryDays, null);
  assert.equal(crash.formatRecovery(stuck), 'Not regained');
  const equity = [1];
  for (let i = 0; i < 252; i += 1) equity.push(1);
  equity[252] = 2;
  close(crash.cagr(equity), 1, 1e-9);
  assert.equal(crash.sharpeIsh([1, 1, 1, 1]), null);
  close(crash.volTarget(0.1, 0.4, 2), 0.25);
  close(crash.volTarget(0.4, 0.1, 1.5), 1.5);
});

test('a zero-volatility path falls by exactly the injected crash, and the seed repeats', function () {
  const config = { seed: 11, days: 80, mu: 0, sigma: 0, crashSize: -0.35, crashDays: 10, startPrice: 100 };
  const a = crash.generateSeries(config);
  const b = crash.generateSeries(config);
  assert.deepEqual(a.prices, b.prices);
  assert.equal(a.postIndex - a.preIndex, 10);
  close(a.prices[a.postIndex] / a.prices[a.preIndex], 0.65, 1e-9);
  close(a.prices[0], 100);
  const other = crash.generateSeries(Object.assign({}, config, { seed: 12, sigma: 0.2, mu: 0.07 }));
  assert.notDeepEqual(a.prices, other.prices);
  assert.equal(a.prices.length, 81);
});

test('each layer changes exposure, and with every layer off the book matches buy and hold', function () {
  const quiet = [];
  for (let i = 0; i < 12; i += 1) quiet.push(100);
  const off = crash.simulate(quiet, {
    volTarget: false,
    drawdownBrake: false,
    trend: false,
    kelly: false,
    volCap: 2,
  });
  assert.deepEqual(off.protected, off.buyHold);

  const crashPath = [100, 100, 100, 50, 50, 50];
  const braked = crash.simulate(crashPath, {
    volTarget: false,
    drawdownBrake: true,
    drawdownLimit: 0.1,
    drawdownFloor: 0.25,
    trend: false,
    kelly: false,
    volCap: 2,
  });
  close(braked.exposure[3], 1);
  close(braked.exposure[4], 0.25);
  close(braked.protected[3], 0.5);

  const trendPath = [];
  for (let i = 0; i < 11; i += 1) trendPath.push(100);
  trendPath.push(90, 80, 70);
  const trend = crash.simulate(trendPath, {
    volTarget: false,
    drawdownBrake: false,
    trend: true,
    trendLookback: 5,
    trendFloor: 0,
    kelly: false,
    volCap: 2,
  });
  close(trend.exposure[11], 1);
  close(trend.exposure[12], 0);

  const kellyPath = [100];
  for (let i = 0; i < 30; i += 1) kellyPath.push(kellyPath[i] * 1.001);
  const kelly = crash.simulate(kellyPath, {
    volTarget: false,
    drawdownBrake: false,
    trend: false,
    kelly: true,
    kellyScale: 0,
    kellyWindow: 20,
    volCap: 2,
  });
  close(kelly.exposure[20], 1);
  close(kelly.exposure[21], 0);

  const wild = [100];
  for (let i = 0; i < 40; i += 1) wild.push(wild[i] * (i % 2 ? 1.07 : 0.94));
  const sized = crash.simulate(wild, {
    volTarget: true,
    targetVol: 0.05,
    volCap: 1.5,
    ewmaLambda: 0.94,
    drawdownBrake: false,
    trend: false,
    kelly: false,
  });
  assert.ok(sized.exposure[sized.exposure.length - 1] < 0.6);
  sized.exposure.forEach(function (value) {
    assert.ok(value <= 1.5 + 1e-9);
    assert.ok(value >= 0);
  });
  assert.equal(Number.isFinite(sized.protectedStats.cagr), true);
  assert.equal(Number.isFinite(sized.buyHoldStats.maxDrawdown), true);
});

test('the page credits hft.md/crash and says the figures are not advice', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(html, /https:\/\/hft\.md\/crash\/?/);
  assert.match(html, /[Nn]ot advice/);
  assert.match(html, /[Ss]imulated/);
  assert.match(index, /href="crash-math-demo\/"/);
  assert.match(readme, /\[Crash lab\]\(crash-math-demo\/\)/);
});
