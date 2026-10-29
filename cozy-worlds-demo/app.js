(function () {
  const W = window.CozyWorld;
  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');
  const caption = document.getElementById('caption');
  const seedInput = document.getElementById('seed');
  const hourInput = document.getElementById('hour');
  const cycleButton = document.getElementById('cycle');
  const status = document.getElementById('status');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ADJECTIVES = ['quiet', 'amber', 'mossy', 'little', 'lantern', 'willow', 'cedar', 'honey', 'misty', 'copper', 'pebble', 'sleepy'];
  const NOUNS = ['harbor', 'orchard', 'cabin', 'pond', 'ridge', 'meadow', 'ferry', 'hearth', 'grove', 'inlet', 'garden', 'wharf'];

  let world = null;
  let items = [];
  let yaw = -0.7;
  let pitch = 0.52;
  let zoom = 1;
  let time = 0.42;
  let playing = !reduced;
  let dragging = false;
  let vel = 0;
  let lastX = 0;
  let lastY = 0;
  let viewW = 1;
  let viewH = 1;
  let lastFrame = 0;

  if (!ctx) {
    caption.textContent = 'This browser cannot open a canvas.';
    return;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function say(text) { status.textContent = text; }

  function mix(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  function css(color, light, warm) {
    const n = clamp(light, 0, 1.6);
    const heat = warm || 0;
    return 'rgb(' +
      clamp(Math.round(color[0] * n + heat), 0, 255) + ',' +
      clamp(Math.round(color[1] * n + heat * 0.55), 0, 255) + ',' +
      clamp(Math.round(color[2] * n), 0, 255) + ')';
  }

  function vary(color, x, y) {
    const shift = ((x * 13 + y * 7) % 5) - 2;
    return [color[0] + shift * 3, color[1] + shift * 4, color[2] + shift * 2];
  }

  function heightAt(x, y) {
    if (x < 0 || y < 0 || x >= world.size || y >= world.size) return 0;
    return world.heights[y * world.size + x];
  }

  function slopeAt(x, y) {
    const h = heightAt(x, y);
    return Math.max(
      Math.abs(h - heightAt(x + 1, y)),
      Math.abs(h - heightAt(x - 1, y)),
      Math.abs(h - heightAt(x, y + 1)),
      Math.abs(h - heightAt(x, y - 1))
    );
  }

  function groundColor(x, y) {
    const h = heightAt(x, y);
    const palette = world.palette;
    if (h < world.water - 0.012) return mix(palette.water, [36, 64, 74], 0.55);
    if (h < world.water + 0.022) return palette.sand;
    if (h > 0.82) return mix(palette.grass, [214, 206, 176], clamp((h - 0.82) / 0.18, 0, 0.7));
    if (slopeAt(x, y) > 0.1) return palette.rock;
    return vary(palette.grass, x, y);
  }

  function project(x, y, z) {
    const dx = x - world.size / 2;
    const dy = y - world.size / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    const tile = 20 * zoom;
    return {
      x: viewW * 0.5 + (rx - ry) * tile,
      y: viewH * 0.60 + (rx + ry) * tile * pitch - z * tile * 0.95,
      depth: rx + ry,
    };
  }

  function depthAt(x, y, z) {
    const dx = x - world.size / 2;
    const dy = y - world.size / 2;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return (dx * c - dy * s) + (dx * s + dy * c) + (z || 0) * 0.02;
  }

  function daylight() {
    const sun = Math.sin((time - 0.25) * Math.PI * 2);
    return clamp((sun + 0.05) / 1.05, 0, 1);
  }

  function lampAt(x, y, light) {
    const hx = world.house.x + 1;
    const hy = world.house.y + 1;
    const dist = Math.hypot(x - hx, y - hy);
    return (1 - light) * Math.max(0, 1 - dist / 7.5);
  }

  function buildItems(next) {
    const list = [];
    for (let y = 0; y < next.size; y += 1) {
      for (let x = 0; x < next.size; x += 1) list.push({kind: 'cell', x: x, y: y});
    }
    next.trees.forEach(function (tree) { list.push({kind: 'tree', tree: tree}); });
    next.rocks.forEach(function (rock) { list.push({kind: 'rock', rock: rock}); });
    next.flowers.forEach(function (flower) { list.push({kind: 'flower', flower: flower}); });
    if (next.boat) list.push({kind: 'boat', boat: next.boat});
    list.push({kind: 'house'});
    return list;
  }

  function applySeed(seed, fromHash) {
    const parsed = W.seedFromHash('#' + String(seed || '')) || W.DEFAULT_SEED;
    world = W.generateWorld(parsed);
    items = buildItems(world);
    seedInput.value = world.seed;
    caption.textContent = W.describeWorld(world);
    canvas.setAttribute('aria-label', 'Tiny world, ' + caption.textContent + '. Drag to rotate.');
    if (!fromHash) {
      const next = W.hashForSeed(world.seed);
      if (location.hash !== next) history.replaceState(null, '', next);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function poly(points, color, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function facing(points) {
    const ax = points[1].x - points[0].x;
    const ay = points[1].y - points[0].y;
    const bx = points[points.length - 1].x - points[0].x;
    const by = points[points.length - 1].y - points[0].y;
    return ax * by - ay * bx;
  }

  function drawFace(points, color, stroke) {
    if (facing(points) <= 0) return;
    poly(points, color, stroke);
  }

  function zOf(h) { return h * 3.4; }

  function drawCell(x, y, light) {
    const h = heightAt(x, y);
    const topZ = zOf(h);
    const color = groundColor(x, y);
    const lamp = lampAt(x + 0.5, y + 0.5, light);
    const top = [
      project(x, y, topZ),
      project(x + 1, y, topZ),
      project(x + 1, y + 1, topZ),
      project(x, y + 1, topZ),
    ];
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const shades = [0.62, 0.74, 0.56, 0.7];
    for (let i = 0; i < dirs.length; i += 1) {
      const nx = x + dirs[i][0];
      const ny = y + dirs[i][1];
      const nh = heightAt(nx, ny);
      if (nh >= h - 0.004) continue;
      const base = zOf(Math.max(0, nh));
      let face;
      if (i === 0) face = [project(x + 1, y, base), project(x + 1, y + 1, base), project(x + 1, y + 1, topZ), project(x + 1, y, topZ)];
      else if (i === 1) face = [project(x, y + 1, base), project(x + 1, y + 1, base), project(x + 1, y + 1, topZ), project(x, y + 1, topZ)];
      else if (i === 2) face = [project(x, y + 1, base), project(x, y, base), project(x, y, topZ), project(x, y + 1, topZ)];
      else face = [project(x, y, base), project(x + 1, y, base), project(x + 1, y, topZ), project(x, y, topZ)];
      drawFace(face, css(color, (0.22 + 0.78 * light) * shades[i], lamp * 28));
    }
    poly(top, css(color, 0.34 + 0.8 * light, lamp * 36), h < world.water ? null : 'rgba(30, 24, 18, 0.1)');
    if (h < world.water) {
      const wz = zOf(world.water) + 0.04;
      const water = [
        project(x, y, wz),
        project(x + 1, y, wz),
        project(x + 1, y + 1, wz),
        project(x, y + 1, wz),
      ];
      ctx.globalAlpha = 0.9;
      poly(water, css(world.palette.water, 0.5 + 0.65 * light, lamp * 8));
      ctx.globalAlpha = 1;
    }
  }

  function drawTree(tree, light) {
    const h = heightAt(Math.floor(tree.x), Math.floor(tree.y));
    const base = project(tree.x, tree.y, zOf(h));
    const scale = tree.scale * zoom;
    const trunk = 16 * scale;
    const lamp = lampAt(tree.x, tree.y, light);
    ctx.fillStyle = css(world.palette.trunk, 0.3 + 0.7 * light, lamp * 20);
    ctx.fillRect(base.x - 2 * scale, base.y - trunk, 4 * scale, trunk);
    const leaf = tree.kind === 'blossom' ? world.palette.blossom : world.palette.leaf;
    const crown = css(leaf, 0.32 + 0.78 * light, lamp * 18);
    if (tree.kind === 'pine') {
      ctx.fillStyle = crown;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y - trunk - 34 * scale);
      ctx.lineTo(base.x + 16 * scale, base.y - trunk + 4 * scale);
      ctx.lineTo(base.x - 16 * scale, base.y - trunk + 4 * scale);
      ctx.fill();
      ctx.fillStyle = css(leaf, 0.24 + 0.6 * light, lamp * 10);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y - trunk - 18 * scale);
      ctx.lineTo(base.x + 12 * scale, base.y - 4 * scale);
      ctx.lineTo(base.x - 12 * scale, base.y - 4 * scale);
      ctx.fill();
      return;
    }
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.arc(base.x, base.y - trunk - 6 * scale, 13 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(base.x + 7 * scale, base.y - trunk + 2 * scale, 10 * scale, 0, Math.PI * 2);
    ctx.fill();
    if (tree.kind === 'blossom') {
      ctx.fillStyle = css([255, 214, 226], 0.5 + 0.5 * light, 20);
      ctx.beginPath();
      ctx.arc(base.x - 4 * scale, base.y - trunk - 2 * scale, 3 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRock(rock, light) {
    const h = heightAt(Math.floor(rock.x), Math.floor(rock.y));
    const z = zOf(h);
    const s = rock.scale;
    const top = [
      project(rock.x, rock.y, z + s),
      project(rock.x + s, rock.y, z + s * 0.8),
      project(rock.x + s * 0.7, rock.y + s, z + s * 0.45),
    ];
    poly(top, css(world.palette.rock, 0.3 + 0.75 * light, lampAt(rock.x, rock.y, light) * 16));
  }

  function drawFlower(flower, light) {
    const h = heightAt(Math.floor(flower.x), Math.floor(flower.y));
    if (h < world.water) return;
    const p = project(flower.x, flower.y, zOf(h) + 0.08);
    const petal = flower.hue > 0.5 ? [232, 120, 132] : [244, 206, 96];
    ctx.fillStyle = css(petal, 0.45 + 0.7 * light, lampAt(flower.x, flower.y, light) * 30);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBoat(boat, light) {
    const z = zOf(world.water) + 0.08;
    const hull = [
      project(boat.x - 0.35, boat.y, z),
      project(boat.x + 0.45, boat.y - 0.1, z + 0.12),
      project(boat.x + 0.35, boat.y + 0.45, z + 0.12),
      project(boat.x - 0.25, boat.y + 0.35, z),
    ];
    poly(hull, css([92, 58, 42], 0.35 + 0.7 * light));
  }

  function drawHouse(light) {
    const house = world.house;
    const x = house.x + 0.15;
    const y = house.y + 0.2;
    const z = zOf(house.ground);
    const w = 1.7;
    const d = 1.45;
    const wallH = 1.05;
    const palette = world.palette;
    const lamp = 1 - light;
    function box(x0, y0, z0, w0, d0, h0, color, bias) {
      const z1 = z0 + h0;
      const shade = bias || 1;
      const lit = css(color, (0.28 + 0.75 * light) * shade, lamp * 34);
      const side = css(color, (0.2 + 0.62 * light) * shade, lamp * 18);
      drawFace([
        project(x0, y0, z0), project(x0 + w0, y0, z0), project(x0 + w0, y0, z1), project(x0, y0, z1),
      ], side);
      drawFace([
        project(x0 + w0, y0, z0), project(x0 + w0, y0 + d0, z0), project(x0 + w0, y0 + d0, z1), project(x0 + w0, y0, z1),
      ], css(color, (0.18 + 0.5 * light) * shade, lamp * 12));
      drawFace([
        project(x0, y0 + d0, z0), project(x0 + w0, y0 + d0, z0), project(x0 + w0, y0 + d0, z1), project(x0, y0 + d0, z1),
      ], side);
      drawFace([
        project(x0, y0, z0), project(x0, y0 + d0, z0), project(x0, y0 + d0, z1), project(x0, y0, z1),
      ], lit);
      poly([
        project(x0, y0, z1), project(x0 + w0, y0, z1), project(x0 + w0, y0 + d0, z1), project(x0, y0 + d0, z1),
      ], css(color, 0.36 + 0.8 * light, lamp * 20));
    }
    box(x, y, z, w, d, wallH, palette.wall, 1);
    const eave = z + wallH;
    const peak = eave + 0.72;
    const midX = x + w / 2;
    const midY = y + d / 2;
    const roof = palette.roof;
    const roofLit = css(roof, 0.34 + 0.8 * light, lamp * 16);
    const roofSide = css(roof, 0.22 + 0.55 * light, lamp * 8);
    const peakP = project(midX, midY, peak);
    drawFace([project(x - 0.08, y - 0.08, eave), project(x + w + 0.08, y - 0.08, eave), peakP], roofLit);
    drawFace([project(x + w + 0.08, y - 0.08, eave), project(x + w + 0.08, y + d + 0.08, eave), peakP], roofSide);
    drawFace([project(x + w + 0.08, y + d + 0.08, eave), project(x - 0.08, y + d + 0.08, eave), peakP], roofLit);
    drawFace([project(x - 0.08, y + d + 0.08, eave), project(x - 0.08, y - 0.08, eave), peakP], roofSide);
    box(x + w - 0.38, y + 0.18, eave + 0.15, 0.28, 0.28, 0.48, mix(palette.rock, [90, 78, 70], 0.4), 0.9);
    const door = [
      project(x + 0.62, y, z),
      project(x + 1.08, y, z),
      project(x + 1.08, y, z + 0.62),
      project(x + 0.62, y, z + 0.62),
    ];
    drawFace(door, css([78, 52, 40], 0.4 + 0.5 * light, lamp * 10));
    const windowColor = mix([186, 214, 224], [255, 196, 120], lamp);
    const win = [
      project(x + w, y + 0.38, z + 0.42),
      project(x + w, y + 0.78, z + 0.42),
      project(x + w, y + 0.78, z + 0.78),
      project(x + w, y + 0.38, z + 0.78),
    ];
    drawFace(win, css(windowColor, 0.55 + lamp * 0.9, lamp * 80));
    return project(x + w - 0.24, y + 0.32, eave + 0.7);
  }

  function skyColors() {
    const stops = [
      {t: 0, top: [10, 16, 36], bottom: [24, 36, 64]},
      {t: 0.22, top: [20, 28, 58], bottom: [58, 68, 102]},
      {t: 0.32, top: [244, 176, 132], bottom: [150, 196, 220]},
      {t: 0.5, top: [126, 196, 232], bottom: [236, 246, 252]},
      {t: 0.72, top: [244, 150, 104], bottom: [108, 92, 150]},
      {t: 0.86, top: [32, 28, 64], bottom: [16, 22, 44]},
      {t: 1, top: [10, 16, 36], bottom: [24, 36, 64]},
    ];
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1].t < time) i += 1;
    const a = stops[i];
    const b = stops[i + 1];
    const u = (time - a.t) / (b.t - a.t);
    return {top: mix(a.top, b.top, u), bottom: mix(a.bottom, b.bottom, u)};
  }

  function drawSky(light) {
    const colors = skyColors();
    const sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, css(colors.top, 1));
    sky.addColorStop(1, css(colors.bottom, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);
    if (light < 0.45) {
      const starAlpha = (0.45 - light) / 0.45;
      const rng = mulberry(W.hashString(world.seed) ^ 0x51ed);
      for (let i = 0; i < 48; i += 1) {
        const x = rng() * viewW;
        const y = rng() * viewH * 0.55;
        const twinkle = reduced ? 1 : 0.65 + Math.sin(lastFrame / 400 + i) * 0.35;
        ctx.fillStyle = 'rgba(255, 248, 236, ' + (starAlpha * twinkle * 0.85) + ')';
        ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1.2, i % 5 === 0 ? 2 : 1.2);
      }
    }
    const arc = light > 0.02 && time > 0.18 && time < 0.84;
    const u = arc ? (time - 0.18) / 0.66 : (time < 0.5 ? time / 0.18 : (time - 0.84) / 0.16);
    const ang = Math.PI * (1 - clamp(arc ? (time - 0.18) / 0.66 : 0.5, 0, 1));
    const sx = viewW * 0.5 + Math.cos(ang) * viewW * 0.34;
    const sy = viewH * 0.46 - Math.sin(ang) * viewH * 0.30;
    ctx.beginPath();
    ctx.fillStyle = arc ? 'rgba(255, 236, 186, 0.95)' : 'rgba(232, 228, 214, 0.9)';
    ctx.arc(sx, sy, arc ? 22 : 12, 0, Math.PI * 2);
    ctx.fill();
    if (!arc) {
      ctx.beginPath();
      ctx.fillStyle = css(skyColors().top, 1);
      ctx.arc(sx + 5, sy - 3, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    void u;
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function draw() {
    const light = daylight();
    drawSky(light);
    ctx.fillStyle = 'rgba(48, 36, 24, ' + (0.10 + 0.12 * light) + ')';
    ctx.beginPath();
    ctx.ellipse(viewW * 0.5, viewH * 0.72, 210 * zoom, 48 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    let chimney = null;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'cell') item.depth = depthAt(item.x + 0.5, item.y + 0.5, 0);
      else if (item.kind === 'tree') item.depth = depthAt(item.tree.x, item.tree.y, 0.4);
      else if (item.kind === 'rock') item.depth = depthAt(item.rock.x, item.rock.y, 0.2);
      else if (item.kind === 'flower') item.depth = depthAt(item.flower.x, item.flower.y, 0.15);
      else if (item.kind === 'boat') item.depth = depthAt(item.boat.x, item.boat.y, 0.2);
      else item.depth = depthAt(world.house.x + 1, world.house.y + 1, 0.8);
    }
    items.sort(function (a, b) { return a.depth - b.depth; });
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'cell') drawCell(item.x, item.y, light);
      else if (item.kind === 'tree') drawTree(item.tree, light);
      else if (item.kind === 'rock') drawRock(item.rock, light);
      else if (item.kind === 'flower') drawFlower(item.flower, light);
      else if (item.kind === 'boat') drawBoat(item.boat, light);
      else chimney = drawHouse(light);
    }
    if (chimney) {
      for (let i = 0; i < 4; i += 1) {
        const age = reduced ? 0.3 + i * 0.15 : ((lastFrame / 1400) + i * 0.25) % 1;
        ctx.fillStyle = 'rgba(255, 250, 244, ' + ((1 - age) * (0.18 + (1 - light) * 0.15)) + ')';
        ctx.beginPath();
        ctx.arc(chimney.x + Math.sin(age * 6 + i) * 4, chimney.y - age * 36 * zoom, (3 + age * 7) * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const vignette = ctx.createRadialGradient(viewW * 0.5, viewH * 0.5, viewW * 0.2, viewW * 0.5, viewH * 0.55, viewW * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(16, 18, 28, ' + (0.08 + (1 - light) * 0.22) + ')');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    if (playing) {
      time = (time + dt * 0.035) % 1;
      hourInput.value = String(Math.round(time * 1000));
    }
    if (!dragging && !reduced) {
      yaw += vel;
      vel *= 0.92;
    }
    draw();
    requestAnimationFrame(frame);
  }

  function reroll() {
    let seed = world.seed;
    for (let i = 0; i < 6 && seed === world.seed; i += 1) {
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      const n = 10 + Math.floor(Math.random() * 90);
      seed = adj + '-' + noun + '-' + n;
    }
    applySeed(seed, false);
    say('New island, seed ' + world.seed + '.');
  }

  canvas.addEventListener('pointerdown', function (event) {
    dragging = true;
    vel = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    yaw += dx * 0.008;
    pitch = clamp(pitch + dy * 0.0016, 0.36, 0.72);
    vel = dx * 0.008;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  function endDrag() { dragging = false; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    zoom = clamp(zoom * (event.deltaY > 0 ? 0.94 : 1.06), 0.62, 1.85);
  }, {passive: false});
  canvas.addEventListener('dblclick', function () {
    yaw = -0.7;
    pitch = 0.52;
    zoom = 1;
    say('View reset.');
  });

  document.getElementById('reroll').addEventListener('click', reroll);
  document.getElementById('copy').addEventListener('click', function () {
    const link = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        say('Link copied. The seed is ' + world.seed + '.');
      }, function () {
        say('The seed is in the address bar: ' + world.seed + '.');
      });
      return;
    }
    say('The seed is in the address bar: ' + world.seed + '.');
  });
  seedInput.addEventListener('change', function () {
    applySeed(seedInput.value, false);
    say('Showing ' + world.seed + '.');
  });
  hourInput.addEventListener('input', function () {
    time = Number(hourInput.value) / 1000;
    playing = false;
    cycleButton.setAttribute('aria-pressed', 'false');
    cycleButton.textContent = 'Day cycle';
  });
  document.querySelectorAll('[data-time]').forEach(function (button) {
    button.addEventListener('click', function () {
      time = Number(button.dataset.time);
      hourInput.value = String(Math.round(time * 1000));
      playing = false;
      cycleButton.setAttribute('aria-pressed', 'false');
      cycleButton.textContent = 'Day cycle';
      say(button.textContent + ' on ' + world.seed + '.');
    });
  });
  cycleButton.addEventListener('click', function () {
    playing = !playing;
    cycleButton.setAttribute('aria-pressed', playing ? 'true' : 'false');
    cycleButton.textContent = playing ? 'Pause cycle' : 'Day cycle';
  });
  cycleButton.textContent = playing ? 'Pause cycle' : 'Day cycle';
  cycleButton.setAttribute('aria-pressed', playing ? 'true' : 'false');

  window.addEventListener('hashchange', function () {
    const next = W.seedFromHash(location.hash);
    if (next && next !== world.seed) applySeed(next, true);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('keydown', function (event) {
    const typing = document.activeElement === seedInput;
    if (event.key === '[' ) yaw -= 0.15;
    else if (event.key === ']') yaw += 0.15;
    else if ((event.key === 'r' || event.key === 'R') && !typing && !event.metaKey && !event.ctrlKey) reroll();
  });

  const initial = W.seedFromHash(location.hash) || W.DEFAULT_SEED;
  applySeed(initial, !!W.seedFromHash(location.hash));
  if (!location.hash) history.replaceState(null, '', W.hashForSeed(world.seed));
  hourInput.value = String(Math.round(time * 1000));
  resize();
  say('Drag to turn ' + world.seed + '. Scroll to zoom.');
  requestAnimationFrame(frame);
})();
