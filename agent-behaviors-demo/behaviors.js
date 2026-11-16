// Composable UI behaviors for the playground.
// The names match helpers in UI SDK. The state machine is this page's.
// Nothing here touches the DOM or the network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AgentBehaviors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HOVER_DELAY = 600;
  const HOVER_CLOSE_DELAY = 300;
  const DRAG_THRESHOLD = 3;
  const TYPEAHEAD_WINDOW = 500;

  const ITEMS = [
    {id: 'oak', label: 'Oak'},
    {id: 'ash', label: 'Ash'},
    {id: 'elm', label: 'Elm'},
    {id: 'birch', label: 'Birch'},
    {id: 'pine', label: 'Pine'},
    {id: 'yew', label: 'Yew'},
  ];

  const ORIGINAL = ITEMS.map((item) => item.id).join(',');

  const BEHAVIORS = [
    {
      id: 'press',
      name: 'press',
      detail: 'Press feedback while the pointer, Enter, or Space is held.',
    },
    {
      id: 'openOnHover',
      name: 'openOnHover',
      detail: 'Hover intent. Opens after 600 ms and waits 300 ms before it closes, so the pointer can cross the gap. A tap opens immediately.',
    },
    {
      id: 'bindLayer',
      name: 'bindLayer',
      detail: 'Dismiss on Escape or an outside press. Those reasons are escape-key and outside-press.',
    },
    {
      id: 'createRovingFocus',
      name: 'createRovingFocus',
      detail: 'One Tab stop for the list. Up and down arrows, Home, and End move through the rows.',
    },
    {
      id: 'createTypeahead',
      name: 'createTypeahead',
      detail: 'Type a letter to move to the row that starts with it. This page keeps the buffer for 500 ms.',
    },
    {
      id: 'createSelection',
      name: 'createSelection',
      detail: 'Click a row, or press Space or Enter, to select that one row.',
    },
    {
      id: 'createReorder',
      name: 'createReorder',
      detail: 'Drag a row. The drag starts after 3 px. Alt and an arrow key moves the focused row.',
    },
  ];

  function blankBehaviors() {
    return {
      press: false,
      openOnHover: false,
      bindLayer: false,
      createRovingFocus: false,
      createTypeahead: false,
      createSelection: false,
      createReorder: false,
    };
  }

  function allOn() {
    const behaviors = blankBehaviors();
    BEHAVIORS.forEach((behavior) => {
      behaviors[behavior.id] = true;
    });
    return behaviors;
  }

  function cloneItems(items) {
    return items.map((item) => ({id: item.id, label: item.label}));
  }

  function initialState(open) {
    return {
      items: cloneItems(ITEMS),
      open: open !== false,
      pressed: null,
      focus: 0,
      selected: null,
      buffer: '',
      bufferAt: -1,
      armed: null,
      overTrigger: false,
      overPanel: false,
      drag: null,
      lastReason: null,
    };
  }

  function clone(state) {
    return {
      items: state.items,
      open: state.open,
      pressed: state.pressed,
      focus: state.focus,
      selected: state.selected,
      buffer: state.buffer,
      bufferAt: state.bufferAt,
      armed: state.armed,
      overTrigger: state.overTrigger,
      overPanel: state.overPanel,
      drag: state.drag,
      lastReason: state.lastReason,
    };
  }

  function moveItem(items, from, to) {
    if (from === to) return items.slice();
    const next = items.slice();
    const [item] = next.splice(from, 1);
    const index = to < 0 ? 0 : to > next.length ? next.length : to;
    next.splice(index, 0, item);
    return next;
  }

  function isTypeaheadKey(event) {
    if (!event || event.alt || event.ctrl || event.meta) return false;
    return typeof event.key === 'string' && event.key.length === 1 && event.key !== ' ';
  }

  function matchTypeahead(items, focus, buffer, key) {
    const search = (buffer + key).toLowerCase();
    const start = search.length === 1 ? focus + 1 : focus;
    for (let i = 0; i < items.length; i++) {
      const index = (start + i) % items.length;
      if (items[index].label.toLowerCase().startsWith(search)) {
        return {index: index, buffer: search};
      }
    }
    if (search.length > 1) return matchTypeahead(items, focus, '', key);
    return {index: focus, buffer: ''};
  }

  function viewOf(state, behaviors) {
    let tabstops = 0;
    if (state.open) tabstops = behaviors.createRovingFocus ? 1 : state.items.length;
    return {
      pressed: behaviors.press ? state.pressed : null,
      open: !!state.open,
      focus: state.focus,
      selected: behaviors.createSelection ? state.selected : null,
      order: state.items.map((item) => item.id).join(','),
      tabstops: tabstops,
    };
  }

  function specText(behaviors) {
    const lines = ['name: field-notes', 'behaviors:'];
    let any = false;
    function add(on, line) {
      if (!on) return;
      any = true;
      lines.push(line);
    }
    add(behaviors.press, '  press: {}');
    add(behaviors.openOnHover, '  openOnHover: { delay: 600, closeDelay: 300 }');
    add(behaviors.bindLayer, '  bindLayer: { dismiss: [escape-key, outside-press] }');
    add(behaviors.createRovingFocus, '  createRovingFocus: { orientation: vertical }');
    add(behaviors.createTypeahead, '  createTypeahead: {}');
    add(behaviors.createSelection, '  createSelection: { multiple: false }');
    add(behaviors.createReorder, '  createReorder: { threshold: 3 }');
    if (!any) lines.push('  []');
    return lines.join('\n');
  }

  function instructions(behaviors) {
    const parts = [];
    if (behaviors.press) parts.push('Hold a row and it marks the press.');
    if (behaviors.openOnHover) parts.push('Close the list, then rest on Notes for 600 ms. A tap opens it at once.');
    if (behaviors.bindLayer) parts.push('Escape, or a press outside, closes it.');
    if (behaviors.createRovingFocus) parts.push('Tab to the list, then use the arrow keys.');
    if (behaviors.createTypeahead) parts.push('Type a letter to jump.');
    if (behaviors.createSelection) parts.push('Click a row, or press Space, to select it.');
    if (behaviors.createReorder) parts.push('Drag a row, or hold Alt and press an arrow.');
    if (!parts.length) return 'Every behavior is off. The rows are plain buttons.';
    return parts.join(' ');
  }

  function keyClaims(state, event, behaviors) {
    const key = event.key;
    if (key === 'Escape') return !!(behaviors.bindLayer && state.open);
    if (!state.open) return false;
    if (event.alt && (key === 'ArrowDown' || key === 'ArrowUp')) return !!behaviors.createReorder;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      return !!behaviors.createRovingFocus;
    }
    if (isTypeaheadKey(event)) return !!behaviors.createTypeahead;
    if ((key === ' ' || key === 'Enter') && event.target !== 'trigger') {
      return !!(behaviors.createSelection || behaviors.press);
    }
    if ((key === ' ' || key === 'Enter') && behaviors.press) return true;
    return false;
  }

  function reduce(state, event, behaviors) {
    const next = clone(state);
    const type = event.type;

    if (type === 'pointerdown') {
      if (event.target === 'outside') {
        if (behaviors.bindLayer && state.open) {
          next.open = false;
          next.armed = null;
          next.pressed = null;
          next.lastReason = 'outside-press';
        }
        return next;
      }
      if (event.target === 'trigger') {
        if (behaviors.press) next.pressed = 'trigger';
        return next;
      }
      if (event.target === 'item') {
        next.focus = event.index;
        if (behaviors.press) next.pressed = event.id;
        if (behaviors.createReorder) {
          next.drag = {
            from: event.index,
            id: event.id,
            origin: state.items,
            active: false,
            over: event.index,
          };
        }
        return next;
      }
      return state;
    }

    if (type === 'pointermove') {
      if (!state.drag || !behaviors.createReorder) return state;
      if (event.distance < DRAG_THRESHOLD && !state.drag.active) return state;
      const over = event.overIndex < 0 ? 0 : event.overIndex >= state.drag.origin.length
        ? state.drag.origin.length - 1
        : event.overIndex;
      next.items = moveItem(state.drag.origin, state.drag.from, over);
      next.focus = next.items.findIndex((item) => item.id === state.drag.id);
      next.pressed = null;
      next.drag = {
        from: state.drag.from,
        id: state.drag.id,
        origin: state.drag.origin,
        active: true,
        over: over,
      };
      return next;
    }

    if (type === 'pointerup' || type === 'pointercancel') {
      if (type === 'pointercancel' && state.drag && state.drag.active) {
        next.items = state.drag.origin;
        next.focus = state.drag.from;
      }
      next.pressed = null;
      next.drag = null;
      return next;
    }

    if (type === 'pointerenter') {
      if (event.target === 'trigger') next.overTrigger = true;
      if (event.target === 'panel') next.overPanel = true;
      if (!behaviors.openOnHover) return next;
      if (event.target === 'trigger') {
        if (state.open) next.armed = null;
        else next.armed = {action: 'open', at: event.now + HOVER_DELAY};
      }
      if (event.target === 'panel' && state.armed && state.armed.action === 'close') {
        next.armed = null;
      }
      return next;
    }

    if (type === 'pointerleave') {
      if (event.target === 'trigger') next.overTrigger = false;
      if (event.target === 'panel') next.overPanel = false;
      if (!behaviors.openOnHover) return next;
      if (event.target === 'trigger' && state.armed && state.armed.action === 'open') {
        next.armed = null;
      }
      const stillOver = next.overTrigger || next.overPanel;
      if (state.open && !stillOver) {
        next.armed = {action: 'close', at: event.now + HOVER_CLOSE_DELAY};
      }
      return next;
    }

    if (type === 'clock') {
      if (!behaviors.openOnHover || !state.armed || event.now < state.armed.at) return state;
      next.open = state.armed.action === 'open';
      next.lastReason = state.armed.action === 'open' ? 'trigger-hover' : state.lastReason;
      next.armed = null;
      return next;
    }

    if (type === 'keydown') {
      const key = event.key;
      if (key === 'Escape') {
        if (behaviors.bindLayer && state.open) {
          next.open = false;
          next.armed = null;
          next.pressed = null;
          next.lastReason = 'escape-key';
        }
        return next;
      }
      if (!state.open) return state;
      if (event.alt && (key === 'ArrowDown' || key === 'ArrowUp') && behaviors.createReorder) {
        const from = state.focus;
        const to = from + (key === 'ArrowDown' ? 1 : -1);
        if (to >= 0 && to < state.items.length) {
          next.items = moveItem(state.items, from, to);
          next.focus = to;
        }
        return next;
      }
      if (behaviors.createRovingFocus && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End')) {
        const count = state.items.length;
        if (key === 'ArrowDown') next.focus = (state.focus + 1) % count;
        else if (key === 'ArrowUp') next.focus = (state.focus + count - 1) % count;
        else if (key === 'Home') next.focus = 0;
        else next.focus = count - 1;
        return next;
      }
      if (behaviors.createTypeahead && isTypeaheadKey(event)) {
        const fresh = state.bufferAt < 0 || event.now - state.bufferAt > TYPEAHEAD_WINDOW;
        const found = matchTypeahead(state.items, state.focus, fresh ? '' : state.buffer, key);
        next.buffer = found.buffer;
        next.bufferAt = event.now;
        next.focus = found.index;
        return next;
      }
      if (key === ' ' || key === 'Enter') {
        if (behaviors.press) {
          next.pressed = event.target === 'trigger' ? 'trigger' : state.items[state.focus].id;
        }
        if (event.target !== 'trigger' && behaviors.createSelection) {
          next.selected = state.items[state.focus].id;
        }
        return next;
      }
      return state;
    }

    if (type === 'keyup') {
      if (event.key === ' ' || event.key === 'Enter') next.pressed = null;
      return next;
    }

    if (type === 'click') {
      if (event.target === 'trigger') {
        if (behaviors.openOnHover || behaviors.bindLayer) {
          next.open = !state.open;
          next.armed = null;
          next.lastReason = next.open ? 'trigger-press' : next.lastReason;
        }
        return next;
      }
      if (event.target === 'item') {
        next.focus = event.index;
        if (event.dragged) return next;
        if (behaviors.createSelection) next.selected = event.id;
        return next;
      }
      return state;
    }

    if (type === 'focus') {
      if (event.target === 'item') {
        next.focus = event.index;
        return next;
      }
      if (event.target === 'trigger' && behaviors.openOnHover && !state.open) {
        next.armed = {action: 'open', at: event.now + HOVER_DELAY};
        return next;
      }
      return state;
    }

    if (type === 'focusout') {
      if (!behaviors.openOnHover) return state;
      const inside = event.to === 'trigger' || event.to === 'panel' || event.to === 'item';
      if (inside) return state;
      if (state.armed && state.armed.action === 'open') next.armed = null;
      if (state.open) next.armed = {action: 'close', at: event.now + HOVER_CLOSE_DELAY};
      return next;
    }

    return state;
  }

  const SCENARIOS = [
    {
      id: 'press',
      steps: [
        {op: 'reset', open: true},
        {op: 'down', target: 'item', index: 0},
        {op: 'expect', label: 'Pointer down marks Oak', on: {pressed: 'oak'}, off: {pressed: null}},
        {op: 'up'},
        {op: 'expect', label: 'Pointer up clears the mark', on: {pressed: null}, off: {pressed: null}},
      ],
    },
    {
      id: 'openOnHover',
      steps: [
        {op: 'reset', open: {on: false, off: true}},
        {op: 'enter', target: 'trigger'},
        {op: 'clock', ms: 599},
        {op: 'expect', label: 'clock +599 · still waiting', on: {open: false}, off: {open: true}},
        {op: 'clock', ms: 1},
        {op: 'expect', label: 'clock +600 · the list opens', on: {open: true}, off: {open: true}},
        {op: 'leave', target: 'trigger'},
        {op: 'clock', ms: 299},
        {op: 'expect', label: 'clock +299 · the close delay holds it', on: {open: true}, off: {open: true}},
        {op: 'clock', ms: 1},
        {op: 'expect', label: 'clock +300 · the list closes', on: {open: false}, off: {open: true}},
        {op: 'enter', target: 'trigger'},
        {op: 'clock', ms: 200},
        {op: 'leave', target: 'trigger'},
        {op: 'clock', ms: 500},
        {op: 'expect', label: 'Leaving before 600 ms never opens it', on: {open: false}, off: {open: true}},
        {op: 'click', target: 'trigger'},
        {op: 'expect', label: 'A tap opens it without waiting', on: {open: true}, off: {open: true}},
      ],
    },
    {
      id: 'bindLayer',
      steps: [
        {op: 'reset', open: true},
        {op: 'key', key: 'Escape', target: 'list'},
        {op: 'expect', label: 'key Escape · dismiss escape-key', on: {open: false}, off: {open: true}},
        {op: 'click', target: 'trigger'},
        {op: 'expect', label: 'tap Notes · the list opens', on: {open: true}, off: {open: true}},
        {op: 'down', target: 'outside'},
        {op: 'expect', label: 'tap outside · dismiss outside-press', on: {open: false}, off: {open: true}},
      ],
    },
    {
      id: 'createRovingFocus',
      steps: [
        {op: 'reset', open: true},
        {op: 'focus', index: 0},
        {op: 'key', key: 'ArrowDown', target: 'item'},
        {op: 'expect', label: 'key ArrowDown · focus moves to Ash', on: {focus: 1, tabstops: 1}, off: {focus: 0, tabstops: 6}},
        {op: 'key', key: 'End', target: 'item'},
        {op: 'expect', label: 'key End · focus moves to Yew', on: {focus: 5}, off: {focus: 0}},
        {op: 'key', key: 'ArrowUp', target: 'item'},
        {op: 'expect', label: 'key ArrowUp · focus moves to Pine', on: {focus: 4}, off: {focus: 0}},
      ],
    },
    {
      id: 'createTypeahead',
      steps: [
        {op: 'reset', open: true},
        {op: 'focus', index: 0},
        {op: 'key', key: 'p', target: 'item', now: 0},
        {op: 'expect', label: 'type p · focus moves to Pine', on: {focus: 4}, off: {focus: 0}},
        {op: 'key', key: 'b', target: 'item', now: 1000},
        {op: 'key', key: 'i', target: 'item', now: 1200},
        {op: 'expect', label: 'type bi · focus stays on Birch', on: {focus: 3}, off: {focus: 0}},
      ],
    },
    {
      id: 'createSelection',
      steps: [
        {op: 'reset', open: true},
        {op: 'click', target: 'item', index: 2},
        {op: 'expect', label: 'tap Elm · selected', on: {selected: 'elm'}, off: {selected: null}},
        {op: 'focus', index: 4},
        {op: 'key', key: ' ', target: 'item'},
        {op: 'expect', label: 'key Space · Pine is selected', on: {selected: 'pine'}, off: {selected: null}},
      ],
    },
    {
      id: 'createReorder',
      steps: [
        {op: 'reset', open: true},
        {op: 'key', key: 'ArrowDown', alt: true, target: 'item'},
        {op: 'expect', label: 'key Alt+ArrowDown · Oak moves down', on: {order: 'ash,oak,elm,birch,pine,yew'}, off: {order: ORIGINAL}},
        {op: 'reset', open: true},
        {op: 'nudge', from: 0, to: 3},
        {op: 'expect', label: 'A 2 px move does not reorder', on: {order: ORIGINAL}, off: {order: ORIGINAL}},
        {op: 'drag', from: 0, to: 3},
        {op: 'expect', label: 'drag Oak onto Birch · order changes', on: {order: 'ash,elm,birch,oak,pine,yew'}, off: {order: ORIGINAL}},
      ],
    },
  ];

  function stepEvent(state, step, now) {
    if (step.op === 'down') {
      const index = step.index || 0;
      const item = state.items[index];
      return {
        type: 'pointerdown',
        target: step.target,
        index: index,
        id: item ? item.id : null,
        now: now,
      };
    }
    if (step.op === 'up') return {type: 'pointerup', now: now};
    if (step.op === 'enter') return {type: 'pointerenter', target: step.target, now: now};
    if (step.op === 'leave') return {type: 'pointerleave', target: step.target, now: now};
    if (step.op === 'key') {
      return {
        type: 'keydown',
        key: step.key,
        alt: !!step.alt,
        ctrl: false,
        meta: false,
        target: step.target || 'item',
        now: now,
      };
    }
    if (step.op === 'click') {
      const index = step.index || 0;
      const item = state.items[index];
      return {
        type: 'click',
        target: step.target,
        index: index,
        id: item ? item.id : null,
        dragged: false,
        now: now,
      };
    }
    if (step.op === 'focus') {
      return {type: 'focus', target: step.target || 'item', index: step.index || 0, now: now};
    }
    return {type: 'noop', now: now};
  }

  function applyGesture(state, behaviors, step, now) {
    const distance = step.op === 'nudge' ? 2 : 12;
    const index = step.from;
    const item = state.items[index];
    let next = reduce(state, {
      type: 'pointerdown',
      target: 'item',
      index: index,
      id: item.id,
      now: now,
    }, behaviors);
    next = reduce(next, {
      type: 'pointermove',
      distance: distance,
      overIndex: step.to,
      now: now,
    }, behaviors);
    next = reduce(next, {type: 'pointerup', now: now}, behaviors);
    return next;
  }

  function applySteps(behaviors, steps, enabled) {
    let state = initialState(true);
    let now = 0;
    const lines = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.op === 'reset') {
        const open = typeof step.open === 'boolean' ? step.open : (enabled ? step.open.on : step.open.off);
        state = initialState(open);
        now = 0;
        continue;
      }
      if (step.op === 'expect') {
        const want = enabled ? step.on : step.off;
        const got = viewOf(state, behaviors);
        const keys = Object.keys(want);
        let ok = true;
        for (let k = 0; k < keys.length; k++) {
          if (got[keys[k]] !== want[keys[k]]) ok = false;
        }
        lines.push({ok: ok, label: step.label, want: want, got: got});
        continue;
      }
      if (step.op === 'clock') {
        now += step.ms;
        state = reduce(state, {type: 'clock', now: now}, behaviors);
        continue;
      }
      if (step.now != null) now = step.now;
      if (step.op === 'drag' || step.op === 'nudge') {
        state = applyGesture(state, behaviors, step, now);
        continue;
      }
      state = reduce(state, stepEvent(state, step, now), behaviors);
    }
    return {
      state: state,
      lines: lines,
      pass: lines.length > 0 && lines.every((line) => line.ok),
    };
  }

  function runScenario(id, enabled) {
    const scenario = null;
    for (let i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) {
        const behaviors = blankBehaviors();
        behaviors[id] = !!enabled;
        const result = applySteps(behaviors, SCENARIOS[i].steps, !!enabled);
        result.id = id;
        return result;
      }
    }
    return scenario;
  }

  function statusText(state) {
    if (state.armed && state.armed.action === 'open') return 'Waiting for the hover delay.';
    if (state.armed && state.armed.action === 'close') return 'The pointer left. The close delay is running.';
    if (!state.open && state.lastReason === 'escape-key') return 'Dismissed · escape-key.';
    if (!state.open && state.lastReason === 'outside-press') return 'Dismissed · outside-press.';
    if (state.open && state.lastReason === 'trigger-hover') return 'Opened · trigger-hover.';
    if (state.open && state.lastReason === 'trigger-press') return 'Opened · trigger-press.';
    return state.open ? 'The list is open.' : 'The list is closed.';
  }

  return {
    HOVER_DELAY: HOVER_DELAY,
    HOVER_CLOSE_DELAY: HOVER_CLOSE_DELAY,
    DRAG_THRESHOLD: DRAG_THRESHOLD,
    TYPEAHEAD_WINDOW: TYPEAHEAD_WINDOW,
    ITEMS: ITEMS,
    ORIGINAL: ORIGINAL,
    BEHAVIORS: BEHAVIORS,
    SCENARIOS: SCENARIOS,
    blankBehaviors: blankBehaviors,
    allOn: allOn,
    initialState: initialState,
    moveItem: moveItem,
    isTypeaheadKey: isTypeaheadKey,
    matchTypeahead: matchTypeahead,
    viewOf: viewOf,
    specText: specText,
    instructions: instructions,
    keyClaims: keyClaims,
    reduce: reduce,
    applySteps: applySteps,
    runScenario: runScenario,
    statusText: statusText,
  };
});
