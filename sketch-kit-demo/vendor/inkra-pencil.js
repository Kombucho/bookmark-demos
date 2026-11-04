/* createPencilPoints and createPencilPath from @inkra/react 0.15.0 (MIT).
   Source: https://cdn.jsdelivr.net/npm/@inkra/react@0.15.0/dist/pencil.js
   License: INKRA-LICENSE.txt. The page loads the CDN module first and uses this copy if that request fails. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InkraPencil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function hashSeed(seed) {
    const value = String(seed);
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let state = hashSeed(seed) || 0x6d2b79f5;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createPencilPoints({ seed, width = 100, height = 8, points = 7, roughness = 1 }) {
    const random = createRandom(seed);
    const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 100;
    const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 8;
    const pointCount = Number.isFinite(points) ? Math.max(2, Math.min(65536, Math.floor(points))) : 7;
    const center = safeHeight / 2;
    const amplitude = Math.min(safeHeight * 0.32, Math.max(0, Number.isFinite(roughness) ? roughness : 1));
    return Array.from({ length: pointCount }, (_, index) => {
      const progress = index / (pointCount - 1);
      const xJitter = index === 0 || index === pointCount - 1 ? 0 : (random() - 0.5) * 1.4;
      const yJitter = (random() - 0.5) * 2 * amplitude;
      return [progress * safeWidth + xJitter, center + yJitter];
    });
  }

  function createPencilPath(options) {
    const points = createPencilPoints(options);
    return points
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ');
  }

  return { createPencilPoints, createPencilPath };
});
