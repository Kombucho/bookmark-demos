(function () {
  const S = window.SpringUI;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motion.matches;

  const params = {
    k: S.PRESETS.right.k,
    c: S.PRESETS.right.c,
    m: S.PRESETS.right.m,
    mode: 'spring',
  };
  let activePreset = 'right';
  let writing = false;

  const toggle = S.create(0, 0);
  const save = S.create(0, 0);
  const opener = S.create(0, 0);
  const keep = S.create(0, 0);
  const discardSpring = S.create(0, 0);
  const cardX = S.create(0, 0);
  const cardY = S.create(0, 0);
  const tab = S.create(0, 0);
  const sheet = S.create(0, 0);

  const laneIds = ['stiff', 'right', 'wobbly', 'linear'];
  const lanes = laneIds.map(function (id) {
    return {
      id: id,
      preset: S.PRESETS[id],
      spring: S.create(0, 0),
      track: document.getElementById('track-' + id),
      knob: document.getElementById('knob-' + id),
      half: 40,
    };
  });

  const driven = [toggle, save, opener, keep, discardSpring, cardX, cardY, tab, sheet];

  const lamp = document.getElementById('lamp');
  const lampTrack = document.getElementById('lamp-track');
  const lampKnob = document.getElementById('lamp-knob');
  const saveBtn = document.getElementById('save');
  const openBtn = document.getElementById('open-sheet');
  const closeBtn = document.getElementById('close-sheet');
  const discardBtn = document.getElementById('discard');
  const card = document.getElementById('card');
  const cardStage = document.getElementById('card-stage');
  const tablist = document.getElementById('tablist');
  const indicator = document.getElementById('indicator');
  const numStrip = document.getElementById('num-strip');
  const panel = document.getElementById('tabpanel');
  const tabs = [0, 1, 2].map(function (i) { return document.getElementById('tab-' + i); });
  const sheetEl = document.getElementById('sheet');
  const scrim = document.getElementById('scrim');
  const plotCanvas = document.getElementById('plot');
  const motionNote = document.getElementById('motion-note');
  const kInput = document.getElementById('k');
  const cInput = document.getElementById('c');
  const mInput = document.getElementById('m');

  const TAB_COPY = [
    'The mark takes a short trip and sits on Quiet.',
    'Soft is the middle seat. The mark can slide past it.',
    'Loud is the far end, so the overshoot has room to show.',
  ];

  const metrics = {
    toggleTravel: 72,
    tabSlot: 80,
    numH: 56,
    cardUnitX: 80,
    cardUnitY: 36,
    sheetH: 300,
  };

  const textCache = new Map();
  function setText(id, value) {
    const next = String(value);
    if (textCache.get(id) === next) return;
    textCache.set(id, next);
    const node = document.getElementById(id);
    if (node) node.textContent = next;
  }

  const PLOT_N = 180;
  const plot = new Float32Array(PLOT_N);
  let plotHead = 0;
  let plotCount = 0;
  let plotAcc = 0;
  let watchKind = 'lane';
  let watch = {
    name: 'Just right',
    error: function () { return lanes[1].spring.x - lanes[1].spring.target; },
    velocity: function () { return lanes[1].spring.v; },
  };
  let phase = 'idle';
  let overshoot = 0;
  let prevErr = 0;
  let seenOvershoot = false;

  function resetPlot() {
    plotCount = 0;
    plotHead = 0;
    plotAcc = 0;
  }

  function resetGesture() {
    phase = 'idle';
    overshoot = 0;
    prevErr = 0;
    seenOvershoot = false;
  }

  function pushPlot(value) {
    plot[plotHead] = value;
    plotHead = (plotHead + 1) % PLOT_N;
    if (plotCount < PLOT_N) plotCount += 1;
  }

  function plotAt(i) {
    const start = (plotHead - plotCount + PLOT_N) % PLOT_N;
    return plot[(start + i) % PLOT_N];
  }

  function follow(name, errorFn, velocityFn, kind) {
    if (watch.name !== name) {
      watch.name = name;
      resetPlot();
      resetGesture();
      setText('plot-name', name);
    }
    watch.error = errorFn;
    watch.velocity = velocityFn;
    watchKind = kind;
    kick();
  }

  function followState(name, state) {
    follow(name, function () { return state.x - state.target; }, function () { return state.v; }, 'control');
  }

  function followCard() {
    follow('Card', function () {
      const ex = cardX.x - cardX.target;
      const ey = cardY.x - cardY.target;
      return Math.abs(ex) >= Math.abs(ey) ? ex : ey;
    }, function () {
      return Math.hypot(cardX.v, cardY.v);
    }, 'control');
  }

  function trackGesture(err, velocity) {
    const mag = Math.abs(err);
    if ((phase === 'idle' || phase === 'done') && mag > 0.06) {
      phase = 'travel';
      overshoot = 0;
      seenOvershoot = false;
    } else if (phase === 'travel' && (prevErr * err < 0 || mag < 0.02)) {
      phase = 'settle';
    } else if (phase === 'settle') {
      if (mag > overshoot) overshoot = mag;
      seenOvershoot = true;
      if (mag < 0.012 && Math.abs(velocity) < 0.04) phase = 'done';
    }
    prevErr = err;
  }

  function nearly(a, b) {
    return Math.abs(a - b) < 0.011;
  }

  function matchPreset() {
    if (params.mode === 'linear') return 'linear';
    for (let i = 0; i < laneIds.length; i++) {
      const id = laneIds[i];
      if (id === 'linear') continue;
      const preset = S.PRESETS[id];
      if (nearly(params.k, preset.k) && nearly(params.c, preset.c) && nearly(params.m, preset.m)) return id;
    }
    return null;
  }

  function regimeText() {
    if (params.mode === 'linear') {
      return 'Linear. It moves at a steady rate and stops on the target. A slider switches this back to a spring.';
    }
    const zeta = S.dampingRatio(params.k, params.c, params.m);
    const name = S.regime(zeta);
    const figure = 'ζ ' + zeta.toFixed(2);
    if (name === 'underdamped') return 'Underdamped · ' + figure + '. It passes the target, then settles.';
    if (name === 'critical') return 'Critical · ' + figure + '. It reaches the target without a bounce.';
    return 'Overdamped · ' + figure + '. It eases in and does not pass the target.';
  }

  function syncReadouts() {
    setText('k-out', String(Math.round(params.k)));
    setText('c-out', params.c.toFixed(1));
    setText('m-out', params.m.toFixed(2));
    setText('regime', regimeText());
    const buttons = document.querySelectorAll('.presets button');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].dataset.preset === activePreset ? 'true' : 'false');
    }
  }

  function readSliders() {
    params.k = Number(kInput.value);
    params.c = Number(cInput.value);
    params.m = Number(mInput.value);
    if (params.mode === 'linear') params.mode = 'spring';
    activePreset = matchPreset();
    syncReadouts();
  }

  function advance(state, dt, preset) {
    if (state.hold) return;
    if (reduce) {
      state.x = state.target;
      state.v = 0;
      state.a = 0;
      return;
    }
    const next = S.integrate(state, dt, preset || params);
    state.x = next.x;
    state.v = next.v;
    state.a = next.a;
  }

  function resting(state) {
    return Math.abs(state.x - state.target) < 0.004 && Math.abs(state.v) < 0.03;
  }

  let running = false;
  let last = 0;
  let idle = 0;
  let dragging = false;
  let saveHeld = false;
  let sheetPhase = 'closed';
  let sheetDrag = null;
  let cardDrag = null;

  function kick() {
    idle = 0;
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function replayLanes() {
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      lane.spring.target = 0;
      lane.spring.v = 0;
      lane.spring.x = reduce ? 0 : 1;
    }
    if (watchKind === 'lane') {
      resetPlot();
      resetGesture();
    }
    kick();
  }

  function demonstrate() {
    replayLanes();
    if (reduce || dragging) return;
    toggle.x = toggle.target > 0.5 ? 0 : 1;
    toggle.v = 0;
    if (!saveHeld) {
      save.x = -1;
      save.v = 0;
      save.target = 0;
    }
    cardX.hold = false;
    cardY.hold = false;
    cardX.x = 0.9;
    cardX.v = 0;
    cardX.target = 0;
    cardY.x = -0.22;
    cardY.v = 0;
    cardY.target = 0;
    tab.x = tab.target + (tab.target < 1.5 ? 0.75 : -0.75);
    tab.v = 0;
    followState('Toggle', toggle);
    resetPlot();
    resetGesture();
  }

  function applyPreset(id) {
    const preset = S.PRESETS[id];
    writing = true;
    kInput.value = String(preset.k);
    cInput.value = String(preset.c);
    mInput.value = String(preset.m);
    writing = false;
    params.k = preset.k;
    params.c = preset.c;
    params.m = preset.m;
    params.mode = preset.mode;
    activePreset = id;
    syncReadouts();
    demonstrate();
  }

  const TRACK_OFF = [228, 220, 205];
  const TRACK_ON = [36, 87, 74];
  function trackColor(t) {
    const p = S.clamp(t, 0, 1);
    const c = TRACK_OFF.map(function (v, i) { return Math.round(v + (TRACK_ON[i] - v) * p); });
    return 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')';
  }

  function pressTransform(state) {
    const base = 1 + state.x * 0.14;
    const motionAmt = Math.min(0.28, Math.abs(state.v) * 0.018);
    const dir = state.v < 0 ? -1 : 1;
    const sy = Math.max(0.72, base * (1 + dir * motionAmt));
    const sx = Math.max(0.72, (base * base) / sy);
    const y = state.x * 14;
    return 'translate3d(0, ' + y.toFixed(2) + 'px, 0) scale(' + sx.toFixed(3) + ', ' + sy.toFixed(3) + ')';
  }

  function applyPress(el, state) {
    el.style.transform = pressTransform(state);
    if (el.classList.contains('press-lite')) return;
    const depth = S.clamp(-state.x, 0, 1);
    el.style.boxShadow = '0 ' + (10 - depth * 7).toFixed(1) + 'px ' + (22 - depth * 12).toFixed(1) + 'px rgba(28,25,23,' + (0.16 - depth * 0.08).toFixed(3) + ')';
  }

  function applyToggle() {
    const motionAmt = Math.min(0.42, Math.abs(toggle.v) * 0.028);
    const sx = 1 + motionAmt;
    const sy = 1 / sx;
    lampKnob.style.transform = 'translate3d(' + (toggle.x * metrics.toggleTravel).toFixed(2) + 'px, 0, 0) scale(' + sx.toFixed(3) + ', ' + sy.toFixed(3) + ')';
    lampTrack.style.background = trackColor(toggle.x);
  }

  function applyCard() {
    const px = cardX.x * metrics.cardUnitX;
    const py = cardY.x * metrics.cardUnitY;
    const rot = cardX.x * -3.5;
    const pop = Math.min(0.05, Math.hypot(cardX.v, cardY.v) * 0.006);
    card.style.transform = 'translate3d(calc(-50% + ' + px.toFixed(2) + 'px), calc(-50% + ' + py.toFixed(2) + 'px), 0) rotate(' + rot.toFixed(2) + 'deg) scale(' + (1 + pop).toFixed(3) + ')';
  }

  function applyTabs() {
    indicator.style.width = metrics.tabSlot.toFixed(2) + 'px';
    indicator.style.transform = 'translate3d(' + (tab.x * metrics.tabSlot).toFixed(2) + 'px, 0, 0)';
    numStrip.style.transform = 'translate3d(0, ' + (-tab.x * metrics.numH).toFixed(2) + 'px, 0)';
  }

  function applySheet() {
    const shift = S.clamp((1 - sheet.x) * 100, -36, 112);
    sheetEl.style.transform = 'translate3d(0, ' + shift.toFixed(2) + '%, 0)';
    scrim.style.opacity = String(S.clamp(sheet.x, 0, 1));
  }

  function applyLane(lane) {
    const motionAmt = Math.min(0.45, Math.abs(lane.spring.v) * 0.03);
    const sx = 1 + motionAmt;
    const sy = 1 / sx;
    const px = lane.half + lane.spring.x * lane.half * 0.92;
    lane.knob.style.transform = 'translate3d(' + px.toFixed(2) + 'px, 0, 0) scale(' + sx.toFixed(3) + ', ' + sy.toFixed(3) + ')';
  }

  function applyVisuals() {
    applyToggle();
    applyPress(saveBtn, save);
    applyPress(openBtn, opener);
    applyPress(closeBtn, keep);
    applyPress(discardBtn, discardSpring);
    applyCard();
    applyTabs();
    applySheet();
    for (let i = 0; i < lanes.length; i++) applyLane(lanes[i]);
    drawPlot();
  }

  function measure() {
    const travel = lampTrack.clientWidth - lampKnob.offsetWidth - 8;
    if (travel > 8) metrics.toggleTravel = travel;
    const slot = (tablist.clientWidth - 8) / 3;
    if (slot > 8) metrics.tabSlot = slot;
    const num = numStrip.querySelector('span');
    if (num && num.offsetHeight > 8) metrics.numH = num.offsetHeight;
    const stage = cardStage.getBoundingClientRect();
    const ghost = cardStage.querySelector('.ghost').getBoundingClientRect();
    const roomX = (stage.width - ghost.width) / 2 - 8;
    const roomY = (stage.height - ghost.height) / 2 - 8;
    if (roomX > 12) metrics.cardUnitX = roomX / 1.2;
    if (roomY > 8) metrics.cardUnitY = roomY / 1.15;
    if (!sheetEl.hidden) metrics.sheetH = sheetEl.offsetHeight || metrics.sheetH;
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const knobW = lane.knob.offsetWidth || 22;
      lane.half = Math.max(8, (lane.track.clientWidth - knobW) / 2);
    }
  }

  function fitPlot() {
    const rect = plotCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (plotCanvas.width !== w || plotCanvas.height !== h) {
      plotCanvas.width = w;
      plotCanvas.height = h;
    }
    const ctx = plotCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx: ctx, w: rect.width, h: rect.height};
  }

  function drawPlot() {
    const box = fitPlot();
    if (box.w < 4 || box.h < 4) return;
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, w, h);
    const padX = 12;
    const padY = 16;
    let peak = 0.2;
    for (let i = 0; i < plotCount; i++) peak = Math.max(peak, Math.abs(plotAt(i)));
    peak *= 1.15;
    const mid = h / 2;
    const usable = h / 2 - padY;
    function yOf(v) { return mid - (v / peak) * usable; }

    ctx.strokeStyle = '#ddd3c4';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padX, mid);
    ctx.lineTo(w - padX, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#5e564c';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('target', padX, Math.max(10, mid - 10));
    ctx.textAlign = 'right';
    ctx.fillText('now', w - padX, h - 12);
    ctx.textAlign = 'left';

    if (plotCount < 2) return;
    ctx.beginPath();
    for (let i = 0; i < plotCount; i++) {
      const x = padX + ((PLOT_N - plotCount + i) / (PLOT_N - 1)) * (w - padX * 2);
      const y = yOf(plotAt(i));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    const lastX = padX + ((PLOT_N - 1) / (PLOT_N - 1)) * (w - padX * 2);
    const lastY = yOf(plotAt(plotCount - 1));
    ctx.fillStyle = '#9a3412';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function samplePlot(dt) {
    const err = watch.error();
    const velocity = watch.velocity();
    trackGesture(err, velocity);
    setText('plot-now', err.toFixed(2));
    setText('plot-over', seenOvershoot ? overshoot.toFixed(2) : '—');
    plotAcc += dt;
    let guard = 0;
    while (plotAcc >= 1 / 60 && guard < 8) {
      pushPlot(err);
      plotAcc -= 1 / 60;
      guard += 1;
    }
    if (plotAcc > 0.2) plotAcc = 0;
  }

  function finishClose() {
    sheetPhase = 'closed';
    sheetEl.hidden = true;
    scrim.hidden = true;
    sheetEl.inert = true;
    sheetEl.setAttribute('aria-hidden', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sheet-open');
    sheet.x = 0;
    sheet.v = 0;
    sheet.target = 0;
    sheet.hold = false;
  }

  function openSheet() {
    const wasClosed = sheetPhase === 'closed';
    sheetPhase = 'open';
    sheet.hold = false;
    sheet.target = 1;
    if (reduce) {
      sheet.x = 1;
      sheet.v = 0;
    } else if (wasClosed) {
      sheet.x = 0;
      sheet.v = 0;
    }
    applySheet();
    sheetEl.hidden = false;
    scrim.hidden = false;
    sheetEl.inert = false;
    sheetEl.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sheet-open');
    metrics.sheetH = sheetEl.offsetHeight || metrics.sheetH;
    closeBtn.focus();
    followState('Sheet', sheet);
  }

  function closeSheet() {
    if (sheetPhase === 'closed') return;
    sheetPhase = 'closing';
    sheet.hold = false;
    sheet.target = 0;
    sheetEl.setAttribute('aria-hidden', 'true');
    sheetEl.inert = true;
    openBtn.setAttribute('aria-expanded', 'false');
    if (sheetEl.contains(document.activeElement)) openBtn.focus();
    if (reduce) {
      sheet.x = 0;
      sheet.v = 0;
      finishClose();
    }
    followState('Sheet', sheet);
  }

  function selectTab(index) {
    for (let i = 0; i < tabs.length; i++) {
      const on = i === index;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', tabs[index].id);
    panel.textContent = TAB_COPY[index];
    tab.target = index;
    followState('Tabs', tab);
  }

  function bindPress(button, state, onClick, watchName) {
    let pointerId = null;
    function down(event) {
      if (event.button > 0) return;
      pointerId = event.pointerId;
      if (button === saveBtn) saveHeld = true;
      state.target = -1;
      if (watchName) followState(watchName, state);
      kick();
    }
    function up(event) {
      if (pointerId == null) return;
      if (event && event.pointerId != null && event.pointerId !== pointerId) return;
      pointerId = null;
      if (button === saveBtn) saveHeld = false;
      state.target = 0;
      kick();
    }
    button.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    button.addEventListener('keydown', function (event) {
      if (event.repeat) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (button === saveBtn) saveHeld = true;
      state.target = -1;
      if (watchName) followState(watchName, state);
      kick();
    });
    button.addEventListener('keyup', function (event) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (button === saveBtn) saveHeld = false;
      state.target = 0;
      kick();
    });
    if (onClick) button.addEventListener('click', onClick);
  }

  let saved = false;
  bindPress(saveBtn, save, function () {
    saved = !saved;
    setText('save-status', saved ? 'Saved on this page.' : 'Nothing saved yet.');
    setText('card-kicker', saved ? 'Saved' : 'Draft');
  }, 'Button');
  bindPress(openBtn, opener, openSheet, null);
  bindPress(closeBtn, keep, closeSheet, null);
  bindPress(discardBtn, discardSpring, function () {
    saved = false;
    setText('save-status', 'Nothing saved yet.');
    setText('card-kicker', 'Draft');
    closeSheet();
  }, null);

  lamp.addEventListener('click', function () {
    const on = lamp.getAttribute('aria-checked') !== 'true';
    lamp.setAttribute('aria-checked', on ? 'true' : 'false');
    setText('lamp-word', on ? 'On' : 'Off');
    toggle.target = on ? 1 : 0;
    followState('Toggle', toggle);
  });

  card.addEventListener('pointerdown', function (event) {
    if (event.button > 0) return;
    event.preventDefault();
    card.focus();
    card.setPointerCapture(event.pointerId);
    dragging = true;
    card.classList.add('dragging');
    cardX.hold = true;
    cardY.hold = true;
    cardDrag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      baseX: cardX.x,
      baseY: cardY.x,
      lastX: event.clientX,
      lastY: event.clientY,
      lastT: performance.now(),
    };
    followCard();
  });

  card.addEventListener('pointermove', function (event) {
    if (!cardDrag || event.pointerId !== cardDrag.id) return;
    const now = performance.now();
    const dt = Math.max(0.008, (now - cardDrag.lastT) / 1000);
    cardX.x = S.clamp(cardDrag.baseX + (event.clientX - cardDrag.x) / metrics.cardUnitX, -1, 1);
    cardY.x = S.clamp(cardDrag.baseY + (event.clientY - cardDrag.y) / metrics.cardUnitY, -1, 1);
    cardX.v = S.clamp((event.clientX - cardDrag.lastX) / metrics.cardUnitX / dt, -18, 18);
    cardY.v = S.clamp((event.clientY - cardDrag.lastY) / metrics.cardUnitY / dt, -18, 18);
    cardDrag.lastX = event.clientX;
    cardDrag.lastY = event.clientY;
    cardDrag.lastT = now;
    kick();
  });

  function endCard(event) {
    if (!cardDrag) return;
    if (event && event.pointerId != null && event.pointerId !== cardDrag.id) return;
    cardDrag = null;
    dragging = false;
    card.classList.remove('dragging');
    cardX.hold = false;
    cardY.hold = false;
    cardX.target = 0;
    cardY.target = 0;
    kick();
  }
  card.addEventListener('pointerup', endCard);
  card.addEventListener('pointercancel', endCard);

  const keyPull = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  card.addEventListener('keydown', function (event) {
    const pull = keyPull[event.key];
    if (!pull) return;
    event.preventDefault();
    dragging = true;
    cardX.hold = true;
    cardY.hold = true;
    cardX.x = pull[0];
    cardY.x = pull[1];
    cardX.v = 0;
    cardY.v = 0;
    cardX.target = 0;
    cardY.target = 0;
    followCard();
  });
  function releaseKeys(event) {
    if (event && !keyPull[event.key]) return;
    if (!cardX.hold && !cardY.hold) return;
    if (cardDrag) return;
    dragging = false;
    cardX.hold = false;
    cardY.hold = false;
    cardX.target = 0;
    cardY.target = 0;
    cardX.v = 0;
    cardY.v = 0;
    kick();
  }
  card.addEventListener('keyup', releaseKeys);
  card.addEventListener('blur', function () { releaseKeys(); });
  window.addEventListener('blur', function () {
    if (cardDrag) return;
    releaseKeys();
  });

  tablist.addEventListener('click', function (event) {
    const button = event.target.closest('[role="tab"]');
    if (!button || !tablist.contains(button)) return;
    selectTab(tabs.indexOf(button));
  });
  tablist.addEventListener('keydown', function (event) {
    const current = tabs.findIndex(function (el) { return el.getAttribute('aria-selected') === 'true'; });
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % 3;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + 2) % 3;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 2;
    else return;
    event.preventDefault();
    selectTab(next);
    tabs[next].focus();
  });

  sheetEl.addEventListener('pointerdown', function (event) {
    if (event.button > 0) return;
    if (event.target.closest('button')) return;
    sheetEl.setPointerCapture(event.pointerId);
    sheet.hold = true;
    metrics.sheetH = sheetEl.offsetHeight || metrics.sheetH;
    sheetDrag = {
      id: event.pointerId,
      y: event.clientY,
      x: sheet.x,
      lastY: event.clientY,
      lastT: performance.now(),
    };
    followState('Sheet', sheet);
  });
  sheetEl.addEventListener('pointermove', function (event) {
    if (!sheetDrag || event.pointerId !== sheetDrag.id) return;
    const now = performance.now();
    const dt = Math.max(0.008, (now - sheetDrag.lastT) / 1000);
    const h = metrics.sheetH || 300;
    sheet.x = S.clamp(sheetDrag.x + (sheetDrag.y - event.clientY) / h, -0.12, 1.5);
    sheet.v = S.clamp((sheetDrag.lastY - event.clientY) / h / dt, -12, 12);
    sheetDrag.lastY = event.clientY;
    sheetDrag.lastT = now;
    kick();
  });
  function endSheet(event) {
    if (!sheetDrag) return;
    if (event && event.pointerId != null && event.pointerId !== sheetDrag.id) return;
    sheetDrag = null;
    sheet.hold = false;
    const open = sheet.v > 1.05 || (sheet.x > 0.58 && sheet.v > -0.8);
    if (open) {
      sheetPhase = 'open';
      sheet.target = 1;
      sheetEl.inert = false;
      sheetEl.setAttribute('aria-hidden', 'false');
      openBtn.setAttribute('aria-expanded', 'true');
    } else {
      closeSheet();
    }
    kick();
  }
  sheetEl.addEventListener('pointerup', endSheet);
  sheetEl.addEventListener('pointercancel', endSheet);
  scrim.addEventListener('click', closeSheet);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && sheetPhase !== 'closed') {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== 'Tab' || sheetPhase !== 'open') return;
    const nodes = sheetEl.querySelectorAll('button');
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function bindSlider(input) {
    let armed = false;
    function disarm() { armed = false; }
    input.addEventListener('pointerdown', disarm);
    input.addEventListener('pointerup', disarm);
    input.addEventListener('pointercancel', disarm);
    input.addEventListener('keyup', disarm);
    input.addEventListener('input', function () {
      if (writing) return;
      readSliders();
      if (!armed) {
        armed = true;
        demonstrate();
      } else {
        kick();
      }
    });
  }
  bindSlider(kInput);
  bindSlider(cInput);
  bindSlider(mInput);

  document.querySelectorAll('.presets button').forEach(function (button) {
    button.addEventListener('click', function () { applyPreset(button.dataset.preset); });
  });
  document.getElementById('replay').addEventListener('click', replayLanes);

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (let i = 0; i < driven.length; i++) advance(driven[i], dt, params);
    for (let i = 0; i < lanes.length; i++) advance(lanes[i].spring, dt, lanes[i].preset);
    if (sheetPhase === 'closing' && !sheet.hold && Math.abs(sheet.x) < 0.012 && Math.abs(sheet.v) < 0.05) {
      finishClose();
    }
    samplePlot(dt);
    applyVisuals();
    let quiet = !dragging && !saveHeld && !sheetDrag && !cardDrag;
    if (quiet) {
      for (let i = 0; i < driven.length; i++) {
        if (!resting(driven[i])) quiet = false;
      }
      for (let i = 0; i < lanes.length; i++) {
        if (!resting(lanes[i].spring)) quiet = false;
      }
    }
    if (quiet) {
      idle += dt;
      if (idle > 0.9) {
        running = false;
        return;
      }
    } else {
      idle = 0;
    }
    requestAnimationFrame(frame);
  }

  function onMotionChange() {
    reduce = motion.matches;
    motionNote.hidden = !reduce;
    if (reduce) {
      for (let i = 0; i < driven.length; i++) advance(driven[i], 0, params);
      for (let i = 0; i < lanes.length; i++) {
        if (!lanes[i].spring.hold) {
          lanes[i].spring.x = lanes[i].spring.target;
          lanes[i].spring.v = 0;
        }
      }
      applyVisuals();
    }
    kick();
  }
  motion.addEventListener('change', onMotionChange);

  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    if (lane.preset.mode === 'linear') {
      setText('zeta-' + lane.id, 'steady');
    } else {
      const zeta = S.dampingRatio(lane.preset.k, lane.preset.c, lane.preset.m);
      setText('zeta-' + lane.id, 'ζ ' + zeta.toFixed(2));
    }
  }

  sheetEl.inert = true;
  motionNote.hidden = !reduce;
  syncReadouts();
  measure();
  window.addEventListener('resize', function () { measure(); kick(); });
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(function () { measure(); kick(); });
    observer.observe(cardStage);
    observer.observe(tablist);
    observer.observe(plotCanvas);
    observer.observe(document.body);
  }
  replayLanes();
  applyVisuals();
  kick();
})();
