(function () {
  const api = window.ComponentCanvas;
  const picker = document.getElementById('picker');
  const tokensEl = document.getElementById('tokens');
  const viewport = document.getElementById('viewport');
  const world = document.getElementById('world');
  const dockKicker = document.getElementById('dock-kicker');
  const dockTitle = document.getElementById('dock-title');
  const axesEl = document.getElementById('axes');
  const promoteBtn = document.getElementById('promote');
  const clearBtn = document.getElementById('clear');
  const statusEl = document.getElementById('status');

  const pressed = {};
  const drafts = {};
  let board = api.createBoard();
  let selectedId = 'button';
  let drag = null;

  api.COMPONENTS.forEach(function (component) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = component.name;
    button.dataset.id = component.id;
    button.addEventListener('click', function () { select(component.id, true); });
    picker.appendChild(button);
  });

  ['density', 'radius', 'emphasis'].forEach(function (axis) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.axis = axis;
    button.textContent = api.AXES[axis].label;
    button.addEventListener('click', function () { spawnAxis(axis); });
    axesEl.appendChild(button);
  });

  function viewSize() {
    const dock = document.querySelector('.dock');
    const dockH = dock ? dock.offsetHeight + 28 : 170;
    return {
      w: viewport.clientWidth,
      h: Math.max(180, viewport.clientHeight - dockH),
      fullH: viewport.clientHeight,
    };
  }

  function itemById(id) {
    return board.items.filter(function (item) { return item.id === id; })[0] || null;
  }

  function selected() {
    return itemById(selectedId) || itemById('button');
  }

  function sourceOf(item) {
    if (!item) return itemById('button');
    if (item.role === 'source') return item;
    return itemById(item.sourceId);
  }

  function capture() {
    world.querySelectorAll('input').forEach(function (input) {
      drafts[input.dataset.item] = input.value;
    });
  }

  function applyCamera() {
    const camera = board.camera;
    world.style.transform = 'translate(' + camera.x + 'px, ' + camera.y + 'px) scale(' + camera.scale + ')';
  }

  function applyStyle(el, style) {
    el.style.setProperty('--pad', style.pad + 'px');
    el.style.setProperty('--gap', style.gap + 'px');
    el.style.setProperty('--type', style.type + 'px');
    el.style.setProperty('--radius', style.radius + 'px');
    el.style.setProperty('--fill', style.fill);
    el.style.setProperty('--comp-ink', style.ink);
    el.style.setProperty('--rule', style.line);
    el.style.setProperty('--accent', style.accent);
  }

  function buttonPair(item, primary) {
    const row = document.createElement('div');
    row.className = 'pair';
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'ui-button';
    const saved = pressed[item.id] === true;
    main.textContent = saved ? 'Saved' : primary;
    main.setAttribute('aria-pressed', saved ? 'true' : 'false');
    main.addEventListener('click', function (event) {
      event.stopPropagation();
      pressed[item.id] = !pressed[item.id];
      main.textContent = pressed[item.id] ? 'Saved' : primary;
      main.setAttribute('aria-pressed', pressed[item.id] ? 'true' : 'false');
    });
    const ghost = document.createElement('button');
    ghost.type = 'button';
    ghost.className = 'ui-button ghost';
    ghost.textContent = 'Cancel';
    ghost.addEventListener('click', function (event) { event.stopPropagation(); });
    row.append(main, ghost);
    return row;
  }

  function componentBody(item) {
    if (item.componentId === 'button') return buttonPair(item, 'Continue');
    if (item.componentId === 'card') {
      const card = document.createElement('article');
      card.className = 'ui-card';
      const kicker = document.createElement('p');
      kicker.className = 'ui-kicker';
      kicker.textContent = 'Field note';
      const title = document.createElement('h3');
      title.className = 'ui-title';
      title.textContent = 'Kiln log';
      const body = document.createElement('p');
      body.className = 'ui-copy';
      body.textContent = 'The first firing stuck at cone 06. Leave the door cracked until the shelf is warm.';
      card.append(kicker, title, body, buttonPair(item, 'Save'));
      return card;
    }
    if (item.componentId === 'field') {
      const label = document.createElement('label');
      label.className = 'ui-field';
      const name = document.createElement('span');
      name.textContent = 'Title';
      const input = document.createElement('input');
      input.className = 'ui-input';
      input.dataset.item = item.id;
      input.value = drafts[item.id] == null ? 'Morning pages' : drafts[item.id];
      input.setAttribute('aria-label', 'Title');
      input.addEventListener('input', function () { drafts[item.id] = input.value; });
      input.addEventListener('click', function (event) { event.stopPropagation(); });
      const hint = document.createElement('span');
      hint.className = 'ui-hint';
      hint.textContent = 'Stored with the note.';
      label.append(name, input, hint);
      return label;
    }
    const row = document.createElement('div');
    row.className = 'badge-row';
    ['Draft', 'Sent', 'Local'].forEach(function (word, index) {
      const badge = document.createElement('span');
      badge.className = 'ui-badge' + (index === 0 ? '' : ' ghost');
      badge.textContent = word;
      row.appendChild(badge);
    });
    return row;
  }

  function paintWorld() {
    capture();
    world.replaceChildren();
    board.items.forEach(function (item) {
      const style = api.tokenStyle(api.resolveTokens(board, item));
      const card = document.createElement('article');
      card.className = 'specimen' + (item.role === 'variation' ? ' is-variation' : ' is-source');
      if (item.id === selectedId) card.classList.add('is-selected');
      if (item.role === 'variation' && board.tokens[item.axis] === item.value) card.classList.add('is-current');
      card.style.left = item.x + 'px';
      card.style.top = item.y + 'px';
      card.style.width = item.w + 'px';
      card.style.height = item.h + 'px';
      applyStyle(card, style);

      const head = document.createElement('div');
      head.className = 'specimen-head';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'select';
      const strong = document.createElement('strong');
      strong.textContent = item.name;
      const meta = document.createElement('span');
      if (item.role === 'source') meta.textContent = 'Source · ' + api.tokenLine(api.resolveTokens(board, item));
      else meta.textContent = api.AXES[item.axis].label + ' · ' + api.labelOf(item.axis, item.value);
      selectBtn.append(strong, meta);
      selectBtn.addEventListener('click', function () { select(item.id, false); });
      head.appendChild(selectBtn);
      if (item.role === 'variation') {
        const promote = document.createElement('button');
        promote.type = 'button';
        promote.className = 'promote';
        promote.textContent = 'Promote';
        promote.addEventListener('click', function (event) {
          event.stopPropagation();
          doPromote(item.id);
        });
        head.appendChild(promote);
      }

      const body = document.createElement('div');
      body.className = 'specimen-body';
      body.appendChild(componentBody(item));
      card.append(head, body);
      world.appendChild(card);
    });
  }

  function paintChrome() {
    const item = selected();
    const source = sourceOf(item);
    tokensEl.textContent = api.tokenLine(board.tokens);
    picker.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.id === source.id ? 'true' : 'false');
    });
    dockKicker.textContent = item.role === 'variation' ? 'Trial' : 'Component';
    if (item.role === 'variation') {
      dockTitle.textContent = source.name + ' · ' + api.labelOf(item.axis, item.value) + ' ' + api.AXES[item.axis].label.toLowerCase() + '. The other tokens are the ones on the board.';
      promoteBtn.hidden = false;
      promoteBtn.textContent = 'Promote ' + api.labelOf(item.axis, item.value);
    } else {
      dockTitle.textContent = source.name + '. Spawn one axis. Density, radius, and emphasis are compared one at a time.';
      promoteBtn.hidden = true;
    }
    const openAxes = {};
    board.items.forEach(function (entry) {
      if (entry.role === 'variation' && entry.sourceId === source.id) openAxes[entry.axis] = true;
    });
    axesEl.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', openAxes[button.dataset.axis] ? 'true' : 'false');
    });
    clearBtn.disabled = !board.items.some(function (entry) { return entry.role === 'variation'; });
    applyCamera();
  }

  function paint() {
    if (!itemById(selectedId)) selectedId = 'button';
    paintWorld();
    paintChrome();
  }

  function select(id, revealItem) {
    selectedId = id;
    if (revealItem) {
      const item = itemById(id);
      const size = viewSize();
      if (item && size.w && size.h) {
        board = api.setCamera(board, api.reveal(board.camera, item, size.w, size.h, 28));
      }
    }
    paint();
  }

  function spawnAxis(axis) {
    const source = sourceOf(selected());
    const outcome = api.spawn(board, source.id, axis);
    if (!outcome.ok) {
      statusEl.textContent = outcome.error;
      return;
    }
    board = outcome.board;
    const trials = board.items.filter(function (item) {
      return item.role === 'variation' && item.sourceId === source.id && item.axis === axis;
    });
    const size = viewSize();
    if (size.w && size.h) {
      board = api.setCamera(board, api.reveal(board.camera, api.bounds(trials), size.w, size.h, 28));
    }
    statusEl.textContent = api.AXES[axis].label + ' is beside ' + source.name + '. The other tokens are unchanged.';
    paint();
  }

  function doPromote(id) {
    const item = itemById(id);
    const outcome = api.promote(board, id);
    if (!outcome.ok) {
      statusEl.textContent = outcome.error;
      return;
    }
    board = outcome.board;
    selectedId = id;
    statusEl.textContent = 'Promoted ' + api.labelOf(item.axis, item.value) + '. Button, Card, Field, and Badge use it.';
    paint();
  }

  promoteBtn.addEventListener('click', function () { doPromote(selectedId); });

  clearBtn.addEventListener('click', function () {
    const current = selected();
    const nextId = current && current.role === 'variation' ? current.sourceId : selectedId;
    board = api.clearVariations(board).board;
    selectedId = nextId;
    statusEl.textContent = 'Comparisons cleared. The tokens stay.';
    paint();
  });

  document.getElementById('zoom-in').addEventListener('click', function () {
    const size = viewSize();
    board = api.setCamera(board, api.zoomStep(board.camera, 1, size.w / 2, size.fullH / 2));
    applyCamera();
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    const size = viewSize();
    board = api.setCamera(board, api.zoomStep(board.camera, -1, size.w / 2, size.fullH / 2));
    applyCamera();
  });
  document.getElementById('fit').addEventListener('click', function () {
    const size = viewSize();
    board = api.setCamera(board, api.frame(board.items, size.w, size.h, 36));
    applyCamera();
  });

  viewport.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    if (event.target.closest('.specimen, .dock, .zoom, button, a, input, label')) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      camX: board.camera.x,
      camY: board.camera.y,
    };
    viewport.classList.add('is-panning');
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    board = api.setCamera(board, api.pan(
      { x: drag.camX, y: drag.camY, scale: board.camera.scale },
      event.clientX - drag.x,
      event.clientY - drag.y
    ));
    applyCamera();
  });
  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    drag = null;
    viewport.classList.remove('is-panning');
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener('wheel', function (event) {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    board = api.setCamera(board, api.zoomAt(
      board.camera,
      board.camera.scale * factor,
      event.clientX - rect.left,
      event.clientY - rect.top
    ));
    applyCamera();
  }, { passive: false });

  document.addEventListener('keydown', function (event) {
    if (event.target.closest('input, textarea')) return;
    const size = viewSize();
    if (event.key === '+' || event.key === '=') {
      board = api.setCamera(board, api.zoomStep(board.camera, 1, size.w / 2, size.fullH / 2));
      applyCamera();
    } else if (event.key === '-' || event.key === '_') {
      board = api.setCamera(board, api.zoomStep(board.camera, -1, size.w / 2, size.fullH / 2));
      applyCamera();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      board = api.setCamera(board, api.pan(board.camera, 48, 0));
      applyCamera();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      board = api.setCamera(board, api.pan(board.camera, -48, 0));
      applyCamera();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      board = api.setCamera(board, api.pan(board.camera, 0, 48));
      applyCamera();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      board = api.setCamera(board, api.pan(board.camera, 0, -48));
      applyCamera();
    } else if (event.key === '0') {
      board = api.setCamera(board, api.frame(board.items, size.w, size.h, 36));
      applyCamera();
    }
  });

  function fitInitial() {
    const size = viewSize();
    if (!size.w || !size.h) return;
    board = api.setCamera(board, api.frame(board.items, size.w, size.h, 36));
    applyCamera();
  }

  paint();
  requestAnimationFrame(fitInitial);
})();
