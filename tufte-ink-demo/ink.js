// Example data and the ink model for the Tufte lab.
// Cups poured at four harbor stalls. The numbers are made up.
// Nothing here is a real shop.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TufteInk = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SERIES = [
    { id: 'north', name: 'North quay', values: [42, 46, 44, 51, 55, 53, 61, 66, 64, 72, 78, 84] },
    { id: 'pier', name: 'Pier shed', values: [36, 38, 35, 40, 39, 44, 42, 47, 46, 50, 49, 53] },
    { id: 'rope', name: 'Rope walk', values: [22, 29, 24, 33, 28, 36, 31, 40, 37, 43, 39, 46] },
    { id: 'customs', name: 'Old customs', values: [71, 68, 70, 66, 64, 67, 61, 59, 62, 56, 54, 51] },
  ];

  const LOUD = ['#d94f30', '#e0a11b', '#7b4b94', '#2f6fbf'];
  const QUIET = ['#1d4a34', '#3f7f7a', '#14213d', '#8a5a2a'];
  const NOTE = 'Example data. Cups poured at four harbor stalls, twelve weeks of a made-up spring. Not a shop.';

  const STEPS = [
    {
      id: 'junk',
      title: 'Chartjunk',
      text: 'A heavy grid, a filled ground, extruded bars, a moiré hatch, a boxed legend, and a number on every bar.',
    },
    {
      id: 'nondata',
      title: 'Erase non-data ink',
      text: 'The grid, the ground, the border, the extrusion, and the hatch go. They do not change if a cup count changes.',
    },
    {
      id: 'redundant',
      title: 'Erase redundant data ink',
      text: 'The height already says the number. The fill and the digit on each bar repeat it, so they go. A stem is enough. The legend is still there.',
    },
    {
      id: 'labels',
      title: 'Direct labels',
      text: 'The names sit on the marks. The legend box, and the swatches that repeated the colors, are gone.',
    },
    {
      id: 'range',
      title: 'Range-frame axes',
      text: 'A bar’s length needs zero, so this step is a line. The frame stops at the smallest and largest counts, 22 and 84.',
    },
    {
      id: 'ratio',
      title: 'Maximize the data-ink ratio',
      text: 'Pele draws the four lines. The frame, the names, and the endpoint counts stay. The rest of the chrome does not.',
    },
    {
      id: 'multiples',
      title: 'Small multiples',
      text: 'Four frames, one scale, the same line weight. The frames are drawn on this page. Four short axes cost some ink, so the ratio eases, and the comparison is why.',
    },
    {
      id: 'spark',
      title: 'Sparkline',
      text: 'The same four lines, set into a sentence at the size of the words. Sparklines come from Beautiful Evidence, after the book this skill is built on.',
    },
  ];

  function flagsForStep(id) {
    const index = STEPS.findIndex(function (step) { return step.id === id; });
    const n = index < 0 ? 0 : index;
    return {
      eraseNonData: n >= 1,
      eraseRedundant: n >= 2,
      directLabels: n >= 3,
      rangeFrame: n >= 4,
      thinLines: n >= 5,
      multiples: n >= 6,
      sparkline: n >= 7,
    };
  }

  function sameFlags(a, b) {
    const keys = ['eraseNonData', 'eraseRedundant', 'directLabels', 'rangeFrame', 'thinLines', 'multiples', 'sparkline'];
    return keys.every(function (key) { return !!a[key] === !!b[key]; });
  }

  function stepForFlags(flags) {
    for (let i = 0; i < STEPS.length; i++) {
      if (sameFlags(flags, flagsForStep(STEPS[i].id))) return STEPS[i].id;
    }
    return null;
  }

  function allValues() {
    const values = [];
    SERIES.forEach(function (series) {
      series.values.forEach(function (value) { values.push(value); });
    });
    return values;
  }

  function extent(values) {
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    return { min: min, max: max };
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  function yAt(value, plot, y0, y1) {
    const t = (value - y0) / (y1 - y0 || 1);
    return round(plot.y + plot.h * (1 - t));
  }

  function colorsFor(flags) {
    return flags.eraseNonData ? QUIET : LOUD;
  }

  function boundsFor(flags) {
    const span = extent(allValues());
    if (flags.rangeFrame || flags.multiples) {
      return { x0: 1, x1: 12, y0: span.min, y1: span.max };
    }
    return { x0: 1, x1: 12, y0: 0, y1: 100 };
  }

  function peleSource(flags) {
    const bounds = boundsFor(Object.assign({}, flags, { rangeFrame: flags.rangeFrame || flags.thinLines }));
    const lines = SERIES.map(function (series) {
      return '    line "' + series.name + '" [' + series.values.join(', ') + ']';
    });
    return [
      '%%{init: {"xyChart": {"width": 720, "height": 420, "showTitle": false}}}%%',
      'xychart-beta',
      '    x-axis "week" ' + bounds.x0 + ' --> ' + bounds.x1,
      '    y-axis "cups" ' + bounds.y0 + ' --> ' + bounds.y1,
    ].concat(lines).join('\n');
  }

  function hatchLines(x, y, w, h, step) {
    const lines = [];
    function push(pts) {
      const uniq = [];
      pts.forEach(function (p) {
        if (!uniq.some(function (q) { return Math.abs(q[0] - p[0]) < 0.05 && Math.abs(q[1] - p[1]) < 0.05; })) uniq.push(p);
      });
      if (uniq.length >= 2) lines.push([
        [round(uniq[0][0]), round(uniq[0][1])],
        [round(uniq[1][0]), round(uniq[1][1])],
      ]);
    }
    const yb = y + h;
    const xr = x + w;
    for (let c = y - xr; c <= yb - x + 0.01; c += step) {
      const pts = [];
      let yy = c + x;
      if (yy >= y && yy <= yb) pts.push([x, yy]);
      yy = c + xr;
      if (yy >= y && yy <= yb) pts.push([xr, yy]);
      let xx = y - c;
      if (xx >= x && xx <= xr) pts.push([xx, y]);
      xx = yb - c;
      if (xx >= x && xx <= xr) pts.push([xx, yb]);
      push(pts);
    }
    for (let c = x + y; c <= xr + yb + 0.01; c += step) {
      const pts = [];
      let yy = c - x;
      if (yy >= y && yy <= yb) pts.push([x, yy]);
      yy = c - xr;
      if (yy >= y && yy <= yb) pts.push([xr, yy]);
      let xx = c - y;
      if (xx >= x && xx <= xr) pts.push([xx, y]);
      xx = c - yb;
      if (xx >= x && xx <= xr) pts.push([xx, yb]);
      push(pts);
    }
    return lines;
  }

  function shoelace(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const next = points[(i + 1) % points.length];
      sum += points[i][0] * next[1] - next[0] * points[i][1];
    }
    return Math.abs(sum) / 2;
  }

  function markArea(mark) {
    if (!mark) return 0;
    if (mark.kind === 'rect') {
      if (mark.fill && mark.fill !== 'none') return Math.abs(mark.w * mark.h);
      const sw = mark.sw || 1;
      return 2 * (Math.abs(mark.w) + Math.abs(mark.h)) * sw;
    }
    if (mark.kind === 'line') {
      return Math.hypot(mark.x2 - mark.x, mark.y2 - mark.y) * (mark.sw || 1);
    }
    if (mark.kind === 'polyline') {
      let len = 0;
      const pts = mark.points || [];
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return len * (mark.sw || 1);
    }
    if (mark.kind === 'polygon') return shoelace(mark.points || []);
    if (mark.kind === 'hatch') {
      let len = 0;
      (mark.lines || []).forEach(function (line) {
        len += Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]);
      });
      return len * (mark.sw || 1);
    }
    if (mark.kind === 'text') {
      const size = mark.size || 12;
      return String(mark.text || '').length * size * 0.45 * size * 0.7;
    }
    if (mark.kind === 'svgpath') return (mark.length || 0) * (mark.sw || 1);
    return 0;
  }

  function measure(marks) {
    const totals = { data: 0, redundant: 0, nondata: 0 };
    (marks || []).forEach(function (mark) {
      const bucket = totals[mark.role] != null ? mark.role : 'nondata';
      totals[bucket] += markArea(mark);
    });
    const total = totals.data + totals.redundant + totals.nondata;
    return {
      data: totals.data,
      redundant: totals.redundant,
      nondata: totals.nondata,
      total: total,
      ratio: total > 0 ? totals.data / total : 0,
    };
  }

  function mainPlot(flags) {
    const labelRoom = flags.directLabels ? 118 : 28;
    return { x: 64, y: 46, w: 760 - 64 - labelRoom, h: 292 };
  }

  function linePoints(values, plot, y0, y1) {
    return values.map(function (value, index) {
      const x = plot.x + (plot.w * index) / (values.length - 1);
      return [round(x), yAt(value, plot, y0, y1)];
    });
  }

  function pushFrame(marks, plot, flags, y0, y1) {
    if (!flags.eraseNonData) {
      marks.push({ role: 'nondata', kind: 'rect', x: plot.x - 8, y: plot.y - 8, w: plot.w + 16, h: plot.h + 28, fill: '#efe4cf', stroke: 'none' });
      marks.push({ role: 'nondata', kind: 'rect', x: plot.x - 14, y: plot.y - 14, w: plot.w + 28, h: plot.h + 42, fill: 'none', stroke: '#1a1a1a', sw: 3 });
      const grid = [];
      for (let value = y0; value <= y1; value += 10) {
        const y = yAt(value, plot, y0, y1);
        grid.push([[plot.x, y], [round(plot.x + plot.w), y]]);
      }
      for (let i = 0; i < 12; i++) {
        const x = round(plot.x + (plot.w * i) / 11);
        grid.push([[x, plot.y], [x, round(plot.y + plot.h)]]);
      }
      marks.push({ role: 'nondata', kind: 'hatch', lines: grid, sw: 1.4 });
      marks.push({
        role: 'nondata', kind: 'text', x: plot.x + 8, y: plot.y + 18,
        text: 'HARBOR CUPS!!', size: 18, anchor: 'start', fill: '#9a3412',
      });
    }
    if (flags.rangeFrame) {
      const bottom = round(plot.y + plot.h);
      const right = round(plot.x + plot.w);
      marks.push({ role: 'nondata', kind: 'line', x: plot.x, y: plot.y, x2: plot.x, y2: bottom, sw: 1.25, stroke: '#14213d' });
      marks.push({ role: 'nondata', kind: 'line', x: plot.x, y: bottom, x2: right, y2: bottom, sw: 1.25, stroke: '#14213d' });
      marks.push({ role: 'nondata', kind: 'text', x: plot.x - 8, y: plot.y + 4, text: String(y1), size: 12, anchor: 'end', fill: '#5c6570' });
      marks.push({ role: 'nondata', kind: 'text', x: plot.x - 8, y: bottom, text: String(y0), size: 12, anchor: 'end', fill: '#5c6570' });
      marks.push({ role: 'nondata', kind: 'text', x: plot.x, y: bottom + 16, text: '1', size: 12, anchor: 'start', fill: '#5c6570' });
      marks.push({ role: 'nondata', kind: 'text', x: right, y: bottom + 16, text: '12', size: 12, anchor: 'end', fill: '#5c6570' });
      return;
    }
    const bottom = round(plot.y + plot.h);
    const right = round(plot.x + plot.w);
    marks.push({
      role: 'nondata', kind: 'rect', x: plot.x, y: plot.y, w: plot.w, h: plot.h,
      fill: 'none', stroke: '#14213d', sw: flags.eraseNonData ? 1 : 2,
    });
    for (let value = 0; value <= 100; value += 20) {
      marks.push({
        role: 'nondata', kind: 'text', x: plot.x - 8, y: yAt(value, plot, 0, 100) + 4,
        text: String(value), size: 11, anchor: 'end', fill: '#5c6570',
      });
    }
    for (let i = 0; i < 12; i++) {
      const x = round(plot.x + (plot.w * i) / 11);
      marks.push({
        role: 'nondata', kind: 'text', x: x, y: bottom + 16, text: String(i + 1),
        size: 11, anchor: 'middle', fill: '#5c6570',
      });
    }
    marks.push({
      role: 'nondata', kind: 'text', x: (plot.x + right) / 2, y: bottom + 32,
      text: 'week', size: 12, anchor: 'middle', fill: '#5c6570',
    });
  }

  function pushLegend(marks, flags, colors) {
    if (flags.directLabels) return;
    const x = 560;
    const y = 58;
    marks.push({ role: 'nondata', kind: 'rect', x: x, y: y, w: 176, h: 112, fill: '#fffdf8', stroke: '#14213d', sw: 1.5 });
    SERIES.forEach(function (series, index) {
      const row = y + 18 + index * 24;
      marks.push({ role: 'redundant', kind: 'rect', x: x + 10, y: row - 8, w: 18, h: 10, fill: colors[index], stroke: 'none' });
      marks.push({
        role: 'data', kind: 'text', x: x + 36, y: row, text: series.name,
        size: 13, anchor: 'start', fill: '#14213d',
      });
    });
  }

  function pushNames(marks, flags, colors, pointsBySeries) {
    if (!flags.directLabels) return;
    const spots = pointsBySeries.map(function (points, index) {
      const last = points[points.length - 1];
      return { index: index, x: last[0] + 8, y: last[1] + 4 };
    });
    spots.sort(function (a, b) { return a.y - b.y; });
    let previous = -1000;
    spots.forEach(function (spot) {
      if (spot.y < previous + 15) spot.y = previous + 15;
      previous = spot.y;
      marks.push({
        role: 'data', kind: 'text', x: spot.x, y: spot.y,
        text: SERIES[spot.index].name, size: 13, anchor: 'start', fill: colors[spot.index],
      });
    });
  }

  function buildBars(flags) {
    const plot = mainPlot(flags);
    const colors = colorsFor(flags);
    const marks = [];
    const y0 = 0;
    const y1 = 100;
    pushFrame(marks, plot, flags, y0, y1);
    const slot = plot.w / 12;
    const barW = Math.min(11, (slot - 8) / 4.3);
    const depth = 11;
    SERIES.forEach(function (series, s) {
      series.values.forEach(function (value, i) {
        const x = round(plot.x + i * slot + (slot - barW * 4) / 2 + s * barW);
        const top = yAt(value, plot, y0, y1);
        const base = yAt(0, plot, y0, y1);
        const h = Math.max(0, round(base - top));
        const w = round(barW - 1.2);
        if (!flags.eraseRedundant && h > 0) {
          marks.push({ role: 'redundant', kind: 'rect', x: x, y: top, w: w, h: h, fill: colors[s], stroke: 'none' });
          if (!flags.eraseNonData && h > 2) {
            marks.push({
              role: 'nondata', kind: 'polygon', fill: '#6b6258',
              points: [[x + w, top], [x + w + depth, top - depth], [x + w + depth, top + h - depth], [x + w, top + h]],
            });
            marks.push({
              role: 'nondata', kind: 'polygon', fill: '#efe6d4',
              points: [[x, top], [x + depth, top - depth], [x + w + depth, top - depth], [x + w, top]],
            });
            const lines = hatchLines(x, top, w, h, 7);
            if (lines.length) marks.push({ role: 'nondata', kind: 'hatch', lines: lines, sw: 0.7, stroke: 'rgba(20,16,12,0.55)' });
          }
          marks.push({
            role: 'redundant', kind: 'text', x: x + w / 2, y: top - 4,
            text: String(value), size: 9, anchor: 'middle', fill: '#3f2a22',
          });
        }
        if (flags.eraseRedundant) {
          const cx = round(x + w / 2);
          marks.push({
            role: 'data', kind: 'line', x: cx, y: top, x2: cx, y2: base,
            sw: 2.4, stroke: colors[s], via: 'series',
          });
        } else if (h > 0) {
          marks.push({
            role: 'data', kind: 'line', x: x, y: top, x2: round(x + w), y2: top,
            sw: 2.2, stroke: '#1a120c', via: 'series',
          });
        }
      });
    });
    pushLegend(marks, flags, colors);
    if (flags.directLabels) {
      const ends = SERIES.map(function (series, s) {
        const i = series.values.length - 1;
        const x = plot.x + i * slot + (slot - barW * 4) / 2 + s * barW;
        const top = yAt(series.values[i], plot, y0, y1);
        return [[round(x + barW), top]];
      });
      pushNames(marks, flags, colors, ends);
    }
    return {
      mode: 'bars',
      width: 760,
      height: 400,
      marks: marks,
      pele: null,
      spark: [],
      colors: colors,
    };
  }

  function buildLines(flags) {
    const plot = mainPlot(flags);
    const span = extent(allValues());
    const y0 = flags.rangeFrame ? span.min : 0;
    const y1 = flags.rangeFrame ? span.max : 100;
    const colors = QUIET;
    const marks = [];
    pushFrame(marks, plot, flags, y0, y1);
    const sw = flags.thinLines ? 1.7 : 2.6;
    const pointsBySeries = SERIES.map(function (series) {
      return linePoints(series.values, plot, y0, y1);
    });
    pointsBySeries.forEach(function (points, index) {
      marks.push({
        role: 'data', kind: 'polyline', points: points, sw: sw,
        stroke: colors[index], via: 'series', fill: 'none',
      });
    });
    if (flags.directLabels) pushNames(marks, flags, colors, pointsBySeries);
    else pushLegend(marks, flags, colors);
    const pele = flags.thinLines ? peleSource(flags) : null;
    return {
      mode: 'lines',
      width: 760,
      height: 400,
      marks: marks,
      pele: pele,
      spark: [],
      colors: colors,
      bounds: { y0: y0, y1: y1 },
    };
  }

  function buildMultiples(flags) {
    const colors = QUIET;
    const span = extent(allValues());
    const y0 = flags.rangeFrame || flags.thinLines || flags.multiples ? span.min : 0;
    const y1 = flags.rangeFrame || flags.thinLines || flags.multiples ? span.max : 100;
    const marks = [];
    const originX = 36;
    const originY = 28;
    const panelW = 330;
    const panelH = 168;
    const gapX = 28;
    const gapY = 36;
    SERIES.forEach(function (series, index) {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const plot = {
        x: originX + col * (panelW + gapX),
        y: originY + row * (panelH + gapY),
        w: panelW - 78,
        h: panelH - 36,
      };
      const bottom = round(plot.y + plot.h);
      const right = round(plot.x + plot.w);
      if (!flags.eraseNonData) {
        marks.push({ role: 'nondata', kind: 'rect', x: plot.x - 6, y: plot.y - 6, w: plot.w + 12, h: plot.h + 16, fill: '#efe4cf', stroke: 'none' });
      }
      marks.push({ role: 'nondata', kind: 'line', x: plot.x, y: plot.y, x2: plot.x, y2: bottom, sw: 1, stroke: '#14213d' });
      marks.push({ role: 'nondata', kind: 'line', x: plot.x, y: bottom, x2: right, y2: bottom, sw: 1, stroke: '#14213d' });
      const points = linePoints(series.values, plot, y0, y1);
      marks.push({
        role: 'data', kind: 'polyline', points: points, sw: flags.thinLines ? 1.6 : 2.2,
        stroke: colors[index], via: 'series', fill: 'none',
      });
      const last = points[points.length - 1];
      if (flags.directLabels || flags.multiples) {
        marks.push({
          role: 'data', kind: 'text', x: last[0] + 6, y: last[1] + 4,
          text: series.name, size: 13, anchor: 'start', fill: colors[index],
        });
      }
      marks.push({ role: 'nondata', kind: 'text', x: plot.x - 4, y: plot.y + 4, text: String(y1), size: 11, anchor: 'end', fill: '#5c6570' });
      marks.push({ role: 'nondata', kind: 'text', x: plot.x - 4, y: bottom, text: String(y0), size: 11, anchor: 'end', fill: '#5c6570' });
    });
    return {
      mode: 'multiples',
      width: 760,
      height: 430,
      marks: marks,
      pele: null,
      spark: [],
      colors: colors,
      bounds: { y0: y0, y1: y1 },
    };
  }

  function buildSpark() {
    const colors = QUIET;
    const marks = [];
    const runs = [];
    let cursor = 8;
    const y = 28;
    SERIES.forEach(function (series, index) {
      const label = series.name + ' ';
      runs.push({ type: 'text', text: label });
      marks.push({ role: 'data', kind: 'text', x: cursor, y: y, text: label, size: 16, anchor: 'start', fill: '#14213d' });
      cursor += label.length * 7.4;
      const plot = { x: cursor, y: 8, w: 78, h: 22 };
      const span = extent(allValues());
      const points = linePoints(series.values, plot, span.min, span.max);
      marks.push({
        role: 'data', kind: 'polyline', points: points, sw: 1.4,
        stroke: colors[index], via: 'spark', fill: 'none',
      });
      const end = points[points.length - 1];
      marks.push({ role: 'data', kind: 'line', x: end[0], y: end[1], x2: end[0] + 0.1, y2: end[1], sw: 3.2, stroke: colors[index] });
      runs.push({ type: 'line', index: index, points: points, color: colors[index] });
      cursor += 86;
      const tail = series.values[0] + '–' + series.values[series.values.length - 1] + (index === SERIES.length - 1 ? '.' : ', ');
      runs.push({ type: 'text', text: tail });
      marks.push({ role: 'data', kind: 'text', x: cursor, y: y, text: tail, size: 16, anchor: 'start', fill: '#243044' });
      cursor += tail.length * 7.6;
    });
    return { width: Math.max(760, Math.ceil(cursor + 8)), height: 46, marks: marks, runs: runs };
  }

  function build(flags) {
    const f = Object.assign({
      eraseNonData: false,
      eraseRedundant: false,
      directLabels: false,
      rangeFrame: false,
      thinLines: false,
      multiples: false,
      sparkline: false,
    }, flags || {});
    let scene;
    if (f.multiples) scene = buildMultiples(f);
    else if (f.thinLines || f.rangeFrame) scene = buildLines(f);
    else scene = buildBars(f);
    const spark = f.sparkline ? buildSpark() : null;
    scene.spark = spark ? spark.marks : [];
    scene.sparkRuns = spark ? spark.runs : [];
    scene.sparkSize = spark ? { width: spark.width, height: spark.height } : null;
    scene.flags = f;
    scene.note = NOTE;
    return scene;
  }

  function sceneMarks(scene) {
    return (scene.marks || []).concat(scene.spark || []);
  }

  return {
    SERIES: SERIES,
    NOTE: NOTE,
    STEPS: STEPS,
    LOUD: LOUD,
    QUIET: QUIET,
    flagsForStep: flagsForStep,
    stepForFlags: stepForFlags,
    allValues: allValues,
    extent: extent,
    boundsFor: boundsFor,
    peleSource: peleSource,
    markArea: markArea,
    measure: measure,
    build: build,
    buildSpark: buildSpark,
    sceneMarks: sceneMarks,
    hatchLines: hatchLines,
  };
});
