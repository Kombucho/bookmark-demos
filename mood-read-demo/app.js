// Wires the desk to the reading. Events are timings and control facts.
// A repeated invalid submit stores a boolean, not the text.

(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const events = [];
  let lastInputAt = performance.now();
  const sessionStart = lastInputAt;
  let pointerOutside = false;
  let reading = Mood.freshReading();
  let features = Mood.blankFeatures();
  let probs = Mood.probabilities(features);
  let tick = 0;
  let save = null;
  let saved = false;
  let paid = false;
  let lastSig = '';
  let holdLeft = Checkout.DESK_HOLD_MS;
  let moveStamp = 0;

  const formEl = document.getElementById('order-form');
  const nameEl = document.getElementById('name');
  const streetEl = document.getElementById('street');
  const dateEl = document.getElementById('date');
  const emailEl = document.getElementById('email');
  const promoEl = document.getElementById('promo');
  const termsEl = document.getElementById('terms');
  const lotsEl = document.getElementById('lots');
  const giftEl = document.getElementById('gift');
  const pay = document.getElementById('pay');
  const applyBtn = document.getElementById('apply');
  const saveBtn = document.getElementById('save');
  const payNote = document.getElementById('pay-note');
  const dateNote = document.getElementById('date-note');
  const promoNote = document.getElementById('promo-note');
  const delivery = document.getElementById('delivery');
  const account = document.getElementById('account');
  const holdEl = document.getElementById('hold');
  const moodName = document.getElementById('mood-name');
  const moodLine = document.getElementById('mood-line');
  const meters = document.getElementById('meters');
  const tickEl = document.getElementById('tick');
  const trail = document.getElementById('trail');
  const featuresBox = document.getElementById('features');
  const featuresToggle = document.getElementById('features-toggle');
  const finder = document.getElementById('finder');
  const jumps = document.getElementById('jumps');
  const findEl = document.getElementById('find');
  const clearBtn = document.getElementById('clear');
  const formula = document.getElementById('formula');
  const weightList = document.getElementById('weight-list');
  const chip = document.getElementById('mood-chip');
  const meterEls = {};

  function readForm() {
    return {
      name: nameEl.value,
      street: streetEl.value,
      date: dateEl.value,
      email: emailEl.value,
      promo: promoEl.value,
      terms: termsEl.checked,
      lots: lotsEl.checked,
      gift: giftEl.value,
    };
  }

  function push(event) {
    event.t = performance.now();
    events.push(event);
    if (event.kind !== 'hidden') lastInputAt = event.t;
    const cutoff = event.t - Mood.WINDOW_MS;
    while (events.length && events[0].t < cutoff) events.shift();
  }

  function classify(target) {
    if (!target || !target.closest) return 'dead';
    if (target.closest('[data-signal]')) return 'tool';
    const control = target.closest('[data-control]');
    if (control) {
      if (control.dataset.disabled === 'true') return 'disabled';
      return 'control';
    }
    if (target.closest('button, a, input, textarea, select, summary, label')) return 'control';
    return 'dead';
  }

  function nearControl(x, y) {
    const nodes = document.querySelectorAll('[data-control]');
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node.closest('[data-signal]')) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      if (Math.hypot(dx, dy) <= 36) return true;
    }
    return false;
  }

  function formatHold(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + ':' + String(seconds).padStart(2, '0');
  }

  function syncControls() {
    const form = readForm();
    const lock = Checkout.payLock(form);
    pay.dataset.disabled = !paid && lock.locked ? 'true' : 'false';
    pay.setAttribute('aria-disabled', paid || lock.locked ? 'true' : 'false');
    if (!paid) pay.textContent = 'Pay 70';
    const promoOff = Checkout.promoDisabled(form.promo);
    applyBtn.dataset.disabled = promoOff ? 'true' : 'false';
    applyBtn.setAttribute('aria-disabled', promoOff ? 'true' : 'false');
    paintSave();
    return form;
  }

  function paintSave() {
    let label = 'Save address';
    if (save && reading.mood === 'away') label = 'Save paused';
    else if (save && (reading.mood === 'frustrated' || reading.mood === 'confused')) label = 'Saving…';
    else if (saved && !save) label = 'Saved';
    if (saveBtn.textContent !== label) saveBtn.textContent = label;
    saveBtn.setAttribute('aria-busy', save && label === 'Saving…' ? 'true' : 'false');
  }

  function paintClock() {
    const text = formatHold(holdLeft) + (reading.mood === 'away' ? ' paused' : '');
    if (holdEl.textContent !== text) holdEl.textContent = text;
  }

  function attemptPay() {
    const form = readForm();
    const lock = Checkout.payLock(form);
    if (paid) return;
    if (lock.locked) {
      const repeated = lastSig !== '' && lastSig === lock.signature;
      lastSig = lock.signature;
      push({ kind: 'submit', valid: false, repeated: repeated });
      const dateBad = !Checkout.parseShipDate(form.date).ok;
      dateNote.textContent = dateBad ? 'Not accepted.' : '';
      dateEl.setAttribute('aria-invalid', dateBad ? 'true' : 'false');
      if (reading.mood !== 'frustrated') {
        payNote.textContent = lock.vague;
        payNote.dataset.source = 'form';
      }
      paintMood(form);
      return;
    }
    lastSig = '';
    push({ kind: 'submit', valid: true, repeated: false });
    paid = true;
    pay.textContent = 'Paid';
    payNote.textContent = 'Paid. The receipt stays on this desk.';
    dateNote.textContent = '';
    dateEl.setAttribute('aria-invalid', 'false');
    syncControls();
    paintMood(readForm());
  }

  function renderJumps(query) {
    const rows = Checkout.findSettings(query);
    jumps.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'touch-note';
      empty.textContent = 'Nothing under that name.';
      jumps.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      const button = document.createElement('button');
      button.type = 'button';
      const title = document.createElement('span');
      title.textContent = row.title;
      const hint = document.createElement('small');
      hint.textContent = row.hint;
      button.append(title, hint);
      button.addEventListener('click', function () {
        row.open.forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.open = true;
        });
        const target = document.getElementById(row.focus);
        if (!target) return;
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        document.querySelectorAll('.is-landed').forEach(function (el) { el.classList.remove('is-landed'); });
        target.classList.add('is-landed');
        if (target.focus) target.focus({ preventScroll: true });
      });
      jumps.appendChild(button);
    });
  }

  function paintMood(form) {
    const current = form || readForm();
    const adapt = Mood.adaptation(reading.mood);
    document.body.dataset.mood = reading.mood;
    moodName.dataset.mood = reading.mood;
    moodName.textContent = Mood.MOOD_LABELS[reading.mood];
    chip.textContent = Mood.MOOD_LABELS[reading.mood];

    Mood.MOODS.forEach(function (mood) {
      const pct = Math.round(probs[mood] * 100);
      const els = meterEls[mood];
      els.fill.style.width = pct + '%';
      els.pct.textContent = pct + '%';
      els.row.classList.toggle('is-on', mood === reading.mood);
      els.row.setAttribute('aria-valuenow', String(pct));
    });

    let line = 'The desk stays as it is.';
    if (adapt === 'explain-pay') {
      const lock = Checkout.payLock(current);
      line = lock.locked ? lock.clear : 'Pay is open. Nothing is locking it.';
      if (save) line += ' The address save is running. It stays quiet for about two seconds.';
    } else if (adapt === 'next-step') {
      line = 'Next: ' + Checkout.nextStep(current).label + '.';
      if (save) line += ' The address save is running. It stays quiet for about two seconds.';
    } else if (adapt === 'find-setting') {
      line = 'A search is open for the setting buried in Account.';
    } else if (adapt === 'pause') {
      line = 'Paused. The desk hold and any save wait until you come back.';
      if (document.hidden) line += ' The tab is hidden.';
      else if (pointerOutside) line += ' The pointer left the window.';
      else line += ' Nothing has moved for a while.';
    }
    if (moodLine.textContent !== line) moodLine.textContent = line;

    document.querySelectorAll('.is-next').forEach(function (el) {
      if (!el.closest('#jumps')) el.classList.remove('is-next');
    });
    if (adapt === 'next-step') {
      const step = document.getElementById(Checkout.nextStep(current).id);
      if (step) step.classList.add('is-next');
    }

    const lockNow = Checkout.payLock(current);
    if (paid) {
      payNote.dataset.source = 'done';
    } else if (adapt === 'explain-pay') {
      payNote.textContent = lockNow.locked ? lockNow.clear : 'Pay is open. Nothing is locking it.';
      payNote.dataset.source = 'mood';
    } else if (payNote.dataset.source === 'mood') {
      payNote.textContent = lockNow.locked ? lockNow.vague : '';
      payNote.dataset.source = payNote.textContent ? 'form' : '';
    }
    delivery.classList.toggle('bring', adapt === 'explain-pay' && !current.terms);
    dateEl.classList.toggle('show-format', adapt === 'explain-pay' && !Checkout.parseShipDate(current.date).ok);
    account.classList.toggle('is-beacon', adapt === 'find-setting');
    const showFinder = adapt === 'find-setting';
    if (finder.hidden === showFinder) {
      finder.hidden = !showFinder;
      if (showFinder) renderJumps(findEl.value);
    }

    if (!featuresBox.hidden) {
      Mood.FEATURES.forEach(function (key) {
        const row = featuresBox.querySelector('[data-feature="' + key + '"] i');
        const num = featuresBox.querySelector('[data-feature="' + key + '"] b');
        if (!row) return;
        row.style.width = Math.round(features[key] * 100) + '%';
        num.textContent = features[key].toFixed(2);
      });
    }
    paintSave();
    paintClock();
  }

  function updateMood(dt, forceAbsent) {
    const now = performance.now();
    const absent = forceAbsent || document.hidden || pointerOutside;
    features = Mood.rollingFeatures(events, now, {
      absent: absent,
      lastInputAt: lastInputAt,
      sessionStart: sessionStart,
    });
    probs = Mood.probabilities(features);
    reading = Mood.stepReading(reading, probs, forceAbsent ? 0 : dt, { absent: absent });
    tick += 1;
    tickEl.textContent = 'Every ' + Mood.STEP_MS + ' ms · tick ' + tick;
    paintMood();
  }

  function drawTrail(now) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = trail.clientWidth || 320;
    const h = trail.clientHeight || 120;
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (trail.width !== bw || trail.height !== bh) {
      trail.width = bw;
      trail.height = bh;
    }
    const ctx = trail.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let prev = null;
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i];
      if (e.kind !== 'move') continue;
      const age = (now - e.t) / Mood.WINDOW_MS;
      if (age < 0 || age > 1) continue;
      const x = (e.x / vw) * w;
      const y = (e.y / vh) * h;
      if (prev && e.t - prev.t < 160) {
        ctx.strokeStyle = 'rgba(28, 25, 23, ' + ((1 - age) * 0.8).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prev = { t: e.t, x: x, y: y };
    }
  }

  Mood.MOODS.forEach(function (mood) {
    const row = document.createElement('div');
    row.className = 'meter';
    row.dataset.mood = mood;
    row.setAttribute('role', 'meter');
    row.setAttribute('aria-label', Mood.MOOD_LABELS[mood]);
    row.setAttribute('aria-valuemin', '0');
    row.setAttribute('aria-valuemax', '100');
    row.setAttribute('aria-valuenow', '0');
    const name = document.createElement('b');
    name.textContent = Mood.MOOD_LABELS[mood];
    const track = document.createElement('span');
    track.className = 'track';
    const fill = document.createElement('span');
    fill.className = 'fill';
    track.appendChild(fill);
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = '0%';
    row.append(name, track, pct);
    meters.appendChild(row);
    meterEls[mood] = { row: row, fill: fill, pct: pct };
  });

  Mood.FEATURES.forEach(function (key) {
    const row = document.createElement('div');
    row.className = 'feat';
    row.dataset.feature = key;
    const label = document.createElement('span');
    label.textContent = Mood.FEATURE_LABELS[key];
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.appendChild(document.createElement('i'));
    const num = document.createElement('b');
    num.textContent = '0.00';
    row.append(label, bar, num);
    featuresBox.appendChild(row);
  });

  formula.textContent = 'Each mood is a bias plus the weights times the features, then a softmax. The alert line is ' + Mood.ALERT.toFixed(2) + '. A mood holds for about a second after the features fall. The window is ' + (Mood.WINDOW_MS / 1000) + ' seconds.';
  Mood.MOODS.forEach(function (mood) {
    const row = document.createElement('p');
    row.className = 'weight-row';
    const bits = ['bias ' + Mood.MODEL[mood].bias.toFixed(2)];
    Mood.FEATURES.forEach(function (key) {
      const weight = Mood.MODEL[mood][key];
      if (!weight) return;
      bits.push(key + ' ' + (weight > 0 ? '+' : '') + weight.toFixed(2));
    });
    const title = document.createElement('strong');
    title.textContent = Mood.MOOD_LABELS[mood] + '. ';
    row.append(title, document.createTextNode(bits.join(' · ')));
    weightList.appendChild(row);
  });

  document.addEventListener('pointerdown', function (e) {
    push({ kind: 'down', x: e.clientX, y: e.clientY, target: classify(e.target) });
  });

  document.addEventListener('pointermove', function (e) {
    const now = performance.now();
    if (now - moveStamp < 16) return;
    moveStamp = now;
    const near = e.pointerType !== 'touch' && e.buttons === 0 && nearControl(e.clientX, e.clientY);
    push({ kind: 'move', x: e.clientX, y: e.clientY, near: near });
  });

  document.addEventListener('pointerout', function (e) {
    if (e.pointerType !== 'mouse' || e.relatedTarget) return;
    pointerOutside = true;
    updateMood(0, true);
  });

  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse' || !pointerOutside) return;
    pointerOutside = false;
    lastInputAt = performance.now();
  });

  let scrollY = window.scrollY;
  window.addEventListener('scroll', function () {
    const y = window.scrollY;
    const dy = y - scrollY;
    scrollY = y;
    if (Math.abs(dy) >= 1) push({ kind: 'scroll', dy: dy });
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (!e.target || !e.target.matches || !e.target.matches('input, textarea')) return;
    if (e.key === 'Backspace' || e.key === 'Delete') push({ kind: 'key', key: 'delete' });
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) push({ kind: 'key', key: 'char' });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) updateMood(0, true);
    else lastInputAt = performance.now();
  });

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    attemptPay();
  });

  formEl.addEventListener('input', function () {
    if (!save) saved = false;
    syncControls();
    paintMood();
  });

  saveBtn.addEventListener('click', function () {
    if (save) return;
    saved = false;
    save = { left: Checkout.SAVE_MS };
    paintSave();
  });

  applyBtn.addEventListener('click', function () {
    if (Checkout.promoDisabled(promoEl.value)) return;
    promoNote.textContent = 'That code is not active.';
  });

  featuresToggle.addEventListener('click', function () {
    const open = featuresBox.hidden;
    featuresBox.hidden = !open;
    featuresToggle.setAttribute('aria-pressed', open ? 'true' : 'false');
    featuresToggle.textContent = open ? 'Hide features' : 'Show features';
    if (open) paintMood();
  });

  findEl.addEventListener('input', function () { renderJumps(findEl.value); });

  clearBtn.addEventListener('click', function () {
    events.length = 0;
    lastInputAt = performance.now();
    lastSig = '';
    reading = Mood.freshReading();
    features = Mood.blankFeatures();
    probs = Mood.probabilities(features);
    paintMood();
  });

  syncControls();
  paintMood();

  let acc = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (reading.mood !== 'away') {
      if (save) {
        save.left -= dt;
        if (save.left <= 0) {
          save = null;
          saved = true;
          paintSave();
        }
      }
      holdLeft = Math.max(0, holdLeft - dt);
      paintClock();
    }
    acc += dt;
    if (acc >= Mood.STEP_MS) {
      const step = acc;
      acc = 0;
      updateMood(step, false);
    }
    drawTrail(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
