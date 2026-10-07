(function () {
  const gate = window.ConstraintGate;
  const togglesEl = document.querySelector('#toggles');
  const pipsEl = document.querySelector('#pips');
  const budgetLine = document.querySelector('#budget-line');
  const currentEl = document.querySelector('#current');
  const pipelineEl = document.querySelector('#pipeline');
  const narrationEl = document.querySelector('#narration');
  const countsEl = document.querySelector('#counts');
  const logEl = document.querySelector('#log');
  const incidentsEl = document.querySelector('#incidents');
  const progressEl = document.querySelector('#progress');
  const nextBtn = document.querySelector('#next');
  const batchBtn = document.querySelector('#batch');

  const lintIds = {
    lintFloating: true,
    lintSql: true,
    lintBoundary: true,
    lintCatch: true,
    lintMagic: true,
  };

  let run = gate.createRun();
  let lintBox = null;

  buildToggles();
  document.querySelector('#all-on').addEventListener('click', function () { setAll(true); });
  document.querySelector('#all-off').addEventListener('click', function () { setAll(false); });
  nextBtn.addEventListener('click', function () {
    run = gate.submitNext(run);
    render();
  });
  batchBtn.addEventListener('click', function () {
    run = gate.runAll(run);
    render();
  });
  document.querySelector('#reset').addEventListener('click', function () {
    run = gate.createRun();
    syncToggles();
    render();
  });

  render();

  function buildToggles() {
    gate.TOGGLES.forEach(function (toggle) {
      if (lintIds[toggle.id] && !lintBox) {
        const label = document.createElement('p');
        label.className = 'group-label';
        label.textContent = 'Lint rules';
        togglesEl.appendChild(label);
        lintBox = true;
      }
      const row = document.createElement('label');
      row.className = 'toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.constraint = toggle.id;
      input.checked = true;
      input.addEventListener('change', function () {
        run = gate.setConstraint(run, toggle.id, input.checked);
        render();
      });
      const text = document.createElement('span');
      text.textContent = toggle.label;
      const detail = document.createElement('small');
      detail.textContent = toggle.detail;
      text.appendChild(detail);
      row.append(input, text);
      togglesEl.appendChild(row);
    });
  }

  function setAll(on) {
    gate.TOGGLES.forEach(function (toggle) {
      run = gate.setConstraint(run, toggle.id, on);
    });
    syncToggles();
    render();
  }

  function syncToggles() {
    togglesEl.querySelectorAll('input').forEach(function (input) {
      input.checked = Boolean(run.constraints[input.dataset.constraint]);
    });
  }

  function render() {
    const summary = gate.summarize(run);
    const done = summary.done;
    nextBtn.disabled = done;
    batchBtn.disabled = done;
    progressEl.textContent = summary.seen + ' of ' + gate.CHANGES.length + ' sent';
    budgetLine.textContent = summary.reviewLeft + ' of ' + summary.reviewBudget + ' minutes left';
    renderPips(summary);
    renderCurrent();
    renderPipeline();
    narrationEl.textContent = summary.seen ? gate.narrate(summary) : 'Nothing sent yet.';
    renderCounts(summary);
    renderLog();
    renderIncidents();
  }

  function renderPips(summary) {
    pipsEl.textContent = '';
    for (let i = 0; i < summary.reviewBudget; i += 1) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < summary.reviewSpent ? ' is-spent' : '');
      pipsEl.appendChild(pip);
    }
  }

  function renderCurrent() {
    currentEl.textContent = '';
    const latest = run.results[run.results.length - 1];
    const upcoming = gate.CHANGES[run.cursor];
    const change = latest ? gate.changeById(latest.id) : upcoming;
    if (!change) {
      const done = document.createElement('p');
      done.className = 'empty';
      done.textContent = 'The queue is empty.';
      currentEl.appendChild(done);
      return;
    }
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = latest ? gate.authorLabel(change.author) : 'Up next · ' + gate.authorLabel(change.author);
    const title = document.createElement('h3');
    title.textContent = change.title;
    const file = document.createElement('p');
    file.className = 'file';
    file.textContent = change.file + ' · ' + change.reviewMinutes + ' min to read';
    const code = document.createElement('pre');
    code.textContent = change.snippet;
    currentEl.append(who, title, file, code);
    if (latest) {
      const verdict = document.createElement('p');
      verdict.className = 'verdict is-' + latest.outcome;
      verdict.textContent = verdictText(latest);
      currentEl.appendChild(verdict);
    }
  }

  function verdictText(result) {
    if (result.outcome === 'caught') {
      const gateName = labelFor(result.gate);
      return 'Stopped at ' + gateName + '. ' + result.evidence;
    }
    if (result.outcome === 'incident') {
      return 'Shipped. ' + result.evidence;
    }
    return result.evidence;
  }

  function labelFor(id) {
    const found = gate.GATES.find(function (item) { return item.id === id; });
    return found ? found.label : id;
  }

  function renderPipeline() {
    pipelineEl.textContent = '';
    const latest = run.results[run.results.length - 1];
    gate.GATES.forEach(function (item) {
      const li = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = item.label;
      li.appendChild(name);
      if (latest && latest.outcome === 'caught' && latest.gate === item.id) {
        li.className = 'is-stop';
        li.appendChild(document.createTextNode('Stopped here'));
      } else if (latest && item.id === 'production' && latest.outcome === 'incident') {
        li.className = 'is-bad';
        li.appendChild(document.createTextNode('Incident'));
      } else if (latest && item.id === 'production' && latest.outcome === 'shipped') {
        li.className = 'is-prod';
        li.appendChild(document.createTextNode(latest.reviewed ? 'Shipped' : 'Shipped unread'));
      } else {
        li.appendChild(document.createTextNode('Open'));
      }
      pipelineEl.appendChild(li);
    });
  }

  function renderCounts(summary) {
    countsEl.textContent = '';
    const rows = [
      ['Stopped', Object.keys(summary.caught).reduce(function (sum, key) { return sum + summary.caught[key]; }, 0)],
      ['Shipped', summary.shipped],
      ['Incidents', summary.incidents],
      ['Minutes left', summary.reviewLeft],
    ];
    rows.forEach(function (row) {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = row[0];
      const dd = document.createElement('dd');
      dd.textContent = String(row[1]);
      wrap.append(dt, dd);
      countsEl.appendChild(wrap);
    });
    const lines = document.createElement('div');
    lines.style.gridColumn = '1 / -1';
    const list = document.createElement('ul');
    list.className = 'gate-lines';
    gate.GATES.filter(function (item) { return item.id !== 'production'; }).forEach(function (item) {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = item.label + ' ';
      li.append(strong, document.createTextNode(String(summary.caught[item.id] || 0)));
      list.appendChild(li);
    });
    const slop = document.createElement('li');
    slop.textContent = summary.reviewOnAutomatable + ' review minutes went to diffs a gate can catch';
    list.appendChild(slop);
    lines.appendChild(list);
    countsEl.appendChild(lines);
  }

  function renderLog() {
    logEl.textContent = '';
    if (!run.results.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'The queue is still waiting.';
      logEl.appendChild(empty);
      return;
    }
    run.results.forEach(function (result) {
      const change = gate.changeById(result.id);
      const li = document.createElement('li');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = gate.authorLabel(change.author) + ' · ' + change.title;
      const stamp = document.createElement('div');
      stamp.className = 'stamp is-' + result.outcome;
      stamp.textContent = verdictText(result);
      li.append(title, stamp);
      logEl.appendChild(li);
    });
  }

  function renderIncidents() {
    incidentsEl.textContent = '';
    const incidents = run.results.filter(function (result) { return result.incident; });
    if (!incidents.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = run.results.length
        ? 'Nothing broken has shipped.'
        : 'Incidents show up here after a bad diff reaches production.';
      incidentsEl.appendChild(empty);
      return;
    }
    incidents.forEach(function (result) {
      const change = gate.changeById(result.id);
      const card = document.createElement('article');
      card.className = 'incident';
      const kicker = document.createElement('p');
      kicker.className = 'who';
      kicker.textContent = 'Later, in production · ' + change.file;
      const title = document.createElement('h3');
      title.textContent = result.incident.name;
      const detail = document.createElement('p');
      detail.textContent = result.incident.detail;
      card.append(kicker, title, detail);
      incidentsEl.appendChild(card);
    });
  }
})();
