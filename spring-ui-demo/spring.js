// Damped spring for the UI controls on this page.
// a = (−k (x − target) − c v) / m, stepped with semi-implicit Euler.
// Linear mode moves at a constant rate and stops on the target.
// Nothing here touches the DOM.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpringUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LINEAR_SPEED = 2.8;

  const PRESETS = {
    stiff: {id: 'stiff', label: 'Stiff', k: 520, c: 36, m: 0.55, mode: 'spring'},
    right: {id: 'right', label: 'Just right', k: 260, c: 15.2, m: 0.9, mode: 'spring'},
    wobbly: {id: 'wobbly', label: 'Wobbly', k: 100, c: 4.4, m: 1.05, mode: 'spring'},
    linear: {id: 'linear', label: 'No spring', k: 260, c: 15.2, m: 0.9, mode: 'linear'},
  };

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  function dampingRatio(k, c, m) {
    const km = k * m;
    if (!(km > 0)) return Infinity;
    return c / (2 * Math.sqrt(km));
  }

  function regime(zeta) {
    if (!Number.isFinite(zeta)) return 'linear';
    if (zeta < 0.98) return 'underdamped';
    if (zeta > 1.02) return 'overdamped';
    return 'critical';
  }

  function create(x, target) {
    return {x: x, v: 0, target: target == null ? x : target, a: 0};
  }

  function accel(x, v, target, params) {
    return (-params.k * (x - target) - params.c * v) / params.m;
  }

  function stepSpring(state, dt, params) {
    const a = accel(state.x, state.v, state.target, params);
    const v = state.v + a * dt;
    const x = state.x + v * dt;
    return {x: x, v: v, target: state.target, a: a};
  }

  function integrate(state, dt, params) {
    const target = state.target;
    const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);
    if (safeDt === 0) return {x: state.x, v: state.v, target: target, a: state.a || 0};

    if (!params || params.mode === 'linear') {
      const speed = params && params.linearSpeed > 0 ? params.linearSpeed : LINEAR_SPEED;
      const dx = target - state.x;
      const max = speed * safeDt;
      if (Math.abs(dx) <= max) return {x: target, v: 0, target: target, a: 0};
      const v = Math.sign(dx) * speed;
      return {x: state.x + v * safeDt, v: v, target: target, a: 0};
    }

    const m = params.m;
    const k = params.k;
    if (!(m > 0) || !(k > 0)) return {x: state.x, v: 0, target: target, a: 0};
    const tuned = {k: k, c: Math.max(0, params.c || 0), m: m};
    const omega = Math.sqrt(k / m);
    const maxDt = Math.min(0.016, 0.22 / omega);
    let left = safeDt;
    let s = {x: state.x, v: state.v, target: target};
    let a = state.a || 0;
    let guard = 0;
    while (left > 1e-8 && guard < 48) {
      const h = Math.min(left, maxDt);
      const next = stepSpring(s, h, tuned);
      s = next;
      a = next.a;
      left -= h;
      guard += 1;
    }
    return {x: s.x, v: s.v, target: target, a: a};
  }

  // Release x0 toward target. peakPast is how far the value travels beyond the target.
  function simulate(x0, target, params, seconds, hz) {
    const rate = hz || 60;
    const dt = 1 / rate;
    const steps = Math.max(0, Math.round((seconds || 0) * rate));
    let state = create(x0, target);
    const dir = Math.sign(target - x0) || 1;
    let peakPast = 0;
    let settle = null;
    let firstPass = null;
    for (let i = 0; i < steps; i++) {
      state = integrate(state, dt, params);
      const past = (state.x - target) * dir;
      if (past > peakPast) peakPast = past;
      if (firstPass == null && past >= -1e-4) firstPass = (i + 1) / rate;
      if (settle == null && Math.abs(state.x - target) < 0.02 && Math.abs(state.v) < 0.06) {
        settle = (i + 1) / rate;
      }
    }
    return {state: state, peakPast: peakPast, settle: settle, firstPass: firstPass};
  }

  return {
    LINEAR_SPEED: LINEAR_SPEED,
    PRESETS: PRESETS,
    clamp: clamp,
    dampingRatio: dampingRatio,
    regime: regime,
    create: create,
    accel: accel,
    integrate: integrate,
    simulate: simulate,
  };
});
