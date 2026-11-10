(function () {
  const api = window.MicroBranch;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAD = 16;
  const CARD_W = 188;
  const CARD_H = 142;
  const GAP_X = 22;
  const GAP_Y = 28;
  const ACCENTS = ['#0A84FF', '#30B0C7', '#34C759', '#FF9F0A', '#FF375F', '#5E5CE6', '#1C1C1E'];

  const phonesEl = document.querySelector('#phones');
  const inspectorEl = document.querySelector('#inspector');
  const canvasEl = document.querySelector('#canvas');
  const workEl = document.querySelector('#work');
  const statusEl = document.querySelector('#status');

  let state = readState();

  paint();

  document.body.addEventListener('click', onClick);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('submit', function (event) { event.preventDefault(); });

  function readState() {
    try {
      return api.load(localStorage.getItem(api.STORAGE_KEY)) || api.createTree();
    } catch (e) {
      return api.createTree();
    }
  }

  function persist() {
    try { localStorage.setItem(api.STORAGE_KEY, api.dump(state)); } catch (e) { /* private mode */ }
  }

  function say(text) {
    statusEl.textContent = text;
  }

  function el(tag, props) {
    const node = document.createElement(tag);
    const attrs = props || {};
    Object.keys(attrs).forEach(function (key) {
      const value = attrs[key];
      if (value == null || value === false) return;
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value);
    });
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid == null || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }

  function svg(tag, props) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(props || {}).forEach(function (key) {
      node.setAttribute(key, props[key]);
    });
    for (let i = 2; i < arguments.length; i++) node.appendChild(arguments[i]);
    return node;
  }

  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const y = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
    return y > 160 ? '#1C1C1E' : '#FFFFFF';
  }

  function applyTokens(screen, tokens) {
    screen.style.setProperty('--radius', tokens.radius);
    screen.style.setProperty('--space', tokens.spacing);
    screen.style.setProperty('--accent', tokens.accent);
    screen.style.setProperty('--type', tokens.type);
    screen.style.setProperty('--shadow', tokens.shadow);
    screen.style.setProperty('--on-accent', inkFor(tokens.accent));
    screen.setAttribute('data-layout', tokens.layout);
  }

  function paintSwatch(swatch, tokens) {
    swatch.style.setProperty('--accent', tokens.accent);
    swatch.style.setProperty('--radius', String(Math.min(tokens.radius, 12)));
    swatch.style.setProperty('--shadow', tokens.shadow);
  }

  function layoutName(layout) {
    if (layout === 'inset') return 'Map inside card';
    if (layout === 'stack') return 'Profile, then map';
    return 'Map, then card';
  }

  function renderMap() {
    const pin = svg('g', { class: 'pin', transform: 'translate(156 28)' },
      svg('path', { class: 'pin-head', d: 'M0 30 C0 30 -14 16 -14 9 A14 14 0 1 1 14 9 C14 16 0 30 0 30 Z' }),
      svg('circle', { cx: '0', cy: '9', r: '5', fill: '#fff' })
    );
    const streets = svg('g', { fill: 'none', stroke: '#F7F4EE', 'stroke-width': '7', 'stroke-linecap': 'square' },
      svg('path', { d: 'M0 70 H320' }),
      svg('path', { d: 'M0 150 H210' }),
      svg('path', { d: 'M48 0 V320' }),
      svg('path', { d: 'M128 0 V320' }),
      svg('path', { d: 'M214 36 V320' })
    );
    return el('div', { class: 'map' },
      svg('svg', { viewBox: '0 0 320 280', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' },
        svg('rect', { width: '320', height: '280', fill: '#D5E2EA' }),
        svg('path', { d: 'M190 0 C230 48 200 96 246 150 C286 196 228 230 268 280 L320 280 L320 0 Z', fill: '#C5D5E6' }),
        svg('ellipse', { cx: '78', cy: '196', rx: '58', ry: '40', fill: '#C9DCC4' }),
        streets,
        svg('circle', { cx: '86', cy: '108', r: '5', fill: '#8E8E93' }),
        svg('circle', { cx: '146', cy: '176', r: '5', fill: '#8E8E93' }),
        pin
      ),
      el('p', { class: 'map-label' }, 'North Beach')
    );
  }

  function renderCard(tokens) {
    return el('article', { class: 'card' },
      el('div', { class: 'who' },
        el('div', { class: 'avatar', 'aria-hidden': 'true' }, 'ME'),
        el('div', {},
          el('p', { class: 'name' }, 'Mara Ellison'),
          el('p', { class: 'meta' }, 'North Beach · 4 min')
        )
      ),
      el('p', { class: 'line' }, 'Walking the waterfront. Open to a coffee if you’re nearby.'),
      el('button', { type: 'button', class: 'hello' }, 'Say hello')
    );
  }

  function renderSheet(tokens) {
    return el('form', { class: 'tune' },
      el('div', { class: 'grabber', 'aria-hidden': 'true' }),
      el('div', { class: 'tune-head' },
        el('strong', {}, 'Config panel'),
        el('span', {}, 'Live, not baked')
      ),
      slider('radius', 'Corner radius', 0, 40, tokens.radius, ' px'),
      slider('spacing', 'Spacing', 8, 32, tokens.spacing, ' px'),
      slider('type', 'Type size', 13, 24, tokens.type, ' px'),
      slider('shadow', 'Shadow', 0, 40, tokens.shadow, ''),
      chips(tokens.accent),
      el('div', { class: 'tune-actions' },
        el('button', { type: 'button', class: 'bake', 'data-bake': '1' }, 'Remove panel / bake values'),
        el('button', { type: 'button', 'data-discard': '1' }, 'Discard')
      )
    );
  }

  function slider(name, label, min, max, value, unit) {
    return el('label', { class: 'slider' },
      el('span', {}, label),
      el('output', { 'data-out': name }, value + unit),
      el('input', { type: 'range', name: name, min: String(min), max: String(max), step: '1', value: String(value), 'aria-label': label })
    );
  }

  function chips(accent) {
    const row = el('div', { class: 'chips', role: 'group', 'aria-label': 'Accent colour' });
    ACCENTS.forEach(function (hex) {
      row.appendChild(el('button', {
        type: 'button',
        'data-accent': hex,
        'aria-label': hex,
        'aria-pressed': hex === accent ? 'true' : 'false',
        style: 'background:' + hex,
      }));
    });
    row.appendChild(el('input', { type: 'color', name: 'accent', value: accent.toLowerCase(), 'aria-label': 'Custom accent' }));
    return row;
  }

  function renderPhone(node, role) {
    const live = role === 'current' && state.panel.open && state.panel.baseId === node.id;
    const tokens = api.activeTokens(state, node.id);
    const screen = el('div', { class: live ? 'screen is-live is-tuning' : 'screen' });
    applyTokens(screen, tokens);
    screen.appendChild(el('div', { class: 'island', 'aria-hidden': 'true' }));
    screen.appendChild(el('div', { class: 'status-bar' },
      el('span', {}, '9:41'),
      el('span', { class: 'glyphs', 'aria-hidden': 'true' },
        el('i', { class: 'bars' }),
        el('i', { class: 'battery' })
      )
    ));
    screen.appendChild(el('div', { class: 'nav' },
      el('strong', {}, 'Near'),
      el('span', {}, 'Map')
    ));
    const card = renderCard(tokens);
    const map = renderMap();
    if (tokens.layout === 'inset') {
      card.insertBefore(map, card.firstChild);
      screen.appendChild(card);
    } else if (tokens.layout === 'stack') {
      screen.appendChild(card);
      screen.appendChild(map);
    } else {
      screen.appendChild(map);
      screen.appendChild(card);
    }
    if (live) screen.appendChild(renderSheet(tokens));
    const caption = el('p', { class: 'phone-caption' },
      el('strong', {}, (role === 'compare' ? 'Comparing · ' : 'On the phone · ') + node.title),
      ' ' + node.id + (live ? ' · panel open' : '')
    );
    return el('div', { class: 'phone-col' },
      el('div', { class: 'device' }, el('div', { class: 'bezel' }, screen)),
      caption
    );
  }

  function renderInspector() {
    const node = api.findNode(state, state.currentId);
    const tokens = api.activeTokens(state, node.id);
    const box = el('div');
    box.appendChild(el('p', { class: 'kicker' }, node.id + ' · ' + node.kind + (node.rejected ? ' · rejected' : '')));
    box.appendChild(el('h2', {}, node.title));
    box.appendChild(el('p', { class: 'blurb' }, node.blurb));
    if (node.rejected) {
      box.appendChild(el('p', { class: 'reason' }, node.reason));
      box.appendChild(el('button', { type: 'button', 'data-restore': node.id }, 'Clear rejection'));
    }
    node.skipped.filter(function (item) { return item.rejected; }).forEach(function (item) {
      box.appendChild(el('p', { class: 'skipped' }, 'Did not rebuild “' + item.title + '”: ' + item.reason));
    });
    const actions = el('div', { class: 'actions' });
    actions.appendChild(el('button', { type: 'button', 'data-fork': node.id }, 'Fork a micro-branch'));
    if (state.panel.open) actions.appendChild(el('button', { type: 'button', 'data-discard': '1' }, 'Discard panel'));
    else actions.appendChild(el('button', { type: 'button', 'data-tune': '1' }, 'Open config panel'));
    if (state.compareId) actions.appendChild(el('button', { type: 'button', 'data-clear-compare': '1' }, 'Close comparison'));
    actions.appendChild(el('button', { type: 'button', 'data-reset': '1' }, 'Reset canvas'));
    box.appendChild(actions);
    if (!node.rejected) {
      box.appendChild(el('form', { class: 'reject-form' },
        el('label', { for: 'reason' }, 'Rejection reason'),
        el('input', { id: 'reason', name: 'reason', maxlength: String(api.REASON_MAX), placeholder: 'Corners felt cheap', autocomplete: 'off' }),
        el('p', { class: 'hint' }, 'One line. A later fork skips a recipe that would rebuild this screen.'),
        el('p', { class: 'form-error', id: 'reason-error' }),
        el('button', { type: 'button', 'data-reject': node.id }, 'Mark this branch rejected')
      ));
    }
    const readout = el('dl', { class: 'readout' });
    [
      ['radius', 'Corner radius', tokens.radius + ' px'],
      ['spacing', 'Spacing', tokens.spacing + ' px'],
      ['type', 'Type size', tokens.type + ' px'],
      ['shadow', 'Shadow', String(tokens.shadow)],
      ['accent', 'Accent', tokens.accent],
      ['layout', 'Arrangement', layoutName(tokens.layout)],
    ].forEach(function (row) {
      readout.appendChild(el('div', {},
        el('dt', {}, row[1]),
        el('dd', { 'data-live': row[0] }, row[2])
      ));
    });
    box.appendChild(readout);
    return box;
  }

  function renderCanvas() {
    const pos = api.layoutNodes(state);
    let maxX = 0;
    let maxY = 0;
    state.nodes.forEach(function (node) {
      maxX = Math.max(maxX, pos[node.id].x);
      maxY = Math.max(maxY, pos[node.id].y);
    });
    canvasEl.style.width = (PAD * 2 + Math.ceil(maxX) * (CARD_W + GAP_X) + CARD_W) + 'px';
    canvasEl.style.height = (PAD * 2 + maxY * (CARD_H + GAP_Y) + CARD_H) + 'px';
    canvasEl.replaceChildren();
    const wires = svg('svg', { class: 'wires' });
    state.nodes.forEach(function (node) {
      if (!node.parentId || !pos[node.parentId]) return;
      const from = point(pos[node.parentId], CARD_H);
      const to = point(pos[node.id], 0);
      const mid = (from.y + to.y) / 2;
      wires.appendChild(svg('path', {
        d: 'M ' + from.x + ' ' + from.y + ' C ' + from.x + ' ' + mid + ', ' + to.x + ' ' + mid + ', ' + to.x + ' ' + to.y,
      }));
    });
    canvasEl.appendChild(wires);
    state.nodes.forEach(function (node) {
      const tokens = api.activeTokens(state, node.id);
      const card = el('div', {
        class: 'node' + (node.id === state.currentId ? ' is-current' : '') + (node.id === state.compareId ? ' is-compare' : '') + (node.rejected ? ' is-rejected' : ''),
        style: 'left:' + (PAD + pos[node.id].x * (CARD_W + GAP_X)) + 'px;top:' + (PAD + pos[node.id].y * (CARD_H + GAP_Y)) + 'px;width:' + CARD_W + 'px;height:' + CARD_H + 'px',
      });
      const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' }, el('i'));
      paintSwatch(swatch, tokens);
      card.appendChild(el('button', { type: 'button', class: 'jump', 'data-select': node.id },
        el('span', { class: 'node-top' },
          swatch,
          el('span', {},
            el('span', { class: 'id' }, node.id + ' · ' + node.kind),
            el('span', { class: 'title' }, node.title)
          )
        )
      ));
      if (node.rejected) card.appendChild(el('p', { class: 'why', title: node.reason }, node.reason));
      else card.appendChild(el('p', { class: 'why', style: 'color:#5e564c' }, layoutName(tokens.layout)));
      const actions = el('div', { class: 'node-actions' });
      actions.appendChild(el('button', { type: 'button', 'data-fork': node.id }, 'Fork'));
      if (node.id !== state.currentId) {
        actions.appendChild(el('button', {
          type: 'button',
          'data-compare': node.id,
          'aria-pressed': node.id === state.compareId ? 'true' : 'false',
        }, node.id === state.compareId ? 'Comparing' : 'Compare'));
      }
      card.appendChild(actions);
      canvasEl.appendChild(card);
    });
  }

  function point(pos, yOffset) {
    return {
      x: PAD + pos.x * (CARD_W + GAP_X) + CARD_W / 2,
      y: PAD + pos.y * (CARD_H + GAP_Y) + yOffset,
    };
  }

  function paint() {
    workEl.classList.toggle('is-comparing', Boolean(state.compareId));
    phonesEl.replaceChildren(renderPhone(api.findNode(state, state.currentId), 'current'));
    if (state.compareId) phonesEl.appendChild(renderPhone(api.findNode(state, state.compareId), 'compare'));
    inspectorEl.replaceChildren(renderInspector());
    renderCanvas();
  }

  function unit(name, tokens) {
    if (name === 'radius' || name === 'spacing' || name === 'type') return tokens[name] + ' px';
    if (name === 'accent') return tokens.accent;
    if (name === 'layout') return layoutName(tokens.layout);
    return String(tokens[name]);
  }

  function syncLive() {
    const id = state.panel.baseId;
    const tokens = api.activeTokens(state, id);
    document.querySelectorAll('.screen.is-live').forEach(function (screen) { applyTokens(screen, tokens); });
    document.querySelectorAll('[data-out]').forEach(function (out) {
      const name = out.getAttribute('data-out');
      out.textContent = unit(name, tokens);
    });
    document.querySelectorAll('[data-live]').forEach(function (cell) {
      cell.textContent = unit(cell.getAttribute('data-live'), tokens);
    });
    const swatch = document.querySelector('.node.is-current .swatch');
    if (swatch) paintSwatch(swatch, tokens);
    document.querySelectorAll('[data-accent]').forEach(function (chip) {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-accent') === tokens.accent ? 'true' : 'false');
    });
  }

  function onInput(event) {
    const target = event.target;
    if (!state.panel.open || !target.name) return;
    if (target.name === 'accent') state = api.tune(state, { accent: target.value });
    else if (target.name === 'radius' || target.name === 'spacing' || target.name === 'type' || target.name === 'shadow') {
      state = api.tune(state, named(target.name, Number(target.value)));
    } else return;
    persist();
    syncLive();
  }

  function named(name, value) {
    const patch = {};
    patch[name] = value;
    return patch;
  }

  function onClick(event) {
    const accent = event.target.closest('[data-accent]');
    if (accent) {
      state = api.tune(state, { accent: accent.getAttribute('data-accent') });
      persist();
      syncLive();
      const picker = document.querySelector('input[name="accent"]');
      if (picker) picker.value = api.activeTokens(state, state.panel.baseId).accent.toLowerCase();
      return;
    }
    if (event.target.closest('[data-bake]')) return doBake();
    if (event.target.closest('[data-discard]')) {
      state = api.closePanel(state);
      persist();
      say('Discarded the panel. The branch keeps its previous values.');
      paint();
      return;
    }
    if (event.target.closest('[data-tune]')) {
      state = api.openPanel(state);
      persist();
      say('The config panel is on the phone. Drag a slider, then bake it into a branch.');
      paint();
      return;
    }
    if (event.target.closest('[data-clear-compare]')) {
      state = api.clearCompare(state);
      persist();
      paint();
      return;
    }
    if (event.target.closest('[data-reset]')) {
      if (!window.confirm('Clear every branch on this canvas?')) return;
      state = api.createTree();
      persist();
      say('Canvas reset to the seed.');
      paint();
      return;
    }
    const reject = event.target.closest('[data-reject]');
    if (reject) return doReject(reject.getAttribute('data-reject'));
    const restore = event.target.closest('[data-restore]');
    if (restore) {
      const id = restore.getAttribute('data-restore');
      state = api.restoreNode(state, id);
      persist();
      say('Cleared the rejection on ' + api.findNode(state, id).title + '.');
      paint();
      return;
    }
    const fork = event.target.closest('[data-fork]');
    if (fork) return doFork(fork.getAttribute('data-fork'));
    const compare = event.target.closest('[data-compare]');
    if (compare) {
      const id = compare.getAttribute('data-compare');
      state = api.toggleCompare(state, id);
      persist();
      say(state.compareId ? 'Comparing ' + api.findNode(state, state.compareId).title + ' with the phone.' : 'Comparison closed.');
      paint();
      return;
    }
    const select = event.target.closest('[data-select]');
    if (select) doSelect(select.getAttribute('data-select'));
  }

  function doSelect(id) {
    const next = api.selectNode(state, id);
    if (next === state) return;
    const closed = state.panel.open && next.panel.open === false;
    state = next;
    persist();
    say((closed ? 'Closed the panel without baking. ' : '') + api.findNode(state, id).title + ' is on the phone.');
    paint();
  }

  function doFork(id) {
    const result = api.forkFrom(state, id);
    if (!result.created) return;
    state = result.tree;
    persist();
    const parent = api.findNode(state, result.created.parentId);
    const avoided = result.created.skipped.filter(function (item) { return item.rejected; });
    let text = 'Forked “' + result.created.title + '” from ' + parent.title + '.';
    if (avoided.length) {
      text += ' Skipped ' + avoided.map(function (item) {
        return '“' + item.title + '” (' + item.reason + ')';
      }).join(', ') + '.';
    }
    say(text);
    paint();
  }

  function doBake() {
    const result = api.bake(state);
    state = result.tree;
    persist();
    if (result.unchanged) say('Removed the panel. Nothing had changed, so no new branch.');
    else if (result.created) say('Baked the tuned values as “' + result.created.title + '” and removed the panel.');
    paint();
  }

  function doReject(id) {
    const input = document.querySelector('#reason');
    const error = document.querySelector('#reason-error');
    const text = input ? input.value : '';
    if (!String(text).trim()) {
      if (error) error.textContent = 'Add a one-line reason first.';
      if (input) input.focus();
      return;
    }
    state = api.rejectNode(state, id, text);
    persist();
    const node = api.findNode(state, id);
    say('Rejected ' + node.title + ': ' + node.reason);
    paint();
  }
})();
