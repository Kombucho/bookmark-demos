const assert = require('node:assert/strict');
const test = require('node:test');
const boardApi = require('./board.js');

function source(board, id) {
  return board.items.filter(function (item) { return item.id === id; })[0];
}

function variations(board, componentId, axis) {
  return board.items.filter(function (item) {
    return item.role === 'variation' && item.sourceId === componentId && (!axis || item.axis === axis);
  });
}

test('a new board has four sources, shared tokens, and no overlaps', function () {
  const board = boardApi.createBoard();
  assert.deepEqual(board.items.map(function (item) { return item.id; }), ['button', 'card', 'field', 'badge']);
  assert.deepEqual(board.tokens, { density: 'regular', radius: 'soft', emphasis: 'ink' });
  assert.equal(board.camera.scale, 1);
  assert.equal(boardApi.overlaps(board.items), null);
  assert.equal(source(board, 'button').y, boardApi.ORIGIN_Y);
  assert.equal(source(board, 'card').y, source(board, 'button').y + source(board, 'button').h + boardApi.SOURCE_GAP);
  const style = boardApi.tokenStyle(boardApi.resolveTokens(board, source(board, 'button')));
  assert.equal(style.radius, 12);
  assert.equal(style.pad, 12);
  assert.equal(style.fill, '#241f1a');
  assert.equal(boardApi.tokenLine(board.tokens), 'Regular · Soft · Ink');
});

test('spawning an axis places three trials beside the source and holds the other tokens', function () {
  const board = boardApi.createBoard();
  const button = source(board, 'button');
  const cardY = source(board, 'card').y;
  const spawned = boardApi.spawn(board, 'button', 'radius');
  assert.equal(spawned.ok, true);
  const trials = variations(spawned.board, 'button', 'radius');
  assert.deepEqual(trials.map(function (item) { return item.value; }), ['sharp', 'soft', 'round']);
  assert.ok(trials.every(function (item) { return item.y === button.y && item.row === 0; }));
  assert.equal(trials[0].x, button.x + button.w + boardApi.COL_GAP);
  assert.ok(trials[1].x > trials[0].x);
  assert.ok(trials[2].x > trials[1].x);
  assert.equal(source(spawned.board, 'card').y, cardY);
  assert.equal(boardApi.overlaps(spawned.board.items), null);
  const held = boardApi.tokenStyle(boardApi.resolveTokens(board, button));
  const radii = [];
  trials.forEach(function (item) {
    const style = boardApi.tokenStyle(boardApi.resolveTokens(spawned.board, item));
    assert.equal(style.pad, held.pad);
    assert.equal(style.gap, held.gap);
    assert.equal(style.type, held.type);
    assert.equal(style.fill, held.fill);
    assert.equal(style.emphasis, held.emphasis);
    radii.push(style.radius);
  });
  assert.deepEqual(radii, [2, 12, 28]);
  assert.equal(spawned.board.tokens.radius, 'soft');
  assert.notEqual(spawned.board.items, board.items);
  assert.equal(button.y, boardApi.ORIGIN_Y);
});

test('a second axis stacks under the first, and spawning again keeps that row', function () {
  let board = boardApi.createBoard();
  board = boardApi.spawn(board, 'button', 'radius').board;
  const cardY = source(board, 'card').y;
  const radiusY = variations(board, 'button', 'radius')[0].y;
  board = boardApi.spawn(board, 'button', 'density').board;
  const density = variations(board, 'button', 'density');
  const radius = variations(board, 'button', 'radius');
  assert.equal(density.length, 3);
  assert.equal(radius.length, 3);
  assert.ok(density[0].y > radiusY);
  assert.equal(density[0].row, 1);
  assert.equal(radius[0].row, 0);
  assert.ok(source(board, 'card').y > cardY);
  assert.equal(boardApi.overlaps(board.items), null);
  const again = boardApi.spawn(board, 'button', 'radius').board;
  assert.equal(variations(again, 'button', 'radius')[0].row, 0);
  assert.equal(variations(again, 'button', 'density')[0].row, 1);
  assert.equal(variations(again, 'button').length, 6);
  assert.equal(boardApi.overlaps(again.items), null);
  const missing = boardApi.spawn(board, 'missing', 'radius');
  assert.equal(missing.ok, false);
  const badAxis = boardApi.spawn(board, 'button', 'shadow');
  assert.equal(badAxis.ok, false);
});

