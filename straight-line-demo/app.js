(function () {
  const L = window.StraightLines;
  const canvas = document.getElementById('plate');
  const frame = document.getElementById('frame');
  const meta = document.getElementById('plate-meta');
  const note = document.getElementById('note');
  const presets = document.getElementById('presets');
  const angleInput = document.getElementById('angle');
  const spacingInput = document.getElementById('spacing');
  const weightInput = document.getElementById('weight');
  const angleOut = document.getElementById('angle-out');
  const spacingOut = document.getElementById('spacing-out');
  const weightOut = document.getElementById('weight-out');
  const clearBtn = document.getElementById('clear');
  const blockBtn = document.getElementById('block');

  const labels = { portrait: 'Portrait', mountains: 'Mountains', spiral: 'Spiral' };
  let preset = 'portrait';
  let seed = 7;
  let block = false;
  let drawing = null;
  let extras = [];
  let pending = false;

  function readHash() {
    const match = /^#(portrait|mountains|spiral)-(\d+)$/.exec(location.hash);
    if (!match) return;
    preset = match[1];
    seed = Math.max(1, Number(match[2]) || 1);
  }

  function writeHash() {
    const next = '#' + preset + '-' + seed;
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  L.PRESETS.forEach(function (item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.dataset.id = item.id;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', function () { select(item.id); });
    presets.appendChild(button);
  });

  function select(id) {
    preset = id;
    extras = [];
    drawing = null;
    syncPresets();
    writeHash();
    requestDraw();
  }

  function syncPresets() {
    Array.from(presets.children).forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.id === preset ? 'true' : 'false');
    });
  }

  function readouts() {
    angleOut.textContent = angleInput.value + '°';
    spacingOut.textContent = spacingInput.value;
    weightOut.textContent = Number(weightInput.value).toFixed(1);
    angleInput.setAttribute('aria-valuetext', angleInput.value + ' degrees');
    spacingInput.setAttribute('aria-valuetext', spacingInput.value);
    weightInput.setAttribute('aria-valuetext', weightInput.value);
  }

  function group(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fit(view, cssW, cssH) {
    const s = Math.min(cssW / view.w, cssH / view.h);
    return {
      s: s,
      ox: (cssW - view.w * s) / 2,
      oy: (cssH - view.h * s) / 2,
    };
  }

  let viewFit = fit(L.VIEW, 1, 1);

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return [(x - viewFit.ox) / viewFit.s, (y - viewFit.oy) / viewFit.s];
  }

  function strokeSegs(ctx, segs, width, color) {
    if (!segs.length) return;
    ctx.beginPath();
    segs.forEach(function (seg) {
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function draw() {
    const cssW = canvas.clientWidth || frame.clientWidth;
    const cssH = canvas.clientHeight || frame.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const scene = L.buildScene(preset, seed);
    const segs = L.linesFor(scene, {
      angle: Number(angleInput.value),
      spacing: Number(spacingInput.value),
      extraRegions: extras,
    });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    viewFit = fit(scene.view, cssW, cssH);
    ctx.save();
    ctx.translate(viewFit.ox, viewFit.oy);
    ctx.scale(viewFit.s, viewFit.s);
    ctx.fillStyle = '#f6f1e6';
    ctx.fillRect(0, 0, scene.view.w, scene.view.h);
    ctx.beginPath();
    ctx.rect(0, 0, scene.view.w, scene.view.h);
    ctx.clip();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    const weight = Number(weightInput.value);
    strokeSegs(ctx, segs.filter(function (s) { return s.role === 'hatch'; }), weight, 'rgba(28, 25, 23, 0.8)');
    strokeSegs(ctx, segs.filter(function (s) { return s.role === 'edge'; }), Math.max(0.8, weight * 1.05), 'rgba(28, 25, 23, 0.92)');
    if (drawing && drawing.length > 1) {
      ctx.beginPath();
      ctx.moveTo(drawing[0][0], drawing[0][1]);
      for (let i = 1; i < drawing.length; i++) ctx.lineTo(drawing[i][0], drawing[i][1]);
      ctx.strokeStyle = 'rgba(28, 25, 23, 0.75)';
      ctx.lineWidth = weight;
      ctx.stroke();
    }
    ctx.restore();
    const hatch = segs.filter(function (s) { return s.role === 'hatch'; }).length;
    meta.textContent = labels[preset] + ' · seed ' + seed + ' · ' + group(segs.length) + ' straight strokes, ' + group(hatch) + ' of them hatch';
  }

  function requestDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      readouts();
      draw();
    });
  }

  ['input', 'change'].forEach(function (type) {
    angleInput.addEventListener(type, requestDraw);
    spacingInput.addEventListener(type, requestDraw);
    weightInput.addEventListener(type, requestDraw);
  });

  document.getElementById('reroll').addEventListener('click', function () {
    seed = 1 + Math.floor(Math.random() * 9000);
    writeHash();
    requestDraw();
  });

  blockBtn.addEventListener('click', function () {
    block = !block;
    blockBtn.setAttribute('aria-pressed', block ? 'true' : 'false');
    frame.classList.toggle('inking', block);
    note.textContent = block
      ? 'Drag on the sheet. Release to close the polyline and hatch it.'
      : 'Angle turns the hatch. Spacing opens the tone. Weight is the stroke.';
  });

  clearBtn.addEventListener('click', function () {
    extras = [];
    drawing = null;
    syncPresets();
    requestDraw();
  });

  canvas.addEventListener('pointerdown', function (event) {
    if (!block) return;
    canvas.setPointerCapture(event.pointerId);
    drawing = [toWorld(event)];
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!drawing) return;
    const point = toWorld(event);
    const last = drawing[drawing.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 14) {
      drawing.push(point);
      requestDraw();
    }
  });

  function endDraw(event) {
    if (!drawing) return;
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const pts = drawing.slice();
    drawing = null;
    if (pts.length >= 3) {
      extras.push({
        id: 'block',
        tone: 0.62,
        edge: true,
        points: pts,
      });
    }
    syncPresets();
    requestDraw();
  }

  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);
  window.addEventListener('pointerup', endDraw);
  window.addEventListener('pointercancel', endDraw);

  window.addEventListener('hashchange', function () {
    readHash();
    syncPresets();
    requestDraw();
  });

  window.addEventListener('resize', requestDraw);
  readHash();
  syncPresets();
  readouts();
  draw();
})();
