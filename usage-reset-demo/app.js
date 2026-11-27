(function () {
  const usage = window.UsageReset;
  const chrome = document.querySelector('.chrome');
  const gauge = document.getElementById('gauge');
  const needle = document.getElementById('needle');
  const clock = document.getElementById('clock');
  const nextChip = document.getElementById('next-chip');
  const panel = document.getElementById('panel');
  const nextEl = document.getElementById('next');
  const toolsEl = document.getElementById('tools');
  const speedInput = document.getElementById('speed');
  const speedRead = document.getElementById('speed-read');
  const timelineBtn = document.getElementById('timeline-toggle');
  const timeline = document.getElementById('timeline');
  const axis = document.getElementById('axis');
  const resetBtn = document.getElementById('reset');
  const announce = document.getElementById('announce');

  const loaded = usage.load(window.localStorage, Date.now());
  let state = loaded ? loaded.state : usage.createState(Date.now());
  let speed = loaded ? loaded.speed : 1;
  let open = false;

  const nodes = Object.create(null);
  const cards = Object.create(null);
  const lanes = Object.create(null);
  const nextStrong = document.createElement('strong');
  nextEl.append(document.createTextNode('Next reset · '), nextStrong);

  function persist() {
    usage.save(window.localStorage, state, speed, Date.now());
  }

  function flash(el) {
    el.classList.remove('did-reset');
    void el.offsetWidth;
    el.classList.add('did-reset');
  }

  function buildTools() {
    toolsEl.replaceChildren();
    state.tools.forEach(function (tool) {
      const card = document.createElement('article');
      card.className = 'card';
      const top = document.createElement('div');
      top.className = 'card-top';
      const name = document.createElement('h2');
      name.className = 'card-name';
      name.textContent = tool.name;
      const plan = document.createElement('span');
      plan.className = 'plan';
      plan.textContent = tool.plan;
      top.append(name, plan);
      card.appendChild(top);

      tool.windows.forEach(function (specWindow) {
        const win = document.createElement('div');
        win.className = 'win';
        const head = document.createElement('div');
        head.className = 'win-top';
        const label = document.createElement('span');
        label.className = 'win-label';
        label.textContent = specWindow.label;
        const count = document.createElement('span');
        count.className = 'win-count';
        const track = document.createElement('div');
        track.className = 'track';
        const bar = document.createElement('span');
        bar.className = 'bar';
        const used = document.createElement('p');
        used.className = 'win-used';
        track.appendChild(bar);
        head.append(label, count);
        win.append(head, track, used);
        card.appendChild(win);
        nodes[tool.id + ':' + specWindow.id] = { win: win, count: count, bar: bar, used: used };
      });

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'send';
      button.textContent = 'Send a prompt';
      const hint = document.createElement('p');
      hint.className = 'hint';
      button.addEventListener('click', function () {
        const result = usage.sendPrompt(state, tool.id);
        announce.textContent = result.message;
        paint([]);
        persist();
      });
      card.append(button, hint);
      toolsEl.appendChild(card);
      cards[tool.id] = { card: card, button: button, hint: hint };
    });
  }

  function buildTimeline() {
    axis.replaceChildren();
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    ticks.id = 'ticks';
    axis.appendChild(ticks);
    usage.timeline(state).rows.forEach(function (row) {
      const line = document.createElement('div');
      line.className = 'row';
      const label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row.label;
      const lane = document.createElement('div');
      lane.className = 'lane';
      line.append(label, lane);
      axis.appendChild(line);
      lanes[row.toolId + ':' + row.kind] = lane;
    });
  }

  function paintTimeline() {
    const ticks = usage.dayTicks(state.now);
    const box = document.getElementById('ticks');
    while (box.children.length < ticks.length) {
      const el = document.createElement('span');
      el.className = 'tick';
      box.appendChild(el);
    }
    while (box.children.length > ticks.length) box.removeChild(box.lastChild);
    ticks.forEach(function (tick, index) {
      box.children[index].style.left = (tick.fraction * 100) + '%';
      box.children[index].textContent = tick.label;
    });
    usage.timeline(state).rows.forEach(function (row) {
      const lane = lanes[row.toolId + ':' + row.kind];
      while (lane.children.length < row.marks.length) {
        const mark = document.createElement('i');
        mark.className = 'mark';
        lane.appendChild(mark);
      }
      while (lane.children.length > row.marks.length) lane.removeChild(lane.lastChild);
      row.marks.forEach(function (mark, index) {
        const el = lane.children[index];
        el.style.left = (mark.fraction * 100) + '%';
        el.style.background = row.color;
        el.dataset.kind = row.kind;
      });
    });
  }

  function paint(resets) {
    const flashed = Object.create(null);
    (resets || []).forEach(function (item) {
      flashed[item.toolId + ':' + item.windowId] = true;
    });
    state.tools.forEach(function (tool) {
      const card = cards[tool.id];
      const check = usage.room(state, tool.id);
      card.card.dataset.band = usage.worstBand(tool);
      card.button.disabled = !check.ok;
      card.hint.textContent = check.ok
        ? 'A prompt uses ' + tool.cost + ' on each window.'
        : check.message;
      tool.windows.forEach(function (specWindow) {
        const node = nodes[tool.id + ':' + specWindow.id];
        node.count.textContent = usage.countdown(specWindow.resetsAt - state.now);
        node.used.textContent = usage.usedLine(specWindow);
        node.bar.dataset.band = usage.band(specWindow);
        node.bar.style.width = Math.min(100, usage.ratio(specWindow) * 100) + '%';
        if (flashed[tool.id + ':' + specWindow.id]) flash(node.win);
      });
    });
    const next = usage.nextReset(state);
    nextStrong.textContent = next.text;
    nextChip.textContent = next.toolName + ' ' + usage.countdown(next.inMs);
    clock.textContent = usage.formatClock(state.now);
    clock.setAttribute('datetime', new Date(state.now).toISOString());
    const felt = usage.pressure(state);
    gauge.dataset.band = felt.band;
    const angle = -110 + Math.min(1, felt.ratio) * 220;
    needle.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 8 9)');
    speedRead.textContent = usage.speedCaption(speed);
    if (!timeline.hidden) paintTimeline();
    if (resets && resets.length) {
      announce.textContent = resets.map(function (item) {
        return item.toolName + ' ' + item.label + ' reset.';
      }).join(' ');
    }
  }

  function placePanel() {
    const wide = window.matchMedia('(min-width: 980px)').matches;
    if (wide && open) {
      panel.style.top = (chrome.offsetHeight + 8) + 'px';
      panel.style.maxHeight = 'calc(100vh - ' + (chrome.offsetHeight + 24) + 'px)';
    } else {
      panel.style.top = '';
      panel.style.maxHeight = '';
    }
  }

  function setOpen(next, focus) {
    open = next;
    panel.hidden = !open;
    document.body.classList.toggle('panel-open', open);
    gauge.setAttribute('aria-expanded', open ? 'true' : 'false');
    placePanel();
    if (open && focus) panel.focus();
  }

  speedInput.value = String(Math.round(usage.unitFromSpeed(speed) * 1000));
  speedInput.addEventListener('input', function () {
    speed = usage.speedFromUnit(Number(speedInput.value) / 1000);
    speedRead.textContent = usage.speedCaption(speed);
    persist();
  });

  timelineBtn.addEventListener('click', function () {
    const show = timeline.hidden;
    timeline.hidden = !show;
    timelineBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
    if (show) paintTimeline();
  });

  resetBtn.addEventListener('click', function () {
    state = usage.createState(Date.now());
    announce.textContent = 'Simulated usage reset.';
    paint([]);
    if (!timeline.hidden) paintTimeline();
    persist();
  });

  gauge.addEventListener('click', function () {
    setOpen(!open, true);
  });

  document.addEventListener('click', function (event) {
    if (!open) return;
    if (panel.contains(event.target) || chrome.contains(event.target)) return;
    setOpen(false, false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && open) {
      setOpen(false, false);
      gauge.focus();
    }
  });

  window.addEventListener('resize', placePanel);
  window.addEventListener('pagehide', persist);

  buildTools();
  buildTimeline();
  setOpen(true, false);
  paint([]);
  persist();

  let last = performance.now();
  let lastSave = last;
  function frame(now) {
    const dt = Math.min(2000, Math.max(0, now - last));
    last = now;
    const resets = usage.advance(state, state.now + dt * speed);
    paint(resets);
    if (now - lastSave > 2000) {
      persist();
      lastSave = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
