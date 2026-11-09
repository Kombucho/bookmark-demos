const test = require('node:test');
const assert = require('node:assert/strict');
const lab = require('./lab.js');

function jpegWithApp0() {
  const jfif = [
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ];
  return Uint8Array.from([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, ...jfif,
    0xFF, 0xDA, 0x00, 0x02,
    0x12, 0x34, 0xFF, 0x00, 0x56,
    0xFF, 0xD9,
  ]);
}

test('fitSize scales the long edge and never rounds a side to zero', () => {
  assert.deepEqual(lab.fitSize(640, 480, 480), { width: 480, height: 360, scale: 0.75 });
  assert.deepEqual(lab.fitSize(100, 100, 100), { width: 100, height: 100, scale: 1 });
  assert.deepEqual(lab.fitSize(50, 100, 40), { width: 20, height: 40, scale: 0.4 });
  assert.deepEqual(lab.fitSize(100, 1, 10), { width: 10, height: 1, scale: 0.1 });
  assert.deepEqual(lab.fitSize(0, 10, 10), { width: 1, height: 1, scale: 1 });
  assert.deepEqual(lab.sampleBox(640, 480), { width: 48, height: 36, scale: 0.075 });
  assert.deepEqual(lab.sampleBox(20, 10), lab.fitSize(20, 10, 20));
});

test('byte labels and the share of the original', () => {
  assert.equal(lab.formatBytes(0), '0 B');
  assert.equal(lab.formatBytes(512), '512 B');
  assert.equal(lab.formatBytes(1536), '1.5 KB');
  assert.equal(lab.formatBytes(2048), '2.0 KB');
  assert.equal(lab.formatBytes(2 * 1048576), '2.00 MB');
  assert.equal(lab.shareOf(28, 82), 34);
  assert.equal(lab.shareOf(10, 0), 0);
});

test('the palette returns HEX codes, keeps small accents, and skips transparent pixels', () => {
  const split = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
  ]);
  const colors = lab.paletteFromPixels(split, 2);
  assert.deepEqual(colors.map(function (c) { return c.hex; }), ['#0000FF', '#FF0000']);
  assert.equal(colors[0].count, 2);

  const flat = new Uint8ClampedArray([10, 20, 30, 255, 0, 255, 0, 0]);
  assert.deepEqual(lab.paletteFromPixels(flat, 4), [{ hex: '#0A141E', count: 1 }]);
  assert.deepEqual(lab.paletteFromPixels(new Uint8ClampedArray([0, 0, 0, 0]), 5), []);

  const blocks = [];
  function push(n, r, g, b) {
    for (let i = 0; i < n; i++) blocks.push(r, g, b, 255);
  }
  push(40, 120, 170, 196);
  push(4, 240, 180, 40);
  push(4, 163, 60, 42);
  push(4, 40, 110, 70);
  const found = lab.paletteFromPixels(new Uint8ClampedArray(blocks), 4).map(function (c) { return c.hex; });
  assert.deepEqual(found.sort(), ['#286E46', '#78AAC4', '#A33C2A', '#F0B428'].sort());
});

test('a clean JPEG has no APP1, and a planted Exif segment round-trips', () => {
  const clean = jpegWithApp0();
  const before = lab.inspectBytes(clean);
  assert.equal(before.kind, 'jpeg');
  assert.equal(before.app1Count, 0);
  assert.equal(before.segments.map(function (s) { return s.name; }).join(' '), 'SOI APP0 SOS EOI');

  const planted = lab.injectApp1Exif(clean, {
    make: 'Lab',
    model: 'Canvas',
    software: 'bookmark-demos',
    imageDescription: 'Drawn in this page. APP1 planted so the strip is visible with no file.',
    dateTime: '2026:11:09 07:15:00',
  });
  assert.equal(planted[0], 0xFF);
  assert.equal(planted[1], 0xD8);
  assert.equal(planted[2], 0xFF);
  assert.equal(planted[3], 0xE1);
  assert.deepEqual(planted.subarray(planted.length - (clean.length - 2)), clean.subarray(2));

  const after = lab.inspectBytes(planted);
  assert.equal(after.app1Count, 1);
  assert.equal(after.segments[1].name, 'APP1');
  assert.equal(after.segments[2].name, 'APP0');
  assert.equal(after.app1[0].exif.exif, true);
  assert.equal(after.app1[0].exif.make, 'Lab');
  assert.equal(after.app1[0].exif.model, 'Canvas');
  assert.equal(after.app1[0].exif.software, 'bookmark-demos');
  assert.equal(after.app1[0].exif.dateTime, '2026:11:09 07:15:00');
  assert.match(after.app1[0].exif.imageDescription, /APP1 planted/);
  assert.equal(after.app1[0].exif.gps, false);
});

test('non-JPEG containers report that they have no APP1 segment', () => {
  const png = lab.inspectBytes(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  assert.equal(png.kind, 'png');
  assert.equal(png.app1Count, 0);
  assert.match(png.note, /no JPEG APP1/);

  const gif = lab.inspectBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
  assert.equal(gif.kind, 'gif');
  const webp = lab.inspectBytes(Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]));
  assert.equal(webp.kind, 'webp');
  assert.equal(lab.inspectBytes(Uint8Array.from([1, 2, 3])).kind, 'unknown');
  assert.throws(function () {
    lab.injectApp1Exif(Uint8Array.from([1, 2, 3]), { make: 'X' });
  });
});
