// Instruments for the interaction lab.
// Spring, cubic-bezier, loupe window, mercury force, torch falloff, tilting liquid.
// Nothing here draws. The page is the only renderer.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InteractionLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  function dampingRatio(k, c, m) {
    return c / (2 * Math.sqrt(k * m));
  }

  function regime(zeta) {
    if (zeta < 0.97) return 'underdamped';
    if (zeta > 1.03) return 'overdamped';
    return 'critical';
  }

  function springAccel(x, v, k, c, m, x0) {
    return (-k * (x - x0) - c * v) / m;
  }

  function springStep(state, dt, params) {
    const a = springAccel(state.x, state.v, params.k, params.c, params.m, params.x0);
    const v = state.v + a * dt;
    const x = state.x + v * dt;
    return {x: x, v: v, a: a};
  }

  // Semi-implicit Euler, subdivided so a stiff spring does not blow up.
  function springIntegrate(state, dt, params) {
    const omega = Math.sqrt(params.k / params.m);
    const maxDt = Math.min(0.02, 0.35 / omega);
    let left = Math.min(Math.max(dt, 0), 0.05);
    let s = {x: state.x, v: state.v, a: state.a || 0};
    let guard = 0;
    while (left > 1e-8 && guard < 24) {
      const h = Math.min(left, maxDt);
      s = springStep(s, h, params);
      left -= h;
      guard += 1;
    }
    return s;
  }

  function bezierCoord(t, c1, c2) {
    const u = 1 - t;
    return (3 * u * u * t * c1) + (3 * u * t * t * c2) + (t * t * t);
  }

  function bezierDeriv(t, c1, c2) {
    const u = 1 - t;
    return (3 * u * u * c1) + (6 * u * t * (c2 - c1)) + (3 * t * t * (1 - c2));
  }

  // x(t) for a cubic with P0 = 0 and P3 = 1. x1 and x2 stay in [0, 1], so x(t) is monotonic.
  function solveBezierT(x, x1, x2) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = clamp(x, 0, 1);
    for (let i = 0; i < 8; i++) {
      const slope = bezierDeriv(t, x1, x2);
      const err = bezierCoord(t, x1, x2) - x;
      if (Math.abs(err) < 1e-7) return t;
      if (Math.abs(slope) < 1e-6) break;
      t = clamp(t - err / slope, 0, 1);
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bezierCoord(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function easeY(x, x1, y1, x2, y2) {
    const t = solveBezierT(x, x1, x2);
    return bezierCoord(t, y1, y2);
  }

  // One sample per frame, plus the frame at t = 1. Time is uniform; y is not.
  function frameSamples(x1, y1, x2, y2, frames) {
    const n = frames || 60;
    const out = [];
    let prev = easeY(0, x1, y1, x2, y2);
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const y = easeY(x, x1, y1, x2, y2);
      out.push({frame: i, x: x, y: y, dy: y - prev});
      prev = y;
    }
    out[0].dy = 0;
    return out;
  }

  // Source window that, drawn at `mag`, fills a lens of the given radius.
  function loupeWindow(px, py, viewRadius, mag, srcW, srcH) {
    const m = mag > 0.05 ? mag : 0.05;
    const size = (viewRadius * 2) / m;
    let x = px - size / 2;
    let y = py - size / 2;
    if (size >= srcW) x = (srcW - size) / 2;
    else x = clamp(x, 0, srcW - size);
    if (size >= srcH) y = (srcH - size) / 2;
    else y = clamp(y, 0, srcH - size);
    return {x: x, y: y, size: size, mag: m};
  }

  // Positive force pulls i toward j when d > rest, and pushes away when d < rest.
  // dx, dy is the vector from i to j.
  function pairForce(dx, dy, rest, cohesion) {
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return {fx: 0, fy: 0, dist: 0};
    const f = cohesion * (dist - rest);
    return {fx: (f * dx) / dist, fy: (f * dy) / dist, dist: dist};
  }

function mercuryOnce(particles, dt, params) {
  const n = particles.length;
  const ax = new Array(n).fill(0);
  const ay = new Array(n).fill(0);
  const rest = params.rest;
  const cohesion = params.cohesion;
  const range = params.range;
  const maxStretch = rest * 1.25;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = particles[j].x - particles[i].x;
      const dy = particles[j].y - particles[i].y;
      const dist = Math.hypot(dx, dy);
      if (dist >= range || dist < 1e-8) continue;
      let stretch = dist - rest;
      // The core pushes harder than the tail pulls, so a blob stays a blob.
      if (stretch < 0) stretch *= 3;
      stretch = clamp(stretch, -maxStretch * 3, maxStretch);
      const f = cohesion * stretch;
      const fx = (f * dx) / dist;
      const fy = (f * dy) / dist;
      ax[i] += fx;
      ay[i] += fy;
      ax[j] -= fx;
      ay[j] -= fy;
    }
  }
  const damp = Math.exp(-params.damping * dt);
  const pad = params.pad;
  const w = params.width;
  const h = params.height;
  const maxV = params.maxSpeed || 160;
  return particles.map(function (p, i) {
    let vx = (p.vx + ax[i] * dt) * damp;
    let vy = (p.vy + ay[i] * dt) * damp;
    const speed = Math.hypot(vx, vy);
    if (speed > maxV) {
      vx = (vx / speed) * maxV;
      vy = (vy / speed) * maxV;
    }
    let x = p.x + vx * dt;
    let y = p.y + vy * dt;
    if (x < pad) { x = pad; vx = Math.abs(vx) * 0.45; }
    else if (x > w - pad) { x = w - pad; vx = -Math.abs(vx) * 0.45; }
    if (y < pad) { y = pad; vy = Math.abs(vy) * 0.45; }
    else if (y > h - pad) { y = h - pad; vy = -Math.abs(vy) * 0.45; }
    return {x: x, y: y, vx: vx, vy: vy};
  });
}

