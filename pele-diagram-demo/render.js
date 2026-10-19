// A tiny Mermaid flowchart subset: nodes, edges, labels, TD and LR.
// It is not Pele, and it does not time mermaid.js.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Flowchart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FRAME_MS = 16.7;
  const STRESS_MAX = 500;

  const STARTER = [
    'flowchart TD',
    '  A[Mermaid text] --> B{Flowchart?}',
    '  B -->|yes| C[Tiny renderer]',
    '  B -->|no| D[Left as text]',
    '  C --> E([SVG])',
    '  D --> E',
  ].join('\n');

  function clamp(value, min, max) {
    const number = Math.round(Number(value) || 0);
    if (number < min) return min;
    if (number > max) return max;
    return number;
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseNode(line, start) {
    let i = start;
    while (i < line.length && line.charAt(i) === ' ') i += 1;
    const match = /^[A-Za-z][\w-]*/.exec(line.slice(i));
    if (!match) return {error: 'Expected a node id'};
    const id = match[0];
    i += id.length;
    while (i < line.length && line.charAt(i) === ' ') i += 1;
    if (line.slice(i, i + 2) === '([' ) {
      const end = line.indexOf('])', i + 2);
      if (end < 0) return {error: 'Unclosed stadium'};
      return {node: {id: id, label: line.slice(i + 2, end), shape: 'stadium', explicit: true}, index: end + 2};
    }
    if (line.slice(i, i + 2) === '((') {
      const end = line.indexOf('))', i + 2);
      if (end < 0) return {error: 'Unclosed circle'};
      return {node: {id: id, label: line.slice(i + 2, end), shape: 'circle', explicit: true}, index: end + 2};
    }
    const pairs = {'[': [']', 'rect'], '(': [')', 'round'], '{': ['}', 'diamond']};
    const open = line.charAt(i);
    if (pairs[open]) {
      const close = pairs[open][0];
      const shape = pairs[open][1];
      const end = line.indexOf(close, i + 1);
      if (end < 0) return {error: 'Unclosed ' + shape};
      return {node: {id: id, label: line.slice(i + 1, end), shape: shape, explicit: true}, index: end + 1};
    }
    return {node: {id: id, label: id, shape: 'rect', explicit: false}, index: i};
  }

  function parseEdge(line, start) {
    let i = start;
    while (i < line.length && line.charAt(i) === ' ') i += 1;
    const rest = line.slice(i);
    let match = /^-->\|([^|]*)\|/.exec(rest);
    if (match) return {edge: {kind: 'arrow', label: match[1].trim()}, index: i + match[0].length};
    match = /^--\s+(.+?)\s+-->/.exec(rest);
    if (match) return {edge: {kind: 'arrow', label: match[1].trim()}, index: i + match[0].length};
    match = /^--\s+(.+?)\s+---/.exec(rest);
    if (match) return {edge: {kind: 'line', label: match[1].trim()}, index: i + match[0].length};
    if (rest.indexOf('-.->') === 0) return {edge: {kind: 'dotted', label: ''}, index: i + 4};
    if (rest.indexOf('==>') === 0) return {edge: {kind: 'thick', label: ''}, index: i + 3};
    if (rest.indexOf('-->') === 0) return {edge: {kind: 'arrow', label: ''}, index: i + 3};
    if (rest.indexOf('---') === 0) return {edge: {kind: 'line', label: ''}, index: i + 3};
    return null;
  }

  function parseStatement(line) {
    const first = parseNode(line, 0);
    if (first.error) return {ok: false, message: first.error};
    const parts = [first.node];
    let i = first.index;
    while (i < line.length) {
      while (i < line.length && line.charAt(i) === ' ') i += 1;
      if (i >= line.length) break;
      const edge = parseEdge(line, i);
      if (!edge) return {ok: false, message: 'Expected an edge'};
      const node = parseNode(line, edge.index);
      if (node.error) return {ok: false, message: node.error};
      parts.push(edge.edge, node.node);
      i = node.index;
    }
    return {ok: true, parts: parts};
  }

  function parse(source) {
    const errors = [];
    const nodes = new Map();
    const order = [];
    const edges = [];
    let direction = 'TD';

    function addNode(spec) {
      const existing = nodes.get(spec.id);
      if (!existing) {
        nodes.set(spec.id, {id: spec.id, label: spec.label || spec.id, shape: spec.shape || 'rect'});
        order.push(spec.id);
      } else if (spec.explicit) {
        existing.label = spec.label;
        existing.shape = spec.shape || existing.shape;
      }
      return spec.id;
    }

    String(source || '').split(/\r?\n/).forEach(function (raw, index) {
      const line = raw.trim();
      if (!line || line.indexOf('%%') === 0) return;
      const header = line.match(/^(flowchart|graph)\s+(TD|TB|LR|BT|RL)\s*$/i);
      if (header) {
        const token = header[2].toUpperCase();
        if (token === 'LR') direction = 'LR';
        else if (token === 'TD' || token === 'TB') direction = 'TD';
        else {
          errors.push({line: index + 1, message: 'Direction ' + token + ' is outside this subset. Use TD or LR.'});
          direction = 'TD';
        }
        return;
      }
      const statement = parseStatement(line);
      if (!statement.ok) {
        errors.push({line: index + 1, message: statement.message});
        return;
      }
      let previous = addNode(statement.parts[0]);
      for (let i = 1; i < statement.parts.length; i += 2) {
        const edge = statement.parts[i];
        const id = addNode(statement.parts[i + 1]);
        edges.push({from: previous, to: id, label: edge.label, kind: edge.kind});
        previous = id;
      }
    });

    return {
      direction: direction,
      nodes: order.map(function (id) { return nodes.get(id); }),
      edges: edges,
      errors: errors,
    };
  }

  function measure(node) {
    const label = node.label || node.id;
    const textW = Math.max(56, Math.round(label.length * 7.2 + 28));
    if (node.shape === 'diamond') return {w: textW + 36, h: 72};
    if (node.shape === 'circle') {
      const d = Math.max(68, textW);
      return {w: d, h: d};
    }
    if (node.shape === 'stadium' || node.shape === 'round') return {w: textW + 16, h: 44};
    return {w: textW, h: 44};
  }

  function layout(graph) {
    const nodes = graph.nodes.map(function (node) {
      const size = measure(node);
      return {
        id: node.id,
        label: node.label,
        shape: node.shape,
        w: size.w,
        h: size.h,
        rank: 0,
        x: 0,
        y: 0,
      };
    });
    const byId = {};
    nodes.forEach(function (node) { byId[node.id] = node; });
    const limit = Math.max(nodes.length, 1);
    for (let pass = 0; pass < limit; pass += 1) {
      let changed = false;
      graph.edges.forEach(function (edge) {
        if (!byId[edge.from] || !byId[edge.to]) return;
        const next = byId[edge.from].rank + 1;
        if (next < limit && next > byId[edge.to].rank) {
          byId[edge.to].rank = next;
          changed = true;
        }
      });
      if (!changed) break;
    }

    const groups = {};
    nodes.forEach(function (node) {
      if (!groups[node.rank]) groups[node.rank] = [];
      groups[node.rank].push(node);
    });
    const ranks = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    const vertical = graph.direction !== 'LR';
    const gap = 32;
    const lane = 56;
    let cursor = 28;
    ranks.forEach(function (rank) {
      const group = groups[rank];
      let main = 0;
      group.forEach(function (node) { main = Math.max(main, vertical ? node.h : node.w); });
      let cross = 28;
      group.forEach(function (node) {
        if (vertical) {
          node.y = cursor;
          node.x = cross;
        } else {
          node.x = cursor;
          node.y = cross;
        }
        cross += (vertical ? node.w : node.h) + gap;
      });
      const used = cross - gap;
      group.forEach(function (node) { node.crossUsed = used; });
      cursor += main + lane;
    });
    let maxCross = 0;
    nodes.forEach(function (node) { maxCross = Math.max(maxCross, node.crossUsed || 0); });
    nodes.forEach(function (node) {
      const shift = Math.max(0, (maxCross - (node.crossUsed || 0)) / 2);
      if (vertical) node.x += shift;
      else node.y += shift;
    });

    let width = 160;
    let height = 100;
    nodes.forEach(function (node) {
      width = Math.max(width, node.x + node.w + 28);
      height = Math.max(height, node.y + node.h + 28);
    });

    const edges = graph.edges.map(function (edge, index) {
      const from = byId[edge.from];
      const to = byId[edge.to];
      const route = edgeRoute(from, to, graph.direction, index);
      return {
        from: edge.from,
        to: edge.to,
        label: edge.label,
        kind: edge.kind,
        d: route.d,
        labelX: route.labelX,
        labelY: route.labelY,
      };
    });

    return {
      direction: graph.direction,
      nodes: nodes,
      edges: edges,
      width: Math.round(width),
      height: Math.round(height),
      errors: graph.errors,
    };
  }

  function edgeRoute(from, to, direction, index) {
    if (!from || !to) return {d: '', labelX: 0, labelY: 0};
    if (direction === 'LR') {
      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;
      if (x2 >= x1 + 8) {
        const mid = (x1 + x2) / 2;
        return {d: 'M ' + x1 + ' ' + y1 + ' L ' + mid + ' ' + y1 + ' L ' + mid + ' ' + y2 + ' L ' + x2 + ' ' + y2, labelX: mid, labelY: (y1 + y2) / 2};
      }
      const y = Math.max(from.y + from.h, to.y + to.h) + 18 + (index % 4) * 10;
      return {d: 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + y + ' L ' + x2 + ' ' + y + ' L ' + x2 + ' ' + y2, labelX: (x1 + x2) / 2, labelY: y};
    }
    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h;
    const x2 = to.x + to.w / 2;
    const y2 = to.y;
    if (y2 >= y1 + 8) {
      const mid = (y1 + y2) / 2;
      return {d: 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + mid + ' L ' + x2 + ' ' + mid + ' L ' + x2 + ' ' + y2, labelX: (x1 + x2) / 2, labelY: mid};
    }
    const x = Math.max(from.x + from.w, to.x + to.w) + 18 + (index % 4) * 10;
    return {d: 'M ' + x1 + ' ' + y1 + ' L ' + x + ' ' + y1 + ' L ' + x + ' ' + y2 + ' L ' + x2 + ' ' + y2, labelX: x, labelY: (y1 + y2) / 2};
  }

  function nodeShape(node) {
    const x = round(node.x);
    const y = round(node.y);
    const w = round(node.w);
    const h = round(node.h);
    if (node.shape === 'diamond') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      return '<polygon points="' + cx + ',' + y + ' ' + (x + w) + ',' + cy + ' ' + cx + ',' + (y + h) + ' ' + x + ',' + cy + '"/>';
    }
    if (node.shape === 'circle') {
      return '<ellipse cx="' + (x + w / 2) + '" cy="' + (y + h / 2) + '" rx="' + (w / 2) + '" ry="' + (h / 2) + '"/>';
    }
    const rx = node.shape === 'stadium' || node.shape === 'round' ? h / 2 : 8;
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '"/>';
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function toSvg(placed) {
    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" class="diagram" viewBox="0 0 ' + placed.width + ' ' + placed.height + '" role="img">');
    parts.push('<title>Flowchart</title>');
    parts.push('<defs><marker id="arrowhead" viewBox="0 0 8 6" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z"/></marker></defs>');
    if (!placed.nodes.length) {
      parts.push('<text class="empty-diagram" x="24" y="48">Nothing to draw yet.</text>');
    }
    parts.push('<g class="edges">');
    placed.edges.forEach(function (edge) {
      const marker = edge.kind === 'line' ? '' : ' marker-end="url(#arrowhead)"';
      parts.push('<path class="edge ' + edge.kind + '" d="' + edge.d + '"' + marker + '/>');
      if (edge.label) {
        const width = Math.max(28, edge.label.length * 7 + 12);
        parts.push('<g class="edge-label">');
        parts.push('<rect x="' + round(edge.labelX - width / 2) + '" y="' + round(edge.labelY - 10) + '" width="' + width + '" height="20" rx="6"/>');
        parts.push('<text x="' + round(edge.labelX) + '" y="' + round(edge.labelY + 4) + '">' + escapeXml(edge.label) + '</text>');
        parts.push('</g>');
      }
    });
    parts.push('</g><g class="nodes">');
    placed.nodes.forEach(function (node) {
      parts.push('<g class="node shape-' + node.shape + '" data-id="' + escapeXml(node.id) + '">');
      parts.push(nodeShape(node));
      parts.push('<text x="' + round(node.x + node.w / 2) + '" y="' + round(node.y + node.h / 2 + 4) + '">' + escapeXml(node.label) + '</text>');
      parts.push('</g>');
    });
    parts.push('</g></svg>');
    return parts.join('');
  }

  function render(source, options) {
    const now = options && options.now ? options.now : function () { return 0; };
    const started = now();
    const graph = parse(source);
    const placed = layout(graph);
    const svg = toSvg(placed);
    return {
      svg: svg,
      ms: now() - started,
      graph: graph,
      placed: placed,
      direction: graph.direction,
      errors: graph.errors,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    };
  }

  function setDirection(source, direction) {
    const dir = direction === 'LR' ? 'LR' : 'TD';
    const text = String(source || '');
    if (/^\s*(?:flowchart|graph)\s+(?:TD|TB|LR|BT|RL)\b/im.test(text)) {
      return text.replace(/^(\s*)(?:flowchart|graph)\s+(?:TD|TB|LR|BT|RL)\b/im, '$1flowchart ' + dir);
    }
    return 'flowchart ' + dir + '\n' + text;
  }

  function stressSource(count, direction) {
    const n = clamp(count, 2, STRESS_MAX);
    const dir = direction === 'LR' ? 'LR' : 'TD';
    const width = Math.max(2, Math.round(Math.sqrt(n)));
    const lines = ['flowchart ' + dir];
    for (let i = 0; i < n; i += 1) lines.push('n' + i + '[N ' + i + ']');
    for (let i = 0; i < n; i += 1) {
      if (i % width !== width - 1 && i + 1 < n) lines.push('n' + i + ' --> n' + (i + 1));
      if (i + width < n) lines.push('n' + i + ' --> n' + (i + width));
    }
    return lines.join('\n');
  }

  return {
    FRAME_MS: FRAME_MS,
    STRESS_MAX: STRESS_MAX,
    STARTER: STARTER,
    parse: parse,
    layout: layout,
    toSvg: toSvg,
    render: render,
    setDirection: setDirection,
    stressSource: stressSource,
    escapeXml: escapeXml,
  };
});
