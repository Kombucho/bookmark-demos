// BLAKE3 hash mode, in the shape of the reference implementation.
// Chunks are 1024 bytes. The root digest sets the ROOT flag on the final
// compression only. Nothing here touches the DOM or the network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Blake3Tree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLOCK_LEN = 64;
  const CHUNK_LEN = 1024;
  const OUT_LEN = 32;

  const CHUNK_START = 1 << 0;
  const CHUNK_END = 1 << 1;
  const PARENT = 1 << 2;
  const ROOT = 1 << 3;

  const IV = Uint32Array.of(
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
    0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
  );

  const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

  const FLAG_NAMES = [
    [CHUNK_START, 'CHUNK_START'],
    [CHUNK_END, 'CHUNK_END'],
    [PARENT, 'PARENT'],
    [ROOT, 'ROOT'],
  ];

  // Official test-vector input: byte i is i % 251. The digest is the first 32 bytes.
  const VECTORS = [
    [0, 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'],
    [1, '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213'],
    [63, 'e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b'],
    [64, '4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98'],
    [65, 'de1e5fa0be70df6d2be8fffd0e99ceaa8eb6e8c93a63f2d8d1c30ecb6b263dee'],
    [1023, '10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11'],
    [1024, '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7'],
    [1025, 'd00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444'],
    [2048, 'e776b6028c7cd22a4d0ba182a8bf62205d2ef576467e838ed6f2529b85fba24a'],
    [3072, 'b98cb0ff3623be03326b373de6b9095218513e64f1ee2edd2525c7ad1e5cffd2'],
    [4096, '015094013f57a5277b59d8475c0501042c0b642e531b0a1c8f58d2163229e969'],
    [4097, '9b4052b38f1c5fc8b1f9ff7ac7b27cd242487b3d890d15c96a1c25b8aa0fb995'],
  ];

  function u32(n) {
    return n >>> 0;
  }

  function rotr(x, n) {
    return u32((x >>> n) | (x << (32 - n)));
  }

  function g(state, a, b, c, d, mx, my) {
    state[a] = u32(state[a] + state[b] + mx);
    state[d] = rotr(state[d] ^ state[a], 16);
    state[c] = u32(state[c] + state[d]);
    state[b] = rotr(state[b] ^ state[c], 12);
    state[a] = u32(state[a] + state[b] + my);
    state[d] = rotr(state[d] ^ state[a], 8);
    state[c] = u32(state[c] + state[d]);
    state[b] = rotr(state[b] ^ state[c], 7);
  }

  function compress(chainingValue, blockWords, counter, blockLen, flags) {
    const state = new Uint32Array(16);
    state.set(chainingValue, 0);
    state[8] = IV[0];
    state[9] = IV[1];
    state[10] = IV[2];
    state[11] = IV[3];
    state[12] = u32(counter);
    state[13] = u32(Math.floor(counter / 4294967296));
    state[14] = u32(blockLen);
    state[15] = u32(flags);

    const block = blockWords.slice();
    for (let round = 0; round < 7; round++) {
      g(state, 0, 4, 8, 12, block[0], block[1]);
      g(state, 1, 5, 9, 13, block[2], block[3]);
      g(state, 2, 6, 10, 14, block[4], block[5]);
      g(state, 3, 7, 11, 15, block[6], block[7]);
      g(state, 0, 5, 10, 15, block[8], block[9]);
      g(state, 1, 6, 11, 12, block[10], block[11]);
      g(state, 2, 7, 8, 13, block[12], block[13]);
      g(state, 3, 4, 9, 14, block[14], block[15]);
      if (round !== 6) {
        const next = new Uint32Array(16);
        for (let i = 0; i < 16; i++) next[i] = block[MSG_PERMUTATION[i]];
        block.set(next);
      }
    }
    for (let i = 0; i < 8; i++) {
      state[i] = u32(state[i] ^ state[i + 8]);
      state[i + 8] = u32(state[i + 8] ^ chainingValue[i]);
    }
    return state;
  }

  function wordsFromBytes(bytes) {
    const words = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const o = i * 4;
      words[i] = u32(
        (bytes[o] || 0) |
        ((bytes[o + 1] || 0) << 8) |
        ((bytes[o + 2] || 0) << 16) |
        ((bytes[o + 3] || 0) << 24)
      );
    }
    return words;
  }

  function hexWords(words, count) {
    const n = count == null ? words.length : count;
    let hex = '';
    for (let i = 0; i < n; i++) {
      const w = words[i];
      hex += (w & 0xff).toString(16).padStart(2, '0');
      hex += ((w >>> 8) & 0xff).toString(16).padStart(2, '0');
      hex += ((w >>> 16) & 0xff).toString(16).padStart(2, '0');
      hex += ((w >>> 24) & 0xff).toString(16).padStart(2, '0');
    }
    return hex;
  }

  function flagNames(flags) {
    const names = [];
    for (let i = 0; i < FLAG_NAMES.length; i++) {
      if (flags & FLAG_NAMES[i][0]) names.push(FLAG_NAMES[i][1]);
    }
    return names;
  }

  function chunkOutput(data, chunkCounter) {
    let cv = IV.slice();
    const blocks = [];
    let offset = 0;
    const length = data.length;
    while (true) {
      const remaining = length - offset;
      const isLast = remaining <= BLOCK_LEN;
      const take = isLast ? remaining : BLOCK_LEN;
      const block = new Uint8Array(BLOCK_LEN);
      if (take > 0) block.set(data.subarray(offset, offset + take));
      const words = wordsFromBytes(block);
      const startFlag = blocks.length === 0 ? CHUNK_START : 0;
      if (!isLast) {
        const flags = startFlag;
        cv = compress(cv, words, chunkCounter, BLOCK_LEN, flags).slice(0, 8);
        blocks.push({index: blocks.length, blockLen: BLOCK_LEN, flags: flags});
        offset += BLOCK_LEN;
        continue;
      }
      const flags = startFlag | CHUNK_END;
      const inputCv = cv.slice();
      const out = compress(inputCv, words, chunkCounter, take, flags);
      blocks.push({index: blocks.length, blockLen: take, flags: flags});
      return {
        cv: out.slice(0, 8),
        inputCv: inputCv,
        blockWords: words,
        blockLen: take,
        flags: flags,
        counter: chunkCounter,
        blocks: blocks,
      };
    }
  }

  function makeChunk(bytes, start, end, counter, steps) {
    const out = chunkOutput(bytes.subarray(start, end), counter);
    const node = {
      kind: 'chunk',
      key: counter + '-' + counter,
      startChunk: counter,
      endChunk: counter,
      byteStart: start,
      byteEnd: end,
      cv: out.cv,
      cvHex: hexWords(out.cv),
      inputCv: out.inputCv,
      blockWords: out.blockWords,
      blockLen: out.blockLen,
      flags: out.flags,
      counter: out.counter,
      blocks: out.blocks,
      left: null,
      right: null,
      isRoot: false,
      hash: null,
    };
    steps.push(node);
    return node;
  }

  function makeParent(left, right, steps) {
    const blockWords = new Uint32Array(16);
    blockWords.set(left.cv, 0);
    blockWords.set(right.cv, 8);
    const flags = PARENT;
    const inputCv = IV.slice();
    const cv = compress(inputCv, blockWords, 0, BLOCK_LEN, flags).slice(0, 8);
    const node = {
      kind: 'parent',
      key: left.startChunk + '-' + right.endChunk,
      startChunk: left.startChunk,
      endChunk: right.endChunk,
      byteStart: left.byteStart,
      byteEnd: right.byteEnd,
      cv: cv,
      cvHex: hexWords(cv),
      inputCv: inputCv,
      blockWords: blockWords,
      blockLen: BLOCK_LEN,
      flags: flags,
      counter: 0,
      blocks: null,
      left: left,
      right: right,
      isRoot: false,
      hash: null,
    };
    steps.push(node);
    return node;
  }

  function absorb(stack, node, totalChunks, steps) {
    let current = node;
    let total = totalChunks;
    while ((total & 1) === 0) {
      const left = stack.pop();
      current = makeParent(left, current, steps);
      total = Math.floor(total / 2);
    }
    stack.push(current);
  }

  function sealRoot(node) {
    const words = compress(
      node.inputCv,
      node.blockWords,
      node.counter,
      node.blockLen,
      node.flags | ROOT
    );
    node.isRoot = true;
    node.hash = hexWords(words, 8);
    return node;
  }

  function asBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === 'string') return new TextEncoder().encode(input);
    return new Uint8Array(input || 0);
  }

  function build(input) {
    const bytes = asBytes(input);
    const stack = [];
    const steps = [];
    let offset = 0;
    let chunkCounter = 0;
    let last = null;

    if (bytes.length === 0) {
      last = makeChunk(bytes, 0, 0, 0, steps);
    } else {
      while (offset < bytes.length) {
        const end = Math.min(offset + CHUNK_LEN, bytes.length);
        const chunk = makeChunk(bytes, offset, end, chunkCounter, steps);
        const more = end < bytes.length;
        offset = end;
        chunkCounter += 1;
        if (more) absorb(stack, chunk, chunkCounter, steps);
        else last = chunk;
      }
    }

    let node = last;
    while (stack.length) {
      const left = stack.pop();
      node = makeParent(left, node, steps);
    }
    sealRoot(node);
    return {
      root: node,
      steps: steps,
      bytes: bytes,
      byteLength: bytes.length,
    };
  }

  function hashHex(input) {
    return build(input).root.hash;
  }

  function pattern(len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = i % 251;
    return out;
  }

  function selfTest() {
    const failed = [];
    for (let i = 0; i < VECTORS.length; i++) {
      const len = VECTORS[i][0];
      const expect = VECTORS[i][1];
      const got = hashHex(pattern(len));
      if (got !== expect) failed.push({len: len, got: got, expect: expect});
    }
    return {ok: failed.length === 0, failed: failed, count: VECTORS.length};
  }

  function shownFlags(node) {
    return node.isRoot ? (node.flags | ROOT) : node.flags;
  }

  // Chunk nodes carry every block's flags, so a long chunk still shows CHUNK_START.
  function displayFlags(node) {
    let flags = node.flags;
    if (node.blocks) {
      for (let i = 0; i < node.blocks.length; i++) flags |= node.blocks[i].flags;
    }
    if (node.isRoot) flags |= ROOT;
    return flags;
  }

  function collect(node, out) {
    const list = out || [];
    list.push(node);
    if (node.left) collect(node.left, list);
    if (node.right) collect(node.right, list);
    return list;
  }

  function leaves(node, out) {
    const list = out || [];
    if (!node.left) list.push(node);
    else {
      leaves(node.left, list);
      leaves(node.right, list);
    }
    return list;
  }

  function nodeDepth(node) {
    if (!node.left) return 0;
    const left = nodeDepth(node.left);
    const right = nodeDepth(node.right);
    return 1 + (left > right ? left : right);
  }

  // Leaves together, then each parent level, then the root. Chunks do not depend on each other.
  function parallelWaves(tree) {
    const groups = [];
    function walk(node) {
      const d = nodeDepth(node);
      if (!groups[d]) groups[d] = [];
      groups[d].push(node);
      if (node.left) {
        walk(node.left);
        walk(node.right);
      }
    }
    walk(tree.root);
    return groups;
  }

  function flipBit(bytes, index) {
    const next = bytes.slice();
    if (!next.length) return next;
    const i = index < 0 ? 0 : index >= next.length ? next.length - 1 : index;
    next[i] = next[i] ^ 1;
    return {bytes: next, index: i};
  }

  function hammingHex(a, b) {
    const n = Math.min(a.length, b.length);
    let bits = 0;
    for (let i = 0; i < n; i += 2) {
      let v = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
      while (v) {
        bits += v & 1;
        v >>>= 1;
      }
    }
    return bits;
  }

  function changedKeys(before, after) {
    const other = new Map();
    const afterNodes = collect(after.root);
    for (let i = 0; i < afterNodes.length; i++) other.set(afterNodes[i].key, afterNodes[i]);
    const changed = [];
    const nodes = collect(before.root);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const twin = other.get(node.key);
      const mine = node.isRoot ? node.hash : node.cvHex;
      const theirs = twin ? (twin.isRoot ? twin.hash : twin.cvHex) : null;
      if (mine !== theirs) changed.push(node.key);
    }
    return changed;
  }

  function pathKeys(tree, chunkIndex) {
    const keys = [];
    function walk(node) {
      if (chunkIndex < node.startChunk || chunkIndex > node.endChunk) return false;
      let hit = !node.left;
      if (node.left) {
        if (walk(node.left) || walk(node.right)) hit = true;
      }
      if (hit) keys.push(node.key);
      return hit;
    }
    walk(tree.root);
    return keys;
  }

  function chunkCount(tree) {
    return leaves(tree.root).length;
  }

  return {
    BLOCK_LEN: BLOCK_LEN,
    CHUNK_LEN: CHUNK_LEN,
    OUT_LEN: OUT_LEN,
    CHUNK_START: CHUNK_START,
    CHUNK_END: CHUNK_END,
    PARENT: PARENT,
    ROOT: ROOT,
    VECTORS: VECTORS,
    flagNames: flagNames,
    shownFlags: shownFlags,
    displayFlags: displayFlags,
    pattern: pattern,
    build: build,
    hashHex: hashHex,
    selfTest: selfTest,
    collect: collect,
    leaves: leaves,
    nodeDepth: nodeDepth,
    parallelWaves: parallelWaves,
    flipBit: flipBit,
    hammingHex: hammingHex,
    changedKeys: changedKeys,
    pathKeys: pathKeys,
    chunkCount: chunkCount,
    hexWords: hexWords,
  };
});
