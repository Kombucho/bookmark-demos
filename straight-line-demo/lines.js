// Tone built from straight segments only. No curves, no filled shade.
// The subjects are a portrait, a mountain range, and a spiral.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StraightLines = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VIEW = { w: 1000, h: 1240 };

  const PRESETS = [
    { id: 'portrait', label: 'Portrait' },
    { id: 'mountains', label: 'Mountains' },
    { id: 'spiral', label: 'Spiral' },
  ];

  function arc(cx, cy, rx, ry, a0, a1, n) {
    const pts = [];
    const steps = Math.max(2, n);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const a = a0 + (a1 - a0) * t;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }

  function ellipse(cx, cy, rx, ry, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }

  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function warp(points, seed, amp) {
    if (!amp) return points.map(function (p) { return p.slice(); });
    return points.map(function (p) {
      const x = p[0];
      const y = p[1];
      const n = Math.sin(x * 0.021 + seed * 0.37) * Math.cos(y * 0.017 + seed * 0.13);
      const m = Math.cos(x * 0.011 + seed * 0.19) * Math.sin(y * 0.023 + seed * 0.29);
      return [x + n * amp, y + m * amp];
    });
  }

  function phaseFrom(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function region(id, tone, points, edge, holes) {
    return { id: id, tone: tone, points: points, edge: !!edge, holes: holes || [] };
  }

  function eyeShape(x, y) {
    return [
      [x - 72, y + 2],
      [x - 40, y - 14],
      [x, y - 20],
      [x + 42, y - 14],
      [x + 74, y + 2],
      [x + 40, y + 14],
      [x, y + 18],
      [x - 42, y + 14],
    ];
  }

  function buildPortrait(seed) {
    const amp = 4;
    const w = function (pts) { return warp(pts, seed, amp); };
    const cx = 500;
    const cy = 420;
    const rx = 214;
    const ry = 268;
    const aLeft = Math.PI * 1.12;
    const aRight = Math.PI * 1.9;
    const crown = arc(cx, cy, rx + 4, ry + 6, aLeft, aRight, 20);
    const jaw = arc(cx, cy, rx, ry, aRight, aLeft + Math.PI * 2, 24);
    const bangs = [
      [648, 352],
      [582, 392],
      [500, 338],
      [418, 394],
      [352, 350],
    ];
    const hair = w(crown.concat(bangs));
    const face = w(jaw.concat(bangs.slice().reverse()));
    const eyeL = w(eyeShape(400, 455));
    const eyeR = w(eyeShape(604, 455));
    const pupilL = w(ellipse(396, 458, 11, 12, 10));
    const pupilR = w(ellipse(600, 458, 11, 12, 10));
    const shadow = w(arc(cx, cy, rx * 0.98, ry * 0.98, -0.45, 1.15, 14).concat([
      [cx + 28, cy + 150],
      [cx + 6, cy + 10],
      [cx + 22, cy - 160],
    ]));
    const mouth = w([
      [452, 612],
      [500, 592],
      [552, 614],
      [536, 642],
      [500, 654],
      [464, 640],
    ]);
    const bust = w([
      [348, 640],
      [662, 642],
      [780, 860],
      [920, 1200],
      [80, 1200],
      [230, 860],
    ]);
    const neckShade = w([[545, 670], [650, 690], [720, 900], [540, 880]]);
    const shirt = w([[400, 900], [620, 900], [700, 1200], [320, 1200]]);
    const ear = w(arc(724, 470, 28, 48, -1.15, 2.4, 10));

    return {
      id: 'portrait',
      view: VIEW,
      phase: phaseFrom(seed),
      lines: [
        { id: 'nose', points: w([[502, 508], [496, 572], [468, 594]]), closed: false },
        { id: 'nostril', points: w([[496, 572], [534, 590]]), closed: false },
        { id: 'brow-l', points: w([[340, 400], [470, 368]]), closed: false },
        { id: 'brow-l2', points: w([[344, 414], [466, 384]]), closed: false },
        { id: 'brow-r', points: w([[534, 368], [666, 402]]), closed: false },
        { id: 'brow-r2', points: w([[538, 384], [662, 416]]), closed: false },
        { id: 'mouth-line', points: w([[468, 624], [500, 616], [538, 626]]), closed: false },
        { id: 'neckline', points: w([[456, 960], [500, 1040], [546, 960]]), closed: false },
        { id: 'ear', points: ear, closed: false },
      ],
      regions: [
        region('bust', 0.4, bust, true),
        region('shirt', 0.66, shirt, false),
        region('neck-shade', 0.72, neckShade, false),
        region('face', 0.32, face, true, [eyeL, eyeR]),
        region('shadow', 0.6, shadow, false, [eyeL, eyeR]),
        region('hair', 0.92, hair, true),
        region('mouth', 0.72, mouth, true),
        region('eye-l', 0, eyeL, true),
        region('eye-r', 0, eyeR, true),
        region('pupil-l', 1, pupilL, false),
        region('pupil-r', 1, pupilR, false),
      ],
    };
  }

  function peakParts(left, apex, right, toneL, toneR, snow) {
    const t = (apex[0] - left[0]) / (right[0] - left[0] || 1);
    const clamped = Math.max(0.2, Math.min(0.8, t));
    const foot = lerp(left, right, clamped);
    const parts = [];
    if (snow) {
      const sl = lerp(apex, left, 0.2);
      const sr = lerp(apex, right, 0.2);
      const ridge = lerp(apex, foot, 0.2);
      parts.push(region('peak-snow', 0.05, [sl, apex, ridge], true));
      parts.push(region('peak-snow', 0.05, [apex, sr, ridge], true));
      parts.push(region('peak-l', toneL, [left, sl, ridge, foot], true));
      parts.push(region('peak-r', toneR, [foot, ridge, sr, right], true));
    } else {
      parts.push(region('peak-l', toneL, [left, apex, foot], true));
      parts.push(region('peak-r', toneR, [foot, apex, right], true));
    }
    return parts;
  }

  function buildMountains(seed) {
    const amp = 16;
    const w = function (pts) { return warp(pts, seed, amp); };
    const far = peakParts(w([[40, 860]])[0], w([[250, 470]])[0], w([[470, 890]])[0], 0.22, 0.5, false);
    const mid = peakParts(w([[220, 920]])[0], w([[540, 210]])[0], w([[860, 950]])[0], 0.26, 0.78, true);
    const near = peakParts(w([[640, 980]])[0], w([[900, 360]])[0], w([[1120, 1040]])[0], 0.32, 0.84, false);
    // peakParts already warped its inputs. Don't warp twice — the arguments above are single points.
    const hill = w([
      [0, 1040],
      [120, 960],
      [280, 1010],
      [460, 940],
      [700, 1000],
      [1000, 930],
      [1000, 1120],
      [0, 1120],
    ]);
    const water = [
      [0, 1120],
      [1000, 1120],
      [1000, 1240],
      [0, 1240],
    ];
    const tree = function (x, y, h) {
      return w([[x - 16, y], [x, y - h], [x + 16, y]]);
    };
    const sun = [];
    const sx = 800 + Math.sin(seed) * 12;
    const sy = 180 + Math.cos(seed * 0.7) * 8;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const inner = 18;
      const outer = i % 2 === 0 ? 70 : 42;
      sun.push([
        [sx + Math.cos(a) * inner, sy + Math.sin(a) * inner],
        [sx + Math.cos(a) * outer, sy + Math.sin(a) * outer],
      ]);
    }
    return {
      id: 'mountains',
      view: VIEW,
      phase: phaseFrom(seed + 3),
      lines: [{ id: 'sun', points: arc(sx, sy, 16, 16, 0, Math.PI * 2, 13), closed: true }].concat(
        sun.map(function (seg, i) { return { id: 'ray-' + i, points: seg, closed: false }; })
      ).concat([
        { id: 'shore', points: [[0, 1120], [1000, 1120]], closed: false },
      ]),
      regions: [region('water', 0.14, water, false)]
        .concat(far, mid, near)
        .concat([
          region('hill', 0.46, hill, true),
          region('tree', 0.9, tree(150, 1005, 90), true),
          region('tree', 0.86, tree(230, 990, 70), true),
          region('tree', 0.92, tree(690, 990, 80), true),
        ]),
    };
  }

  function buildSpiral(seed) {
    const cx = 470;
    const cy = 640;
    const a0 = 8;
    const b = 12.4;
    const maxT = Math.PI * 2 * 3.15;
    function at(theta) {
      const wobble = Math.sin(theta * 2.4 + seed * 0.65) * 5;
      const r = a0 + b * theta + wobble;
      return [cx + Math.cos(theta) * r, cy + Math.sin(theta) * r];
    }
    const pts = [];
    for (let t = 0.35; t <= maxT; t += 0.16) pts.push(at(t));
    const regions = [];
    const turn = Math.PI * 2;
    for (let t = 0.5; t < maxT - turn; t += 0.5) {
      const p1 = at(t);
      const p2 = at(t + 0.5);
      const p3 = at(t + 0.5 + turn);
      const p4 = at(t + turn);
      const span = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      if (span < 28) continue;
      const mx = (p1[0] + p2[0] + p3[0] + p4[0]) / 4;
      const my = (p1[1] + p2[1] + p3[1] + p4[1]) / 4;
      const dx = mx - cx;
      const dy = my - cy;
      const len = Math.hypot(dx, dy) || 1;
      const lx = -0.55;
      const ly = -0.72;
      const ln = Math.hypot(lx, ly);
      const dot = (dx / len) * (lx / ln) + (dy / len) * (ly / ln);
      const light = dot * 0.5 + 0.5;
      const tone = 0.16 + (1 - light) * 0.78;
      regions.push(region('chamber', tone, [p1, p2, p3, p4], false));
    }
    const table = warp([
      [70, 1020],
      [930, 980],
      [990, 1210],
      [30, 1230],
    ], seed, 6);
    const shadow = warp(ellipse(530, 1005, 170, 26, 14), seed, 4);
    return {
      id: 'spiral',
      view: VIEW,
      phase: phaseFrom(seed + 11),
      lines: [{ id: 'spiral', points: pts, closed: false }],
      regions: [region('table', 0.2, table, true), region('shadow', 0.4, shadow, false)].concat(regions),
    };
  }

  function buildScene(id, seed) {
    const n = Number(seed) || 1;
    if (id === 'portrait') return buildPortrait(n);
    if (id === 'mountains') return buildMountains(n);
    if (id === 'spiral') return buildSpiral(n);
    return null;
  }

  function rotate(x, y, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [x * c + y * s, -x * s + y * c];
  }

  function unrotate(x, y, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [x * c - y * s, x * s + y * c];
  }

  function hatchPolygon(points, angleDeg, spacing, phase, holes) {
    if (!points || points.length < 3) return [];
    const gap = Math.max(1, spacing);
    const ang = (angleDeg * Math.PI) / 180;
    const shift = (phase || 0) * gap;
    const loops = [points].concat(holes || []).map(function (loop) {
      return loop.map(function (p) { return rotate(p[0], p[1], ang); });
    });
    let minY = Infinity;
    let maxY = -Infinity;
    loops[0].forEach(function (p) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    });
    if (!Number.isFinite(minY) || maxY - minY < gap * 0.4) return [];
    let y = Math.floor((minY - shift) / gap) * gap + shift;
    if (y <= minY + 1e-6) y += gap;
    const segs = [];
    for (; y < maxY - 0.01; y += gap) {
      const xs = [];
      loops.forEach(function (loop) {
        const n = loop.length;
        for (let i = 0; i < n; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % n];
          const y1 = a[1];
          const y2 = b[1];
          if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
            const t = (y - y1) / (y2 - y1);
            xs.push(a[0] + t * (b[0] - a[0]));
          }
        }
      });
      xs.sort(function (p, q) { return p - q; });
      if (xs.length % 2 === 1) xs.pop();
      for (let i = 0; i + 1 < xs.length; i += 2) {
        if (xs[i + 1] - xs[i] < 0.6) continue;
        const p = unrotate(xs[i], y, ang);
        const q = unrotate(xs[i + 1], y, ang);
        segs.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], role: 'hatch' });
      }
    }
    return segs;
  }

  function polySegments(points, closed) {
    const segs = [];
    if (!points || points.length < 2) return segs;
    const last = closed ? points.length : points.length - 1;
    for (let i = 0; i < last; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.4) continue;
      segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], role: 'edge' });
    }
    return segs;
  }

  function linesFor(scene, options) {
    const opts = options || {};
    const angle = opts.angle == null ? 32 : opts.angle;
    const spacing = Math.max(4, opts.spacing == null ? 14 : opts.spacing);
    const phase = opts.phase == null ? scene.phase || 0 : opts.phase;
    const segs = [];
    (scene.lines || []).forEach(function (line) {
      polySegments(line.points, !!line.closed).forEach(function (seg) { segs.push(seg); });
    });
    const regions = (scene.regions || []).concat(opts.extraRegions || []);
    regions.forEach(function (item) {
      if (item.edge) polySegments(item.points, true).forEach(function (seg) { segs.push(seg); });
      if (item.tone >= 0.05 && item.points && item.points.length >= 3) {
        const gap = Math.max(4, spacing / Math.max(0.16, Math.min(1, item.tone)));
        hatchPolygon(item.points, angle, gap, phase, item.holes).forEach(function (seg) { segs.push(seg); });
        if (item.tone >= 0.72) {
          hatchPolygon(item.points, angle + 90, Math.max(4, gap * 1.45), phase, item.holes).forEach(function (seg) {
            segs.push(seg);
          });
        }
      }
    });
    return segs;
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  return {
    VIEW: VIEW,
    PRESETS: PRESETS,
    buildScene: buildScene,
    hatchPolygon: hatchPolygon,
    linesFor: linesFor,
    pointInPoly: pointInPoly,
    polySegments: polySegments,
  };
});
