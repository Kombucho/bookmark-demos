const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('./authority.js');

function item(board, id) {
  return board.programs.find(function (row) { return row.id === id; });
}

function sign(board, id, signerId) {
  const next = auth.setApproval(board, id, signerId, true);
  assert.equal(next.ok, true);
  return next.board;
}

test('a single key upgrades only after it signs, and the old binary had no drain', () => {
  const board = auth.createBoard();
  const lumen = item(board, 'lumen');
  assert.equal(lumen.mode, 'single');
  assert.deepEqual(lumen.binary, ['deposit', 'borrow', 'repay', 'liquidate']);
  const quiet = auth.propose(board, 'lumen');
  assert.equal(quiet.ok, false);
  assert.equal(quiet.code, 'Threshold');
  assert.equal(quiet.have, 0);
  assert.equal(quiet.need, 1);
  assert.equal(item(quiet.board, 'lumen').tvl, 42000000);
  assert.equal(item(board, 'lumen').binary.indexOf(auth.DRAIN), -1);

  const signed = sign(board, 'lumen', 'hot');
  const upgraded = auth.propose(signed, 'lumen');
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.code, 'Upgraded');
  const after = item(upgraded.board, 'lumen');
  assert.equal(after.drained, true);
  assert.equal(after.tvl, 0);
  assert.equal(after.taken, 42000000);
  assert.equal(after.binary[after.binary.length - 1], auth.DRAIN);
  assert.deepEqual(after.binary.slice(0, 4), lumen.binary);
  assert.equal(auth.propose(upgraded.board, 'lumen').code, 'AlreadyDrained');
});

test('a multisig needs its threshold, and raising the threshold can block the same keys', () => {
  let board = auth.createBoard();
  board = sign(board, 'marrow', 'ada');
  const one = auth.propose(board, 'marrow');
  assert.equal(one.code, 'Threshold');
  assert.equal(one.have, 1);
  assert.equal(one.need, 2);
  assert.equal(item(one.board, 'marrow').binary.length, 3);

  board = sign(board, 'marrow', 'bo');
  const two = auth.propose(board, 'marrow');
  assert.equal(two.code, 'Upgraded');
  assert.equal(item(two.board, 'marrow').taken, 18400000);

  let strict = auth.createBoard();
  strict = auth.setThreshold(strict, 'marrow', 3).board;
  strict = sign(strict, 'marrow', 'ada');
  strict = sign(strict, 'marrow', 'bo');
  assert.equal(auth.propose(strict, 'marrow').code, 'Threshold');
  strict = sign(strict, 'marrow', 'chen');
  assert.equal(auth.propose(strict, 'marrow').code, 'Upgraded');
});

test('Salt Council weight: 45 fails, 60 passes, and the three smaller blocs stay short', () => {
  let board = auth.createBoard();
  assert.equal(item(board, 'salt').mode, 'dao');
  board = sign(board, 'salt', 'treasury');
  const alone = auth.propose(board, 'salt');
  assert.equal(alone.code, 'Threshold');
  assert.equal(alone.have, 45);
  assert.equal(alone.need, 60);
  assert.equal(item(alone.board, 'salt').drained, false);

  let small = auth.createBoard();
  small = sign(small, 'salt', 'guild');
  small = sign(small, 'salt', 'desk');
  small = sign(small, 'salt', 'public');
  const short = auth.propose(small, 'salt');
  assert.equal(short.have, 55);
  assert.equal(short.code, 'Threshold');

  board = sign(board, 'salt', 'public');
  const passed = auth.propose(board, 'salt');
  assert.equal(passed.have, 60);
  assert.equal(passed.code, 'Upgraded');
  assert.equal(item(passed.board, 'salt').tvl, 0);
});

test('a locked program rejects the upgrade, and a signature on another mode does not count', () => {
  const board = auth.createBoard();
  assert.equal(item(board, 'keel').mode, 'locked');
  const refused = auth.setApproval(board, 'keel', 'hot', true);
  assert.equal(refused.code, 'BadSigner');
  const attempt = auth.propose(board, 'keel');
  assert.equal(attempt.code, 'Immutable');
  assert.equal(item(attempt.board, 'keel').binary.length, 2);
  assert.equal(item(attempt.board, 'keel').tvl, 600000);
  assert.equal(auth.verdict(item(board, 'keel')).code, 'Immutable');
});

