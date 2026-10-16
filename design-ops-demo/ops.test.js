const test = require('node:test');
const assert = require('node:assert/strict');
const ops = require('./ops.js');

function run(state, fn) {
  const result = fn(state);
  assert.equal(result.ok, true, result.code);
  return result.state;
}

test('a branch can change while Gospel and production stay', () => {
  let state = ops.create();
  assert.equal(state.phase, 'assigned');
  assert.equal(state.design.screen, 'plain');
  assert.equal(state.production.version, 1);
  assert.equal(ops.submit(state).code, 'Phase');
  assert.equal(ops.choose(state, 'quiet').code, 'Phase');

  state = run(state, ops.pullDesign);
  assert.equal(state.designBranch.name, 'a/home-card');
  assert.equal(state.designBranch.screen, 'plain');
  assert.equal(ops.choose(state, 'chips').code, 'Screen');

  state = run(state, function (current) { return ops.choose(current, 'night'); });
  assert.equal(state.phase, 'drafting');
  assert.equal(state.designBranch.screen, 'night');
  assert.equal(state.design.screen, 'plain');
  assert.equal(state.design.version, 1);
  assert.equal(ops.designMark('drafting', state.phase), 'now');
  assert.equal(ops.designMark('assigned', state.phase), 'done');
  assert.equal(ops.engMark('handed', state.phase), 'wait');
});

test('feedback returns the branch and does not merge', () => {
  let state = ops.create();
  state = run(state, ops.pullDesign);
  state = run(state, function (current) { return ops.choose(current, 'quiet'); });
  state = run(state, ops.submit);
  assert.equal(ops.designMark('submitted', state.phase), 'done');
  assert.equal(ops.designMark('review', state.phase), 'now');

  state = run(state, ops.feedback);
  assert.equal(state.phase, 'drafting');
  assert.equal(state.feedback, true);
  assert.equal(state.exploration, 'quiet');
  assert.equal(state.design.screen, 'plain');
  assert.equal(ops.mergeDesign(state).code, 'Phase');

  state = run(state, function (current) { return ops.choose(current, 'ticket'); });
  state = run(state, ops.submit);
  assert.equal(state.feedback, false);
  assert.equal(state.designBranch.screen, 'ticket');
});

test('merge updates Design Gospel only, and deploy is the production write', () => {
  let state = ops.create();
  state = run(state, ops.pullDesign);
  state = run(state, function (current) { return ops.choose(current, 'night'); });
  state = run(state, ops.submit);
  assert.equal(ops.handoff(state).code, 'Phase');
  assert.equal(ops.deploy(state).code, 'Phase');
  state = run(state, ops.approve);
  assert.equal(state.design.version, 1);
  state = run(state, ops.mergeDesign);
  assert.equal(state.phase, 'designMerged');
  assert.equal(state.design.version, 2);
  assert.equal(state.design.screen, 'night');
  assert.equal(state.designBranch, null);
  assert.equal(state.engineering.screen, 'plain');
  assert.equal(state.production.screen, 'plain');
  assert.equal(ops.designMark('merged', state.phase), 'now');

  state = run(state, ops.handoff);
  assert.equal(state.packet.screen, 'night');
  assert.equal(state.engineering.version, 1);
  state = run(state, ops.pullEng);
  assert.equal(state.engBranch.name, 'eng/home-card');
  assert.equal(state.engBranch.screen, 'plain');
  state = run(state, ops.address);
  assert.equal(state.engBranch.screen, 'plain');
  state = run(state, ops.apply);
  assert.equal(state.engBranch.screen, 'night');
  assert.equal(state.engineering.screen, 'plain');
  state = run(state, ops.mergeEng);
  assert.equal(state.engineering.version, 2);
  assert.equal(state.engineering.screen, 'night');
  assert.equal(state.engBranch, null);
  assert.equal(state.production.version, 1);

  state = run(state, ops.deploy);
  assert.equal(state.production.version, 2);
  assert.equal(state.production.screen, 'night');
  assert.equal(ops.engMark('production', state.phase), 'now');
  assert.equal(ops.designMark('merged', state.phase), 'done');
  assert.deepEqual(ops.NOTES.night, ['Dark ground', 'Light type']);
});

test('the next task keeps production until the next deploy', () => {
  let state = ops.create();
  state = run(state, ops.pullDesign);
  state = run(state, function (current) { return ops.choose(current, 'quiet'); });
  state = run(state, ops.submit);
  state = run(state, ops.approve);
  state = run(state, ops.mergeDesign);
  state = run(state, ops.handoff);
  state = run(state, ops.pullEng);
  state = run(state, ops.address);
  state = run(state, ops.apply);
  state = run(state, ops.mergeEng);
  state = run(state, ops.deploy);
  assert.equal(ops.task(state).title, 'Home card');

  state = run(state, ops.nextTask);
  assert.equal(ops.task(state).title, 'Status row');
  assert.equal(state.phase, 'assigned');
  assert.equal(state.packet, null);
  assert.equal(state.production.screen, 'quiet');
  assert.equal(state.design.screen, 'quiet');
  assert.equal(ops.pullDesign(state).state.designBranch.screen, 'quiet');
  assert.equal(ops.nextTask(state).code, 'Phase');
});
