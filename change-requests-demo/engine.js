// Change requests in the vocabulary of busabase/busabase (MIT).
// Canonical field values live on a record's head commit.
// A proposal is a change request: a field diff, an author, a message, and comments.
// Approving adds a commit and an audit event. Rejecting leaves the head where it is.
// Two open requests that write different values into the same field are in conflict.
// Approving one blocks the other until that proposal is revised onto the new head.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChangeRequestEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'bookmark-demos.change-requests';

  const BASE = {id: 'base_operations', name: 'Operations'};

  const PEOPLE = [
    {id: 'p_ada', name: 'Ada Okonkwo'},
    {id: 'p_jules', name: 'Jules Marin'},
    {id: 'p_samir', name: 'Samir Shah'},
  ];

  const FIELDS = [
    {id: 'title', name: 'Title', type: 'text'},
    {id: 'stage', name: 'Stage', type: 'select', options: ['planned', 'active', 'blocked', 'done']},
    {id: 'priority', name: 'Priority', type: 'number'},
    {id: 'due', name: 'Due', type: 'date'},
    {id: 'owner', name: 'Owner', type: 'relation', relation: 'people'},
    {id: 'note', name: 'Note', type: 'text'},
  ];

  const RECORD_ORDER = ['rec_pier', 'rec_relay', 'rec_dock'];

  const AGENT_SCRIPT = [
    {
      id: 'cr_dock_owner',
      recordId: 'rec_dock',
      submittedBy: 'Quartermaster',
      message: 'Hand the dock fit to Ada. Jules is still on the pier.',
      changes: {
        owner: 'p_ada',
        note: 'Ada takes the fit. Jules stays on the pier survey.',
      },
      comment: 'Ada is free once the cabinet is decided, and the lamps are already on site.',
    },
    {
      id: 'cr_relay_block',
      recordId: 'rec_relay',
      submittedBy: 'Ledger',
      message: 'Hold the cabinet. The breaker is not in stores.',
      changes: {
        stage: 'blocked',
        note: 'Parts short. Waiting on the breaker.',
      },
      comment: 'Stores counted the breaker out this morning.',
    },
    {
      id: 'cr_relay_done',
      recordId: 'rec_relay',
      submittedBy: 'Quartermaster',
      message: 'Close the cabinet from the yard report.',
      changes: {
        stage: 'done',
        note: 'Yard report says the breaker is in and the cabinet is live.',
      },
      comment: 'This disagrees with Ledger if both requests stay open.',
    },
  ];

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function fail(state, error) {
    return {ok: false, error, state};
  }

  function fieldById(id) {
    return FIELDS.find(field => field.id === id) || null;
  }

  function personName(id) {
    const person = PEOPLE.find(person => person.id === id);
    return person ? person.name : String(id);
  }

  function displayValue(fieldId, value) {
    const field = fieldById(fieldId);
    if (!field) return value == null ? '' : String(value);
    if (field.type === 'relation') return personName(value);
    if (value == null) return '';
    return String(value);
  }

  function requireText(value, label, max) {
    if (typeof value !== 'string') return {ok: false, error: `${label} is required.`};
    const text = value.trim();
    if (!text) return {ok: false, error: `${label} is required.`};
    if (text.length > max) return {ok: false, error: `${label} is too long.`};
    return {ok: true, value: text};
  }

  function parseValue(field, value) {
    if (field.type === 'text') return requireText(value, field.name, 280);
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9) {
        return {ok: false, error: `${field.name} must be a whole number from 1 to 9.`};
      }
      return {ok: true, value};
    }
    if (field.type === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return {ok: false, error: `${field.name} must be a date.`};
      }
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return {ok: false, error: `${field.name} must be a date.`};
      }
      return {ok: true, value};
    }
    if (field.type === 'select') {
      if (!field.options.includes(value)) {
        return {ok: false, error: `${field.name} must be one of the listed options.`};
      }
      return {ok: true, value};
    }
    if (field.type === 'relation') {
      if (!PEOPLE.some(person => person.id === value)) {
        return {ok: false, error: `${field.name} must be a person in this base.`};
      }
      return {ok: true, value};
    }
    return {ok: false, error: 'Unknown field.'};
  }

  function parseChanges(changes, baseFields) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return {ok: false, error: 'Changes have to be field values.'};
    }
    const out = {};
    for (const key of Object.keys(changes)) {
      const field = fieldById(key);
      if (!field) return {ok: false, error: 'Unknown field.'};
      const parsed = parseValue(field, changes[key]);
      if (!parsed.ok) return parsed;
      if (parsed.value !== baseFields[key]) out[key] = parsed.value;
    }
    return {ok: true, changes: out};
  }

  function stamp(state) {
    state.seq += 1;
    const at = new Date(Date.UTC(2026, 9, 2, 12, 0, 0) + state.seq * 60000).toISOString();
    return {n: state.seq, at};
  }

  function recordTitle(state, recordId) {
    const record = state.records[recordId];
    if (!record) return 'record';
    const commit = state.commits[record.headCommitId];
    return commit && commit.fields ? commit.fields.title : 'record';
  }

  function summarize(changes) {
    return FIELDS.filter(field => Object.prototype.hasOwnProperty.call(changes, field.id))
      .map(field => `${field.name} → ${displayValue(field.id, changes[field.id])}`)
      .join(', ');
  }

  function pushAudit(state, event) {
    state.audit.push(event);
  }

  function canonical(state, recordId) {
    const record = state.records[recordId];
    if (!record) return null;
    const commit = state.commits[record.headCommitId];
    if (!commit) return null;
    return {
      id: record.id,
      headCommitId: record.headCommitId,
      fields: Object.assign({}, commit.fields),
    };
  }

  function listRecords(state) {
    return RECORD_ORDER.filter(id => state.records[id]).map(id => {
      const row = canonical(state, id);
      return {
        id,
        headCommitId: row.headCommitId,
        fields: row.fields,
        title: row.fields.title,
        open: openChangeRequests(state, id).length,
      };
    });
  }

  function history(state, recordId) {
    const record = state.records[recordId];
    if (!record) return [];
    const commits = [];
    const seen = new Set();
    let id = record.headCommitId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const commit = state.commits[id];
      if (!commit) break;
      commits.push(commit);
      id = commit.parentId;
    }
    return commits;
  }

  function recordAt(state, recordId, commitId) {
    const commit = state.commits[commitId];
    if (!commit || commit.recordId !== recordId) return null;
    const record = state.records[recordId];
    return {
      commitId: commit.id,
      recordId,
      at: commit.at,
      author: commit.author,
      message: commit.message,
      fields: Object.assign({}, commit.fields),
      head: Boolean(record && record.headCommitId === commit.id),
    };
  }

  function diffFields(before, after) {
    const rows = [];
    for (const field of FIELDS) {
      if (!before || !after) continue;
      if (before[field.id] !== after[field.id]) {
        rows.push({
          fieldId: field.id,
          name: field.name,
          type: field.type,
          before: before[field.id],
          after: after[field.id],
          beforeLabel: displayValue(field.id, before[field.id]),
          afterLabel: displayValue(field.id, after[field.id]),
        });
      }
    }
    return rows;
  }

  function openChangeRequests(state, recordId) {
    return Object.values(state.changeRequests)
      .filter(cr => cr.status === 'open' && (!recordId || cr.recordId === recordId))
      .sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1);
  }

  function conflictingFields(state, changeRequestId) {
    const cr = state.changeRequests[changeRequestId];
    if (!cr || cr.status !== 'open') return [];
    const record = state.records[cr.recordId];
    const head = state.commits[record.headCommitId];
    const base = state.commits[cr.baseCommitId];
    if (!head || !base) return [];
    const out = [];
    for (const field of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(cr.changes, field.id)) continue;
      const moved = head.fields[field.id] !== base.fields[field.id];
      const differs = cr.changes[field.id] !== head.fields[field.id];
      if (moved && differs) out.push(field.id);
    }
    return out;
  }

  function overlaps(state, changeRequestId) {
    const cr = state.changeRequests[changeRequestId];
    if (!cr || cr.status !== 'open') return [];
    const rows = [];
    for (const other of Object.values(state.changeRequests)) {
      if (other.id === cr.id || other.status !== 'open' || other.recordId !== cr.recordId) continue;
      for (const field of FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(cr.changes, field.id)) continue;
        if (!Object.prototype.hasOwnProperty.call(other.changes, field.id)) continue;
        rows.push({
          fieldId: field.id,
          changeRequestId: other.id,
          submittedBy: other.submittedBy,
          value: other.changes[field.id],
          conflict: other.changes[field.id] !== cr.changes[field.id],
        });
      }
    }
    return rows;
  }

  function changeRequestRows(state, changeRequestId) {
    const cr = state.changeRequests[changeRequestId];
    if (!cr) return [];
    const base = state.commits[cr.baseCommitId];
    const head = canonical(state, cr.recordId);
    if (!base || !head) return [];
    const conflicts = new Set(conflictingFields(state, changeRequestId));
    return FIELDS.filter(field => Object.prototype.hasOwnProperty.call(cr.changes, field.id)).map(field => ({
      fieldId: field.id,
      name: field.name,
      type: field.type,
      options: field.options || null,
      base: base.fields[field.id],
      canonical: head.fields[field.id],
      proposed: cr.changes[field.id],
      baseLabel: displayValue(field.id, base.fields[field.id]),
      canonicalLabel: displayValue(field.id, head.fields[field.id]),
      proposedLabel: displayValue(field.id, cr.changes[field.id]),
      conflict: conflicts.has(field.id),
    }));
  }

  function propose(state, input) {
    if (!input || !state.records[input.recordId]) return fail(state, 'That record is not in this base.');
    const author = requireText(input.submittedBy, 'An author', 80);
    if (!author.ok) return fail(state, author.error);
    const message = requireText(input.message, 'A change request message', 200);
    if (!message.ok) return fail(state, message.error);
    const head = state.commits[state.records[input.recordId].headCommitId];
    const parsed = parseChanges(input.changes, head.fields);
    if (!parsed.ok) return fail(state, parsed.error);
    if (Object.keys(parsed.changes).length === 0) return fail(state, 'Nothing to propose.');
    if (input.id != null && (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(input.id))) {
      return fail(state, 'That change request id is not valid.');
    }
    if (input.id && state.changeRequests[input.id]) return fail(state, 'That change request already exists.');
    let commentBody = null;
    if (input.comment != null && input.comment !== '') {
      const comment = requireText(input.comment, 'A comment', 500);
      if (!comment.ok) return fail(state, comment.error);
      commentBody = comment.value;
    }

    const next = clone(state);
    const {n, at} = stamp(next);
    const id = input.id || `cr_${n}`;
    if (next.changeRequests[id]) return fail(state, 'That change request already exists.');
    const comments = [];
    if (commentBody) comments.push({id: `comment_${n}`, author: author.value, body: commentBody, at});
    next.changeRequests[id] = {
      id,
      recordId: input.recordId,
      baseCommitId: state.records[input.recordId].headCommitId,
      changes: parsed.changes,
      status: 'open',
      submittedBy: author.value,
      message: message.value,
      comments,
      at,
      resolvedAt: null,
      resolvedBy: null,
    };
    pushAudit(next, {
      id: `audit_${n}`,
      at,
      actor: author.value,
      action: 'propose',
      recordId: input.recordId,
      changeRequestId: id,
      commitId: null,
      summary: `Proposed a change to ${recordTitle(next, input.recordId)}. ${summarize(parsed.changes)}`,
    });
    return {ok: true, state: next, changeRequestId: id};
  }

  function comment(state, input) {
    if (!input || !state.changeRequests[input.changeRequestId]) {
      return fail(state, 'That change request is not in this base.');
    }
    const author = requireText(input.author, 'An author', 80);
    if (!author.ok) return fail(state, author.error);
    const body = requireText(input.body, 'A comment', 500);
    if (!body.ok) return fail(state, body.error);
    const next = clone(state);
    const {n, at} = stamp(next);
    const cr = next.changeRequests[input.changeRequestId];
    const commentId = `comment_${n}`;
    cr.comments.push({id: commentId, author: author.value, body: body.value, at});
    pushAudit(next, {
      id: `audit_${n}`,
      at,
      actor: author.value,
      action: 'comment',
      recordId: cr.recordId,
      changeRequestId: cr.id,
      commitId: null,
      summary: `Commented on the change to ${recordTitle(next, cr.recordId)}.`,
    });
    return {ok: true, state: next, commentId};
  }

  function revise(state, input) {
    if (!input || !state.changeRequests[input.changeRequestId]) {
      return fail(state, 'That change request is not in this base.');
    }
    const current = state.changeRequests[input.changeRequestId];
    if (current.status !== 'open') return fail(state, 'That change request is not open.');
    const author = requireText(input.author, 'An author', 80);
    if (!author.ok) return fail(state, author.error);
    const record = state.records[current.recordId];
    const head = state.commits[record.headCommitId];
    const parsed = parseChanges(input.changes, head.fields);
    if (!parsed.ok) return fail(state, parsed.error);
    if (Object.keys(parsed.changes).length === 0) return fail(state, 'Nothing to propose.');
    const next = clone(state);
    const {n, at} = stamp(next);
    const cr = next.changeRequests[current.id];
    cr.baseCommitId = record.headCommitId;
    cr.changes = parsed.changes;
    if (input.comment != null && input.comment !== '') {
      const note = requireText(input.comment, 'A comment', 500);
      if (!note.ok) return fail(state, note.error);
      cr.comments.push({id: `comment_${n}`, author: author.value, body: note.value, at});
    }
    pushAudit(next, {
      id: `audit_${n}`,
      at,
      actor: author.value,
      action: 'revise',
      recordId: cr.recordId,
      changeRequestId: cr.id,
      commitId: null,
      summary: `Revised the proposal for ${recordTitle(next, cr.recordId)}. ${summarize(parsed.changes)}`,
    });
    return {ok: true, state: next, changeRequestId: cr.id};
  }

  function approve(state, input) {
    if (!input || !state.changeRequests[input.changeRequestId]) {
      return fail(state, 'That change request is not in this base.');
    }
    const current = state.changeRequests[input.changeRequestId];
    if (current.status !== 'open') return fail(state, 'That change request is not open.');
    const reviewer = requireText(input.reviewer, 'A reviewer name', 80);
    if (!reviewer.ok) return fail(state, reviewer.error);
    const conflicts = conflictingFields(state, current.id);
    if (conflicts.length) {
      const names = conflicts.map(id => fieldById(id).name).join(', ');
      return fail(state, `Conflict on ${names}. Update the proposal, then approve.`);
    }
    const record = state.records[current.recordId];
    const head = state.commits[record.headCommitId];
    const fields = Object.assign({}, head.fields);
    const effective = {};
    for (const key of Object.keys(current.changes)) {
      if (fields[key] !== current.changes[key]) {
        fields[key] = current.changes[key];
        effective[key] = current.changes[key];
      }
    }
    if (Object.keys(effective).length === 0) return fail(state, 'Canonical already has these values.');

    const next = clone(state);
    const {n, at} = stamp(next);
    const commitId = `commit_${n}`;
    next.commits[commitId] = {
      id: commitId,
      recordId: current.recordId,
      parentId: head.id,
      fields,
      message: current.message,
      author: reviewer.value,
      submittedBy: current.submittedBy,
      changeRequestId: current.id,
      at,
    };
    next.records[current.recordId].headCommitId = commitId;
    const cr = next.changeRequests[current.id];
    cr.status = 'approved';
    cr.resolvedAt = at;
    cr.resolvedBy = reviewer.value;
    pushAudit(next, {
      id: `audit_${n}`,
      at,
      actor: reviewer.value,
      action: 'approve',
      recordId: current.recordId,
      changeRequestId: current.id,
      commitId,
      summary: `Approved the change to ${fields.title}. ${summarize(effective)}`,
    });
    return {ok: true, state: next, commitId, changeRequestId: current.id};
  }

  function reject(state, input) {
    if (!input || !state.changeRequests[input.changeRequestId]) {
      return fail(state, 'That change request is not in this base.');
    }
    const current = state.changeRequests[input.changeRequestId];
    if (current.status !== 'open') return fail(state, 'That change request is not open.');
    const reviewer = requireText(input.reviewer, 'A reviewer name', 80);
    if (!reviewer.ok) return fail(state, reviewer.error);
    let reason = null;
    if (input.reason != null && String(input.reason).trim() !== '') {
      const parsed = requireText(input.reason, 'A reason', 500);
      if (!parsed.ok) return fail(state, parsed.error);
      reason = parsed.value;
    }
    const next = clone(state);
    const {n, at} = stamp(next);
    const cr = next.changeRequests[current.id];
    cr.status = 'rejected';
    cr.resolvedAt = at;
    cr.resolvedBy = reviewer.value;
    if (reason) cr.comments.push({id: `comment_${n}`, author: reviewer.value, body: reason, at});
    const title = recordTitle(next, cr.recordId);
    pushAudit(next, {
      id: `audit_${n}`,
      at,
      actor: reviewer.value,
      action: 'reject',
      recordId: cr.recordId,
      changeRequestId: cr.id,
      commitId: null,
      summary: reason ? `Rejected the change to ${title}. ${reason}` : `Rejected the change to ${title}.`,
    });
    return {ok: true, state: next, changeRequestId: cr.id};
  }

  function nextScriptIndex(state) {
    return AGENT_SCRIPT.findIndex(step => !state.changeRequests[step.id]);
  }

  function applyNextScript(state) {
    const index = nextScriptIndex(state);
    if (index < 0) return fail(state, 'The script has no further proposals.');
    return propose(state, AGENT_SCRIPT[index]);
  }

  function makeCommit(partial) {
    return {
      id: partial.id,
      recordId: partial.recordId,
      parentId: partial.parentId,
      fields: partial.fields,
      message: partial.message,
      author: partial.author,
      submittedBy: partial.submittedBy,
      changeRequestId: partial.changeRequestId,
      at: partial.at,
    };
  }

  function makeFields(partial) {
    return {
      title: partial.title,
      stage: partial.stage,
      priority: partial.priority,
      due: partial.due,
      owner: partial.owner,
      note: partial.note,
    };
  }

  function createInitialState() {
    const pier1 = makeFields({
      title: 'North pier survey',
      stage: 'planned',
      priority: 3,
      due: '2026-10-20',
      owner: 'p_ada',
      note: 'Chart the north pier before the spring tide.',
    });
    const pier2 = makeFields(Object.assign({}, pier1, {
      stage: 'active',
      priority: 2,
      note: 'Tide window confirmed.',
    }));
    const relay1 = makeFields({
      title: 'Relay cabinet',
      stage: 'planned',
      priority: 2,
      due: '2026-10-08',
      owner: 'p_samir',
      note: 'Replace the corroded breaker.',
    });
    const relay2 = makeFields(Object.assign({}, relay1, {stage: 'active'}));
    const dock1 = makeFields({
      title: 'Dock lighting',
      stage: 'planned',
      priority: 4,
      due: '2026-11-02',
      owner: 'p_jules',
      note: 'Spec the dock lights.',
    });
    const dock2 = makeFields(Object.assign({}, dock1, {
      stage: 'active',
      priority: 3,
      note: 'Lamps ordered.',
    }));
    const dock3 = makeFields(Object.assign({}, dock2, {
      due: '2026-10-28',
      note: 'Lamps on site. Fit after the survey.',
    }));

    const commits = {
      commit_pier_1: makeCommit({
        id: 'commit_pier_1', recordId: 'rec_pier', parentId: null, fields: pier1,
        message: 'Opened the survey.', author: 'Jules Marin', submittedBy: null, changeRequestId: null,
        at: '2026-09-28T15:04:00.000Z',
      }),
      commit_pier_2: makeCommit({
        id: 'commit_pier_2', recordId: 'rec_pier', parentId: 'commit_pier_1', fields: pier2,
        message: 'Opened the working window.', author: 'Jules Marin', submittedBy: null, changeRequestId: null,
        at: '2026-09-30T11:20:00.000Z',
      }),
      commit_relay_1: makeCommit({
        id: 'commit_relay_1', recordId: 'rec_relay', parentId: null, fields: relay1,
        message: 'Logged the corroded breaker.', author: 'Samir Shah', submittedBy: null, changeRequestId: null,
        at: '2026-09-29T09:12:00.000Z',
      }),
      commit_relay_2: makeCommit({
        id: 'commit_relay_2', recordId: 'rec_relay', parentId: 'commit_relay_1', fields: relay2,
        message: 'Started the cabinet job.', author: 'Samir Shah', submittedBy: null, changeRequestId: null,
        at: '2026-10-01T08:40:00.000Z',
      }),
      commit_dock_1: makeCommit({
        id: 'commit_dock_1', recordId: 'rec_dock', parentId: null, fields: dock1,
        message: 'Opened the dock lighting job.', author: 'Ada Okonkwo', submittedBy: null, changeRequestId: null,
        at: '2026-09-20T16:05:00.000Z',
      }),
      commit_dock_2: makeCommit({
        id: 'commit_dock_2', recordId: 'rec_dock', parentId: 'commit_dock_1', fields: dock2,
        message: 'Ordered the lamps.', author: 'Jules Marin', submittedBy: null, changeRequestId: null,
        at: '2026-09-26T13:18:00.000Z',
      }),
      commit_dock_3: makeCommit({
        id: 'commit_dock_3', recordId: 'rec_dock', parentId: 'commit_dock_2', fields: dock3,
        message: 'Moved the fit up. The lamps are on site.', author: 'Jules Marin', submittedBy: null, changeRequestId: null,
        at: '2026-10-01T18:02:00.000Z',
      }),
    };

    const changeRequests = {
      cr_weather: {
        id: 'cr_weather',
        recordId: 'rec_pier',
        baseCommitId: 'commit_pier_2',
        changes: {stage: 'blocked', note: 'Hold for the gale warning.'},
        status: 'open',
        submittedBy: 'Quartermaster',
        message: 'Hold the pier survey for the gale warning.',
        comments: [{
          id: 'comment_weather_1',
          author: 'Quartermaster',
          body: 'The gale flag is up through Thursday.',
          at: '2026-10-01T22:14:30.000Z',
        }],
        at: '2026-10-01T22:14:00.000Z',
        resolvedAt: null,
        resolvedBy: null,
      },
      cr_ledger: {
        id: 'cr_ledger',
        recordId: 'rec_pier',
        baseCommitId: 'commit_pier_2',
        changes: {stage: 'done', note: 'Overnight log marks the survey complete.'},
        status: 'open',
        submittedBy: 'Ledger',
        message: 'Close the pier survey from the overnight log.',
        comments: [{
          id: 'comment_ledger_1',
          author: 'Ledger',
          body: 'The log says the last station was recorded at 02:10.',
          at: '2026-10-01T22:16:30.000Z',
        }],
        at: '2026-10-01T22:16:00.000Z',
        resolvedAt: null,
        resolvedBy: null,
      },
      cr_relay: {
        id: 'cr_relay',
        recordId: 'rec_relay',
        baseCommitId: 'commit_relay_2',
        changes: {priority: 1, due: '2026-10-06'},
        status: 'open',
        submittedBy: 'Quartermaster',
        message: 'Pull the cabinet forward. The breaker is arcing.',
        comments: [{
          id: 'comment_relay_1',
          author: 'Quartermaster',
          body: 'The arc is visible with the door open.',
          at: '2026-10-01T22:20:00.000Z',
        }],
        at: '2026-10-01T22:20:00.000Z',
        resolvedAt: null,
        resolvedBy: null,
      },
    };

    const audit = [
      {id: 'audit_pier_1', at: '2026-09-28T15:04:00.000Z', actor: 'Jules Marin', action: 'commit', recordId: 'rec_pier', changeRequestId: null, commitId: 'commit_pier_1', summary: 'Committed North pier survey. Opened the survey.'},
      {id: 'audit_pier_2', at: '2026-09-30T11:20:00.000Z', actor: 'Jules Marin', action: 'commit', recordId: 'rec_pier', changeRequestId: null, commitId: 'commit_pier_2', summary: 'Committed North pier survey. Opened the working window.'},
      {id: 'audit_relay_1', at: '2026-09-29T09:12:00.000Z', actor: 'Samir Shah', action: 'commit', recordId: 'rec_relay', changeRequestId: null, commitId: 'commit_relay_1', summary: 'Committed Relay cabinet. Logged the corroded breaker.'},
      {id: 'audit_relay_2', at: '2026-10-01T08:40:00.000Z', actor: 'Samir Shah', action: 'commit', recordId: 'rec_relay', changeRequestId: null, commitId: 'commit_relay_2', summary: 'Committed Relay cabinet. Started the cabinet job.'},
      {id: 'audit_dock_1', at: '2026-09-20T16:05:00.000Z', actor: 'Ada Okonkwo', action: 'commit', recordId: 'rec_dock', changeRequestId: null, commitId: 'commit_dock_1', summary: 'Committed Dock lighting. Opened the dock lighting job.'},
      {id: 'audit_dock_2', at: '2026-09-26T13:18:00.000Z', actor: 'Jules Marin', action: 'commit', recordId: 'rec_dock', changeRequestId: null, commitId: 'commit_dock_2', summary: 'Committed Dock lighting. Ordered the lamps.'},
      {id: 'audit_dock_3', at: '2026-10-01T18:02:00.000Z', actor: 'Jules Marin', action: 'commit', recordId: 'rec_dock', changeRequestId: null, commitId: 'commit_dock_3', summary: 'Committed Dock lighting. Moved the fit up. The lamps are on site.'},
      {id: 'audit_weather', at: '2026-10-01T22:14:00.000Z', actor: 'Quartermaster', action: 'propose', recordId: 'rec_pier', changeRequestId: 'cr_weather', commitId: null, summary: 'Proposed a change to North pier survey. Stage → blocked, Note → Hold for the gale warning.'},
      {id: 'audit_ledger', at: '2026-10-01T22:16:00.000Z', actor: 'Ledger', action: 'propose', recordId: 'rec_pier', changeRequestId: 'cr_ledger', commitId: null, summary: 'Proposed a change to North pier survey. Stage → done, Note → Overnight log marks the survey complete.'},
      {id: 'audit_relay_cr', at: '2026-10-01T22:20:00.000Z', actor: 'Quartermaster', action: 'propose', recordId: 'rec_relay', changeRequestId: 'cr_relay', commitId: null, summary: 'Proposed a change to Relay cabinet. Priority → 1, Due → 2026-10-06'},
    ];

    return {
      version: 1,
      seq: 20,
      baseId: BASE.id,
      records: {
        rec_pier: {id: 'rec_pier', baseId: BASE.id, headCommitId: 'commit_pier_2', createdAt: '2026-09-28T15:04:00.000Z'},
        rec_relay: {id: 'rec_relay', baseId: BASE.id, headCommitId: 'commit_relay_2', createdAt: '2026-09-29T09:12:00.000Z'},
        rec_dock: {id: 'rec_dock', baseId: BASE.id, headCommitId: 'commit_dock_3', createdAt: '2026-09-20T16:05:00.000Z'},
      },
      commits,
      changeRequests,
      audit,
    };
  }

  function parseState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== 1 || typeof value.seq !== 'number') return null;
    if (!value.records || !value.commits || !value.changeRequests || !Array.isArray(value.audit)) return null;
    for (const record of Object.values(value.records)) {
      if (!record || typeof record.id !== 'string' || typeof record.headCommitId !== 'string') return null;
      const commit = value.commits[record.headCommitId];
      if (!commit || commit.recordId !== record.id || !commit.fields) return null;
      for (const field of FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(commit.fields, field.id)) return null;
      }
    }
    return value;
  }

  return {
    STORAGE_KEY,
    BASE,
    PEOPLE,
    FIELDS,
    RECORD_ORDER,
    AGENT_SCRIPT,
    createInitialState,
    parseState,
    displayValue,
    canonical,
    listRecords,
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
    nextScriptIndex,
    applyNextScript,
  };
});
