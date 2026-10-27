// Ordered dithering, a single threshold, white noise, and Floyd–Steinberg.
// The matrices are the usual Bayer tiles. This is not dithercn and not Paper Shaders.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DitherBench = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FIELD_W = 240;
  const FIELD_H = 144;
  const CELL_SIZES = [2, 3, 4, 6, 8];
  const LIGHT = { x: -0.45, y: -0.55, z: 0.7 };

  const SOURCES = [
    { id: 'sphere', label: 'Lit sphere', moves: false },
    { id: 'gradient', label: 'Gradient', moves: false },
    { id: 'swirl', label: 'Swirl', moves: true },
    { id: 'globe', label: 'Shaded globe', moves: true },
  ];

  const MODES = [
    { id: 'threshold', label: 'Threshold' },
    { id: 'bayer2', label: 'Bayer 2x2' },
    { id: 'bayer4', label: 'Bayer 4x4' },
    { id: 'bayer8', label: 'Bayer 8x8' },
    { id: 'random', label: 'Random' },
    { id: 'floyd', label: 'Floyd–Steinberg' },
  ];

  const PALETTES = [
    { id: 'newsprint', name: 'Newsprint', ink: '#1c1914', paper: '#f3efe6' },
    { id: 'cyan-rose', name: 'Cyan on rose', ink: '#0e6a74', paper: '#f4c9cf' },
    { id: 'acid', name: 'Acid on black', ink: '#d6ff4a', paper: '#14160c' },
    { id: 'ember', name: 'Ember on cream', ink: '#c2410c', paper: '#f6f0e4' },
  ];

  const FLOYD = [
    { dx: 1, dy: 0, num: 7, den: 16 },
    { dx: -1, dy: 1, num: 3, den: 16 },
    { dx: 0, dy: 1, num: 5, den: 16 },
    { dx: 1, dy: 1, num: 1, den: 16 },
  ];

  const SOURCE_IDS = SOURCES.map(function (item) { return item.id; });
  const MODE_IDS = MODES.map(function (item) { return item.id; });

  function bayer(n) {
    if (n !== 2 && n !== 4 && n !== 8) return null;
    let matrix = [
      [0, 2],
      [3, 1],
    ];
    while (matrix.length < n) {
      const half = matrix.length;
      const next = [];
      for (let y = 0; y < half * 2; y += 1) {
        next.push(new Array(half * 2).fill(0));
      }
      for (let y = 0; y < half; y += 1) {
        for (let x = 0; x < half; x += 1) {
          const value = matrix[y][x];
          next[y][x] = 4 * value;
          next[y][x + half] = 4 * value + 2;
          next[y + half][x] = 4 * value + 3;
          next[y + half][x + half] = 4 * value + 1;
        }
      }
      matrix = next;
    }
    return matrix;
  }

  function modeInfo(mode) {
    if (mode === 'bayer2') return { kind: 'bayer', n: 2, matrix: bayer(2) };
    if (mode === 'bayer4') return { kind: 'bayer', n: 4, matrix: bayer(4) };
    if (mode === 'bayer8') return { kind: 'bayer', n: 8, matrix: bayer(8) };
    if (mode === 'threshold') return { kind: 'threshold', n: 1, matrix: null };
    if (mode === 'random') return { kind: 'random', n: 0, matrix: null };
    if (mode === 'floyd') return { kind: 'floyd', n: 0, matrix: null };
    return null;
  }

  function hash01(x, y, frame, seed) {
    let n = (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(frame | 0, 1442695041) +
      Math.imul((seed == null ? 1 : seed) | 0, 1274126177)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 2246822519) >>> 0;
    return (n >>> 8) / 16777216;
  }

  function thresholdAt(mode, x, y, frame, seed) {
    const info = modeInfo(mode);
    if (!info) return null;
    if (info.kind === 'threshold' || info.kind === 'floyd') return 0.5;
    if (info.kind === 'random') return hash01(x, y, frame, seed);
    const value = info.matrix[y % info.n][x % info.n];
    return (value + 0.5) / (info.n * info.n);
  }

  function matrixValue(mode, x, y) {
    const info = modeInfo(mode);
    if (!info || info.kind !== 'bayer') return null;
    return info.matrix[y % info.n][x % info.n];
  }

  function decide(brightness, threshold) {
    return brightness > threshold ? 'paper' : 'ink';
  }

  function sample(source, x, y, width, height, time) {
    if (SOURCE_IDS.indexOf(source) === -1) return null;
    if (!(width > 0) || !(height > 0)) return null;
    const u = (x + 0.5) / width;
    const v = (y + 0.5) / height;
    const t = Number(time) || 0;
    if (source === 'gradient') return u;
    if (source === 'swirl') {
      const sx = u - 0.5;
      const sy = (v - 0.5) * (height / width);
      const angle = Math.atan2(sy, sx);
      const radius = Math.hypot(sx, sy);
      return 0.5 + 0.5 * Math.sin(angle * 6 + radius * 28 - t * 1.6);
    }
    const dx = (u - 0.5) * width;
    const dy = (v - 0.5) * height;
    const radius = Math.min(width, height) * 0.46;
    const r2 = dx * dx + dy * dy;
    if (r2 > radius * radius) return 1;
    const nx = dx / radius;
    const ny = dy / radius;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    if (source === 'sphere') {
      const len = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
      const ndotl = Math.max(0, (nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / len);
      return 0.08 + 0.92 * ndotl;
    }
    const lon = Math.atan2(nx, nz) + t * 0.65;
    const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
    const day = 0.5 + 0.5 * Math.cos(lon);
    const equator = Math.exp(-Math.pow(lat * 7, 2));
    return Math.max(0, Math.min(1, day * 0.82 + equator * 0.18));
  }

  function samplesFrom(source, width, height, time) {
    if (sample(source, 0, 0, width, height, time) == null) return null;
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        out[y * width + x] = sample(source, x, y, width, height, time);
      }
    }
    return out;
  }

  function gridFor(cell) {
    if (CELL_SIZES.indexOf(cell) === -1) return null;
    return {
      cell: cell,
      width: FIELD_W / cell,
      height: FIELD_H / cell,
    };
  }

  function paint(samples, width, height, mode, frame, seed) {
    const info = modeInfo(mode);
    if (!info) return { ok: false, error: 'Unknown mode.' };
    if (!samples || samples.length !== width * height || width < 1 || height < 1) {
      return { ok: false, error: 'The sample grid does not match.' };
    }
    const cells = new Array(width * height);
    if (info.kind === 'floyd') {
      const buf = Float32Array.from(samples);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const source = samples[index];
          const adjusted = buf[index];
          const tone = decide(adjusted, 0.5);
          const neu = tone === 'paper' ? 1 : 0;
          const error = adjusted - neu;
          FLOYD.forEach(function (weight) {
            const nx = x + weight.dx;
            const ny = y + weight.dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
            buf[ny * width + nx] += error * (weight.num / weight.den);
          });
          cells[index] = {
            x: x,
            y: y,
            source: source,
            adjusted: adjusted,
            threshold: 0.5,
            tone: tone,
            error: error,
            matrixValue: null,
            frame: frame | 0,
          };
        }
      }
      return { ok: true, cells: cells };
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const source = samples[index];
        const threshold = thresholdAt(mode, x, y, frame, seed);
        cells[index] = {
          x: x,
          y: y,
          source: source,
          adjusted: source,
          threshold: threshold,
          tone: decide(source, threshold),
          error: 0,
          matrixValue: matrixValue(mode, x, y),
          frame: frame | 0,
        };
      }
    }
    return { ok: true, cells: cells };
  }

  function fmt(value) {
    const rounded = Math.round(value * 1000) / 1000;
    return rounded.toFixed(3);
  }

  function explain(cell, mode) {
    if (!cell || !modeInfo(mode)) return 'No cell.';
    const source = fmt(cell.source);
    const threshold = fmt(cell.threshold);
    const way = (mode === 'floyd' ? cell.adjusted : cell.source) > cell.threshold ? 'above' : 'at or below';
    if (mode === 'floyd') {
      let outside = '';
      if (cell.adjusted < 0 || cell.adjusted > 1) {
        outside = ' The value sits outside 0 to 1 because earlier error was added. It is not clamped.';
      }
      return 'Source ' + source + '. After incoming error the cell is ' + fmt(cell.adjusted) + ', which is ' + way + ' 1/2, so it is ' + cell.tone + '.' + outside + ' The leftover ' + fmt(cell.error) + ' is split 7/16 right, 3/16 down-left, 5/16 down, and 1/16 down-right.';
    }
    if (mode === 'random') {
      return 'Source ' + source + '. This cell draws its own threshold, ' + threshold + ', from a hash of x, y, and frame ' + cell.frame + '. The source is ' + way + ' it, so the cell is ' + cell.tone + '.';
    }
    if (mode === 'threshold') {
      return 'Source ' + source + '. The single threshold is 1/2. The source is ' + way + ' it, so the cell is ' + cell.tone + '.';
    }
    const n = modeInfo(mode).n;
    return 'Source ' + source + '. Bayer ' + n + 'x' + n + ' value ' + cell.matrixValue + ' sits on this cell. Its threshold is ' + threshold + ', which is (value + 1/2) / ' + (n * n) + '. The source is ' + way + ' the threshold, so the cell is ' + cell.tone + '.';
  }

  function palette(id) {
    for (let i = 0; i < PALETTES.length; i += 1) {
      if (PALETTES[i].id === id) return PALETTES[i];
    }
    return null;
  }

  return {
    FIELD_W: FIELD_W,
    FIELD_H: FIELD_H,
    CELL_SIZES: CELL_SIZES,
    SOURCES: SOURCES,
    MODES: MODES,
    PALETTES: PALETTES,
    FLOYD: FLOYD,
    LIGHT: LIGHT,
    bayer: bayer,
    modeInfo: modeInfo,
    hash01: hash01,
    thresholdAt: thresholdAt,
    matrixValue: matrixValue,
    decide: decide,
    sample: sample,
    samplesFrom: samplesFrom,
    gridFor: gridFor,
    paint: paint,
    explain: explain,
    palette: palette,
    fmt: fmt,
  };
});
