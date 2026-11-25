// A small on-page mood reading. Not the libraries.dev model: no trees,
// no copied weights. The features cover the last 8 seconds, as a weighted
// sum per mood, then a softmax. The page asks again every 250 ms.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Mood = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WINDOW_MS = 8000;
  const STEP_MS = 250;
  const ALERT = 0.42;
  const RELEASE = 0.32;
  const RISE_MS = 250;
  const SWITCH_MS = 500;
  const HOLD_MS = 1000;

  const MOODS = ['neutral', 'frustrated', 'confused', 'lost', 'away'];
  const FEATURES = ['speed', 'shake', 'circle', 'hover', 'rage', 'dead', 'disabled', 'scroll', 'retype', 'invalid', 'idle', 'absent'];

  const MOOD_LABELS = {
    neutral: 'Neutral',
    frustrated: 'Frustrated',
    confused: 'Confused',
    lost: 'Lost',
    away: 'Away',
  };

  const FEATURE_LABELS = {
    speed: 'Pointer speed',
    shake: 'Direction reversals',
    circle: 'Circling a spot',
    hover: 'Hover, no press',
    rage: 'Rage clicks',
    dead: 'Dead clicks',
    disabled: 'Disabled clicks',
    scroll: 'Scroll back-and-forth',
    retype: 'Delete and retype',
    invalid: 'Repeated invalid submit',
    idle: 'Idle',
    absent: 'Tab hidden or pointer outside',
  };

  // Scores are bias + weight × feature. Tuned so a calm trace stays
  // neutral, and each planted behaviour lifts one mood over the alert.
  const MODEL = {
    neutral: { bias: 0.8, speed: 0.1, shake: -0.55, circle: -0.7, hover: -0.55, rage: -1.6, dead: -0.5, disabled: -1.3, scroll: -0.45, retype: -0.6, invalid: -1.2, idle: -1.7, absent: -2.4 },
    frustrated: { bias: -1.45, speed: 0.45, shake: 1.7, circle: 0.1, hover: 0.05, rage: 2.55, dead: 0.25, disabled: 2.4, scroll: 0.15, retype: 0.3, invalid: 3.1, idle: -2.2, absent: -3.4 },
    confused: { bias: -1.25, speed: -0.2, shake: 0.2, circle: 2.25, hover: 2.35, rage: -0.35, dead: 0.35, disabled: 0.1, scroll: 0.1, retype: 2.45, invalid: 0.25, idle: -1.7, absent: -2.4 },
    lost: { bias: -1.2, speed: 0.05, shake: 0.1, circle: 0.25, hover: 0.2, rage: -0.4, dead: 1.85, disabled: 0.15, scroll: 2.3, retype: 0.1, invalid: 0.1, idle: -1.6, absent: -2.4 },
    away: { bias: -1.7, speed: -0.8, shake: -0.7, circle: -0.5, hover: -0.3, rage: -1.4, dead: -0.3, disabled: -0.5, scroll: -0.4, retype: -0.4, invalid: -0.3, idle: 3.6, absent: 4.4 },
  };

  function clamp01(v) {
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (v >= 1) return 1;
    return v;
  }

  function blankFeatures() {
    const out = {};
    FEATURES.forEach(function (key) { out[key] = 0; });
    return out;
  }

  function isInput(kind) {
    return kind === 'move' || kind === 'down' || kind === 'scroll' || kind === 'key' || kind === 'submit';
  }

  function anchorTime(events, now, options) {
    const opts = options || {};
    if (Number.isFinite(opts.lastInputAt)) return opts.lastInputAt;
    let latest = null;
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i];
      if (e.t > now || !isInput(e.kind)) continue;
      if (latest === null || e.t > latest) latest = e.t;
    }
    if (latest !== null) return latest;
    if (Number.isFinite(opts.sessionStart)) return opts.sessionStart;
    return now;
  }

  function rollingFeatures(events, now, options) {
    const opts = options || {};
    const absent = !!opts.absent;
    const start = now - WINDOW_MS;
    const ev = events.filter(function (e) { return e.t >= start && e.t <= now; })
      .sort(function (a, b) { return a.t - b.t; });
    const moves = ev.filter(function (e) { return e.kind === 'move'; });

    let speedSum = 0;
    let speedN = 0;
    let reversals = 0;
    let path = 0;
    let nearMs = 0;
    let prevAngle = null;
    let sx = 0;
    let sy = 0;
    let sc = 0;
    const kept = [];

    for (let i = 0; i < moves.length; i += 1) {
      const p = moves[i];
      if (i === 0) {
        kept.push(p);
        sx += p.x;
        sy += p.y;
        sc += 1;
        continue;
      }
      const prev = moves[i - 1];
      const dt = (p.t - prev.t) / 1000;
      if (!(dt > 0) || dt > 0.2) {
        prevAngle = null;
        continue;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const dist = Math.hypot(dx, dy);
      path += dist;
      speedSum += dist / dt;
      speedN += 1;
      if (dist > 3) {
        const angle = Math.atan2(dy, dx);
        if (prevAngle !== null) {
          let turn = Math.abs(angle - prevAngle);
          if (turn > Math.PI) turn = 2 * Math.PI - turn;
          if (turn > Math.PI * 0.55) reversals += 1;
        }
        prevAngle = angle;
      }
      if (prev.near && dt < 0.4 && dist / dt < 80) nearMs += dt * 1000;
      kept.push(p);
      sx += p.x;
      sy += p.y;
      sc += 1;
    }

    let net = 0;
    let maxR = 0;
    if (kept.length >= 2) {
      const a = kept[0];
      const b = kept[kept.length - 1];
      net = Math.hypot(b.x - a.x, b.y - a.y);
      const cx = sx / sc;
      const cy = sy / sc;
      for (let i = 0; i < kept.length; i += 1) {
        maxR = Math.max(maxR, Math.hypot(kept[i].x - cx, kept[i].y - cy));
      }
    }

    let circle = 0;
    if (kept.length >= 8 && path > 100 && maxR > 6 && maxR < 110) {
      const closure = 1 - Math.min(1, net / path);
      const tight = 1 - Math.min(1, maxR / 110);
      const length = Math.min(1, path / 160);
      circle = clamp01(closure * (0.45 + 0.55 * tight) * length);
    }

    const downs = ev.filter(function (e) { return e.kind === 'down'; });
    let rageMembers = 0;
    for (let i = 0; i < downs.length; i += 1) {
      let neighbors = 0;
      for (let j = 0; j < downs.length; j += 1) {
        if (i === j) continue;
        if (Math.abs(downs[j].t - downs[i].t) <= 900 && Math.hypot(downs[j].x - downs[i].x, downs[j].y - downs[i].y) <= 28) {
          neighbors += 1;
        }
      }
      if (neighbors >= 2) rageMembers += 1;
    }

    const scrolls = ev.filter(function (e) { return e.kind === 'scroll' && Math.abs(e.dy) >= 1; });
    let scrollRevs = 0;
    let prevSign = 0;
    for (let i = 0; i < scrolls.length; i += 1) {
      const sign = scrolls[i].dy > 0 ? 1 : -1;
      if (prevSign && sign !== prevSign) scrollRevs += 1;
      prevSign = sign;
    }

    const keys = ev.filter(function (e) { return e.kind === 'key'; });
    let pairs = 0;
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i].key !== 'delete') continue;
      for (let j = i + 1; j < keys.length; j += 1) {
        if (keys[j].t - keys[i].t > 1600) break;
        if (keys[j].key === 'char') {
          pairs += 1;
          break;
        }
      }
    }

    let repeats = 0;
    for (let i = 0; i < ev.length; i += 1) {
      if (ev[i].kind === 'submit' && ev[i].valid === false && ev[i].repeated) repeats += 1;
    }

    const gap = now - anchorTime(events, now, opts);
    const features = {
      speed: clamp01((speedN ? speedSum / speedN : 0) / 750),
      shake: clamp01(reversals / 8),
      circle: circle,
      hover: clamp01(nearMs / 1600),
      rage: clamp01(rageMembers / 5),
      dead: clamp01(downs.filter(function (d) { return d.target === 'dead'; }).length / 4),
      disabled: clamp01(downs.filter(function (d) { return d.target === 'disabled'; }).length / 3),
      scroll: clamp01(scrollRevs / 4),
      retype: clamp01(pairs / 3),
      invalid: clamp01(repeats / 2),
      idle: absent ? 1 : clamp01((gap - 2000) / 5000),
      absent: absent ? 1 : 0,
    };
    return features;
  }

  function scoresFor(features) {
    const scores = {};
    MOODS.forEach(function (mood) {
      const row = MODEL[mood];
      let score = row.bias;
      FEATURES.forEach(function (key) {
        score += row[key] * (Number.isFinite(features[key]) ? features[key] : 0);
      });
      scores[mood] = score;
    });
    return scores;
  }

  function probabilities(features) {
    const scores = scoresFor(features);
    let max = -Infinity;
    MOODS.forEach(function (mood) { if (scores[mood] > max) max = scores[mood]; });
    const exps = MOODS.map(function (mood) { return Math.exp(scores[mood] - max); });
    const sum = exps.reduce(function (a, b) { return a + b; }, 0);
    const out = {};
    MOODS.forEach(function (mood, i) { out[mood] = exps[i] / sum; });
    return out;
  }

  function dominant(probs) {
    let best = MOODS[0];
    for (let i = 1; i < MOODS.length; i += 1) {
      if (probs[MOODS[i]] > probs[best]) best = MOODS[i];
    }
    return best;
  }

  function freshReading() {
    return { mood: 'neutral', strength: 0, pending: 'neutral', pendingFor: 0 };
  }

  function stepReading(prev, probs, dt, options) {
    const absent = !!(options && options.absent);
    const top = dominant(probs);
    if (absent) {
      return { mood: 'away', strength: 1, pending: 'away', pendingFor: 0 };
    }
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const pending = top;
    const pendingFor = top === prev.pending ? prev.pendingFor + step : step;
    let mood = prev.mood;
    let strength = prev.strength;
    if (top !== 'neutral' && probs[top] >= ALERT) {
      const need = (mood === 'neutral' || mood === top) ? RISE_MS : SWITCH_MS;
      if (mood === top || pendingFor >= need) {
        mood = top;
        strength = probs[top];
      }
    } else if (mood !== 'neutral' && pendingFor >= HOLD_MS && (top === 'neutral' || probs[mood] < RELEASE)) {
      mood = 'neutral';
      strength = 0;
    }
    return { mood: mood, strength: strength, pending: pending, pendingFor: pendingFor };
  }

  function adaptation(mood) {
    if (mood === 'frustrated') return 'explain-pay';
    if (mood === 'confused') return 'next-step';
    if (mood === 'lost') return 'find-setting';
    if (mood === 'away') return 'pause';
    return 'none';
  }

  return {
    WINDOW_MS: WINDOW_MS,
    STEP_MS: STEP_MS,
    ALERT: ALERT,
    RELEASE: RELEASE,
    RISE_MS: RISE_MS,
    SWITCH_MS: SWITCH_MS,
    HOLD_MS: HOLD_MS,
    MOODS: MOODS,
    FEATURES: FEATURES,
    MOOD_LABELS: MOOD_LABELS,
    FEATURE_LABELS: FEATURE_LABELS,
    MODEL: MODEL,
    blankFeatures: blankFeatures,
    rollingFeatures: rollingFeatures,
    scoresFor: scoresFor,
    probabilities: probabilities,
    dominant: dominant,
    freshReading: freshReading,
    stepReading: stepReading,
    adaptation: adaptation,
  };
});
