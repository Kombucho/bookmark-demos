(function () {
  const Game = window.PortfolioRogue;
  const folio = document.getElementById('folio');
  const gameEl = document.getElementById('game');
  const mapEl = document.getElementById('map');
  const logEl = document.getElementById('log');
  const boardEl = document.getElementById('board');
  const toggle = document.getElementById('mode-toggle');
  const endEl = document.getElementById('end');
  const endCopy = document.getElementById('end-copy');
  const savedNote = document.getElementById('saved');
  const scoreForm = document.getElementById('score-form');

  let state = Game.createState();
  let mode = 'folio';
  let scrollY = 0;

  function store() {
    try {
      const probe = window.localStorage;
      probe.getItem(Game.SCORE_KEY);
      return probe;
    } catch (err) {
      return {
        getItem: function () { return null; },
        setItem: function () {},
      };
    }
  }

  function setMode(next) {
    if (next === mode) return;
    if (next === 'game') {
      scrollY = window.scrollY || window.pageYOffset || 0;
      mode = 'game';
      document.body.dataset.mode = 'game';
      gameEl.hidden = false;
      folio.setAttribute('inert', '');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      gameEl.focus({ preventScroll: true });
      const y = scrollY;
      requestAnimationFrame(function () { window.scrollTo(0, y); });
    } else {
      mode = 'folio';
      document.body.dataset.mode = 'folio';
      gameEl.hidden = true;
      folio.removeAttribute('inert');
      const y = scrollY;
      window.scrollTo(0, y);
      requestAnimationFrame(function () { window.scrollTo(0, y); });
    }
    toggle.textContent = mode === 'game' ? 'Esc · Back to the portfolio' : 'Esc · Play the floor';
    toggle.setAttribute('aria-pressed', mode === 'game' ? 'true' : 'false');
  }

  function enemyAt(x, y) {
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      if (enemy.hp > 0 && enemy.x === x && enemy.y === y) return enemy;
    }
    return null;
  }

  function itemAt(x, y) {
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      if (item.x === x && item.y === y) return item;
    }
    return null;
  }

  function renderMap() {
    mapEl.replaceChildren();
    const label = Game.roomName(state);
    document.getElementById('room-label').textContent = label;
    gameEl.setAttribute('aria-label', 'Fieldnote floor. You are in the ' + label + '.');
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const cell = document.createElement('span');
        cell.className = 'cell';
        let kind = 'floor';
        let glyph = '·';
        if (state.tiles[y][x] === '#') {
          kind = 'wall';
          glyph = '';
        } else if (state.player.x === x && state.player.y === y) {
          kind = 'player';
          glyph = '@';
        } else if (enemyAt(x, y)) {
          kind = 'enemy';
          glyph = enemyAt(x, y).glyph;
        } else if (itemAt(x, y)) {
          const item = itemAt(x, y);
          kind = 'item';
          glyph = item.id === 'tea' ? 't' : item.id === 'colophon' ? 'a' : (item.glyph || '·');
        } else if (state.exit && state.exit.x === x && state.exit.y === y) {
          kind = 'exit';
          glyph = '>';
        } else if (state.doors[x + ',' + y]) {
          kind = 'door';
          glyph = '+';
        }
        cell.classList.add(kind);
        cell.textContent = glyph;
        mapEl.appendChild(cell);
      }
    }
  }

  function renderHud() {
    const player = state.player;
    document.getElementById('hp').textContent = 'HP ' + player.hp + ' / ' + player.max;
    document.getElementById('score').textContent = String(state.score);
    document.getElementById('carry').textContent = state.inventory.length
      ? 'Carrying ' + state.inventory.join(', ') + '.'
      : 'Nothing carried.';
    logEl.replaceChildren();
    state.log.forEach(function (line) {
      const li = document.createElement('li');
      li.textContent = line;
      logEl.appendChild(li);
    });
    const over = state.status !== 'play';
    endEl.hidden = !over;
    if (over) {
      endCopy.textContent = state.status === 'won'
        ? 'You reached the letter office with ' + state.score + ' points.'
        : 'The run ends at ' + state.score + ' points.';
      scoreForm.hidden = !!state.recorded;
      savedNote.hidden = !state.recorded;
    }
  }

  function renderBoard() {
    const scores = Game.loadScores(store());
    boardEl.replaceChildren();
    if (!scores.length) {
      const li = document.createElement('li');
      li.textContent = 'No runs yet.';
      boardEl.appendChild(li);
      return;
    }
    scores.forEach(function (row, index) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = (index + 1) + '  ' + row.name;
      const value = document.createElement('span');
      value.textContent = row.score + (row.result === 'won' ? ' · out' : '');
      li.appendChild(name);
      li.appendChild(value);
      boardEl.appendChild(li);
    });
  }

  function render() {
    renderMap();
    renderHud();
    renderBoard();
  }

  function move(dir) {
    if (mode !== 'game') return;
    Game.act(state, dir);
    render();
  }

  toggle.addEventListener('click', function () {
    setMode(mode === 'game' ? 'folio' : 'game');
  });

  document.querySelectorAll('.pad button').forEach(function (button) {
    button.addEventListener('click', function () {
      move(button.getAttribute('data-dir'));
    });
  });

  document.getElementById('restart').addEventListener('click', function () {
    state = Game.createState();
    render();
    gameEl.focus({ preventScroll: true });
  });

  scoreForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (state.recorded || state.status === 'play') return;
    Game.submitScore(store(), {
      name: document.getElementById('score-name').value,
      score: state.score,
      result: state.status,
    });
    state.recorded = true;
    render();
  });

  document.getElementById('contact-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const note = document.getElementById('contact-note');
    note.hidden = false;
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode(mode === 'game' ? 'folio' : 'game');
      return;
    }
    if (mode !== 'game') return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const map = {
      ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e',
      w: 'n', W: 'n', s: 's', S: 's', a: 'w', A: 'w', d: 'e', D: 'e',
    };
    const dir = map[event.key];
    if (!dir) return;
    event.preventDefault();
    move(dir);
  });

  render();
})();
