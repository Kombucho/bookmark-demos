(function () {
  const blake = window.Blake3Tree;
  const MAX_BYTES = 1024 * 1024;
  const FULL_TREE = 16;
  const svgNS = 'http://www.w3.org/2000/svg';

  const badge = document.getElementById('badge');
  const motionNote = document.getElementById('motion-note');
  const sourceMeta = document.getElementById('source-meta');
  const modePattern = document.getElementById('mode-pattern');
  const modeText = document.getElementById('mode-text');
  const modeFile = document.getElementById('mode-file');
  const lengthInput = document.getElementById('length');
  const lengthOut = document.getElementById('length-out');
  const textInput = document.getElementById('text');
  const fileInput = document.getElementById('file');
  const drop = document.getElementById('drop');
  const fileNote = document.getElementById('file-note');
  const hashEl = document.getElementById('hash');
  const sizeLine = document.getElementById('size-line');
  const copyBtn = document.getElementById('copy');
  const flipBtn = document.getElementById('flip');
  const byteInput = document.getElementById('byte');
  const byteOut = document.getElementById('byte-out');
  const flipNote = document.getElementById('flip-note');
  const walkNote = document.getElementById('walk-note');
  const modeParallel = document.getElementById('mode-parallel');
  const modeSerial = document.getElementById('mode-serial');
  const prevBtn = document.getElementById('prev');
  const playBtn = document.getElementById('play');
  const nextBtn = document.getElementById('next');
  const stepCaption = document.getElementById('step-caption');
  const chunksEl = document.getElementById('chunks');
  const treeEl = document.getElementById('tree');
  const treeSummary = document.getElementById('tree-summary');
  const detailEl = document.getElementById('detail');
  const orderEl = document.getElementById('order');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) motionNote.hidden = false;

  const report = blake.selfTest();
  badge.textContent = report.ok
    ? 'Self-test passed · ' + report.count + ' official vectors'
    : 'Self-test failed at ' + report.failed[0].len + ' bytes';
  badge.classList.toggle('ok', report.ok);
  badge.classList.toggle('bad', !report.ok);

  let source = 'pattern';
  let bytes = blake.pattern(4096);
  let fileName = '';
  let flipped = false;
  let flipIndex = 0;
  let mode = 'parallel';
  let cursor = -1;
  let timer = 0;
  let selectedKey = null;
  let baseTree = null;
  let tree = null;
  let changed = new Set();
  let viewRoot = null;
  let nodeByKey = new Map();

  function activeBytes() {
    if (!flipped || !bytes.length) return bytes;
    return blake.flipBit(bytes, flipIndex).bytes;
  }

  function watchedChunk() {
    if (!bytes.length) return 0;
    const index = flipped ? blake.flipBit(bytes, flipIndex).index : flipIndex;
    return Math.floor(index / blake.CHUNK_LEN);
  }

  function stop() {
    clearTimeout(timer);
    timer = 0;
    playBtn.textContent = 'Play';
  }

  function frames() {
    if (!tree) return [];
    if (mode === 'parallel') return blake.parallelWaves(tree).map((wave) => wave.map((node) => node.key));
    return tree.steps.map((node) => [node.key]);
  }

  function findNode(node, key) {
    if (!node) return null;
    if (node.key === key) return node;
    return findNode(node.left, key) || findNode(node.right, key);
  }

  function frameLabel(keys) {
    return keys.map((key) => {
      const node = findNode(tree.root, key);
      if (!node) return key;
      if (node.isRoot) return 'root';
      if (node.kind === 'chunk') return 'chunk ' + node.startChunk;
      return 'parent ' + node.startChunk + '–' + node.endChunk;
    }).join(', ');
  }

  function viewNode(node, chunkIndex, full) {
    const copy = {
      key: node.key,
      kind: node.kind,
      startChunk: node.startChunk,
      endChunk: node.endChunk,
      byteStart: node.byteStart,
      byteEnd: node.byteEnd,
      cvHex: node.cvHex,
      hash: node.hash,
      isRoot: node.isRoot,
      flags: blake.displayFlags(node),
      outputFlags: blake.shownFlags(node),
      blocks: node.blocks,
      blockLen: node.blockLen,
      counter: node.counter,
      left: null,
      right: null,
      summary: false,
    };
    const onPath = chunkIndex >= node.startChunk && chunkIndex <= node.endChunk;
    const expand = !!node.left && (full || onPath);
    if (!expand) {
      if (node.left && !full) {
        copy.summary = true;
        copy.kind = 'summary';
      }
      return copy;
    }
    copy.left = viewNode(node.left, chunkIndex, full);
    copy.right = viewNode(node.right, chunkIndex, full);
    return copy;
  }

  function layout(root) {
    const leaves = [];
    function placeX(node) {
      if (!node.left) {
        node.x = leaves.length;
        leaves.push(node);
        return;
      }
      placeX(node.left);
      placeX(node.right);
      node.x = (node.left.x + node.right.x) / 2;
    }
    placeX(root);
    const maxD = blake.nodeDepth(root);
    function placeY(node) {
      node.y = maxD - blake.nodeDepth(node);
      if (node.left) {
        placeY(node.left);
        placeY(node.right);
      }
    }
    placeY(root);
    return {leaves: leaves.length, depth: maxD};
  }

  function shortHex(hex) {
    if (!hex) return '';
    if (hex.length <= 16) return hex;
    return hex.slice(0, 8) + '…' + hex.slice(-4);
  }

  function rangeText(node) {
    const total = activeBytes().length;
    if (total === 0 && node.startChunk === 0 && node.endChunk === 0) return '0 bytes';
    const start = node.byteStart != null ? node.byteStart : node.startChunk * blake.CHUNK_LEN;
    const end = node.byteEnd != null ? node.byteEnd : Math.min(total, (node.endChunk + 1) * blake.CHUNK_LEN);
    const count = Math.max(0, end - start);
    if (!count) return '0 bytes';
    return 'bytes ' + start + '–' + (end - 1) + ' · ' + count;
  }

  function litKeys() {
    if (cursor < 0) return null;
    const all = frames();
    const set = new Set();
    for (let i = 0; i <= cursor && i < all.length; i++) {
      all[i].forEach((key) => set.add(key));
    }
    return set;
  }

  function el(name, attrs) {
    const node = document.createElementNS(svgNS, name);
    if (attrs) {
      Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    }
    return node;
  }

  function draw() {
    const full = blake.chunkCount(tree) <= FULL_TREE;
    viewRoot = viewNode(tree.root, watchedChunk(), full);
    const metrics = layout(viewRoot);
    nodeByKey = new Map();
    blake.collect(viewRoot).forEach((node) => nodeByKey.set(node.key, node));

    const colW = metrics.leaves <= 2 ? 220 : metrics.leaves <= 4 ? 160 : metrics.leaves <= 8 ? 112 : 84;
    const rowH = 92;
    const nodeW = Math.min(148, colW - 18);
    const nodeH = 48;
    const width = Math.max(280, 36 + metrics.leaves * colW);
    const height = 28 + (metrics.depth + 1) * rowH;
    treeEl.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    treeEl.setAttribute('width', String(width));
    treeEl.setAttribute('height', String(height));
    treeEl.replaceChildren();

    const lit = litKeys();
    const originX = 18 + (colW - nodeW) / 2;

    function point(node) {
      return {
        x: originX + node.x * colW,
        y: 16 + node.y * rowH,
      };
    }

    function drawEdges(node) {
      if (!node.left) return;
      const from = point(node);
      [node.left, node.right].forEach((child) => {
        const to = point(child);
        const changedEdge = changed.has(node.key) && changed.has(child.key);
        treeEl.appendChild(el('line', {
          class: 'edge' + (changedEdge ? ' changed' : ''),
          x1: from.x + nodeW / 2,
          y1: from.y + nodeH,
          x2: to.x + nodeW / 2,
          y2: to.y,
        }));
        drawEdges(child);
      });
    }
    drawEdges(viewRoot);

    function drawNode(node) {
      const at = point(node);
      const group = el('g', {
        class: 'node'
          + (node.kind === 'parent' ? ' parent' : '')
          + (node.isRoot ? ' root' : '')
          + (node.summary ? ' summary' : '')
          + (changed.has(node.key) ? ' changed' : '')
          + (lit && !lit.has(node.key) ? ' dim' : ''),
        tabindex: '0',
        role: 'button',
        'data-key': node.key,
      });
      const value = node.isRoot ? node.hash : node.cvHex;
      const title = (node.summary ? 'Other chunks ' : node.isRoot ? 'Root ' : node.kind === 'chunk' ? 'Chunk ' + node.startChunk + ' ' : 'Parent ')
        + blake.flagNames(node.flags).join(', ');
      group.setAttribute('aria-label', title + ', ' + value);
      group.appendChild(el('rect', {
        x: at.x, y: at.y, width: nodeW, height: nodeH, rx: 6,
      }));
      const name = node.summary
        ? 'chunks ' + node.startChunk + '–' + node.endChunk
        : node.isRoot
          ? 'root'
          : node.kind === 'chunk'
            ? 'chunk ' + node.startChunk
            : 'parent ' + node.startChunk + '–' + node.endChunk;
      const label = el('text', {x: at.x + 8, y: at.y + 18});
      label.textContent = name;
      const hex = el('text', {x: at.x + 8, y: at.y + 34});
      hex.textContent = shortHex(value);
      group.appendChild(label);
      group.appendChild(hex);
      group.addEventListener('click', () => select(node.key));
      group.addEventListener('focus', () => select(node.key, true));
      group.addEventListener('mouseenter', () => select(node.key, true));
      treeEl.appendChild(group);
      if (node.left) {
        drawNode(node.left);
        drawNode(node.right);
      }
    }
    drawNode(viewRoot);

    const count = blake.chunkCount(tree);
    const parents = blake.collect(tree.root).length - count;
    treeSummary.textContent = full
      ? count + (count === 1 ? ' chunk' : ' chunks') + ', ' + parents + (parents === 1 ? ' parent' : ' parents') + '.'
      : count + ' chunks. The drawing keeps the path from byte ' + flipIndex + ' and folds the other branches. The digest is the whole input.';
  }

  function renderChunks() {
    chunksEl.replaceChildren();
    const chunkNodes = blake.leaves(tree.root);
    const limit = 64;
    chunkNodes.slice(0, limit).forEach((node) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chunk' + (changed.has(node.key) ? ' changed' : '');
      if (selectedKey === node.key) button.setAttribute('aria-current', 'true');
      const name = document.createElement('b');
      name.textContent = 'Chunk ' + node.startChunk;
      const hex = document.createElement('span');
      hex.textContent = shortHex(node.cvHex);
      button.append(name, hex);
      button.addEventListener('click', () => select(node.key));
      chunksEl.appendChild(button);
    });
    if (chunkNodes.length > limit) {
      const more = document.createElement('p');
      more.className = 'fine';
      more.textContent = 'Showing 64 of ' + chunkNodes.length + ' chunks.';
      chunksEl.appendChild(more);
    }
  }

  function renderOrder() {
    orderEl.replaceChildren();
    const list = frames();
    list.forEach((keys, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = (mode === 'parallel' ? 'Wave ' + (index + 1) + ': ' : '') + frameLabel(keys);
      if (cursor === index) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => {
        stop();
        cursor = index;
        paint();
      });
      item.appendChild(button);
      orderEl.appendChild(item);
    });
  }

  function renderDetail() {
    const node = selectedKey ? findNode(tree.root, selectedKey) : tree.root;
    if (!node) return;
    detailEl.replaceChildren();
    const title = document.createElement('p');
    title.textContent = node.isRoot
      ? 'Root'
      : node.kind === 'chunk'
        ? 'Chunk ' + node.startChunk
        : 'Parent of chunks ' + node.startChunk + '–' + node.endChunk;
    const range = document.createElement('p');
    range.textContent = rangeText(node);
    const flags = document.createElement('div');
    flags.className = 'flags';
    blake.flagNames(blake.displayFlags(node)).forEach((name) => {
      const chip = document.createElement('span');
      chip.className = 'flag';
      chip.textContent = name;
      flags.appendChild(chip);
    });
    detailEl.append(title, range, flags);
    if (node.isRoot) {
      const hash = document.createElement('p');
      hash.className = 'mono';
      hash.textContent = 'Hash, ROOT set: ' + node.hash;
      const cv = document.createElement('p');
      cv.className = 'mono';
      cv.textContent = 'Chaining value, ROOT clear: ' + node.cvHex;
      detailEl.append(hash, cv);
    } else {
      const cv = document.createElement('p');
      cv.className = 'mono';
      cv.textContent = 'Chaining value: ' + node.cvHex;
      detailEl.appendChild(cv);
    }
    if (changed.has(node.key)) {
      const moved = document.createElement('p');
      moved.textContent = 'This node changed when the bit flipped.';
      detailEl.appendChild(moved);
    }
    if (node.blocks && node.blocks.length) {
      const blocks = document.createElement('p');
      blocks.textContent = node.blocks.map((block) => {
        return 'Block ' + block.index + ' · ' + block.blockLen + ' bytes · ' + (blake.flagNames(block.flags).join(', ') || 'none');
      }).join('  ');
      detailEl.appendChild(blocks);
    } else if (node.kind === 'parent') {
      const parent = document.createElement('p');
      parent.textContent = 'Parent block is the two child chaining values, 64 bytes, counter 0.';
      detailEl.appendChild(parent);
    }
  }

  function paint() {
    const shown = activeBytes();
    hashEl.textContent = tree.root.hash;
    const chunks = blake.chunkCount(tree);
    let size = shown.length + ' bytes · ' + chunks + (chunks === 1 ? ' chunk' : ' chunks');
    if (source === 'text') size = textInput.value.length + ' characters · ' + size;
    if (source === 'file' && fileName) size = fileName + ' · ' + size;
    if (flipped && bytes.length) {
      const bits = blake.hammingHex(baseTree.root.hash, tree.root.hash);
      size += ' · root differs in ' + bits + ' of 256 bits · ' + changed.size + ' nodes changed';
    } else if (source === 'pattern') {
      const known = blake.VECTORS.find((row) => row[0] === bytes.length && row[1] === tree.root.hash);
      if (known) size += ' · matches the official vector';
    }
    sizeLine.textContent = size;
    draw();
    renderChunks();
    renderOrder();
    renderDetail();
    const list = frames();
    if (cursor < 0) stepCaption.textContent = 'All ' + list.length + ' steps are showing.';
    else stepCaption.textContent = 'Step ' + (cursor + 1) + ' of ' + list.length + ' · ' + frameLabel(list[cursor] || []);
  }

  function select(key, quiet) {
    selectedKey = key;
    if (!quiet) {
      const node = treeEl.querySelector('[data-key="' + key + '"]');
      if (node) node.focus();
    }
    renderDetail();
    renderChunks();
  }

  function rebuild() {
    stop();
    cursor = -1;
    baseTree = blake.build(bytes);
    tree = blake.build(activeBytes());
    changed = flipped && bytes.length ? new Set(blake.changedKeys(baseTree, tree)) : new Set();
    if (!selectedKey || !findNode(tree.root, selectedKey)) selectedKey = tree.root.key;
    const maxByte = Math.max(0, bytes.length - 1);
    byteInput.max = String(maxByte);
    if (flipIndex > maxByte) flipIndex = maxByte;
    byteInput.value = String(bytes.length ? flipIndex : 0);
    byteOut.textContent = bytes.length ? String(flipIndex) : '—';
    byteInput.disabled = bytes.length === 0;
    flipBtn.disabled = bytes.length === 0;
    flipBtn.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    flipNote.textContent = !bytes.length
      ? 'Type or drop something to flip a bit.'
      : flipped
        ? 'Low bit of byte ' + blake.flipBit(bytes, flipIndex).index + ' is flipped. Highlighted nodes are the ones whose value moved. Press the button again to put it back.'
        : 'Flips the low bit of byte ' + flipIndex + ', then hashes again.';
    paint();
  }

  function setSource(next) {
    source = next;
    modePattern.setAttribute('aria-pressed', next === 'pattern' ? 'true' : 'false');
    modeText.setAttribute('aria-pressed', next === 'text' ? 'true' : 'false');
    modeFile.setAttribute('aria-pressed', next === 'file' ? 'true' : 'false');
    sourceMeta.textContent = next === 'pattern' ? 'Pattern' : next === 'text' ? 'Text' : 'File';
  }

  function usePattern(len) {
    setSource('pattern');
    flipped = false;
    bytes = blake.pattern(len);
    lengthOut.textContent = len + ' bytes';
    rebuild();
  }

  function useText() {
    setSource('text');
    flipped = false;
    bytes = new TextEncoder().encode(textInput.value);
    rebuild();
  }

  function useFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      fileNote.textContent = 'This page hashes up to 1 MB, in this tab. That file is larger.';
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      setSource('file');
      flipped = false;
      fileName = file.name;
      bytes = new Uint8Array(reader.result);
      fileNote.textContent = file.name + ' · ' + file.size + ' bytes. Nothing was uploaded.';
      rebuild();
    };
    reader.readAsArrayBuffer(file);
  }

  modePattern.addEventListener('click', () => usePattern(Number(lengthInput.value)));
  modeText.addEventListener('click', useText);
  modeFile.addEventListener('click', () => {
    if (fileInput.files && fileInput.files[0]) useFile(fileInput.files[0]);
    else fileInput.click();
  });
  lengthInput.addEventListener('input', () => usePattern(Number(lengthInput.value)));
  textInput.addEventListener('input', useText);
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) useFile(fileInput.files[0]);
  });

  ['dragenter', 'dragover'].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add('hot');
    });
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('hot'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    drop.classList.remove('hot');
    if (event.dataTransfer.files[0]) useFile(event.dataTransfer.files[0]);
  });
  document.addEventListener('dragover', (event) => {
    if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    drop.classList.remove('hot');
    useFile(event.dataTransfer.files[0]);
  });

  copyBtn.addEventListener('click', async () => {
    const value = hashEl.textContent;
    try {
      await navigator.clipboard.writeText(value);
      copyBtn.textContent = 'Copied';
    } catch (err) {
      copyBtn.textContent = 'Select the digest';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
  });

  flipBtn.addEventListener('click', () => {
    if (!bytes.length) return;
    flipped = !flipped;
    rebuild();
  });
  byteInput.addEventListener('input', () => {
    flipIndex = Number(byteInput.value);
    byteOut.textContent = String(flipIndex);
    if (flipped) rebuild();
    else flipNote.textContent = 'Flips the low bit of byte ' + flipIndex + ', then hashes again.';
  });

  function setMode(next) {
    mode = next;
    cursor = -1;
    stop();
    modeParallel.setAttribute('aria-pressed', next === 'parallel' ? 'true' : 'false');
    modeSerial.setAttribute('aria-pressed', next === 'serial' ? 'true' : 'false');
    walkNote.textContent = next === 'parallel'
      ? 'Every chunk can be hashed at the same time. Parents wait until both children exist.'
      : 'One thread hashes the chunks in order and merges a subtree as soon as it is full. BLAKE3-Servil 0.9 keeps that path in the core, with no thread pool.';
    paint();
  }
  modeParallel.addEventListener('click', () => setMode('parallel'));
  modeSerial.addEventListener('click', () => setMode('serial'));

  function stepTo(next) {
    stop();
    const list = frames();
    if (!list.length) return;
    if (next < 0) cursor = -1;
    else if (next >= list.length) cursor = list.length - 1;
    else cursor = next;
    paint();
  }
  prevBtn.addEventListener('click', () => stepTo(cursor < 0 ? frames().length - 1 : cursor - 1));
  nextBtn.addEventListener('click', () => stepTo(cursor < 0 ? 0 : cursor + 1));
  playBtn.addEventListener('click', () => {
    if (timer) {
      stop();
      return;
    }
    const list = frames();
    if (!list.length) return;
    if (reduceMotion.matches) {
      cursor = list.length - 1;
      paint();
      return;
    }
    cursor = -1;
    playBtn.textContent = 'Pause';
    const delay = mode === 'parallel' ? 560 : 340;
    function tick() {
      cursor += 1;
      paint();
      if (cursor >= list.length - 1) {
        stop();
        return;
      }
      timer = setTimeout(tick, delay);
    }
    tick();
  });

  lengthOut.textContent = '4096 bytes';
  usePattern(4096);
})();
