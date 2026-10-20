const assert = require('node:assert/strict');
const test = require('node:test');
const chat = require('./chat.js');

function sent(text) {
  return chat.send(chat.createSession(), text);
}

function resultOf(outcome) {
  return outcome.session.results[outcome.session.results.length - 1];
}

test('four plugins expose a function definition, a message, and canvas data', function () {
  assert.deepEqual(chat.PLUGINS.map(function (plugin) { return plugin.toolDefinition.name; }), [
    'map', 'picture', 'othello', 'ledger',
  ]);
  chat.PLUGINS.forEach(function (plugin) {
    assert.equal(plugin.toolDefinition.type, 'function');
    assert.ok(plugin.generatingMessage);
    const executed = plugin.execute(plugin.toolDefinition.name === 'map' ? {place: 'Saltmarket'} : plugin.toolDefinition.name === 'picture' ? {scene: 'harbor-dusk'} : plugin.toolDefinition.name === 'ledger' ? {book: 'morning'} : {size: 8});
    assert.ok(executed.message);
    assert.ok(executed.jsonData);
    assert.ok(executed.data);
    assert.ok(executed.viewState);
    assert.ok(executed.instructions);
  });
});

test('listed prompts run their plugins, and a paraphrase picks the nearest one', function () {
  const map = sent('Show a map of Saltmarket');
  assert.equal(map.match, 'map');
  assert.equal(resultOf(map).weak, false);
  assert.equal(resultOf(map).toolName, 'map');
  assert.equal(resultOf(map).viewState.x, 3);
  assert.equal(resultOf(map).jsonData.visitor, 'Pier');

  const fish = sent('where are the fish stalls');
  assert.equal(fish.match, 'map');
  const game = sent('lets play a board game');
  assert.equal(game.match, 'game');
  assert.equal(resultOf(game).toolName, 'othello');
  assert.equal(resultOf(game).weak, false);
  const vague = sent('game');
  assert.equal(vague.match, 'game');
  assert.equal(resultOf(vague).weak, true);
  assert.match(vague.session.messages[1].text, /Closest scripted prompt/);

  const picture = sent('paint the harbor');
  assert.equal(picture.match, 'picture');
  const ledger = sent('sort the prices');
  assert.equal(ledger.match, 'ledger');
  const none = sent('zzzz banana telescope');
  assert.equal(none.match, null);
  assert.equal(none.session.results.length, 0);
  assert.equal(none.session.messages[1].call, null);
  assert.equal(sent('   ').ok, false);
});

test('a map click moves on the path and refuses water, and the transcript keeps the first payload', function () {
  const outcome = sent('Show a map of Saltmarket');
  const id = outcome.session.selectedId;
  const moved = chat.interact(outcome.session, id, {type: 'move', x: 3, y: 1});
  assert.equal(moved.ok, true);
  assert.equal(moved.session.results[0].viewState.y, 1);
  assert.equal(moved.session.results[0].jsonData.visitor, 'North net');
  assert.equal(moved.session.messages[1].call.result.jsonData.visitor, 'Pier');
  const water = chat.interact(moved.session, id, {type: 'move', x: 0, y: 0});
  assert.equal(water.ok, false);
  assert.equal(water.session.results[0].viewState.x, 3);
  assert.equal(water.session.results[0].viewState.y, 1);
});

test('picture layers toggle without touching the original tool result', function () {
  const outcome = sent('Draw the harbor at dusk');
  const id = outcome.session.selectedId;
  const toggled = chat.interact(outcome.session, id, {type: 'toggle', layer: 'rain'});
  assert.equal(toggled.session.results[0].viewState.rain, true);
  assert.equal(toggled.session.results[0].viewState.lamps, true);
  assert.equal(toggled.session.results[0].jsonData.layers.rain, true);
  assert.equal(outcome.session.messages[1].call.result.jsonData.layers.rain, false);
  const missing = chat.interact(toggled.session, id, {type: 'toggle', layer: 'fog'});
  assert.equal(missing.ok, false);
});

