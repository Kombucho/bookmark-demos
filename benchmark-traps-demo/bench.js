// A simulated database benchmark.
// Lumen and Harbor are fictional. The samples are a formula in this file.
// Two figures are taken from PlanetScale's "On benchmarking" and used only
// where the names say so: the single-connection sketch (10 ms, 2.5 ms, 15 ms,
// 80 QPS, 40 QPS) and the ~15% Geekbench gap between an r7g.2xlarge and an
// r8g.2xlarge. Nothing here is a PlanetScale measurement.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BenchTraps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ARTICLE_SERVICE_MS = 10;
  const ARTICLE_NEAR_RTT_MS = 2.5;
  const ARTICLE_FAR_RTT_MS = 15;
  const CPU_GEN_GAP = 0.15;

  const ENGINES = {
    lumen: {id: 'lumen', name: 'Lumen', memoryMs: 2.5, diskMs: 40, writeMs: 8, checkpointMul: 2.5, stallMul: 8},
    harbor: {id: 'harbor', name: 'Harbor', memoryMs: 6, diskMs: 11, writeMs: 6.5, checkpointMul: 1.45, stallMul: 2.2},
  };

  const BINS = [
    {label: '≤5', hi: 5},
    {label: '≤10', hi: 10},
    {label: '≤20', hi: 20},
    {label: '≤40', hi: 40},
    {label: '≤80', hi: 80},
    {label: '≤160', hi: 160},
    {label: '>160', hi: Infinity},
  ];

  function defaultSetup() {
    return {
      duration: 72,
      connections: 8,
      rttMs: ARTICLE_NEAR_RTT_MS,
      farSide: 'none',
      dataset: 'spills',
      pattern: 'zipfian',
      readRatio: 1,
      warm: {lumen: true, harbor: true},
      window: 'all',
      warmupSeconds: 18,
      cores: {lumen: 8, harbor: 8},
      newerCpu: 'none',
      checkpoint: 'aligned',
      checkpointEvery: 24,
      checkpointSpan: 6,
      loop: 'closed',
      stall: false,
      stallAt: 36,
      stallSpan: 4,
      clientBottleneck: false,
      clientCapQps: 400,
      headline: 'p99',
    };
  }

  function setup(overrides) {
    const base = defaultSetup();
    const extra = overrides || {};
    const next = Object.assign({}, base, extra);
    next.warm = Object.assign({}, base.warm, extra.warm || {});
    next.cores = Object.assign({}, base.cores, extra.cores || {});
    next.readRatio = clamp(next.readRatio, 0, 1);
    next.connections = Math.max(1, Math.round(next.connections));
    next.duration = Math.max(4, Math.round(next.duration));
    next.cores.lumen = next.cores.lumen === 16 ? 16 : 8;
    next.cores.harbor = next.cores.harbor === 16 ? 16 : 8;
    return next;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function singleConnectionQps(serviceMs, rttMs) {
    return 1000 / (serviceMs + rttMs);
  }

  function articleSketch(connections) {
    const n = Math.max(1, Math.round(connections || 1));
    const near = n * singleConnectionQps(ARTICLE_SERVICE_MS, ARTICLE_NEAR_RTT_MS);
    const far = n * singleConnectionQps(ARTICLE_SERVICE_MS, ARTICLE_FAR_RTT_MS);
    return {
      serviceMs: ARTICLE_SERVICE_MS,
      nearRttMs: ARTICLE_NEAR_RTT_MS,
      farRttMs: ARTICLE_FAR_RTT_MS,
      connections: n,
      nearQps: near,
      farQps: far,
      source: xyChart({
        title: 'Article sketch, connection-bound',
        xTitle: 'round trip',
        yTitle: 'QPS',
        labels: [ARTICLE_NEAR_RTT_MS + ' ms', ARTICLE_FAR_RTT_MS + ' ms'],
        values: [near, far],
        yMax: niceCeil(near),
        kind: 'bar',
      }),
    };
  }

  function steadyHit(id, desk) {
    if (desk.dataset === 'fits' || desk.dataset === id + '-fits') return 1;
    return desk.pattern === 'uniform' ? 0.22 : 0.9;
  }

  function hitAt(id, desk, t) {
    const steady = steadyHit(id, desk);
    if (desk.warm[id]) return steady;
    return steady * Math.min(1, t / desk.warmupSeconds);
  }

  function checkpointOn(id, desk, t) {
    if (desk.checkpoint === 'aligned') return false;
    if (desk.checkpoint !== 'both' && desk.checkpoint !== id) return false;
    if (t < desk.checkpointEvery) return false;
    return (t - desk.checkpointEvery) % desk.checkpointEvery < desk.checkpointSpan;
  }

  function stallOn(desk, t) {
    return desk.stall && t >= desk.stallAt && t < desk.stallAt + desk.stallSpan;
  }

  function rttOf(id, desk) {
    return desk.farSide === id ? ARTICLE_FAR_RTT_MS : desk.rttMs;
  }

  function partsAt(engine, desk, t) {
    const hit = hitAt(engine.id, desk, t);
    let mul = 1;
    if (checkpointOn(engine.id, desk, t)) mul *= engine.checkpointMul;
    if (stallOn(desk, t)) mul *= engine.stallMul;
    if (desk.newerCpu === engine.id) mul /= 1 + CPU_GEN_GAP;
    const read = desk.readRatio;
    const miss = 1 - hit;
    return [
      {ms: engine.memoryMs * mul, w: read * hit},
      {ms: engine.diskMs * mul, w: read * miss * 0.9},
      {ms: engine.diskMs * mul * 1.8, w: read * miss * 0.1},
      {ms: engine.writeMs * mul, w: 1 - read},
    ].filter(function (part) { return part.w > 1e-12; });
  }

  function weightedMean(parts) {
    let weight = 0;
    let sum = 0;
    parts.forEach(function (part) {
      weight += part.w;
      sum += part.w * part.ms;
    });
    return weight ? sum / weight : 0;
  }

  function percentile(parts, p) {
    const sorted = parts.filter(function (part) { return part.w > 0; }).slice().sort(function (a, b) {
      return a.ms - b.ms;
    });
    if (!sorted.length) return 0;
    const total = sorted.reduce(function (sum, part) { return sum + part.w; }, 0);
    const target = p * total;
    let acc = 0;
    for (let i = 0; i < sorted.length; i++) {
      acc += sorted[i].w;
      // A hair of tolerance keeps a weight that lands on p from falling
      // into the next bucket because 0.9 + 0.09 is not always 0.99 in binary.
      if (acc + total * 1e-8 >= target) return sorted[i].ms;
    }
    return sorted[sorted.length - 1].ms;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, n) { return sum + n; }, 0) / values.length;
  }

  function stdev(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const variance = values.reduce(function (sum, n) { return sum + (n - avg) * (n - avg); }, 0) / values.length;
    return Math.sqrt(variance);
  }

  function quantile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[index];
  }

  function included(desk, t) {
    if (desk.window === 'warmup') return t < desk.warmupSeconds;
    if (desk.window === 'steady') return t >= desk.warmupSeconds;
    return true;
  }

  function previewQps(id, desk) {
    const quiet = setup(desk);
    quiet.warm = {lumen: true, harbor: true};
    quiet.stall = false;
    quiet.checkpoint = 'aligned';
    quiet.newerCpu = desk.newerCpu;
    const parts = partsAt(ENGINES[id], quiet, quiet.warmupSeconds);
    const svc = weightedMean(parts);
    const rtt = rttOf(id, desk);
    const offered = desk.connections * (1000 / (svc + rtt));
    const cap = desk.cores[id] * (1000 / svc);
    return Math.min(offered, cap);
  }

  function simulate(desk) {
    const arrival = Math.max(previewQps('lumen', desk), previewQps('harbor', desk));
    const clientCap = desk.clientBottleneck ? desk.clientCapQps : Infinity;
    const backlog = {lumen: 0, harbor: 0};
    const samples = {lumen: [], harbor: []};

    for (let t = 0; t < desk.duration; t++) {
      ['lumen', 'harbor'].forEach(function (id) {
        const parts = partsAt(ENGINES[id], desk, t);
        const svc = weightedMean(parts);
        const rtt = rttOf(id, desk);
        const cap = ENGINES[id] ? desk.cores[id] * (1000 / svc) : 0;
        let qps = 0;
        let queueMs = 0;
        let record = 0;
        let omitted = 0;

        if (desk.loop === 'closed') {
          const offered = desk.connections * (1000 / (svc + rtt));
          qps = Math.min(offered, cap, clientCap);
          const little = desk.connections / qps * 1000;
          const clientBound = clientCap <= offered && clientCap <= cap;
          queueMs = clientBound ? 0 : Math.max(0, little - (svc + rtt));
          record = qps;
          omitted = Math.max(0, Math.min(arrival, clientCap) - qps);
        } else {
          const arrivals = Math.min(arrival, clientCap);
          const completions = Math.min(backlog[id] + arrivals, cap);
          queueMs = cap > 0 ? (backlog[id] / cap) * 1000 : 0;
          backlog[id] = backlog[id] + arrivals - completions;
          qps = completions;
          record = arrivals;
        }

        const observed = parts.map(function (part) {
          return {ms: part.ms + rtt + queueMs, w: part.w * record};
        });
        samples[id].push({
          t: t,
          qps: qps,
          queueMs: queueMs,
          svc: svc,
          hit: hitAt(id, desk, t),
          observed: observed,
          service: parts.map(function (part) { return {ms: part.ms, w: part.w}; }),
          unloaded: parts.map(function (part) { return {ms: part.ms + rtt, w: part.w}; }),
          p99: percentile(observed, 0.99),
          omitted: omitted,
          checkpoint: checkpointOn(id, desk, t),
          stall: stallOn(desk, t),
        });
      });
    }

    return {samples: samples, arrivalQps: Math.min(arrival, clientCap)};
  }

  function summarize(desk, samples) {
    const kept = samples.filter(function (sample) { return included(desk, sample.t); });
    if (!kept.length) return null;
    const observed = [];
    const unloaded = [];
    const service = [];
    kept.forEach(function (sample) {
      sample.observed.forEach(function (part) { observed.push(part); });
      sample.unloaded.forEach(function (part) {
        unloaded.push({ms: part.ms, w: part.w * sample.qps});
      });
      sample.service.forEach(function (part) {
        service.push({ms: part.ms, w: part.w * sample.qps});
      });
    });
    const qps = kept.map(function (sample) { return sample.qps; });
    const avg = mean(qps);
    return {
      seconds: kept.length,
      qpsMean: avg,
      qpsCov: avg ? stdev(qps) / avg : 0,
      qpsIqr: quantile(qps, 0.75) - quantile(qps, 0.25),
      qpsSeries: qps,
      p99Series: kept.map(function (sample) { return sample.p99; }),
      times: kept.map(function (sample) { return sample.t; }),
      p50: percentile(observed, 0.5),
      p95: percentile(observed, 0.95),
      p99: percentile(observed, 0.99),
      meanLatency: weightedMean(observed),
      unloadedP50: percentile(unloaded, 0.5),
      unloadedP99: percentile(unloaded, 0.99),
      serviceP50: percentile(service, 0.5),
      serviceP99: percentile(service, 0.99),
      omitted: kept.reduce(function (sum, sample) { return sum + sample.omitted; }, 0),
      observed: observed,
    };
  }

  function metricValue(summary, metric) {
    if (metric === 'qps') return summary.qpsMean;
    if (metric === 'mean') return summary.meanLatency;
    if (metric === 'p50') return summary.p50;
    return summary.p99;
  }

  function pick(left, right, metric) {
    const higher = metric === 'qps';
    const lv = metricValue(left, metric);
    const rv = metricValue(right, metric);
    const scale = Math.max(Math.abs(lv), Math.abs(rv), 1e-9);
    const tie = Math.abs(lv - rv) <= scale * 0.01;
    if (tie) return {winner: 'tie', metric: metric, lumen: lv, harbor: rv};
    const lumenWins = higher ? lv > rv : lv < rv;
    return {winner: lumenWins ? 'lumen' : 'harbor', metric: metric, lumen: lv, harbor: rv};
  }

  function crimes(desk) {
    const found = [];
    const cold = !desk.warm.lumen || !desk.warm.harbor;
    if (cold && desk.window !== 'steady') found.push('before-steady');
    if (desk.cores.lumen !== desk.cores.harbor || desk.newerCpu !== 'none') found.push('hardware');
    if (desk.dataset === 'lumen-fits' || desk.dataset === 'harbor-fits') found.push('dataset');
    if (desk.clientBottleneck) found.push('client');
    if (desk.headline === 'mean') found.push('average-only');
    if (desk.farSide !== 'none' || desk.rttMs !== ARTICLE_NEAR_RTT_MS) found.push('network');
    if (desk.checkpoint !== 'aligned' && desk.checkpoint !== 'both') found.push('config');
    if (desk.checkpoint !== 'aligned' && desk.duration <= desk.checkpointEvery) found.push('short-run');
    if (desk.loop === 'closed' && desk.stall) found.push('omission');
    return found;
  }

  function crimeText(id) {
    const copy = {
      'before-steady': 'The window still includes a cache that is filling. Steady state starts once warmup seconds have passed.',
      hardware: 'The cores do not match, or one engine is handed the newer CPU generation. A 16-core box beating an 8-core box is the hardware, and the 15% factor is the article’s Geekbench gap between an r7g.2xlarge and an r8g.2xlarge, not a query result.',
      dataset: 'One working set fits in RAM and the other does not. The article’s sketch is a 32 GB set on 64 GB of RAM, which fits after warming, beside a 320 GB set, which does not.',
      client: 'The client cap sits under both engines. A flat throughput line here is the load generator.',
      'average-only': 'The headline is the mean. Percentiles, the coefficient of variation, the interquartile range, and the time series are still on the page.',
      network: 'Round-trip time is in the client-observed latency. The article’s single-connection arithmetic is 1000 / (10 + 2.5) = 80 QPS and 1000 / (10 + 15) = 40 QPS.',
      config: 'Checkpoint settings differ. The article’s example is checkpoint_timeout: aggressive values dip on a regular beat, and a lax value can fall outside a short run.',
      'short-run': 'The run ends before the first checkpoint second, so that dip is absent from the headline.',
      omission: 'The loop is closed during a stall, so the client stops sending. Requests that an open loop would have queued are counted as omitted, and they are missing from the latency distribution.',
    };
    return copy[id] || id;
  }

  function fmtMs(n) {
    if (!Number.isFinite(n)) return '0 ms';
    if (Math.abs(n) >= 100) return Math.round(n).toLocaleString('en-US') + ' ms';
    return (Math.round(n * 10) / 10).toFixed(1) + ' ms';
  }

  function fmtQps(n) {
    return Math.round(n).toLocaleString('en-US') + ' QPS';
  }

  function fmtMetric(metric, n) {
    return metric === 'qps' ? fmtQps(n) : fmtMs(n);
  }

  function metricLabel(metric) {
    if (metric === 'qps') return 'mean QPS';
    if (metric === 'mean') return 'mean latency';
    if (metric === 'p50') return 'p50 latency';
    return 'p99 latency';
  }

  function varianceNotes(lumen, harbor) {
    return ['Lumen', 'Harbor'].map(function (name, index) {
      const summary = index === 0 ? lumen : harbor;
      if (summary.qpsCov < 0.05) return '';
      const cov = summary.qpsCov.toFixed(2);
      if (summary.qpsIqr <= summary.qpsMean * 0.02) {
        return name + '’s coefficient of variation is ' + cov + ' and its interquartile range is ' + fmtQps(summary.qpsIqr) + '. The uneven seconds sit outside the middle half, which is why the line is the picture that shows them.';
      }
      return name + '’s coefficient of variation is ' + cov + ' and its interquartile range is ' + fmtQps(summary.qpsIqr) + '.';
    }).filter(Boolean);
  }

  function sentence(choice) {
    const label = metricLabel(choice.metric);
    if (choice.winner === 'tie') {
      return 'Headline ' + label + ' is a tie at ' + fmtMetric(choice.metric, choice.lumen) + '.';
    }
    const lead = ENGINES[choice.winner].name;
    const follow = choice.winner === 'lumen' ? 'Harbor' : 'Lumen';
    const leadValue = choice.winner === 'lumen' ? choice.lumen : choice.harbor;
    const followValue = choice.winner === 'lumen' ? choice.harbor : choice.lumen;
    return 'Headline ' + label + ': ' + lead + ' at ' + fmtMetric(choice.metric, leadValue) + ', ' + follow + ' at ' + fmtMetric(choice.metric, followValue) + '.';
  }

  function bucket(values, times, size) {
    const out = [];
    const labels = [];
    for (let i = 0; i < values.length; i += size) {
      const slice = values.slice(i, i + size);
      out.push(mean(slice));
      labels.push(times[i] + 's');
    }
    return {values: out, labels: labels};
  }

  function histogram(observed) {
    const total = observed.reduce(function (sum, part) { return sum + part.w; }, 0) || 1;
    return BINS.map(function (bin) {
      const weight = observed.reduce(function (sum, part) {
        const earlier = BINS.slice(0, BINS.indexOf(bin)).some(function (prev) {
          return part.ms <= prev.hi;
        });
        if (!earlier && part.ms <= bin.hi) return sum + part.w;
        return sum;
      }, 0);
      return {label: bin.label, pct: (weight / total) * 100};
    });
  }

  function niceCeil(n) {
    if (!(n > 0)) return 1;
    const padded = n * 1.12;
    const pow = Math.pow(10, Math.floor(Math.log10(padded)));
    const fraction = padded / pow;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return nice * pow;
  }

  function roundList(values) {
    return values.map(function (n) { return Math.max(0, Math.round(n)); });
  }

  function xyChart(spec) {
    const labels = spec.labels.map(function (label) { return '"' + label + '"'; }).join(', ');
    const yMax = Math.max(1, Math.round(spec.yMax));
    const lines = [];
    lines.push('xychart-beta');
    lines.push('    title "' + spec.title + '"');
    lines.push('    x-axis "' + spec.xTitle + '" [' + labels + ']');
    lines.push('    y-axis "' + spec.yTitle + '" 0 --> ' + yMax);
    if (spec.kind === 'bar' && spec.series) {
      spec.series.forEach(function (series) {
        lines.push('    bar "' + series.name + '" [' + series.values.join(', ') + ']');
      });
    } else if (spec.kind === 'bar') {
      lines.push('    bar [' + spec.values.map(function (n) { return Math.round(n); }).join(', ') + ']');
    } else {
      spec.series.forEach(function (series) {
        lines.push('    line "' + series.name + '" [' + series.values.join(', ') + ']');
      });
    }
    return lines.join('\n');
  }

  function buildCharts(desk, lumen, harbor) {
    const size = desk.duration > 24 ? 6 : 4;
    const qpsL = bucket(lumen.qpsSeries, lumen.times, size);
    const qpsH = bucket(harbor.qpsSeries, harbor.times, size);
    const p99L = bucket(lumen.p99Series, lumen.times, size);
    const p99H = bucket(harbor.p99Series, harbor.times, size);
    const histL = histogram(lumen.observed);
    const histH = histogram(harbor.observed);
    const qpsMax = niceCeil(Math.max.apply(null, qpsL.values.concat(qpsH.values)));
    const p99Max = niceCeil(Math.max.apply(null, p99L.values.concat(p99H.values, [lumen.p99, harbor.p99, lumen.p50, harbor.p50])));
    return {
      qps: xyChart({
        title: 'Simulated throughput',
        xTitle: 'second',
        yTitle: 'QPS',
        labels: qpsL.labels,
        yMax: qpsMax,
        kind: 'line',
        series: [
          {name: 'Lumen', values: roundList(qpsL.values)},
          {name: 'Harbor', values: roundList(qpsH.values)},
        ],
      }),
      tail: xyChart({
        title: 'Simulated p99 each bucket',
        xTitle: 'second',
        yTitle: 'ms',
        labels: p99L.labels,
        yMax: p99Max,
        kind: 'line',
        series: [
          {name: 'Lumen', values: roundList(p99L.values)},
          {name: 'Harbor', values: roundList(p99H.values)},
        ],
      }),
      latency: xyChart({
        title: 'Simulated client latency',
        xTitle: 'percentile',
        yTitle: 'ms',
        labels: ['p50', 'p95', 'p99'],
        yMax: p99Max,
        kind: 'bar',
        series: [
          {name: 'Lumen', values: roundList([lumen.p50, lumen.p95, lumen.p99])},
          {name: 'Harbor', values: roundList([harbor.p50, harbor.p95, harbor.p99])},
        ],
      }),
      histogram: xyChart({
        title: 'Simulated latency mix',
        xTitle: 'ms bin',
        yTitle: 'percent',
        labels: histL.map(function (bin) { return bin.label; }),
        yMax: 100,
        kind: 'bar',
        series: [
          {name: 'Lumen', values: roundList(histL.map(function (bin) { return bin.pct; }))},
          {name: 'Harbor', values: roundList(histH.map(function (bin) { return bin.pct; }))},
        ],
      }),
    };
  }

  function run(overrides) {
    const desk = setup(overrides);
    const sim = simulate(desk);
    const lumen = summarize(desk, sim.samples.lumen);
    const harbor = summarize(desk, sim.samples.harbor);
    if (!lumen || !harbor) {
      return {ok: false, setup: desk, error: 'That window has no seconds. Lengthen the run or include the warmup.'};
    }
    const headlines = {
      p50: pick(lumen, harbor, 'p50'),
      p99: pick(lumen, harbor, 'p99'),
      mean: pick(lumen, harbor, 'mean'),
      qps: pick(lumen, harbor, 'qps'),
    };
    const active = crimes(desk);
    return {
      ok: true,
      setup: desk,
      arrivalQps: sim.arrivalQps,
      lumen: lumen,
      harbor: harbor,
      headlines: headlines,
      headline: headlines[desk.headline],
      crimes: active,
      crimeCopy: active.map(function (id) { return {id: id, text: crimeText(id)}; }),
      variance: varianceNotes(lumen, harbor),
      charts: buildCharts(desk, lumen, harbor),
      reading: {
        headline: sentence(headlines[desk.headline]),
        also: ['p50', 'p99', 'mean', 'qps'].filter(function (metric) {
          return metric !== desk.headline;
        }).map(function (metric) { return sentence(headlines[metric]); }),
      },
    };
  }

  return {
    ARTICLE_SERVICE_MS: ARTICLE_SERVICE_MS,
    ARTICLE_NEAR_RTT_MS: ARTICLE_NEAR_RTT_MS,
    ARTICLE_FAR_RTT_MS: ARTICLE_FAR_RTT_MS,
    CPU_GEN_GAP: CPU_GEN_GAP,
    ENGINES: ENGINES,
    defaultSetup: defaultSetup,
    setup: setup,
    singleConnectionQps: singleConnectionQps,
    articleSketch: articleSketch,
    steadyHit: steadyHit,
    run: run,
    crimeText: crimeText,
  };
});
