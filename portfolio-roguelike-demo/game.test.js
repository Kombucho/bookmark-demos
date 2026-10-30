const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');

function memoryStorage(initial) {
  const bag = {};
  if (initial) bag[game.SCORE_KEY] = initial;
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null; },
    setItem: function (key, value) { bag[key] = String(value); },
    bag: bag,
  };
}

test('the map is a closed rectangle and every prize can be reached', () => {
  const state = game.createState();
  assert.equal(state.tiles.length, state.height);
  for (let y = 0; y < state.height; y++) {
    assert.equal(state.tiles[y].length, state.width);
    assert.equal(game.MAP[y].length, state.width);
  }
  const seen = {};
  const queue = [{ x: state.player.x, y: state.player.y }];
  seen[state.player.x + ',' + state.player.y] = true;
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length) {
    const cell = queue.shift();
    for (let i = 0; i < steps.length; i++) {
      const x = cell.x + steps[i][0];
      const y = cell.y + steps[i][1];
      const key = x + ',' + y;
      if (seen[key] || game.isWall(state, x, y)) continue;
      seen[key] = true;
      queue.push({ x: x, y: y });
    }
  }
  state.items.forEach(function (item) {
    assert.equal(seen[item.x + ',' + item.y], true, item.name);
  });
  assert.equal(seen[state.exit.x + ',' + state.exit.y], true);
  assert.equal(state.enemies.length, 3);
});

test('each folio sits in the room that shares its name', () => {
  const state = game.createState();
  ['Harbor Index', 'Kiln', 'Low Lamp', 'Sunday Route'].forEach(function (name) {
    const item = state.items.find(function (entry) { return entry.name === name; });
    assert.ok(item, name);
    assert.equal(game.roomName(state, item.x, item.y), name);
  });
  assert.equal(game.roomName(state), 'Studio');
  assert.equal(game.roomName(state, state.exit.x, state.exit.y), 'Letter office');
});

test('a wall does not spend the turn, and a step does', () => {
  const state = game.createState();
  const rush = state.enemies.find(function (enemy) { return enemy.id === 'rush'; });
  assert.equal(game.act(state, 'w').reason, 'wall');
  assert.equal(state.player.x, 1);
  assert.equal(state.turn, 0);
  assert.equal(rush.y, 7);
  assert.equal(game.act(state, 'e').reason, 'move');
  assert.equal(state.player.x, 2);
  assert.equal(state.turn, 1);
  assert.equal(rush.y, 6);
});

test('bumping an enemy deals damage and can end the run', () => {
  const state = game.createState();
  const rush = state.enemies.find(function (enemy) { return enemy.id === 'rush'; });
  rush.x = state.player.x + 1;
  rush.y = state.player.y;
  rush.hp = 3;
  state.player.hp = 12;
  game.act(state, 'e');
  assert.equal(state.enemies.some(function (enemy) { return enemy.id === 'rush'; }), false);
  assert.equal(state.score, 8);
  assert.equal(state.player.x, 1);

  const again = game.createState();
  const critic = again.enemies.find(function (enemy) { return enemy.id === 'critic'; });
  critic.x = again.player.x + 1;
  critic.y = again.player.y;
  again.player.hp = 1;
  game.act(again, 'east');
  assert.equal(again.status, 'dead');
  assert.equal(again.player.hp, 0);
  assert.equal(game.act(again, 'e').reason, 'still');
});

test('pickups score, tea heals, and the exit pays for the HP you have left', () => {
  const state = game.createState();
  const tea = state.items.find(function (item) { return item.id === 'tea'; });
  state.player.hp = 8;
  state.player.x = tea.x - 1;
  state.player.y = tea.y;
  state.enemies = [];
  game.act(state, 'e');
  assert.equal(state.player.hp, 12);
  assert.equal(state.items.some(function (item) { return item.id === 'tea'; }), false);

  const folio = game.createState();
  const harbor = folio.items.find(function (item) { return item.id === 'harbor'; });
  folio.player.x = harbor.x;
  folio.player.y = harbor.y + 1;
  folio.enemies = [];
  game.act(folio, 'n');
  assert.equal(folio.score, 20);
  assert.deepEqual(folio.inventory, ['Harbor Index']);

  const leaving = game.createState();
  leaving.enemies = [];
  leaving.player.x = leaving.exit.x - 1;
  leaving.player.y = leaving.exit.y;
  leaving.player.hp = 9;
  leaving.score = 20;
  game.act(leaving, 'e');
  assert.equal(leaving.status, 'won');
  assert.equal(leaving.score, 20 + 15 + 9);
});

test('the local board keeps the best eight and ignores a bad store', () => {
  const storage = memoryStorage();
  assert.deepEqual(game.loadScores(storage), []);
  for (let i = 0; i < 10; i++) {
    game.submitScore(storage, { name: 'Runner ' + i, score: i * 3, result: 'dead', at: 1000 + i });
  }
  const board = game.loadScores(storage);
  assert.equal(board.length, 8);
  assert.equal(board[0].score, 27);
  assert.equal(board[0].name, 'Runner 9');
  assert.equal(board[7].score, 6);

  const tied = memoryStorage();
  game.submitScore(tied, { name: 'Later', score: 10, result: 'won', at: 50 });
  game.submitScore(tied, { name: 'Earlier', score: 10, result: 'dead', at: 10 });
  const rows = game.loadScores(tied);
  assert.equal(rows[0].name, 'Earlier');

  assert.equal(game.sanitizeName('  Nera / Voss!! '), 'Nera  Voss');
  assert.equal(game.sanitizeName(''), 'Anon');
  const broken = memoryStorage('{');
  assert.deepEqual(game.loadScores(broken), []);
  const throwing = {
    getItem: function () { return '[]'; },
    setItem: function () { throw new Error('full'); },
  };
  assert.deepEqual(game.submitScore(throwing, { name: 'Nera', score: 4, result: 'won' }), []);
});