test('othello opens with four legal replies, flips a line, and light answers by the fixed rule', function () {
  const board = chat.openingBoard();
  assert.equal(chat.legalMoves(board, 1).length, 4);
  const crafted = board.map(function (row) { return row.map(function () { return 0; }); });
  crafted[0][1] = 2;
  crafted[0][2] = 1;
  crafted[1][1] = 2;
  crafted[1][2] = 1;
  crafted[2][1] = 2;
  crafted[2][2] = 2;
  crafted[2][3] = 1;
  const choice = chat.bestMove(crafted, 1);
  assert.equal(choice.flips, 3);
  assert.deepEqual({x: choice.x, y: choice.y}, {x: 0, y: 2});
  assert.ok(chat.legalMoves(crafted, 1).some(function (move) { return move.flips === 1; }));

  const outcome = sent('Play othello on the canvas');
  const id = outcome.session.selectedId;
  const illegal = chat.interact(outcome.session, id, {type: 'move', x: 0, y: 0});
  assert.equal(illegal.ok, false);
  assert.deepEqual(illegal.session.results[0].viewState.board, chat.openingBoard());

  const played = chat.applyMove(chat.openingBoard(), 2, 3, 1);
  assert.equal(played.board[3][2], 1);
  assert.equal(played.board[3][3], 1);
  const reply = chat.bestMove(played.board, 2);
  const moved = chat.interact(outcome.session, id, {type: 'move', x: 2, y: 3});
  assert.equal(moved.ok, true);
  const next = moved.session.results[0].viewState.board;
  assert.equal(next[3][2], 1);
  assert.equal(next[reply.y][reply.x], 2);
  assert.equal(moved.session.results[0].viewState.turn, 1);
  assert.match(moved.session.results[0].viewState.note, /Light plays/);
  assert.equal(moved.session.messages[1].call.result.jsonData.dark, 2);
  assert.ok(moved.session.results[0].jsonData.dark > 2);
});

test('the ledger sorts by the chosen column and reverses on the second click', function () {
  const outcome = sent('Show the stall ledger');
  const id = outcome.session.selectedId;
  const rows = outcome.session.results[0].data.rows;
  assert.deepEqual(chat.sortedRows(rows, {key: 'hour', dir: 'asc'}).map(function (row) { return row.stall; }), [
    'Pier three', 'North net', 'Wick lamp', 'Red kettle', 'Salt room', 'Glass float',
  ]);
  const desc = chat.interact(outcome.session, id, {type: 'sort', key: 'price'});
  assert.equal(desc.session.results[0].viewState.dir, 'asc');
  assert.equal(chat.sortedRows(rows, desc.session.results[0].viewState)[0].stall, 'Glass float');
  const flipped = chat.interact(desc.session, id, {type: 'sort', key: 'price'});
  assert.equal(flipped.session.results[0].viewState.dir, 'desc');
  assert.equal(chat.sortedRows(rows, flipped.session.results[0].viewState)[0].stall, 'Salt room');
  assert.equal(flipped.session.results[0].jsonData.sort, 'price desc');
  assert.equal(flipped.session.messages[1].call.result.jsonData.sort, 'hour asc');
});

test('canvas history keeps every result and can select an earlier one', function () {
  let session = chat.createSession();
  session = chat.send(session, 'Show a map of Saltmarket').session;
  session = chat.send(session, 'Play othello on the canvas').session;
  assert.deepEqual(session.results.map(function (result) { return result.id; }), ['result-1', 'result-2']);
  assert.equal(session.selectedId, 'result-2');
  session = chat.interact(session, 'result-1', {type: 'move', x: 1, y: 1}).session;
  const selected = chat.select(session, 'result-1');
  assert.equal(selected.session.selectedId, 'result-1');
  assert.equal(selected.session.results[0].viewState.x, 1);
  assert.equal(selected.session.results[1].toolName, 'othello');
  assert.equal(selected.session.results[1].viewState.board[3][3], 2);
  const missed = chat.select(session, 'result-9');
  assert.equal(missed.ok, false);
});
