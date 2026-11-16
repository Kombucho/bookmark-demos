const test = require('node:test');
const assert = require('node:assert/strict');
const blake = require('./blake3.js');

test('the empty input matches the official BLAKE3 digest', () => {
  assert.equal(
    blake.hashHex(new Uint8Array(0)),
    'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'
  );
  const report = blake.selfTest();
  assert.equal(report.ok, true, JSON.stringify(report.failed));
  assert.equal(report.count, 12);
});

test('chunk boundaries and the parent merge match the test vectors', () => {
  assert.equal(blake.chunkCount(blake.build(blake.pattern(0))), 1);
  assert.equal(blake.chunkCount(blake.build(blake.pattern(1))), 1);
  assert.equal(blake.chunkCount(blake.build(blake.pattern(1024))), 1);
  assert.equal(blake.chunkCount(blake.build(blake.pattern(1025))), 2);
  assert.equal(blake.chunkCount(blake.build(blake.pattern(4096))), 4);

  const one = blake.build(blake.pattern(1024));
  assert.equal(one.root.kind, 'chunk');
  assert.equal(one.root.isRoot, true);
  assert.deepEqual(blake.flagNames(blake.shownFlags(one.root)), ['CHUNK_END', 'ROOT']);
  assert.deepEqual(blake.flagNames(blake.displayFlags(one.root)), ['CHUNK_START', 'CHUNK_END', 'ROOT']);
  assert.equal(one.root.blocks.length, 16);
  assert.equal(one.root.blocks[0].flags, blake.CHUNK_START);
  assert.equal(one.root.blocks[15].flags, blake.CHUNK_END);
  assert.notEqual(one.root.hash, one.root.cvHex);

  const twoBlocks = blake.build(blake.pattern(65));
  assert.equal(twoBlocks.root.blocks.length, 2);
  assert.equal(twoBlocks.root.blocks[0].flags, blake.CHUNK_START);
  assert.equal(twoBlocks.root.blocks[1].flags, blake.CHUNK_END);

  const two = blake.build(blake.pattern(2048));
  assert.equal(two.root.kind, 'parent');
  assert.deepEqual(blake.flagNames(blake.shownFlags(two.root)), ['PARENT', 'ROOT']);
  assert.equal(two.root.left.key, '0-0');
  assert.equal(two.root.right.key, '1-1');
  assert.equal(two.root.counter, 0);
  assert.equal(two.root.blockLen, 64);
  assert.notEqual(two.root.hash, two.root.cvHex);
  assert.equal(two.root.left.isRoot, false);
  assert.equal(blake.shownFlags(two.root.left) & blake.ROOT, 0);
});

test('a one-bit flip changes only the path to the root', () => {
  const bytes = blake.pattern(4096);
  const before = blake.build(bytes);
  const flipped = blake.flipBit(bytes, 0);
  const after = blake.build(flipped.bytes);
  const changed = blake.changedKeys(before, after).sort();
  const path = blake.pathKeys(before, 0).sort();
  assert.deepEqual(changed, path);
  assert.deepEqual(changed, ['0-0', '0-1', '0-3']);
  assert.equal(changed.includes('2-3'), false);
  assert.equal(changed.includes('1-1'), false);
  const bits = blake.hammingHex(before.root.hash, after.root.hash);
  assert.ok(bits > 64 && bits < 192, 'hamming ' + bits);

  const inChunk2 = blake.flipBit(bytes, 2048);
  const changed2 = blake.changedKeys(before, blake.build(inChunk2.bytes)).sort();
  assert.deepEqual(changed2, ['0-3', '2-2', '2-3']);
});

test('parallel waves hash every chunk together, and the stack walk does not', () => {
  const tree = blake.build(blake.pattern(4096));
  const waves = blake.parallelWaves(tree);
  assert.equal(waves.length, 3);
  assert.deepEqual(waves[0].map((node) => node.key).sort(), ['0-0', '1-1', '2-2', '3-3']);
  assert.deepEqual(waves[1].map((node) => node.key).sort(), ['0-1', '2-3']);
  assert.deepEqual(waves[2].map((node) => node.key), ['0-3']);

  assert.deepEqual(tree.steps.map((node) => node.key), [
    '0-0', '1-1', '0-1', '2-2', '3-3', '2-3', '0-3',
  ]);

  const odd = blake.build(blake.pattern(3072));
  assert.deepEqual(odd.steps.map((node) => node.key), ['0-0', '1-1', '0-1', '2-2', '0-2']);
  const oddWaves = blake.parallelWaves(odd);
  assert.deepEqual(oddWaves[0].map((node) => node.key).sort(), ['0-0', '1-1', '2-2']);
  assert.deepEqual(oddWaves[1].map((node) => node.key), ['0-1']);
  assert.deepEqual(oddWaves[2].map((node) => node.key), ['0-2']);
});

test('text and a partial last block still produce a stable digest', () => {
  const text = blake.hashHex('abc');
  assert.equal(text, blake.hashHex(new TextEncoder().encode('abc')));
  assert.equal(text.length, 64);
  const again = blake.build('abc');
  assert.equal(again.root.hash, text);
  assert.equal(again.root.blockLen, 3);
  assert.deepEqual(blake.flagNames(again.root.blocks[0].flags), ['CHUNK_START', 'CHUNK_END']);
});
