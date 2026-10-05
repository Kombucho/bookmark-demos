const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STORAGE_KEY,
  BASE,
  FIELDS,
  AGENT_SCRIPT,
  createInitialState,
  parseState,
  canonical,
  history,
  recordAt,
  diffFields,
  openChangeRequests,
  conflictingFields,
  overlaps,
  changeRequestRows,
  propose,
  comment,
  revise,
  approve,
  reject,
  applyNextScript,
} = require('./engine.js');

function fresh() {
  return createInitialState();
}

test('the base is Operations and the fields cover text, number, date, select, and relation', () => {
  assert.equal(BASE.name, 'Operations');
  assert.deepEqual(FIELDS.map(field => [field.name, field.type]), [
    ['Title', 'text'],
    ['Stage', 'select'],
    ['Priority', 'number'],
    ['Due', 'date'],
    ['Owner', 'relation'],
    ['Note', 'text'],
  ]);
  assert.equal(STORAGE_KEY, 'bookmark-demos.change-requests');
});

test('the seed keeps two open change requests on Stage for the pier', () => {
  const state = fresh();
  const open = openChangeRequests(state, 'rec_pier');
  assert.deepEqual(open.map(cr => cr.id), ['cr_ledger', 'cr_weather']);
  const overlap = overlaps(state, 'cr_weather').filter(row => row.fieldId === 'stage');
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].changeRequestId, 'cr_ledger');
  assert.equal(overlap[0].submittedBy, 'Ledger');
  assert.equal(overlap[0].conflict, true);
  assert.deepEqual(conflictingFields(state, 'cr_weather'), []);
  assert.equal(canonical(state, 'rec_pier').fields.stage, 'active');
});

