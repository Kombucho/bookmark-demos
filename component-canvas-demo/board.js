// A board of live components that share one token set.
// Variations override a single axis and sit beside the source.
// Promote writes that override into the shared tokens.
// Camera math is separate from the components.
// No model is called. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ComponentCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 2.5;
  const ORIGIN_X = 64;
  const ORIGIN_Y = 48;
  const SOURCE_GAP = 64;
  const ROW_GAP = 28;
  const COL_GAP = 36;
  const VAR_GAP = 20;

  const AXES = {
    density: {
      label: 'Density',
      values: [
        { id: 'compact', label: 'Compact', pad: 6, gap: 6, type: 13 },
        { id: 'regular', label: 'Regular', pad: 12, gap: 10, type: 15 },
        { id: 'roomy', label: 'Roomy', pad: 18, gap: 14, type: 17 },
      ],
    },
    radius: {
      label: 'Radius',
      values: [
        { id: 'sharp', label: 'Sharp', radius: 2 },
        { id: 'soft', label: 'Soft', radius: 12 },
        { id: 'round', label: 'Round', radius: 28 },
      ],
    },
    emphasis: {
      label: 'Emphasis',
      values: [
        { id: 'quiet', label: 'Quiet', fill: '#f4efe6', ink: '#3a342c', line: '#8a8175', accent: '#3a342c' },
        { id: 'ink', label: 'Ink', fill: '#241f1a', ink: '#f6f1e8', line: '#241f1a', accent: '#c4552a' },
        { id: 'signal', label: 'Signal', fill: '#b8431f', ink: '#fff7f2', line: '#8d3014', accent: '#241f1a' },
      ],
    },
  };

  const COMPONENTS = [
    { id: 'button', name: 'Button', w: 232, h: 156 },
    { id: 'card', name: 'Card', w: 280, h: 240 },
    { id: 'field', name: 'Field', w: 260, h: 176 },
    { id: 'badge', name: 'Badge', w: 232, h: 148 },
  ];

  const DEFAULT_TOKENS = { density: 'regular', radius: 'soft', emphasis: 'ink' };

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function axisValue(axis, id) {
    return AXES[axis].values.filter(function (value) { return value.id === id; })[0];
  }

  function labelOf(axis, id) {
    const value = axisValue(axis, id);
    return value ? value.label : '';
  }

  function place(items) {
    const sources = COMPONENTS.map(function (component) {
      return items.filter(function (item) {
        return item.role === 'source' && item.id === component.id;
      })[0];
    }).filter(Boolean);
    let y = ORIGIN_Y;
    const placed = [];
    sources.forEach(function (source) {
      const copy = Object.assign({}, source, { x: ORIGIN_X, y: y });
      const variations = items.filter(function (item) {
        return item.role === 'variation' && item.sourceId === source.id;
      });
      let block = copy.h;
      const rowCopies = variations.map(function (variation) {
        const order = AXES[variation.axis].values.map(function (value) { return value.id; });
        const index = order.indexOf(variation.value);
        const vy = y + variation.row * (copy.h + ROW_GAP);
        const vx = ORIGIN_X + copy.w + COL_GAP + index * (copy.w + VAR_GAP);
        block = Math.max(block, variation.row * (copy.h + ROW_GAP) + copy.h);
        return Object.assign({}, variation, { x: vx, y: vy, w: copy.w, h: copy.h });
      });
      placed.push(copy);
      rowCopies.forEach(function (variation) { placed.push(variation); });
      y += block + SOURCE_GAP;
    });
    return placed;
  }

  function finish(board, items) {
    return {
      tokens: {
        density: board.tokens.density,
        radius: board.tokens.radius,
        emphasis: board.tokens.emphasis,
      },
      camera: { x: board.camera.x, y: board.camera.y, scale: board.camera.scale },
      items: place(items),
    };
  }

  function createBoard() {
    return finish({
      tokens: { density: DEFAULT_TOKENS.density, radius: DEFAULT_TOKENS.radius, emphasis: DEFAULT_TOKENS.emphasis },
      camera: { x: 48, y: 36, scale: 1 },
      items: [],
    }, COMPONENTS.map(function (component) {
      return {
        id: component.id,
        componentId: component.id,
        sourceId: null,
        name: component.name,
        role: 'source',
        axis: null,
        value: null,
        row: 0,
        w: component.w,
        h: component.h,
      };
    }));
  }

  function nextRow(items, sourceId, axis) {
    const mine = items.filter(function (item) {
      return item.role === 'variation' && item.sourceId === sourceId && item.axis === axis;
    })[0];
    if (mine) return mine.row;
    const rows = items.filter(function (item) {
      return item.role === 'variation' && item.sourceId === sourceId;
    }).map(function (item) { return item.row; });
    if (!rows.length) return 0;
    return Math.max.apply(null, rows) + 1;
  }

  function spawn(board, componentId, axis) {
    const source = board.items.filter(function (item) {
      return item.id === componentId && item.role === 'source';
    })[0];
    if (!source) return { ok: false, error: 'No component with that id.' };
    if (!AXES[axis]) return { ok: false, error: 'No axis with that id.' };
    const row = nextRow(board.items, componentId, axis);
    const kept = board.items.filter(function (item) {
      return !(item.role === 'variation' && item.sourceId === componentId && item.axis === axis);
    });
    const made = AXES[axis].values.map(function (value) {
      return {
        id: componentId + ':' + axis + ':' + value.id,
        componentId: componentId,
        sourceId: componentId,
        name: source.name,
        role: 'variation',
        axis: axis,
        value: value.id,
        row: row,
        w: source.w,
        h: source.h,
      };
    });
    return { ok: true, board: finish(board, kept.concat(made)) };
  }

  function promote(board, id) {
    const item = board.items.filter(function (entry) { return entry.id === id; })[0];
    if (!item || item.role !== 'variation') return { ok: false, error: 'Pick a variation to promote.' };
    const tokens = {
      density: board.tokens.density,
      radius: board.tokens.radius,
      emphasis: board.tokens.emphasis,
    };
    tokens[item.axis] = item.value;
    return {
      ok: true,
      board: {
        tokens: tokens,
        camera: { x: board.camera.x, y: board.camera.y, scale: board.camera.scale },
        items: board.items.map(function (entry) { return Object.assign({}, entry); }),
      },
    };
  }

  function clearVariations(board, sourceId) {
    const items = board.items.filter(function (item) {
      if (item.role !== 'variation') return true;
      if (!sourceId) return false;
      return item.sourceId !== sourceId;
    });
    return { ok: true, board: finish(board, items) };
  }

  function resolveTokens(board, item) {
    const tokens = {
      density: board.tokens.density,
      radius: board.tokens.radius,
      emphasis: board.tokens.emphasis,
    };
    if (item && item.role === 'variation' && item.axis) tokens[item.axis] = item.value;
    return tokens;
  }

  function tokenStyle(tokens) {
    const density = axisValue('density', tokens.density);
    const radius = axisValue('radius', tokens.radius);
    const emphasis = axisValue('emphasis', tokens.emphasis);
    return {
      pad: density.pad,
      gap: density.gap,
      type: density.type,
      radius: radius.radius,
      fill: emphasis.fill,
      ink: emphasis.ink,
      line: emphasis.line,
      accent: emphasis.accent,
      density: density.id,
      radiusName: radius.id,
      emphasis: emphasis.id,
    };
  }

  function tokenLine(tokens) {
    return [labelOf('density', tokens.density), labelOf('radius', tokens.radius), labelOf('emphasis', tokens.emphasis)].join(' · ');
  }

  function overlaps(items) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const separated = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        if (!separated) return [a.id, b.id];
      }
    }
    return null;
  }

  function bounds(items) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    items.forEach(function (item) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.w);
      maxY = Math.max(maxY, item.y + item.h);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function pan(camera, dx, dy) {
    return { x: camera.x + dx, y: camera.y + dy, scale: camera.scale };
  }

  function zoomAt(camera, nextScale, originX, originY) {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const wx = (originX - camera.x) / camera.scale;
    const wy = (originY - camera.y) / camera.scale;
    return {
      scale: scale,
      x: originX - wx * scale,
      y: originY - wy * scale,
    };
  }

  function zoomStep(camera, direction, originX, originY) {
    const factor = direction < 0 ? 1 / 1.12 : 1.12;
    return zoomAt(camera, camera.scale * factor, originX, originY);
  }

  function frame(items, viewW, viewH, margin) {
    const pad = margin == null ? 48 : margin;
    if (!items.length || viewW <= 0 || viewH <= 0) return { x: pad, y: pad, scale: 1 };
    const box = bounds(items);
    const scale = clamp(
      Math.min((viewW - pad * 2) / Math.max(1, box.w), (viewH - pad * 2) / Math.max(1, box.h)),
      MIN_SCALE,
      MAX_SCALE
    );
    return {
      scale: scale,
      x: (viewW - box.w * scale) / 2 - box.x * scale,
      y: (viewH - box.h * scale) / 2 - box.y * scale,
    };
  }

  function reveal(camera, rect, viewW, viewH, margin) {
    const pad = margin == null ? 24 : margin;
    const left = camera.x + rect.x * camera.scale;
    const top = camera.y + rect.y * camera.scale;
    const right = camera.x + (rect.x + rect.w) * camera.scale;
    const bottom = camera.y + (rect.y + rect.h) * camera.scale;
    let x = camera.x;
    let y = camera.y;
    if (right - left > viewW - pad * 2) x += pad - left;
    else {
      if (left < pad) x += pad - left;
      if (right > viewW - pad) x -= right - (viewW - pad);
    }
    if (bottom - top > viewH - pad * 2) y += pad - top;
    else {
      if (top < pad) y += pad - top;
      if (bottom > viewH - pad) y -= bottom - (viewH - pad);
    }
    return { x: x, y: y, scale: camera.scale };
  }

  function setCamera(board, camera) {
    return {
      tokens: {
        density: board.tokens.density,
        radius: board.tokens.radius,
        emphasis: board.tokens.emphasis,
      },
      camera: { x: camera.x, y: camera.y, scale: camera.scale },
      items: board.items.map(function (item) { return Object.assign({}, item); }),
    };
  }

  return {
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    ORIGIN_X: ORIGIN_X,
    ORIGIN_Y: ORIGIN_Y,
    SOURCE_GAP: SOURCE_GAP,
    ROW_GAP: ROW_GAP,
    COL_GAP: COL_GAP,
    VAR_GAP: VAR_GAP,
    AXES: AXES,
    COMPONENTS: COMPONENTS,
    DEFAULT_TOKENS: DEFAULT_TOKENS,
    createBoard: createBoard,
    spawn: spawn,
    promote: promote,
    clearVariations: clearVariations,
    resolveTokens: resolveTokens,
    tokenStyle: tokenStyle,
    tokenLine: tokenLine,
    labelOf: labelOf,
    overlaps: overlaps,
    bounds: bounds,
    pan: pan,
    zoomAt: zoomAt,
    zoomStep: zoomStep,
    frame: frame,
    reveal: reveal,
    setCamera: setCamera,
  };
});
