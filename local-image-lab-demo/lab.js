// Resize, palette, and JPEG segment reading for the on-device lab.
// Canvas encoding stays in the page. This file does not upload anything.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ImageLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STRIP_QUALITY = 0.92;
  const SAMPLE_EDGE = 48;

  const MARKERS = {
    0xD8: 'SOI',
    0xD9: 'EOI',
    0xDA: 'SOS',
    0xDB: 'DQT',
    0xC0: 'SOF0',
    0xC1: 'SOF1',
    0xC2: 'SOF2',
    0xC4: 'DHT',
    0xDD: 'DRI',
    0xFE: 'COM',
  };

  const STRING_TAGS = {
    0x010E: 'imageDescription',
    0x010F: 'make',
    0x0110: 'model',
    0x0131: 'software',
    0x0132: 'dateTime',
    0x013B: 'artist',
    0x8298: 'copyright',
    0x9003: 'dateTimeOriginal',
    0x9004: 'dateTimeDigitized',
  };

  const FIELD_ORDER = [
    ['imageDescription', 0x010E],
    ['make', 0x010F],
    ['model', 0x0110],
    ['software', 0x0131],
    ['dateTime', 0x0132],
    ['artist', 0x013B],
  ];

  function asBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (Array.isArray(input)) return Uint8Array.from(input);
    if (input && typeof input.length === 'number') return Uint8Array.from(input);
    return new Uint8Array(0);
  }

  function fitSize(width, height, longest) {
    const w = Number(width);
    const h = Number(height);
    const edge = Math.max(1, Math.round(Number(longest) || 1));
    if (!(w > 0) || !(h > 0)) return { width: 1, height: 1, scale: 1 };
    const scale = edge / Math.max(w, h);
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
      scale: scale,
    };
  }

  function sampleBox(width, height) {
    const w = Number(width) || 1;
    const h = Number(height) || 1;
    const edge = Math.min(SAMPLE_EDGE, Math.max(w, h));
    return fitSize(w, h, Math.max(1, edge));
  }

  function formatBytes(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (v < 1024) return v + ' B';
    if (v < 1048576) return (v / 1024).toFixed(1) + ' KB';
    return (v / 1048576).toFixed(2) + ' MB';
  }

  function shareOf(part, whole) {
    const p = Number(part) || 0;
    const w = Number(whole) || 0;
    if (w <= 0) return 0;
    return Math.round((p / w) * 100);
  }

  function toHex(r, g, b) {
    function byte(v) {
      const n = Math.max(0, Math.min(255, Math.round(v)));
      return n.toString(16).padStart(2, '0').toUpperCase();
    }
    return '#' + byte(r) + byte(g) + byte(b);
  }

  function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function paletteFromPixels(rgba, count) {
    const data = asBytes(rgba);
    let want = Math.round(Number(count));
    if (!Number.isFinite(want)) want = 6;
    want = Math.max(1, Math.min(8, want));

    const buckets = new Map();
    for (let i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { r: 0, g: 0, b: 0, count: 0 };
        buckets.set(key, bucket);
      }
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    }
    if (!buckets.size) return [];

    const ranked = [];
    buckets.forEach(function (bucket) {
      ranked.push({
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count,
        count: bucket.count,
      });
    });
    ranked.sort(function (a, b) { return b.count - a.count; });

    const picked = [];
    const used = new Set();
    for (let minDistance = 48; minDistance >= 0 && picked.length < want; minDistance -= 16) {
      for (let i = 0; i < ranked.length && picked.length < want; i++) {
        if (used.has(i)) continue;
        let close = false;
        for (let p = 0; p < picked.length; p++) {
          if (colorDistance(ranked[i], picked[p]) < minDistance) {
            close = true;
            break;
          }
        }
        if (close) continue;
        used.add(i);
        picked.push(ranked[i]);
      }
    }

    const colors = picked.map(function (color) {
      return { hex: toHex(color.r, color.g, color.b), count: color.count };
    });
    colors.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      if (a.hex < b.hex) return -1;
      if (a.hex > b.hex) return 1;
      return 0;
    });
    return colors;
  }

  function markerName(marker) {
    if (MARKERS[marker]) return MARKERS[marker];
    if (marker >= 0xE0 && marker <= 0xEF) return 'APP' + (marker - 0xE0);
    if (marker >= 0xD0 && marker <= 0xD7) return 'RST' + (marker - 0xD0);
    return '0x' + marker.toString(16).toUpperCase();
  }

  function u16(bytes, offset, le) {
    if (offset + 1 >= bytes.length) return 0;
    return le
      ? bytes[offset] | (bytes[offset + 1] << 8)
      : (bytes[offset] << 8) | bytes[offset + 1];
  }

  function u32(bytes, offset, le) {
    if (offset + 3 >= bytes.length) return 0;
    return le
      ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
      : ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function readAscii(bytes, offset, count) {
    const n = Math.max(0, Math.min(count, 180, bytes.length - offset));
    let out = '';
    for (let i = 0; i < n; i++) {
      const c = bytes[offset + i];
      if (c === 0) break;
      out += (c >= 32 && c < 127) ? String.fromCharCode(c) : '';
    }
    return out.trim();
  }

  function typeWidth(type) {
    if (type === 1 || type === 2 || type === 7) return 1;
    if (type === 3) return 2;
    if (type === 4 || type === 9) return 4;
    if (type === 5 || type === 10) return 8;
    return 0;
  }

  function readExif(payload) {
    const empty = {
      exif: false,
      make: '',
      model: '',
      software: '',
      dateTime: '',
      dateTimeOriginal: '',
      imageDescription: '',
      artist: '',
      copyright: '',
      gps: false,
    };
    if (payload.length < 14) return empty;
    if (payload[0] !== 0x45 || payload[1] !== 0x78 || payload[2] !== 0x69 || payload[3] !== 0x66 || payload[4] !== 0 || payload[5] !== 0) {
      return empty;
    }
    const tiff = payload.subarray(6);
    const le = tiff[0] === 0x49 && tiff[1] === 0x49;
    const be = tiff[0] === 0x4D && tiff[1] === 0x4D;
    if (!le && !be) return Object.assign({}, empty, { exif: true });
    if (u16(tiff, 2, le) !== 0x002A) return Object.assign({}, empty, { exif: true });

    const info = Object.assign({}, empty, { exif: true });
    const seen = new Set();

    function walk(offset, depth) {
      if (depth > 5 || seen.has(offset)) return;
      if (offset < 8 || offset + 2 > tiff.length) return;
      seen.add(offset);
      const count = u16(tiff, offset, le);
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + i * 12;
        if (entry + 12 > tiff.length) break;
        const tag = u16(tiff, entry, le);
        const type = u16(tiff, entry + 2, le);
        const n = u32(tiff, entry + 4, le);
        const width = typeWidth(type);
        if (!width || n > 100000) continue;
        const size = width * n;
        const dataOffset = size <= 4 ? entry + 8 : u32(tiff, entry + 8, le);
        if (tag === 0x8769 && type === 4) {
          walk(u32(tiff, entry + 8, le), depth + 1);
          continue;
        }
        if (tag === 0x8825 && type === 4) {
          info.gps = true;
          walk(u32(tiff, entry + 8, le), depth + 1);
          continue;
        }
        const key = STRING_TAGS[tag];
        if (key && type === 2 && n > 0 && n < 180 && dataOffset + Math.min(n, 180) <= tiff.length) {
          info[key] = readAscii(tiff, dataOffset, n);
        }
      }
    }

    walk(u32(tiff, 4, le), 0);
    return info;
  }

  function parseJpeg(bytes) {
    const segments = [];
    const app1 = [];
    if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      return { isJpeg: false, segments: segments, app1: app1, app1Count: 0 };
    }
    segments.push({ name: 'SOI', marker: 0xD8, size: 0 });
    let i = 2;
    let guard = 0;
    while (i < bytes.length && guard < 80) {
      guard += 1;
      if (bytes[i] !== 0xFF) break;
      while (i < bytes.length && bytes[i] === 0xFF) i += 1;
      if (i >= bytes.length) break;
      const marker = bytes[i];
      i += 1;
      if (marker === 0x00) continue;
      if (marker === 0xD9) {
        segments.push({ name: 'EOI', marker: marker, size: 0 });
        break;
      }
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
        segments.push({ name: markerName(marker), marker: marker, size: 0 });
        continue;
      }
      if (i + 1 >= bytes.length) break;
      const size = (bytes[i] << 8) | bytes[i + 1];
      if (size < 2 || i + size > bytes.length) break;
      const payload = bytes.subarray(i + 2, i + size);
      const name = markerName(marker);
      segments.push({ name: name, marker: marker, size: size });
      if (marker === 0xE1) {
        app1.push({ size: size, exif: readExif(payload) });
      }
      i += size;
      if (marker === 0xDA) {
        while (i + 1 < bytes.length) {
          if (bytes[i] === 0xFF) {
            const next = bytes[i + 1];
            if (next === 0x00) {
              i += 2;
              continue;
            }
            if (next >= 0xD0 && next <= 0xD7) {
              i += 2;
              continue;
            }
            if (next === 0xD9) {
              segments.push({ name: 'EOI', marker: 0xD9, size: 0 });
              i += 2;
            }
            break;
          }
          i += 1;
        }
        break;
      }
    }
    return { isJpeg: true, segments: segments, app1: app1, app1Count: app1.length };
  }

  function isPng(bytes) {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  }

  function isGif(bytes) {
    if (bytes.length < 6) return false;
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    return head === 'GIF87a' || head === 'GIF89a';
  }

  function isWebp(bytes) {
    if (bytes.length < 12) return false;
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return riff === 'RIFF' && webp === 'WEBP';
  }

  function inspectBytes(input) {
    const bytes = asBytes(input);
    const base = {
      byteLength: bytes.length,
      segments: [],
      app1: [],
      app1Count: 0,
      note: '',
    };
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
      const parsed = parseJpeg(bytes);
      return Object.assign(base, parsed, { kind: 'jpeg', note: '' });
    }
    if (isPng(bytes)) {
      return Object.assign(base, { kind: 'png', note: 'PNG has no JPEG APP1 segment.' });
    }
    if (isGif(bytes)) {
      return Object.assign(base, { kind: 'gif', note: 'GIF has no JPEG APP1 segment.' });
    }
    if (isWebp(bytes)) {
      return Object.assign(base, { kind: 'webp', note: 'WebP has no JPEG APP1 segment.' });
    }
    return Object.assign(base, {
      kind: 'unknown',
      note: 'Not a JPEG, so there is no APP1 segment to read.',
    });
  }

  function exifPayload(fields) {
    const source = fields || {};
    const items = [];
    for (let i = 0; i < FIELD_ORDER.length; i++) {
      const key = FIELD_ORDER[i][0];
      const tag = FIELD_ORDER[i][1];
      if (!source[key]) continue;
      const text = String(source[key]).slice(0, 240);
      const raw = new TextEncoder().encode(text);
      const data = new Uint8Array(raw.length + 1);
      data.set(raw, 0);
      items.push({ tag: tag, data: data });
    }
    if (!items.length) {
      items.push({ tag: 0x010E, data: new Uint8Array([0]) });
    }

    const count = items.length;
    const afterIfd = 8 + 2 + count * 12 + 4;
    let cursor = afterIfd;
    const placed = items.map(function (item) {
      if (item.data.length <= 4) return { tag: item.tag, data: item.data, inline: true, offset: 0 };
      const offset = cursor;
      cursor += item.data.length;
      if (cursor % 2) cursor += 1;
      return { tag: item.tag, data: item.data, inline: false, offset: offset };
    });

    const tiff = new Uint8Array(cursor);
    const view = new DataView(tiff.buffer);
    tiff[0] = 0x49;
    tiff[1] = 0x49;
    view.setUint16(2, 0x002A, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, count, true);
    for (let i = 0; i < placed.length; i++) {
      const item = placed[i];
      const entry = 10 + i * 12;
      view.setUint16(entry, item.tag, true);
      view.setUint16(entry + 2, 2, true);
      view.setUint32(entry + 4, item.data.length, true);
      if (item.inline) tiff.set(item.data, entry + 8);
      else {
        view.setUint32(entry + 8, item.offset, true);
        tiff.set(item.data, item.offset);
      }
    }
    view.setUint32(10 + count * 12, 0, true);

    const payload = new Uint8Array(6 + tiff.length);
    payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
    payload.set(tiff, 6);
    return payload;
  }

  function injectApp1Exif(input, fields) {
    const bytes = asBytes(input);
    if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      throw new Error('APP1 can only be planted in a JPEG.');
    }
    const payload = exifPayload(fields);
    const size = payload.length + 2;
    if (size > 65535) throw new Error('APP1 segment is too large.');
    const out = new Uint8Array(bytes.length + 4 + payload.length);
    out[0] = 0xFF;
    out[1] = 0xD8;
    out[2] = 0xFF;
    out[3] = 0xE1;
    out[4] = (size >> 8) & 255;
    out[5] = size & 255;
    out.set(payload, 6);
    out.set(bytes.subarray(2), 6 + payload.length);
    return out;
  }

  return {
    STRIP_QUALITY: STRIP_QUALITY,
    SAMPLE_EDGE: SAMPLE_EDGE,
    fitSize: fitSize,
    sampleBox: sampleBox,
    formatBytes: formatBytes,
    shareOf: shareOf,
    toHex: toHex,
    paletteFromPixels: paletteFromPixels,
    inspectBytes: inspectBytes,
    injectApp1Exif: injectApp1Exif,
    markerName: markerName,
  };
});
