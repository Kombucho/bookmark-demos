const test = require('node:test');
const assert = require('node:assert/strict');
const session = require('./session.js');

function run(state, fn) {
  const result = fn(state);
  assert.equal(result.ok, true, result.code);
  return result.state;
}

function walk(state) {
  while (session.gates(state).advance) state = run(state, session.advance);
  return state;
}

function until(state, phase) {
  let guard = 0;
  while (state.phase !== phase) {
    state = run(state, session.advance);
    guard += 1;
    assert.ok(guard < 8);
  }
  return state;
}

function last(list) {
  return list[list.length - 1];
}

test('the two workflows use the published phase names, and Oneshot skips the rest', () => {
  assert.deepEqual(session.workflow('rpi').phases, [
    'questions', 'research', 'design', 'structure', 'plan', 'implement',
  ]);
  assert.equal(session.workflow('rpi').label, 'RPI Guided');
  assert.deepEqual(session.workflow('oneshot').phases, ['implement']);
  assert.match(session.workflow('oneshot').summary, /directly/);
  assert.equal(session.workflow('nope'), null);
  assert.equal(session.create('nope'), null);
  assert.deepEqual(session.PHASES.map(function (phase) { return phase.label; }), [
    'Questions', 'Research', 'Design', 'Structure', 'Plan', 'Implement',
  ]);
});

test('questions block the task until an answer, and that answer sets the design', () => {
  let state = session.create('rpi');
  assert.equal(state.phase, 'questions');
  assert.equal(session.advance(state).code, 'Question');
  assert.equal(session.comment(state, session.SCRIPTED_COMMENT).code, 'Phase');
  assert.equal(session.answer(state, 'later').code, 'Choice');
  assert.equal(session.gates(state).answer, true);
  assert.equal(session.gates(state).advance, false);

  state = run(state, function (current) { return session.answer(current, 'every'); });
  assert.equal(state.design, 'bare');
  assert.equal(session.phaseMark('questions', state), 'now');
  assert.equal(session.phaseMark('research', state), 'wait');
  state = run(state, session.advance);
  assert.equal(state.phase, 'research');
  assert.match(session.sheet(state).blocks[1].text, /Call refresh every time/);
  assert.equal(session.sessions(state)[0].status, 'DONE');
  assert.equal(session.sessions(state)[1].status, 'RUNNING');
  assert.equal(session.sessions(state)[1].label, 'Research authentication patterns');
  assert.equal(last(session.sessions(state)).status, 'DRAFT');
  assert.equal(session.diffLines(state), null);
});

test('an open design comment holds the task, and the scripted one rewrites the diff', () => {
  let state = session.create('rpi');
  state = run(state, function (current) { return session.answer(current, 'every'); });
  state = until(state, 'design');
  assert.equal(session.gates(state).comment, true);
  assert.equal(session.comment(state, '   ').code, 'Text');
  assert.equal(session.comment(state, 'x'.repeat(181)).code, 'Text');

  const held = run(state, function (current) { return session.comment(current, session.SCRIPTED_COMMENT); });
  assert.equal(session.advance(held).code, 'Open');
  assert.equal(session.gates(held).advance, false);
  assert.equal(session.gates(held).resolve, true);
  assert.equal(session.runState(held).id, 'held');
  assert.equal(session.comment(held, 'another').code, 'Open');
  assert.equal(session.sheet(held).blocks[2].lines.join('\n').includes('mutex'), false);

  state = run(held, session.resolve);
  assert.equal(state.design, 'mutex');
  assert.equal(state.comment.resolved, true);
  assert.match(state.comment.reply, /mutex/);
  assert.equal(session.runState(state).id, 'revised');
  assert.equal(session.sheet(state).blocks[2].lines.join('\n').includes('mutex.run'), true);

  state = walk(state);
  assert.equal(state.phase, 'implement');
  assert.equal(last(session.sessions(state)).status, 'RUNNING');
  assert.equal(session.sessions(state)[session.sessions(state).length - 2].status, 'DONE');
  const diff = session.diffLines(state);
  assert.equal(diff[0], 'src/auth/refresh.js');
  assert.deepEqual(diff.slice(1), session.MUTEX);
  assert.equal(session.runState(state).id, 'revised');
  assert.equal(session.gates(state).advance, false);
  assert.equal(session.advance(state).code, 'Phase');
});

test('a note that is not the scripted comment does not change the design', () => {
  let state = session.create('rpi');
  state = run(state, function (current) { return session.answer(current, 'share'); });
  assert.equal(state.design, 'mutex');
  state = until(state, 'design');
  const already = run(state, function (current) { return session.comment(current, session.SCRIPTED_COMMENT); });
  state = run(already, session.resolve);
  assert.equal(state.design, 'mutex');
  assert.equal(state.comment.reply, 'The design already shares one in-flight call.');
  state = run(state, function (current) { return session.comment(current, 'Looks fine.'); });
  state = run(state, session.resolve);
  assert.equal(state.comment.reply, 'Read. The design is unchanged.');
  assert.equal(state.design, 'mutex');
  state = walk(state);
  assert.deepEqual(session.diffLines(state).slice(1), session.MUTEX);
});

test('leaving the bare design uncommented ships the bare fetch', () => {
  let state = session.create('rpi');
  state = run(state, function (current) { return session.answer(current, 'every'); });
  state = until(state, 'design');
  state = walk(state);
  assert.equal(state.phase, 'implement');
  assert.deepEqual(session.diffLines(state).slice(1), session.BARE);
  assert.equal(session.runState(state).id, 'bare');
  assert.equal(session.sheet(state).blocks[2].lines.includes('mutex.run(function () {'), false);
});

test('Oneshot never opens the design and the diff is the bare fetch', () => {
  const state = session.create('oneshot');
  assert.equal(state.phase, 'implement');
  assert.equal(session.phaseMark('design', state), 'skip');
  assert.equal(session.phaseMark('implement', state), 'now');
  assert.equal(session.answer(state, 'share').code, 'Phase');
  assert.equal(session.comment(state, session.SCRIPTED_COMMENT).code, 'Phase');
  assert.equal(session.sessions(state).length, 1);
  assert.equal(session.sessions(state)[0].status, 'RUNNING');
  assert.deepEqual(session.diffLines(state).slice(1), session.BARE);
  assert.equal(session.runState(state).id, 'direct');
  assert.match(session.deny('Open'), /Resolve the open comment/);
  assert.match(session.deny('Phase'), /does not apply/);
});
