// Seeded auction-path stand-in. Price rotates inside a balance zone, then
// runs quickly to a new one. Time at each price is the volume profile.
// The value area is 70% of that time, grown from the point of control.
// Nothing here is bitcoin, a forecast, or trading advice.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ValueArea = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VALUE_FRACTION = 0.7;
  const PROFILE_BINS = 24;
  const ZONE_BINS = 15;

  const DEFAULTS = {
    seed: 20261112,
    steps: 180,
    balanceLength: 46,
    breakoutProbability: 0.16,
    volatility: 0.7,
    forceAt: null,
  };

  const COLORS = {
    price: '#3f7f7a',
    value: '#1d4a34',
    poc: '#3f7f7a',
    gap: '#a6843d',
    outside: '#8aa39a',
    navy: '#14213d',
  };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function roundTo(n, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sanitize(options) {
    const source = options || {};
    const o = {
      seed: source.seed,
      steps: source.steps,
      balanceLength: source.balanceLength,
      breakoutProbability: source.breakoutProbability,
      volatility: source.volatility,
      forceAt: source.forceAt,
    };
    const seed = Number(o.seed);
    o.seed = Number.isFinite(seed) ? (seed >>> 0) : DEFAULTS.seed;
    const steps = Number(o.steps);
    o.steps = clamp(Math.round(Number.isFinite(steps) && steps > 0 ? steps : DEFAULTS.steps), 20, 400);
    const balance = Number(o.balanceLength);
    o.balanceLength = clamp(Math.round(Number.isFinite(balance) && balance > 0 ? balance : DEFAULTS.balanceLength), 8, 160);
    const probability = Number(o.breakoutProbability);
    o.breakoutProbability = clamp(Number.isFinite(probability) ? probability : DEFAULTS.breakoutProbability, 0, 1);
    const volatility = Number(o.volatility);
    o.volatility = clamp(Number.isFinite(volatility) ? volatility : DEFAULTS.volatility, 0, 3);
    if (o.forceAt == null || o.forceAt === '') o.forceAt = null;
    else {
      const at = Math.round(Number(o.forceAt));
      o.forceAt = Number.isFinite(at) && at >= 0 && at < o.steps ? at : null;
    }
    return o;
  }

  function zoneHalf(volatility) {
    return 3.4 + volatility * 1.35;
  }

  function run(cfg) {
    const rng = mulberry32(cfg.seed);
    const bars = [];
    let price = 100;
    let center = 100;
    let half = zoneHalf(cfg.volatility);
    let mode = 'balance';
    let zoneId = 1;
    let spent = 0;
    let dir = 0;
    let target = center;

    function beginBreak(direction) {
      mode = 'imbalance';
      dir = direction < 0 ? -1 : 1;
      const gap = 9 + cfg.volatility * 1.6;
      target = roundTo(center + dir * (half * 2 + gap), 4);
    }

    for (let t = 0; t < cfg.steps; t++) {
      if (mode === 'balance' && cfg.forceAt === t) beginBreak(-1);

      if (mode === 'balance') {
        const amp = cfg.volatility === 0 ? 0 : 0.28 + cfg.volatility * 0.95;
        const noise = (rng() - 0.5) * 2 * amp;
        price = price + (center - price) * 0.14 + noise;
        const lo = center - half;
        const hi = center + half;
        if (price < lo) price = lo;
        if (price > hi) price = hi;
        price = roundTo(price, 4);
        spent += 1;
        bars.push({ t: t, price: price, mode: 'balance', zoneId: zoneId });
        if (spent >= cfg.balanceLength && rng() < cfg.breakoutProbability) {
          beginBreak(rng() < 0.5 ? -1 : 1);
        }
      } else {
        const pace = 1.55 + cfg.volatility * 0.22;
        price = roundTo(price + dir * pace, 4);
        const arrived = dir > 0 ? price >= target : price <= target;
        if (arrived) {
          price = roundTo(target, 4);
          zoneId += 1;
          center = price;
          half = zoneHalf(cfg.volatility);
          mode = 'balance';
          spent = 1;
          dir = 0;
          bars.push({ t: t, price: price, mode: 'balance', zoneId: zoneId });
        } else {
          bars.push({ t: t, price: price, mode: 'imbalance', zoneId: zoneId });
        }
      }
    }
    return bars;
  }

  function segment(bars) {
    const out = [];
    (bars || []).forEach(function (bar) {
      const last = out[out.length - 1];
      const split = !last || last.mode !== bar.mode || (bar.mode === 'balance' && last.zoneId !== bar.zoneId);
      if (split) out.push({ mode: bar.mode, zoneId: bar.zoneId, bars: [bar] });
      else last.bars.push(bar);
    });
    return out;
  }

  function profileOf(bars, count) {
    const n = count || PROFILE_BINS;
    let min = Infinity;
    let max = -Infinity;
    (bars || []).forEach(function (bar) {
      if (bar.price < min) min = bar.price;
      if (bar.price > max) max = bar.price;
    });
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    } else if (!(max > min)) {
      max = min + 1;
    }
    const step = (max - min) / n;
    const bins = [];
    for (let i = 0; i < n; i++) {
      bins.push({
        index: i,
        lo: min + i * step,
        hi: min + (i + 1) * step,
        mid: min + (i + 0.5) * step,
        count: 0,
        tags: [],
        thin: false,
        share: 0,
      });
    }
    (bars || []).forEach(function (bar) {
      let i = Math.floor((bar.price - min) / step);
      if (i < 0) i = 0;
      if (i >= n) i = n - 1;
      bins[i].count += 1;
    });
    return { min: min, max: max, step: step, total: (bars || []).length, bins: bins };
  }

  function expandValueArea(bins, fraction) {
    const list = bins || [];
    const total = list.reduce(function (sum, bin) { return sum + bin.count; }, 0);
    if (!total || !list.length) return null;
    const portion = fraction == null ? VALUE_FRACTION : fraction;
    let poc = 0;
    for (let i = 1; i < list.length; i++) {
      if (list[i].count > list[poc].count) poc = i;
    }
    let low = poc;
    let high = poc;
    let acc = list[poc].count;
    const target = total * portion;
    let guard = 0;
    while (acc < target && (low > 0 || high < list.length - 1) && guard < list.length + 2) {
      guard += 1;
      const canUp = high < list.length - 1;
      const canDown = low > 0;
      const up = canUp ? list[high + 1].count : -1;
      const down = canDown ? list[low - 1].count : -1;
      if (up < 0 && down < 0) break;
      if (canUp && canDown && up === down) {
        high += 1;
        acc += list[high].count;
        low -= 1;
        acc += list[low].count;
      } else if (up > down) {
        high += 1;
        acc += list[high].count;
      } else {
        low -= 1;
        acc += list[low].count;
      }
    }
    return {
      pocIndex: poc,
      lowIndex: low,
      highIndex: high,
      poc: list[poc].mid,
      vah: list[high].hi,
      val: list[low].lo,
      covered: acc / total,
    };
  }

  function valueArea(bars, fraction) {
    if (!bars || !bars.length) return null;
    return expandValueArea(profileOf(bars, ZONE_BINS).bins, fraction);
  }

  function segmentPace(bars) {
    if (!bars || bars.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < bars.length; i++) sum += Math.abs(bars[i].price - bars[i - 1].price);
    return sum / (bars.length - 1);
  }

  function priceGaps(zones) {
    const ranges = zones.map(function (zone) {
      return { lo: zone.lo, hi: zone.hi, zoneId: zone.zoneId };
    }).sort(function (a, b) { return a.lo - b.lo || a.hi - b.hi; });
    const out = [];
    for (let i = 1; i < ranges.length; i++) {
      const lower = ranges[i - 1];
      const upper = ranges[i];
      if (upper.lo - lower.hi > 0.05) {
        out.push({ lo: lower.hi, hi: upper.lo, below: lower.zoneId, above: upper.zoneId });
      }
    }
    return out;
  }

  function speeds(bars) {
    let inSum = 0;
    let inN = 0;
    let outSum = 0;
    let outN = 0;
    const list = bars || [];
    for (let i = 1; i < list.length; i++) {
      const delta = Math.abs(list[i].price - list[i - 1].price);
      const between = list[i].mode === 'imbalance' || list[i - 1].mode === 'imbalance';
      if (between) {
        outSum += delta;
        outN += 1;
      } else {
        inSum += delta;
        inN += 1;
      }
    }
    return {
      inside: inN ? inSum / inN : 0,
      between: outN ? outSum / outN : 0,
      insideSamples: inN,
      betweenSamples: outN,
    };
  }

  function analyze(bars) {
    const list = bars || [];
    const segments = segment(list);
    const zones = [];
    const moves = [];
    segments.forEach(function (seg) {
      if (!seg.bars.length) return;
      const prices = seg.bars.map(function (bar) { return bar.price; });
      const lo = Math.min.apply(null, prices);
      const hi = Math.max.apply(null, prices);
      if (seg.mode === 'balance') {
        const area = valueArea(seg.bars, VALUE_FRACTION);
        zones.push({
          zoneId: seg.zoneId,
          steps: seg.bars.length,
          from: seg.bars[0].t,
          to: seg.bars[seg.bars.length - 1].t,
          lo: lo,
          hi: hi,
          poc: area ? area.poc : prices[0],
          vah: area ? area.vah : hi,
          val: area ? area.val : lo,
          covered: area ? area.covered : 1,
        });
      } else {
        moves.push({
          steps: seg.bars.length,
          from: seg.bars[0].t,
          to: seg.bars[seg.bars.length - 1].t,
          lo: lo,
          hi: hi,
          start: seg.bars[0].price,
          end: seg.bars[seg.bars.length - 1].price,
          pace: segmentPace(seg.bars),
        });
      }
    });
    const gaps = priceGaps(zones);
    const profile = profileOf(list, PROFILE_BINS);
    profile.bins.forEach(function (bin) {
      const hosts = zones.filter(function (zone) { return bin.lo < zone.hi && bin.hi > zone.lo; });
      if (hosts.length) {
        hosts.forEach(function (zone) {
          if (bin.lo < zone.vah && bin.hi > zone.val) bin.tags.push('value');
          if (bin.lo <= zone.poc && zone.poc < bin.hi) bin.tags.push('poc');
        });
      } else if (bin.count > 0) {
        bin.tags = ['gap'];
        bin.thin = true;
      }
      bin.share = profile.total ? bin.count / profile.total : 0;
    });
    let inside = 0;
    let between = 0;
    list.forEach(function (bar) {
      if (bar.mode === 'imbalance') between += 1;
      else inside += 1;
    });
    return {
      segments: segments,
      zones: zones,
      gaps: gaps,
      moves: moves,
      profile: profile,
      speeds: speeds(list),
      time: { inside: inside, between: between },
    };
  }

  function generate(options) {
    const config = sanitize(options);
    const bars = run(config);
    return { config: config, bars: bars, analysis: analyze(bars) };
  }

  function axisBounds(values) {
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    if (!(max > min)) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    let lo = Math.floor(min - span * 0.12);
    let hi = Math.ceil(max + span * 0.16);
    if (hi <= lo) hi = lo + 1;
    return { min: lo, max: hi };
  }

  function priceChart(bars) {
    if (!bars || bars.length < 2) return null;
    const bounds = axisBounds(bars.map(function (bar) { return bar.price; }));
    const ys = bars.map(function (bar) { return roundTo(bar.price, 2); });
    const source = [
      'xychart-beta',
      '    title "Synthetic price"',
      '    x-axis "step" 0 --> ' + (bars.length - 1),
      '    y-axis "price" ' + bounds.min + ' --> ' + bounds.max,
      '    line [' + ys.join(', ') + ']',
    ].join('\n');
    return { source: source, bounds: bounds };
  }

  function profileChart(profile) {
    if (!profile || !profile.bins.length) return null;
    const labels = profile.bins.map(function (bin, index) { return String(index + 1); });
    const counts = profile.bins.map(function (bin) { return bin.count; });
    const max = counts.reduce(function (m, n) { return Math.max(m, n); }, 1);
    const source = [
      'xychart-beta',
      '    title "Time at price"',
      '    x-axis "bin" [' + labels.join(', ') + ']',
      '    y-axis "steps" 0 --> ' + Math.max(1, Math.ceil(max * 1.05)),
      '    bar [' + counts.join(', ') + ']',
    ].join('\n');
    return { source: source, bounds: { min: 0, max: Math.max(1, Math.ceil(max * 1.05)) } };
  }

  function plotBoxFromPath(d) {
    const match = String(d || '').match(/M([\d.]+),([\d.]+)V([\d.]+)M[\d.]+,[\d.]+H([\d.]+)/);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const bottom = Number(match[3]);
    const right = Number(match[4]);
    if (!(right > x) || !(bottom > y)) return null;
    return { x: x, y: y, width: right - x, height: bottom - y };
  }

  function horizontalBars(bins, box, scale) {
    const list = bins || [];
    if (!box || !list.length) return [];
    const min = scale && Number.isFinite(scale.min) ? scale.min : Math.min.apply(null, list.map(function (bin) { return bin.lo; }));
    const max = scale && Number.isFinite(scale.max) ? scale.max : Math.max.apply(null, list.map(function (bin) { return bin.hi; }));
    const span = max > min ? max - min : 1;
    const maxCount = list.reduce(function (m, bin) { return Math.max(m, bin.count); }, 1);
    function yFor(price) {
      const t = clamp((price - min) / span, 0, 1);
      return box.y + box.height * (1 - t);
    }
    return list.map(function (bin) {
      const yHi = yFor(bin.hi);
      const yLo = yFor(bin.lo);
      const top = Math.min(yHi, yLo);
      const height = Math.max(1, Math.abs(yLo - yHi) - 0.6);
      return {
        x: box.x,
        y: top,
        width: (bin.count / maxCount) * box.width,
        height: Math.min(height, box.y + box.height - top),
        thin: !!bin.thin,
        count: bin.count,
        mid: bin.mid,
      };
    });
  }

  function binColor(bin) {
    if (!bin) return COLORS.outside;
    if (bin.thin || (bin.tags && bin.tags.indexOf('gap') !== -1)) return COLORS.gap;
    if (bin.tags && bin.tags.indexOf('poc') !== -1) return COLORS.poc;
    if (bin.tags && bin.tags.indexOf('value') !== -1) return COLORS.value;
    return COLORS.outside;
  }

  function formatPrice(n) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n);
  }

  function formatPace(n) {
    if (!Number.isFinite(n)) return '0';
    return n.toFixed(n >= 10 ? 1 : 2);
  }

  function formatRatio(n) {
    if (!Number.isFinite(n)) return '';
    return n.toFixed(1) + '\u00d7';
  }

  function claimText(speed) {
    if (!speed || !speed.betweenSamples) return 'No move between zones in this window.';
    if (!(speed.inside > 0)) {
      return 'Inside the zones the path is still. Between them it covers ' + formatPace(speed.between) + ' per step.';
    }
    return 'Between zones is ' + formatRatio(speed.between / speed.inside) + ' the pace inside them.';
  }

  return {
    VALUE_FRACTION: VALUE_FRACTION,
    PROFILE_BINS: PROFILE_BINS,
    DEFAULTS: DEFAULTS,
    COLORS: COLORS,
    sanitize: sanitize,
    generate: generate,
    analyze: analyze,
    profileOf: profileOf,
    expandValueArea: expandValueArea,
    valueArea: valueArea,
    speeds: speeds,
    priceChart: priceChart,
    profileChart: profileChart,
    plotBoxFromPath: plotBoxFromPath,
    horizontalBars: horizontalBars,
    binColor: binColor,
    formatPrice: formatPrice,
    formatPace: formatPace,
    formatRatio: formatRatio,
    claimText: claimText,
  };
});