function mercuryStep(particles, dt, params) {
  const slices = 4;
  const h = dt / slices;
  let cur = particles;
  for (let i = 0; i < slices; i++) cur = mercuryOnce(cur, h, params);
  return cur;
}

  // I = I0 * max(0, â · r̂)^n / (1 + (d/R)^2), and 0 outside the cone.
  function torchIntensity(px, py, ox, oy, aimX, aimY, halfAngle, reach, power) {
    const dx = px - ox;
    const dy = py - oy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return 1;
    const aim = Math.hypot(aimX, aimY) || 1;
    const dot = (dx * (aimX / aim) + dy * (aimY / aim)) / dist;
    const cosHalf = Math.cos(halfAngle);
    if (dot <= cosHalf) return 0;
    const span = 1 - cosHalf;
    const along = span < 1e-4 ? 1 : (dot - cosHalf) / span;
    const n = power == null ? 2 : power;
    const fall = 1 / (1 + (dist / reach) * (dist / reach));
    return Math.pow(Math.max(0, along), n) * fall;
  }

  function shoelace(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const c = poly[i];
      const n = poly[(i + 1) % poly.length];
      area += c[0] * n[1] - n[0] * c[1];
    }
    return Math.abs(area) / 2;
  }

  // Keeps the side where gx*x + gy*y >= d.
  function clipHalfPlane(poly, gx, gy, d) {
    if (!poly.length) return [];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = gx * a[0] + gy * a[1] - d;
      const db = gx * b[0] + gy * b[1] - d;
      const aIn = da >= -1e-8;
      const bIn = db >= -1e-8;
      if (aIn && bIn) {
        out.push(b);
      } else if (aIn && !bIn) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      } else if (!aIn && bIn) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        out.push(b);
      }
    }
    return out;
  }

  // Positive theta rotates the vessel clockwise on a y-down screen.
  // Gravity, written in the vessel's own axes, is (sin θ, cos θ).
  function gravity(theta) {
    return {x: Math.sin(theta), y: Math.cos(theta)};
  }

  function toScreen(x, y, theta, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  }

  // Rectangular vessel, mouth along y = 0. `area` is the requested liquid area.
  // Anything the mouth cannot hold is reported as spilled and left out of the polygon.
  function liquidAt(w, h, area, theta) {
    const g = gravity(theta);
    const corners = [[0, 0], [w, 0], [w, h], [0, h]];
    let minP = Infinity;
    let maxP = -Infinity;
    for (let i = 0; i < corners.length; i++) {
      const p = g.x * corners[i][0] + g.y * corners[i][1];
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }
    const full = w * h;
    const want = clamp(area, 0, full);
    const lip = Math.max(g.x * 0, g.x * w);
    function areaAt(d) {
      return shoelace(clipHalfPlane(corners, g.x, g.y, d));
    }
    const maxHold = areaAt(lip);
    const contained = Math.min(want, maxHold);
    const spilled = want - contained;
    if (contained <= 1e-8) {
      return {
        polygon: [],
        contained: 0,
        spilled: spilled,
        maxHold: maxHold,
        theta: theta,
        surface: [],
        g: g,
      };
    }
    let lo = minP;
    let hi = maxP;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (areaAt(mid) > contained) lo = mid;
      else hi = mid;
    }
    const d = (lo + hi) / 2;
    const polygon = clipHalfPlane(corners, g.x, g.y, d);
    const surface = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      if (Math.abs(g.x * p[0] + g.y * p[1] - d) < 1e-3) surface.push(p);
    }
    return {
      polygon: polygon,
      contained: contained,
      spilled: spilled,
      maxHold: maxHold,
      theta: theta,
      d: d,
      surface: surface,
      g: g,
    };
  }

  return {
    clamp: clamp,
    dampingRatio: dampingRatio,
    regime: regime,
    springAccel: springAccel,
    springStep: springStep,
    springIntegrate: springIntegrate,
    bezierCoord: bezierCoord,
    solveBezierT: solveBezierT,
    easeY: easeY,
    frameSamples: frameSamples,
    loupeWindow: loupeWindow,
    pairForce: pairForce,
    mercuryStep: mercuryStep,
    torchIntensity: torchIntensity,
    gravity: gravity,
    toScreen: toScreen,
    liquidAt: liquidAt,
    shoelace: shoelace,
  };
});
