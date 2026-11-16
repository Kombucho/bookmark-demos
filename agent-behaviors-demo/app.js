(function () {
  const kit = window.AgentBehaviors;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionNote = document.getElementById('motion-note');
  const switchList = document.getElementById('switch-list');
  const allBtn = document.getElementById('all');
  const noneBtn = document.getElementById('none');
  const help = document.getElementById('help');
  const stage = document.getElementById('stage');
  const stageSheet = document.querySelector('.stage-sheet');
  const trigger = document.getElementById('trigger');
  const panel = document.getElementById('panel');
  const list = document.getElementById('list');
  const outside = document.getElementById('outside');
  const status = document.getElementById('status');
  const spec = document.getElementById('spec');
  const testBtn = document.getElementById('test');
  const summary = document.getElementById('summary');
  const results = document.getElementById('results');

  if (motion.matches) motionNote.hidden = false;

  let behaviors = kit.allOn();
  let state = kit.initialState(true);
  let testing = false;
  let running = false;
  let virtualNow = 0;
  let dragOrigin = null;
  let suppressClick = false;
  let timer = 0;
  let inputs = {};

  kit.BEHAVIORS.forEach((behavior) => {
    const label = document.createElement('label');
    label.className = 'switch';
    label.dataset.behavior = behavior.id;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.addEventListener('change', () => {
      behaviors[behavior.id] = input.checked;
      if (!behaviors.openOnHover) {
        state.armed = null;
        clearTimeout(timer);
      }
      render();
    });
    const text = document.createElement('span');
    const name = document.createElement('b');
    name.textContent = behavior.name;
    const detail = document.createElement('small');
    detail.textContent = behavior.detail;
    text.append(name, detail);
    label.append(input, text);
    switchList.appendChild(label);
    inputs[behavior.id] = input;
  });

  function now() {
    return testing ? virtualNow : performance.now();
  }

  function arm() {
    clearTimeout(timer);
    if (testing || !state.armed) return;
    const wait = Math.max(0, state.armed.at - performance.now());
    timer = setTimeout(() => {
      state = kit.reduce(state, {type: 'clock', now: performance.now()}, behaviors);
      render();
      arm();
    }, wait);
  }

  function apply(event, focus) {
    state = kit.reduce(state, event, behaviors);
    render(focus ? {focus: true} : null);
    arm();
  }

  function labelOf(id) {
    const item = state.items.find((entry) => entry.id === id);
    return item ? item.label : id;
  }

  function render(opts) {
    const focusId = state.items[state.focus] ? state.items[state.focus].id : null;
    panel.hidden = !state.open;
    trigger.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    trigger.dataset.pressid = 'trigger';
    if (behaviors.press && state.pressed === 'trigger') trigger.dataset.pressed = 'true';
    else delete trigger.dataset.pressed;

    const listbox = behaviors.createRovingFocus || behaviors.createSelection;
    if (listbox) list.setAttribute('role', 'listbox');
    else list.removeAttribute('role');
    list.dataset.focus = String(state.focus);

    const existing = new Map([...list.children].map((el) => [el.dataset.id, el]));
    state.items.forEach((item, index) => {
      let el = existing.get(item.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'item plain';
        el.dataset.id = item.id;
        el.textContent = item.label;
      }
      el.dataset.index = String(index);
      el.dataset.pressid = item.id;
      el.tabIndex = !state.open ? -1 : behaviors.createRovingFocus ? (index === state.focus ? 0 : -1) : 0;
      if (listbox) el.setAttribute('role', 'option');
      else el.removeAttribute('role');
      if (behaviors.createSelection && state.selected === item.id) el.setAttribute('aria-selected', 'true');
      else el.removeAttribute('aria-selected');
      if (behaviors.press && state.pressed === item.id) el.dataset.pressed = 'true';
      else delete el.dataset.pressed;
      if (state.drag && state.drag.active && state.drag.id === item.id) el.dataset.dragging = 'true';
      else delete el.dataset.dragging;
      list.appendChild(el);
    });

    stageSheet.classList.toggle('reordering', !!behaviors.createReorder);
    help.textContent = kit.instructions(behaviors);
    if (behaviors.press && state.pressed) {
      status.textContent = 'Pressed · ' + (state.pressed === 'trigger' ? 'Notes' : labelOf(state.pressed));
    } else {
      status.textContent = kit.statusText(state);
    }
    spec.textContent = kit.specText(behaviors);
    kit.BEHAVIORS.forEach((behavior) => {
      inputs[behavior.id].checked = !!behaviors[behavior.id];
      inputs[behavior.id].closest('.switch').classList.toggle('testing', !!behaviors[behavior.id] && testing && running);
    });

    if (opts && opts.focus && state.open && focusId) {
      const el = list.querySelector('[data-id="' + focusId + '"]');
      if (el && document.activeElement !== el) el.focus();
    }
  }

  function indexAt(y) {
    const nodes = [...list.children];
    if (!nodes.length) return 0;
    for (let i = 0; i < nodes.length; i++) {
      const rect = nodes[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return i;
    }
    if (y < nodes[0].getBoundingClientRect().top) return 0;
    return nodes.length - 1;
  }

  function isDismissTarget(target) {
    if (!target) return false;
    if (target === outside || (outside.contains && outside.contains(target))) return true;
    if (trigger.contains(target) || panel.contains(target)) return false;
    if (target.closest && target.closest('a, button, input, label, textarea, pre, summary')) return false;
    return true;
  }

  trigger.addEventListener('pointerdown', () => {
    apply({type: 'pointerdown', target: 'trigger', now: now()});
  });
  trigger.addEventListener('pointerenter', () => {
    apply({type: 'pointerenter', target: 'trigger', now: now()});
  });
  trigger.addEventListener('pointerleave', () => {
    apply({type: 'pointerleave', target: 'trigger', now: now()});
  });
  trigger.addEventListener('focus', () => {
    apply({type: 'focus', target: 'trigger', now: now()});
  });
  trigger.addEventListener('focusout', (event) => {
    const to = !event.relatedTarget
      ? 'outside'
      : trigger.contains(event.relatedTarget)
        ? 'trigger'
        : panel.contains(event.relatedTarget)
          ? 'panel'
          : 'outside';
    apply({type: 'focusout', to: to, now: now()});
  });
  trigger.addEventListener('click', () => {
    apply({type: 'click', target: 'trigger', now: now()});
  });

  panel.addEventListener('pointerenter', () => {
    apply({type: 'pointerenter', target: 'panel', now: now()});
  });
  panel.addEventListener('pointerleave', () => {
    apply({type: 'pointerleave', target: 'panel', now: now()});
  });

  list.addEventListener('pointerdown', (event) => {
    const item = event.target.closest('.item');
    if (!item) return;
    dragOrigin = {x: event.clientX, y: event.clientY};
    if (item.setPointerCapture) {
      try { item.setPointerCapture(event.pointerId); } catch (err) { /* already gone */ }
    }
    apply({
      type: 'pointerdown',
      target: 'item',
      index: Number(item.dataset.index),
      id: item.dataset.id,
      now: now(),
    });
  });
  list.addEventListener('click', (event) => {
    const item = event.target.closest('.item');
    if (!item) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    apply({
      type: 'click',
      target: 'item',
      index: Number(item.dataset.index),
      id: item.dataset.id,
      dragged: false,
      now: now(),
    });
  });
  list.addEventListener('focusin', (event) => {
    const item = event.target.closest('.item');
    if (!item) return;
    const index = Number(item.dataset.index);
    if (index === state.focus) return;
    apply({type: 'focus', target: 'item', index: index, now: now()});
  });

  document.addEventListener('pointermove', (event) => {
    if (!state.drag || !dragOrigin) return;
    const distance = Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y);
    apply({
      type: 'pointermove',
      distance: distance,
      overIndex: indexAt(event.clientY),
      now: now(),
    });
  });
  document.addEventListener('pointerup', () => {
    if (!state.drag && !state.pressed) return;
    suppressClick = !!(state.drag && state.drag.active);
    dragOrigin = null;
    apply({type: 'pointerup', now: now()});
  });
  document.addEventListener('pointercancel', () => {
    if (!state.drag) return;
    dragOrigin = null;
    apply({type: 'pointercancel', now: now()});
  });
  document.addEventListener('pointerdown', (event) => {
    if (!isDismissTarget(event.target)) return;
    apply({type: 'pointerdown', target: 'outside', now: now()});
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target === trigger
      ? 'trigger'
      : event.target.closest && event.target.closest('.item')
        ? 'item'
        : 'list';
    const keyEvent = {
      type: 'keydown',
      key: event.key,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      target: target,
      now: now(),
    };
    if (!kit.keyClaims(state, keyEvent, behaviors)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Escape' || kit.isTypeaheadKey(keyEvent)) {
      event.preventDefault();
    }
    const moved = event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || kit.isTypeaheadKey(keyEvent);
    apply(keyEvent, moved && target !== 'trigger');
  });
  document.addEventListener('keyup', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    apply({type: 'keyup', key: event.key, now: now()});
  });

  allBtn.addEventListener('click', () => {
    behaviors = kit.allOn();
    render();
  });
  noneBtn.addEventListener('click', () => {
    behaviors = kit.blankBehaviors();
    state.armed = null;
    clearTimeout(timer);
    render();
  });

  function domView() {
    const buttons = [...list.querySelectorAll('.item')];
    const open = !panel.hidden;
    const pressedEl = stage.querySelector('[data-pressed="true"]');
    const selected = buttons.find((button) => button.getAttribute('aria-selected') === 'true');
    return {
      pressed: pressedEl ? pressedEl.dataset.pressid : null,
      open: open,
      focus: Number(list.dataset.focus),
      selected: selected ? selected.dataset.id : null,
      order: buttons.map((button) => button.dataset.id).join(','),
      tabstops: open ? buttons.filter((button) => button.tabIndex === 0).length : 0,
    };
  }

  function pointerAt(el, x, y) {
    const rect = el.getBoundingClientRect();
    return {
      clientX: x == null ? rect.left + Math.min(8, rect.width / 2) : x,
      clientY: y == null ? rect.top + rect.height / 2 : y,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
      button: 0,
    };
  }

  function pause() {
    const ms = motion.matches ? 0 : 60;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function perform(step) {
    if (step.op === 'reset') {
      const open = typeof step.open === 'boolean' ? step.open : step.open.on;
      state = kit.initialState(open);
      virtualNow = 0;
      dragOrigin = null;
      render();
      return null;
    }
    if (step.now != null) virtualNow = step.now;
    if (step.op === 'clock') {
      virtualNow += step.ms;
      state = kit.reduce(state, {type: 'clock', now: virtualNow}, behaviors);
      render();
      return null;
    }
    if (step.op === 'expect') {
      const want = step.on;
      const got = domView();
      let ok = Object.keys(want).every((key) => got[key] === want[key]);
      if (ok && want.focus != null && (behaviors.createRovingFocus || behaviors.createTypeahead)) {
        const id = state.items[want.focus].id;
        if (!document.activeElement || document.activeElement.dataset.id !== id) ok = false;
      }
      return {ok: ok, label: step.label, got: got, want: want};
    }
    if (step.op === 'enter' || step.op === 'leave') {
      const el = step.target === 'panel' ? panel : trigger;
      el.dispatchEvent(new PointerEvent(step.op === 'enter' ? 'pointerenter' : 'pointerleave', {bubbles: true, pointerType: 'mouse'}));
      return null;
    }
    if (step.op === 'down') {
      const el = step.target === 'item' ? list.children[step.index || 0] : step.target === 'trigger' ? trigger : outside;
      el.dispatchEvent(new PointerEvent('pointerdown', pointerAt(el)));
      return null;
    }
    if (step.op === 'up') {
      document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: 1, pointerType: 'mouse'}));
      return null;
    }
    if (step.op === 'click') {
      const el = step.target === 'trigger' ? trigger : list.children[step.index || 0];
      el.click();
      return null;
    }
    if (step.op === 'focus') {
      const el = list.children[step.index || 0];
      el.focus();
      return null;
    }
    if (step.op === 'key') {
      const el = step.target === 'trigger' ? trigger : (list.children[state.focus] || list.children[0]);
      if (step.target !== 'list') el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: step.key,
        bubbles: true,
        cancelable: true,
        altKey: !!step.alt,
      }));
      return null;
    }
    if (step.op === 'drag' || step.op === 'nudge') {
      const from = list.children[step.from];
      const to = list.children[step.to];
      const start = from.getBoundingClientRect();
      const end = to.getBoundingClientRect();
      const y = step.op === 'nudge' ? start.top + start.height / 2 : end.top + end.height / 2;
      const x = step.op === 'nudge' ? start.left + 10 : end.left + end.width / 2;
      from.dispatchEvent(new PointerEvent('pointerdown', pointerAt(from, start.left + 8, start.top + start.height / 2)));
      from.dispatchEvent(new PointerEvent('pointermove', Object.assign(pointerAt(from, x, y), {buttons: 1})));
      document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: 1, pointerType: 'mouse'}));
      return null;
    }
    return null;
  }

  function addLine(kind, text) {
    const item = document.createElement('li');
    item.className = kind;
    item.textContent = text;
    results.appendChild(item);
  }

  testBtn.addEventListener('click', async () => {
    if (running) return;
    running = true;
    testing = true;
    testBtn.disabled = true;
    clearTimeout(timer);
    const saved = Object.assign({}, behaviors);
    results.replaceChildren();
    summary.textContent = 'Running.';
    stage.scrollIntoView({block: 'nearest'});
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (let s = 0; s < kit.SCENARIOS.length; s++) {
      const scenario = kit.SCENARIOS[s];
      if (!saved[scenario.id]) {
        skipped += 1;
        addLine('off', scenario.id + ' · not attached');
        continue;
      }
      behaviors = kit.blankBehaviors();
      behaviors[scenario.id] = true;
      addLine('group', scenario.id);
      let scenarioOk = true;
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        const line = await perform(step);
        if (line) {
          if (!line.ok) scenarioOk = false;
          addLine(line.ok ? 'pass' : 'fail', (line.ok ? 'Pass' : 'Fail') + ' · ' + line.label);
        }
        await pause();
      }
      if (scenarioOk) passed += 1;
      else failed += 1;
    }
    behaviors = saved;
    testing = false;
    running = false;
    virtualNow = 0;
    dragOrigin = null;
    state = kit.initialState(true);
    render();
    const parts = [passed + ' passed'];
    if (failed) parts.push(failed + ' failed');
    if (skipped) parts.push(skipped + ' not attached');
    summary.textContent = parts.join(', ') + '.';
    testBtn.disabled = false;
  });

  render();
})();
