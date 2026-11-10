// Schematic paths for the last three US midterms, using only the figures
// in @dealerdefi's post. Each path is two straight segments: election day
// to the stated low, then the low to the one-year-after percent.
// Day 365 is this page's stand-in for "a year". It is not a figure from the post.
// Nothing here is a price history or a forecast.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MidtermBtc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IMPLIED_START = 78000;
  const YEAR_DAYS = 365;
  const START_MAX = 10000000;

  const SCENARIOS = [
    { id: '2014', year: 2014, drawdown: -0.48, days: 71, illustratedLow: '~$40.5K', yearReturn: 0.24 },
    { id: '2018', year: 2018, drawdown: -0.51, days: 39, illustratedLow: '~$38.4K', yearReturn: 0.45 },
    { id: '2022', year: 2022, drawdown: -0.15, days: 13, illustratedLow: '~$66.3K', yearReturn: 0.92 },
  ];

  const COLORS = {
    '2014': '#3f7f7a',
    '2018': '#1d4a34',
    '2022': '#1e3a5f',
  };

  function scenario(id) {
    for (let i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return null;
  }

  function sanitizeStart(value) {
    const text = typeof value === 'number' ? String(value) : String(value == null ? '' : value);
    const n = Number(text.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > START_MAX) return null;
    return n;
  }

  function pathPrice(item, day, start) {
    const price = sanitizeStart(start);
    if (price === null || !item) return null;
    const d = Number(day);
    if (!Number.isFinite(d) || d <= 0) return price;
    if (d >= YEAR_DAYS) return price * (1 + item.yearReturn);
    const low = price * (1 + item.drawdown);
    if (d <= item.days) return price + (low - price) * (d / item.days);
    return low + (price * (1 + item.yearReturn) - low) * ((d - item.days) / (YEAR_DAYS - item.days));
  }

  function phase(item, day) {
    const d = Math.max(0, Math.min(YEAR_DAYS, Math.round(Number(day) || 0)));
    if (d <= 0) return 'election day';
    if (d < item.days) return 'drawing down';
    if (d === item.days) return 'low';
    if (d < YEAR_DAYS) return 'after the low';
    return 'one year after';
  }

  function roundChart(n, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
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
    const lo = Math.max(0, min - span * 0.12);
    const hi = max + span * 0.16;
    let a = Math.floor(lo);
    let b = Math.ceil(hi);
    if (b <= a) b = a + 1;
    return { min: a, max: b };
  }

  function visibleScenarios(ids) {
    const wanted = new Set(ids || []);
    return SCENARIOS.filter(function (item) { return wanted.has(item.id); });
  }

  function chartSource(start, ids) {
    const price = sanitizeStart(start);
    const scenarios = visibleScenarios(ids);
    if (price === null || !scenarios.length) return null;
    const days = [];
    for (let d = 0; d <= YEAR_DAYS; d++) days.push(d);
    const scale = price >= 1000 ? 1000 : 1;
    const digits = scale === 1000 ? 2 : (price >= 100 ? 0 : 2);
    const yTitle = scale === 1000 ? 'USD, thousands' : 'USD';
    const columns = scenarios.map(function (item) {
      return days.map(function (day) { return roundChart(pathPrice(item, day, price) / scale, digits); });
    });
    const flat = [];
    columns.forEach(function (column) {
      column.forEach(function (value) { flat.push(value); });
    });
    const bounds = axisBounds(flat);
    const lines = [
      'xychart-beta',
      '    title "Schematic paths, not price history"',
      '    x-axis "days after election day" [' + days.join(', ') + ']',
      '    y-axis "' + yTitle + '" ' + bounds.min + ' --> ' + bounds.max,
    ];
    scenarios.forEach(function (item, index) {
      lines.push('    line "' + item.year + '" [' + columns[index].join(', ') + ']');
    });
    return {
      source: lines.join('\n'),
      scenarios: scenarios,
      bounds: bounds,
      start: price,
      days: YEAR_DAYS,
    };
  }

  function hover(start, day, ids) {
    const price = sanitizeStart(start);
    if (price === null) return null;
    const d = Math.max(0, Math.min(YEAR_DAYS, Math.round(Number(day) || 0)));
    const rows = visibleScenarios(ids).map(function (item) {
      return {
        id: item.id,
        year: item.year,
        day: d,
        price: pathPrice(item, d, price),
        phase: phase(item, d),
        color: COLORS[item.id],
      };
    });
    return { day: d, start: price, rows: rows };
  }

  function formatPercent(fraction) {
    const pct = Math.round(fraction * 100);
    if (pct > 0) return '+' + pct + '%';
    if (pct < 0) return '\u2212' + Math.abs(pct) + '%';
    return '0%';
  }

  function formatUsd(n) {
    const abs = Math.abs(n);
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  }

  return {
    IMPLIED_START: IMPLIED_START,
    YEAR_DAYS: YEAR_DAYS,
    START_MAX: START_MAX,
    SCENARIOS: SCENARIOS,
    COLORS: COLORS,
    scenario: scenario,
    sanitizeStart: sanitizeStart,
    pathPrice: pathPrice,
    phase: phase,
    chartSource: chartSource,
    hover: hover,
    formatPercent: formatPercent,
    formatUsd: formatUsd,
  };
});
