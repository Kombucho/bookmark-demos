// A small heightfield, plus trees and rocks, for the painted walk.
// Pure data. No canvas, no network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PaintedWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GRID = 56;
  const SPAN = 72;

  function hashString(text) {
    let h = 2166136261;
    const str = String(text);
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

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

  function hash2(ix, iz, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed | 0, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise(x, z, seed) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const tz = z - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const v00 = hash2(x0, z0, seed);
    const v10 = hash2(x0 + 1, z0, seed);
    const v01 = hash2(x0, z0 + 1, seed);
    const v11 = hash2(x0 + 1, z0 + 1, seed);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sz;
  }

  function fbm(x, z, seed) {
    let amp = 0.5;
    let sum = 0;
    let norm = 0;
    let freq = 1;
    for (let i = 0; i < 5; i += 1) {
      sum += amp * valueNoise(x * freq, z * freq, seed + i * 101);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function heightAt(x, z, seed, span) {
    const n = fbm(x * 0.042, z * 0.042, seed);
    const ridge = fbm(x * 0.02 + 8.2, z * 0.02 - 3.1, seed + 11);
    const dx = (x - span * 0.5) / (span * 0.5);
    const dz = (z - span * 0.5) / (span * 0.5);
    const bowl = dx * dx + dz * dz;
    return n * 2.4 + Math.pow(ridge, 1.2) * 6.4 + bowl * 2.2;
  }

  function sampleHeight(world, x, z) {
    const n = world.grid;
    const span = world.span;
    const fx = clamp(x / span * n, 0, n);
    const fz = clamp(z / span * n, 0, n);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(n, x0 + 1);
    const z1 = Math.min(n, z0 + 1);
    const tx = fx - x0;
    const tz = fz - z0;
    const at = function (ix, iz) { return world.heights[iz * (n + 1) + ix]; };
    const a = at(x0, z0) * (1 - tx) + at(x1, z0) * tx;
    const b = at(x0, z1) * (1 - tx) + at(x1, z1) * tx;
    return a * (1 - tz) + b * tz;
  }

  function slopeAt(heights, n, span, ix, iz) {
    const hL = heights[iz * (n + 1) + Math.max(0, ix - 1)];
    const hR = heights[iz * (n + 1) + Math.min(n, ix + 1)];
    const hD = heights[Math.max(0, iz - 1) * (n + 1) + ix];
    const hU = heights[Math.min(n, iz + 1) * (n + 1) + ix];
    const step = span / n;
    const sx = (hR - hL) / (step * ((ix === 0 || ix === n) ? 1 : 2));
    const sz = (hU - hD) / (step * ((iz === 0 || iz === n) ? 1 : 2));
    const ny = 1 / Math.sqrt(sx * sx + sz * sz + 1);
    return { slope: 1 - ny, nx: -sx, ny: ny, nz: -sz };
  }

  function emptyMesh() {
    return { positions: [], normals: [], colors: [], indices: [] };
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function addTriangle(buf, a, b, c, color) {
    const ab = sub(b, a);
    const ac = sub(c, a);
    const raw = cross(ab, ac);
    const len = Math.hypot(raw[0], raw[1], raw[2]);
    if (len < 1e-8) return;
    const n = [raw[0] / len, raw[1] / len, raw[2] / len];
    const base = buf.positions.length / 3;
    const verts = [a, b, c];
    for (let i = 0; i < 3; i += 1) {
      buf.positions.push(verts[i][0], verts[i][1], verts[i][2]);
      buf.normals.push(n[0], n[1], n[2]);
      buf.colors.push(color[0], color[1], color[2]);
    }
    buf.indices.push(base, base + 1, base + 2);
  }

  function addTriangleOutward(buf, a, b, c, color, center) {
    const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const raw = cross(sub(b, a), sub(c, a));
    const out = (mid[0] - center[0]) * raw[0] + (mid[1] - center[1]) * raw[1] + (mid[2] - center[2]) * raw[2];
    if (out < 0) addTriangle(buf, a, c, b, color);
    else addTriangle(buf, a, b, c, color);
  }

  function addCylinder(buf, x, y, z, rBot, rTop, h, color) {
    const sides = 6;
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p00 = [x + Math.cos(a0) * rBot, y, z + Math.sin(a0) * rBot];
      const p10 = [x + Math.cos(a1) * rBot, y, z + Math.sin(a1) * rBot];
      const p01 = [x + Math.cos(a0) * rTop, y + h, z + Math.sin(a0) * rTop];
      const p11 = [x + Math.cos(a1) * rTop, y + h, z + Math.sin(a1) * rTop];
      addTriangle(buf, p00, p10, p11, color);
      addTriangle(buf, p00, p11, p01, color);
    }
  }

  function addCone(buf, x, y, z, radius, height, color) {
    const sides = 7;
    const tip = [x, y + height, z];
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius];
      const p1 = [x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius];
      addTriangle(buf, p0, p1, tip, color);
    }
  }

  function addIco(buf, x, y, z, sx, sy, sz, color) {
    const t = (1 + Math.sqrt(5)) / 2;
    const raw = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const verts = raw.map(function (v) {
      const len = Math.hypot(v[0], v[1], v[2]);
      return [x + (v[0] / len) * sx, y + (v[1] / len) * sy, z + (v[2] / len) * sz];
    });
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const center = [x, y, z];
    faces.forEach(function (f) {
      addTriangleOutward(buf, verts[f[0]], verts[f[1]], verts[f[2]], color, center);
    });
  }

  function mix3(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  function finish(buf) {
    return {
      positions: Float32Array.from(buf.positions),
      normals: Float32Array.from(buf.normals),
      colors: Float32Array.from(buf.colors),
      indices: Uint32Array.from(buf.indices),
    };
  }

  function buildTerrain(heights, n, span, seed) {
    const buf = emptyMesh();
    const sand = [0.78, 0.68, 0.46];
    const grass = [0.45, 0.58, 0.30];
    const grassDeep = [0.24, 0.40, 0.22];
    const grassDry = [0.62, 0.58, 0.32];
    const rock = [0.55, 0.52, 0.47];
    const rockDark = [0.36, 0.34, 0.32];
    const verts = (n + 1) * (n + 1);
    const normals = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    for (let iz = 0; iz <= n; iz += 1) {
      for (let ix = 0; ix <= n; ix += 1) {
        const face = slopeAt(heights, n, span, ix, iz);
        const len = Math.hypot(face.nx, face.ny, face.nz) || 1;
        const o = (iz * (n + 1) + ix) * 3;
        normals[o] = face.nx / len;
        normals[o + 1] = face.ny / len;
        normals[o + 2] = face.nz / len;
        const x = (ix / n) * span;
        const z = (iz / n) * span;
        const h = heights[iz * (n + 1) + ix];
        const moisture = fbm(x * 0.09, z * 0.09, seed + 3);
        let col = sand;
        if (h >= 1.05) {
          const rise = clamp((h - 1.05) / 2.8, 0, 1);
          col = mix3(grassDry, grass, rise);
          col = mix3(col, grassDeep, moisture * 0.85);
        }
        if (face.slope > 0.28) col = mix3(col, rock, clamp((face.slope - 0.28) / 0.35, 0, 1));
        if (h > 5.4) col = mix3(col, rockDark, clamp((h - 5.4) / 1.4, 0, 1));
        colors[o] = col[0];
        colors[o + 1] = col[1];
        colors[o + 2] = col[2];
      }
    }
    for (let iz = 0; iz <= n; iz += 1) {
      for (let ix = 0; ix <= n; ix += 1) {
        const o = (iz * (n + 1) + ix) * 3;
        const x = (ix / n) * span;
        const h = heights[iz * (n + 1) + ix];
        const z = (iz / n) * span;
        buf.positions.push(x, h, z);
        buf.normals.push(normals[o], normals[o + 1], normals[o + 2]);
        buf.colors.push(colors[o], colors[o + 1], colors[o + 2]);
      }
    }
    for (let iz = 0; iz < n; iz += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const a = iz * (n + 1) + ix;
        const b = a + 1;
        const c = a + (n + 1);
        const d = c + 1;
        buf.indices.push(a, c, b, b, c, d);
      }
    }
    return finish(buf);
  }

  function buildSky() {
    const buf = emptyMesh();
    const stacks = 10;
    const slices = 18;
    const radius = 140;
    const zenith = [0.36, 0.56, 0.84];
    const horizon = [0.90, 0.76, 0.62];
    const ground = [0.55, 0.58, 0.52];
    function colorAt(y) {
      const t = y / radius;
      if (t >= 0) return mix3(horizon, zenith, Math.pow(t, 0.75));
      return mix3(horizon, ground, Math.min(1, -t * 1.4));
    }
    const grid = [];
    for (let iy = 0; iy <= stacks; iy += 1) {
      const v = iy / stacks;
      const phi = v * Math.PI;
      const y = Math.cos(phi) * radius;
      const ring = Math.sin(phi) * radius;
      for (let ix = 0; ix <= slices; ix += 1) {
        const u = ix / slices;
        const theta = u * Math.PI * 2;
        grid.push([Math.cos(theta) * ring, y, Math.sin(theta) * ring]);
      }
    }
    const stride = slices + 1;
    for (let iy = 0; iy < stacks; iy += 1) {
      for (let ix = 0; ix < slices; ix += 1) {
        const a = iy * stride + ix;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        const ca = colorAt(grid[a][1]);
        const cb = colorAt(grid[b][1]);
        const cc = colorAt(grid[c][1]);
        const cd = colorAt(grid[d][1]);
        addTriangle(buf, grid[a], grid[c], grid[b], ca);
        addTriangle(buf, grid[b], grid[c], grid[d], mix3(cb, cd, 0.5));
        void cc;
      }
    }
    return finish(buf);
  }

  function findSpawn(heights, n, span) {
    let best = null;
    let bestScore = Infinity;
    for (let iz = 2; iz < n - 1; iz += 2) {
      for (let ix = 2; ix < n - 1; ix += 2) {
        const face = slopeAt(heights, n, span, ix, iz);
        const h = heights[iz * (n + 1) + ix];
        if (face.slope > 0.42 || h < 0.9 || h > 4.6) continue;
        const x = (ix / n) * span;
        const z = (iz / n) * span;
        const score = face.slope * 6 + Math.abs(h - 2.2) * 0.25 + Math.hypot(x - span * 0.5, z - span * 0.5) * 0.03;
        if (score < bestScore) {
          bestScore = score;
          best = { x: x, z: z, y: h };
        }
      }
    }
    if (best) return best;
    const ix = Math.floor(n / 2);
    const iz = ix;
    return {
      x: (ix / n) * span,
      z: (iz / n) * span,
      y: heights[iz * (n + 1) + ix],
    };
  }

  function buildProps(heights, n, span, seed, spawn) {
    const buf = emptyMesh();
    const rng = mulberry32(seed ^ 0xA5A5A5A5);
    const trees = [];
    const rocks = [];
    const world = { heights: heights, grid: n, span: span };
    const trunk = [0.34, 0.22, 0.13];
    function tooClose(x, z, list, dist) {
      for (let i = 0; i < list.length; i += 1) {
        if (Math.hypot(list[i].x - x, list[i].z - z) < dist) return true;
      }
      return false;
    }
    for (let i = 0; i < 90 && trees.length < 42; i += 1) {
      const x = 3.5 + rng() * (span - 7);
      const z = 3.5 + rng() * (span - 7);
      if (Math.hypot(x - spawn.x, z - spawn.z) < 4.4) continue;
      const h = sampleHeight(world, x, z);
      const ix = clamp(Math.round(x / span * n), 1, n - 1);
      const iz = clamp(Math.round(z / span * n), 1, n - 1);
      const face = slopeAt(heights, n, span, ix, iz);
      if (h < 1.15 || h > 5.1 || face.slope > 0.48) continue;
      if (tooClose(x, z, trees, 1.7)) continue;
      const kind = rng() > 0.42 ? 'pine' : 'broad';
      const scale = 0.75 + rng() * 0.7;
      const leaf = kind === 'pine'
        ? [0.18 + rng() * 0.08, 0.36 + rng() * 0.12, 0.20 + rng() * 0.05]
        : [0.28 + rng() * 0.12, 0.46 + rng() * 0.1, 0.18 + rng() * 0.06];
      const leaf2 = [leaf[0] * 0.82, leaf[1] * 0.9, leaf[2] * 0.8];
      trees.push({ x: x, z: z, kind: kind, scale: scale });
      const trunkH = (kind === 'pine' ? 1.15 : 0.7) * scale;
      addCylinder(buf, x, h, z, 0.09 * scale, 0.07 * scale, trunkH, trunk);
      if (kind === 'pine') {
        addCone(buf, x, h + trunkH * 0.55, z, 0.72 * scale, 1.35 * scale, leaf);
        addCone(buf, x, h + trunkH * 0.55 + 0.85 * scale, z, 0.48 * scale, 1.05 * scale, leaf2);
      } else {
        addIco(buf, x, h + trunkH + 0.45 * scale, z, 0.85 * scale, 0.62 * scale, 0.85 * scale, leaf);
      }
    }
    for (let i = 0; i < 40 && rocks.length < 16; i += 1) {
      const x = 2.5 + rng() * (span - 5);
      const z = 2.5 + rng() * (span - 5);
      if (Math.hypot(x - spawn.x, z - spawn.z) < 2.2) continue;
      if (tooClose(x, z, trees, 1.1) || tooClose(x, z, rocks, 2.2)) continue;
      const h = sampleHeight(world, x, z);
      const scale = 0.35 + rng() * 0.85;
      const tint = 0.4 + rng() * 0.18;
      const color = [tint, tint * 0.96, tint * 0.9];
      rocks.push({ x: x, z: z, scale: scale });
      addIco(
        buf,
        x,
        h + scale * 0.28,
        z,
        scale * (0.7 + rng() * 0.5),
        scale * (0.45 + rng() * 0.35),
        scale * (0.7 + rng() * 0.5),
        color
      );
    }
    return { mesh: finish(buf), trees: trees, rocks: rocks };
  }

  function mergeMesh(a, b) {
    if (!b.indices.length) return a;
    const positions = new Float32Array(a.positions.length + b.positions.length);
    const normals = new Float32Array(a.normals.length + b.normals.length);
    const colors = new Float32Array(a.colors.length + b.colors.length);
    positions.set(a.positions, 0);
    positions.set(b.positions, a.positions.length);
    normals.set(a.normals, 0);
    normals.set(b.normals, a.normals.length);
    colors.set(a.colors, 0);
    colors.set(b.colors, a.colors.length);
    const shift = a.positions.length / 3;
    const indices = new Uint32Array(a.indices.length + b.indices.length);
    indices.set(a.indices, 0);
    for (let i = 0; i < b.indices.length; i += 1) indices[a.indices.length + i] = b.indices[i] + shift;
    return { positions: positions, normals: normals, colors: colors, indices: indices };
  }

  function buildWorld(seedText) {
    const seed = hashString(seedText || 'ridge-walk');
    const n = GRID;
    const span = SPAN;
    const heights = new Float32Array((n + 1) * (n + 1));
    for (let iz = 0; iz <= n; iz += 1) {
      for (let ix = 0; ix <= n; ix += 1) {
        const x = (ix / n) * span;
        const z = (iz / n) * span;
        heights[iz * (n + 1) + ix] = heightAt(x, z, seed, span);
      }
    }
    const spawn = findSpawn(heights, n, span);
    const props = buildProps(heights, n, span, seed, spawn);
    const terrain = buildTerrain(heights, n, span, seed);
    return {
      seed: String(seedText || 'ridge-walk'),
      seedNumber: seed,
      grid: n,
      span: span,
      heights: heights,
      spawn: spawn,
      trees: props.trees,
      rocks: props.rocks,
      land: mergeMesh(terrain, props.mesh),
      sky: buildSky(),
    };
  }

  function stepPlayer(player, input, world, dt) {
    const step = clamp(Number(dt) || 0, 0, 0.05);
    const yaw = player.yaw + (Number(input.lookX) || 0);
    const pitch = clamp(player.pitch + (Number(input.lookY) || 0), -1.15, 1.15);
    let forward = clamp(Number(input.forward) || 0, -1, 1);
    let strafe = clamp(Number(input.strafe) || 0, -1, 1);
    const len = Math.hypot(forward, strafe);
    if (len > 1) {
      forward /= len;
      strafe /= len;
    }
    const speed = 7.5;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = Math.sin(yaw);
    const margin = 1.5;
    const x = clamp(player.x + (fx * forward + rx * strafe) * speed * step, margin, world.span - margin);
    const z = clamp(player.z + (fz * forward + rz * strafe) * speed * step, margin, world.span - margin);
    const ground = sampleHeight(world, x, z);
    const eye = ground + 1.65;
    const blend = step === 0 ? 1 : Math.min(1, step * 8);
    const y = player.y < eye ? eye : player.y + (eye - player.y) * blend;
    return { x: x, y: y, z: z, yaw: yaw, pitch: pitch };
  }

  function spawnPlayer(world) {
    const ground = sampleHeight(world, world.spawn.x, world.spawn.z);
    return {
      x: world.spawn.x,
      y: ground + 1.65,
      z: world.spawn.z,
      yaw: 0.55,
      pitch: -0.06,
    };
  }

  function brushSettings(value) {
    const t = clamp(Number(value) || 0, 0, 100) / 100;
    return {
      radius: 1 + Math.round(t * 3),
      strength: 0.4 + t * 0.6,
    };
  }

  function meshOk(mesh) {
    if (!mesh || mesh.positions.length % 3 !== 0) return false;
    if (mesh.positions.length !== mesh.normals.length || mesh.positions.length !== mesh.colors.length) return false;
    const verts = mesh.positions.length / 3;
    if (mesh.indices.length % 3 !== 0 || mesh.indices.length === 0) return false;
    for (let i = 0; i < mesh.indices.length; i += 1) {
      if (mesh.indices[i] >= verts) return false;
    }
    for (let i = 0; i < mesh.positions.length; i += 1) {
      if (!Number.isFinite(mesh.positions[i]) || !Number.isFinite(mesh.normals[i]) || !Number.isFinite(mesh.colors[i])) return false;
    }
    return true;
  }

  return {
    GRID: GRID,
    SPAN: SPAN,
    hashString: hashString,
    buildWorld: buildWorld,
    sampleHeight: sampleHeight,
    stepPlayer: stepPlayer,
    spawnPlayer: spawnPlayer,
    brushSettings: brushSettings,
    meshOk: meshOk,
    heightAt: heightAt,
  };
});
