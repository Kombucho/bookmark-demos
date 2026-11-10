// Micro-branches for a phone screen.
// An "agent" pass is a scripted recipe. It does not call a model.
// A rejected signature is skipped the next time a fork would rebuild it.
// The tree is plain data so it can sit in localStorage.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MicroBranch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'bookmark-demos.micro-branch.v1';
  const REASON_MAX = 140;

  const RECIPES = [
    {
      id: 'softer',
      title: 'Softer card',
      blurb: 'The card rounds off, the type steps up, and the shadow backs away.',
      apply: function (tokens) {
        return Object.assign({}, tokens, {
          radius: tokens.radius + 10,
          spacing: tokens.spacing + 4,
          type: tokens.type + 2,
          shadow: tokens.shadow - 10,
          layout: 'dock',
        });
      },
    },
    {
      id: 'tight',
      title: 'Tighter chrome',
      blurb: 'Smaller radius, less air, a heavier shadow, and an ink accent.',
      apply: function (tokens) {
        return Object.assign({}, tokens, {
          radius: tokens.radius - 12,
          spacing: tokens.spacing - 4,
          type: tokens.type - 1,
          shadow: tokens.shadow + 12,
          accent: '#1C1C1E',
          layout: 'dock',
        });
      },
    },
    {
      id: 'map',
      title: 'Map first',
      blurb: 'The map moves inside the card and the accent turns teal.',
      apply: function (tokens) {
        return Object.assign({}, tokens, {
          radius: 18,
          spacing: 14,
          accent: '#30B0C7',
          type: 16,
          shadow: 10,
          layout: 'inset',
        });
      },
    },
    {
      id: 'stack',
      title: 'Profile first',
      blurb: 'The person sits above the map. Spacing opens up and the accent goes violet.',
      apply: function (tokens) {
        return Object.assign({}, tokens, {
          radius: 26,
          spacing: 20,
          accent: '#5E5CE6',
          type: 19,
          shadow: 6,
          layout: 'stack',
        });
      },
    },
    {
      id: 'flat',
      title: 'Flat system',
      blurb: 'No shadow, a tight radius, and the green a system button would use.',
      apply: function (tokens) {
        return Object.assign({}, tokens, {
          radius: 8,
          spacing: 12,
          accent: '#34C759',
          type: 15,
          shadow: 0,
          layout: 'dock',
        });
      },
    },
    {
      id: 'loud',
      title: 'Louder pin',
      blurb: 'A pink accent, a deep shadow, and the smallest radius in the set.',
      apply: function (tokens) {
        return Object.assign({}, tokens, {
          radius: 4,
          spacing: 10,
          accent: '#FF375F',
          type: 18,
          shadow: 28,
          layout: 'inset',
        });
      },
    },
  ];

  function seedTokens() {
    return {
      radius: 22,
      spacing: 16,
      accent: '#0A84FF',
      type: 17,
      shadow: 16,
      layout: 'dock',
    };
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function normalizeAccent(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const hex = value.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(hex) ? hex : fallback;
  }

  function normalize(tokens) {
    const base = seedTokens();
    const src = tokens && typeof tokens === 'object' ? tokens : {};
    const layout = src.layout === 'stack' || src.layout === 'inset' || src.layout === 'dock' ? src.layout : base.layout;
    return {
      radius: clamp(src.radius === undefined ? base.radius : src.radius, 0, 40, base.radius),
      spacing: clamp(src.spacing === undefined ? base.spacing : src.spacing, 8, 32, base.spacing),
      accent: normalizeAccent(src.accent, base.accent),
      type: clamp(src.type === undefined ? base.type : src.type, 13, 24, base.type),
      shadow: clamp(src.shadow === undefined ? base.shadow : src.shadow, 0, 40, base.shadow),
      layout: layout,
    };
  }

  function signature(tokens) {
    const t = normalize(tokens);
    return [t.layout, t.radius, t.spacing, t.accent, t.type, t.shadow].join('|');
  }

  function cloneTree(tree) {
    return {
      nextId: tree.nextId,
      currentId: tree.currentId,
      compareId: tree.compareId,
      panel: {
        open: tree.panel.open,
        baseId: tree.panel.baseId,
        draft: tree.panel.draft ? normalize(tree.panel.draft) : null,
      },
      nodes: tree.nodes.map(function (node) { return cloneNode(node); }),
    };
  }

  function cloneNode(node) {
    return {
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      blurb: node.blurb,
      kind: node.kind,
      rejected: node.rejected,
      reason: node.reason,
      skipped: node.skipped.map(function (item) {
        return { title: item.title, reason: item.reason, rejected: item.rejected };
      }),
      tokens: normalize(node.tokens),
    };
  }

  function createTree() {
    return {
      nextId: 2,
      currentId: 'b1',
      compareId: null,
      panel: { open: false, baseId: null, draft: null },
      nodes: [
        {
          id: 'b1',
          parentId: null,
          title: 'Seed',
          blurb: 'The first screen. Fork it, or tune the button on the phone.',
          kind: 'seed',
          rejected: false,
          reason: '',
          skipped: [],
          tokens: seedTokens(),
        },
      ],
    };
  }

  function findNode(tree, id) {
    for (let i = 0; i < tree.nodes.length; i++) {
      if (tree.nodes[i].id === id) return tree.nodes[i];
    }
    return null;
  }

  function freshId(tree) {
    const ids = new Set(tree.nodes.map(function (node) { return node.id; }));
    let n = Number.isInteger(tree.nextId) && tree.nextId > 0 ? tree.nextId : 1;
    while (ids.has('b' + n)) n += 1;
    return { id: 'b' + n, nextId: n + 1 };
  }

  function closedPanel() {
    return { open: false, baseId: null, draft: null };
  }

  function chooseRecipe(tree, parent) {
    const taken = new Set(tree.nodes.map(function (node) { return signature(node.tokens); }));
    const rejected = new Map();
    tree.nodes.forEach(function (node) {
      if (node.rejected && node.reason) rejected.set(signature(node.tokens), node);
    });
    const skipped = [];
    let chosen = null;
    for (let i = 0; i < RECIPES.length; i++) {
      const recipe = RECIPES[i];
      const tokens = normalize(recipe.apply(normalize(parent.tokens)));
      const sig = signature(tokens);
      if (rejected.has(sig)) {
        const hit = rejected.get(sig);
        skipped.push({ title: recipe.title, reason: hit.reason, rejected: true });
        continue;
      }
      if (taken.has(sig)) {
        skipped.push({ title: recipe.title, reason: 'Already on the canvas', rejected: false });
        continue;
      }
      chosen = { recipe: recipe, tokens: tokens, nudged: false };
      break;
    }
    if (!chosen) {
      const recipe = RECIPES[0];
      let tokens = normalize(recipe.apply(normalize(parent.tokens)));
      let guard = 0;
      while (guard < 48 && (taken.has(signature(tokens)) || rejected.has(signature(tokens)))) {
        guard += 1;
        tokens = normalize(Object.assign({}, tokens, {
          radius: tokens.radius + 1,
          spacing: tokens.spacing + (guard % 2),
        }));
      }
      chosen = { recipe: recipe, tokens: tokens, nudged: true };
    }
    return {
      title: chosen.nudged ? chosen.recipe.title + ', nudged' : chosen.recipe.title,
      blurb: chosen.nudged
        ? chosen.recipe.blurb + ' Every other direction was already on the canvas or rejected, so the radius is stepped off that set.'
        : chosen.recipe.blurb,
      tokens: chosen.tokens,
      skipped: skipped,
      nudged: chosen.nudged,
    };
  }

  function forkFrom(tree, parentId) {
    const parent = findNode(tree, parentId);
    if (!parent) return { tree: tree, created: null };
    const pick = chooseRecipe(tree, parent);
    const id = freshId(tree);
    const created = {
      id: id.id,
      parentId: parent.id,
      title: pick.title,
      blurb: pick.blurb,
      kind: 'agent',
      rejected: false,
      reason: '',
      skipped: pick.skipped,
      tokens: pick.tokens,
    };
    const next = cloneTree(tree);
    next.nodes.push(created);
    next.nextId = id.nextId;
    next.currentId = created.id;
    if (next.compareId === created.id) next.compareId = null;
    if (next.panel.open && next.panel.baseId !== created.id) next.panel = closedPanel();
    return { tree: next, created: created };
  }

  function selectNode(tree, id) {
    if (!findNode(tree, id) || id === tree.currentId) return tree;
    const next = cloneTree(tree);
    next.currentId = id;
    if (next.compareId === id) next.compareId = null;
    if (next.panel.open && next.panel.baseId !== id) next.panel = closedPanel();
    return next;
  }

  function toggleCompare(tree, id) {
    if (!findNode(tree, id) || id === tree.currentId) return tree;
    const next = cloneTree(tree);
    next.compareId = next.compareId === id ? null : id;
    return next;
  }

  function clearCompare(tree) {
    if (!tree.compareId) return tree;
    const next = cloneTree(tree);
    next.compareId = null;
    return next;
  }

  function openPanel(tree) {
    const current = findNode(tree, tree.currentId);
    if (!current) return tree;
    const next = cloneTree(tree);
    next.panel = { open: true, baseId: current.id, draft: normalize(current.tokens) };
    return next;
  }

  function closePanel(tree) {
    if (!tree.panel.open) return tree;
    const next = cloneTree(tree);
    next.panel = closedPanel();
    return next;
  }

  function tune(tree, patch) {
    if (!tree.panel.open || !tree.panel.draft) return tree;
    const next = cloneTree(tree);
    next.panel = {
      open: true,
      baseId: tree.panel.baseId,
      draft: normalize(Object.assign({}, tree.panel.draft, patch || {})),
    };
    return next;
  }

  function bake(tree) {
    if (!tree.panel.open || !tree.panel.draft) return { tree: tree, created: null, unchanged: false };
    const parent = findNode(tree, tree.panel.baseId);
    if (!parent) return { tree: closePanel(tree), created: null, unchanged: false };
    const tokens = normalize(tree.panel.draft);
    if (signature(tokens) === signature(parent.tokens)) {
      return { tree: closePanel(tree), created: null, unchanged: true };
    }
    const id = freshId(tree);
    const created = {
      id: id.id,
      parentId: parent.id,
      title: 'Baked',
      blurb: 'Tuned on the phone, then the panel was removed.',
      kind: 'bake',
      rejected: false,
      reason: '',
      skipped: [],
      tokens: tokens,
    };
    const next = cloneTree(tree);
    next.nodes.push(created);
    next.nextId = id.nextId;
    next.currentId = created.id;
    next.panel = closedPanel();
    if (next.compareId === created.id) next.compareId = null;
    return { tree: next, created: created, unchanged: false };
  }

  function rejectNode(tree, id, reason) {
    const text = String(reason || '').trim().replace(/\s+/g, ' ');
    if (!text || !findNode(tree, id)) return tree;
    const next = cloneTree(tree);
    next.nodes = next.nodes.map(function (node) {
      if (node.id !== id) return node;
      return Object.assign({}, node, { rejected: true, reason: text.slice(0, REASON_MAX) });
    });
    return next;
  }

  function restoreNode(tree, id) {
    if (!findNode(tree, id)) return tree;
    const next = cloneTree(tree);
    next.nodes = next.nodes.map(function (node) {
      if (node.id !== id) return node;
      return Object.assign({}, node, { rejected: false, reason: '' });
    });
    return next;
  }

  function activeTokens(tree, id) {
    const node = findNode(tree, id);
    if (!node) return seedTokens();
    if (tree.panel.open && tree.panel.baseId === id && tree.panel.draft) return normalize(tree.panel.draft);
    return normalize(node.tokens);
  }

  function layoutNodes(tree) {
    const byParent = new Map();
    tree.nodes.forEach(function (node) {
      const key = node.parentId || '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(node);
    });
    const positions = {};
    let cursor = 0;
    function walk(node, depth) {
      const kids = byParent.get(node.id) || [];
      if (!kids.length) {
        const x = cursor;
        cursor += 1;
        positions[node.id] = { x: x, y: depth };
        return x;
      }
      const xs = kids.map(function (kid) { return walk(kid, depth + 1); });
      positions[node.id] = { x: (xs[0] + xs[xs.length - 1]) / 2, y: depth };
      return positions[node.id].x;
    }
    (byParent.get('') || []).forEach(function (node) { walk(node, 0); });
    return positions;
  }

  function dump(tree) {
    return JSON.stringify(tree);
  }

  function cleanSkipped(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 8).map(function (item) {
      return {
        title: String(item && item.title || '').slice(0, 48),
        reason: String(item && item.reason || '').slice(0, REASON_MAX),
        rejected: Boolean(item && item.rejected),
      };
    }).filter(function (item) { return item.title; });
  }

  function load(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    if (!data || !Array.isArray(data.nodes) || !data.nodes.length) return null;
    const ids = new Set();
    const nodes = [];
    for (let i = 0; i < data.nodes.length; i++) {
      const node = data.nodes[i];
      if (!node || typeof node.id !== 'string' || !/^b\d+$/.test(node.id) || ids.has(node.id)) return null;
      if (node.parentId !== null && typeof node.parentId !== 'string') return null;
      ids.add(node.id);
      const reason = String(node.reason || '').trim().replace(/\s+/g, ' ').slice(0, REASON_MAX);
      const rejected = Boolean(node.rejected) && reason.length > 0;
      nodes.push({
        id: node.id,
        parentId: node.parentId,
        title: String(node.title || 'Branch').slice(0, 48),
        blurb: String(node.blurb || '').slice(0, 220),
        kind: node.kind === 'agent' || node.kind === 'bake' ? node.kind : 'seed',
        rejected: rejected,
        reason: rejected ? reason : '',
        skipped: cleanSkipped(node.skipped),
        tokens: normalize(node.tokens),
      });
    }
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].parentId && !ids.has(nodes[i].parentId)) return null;
    }
    if (!ids.has(data.currentId)) return null;
    const compareId = typeof data.compareId === 'string' && ids.has(data.compareId) && data.compareId !== data.currentId
      ? data.compareId
      : null;
    let panel = closedPanel();
    if (data.panel && data.panel.open && ids.has(data.panel.baseId) && data.panel.draft) {
      panel = { open: true, baseId: data.panel.baseId, draft: normalize(data.panel.draft) };
    }
    let nextId = Number.isInteger(data.nextId) && data.nextId > 0 ? data.nextId : nodes.length + 1;
    while (ids.has('b' + nextId)) nextId += 1;
    return { nextId: nextId, currentId: data.currentId, compareId: compareId, panel: panel, nodes: nodes };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    REASON_MAX: REASON_MAX,
    RECIPES: RECIPES,
    seedTokens: seedTokens,
    normalize: normalize,
    signature: signature,
    createTree: createTree,
    findNode: findNode,
    forkFrom: forkFrom,
    selectNode: selectNode,
    toggleCompare: toggleCompare,
    clearCompare: clearCompare,
    openPanel: openPanel,
    closePanel: closePanel,
    tune: tune,
    bake: bake,
    rejectNode: rejectNode,
    restoreNode: restoreNode,
    activeTokens: activeTokens,
    layoutNodes: layoutNodes,
    dump: dump,
    load: load,
  };
});
