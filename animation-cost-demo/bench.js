// Frame budget and three costs from Emil Kowalski's animation-performance skill.
// Animated blur stays under 20px (2–5px is enough to soften). box-shadow is a
// paint. An inherited custom property recalculates every descendant.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AnimationBench = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLUR_LIMIT_PX = 20;
  const BLUR_SOFTEN = {min: 2, max: 5};
  const BLUR_EXPENSIVE = {min: 24, max: 48};
  const FRAME_60_MS = 16.7;
  const FRAME_120_MS = 8;
  const SKILL_SHADOW_SWAP = 'drop-shadow';
  const DESCENDANTS_PER_CARD = 3;
  const COUNT_MIN = 4;
  const COUNT_MAX = 80;
  const COUNT_DEFAULT = 20;

  const DEVICE_NOTE = 'These numbers come from this device. A fast laptop hides most of the cost. The skill’s bar is a mid-range phone: 16.7ms at 60Hz and 8ms at 120Hz. Do not read a smooth result here as proof the animation is fine.';

  const TIERS = {
    transform: 'composite',
    opacity: 'composite',
    filter: 'composite',
    'clip-path': 'composite',
    'background-color': 'composite',
    'box-shadow': 'paint',
    'border-radius': 'paint',
    color: 'paint',
    width: 'layout',
    height: 'layout',
    padding: 'layout',
    margin: 'layout',
    top: 'layout',
    left: 'layout',
    'border-width': 'layout',
  };

  function tierOf(property) {
    return TIERS[property] || 'unknown';
  }

  function blurVerdict(px) {
    if (typeof px !== 'number' || !Number.isFinite(px) || px < 0) return 'invalid';
    if (px > BLUR_LIMIT_PX) return 'over-limit';
    if (px >= BLUR_SOFTEN.min && px <= BLUR_SOFTEN.max) return 'soften';
    return 'under-limit';
  }

  function scenePlan(toggles) {
    const source = toggles || {};
    const contrast = {
      blur: source.blur !== false,
      shadow: source.shadow !== false,
      variable: source.variable !== false,
    };
    const cheap = {
      blur: {min: BLUR_SOFTEN.min, max: BLUR_SOFTEN.max},
      shadow: 'opacity',
      motion: 'transform',
    };
    return {
      contrast: contrast,
      cheap: cheap,
      expensive: {
        blur: contrast.blur ? {min: BLUR_EXPENSIVE.min, max: BLUR_EXPENSIVE.max} : {min: BLUR_SOFTEN.min, max: BLUR_SOFTEN.max},
        shadow: contrast.shadow ? 'box-shadow' : 'opacity',
        motion: contrast.variable ? 'inherited-variable' : 'transform',
      },
    };
  }

  function wave(timeMs, periodMs) {
    const period = periodMs || 1600;
    const phase = (timeMs % period) / period;
    return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  }

  function blurAt(timeMs, range, periodMs) {
    const span = range.max - range.min;
    return range.min + span * wave(timeMs, periodMs || 1600);
  }

  function driftPx(timeMs, amplitude, periodMs) {
    const amp = amplitude == null ? 18 : amplitude;
    const period = periodMs || 1800;
    const phase = (timeMs % period) / period;
    return Math.sin(phase * Math.PI * 2) * amp;
  }

  function shadowOpacity(timeMs) {
    return 0.28 + wave(timeMs, 1600) * 0.62;
  }

  function shadowBlurPx(timeMs) {
    return blurAt(timeMs, {min: 6, max: 36}, 1600);
  }

  function findings(side) {
    const list = [];
    list.push(side.blur.max > BLUR_LIMIT_PX ? 'blur-over-20' : 'blur-within-20');
    list.push(side.shadow === 'box-shadow' ? 'shadow-paint' : 'shadow-opacity');
    list.push(side.motion === 'inherited-variable' ? 'inherited-variable' : 'direct-transform');
    return list;
  }

  function recalcTargets(count, motion) {
    const n = Math.max(0, count | 0);
    if (motion === 'inherited-variable') return n * (1 + DESCENDANTS_PER_CARD);
    return n > 0 ? 1 : 0;
  }

  function clampCount(n) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return COUNT_DEFAULT;
    if (x < COUNT_MIN) return COUNT_MIN;
    if (x > COUNT_MAX) return COUNT_MAX;
    return x;
  }

  function summarizeFrames(samples) {
    const frames = [];
    (samples || []).forEach(function (sample) {
      const row = typeof sample === 'number' ? {frameMs: sample, hotMs: 0, coolMs: 0} : sample;
      if (!row || !Number.isFinite(row.frameMs) || row.frameMs < 0) return;
      frames.push(row);
    });
    if (!frames.length) {
      return {frames: 0, avgMs: 0, fps: 0, maxMs: 0, over60: 0, over120: 0, hotAvg: 0, coolAvg: 0};
    }
    let sum = 0;
    let max = 0;
    let over60 = 0;
    let over120 = 0;
    let hot = 0;
    let cool = 0;
    frames.forEach(function (row) {
      sum += row.frameMs;
      hot += row.hotMs || 0;
      cool += row.coolMs || 0;
      if (row.frameMs > max) max = row.frameMs;
      if (row.frameMs > FRAME_60_MS) over60 += 1;
      if (row.frameMs > FRAME_120_MS) over120 += 1;
    });
    const avg = sum / frames.length;
    return {
      frames: frames.length,
      avgMs: avg,
      fps: avg > 0 ? 1000 / avg : 0,
      maxMs: max,
      over60: over60,
      over120: over120,
      hotAvg: hot / frames.length,
      coolAvg: cool / frames.length,
    };
  }

  return {
    BLUR_LIMIT_PX: BLUR_LIMIT_PX,
    BLUR_SOFTEN: BLUR_SOFTEN,
    BLUR_EXPENSIVE: BLUR_EXPENSIVE,
    FRAME_60_MS: FRAME_60_MS,
    FRAME_120_MS: FRAME_120_MS,
    SKILL_SHADOW_SWAP: SKILL_SHADOW_SWAP,
    DESCENDANTS_PER_CARD: DESCENDANTS_PER_CARD,
    COUNT_MIN: COUNT_MIN,
    COUNT_MAX: COUNT_MAX,
    COUNT_DEFAULT: COUNT_DEFAULT,
    DEVICE_NOTE: DEVICE_NOTE,
    tierOf: tierOf,
    blurVerdict: blurVerdict,
    scenePlan: scenePlan,
    blurAt: blurAt,
    driftPx: driftPx,
    shadowOpacity: shadowOpacity,
    shadowBlurPx: shadowBlurPx,
    findings: findings,
    recalcTargets: recalcTargets,
    clampCount: clampCount,
    summarizeFrames: summarizeFrames,
  };
});
