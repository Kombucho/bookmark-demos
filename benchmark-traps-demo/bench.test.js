const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');
const bench = require('./bench.js');

function minOf(values) {
  return values.reduce(function (lo, n) { return Math.min(lo, n); }, Infinity);
}

function maxOf(values) {
  return values.reduce(function (hi, n) { return Math.max(hi, n); }, -Infinity);
}

test('the article’s single-connection arithmetic is 80 QPS and 40 QPS', function () {
  assert.equal(bench.singleConnectionQps(bench.ARTICLE_SERVICE_MS, bench.ARTICLE_NEAR_RTT_MS), 80);
  assert.equal(bench.singleConnectionQps(bench.ARTICLE_SERVICE_MS, bench.ARTICLE_FAR_RTT_MS), 40);
  const one = bench.articleSketch(1);
  assert.equal(one.nearQps, 80);
  assert.equal(one.farQps, 40);
  assert.equal(one.serviceMs, 10);
  const ten = bench.articleSketch(10);
  assert.equal(ten.nearQps, 800);
  assert.equal(ten.farQps, 400);
  assert.match(one.source, /xychart-beta/);
  assert.match(one.source, /80, 40/);
});

test('a fair desk lets p50 and p99 name different engines', function () {
  const run = bench.run();
  assert.deepEqual(run.crimes, []);
  assert.equal(run.headlines.p50.winner, 'lumen');
  assert.equal(run.headlines.p99.winner, 'harbor');
  assert.equal(run.headlines.mean.winner, 'tie');
  assert.equal(run.headlines.qps.winner, 'tie');
  assert.equal(run.lumen.serviceP50, 2.5);
  assert.equal(run.lumen.serviceP99, 40);
  assert.equal(run.harbor.serviceP50, 6);
  assert.equal(run.harbor.serviceP99, 11);
  assert.match(run.reading.headline, /Harbor/);
  assert.match(run.reading.headline, /p99/);
});

test('uniform reads hand p50 to Harbor, and a set that fits hands p99 to Lumen', function () {
  const fair = bench.run();
  const uniform = bench.run({pattern: 'uniform'});
  const fits = bench.run({dataset: 'fits'});
  assert.equal(uniform.headlines.p50.winner, 'harbor');
  assert.ok(uniform.harbor.qpsMean > uniform.lumen.qpsMean * 2);
  assert.equal(fair.headlines.p99.winner, 'harbor');
  assert.equal(fits.headlines.p99.winner, 'lumen');
  assert.equal(fits.lumen.p50, fits.lumen.p99);
  assert.ok(fits.lumen.qpsMean > fair.lumen.qpsMean);
});

test('an unequal working set is named, and only the engine that fits avoids disk', function () {
  const run = bench.run({dataset: 'lumen-fits'});
  assert.ok(run.crimes.includes('dataset'));
  assert.equal(run.headlines.p99.winner, 'lumen');
  assert.equal(bench.steadyHit('lumen', run.setup), 1);
  assert.equal(bench.steadyHit('harbor', run.setup), 0.9);
  assert.match(bench.crimeText('dataset'), /32 GB/);
  assert.match(bench.crimeText('dataset'), /320 GB/);
});

test('measuring through warmup crowns Harbor on throughput, and the steady window does not', function () {
  const cold = {warm: {lumen: false, harbor: false}};
  const warmup = bench.run(Object.assign({window: 'warmup'}, cold));
  const steady = bench.run(Object.assign({window: 'steady'}, cold));
  assert.ok(warmup.crimes.includes('before-steady'));
  assert.equal(steady.crimes.includes('before-steady'), false);
  assert.equal(warmup.headlines.qps.winner, 'harbor');
  assert.equal(steady.headlines.qps.winner, 'tie');
  assert.equal(steady.headlines.p50.winner, 'lumen');
  assert.equal(steady.headlines.p99.winner, 'harbor');
  assert.ok(warmup.lumen.qpsCov > 0.2);
});

test('sixteen cores on Harbor flip the client-observed p50, and the service p50 stays with Lumen', function () {
  const even = bench.run({connections: 64});
  const uneven = bench.run({connections: 64, cores: {harbor: 16}});
  assert.equal(even.headlines.qps.winner, 'tie');
  assert.equal(uneven.headlines.qps.winner, 'harbor');
  assert.equal(uneven.headlines.p50.winner, 'harbor');
  assert.ok(uneven.lumen.serviceP50 < uneven.harbor.serviceP50);
  assert.ok(uneven.crimes.includes('hardware'));
  assert.ok(uneven.harbor.qpsMean > uneven.lumen.qpsMean * 1.8);
});

test('the same engine on 16 cores serves more than on 8 once the run is core-bound', function () {
  const eight = bench.run({connections: 64, dataset: 'fits'});
  const sixteen = bench.run({connections: 64, dataset: 'fits', cores: {lumen: 16, harbor: 16}});
  assert.ok(sixteen.lumen.qpsMean > eight.lumen.qpsMean * 1.8);
  assert.ok(sixteen.harbor.qpsMean > eight.harbor.qpsMean * 1.8);
});

