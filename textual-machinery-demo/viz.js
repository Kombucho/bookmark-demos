// Isometric wireframe and the character particles.
// Tracks are screen-horizontal, ribbon cables are screen-vertical,
// and every machine edge follows an isometric axis (2:1 or vertical).

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TextualViz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLUE = '#3d7eff';
  const RED = '#ff3148';
  const GREEN = '#2cff84';
  const YELLOW = '#ffe14a';
  const WHITE = '#f4f6ff';
  const ORANGE = '#ff8a18';
  const DIM_TEXT = '#b7c4e0';
  const FLOOR = '#102448';
  const LANES = [BLUE, RED, GREEN, YELLOW, WHITE];

  function shade(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const s = function (v) {
      return Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
    };
    return '#' + s(r) + s(g) + s(b);
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = function (shift) {
      const av = (pa >> shift) & 255;
      const bv = (pb >> shift) & 255;
      return Math.round(av + (bv - av) * t).toString(16).padStart(2, '0');
    };
    return '#' + ch(16) + ch(8) + ch(0);
  }

  const BLUES = [];
  const REDS = [];
  for (let i = 0; i < 8; i++) {
    BLUES.push(mix('#14284f', '#d7e6ff', i / 7));
    REDS.push(mix('#3a1020', '#ff3148', i / 7));
  }

  function createStage(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const glyphCache = new Map();
    const queues = Object.create(null);
    let queueKeys = [];
    let dirtyKeys = false;

    const pool = [];
    let hud = blankHud();
    let hidden = new Float32Array(32);
    let raw = '';
    let lines = [''];
    let numbers = [1];
    let cols = 24;
    let memoryCount = 0;
    let flash = 0;
    let world = null;
    let fontPx = 12;
    let advance = 7;
    let lineH = 15;

    function blankHud() {
      return {
        step: 0,
        letters: 0,
        waiting: 0,
        burned: 0,
        hits: 0,
        total: 0,
        pos: 0,
        said: ' ',
        next: ' ',
        correct: false,
        lanes: [' ', ' ', ' ', ' ', ' ']
      };
    }

    function edge(a, b, color) {
      if (!a || !b) return;
      if (a[0] === b[0] && a[1] === b[1]) return;
      let q = queues[color];
      if (!q) {
        q = queues[color] = [];
        dirtyKeys = true;
      }
      q.push(a[0], a[1], b[0], b[1]);
    }

    function flushEdges() {
      if (dirtyKeys) {
        queueKeys = Object.keys(queues);
        dirtyKeys = false;
      }
      for (let k = 0; k < queueKeys.length; k++) {
        const q = queues[queueKeys[k]];
        if (!q.length) continue;
        ctx.strokeStyle = queueKeys[k];
        ctx.beginPath();
        for (let i = 0; i < q.length; i += 4) {
          ctx.moveTo(q[i] + 0.5, q[i + 1] + 0.5);
          ctx.lineTo(q[i + 2] + 0.5, q[i + 3] + 0.5);
        }
        ctx.stroke();
        q.length = 0;
      }
    }

    function glyph(ch) {
      const key = fontPx + '\n' + ch;
      const cached = glyphCache.get(key);
      if (cached) return cached;
      const w = fontPx + 2;
      const h = fontPx + 2;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.font = fontPx + 'px "Courier New", Courier, "Liberation Mono", "DejaVu Sans Mono", monospace';
      g.textBaseline = 'top';
      g.fillStyle = '#fff';
      g.fillText(ch, 0, 0);
      const img = g.getImageData(0, 0, w, h);
      const dots = [];
      const data = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 150) dots.push(x, y);
        }
      }
      if (!dots.length) dots.push(1, h - 4, 2, h - 4);
      const record = { dots: dots };
      glyphCache.set(key, record);
      return record;
    }

    function drawGlyph(ch, x, y, color) {
      const shown = ch === '\n' ? '\u21b5' : ch;
      if (shown === ' ') {
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + fontPx - 4, Math.max(2, advance - 3), 2);
        return;
      }
      const g = glyph(shown);
      const d = g.dots;
      ctx.fillStyle = color;
      const ox = Math.round(x);
      const oy = Math.round(y);
      for (let i = 0; i < d.length; i += 2) ctx.fillRect(ox + d[i], oy + d[i + 1], 1, 1);
    }

    function prepFont() {
      ctx.font = fontPx + 'px "Courier New", Courier, "Liberation Mono", "DejaVu Sans Mono", monospace';
      ctx.textBaseline = 'top';
    }

    function drawText(str, x, y, color) {
      prepFont();
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
    }

    function drawTextRight(str, right, y, color) {
      prepFont();
      const width = ctx.measureText(str).width;
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(right - width), Math.round(y));
    }

    function hudLine(x0, y0, x1, y1, color) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y0 + 0.5);
      ctx.lineTo(x1 + 0.5, y1 + 0.5);
      ctx.stroke();
    }

    function brackets(x, y, w, h, color) {
      const m = 6;
      hudLine(x, y, x + m, y, color);
      hudLine(x, y, x, y + m, color);
      hudLine(x + w, y, x + w - m, y, color);
      hudLine(x + w, y, x + w, y + m, color);
      hudLine(x, y + h, x + m, y + h, color);
      hudLine(x, y + h, x, y + h - m, color);
      hudLine(x + w, y + h, x + w - m, y + h, color);
      hudLine(x + w, y + h, x + w, y + h - m, color);
    }

    function panel(rect) {
      ctx.fillStyle = '#000';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      hudLine(rect.x, rect.y, rect.x + rect.w, rect.y, BLUE);
      hudLine(rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h, BLUE);
      hudLine(rect.x, rect.y, rect.x, rect.y + rect.h, BLUE);
      hudLine(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, BLUE);
      brackets(rect.x, rect.y, rect.w, rect.h, YELLOW);
    }

    function reflow() {
      lines = [''];
      numbers = [1];
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '\n') {
          lines.push('');
          numbers.push(numbers[numbers.length - 1] + 1);
        } else if (lines[lines.length - 1].length >= cols) {
          lines.push(ch);
          numbers.push(numbers[numbers.length - 1] + 1);
        } else {
          lines[lines.length - 1] += ch;
        }
      }
      if (lines.length > 160) {
        const cut = lines.length - 160;
        lines = lines.slice(cut);
        numbers = numbers.slice(cut);
      }
    }

    function killAll() {
      for (let i = 0; i < pool.length; i++) pool[i].alive = false;
      memoryCount = 0;
    }

    function layout() {
      const w = canvas.width;
      const h = canvas.height;
      if (w < 2 || h < 2) return;
      fontPx = Math.max(w < 680 ? 12 : 13, Math.min(15, Math.round(w / 72)));
      ctx.font = fontPx + 'px "Courier New", Courier, "Liberation Mono", "DejaVu Sans Mono", monospace';
      advance = Math.max(7, Math.ceil(ctx.measureText('M').width));
      lineH = fontPx + 4;
      const narrow = w < 680;
      const textLines = narrow ? (h < 560 ? 2 : 3) : (h < 480 ? 5 : 6);
      const textH = lineH * (textLines + 1) + 12;
      const metH = lineH * 7 + 18;
      const debugH = lineH * 5 + 14;
      const debugW = Math.min(w - 16, Math.max(188, advance * 24 + 18));
      const metW = Math.min(w - 16, Math.max(210, advance * 28 + 16));
      let text;
      let metrics;
      let debug;
      let field;
      if (!narrow) {
        const textW = Math.min(300, Math.max(210, Math.round(w * 0.3)));
        text = { x: 10, y: 10, w: textW, h: textH };
        metrics = { x: w - 10 - metW, y: 10, w: metW, h: metH };
        debug = { x: w - 10 - debugW, y: h - 10 - debugH, w: debugW, h: debugH };
        const top = Math.max(text.y + text.h, metrics.y + metrics.h) + 8;
        field = { x: 8, y: top, w: w - 16, h: Math.max(64, debug.y - top - 8) };
      } else {
        const pad = 8;
        text = { x: pad, y: 6, w: w - pad * 2, h: textH };
        metrics = { x: pad, y: text.y + text.h + 4, w: w - pad * 2, h: metH };
        debug = { x: pad, y: h - 6 - debugH, w: Math.min(w - pad * 2, debugW), h: debugH };
        const top = metrics.y + metrics.h + 4;
        field = { x: pad, y: top, w: w - pad * 2, h: Math.max(48, debug.y - top - 4) };
      }
      cols = Math.max(8, Math.floor((text.w - 10 - advance * 4) / advance));
      reflow();

      const boxes = [];
      for (let i = 0; i < 5; i++) {
        boxes.push({ x: 1, y: 1 + i * 3, z: 5, w: 4, d: 2, h: 4, color: LANES[i], role: 'mem', i: i });
      }
      boxes.push({ x: 8, y: 3, z: 1, w: 8, d: 8, h: 6, color: BLUE, role: 'core' });
      boxes.push({ x: 9, y: 4, z: 7, w: 2, d: 2, h: 2, color: YELLOW, role: 'chip' });
      boxes.push({ x: 13, y: 5, z: 7, w: 2, d: 2, h: 2, color: RED, role: 'chip' });
      boxes.push({ x: 11, y: 8, z: 7, w: 2, d: 2, h: 2, color: WHITE, role: 'chip' });
      for (let i = 0; i < 8; i++) {
        boxes.push({
          x: 18,
          y: 1 + i * 2,
          z: 0,
          w: 8,
          d: 2,
          h: 2,
          color: i % 2 ? GREEN : YELLOW,
          role: 'branch',
          i: i
        });
      }
      for (let i = 0; i < 4; i++) {
        boxes.push({
          x: 19 + i * 2,
          y: 18,
          z: 0,
          w: 2,
          d: 5,
          h: 2,
          color: i % 2 ? RED : BLUE,
          role: 'rib',
          i: i
        });
      }

      function measure(project) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        function add(p) {
          if (p[0] < minX) minX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] > maxY) maxY = p[1];
        }
        for (let b = 0; b < boxes.length; b++) {
          const box = boxes[b];
          for (let dz = 0; dz <= 1; dz++) {
            for (let dy = 0; dy <= 1; dy++) {
              for (let dx = 0; dx <= 1; dx++) {
                add(project(box.x + dx * box.w, box.y + dy * box.d, box.z + dz * box.h));
              }
            }
          }
        }
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
      }

      const probe = function (x, y, z) {
        return [(x - y) * 2, (x + y) - z * 2];
      };
      const bounds = measure(probe);
      const trackBand = Math.max(narrow ? 26 : 44, Math.min(84, Math.round(field.h * (narrow ? 0.14 : 0.14))));
      const widthBudget = field.w * (narrow ? 0.96 : 0.8);
      const heightBudget = Math.max(36, field.h - trackBand);
      let unit = Math.floor(Math.min(widthBudget / bounds.w, heightBudget / bounds.h));
      if (unit > 8) unit = 8;
      if (unit < 1) unit = 1;
      if (bounds.h * unit > heightBudget) unit = Math.max(1, Math.floor(heightBudget / bounds.h));
      const drawnW = bounds.w * unit;
      const drawnH = bounds.h * unit;
      const anchor = narrow ? 0.48 : 0.46;
      const originX = Math.round(field.x + field.w * anchor - drawnW / 2 - bounds.minX * unit);
      const originY = Math.round(field.y + trackBand + Math.max(0, heightBudget - drawnH) / 2 - bounds.minY * unit);
      const su = unit * 2;
      const sv = unit;
      const project = function (x, y, z) {
        return [
          originX + (x - y) * su,
          originY + (x + y) * sv - z * sv * 2
        ];
      };

      function centerOf(box) {
        return {
          x: box.x + box.w / 2,
          y: box.y + box.d / 2,
          z: box.z + box.h / 2
        };
      }

      function axisPts(a, b) {
        const pts = [project(a.x, a.y, a.z)];
        if (b.x !== a.x) pts.push(project(b.x, a.y, a.z));
        if (b.y !== a.y) pts.push(project(b.x, b.y, a.z));
        if (b.z !== a.z) pts.push(project(b.x, b.y, b.z));
        return pts;
      }

      function compile(flags) {
        const xy = [];
        const pauses = [];
        const segs = [];
        let total = 0;
        let busAt = 0;
        let memAt = 0;
        let coreAt = 0;
        let swapAt = 1e9;
        for (let i = 0; i < flags.length; i++) {
          const p = flags[i];
          const last = xy[xy.length - 1];
          if (last && last[0] === p.x && last[1] === p.y) {
            if (p.bus) busAt = total;
            if (p.mem) memAt = total;
            if (p.core) coreAt = total;
            if (p.swap) swapAt = total;
            if (p.pause) pauses.push({ at: total, hold: p.hold || 0.12 });
            continue;
          }
          if (last) {
            const len = Math.hypot(p.x - last[0], p.y - last[1]);
            segs.push(len);
            total += len;
          }
          xy.push([p.x, p.y]);
          if (p.bus) busAt = total;
          if (p.mem) memAt = total;
          if (p.core) coreAt = total;
          if (p.swap) swapAt = total;
          if (p.pause) pauses.push({ at: total, hold: p.hold || 0.12 });
        }
        return {
          points: xy,
          segs: segs,
          total: Math.max(1, total),
          pauses: pauses,
          busAt: busAt,
          memAt: memAt,
          coreAt: coreAt,
          swapAt: swapAt
        };
      }

      const memBoxes = boxes.filter(function (b) { return b.role === 'mem'; });
      const branchBoxes = boxes.filter(function (b) { return b.role === 'branch'; });
      const core = boxes.filter(function (b) { return b.role === 'core'; })[0];
      const coreCell = centerOf(core);
      const wires = [];
      const forwards = [];
      const backs = [];

      const gap = Math.max(7, unit + 2);
      const trackLen = Math.max(52, Math.min(narrow ? 88 : 132, unit * 18));
      const tops = [];
      const mids = [];
      const cells = [];
      let minTop = Infinity;
      for (let lane = 0; lane < memBoxes.length; lane++) {
        const box = memBoxes[lane];
        const cell = centerOf(box);
        cells.push(cell);
        const top = project(cell.x, cell.y, box.z + box.h);
        const mid = project(cell.x, cell.y, cell.z);
        tops.push(top);
        mids.push(mid);
        if (top[1] < minTop) minTop = top[1];
      }
      const bandTop = Math.max(field.y + 2, minTop - 8 - memBoxes.length * gap);
      for (let lane = 0; lane < memBoxes.length; lane++) {
        const box = memBoxes[lane];
        const cell = cells[lane];
        const top = tops[lane];
        const mid = mids[lane];
        let trackY = Math.round(bandTop + lane * gap);
        if (trackY > top[1] - 8) trackY = top[1] - 8;
        let spawnX = top[0] + trackLen;
        if (spawnX > w - 8) spawnX = w - 8;
        if (spawnX < top[0] + 28) spawnX = top[0] + 28;
        const trackEnd = [top[0], trackY];
        const spawn = [spawnX, trackY];
        wires.push({ color: box.color, pts: [spawn, trackEnd, top, mid] });
        const routeToCore = axisPts(cell, coreCell);
        wires.push({ color: shade(box.color, 0.55), pts: routeToCore });
        const rail = shade(box.color, 0.75);
        for (let x = trackEnd[0] + 8; x < spawn[0]; x += 8) {
          wires.push({ color: rail, pts: [[x, trackY - 2], [x, trackY + 2]] });
        }
        for (let y = Math.min(trackY, top[1]); y < Math.max(trackY, top[1]); y += 5) {
          wires.push({ color: rail, pts: [[top[0] - 2, y], [top[0] + 2, y]] });
        }
        wires.push({ color: rail, pts: [[top[0] - 2, trackY], [top[0] - 2, top[1]]] });
        forwards[lane] = [];
        for (let br = 0; br < branchBoxes.length; br++) {
          const branch = branchBoxes[br];
          const nearCell = { x: branch.x, y: branch.y + 1, z: branch.z + 1 };
          const farCell = { x: branch.x + branch.w, y: branch.y + 1, z: branch.z + 1 };
          const near = project(nearCell.x, nearCell.y, nearCell.z);
          const far = project(farCell.x, farCell.y, farCell.z);
          const via = axisPts(nearCell, coreCell);
          const flags = [
            { x: spawn[0], y: spawn[1] },
            { x: trackEnd[0], y: trackEnd[1], bus: true },
            { x: top[0], y: top[1] },
            { x: mid[0], y: mid[1], mem: true, pause: true, hold: 0.2 }
          ];
          for (let s = 1; s < routeToCore.length; s++) flags.push({ x: routeToCore[s][0], y: routeToCore[s][1] });
          flags[flags.length - 1].core = true;
          flags[flags.length - 1].swap = true;
          flags[flags.length - 1].pause = true;
          flags[flags.length - 1].hold = 0.12;
          flags.push({ x: near[0], y: near[1] });
          flags.push({ x: far[0], y: far[1] });
          forwards[lane][br] = compile(flags);
          if (lane === 0) {
            const back = [{ x: far[0], y: far[1] }, { x: near[0], y: near[1] }];
            for (let s = 1; s < via.length; s++) back.push({ x: via[s][0], y: via[s][1] });
            backs[br] = compile(back);
            wires.push({ color: shade(branch.color, 0.5), pts: via });
            wires.push({ color: shade(branch.color, 0.8), pts: [near, far] });
          }
        }
      }

      const floor = [];
      for (let x = 0; x <= 28; x += 2) {
        floor.push([project(x, 0, 0), project(x, 22, 0)]);
      }
      for (let y = 0; y <= 22; y += 2) {
        floor.push([project(0, y, 0), project(28, y, 0)]);
      }

      world = {
        w: w,
        h: h,
        unit: unit,
        project: project,
        boxes: boxes,
        core: core,
        memBoxes: memBoxes,
        wires: wires,
        floor: floor,
        forwards: forwards,
        backs: backs,
        text: text,
        metrics: metrics,
        debug: debug,
        narrow: narrow,
        textLines: textLines,
        fwdSpeed: Math.max(40, unit * 16),
        backSpeed: Math.max(20, unit * 8)
      };
      killAll();
    }

    function pointAt(path, dist) {
      let left = dist;
      const pts = path.points;
      const segs = path.segs;
      for (let i = 0; i < segs.length; i++) {
        const len = segs[i];
        if (left <= len || i === segs.length - 1) {
          const t = len > 0.001 ? Math.max(0, Math.min(1, left / len)) : 0;
          return {
            x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
            y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
          };
        }
        left -= len;
      }
      const last = pts[pts.length - 1];
      return { x: last[0], y: last[1] };
    }

    function obtain() {
      for (let i = 0; i < pool.length; i++) if (!pool[i].alive) return pool[i];
      if (pool.length >= 460) {
        let victim = pool[0];
        let oldest = victim.serial || 0;
        for (let i = 1; i < pool.length; i++) {
          const serial = pool[i].serial || 0;
          if (serial < oldest) {
            oldest = serial;
            victim = pool[i];
          }
        }
        return victim;
      }
      const created = { alive: false, serial: 0 };
      pool.push(created);
      return created;
    }

    let serial = 1;

    function launch(path, spec) {
      if (!path || path.points.length < 2) return;
      const p = obtain();
      p.alive = true;
      p.serial = serial++;
      p.path = path;
      p.dist = 0;
      p.pauseLeft = 0;
      p.pauseIndex = 0;
      p.speed = spec.speed;
      p.kind = spec.kind;
      p.chIn = spec.chIn;
      p.chOut = spec.chOut;
      p.laneColor = spec.laneColor;
      p.ok = spec.ok;
      p.offsetX = spec.offsetX || 0;
      p.offsetY = spec.offsetY || 0;
      const pos = pointAt(path, 0);
      p.x = pos.x + p.offsetX;
      p.y = pos.y + p.offsetY;
    }

    function shownChar(ch) {
      if (ch == null || ch === '') return ' ';
      return ch;
    }

    function spawnForward(event) {
      if (!world || !world.forwards.length) return;
      const lane = event.step % world.forwards.length;
      const branch = event.pred % world.backs.length;
      const path = world.forwards[lane][branch];
      launch(path, {
        speed: world.fwdSpeed,
        kind: 'fwd',
        chIn: shownChar(event.lanes[4]),
        chOut: shownChar(event.next),
        laneColor: LANES[lane],
        ok: !!event.correct
      });
    }

    function spawnError(event, scale) {
      if (!world || !world.backs.length || event.correct) return;
      const branch = event.pred % world.backs.length;
      const path = world.backs[branch];
      const mag = Number.isFinite(event.loss) ? event.loss : 1;
      const base = 1 + Math.floor(Math.min(5, mag));
      const count = Math.max(1, Math.round(base * (scale == null ? 1 : scale)));
      const ch = shownChar(event.next);
      for (let k = 0; k < count; k++) {
        launch(path, {
          speed: world.backSpeed,
          kind: 'back',
          chIn: ch,
          chOut: ch,
          laneColor: RED,
          ok: false,
          offsetX: (k % 2 === 0 ? -1 : 1) * Math.max(1, Math.round(world.unit / 2)),
          offsetY: (k - (count - 1) / 2) * Math.max(2, world.unit)
        });
      }
      flash = 1;
    }

    function drawBox(box, project, override) {
      const color = override || box.color;
      const dark = shade(color, 0.4);
      const x = box.x;
      const y = box.y;
      const z = box.z;
      const w = box.w;
      const d = box.d;
      const h = box.h;
      const p = function (dx, dy, dz) { return project(x + dx, y + dy, z + dz); };
      const A = p(0, 0, 0);
      const B = p(w, 0, 0);
      const C = p(w, d, 0);
      const D = p(0, d, 0);
      const E = p(0, 0, h);
      const F = p(w, 0, h);
      const G = p(w, d, h);
      const H = p(0, d, h);
      edge(A, B, dark);
      edge(A, D, dark);
      edge(A, E, dark);
      edge(B, C, color);
      edge(D, C, color);
      edge(B, F, color);
      edge(D, H, color);
      edge(E, F, color);
      edge(F, G, color);
      edge(G, H, color);
      edge(H, E, color);
      edge(C, G, color);
      if (h >= 4) {
        const m = h / 2;
        edge(p(0, 0, m), p(w, 0, m), dark);
        edge(p(w, 0, m), p(w, d, m), dark);
        edge(p(w, d, m), p(0, d, m), dark);
        edge(p(0, d, m), p(0, 0, m), dark);
      }
    }

    function drawLeds(project) {
      const core = world.core;
      const colsN = 8;
      const rowsN = 4;
      const size = world.unit >= 4 ? 2 : 1;
      for (let j = 0; j < hidden.length && j < colsN * rowsN; j++) {
        const u = (j % colsN + 0.5) / colsN;
        const v = (Math.floor(j / colsN) + 0.5) / rowsN;
        const px = core.x + core.w * (0.16 + 0.68 * u);
        const py = core.y + core.d * (0.16 + 0.68 * v);
        const pt = project(px, py, core.z + core.h);
        const value = hidden[j] || 0;
        let color;
        if (value < -0.04) {
          const bucket = Math.max(0, Math.min(7, Math.floor(Math.min(1, -value / 0.4) * 7)));
          color = REDS[bucket];
        } else {
          const bucket = Math.max(0, Math.min(7, Math.floor(Math.min(1, value / 1.7) * 7)));
          color = BLUES[bucket];
        }
        ctx.fillStyle = color;
        ctx.fillRect(pt[0] - (size === 2 ? 1 : 0), pt[1] - (size === 2 ? 1 : 0), size, size);
      }
    }

    function drawMachineLabels(project) {
      for (let i = 0; i < world.memBoxes.length; i++) {
        const box = world.memBoxes[i];
        const cx = box.x + box.w / 2;
        const cy = box.y + box.d / 2;
        const top = project(cx, cy, box.z + box.h);
        drawGlyph(shownChar(hud.lanes[i]), top[0] - advance / 2, top[1] - fontPx - 2, box.color);
      }
      const core = world.core;
      const face = project(core.x + core.w, core.y + core.d / 2, core.z + core.h / 2);
      const color = hud.total === 0 ? WHITE : (hud.correct ? GREEN : RED);
      drawGlyph(shownChar(hud.next), face[0] - advance / 2, face[1] - fontPx / 2, color);
    }

    function clipText(rect, draw) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x + 2, rect.y + 2, Math.max(0, rect.w - 4), Math.max(0, rect.h - 4));
      ctx.clip();
      draw();
      ctx.restore();
    }

    function drawTextPanel() {
      const rect = world.text;
      panel(rect);
      clipText(rect, function () {
        drawText('TEXT IN', rect.x + 6, rect.y + 5, YELLOW);
        const room = Math.max(1, Math.floor((rect.h - 10 - lineH) / lineH));
        const start = Math.max(0, lines.length - room);
        let y = rect.y + 5 + lineH;
        const blink = Math.floor(performance.now() / 420) % 2 === 0;
        for (let i = start; i < lines.length; i++) {
          const num = String(numbers[i]).padStart(3, ' ');
          drawText(num, rect.x + 6, y, ORANGE);
          const color = i === lines.length - 1 ? WHITE : DIM_TEXT;
          drawText(lines[i], rect.x + 6 + advance * 4, y, color);
          if (blink && i === lines.length - 1) {
            const cx = rect.x + 6 + advance * 4 + lines[i].length * advance;
            ctx.fillStyle = ORANGE;
            ctx.fillRect(cx, y, Math.max(2, advance - 2), fontPx);
          }
          y += lineH;
        }
      });
    }

    function drawMetrics() {
      const rect = world.metrics;
      panel(rect);
      clipText(rect, function () {
        const x = rect.x + 6;
        const right = rect.x + rect.w - 6;
        let y = rect.y + 5;
        const rows = [
          ['STEP', String(hud.step)],
          ['LETTERS IN', String(hud.letters)],
          ['WAITING', String(hud.waiting)],
          ['IN MEMORY', String(memoryCount)],
          ['WEIGHTS (BURNED)', String(hud.burned)]
        ];
        for (let i = 0; i < rows.length; i++) {
          drawText(rows[i][0], x, y, DIM_TEXT);
          drawTextRight(rows[i][1], right, y, WHITE);
          y += lineH;
        }
        y += 4;
        drawText('LANES', x, y, YELLOW);
        const cell = advance + 4;
        let cx = x + advance * 6 + 4;
        const maxX = right - cell;
        for (let i = 0; i < 5; i++) {
          if (cx > maxX) break;
          hudLine(cx, y - 1, cx + cell, y - 1, LANES[i]);
          hudLine(cx, y + lineH - 2, cx + cell, y + lineH - 2, LANES[i]);
          hudLine(cx, y - 1, cx, y + lineH - 2, LANES[i]);
          hudLine(cx + cell, y - 1, cx + cell, y + lineH - 2, LANES[i]);
          const ch = shownChar(hud.lanes[i]);
          if (ch === ' ' || ch === '\n') {
            ctx.fillStyle = LANES[i];
            ctx.fillRect(cx + 3, y + lineH - 7, Math.max(2, cell - 6), 2);
          } else {
            drawGlyph(ch, cx + 2, y, WHITE);
          }
          cx += cell + 3;
        }
      });
    }

    function drawDebug() {
      const rect = world.debug;
      panel(rect);
      clipText(rect, function () {
        const x = rect.x + 6;
        const right = rect.x + rect.w - 6;
        let y = rect.y + 5;
        drawText('DEBUG', x, y, YELLOW);
        y += lineH;
        const pct = hud.total ? Math.round(100 * hud.hits / hud.total) : 0;
        const rightText = hud.hits + ' / ' + hud.total + '  ' + pct + '%';
        const said = shownChar(hud.said);
        const next = shownChar(hud.next);
        const saidLabel = said === ' ' ? '\u00b7' : (said === '\n' ? '\u21b5' : said);
        const nextLabel = next === ' ' ? '\u00b7' : (next === '\n' ? '\u21b5' : next);
        const rows = [
          ['POS', String(hud.pos), YELLOW],
          ['SAID', saidLabel, WHITE],
          ['NEXT', nextLabel, hud.total === 0 ? WHITE : (hud.correct ? GREEN : RED)],
          ['RIGHT', rightText, hud.correct ? GREEN : WHITE]
        ];
        for (let i = 0; i < rows.length; i++) {
          drawText(rows[i][0], x, y, DIM_TEXT);
          drawTextRight(rows[i][1], right, y, rows[i][2]);
          y += lineH;
        }
      });
    }

    function colorOf(p) {
      if (p.kind === 'back') return RED;
      const path = p.path;
      if (p.dist < path.busAt) return WHITE;
      if (p.dist < path.memAt) return p.laneColor;
      if (p.dist < path.coreAt) return YELLOW;
      return p.ok ? GREEN : RED;
    }

    function resize() {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 2 || cssH < 2) return;
      const nextW = Math.max(2, Math.floor(cssW));
      const nextH = Math.max(2, Math.floor(cssH));
      if (canvas.width !== nextW || canvas.height !== nextH || !world) {
        canvas.width = nextW;
        canvas.height = nextH;
        layout();
      }
    }

    function update(dt) {
      const step = dt > 0 ? dt : 0;
      if (flash > 0) flash = Math.max(0, flash - step * 2.4);
      memoryCount = 0;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.alive) continue;
        if (p.pauseLeft > 0) {
          p.pauseLeft -= step;
          if (p.pauseLeft < 0) p.pauseLeft = 0;
        } else if (step > 0) {
          p.dist += p.speed * step;
          const pauses = p.path.pauses;
          if (p.pauseIndex < pauses.length && p.dist >= pauses[p.pauseIndex].at) {
            p.dist = pauses[p.pauseIndex].at;
            p.pauseLeft = pauses[p.pauseIndex].hold;
            p.pauseIndex += 1;
          }
          if (p.dist >= p.path.total) {
            p.alive = false;
            continue;
          }
        }
        const pos = pointAt(p.path, p.dist);
        p.x = pos.x + p.offsetX;
        p.y = pos.y + p.offsetY;
        if (p.kind === 'fwd' && p.dist >= p.path.memAt && p.dist < p.path.coreAt) memoryCount += 1;
      }
    }

    function draw() {
      if (!world || world.w !== canvas.width || world.h !== canvas.height) layout();
      if (!world) return;
      ctx.imageSmoothingEnabled = false;
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, world.w, world.h);

      for (let i = 0; i < world.floor.length; i++) {
        edge(world.floor[i][0], world.floor[i][1], FLOOR);
      }
      for (let i = 0; i < world.wires.length; i++) {
        const wire = world.wires[i];
        for (let s = 1; s < wire.pts.length; s++) edge(wire.pts[s - 1], wire.pts[s], wire.color);
      }
      const ordered = world.boxes.slice().sort(function (a, b) {
        return (a.x + a.y + a.z * 0.2) - (b.x + b.y + b.z * 0.2);
      });
      for (let i = 0; i < ordered.length; i++) {
        const box = ordered[i];
        const override = box.role === 'core' && flash > 0.35 ? WHITE : null;
        drawBox(box, world.project, override);
      }
      flushEdges();
      drawLeds(world.project);
      drawMachineLabels(world.project);

      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.alive) continue;
        const ch = p.dist >= p.path.swapAt ? p.chOut : p.chIn;
        drawGlyph(shownChar(ch), p.x - advance / 2, p.y - fontPx / 2, colorOf(p));
      }

      drawTextPanel();
      drawMetrics();
      drawDebug();
    }

    return {
      resize: resize,
      update: update,
      draw: draw,
      pushChar: function (ch) {
        raw += ch;
        if (raw.length > 4500) {
          raw = raw.slice(-2800);
          reflow();
          return;
        }
        if (ch === '\n') {
          lines.push('');
          numbers.push(numbers[numbers.length - 1] + 1);
        } else if (lines[lines.length - 1].length >= cols) {
          lines.push(ch);
          numbers.push(numbers[numbers.length - 1] + 1);
        } else {
          lines[lines.length - 1] += ch;
        }
        if (lines.length > 160) {
          lines.shift();
          numbers.shift();
        }
      },
      spawnForward: spawnForward,
      spawnError: spawnError,
      setHud: function (event) {
        hud.step = event.step || 0;
        hud.letters = event.letters || 0;
        hud.waiting = event.waiting || 0;
        hud.burned = event.burned || 0;
        hud.hits = event.hits || 0;
        hud.total = event.total || 0;
        hud.pos = event.pos || 0;
        hud.said = event.said == null ? ' ' : event.said;
        hud.next = event.next == null ? ' ' : event.next;
        hud.correct = !!event.correct;
        if (event.lanes) {
          for (let i = 0; i < 5; i++) hud.lanes[i] = event.lanes[i] == null ? ' ' : event.lanes[i];
        }
      },
      setHidden: function (src) {
        if (!src) return;
        if (hidden.length !== src.length) hidden = new Float32Array(src.length);
        hidden.set(src);
      },
      clearParticles: killAll,
      resetText: function () {
        raw = '';
        lines = [''];
        numbers = [1];
      },
      resetHud: function (waiting) {
        hud = blankHud();
        hud.waiting = waiting || 0;
      },
      memoryCount: function () { return memoryCount; },
      hud: function () { return hud; }
    };
  }

  return { createStage: createStage };
});
