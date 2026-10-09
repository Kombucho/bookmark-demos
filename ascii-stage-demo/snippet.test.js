const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSnippet, buildSnippet } = require('./snippet.js');

test('a donut tag cues the donut', function () {
  const parsed = parseSnippet('<ascii-art piece="donut"></ascii-art>');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.piece, 'donut');
  assert.equal(parsed.fps, null);
  assert.equal(parsed.options, null);
  assert.equal(parsed.mono, false);
});

test('piece names are matched in lowercase, including a self-closing tag', function () {
  const parsed = parseSnippet("<ascii-art piece='Donut' />");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.piece, 'donut');
});

test('round trip keeps piece, fps, options, label, and mono', function () {
  const source = buildSnippet({
    piece: 'big-text',
    fps: 12,
    options: { text: 'hello' },
    mono: true,
    label: 'Hello',
  });
  assert.match(source, /ascii\.rest\/ascii\.js/);
  assert.match(source, /<ascii-art\b/);
  const parsed = parseSnippet(source);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.piece, 'big-text');
  assert.equal(parsed.fps, 12);
  assert.deepEqual(parsed.options, { text: 'hello' });
  assert.equal(parsed.mono, true);
  assert.equal(parsed.label, 'Hello');
});

test('an apostrophe in options survives the attribute quotes', function () {
  const source = buildSnippet({ piece: 'big-text', options: { text: "it's" } });
  const parsed = parseSnippet(source);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.options, { text: "it's" });
});

test('refuses a missing tag, an unknown piece, a bad fps, and bad options', function () {
  assert.equal(parseSnippet('just words').ok, false);
  assert.equal(parseSnippet('<ascii-art></ascii-art>').ok, false);
  assert.equal(parseSnippet('<ascii-art piece="not-a-piece"></ascii-art>').ok, false);
  assert.equal(parseSnippet('<ascii-art piece="donut" fps="0"></ascii-art>').ok, false);
  assert.equal(parseSnippet('<ascii-art piece="donut" fps="99"></ascii-art>').ok, false);
  assert.equal(parseSnippet('<ascii-art piece="donut" options="["></ascii-art>').ok, false);
  assert.equal(parseSnippet('<ascii-art piece="donut" options="[]"></ascii-art>').ok, false);
  assert.equal(parseSnippet('<ascii-art piece="gauge" options=\'{"label":"load"}\'></ascii-art>').ok, true);
});
