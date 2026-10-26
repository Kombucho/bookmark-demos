const test = require('node:test');
const assert = require('node:assert/strict');
const check = require('./check.js');

test('the off-by-one bounds check passes its unit tests and fails the diagonal', () => {
  const tests = check.runBoundsTests('index <= length');
  assert.equal(tests.length, 5);
  tests.forEach(function (row) { assert.equal(row.pass, true); });
  const proof = check.proveBounds('index <= length');
  assert.equal(proof.ok, true);
  assert.equal(proof.total, 65536);
  assert.equal(proof.failed, 256);
  assert.deepEqual(
    { index: proof.first.index, length: proof.first.length },
    { index: 0, length: 0 }
  );
  assert.equal(proof.first.actual, true);
  assert.equal(proof.first.expected, false);
  assert.equal(proof.plane[5 * 256 + 5], 0);
  assert.equal(proof.plane[5 * 256 + 4], 1);
});

test('a strict less-than covers every byte pair', () => {
  const proof = check.proveBounds('index < length');
  assert.equal(proof.failed, 0);
  assert.equal(proof.first, null);
  const also = check.proveBounds('index < length && index >= 0');
  assert.equal(also.failed, 0);
});

test('the bounds line refuses anything that is not the small expression language', () => {
  const broken = check.proveBounds('index << length');
  assert.equal(broken.ok, false);
  assert.match(broken.error, /comparison|parenthesis|Expected|read|named|numbers|&&/);
  const foreign = check.compileBounds('index < length; globalThis');
  assert.equal(foreign.ok, false);
});

test('wrapped lengths pass the small products and fail once the product leaves a byte', () => {
  const tests = check.runLengthTests(false);
  assert.equal(tests.every(function (row) { return row.pass; }), true);
  const open = check.proveLength(false);
  assert.equal(open.total, 65536);
  assert.ok(open.failed > 0);
  assert.ok(open.first.product > 255);
  assert.equal(open.first.actual.ok, true);
  assert.notEqual(open.first.actual.value, open.first.product);
  const guarded = check.proveLength(true);
  assert.equal(guarded.failed, 0);
  const known = check.judgeLength(2, 128, false);
  assert.equal(known.product, 256);
  assert.equal(known.actual.value, 0);
  assert.equal(known.pass, false);
  assert.equal(check.judgeLength(2, 128, true).pass, true);
});

test('unit tests for the copy sit in capacities the wrap cannot reach', () => {
  const tests = check.runCopyTests(false);
  assert.equal(tests.length, 5);
  tests.forEach(function (row) { assert.equal(row.pass, true); });
  const low = check.copyPlane(10, false);
  assert.equal(low.failed, 0);
  const high = check.copyPlane(250, false);
  assert.ok(high.failed > 0);
  const overflow = check.judgeCopy(200, 100, 250, false);
  assert.equal(overflow.sum, 300);
  assert.equal(overflow.actual, true);
  assert.equal(overflow.expected, false);
  assert.equal(check.judgeCopy(200, 100, 250, true).pass, true);
});

test('the copy check walks every triple, and the guard makes that hold', () => {
  const open = check.proveCopy(false);
  assert.equal(open.total, 16777216);
  assert.ok(open.failed > 0);
  assert.equal(open.featured.sum >= 300, true);
  assert.equal(open.featured.actual, true);
  assert.equal(open.strip[10], 0);
  assert.equal(open.strip[127], 0);
  assert.equal(open.strip[128], 1);
  assert.equal(open.strip[250], 1);
  const guarded = check.proveCopy(true);
  assert.equal(guarded.failed, 0);
  assert.equal(guarded.first, null);
  assert.equal(guarded.strip.some(function (bit) { return bit === 1; }), false);
});
