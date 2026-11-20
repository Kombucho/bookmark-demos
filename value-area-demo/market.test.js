const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const market = require('./market.js');

function bins(counts) {
  return counts.map(function (count, index) {
    return { index: index, lo: index, hi: index + 1, mid: index + 0.5, count: count };
  });
}

test('the same seed and settings replay the same path', function () {
  const a = market.generate();
  const b = market.generate();
  assert.deepEqual(a.bars, b.bars);
  assert.equal(a.config.seed, 20261112);
  assert.equal(a.bars.length, a.config.steps);
  assert.equal(market.VALUE_FRACTION, 0.7);
});

test('sanitize keeps the path inside the control ranges', function () {
  const wild = market.sanitize({
    seed: 'nope',
    steps: 5,
    balanceLength: 1000,
    breakoutProbability: 4,
    volatility: -2,
    forceAt: 9999,
  });
  assert.equal(wild.seed, market.DEFAULTS.seed);
  assert.equal(wild.steps, 20);
  assert.equal(wild.balanceLength, 160);
  assert.equal(wild.breakoutProbability, 1);
  assert.equal(wild.volatility, 0);
  assert.equal(wild.forceAt, null);
  assert.equal(market.sanitize({ forceAt: 10, steps: 40 }).forceAt, 10);
});

test('value area grows from the busiest price until it holds 70%', function () {
  const peaked = market.expandValueArea(bins([1, 3, 10, 2, 1]), 0.7);
  assert.equal(peaked.pocIndex, 2);
  assert.equal(peaked.lowIndex, 1);
  assert.equal(peaked.highIndex, 2);
  assert.ok(peaked.covered >= 0.7);
  assert.equal(peaked.val, 1);
  assert.equal(peaked.vah, 3);

  const tied = market.expandValueArea(bins([0, 0, 5, 10, 5, 0, 0]), 0.7);
  assert.equal(tied.pocIndex, 3);
  assert.equal(tied.lowIndex, 2);
  assert.equal(tied.highIndex, 4);
  assert.ok(tied.covered >= 0.7);

  const firstPeak = market.expandValueArea(bins([4, 4, 1]), 0.7);
  assert.equal(firstPeak.pocIndex, 0);
  assert.equal(market.expandValueArea([], 0.7), null);
  assert.equal(market.valueArea([]), null);
});

test('speed is higher between zones than inside them', function () {
  const bars = [];
  for (let i = 0; i < 10; i++) {
    bars.push({ t: i, price: 100 + (i % 2) * 0.2, mode: 'balance', zoneId: 1 });
  }
  bars.push({ t: 10, price: 104, mode: 'imbalance', zoneId: 1 });
  bars.push({ t: 11, price: 108, mode: 'imbalance', zoneId: 1 });
  bars.push({ t: 12, price: 112, mode: 'balance', zoneId: 2 });
  const speed = market.speeds(bars);
  assert.ok(speed.between > speed.inside * 2, speed.inside + ' vs ' + speed.between);
  assert.equal(market.claimText(speed).indexOf('Between zones is ') === 0, true);
  assert.match(market.claimText({ inside: 0.2, between: 0, insideSamples: 4, betweenSamples: 0 }), /No move between zones/);
});

test('the default path is slow inside balance and quick through a gap', function () {
  const run = market.generate();
  const speed = run.analysis.speeds;
  assert.ok(run.analysis.zones.length >= 2, 'zones ' + run.analysis.zones.length);
  assert.ok(run.analysis.gaps.length >= 1, 'gaps ' + run.analysis.gaps.length);
  assert.ok(run.analysis.moves.length >= 1);
  assert.ok(speed.inside > 0);
  assert.ok(speed.between > speed.inside * 2, speed.inside + ' vs ' + speed.between);
  run.analysis.zones.forEach(function (zone) {
    assert.ok(zone.covered >= 0.7);
    assert.ok(zone.val <= zone.poc && zone.poc <= zone.vah);
  });
  const thin = run.analysis.profile.bins.filter(function (bin) { return bin.thin; });
  assert.ok(thin.length >= 1);
  assert.equal(market.binColor(thin[0]), market.COLORS.gap);
});

