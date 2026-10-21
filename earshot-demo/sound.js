// A small stand-in for earshot's bank, kit, and frame-timed sfx.
// Every tone is oscillators, noise, an envelope, and a filter.
// The preset names calm, crisp, and minimal are earshot's. These recipes are not.
// No model is called. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Earshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FRAMES = 96;
  const FPS = [12, 24, 30, 60];
  const ROLES = ['click', 'pop', 'whoosh', 'tick', 'hit', 'success', 'error'];

  const CUES = [
    { id: 'tick', frame: 12, align: 'onset', role: 'tick', label: 'The notch appears' },
    { id: 'whoosh', frame: 24, align: 'apex', role: 'whoosh', label: 'The bar arrives' },
    { id: 'pop', frame: 28, align: 'onset', role: 'pop', label: 'The ring reaches its apex' },
    { id: 'click', frame: 48, align: 'onset', role: 'click', label: 'OPEN settles' },
    { id: 'success', frame: 72, align: 'onset', role: 'success', label: 'The check completes' },
    { id: 'error', frame: 84, align: 'onset', role: 'error', label: 'The chip rejects' },
  ];

  // earshot's three kit presets. Numbers below are this page's, not the bank's.
  const CHARACTERS = {
    calm: {
      label: 'Calm',
      wave: 'sine',
      snap: 0.48,
      brightness: 0.34,
      noise: 0.22,
      dur: 1.25,
      midi: 57,
      note: 'Slow decays, a low root, little noise.',
    },
    crisp: {
      label: 'Crisp',
      wave: 'triangle',
      snap: 0.94,
      brightness: 0.82,
      noise: 0.62,
      dur: 0.68,
      midi: 74,
      note: 'Short attacks, a high root, more noise.',
    },
    minimal: {
      label: 'Minimal',
      wave: 'sine',
      snap: 0.8,
      brightness: 0.18,
      noise: 0.06,
      dur: 0.82,
      midi: 64,
      note: 'A narrow tone, almost no noise.',
    },
  };

  const LIBRARY = [
    sound('click.soft', 'Click, soft', 'click', 0.09, 0, [
      partial('sine', 1400, 480, 0.7, { attack: 0.002, decay: 0.07 }),
    ], null),
    sound('click.hard', 'Click, hard', 'click', 0.06, 0, [
      partial('square', 2200, 700, 0.45, { attack: 0.001, decay: 0.04 }),
    ], noise(0.2, { filterStart: 3000, filterEnd: 800, attack: 0.001, decay: 0.03 })),
    sound('pop.dry', 'Pop, dry', 'pop', 0.12, 0, [
      partial('sine', 620, 180, 0.65, { attack: 0.003, decay: 0.09 }),
    ], noise(0.12, { filterStart: 900, filterEnd: 200, attack: 0.002, decay: 0.05 })),
    sound('pop.round', 'Pop, round', 'pop', 0.16, 0, [
      partial('sine', 440, 220, 0.5, { attack: 0.006, decay: 0.12 }),
      partial('triangle', 880, 440, 0.15, { attack: 0.004, decay: 0.08 }),
    ], null),
    sound('tick.pin', 'Tick', 'tick', 0.03, 0, [
      partial('sine', 3200, 1800, 0.45, { attack: 0.001, decay: 0.02 }),
    ], null),
    sound('tick.glass', 'Tick, glass', 'tick', 0.07, 0, [
      partial('sine', 4200, 2600, 0.28, { attack: 0.001, decay: 0.05 }),
      partial('sine', 6300, 3900, 0.12, { attack: 0.001, decay: 0.04, delay: 0.004 }),
    ], null),
    sound('whoosh.short', 'Whoosh, short', 'whoosh', 0.36, 0.75, [], noise(0.75, {
      shape: 'bell', filterStart: 400, filterEnd: 3200,
    })),
    sound('whoosh.long', 'Whoosh, long', 'whoosh', 0.8, 0.75, [], noise(0.7, {
      shape: 'bell', filterStart: 240, filterEnd: 4200,
    })),
    sound('hit.thud', 'Hit', 'hit', 0.28, 0, [
      partial('sine', 140, 50, 0.7, { attack: 0.002, decay: 0.22 }),
    ], noise(0.4, { filterStart: 500, filterEnd: 120, attack: 0.001, decay: 0.1 })),
    sound('hit.snap', 'Hit, snap', 'hit', 0.14, 0, [
      partial('triangle', 180, 70, 0.55, { attack: 0.001, decay: 0.1 }),
    ], noise(0.45, { filterStart: 2500, filterEnd: 400, attack: 0.001, decay: 0.06 })),
    sound('success.fifth', 'Success, fifth', 'success', 0.36, 0, [
      partial('sine', 523.25, 523.25, 0.4, { attack: 0.008, decay: 0.28 }),
      partial('sine', 784.875, 784.875, 0.32, { attack: 0.008, decay: 0.24, delay: 0.09 }),
    ], null),
    sound('success.bell', 'Success, bell', 'success', 0.5, 0, [
      partial('sine', 880, 880, 0.35, { attack: 0.004, decay: 0.4 }),
      partial('sine', 1320, 1320, 0.12, { attack: 0.004, decay: 0.3 }),
    ], null),
    sound('error.fall', 'Error, fall', 'error', 0.32, 0, [
      partial('triangle', 440, 180, 0.4, { attack: 0.004, decay: 0.16 }),
      partial('square', 415, 110, 0.22, { attack: 0.002, decay: 0.2, delay: 0.08 }),
    ], null),
    sound('error.buzz', 'Error, buzz', 'error', 0.22, 0, [
      partial('square', 196, 92, 0.28, { attack: 0.002, decay: 0.18 }),
    ], noise(0.25, { filterStart: 800, filterEnd: 200, attack: 0.002, decay: 0.16 })),
    sound('toggle', 'Toggle', 'toggle', 0.1, 0, [
      partial('triangle', 660, 880, 0.4, { attack: 0.003, decay: 0.07 }),
    ], null),
    sound('shimmer', 'Shimmer', 'shimmer', 0.55, 0.4, [
      partial('sine', 1760, 1760, 0.16, { attack: 0.02, decay: 0.4, shape: 'bell', apex: 0.4 }),
      partial('sine', 2217, 2217, 0.08, { attack: 0.04, decay: 0.4, delay: 0.03, shape: 'bell', apex: 0.45 }),
    ], noise(0.08, { shape: 'bell', filterStart: 3000, filterEnd: 6000 })),
  ];

  function sound(id, name, role, duration, apex, partials, noiseSpec) {
    return {
      id: id,
      name: name,
      role: role,
      duration: duration,
      apex: apex,
      partials: partials,
      noise: noiseSpec,
    };
  }

  function partial(wave, freq, freqEnd, gain, extra) {
    const spec = extra || {};
    return {
      wave: wave,
      freq: freq,
      freqEnd: freqEnd,
      gain: gain,
      attack: spec.attack == null ? 0.005 : spec.attack,
      decay: spec.decay == null ? 0.1 : spec.decay,
      delay: spec.delay || 0,
      shape: spec.shape || 'exp',
      apex: spec.apex,
    };
  }

  function noise(amount, extra) {
    const spec = extra || {};
    return {
      amount: amount,
      seed: spec.seed || 0,
      shape: spec.shape || 'exp',
      filterStart: spec.filterStart == null ? 800 : spec.filterStart,
      filterEnd: spec.filterEnd == null ? spec.filterStart || 800 : spec.filterEnd,
      attack: spec.attack == null ? 0.005 : spec.attack,
      decay: spec.decay == null ? 0.2 : spec.decay,
    };
  }

  function hashString(value) {
    let h = 2166136261;
    const str = String(value);
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function noteName(hz) {
    const n = Math.round(12 * Math.log2(hz / 440) + 69);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pitch = ((n % 12) + 12) % 12;
    const octave = Math.floor(n / 12) - 1;
    return names[pitch] + octave;
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function easeOut(value) {
    const t = clamp01(value);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }

  function bell(t, duration, apex) {
    if (t < 0 || t > duration || duration <= 0) return 0;
    const a = clamp(apex == null ? 0.5 : apex, 0.02, 0.98);
    const u = t / duration;
    const x = u <= a ? u / a : (1 - u) / (1 - a);
    return Math.sin(x * Math.PI / 2);
  }

  function expEnv(t, attack, decay, duration) {
    if (t < 0 || t >= duration) return 0;
    const a = Math.max(attack, 0.0005);
    if (t < a) return t / a;
    const d = Math.max(decay, 0.001);
    const u = (t - a) / d;
    if (u >= 1) return 0;
    return Math.exp(-3.5 * u);
  }

  function osc(wave, phase) {
    const p = phase - Math.floor(phase);
    if (wave === 'triangle') return 1 - 4 * Math.abs(p - 0.5);
    if (wave === 'square') return p < 0.5 ? 0.7 : -0.7;
    if (wave === 'saw') return 2 * p - 1;
    return Math.sin(2 * Math.PI * p);
  }

  function noiseSeries(seed, length) {
    let x = (seed >>> 0) || 1;
    const out = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      x = (Math.imul(1664525, x) + 1013904223) >>> 0;
      out[i] = (x / 4294967296) * 2 - 1;
    }
    return out;
  }

  function noiseSeed(recipe) {
    if (recipe.noise && recipe.noise.seed) return recipe.noise.seed >>> 0;
    return hashString(recipe.id || 'noise') || 1;
  }

  function partialEnv(part, t, duration, recipeApex) {
    const delay = part.delay || 0;
    const tt = t - delay;
    const dur = duration - delay;
    if (tt < 0 || tt >= dur || dur <= 0) return 0;
    if (part.shape === 'bell') {
      const apex = part.apex == null ? recipeApex : part.apex;
      return bell(tt, dur, apex) * part.gain;
    }
    return expEnv(tt, part.attack, part.decay, dur) * part.gain;
  }

  function envelopeAt(recipe, t) {
    let sum = 0;
    const apex = recipe.apex == null ? 0.5 : recipe.apex;
    (recipe.partials || []).forEach(function (part) {
      sum += partialEnv(part, t, recipe.duration, apex);
    });
    if (recipe.noise && recipe.noise.amount) {
      sum += partialEnv({
        gain: recipe.noise.amount,
        delay: 0,
        shape: recipe.noise.shape || 'exp',
        apex: apex,
        attack: recipe.noise.attack,
        decay: recipe.noise.decay,
      }, t, recipe.duration, apex);
    }
    return sum;
  }

  function renderPreview(recipe, sampleRate) {
    const rate = sampleRate || 44100;
    const n = Math.max(1, Math.round(recipe.duration * rate));
    const out = new Float32Array(n);
    const partials = recipe.partials || [];
    const phase = partials.map(function () { return 0; });
    const nz = recipe.noise && recipe.noise.amount > 0 ? recipe.noise : null;
    const series = nz ? noiseSeries(noiseSeed(recipe), n) : null;
    let low = 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / rate;
      let sample = 0;
      for (let p = 0; p < partials.length; p += 1) {
        const part = partials[p];
        const delay = part.delay || 0;
        const tt = t - delay;
        const dur = recipe.duration - delay;
        if (tt < 0 || tt >= dur || dur <= 0) continue;
        const env = part.shape === 'bell'
          ? bell(tt, dur, part.apex == null ? recipe.apex : part.apex)
          : expEnv(tt, part.attack, part.decay, dur);
        const end = part.freqEnd == null ? part.freq : part.freqEnd;
        const glide = part.freq + (end - part.freq) * (tt / dur);
        sample += osc(part.wave, phase[p]) * env * part.gain;
        phase[p] += glide / rate;
      }
      if (series) {
        const env = nz.shape === 'bell'
          ? bell(t, recipe.duration, recipe.apex == null ? 0.5 : recipe.apex)
          : expEnv(t, nz.attack, nz.decay, recipe.duration);
        const u = recipe.duration <= 0 ? 0 : t / recipe.duration;
        const cutoff = Math.max(60, nz.filterStart + (nz.filterEnd - nz.filterStart) * u);
        const dt = 1 / rate;
        const alpha = dt / (dt + 1 / (2 * Math.PI * cutoff));
        low += alpha * (series[i] - low);
        sample += (series[i] - low) * env * nz.amount;
      }
      out[i] = sample;
    }
    return out;
  }

  function apexTime(recipe, sampleRate) {
    const rate = sampleRate || 44100;
    const n = Math.max(1, Math.round(recipe.duration * rate));
    let best = -1;
    let at = 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / rate;
      const env = envelopeAt(recipe, t);
      if (env > best) {
        best = env;
        at = t;
      }
    }
    return at;
  }

  function drawData(recipe, buckets, sampleRate) {
    const rate = sampleRate || 22050;
    const samples = renderPreview(recipe, rate);
    const count = buckets || 128;
    const wave = new Array(count);
    const env = new Array(count);
    const size = samples.length / count;
    let waveMax = 0;
    let envMax = 0;
    for (let b = 0; b < count; b += 1) {
      let max = 0;
      const from = Math.floor(b * size);
      const to = Math.max(from + 1, Math.floor((b + 1) * size));
      for (let i = from; i < to && i < samples.length; i += 1) {
        max = Math.max(max, Math.abs(samples[i]));
      }
      wave[b] = max;
      env[b] = envelopeAt(recipe, ((b + 0.5) / count) * recipe.duration);
      waveMax = Math.max(waveMax, max);
      envMax = Math.max(envMax, env[b]);
    }
    return {
      wave: wave,
      env: env,
      waveMax: waveMax,
      envMax: envMax,
      duration: recipe.duration,
      apex: recipe.apex || 0,
    };
  }

  function library() {
    return LIBRARY;
  }

  function libraryById(id) {
    for (let i = 0; i < LIBRARY.length; i += 1) {
      if (LIBRARY[i].id === id) return LIBRARY[i];
    }
    return null;
  }

  function kitFromSeed(character, seed) {
    const spec = CHARACTERS[character];
    if (!spec) throw new Error('Unknown character');
    const n = seed >>> 0;
    if (!n) throw new Error('Seed must be a positive integer');
    const root = midiToHz(spec.midi + (n % 7) - 3);
    const bright = clamp(spec.brightness + ((n % 5) - 2) * 0.04, 0.05, 0.95);
    const whooshDur = Math.min(0.48, 0.5 * spec.dur);

    function seedFor(role) {
      return hashString(character + ':' + n + ':' + role) || 1;
    }

    function pack(role, name, duration, apex, partials, noiseSpec) {
      return {
        id: 'kit.' + role + '.' + character + '.' + n,
        name: name,
        role: role,
        root: root,
        duration: duration,
        apex: apex,
        partials: partials,
        noise: noiseSpec,
      };
    }

    const click = pack('click', 'Click', 0.05 * spec.dur / spec.snap, 0, [
      partial(spec.wave, root * 4, root * 2, 0.55, { attack: 0.001, decay: 0.04 * spec.dur }),
    ], noise(0.16 * spec.noise, {
      seed: seedFor('click'),
      filterStart: 1800 + bright * 4000,
      filterEnd: 400 + bright * 600,
      attack: 0.001,
      decay: 0.03,
    }));

    const pop = pack('pop', 'Pop', 0.11 * spec.dur, 0, [
      partial(spec.wave === 'triangle' ? 'sine' : spec.wave, root * 2.2, root * 0.85, 0.5, {
        attack: 0.003,
        decay: 0.08 * spec.dur,
      }),
    ], noise(0.14 * spec.noise, {
      seed: seedFor('pop'),
      filterStart: 700 + bright * 1200,
      filterEnd: 180,
      attack: 0.002,
      decay: 0.05 * spec.dur,
    }));

    const whoosh = pack('whoosh', 'Whoosh', whooshDur, 0.75, [], noise(0.55 * (0.25 + spec.noise), {
      seed: seedFor('whoosh'),
      shape: 'bell',
      filterStart: 280 + bright * 500,
      filterEnd: 1600 + bright * 5200,
    }));

    const tick = pack('tick', 'Tick', Math.min(0.04, 0.018 + 0.012 * spec.dur), 0, [
      partial('sine', root * 6, root * 4, 0.4, { attack: 0.001, decay: 0.02 }),
    ], null);

    const hit = pack('hit', 'Hit', 0.18 * spec.dur, 0, [
      partial('sine', root / 2, root / 4, 0.6, { attack: 0.002, decay: 0.14 * spec.dur }),
    ], noise(0.3 * spec.noise + 0.05, {
      seed: seedFor('hit'),
      filterStart: 200,
      filterEnd: 700 + bright * 800,
      attack: 0.001,
      decay: 0.08 * spec.dur,
    }));

    const tonal = spec.wave === 'square' ? 'triangle' : spec.wave;
    const successDur = Math.min(0.36, 0.32 * spec.dur);
    const success = pack('success', 'Success', successDur, 0, [
      partial(tonal, root, root, 0.4, { attack: 0.01, decay: 0.24 * spec.dur }),
      partial(tonal, root * 1.5, root * 1.5, 0.34, {
        attack: 0.01,
        decay: 0.22 * spec.dur,
        delay: 0.09 * spec.dur,
      }),
    ], null);

    const errorDur = Math.min(0.18, 0.3 * spec.dur);
    const error = pack('error', 'Error', errorDur, 0, [
      partial(tonal, root * (16 / 15), root * 0.5, 0.38, { attack: 0.004, decay: 0.16 * spec.dur }),
      partial('triangle', root * 0.5, root * 0.25, 0.28, {
        attack: 0.002,
        decay: 0.18 * spec.dur,
        delay: 0.07 * spec.dur,
      }),
    ], noise(0.12 * spec.noise, {
      seed: seedFor('error'),
      filterStart: 600,
      filterEnd: 140,
      attack: 0.002,
      decay: 0.12 * spec.dur,
    }));

    return {
      character: character,
      label: spec.label,
      note: spec.note,
      seed: n,
      rootHz: root,
      rootName: noteName(root),
      wave: spec.wave,
      brightness: bright,
      snap: spec.snap,
      sounds: {
        click: click,
        pop: pop,
        whoosh: whoosh,
        tick: tick,
        hit: hit,
        success: success,
        error: error,
      },
    };
  }

  function scheduleCue(cue, recipe, fps) {
    const rate = Number(fps);
    if (!rate || rate <= 0) throw new Error('fps');
    const hit = cue.frame / rate;
    const apexSec = (recipe.apex == null ? 0 : recipe.apex) * recipe.duration;
    const start = cue.align === 'apex' ? hit - apexSec : hit;
    return {
      id: cue.id,
      frame: cue.frame,
      align: cue.align,
      role: cue.role,
      label: cue.label,
      hit: hit,
      start: start,
      end: start + recipe.duration,
      apexAt: start + apexSec,
    };
  }

  function score(kit, fps) {
    return CUES.map(function (cue) {
      return scheduleCue(cue, kit.sounds[cue.role], fps);
    });
  }

  function letterLevel(frame, index) {
    const start = 36 + index * 2;
    const end = 42 + index * 2;
    if (frame <= start) return 0;
    if (frame >= end) return 1;
    return easeOut((frame - start) / (end - start));
  }

  function discScale(frame) {
    if (frame < 20) return 0;
    if (frame < 28) return easeOut((frame - 20) / 8) * 1.12;
    if (frame < 36) return 1.12 - 0.12 * easeOut((frame - 28) / 8);
    return 1;
  }

  function pose(frame) {
    const f = ((frame % FRAMES) + FRAMES) % FRAMES;
    const letters = [0, 1, 2, 3].map(function (index) { return letterLevel(f, index); });
    return {
      frame: f,
      bar: easeOut(f / 24),
      tick: f >= 12,
      disc: discScale(f),
      letters: letters,
      wordSettled: f >= 48 && letters.every(function (level) { return level === 1; }),
      check: f < 60 ? 0 : clamp01((f - 60) / 12),
      reject: f >= 84 && f < 92,
    };
  }

  function playRecipe(ctx, recipe, when) {
    const t0 = when == null ? ctx.currentTime : when;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.34, t0);
    master.connect(ctx.destination);
    const nodes = [];

    function stop() {
      const at = ctx.currentTime;
      try { master.gain.cancelScheduledValues(at); } catch (err) { /* already stopped */ }
      master.gain.setValueAtTime(0.0001, at);
      nodes.forEach(function (node) {
        try { node.stop(at); } catch (err) { /* already stopped */ }
      });
      try { master.disconnect(); } catch (err) { /* already stopped */ }
    }

    (recipe.partials || []).forEach(function (part) {
      const oscNode = ctx.createOscillator();
      const wave = part.wave === 'saw' ? 'sawtooth' : (part.wave || 'sine');
      oscNode.type = wave;
      const delay = part.delay || 0;
      const start = t0 + delay;
      const dur = Math.max(0.02, recipe.duration - delay);
      const attack = Math.min(Math.max(0.002, part.attack || 0.005), dur * 0.45);
      oscNode.frequency.setValueAtTime(Math.max(1, part.freq), start);
      if (part.freqEnd && part.freqEnd !== part.freq) {
        oscNode.frequency.linearRampToValueAtTime(Math.max(1, part.freqEnd), start + dur);
      }
      const gain = ctx.createGain();
      const peak = Math.max(0.0008, part.gain || 0.2);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      oscNode.connect(gain);
      gain.connect(master);
      oscNode.start(start);
      oscNode.stop(start + dur + 0.03);
      nodes.push(oscNode);
    });

    if (recipe.noise && recipe.noise.amount > 0) {
      const rate = ctx.sampleRate;
      const count = Math.max(1, Math.round(recipe.duration * rate));
      const buffer = ctx.createBuffer(1, count, rate);
      const data = buffer.getChannelData(0);
      const series = noiseSeries(noiseSeed(recipe), count);
      const nz = recipe.noise;
      let low = 0;
      for (let i = 0; i < count; i += 1) {
        const t = i / rate;
        const u = recipe.duration <= 0 ? 0 : t / recipe.duration;
        const cutoff = Math.max(60, nz.filterStart + (nz.filterEnd - nz.filterStart) * u);
        const dt = 1 / rate;
        const alpha = dt / (dt + 1 / (2 * Math.PI * cutoff));
        low += alpha * (series[i] - low);
        const env = nz.shape === 'bell'
          ? bell(t, recipe.duration, recipe.apex == null ? 0.5 : recipe.apex)
          : expEnv(t, nz.attack, nz.decay, recipe.duration);
        data[i] = (series[i] - low) * env;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0008, nz.amount), t0);
      source.connect(gain);
      gain.connect(master);
      source.start(t0);
      source.stop(t0 + recipe.duration + 0.02);
      nodes.push(source);
    }

    return { stop: stop };
  }

  return {
    FRAMES: FRAMES,
    FPS: FPS,
    ROLES: ROLES,
    CUES: CUES,
    CHARACTERS: CHARACTERS,
    LIBRARY: LIBRARY,
    library: library,
    libraryById: libraryById,
    kitFromSeed: kitFromSeed,
    scheduleCue: scheduleCue,
    score: score,
    pose: pose,
    renderPreview: renderPreview,
    envelopeAt: envelopeAt,
    apexTime: apexTime,
    drawData: drawData,
    noiseSeries: noiseSeries,
    noteName: noteName,
    hashString: hashString,
    playRecipe: playRecipe,
  };
});
