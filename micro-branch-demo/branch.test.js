const test = require('node:test');
const assert = require('node:assert/strict');
const branch = require('./branch.js');

test('the seed is one docked card with the five tokens', function () {
  const tree = branch.createTree();
  assert.equal(tree.nodes.length, 1);
  assert.equal(tree.currentId, 'b1');
  assert.equal(tree.nodes[0].kind, 'seed');
  assert.deepEqual(tree.nodes[0].tokens, {
    radius: 22,
    spacing: 16,
    accent: '#0A84FF',
    type: 17,
    shadow: 16,
    layout: 'dock',
  });
  assert.equal(tree.panel.open, false);
});

test('a fork hangs off the node you point at and becomes current', function () {
  const first = branch.forkFrom(branch.createTree(), 'b1');
  assert.equal(first.created.parentId, 'b1');
  assert.equal(first.created.kind, 'agent');
  assert.equal(first.tree.currentId, first.created.id);
  assert.notEqual(branch.signature(first.created.tokens), branch.signature(branch.seedTokens()));
  const second = branch.forkFrom(first.tree, first.created.id);
  assert.equal(second.created.parentId, first.created.id);
  assert.notEqual(branch.signature(second.created.tokens), branch.signature(first.created.tokens));
});

test('a rejected signature is skipped, and the reason is kept on the new branch', function () {
  let tree = branch.createTree();
  tree = branch.forkFrom(tree, 'b1').tree;
  const softer = tree.nodes[1];
  assert.equal(softer.title, 'Softer card');
  tree = branch.rejectNode(tree, softer.id, '  too round  ');
  assert.equal(branch.findNode(tree, softer.id).reason, 'too round');
  const again = branch.forkFrom(tree, 'b1');
  assert.equal(again.created.title, 'Tighter chrome');
  const avoided = again.created.skipped.filter(function (item) { return item.rejected; });
  assert.equal(avoided.length, 1);
  assert.equal(avoided[0].title, 'Softer card');
  assert.equal(avoided[0].reason, 'too round');
  assert.notEqual(branch.signature(again.created.tokens), branch.signature(softer.tokens));
});

test('an empty rejection does nothing', function () {
  const tree = branch.createTree();
  const next = branch.rejectNode(tree, 'b1', '   ');
  assert.equal(next, tree);
  assert.equal(next.nodes[0].rejected, false);
});

test('tuning changes the phone draft and leaves the branch until bake', function () {
  let tree = branch.openPanel(branch.createTree());
  const before = branch.signature(tree.nodes[0].tokens);
  tree = branch.tune(tree, { radius: 4, accent: '#ff375f', shadow: 0 });
  assert.equal(branch.signature(tree.nodes[0].tokens), before);
  assert.equal(branch.activeTokens(tree, 'b1').radius, 4);
  assert.equal(branch.activeTokens(tree, 'b1').accent, '#FF375F');
  assert.equal(branch.activeTokens(tree, 'b1').shadow, 0);
  const baked = branch.bake(tree);
  assert.equal(baked.created.kind, 'bake');
  assert.equal(baked.created.parentId, 'b1');
  assert.equal(baked.created.tokens.radius, 4);
  assert.equal(baked.tree.panel.open, false);
  assert.equal(baked.tree.currentId, baked.created.id);
  assert.equal(branch.findNode(baked.tree, 'b1').tokens.radius, 22);
});

test('baking an untouched panel removes it and adds no branch', function () {
  const opened = branch.openPanel(branch.createTree());
  const baked = branch.bake(opened);
  assert.equal(baked.unchanged, true);
  assert.equal(baked.created, null);
  assert.equal(baked.tree.nodes.length, 1);
  assert.equal(baked.tree.panel.open, false);
});

test('two nodes can be compared, and selecting the comparison clears it', function () {
  let tree = branch.forkFrom(branch.createTree(), 'b1').tree;
  const child = tree.currentId;
  tree = branch.selectNode(tree, 'b1');
  tree = branch.toggleCompare(tree, child);
  assert.equal(tree.compareId, child);
  assert.equal(tree.currentId, 'b1');
  tree = branch.toggleCompare(tree, child);
  assert.equal(tree.compareId, null);
  tree = branch.toggleCompare(tree, child);
  tree = branch.selectNode(tree, child);
  assert.equal(tree.currentId, child);
  assert.equal(tree.compareId, null);
  const forked = branch.forkFrom(branch.createTree(), 'b1').tree;
  assert.equal(branch.toggleCompare(forked, forked.currentId).compareId, null);
});

test('the parent sits between its children', function () {
  let tree = branch.createTree();
  tree = branch.forkFrom(tree, 'b1').tree;
  tree = branch.forkFrom(tree, 'b1').tree;
  const pos = branch.layoutNodes(tree);
  assert.equal(pos.b1.y, 0);
  assert.equal(pos.b2.y, 1);
  assert.equal(pos.b3.y, 1);
  assert.ok(pos.b1.x > Math.min(pos.b2.x, pos.b3.x));
  assert.ok(pos.b1.x < Math.max(pos.b2.x, pos.b3.x));
});

test('the tree round-trips through the storage shape', function () {
  let tree = branch.openPanel(branch.forkFrom(branch.createTree(), 'b1').tree);
  tree = branch.tune(tree, { spacing: 28 });
  tree = branch.rejectNode(tree, 'b1', 'too blue');
  const loaded = branch.load(branch.dump(tree));
  assert.deepEqual(loaded, tree);
  assert.equal(branch.load('nope'), null);
  assert.equal(branch.load('{"nodes":[]}'), null);
});

test('a bad accent and an out-of-range radius fall back inside the scale', function () {
  const tokens = branch.normalize({ radius: 80, accent: 'blue', spacing: 2, type: 3, shadow: -4, layout: 'nope' });
  assert.equal(tokens.radius, 40);
  assert.equal(tokens.accent, '#0A84FF');
  assert.equal(tokens.spacing, 8);
  assert.equal(tokens.type, 13);
  assert.equal(tokens.shadow, 0);
  assert.equal(tokens.layout, 'dock');
});
