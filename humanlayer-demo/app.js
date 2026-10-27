(function () {
  const S = window.HumanLayerSketch;
  let state = S.create('rpi');

  const workflows = document.getElementById('workflows');
  const reset = document.getElementById('reset');
  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const phases = document.getElementById('phases');
  const sheetCard = document.getElementById('sheet-card');
  const sheetKicker = document.getElementById('sheet-kicker');
  const sheetTitle = document.getElementById('sheet-title');
  const sheet = document.getElementById('sheet');
  const share = document.getElementById('share');
  const every = document.getElementById('every');
  const advance = document.getElementById('advance');
  const scripted = document.getElementById('scripted');
  const resolve = document.getElementById('resolve');
  const noteForm = document.getElementById('note-form');
  const note = document.getElementById('note');
  const sessions = document.getElementById('sessions');
  const diffEmpty = document.getElementById('diff-empty');
  const diff = document.getElementById('diff');
  const thread = document.getElementById('thread');

  const MARK = {
    now: 'Now',
    done: 'Done',
    wait: 'Waiting',
    skip: 'Not in this workflow',
  };

  function apply(result) {
    if (!result.ok) {
      const run = S.runState(state);
      status.textContent = S.deny(result.code);
      status.className = 'status ' + run.id;
      return;
    }
    state = result.state;
    render();
  }

  function renderWorkflows() {
    workflows.replaceChildren();
    S.workflows().forEach(function (flow) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = flow.label;
      button.setAttribute('aria-pressed', flow.id === state.workflow ? 'true' : 'false');
      button.addEventListener('click', function () {
        if (flow.id === state.workflow) return;
        state = S.create(flow.id);
        note.value = '';
        render();
      });
      workflows.appendChild(button);
    });
  }

  function renderPhases() {
    phases.replaceChildren();
    S.PHASES.forEach(function (phase, index) {
      const mark = S.phaseMark(phase.id, state);
      const item = document.createElement('li');
      item.className = mark;
      if (mark === 'now') item.setAttribute('aria-current', 'step');
      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('strong');
      name.textContent = phase.label;
      const word = document.createElement('span');
      word.className = 'mark';
      word.textContent = MARK[mark];
      item.append(idx, name, word);
      phases.appendChild(item);
    });
  }

  function renderSheet() {
    const view = S.sheet(state);
    const run = S.runState(state);
    sheetKicker.textContent = view.kicker;
    sheetTitle.textContent = view.title;
    sheet.replaceChildren();
    view.blocks.forEach(function (block) {
      if (block.kind === 'code') {
        const pre = document.createElement('pre');
        pre.textContent = block.lines.join('\n');
        sheet.appendChild(pre);
        return;
      }
      const p = document.createElement('p');
      p.textContent = block.text;
      sheet.appendChild(p);
    });
    sheetCard.className = 'sheet ' + run.id;
  }

  function renderSessions() {
    sessions.replaceChildren();
    S.sessions(state).forEach(function (item) {
      const li = document.createElement('li');
      const word = document.createElement('span');
      word.className = 'status-word ' + item.status.toLowerCase();
      word.textContent = item.status;
      const label = document.createElement('span');
      label.textContent = item.label;
      li.append(word, label);
      sessions.appendChild(li);
    });
  }

  function renderDiff() {
    const lines = S.diffLines(state);
    if (!lines) {
      diff.hidden = true;
      diff.textContent = '';
      diffEmpty.hidden = false;
      return;
    }
    diffEmpty.hidden = true;
    diff.hidden = false;
    diff.textContent = lines.join('\n');
  }

  function renderThread() {
    thread.replaceChildren();
    if (!state.comment) {
      const p = document.createElement('p');
      p.className = 'fine';
      p.textContent = state.phase === 'design'
        ? 'No comment yet. The scripted note is the one that rewrites the design.'
        : 'Comments attach to Design. This phase has none.';
      thread.appendChild(p);
      return;
    }
    const mine = document.createElement('p');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = state.comment.resolved ? 'Comment, resolved' : 'Comment, open';
    mine.appendChild(who);
    mine.appendChild(document.createTextNode(state.comment.text));
    thread.appendChild(mine);
    if (state.comment.reply) {
      const reply = document.createElement('p');
      const agent = document.createElement('span');
      agent.className = 'who';
      agent.textContent = 'Scripted reply';
      reply.appendChild(agent);
      reply.appendChild(document.createTextNode(state.comment.reply));
      thread.appendChild(reply);
    }
  }

  function render() {
    const flow = S.workflow(state.workflow);
    const run = S.runState(state);
    const gate = S.gates(state);
    renderWorkflows();
    summary.textContent = flow.label + '. ' + flow.summary;
    status.textContent = run.label;
    status.className = 'status ' + run.id;
    renderPhases();
    renderSheet();
    renderSessions();
    renderDiff();
    renderThread();
    share.disabled = !gate.answer;
    every.disabled = !gate.answer;
    advance.disabled = !gate.advance;
    scripted.disabled = !gate.comment;
    resolve.disabled = !gate.resolve;
    note.disabled = !gate.comment;
    document.getElementById('note-send').disabled = !gate.comment;
    share.setAttribute('aria-pressed', state.answer === 'share' ? 'true' : 'false');
    every.setAttribute('aria-pressed', state.answer === 'every' ? 'true' : 'false');
  }

  share.addEventListener('click', function () { apply(S.answer(state, 'share')); });
  every.addEventListener('click', function () { apply(S.answer(state, 'every')); });
  advance.addEventListener('click', function () { apply(S.advance(state)); });
  scripted.addEventListener('click', function () { apply(S.comment(state, S.SCRIPTED_COMMENT)); });
  resolve.addEventListener('click', function () { apply(S.resolve(state)); });
  noteForm.addEventListener('submit', function (event) {
    event.preventDefault();
    apply(S.comment(state, note.value));
    if (S.gates(state).resolve) note.value = '';
  });
  reset.addEventListener('click', function () {
    state = S.create(state.workflow);
    note.value = '';
    render();
  });

  render();
})();