test('putting Lumen on the article’s far round trip changes the client numbers only', function () {
  const run = bench.run({connections: 1, farSide: 'lumen'});
  assert.equal(run.lumen.serviceP50, 2.5);
  assert.equal(run.harbor.serviceP50, 6);
  assert.equal(run.headlines.p50.winner, 'harbor');
  assert.equal(run.headlines.qps.winner, 'harbor');
  assert.ok(run.crimes.includes('network'));
  assert.ok(run.lumen.p50 > run.lumen.serviceP50 + 14);
  assert.match(bench.crimeText('network'), /80 QPS/);
  assert.match(bench.crimeText('network'), /40 QPS/);
});

test('a 20 second run misses the checkpoint a 72 second run records', function () {
  const short = bench.run({duration: 20, checkpoint: 'lumen'});
  const long = bench.run({duration: 72, checkpoint: 'lumen'});
  assert.ok(short.crimes.includes('short-run'));
  assert.ok(short.crimes.includes('config'));
  assert.equal(long.crimes.includes('short-run'), false);
  assert.equal(short.headlines.qps.winner, 'tie');
  assert.equal(long.headlines.qps.winner, 'harbor');
  assert.ok(minOf(short.lumen.qpsSeries) > 800);
  assert.ok(minOf(long.lumen.qpsSeries) < 500);
  assert.ok(long.variance.some(function (line) { return /coefficient of variation/.test(line); }));
  assert.match(bench.crimeText('short-run'), /checkpoint/);
});

test('an open loop records the tail a closed loop leaves out during a stall', function () {
  const closed = bench.run({stall: true, loop: 'closed'});
  const open = bench.run({stall: true, loop: 'open'});
  assert.ok(closed.crimes.includes('omission'));
  assert.equal(open.crimes.includes('omission'), false);
  assert.ok(closed.lumen.omitted > 1000);
  assert.equal(open.lumen.omitted, 0);
  assert.ok(open.lumen.p99 > closed.lumen.p99 * 10);
  assert.ok(maxOf(open.lumen.qpsSeries) > maxOf(closed.lumen.qpsSeries));
  assert.match(open.reading.headline, /14,407 ms/);
});

test('a client cap pins both engines to the same throughput', function () {
  const run = bench.run({clientBottleneck: true, connections: 32});
  assert.ok(run.crimes.includes('client'));
  assert.equal(run.headlines.qps.winner, 'tie');
  assert.equal(Math.round(run.lumen.qpsMean), 400);
  assert.equal(Math.round(run.harbor.qpsMean), 400);
  assert.equal(run.headlines.p50.winner, 'lumen');
  assert.match(bench.crimeText('client'), /load generator/);
});

test('the 15% CPU factor is the article’s Geekbench gap applied to one engine', function () {
  const fair = bench.run();
  const fast = bench.run({newerCpu: 'harbor'});
  assert.equal(bench.CPU_GEN_GAP, 0.15);
  assert.ok(Math.abs(fast.harbor.serviceP99 - fair.harbor.serviceP99 / 1.15) < 1e-9);
  assert.equal(fair.headlines.qps.winner, 'tie');
  assert.equal(fast.headlines.qps.winner, 'harbor');
  assert.ok(fast.crimes.includes('hardware'));
  assert.match(bench.crimeText('hardware'), /Geekbench/);
  assert.match(bench.crimeText('hardware'), /r7g\.2xlarge/);
  assert.match(bench.crimeText('hardware'), /r8g\.2xlarge/);
});

test('publishing the mean is marked, and the other three readings remain', function () {
  const run = bench.run({headline: 'mean'});
  assert.ok(run.crimes.includes('average-only'));
  assert.match(run.reading.headline, /mean latency/);
  assert.equal(run.reading.also.length, 3);
  assert.match(bench.crimeText('average-only'), /Percentiles/);
});

test('Pele renders the throughput, tail, percentile, and histogram charts', function () {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'vendor/pele.global.js'), 'utf8'), ctx);
  const run = bench.run();
  ['qps', 'tail', 'latency', 'histogram'].forEach(function (key) {
    assert.match(run.charts[key], /xychart-beta/);
    assert.match(run.charts[key], /Lumen/);
    assert.match(run.charts[key], /Harbor/);
    const svg = ctx.pele.render(run.charts[key]).svg;
    assert.match(svg, /<svg/);
    assert.match(svg, /pele-xychart/);
  });
  const sketch = ctx.pele.render(bench.articleSketch(1).source).svg;
  assert.match(sketch, /pele-xychart/);
  const license = fs.readFileSync(path.join(__dirname, 'vendor/PELE-LICENSE.txt'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 kepano/);
});
