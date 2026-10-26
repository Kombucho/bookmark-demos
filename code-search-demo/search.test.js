const test = require('node:test');
const assert = require('node:assert/strict');
const search = require('./search.js');

function top(query, mode, codeAware) {
  return search.search(query, { mode: mode, codeAware: codeAware });
}

test('identifiers split only when code-aware indexing asks', () => {
  assert.deepEqual(search.splitIdent('rotateSegment'), ['rotate', 'segment']);
  assert.deepEqual(search.splitIdent('queueCapacity'), ['queue', 'capacity']);
  assert.deepEqual(search.tokenize('function rotateSegment(dir, segment)', false), ['function', 'rotatesegment', 'dir', 'segment']);
  assert.ok(search.tokenize('function rotateSegment(dir, segment)', true).includes('rotate'));
});

test('symbol chunks keep rotateSegment together and flat windows do not match its name as rotate', () => {
  const symbols = search.buildIndex(true).filter(function (chunk) { return chunk.symbol === 'rotateSegment'; });
  assert.equal(symbols.length, 1);
  assert.equal(symbols[0].path, 'src/wal.js');
  assert.equal(symbols[0].start, 6);
  assert.equal(symbols[0].end, 11);
  assert.ok(symbols[0].tokens.includes('rotate'));
  assert.ok(symbols[0].tokens.includes('wal'));

  const flat = top('rotate the wal segment', 'bm25', false);
  const walHits = flat.shown.filter(function (hit) { return hit.path === 'src/wal.js'; });
  assert.ok(walHits.length > 0);
  walHits.forEach(function (hit) {
    assert.equal(hit.symbol, null);
    assert.equal(hit.matched.includes('rotate'), false);
  });
  assert.equal(flat.shown[0].path, 'logs/wick.log');
  assert.ok(flat.shown[0].copies > 1);
});

test('code-aware BM25 puts rotateSegment on the page because the name splits', () => {
  const result = top('rotate the wal segment', 'bm25', true);
  const hit = result.shown.find(function (item) { return item.symbol === 'rotateSegment'; });
  assert.ok(hit);
  assert.deepEqual(hit.matched.slice().sort(), ['rotate', 'segment', 'wal']);
  assert.equal(result.shown[0].path, 'logs/wick.log');
  assert.equal(result.shown[0].copies, 12);
});

test('the toy vector ranks the function above the repeated warning', () => {
  const result = top('rotate the wal segment', 'vector', true);
  assert.equal(result.shown[0].symbol, 'rotateSegment');
  assert.equal(result.shown[0].cosine, 1);
  assert.ok(result.shown[0].dot > result.shown[1].dot);
  assert.equal(result.shown.some(function (hit) { return hit.path === 'logs/wick.log'; }), false);
});

test('hybrid follows the log on flat windows and the function on symbol chunks', () => {
  const flat = top('rotate the wal segment', 'hybrid', false);
  const aware = top('rotate the wal segment', 'hybrid', true);
  assert.equal(flat.shown[0].path, 'logs/wick.log');
  assert.equal(aware.shown[0].symbol, 'rotateSegment');
});

test('roll is absent from the tree, so BM25 misses the function and the lexicon does not', () => {
  const lexical = top('roll the write-ahead log', 'bm25', true);
  const vector = top('roll the write-ahead log', 'vector', true);
  assert.equal(lexical.firstMention, null);
  assert.equal(lexical.hits.some(function (hit) { return hit.symbol === 'rotateSegment'; }), false);
  assert.equal(lexical.shown[0].path, 'src/auth.js');
  assert.equal(lexical.shown[0].kind, 'preamble');
  assert.equal(vector.shown[0].symbol, 'rotateSegment');
  assert.equal(vector.shown[0].bm25, 0);
  assert.deepEqual(vector.shown[0].matched, []);
});

test('flat text glues the write-ahead comment to acceptToken, symbol chunks do not', () => {
  const flat = top('write-ahead log', 'bm25', false);
  const auth = flat.shown.find(function (hit) { return hit.path === 'src/auth.js'; });
  assert.ok(auth);
  assert.match(auth.text, /function acceptToken/);
  const aware = top('write-ahead log', 'bm25', true);
  assert.equal(aware.shown.some(function (hit) { return hit.symbol === 'acceptToken'; }), false);
  assert.equal(aware.shown[0].kind, 'preamble');
});

test('scheduleRetry matches retry only after the identifier is split', () => {
  const flat = top('retry after a timeout', 'bm25', false);
  assert.equal(flat.shown[0].path, 'src/retry.js');
  assert.deepEqual(flat.shown[0].matched, ['timeout']);
  const aware = top('retry after a timeout', 'bm25', true);
  assert.equal(aware.shown[0].symbol, 'scheduleRetry');
  assert.ok(aware.shown[0].matched.includes('retry'));
  assert.ok(aware.shown[0].matched.includes('timeout'));
  assert.equal(aware.shown.some(function (hit) { return hit.path === 'config/limits.json'; }), true);
  const flatLimits = top('queue capacity', 'bm25', false);
  assert.equal(flatLimits.hits.some(function (hit) { return hit.path === 'config/limits.json'; }), false);
  const awareQueue = top('queue capacity', 'bm25', true);
  assert.equal(awareQueue.shown[0].symbol, 'enqueue');
  assert.equal(awareQueue.shown.some(function (hit) { return hit.path === 'config/limits.json'; }), true);
});

test('the walker reads whole files and the passage count is only the cards', () => {
  const result = top('rotate the wal segment', 'hybrid', true);
  const none = search.walk('rotate the wal segment', 0);
  const all = search.walk('rotate the wal segment', search.FILES.length);
  const stopped = search.walk('roll the write-ahead log', search.FILES.length);
  assert.equal(none.openedRead.chars, 0);
  assert.equal(all.openedRead.chars, result.treeRead.chars);
  assert.equal(all.openedRead.tokens, result.treeRead.tokens);
  assert.equal(all.firstMention.path, 'docs/operations.md');
  assert.equal(search.walk('rotate the wal segment', 2).reachedMention, true);
  assert.equal(search.walk('rotate the wal segment', 1).reachedMention, false);
  assert.equal(stopped.firstMention, null);
  assert.ok(result.passageRead.chars < result.treeRead.chars);
  assert.ok(result.passageRead.chars > 0);
  assert.equal(result.treeRead.chars, 3338);
});

test('an empty query does not invent hits', () => {
  const result = top('the and of', 'hybrid', true);
  assert.deepEqual(result.queryTokens, []);
  assert.equal(result.hits.length, 0);
});