test('a proposal does not write the canonical row', () => {
  const state = fresh();
  const before = canonical(state, 'rec_dock');
  const result = propose(state, {
    recordId: 'rec_dock',
    submittedBy: 'Quartermaster',
    message: 'Hand the fit to Ada.',
    changes: {owner: 'p_ada'},
    comment: 'Ada can take the lamps.',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.state.changeRequests[result.changeRequestId].at, '2026-10-02T12:21:00.000Z');
  assert.equal(canonical(result.state, 'rec_dock').fields.owner, 'p_jules');
  assert.equal(canonical(state, 'rec_dock').fields.owner, before.fields.owner);
  assert.equal(state.changeRequests[result.changeRequestId], undefined);
  assert.equal(result.state.audit.at(-1).action, 'propose');
  assert.equal(result.state.changeRequests[result.changeRequestId].comments[0].author, 'Quartermaster');
});

test('approving commits the diff, advances the head, and writes an audit event', () => {
  const state = fresh();
  const commitsBefore = Object.keys(state.commits).length;
  const result = approve(state, {changeRequestId: 'cr_relay', reviewer: 'You'});
  assert.equal(result.ok, true, result.error);
  assert.notEqual(result.state, state);
  assert.equal(result.state.records.rec_relay.headCommitId, result.commitId);
  assert.equal(result.state.commits[result.commitId].parentId, 'commit_relay_2');
  assert.equal(result.state.commits[result.commitId].fields.priority, 1);
  assert.equal(result.state.commits[result.commitId].fields.due, '2026-10-06');
  assert.equal(result.state.commits[result.commitId].fields.stage, 'active');
  assert.equal(result.state.commits[result.commitId].author, 'You');
  assert.equal(result.state.commits[result.commitId].submittedBy, 'Quartermaster');
  assert.equal(result.state.changeRequests.cr_relay.status, 'approved');
  assert.equal(Object.keys(result.state.commits).length, commitsBefore + 1);
  const audit = result.state.audit.at(-1);
  assert.equal(audit.action, 'approve');
  assert.equal(audit.commitId, result.commitId);
  assert.match(audit.summary, /Priority → 1/);
  assert.equal(state.records.rec_relay.headCommitId, 'commit_relay_2');
  const rows = changeRequestRows(state, 'cr_relay');
  assert.deepEqual(rows.map(row => row.fieldId), ['priority', 'due']);
});

test('reject leaves the canonical row and records the reason', () => {
  const state = fresh();
  const result = reject(state, {
    changeRequestId: 'cr_ledger',
    reviewer: 'You',
    reason: 'The overnight log skipped the outer piles.',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.state.records.rec_pier.headCommitId, 'commit_pier_2');
  assert.equal(canonical(result.state, 'rec_pier').fields.stage, 'active');
  assert.equal(result.state.changeRequests.cr_ledger.status, 'rejected');
  assert.equal(result.state.changeRequests.cr_ledger.comments.at(-1).body, 'The overnight log skipped the outer piles.');
  assert.equal(result.state.audit.at(-1).action, 'reject');
  assert.equal(result.state.changeRequests.cr_weather.status, 'open');
});

test('approving one side of a conflict blocks the other until it is revised', () => {
  const state = fresh();
  const first = approve(state, {changeRequestId: 'cr_weather', reviewer: 'You'});
  assert.equal(first.ok, true, first.error);
  assert.equal(canonical(first.state, 'rec_pier').fields.stage, 'blocked');
  assert.deepEqual(conflictingFields(first.state, 'cr_ledger'), ['stage', 'note']);
  const blocked = approve(first.state, {changeRequestId: 'cr_ledger', reviewer: 'You'});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'Conflict on Stage, Note. Update the proposal, then approve.');
  assert.equal(blocked.state, first.state);
  assert.equal(blocked.state.records.rec_pier.headCommitId, first.commitId);

  const revised = revise(first.state, {
    changeRequestId: 'cr_ledger',
    author: 'You',
    changes: {
      stage: 'done',
      note: 'Checked against the gale hold. Closing the survey anyway.',
    },
    comment: 'Revised onto the gale hold.',
  });
  assert.equal(revised.ok, true, revised.error);
  assert.equal(revised.state.records.rec_pier.headCommitId, first.commitId);
  assert.equal(revised.state.changeRequests.cr_ledger.baseCommitId, first.commitId);
  assert.deepEqual(conflictingFields(revised.state, 'cr_ledger'), []);
  const second = approve(revised.state, {changeRequestId: 'cr_ledger', reviewer: 'You'});
  assert.equal(second.ok, true, second.error);
  assert.equal(canonical(second.state, 'rec_pier').fields.stage, 'done');
  assert.equal(canonical(second.state, 'rec_pier').fields.note, 'Checked against the gale hold. Closing the survey anyway.');
  assert.equal(second.state.commits[second.commitId].parentId, first.commitId);
});

test('history can show the dock record at an earlier commit', () => {
  const state = fresh();
  const commits = history(state, 'rec_dock');
  assert.deepEqual(commits.map(commit => commit.id), ['commit_dock_3', 'commit_dock_2', 'commit_dock_1']);
  const early = recordAt(state, 'rec_dock', 'commit_dock_1');
  assert.equal(early.head, false);
  assert.equal(early.fields.stage, 'planned');
  assert.equal(early.fields.note, 'Spec the dock lights.');
  assert.equal(early.fields.priority, 4);
  const head = recordAt(state, 'rec_dock', 'commit_dock_3');
  assert.equal(head.head, true);
  assert.equal(head.fields.note, 'Lamps on site. Fit after the survey.');
  assert.deepEqual(diffFields(early.fields, state.commits.commit_dock_2.fields).map(row => row.fieldId), ['stage', 'priority', 'note']);
  assert.equal(recordAt(state, 'rec_pier', 'commit_dock_1'), null);
});

test('comments append to the thread without committing', () => {
  const state = fresh();
  const result = comment(state, {
    changeRequestId: 'cr_weather',
    author: 'You',
    body: 'Leave it blocked until the flag comes down.',
  });
  assert.equal(result.ok, true, result.error);
  const thread = result.state.changeRequests.cr_weather.comments;
  assert.equal(thread.at(-1).author, 'You');
  assert.equal(thread.at(-1).body, 'Leave it blocked until the flag comes down.');
  assert.equal(result.state.records.rec_pier.headCommitId, 'commit_pier_2');
  assert.equal(result.state.audit.at(-1).action, 'comment');
});

test('bad field values are refused and the workspace is unchanged', () => {
  const state = fresh();
  const cases = [
    [{stage: 'shipped'}, /Stage must be one of the listed options/],
    [{owner: 'p_nobody'}, /Owner must be a person/],
    [{priority: 1.5}, /Priority must be a whole number/],
    [{due: '2026-02-31'}, /Due must be a date/],
    [{title: '   '}, /Title is required/],
    [{unknown: 'x'}, /Unknown field/],
  ];
  for (const [changes, pattern] of cases) {
    const result = propose(state, {
      recordId: 'rec_relay',
      submittedBy: 'Ledger',
      message: 'Try a bad write.',
      changes,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
    assert.equal(result.state, state);
  }
  const closed = approve(state, {changeRequestId: 'cr_missing', reviewer: 'You'});
  assert.equal(closed.ok, false);
  assert.equal(closed.error, 'That change request is not in this base.');
});

test('the agent script is deterministic and a later step conflicts on Stage', () => {
  let state = fresh();
  assert.equal(AGENT_SCRIPT.length, 3);
  for (let i = 0; i < AGENT_SCRIPT.length; i += 1) {
    const result = applyNextScript(state);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.changeRequestId, AGENT_SCRIPT[i].id);
    state = result.state;
  }
  assert.equal(applyNextScript(state).ok, false);
  assert.equal(canonical(state, 'rec_dock').fields.owner, 'p_jules');
  assert.equal(canonical(state, 'rec_relay').fields.stage, 'active');
  const overlap = overlaps(state, 'cr_relay_block').filter(row => row.fieldId === 'stage');
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].changeRequestId, 'cr_relay_done');
  assert.equal(overlap[0].conflict, true);
  const approved = approve(state, {changeRequestId: 'cr_dock_owner', reviewer: 'You'});
  assert.equal(approved.ok, true, approved.error);
  assert.equal(canonical(approved.state, 'rec_dock').fields.owner, 'p_ada');
  assert.equal(displayOwner(approved.state), 'Ada Okonkwo');
});

function displayOwner(state) {
  return require('./engine.js').displayValue('owner', canonical(state, 'rec_dock').fields.owner);
}

test('stored state has to be version 1 with a head commit for every record', () => {
  const state = fresh();
  assert.equal(parseState(JSON.parse(JSON.stringify(state))).seq, 20);
  assert.equal(parseState(null), null);
  assert.equal(parseState({version: 2}), null);
  const broken = JSON.parse(JSON.stringify(state));
  broken.records.rec_dock.headCommitId = 'commit_missing';
  assert.equal(parseState(broken), null);
  const approved = approve(parseState(JSON.parse(JSON.stringify(state))), {changeRequestId: 'cr_relay', reviewer: 'You'});
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.state.records.rec_relay.headCommitId, approved.commitId);
});
