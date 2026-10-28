const test = require('node:test');
const assert = require('node:assert/strict');
const Stream = require('./stream.js');
const Compress = require('./compress.js');

function takePages(kind, count) {
  const gen = Stream.makeGenerator(kind);
  let open = '';
  const pages = [];
  let guard = 0;
  while (pages.length < count && guard < 1000) {
    const fed = Stream.feed(open, gen.next(700));
    open = fed.open;
    for (const sealed of fed.sealed) pages.push(sealed);
    guard += 1;
  }
  return {pages: pages.slice(0, count), open: open};
}

test('feed splits on the page size and loses no characters', () => {
  const gen = Stream.makeGenerator('build');
  let open = '';
  let all = '';
  const sealed = [];
  for (let i = 0; i < 12; i++) {
    const chunk = gen.next(500);
    all += chunk;
    const fed = Stream.feed(open, chunk);
    open = fed.open;
    for (const page of fed.sealed) sealed.push(page);
  }
  assert.equal(sealed.map(function (page) { return page.text; }).join('') + open, all);
  assert.ok(sealed.length >= 2);
  for (const page of sealed) {
    assert.equal(page.text.length, Stream.PAGE_BYTES);
    assert.equal(page.bytes, Stream.PAGE_BYTES);
    assert.equal(page.lines, Stream.countLines(page.text));
    assert.ok(page.lines >= 1);
  }
});

test('workloads stay ASCII so string length is the byte size', () => {
  for (const item of Stream.WORKLOADS) {
    const taken = takePages(item.id, 2);
    assert.equal(Stream.isAscii(taken.pages[0].text + taken.open), true);
  }
});

test('an unknown workload is rejected', () => {
  assert.throws(function () { Stream.makeGenerator('syslog'); }, /Unknown workload/);
});

test('trim drops oldest pages and reports the lines removed', () => {
  const pages = [
    {lines: 4},
    {lines: 5},
    {lines: 6},
    {lines: 7},
  ];
  const trimmed = Stream.trimPages(pages, 2);
  assert.equal(trimmed.pages.length, 2);
  assert.equal(trimmed.droppedLines, 9);
  assert.equal(trimmed.pages[0].lines, 6);
  assert.deepEqual(Stream.trimPages(pages, 10).pages, pages);
});

test('tally counts expanded text and deflate blobs together', () => {
  const pages = [
    {bytes: 100, text: 'abc', compressedBytes: 40},
    {bytes: 100, text: null, compressedBytes: 20},
  ];
  const totals = Stream.tally(pages, 'zz');
  assert.equal(totals.raw, 202);
  assert.equal(totals.expanded, 5);
  assert.equal(totals.blobs, 60);
  assert.equal(totals.held, 65);
  assert.equal(totals.saved, 137);
  assert.equal(totals.ratio, 60 / 200);
});

test('hot indexes are the pages that cross the viewport', () => {
  const pages = [
    {lines: 10},
    {lines: 10},
    {lines: 10},
  ];
  const range = Stream.hotIndexes(pages, 4, 180, 180, 18, 0);
  assert.deepEqual(range.hot, [1]);
  assert.equal(range.prefix[1], 180);
  assert.equal(range.openY, 540);
  assert.equal(range.total, 540 + 72);
  assert.equal(range.openHot, false);
  const tail = Stream.hotIndexes(pages, 4, 540, 80, 18, 0);
  assert.equal(tail.openHot, true);
  assert.deepEqual(tail.hot, []);
});

test('byte labels and heatmap colors stay in range', () => {
  assert.equal(Stream.formatBytes(0), '0 B');
  assert.equal(Stream.formatBytes(1536), '1.50 KB');
  assert.equal(Stream.formatBytes(-2048), '-2.00 KB');
  assert.equal(Stream.heatColor(null), null);
  assert.match(Stream.heatColor(0.1), /^hsl\(1[45]\d /);
  assert.match(Stream.heatColor(2), /^hsl\(8 /);
});

test('deflate round-trips a page', async () => {
  const page = takePages('json', 1).pages[0];
  const blob = await Compress.deflateUtf8(page.text);
  assert.ok(blob.length > 0);
  assert.equal(await Compress.inflateToString(blob), page.text);
});

test('a repeated progress bar compresses and random noise barely does', async () => {
  async function ratioOf(kind) {
    const pages = takePages(kind, 3).pages;
    let raw = 0;
    let blobs = 0;
    for (const page of pages) {
      const blob = await Compress.deflateUtf8(page.text);
      raw += page.bytes;
      blobs += blob.length;
    }
    return blobs / raw;
  }
  const progress = await ratioOf('progress');
  const json = await ratioOf('json');
  const build = await ratioOf('build');
  const listing = await ratioOf('listing');
  const noise = await ratioOf('noise');
  assert.ok(progress < 0.3, 'progress ' + progress);
  assert.ok(json < 0.45, 'json ' + json);
  assert.ok(build < 0.55, 'build ' + build);
  assert.ok(listing < 0.65, 'listing ' + listing);
  assert.ok(noise > 0.75, 'noise ' + noise);
  assert.ok(noise > progress + 0.5, 'noise should be much worse than progress');
  assert.ok(progress < build);
  assert.ok(build < noise);
  assert.ok(listing < noise);
});
