(function () {
  const api = window.CrashMath;
  const NS = 'http://www.w3.org/2000/svg';

  const lossInput = document.querySelector('#loss');
  const retInput = document.querySelector('#ret');
  const seedInput = document.querySelector('#seed');
  const layers = {
    volTarget: document.querySelector('#layer-vol'),
    drawdownBrake: document.querySelector('#layer-brake'),
    trend: document.querySelector('#layer-trend'),
    kelly: document.querySelector('#layer-kelly'),
  };

  const outputs = {
    loss: document.querySelector('#loss-out'),
    ret: document.querySelector('#ret-out'),
    mu: document.querySelector('#mu-out'),
    sigma: document.querySelector('#sigma-out'),
    crash: document.querySelector('#crash-out'),
    crashDays: document.querySelector('#crash-days-out'),
    targetVol: document.querySelector('#target-vol-out'),
    volCap: document.querySelector('#vol-cap-out'),
    ddLimit: document.querySelector('#dd-limit-out'),
    ddFloor: document.querySelector('#dd-floor-out'),
    lookback: document.querySelector('#lookback-out'),
    trendFloor: document.querySelector('#trend-floor-out'),
    kellyScale: document.querySelector('#kelly-scale-out'),
    kellyWindow: document.querySelector('#kelly-window-out'),
  };

  document.querySelector('#regenerate').addEventListener('click', function () {
    const buf = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
    else buf[0] = Math.floor(Math.random() * 0xffffffff);
    seedInput.value = String(buf[0] % 100000);
    paint();
  });

  Object.keys(layers).forEach(function (key) {
    layers[key].addEventListener('click', function () {
      const on = layers[key].getAttribute('aria-pressed') !== 'true';
      layers[key].setAttribute('aria-pressed', on ? 'true' : 'false');
      paint();
    });
  });

  document.body.addEventListener('input', function (event) {
    if (event.target instanceof HTMLInputElement) paint();
  });
  seedInput.addEventListener('change', paint);

  paint();

  function num(id, fallback) {
    const value = Number(document.querySelector(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function on(key) {
    return layers[key].getAttribute('aria-pressed') === 'true';
  }

  function read() {
    const loss = Math.min(0.9, Math.max(0, num('#loss', 50) / 100));
    const yearlyReturn = Math.min(0.2, Math.max(0.01, num('#ret', 8) / 100));
    const seed = Math.max(0, Math.round(num('#seed', api.DEFAULTS.seed))) >>> 0;
    return {
      loss: loss,
      yearlyReturn: yearlyReturn,
      seed: seed,
      mu: num('#mu', 7) / 100,
      sigma: num('#sigma', 18) / 100,
      crashSize: -num('#crash', 35) / 100,
      crashDays: Math.round(num('#crash-days', 20)),
      volTarget: on('volTarget'),
      targetVol: num('#target-vol', 10) / 100,
      volCap: num('#vol-cap', 1.5),
      drawdownBrake: on('drawdownBrake'),
      drawdownLimit: num('#dd-limit', 10) / 100,
      drawdownFloor: num('#dd-floor', 25) / 100,
      trend: on('trend'),
      trendLookback: Math.round(num('#lookback', 200)),
      trendFloor: num('#trend-floor', 0) / 100,
      kelly: on('kelly'),
      kellyScale: num('#kelly-scale', 0.5),
      kellyWindow: Math.round(num('#kelly-window', 63)),
    };
  }

  function paint() {
    const opt = read();
    outputs.loss.textContent = nicePercent(opt.loss);
    outputs.ret.textContent = nicePercent(opt.yearlyReturn);
    outputs.mu.textContent = nicePercent(opt.mu);
    outputs.sigma.textContent = api.formatPercent(opt.sigma, 0);
    outputs.crash.textContent = api.formatPercent(opt.crashSize, 0);
    outputs.crashDays.textContent = opt.crashDays + (opt.crashDays === 1 ? ' day' : ' days');
    outputs.targetVol.textContent = api.formatPercent(opt.targetVol, 0);
    outputs.volCap.textContent = opt.volCap.toFixed(2) + '×';
    outputs.ddLimit.textContent = api.formatPercent(opt.drawdownLimit, 0);
    outputs.ddFloor.textContent = api.formatPercent(opt.drawdownFloor, 0);
    outputs.lookback.textContent = opt.trendLookback + ' days';
    outputs.trendFloor.textContent = api.formatPercent(opt.trendFloor, 0);
    outputs.kellyScale.textContent = opt.kellyScale.toFixed(2);
    outputs.kellyWindow.textContent = opt.kellyWindow + ' days';

    const gain = api.recoveryGain(opt.loss);
    const years = api.yearsToRecover(opt.loss, opt.yearlyReturn);
    const left = (1 - opt.loss) * 100;
    document.querySelector('#left').textContent = '$' + left.toFixed(0);
    document.querySelector('#gain').textContent = nicePercent(gain);
    document.querySelector('#years').textContent = api.formatYears(years);
    const lossLabel = nicePercent(opt.loss);
    const gainLabel = nicePercent(gain);
    document.querySelector('#hole-sentence').textContent = 'A ' + lossLabel + ' loss needs a ' + gainLabel + ' gain. At ' + nicePercent(opt.yearlyReturn) + ' a year, that takes ' + api.formatYears(years) + ' years.';

    const curve = api.recoveryCurve(opt.yearlyReturn, 90);
    const marker = Math.round(opt.loss / 0.9 * 90);
    chart(document.querySelector('#hole-chart'), {
      label: 'Curve of the gain needed to recover a loss.',
      height: 360,
      lo: 0,
      hi: 9.4,
      count: curve.length,
      formatY: function (v) { return api.formatPercent(v, 0); },
      series: [{ name: 'Gain needed', color: '#3f7f7a', width: 2.2, values: curve.map(function (p) { return p.gain; }) }],
      shade: { from: 0, to: marker },
      note: [lossLabel + ' loss', gainLabel + ' to come back', api.formatYears(years) + ' years'],
      marker: marker,
      xLabels: [
        { index: 0, text: '0' },
        { index: 50, text: '45%' },
        { index: 90, text: '90%' },
      ],
      hover: function (i) {
        const p = curve[Math.max(0, Math.min(curve.length - 1, i))];
        return api.formatPercent(p.loss, 0) + ' loss · gain ' + api.formatPercent(p.gain, 0) + ' · ' + api.formatYears(p.years) + ' years';
      },
    });

    const series = api.generateSeries({
      seed: opt.seed,
      mu: opt.mu,
      sigma: opt.sigma,
      crashSize: opt.crashSize,
      crashDays: opt.crashDays,
    });
    const sim = api.simulate(series.prices, opt);
    const equityExtent = extent([sim.buyHold, sim.protected], 1);
    const n = sim.buyHold.length;
    const xLabels = yearTicks(n);
    const crashNote = [
      'Injected ' + api.formatPercent(series.crashSize, 0),
      series.crashDays + (series.crashDays === 1 ? ' trading day' : ' trading days'),
    ];

    chart(document.querySelector('#equity-chart'), {
      label: 'Buy and hold against the protected book. The shaded band is the injected crash.',
      height: 400,
      lo: equityExtent.lo,
      hi: equityExtent.hi,
      count: n,
      formatY: function (v) { return v.toFixed(2); },
      series: [
        { name: 'Buy and hold', color: '#3f7f7a', values: sim.buyHold },
        { name: 'Protected', color: '#1d4a34', values: sim.protected },
      ],
      labels: true,
      shade: { from: series.preIndex, to: series.postIndex },
      note: crashNote,
      baseline: 1,
      xLabels: xLabels,
      hover: function (i) {
        return 'Day ' + i + ' · hold ' + sim.buyHold[i].toFixed(2) + ' · protected ' + sim.protected[i].toFixed(2);
      },
    });

    const water = extent([sim.drawdownBuyHold, sim.drawdownProtected], 0);
    chart(document.querySelector('#under-chart'), {
      label: 'Drawdown from the running peak for buy and hold and for the protected book.',
      height: 280,
      lo: water.lo,
      hi: Math.max(0, water.hi),
      count: n,
      formatY: function (v) { return api.formatPercent(v, 0); },
      series: [
        { name: 'Buy and hold', color: '#3f7f7a', values: sim.drawdownBuyHold },
        { name: 'Protected', color: '#1d4a34', values: sim.drawdownProtected },
      ],
      labels: true,
      shade: { from: series.preIndex, to: series.postIndex },
      note: crashNote,
      baseline: 0,
      xLabels: xLabels,
      hover: function (i) {
        return 'Day ' + i + ' · hold ' + api.formatPercent(sim.drawdownBuyHold[i], 1) + ' · protected ' + api.formatPercent(sim.drawdownProtected[i], 1);
      },
    });

    paintStats(sim);
    paintRule(opt);
  }

  function yearTicks(n) {
    const ticks = [];
    const years = Math.floor((n - 1) / api.DAYS_PER_YEAR);
    for (let y = 0; y <= years; y += 1) {
      ticks.push({ index: Math.min(n - 1, y * api.DAYS_PER_YEAR), text: y === 0 ? 'Start' : y + 'y' });
    }
    return ticks;
  }

  function extent(arrays, pin) {
    let lo = Infinity;
    let hi = -Infinity;
    arrays.forEach(function (arr) {
      for (let i = 0; i < arr.length; i += 1) {
        if (arr[i] < lo) lo = arr[i];
        if (arr[i] > hi) hi = arr[i];
      }
    });
    if (pin != null) {
      lo = Math.min(lo, pin);
      hi = Math.max(hi, pin);
    }
    if (!(hi > lo)) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return { lo: lo - pad, hi: hi + pad };
  }

  function paintStats(sim) {
    const rows = [
      ['CAGR', fmtCagr(sim.buyHoldStats.cagr), fmtCagr(sim.protectedStats.cagr)],
      ['Max drawdown', api.formatPercent(-sim.buyHoldStats.maxDrawdown, 1), api.formatPercent(-sim.protectedStats.maxDrawdown, 1)],
      ['Recovery', api.formatRecovery(sim.buyHoldStats), api.formatRecovery(sim.protectedStats)],
      ['Sharpe-ish', fmtSharpe(sim.buyHoldStats.sharpe), fmtSharpe(sim.protectedStats.sharpe)],
      ['End value', sim.buyHoldStats.end.toFixed(2), sim.protectedStats.end.toFixed(2)],
    ];
    const body = document.querySelector('#stats');
    body.replaceChildren();
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      row.forEach(function (cell, index) {
        const node = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) node.scope = 'row';
        node.textContent = cell;
        tr.appendChild(node);
      });
      body.appendChild(tr);
    });
    const kelly = sim.lastKelly == null
      ? 'The Kelly window is still filling.'
      : 'The Kelly fraction is ' + sim.lastKelly.toFixed(2) + '× before the exposure cap.';
    document.querySelector('#exposure').textContent = 'Exposure at the last close ' + sim.lastExposure.toFixed(2) + '×. Average exposure ' + sim.averageExposure.toFixed(2) + '×. Latest annualised volatility ' + api.formatPercent(sim.lastVol, 1) + '. ' + kelly;
  }

  function nicePercent(fraction) {
    const pct = fraction * 100;
    const digits = Math.abs(pct - Math.round(pct)) < 0.05 ? 0 : 1;
    return api.formatPercent(fraction, digits);
  }

  function fmtCagr(value) {
    return api.formatSignedPercent(value, 1);
  }

  function fmtSharpe(value) {
    if (value == null || !Number.isFinite(value)) return '—';
    const sign = value < 0 ? '−' : '';
    return sign + Math.abs(value).toFixed(2);
  }

  function paintRule(opt) {
    const parts = [];
    if (opt.volTarget) parts.push('hold ' + api.formatPercent(opt.targetVol, 0) + ' volatility, capped at ' + opt.volCap.toFixed(2) + '×');
    if (opt.drawdownBrake) parts.push('cut to ' + api.formatPercent(opt.drawdownFloor, 0) + ' once the book is ' + api.formatPercent(opt.drawdownLimit, 0) + ' under its peak');
    if (opt.trend) parts.push('hold ' + api.formatPercent(opt.trendFloor, 0) + ' under the ' + opt.trendLookback + '-day average');
    if (opt.kelly) parts.push('never above ' + opt.kellyScale.toFixed(2) + '× Kelly');
    const text = parts.length ? parts.join('; ') + '.' : 'Every layer is off, so the protected book is buy and hold.';
    document.querySelector('#rule').textContent = text[0].toUpperCase() + text.slice(1);
  }

  function chart(host, spec) {
    host.replaceChildren();
    const W = 840;
    const H = spec.height;
    const noteLines = spec.note && spec.shade ? spec.note.length : 0;
    const noteH = noteLines ? 12 + noteLines * 15 : 0;
    const pad = { l: 64, r: spec.labels ? 118 : 24, t: noteH ? noteH + 16 : 22, b: 36 };
    const svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': spec.label,
    });
    host.appendChild(svg);
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    function xOf(i) {
      const last = Math.max(1, spec.count - 1);
      return pad.l + (i / last) * plotW;
    }
    function yOf(v) {
      const t = (v - spec.lo) / (spec.hi - spec.lo);
      return pad.t + (1 - t) * plotH;
    }

    if (spec.shade) {
      const x0 = xOf(spec.shade.from);
      const x1 = xOf(spec.shade.to);
      svg.appendChild(svgEl('rect', {
        x: x0,
        y: pad.t,
        width: Math.max(1, x1 - x0),
        height: plotH,
        fill: '#efe6c8',
      }));
    }

    niceTicks(spec.lo, spec.hi, 4).forEach(function (v) {
      const y = yOf(v);
      svg.appendChild(svgEl('line', {
        x1: pad.l,
        x2: pad.l + plotW,
        y1: y,
        y2: y,
        stroke: '#e0d6c6',
        'stroke-width': 1,
      }));
      svg.appendChild(svgEl('text', {
        x: pad.l - 8,
        y: y + 4,
        'text-anchor': 'end',
        fill: '#5c6570',
        'font-size': 12,
        'font-family': 'Segoe UI, system-ui, sans-serif',
      }, spec.formatY(v)));
    });

    if (spec.baseline != null && spec.baseline >= spec.lo && spec.baseline <= spec.hi) {
      const y = yOf(spec.baseline);
      svg.appendChild(svgEl('line', {
        x1: pad.l,
        x2: pad.l + plotW,
        y1: y,
        y2: y,
        stroke: '#14213d',
        'stroke-width': 1.25,
      }));
    }

    spec.series.forEach(function (series) {
      let d = '';
      for (let i = 0; i < series.values.length; i += 1) {
        d += (i === 0 ? 'M' : 'L') + xOf(i).toFixed(1) + ' ' + yOf(series.values[i]).toFixed(1);
      }
      svg.appendChild(svgEl('path', {
        d: d,
        fill: 'none',
        stroke: series.color,
        'stroke-width': series.width || 1.8,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }));
    });

    if (spec.marker != null) {
      const i = spec.marker;
      const v = spec.series[0].values[i];
      svg.appendChild(svgEl('circle', {
        cx: xOf(i),
        cy: yOf(v),
        r: 4.5,
        fill: '#14213d',
      }));
    }

    if (spec.labels) {
      const ends = spec.series.map(function (series) {
        const i = series.values.length - 1;
        return { name: series.name, color: series.color, y: yOf(series.values[i]), x: xOf(i) };
      }).sort(function (a, b) { return a.y - b.y; });
      for (let i = 1; i < ends.length; i += 1) {
        if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
      }
      ends.forEach(function (item) {
        const y = Math.max(pad.t + 12, Math.min(pad.t + plotH, item.y));
        svg.appendChild(svgEl('text', {
          x: item.x + 8,
          y: y + 4,
          fill: item.color,
          'font-size': 15,
          'font-family': 'Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif',
        }, item.name));
      });
    }

    (spec.xLabels || []).forEach(function (tick) {
      svg.appendChild(svgEl('text', {
        x: xOf(tick.index),
        y: H - 12,
        'text-anchor': 'middle',
        fill: '#5c6570',
        'font-size': 12,
        'font-family': 'Segoe UI, system-ui, sans-serif',
      }, tick.text));
    });

    if (spec.note && spec.shade) {
      const lines = spec.note;
      const boxW = 176;
      const boxH = noteH;
      const mid = (xOf(spec.shade.from) + xOf(spec.shade.to)) / 2;
      const x = Math.max(pad.l, Math.min(mid - boxW / 2, pad.l + plotW - boxW));
      const y = 6;
      svg.appendChild(svgEl('rect', {
        x: x,
        y: y,
        width: boxW,
        height: boxH,
        fill: '#fbf7ef',
        stroke: '#cfc4b2',
      }));
      lines.forEach(function (line, i) {
        svg.appendChild(svgEl('text', {
          x: x + 10,
          y: y + 16 + i * 15,
          fill: '#14213d',
          'font-size': 12,
          'font-family': 'Segoe UI, system-ui, sans-serif',
        }, line));
      });
    }

    const guide = svgEl('line', {
      y1: pad.t,
      y2: pad.t + plotH,
      stroke: '#14213d',
      'stroke-width': 1,
      visibility: 'hidden',
    });
    const tip = svgEl('text', {
      x: pad.l + 4,
      y: pad.t + 16,
      fill: '#14213d',
      'font-size': 13,
      'font-family': 'Segoe UI, system-ui, sans-serif',
    });
    svg.appendChild(guide);
    svg.appendChild(tip);
    svg.addEventListener('pointermove', function (event) {
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * W;
      const last = Math.max(1, spec.count - 1);
      let i = Math.round(((px - pad.l) / plotW) * last);
      if (i < 0 || i > last || px < pad.l || px > pad.l + plotW) {
        guide.setAttribute('visibility', 'hidden');
        tip.textContent = '';
        return;
      }
      guide.setAttribute('visibility', 'visible');
      guide.setAttribute('x1', xOf(i));
      guide.setAttribute('x2', xOf(i));
      tip.textContent = spec.hover(i);
    });
    svg.addEventListener('pointerleave', function () {
      guide.setAttribute('visibility', 'hidden');
      tip.textContent = '';
    });
  }

  function niceTicks(lo, hi, count) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / count;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const err = raw / pow;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * pow;
    const ticks = [];
    const start = Math.ceil((lo - step * 1e-6) / step) * step;
    for (let v = start; v <= hi + step * 1e-6; v += step) {
      if (v >= lo - step * 0.05 && v <= hi + step * 0.05) ticks.push(v);
    }
    return ticks;
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    if (text != null) node.textContent = text;
    return node;
  }
})();
