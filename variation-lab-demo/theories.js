// Four candidate explanations for a toy list that reads layout every row.
// The judge only looks at timings the page measured. It does not pick a winner in advance.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TheoryLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COUNT_MIN = 80;
  const COUNT_MAX = 640;
  const COUNT_DEFAULT = 480;
  const MIN_TRUST_MS = 8;

  const SLOW_SOURCE = [
    'for (let i = 0; i < count; i++) {',
    '  const row = document.createElement("div");',
    '  row.textContent = rowText(i, "medium");',
    '  host.appendChild(row);',
    '  void host.scrollHeight;',
    '}',
  ].join('\n');

  const THEORIES = [
    {
      id: 'nodes',
      title: 'Too many elements',
      hypothesis: 'The list is slow because it creates hundreds of elements.',
      method: 'Time the full row count with one layout read at the end, and a fifth of the rows the same way. Compare both with the loop that reads layout every row.',
    },
    {
      id: 'layout',
      title: 'A layout read every row',
      hypothesis: 'The list is slow because each row reads scrollHeight before the next row is added, so layout runs every time.',
      method: 'Time that loop against the same appends with a single scrollHeight read after the last row.',
    },
    {
      id: 'text',
      title: 'Long row text',
      hypothesis: 'The list is slow because each row is a long string.',
      method: 'Time the slow loop with a short label, then again with a long fictional note. Both still read layout every row.',
    },
    {
      id: 'paint',
      title: 'A heavy shadow on every row',
      hypothesis: 'The list is slow because each row paints a large shadow.',
      method: 'Time rows that carry a large shadow and are flushed once. Compare that with the plain loop that reads layout every row.',
    },
  ];

  function clampCount(n) {
    const value = Math.round(Number(n));
    if (!isFinite(value)) return COUNT_DEFAULT;
    return Math.min(COUNT_MAX, Math.max(COUNT_MIN, value));
  }

  function rowText(i, kind) {
    const id = '#' + String(i + 1).padStart(4, '0');
    if (kind === 'short') return id;
    if (kind === 'long') {
      return id + '  fictional desk  accepted  route=paper  note=this row is long on purpose so a text theory has something to measure';
    }
    return id + '  fictional  accepted  desk';
  }

  function mode(opts) {
    return {
      count: opts.count,
      read: opts.read,
      text: opts.text || 'medium',
      shadow: Boolean(opts.shadow),
    };
  }

  function plan(id, count) {
    const n = clampCount(count);
    const few = Math.max(40, Math.round(n / 5));
    if (id === 'nodes') {
      return [
        {key: 'many', label: n + ' rows, one read', mode: mode({count: n, read: 'once'})},
        {key: 'few', label: few + ' rows, one read', mode: mode({count: few, read: 'once'})},
        {key: 'slow', label: n + ' rows, read every row', mode: mode({count: n, read: 'each'})},
      ];
    }
    if (id === 'layout') {
      return [
        {key: 'each', label: 'Read every row', mode: mode({count: n, read: 'each'})},
        {key: 'once', label: 'One read at the end', mode: mode({count: n, read: 'once'})},
      ];
    }
    if (id === 'text') {
      return [
        {key: 'longEach', label: 'Long text, read every row', mode: mode({count: n, read: 'each', text: 'long'})},
        {key: 'shortEach', label: 'Short text, read every row', mode: mode({count: n, read: 'each', text: 'short'})},
      ];
    }
    if (id === 'paint') {
      return [
        {key: 'decoratedOnce', label: 'Shadow on every row, one read', mode: mode({count: n, read: 'once', shadow: true})},
        {key: 'slow', label: 'Plain rows, read every row', mode: mode({count: n, read: 'each'})},
      ];
    }
    throw new Error('Unknown theory: ' + id);
  }

  function slowMode(count) {
    return mode({count: clampCount(count), read: 'each', text: 'medium', shadow: false});
  }

  function median(values) {
    if (!values.length) throw new Error('median of empty');
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function formatMs(ms) {
    return (Math.round(ms * 10) / 10).toFixed(1) + ' ms';
  }

  function inconclusive(text) {
    return {status: 'inconclusive', text: text};
  }

  function judgeNodes(samples) {
    if (samples.slow < MIN_TRUST_MS) {
      return inconclusive('The slow render finished in under ' + MIN_TRUST_MS + ' ms. Raise the row count and check again.');
    }
    const gap = samples.slow / Math.max(samples.many, 0.05);
    const rounded = Math.round(gap * 10) / 10;
    if (gap >= 3 && samples.many < samples.slow * 0.5) {
      return {
        status: 'not',
        text: 'One layout read over the full list took ' + formatMs(samples.many) + ', against ' + formatMs(samples.slow) + ' when every row reads layout (' + rounded + '×). The element count is not the cliff.',
      };
    }
    if (samples.many >= samples.slow * 0.7) {
      return {
        status: 'explains',
        text: 'One layout read over the full list took ' + formatMs(samples.many) + ', close to the slow render at ' + formatMs(samples.slow) + '. The element count could account for it.',
      };
    }
    return {
      status: 'not',
      text: 'One layout read over the full list took ' + formatMs(samples.many) + ', still under the slow render at ' + formatMs(samples.slow) + '. The element count is not the cliff.',
    };
  }

  function judgeLayout(samples) {
    if (samples.each < MIN_TRUST_MS && samples.once < MIN_TRUST_MS) {
      return inconclusive('Both finishes were under ' + MIN_TRUST_MS + ' ms. Raise the row count and check again.');
    }
    const ratio = samples.each / Math.max(samples.once, 0.05);
    const rounded = Math.round(ratio * 10) / 10;
    if (ratio >= 3) {
      return {
        status: 'explains',
        text: 'Reading layout every row took ' + rounded + '× the same list with one read at the end. That gap is the slow render.',
      };
    }
    return {
      status: 'not',
      text: 'Reading layout every row was ' + rounded + '× one read at the end. That is not a wide gap on this run.',
    };
  }

  function judgeText(samples) {
    if (Math.max(samples.longEach, samples.shortEach) < MIN_TRUST_MS) {
      return inconclusive('Both finishes were under ' + MIN_TRUST_MS + ' ms. Raise the row count and check again.');
    }
    const ratio = samples.longEach / Math.max(samples.shortEach, 0.05);
    const rounded = Math.round(ratio * 10) / 10;
    if (ratio >= 2.5) {
      return {
        status: 'explains',
        text: 'The long rows took ' + rounded + '× the short rows on the same loop. Length accounts for a wide gap.',
      };
    }
    return {
      status: 'not',
      text: 'Long rows took ' + rounded + '× the short rows. Length is not the cliff.',
    };
  }

  function judgePaint(samples) {
    if (samples.slow < MIN_TRUST_MS) {
      return inconclusive('The plain loop finished in under ' + MIN_TRUST_MS + ' ms. Raise the row count and check again.');
    }
    const ratio = samples.slow / Math.max(samples.decoratedOnce, 0.05);
    const rounded = Math.round(ratio * 10) / 10;
    if (ratio >= 3 && samples.decoratedOnce < samples.slow * 0.5) {
      return {
        status: 'not',
        text: 'Shadowed rows, flushed once, stayed about ' + rounded + '× under the plain loop that reads layout every row. The shadow is not the cliff this timer caught.',
      };
    }
    if (samples.decoratedOnce >= samples.slow * 0.7) {
      return {
        status: 'explains',
        text: 'The shadowed rows took about as long as the plain slow loop, so the shadow could account for it.',
      };
    }
    return {
      status: 'not',
      text: 'The shadowed rows do not line up with the plain slow loop.',
    };
  }

  function judge(id, samples) {
    if (id === 'nodes') return judgeNodes(samples);
    if (id === 'layout') return judgeLayout(samples);
    if (id === 'text') return judgeText(samples);
    if (id === 'paint') return judgePaint(samples);
    throw new Error('Unknown theory: ' + id);
  }

  function summary(results) {
    if (!results.length) return '';
    const lined = results.filter(function (item) { return item.status === 'explains'; });
    const unclear = results.filter(function (item) { return item.status === 'inconclusive'; });
    if (unclear.length === results.length) return 'The runs finished too quickly to trust. Raise the row count.';
    if (!lined.length) return 'None of the checks lined up with a wide gap.';
    return 'Lined up: ' + lined.map(function (item) { return item.title; }).join(', ') + '.';
  }

  return {
    COUNT_MIN: COUNT_MIN,
    COUNT_MAX: COUNT_MAX,
    COUNT_DEFAULT: COUNT_DEFAULT,
    MIN_TRUST_MS: MIN_TRUST_MS,
    SLOW_SOURCE: SLOW_SOURCE,
    THEORIES: THEORIES,
    clampCount: clampCount,
    rowText: rowText,
    plan: plan,
    slowMode: slowMode,
    median: median,
    formatMs: formatMs,
    judge: judge,
    summary: summary,
  };
});
