(function () {
  const api = window.Unravel;

  const canvas = document.querySelector('#loom');
  const ctx = canvas.getContext('2d', { alpha: false });
  const tokenInput = document.querySelector('#token');
  const tokenOut = document.querySelector('#token-out');
  const scrubInput = document.querySelector('#scrub');
  const scrubOut = document.querySelector('#scrub-out');
  const conditionEl = document.querySelector('#condition');
  const blurbEl = document.querySelector('#blurb');
  const countEl = document.querySelector('#transfer-count');
  const holderEl = document.querySelector('#holder');
  const dyeEl = document.querySelector('#dye');
  const fpsEl = document.querySelector('#fps');
  const ledgerEl = document.querySelector('#ledger');
  const swatchEl = document.querySelector('#swatches');
  const previewFlag = document.querySelector('#preview-flag');
  const previewNote = document.querySelector('#preview-note');
  const motionNote = document.querySelector('#motion-note');
  const playBtn = document.querySelector('#play');
  const transferBtn = document.querySelector('#transfer');
  const resetBtn = document.querySelector('#reset');

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ends = [];
  for (let i = 0; i < 16; i += 1) ends.push({ x: 0, y: 0, rgb: [0, 0, 0], width: 1, alpha: 1 });
  let endCount = 0;
  let grain = null;
  let noise = null;
  let design = null;
  let token = 0;
  let owned = 0;
  let preview = 0;
  let paused = reduceQuery.matches;
  let pauseStarted = 0;
  let offset = 0;
  const t0 = performance.now();
  let frames = 0;
  let fpsStamp = t0;

  document.querySelector('#prev').addEventListener('click', function () { setToken(token - 1); });
  document.querySelector('#next').addEventListener('click', function () { setToken(token + 1); });
  tokenInput.addEventListener('input', function () { setToken(tokenInput.value); });
  scrubInput.addEventListener('input', function () {
    preview = clampPreview(scrubInput.value);
    syncReadout();
  });
  transferBtn.addEventListener('click', function () {
    owned += 1;
    preview = owned;
    syncReadout();
  });
  resetBtn.addEventListener('click', function () {
    owned = 0;
    preview = 0;
    syncReadout();
  });
  playBtn.addEventListener('click', togglePlay);
  window.addEventListener('hashchange', function () {
    const next = readHash();
    if (next !== token) setToken(next);
  });
  reduceQuery.addEventListener('change', function () {
    motionNote.hidden = !reduceQuery.matches;
    if (reduceQuery.matches && !paused) togglePlay();
  });
  motionNote.hidden = !reduceQuery.matches;
  if (paused) pauseStarted = performance.now();

  setToken(readHash(), true);
  requestAnimationFrame(loop);

  function readHash() {
    const match = /^#(\d+)/.exec(window.location.hash);
    if (!match) return 0;
    return api.clampToken(match[1]);
  }

  function setToken(value, skipHash) {
    token = api.clampToken(value);
    owned = 0;
    preview = 0;
    design = api.design(token);
    noise = makeNoise(design.seed);
    tokenInput.value = String(token);
    if (!skipHash) {
      const next = '#' + token;
      if (window.location.hash !== next) window.history.replaceState(null, '', next);
    }
    syncReadout();
  }

  function clampPreview(value) {
    const max = Math.max(api.PREVIEW_FLOOR, owned);
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(max, n));
  }

  function syncReadout() {
    const max = Math.max(api.PREVIEW_FLOOR, owned);
    scrubInput.max = String(max);
    preview = clampPreview(preview);
    scrubInput.value = String(preview);
    const shown = api.conditionAt(token, preview);
    const holder = api.addressFor(token, owned);
    tokenOut.textContent = '#' + token;
    scrubOut.textContent = String(preview);
    conditionEl.textContent = shown.name;
    conditionEl.dataset.condition = shown.name;
    blurbEl.textContent = shown.copy;
    countEl.textContent = String(owned);
    holderEl.textContent = api.shortAddress(holder);
    holderEl.title = holder;
    dyeEl.textContent = design.name;
    document.querySelector('#token-label').textContent = '#' + token;
    canvas.setAttribute('aria-label', 'Unravel #' + token + ', ' + shown.name + ', ' + preview + ' transfers on the loom.');
    const previewing = preview !== owned;
    previewFlag.hidden = !previewing;
    if (!previewing) {
      previewNote.textContent = 'The loom is the token in its current hands.';
    } else if (preview > owned) {
      previewNote.textContent = 'Previewing transfer ' + preview + '. Those later addresses are not on the ledger yet.';
    } else {
      previewNote.textContent = 'Previewing transfer ' + preview + '. The token has already moved on.';
    }
    paintSwatches();
    paintLedger();
    playBtn.textContent = paused ? 'Play' : 'Pause';
    playBtn.setAttribute('aria-pressed', paused ? 'false' : 'true');
  }

  function paintSwatches() {
    swatchEl.replaceChildren();
    design.dyes.forEach(function (hex) {
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = hex;
      dot.title = hex;
      swatchEl.appendChild(dot);
    });
  }

  function paintLedger() {
    const rows = api.ledger(token, Math.max(preview, owned), owned);
    ledgerEl.replaceChildren();
    rows.forEach(function (row) {
      if (row.index > Math.max(preview, 0) && row.index > owned) return;
      const item = document.createElement('li');
      if (row.preview) item.className = 'is-preview';
      if (row.current) item.classList.add('is-current');
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = row.kind;
      const addr = document.createElement('code');
      addr.textContent = api.shortAddress(row.address);
      addr.title = row.address;
      item.append(kind, addr);
      ledgerEl.appendChild(item);
    });
  }

  function togglePlay() {
    const now = performance.now();
    if (paused) {
      offset += (now - pauseStarted) / 1000;
      paused = false;
    } else {
      pauseStarted = now;
      paused = true;
    }
    playBtn.textContent = paused ? 'Play' : 'Pause';
    playBtn.setAttribute('aria-pressed', paused ? 'false' : 'true');
    if (paused) fpsEl.textContent = 'Held';
  }

  function clock(now) {
    if (paused) return (pauseStarted - t0) / 1000 - offset;
    return (now - t0) / 1000 - offset;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    draw(clock(now));
    if (paused) {
      fpsEl.textContent = 'Held';
      frames = 0;
      fpsStamp = now;
      return;
    }
    frames += 1;
    if (now - fpsStamp >= 500) {
      fpsEl.textContent = Math.round(frames * 1000 / (now - fpsStamp)) + ' fps';
      frames = 0;
      fpsStamp = now;
    }
  }

  function draw(time) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height || !design) return;
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shown = api.conditionAt(token, preview);
    const wear = shown.wear;
    const thresholds = shown.thresholds;
    const marginX = width * 0.09;
    const top = height * 0.07;
    const clothW = width - marginX * 2;
    const clothH = height * 0.76;
    const x0 = marginX;
    const x1 = marginX + clothW;
    const y0 = top;
    const y1 = top + clothH;
    const ground = hexRgb(design.ground);
    const warpRgb = hexRgb(design.warp);

    ctx.fillStyle = '#d9d0c2';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(48, 36, 24, 0.14)';
    ctx.fillRect(x0 + 10, y0 + 14, clothW, clothH);
    ctx.fillStyle = rgb(ground);
    ctx.fillRect(x0, y0, clothW, clothH);
    if (!grain) grain = makeGrain();
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ctx.createPattern(grain, 'repeat');
    ctx.fillRect(x0, y0, clothW, clothH);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0 - clothH * 0.08, clothW, clothH * 1.16);
    ctx.clip();

    const loosen = 1 + 4.4 * smoothstep(thresholds.mint, thresholds.fray, wear);
    const reform = smoothstep(thresholds.unravel, Math.min(api.WEAR_CAP, thresholds.unravel + 0.42), wear);
    endCount = 0;

    drawWarps(false);
    design.bands.forEach(function (band) { traceBand(band, 1.1, 0.55); });
    design.bands.forEach(function (band) { traceBand(band, 0, 1); });
    drawWarps(true);
    ctx.restore();
    drawEnds();
    drawFringe();

    ctx.fillStyle = '#5c4634';
    ctx.fillRect(x0 - 8, y0 - 8, clothW + 16, 9);
    ctx.fillStyle = '#2a211c';
    ctx.beginPath();
    ctx.arc(x0 + 12, y0 - 3.5, 2.2, 0, Math.PI * 2);
    ctx.arc(x1 - 12, y0 - 3.5, 2.2, 0, Math.PI * 2);
    ctx.fill();

    const shade = ctx.createLinearGradient(0, y0, 0, y0 + 28);
    shade.addColorStop(0, 'rgba(36, 24, 16, 0.16)');
    shade.addColorStop(1, 'rgba(36, 24, 16, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(x0, y0, clothW, 28);

    function warpX(i) {
      const span = clothW / design.warpCount;
      const n = noise(i * 0.17, time * 0.11);
      const room = span * (0.28 + reform * 0.55);
      return x0 + (i + 0.5) * span + (n - 0.5) * 2 * Math.min(room, 1.4 * loosen);
    }

    function pointAt(band, xn, x) {
      const fade = smoothstep(thresholds.fade, thresholds.unravel + 0.25, wear);
      const dissolve = band.carrier ? 0 : smoothstep(thresholds.fray, thresholds.unravel + 0.4, wear);
      const yWoven = y0 + band.y * clothH;
      const yNew = y0 + band.reformY * clothH;
      const amp = band.slot * clothH * 0.42 * loosen;
      const n = noise(xn * band.freq + band.phase, time * band.speed + band.phase);
      const wave = (n - 0.5) * 2 * amp;
      const tilt = (xn - 0.5) * reform * clothH * band.tilt;
      const open = gapOpen(band, xn);
      const rgb = mix(hexRgb(band.color), ground, fade * (band.carrier ? 0.25 : 0.58));
      let thickness = Math.max(2, band.slot * clothH * 0.64);
      if (band.carrier) thickness *= 1 + reform * 0.75;
      else thickness *= 1 - dissolve * 0.7;
      return {
        x: x,
        y: yWoven * (1 - reform) + yNew * reform + wave + tilt,
        open: open,
        rgb: rgb,
        alpha: Math.max(0, 1 - dissolve * 0.9),
        width: Math.max(1.2, thickness),
        xn: xn,
      };
    }

    function gapOpen(band, xn) {
      const dx = xn - design.void.x;
      const dy = band.y - design.void.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (band.carrier) {
        const opened = smoothstep(thresholds.unravel, Math.min(api.WEAR_CAP, thresholds.unravel + 0.35), wear);
        return opened > 0.2 && dist < design.void.r * (0.25 + 0.7 * opened);
      }
      if (wear < thresholds.fray) return false;
      const t = smoothstep(thresholds.fray, Math.min(api.WEAR_CAP, thresholds.unravel + 0.2), wear);
      const n = noise(xn * band.gapFreq * 0.72 + band.gapPhase, 4.2 + band.gapPhase * 0.02);
      const boost = Math.exp(-(dist * dist) / (2 * design.void.r * design.void.r));
      return n > 1 - t * (0.48 + 0.36 * boost);
    }

    function traceBand(band, yShift, alphaScale) {
      const step = 5;
      let drawing = false;
      let prev = null;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'bevel';
      function plot(x) {
        const xn = Math.min(1, Math.max(0, (x - x0) / clothW));
        const p = pointAt(band, xn, x);
        if (p.alpha < 0.04) {
          if (drawing) ctx.stroke();
          drawing = false;
          prev = p;
          return;
        }
        if (p.open) {
          if (drawing) {
            ctx.stroke();
            if (yShift === 0 && prev) rememberEnd(prev);
            drawing = false;
          }
          prev = p;
          return;
        }
        if (!drawing) {
          if (yShift === 0 && prev && prev.open) rememberEnd(p);
          ctx.beginPath();
          ctx.strokeStyle = rgba(p.rgb, p.alpha * alphaScale * (yShift ? 0.45 : 1));
          ctx.lineWidth = p.width * (yShift ? 1 : 1);
          ctx.moveTo(p.x, p.y + yShift);
          drawing = true;
        } else {
          ctx.lineTo(p.x, p.y + yShift);
        }
        prev = p;
      }
      for (let x = x0; x < x1; x += step) plot(x);
      plot(x1);
      if (drawing) ctx.stroke();
    }

    function rememberEnd(p) {
      if (!p || p.xn < 0.03 || p.xn > 0.97 || p.alpha < 0.2) return;
      if (endCount >= ends.length) return;
      if (endCount > 0 && Math.abs(ends[endCount - 1].x - p.x) < 28) return;
      const slot = ends[endCount];
      slot.x = p.x;
      slot.y = p.y;
      slot.rgb = p.rgb;
      slot.width = p.width;
      slot.alpha = p.alpha;
      endCount += 1;
    }

    function drawWarps(over) {
      ctx.lineCap = 'round';
      if (!over) {
        for (let i = 0; i < design.warpCount; i += 1) {
          const edge = i < 2 || i > design.warpCount - 3;
          const dyed = !edge && i % design.dyedWarpEvery === 0;
          const color = edge
            ? mix(warpRgb, [20, 12, 8], 0.25)
            : dyed
              ? mix(hexRgb(design.dyes[i % design.dyes.length]), ground, 0.35)
              : mix(warpRgb, ground, 0.62);
          const x = warpX(i);
          ctx.beginPath();
          ctx.moveTo(x, y0);
          const steps = 8;
          for (let s = 1; s <= steps; s += 1) {
            const y = y0 + (clothH * s) / steps;
            const n = noise(i * 0.2 + 8, time * 0.07 + y * 0.004);
            ctx.lineTo(x + (n - 0.5) * loosen * 0.7, y);
          }
          ctx.strokeStyle = rgba(color, edge ? 0.9 : 0.7);
          ctx.lineWidth = edge ? 2.1 : 0.85;
          ctx.stroke();
        }
        return;
      }
      const span = clothW / design.warpCount;
      design.bands.forEach(function (band, bandIndex) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < design.warpCount; i += 1) {
          if ((i + bandIndex) % 2 !== 0) continue;
          const x = warpX(i);
          const xn = Math.min(1, Math.max(0, (x - x0) / clothW));
          const p = pointAt(band, xn, x);
          if (p.open || p.alpha < 0.25) continue;
          const half = Math.max(1.2, p.width * 0.52);
          ctx.moveTo(x, p.y - half);
          ctx.lineTo(x, p.y + half);
          any = true;
        }
        if (!any) return;
        ctx.lineWidth = Math.max(0.8, span * 0.14);
        ctx.strokeStyle = rgba(mix(warpRgb, ground, 0.2), 0.72);
        ctx.stroke();
      });
    }

    function drawEnds() {
      if (wear < thresholds.fray) return;
      const reach = smoothstep(thresholds.fray, thresholds.unravel + 0.2, wear);
      ctx.lineCap = 'round';
      for (let i = 0; i < endCount; i += 1) {
        const end = ends[i];
        const n = noise(end.x * 0.02, time * 0.16 + i);
        const length = 12 + reach * (20 + (n * 48));
        const sway = (n - 0.5) * 2 * length * 0.55;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.quadraticCurveTo(end.x + sway * 0.35, end.y + length * 0.45, end.x + sway, end.y + length);
        ctx.strokeStyle = rgba(end.rgb, end.alpha);
        ctx.lineWidth = Math.max(1.1, end.width * 0.28);
        ctx.stroke();
      }
    }

    function drawFringe() {
      const grown = smoothstep(thresholds.mint, thresholds.unravel, wear);
      ctx.lineCap = 'round';
      for (let i = 0; i < design.warpCount; i += 1) {
        const x = warpX(i);
        const roll = hash01(design.seed, i);
        const length = 7 + grown * (i % 3 === 0 ? 18 + roll * 58 : 6 + roll * 10);
        const sway = (noise(i * 0.33, time * 0.14 + 2) - 0.5) * 2 * length * (0.12 + grown * 0.4);
        const color = i % design.dyedWarpEvery === 0 ? hexRgb(design.dyes[i % design.dyes.length]) : warpRgb;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.quadraticCurveTo(x + sway * 0.4, y1 + length * 0.55, x + sway, y1 + length);
        ctx.strokeStyle = rgba(color, 0.9);
        ctx.lineWidth = i < 2 || i > design.warpCount - 3 ? 2 : 1.15;
        ctx.stroke();
      }
    }
  }

  function makeNoise(seed) {
    function hash(ix, iy) {
      let n = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed) >>> 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    return function (x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const a = hash(x0, y0);
      const b = hash(x0 + 1, y0);
      const c = hash(x0, y0 + 1);
      const d = hash(x0 + 1, y0 + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  }

  function makeGrain() {
    const tile = document.createElement('canvas');
    tile.width = 128;
    tile.height = 128;
    const g = tile.getContext('2d');
    const image = g.createImageData(128, 128);
    let s = 123456789;
    for (let i = 0; i < image.data.length; i += 4) {
      s = (Math.imul(s ^ (s >>> 15), 0x6D2B79F5) + 0x9E3779B9) >>> 0;
      const v = 214 + (s & 31);
      image.data[i] = v;
      image.data[i + 1] = v - 6;
      image.data[i + 2] = v - 14;
      image.data[i + 3] = 36;
    }
    g.putImageData(image, 0, 0);
    return tile;
  }

  function hash01(seed, i) {
    let n = Math.imul((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0, 0x85EBCA6B);
    n = Math.imul(n ^ (n >>> 13), 0xC2B2AE35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function smoothstep(edge0, edge1, x) {
    if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  function rgb(c) {
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
})();
