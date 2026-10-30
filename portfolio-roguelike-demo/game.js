// A small turn-based floor. The rooms are a fictional studio's projects.
// Scores stay in localStorage. Nothing is sent anywhere.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PortfolioRogue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SCORE_KEY = 'bookmark-demos.portfolio-roguelike.v1';
  const BOARD_LIMIT = 8;

  const MAP = [
    '#######################',
    '#@....t.#..1....#..>..#',
    '#.......#.......#.....#',
    '#.......+.......+.....#',
    '####+###########+######',
    '#..2....#..3....#..4..#',
    '#.......+.......+.....#',
    '#..r....#..c....#..b..#',
    '#.......#.......#.....#',
    '####+##################',
    '#..a..................#',
    '#.....................#',
    '#######################',
  ];

  const ROOMS = [
    { name: 'Studio', x0: 1, y0: 1, x1: 7, y1: 3 },
    { name: 'Harbor Index', x0: 9, y0: 1, x1: 15, y1: 3 },
    { name: 'Letter office', x0: 17, y0: 1, x1: 21, y1: 3 },
    { name: 'Kiln', x0: 1, y0: 5, x1: 7, y1: 8 },
    { name: 'Low Lamp', x0: 9, y0: 5, x1: 15, y1: 8 },
    { name: 'Sunday Route', x0: 17, y0: 5, x1: 21, y1: 8 },
    { name: 'Reading room', x0: 1, y0: 10, x1: 21, y1: 11 },
  ];

  const FOLIOS = {
    '1': {
      id: 'harbor',
      name: 'Harbor Index',
      score: 20,
      blurb: 'A catalog for a maritime library. The search sits in the margin.',
    },
    '2': {
      id: 'kiln',
      name: 'Kiln',
      score: 20,
      blurb: 'An identity for a ceramics school. The wordmark is a bowl in profile.',
    },
    '3': {
      id: 'lamp',
      name: 'Low Lamp',
      score: 20,
      blurb: 'A notes app with one column and no avatars. Export is a text file.',
    },
    '4': {
      id: 'route',
      name: 'Sunday Route',
      score: 20,
      blurb: 'Wayfinding for a walking club. The type is readable with the sheet folded once.',
    },
  };

  const ENEMIES = {
    r: { id: 'rush', name: 'Rush', hp: 4, atk: 2, glyph: 'r' },
    c: { id: 'critic', name: 'Critic', hp: 6, atk: 2, glyph: 'c' },
    b: { id: 'blank', name: 'Blank Page', hp: 8, atk: 3, glyph: 'b' },
  };

  const DIRS = {
    n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0],
    north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
  };

  function createState() {
    const height = MAP.length;
    const width = MAP[0].length;
    const tiles = [];
    const items = [];
    const enemies = [];
    const doors = {};
    let player = null;
    let exit = null;
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const glyph = MAP[y].charAt(x);
        row.push(glyph === '#' ? '#' : '.');
        if (glyph === '+') doors[x + ',' + y] = true;
        if (glyph === '@') player = { x: x, y: y, hp: 12, max: 12, atk: 3 };
        else if (glyph === '>') exit = { x: x, y: y };
        else if (glyph === 't') {
          items.push({
            id: 'tea',
            kind: 'tea',
            name: 'Studio tea',
            x: x,
            y: y,
            score: 0,
            heal: 5,
            blurb: 'A cup left on the studio table.',
          });
        } else if (FOLIOS[glyph]) {
          const folio = FOLIOS[glyph];
          items.push({
            id: folio.id,
            kind: 'folio',
            name: folio.name,
            x: x,
            y: y,
            score: folio.score,
            heal: 0,
            blurb: folio.blurb,
            glyph: glyph,
          });
        } else if (glyph === 'a') {
          items.push({
            id: 'colophon',
            kind: 'folio',
            name: 'Colophon',
            x: x,
            y: y,
            score: 10,
            heal: 0,
            blurb: 'A short note on how the studio works.',
          });
        } else if (ENEMIES[glyph]) {
          const kind = ENEMIES[glyph];
          enemies.push({
            id: kind.id,
            name: kind.name,
            glyph: kind.glyph,
            x: x,
            y: y,
            hp: kind.hp,
            max: kind.hp,
            atk: kind.atk,
          });
        }
      }
      tiles.push(row);
    }
    return {
      width: width,
      height: height,
      tiles: tiles,
      player: player,
      exit: exit,
      items: items,
      enemies: enemies,
      doors: doors,
      inventory: [],
      score: 0,
      turn: 0,
      status: 'play',
      log: ['The studio floor is quiet. The projects are still on their tables.'],
    };
  }

  function inBounds(state, x, y) {
    return y >= 0 && y < state.height && x >= 0 && x < state.width;
  }

  function isWall(state, x, y) {
    return !inBounds(state, x, y) || state.tiles[y][x] === '#';
  }

  function enemyAt(state, x, y) {
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      if (enemy.hp > 0 && enemy.x === x && enemy.y === y) return enemy;
    }
    return null;
  }

  function itemAt(state, x, y) {
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      if (item.x === x && item.y === y) return item;
    }
    return null;
  }

  function occupied(state, x, y, ignore) {
    if (isWall(state, x, y)) return true;
    if (state.player.x === x && state.player.y === y) return true;
    const enemy = enemyAt(state, x, y);
    if (enemy && enemy !== ignore) return true;
    return false;
  }

  function roomName(state, x, y) {
    const px = x == null ? state.player.x : x;
    const py = y == null ? state.player.y : y;
    for (let i = 0; i < ROOMS.length; i++) {
      const room = ROOMS[i];
      if (px >= room.x0 && px <= room.x1 && py >= room.y0 && py <= room.y1) return room.name;
    }
    return 'Hall';
  }

  function pushLog(state, line) {
    state.log.push(line);
    if (state.log.length > 8) state.log = state.log.slice(state.log.length - 8);
  }

  function takeItem(state, item) {
    if (item.kind === 'tea') {
      const before = state.player.hp;
      state.player.hp = Math.min(state.player.max, state.player.hp + item.heal);
      const gained = state.player.hp - before;
      pushLog(state, gained
        ? 'You drink the studio tea. +' + gained + ' HP.'
        : 'You drink the studio tea. HP is unchanged.');
    } else {
      state.score += item.score;
      state.inventory.push(item.name);
      pushLog(state, 'Took ' + item.name + '. +' + item.score + '. ' + item.blurb);
    }
    state.items = state.items.filter(function (other) { return other !== item; });
  }

  function strikePlayer(state, enemy) {
    state.player.hp -= enemy.atk;
    pushLog(state, enemy.name + ' hits you for ' + enemy.atk + '.');
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.status = 'dead';
      pushLog(state, 'The floor goes quiet. Score ' + state.score + '.');
    }
  }

  function strikeEnemy(state, enemy) {
    enemy.hp -= state.player.atk;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      state.score += 8;
      state.enemies = state.enemies.filter(function (other) { return other !== enemy; });
      pushLog(state, enemy.name + ' is spent. +8.');
      return;
    }
    pushLog(state, 'You strike ' + enemy.name + ' for ' + state.player.atk + '. ' + enemy.hp + ' left.');
  }

  function enemyAct(state, enemy) {
    if (state.status !== 'play' || enemy.hp <= 0) return;
    const dx = state.player.x - enemy.x;
    const dy = state.player.y - enemy.y;
    const manhattan = Math.abs(dx) + Math.abs(dy);
    if (manhattan === 1) {
      strikePlayer(state, enemy);
      return;
    }
    const options = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx) options.push([dx > 0 ? 1 : -1, 0]);
      if (dy) options.push([0, dy > 0 ? 1 : -1]);
    } else {
      if (dy) options.push([0, dy > 0 ? 1 : -1]);
      if (dx) options.push([dx > 0 ? 1 : -1, 0]);
    }
    for (let i = 0; i < options.length; i++) {
      const nextX = enemy.x + options[i][0];
      const nextY = enemy.y + options[i][1];
      if (!occupied(state, nextX, nextY, enemy)) {
        enemy.x = nextX;
        enemy.y = nextY;
        return;
      }
    }
  }

  function enemyTurn(state) {
    const order = state.enemies.slice();
    for (let i = 0; i < order.length; i++) {
      if (state.status !== 'play') return;
      enemyAct(state, order[i]);
    }
  }

  function act(state, dir) {
    if (!state || state.status !== 'play') return { ok: false, reason: 'still' };
    const step = DIRS[dir];
    if (!step) return { ok: false, reason: 'dir' };
    const nextX = state.player.x + step[0];
    const nextY = state.player.y + step[1];
    if (isWall(state, nextX, nextY)) {
      pushLog(state, 'The wall holds.');
      return { ok: false, reason: 'wall' };
    }
    const enemy = enemyAt(state, nextX, nextY);
    if (enemy) {
      strikeEnemy(state, enemy);
      state.turn += 1;
      enemyTurn(state);
      return { ok: true, reason: 'attack' };
    }
    state.player.x = nextX;
    state.player.y = nextY;
    const item = itemAt(state, nextX, nextY);
    if (item) takeItem(state, item);
    if (state.exit && nextX === state.exit.x && nextY === state.exit.y) {
      const bonus = 15 + state.player.hp;
      state.score += bonus;
      state.status = 'won';
      pushLog(state, 'The letter office. You leave the floor. +' + bonus + '.');
      return { ok: true, reason: 'exit' };
    }
    state.turn += 1;
    if (!item) {
      const here = roomName(state) + '.';
      if (state.log[state.log.length - 1] !== here) pushLog(state, here);
    }
    enemyTurn(state);
    return { ok: true, reason: 'move' };
  }

  function sanitizeName(name) {
    const clean = String(name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);
    return clean || 'Anon';
  }

  function validRow(row) {
    return !!row && typeof row.name === 'string' && typeof row.score === 'number' && Number.isFinite(row.score);
  }

  function compareScores(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return (a.at || 0) - (b.at || 0);
  }

  function loadScores(storage) {
    try {
      const raw = storage.getItem(SCORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(validRow).slice(0, BOARD_LIMIT);
    } catch (err) {
      return [];
    }
  }

  function submitScore(storage, entry) {
    const scores = loadScores(storage);
    const row = {
      name: sanitizeName(entry && entry.name),
      score: entry && Number.isFinite(entry.score) ? Math.max(0, Math.round(entry.score)) : 0,
      result: entry && entry.result === 'won' ? 'won' : 'dead',
      at: entry && entry.at ? entry.at : Date.now(),
    };
    const next = scores.concat(row).sort(compareScores).slice(0, BOARD_LIMIT);
    try {
      storage.setItem(SCORE_KEY, JSON.stringify(next));
    } catch (err) {
      return scores;
    }
    return next;
  }

  return {
    SCORE_KEY: SCORE_KEY,
    MAP: MAP,
    ROOMS: ROOMS,
    FOLIOS: FOLIOS,
    createState: createState,
    act: act,
    roomName: roomName,
    isWall: isWall,
    loadScores: loadScores,
    submitScore: submitScore,
    sanitizeName: sanitizeName,
  };
});
