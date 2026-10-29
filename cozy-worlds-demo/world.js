// A seeded island: terrain, water, trees, and a house.
// The generator is local. It does not call MetalForge and it does not copy its scenes.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CozyWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SIZE = 28;
  const DEFAULT_SEED = 'lakeside-lantern';

  const PALETTES = [
    {
      name: 'meadow',
      grass: [126, 168, 96],
      sand: [230, 211, 164],
      rock: [141, 133, 120],
      snow: [244, 247, 251],
      water: [90, 158, 186],
      roof: [184, 92, 72],
      wall: [243, 234, 215],
      trunk: [107, 74, 50],
      leaf: [63, 122, 69],
      blossom: [232, 160, 176],
    },
    {
      name: 'autumn',
      grass: [176, 148, 78],
      sand: [214, 186, 140],
      rock: [120, 108, 96],
      snow: [236, 232, 226],
      water: [78, 130, 148],
      roof: [122, 72, 58],
      wall: [236, 224, 204],
      trunk: [92, 60, 40],
      leaf: [184, 98, 48],
      blossom: [212, 164, 72],
    },
    {
      name: 'pine',
      grass: [78, 122, 96],
      sand: [198, 186, 156],
      rock: [108, 116, 118],
      snow: [230, 238, 242],
      water: [64, 112, 132],
      roof: [70, 86, 102],
      wall: [228, 226, 216],
      trunk: [74, 56, 42],
      leaf: [36, 86, 72],
      blossom: [186, 206, 176],
    },
    {
      name: 'coast',
      grass: [154, 186, 112],
      sand: [236, 214, 168],
      rock: [160, 150, 136],
      snow: [248, 248, 246],
      water: [64, 168, 176],
      roof: [214, 164, 92],
      wall: [248, 242, 230],
      trunk: [120, 86, 58],
      leaf: [46, 130, 96],
      blossom: [244, 196, 160],
    },
  ];

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
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function makeNoise(rng) {
    const grid = 6;
    const values = [];
    for (let i = 0; i < (grid + 1) * (grid + 1); i += 1) values.push(rng());
    return function (x, y) {
      const gx = x * grid;
      const gy = y * grid;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      function at(ix, iy) {
        const span = grid + 1;
        const cx = ((ix % span) + span) % span;
        const cy = ((iy % span) + span) % span;
        return values[cy * span + cx];
      }
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  }

  function fbm(noise, x, y) {
    let h = 0;
    let amp = 1;
    let freq = 1;
    let sum = 0;
    for (let octave = 0; octave < 4; octave += 1) {
      h += noise(x * freq, y * freq) * amp;
      sum += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return h / sum;
  }

  function seedFromHash(hash) {
    const raw = decodeURIComponent(String(hash || '').replace(/^#/, '')).trim();
    if (!raw) return null;
    const prefixed = raw.match(/^seed=(.+)$/);
    const seed = (prefixed ? prefixed[1] : raw).trim().replace(/\s+/g, '-').slice(0, 64);
    return seed || null;
  }

  function hashForSeed(seed) {
    return '#' + encodeURIComponent(seed);
  }

  function generateWorld(input) {
    const seed = String(input || '').trim().slice(0, 64) || DEFAULT_SEED;
    const rng = mulberry32(hashString(seed));
    const noise = makeNoise(rng);
    const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
    const water = 0.30 + rng() * 0.05;
    const heights = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / (SIZE - 1);
        const v = y / (SIZE - 1);
        const nx = u * 2 - 1;
        const ny = v * 2 - 1;
        const radius = Math.sqrt(nx * nx + ny * ny);
        const island = Math.pow(clamp(1 - radius / 1.02, 0, 1), 0.72);
        let h = fbm(noise, u, v);
        h = Math.pow(h, 1.05) * (0.4 + 0.6 * island) + island * 0.18;
        heights.push(h);
      }
    }
    let maxH = 0;
    for (let i = 0; i < heights.length; i += 1) if (heights[i] > maxH) maxH = heights[i];
    const span = Math.max(0.08, maxH - water);
    for (let i = 0; i < heights.length; i += 1) {
      const h = heights[i];
      if (h <= water) heights[i] = h * 0.72;
      else heights[i] = water + Math.pow((h - water) / span, 0.8) * 0.58;
    }

    function at(x, y) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return 0;
      return heights[y * SIZE + x];
    }

    function slopeAt(x, y) {
      const h = at(x, y);
      let max = 0;
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < neighbors.length; i += 1) {
        max = Math.max(max, Math.abs(h - at(x + neighbors[i][0], y + neighbors[i][1])));
      }
      return max;
    }

    function nearWater(x, y) {
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
      for (let i = 0; i < neighbors.length; i += 1) {
        if (at(x + neighbors[i][0], y + neighbors[i][1]) < water) return true;
      }
      return false;
    }

    let house = null;
    let bestScore = -Infinity;
    for (let y = 3; y < SIZE - 4; y += 1) {
      for (let x = 3; x < SIZE - 4; x += 1) {
        const h = at(x, y);
        if (h <= water + 0.05) continue;
        const slope = slopeAt(x, y);
        if (slope > 0.09) continue;
        const shore = nearWater(x, y) ? 1.4 : 0;
        const score = shore + (1 - slope * 8) - Math.abs(h - (water + 0.08)) * 3;
        if (score > bestScore) {
          bestScore = score;
          house = {x: x, y: y, h: h};
        }
      }
    }
    if (!house) {
      let highest = -1;
      for (let i = 0; i < heights.length; i += 1) {
        if (heights[i] > highest) {
          highest = heights[i];
          house = {x: i % SIZE, y: Math.floor(i / SIZE), h: heights[i]};
        }
      }
    }

    const footprint = [];
    let ground = 0;
    let samples = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = clamp(house.x + dx, 0, SIZE - 1);
        const y = clamp(house.y + dy, 0, SIZE - 1);
        footprint.push([x, y]);
        ground += at(x, y);
        samples += 1;
      }
    }
    ground = Math.max(ground / samples, water + 0.08);
    for (let i = 0; i < footprint.length; i += 1) {
      heights[footprint[i][1] * SIZE + footprint[i][0]] = ground;
    }

    function blocked(x, y) {
      for (let i = 0; i < footprint.length; i += 1) {
        if (Math.abs(footprint[i][0] - x) <= 1 && Math.abs(footprint[i][1] - y) <= 1) return true;
      }
      return false;
    }

    const trees = [];
    const target = 16 + Math.floor(rng() * 14);
    for (let n = 0; n < 400 && trees.length < target; n += 1) {
      const x = 1 + Math.floor(rng() * (SIZE - 2));
      const y = 1 + Math.floor(rng() * (SIZE - 2));
      const h = at(x, y);
      if (h <= water + 0.025 || h > 0.78) continue;
      if (slopeAt(x, y) > 0.22) continue;
      if (blocked(x, y)) continue;
      let crowded = false;
      for (let i = 0; i < trees.length; i += 1) {
        const dx = trees[i].x - x;
        const dy = trees[i].y - y;
        if (dx * dx + dy * dy < 2.4) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      const roll = rng();
      const kind = roll > 0.82 ? 'blossom' : roll > 0.42 ? 'pine' : 'round';
      trees.push({
        x: x + 0.5,
        y: y + 0.5,
        kind: kind,
        scale: 0.75 + rng() * 0.55,
      });
    }

    const rocks = [];
    const rockTarget = 4 + Math.floor(rng() * 5);
    for (let n = 0; n < 80 && rocks.length < rockTarget; n += 1) {
      const x = 1 + Math.floor(rng() * (SIZE - 2));
      const y = 1 + Math.floor(rng() * (SIZE - 2));
      if (at(x, y) <= water || blocked(x, y)) continue;
      rocks.push({x: x + 0.35 + rng() * 0.3, y: y + 0.35 + rng() * 0.3, scale: 0.35 + rng() * 0.45});
    }

    const flowers = [];
    for (let n = 0; n < 28; n += 1) {
      const x = house.x + (rng() - 0.2) * 6;
      const y = house.y + (rng() - 0.2) * 6;
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 1 || iy < 1 || ix >= SIZE - 1 || iy >= SIZE - 1) continue;
      if (at(ix, iy) <= water + 0.02 || blocked(ix, iy)) continue;
      flowers.push({x: x, y: y, hue: rng()});
    }

    let waterCells = 0;
    let landCells = 0;
    for (let i = 0; i < heights.length; i += 1) {
      if (heights[i] < water) waterCells += 1;
      else landCells += 1;
    }

    let boat = null;
    const shore = [[0, 2], [2, 0], [-1, 1], [1, 3], [3, 1]];
    for (let i = 0; i < shore.length; i += 1) {
      const x = house.x + shore[i][0];
      const y = house.y + shore[i][1];
      if (at(x, y) < water) {
        boat = {x: x + 0.5, y: y + 0.5};
        break;
      }
    }

    return {
      seed: seed,
      size: SIZE,
      heights: heights,
      water: water,
      waterCells: waterCells,
      landCells: landCells,
      palette: palette,
      house: {
        x: house.x,
        y: house.y,
        ground: ground,
        w: 2,
        d: 2,
      },
      trees: trees,
      rocks: rocks,
      flowers: flowers,
      boat: boat,
    };
  }

  function describeWorld(world) {
    const trees = world.trees.length;
    const water = world.waterCells > 40 ? 'a pond' : 'a narrow shore';
    const blossom = world.trees.some(function (tree) { return tree.kind === 'blossom'; });
    const roof = world.palette.name === 'coast' ? 'a warm roof' : world.palette.name === 'pine' ? 'a slate roof' : 'a little house';
    return world.palette.name + ' · ' + trees + ' trees · ' + water + ' · ' + (blossom ? 'blossom and ' : '') + roof;
  }

  return {
    SIZE: SIZE,
    DEFAULT_SEED: DEFAULT_SEED,
    PALETTES: PALETTES,
    hashString: hashString,
    seedFromHash: seedFromHash,
    hashForSeed: hashForSeed,
    generateWorld: generateWorld,
    describeWorld: describeWorld,
  };
});
