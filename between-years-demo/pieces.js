// Eight small pieces. Each door picks one and varies it from the door number.
// Drawing, audio, and input stay in this page.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BetweenPieces = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLURBS = {
    slide: 'Eight tiles and a gap. Tap a neighbor of the gap.',
    field: 'A line field from this door. Tap it to drop a ring.',
    reflex: 'Tap the page while the pad is lit.',
    tones: 'Seven tones from this door. Tap a pad, or play the row.',
    orbit: 'A body in a well. Drag to push it.',
    cells: 'A small grid that updates itself. Tap a cell to flip it.',
    maze: 'Find the far cell. Arrows, the buttons, or a tap on a neighbor.',
    match: 'Move the three sliders until the mix meets the target.',
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function palette(seed) {
    const hue = (seed * 47 + 18) % 360;
    return {
      hue: hue,
      ink: 'hsl(' + hue + ' 32% 16%)',
      paper: 'hsl(' + hue + ' 42% 96%)',
      accent: 'hsl(' + ((hue + 28) % 360) + ' 68% 42%)',
      alt: 'hsl(' + ((hue + 200) % 360) + ' 42% 38%)',
      line: 'hsl(' + hue + ' 18% 72%)',
    };
  }

  let audioCtx = null;

  function audio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type, gain) {
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    amp.gain.setValueAtTime(gain == null ? 0.05 : gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function knock() {
    tone(520, 0.09, 'triangle', 0.04);
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.12);
    amp.gain.setValueAtTime(0.05, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function makeCanvas(host, height) {
    const canvas = el('canvas', 'toy-canvas');
    canvas.style.height = height + 'px';
    host.appendChild(canvas);
    return canvas;
  }

  function fit(canvas) {
    const width = canvas.clientWidth || 280;
    const height = canvas.clientHeight || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(2, Math.round(width * dpr));
    const bh = Math.max(2, Math.round(height * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function watchSize(canvas, draw) {
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(function () { draw(); });
      observer.observe(canvas);
      return function () { observer.disconnect(); };
    }
    const onResize = function () { draw(); };
    window.addEventListener('resize', onResize);
    return function () { window.removeEventListener('resize', onResize); };
  }

  function mountSlide(host, ctx) {
    const tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const rng = mulberry32(ctx.seed * 997);
    let empty = 8;
    let prev = -1;
    function neighbors(index) {
      const x = index % 3;
      const y = Math.floor(index / 3);
      const out = [];
      if (x > 0) out.push(index - 1);
      if (x < 2) out.push(index + 1);
      if (y > 0) out.push(index - 3);
      if (y < 2) out.push(index + 3);
      return out;
    }
    for (let n = 0; n < 36; n += 1) {
      const options = neighbors(empty).filter(function (index) { return index !== prev; });
      const pick = options[Math.floor(rng() * options.length)];
      tiles[empty] = tiles[pick];
      tiles[pick] = 0;
      prev = empty;
      empty = pick;
    }
    let moves = 0;
    const status = el('p', 'toy-status', '0 moves');
    const grid = el('div', 'slide');
    grid.style.setProperty('--accent', ctx.palette.accent);
    grid.style.setProperty('--ink', ctx.palette.ink);
    grid.style.setProperty('--paper', ctx.palette.paper);
    const buttons = [];
    function solved() {
      for (let i = 0; i < 8; i += 1) if (tiles[i] !== i + 1) return false;
      return tiles[8] === 0;
    }
    function paint() {
      buttons.forEach(function (button, index) {
        const value = tiles[index];
        button.textContent = value === 0 ? '' : String(value);
        button.classList.toggle('is-empty', value === 0);
        button.disabled = value === 0;
        button.setAttribute('aria-label', value === 0 ? 'Empty' : 'Tile ' + value);
      });
      status.textContent = solved() ? 'Solved in ' + moves + (moves === 1 ? ' move.' : ' moves.') : moves + (moves === 1 ? ' move' : ' moves');
    }
    for (let i = 0; i < 9; i += 1) {
      const button = el('button', 'tile');
      button.type = 'button';
      button.addEventListener('click', function () {
        if (!neighbors(empty).includes(i) || tiles[i] === 0) return;
        tiles[empty] = tiles[i];
        tiles[i] = 0;
        empty = i;
        moves += 1;
        paint();
        if (solved()) tone(620, 0.12, 'triangle', 0.05);
      });
      buttons.push(button);
      grid.appendChild(button);
    }
    host.append(grid, status);
    paint();
    return { destroy: function () {}, audio: false };
  }

  function mountField(host, ctx) {
    const canvas = makeCanvas(host, 220);
    const status = el('p', 'toy-status', 'Tap the field.');
    host.appendChild(status);
    const ripples = [];
    let running = true;
    let raf = 0;
    const freq = 2 + (ctx.seed % 5);
    function draw(now) {
      if (!running) return;
      const view = fit(canvas);
      const g = view.ctx;
      const t = now / 1000;
      g.clearRect(0, 0, view.width, view.height);
      g.fillStyle = ctx.palette.paper;
      g.fillRect(0, 0, view.width, view.height);
      for (let band = 0; band < 5; band += 1) {
        g.beginPath();
        const steps = 48;
        for (let s = 0; s <= steps; s += 1) {
          const u = s / steps;
          const ang = u * Math.PI * 2;
          const wobble = Math.sin(ang * freq + t * (0.6 + band * 0.17) + ctx.seed) * (10 + band * 4);
          const rad = 18 + band * 16 + wobble;
          const x = view.width * 0.5 + Math.cos(ang + band * 0.2) * rad * (view.width / 220);
          const y = view.height * 0.5 + Math.sin(ang * 1.15) * rad * 0.72;
          if (s === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.strokeStyle = band % 2 === 0 ? ctx.palette.accent : ctx.palette.alt;
        g.globalAlpha = 0.85;
        g.lineWidth = 1.6;
        g.stroke();
      }
      g.globalAlpha = 1;
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const ripple = ripples[i];
        ripple.life -= 0.012;
        if (ripple.life <= 0) {
          ripples.splice(i, 1);
          continue;
        }
        g.beginPath();
        g.arc(ripple.x, ripple.y, (1 - ripple.life) * 70 + 4, 0, Math.PI * 2);
        g.strokeStyle = ctx.palette.ink;
        g.globalAlpha = ripple.life;
        g.stroke();
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    }
    canvas.addEventListener('pointerdown', function (event) {
      const rect = canvas.getBoundingClientRect();
      ripples.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, life: 1 });
      status.textContent = ripples.length === 1 ? '1 ring' : ripples.length + ' rings';
    });
    const stopSize = watchSize(canvas, function () { fit(canvas); });
    raf = requestAnimationFrame(draw);
    return {
      audio: false,
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        stopSize();
      },
    };
  }

  function mountReflex(host, ctx) {
    const canvas = makeCanvas(host, 220);
    const status = el('p', 'toy-status', 'Wait for the pad, then tap. 0');
    host.appendChild(status);
    let running = true;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let score = 0;
    const period = 1.35 + (ctx.seed % 4) * 0.18;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const view = fit(canvas);
      const g = view.ctx;
      const ang = (elapsed / period) * Math.PI * 2;
      const px = view.width * 0.5 + Math.cos(ang) * view.width * 0.32;
      const py = view.height * 0.5 + Math.sin(ang * 2) * view.height * 0.28;
      const hx = view.width * 0.5;
      const hy = view.height * 0.5;
      const lit = Math.hypot(px - hx, py - hy) < 26;
      g.clearRect(0, 0, view.width, view.height);
      g.fillStyle = ctx.palette.paper;
      g.fillRect(0, 0, view.width, view.height);
      g.beginPath();
      g.arc(hx, hy, 22, 0, Math.PI * 2);
      g.fillStyle = lit ? ctx.palette.accent : ctx.palette.line;
      g.fill();
      g.beginPath();
      g.arc(px, py, 10, 0, Math.PI * 2);
      g.fillStyle = ctx.palette.ink;
      g.fill();
      canvas.dataset.lit = lit ? '1' : '0';
      raf = requestAnimationFrame(frame);
    }
    canvas.addEventListener('pointerdown', function () {
      if (canvas.dataset.lit === '1') {
        score += 1;
        tone(680, 0.07, 'triangle', 0.045);
        status.textContent = 'Hit. Score ' + score;
      } else {
        score = Math.max(0, score - 1);
        tone(160, 0.09, 'sine', 0.04);
        status.textContent = 'Early. Score ' + score;
      }
    });
    const stopSize = watchSize(canvas, function () { fit(canvas); });
    raf = requestAnimationFrame(frame);
    return {
      audio: true,
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        stopSize();
      },
    };
  }

  function mountTones(host, ctx) {
    const rng = mulberry32(ctx.seed * 13);
    const base = 196 + Math.floor(rng() * 6) * 20;
    const ratios = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2];
    const row = el('div', 'pads');
    const status = el('p', 'toy-status', 'A row from ' + Math.round(base) + ' Hz.');
    function play(freq) {
      tone(freq, 0.22, 'triangle', 0.06);
      status.textContent = Math.round(freq) + ' Hz';
    }
    ratios.forEach(function (ratio, index) {
      const freq = base * ratio;
      const button = el('button', 'pad', String(index + 1));
      button.type = 'button';
      button.style.background = index % 2 ? ctx.palette.alt : ctx.palette.accent;
      button.addEventListener('click', function () { play(freq); });
      row.appendChild(button);
    });
    const phrase = el('button', 'text-button', 'Play the row');
    phrase.type = 'button';
    phrase.addEventListener('click', function () {
      const ctxAudio = audio();
      if (!ctxAudio) return;
      ratios.forEach(function (ratio, index) {
        const osc = ctxAudio.createOscillator();
        const amp = ctxAudio.createGain();
        const start = ctxAudio.currentTime + index * 0.16;
        osc.type = 'triangle';
        osc.frequency.value = base * ratio;
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(0.05, start + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        osc.connect(amp);
        amp.connect(ctxAudio.destination);
        osc.start(start);
        osc.stop(start + 0.17);
      });
      status.textContent = 'Playing the row.';
    });
    host.append(row, phrase, status);
    return { destroy: function () {}, audio: true };
  }

  function mountOrbit(host, ctx) {
    const canvas = makeCanvas(host, 220);
    const status = el('p', 'toy-status', 'Drag to push.');
    host.appendChild(status);
    const rng = mulberry32(ctx.seed * 29);
    let x = 0.45 + rng() * 0.2;
    let y = (rng() - 0.5) * 0.2;
    let vx = (rng() - 0.5) * 0.2;
    let vy = 0.9 + rng() * 0.25;
    const trail = [];
    let running = true;
    let raf = 0;
    let last = performance.now();
    let dragging = false;
    let lastPointer = null;
    function reset() {
      x = 0.55;
      y = 0.05;
      vx = 0;
      vy = 1.05;
    }
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const k = 1.55;
      vx += -x * k * dt;
      vy += -y * k * dt;
      x += vx * dt;
      y += vy * dt;
      if (x * x + y * y > 1.7) reset();
      const view = fit(canvas);
      const g = view.ctx;
      const cx = view.width * 0.5;
      const cy = view.height * 0.5;
      const scale = Math.min(view.width, view.height) * 0.36;
      trail.push({ x: x, y: y });
      if (trail.length > 48) trail.shift();
      g.clearRect(0, 0, view.width, view.height);
      g.fillStyle = ctx.palette.paper;
      g.fillRect(0, 0, view.width, view.height);
      g.beginPath();
      trail.forEach(function (point, index) {
        const px = cx + point.x * scale;
        const py = cy + point.y * scale;
        if (index === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.strokeStyle = ctx.palette.line;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fillStyle = ctx.palette.accent;
      g.fill();
      g.beginPath();
      g.arc(cx + x * scale, cy + y * scale, 7, 0, Math.PI * 2);
      g.fillStyle = ctx.palette.ink;
      g.fill();
      raf = requestAnimationFrame(frame);
    }
    canvas.addEventListener('pointerdown', function (event) {
      dragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!dragging || !lastPointer) return;
      const view = fit(canvas);
      const scale = Math.min(view.width, view.height) * 0.36;
      vx += (event.clientX - lastPointer.x) / scale * 1.4;
      vy += (event.clientY - lastPointer.y) / scale * 1.4;
      lastPointer = { x: event.clientX, y: event.clientY };
      status.textContent = 'Pushed.';
    });
    function endDrag() { dragging = false; lastPointer = null; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    const stopSize = watchSize(canvas, function () { fit(canvas); });
    raf = requestAnimationFrame(frame);
    return {
      audio: false,
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        stopSize();
      },
    };
  }

  function mountCells(host, ctx) {
    const canvas = makeCanvas(host, 220);
    const cols = 14;
    const rows = 14;
    const grid = new Uint8Array(cols * rows);
    const rng = mulberry32(ctx.seed * 41);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rng() > 0.72 ? 1 : 0;
    const blinker = (3 + (ctx.seed % 5)) * cols + 4;
    grid[blinker] = 1;
    grid[blinker + 1] = 1;
    grid[blinker + 2] = 1;
    let generation = 0;
    let paused = false;
    let acc = 0;
    let running = true;
    let raf = 0;
    let last = performance.now();
    const row = el('div', 'toy-actions');
    const pause = el('button', 'text-button', 'Pause');
    pause.type = 'button';
    pause.setAttribute('aria-pressed', 'false');
    const status = el('p', 'toy-status', 'Generation 0');
    pause.addEventListener('click', function () {
      paused = !paused;
      pause.textContent = paused ? 'Run' : 'Pause';
      pause.setAttribute('aria-pressed', paused ? 'true' : 'false');
    });
    function step() {
      const next = new Uint8Array(grid.length);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const xx = (x + dx + cols) % cols;
              const yy = (y + dy + rows) % rows;
              n += grid[yy * cols + xx];
            }
          }
          const alive = grid[y * cols + x] === 1;
          next[y * cols + x] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0;
        }
      }
      grid.set(next);
      generation += 1;
      status.textContent = 'Generation ' + generation;
    }
    function draw() {
      const view = fit(canvas);
      const g = view.ctx;
      g.clearRect(0, 0, view.width, view.height);
      g.fillStyle = ctx.palette.paper;
      g.fillRect(0, 0, view.width, view.height);
      const cw = view.width / cols;
      const ch = view.height / rows;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          if (!grid[y * cols + x]) continue;
          g.fillStyle = (x + y) % 2 === 0 ? ctx.palette.accent : ctx.palette.ink;
          g.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
        }
      }
    }
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused) {
        acc += dt;
        if (acc > 0.18) {
          acc = 0;
          step();
        }
      }
      draw();
      raf = requestAnimationFrame(frame);
    }
    canvas.addEventListener('pointerdown', function (event) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * cols);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const index = y * cols + x;
      grid[index] = grid[index] ? 0 : 1;
    });
    row.appendChild(pause);
    host.append(canvas, row, status);
    const stopSize = watchSize(canvas, draw);
    raf = requestAnimationFrame(frame);
    return {
      audio: false,
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        stopSize();
      },
    };
  }

  function carveMaze(cols, rows, rng) {
    const link = new Uint8Array(cols * rows);
    const seen = new Uint8Array(cols * rows);
    const stack = [0];
    seen[0] = 1;
    const dirs = [
      [0, -1, 1, 4],
      [1, 0, 2, 8],
      [0, 1, 4, 1],
      [-1, 0, 8, 2],
    ];
    while (stack.length) {
      const index = stack[stack.length - 1];
      const x = index % cols;
      const y = Math.floor(index / cols);
      const options = [];
      dirs.forEach(function (dir) {
        const nx = x + dir[0];
        const ny = y + dir[1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
        const next = ny * cols + nx;
        if (!seen[next]) options.push([next, dir[2], dir[3]]);
      });
      if (!options.length) {
        stack.pop();
        continue;
      }
      const pick = options[Math.floor(rng() * options.length)];
      link[index] |= pick[1];
      link[pick[0]] |= pick[2];
      seen[pick[0]] = 1;
      stack.push(pick[0]);
    }
    return link;
  }

  function mountMaze(host, ctx) {
    const cols = 7;
    const rows = 7;
    const link = carveMaze(cols, rows, mulberry32(ctx.seed * 53));
    const exit = cols * rows - 1;
    let player = 0;
    const canvas = makeCanvas(host, 240);
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Maze. Use arrow keys.');
    const status = el('p', 'toy-status', 'Start at the corner.');
    const actions = el('div', 'toy-actions');
    function tryMove(bit, delta) {
      if ((link[player] & bit) === 0) return;
      player += delta;
      if (player === exit) {
        status.textContent = 'Out.';
        tone(540, 0.1, 'triangle', 0.05);
      } else {
        status.textContent = 'Cell ' + (player + 1) + ' of ' + (cols * rows);
      }
      draw();
    }
    [['N', 1, -cols], ['W', 8, -1], ['E', 2, 1], ['S', 4, cols]].forEach(function (spec) {
      const button = el('button', 'text-button', spec[0]);
      button.type = 'button';
      button.addEventListener('click', function () { tryMove(spec[1], spec[2]); });
      actions.appendChild(button);
    });
    function draw() {
      const view = fit(canvas);
      const g = view.ctx;
      const cw = view.width / cols;
      const ch = view.height / rows;
      g.clearRect(0, 0, view.width, view.height);
      g.fillStyle = ctx.palette.paper;
      g.fillRect(0, 0, view.width, view.height);
      g.strokeStyle = ctx.palette.ink;
      g.lineWidth = 2;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const index = y * cols + x;
          const bits = link[index];
          const x0 = x * cw;
          const y0 = y * ch;
          g.beginPath();
          if ((bits & 1) === 0) {
            g.moveTo(x0, y0);
            g.lineTo(x0 + cw, y0);
          }
          if ((bits & 2) === 0) {
            g.moveTo(x0 + cw, y0);
            g.lineTo(x0 + cw, y0 + ch);
          }
          if ((bits & 4) === 0) {
            g.moveTo(x0, y0 + ch);
            g.lineTo(x0 + cw, y0 + ch);
          }
          if ((bits & 8) === 0) {
            g.moveTo(x0, y0);
            g.lineTo(x0, y0 + ch);
          }
          g.stroke();
        }
      }
      const ex = (exit % cols) * cw;
      const ey = Math.floor(exit / cols) * ch;
      g.fillStyle = ctx.palette.accent;
      g.fillRect(ex + cw * 0.28, ey + ch * 0.28, cw * 0.44, ch * 0.44);
      const px = (player % cols) * cw + cw * 0.5;
      const py = Math.floor(player / cols) * ch + ch * 0.5;
      g.beginPath();
      g.arc(px, py, Math.min(cw, ch) * 0.22, 0, Math.PI * 2);
      g.fillStyle = ctx.palette.ink;
      g.fill();
    }
    canvas.addEventListener('pointerdown', function (event) {
      canvas.focus();
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * cols);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
      const next = y * cols + x;
      const cx = player % cols;
      const cy = Math.floor(player / cols);
      if (x === cx && y === cy - 1) tryMove(1, -cols);
      else if (x === cx + 1 && y === cy) tryMove(2, 1);
      else if (x === cx && y === cy + 1) tryMove(4, cols);
      else if (x === cx - 1 && y === cy) tryMove(8, -1);
      else if (next === player) status.textContent = 'That cell is the token.';
    });
    canvas.addEventListener('keydown', function (event) {
      const map = { ArrowUp: [1, -cols], ArrowRight: [2, 1], ArrowDown: [4, cols], ArrowLeft: [8, -1] };
      const spec = map[event.key];
      if (!spec) return;
      event.preventDefault();
      tryMove(spec[0], spec[1]);
    });
    host.append(canvas, actions, status);
    const stopSize = watchSize(canvas, draw);
    draw();
    return {
      audio: false,
      destroy: function () { stopSize(); },
    };
  }

  function mountMatch(host, ctx) {
    const rng = mulberry32(ctx.seed * 67);
    const target = [
      36 + Math.floor(rng() * 180),
      36 + Math.floor(rng() * 180),
      36 + Math.floor(rng() * 180),
    ];
    const current = [128, 128, 128];
    const swatches = el('div', 'swatches');
    const goal = el('div', 'swatch');
    const mix = el('div', 'swatch');
    goal.style.background = 'rgb(' + target.join(',') + ')';
    goal.title = 'Target';
    swatches.append(goal, mix);
    const sliders = el('div', 'sliders');
    const names = ['Red', 'Green', 'Blue'];
    const inputs = [];
    names.forEach(function (name, index) {
      const label = el('label', 'slider');
      label.append(document.createTextNode(name));
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '255';
      input.value = '128';
      input.addEventListener('input', function () {
        current[index] = Number(input.value);
        paint();
      });
      inputs.push(input);
      label.appendChild(input);
      sliders.appendChild(label);
    });
    const status = el('p', 'toy-status', '');
    function paint() {
      mix.style.background = 'rgb(' + current.join(',') + ')';
      const dr = current[0] - target[0];
      const dg = current[1] - target[1];
      const db = current[2] - target[2];
      const distance = Math.round(Math.sqrt(dr * dr + dg * dg + db * db));
      status.textContent = distance < 22 ? 'Matched. Distance ' + distance + '.' : 'Distance ' + distance + '.';
    }
    host.append(swatches, sliders, status);
    paint();
    return { destroy: function () {}, audio: false };
  }

  const MOUNTS = {
    slide: mountSlide,
    field: mountField,
    reflex: mountReflex,
    tones: mountTones,
    orbit: mountOrbit,
    cells: mountCells,
    maze: mountMaze,
    match: mountMatch,
  };

  function mount(host, door) {
    const rules = globalThis.BetweenYears;
    const id = rules.kindForDoor(door);
    const seed = door;
    const ctx = { door: door, seed: seed, palette: palette(seed) };
    host.replaceChildren();
    host.style.setProperty('--toy-ink', ctx.palette.ink);
    host.style.setProperty('--toy-paper', ctx.palette.paper);
    host.style.setProperty('--toy-accent', ctx.palette.accent);
    const mountFn = MOUNTS[id];
    const handle = mountFn(host, ctx);
    handle.id = id;
    handle.name = id.charAt(0).toUpperCase() + id.slice(1);
    handle.blurb = BLURBS[id];
    handle.seed = seed;
    return handle;
  }

  return {
    mount: mount,
    knock: knock,
    blurb: function (id) { return BLURBS[id] || ''; },
    names: Object.keys(MOUNTS),
  };
});
