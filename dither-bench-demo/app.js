(function () {
  const D = window.DitherBench;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    source: 'sphere',
    mode: 'bayer4',
    cellIndex: 2,
    palette: 'newsprint',
    time: 0,
    playing: false,
    pin: null,
    hover: null,
    painted: null,
  };

  const plate = document.getElementById('plate');
  const ctx = plate.getContext('2d', { willReadFrequently: false });
  const frame = document.getElementById('frame');
  const reticule = document.getElementById('reticule');
  const sources = document.getElementById('sources');
  const modes = document.getElementById('modes');
  const palettes = document.getElementById('palettes');
  const cell = document.getElementById('cell');
  const cellReadout = document.getElementById('cell-readout');
  const play = document.getElementById('play');
  const step = document.getElementById('step');
  const unpin = document.getElementById('unpin');
  const inspect = document.getElementById('inspect');
  const matrix = document.getElementById('matrix');
  const matrixNote = document.getElementById('matrix-note');
  const matrixHeading = document.getElementById('matrix-heading');
  const plateMeta = document.getElementById('plate-meta');
  const swatchInk = document.getElementById('swatch-ink');
  const swatchPaper = document.getElementById('swatch-paper');
  const legendInk = document.getElementById('legend-ink');
  const legendPaper = document.getElementById('legend-paper');

  let raf = 0;
  let last = 0;

  function cellSize() {
    return D.CELL_SIZES[state.cellIndex];
  }

  function grid() {
    return D.gridFor(cellSize());
  }

  function rgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function buttonRow(root, items, current, onPick) {
    root.replaceChildren();
    items.forEach(function (item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label || item.name;
      button.setAttribute('aria-pressed', item.id === current ? 'true' : 'false');
      button.addEventListener('click', function () { onPick(item.id); });
      root.appendChild(button);
    });
  }

  function paintPalettes() {
    palettes.replaceChildren();
    D.PALETTES.forEach(function (item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', item.id === state.palette ? 'true' : 'false');
      const name = document.createElement('span');
      name.textContent = item.name;
      const chips = document.createElement('span');
      chips.className = 'chips';
      [item.ink, item.paper].forEach(function (hex) {
        const chip = document.createElement('i');
        chip.style.background = hex;
        chips.appendChild(chip);
      });
      button.append(name, chips);
      button.addEventListener('click', function () {
        state.palette = item.id;
        paintPalettes();
        draw();
        showLegend();
      });
      palettes.appendChild(button);
    });
  }

  function showLegend() {
    const colors = D.palette(state.palette);
    swatchInk.style.background = colors.ink;
    swatchPaper.style.background = colors.paper;
    legendInk.textContent = 'Mark ' + colors.ink + ', where the sample loses';
    legendPaper.textContent = 'Ground ' + colors.paper + ', where the sample wins';
  }

  function renderMatrix() {
    const info = D.modeInfo(state.mode);
    const focus = state.pin || state.hover;
    matrix.className = 'matrix';
    matrix.style.gridTemplateColumns = '';
    matrix.replaceChildren();
    matrixHeading.textContent = 'Threshold matrix';
    if (info.kind === 'bayer') {
      matrixNote.textContent = 'Bayer ' + info.n + 'x' + info.n + '. The integer is the matrix value. Under it is the threshold, (value + 1/2) / ' + (info.n * info.n) + '. The tile repeats across the plate. Move over a cell and the dark square is the entry that cell reads.';
      matrix.style.gridTemplateColumns = 'repeat(' + info.n + ', minmax(0, 1fr))';
      info.matrix.forEach(function (row, y) {
        row.forEach(function (value, x) {
          const span = document.createElement('span');
          const strong = document.createElement('b');
          strong.textContent = String(value);
          const small = document.createElement('small');
          small.textContent = D.fmt((value + 0.5) / (info.n * info.n));
          span.append(strong, small);
          if (focus && (focus.y % info.n) === y && (focus.x % info.n) === x) span.className = 'hot';
          matrix.appendChild(span);
        });
      });
      return;
    }
    if (info.kind === 'threshold') {
      matrixNote.textContent = 'No tile. Every cell is compared with 1/2.';
      matrix.style.gridTemplateColumns = '72px';
      const span = document.createElement('span');
      span.className = 'hot';
      const strong = document.createElement('b');
      strong.textContent = '1/2';
      span.appendChild(strong);
      matrix.appendChild(span);
      return;
    }
    if (info.kind === 'random') {
      matrixHeading.textContent = 'No matrix';
      matrixNote.textContent = 'Random has no repeating tile. The number is this cell’s own hash for the current frame. Move to another cell and it changes.';
      matrix.style.gridTemplateColumns = '120px';
      const span = document.createElement('span');
      span.className = 'hot';
      const strong = document.createElement('b');
      strong.textContent = focus && state.painted ? D.fmt(state.painted.cells[focus.y * state.painted.width + focus.x].threshold) : '—';
      const small = document.createElement('small');
      small.textContent = focus ? 'x ' + focus.x + ', y ' + focus.y : 'no cell';
      span.append(strong, small);
      matrix.appendChild(span);
      return;
    }
    matrixHeading.textContent = 'Error kernel';
    matrixNote.textContent = 'Floyd–Steinberg still marks a cell against 1/2. The star is the cell being decided. The fractions are the leftover sent onward. There is no threshold tile.';
    matrix.className = 'matrix kernel';
    const labels = [
      { text: '', sub: '' },
      { text: '*', sub: 'cell' },
      { text: '7/16', sub: 'right' },
      { text: '3/16', sub: 'down-left' },
      { text: '5/16', sub: 'down' },
      { text: '1/16', sub: 'down-right' },
    ];
    labels.forEach(function (label, index) {
      const span = document.createElement('span');
      if (index === 1) span.className = 'hot';
      const strong = document.createElement('b');
      strong.textContent = label.text || ' ';
      const small = document.createElement('small');
      small.textContent = label.sub;
      span.append(strong, small);
      matrix.appendChild(span);
    });
  }

  function draw() {
    const size = grid();
    const samples = D.samplesFrom(state.source, size.width, size.height, state.time);
    const frameIndex = Math.floor(state.time * 8);
    const painted = D.paint(samples, size.width, size.height, state.mode, frameIndex, 1);
    state.painted = { cells: painted.cells, width: size.width, height: size.height };
    if (plate.width !== size.width) plate.width = size.width;
    if (plate.height !== size.height) plate.height = size.height;
    const colors = D.palette(state.palette);
    const ink = rgb(colors.ink);
    const paper = rgb(colors.paper);
    const image = ctx.createImageData(size.width, size.height);
    const data = image.data;
    painted.cells.forEach(function (item, index) {
      const rgbTone = item.tone === 'paper' ? paper : ink;
      const pixel = index * 4;
      data[pixel] = rgbTone[0];
      data[pixel + 1] = rgbTone[1];
      data[pixel + 2] = rgbTone[2];
      data[pixel + 3] = 255;
    });
    ctx.putImageData(image, 0, 0);
    const source = D.SOURCES.find(function (item) { return item.id === state.source; });
    const mode = D.MODES.find(function (item) { return item.id === state.mode; });
    plateMeta.textContent = source.label + ' · ' + mode.label + ' · ' + size.width + '×' + size.height + ' cells · ' + cellSize() + 'px';
    placeReticule();
    renderMatrix();
  }

  function placeReticule() {
    const focus = state.pin || state.hover;
    if (!focus || !state.painted) {
      reticule.hidden = true;
      return;
    }
    reticule.hidden = false;
    reticule.style.left = (focus.x / state.painted.width * 100) + '%';
    reticule.style.top = (focus.y / state.painted.height * 100) + '%';
    reticule.style.width = (100 / state.painted.width) + '%';
    reticule.style.height = (100 / state.painted.height) + '%';
  }

  function describe(point, pinned) {
    if (!point || !state.painted) {
      inspect.textContent = 'Hover the plate, or focus it and use the arrow keys.';
      return;
    }
    const cellData = state.painted.cells[point.y * state.painted.width + point.x];
    const prefix = (pinned ? 'Pinned' : 'Looking') + ' at cell ' + point.x + ', ' + point.y + '. ';
    inspect.textContent = prefix + D.explain(cellData, state.mode);
  }

  function showFocus() {
    unpin.hidden = !state.pin;
    describe(state.pin || state.hover, !!state.pin);
    placeReticule();
    renderMatrix();
  }

  function pointFromEvent(event) {
    const rect = plate.getBoundingClientRect();
    if (!state.painted || rect.width === 0) return null;
    const x = Math.floor((event.clientX - rect.left) / rect.width * state.painted.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * state.painted.height);
    if (x < 0 || y < 0 || x >= state.painted.width || y >= state.painted.height) return null;
    return { x: x, y: y };
  }

  function moving() {
    const source = D.SOURCES.find(function (item) { return item.id === state.source; });
    return source.moves || state.mode === 'random';
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    state.time += dt;
    draw();
    showFocus();
    raf = requestAnimationFrame(tick);
  }

  function ensureLoop() {
    play.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    play.textContent = state.playing ? 'Pause' : 'Play';
    if (state.playing) {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
      return;
    }
    stopLoop();
    draw();
    showFocus();
  }

  function setPlaying(next) {
    state.playing = next;
    ensureLoop();
  }

  function followMotion() {
    if (!reduce && moving()) setPlaying(true);
    else ensureLoop();
  }

  function bindSources() {
    buttonRow(sources, D.SOURCES, state.source, function (id) {
      state.source = id;
      bindSources();
      followMotion();
    });
  }

  function bindModes() {
    buttonRow(modes, D.MODES, state.mode, function (id) {
      state.mode = id;
      bindModes();
      followMotion();
    });
  }

  bindSources();
  bindModes();
  paintPalettes();
  showLegend();

  cell.addEventListener('input', function () {
    state.cellIndex = Number(cell.value);
    const size = cellSize();
    cellReadout.textContent = String(size);
    cell.setAttribute('aria-valuetext', size + ' pixels');
    state.pin = null;
    state.hover = null;
    ensureLoop();
  });

  play.addEventListener('click', function () {
    setPlaying(!state.playing);
  });

  step.addEventListener('click', function () {
    state.playing = false;
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Play';
    state.time += 0.125;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    draw();
    showFocus();
  });

  plate.addEventListener('pointermove', function (event) {
    if (state.pin) return;
    state.hover = pointFromEvent(event);
    showFocus();
  });

  plate.addEventListener('pointerleave', function () {
    if (state.pin) return;
    state.hover = null;
    showFocus();
  });

  plate.addEventListener('click', function (event) {
    const point = pointFromEvent(event);
    if (!point) return;
    state.pin = point;
    state.hover = null;
    showFocus();
  });

  unpin.addEventListener('click', function () {
    state.pin = null;
    showFocus();
  });

  frame.addEventListener('keydown', function (event) {
    const size = state.painted;
    if (!size) return;
    const key = event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Escape') return;
    event.preventDefault();
    if (key === 'Escape') {
      state.pin = null;
      showFocus();
      return;
    }
    const current = state.pin || { x: 0, y: 0 };
    let x = current.x;
    let y = current.y;
    if (key === 'ArrowLeft') x -= 1;
    if (key === 'ArrowRight') x += 1;
    if (key === 'ArrowUp') y -= 1;
    if (key === 'ArrowDown') y += 1;
    state.pin = {
      x: Math.max(0, Math.min(size.width - 1, x)),
      y: Math.max(0, Math.min(size.height - 1, y)),
    };
    showFocus();
  });

  cellReadout.textContent = String(cellSize());
  cell.setAttribute('aria-valuetext', cellSize() + ' pixels');
  if (!reduce) state.playing = false;
  play.textContent = 'Play';
  ensureLoop();
})();
