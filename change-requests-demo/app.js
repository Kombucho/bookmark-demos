(function () {
  const engine = window.ChangeRequestEngine;
  const recordsEl = document.querySelector('#records');
  const fieldsEl = document.querySelector('#fields');
  const commitsEl = document.querySelector('#commits');
  const inboxEl = document.querySelector('#inbox');
  const requestEl = document.querySelector('#request');
  const auditEl = document.querySelector('#audit');
  const errorEl = document.querySelector('#error');
  const storageEl = document.querySelector('#storage');
  const agentButton = document.querySelector('#agent');
  const agentLine = document.querySelector('#agent-line');
  const bannerEl = document.querySelector('#history-banner');
  const headingEl = document.querySelector('#record-heading');
  const schemaEl = document.querySelector('#schema');
  const baseHeading = document.querySelector('#base-heading');

  let state = load();
  let ui = pickSelection(state);

  schemaEl.textContent = engine.FIELDS.map(field => `${field.name} ${field.type}`).join(' · ');
  baseHeading.textContent = engine.BASE.name;

  document.querySelector('#agent').addEventListener('click', () => {
    take(engine.applyNextScript(state));
  });

  document.querySelector('#reset').addEventListener('click', () => {
    try { localStorage.removeItem(engine.STORAGE_KEY); } catch (err) { /* keep going */ }
    state = engine.createInitialState();
    ui = pickSelection(state);
    errorEl.textContent = '';
    storageEl.textContent = '';
    render();
  });

  render();

  function load() {
    try {
      const raw = localStorage.getItem(engine.STORAGE_KEY);
      if (!raw) return engine.createInitialState();
      return engine.parseState(JSON.parse(raw)) || engine.createInitialState();
    } catch (err) {
      return engine.createInitialState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(engine.STORAGE_KEY, JSON.stringify(state));
      storageEl.textContent = '';
    } catch (err) {
      storageEl.textContent = 'This browser did not store the workspace.';
    }
  }

  function pickSelection(current) {
    const open = engine.openChangeRequests(current);
    const conflicted = open.find(cr =>
      engine.conflictingFields(current, cr.id).length ||
      engine.overlaps(current, cr.id).some(row => row.conflict));
    if (conflicted) return {recordId: conflicted.recordId, crId: conflicted.id, commitId: null};
    const records = engine.listRecords(current);
    const recordId = records[0] ? records[0].id : null;
    const first = recordId ? engine.openChangeRequests(current, recordId)[0] : null;
    return {recordId, crId: first ? first.id : null, commitId: null};
  }

  function take(result) {
    if (!result.ok) {
      errorEl.textContent = result.error;
      return false;
    }
    state = result.state;
    persist();
    errorEl.textContent = '';
    if (ui.crId && !state.changeRequests[ui.crId]) ui.crId = null;
    if (ui.recordId && !state.records[ui.recordId]) ui = pickSelection(state);
    render();
    return true;
  }

  function reviewerName() {
    return document.querySelector('#reviewer').value;
  }

  function formatTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    renderAgent();
    renderRecords();
    renderRecord();
    renderInbox();
    renderRequest();
    renderAudit();
  }

  function renderAgent() {
    const index = engine.nextScriptIndex(state);
    if (index < 0) {
      agentButton.disabled = true;
      agentLine.textContent = 'The script has no further proposals.';
      return;
    }
    const step = engine.AGENT_SCRIPT[index];
    const row = engine.canonical(state, step.recordId);
    agentButton.disabled = false;
    agentLine.textContent = `${step.submittedBy} would change ${row.fields.title}. ${step.message}`;
  }

  function renderRecords() {
    recordsEl.replaceChildren();
    for (const row of engine.listRecords(state)) {
      const tr = document.createElement('tr');
      if (row.id === ui.recordId) tr.className = 'selected';
      const titleCell = document.createElement('th');
      titleCell.scope = 'row';
      const button = el('button', 'title-button', row.title);
      button.type = 'button';
      if (row.id === ui.recordId) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => {
        const open = engine.openChangeRequests(state, row.id)[0];
        ui = {recordId: row.id, crId: open ? open.id : null, commitId: null};
        errorEl.textContent = '';
        render();
      });
      titleCell.append(button);
      tr.append(titleCell);
      tr.append(el('td', '', row.fields.stage));
      tr.append(el('td', '', String(row.fields.priority)));
      tr.append(el('td', '', row.fields.due));
      tr.append(el('td', '', engine.displayValue('owner', row.fields.owner)));
      tr.append(el('td', '', String(row.open)));
      recordsEl.append(tr);
    }
  }

  function renderRecord() {
    const row = engine.canonical(state, ui.recordId);
    if (!row) {
      headingEl.textContent = 'Record';
      fieldsEl.replaceChildren();
      commitsEl.replaceChildren();
      bannerEl.textContent = '';
      return;
    }
    const commits = engine.history(state, ui.recordId);
    const selected = ui.commitId && commits.some(commit => commit.id === ui.commitId)
      ? ui.commitId
      : row.headCommitId;
    const snapshot = engine.recordAt(state, ui.recordId, selected);
    headingEl.textContent = snapshot.fields.title;
    if (snapshot.head) {
      bannerEl.textContent = 'Canonical row. Older commits stay in the list below.';
    } else {
      bannerEl.textContent = `Showing this record at “${snapshot.message}”. The table still shows the canonical head.`;
    }

    const previous = commits.find(commit => commit.id === snapshot.commitId);
    const parent = previous && previous.parentId ? state.commits[previous.parentId] : null;
    const changed = new Set(parent ? engine.diffFields(parent.fields, snapshot.fields).map(item => item.fieldId) : []);
    fieldsEl.replaceChildren();
    for (const field of engine.FIELDS) {
      const term = el('dt', '', field.name);
      term.append(el('span', 'type', field.type));
      const value = el('dd', changed.has(field.id) ? 'changed' : '', engine.displayValue(field.id, snapshot.fields[field.id]));
      if (changed.has(field.id)) value.append(document.createTextNode(' · changed in this commit'));
      fieldsEl.append(term, value);
    }

    commitsEl.replaceChildren();
    for (const commit of commits) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'commit-button';
      button.setAttribute('aria-pressed', commit.id === selected ? 'true' : 'false');
      button.append(document.createTextNode(commit.head || commit.id === row.headCommitId ? 'Head' : 'Earlier'));
      button.append(el('span', '', `${formatTime(commit.at)} · ${commit.author}`));
      button.append(el('span', '', commit.message));
      button.addEventListener('click', () => {
        ui.commitId = commit.id === row.headCommitId ? null : commit.id;
        render();
      });
      commitsEl.append(button);
    }
  }

  function renderInbox() {
    inboxEl.replaceChildren();
    const open = engine.openChangeRequests(state);
    const closed = Object.values(state.changeRequests)
      .filter(cr => cr.status !== 'open')
      .sort((a, b) => (a.resolvedAt || '') < (b.resolvedAt || '') ? 1 : -1);
    inboxEl.append(el('p', 'group-label', 'Open'));
    inboxEl.append(requestList(open.length ? open : [], 'No open change requests.'));
    if (closed.length) {
      inboxEl.append(el('p', 'group-label', 'Closed'));
      inboxEl.append(requestList(closed, ''));
    }
  }

  function requestList(items, empty) {
    const list = el('ul', 'inbox-list');
    if (!items.length) {
      list.append(el('li', 'note', empty));
      return list;
    }
    for (const cr of items) {
      const row = engine.canonical(state, cr.recordId);
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cr-button';
      button.setAttribute('aria-pressed', cr.id === ui.crId ? 'true' : 'false');
      button.append(document.createTextNode(`${cr.submittedBy} · ${cr.status}`));
      button.append(el('small', '', `${row ? row.fields.title : cr.recordId}. ${cr.message}`));
      button.addEventListener('click', () => {
        ui.recordId = cr.recordId;
        ui.crId = cr.id;
        ui.commitId = null;
        errorEl.textContent = '';
        render();
      });
      li.append(button);
      list.append(li);
    }
    return list;
  }

  function renderRequest() {
    requestEl.replaceChildren();
    const cr = state.changeRequests[ui.crId];
    if (!cr) {
      requestEl.append(el('p', 'note', 'Select a change request.'));
      return;
    }
    const rows = engine.changeRequestRows(state, cr.id);
    requestEl.append(el('h3', '', `${cr.id} · ${cr.status}`));
    requestEl.append(el('p', 'message', `${cr.submittedBy}: ${cr.message}`));
    const conflict = conflictCopy(cr);
    if (conflict) requestEl.append(el('p', 'conflict', conflict));

    const table = document.createElement('table');
    table.className = 'diff';
    const caption = el('caption', 'note', 'Field diff');
    table.append(caption);
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Field', 'When proposed', 'Canonical', 'Proposal']) headRow.append(el('th', '', label));
    head.append(headRow);
    table.append(head);
    const body = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      const fieldCell = document.createElement('th');
      fieldCell.scope = 'row';
      fieldCell.append(document.createTextNode(row.name));
      fieldCell.append(el('span', 'type', row.type));
      if (row.conflict) fieldCell.append(el('span', 'type', 'Conflict'));
      tr.append(fieldCell);
      tr.append(el('td', '', row.baseLabel));
      tr.append(el('td', '', row.canonicalLabel));
      const proposed = document.createElement('td');
      if (row.conflict) proposed.className = 'conflict-cell';
      if (cr.status === 'open') proposed.append(fieldControl(row));
      else proposed.textContent = row.proposedLabel;
      tr.append(proposed);
      body.append(tr);
    }
    table.append(body);
    requestEl.append(table);

    if (cr.status === 'open') {
      const actions = el('div', 'actions');
      const update = el('button', '', 'Update proposal');
      update.type = 'button';
      update.addEventListener('click', () => {
        take(engine.revise(state, {
          changeRequestId: cr.id,
          author: reviewerName(),
          changes: readProposal(),
        }));
      });
      const approve = el('button', '', 'Approve');
      approve.type = 'button';
      approve.addEventListener('click', () => approveCurrent(cr));
      const reason = document.createElement('input');
      reason.id = 'reason';
      reason.placeholder = 'Reason, if rejecting';
      reason.maxLength = 500;
      reason.autocomplete = 'off';
      const reject = el('button', '', 'Reject');
      reject.type = 'button';
      reject.addEventListener('click', () => {
        take(engine.reject(state, {
          changeRequestId: cr.id,
          reviewer: reviewerName(),
          reason: reason.value,
        }));
      });
      actions.append(update, approve, reason, reject);
      requestEl.append(actions);
    } else {
      requestEl.append(el('p', 'note', `${cr.status === 'approved' ? 'Approved' : 'Rejected'} by ${cr.resolvedBy} · ${formatTime(cr.resolvedAt)}`));
    }

    const thread = el('ol', 'comments');
    for (const entry of cr.comments) {
      const li = document.createElement('li');
      const who = el('strong', '', entry.author);
      const time = document.createElement('time');
      time.dateTime = entry.at;
      time.textContent = formatTime(entry.at);
      li.append(who, time, el('p', 'message', entry.body));
      thread.append(li);
    }
    requestEl.append(thread);

    const form = el('form', 'comment-form');
    const box = document.createElement('textarea');
    box.maxLength = 500;
    box.required = true;
    box.placeholder = 'Comment';
    const submit = el('button', '', 'Add comment');
    submit.type = 'submit';
    form.append(box, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const result = engine.comment(state, {
        changeRequestId: cr.id,
        author: reviewerName(),
        body: box.value,
      });
      if (take(result) && ui.crId === cr.id) {
        const next = requestEl.querySelector('textarea');
        if (next) next.focus();
      }
    });
    requestEl.append(form);
  }

  function fieldControl(row) {
    let input;
    if (row.type === 'select') {
      input = document.createElement('select');
      for (const option of row.options) input.append(new Option(option, option));
    } else if (row.type === 'relation') {
      input = document.createElement('select');
      for (const person of engine.PEOPLE) input.append(new Option(person.name, person.id));
    } else if (row.type === 'text' && row.fieldId === 'note') {
      input = document.createElement('textarea');
    } else {
      input = document.createElement('input');
      if (row.type === 'number') {
        input.type = 'number';
        input.min = '1';
        input.max = '9';
        input.step = '1';
      } else if (row.type === 'date') {
        input.type = 'date';
      } else {
        input.type = 'text';
        input.maxLength = 280;
      }
    }
    input.dataset.field = row.fieldId;
    input.dataset.type = row.type;
    input.value = row.type === 'number' ? String(row.proposed) : row.proposed;
    input.setAttribute('aria-label', `${row.name} proposal`);
    return input;
  }

  function readProposal() {
    const changes = {};
    for (const input of requestEl.querySelectorAll('[data-field]')) {
      if (input.dataset.type === 'number') {
        if (input.value.trim() === '') changes[input.dataset.field] = input.value;
        else {
          const number = Number(input.value);
          changes[input.dataset.field] = Number.isInteger(number) ? number : input.value;
        }
      } else {
        changes[input.dataset.field] = input.value;
      }
    }
    return changes;
  }

  function sameChanges(next, previous) {
    const keys = new Set([...Object.keys(next), ...Object.keys(previous)]);
    for (const key of keys) {
      if (next[key] !== previous[key]) return false;
    }
    return true;
  }

  function approveCurrent(cr) {
    const changes = readProposal();
    if (!sameChanges(changes, cr.changes)) {
      const revised = engine.revise(state, {
        changeRequestId: cr.id,
        author: reviewerName(),
        changes,
      });
      if (!take(revised)) return;
    }
    take(engine.approve(state, {changeRequestId: cr.id, reviewer: reviewerName()}));
  }

  function conflictCopy(cr) {
    const blocked = engine.conflictingFields(state, cr.id);
    if (blocked.length) {
      return `Conflict on ${names(blocked)}. The canonical row changed after this proposal. Update the proposal, then approve.`;
    }
    const rows = engine.overlaps(state, cr.id).filter(row => row.conflict);
    if (!rows.length) return '';
    const who = [...new Set(rows.map(row => row.submittedBy))].join(' and ');
    const fields = [...new Set(rows.map(row => row.fieldId))];
    return `Conflict with ${who} on ${names(fields)}. Both change requests are still open.`;
  }

  function names(ids) {
    return ids.map(id => engine.FIELDS.find(field => field.id === id).name).join(', ');
  }

  function renderAudit() {
    auditEl.replaceChildren();
    const events = state.audit.slice().reverse();
    for (const event of events) {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = event.at;
      time.textContent = formatTime(event.at);
      li.append(time, document.createTextNode(`${event.actor}. ${event.summary}`));
      auditEl.append(li);
    }
  }
})();
