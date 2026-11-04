// Turns Inkra's pencil points into SVG outlines for the field card.
// createPencilPoints is passed in, from the CDN module or the vendored copy.
// The same seed and roughness always rebuild the same path.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SketchKit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clamp(n, lo, hi) {
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function insetOf(width, height, stroke) {
    const want = 1.25 + stroke * 0.55;
    const limit = Math.min(width, height) / 2 - 1;
    return Math.max(0.5, Math.min(want, limit));
  }

  // Horizontal pencil samples, shifted so the perpendicular jitter is centered on 0.
  // `along` runs the length of the stroke. `perp` is the seeded wobble.
  function strokeSamples(createPencilPoints, spec) {
    const roughness = Math.max(0, Number.isFinite(spec.roughness) ? spec.roughness : 0);
    const length = Math.max(1, spec.length);
    const height = roughness === 0 ? 8 : Math.max(8, roughness / 0.32 + 1);
    const points = spec.points || Math.max(4, Math.min(36, Math.round(length / 14)));
    const raw = createPencilPoints({
      seed: spec.seed,
      width: length,
      height: height,
      points: points,
      roughness: roughness
    });
    const center = height / 2;
    return raw.map(function (point) {
      return [point[0], point[1] - center];
    });
  }

  function place(samples, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return samples.map(function (sample) {
      const along = sample[0];
      const perp = sample[1];
      return [x1 + ux * along - uy * perp, y1 + uy * along + ux * perp];
    });
  }

  function pathFrom(points, close) {
    if (!points.length) return '';
    const d = points.map(function (point, index) {
      return (index === 0 ? 'M' : 'L') + point[0].toFixed(2) + ' ' + point[1].toFixed(2);
    }).join(' ');
    return close ? d + ' Z' : d;
  }

  function edge(createPencilPoints, seed, roughness, x1, y1, x2, y2) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const samples = strokeSamples(createPencilPoints, {
      seed: seed,
      length: length,
      roughness: roughness
    });
    return place(samples, x1, y1, x2, y2);
  }

  function rectPoints(createPencilPoints, spec) {
    const pad = insetOf(spec.width, spec.height, spec.stroke);
    const x = pad;
    const y = pad;
    const w = spec.width - pad * 2;
    const h = spec.height - pad * 2;
    if (w < 2 || h < 2) return [];
    const seed = String(spec.seed);
    const rough = spec.roughness;
    const top = edge(createPencilPoints, seed + ':t', rough, x, y, x + w, y);
    const right = edge(createPencilPoints, seed + ':r', rough, x + w, y, x + w, y + h);
    const bottom = edge(createPencilPoints, seed + ':b', rough, x + w, y + h, x, y + h);
    const left = edge(createPencilPoints, seed + ':l', rough, x, y + h, x, y);
    return top.concat(right.slice(1), bottom.slice(1), left.slice(1));
  }

  function circlePoints(createPencilPoints, spec) {
    const pad = insetOf(spec.width, spec.height, spec.stroke);
    const rx = spec.width / 2 - pad;
    const ry = spec.height / 2 - pad;
    if (rx < 1 || ry < 1) return [];
    const radius = Math.min(rx, ry);
    const cx = spec.width / 2;
    const cy = spec.height / 2;
    const length = 2 * Math.PI * radius;
    const samples = strokeSamples(createPencilPoints, {
      seed: spec.seed,
      length: length,
      roughness: spec.roughness,
      points: Math.max(10, Math.min(28, Math.round(length / 8)))
    });
    return samples.map(function (sample) {
      const angle = (sample[0] / length) * Math.PI * 2;
      const reach = radius + sample[1];
      return [cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach];
    });
  }

  function segmentPath(createPencilPoints, seed, roughness, x1, y1, x2, y2) {
    return pathFrom(edge(createPencilPoints, seed, roughness, x1, y1, x2, y2), false);
  }

  function thumbCenter(width, height, stroke, value) {
    const pad = insetOf(width, height, stroke);
    const t = clamp(value, 0, 1);
    return {
      x: pad + (width - pad * 2) * t,
      y: height / 2
    };
  }

  function renderShape(createPencilPoints, spec) {
    const width = Number(spec.width) || 0;
    const height = Number(spec.height) || 0;
    const roughness = clamp(Number(spec.roughness), 0, 8);
    const stroke = clamp(Number(spec.strokeWidth), 0.4, 4);
    const paths = [];
    if (width < 8 || height < 8) return { paths: paths, stroke: stroke };

    const shape = spec.shape || 'rect';
    const seed = String(spec.seed);
    const box = { seed: seed, width: width, height: height, roughness: roughness, stroke: stroke };

    function add(d, pass) {
      if (!d) return;
      const wide = pass === 'fill' ? Math.max(4.5, stroke * 2.8) : stroke;
      paths.push({ d: d, pass: pass, stroke: wide });
    }

    if (shape === 'circle') {
      add(pathFrom(circlePoints(createPencilPoints, box), true), 'main');
      return { paths: paths, stroke: stroke };
    }

    add(pathFrom(rectPoints(createPencilPoints, box), true), 'main');
    if (Math.min(width, height) >= 36) {
      add(pathFrom(rectPoints(createPencilPoints, {
        seed: seed + ':grain',
        width: width,
        height: height,
        roughness: roughness,
        stroke: stroke
      }), true), 'grain');
    }

    const pad = insetOf(width, height, stroke);
    if ((shape === 'range' || shape === 'progress') && spec.value > 0) {
      const end = thumbCenter(width, height, stroke, spec.value);
      add(segmentPath(createPencilPoints, seed + ':fill', roughness * 0.35, pad, height / 2, end.x, height / 2), 'fill');
    }
    if (shape === 'range') {
      const at = thumbCenter(width, height, stroke, spec.value || 0);
      const knob = Math.max(5, Math.min(9, height * 0.28));
      add(pathFrom(circlePoints(createPencilPoints, {
        seed: seed + ':thumb',
        width: knob * 2,
        height: knob * 2,
        roughness: roughness * 0.45,
        stroke: stroke
      }).map(function (point) {
        return [point[0] - knob + at.x, point[1] - knob + at.y];
      }), true), 'thumb');
    }
    if (shape === 'check' && spec.checked) {
      add(segmentPath(
        createPencilPoints,
        seed + ':c1',
        roughness * 0.5,
        width * 0.26,
        height * 0.52,
        width * 0.44,
        height * 0.70
      ), 'fill');
      add(segmentPath(
        createPencilPoints,
        seed + ':c2',
        roughness * 0.5,
        width * 0.44,
        height * 0.70,
        width * 0.76,
        height * 0.30
      ), 'fill');
    }
    if (spec.margin) {
      add(segmentPath(createPencilPoints, seed + ':margin', roughness, 22, pad, 22, height - pad), 'margin');
    }
    return { paths: paths, stroke: stroke };
  }

  return {
    clamp: clamp,
    strokeSamples: strokeSamples,
    thumbCenter: thumbCenter,
    renderShape: renderShape
  };
});
