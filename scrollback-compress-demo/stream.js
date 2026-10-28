// Fixed-size scrollback pages and the fictional workloads that fill them.
// Workloads are ASCII on purpose: a JavaScript string length is the UTF-8 size.
// This is the paging model for the demo, not Ghostty's.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ScrollStream = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PAGE_BYTES = 2048;
  const MAX_PAGES = 72;
  const LINE_HEIGHT = 18;

  const WORKLOADS = [
    {id: 'build', label: 'Build log', hint: 'Repeated compiler lines'},
    {id: 'listing', label: 'Directory listing', hint: 'Aligned columns'},
    {id: 'json', label: 'JSON dump', hint: 'The same keys every line'},
    {id: 'progress', label: 'Progress bar', hint: 'One shape, many times'},
    {id: 'noise', label: 'Random noise', hint: 'Worst case, printable characters'},
  ];

  const SEEDS = {
    build: 1,
    listing: 2,
    json: 3,
    progress: 4,
    noise: 0x9e3779b9,
  };

  const FILES = ['page.cc', 'scroll.cc', 'grid.cc', 'pty.cc', 'utf8.cc', 'style.cc'];
  const NAMES = [
    'page.cc', 'scroll.cc', 'README.md', 'CMakeLists.txt', 'LICENSE',
    'term.h', 'grid.cc', 'pty.cc', 'utf8.cc', 'style.cc',
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pad(n, width) {
    const s = String(n);
    return s.length >= width ? s : ' '.repeat(width - s.length) + s;
  }

  function lineFor(kind, i, rand) {
    if (kind === 'build') {
      const file = FILES[i % FILES.length];
      const pct = pad((i * 3) % 101, 3);
      const slot = i % 4;
      if (slot === 0) return '[' + pct + '%] Building CXX object src/CMakeFiles/kiln.dir/term/' + file + '.o\n';
      if (slot === 1) return 'c++ -I/src/kiln/include -O2 -std=c++20 -c /src/kiln/src/term/' + file + '\n';
      if (slot === 2) return '[ OK ] term.' + file.replace('.cc', '') + '.pack                  ' + pad((i % 9) + 2, 2) + ' ms\n';
      return '-- Configuring done. Generating done. Built target kiln\n';
    }
    if (kind === 'listing') {
      const name = NAMES[i % NAMES.length];
      const dir = i % 10 === 0;
      const perm = dir ? 'drwxr-xr-x' : '-rw-r--r--';
      const size = pad(dir ? 4096 : 1800 + ((i * 137) % 60000), 8);
      const day = pad((i % 27) + 1, 2);
      return perm + '  1 kiln kiln ' + size + ' Oct ' + day + ' 07:14 ' + name + '\n';
    }
    if (kind === 'json') {
      const warn = i % 8 === 0;
      const lvl = warn ? 'warn' : 'info';
      const msg = warn ? 'retry' : 'accepted';
      const bytes = 256 + (i % 40) * 32;
      return '{"ts":"07:14:' + pad(i % 60, 2) + '.' + pad(i % 1000, 3) + '","lvl":"' + lvl + '","svc":"kiln","msg":"' + msg + '","path":"/v1/pages","bytes":' + bytes + '}\n';
    }
    if (kind === 'progress') {
      const step = i % 29;
      const filled = step;
      const bar = '#'.repeat(filled) + '-'.repeat(28 - filled);
      const pct = pad(Math.round(step / 28 * 100), 3);
      const speed = (9 + (step % 4) * 0.3).toFixed(1);
      return 'fetch crates [' + bar + '] ' + pct + '%  ' + speed + ' MB/s\n';
    }
    // Printable ASCII with no repeated frame. Hex dumps still have spaces and
    // a 16-symbol alphabet, so they deflate further than this.
    let noise = '';
    for (let b = 0; b < 64; b++) noise += String.fromCharCode(33 + Math.floor(rand() * 94));
    return noise + '\n';
  }

  function makeGenerator(kind) {
    if (!WORKLOADS.some(function (item) { return item.id === kind; })) {
      throw new Error('Unknown workload: ' + kind);
    }
    let i = 0;
    const rand = mulberry32(SEEDS[kind]);
    return {
      kind: kind,
      next: function (chars) {
        const target = Math.max(1, chars | 0);
        let out = '';
        let guard = 0;
        while (out.length < target && guard < 10000) {
          out += lineFor(kind, i, rand);
          i += 1;
          guard += 1;
        }
        return out;
      },
    };
  }

  function countLines(text) {
    if (!text) return 0;
    let n = 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) n += 1;
    }
    if (text.charCodeAt(text.length - 1) === 10) n -= 1;
    return n;
  }

  function feed(open, chunk, pageBytes) {
    const size = pageBytes || PAGE_BYTES;
    if (size < 1) throw new Error('page size');
    const buf = (open || '') + (chunk || '');
    const sealed = [];
    let start = 0;
    while (buf.length - start >= size) {
      const text = buf.slice(start, start + size);
      sealed.push({text: text, bytes: size, lines: countLines(text)});
      start += size;
    }
    return {sealed: sealed, open: buf.slice(start)};
  }

  function trimPages(pages, max) {
    const limit = max == null ? MAX_PAGES : max;
    if (pages.length <= limit) return {pages: pages, droppedLines: 0};
    let droppedLines = 0;
    const cut = pages.length - limit;
    for (let i = 0; i < cut; i++) droppedLines += pages[i].lines;
    return {pages: pages.slice(cut), droppedLines: droppedLines};
  }

  function tally(pages, openText) {
    const open = openText || '';
    let raw = open.length;
    let expanded = open.length;
    let blobs = 0;
    let blobRaw = 0;
    let blobCount = 0;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      raw += page.bytes;
      if (page.text != null) expanded += page.text.length;
      if (page.compressedBytes != null) {
        blobs += page.compressedBytes;
        blobRaw += page.bytes;
        blobCount += 1;
      }
    }
    const held = expanded + blobs;
    return {
      raw: raw,
      expanded: expanded,
      blobs: blobs,
      held: held,
      saved: raw - held,
      blobRaw: blobRaw,
      blobCount: blobCount,
      ratio: blobRaw ? blobs / blobRaw : null,
      pageCount: pages.length,
    };
  }

  function pageRatio(page) {
    if (!page || page.compressedBytes == null || !page.bytes) return null;
    return page.compressedBytes / page.bytes;
  }

  function hotIndexes(pages, openLines, scrollTop, viewHeight, lineHeight, bufferPx) {
    const height = lineHeight || LINE_HEIGHT;
    const prefix = [];
    let y = 0;
    for (let i = 0; i < pages.length; i++) {
      prefix.push(y);
      y += pages[i].lines * height;
    }
    const openY = y;
    const openH = Math.max(0, openLines) * height;
    const total = y + openH;
    const pad = bufferPx || 0;
    const top = scrollTop - pad;
    const bottom = scrollTop + viewHeight + pad;
    const hot = [];
    for (let i = 0; i < pages.length; i++) {
      const pageTop = prefix[i];
      const pageBottom = pageTop + pages[i].lines * height;
      if (pageBottom > top && pageTop < bottom) hot.push(i);
    }
    const openHot = openH > 0 && (openY + openH) > top && openY < bottom;
    return {hot: hot, prefix: prefix, openY: openY, total: total, openHot: openHot};
  }

  function formatBytes(n) {
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(Math.round(n));
    if (v < 1024) return sign + v + ' B';
    if (v < 1024 * 1024) {
      const digits = v < 10 * 1024 ? 2 : 1;
      return sign + (v / 1024).toFixed(digits) + ' KB';
    }
    return sign + (v / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function heatColor(ratio) {
    if (ratio == null || !isFinite(ratio)) return null;
    const t = Math.max(0, Math.min(1, (ratio - 0.1) / 0.75));
    const hue = 152 + (8 - 152) * t;
    const sat = 42 + (64 - 42) * t;
    const light = 32 + (44 - 32) * t;
    return 'hsl(' + hue.toFixed(0) + ' ' + sat.toFixed(0) + '% ' + light.toFixed(0) + '%)';
  }

  function isAscii(text) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 127) return false;
    }
    return true;
  }

  return {
    PAGE_BYTES: PAGE_BYTES,
    MAX_PAGES: MAX_PAGES,
    LINE_HEIGHT: LINE_HEIGHT,
    WORKLOADS: WORKLOADS,
    makeGenerator: makeGenerator,
    countLines: countLines,
    feed: feed,
    trimPages: trimPages,
    tally: tally,
    pageRatio: pageRatio,
    hotIndexes: hotIndexes,
    formatBytes: formatBytes,
    heatColor: heatColor,
    isAscii: isAscii,
  };
});
