const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const orchard = require('./orchard.js');

function chainText(state) {
  return JSON.stringify(orchard.chainView(state));
}

test('a depth-4 tree stands in for depth 32, and empty leaves are 2', async function () {
  const state = await orchard.seed();
  assert.equal(state.depth, 4);
  assert.equal(orchard.LEAF_COUNT, 16);
  assert.equal(state.leaves.length, 16);
  assert.equal(state.next, 3);
  assert.equal(orchard.UNCOMMITTED, '2');
  for (let i = 3; i < 16; i++) assert.equal(state.leaves[i], '2');
  assert.equal(state.anchor, state.layers[0][0]);
  assert.equal(state.path.length, 4);
  assert.equal(state.nullifiers.length, 0);
  assert.equal(state.actions.length, 0);
  const blank = new Array(16).fill('2');
  const empty = await orchard.layersOf(blank);
  assert.notEqual(empty[0][0], state.anchor);
  const wallet = orchard.walletView(state);
  assert.equal(wallet.length, 2);
  assert.equal(wallet[0].memo, 'grove');
  assert.equal(wallet[0].spent, false);
  assert.equal(chainText(state).includes('grove'), false);
  assert.equal(chainText(state).includes('sealed'), false);
});

test('create appends cmx, leaves the spend unnamed, and the viewing key opens it', async function () {
  const start = await orchard.seed();
  const before = start.anchor;
  const made = await orchard.createNote(start, '9', 'lamp oil');
  assert.equal(made.ok, true);
  const state = made.state;
  assert.equal(state.next, 4);
  assert.equal(state.leaves[3], state.actions[0].cmx);
  assert.equal(state.leaves[0], start.leaves[0]);
  assert.equal(state.leaves[4], '2');
  assert.notEqual(state.anchor, before);
  assert.equal(state.path[0].index, 3);
  assert.equal(state.path[0].sibling, 2);
  assert.equal(state.path[0].siblingValue, state.leaves[2]);
  assert.equal(state.path.length, orchard.DEPTH);
  const row = orchard.chainAction(state.actions[0]);
  assert.deepEqual(Object.keys(row).sort(), ['cmx', 'cv', 'nf', 'position']);
  assert.equal(row.position, 3);
  assert.equal(chainText(state).includes('lamp oil'), false);
  assert.equal(chainText(state).includes('ciphertext'), false);
  const opened = await orchard.readActions(state, orchard.SELF);
  assert.deepEqual(opened[0].opened, {amount: 9, memo: 'lamp oil'});
  const sealed = await orchard.readActions(state, orchard.OTHER);
  assert.equal(sealed[0].opened, null);
  const wallet = orchard.walletView(state);
  assert.equal(wallet[2].amount, 9);
  assert.equal(wallet[2].spent, false);
  assert.match(orchard.treeSource(state), /n4_3\["cm /);
  assert.match(orchard.treeSource(state), /:::path/);
  assert.doesNotMatch(orchard.treeSource(state), /spent/i);
  assert.match(orchard.actionSource(state.actions[0]), /nf /);
  assert.match(orchard.actionSource(state.actions[0]), /cmx /);
  assert.doesNotMatch(orchard.actionSource(state.actions[0]), /lamp/);
});

test('a send hides the spent leaf, and a second spend of it fails', async function () {
  const start = await orchard.seed();
  const leaf = start.leaves[0];
  const sent = await orchard.send(start, 0, 4, 'boat fee');
  assert.equal(sent.ok, true);
  const state = sent.state;
  assert.equal(state.leaves[0], leaf);
  assert.equal(state.leaves[3] === leaf, false);
  assert.equal(state.nullifiers.length, 1);
  assert.equal(orchard.walletView(state)[0].spent, true);
  assert.equal(orchard.walletView(state)[1].spent, false);
  assert.equal(chainText(state).includes('boat fee'), false);
  assert.equal(Object.hasOwn(state.actions[0], 'spent'), false);
  assert.equal(state.actions[0].position, 3);
  const opened = await orchard.readActions(state, orchard.SELF);
  assert.equal(opened[0].opened, null);
  const again = await orchard.send(state, 0, 1, 'again');
  assert.equal(again.ok, false);
  assert.equal(again.state, state);
  assert.match(again.reason, /already spent/);
  assert.equal(orchard.walletView(state).length, 2);
});

test('a dummy action has the same public shape and opens to zero', async function () {
  const start = await orchard.seed();
  const real = await orchard.createNote(start, 2, 'lamp oil');
  const dummy = await orchard.dummyAction(real.state);
  assert.equal(dummy.ok, true);
  const actions = orchard.chainView(dummy.state).actions;
  assert.deepEqual(Object.keys(actions[0]).sort(), Object.keys(actions[1]).sort());
  assert.equal(actions[1].position, 4);
  assert.notEqual(actions[0].nf, actions[1].nf);
  assert.notEqual(actions[0].cmx, actions[1].cmx);
  assert.notEqual(actions[0].cv, actions[1].cv);
  const opened = await orchard.readActions(dummy.state, orchard.SELF);
  assert.deepEqual(opened[1].opened, {amount: 0, memo: ''});
  assert.match(orchard.actionSource(dummy.state.actions[1]), /cv /);
  const bad = await orchard.createNote(start, '-1', 'nope');
  assert.equal(bad.ok, false);
  const huge = await orchard.createNote(start, 1, 'x'.repeat(49));
  assert.equal(huge.ok, false);
});

test('the value-commitment blob changes with the amounts and is not the amount', async function () {
  const start = await orchard.seed();
  const a = await orchard.createNote(start, 4, 'lamp oil');
  const b = await orchard.createNote(start, 5, 'lamp oil');
  assert.notEqual(a.state.actions[0].cv, b.state.actions[0].cv);
  assert.equal(a.state.actions[0].cv.length, 64);
  assert.equal(Object.hasOwn(a.state.actions[0], 'amount'), false);
  const same = await orchard.createNote(start, 4, 'lamp oil');
  assert.equal(same.state.actions[0].cv, a.state.actions[0].cv);
});

test('Pele draws the tree, the uncommitted leaves, and the action', async function () {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'vendor/pele.global.js'), 'utf8'), ctx);
  const made = await orchard.createNote(await orchard.seed(), 6, 'lamp oil');
  const tree = ctx.pele.render(orchard.treeSource(made.state)).svg;
  assert.match(tree, /pele-flowchart/);
  assert.match(tree, /pele-node[^"]*path/);
  assert.match(tree, />2</);
  assert.doesNotMatch(tree, /spent/i);
  const action = ctx.pele.render(orchard.actionSource(made.state.actions[0])).svg;
  assert.match(action, /Action/);
  assert.match(action, /cmx /);
  const empty = ctx.pele.render(orchard.actionSource(null)).svg;
  assert.match(empty, /spend/);
});
