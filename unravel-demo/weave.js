// A sketch of Anna Lucia's Unravel: 128 seeded tapestries whose wear
// depends on how many times the token has changed hands. Local only.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Unravel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TOKEN_MIN = 0;
  const TOKEN_MAX = 127;
  const PREVIEW_FLOOR = 32;
  const WEAR_CAP = 1.65;

  const FAMILIES = [
    { name: 'Delft night', ground: '#eadcc8', warp: '#2c211c', dyes: ['#1b3358', '#3e5f86', '#c4492c', '#e0b15a', '#7d2433', '#8ea4ad'] },
    { name: 'Saffron', ground: '#f3e6cf', warp: '#4a3018', dyes: ['#c45312', '#e2a84a', '#6d2c28', '#1f4f48', '#f0d7a6', '#8d4030'] },
    { name: 'Madder', ground: '#f0e0d4', warp: '#3a2420', dyes: ['#8e2430', '#c45a4a', '#d7a08a', '#243044', '#6e5344', '#e6d2bf'] },
    { name: 'Indigo milk', ground: '#e7eef0', warp: '#1e2a33', dyes: ['#16324f', '#3d6e8c', '#d2c0a0', '#b5523a', '#6f8f78', '#e8dcc8'] },
    { name: 'Olive kiln', ground: '#e6e0d0', warp: '#2e291f', dyes: ['#3f4a28', '#8a8f4a', '#c4a15a', '#7a3e2e', '#d8cbb0', '#4e5e68'] },
    { name: 'Berry', ground: '#f3e4dc', warp: '#3a2430', dyes: ['#6e2448', '#c45b78', '#e7b7a4', '#2c3a55', '#d4a04a', '#8c4a3a'] },
    { name: 'Sea reed', ground: '#e5ebe4', warp: '#24302c', dyes: ['#1d4a45', '#3f7a72', '#d0b48a', '#c4623a', '#e7e1d2', '#6a7c62'] },
    { name: 'Coal ember', ground: '#efe6dc', warp: '#241c1a', dyes: ['#2b2422', '#c4522a', '#e0a15c', '#6e2a32', '#d9cbb8', '#3e4c5c'] },
    { name: 'Plum gold', ground: '#efe4d8', warp: '#34242c', dyes: ['#4a2c4a', '#a85a78', '#e0b15c', '#2f3e55', '#c4784a', '#efe0cc'] },
    { name: 'Linen rust', ground: '#f4ecdf', warp: '#3f3228', dyes: ['#a34b2c', '#d08a4a', '#3f5c54', '#1e3348', '#e6d3b4', '#7a3a3a'] },
  ];

  const RHYTHMS = [
    [4, 1, 1, 2, 1, 3, 1, 2],
    [2, 1, 5, 1, 1, 2, 3],
    [1, 1, 3, 1, 6, 1, 2],
    [3, 2, 1, 1, 4, 1, 1, 2],
    [8, 1, 1, 2, 1, 3],
    [2, 2, 1, 1, 2, 5, 1],
    [5, 1, 2, 1, 1, 4, 1],
    [1, 3, 1, 2, 1, 6, 2],
  ];

  const COPY = {
    Mint: 'Tight weave. The dye is whole.',
    'Lightly worn': 'Threads have loosened, and the motion has widened.',
    Frayed: 'Gaps have opened. Loose ends hang and sway.',
    Unravelling: 'The bands have come apart and settled into a new form.',
  };

  function clampToken(id) {
    const n = Number(id);
    if (!Number.isFinite(n)) return TOKEN_MIN;
    return Math.max(TOKEN_MIN, Math.min(TOKEN_MAX, Math.round(n)));
  }

  function tokenSeed(id) {
    const n = clampToken(id);
    let h = Math.imul(n + 1, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function unitHash(a, b) {
    let h = (Math.imul(a ^ 0xA5A5A5A5, 0x9E3779B1) ^ Math.imul((b | 0) + 1, 0x85EBCA6B)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function thresholdsFor(id) {
    const s = tokenSeed(id);
    const mint = 0.05 + unitHash(s, 11) * 0.16;
    const fade = mint + 0.06 + unitHash(s, 12) * 0.07;
    const fray = fade + 0.08 + unitHash(s, 13) * 0.09;
    const unravel = fray + 0.09 + unitHash(s, 14) * 0.1;
    return { mint: mint, fade: fade, fray: fray, unravel: unravel };
  }

  function transferDelta(id, transferIndex, wearBefore, thresholds) {
    const n = transferIndex | 0;
    if (n < 1) return 0;
    const t = thresholds || thresholdsFor(id);
    const u = unitHash(tokenSeed(id), n + 40);
    let mult = 1;
    if (wearBefore >= t.unravel) mult = 1.85;
    else if (wearBefore >= t.fray) mult = 1.5;
    else if (wearBefore >= t.fade) mult = 1.28;
    else if (wearBefore >= t.mint) mult = 1.12;
    return (0.045 + u * 0.04) * mult;
  }

  function wearAt(id, transfers) {
    const t = thresholdsFor(id);
    const n = Math.max(0, transfers | 0);
    let wear = 0;
    for (let i = 1; i <= n; i += 1) {
      wear += transferDelta(id, i, wear, t);
      if (wear >= WEAR_CAP) {
        wear = WEAR_CAP;
        break;
      }
    }
    return { wear: wear, thresholds: t, capped: wear >= WEAR_CAP };
  }

  function conditionName(wear, thresholds) {
    if (wear < thresholds.mint) return 'Mint';
    if (wear < thresholds.fray) return 'Lightly worn';
    if (wear < thresholds.unravel) return 'Frayed';
    return 'Unravelling';
  }

  function conditionAt(id, transfers) {
    const worn = wearAt(id, transfers);
    const name = conditionName(worn.wear, worn.thresholds);
    return {
      name: name,
      copy: COPY[name],
      wear: worn.wear,
      thresholds: worn.thresholds,
      capped: worn.capped,
    };
  }

  function addressFor(id, index) {
    let state = (tokenSeed(id) ^ Math.imul((index | 0) + 1, 0x6C62272E)) >>> 0;
    let hex = '';
    for (let i = 0; i < 5; i += 1) {
      state = Math.imul(state ^ (state >>> 16), 0x7FEB352D + i) >>> 0;
      state = Math.imul(state ^ (state >>> 15), 0x846CA68B) >>> 0;
      hex += state.toString(16).padStart(8, '0');
    }
    return '0x' + hex.slice(0, 40);
  }

  function shortAddress(address) {
    const text = String(address);
    if (text.length < 12) return text;
    return text.slice(0, 6) + '…' + text.slice(-4);
  }

  function ledger(id, shown, owned) {
    const rows = [];
    const n = Math.max(0, shown | 0);
    const own = Math.max(0, owned | 0);
    for (let i = 0; i <= n; i += 1) {
      rows.push({
        index: i,
        address: addressFor(id, i),
        kind: i === 0 ? 'Minted' : 'Transfer ' + i,
        preview: i > own,
        current: i === own,
      });
    }
    return rows;
  }

  function buildLayout(rhythm, count) {
    const weights = [];
    for (let i = 0; i < count; i += 1) weights.push(rhythm[i % rhythm.length]);
    const sum = weights.reduce(function (total, w) { return total + w; }, 0);
    const margin = 0.04;
    const span = 1 - margin * 2;
    let y = 0;
    return weights.map(function (w) {
      const slot = (w / sum) * span;
      const center = margin + y + slot / 2;
      y += slot;
      return { y: center, slot: slot, weight: w };
    });
  }

  function design(id) {
    const token = clampToken(id);
    const seed = tokenSeed(token);
    const rng = mulberry32(seed);
    const family = FAMILIES[Math.floor(rng() * FAMILIES.length)];
    const rhythmA = RHYTHMS[Math.floor(rng() * RHYTHMS.length)];
    const rhythmB = RHYTHMS[Math.floor(rng() * RHYTHMS.length)];
    const count = 16 + Math.floor(rng() * 7);
    const layoutA = buildLayout(rhythmA, count);
    const layoutB = buildLayout(rhythmB, count);
    const bands = layoutA.map(function (band, i) {
      const other = layoutB[i];
      const freq = 1.15 + rng() * 2.4;
      const speed = 0.035 + rng() * 0.07;
      const phase = rng() * 9;
      const gapFreq = 2.4 + rng() * 3.2;
      const gapPhase = rng() * 14;
      const tilt = (rng() - 0.5) * 0.2;
      const colorSlot = Math.floor(rng() * family.dyes.length);
      return {
        y: band.y,
        slot: band.slot,
        weight: band.weight,
        reformY: other.y,
        freq: freq,
        speed: speed,
        phase: phase,
        gapFreq: gapFreq,
        gapPhase: gapPhase,
        tilt: tilt,
        color: family.dyes[colorSlot],
        carrier: band.weight >= 3 || i % 4 === 0,
      };
    });
    for (let i = 1; i < bands.length; i += 1) {
      if (bands[i].color === bands[i - 1].color) {
        const slot = family.dyes.indexOf(bands[i].color);
        bands[i].color = family.dyes[(slot + 1) % family.dyes.length];
      }
    }
    let warpCount = 48 + Math.floor(rng() * 20);
    if (warpCount % 2 === 1) warpCount += 1;
    const dyedWarpEvery = 5 + Math.floor(rng() * 4);
    return {
      id: token,
      seed: seed,
      name: family.name,
      ground: family.ground,
      warp: family.warp,
      dyes: family.dyes.slice(),
      bands: bands,
      warpCount: warpCount,
      dyedWarpEvery: dyedWarpEvery,
      void: {
        x: 0.3 + rng() * 0.4,
        y: 0.24 + rng() * 0.5,
        r: 0.16 + rng() * 0.14,
      },
      thresholds: thresholdsFor(token),
    };
  }

  return {
    TOKEN_MIN: TOKEN_MIN,
    TOKEN_MAX: TOKEN_MAX,
    PREVIEW_FLOOR: PREVIEW_FLOOR,
    WEAR_CAP: WEAR_CAP,
    FAMILIES: FAMILIES,
    clampToken: clampToken,
    tokenSeed: tokenSeed,
    thresholdsFor: thresholdsFor,
    transferDelta: transferDelta,
    wearAt: wearAt,
    conditionAt: conditionAt,
    conditionName: conditionName,
    addressFor: addressFor,
    shortAddress: shortAddress,
    ledger: ledger,
    design: design,
  };
});
