const test = require('node:test');
const assert = require('node:assert/strict');
const post = require('./post.js');

function unitMeasure(text) {
  return text.length * 10;
}

test('FNV-1a hashes the bytes and ignores nothing in the buffer', () => {
  assert.equal(post.fnv1a([]), '811c9dc5');
  assert.equal(post.fnv1a([97]), 'e40c292c');
  assert.equal(post.fnv1a([0, 255, 16]), post.fnv1a(Uint8Array.of(0, 255, 16)));
  assert.notEqual(post.fnv1a([1, 2, 3]), post.fnv1a([1, 2, 4]));
});

test('counts abbreviate the way a timeline does', () => {
  assert.equal(post.compactCount(18), '18');
  assert.equal(post.compactCount(1204), '1,204');
  assert.equal(post.compactCount(9999), '9,999');
  assert.equal(post.compactCount(10000), '10K');
  assert.equal(post.compactCount(18420), '18.4K');
  assert.equal(post.compactCount(1500000), '1.5M');
  assert.equal(post.compactCount(-4), '0');
});

test('entities keep a mention, a hashtag, and a URL, and drop trailing punctuation', () => {
  const text = 'See @rauchg and #xeet at https://github.com/rauchg/xeet.';
  const entities = post.findEntities(text);
  assert.deepEqual(entities.map((entity) => entity.kind), ['mention', 'hashtag', 'url']);
  assert.equal(entities[0].text, '@rauchg');
  assert.equal(entities[1].text, '#xeet');
  assert.equal(entities[2].text, 'https://github.com/rauchg/xeet');
  assert.equal(text[entities[2].end], '.');
});

test('lines break on spaces, hard-break a long word, and keep a ZWJ emoji whole', () => {
  const hello = post.wrapText('hello world', unitMeasure, 60);
  assert.deepEqual(hello.map((line) => line.text), ['hello', 'world']);

  const hard = post.wrapText('abcdef', unitMeasure, 30);
  assert.deepEqual(hard.map((line) => line.text), ['abc', 'def']);

  const emoji = '👩‍🚀';
  const mixed = post.wrapText(emoji + 'X', (text) => post.graphemeRanges(text).length * 10, 10);
  assert.deepEqual(mixed.map((line) => line.text), [emoji, 'X']);

  const blank = post.wrapText('a\n\nb', unitMeasure, 100);
  assert.deepEqual(blank.map((line) => line.text), ['a', '', 'b']);
  assert.deepEqual(post.wrapText('   \n', unitMeasure, 100), []);
});

test('show more keeps four lines and paints the label in the link color', () => {
  const text = new Array(14).fill('alpha beta gamma').join(' ');
  const open = post.layoutPost({
    name: 'Ada North',
    handle: 'northglass',
    text: text,
    theme: 'light',
    width: 390,
    scale: 2,
    media: 0,
    showMore: false,
    verified: false,
    stamp: '3h',
  }, (value) => value.length * 8);
  assert.equal(open.truncated, false);
  assert.ok(open.lineCount > post.SHOW_MORE_LINES);

  const cut = post.layoutPost({
    name: 'Ada North',
    handle: 'northglass',
    text: text,
    theme: 'dark',
    width: 390,
    scale: 3,
    media: 0,
    showMore: true,
    verified: true,
    stamp: '3h',
  }, (value) => value.length * 8);
  assert.equal(cut.truncated, true);
  assert.equal(cut.lineCount, post.SHOW_MORE_LINES);
  assert.equal(cut.lines[cut.lines.length - 1].showMore, true);
  const more = cut.ops.filter((op) => op.type === 'text' && op.text === 'Show more');
  assert.equal(more.length, 1);
  assert.equal(more[0].fill, post.THEMES.dark.link);
  const last = cut.lines[cut.lines.length - 1].text;
  const used = (last.length + (last ? 1 : 0) + 'Show more'.length) * 8;
  assert.ok(used <= cut.contentW, used + ' > ' + cut.contentW);
  assert.equal(cut.ops[0].fill, '#000000');
  assert.equal(cut.pixelWidth, 390 * 3);
  assert.equal(cut.theme, 'dark');
});

