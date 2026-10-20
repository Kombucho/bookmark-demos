(function () {
  const chat = window.CanvasChat;
  const prompts = document.getElementById('prompts');
  const log = document.getElementById('log');
  const form = document.getElementById('composer');
  const field = document.getElementById('prompt');
  const error = document.getElementById('form-error');
  const canvas = document.getElementById('canvas');
  const kicker = document.getElementById('canvas-kicker');
  const payload = document.getElementById('payload-json');
  const history = document.getElementById('history');
  let session = chat.createSession();

  const paraphrases = [
    'where are the fish stalls',
    'paint the harbor',
    'lets play a board game',
    'sort the prices',
  ];

  function button(label, className, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    if (className) el.className = className;
    el.addEventListener('click', onClick);
    return el;
  }

  chat.PROMPTS.forEach(function (prompt) {
    prompts.appendChild(button(prompt.text, '', function () { submit(prompt.text); }));
  });
  paraphrases.forEach(function (text) {
    prompts.appendChild(button(text, 'para', function () { submit(text); }));
  });

  function submit(text) {
    const outcome = chat.send(session, text);
    if (!outcome.ok) {
      error.textContent = outcome.error;
      return;
    }
    error.textContent = '';
    session = outcome.session;
    field.value = '';
    paint();
    const last = log.lastElementChild;
    if (last) last.scrollIntoView({block: 'nearest'});
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(field.value);
  });

  function paint() {
    paintLog();
    paintCanvas();
    paintHistory();
  }

  function paintLog() {
    log.replaceChildren();
    if (!session.messages.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Pick a prompt, or type one. A near miss still runs the closest script.';
      log.appendChild(p);
      return;
    }
    session.messages.forEach(function (message) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + message.role;
      const text = document.createElement('p');
      text.textContent = message.text;
      bubble.appendChild(text);
      if (message.call) {
        const pre = document.createElement('pre');
        pre.className = 'call';
        pre.textContent = JSON.stringify(message.call, null, 2);
        bubble.appendChild(pre);
      }
      log.appendChild(bubble);
    });
  }

  function selected() {
    return session.results.filter(function (result) { return result.id === session.selectedId; })[0] || null;
  }

  function paintCanvas() {
    canvas.replaceChildren();
    const result = selected();
    if (!result) {
      kicker.textContent = 'Nothing on the canvas yet.';
      payload.textContent = '';
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'A tool result will land here. The chat keeps the model’s half of the call. This pane keeps the view.';
      canvas.appendChild(p);
      return;
    }
    kicker.textContent = result.toolName + ' · ' + result.title;
    if (result.toolName === 'map') paintMap(result);
    else if (result.toolName === 'picture') paintPicture(result);
    else if (result.toolName === 'othello') paintGame(result);
    else paintLedger(result);
    payload.textContent = JSON.stringify({
      data: result.data && result.toolName === 'map' ? {place: result.data.place} : result.data && result.toolName === 'picture' ? result.data : result.toolName === 'ledger' ? {rows: result.data.rows.length} : result.data,
      viewState: result.toolName === 'othello'
        ? {turn: result.viewState.turn, over: result.viewState.over, note: result.viewState.note}
        : result.viewState,
      jsonData: result.jsonData,
    }, null, 2);
  }

  function act(action) {
    const outcome = chat.interact(session, session.selectedId, action);
    if (!outcome.ok) {
      const note = canvas.querySelector('.note');
      if (note) note.textContent = outcome.error;
      return;
    }
    session = outcome.session;
    paintCanvas();
    paintHistory();
  }

  function paintMap(result) {
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Saltmarket');
    result.data.rows.forEach(function (row, y) {
      row.split('').forEach(function (tile, x) {
        const cell = document.createElement('button');
        cell.type = 'button';
        const kind = tile === '~' ? 'water' : tile === 's' ? 'stall' : tile === 'm' ? 'hall' : tile === 'p' ? 'pier' : 'path';
        cell.className = kind;
        if (result.viewState.x === x && result.viewState.y === y) cell.classList.add('here');
        const name = result.data.places[x + ',' + y];
        cell.setAttribute('aria-label', (name || kind) + (cell.classList.contains('here') ? ', you are here' : ''));
        if (name) {
          const label = document.createElement('span');
          label.textContent = name;
          cell.appendChild(label);
        }
        cell.addEventListener('click', function () { act({type: 'move', x: x, y: y}); });
        grid.appendChild(cell);
      });
    });
    canvas.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'You are at ' + result.jsonData.visitor + '.';
    canvas.appendChild(note);
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    return el;
  }

  function paintPicture(result) {
    const svg = svgEl('svg', {class: 'scene', viewBox: '0 0 520 300', role: 'img', 'aria-label': 'Harbor at dusk'});
    svg.appendChild(svgEl('rect', {width: '520', height: '300', fill: '#243044'}));
    svg.appendChild(svgEl('circle', {cx: '400', cy: '70', r: '36', fill: '#e2b15a'}));
    svg.appendChild(svgEl('rect', {y: '168', width: '520', height: '132', fill: '#1c4c5c'}));
    const boats = svgEl('g', {fill: '#f3e6cf'});
    boats.appendChild(svgEl('path', {d: 'M70 190 L150 190 L132 214 L88 214 Z'}));
    boats.appendChild(svgEl('path', {d: 'M250 200 L340 200 L322 226 L270 226 Z'}));
    boats.appendChild(svgEl('rect', {x: '108', y: '150', width: '6', height: '40', fill: '#c9842a'}));
    if (!result.viewState.boats) boats.setAttribute('visibility', 'hidden');
    svg.appendChild(boats);
    const lamps = svgEl('g', {});
    [[120, 148], [300, 176], [420, 150]].forEach(function (point) {
      lamps.appendChild(svgEl('circle', {cx: point[0], cy: point[1], r: '7', fill: '#f2d48a'}));
    });
    if (!result.viewState.lamps) lamps.setAttribute('visibility', 'hidden');
    svg.appendChild(lamps);
    const rain = svgEl('g', {stroke: '#d5e4ea', 'stroke-width': '2'});
    for (let i = 0; i < 18; i++) {
      const x = 20 + (i * 29) % 500;
      const y = 16 + (i * 17) % 140;
      rain.appendChild(svgEl('line', {x1: x, y1: y, x2: x - 8, y2: y + 16}));
    }
    if (!result.viewState.rain) rain.setAttribute('visibility', 'hidden');
    svg.appendChild(rain);
    canvas.appendChild(svg);
    const layers = document.createElement('div');
    layers.className = 'layers';
    ['lamps', 'boats', 'rain'].forEach(function (layer) {
      const toggle = button(layer, '', function () { act({type: 'toggle', layer: layer}); });
      toggle.setAttribute('aria-pressed', result.viewState[layer] ? 'true' : 'false');
      layers.appendChild(toggle);
    });
    canvas.appendChild(layers);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Layers are the view state. The drawing is local SVG, not a generated image.';
    canvas.appendChild(note);
  }

  function paintGame(result) {
    const board = document.createElement('div');
    board.className = 'board';
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', 'Othello');
    const legal = {};
    if (!result.viewState.over) {
      chat.legalMoves(result.viewState.board, 1).forEach(function (move) {
        legal[move.x + ',' + move.y] = true;
      });
    }
    result.viewState.board.forEach(function (row, y) {
      row.forEach(function (cell, x) {
        const square = document.createElement('button');
        square.type = 'button';
        const name = chat.coord(x, y);
        if (cell === 1) square.className = 'dark';
        else if (cell === 2) square.className = 'light';
        else if (legal[x + ',' + y]) square.classList.add('legal');
        const disc = document.createElement('i');
        square.appendChild(disc);
        const who = cell === 1 ? 'dark' : cell === 2 ? 'light' : legal[x + ',' + y] ? 'legal' : 'empty';
        square.setAttribute('aria-label', name + ' ' + who);
        square.addEventListener('click', function () { act({type: 'move', x: x, y: y}); });
        board.appendChild(square);
      });
    });
    canvas.appendChild(board);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = result.viewState.note;
    canvas.appendChild(note);
  }

  function paintLedger(result) {
    const rows = chat.sortedRows(result.data.rows, result.viewState);
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    const head = document.createElement('tr');
    ['stall', 'catch', 'price', 'hour'].forEach(function (key) {
      const th = document.createElement('th');
      th.scope = 'col';
      const label = key + (result.viewState.key === key ? (result.viewState.dir === 'asc' ? ' ↑' : ' ↓') : '');
      const control = button(label, '', function () { act({type: 'sort', key: key}); });
      th.setAttribute('aria-sort', result.viewState.key === key ? (result.viewState.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.appendChild(control);
      head.appendChild(th);
    });
    const thead = document.createElement('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const body = document.createElement('tbody');
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      ['stall', 'catch', 'price', 'hour'].forEach(function (key) {
        const td = document.createElement('td');
        td.textContent = String(row[key]);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    canvas.appendChild(wrap);
  }

  function paintHistory() {
    history.replaceChildren();
    if (!session.results.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Each tool result stays here after the next reply.';
      history.appendChild(p);
      return;
    }
    session.results.forEach(function (result) {
      const label = result.title + ' · ' + result.toolName;
      const el = button(label, '', function () {
        const outcome = chat.select(session, result.id);
        if (!outcome.ok) return;
        session = outcome.session;
        paint();
      });
      el.setAttribute('aria-pressed', result.id === session.selectedId ? 'true' : 'false');
      history.appendChild(el);
    });
  }

  paint();
})();