test('a timelock queues the drain, and the binary changes only when the delay elapses', () => {
  let board = auth.createBoard();
  board = auth.setTimelock(board, 'lumen', true).board;
  board = sign(board, 'lumen', 'hot');
  const queued = auth.propose(board, 'lumen');
  assert.equal(queued.code, 'Queued');
  assert.equal(queued.landsAt, auth.DELAY_DAYS);
  const waiting = item(queued.board, 'lumen');
  assert.equal(waiting.drained, false);
  assert.equal(waiting.tvl, 42000000);
  assert.equal(waiting.binary.indexOf(auth.DRAIN), -1);
  assert.deepEqual(waiting.queue.binary.slice(-1), [auth.DRAIN]);

  const early = auth.advance(queued.board, 1);
  assert.equal(early.code, 'TooEarly');
  assert.equal(early.board.now, 1);
  assert.equal(item(early.board, 'lumen').queue.landsAt, 2);

  const landed = auth.advance(early.board, 1);
  assert.equal(landed.code, 'Landed');
  assert.deepEqual(landed.landed, ['lumen']);
  assert.equal(item(landed.board, 'lumen').drained, true);
  assert.equal(item(landed.board, 'lumen').queue, null);
  assert.equal(auth.advance(landed.board, 2).code, 'NoQueue');
});

test('cancel keeps the binary, and turning a key off does not unqueue it', () => {
  let board = auth.createBoard();
  board = auth.setTimelock(board, 'marrow', true).board;
  board = sign(board, 'marrow', 'ada');
  board = sign(board, 'marrow', 'chen');
  board = auth.propose(board, 'marrow').board;
  const dropped = auth.setApproval(board, 'marrow', 'ada', false);
  assert.equal(item(dropped.board, 'marrow').queue.landsAt, 2);
  const still = auth.advance(dropped.board, 2);
  assert.equal(still.code, 'Landed');

  let held = auth.createBoard();
  held = auth.setTimelock(held, 'lumen', true).board;
  held = sign(held, 'lumen', 'hot');
  held = auth.propose(held, 'lumen').board;
  const cancelled = auth.cancel(held, 'lumen');
  assert.equal(cancelled.code, 'Cancelled');
  assert.equal(item(cancelled.board, 'lumen').queue, null);
  const later = auth.advance(cancelled.board, 2);
  assert.equal(later.code, 'NoQueue');
  assert.equal(item(later.board, 'lumen').drained, false);
  assert.equal(auth.cancel(later.board, 'lumen').code, 'NoQueue');
});

test('changing the authority mode clears signatures and drops a queued upgrade', () => {
  let board = auth.createBoard();
  board = auth.setTimelock(board, 'lumen', true).board;
  board = sign(board, 'lumen', 'hot');
  board = auth.propose(board, 'lumen').board;
  const locked = auth.setMode(board, 'lumen', 'locked');
  assert.equal(locked.ok, true);
  const lumen = item(locked.board, 'lumen');
  assert.equal(lumen.mode, 'locked');
  assert.equal(lumen.queue, null);
  assert.equal(lumen.single.on, false);
  assert.equal(auth.propose(locked.board, 'lumen').code, 'Immutable');

  const back = auth.setMode(locked.board, 'lumen', 'single');
  assert.equal(item(back.board, 'lumen').single.on, false);
  assert.equal(auth.propose(back.board, 'lumen').code, 'Threshold');
});

test('restore puts the deposits and the original instructions back', () => {
  let board = auth.createBoard();
  board = sign(board, 'lumen', 'hot');
  board = auth.propose(board, 'lumen').board;
  const restored = auth.restore(board, 'lumen');
  const lumen = item(restored.board, 'lumen');
  assert.equal(restored.code, 'Restored');
  assert.equal(lumen.drained, false);
  assert.equal(lumen.tvl, 42000000);
  assert.equal(lumen.taken, 0);
  assert.equal(lumen.binary.indexOf(auth.DRAIN), -1);
  assert.equal(lumen.single.on, false);
});
