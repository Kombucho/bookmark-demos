(function () {
  const M = window.TextMorph;
  const amountReel = document.getElementById('amount');
  const visitorsReel = document.getElementById('visitors');
  const signupsReel = document.getElementById('signups');
  const revenueReel = document.getElementById('revenue');
  const statusEl = document.getElementById('status');
  const amountText = document.getElementById('amount-text');
  const statusText = document.getElementById('status-text');
  const metricsText = document.getElementById('metrics-text');
  const speed = document.getElementById('speed');
  const speedOut = document.getElementById('speed-out');
  const pauseBtn = document.getElementById('pause');
  const snapBtn = document.getElementById('snap');
  const hint = document.getElementById('hint');
  const measureCtx = document.createElement('canvas').getContext('2d');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let snap = reduce.matches;
  let paused = false;
  let timer = 0;
  let raf = 0;
  let tickCount = 0;
  const rng = M.mulberry32(964218);

  let money = 9642.18;
  let visitors = 12840;
  let signups = 326;
  let revenue = 4280;
  let phraseIndex = 0;

  const fields = [];

  function duration() {
    const v = Number(speed.value);
    return Math.round(1400 - (1400 - 160) * (v / 100));
  }

  function showSpeed() {
    const seconds = (duration() / 1000).toFixed(2);
    speedOut.textContent = seconds + 's';
    speed.setAttribute('aria-valuetext', seconds + ' seconds');
  }

  function showHint() {
    hint.textContent = snap
      ? 'Snap is on. The same changes cut.'
      : 'Travel is on. Digits roll by place, and shared letters slide.';
  }

  function fontOf(el) {
    const cs = getComputedStyle(el);
    return cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  }

  function makeMeasure(font) {
    measureCtx.font = font;
    const cache = new Map();
    return function (ch) {
      let w = cache.get(ch);
      if (w == null) {
        w = measureCtx.measureText(ch).width;
        if (!w) w = 0.6 * parseFloat(font);
        cache.set(ch, w);
      }
      return w;
    };
  }

  function maxDigit(measure) {
    let w = 0;
    '0123456789'.split('').forEach(function (ch) {
      w = Math.max(w, measure(ch));
    });
    return w || 10;
  }

  function placeColumns(columns, digitW, measure, anchorKey) {
    let x = 0;
    const placed = columns.map(function (col) {
      const sample = col.chars[col.chars.length - 1] || col.chars[0] || '';
      const full = col.kind === 'digit' ? digitW : Math.max(1, measure(sample));
      const w = full * Math.max(0, col.widthFactor);
      const item = {
        key: col.key,
        chars: col.chars,
        offset: col.offset,
        opacity: col.opacity,
        x: x,
        w: w,
      };
      x += w;
      return item;
    });
    let anchor = x / 2;
    if (anchorKey) {
      const dot = placed.find(function (col) { return col.key === anchorKey; });
      if (dot) anchor = dot.x + dot.w / 2;
    }
    return { placed: placed, anchor: anchor, width: x };
  }

  function syncColumns(reel, placed, anchor, line) {
    const existing = new Map();
    Array.from(reel.children).forEach(function (node) { existing.set(node.dataset.key, node); });
    const next = new Set();
    placed.placed.forEach(function (col) {
      next.add(col.key);
      let node = existing.get(col.key);
      if (!node) {
        node = document.createElement('span');
        node.className = 'col';
        node.dataset.key = col.key;
        const strip = document.createElement('span');
        strip.className = 'strip';
        node.appendChild(strip);
        reel.appendChild(node);
      }
      node.style.transform = 'translate(' + (col.x - anchor) + 'px, 0)';
      node.style.width = Math.max(0, col.w) + 'px';
      node.style.height = line + 'px';
      node.style.opacity = String(col.opacity);
      const strip = node.firstChild;
      const signature = col.chars.join('');
      if (strip.dataset.chars !== signature) {
        strip.textContent = '';
        strip.dataset.chars = signature;
        col.chars.forEach(function (ch) {
          const glyph = document.createElement('span');
          glyph.textContent = ch;
          strip.appendChild(glyph);
        });
      }
      Array.from(strip.children).forEach(function (glyph) {
        glyph.style.height = line + 'px';
        glyph.style.lineHeight = line + 'px';
      });
      strip.style.transform = 'translateY(' + (-col.offset * line) + 'px)';
    });
    existing.forEach(function (node, key) {
      if (!next.has(key)) node.remove();
    });
  }

  function drawNumber(reel, from, to, t, anchorKey) {
    const wrap = reel.parentElement;
    const columns = M.numberFrame(from, to, snap ? 1 : t);
    const metric = reel.classList.contains('metric');
    const max = metric ? 40 : 112;
    const min = metric ? 18 : 34;
    const box = wrap.clientWidth || 320;
    let size = Math.min(max, Math.max(min, box * (metric ? 0.28 : 0.15)));
    wrap.style.fontSize = size + 'px';
    let measure = makeMeasure(fontOf(wrap));
    let placed = placeColumns(columns, maxDigit(measure), measure, anchorKey);
    if (placed.width > box - 2 && placed.width > 0) {
      size = Math.max(min, size * ((box - 2) / placed.width));
      wrap.style.fontSize = size + 'px';
      measure = makeMeasure(fontOf(wrap));
      placed = placeColumns(columns, maxDigit(measure), measure, anchorKey);
    }
    const line = parseFloat(getComputedStyle(wrap).fontSize) || size;
    reel.style.height = line + 'px';
    syncColumns(reel, placed, placed.anchor, line);
    return M.readColumns(columns);
  }

  function drawPhrase(from, to, t) {
    const size = parseFloat(getComputedStyle(statusEl).fontSize) || 32;
    const travel = statusEl.clientHeight || size;
    const measure = makeMeasure(fontOf(statusEl));
    const glyphs = M.glyphFrame(from, to, measure, snap ? 1 : t, travel)
      .filter(function (g) { return g.opacity > 0.02; });
    while (statusEl.children.length < glyphs.length) {
      const node = document.createElement('span');
      node.className = 'glyph';
      statusEl.appendChild(node);
    }
    while (statusEl.children.length > glyphs.length) statusEl.removeChild(statusEl.lastChild);
    glyphs.forEach(function (g, i) {
      const node = statusEl.children[i];
      node.textContent = g.char;
      node.style.transform = 'translate(' + g.x + 'px, ' + g.y + 'px)';
      node.style.opacity = String(g.opacity);
    });
  }

  function field(draw) {
    const state = { from: '', to: '', started: 0, dur: 1, running: false, draw: draw };
    state.go = function (next) {
      if (next === state.to && !state.running) return;
      const elapsed = state.running ? (performance.now() - state.started) / state.dur : 1;
      state.from = !state.running || elapsed >= 0.45 ? state.to : state.from;
      if (!state.from) state.from = next;
      state.to = next;
      state.started = performance.now();
      state.dur = Math.max(1, duration());
      state.running = !snap;
      if (snap) state.draw(state.from, state.to, 1);
      else startLoop();
    };
    state.frame = function (now) {
      const t = snap ? 1 : Math.min(1, (now - state.started) / state.dur);
      state.draw(state.from, state.to, t);
      if (t >= 1) state.running = false;
      return state.running;
    };
    state.jump = function () {
      state.running = false;
      state.from = state.to;
      state.draw(state.to, state.to, 1);
    };
    fields.push(state);
    return state;
  }

  const moneyField = field(function (from, to, t) {
    drawNumber(amountReel, from, to, t, 'dot');
    amountText.textContent = to;
  });
  const visitorsField = field(function (from, to, t) {
    drawNumber(visitorsReel, from, to, t, null);
  });
  const signupsField = field(function (from, to, t) {
    drawNumber(signupsReel, from, to, t, null);
  });
  const revenueField = field(function (from, to, t) {
    drawNumber(revenueReel, from, to, t, 'dot');
  });
  const phraseField = field(function (from, to, t) {
    drawPhrase(from, to, t);
    statusText.textContent = to;
  });

  function writeMetrics() {
    metricsText.textContent = 'Visitors ' + M.formatCount(visitors)
      + '. Signups ' + M.formatCount(signups)
      + '. Revenue ' + M.formatMoney(revenue) + '.';
  }

  function startLoop() {
    if (raf) return;
    const loop = function (now) {
      let busy = false;
      fields.forEach(function (item) {
        if (item.running && item.frame(now)) busy = true;
      });
      raf = busy ? requestAnimationFrame(loop) : 0;
    };
    raf = requestAnimationFrame(loop);
  }

  function setMoney(next) { money = next; moneyField.go(M.formatMoney(money)); }
  function setVisitors(next) { visitors = next; visitorsField.go(M.formatCount(visitors)); writeMetrics(); }
  function setSignups(next) { signups = next; signupsField.go(M.formatCount(signups)); writeMetrics(); }
  function setRevenue(next) { revenue = next; revenueField.go(M.formatMoney(revenue)); writeMetrics(); }
  function setPhrase(index) {
    phraseIndex = (index + M.PHRASES.length) % M.PHRASES.length;
    phraseField.go(M.PHRASES[phraseIndex]);
  }

  function tick() {
    tickCount += 1;
    setMoney(M.stepMoney(money, rng));
    if (tickCount % 2 === 0) {
      setVisitors(M.stepCount(visitors, rng, 500, 800, 80000));
      setSignups(M.stepCount(signups, rng, 36, 12, 4000));
      setRevenue(M.stepMoney(revenue, rng, 80, 40000));
    }
    if (tickCount % 3 === 0) setPhrase(phraseIndex + 1);
  }

  function schedule() {
    window.clearInterval(timer);
    if (paused) return;
    timer = window.setInterval(tick, Math.max(900, duration() + 700));
  }

  function randomize() {
    setMoney(180 + rng() * 24000);
    setVisitors(Math.round(800 + rng() * 50000));
    setSignups(Math.round(12 + rng() * 2000));
    setRevenue(180 + rng() * 12000);
    const hop = 1 + Math.floor(rng() * (M.PHRASES.length - 1));
    setPhrase(phraseIndex + hop);
  }

  speed.addEventListener('input', function () {
    showSpeed();
    schedule();
  });

  pauseBtn.addEventListener('click', function () {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    schedule();
  });

  snapBtn.addEventListener('click', function () {
    snap = !snap;
    snapBtn.setAttribute('aria-pressed', snap ? 'true' : 'false');
    showHint();
    if (snap) fields.forEach(function (item) { item.jump(); });
  });

  document.getElementById('random').addEventListener('click', randomize);

  window.addEventListener('resize', function () {
    fields.forEach(function (item) {
      const t = item.running ? Math.min(1, (performance.now() - item.started) / item.dur) : 1;
      item.draw(item.from, item.to, t);
    });
  });

  if (snap) snapBtn.setAttribute('aria-pressed', 'true');
  showSpeed();
  showHint();
  moneyField.to = M.formatMoney(money);
  visitorsField.to = M.formatCount(visitors);
  signupsField.to = M.formatCount(signups);
  revenueField.to = M.formatMoney(revenue);
  phraseField.to = M.PHRASES[0];
  fields.forEach(function (item) { item.jump(); });
  writeMetrics();
  schedule();
})();