test('the same inputs lay out the same ops, including link runs and media cells', () => {
  const input = {
    name: 'Ada North',
    handle: '@Northglass!',
    text: '@rauchg #xeet https://github.com/rauchg/xeet',
    theme: 'light',
    width: 600,
    scale: 1,
    media: 4,
    showMore: true,
    verified: true,
    stamp: '',
    counts: { replies: 2, reposts: 3, likes: 10000, views: 20 },
  };
  const measure = (value) => value.length * 8;
  const first = post.layoutPost(input, measure);
  const second = post.layoutPost(input, measure);
  assert.deepEqual(first, second);
  assert.equal(first.post.handle, 'Northglass');
  assert.equal(first.post.stamp, '3h');
  assert.equal(first.post.width, 600);
  assert.equal(first.media, 4);

  const mention = first.ops.find((op) => op.type === 'text' && op.text === '@rauchg');
  const tag = first.ops.find((op) => op.type === 'text' && op.text === '#xeet');
  const url = first.ops.find((op) => op.type === 'text' && op.text.indexOf('https://github.com/rauchg/xeet') === 0);
  assert.equal(mention.fill, '#1d9bf0');
  assert.equal(tag.fill, '#1d9bf0');
  assert.equal(url.fill, '#1d9bf0');

  const media = first.ops.find((op) => op.type === 'media');
  assert.equal(media.cells.length, 4);
  assert.deepEqual(media.cells.map((cell) => cell.label), ['Media 1', 'Media 2', 'Media 3', 'Media 4']);
  const narrow = post.layoutPost(Object.assign({}, input, { width: 390, media: 3 }), measure);
  const triple = narrow.ops.find((op) => op.type === 'media');
  assert.deepEqual(triple.cells.map((cell) => cell.label), ['Media 1', '2', '3']);

  const views = first.ops.find((op) => op.type === 'icon' && op.name === 'views');
  const likes = first.ops.find((op) => op.type === 'text' && op.text === '10K');
  assert.ok(views);
  assert.ok(likes);
  assert.equal(first.ops.some((op) => op.type === 'badge'), true);
  assert.equal(JSON.stringify(first).includes('Date'), false);
});

test('a narrow name ellipsizes, and odd controls fall back', () => {
  const layout = post.layoutPost({
    name: 'A Very Long Display Name That Will Not Fit Beside The Handle',
    handle: 'northglass',
    text: 'Short',
    theme: 'nope',
    width: 320,
    scale: 9,
    media: 8,
    showMore: false,
    verified: false,
    stamp: '3h',
  }, (value, spec) => value.length * (spec && spec.weight === 700 ? 12 : 8));
  assert.equal(layout.theme, 'light');
  assert.equal(layout.width, 390);
  assert.equal(layout.scale, 2);
  assert.equal(layout.media, 4);
  const name = layout.ops.find((op) => op.weight === 700 && op.align !== 'center' && op.text !== 'Short');
  assert.ok(name.text.endsWith('…'));
  assert.ok(name.text.length < layout.post.name.length);
});

test('the sample post is long enough to show the cut at both widths', () => {
  const measure = (text) => text.length * 7;
  for (const width of [390, 600]) {
    const layout = post.layoutPost(Object.assign({}, post.SAMPLE, { width: width }), measure);
    assert.equal(layout.truncated, true, 'width ' + width + ' lines ' + layout.lineCount);
    const visible = layout.ops.filter((op) => op.type === 'text').map((op) => op.text).join('\n');
    assert.match(visible, /✨/);
    assert.match(visible, /@rauchg/);
    assert.match(visible, /#xeet/);
    assert.match(visible, /https:\/\/github.com\/rauchg\/xeet/);
    assert.match(visible, /Show more/);
  }
});