test('a forced breakdown leaves the earlier bars and then drops', function () {
  const calm = market.generate({ breakoutProbability: 0, volatility: 0.4, forceAt: null });
  const forced = market.generate({ breakoutProbability: 0, volatility: 0.4, forceAt: 40 });
  assert.deepEqual(forced.bars.slice(0, 40), calm.bars.slice(0, 40));
  assert.equal(calm.analysis.moves.length, 0);
  assert.equal(forced.analysis.moves.length, 1);
  assert.ok(forced.analysis.zones.length >= 2);
  const first = forced.analysis.zones[0];
  const next = forced.analysis.zones[1];
  assert.ok(next.hi < first.lo, next.hi + ' vs ' + first.lo);
  assert.ok(forced.analysis.speeds.between > forced.analysis.speeds.inside);
  const window = market.analyze(forced.bars.slice(0, 30));
  assert.equal(window.moves.length, 0);
  assert.equal(window.zones.length, 1);
});

test('zero volatility stays in the zone until a break, and probability zero never breaks', function () {
  const still = market.generate({ volatility: 0, breakoutProbability: 0, steps: 40 });
  still.bars.forEach(function (bar) {
    assert.equal(bar.mode, 'balance');
    assert.equal(bar.price, 100);
  });
  assert.equal(still.analysis.speeds.inside, 0);
  assert.match(market.claimText({ inside: 0, between: 1.5, insideSamples: 3, betweenSamples: 2 }), /still/);
});

test('Pele draws the price line and one bar per price bucket', function () {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'vendor/pele.global.js'), 'utf8'), ctx);
  const run = market.generate({ steps: 80 });
  const price = market.priceChart(run.bars);
  assert.match(price.source, /xychart-beta/);
  assert.match(price.source, /Synthetic price/);
  const priceSvg = ctx.pele.render(price.source).svg;
  assert.match(priceSvg, /pele-xychart/);
  const line = priceSvg.match(/<path d="([^"]+)" fill="none" stroke="var\(--pele-series-1/);
  assert.ok(line);
  assert.equal(line[1].match(/-?\d+(?:\.\d+)?/g).length / 2, run.bars.length);

  const profile = market.profileChart(run.analysis.profile);
  const profileSvg = ctx.pele.render(profile.source).svg;
  const rects = profileSvg.match(/<rect /g);
  assert.equal(rects.length, run.analysis.profile.bins.length);
  assert.equal(market.priceChart([run.bars[0]]), null);

  const box = market.plotBoxFromPath('M60.57,54.5V438M60.57,438H692M60.57,438h-4');
  assert.equal(box.x, 60.57);
  assert.ok(box.width > 600);
  const bars = market.horizontalBars([
    { lo: 0, hi: 1, mid: 0.5, count: 2, thin: false },
    { lo: 9, hi: 10, mid: 9.5, count: 8, thin: true },
  ], box, { min: 0, max: 10 });
  assert.ok(bars[1].y < bars[0].y);
  assert.ok(bars[1].width > bars[0].width);
  assert.equal(bars[1].thin, true);
});

test('the page stays local and names the reduced-motion and narrow layouts', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(html, /href="\.\.\/index\.html"/);
  assert.match(html, /vendor\/pele\.global\.js/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href="https?:/i);
  assert.match(html, /not trading advice/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width:\s*860px/);
  assert.match(index, /href="value-area-demo\/"/);
  assert.match(readme, /\(value-area-demo\/\)/);
  assert.match(readme, /https:\/\/x\.com\/bull_genius\/status\/2120778501934440952/);
  assert.equal(fs.existsSync(path.join(__dirname, 'vendor/PELE-LICENSE.txt')), true);
});
