// Place-value digit rolls and a per-character slide.
// The idea is Torph’s (text continuity). This file is not that package.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TextMorph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PHRASES = [
    'Running late, be there soon.',
    'On my way.',
    'Just arrived.',
    'Looking for the door.',
    'Upstairs, second room.',
  ];

  function clamp01(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
  }

  function ease(t) {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function groupInt(whole) {
    const s = String(Math.trunc(Math.abs(whole)));
    const parts = [];
    for (let i = s.length; i > 0; i -= 3) {
      parts.unshift(s.slice(Math.max(0, i - 3), i));
    }
    return parts.join(',');
  }

  function formatCount(value) {
    return groupInt(Math.round(Math.abs(value)));
  }

  function moneyCents(value) {
    const neg = value < 0;
    const cents = Math.round((Math.abs(value) + 1e-8) * 100);
    return neg ? -cents : cents;
  }

  function formatMoney(value) {
    const cents = moneyCents(value);
    const neg = cents < 0;
    const abs = Math.abs(cents);
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');
    return (neg ? '-' : '') + '$' + groupInt(whole) + '.' + frac;
  }

  function parseFormatted(str) {
    let rest = str;
    let sign = '';
    if (rest.charAt(0) === '-') {
      sign = '-';
      rest = rest.slice(1);
    }
    let prefix = '';
    if (rest.charAt(0) === '$') {
      prefix = '$';
      rest = rest.slice(1);
    }
    const dot = rest.indexOf('.');
    const intPart = dot === -1 ? rest : rest.slice(0, dot);
    const fracPart = dot === -1 ? null : rest.slice(dot + 1);
    const digits = intPart.replace(/,/g, '');
    return {
      sign: sign,
      prefix: prefix,
      intDigits: digits.split('').reverse(),
      fracDigits: fracPart === null ? null : fracPart.split(''),
    };
  }

  function tokensOf(str) {
    const parts = parseFormatted(str);
    const tokens = [];
    if (parts.sign) tokens.push({ key: 'sign', ch: '-', kind: 'sign' });
    if (parts.prefix) tokens.push({ key: 'prefix', ch: parts.prefix, kind: 'prefix' });
    const digits = parts.intDigits;
    const n = digits.length;
    for (let i = n - 1; i >= 0; i--) {
      if (i % 3 === 2 && i !== n - 1) {
        tokens.push({ key: 'sep:' + (i + 1), ch: ',', kind: 'sep' });
      }
      tokens.push({ key: 'int:' + i, ch: digits[i], kind: 'digit' });
    }
    if (parts.fracDigits) {
      tokens.push({ key: 'dot', ch: '.', kind: 'dot' });
      for (let i = 0; i < parts.fracDigits.length; i++) {
        tokens.push({ key: 'frac:' + i, ch: parts.fracDigits[i], kind: 'digit' });
      }
    }
    return tokens;
  }

  function numericValue(str) {
    const parts = parseFormatted(str);
    const int = parts.intDigits.slice().reverse().join('') || '0';
    const frac = parts.fracDigits ? '.' + parts.fracDigits.join('') : '';
    const n = Number(int + frac);
    return parts.sign === '-' ? -n : n;
  }

  function mergeTokens(oldTokens, newTokens) {
    const oldIndex = new Map(oldTokens.map(function (tok, i) { return [tok.key, i]; }));
    const newKeys = new Set(newTokens.map(function (tok) { return tok.key; }));
    const merged = [];
    let prevOld = -1;
    newTokens.forEach(function (token) {
      if (oldIndex.has(token.key)) {
        const idx = oldIndex.get(token.key);
        for (let i = prevOld + 1; i < idx; i++) {
          if (!newKeys.has(oldTokens[i].key)) merged.push(Object.assign({ exit: true }, oldTokens[i]));
        }
        prevOld = idx;
      }
      merged.push(token);
    });
    for (let i = prevOld + 1; i < oldTokens.length; i++) {
      if (!newKeys.has(oldTokens[i].key)) merged.push(Object.assign({ exit: true }, oldTokens[i]));
    }
    return merged;
  }

  function roll(from, to, dir) {
    const seq = [from];
    let d = Number(from);
    const target = Number(to);
    for (let guard = 0; guard < 10 && d !== target; guard++) {
      d = (d + dir + 10) % 10;
      seq.push(String(d));
    }
    return seq;
  }

  function column(tok, chars, offset, widthFactor, opacity, phase) {
    return {
      key: tok.key,
      kind: tok.kind,
      chars: chars,
      offset: offset,
      widthFactor: widthFactor,
      opacity: opacity,
      phase: phase,
    };
  }

  function numberFrame(oldStr, newStr, t) {
    const k = ease(t);
    const oldTokens = tokensOf(oldStr);
    const newTokens = tokensOf(newStr);
    const dir = numericValue(newStr) >= numericValue(oldStr) ? 1 : -1;
    const oldBy = new Map(oldTokens.map(function (tok) { return [tok.key, tok]; }));
    const newBy = new Map(newTokens.map(function (tok) { return [tok.key, tok]; }));
    return mergeTokens(oldTokens, newTokens).map(function (tok) {
      if (tok.exit) return column(tok, [tok.ch], 0, 1 - k, 1 - k, 'exit');
      const prev = oldBy.get(tok.key);
      const next = newBy.get(tok.key);
      if (!prev) return column(tok, [tok.ch], 0, k, k, 'enter');
      if (prev.ch === next.ch) return column(next, [next.ch], 0, 1, 1, 'steady');
      if (prev.kind === 'digit' && next.kind === 'digit') {
        const chars = roll(prev.ch, next.ch, dir);
        return column(next, chars, (chars.length - 1) * k, 1, 1, 'roll');
      }
      return column(next, [prev.ch, next.ch], k, 1, 1, 'roll');
    });
  }

  function readColumns(columns) {
    let out = '';
    columns.forEach(function (col) {
      if (col.widthFactor < 0.5 || col.opacity < 0.5) return;
      const i = Math.max(0, Math.min(col.chars.length - 1, Math.round(col.offset)));
      out += col.chars[i];
    });
    return out;
  }

  function matchChars(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const matches = [];
    const matchedOld = new Set();
    const matchedNew = new Set();
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        matches.push({ oldIndex: i, newIndex: j, char: a[i] });
        matchedOld.add(i);
        matchedNew.add(j);
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
    const removed = [];
    const added = [];
    for (let k = 0; k < n; k++) if (!matchedOld.has(k)) removed.push(k);
    for (let k = 0; k < m; k++) if (!matchedNew.has(k)) added.push(k);
    return { matches: matches, removed: removed, added: added };
  }

  function layout(str, measure) {
    const xs = [];
    let x = 0;
    for (let i = 0; i < str.length; i++) {
      xs.push(x);
      x += measure(str[i]);
    }
    return { xs: xs, width: x };
  }

  function glyphFrame(oldStr, newStr, measure, t, travel) {
    const k = ease(t);
    const plan = matchChars(oldStr, newStr);
    const oldL = layout(oldStr, measure);
    const newL = layout(newStr, measure);
    const glyphs = [];
    plan.matches.forEach(function (item) {
      const x0 = oldL.xs[item.oldIndex] - oldL.width / 2;
      const x1 = newL.xs[item.newIndex] - newL.width / 2;
      glyphs.push({
        char: item.char,
        x: x0 + (x1 - x0) * k,
        y: 0,
        opacity: 1,
        role: 'keep',
      });
    });
    plan.removed.forEach(function (index) {
      glyphs.push({
        char: oldStr[index],
        x: oldL.xs[index] - oldL.width / 2,
        y: (-travel * k) || 0,
        opacity: 1 - k,
        role: 'exit',
      });
    });
    plan.added.forEach(function (index) {
      glyphs.push({
        char: newStr[index],
        x: newL.xs[index] - newL.width / 2,
        y: travel * (1 - k),
        opacity: k,
        role: 'enter',
      });
    });
    return glyphs;
  }

  function shownText(glyphs) {
    return glyphs
      .filter(function (g) { return g.opacity >= 0.5; })
      .slice()
      .sort(function (a, b) { return a.x - b.x; })
      .map(function (g) { return g.char; })
      .join('');
  }

  function stepMoney(value, rng, min, max) {
    const lo = min == null ? 40 : min;
    const hi = max == null ? 80000 : max;
    const roll = rng();
    let next;
    if (roll < 0.14) next = value + (rng() < 0.5 ? -1 : 1) * (700 + rng() * 2800);
    else if (roll < 0.38) next = value + (rng() - 0.46) * 360;
    else next = value + (rng() - 0.48) * 18;
    next = Math.round(next * 100) / 100;
    if (next < lo) next = Math.round((lo + rng() * Math.min(400, hi - lo)) * 100) / 100;
    if (next > hi) next = Math.round((hi - rng() * Math.min(1000, hi - lo)) * 100) / 100;
    return next;
  }

  function stepCount(value, rng, scale, min, max) {
    let next = Math.round(value + (rng() - 0.42) * scale);
    if (rng() < 0.16) next = Math.round(min + rng() * (max - min));
    if (next < min) next = min;
    if (next > max) next = max;
    return next;
  }

  return {
    PHRASES: PHRASES,
    ease: ease,
    mulberry32: mulberry32,
    formatCount: formatCount,
    formatMoney: formatMoney,
    tokensOf: tokensOf,
    numericValue: numericValue,
    numberFrame: numberFrame,
    readColumns: readColumns,
    matchChars: matchChars,
    glyphFrame: glyphFrame,
    shownText: shownText,
    roll: roll,
    stepMoney: stepMoney,
    stepCount: stepCount,
  };
});
