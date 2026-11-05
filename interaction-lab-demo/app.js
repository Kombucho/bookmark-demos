(function () {
  const lab = window.InteractionLab;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motion.matches;
  motion.addEventListener('change', function (event) { reduce = event.matches; });

  const textCache = new Map();
  function setText(id, value) {
    if (textCache.get(id) === value) return;
    textCache.set(id, value);
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function fit(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx: ctx, w: rect.width, h: rect.height};
  }

  function bind(canvas, handlers) {
    canvas.addEventListener('pointerdown', function (event) {
      canvas.setPointerCapture(event.pointerId);
      handlers.down(event);
    });
    canvas.addEventListener('pointermove', function (event) { handlers.move(event); });
    canvas.addEventListener('pointerup', function (event) { handlers.up(event); });
    canvas.addEventListener('pointercancel', function (event) { handlers.up(event); });
  }

  function local(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  const spring = {x: 0.86, v: 0, a: 0, k: 32, c: 2.4, m: 1.2, x0: 0, drag: false};
  const ease = {x1: 0.22, y1: 0.85, x2: 0.16, y2: 1.08, t: 0, hold: 0, drag: null};
  const loupe = {mag: 3.2, px: null, py: null};
  const mercury = {particles: null, cohesion: 3.5, drag: false, last: null, w: 0, h: 0};
  const torch = {px: null, py: null, half: 22 * Math.PI / 180};
  const level = {theta: 20 * Math.PI / 180, fill: 0.58, spilled: 0, drops: [], drag: false};

  const LOUPE_LINES = [
    'M = h′ / h',
    'the glass multiplies height',
    'and leaves the page where it is.',
    'a loupe does not move the type.',
    'it only changes the sample',
    'that reaches the eye.',
    'drag. the letters stay put.',
    'the ratio is the whole instrument.',
  ];

  const TORCH_LINES = [
    'The page is dark on purpose.',
    'Intensity follows the cosine',
    'off the axis, then falls with',
    'distance over the reach.',
    'Aim the cone.',
    'The words were already here.',
  ];

  const springCanvas = document.getElementById('spring');
  const easeCanvas = document.getElementById('ease');
  const loupeCanvas = document.getElementById('loupe');
  const mercuryCanvas = document.getElementById('mercury');
  const torchCanvas = document.getElementById('torch');
  const levelCanvas = document.getElementById('level');

  function wireRange(id, outId, format, apply) {
    const input = document.getElementById(id);
    const paint = function () {
      const value = Number(input.value);
      setText(outId, format(value));
      apply(value);
    };
    input.addEventListener('input', paint);
    paint();
  }

  wireRange('k', 'k-out', function (n) { return String(n); }, function (n) { spring.k = n; });
  wireRange('c', 'c-out', function (n) { return n.toFixed(1); }, function (n) { spring.c = n; });
  wireRange('m', 'm-out', function (n) { return n.toFixed(1); }, function (n) { spring.m = n; });
  wireRange('mag', 'mag-out', function (n) { return n.toFixed(1); }, function (n) { loupe.mag = n; });
  wireRange('cohesion', 'cohesion-out', function (n) { return n.toFixed(1); }, function (n) { mercury.cohesion = n; });
  wireRange('half', 'half-out', function (n) { return n + '°'; }, function (n) { torch.half = n * Math.PI / 180; });
  wireRange('tilt', 'tilt-out', function (n) { return n + '°'; }, function (n) {
    if (!level.drag) level.theta = n * Math.PI / 180;
  });

  document.getElementById('refill').addEventListener('click', function () {
    level.fill = 0.58;
    level.spilled = 0;
    level.drops = [];
    level.theta = 20 * Math.PI / 180;
    document.getElementById('tilt').value = '20';
    setText('tilt-out', '20°');
  });

  function springPoint(w, x) {
    const left = 28;
    const travel = (w - 64) * 0.36;
    return left + (w - 56) * 0.48 + x * travel;
  }

  function springWorld(w, px) {
    const left = 28;
    const origin = left + (w - 56) * 0.48;
    const travel = (w - 64) * 0.36;
    return lab.clamp((px - origin) / travel, -1.15, 1.15);
  }

  bind(springCanvas, {
    down: function (event) {
      const p = local(springCanvas, event);
      const box = fit(springCanvas);
      const mx = springPoint(box.w, spring.x);
      if (Math.hypot(p.x - mx, p.y - box.h * 0.52) > 36 && Math.abs(p.y - box.h * 0.52) > 28) return;
      spring.drag = true;
      spring.v = 0;
      spring.x = springWorld(box.w, p.x);
    },
    move: function (event) {
      if (!spring.drag) return;
      const p = local(springCanvas, event);
      const box = fit(springCanvas);
      const next = springWorld(box.w, p.x);
      const now = performance.now();
      const step = Math.max(0.008, (now - (spring.lastT || now)) / 1000);
      spring.v = lab.clamp((next - spring.x) / step, -9, 9);
      spring.x = next;
      spring.lastT = now;
    },
    up: function () {
      if (!spring.drag) return;
      spring.drag = false;
      if (reduce) {
        spring.x = 0;
        spring.v = 0;
      }
    },
  });

  bind(easeCanvas, {
    down: function (event) {
      const p = local(easeCanvas, event);
      const box = fit(easeCanvas);
      const map = easeMap(box.w, box.h);
      const p1 = {x: map.X(ease.x1), y: map.Y(ease.y1)};
      const p2 = {x: map.X(ease.x2), y: map.Y(ease.y2)};
      if (Math.hypot(p.x - p1.x, p.y - p1.y) < 16) ease.drag = 'p1';
      else if (Math.hypot(p.x - p2.x, p.y - p2.y) < 16) ease.drag = 'p2';
      else ease.drag = null;
      if (ease.drag) ease.hold = 1.2;
    },
    move: function (event) {
      if (!ease.drag) return;
      const p = local(easeCanvas, event);
      const box = fit(easeCanvas);
      const map = easeMap(box.w, box.h);
      const u = lab.clamp(map.fromX(p.x), 0.02, 0.98);
      const v = lab.clamp(map.fromY(p.y), -0.25, 1.35);
      if (ease.drag === 'p1') { ease.x1 = u; ease.y1 = v; }
      else { ease.x2 = u; ease.y2 = v; }
    },
    up: function () { ease.drag = null; },
  });

  bind(loupeCanvas, {
    down: function (event) {
      const p = local(loupeCanvas, event);
      loupe.px = p.x;
      loupe.py = p.y;
    },
    move: function (event) {
      if (event.buttons === 0 && event.pointerType === 'mouse' && !event.pressure) {
        const p = local(loupeCanvas, event);
        loupe.px = p.x;
        loupe.py = p.y;
        return;
      }
      if (loupe.px == null && event.buttons === 0) return;
      const p = local(loupeCanvas, event);
      loupe.px = p.x;
      loupe.py = p.y;
    },
    up: function () {},
  });

  bind(mercuryCanvas, {
    down: function (event) {
      const p = local(mercuryCanvas, event);
      mercury.drag = true;
      mercury.last = p;
    },
    move: function (event) {
      if (!mercury.drag || !mercury.last) return;
      const p = local(mercuryCanvas, event);
      if (!mercury.fling) mercury.fling = {x: 0, y: 0};
      mercury.fling.x += p.x - mercury.last.x;
      mercury.fling.y += p.y - mercury.last.y;
      mercury.last = p;
    },
    up: function () { mercury.drag = false; mercury.fling = null; },
  });

  bind(torchCanvas, {
    down: function (event) {
      const p = local(torchCanvas, event);
      torch.px = p.x;
      torch.py = p.y;
    },
    move: function (event) {
      const p = local(torchCanvas, event);
      if (event.pointerType === 'mouse' || event.buttons > 0 || torch.px != null) {
        torch.px = p.x;
        torch.py = p.y;
      }
    },
    up: function () {},
  });

  bind(levelCanvas, {
    down: function (event) {
      level.drag = true;
      const p = local(levelCanvas, event);
      const box = fit(levelCanvas);
      setTilt(p.x, box.w);
    },
    move: function (event) {
      if (!level.drag) return;
      const p = local(levelCanvas, event);
      const box = fit(levelCanvas);
      setTilt(p.x, box.w);
    },
    up: function () { level.drag = false; },
  });

  function setTilt(px, w) {
    const deg = lab.clamp(((px - w / 2) / (w / 2)) * 78, -66, 66);
    level.theta = deg * Math.PI / 180;
    const slider = document.getElementById('tilt');
    slider.value = String(Math.round(deg));
    setText('tilt-out', Math.round(deg) + '°');
  }

  function easeMap(w, h) {
    const left = 26;
    const right = w - 16;
    const top = 16;
    const bottom = h - 22;
    const yMin = -0.3;
    const yMax = 1.4;
    return {
      left: left,
      right: right,
      top: top,
      bottom: bottom,
      X: function (u) { return left + u * (right - left); },
      Y: function (v) { return bottom - ((v - yMin) / (yMax - yMin)) * (bottom - top); },
      fromX: function (px) { return (px - left) / (right - left); },
      fromY: function (py) { return yMin + ((bottom - py) / (bottom - top)) * (yMax - yMin); },
    };
  }

  function drawSpring(dt) {
    const box = fit(springCanvas);
    const ctx = box.ctx;
    const params = {k: spring.k, c: spring.c, m: spring.m, x0: spring.x0};
    if (!spring.drag && !reduce) springIntegrateSafe(dt, params);
    if (reduce && !spring.drag) {
      spring.x = 0;
      spring.v = 0;
    }
    spring.a = lab.springAccel(spring.x, spring.v, spring.k, spring.c, spring.m, spring.x0);
    const y = box.h * 0.52;
    const massX = springPoint(box.w, spring.x);
    ctx.clearRect(0, 0, box.w, box.h);
    ctx.strokeStyle = '#3a3428';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(box.w - 16, y);
    ctx.stroke();
    ctx.fillStyle = '#2a261e';
    ctx.fillRect(16, y - 22, 8, 44);
    ctx.strokeStyle = '#e0b15a';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    const coilStart = 28;
    const coilEnd = Math.max(coilStart + 8, massX - 18);
    const turns = 9;
    const segs = turns * 8;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = coilStart + (coilEnd - coilStart) * t;
      const wave = Math.sin(t * turns * Math.PI * 2) * 7;
      if (i === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = spring.drag ? '#f0d7a2' : '#e4c27a';
    ctx.arc(massX, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a140c';
    ctx.lineWidth = 1;
    ctx.stroke();
    const zeta = lab.dampingRatio(spring.k, spring.c, spring.m);
    setText('spring-x', spring.x.toFixed(3));
    setText('spring-v', spring.v.toFixed(2));
    setText('spring-a', spring.a.toFixed(1));
    setText('spring-z', zeta.toFixed(3));
    setText('spring-regime', lab.regime(zeta));
  }

  function springIntegrateSafe(dt, params) {
    const next = lab.springIntegrate(spring, dt, params);
    if (!Number.isFinite(next.x) || Math.abs(next.x) > 8) {
      spring.x = 0;
      spring.v = 0;
      spring.a = 0;
      return;
    }
    spring.x = next.x;
    spring.v = next.v;
    spring.a = next.a;
  }

  function drawEase(dt) {
    const box = fit(easeCanvas);
    const ctx = box.ctx;
    if (!reduce && !ease.drag) {
      if (ease.hold > 0) ease.hold -= dt;
      else {
        ease.t += dt / 1.35;
        if (ease.t > 1) ease.t -= 1;
      }
    }
    const map = easeMap(box.w, box.h);
    ctx.clearRect(0, 0, box.w, box.h);
    ctx.strokeStyle = '#3a3428';
    ctx.lineWidth = 1;
    ctx.strokeRect(map.X(0), map.Y(1), map.X(1) - map.X(0), map.Y(0) - map.Y(1));
    ctx.beginPath();
    ctx.moveTo(map.X(0), map.Y(0));
    ctx.lineTo(map.X(1), map.Y(0));
    ctx.stroke();

    const samples = lab.frameSamples(ease.x1, ease.y1, ease.x2, ease.y2, 60);
    ctx.fillStyle = '#8a6a32';
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      ctx.fillRect(map.X(s.x) - 0.5, map.Y(s.y) - 0.5, 1.5, 1.5);
    }

    ctx.beginPath();
    ctx.strokeStyle = '#e0b15a';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = lab.bezierCoord(t, ease.x1, ease.x2);
      const y = lab.bezierCoord(t, ease.y1, ease.y2);
      const px = map.X(x);
      const py = map.Y(y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.strokeStyle = '#6d5a38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(map.X(0), map.Y(0));
    ctx.lineTo(map.X(ease.x1), map.Y(ease.y1));
    ctx.moveTo(map.X(1), map.Y(1));
    ctx.lineTo(map.X(ease.x2), map.Y(ease.y2));
    ctx.stroke();
    handle(ctx, map.X(ease.x1), map.Y(ease.y1));
    handle(ctx, map.X(ease.x2), map.Y(ease.y2));

    const yNow = lab.easeY(ease.t, ease.x1, ease.y1, ease.x2, ease.y2);
    ctx.fillStyle = '#f3ecdf';
    ctx.fillRect(map.X(ease.t) - 3.5, map.Y(yNow) - 3.5, 7, 7);

    ctx.fillStyle = '#5c5346';
    for (let i = 0; i <= 60; i++) {
      const x = map.X(i / 60);
      const tall = i % 10 === 0 ? 6 : 3;
      ctx.fillRect(x, map.Y(0) + 4, 1, tall);
    }

    const frame = Math.round(ease.t * 60);
    setText('ease-p1', ease.x1.toFixed(2) + ', ' + ease.y1.toFixed(2));
    setText('ease-p2', ease.x2.toFixed(2) + ', ' + ease.y2.toFixed(2));
    setText('ease-y', yNow.toFixed(3));
    setText('ease-frame', String(frame) + ' / 60');
  }

  function handle(ctx, x, y) {
    ctx.fillStyle = '#e0b15a';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeStyle = '#1a140c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  }

  let loupeBuffer = null;

  function loupeLayer(size) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(2, Math.round(size * dpr));
    if (!loupeBuffer) loupeBuffer = document.createElement('canvas');
    if (loupeBuffer.width !== bw || loupeBuffer.height !== bw) {
      loupeBuffer.width = bw;
      loupeBuffer.height = bw;
    }
    const layer = loupeBuffer.getContext('2d');
    layer.setTransform(dpr, 0, 0, dpr, 0, 0);
    layer.clearRect(0, 0, size, size);
    return layer;
  }

  function drawLoupe() {
    const box = fit(loupeCanvas);
    const ctx = box.ctx;
    ctx.clearRect(0, 0, box.w, box.h);
    ctx.font = '13px ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace';
    let blockW = 0;
    for (let i = 0; i < LOUPE_LINES.length; i++) {
      blockW = Math.max(blockW, ctx.measureText(LOUPE_LINES[i]).width);
    }
    const layout = {w: blockW + 20, h: 18 + LOUPE_LINES.length * 16, lh: 16};
    const scale = Math.min((box.w - 20) / layout.w, (box.h - 12) / layout.h) * 0.78;
    const ox = (box.w - layout.w * scale) / 2;
    const oy = (box.h - layout.h * scale) / 2;
    drawGalley(ctx, ox, oy, scale, '#8d8476');

    const px = loupe.px == null ? box.w * 0.62 : loupe.px;
    const py = loupe.py == null ? box.h * 0.42 : loupe.py;
    const radius = 52;
    const sx = (px - ox) / scale;
    const sy = (py - oy) / scale;
    const win = lab.loupeWindow(sx, sy, radius / scale, loupe.mag, layout.w, layout.h);
    const drawScale = (radius * 2) / win.size;
    const lens = loupeLayer(radius * 2);
    lens.save();
    lens.beginPath();
    lens.arc(radius, radius, radius, 0, Math.PI * 2);
    lens.clip();
    lens.fillStyle = '#14110c';
    lens.fillRect(0, 0, radius * 2, radius * 2);
    drawGalley(
      lens,
      radius - (win.x + win.size / 2) * drawScale,
      radius - (win.y + win.size / 2) * drawScale,
      drawScale,
      '#f3ecdf'
    );
    lens.restore();
    ctx.drawImage(loupeBuffer, px - radius, py - radius, radius * 2, radius * 2);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0b15a';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#e0b15a';
    ctx.fill();

    const lineIndex = Math.floor((sy - 20) / layout.lh);
    const line = lineIndex >= 0 && lineIndex < LOUPE_LINES.length ? String(lineIndex + 1) : '—';
    setText('loupe-m', loupe.mag.toFixed(1));
    setText('loupe-lens', String(radius * 2) + ' px');
    setText('loupe-src', win.size.toFixed(0) + ' px');
    setText('loupe-line', line);
  }

  function drawGalley(ctx, ox, oy, scale, color) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.font = '13px ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace';
    ctx.fillStyle = color;
    for (let i = 0; i < LOUPE_LINES.length; i++) {
      ctx.fillText(LOUPE_LINES[i], 10, 22 + i * 16);
    }
    ctx.restore();
  }

  function seedMercury(w, h) {
    const pts = [];
    const cx = w * 0.5;
    const cy = h * 0.54;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399963;
      const ring = 3 + (i % 5) * 4.2;
      pts.push({
        x: cx + Math.cos(a) * ring,
        y: cy + Math.sin(a) * ring * 0.78,
        vx: 0,
        vy: 0,
      });
    }
    return pts;
  }

  function drawMercury(dt) {
    const box = fit(mercuryCanvas);
    const ctx = box.ctx;
    if (!mercury.particles || Math.abs(box.w - mercury.w) > 40 || Math.abs(box.h - mercury.h) > 40) {
      mercury.particles = seedMercury(box.w, box.h);
      mercury.w = box.w;
      mercury.h = box.h;
    }
    const parts = mercury.particles;
    if (mercury.drag && mercury.last && mercury.fling) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const d = Math.hypot(p.x - mercury.last.x, p.y - mercury.last.y);
        if (d > 78) continue;
        const inf = 1 - d / 78;
        if (reduce) {
          p.x += (mercury.last.x - p.x) * inf * 0.35;
          p.y += (mercury.last.y - p.y) * inf * 0.35;
          p.vx = 0;
          p.vy = 0;
        } else {
          p.vx += mercury.fling.x * inf * 0.85;
          p.vy += mercury.fling.y * inf * 0.85;
          p.vx += (mercury.last.x - p.x) * inf * 0.12;
          p.vy += (mercury.last.y - p.y) * inf * 0.12;
        }
      }
      mercury.fling = null;
    }
    if (!reduce) {
      mercury.particles = lab.mercuryStep(parts, dt, {
        rest: 22,
        cohesion: mercury.cohesion,
        damping: 2.4,
        range: 86,
        width: box.w,
        height: box.h,
        pad: 18,
        maxSpeed: 220,
      });
    }
    ctx.clearRect(0, 0, box.w, box.h);
    const live = mercury.particles;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      const g = ctx.createRadialGradient(p.x - 3, p.y - 4, 1, p.x, p.y, 16);
      g.addColorStop(0, 'rgba(246, 247, 249, 0.95)');
      g.addColorStop(0.45, 'rgba(198, 204, 212, 0.72)');
      g.addColorStop(1, 'rgba(198, 204, 212, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    let speed = 0;
    let ke = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      const s = Math.hypot(p.vx, p.vy);
      speed += s;
      ke += s * s;
      cx += p.x;
      cy += p.y;
    }
    cx /= live.length;
    cy /= live.length;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy - 7, 10, 5, -0.6, Math.PI * 1.05, Math.PI * 1.85);
    ctx.stroke();
    setText('merc-n', String(live.length));
    setText('merc-v', (speed / live.length).toFixed(2));
    setText('merc-k', mercury.cohesion.toFixed(1));
    setText('merc-ke', (0.5 * ke).toFixed(1));
  }

  let torchMask = null;

  function drawTorch() {
    const box = fit(torchCanvas);
    const ctx = box.ctx;
    const ox = box.w / 2;
    const oy = box.h - 16;
    const px = torch.px == null ? ox : torch.px;
    const py = torch.py == null ? box.h * 0.32 : torch.py;
    let aimX = px - ox;
    let aimY = py - oy;
    if (Math.hypot(aimX, aimY) < 8) { aimX = 0; aimY = -1; }
    const reach = Math.hypot(box.w, box.h) * 0.95;

    ctx.clearRect(0, 0, box.w, box.h);
    ctx.fillStyle = '#0e0c09';
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = '#f3ecdf';
    ctx.font = '16px "Iowan Old Style", Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    const blockTop = box.h * 0.22;
    for (let i = 0; i < TORCH_LINES.length; i++) {
      ctx.fillText(TORCH_LINES[i], box.w / 2, blockTop + i * 22);
    }
    ctx.textAlign = 'left';

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(2, Math.round(box.w * dpr));
    const bh = Math.max(2, Math.round(box.h * dpr));
    if (!torchMask) torchMask = document.createElement('canvas');
    if (torchMask.width !== bw || torchMask.height !== bh) {
      torchMask.width = bw;
      torchMask.height = bh;
    }
    const mask = torchMask.getContext('2d');
    mask.setTransform(dpr, 0, 0, dpr, 0, 0);
    mask.clearRect(0, 0, box.w, box.h);
    const cell = 3;
    for (let y = 0; y < box.h; y += cell) {
      for (let x = 0; x < box.w; x += cell) {
        const intensity = lab.torchIntensity(x + 1, y + 1, ox, oy, aimX, aimY, torch.half, reach, 2);
        if (intensity < 0.015) continue;
        mask.fillStyle = 'rgba(255,255,255,' + Math.min(1, Math.pow(intensity, 0.55)).toFixed(3) + ')';
        mask.fillRect(x, y, cell, cell);
      }
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(torchMask, 0, 0, box.w, box.h);
    ctx.globalCompositeOperation = 'source-over';

    const aim = Math.hypot(aimX, aimY) || 1;
    const ang = Math.atan2(aimY / aim, aimX / aim);
    ctx.strokeStyle = 'rgba(224, 177, 90, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(ang - torch.half) * Math.min(reach, box.h) * 0.92, oy + Math.sin(ang - torch.half) * Math.min(reach, box.h) * 0.92);
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(ang + torch.half) * Math.min(reach, box.h) * 0.92, oy + Math.sin(ang + torch.half) * Math.min(reach, box.h) * 0.92);
    ctx.stroke();
    ctx.fillStyle = '#e0b15a';
    ctx.fillRect(ox - 7, oy - 2, 14, 4);

    const midX = ox + (aimX / Math.hypot(aimX, aimY)) * Math.min(reach * 0.45, 90);
    const midY = oy + (aimY / Math.hypot(aimX, aimY)) * Math.min(reach * 0.45, 90);
    const eye = lab.torchIntensity(midX, midY, ox, oy, aimX, aimY, torch.half, reach, 2);
    const aimDeg = Math.atan2(aimX, -aimY) * 180 / Math.PI;
    setText('torch-ang', aimDeg.toFixed(0) + '°');
    setText('torch-i', eye.toFixed(2));
    setText('torch-half', Math.round(torch.half * 180 / Math.PI) + '°');
    setText('torch-n', '2');
  }

  const VESSEL_W = 100;
  const VESSEL_H = 132;
  const VESSEL_ML = 240;

  function drawLevel(dt) {
    const box = fit(levelCanvas);
    const ctx = box.ctx;
    const before = level.fill;
    const requested = level.fill * VESSEL_W * VESSEL_H;
    const liquid = lab.liquidAt(VESSEL_W, VESSEL_H, requested, level.theta);
    if (liquid.spilled > 0.75) {
      level.fill = liquid.contained / (VESSEL_W * VESSEL_H);
      level.spilled += (before - level.fill) * VESSEL_ML;
      if (!reduce) spawnDrops(box, liquid);
    }
    level.drops = level.drops.filter(function (drop) { return drop.life > 0 && drop.y < box.h + 8; });
    for (let i = 0; i < level.drops.length; i++) {
      const drop = level.drops[i];
      drop.vy += 420 * dt;
      drop.y += drop.vy * dt;
      drop.life -= dt;
    }

    ctx.clearRect(0, 0, box.w, box.h);
    const cx = box.w / 2;
    const cy = box.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(level.theta);
    ctx.translate(-VESSEL_W / 2, -VESSEL_H / 2);

    if (liquid.polygon.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(liquid.polygon[0][0], liquid.polygon[0][1]);
      for (let i = 1; i < liquid.polygon.length; i++) ctx.lineTo(liquid.polygon[i][0], liquid.polygon[i][1]);
      ctx.closePath();
      ctx.fillStyle = '#d0893c';
      ctx.fill();
      if (liquid.surface.length >= 2) {
        const a = liquid.surface[0];
        const b = liquid.surface[liquid.surface.length - 1];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = '#f0d7a2';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#d9d0c2';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, VESSEL_H);
    ctx.lineTo(VESSEL_W, VESSEL_H);
    ctx.lineTo(VESSEL_W, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(0, 6);
    ctx.moveTo(VESSEL_W, 6);
    ctx.lineTo(VESSEL_W + 8, 6);
    ctx.stroke();

    ctx.fillStyle = '#cfc6b8';
    ctx.font = '10px "DejaVu Sans Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    for (let ml = 60; ml <= 180; ml += 60) {
      const y = VESSEL_H * (1 - ml / VESSEL_ML);
      ctx.fillRect(-1, y, 8, 1);
      ctx.fillText(String(ml), -4, y + 3);
    }
    ctx.textAlign = 'left';
    ctx.restore();

    ctx.fillStyle = 'rgba(208, 137, 60, 0.85)';
    for (let i = 0; i < level.drops.length; i++) {
      const drop = level.drops[i];
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y, 2.2, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    let surface = '0.0°';
    if (liquid.surface.length >= 2) {
      const a = liquid.surface[0];
      const b = liquid.surface[liquid.surface.length - 1];
      const sa = lab.toScreen(a[0], a[1], level.theta, VESSEL_W, VESSEL_H);
      const sb = lab.toScreen(b[0], b[1], level.theta, VESSEL_W, VESSEL_H);
      let deg = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]) * 180 / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      surface = deg.toFixed(1) + '°';
    }
    setText('level-theta', (level.theta * 180 / Math.PI).toFixed(1) + '°');
    setText('level-fill', Math.round(level.fill * VESSEL_ML) + ' ml');
    setText('level-spill', Math.round(level.spilled) + ' ml');
    setText('level-surface', surface);
  }

  function spawnDrops(box, liquid) {
    const g = liquid.g;
    const lipX = g.x >= 0 ? VESSEL_W : 0;
    const local = lab.toScreen(lipX, 4, level.theta, VESSEL_W, VESSEL_H);
    const x = box.w / 2 + (local[0] - VESSEL_W / 2);
    const y = box.h / 2 + (local[1] - VESSEL_H / 2);
    for (let i = 0; i < 4; i++) {
      level.drops.push({x: x + (i - 1.5) * 3, y: y, vy: 20 + i * 12, life: 0.8});
    }
    if (level.drops.length > 24) level.drops.splice(0, level.drops.length - 24);
  }

  if (reduce) spring.x = 0;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.034, (now - last) / 1000) || 0.016;
    last = now;
    drawSpring(dt);
    drawEase(dt);
    drawLoupe();
    drawMercury(dt);
    drawTorch();
    drawLevel(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