test('promote writes one token and leaves the other axes and the previous board alone', function () {
  let board = boardApi.createBoard();
  board = boardApi.spawn(board, 'card', 'emphasis').board;
  board = boardApi.spawn(board, 'card', 'radius').board;
  const before = board.tokens;
  const quiet = variations(board, 'card', 'emphasis').filter(function (item) { return item.value === 'quiet'; })[0];
  const promoted = boardApi.promote(board, quiet.id);
  assert.equal(promoted.ok, true);
  assert.equal(before.emphasis, 'ink');
  assert.deepEqual(promoted.board.tokens, { density: 'regular', radius: 'soft', emphasis: 'quiet' });
  assert.equal(source(board, 'button').x, source(promoted.board, 'button').x);
  const sourceStyle = boardApi.tokenStyle(boardApi.resolveTokens(promoted.board, source(promoted.board, 'badge')));
  assert.equal(sourceStyle.emphasis, 'quiet');
  assert.equal(sourceStyle.fill, '#f4efe6');
  assert.equal(sourceStyle.radius, 12);
  const round = variations(promoted.board, 'card', 'radius').filter(function (item) { return item.value === 'round'; })[0];
  const roundStyle = boardApi.tokenStyle(boardApi.resolveTokens(promoted.board, round));
  assert.equal(roundStyle.radius, 28);
  assert.equal(roundStyle.emphasis, 'quiet');
  const refused = boardApi.promote(promoted.board, 'button');
  assert.equal(refused.ok, false);
  assert.equal(promoted.board.tokens.emphasis, 'quiet');
});

test('clearing trials packs the sources back together', function () {
  let board = boardApi.createBoard();
  const cardY = source(board, 'card').y;
  board = boardApi.spawn(board, 'button', 'density').board;
  board = boardApi.spawn(board, 'button', 'radius').board;
  assert.ok(source(board, 'card').y > cardY);
  const cleared = boardApi.clearVariations(board, 'button');
  assert.equal(cleared.board.items.length, 4);
  assert.equal(source(cleared.board, 'card').y, cardY);
  board = boardApi.spawn(cleared.board, 'badge', 'emphasis').board;
  const all = boardApi.clearVariations(board);
  assert.equal(all.board.items.length, 4);
  assert.equal(boardApi.overlaps(all.board.items), null);
});

test('zoom keeps the point under the cursor, and pan and frame stay inside the scale clamp', function () {
  const camera = { x: 0, y: 0, scale: 1 };
  const next = boardApi.zoomAt(camera, 2, 100, 50);
  assert.equal(next.scale, 2);
  assert.equal((100 - next.x) / next.scale, 100);
  assert.equal((50 - next.y) / next.scale, 50);
  const clamped = boardApi.zoomAt(next, 9, 100, 50);
  assert.equal(clamped.scale, boardApi.MAX_SCALE);
  const tiny = boardApi.zoomAt(camera, 0.01, 0, 0);
  assert.equal(tiny.scale, boardApi.MIN_SCALE);
  const moved = boardApi.pan(camera, -20, 15);
  assert.deepEqual(moved, { x: -20, y: 15, scale: 1 });
  const stepped = boardApi.zoomStep({ x: 10, y: 10, scale: 1 }, 1, 80, 40);
  assert.ok(stepped.scale > 1);
  assert.equal(Math.round(((80 - stepped.x) / stepped.scale) * 1000) / 1000, 70);

  const board = boardApi.createBoard();
  const fitted = boardApi.frame(board.items, 800, 600, 40);
  assert.ok(fitted.scale >= boardApi.MIN_SCALE && fitted.scale <= boardApi.MAX_SCALE);
  board.items.forEach(function (item) {
    const left = fitted.x + item.x * fitted.scale;
    const top = fitted.y + item.y * fitted.scale;
    const right = fitted.x + (item.x + item.w) * fitted.scale;
    const bottom = fitted.y + (item.y + item.h) * fitted.scale;
    assert.ok(left >= 39 && top >= 39);
    assert.ok(right <= 761 && bottom <= 561);
  });
});

test('reveal pans the minimum and keeps scale, pinning the left when the row is wider than the view', function () {
  const camera = { x: 0, y: 0, scale: 1 };
  const nudged = boardApi.reveal(camera, { x: 300, y: 40, w: 80, h: 40 }, 200, 200, 16);
  assert.equal(nudged.scale, 1);
  assert.ok(nudged.x < 0);
  assert.equal(nudged.x + 300 + 80, 200 - 16);
  assert.equal(nudged.y, 0);
  const wide = boardApi.reveal(camera, { x: 500, y: 10, w: 800, h: 40 }, 200, 200, 16);
  assert.equal(wide.scale, 1);
  assert.equal(wide.x + 500, 16);
  const inside = boardApi.reveal(camera, { x: 20, y: 20, w: 40, h: 40 }, 200, 200, 16);
  assert.deepEqual(inside, camera);
});
