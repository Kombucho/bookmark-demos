(function () {
  const C = window.BoundedCheck;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    caseId: 'bounds',
    expression: 'index <= length',
    lengthGuard: false,
    copyGuard: false,
    capacity: 10,
    shown: { bounds: false, length: false, copy: false },
    boundsProof: null,
    lengthProof: null,
    copyProof: null,
    revealed: 256,
    pin: null,
  };
  let raf = 0;

  const grid = document.getElementById('grid');
  const gridCtx = grid.getContext('2d');
  const strip = document.getElementById('strip');
  const stripCtx = strip.getContext('2d');

  function format(n) {
    return n.toLocaleString('en-US');
  }

  function testsFor() {
    if (state.caseId === 'bounds') return C.runBoundsTests(state.expression);
    if (state.caseId === 'length') return C.runLengthTests(state.lengthGuard);
    return C.runCopyTests(state.copyGuard);
  }

  function proofFor() {
    if (state.caseId === 'bounds') return state.boundsProof;
    if (state.caseId === 'length') return state.lengthProof;
    return state.copyProof;
  }

  function planeFor() {
    if (!state.shown[state.caseId]) return null;
    if (state.caseId === 'bounds') return state.boundsProof && state.boundsProof.plane;
    if (state.caseId === 'length') return state.lengthProof && state.lengthProof.plane;
    if (!state.copyProof || !state.copyProof.ok) return null;
    return C.copyPlane(state.capacity, state.copyGuard).plane;
  }

  function visibleRows() {
    if (!state.shown[state.caseId]) return 0;
    if (state.caseId === 'copy') return 256;
    return state.revealed;
  }

  function paintCanvas() {
    const plane = planeFor();
    const rows = visibleRows();
    const image = gridCtx.createImageData(256, 256);
    const data = image.data;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const on = plane && y < rows;
        const pass = on ? plane[y * 256 + x] === 1 : true;
        let r = 244;
        let g = 239;
        let b = 228;
        if (on && pass) { r = 47; g = 138; b = 86; }
        if (on && !pass) { r = 196; g = 75; b = 52; }
        if (x % 32 === 0 || y % 32 === 0) {
          r = Math.max(0, r - 24);
          g = Math.max(0, g - 24);
          b = Math.max(0, b - 24);
        }
        const pixel = (y * 256 + x) * 4;
        data[pixel] = r;
        data[pixel + 1] = g;
        data[pixel + 2] = b;
        data[pixel + 3] = 255;
      }
    }
    gridCtx.putImageData(image, 0, 0);
  }

  function paintStrip() {
    const image = stripCtx.createImageData(256, 18);
    const data = image.data;
    const proof = state.copyProof;
    const colored = state.caseId === 'copy' && state.shown.copy && proof && proof.ok;
    for (let x = 0; x < 256; x += 1) {
      let r = 244;
      let g = 239;
      let b = 228;
      if (colored && proof.strip[x]) { r = 196; g = 75; b = 52; }
      else if (colored) { r = 47; g = 138; b = 86; }
      if (x === state.capacity) { r = 28; g = 25; b = 20; }
      for (let y = 0; y < 18; y += 1) {
        const pixel = (y * 256 + x) * 4;
        data[pixel] = r;
        data[pixel + 1] = g;
        data[pixel + 2] = b;
        data[pixel + 3] = 255;
      }
    }
    stripCtx.putImageData(image, 0, 0);
  }

  function cellAt(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(255, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 256)));
    const y = Math.min(255, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * 256)));
    return { x: x, y: y };
  }

  function describe(x, y) {
    if (state.caseId === 'bounds') {
      const judged = C.judgeBounds(state.expression, x, y);
      if (!judged.ok) return judged.error;
      return 'index ' + x + ', length ' + y + ' returns ' + judged.actual + '. The property wants ' + judged.expected + '. ' + (judged.pass ? 'Holds.' : 'Fails.');
    }
    if (state.caseId === 'length') {
      const judged = C.judgeLength(x, y, state.lengthGuard);
      const actual = judged.actual.ok ? 'ok ' + judged.actual.value : 'refused';
      const expected = judged.expected.ok ? 'ok ' + judged.expected.value : 'refused';
      return 'count ' + x + ' × size ' + y + ' = ' + judged.product + '. Returns ' + actual + '. The property wants ' + expected + '. ' + (judged.pass ? 'Holds.' : 'Fails.');
    }
    const judged = C.judgeCopy(x, y, state.capacity, state.copyGuard);
    return 'start ' + x + ', count ' + y + ', capacity ' + state.capacity + ', sum ' + judged.sum + '. Returns ' + judged.actual + '. The property wants ' + judged.expected + '. ' + (judged.pass ? 'Holds.' : 'Fails.');
  }

  function actualText(row) {
    if (!row.ok) return row.error;
    if (state.caseId === 'length') return row.actual.ok ? 'returns ok ' + row.actual.value : 'refuses';
    return 'returns ' + row.actual;
  }

  function inputText(inputs) {
    return Object.keys(inputs).map(function (key) { return key + ' = ' + inputs[key]; }).join(', ');
  }

  function markers() {
    if (state.caseId === 'bounds') {
      return C.BOUNDS_TESTS.map(function (row) { return { x: row.index, y: row.length }; });
    }
    if (state.caseId === 'length') {
      return C.LENGTH_TESTS.map(function (row) { return { x: row.count, y: row.size }; });
    }
    return C.COPY_TESTS.filter(function (row) { return row.capacity === state.capacity; }).map(function (row) {
      return { x: row.start, y: row.count };
    });
  }

  function placeMarkers() {
    const root = document.getElementById('markers');
    root.replaceChildren();
    markers().forEach(function (mark) {
      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.style.left = ((mark.x + 0.5) / 256) * 100 + '%';
      ring.style.top = ((mark.y + 0.5) / 256) * 100 + '%';
      root.appendChild(ring);
    });
    if (!state.pin) return;
    if (state.caseId === 'copy' && state.pin.capacity !== state.capacity) return;
    const pin = document.createElement('div');
    pin.className = 'pin';
    pin.style.left = ((state.pin.x + 0.5) / 256) * 100 + '%';
    pin.style.top = ((state.pin.y + 0.5) / 256) * 100 + '%';
    root.appendChild(pin);
  }

  function renderTests(rows) {
    const list = document.getElementById('tests');
    const summary = document.getElementById('test-summary');
    list.replaceChildren();
    if (rows.some(function (row) { return row.ok === false; })) {
      summary.textContent = 'The expression could not be checked.';
      return;
    }
    const passed = rows.filter(function (row) { return row.pass; }).length;
    summary.textContent = passed + ' of ' + rows.length + ' pass.';
    rows.forEach(function (row) {
      const item = document.createElement('li');
      const badge = document.createElement('span');
      badge.className = 'badge ' + (row.pass ? 'pass' : 'fail');
      badge.textContent = row.pass ? 'pass' : 'fail';
      const body = document.createElement('div');
      const main = document.createElement('p');
      main.textContent = inputText(row.inputs);
      const detail = document.createElement('p');
      detail.className = 'detail';
      detail.textContent = actualText(row);
      body.append(main, detail);
      item.append(badge, body);
      list.appendChild(item);
    });
  }

  function findingText(proof) {
    if (!proof || !proof.ok || !proof.failed) return 'No counterexample in this domain.';
    if (state.caseId === 'bounds') {
      const row = proof.first;
      return 'index ' + row.index + ', length ' + row.length + ' returns ' + row.actual + '. The property wants ' + row.expected + '.';
    }
    if (state.caseId === 'length') {
      const row = proof.first;
      const got = row.actual.ok ? 'ok ' + row.actual.value : 'a refusal';
      return 'count ' + row.count + ' × size ' + row.size + ' = ' + row.product + ', and the function returned ' + got + '.';
    }
    const row = proof.featured;
    const low = row.sum & 255;
    return 'start ' + row.start + ' + count ' + row.count + ' = ' + row.sum + ' at capacity ' + row.capacity + '. The low byte is ' + low + ', and ' + low + ' <= ' + row.capacity + ', so the function returns ' + row.actual + '. The real sum does not fit.';
  }

  function renderVerdict(rows) {
    const passed = rows.filter(function (row) { return row.ok !== false && row.pass; }).length;
    const lead = rows.some(function (row) { return row.ok === false; })
      ? 'Fix the return line before checking the square.'
      : passed + ' of ' + rows.length + ' unit tests pass.';
    const proof = proofFor();
    const verdict = document.getElementById('verdict');
    const counter = document.getElementById('counter');
    const jump = document.getElementById('jump');
    if (!state.shown[state.caseId] || !proof || !proof.ok) {
      verdict.textContent = lead + ' The rest of the square has not been checked.';
      counter.textContent = 'Nothing yet. The rings are the only inputs the tests look at.';
      jump.hidden = true;
      return;
    }
    if (proof.failed === 0) {
      verdict.textContent = lead + ' ' + format(proof.total) + ' inputs checked. The property holds for every one.';
      counter.textContent = 'No counterexample. Every input in the domain holds.';
      jump.hidden = true;
      return;
    }
    let extra = '';
    if (state.caseId === 'copy') {
      extra = ' At capacity ' + state.capacity + ' this slice has ' + C.copyPlane(state.capacity, state.copyGuard).failed + ' failing cells. Failures begin at capacity 128. Capacities 0 through 127 have none.';
    }
    verdict.textContent = lead + ' ' + format(proof.total) + ' inputs checked. ' + format(proof.failed) + ' fail.' + extra;
    counter.textContent = findingText(proof);
    jump.hidden = false;
  }

  function render() {
    document.querySelectorAll('[role="tab"]').forEach(function (tab) {
      tab.setAttribute('aria-selected', tab.id === 'tab-' + state.caseId ? 'true' : 'false');
    });
    const exprBox = document.getElementById('expr-box');
    const guardLabel = document.getElementById('guard-label');
    const guard = document.getElementById('guard');
    exprBox.hidden = state.caseId !== 'bounds';
    guardLabel.hidden = state.caseId === 'bounds';
    document.getElementById('copy-extra').hidden = state.caseId !== 'copy';
    const expr = document.getElementById('expr');
    if (expr.value !== state.expression) expr.value = state.expression;
    if (state.caseId === 'length') {
      guard.checked = state.lengthGuard;
      document.getElementById('guard-text').textContent = 'Refuse a product that does not fit in one byte';
      document.getElementById('source').textContent = C.lengthSource(state.lengthGuard);
      document.getElementById('property').textContent = 'If the real product fits in a byte, return it. If it does not, refuse. A wrapped byte is a wrong length. There are 65,536 pairs.';
      document.getElementById('axes').textContent = 'Across is count, 0 to 255. Down is size. The rings are the unit tests, all of them in the corner where the product still fits.';
    } else if (state.caseId === 'copy') {
      guard.checked = state.copyGuard;
      document.getElementById('guard-text').textContent = 'Require the real sum to fit, without wrapping';
      document.getElementById('source').textContent = C.copySource(state.copyGuard);
      document.getElementById('property').textContent = 'Allow the copy exactly when start + count <= capacity, using the real sum. There are 16,777,216 triples. The square is one capacity at a time.';
      document.getElementById('axes').textContent = 'Across is start. Down is count. This slice is capacity ' + state.capacity + '.';
      document.getElementById('cap-out').textContent = String(state.capacity);
      const slider = document.getElementById('capacity');
      if (slider.value !== String(state.capacity)) slider.value = String(state.capacity);
    } else {
      document.getElementById('source').textContent = C.boundsSource(state.expression);
      document.getElementById('property').textContent = 'True exactly when index < length. Both are bytes, so the square is 65,536 pairs.';
      document.getElementById('axes').textContent = 'Across is index, 0 to 255. Down is length. A ring is a unit test.';
    }
    const compiled = state.caseId === 'bounds' ? C.compileBounds(state.expression) : { ok: true };
    document.getElementById('expr-error').textContent = compiled.ok ? '' : compiled.error;
    const rows = testsFor();
    renderTests(rows);
    renderVerdict(rows);
    placeMarkers();
    paintCanvas();
    paintStrip();
  }

  function startReveal() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    if (state.caseId === 'copy' || reduce) {
      state.revealed = 256;
      paintCanvas();
      return;
    }
    const started = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - started) / 680);
      state.revealed = Math.max(1, Math.ceil(t * 256));
      paintCanvas();
      if (t < 1) raf = window.requestAnimationFrame(tick);
      else raf = 0;
    }
    raf = window.requestAnimationFrame(tick);
  }

  function selectCase(id) {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    if (state.shown[state.caseId]) state.revealed = 256;
    state.caseId = id;
    state.pin = null;
    render();
  }

  document.getElementById('tab-bounds').addEventListener('click', function () { selectCase('bounds'); });
  document.getElementById('tab-length').addEventListener('click', function () { selectCase('length'); });
  document.getElementById('tab-copy').addEventListener('click', function () { selectCase('copy'); });

  document.getElementById('expr').addEventListener('input', function (event) {
    state.expression = event.target.value;
    state.boundsProof = null;
    state.shown.bounds = false;
    state.pin = null;
    if (state.caseId === 'bounds') render();
  });

  document.getElementById('off-by').addEventListener('click', function () {
    state.expression = 'index <= length';
    state.boundsProof = null;
    state.shown.bounds = false;
    state.pin = null;
    state.caseId = 'bounds';
    render();
  });

  document.getElementById('strict').addEventListener('click', function () {
    state.expression = 'index < length';
    state.boundsProof = null;
    state.shown.bounds = false;
    state.pin = null;
    state.caseId = 'bounds';
    render();
  });

  document.getElementById('guard').addEventListener('change', function (event) {
    if (state.caseId === 'length') {
      state.lengthGuard = event.target.checked;
      state.lengthProof = null;
      state.shown.length = false;
    } else if (state.caseId === 'copy') {
      state.copyGuard = event.target.checked;
      state.copyProof = null;
      state.shown.copy = false;
    }
    state.pin = null;
    render();
  });

  document.getElementById('capacity').addEventListener('input', function (event) {
    state.capacity = Number(event.target.value);
    if (state.pin && state.pin.capacity !== state.capacity) state.pin = null;
    render();
  });

  document.getElementById('prove').addEventListener('click', function () {
    const button = document.getElementById('prove');
    if (state.caseId === 'bounds' && !C.compileBounds(state.expression).ok) {
      state.boundsProof = C.compileBounds(state.expression);
      state.shown.bounds = false;
      render();
      return;
    }
    button.disabled = true;
    button.textContent = 'Checking…';
    window.setTimeout(function () {
      try {
        if (state.caseId === 'bounds') state.boundsProof = C.proveBounds(state.expression);
        else if (state.caseId === 'length') state.lengthProof = C.proveLength(state.lengthGuard);
        else state.copyProof = C.proveCopy(state.copyGuard);
        state.shown[state.caseId] = true;
        state.revealed = 0;
        state.pin = null;
        render();
        startReveal();
      } finally {
        button.disabled = false;
        button.textContent = 'Check every input';
      }
    }, 30);
  });

  document.getElementById('tests-only').addEventListener('click', function () {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    state.shown[state.caseId] = false;
    state.pin = null;
    render();
  });

  document.getElementById('jump').addEventListener('click', function () {
    const proof = proofFor();
    if (!proof || !proof.ok || !proof.failed) return;
    if (state.caseId === 'bounds') {
      state.pin = { x: proof.first.index, y: proof.first.length };
    } else if (state.caseId === 'length') {
      state.pin = { x: proof.first.count, y: proof.first.size };
    } else {
      const row = proof.featured;
      state.capacity = row.capacity;
      state.pin = { x: row.start, y: row.count, capacity: row.capacity };
    }
    render();
    document.getElementById('cell').textContent = describe(state.pin.x, state.pin.y);
  });

  grid.addEventListener('pointermove', function (event) {
    const cell = cellAt(event, grid);
    document.getElementById('cell').textContent = describe(cell.x, cell.y);
  });

  grid.addEventListener('click', function (event) {
    const cell = cellAt(event, grid);
    state.pin = { x: cell.x, y: cell.y, capacity: state.capacity };
    placeMarkers();
    document.getElementById('cell').textContent = describe(cell.x, cell.y);
  });

  strip.addEventListener('click', function (event) {
    const cell = cellAt(event, strip);
    state.capacity = cell.x;
    if (state.pin && state.pin.capacity !== state.capacity) state.pin = null;
    render();
  });

  render();
})();
