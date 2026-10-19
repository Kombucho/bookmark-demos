const assert = require('node:assert/strict');
const test = require('node:test');
const flow = require('./render.js');

function node(placed, id) {
  return placed.nodes.find(function (item) { return item.id === id; });
}

test('the starter flowchart parses nodes, shapes, labels, and TD', function () {
  const graph = flow.parse(flow.STARTER);
  assert.equal(graph.direction, 'TD');
  assert.deepEqual(graph.errors, []);
  assert.deepEqual(graph.nodes.map(function (item) { return item.id; }), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(graph.nodes[0].shape, 'rect');
  assert.equal(graph.nodes[0].label, 'Mermaid text');
  assert.equal(graph.nodes[1].shape, 'diamond');
  assert.equal(graph.nodes[1].label, 'Flowchart?');
  assert.equal(graph.nodes[4].shape, 'stadium');
  assert.equal(graph.nodes[4].label, 'SVG');
  assert.equal(graph.edges.length, 5);
  assert.deepEqual(graph.edges.map(function (edge) { return edge.label; }), ['', 'yes', 'no', '', '']);
  assert.equal(graph.edges[1].kind, 'arrow');
});

test('comments, blank lines, chains, and the other shapes parse', function () {
  const graph = flow.parse([
    '%% a comment',
    '',
    'flowchart LR',
    'A(Round) --> B((Dot)) --> C[Box]',
    'A -- hold --- D[Wait]',
    'C -.-> E[Later]',
    'E ==> F[Done]',
  ].join('\n'));
  assert.equal(graph.direction, 'LR');
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.nodes.find(function (item) { return item.id === 'A'; }).shape, 'round');
  assert.equal(graph.nodes.find(function (item) { return item.id === 'B'; }).shape, 'circle');
  assert.equal(graph.edges.length, 5);
  assert.equal(graph.edges[0].from, 'A');
  assert.equal(graph.edges[0].to, 'B');
  assert.equal(graph.edges[1].to, 'C');
  assert.equal(graph.edges[2].kind, 'line');
  assert.equal(graph.edges[2].label, 'hold');
  assert.equal(graph.edges[3].kind, 'dotted');
  assert.equal(graph.edges[4].kind, 'thick');
});

test('TB is top-down, and BT or RL is reported instead of drawn that way', function () {
  assert.equal(flow.parse('graph TB\nA --> B').direction, 'TD');
  const graph = flow.parse('flowchart BT\nA --> B\nflowchart RL');
  assert.equal(graph.direction, 'TD');
  assert.equal(graph.errors.length, 2);
  assert.match(graph.errors[0].message, /BT/);
  assert.match(graph.errors[1].message, /RL/);
});

test('a broken line is an error and the rest of the diagram still lays out', function () {
  const graph = flow.parse('flowchart TD\nA[Ok] --> B[Also]\nthis is not a node\nB --> C[End]\nD[Open');
  assert.equal(graph.errors.length, 2);
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
});

test('TD ranks downward and LR ranks to the right', function () {
  const down = flow.layout(flow.parse('flowchart TD\nA[One] --> B[Two]'));
  assert.ok(node(down, 'B').y > node(down, 'A').y);
  const across = flow.layout(flow.parse('flowchart LR\nA[One] --> B[Two]'));
  assert.ok(node(across, 'B').x > node(across, 'A').x);
  assert.ok(node(across, 'A').y === node(across, 'B').y);
});

test('svg escapes labels, draws the arrow, and names every node', function () {
  const result = flow.render('flowchart TD\nA["<b>"] -->|yes & no| B[Ok]', {now: function () { return 0; }});
  assert.equal(result.ms, 0);
  assert.match(result.svg, /&lt;b&gt;/);
  assert.equal(result.svg.indexOf('<b>'), -1);
  assert.match(result.svg, /yes &amp; no/);
  assert.match(result.svg, /marker-end="url\(#arrowhead\)"/);
  assert.match(result.svg, /data-id="A"/);
  assert.match(result.svg, /data-id="B"/);
  assert.match(result.svg, /viewBox="0 0 /);
});

test('the clock is the only source of the reported render time', function () {
  let tick = 10;
  const result = flow.render(flow.STARTER, {
    now: function () {
      const value = tick;
      tick += 4;
      return value;
    },
  });
  assert.equal(result.ms, 4);
  assert.equal(result.nodes, 5);
  assert.equal(result.edges, 5);
});

test('direction rewrite and the stress graph stay inside the subset', function () {
  assert.equal(flow.setDirection('flowchart TD\nA --> B', 'LR').indexOf('flowchart LR'), 0);
  assert.equal(flow.setDirection('A --> B', 'TD').indexOf('flowchart TD'), 0);
  const source = flow.stressSource(80, 'LR');
  const result = flow.render(source);
  assert.equal(result.direction, 'LR');
  assert.equal(result.nodes, 80);
  assert.equal(result.errors.length, 0);
  assert.ok(result.edges > 80);
  assert.match(result.svg, /<svg/);
  assert.equal(flow.parse(flow.stressSource(2, 'TD')).nodes.length, 2);
  assert.equal(flow.parse(flow.stressSource(900, 'TD')).nodes.length, flow.STRESS_MAX);
});

test('an empty source draws a board instead of throwing', function () {
  const result = flow.render('');
  assert.equal(result.nodes, 0);
  assert.equal(result.edges, 0);
  assert.match(result.svg, /Nothing to draw yet/);
  assert.equal(result.direction, 'TD');
});
