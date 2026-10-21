(function () {
  const Sim = window.VerifyLoop;
  const testsEl = document.getElementById('tests');
  const happyNote = document.getElementById('happy-note');
  const fixesEl = document.getElementById('fixes');
  const seedsEl = document.getElementById('seeds');
  const invariantsEl = document.getElementById('invariants');
  const roundsEl = document.getElementById('rounds');
  const timelineEl = document.getElementById('timeline');
  const seedLine = document.getElementById('seed-line');
  const findingEl = document.getElementById('finding');
  const replayNote = document.getElementById('replay-note');

  const state = {
    fixes: Sim.normalizeFixes(null),
    report: null,
    focus: 1,
    rounds: [],
    replay: '',
  };

  function runBudget() {
    state.report = Sim.discover(state.fixes, Sim.BUDGET);
    if (state.report.first) state.focus = state.report.first.seed;
    else if (state.focus < 1 || state.focus > Sim.BUDGET) state.focus = 1;
  }

  function route(spec) {
    return ['t1', 't2', 't3', 't4', 't5', 't6'].map(function (id) {
      const tx = spec[id];
      return id + ' ' + tx.from + '→' + tx.to + ' ' + tx.amount;
    }).join(' · ') + ' · clock +' + spec.skew;
  }

  function renderTests() {
    const report = Sim.unitTests(null);
    happyNote.textContent = report.note;
    testsEl.replaceChildren();
    report.tests.forEach(function (item, index) {
      const li = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = item.pass ? 'pass' : 'fail';
      mark.textContent = item.pass ? 'Pass' : 'Fail';
      const body = document.createElement('p');
      const name = document.createElement('span');
      name.textContent = (index + 1) + '. ' + item.name + '. ';
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = item.detail;
      body.append(name, detail);
      li.append(mark, body);
      testsEl.appendChild(li);
    });
  }

  function renderFixes() {
    fixesEl.replaceChildren();
    [
      ['orderedLog', 'ordered log'],
      ['idempotent', 'idempotent ids'],
      ['atomic', 'atomic record'],
      ['indexRead', 'index read'],
    ].forEach(function (pair) {
      const chip = document.createElement('span');
      const on = !!state.fixes[pair[0]];
      chip.className = 'chip ' + (on ? 'on' : 'off');
      chip.textContent = (on ? 'On · ' : 'Off · ') + pair[1];
      fixesEl.appendChild(chip);
    });
  }

  function renderSeeds() {
    seedsEl.replaceChildren();
    state.report.runs.forEach(function (run) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seed ' + (run.ok ? 'ok' : 'bad') + (run.seed === state.focus ? ' focus' : '');
      button.textContent = String(run.seed);
      button.setAttribute('aria-pressed', run.seed === state.focus ? 'true' : 'false');
      button.setAttribute('aria-label', 'Seed ' + run.seed + (run.ok ? ', passed' : ', failed'));
      button.addEventListener('click', function () {
        state.focus = run.seed;
        state.replay = '';
        render();
      });
      seedsEl.appendChild(button);
    });
  }

  function renderInvariants() {
    invariantsEl.replaceChildren();
    const current = state.report.first ? state.report.first.violation.bug : null;
    Sim.INVARIANTS.forEach(function (item) {
      const key = Sim.REMEDIES[item.id].key;
      let status = 'wait';
      let label = 'Not reached';
      if (state.fixes[key]) {
        status = 'fixed';
        label = 'Fixed';
      } else if (state.report.ok) {
        status = 'pass';
        label = 'Holds';
      } else if (current === item.id) {
        status = 'fail';
        label = 'Fails';
      }
      const li = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = status;
      mark.textContent = label;
      const body = document.createElement('p');
      body.textContent = item.text;
      li.append(mark, body);
      invariantsEl.appendChild(li);
    });
  }

  function renderRounds() {
    roundsEl.replaceChildren();
    state.rounds.forEach(function (round, index) {
      const li = document.createElement('li');
      li.textContent = (index + 1) + '. Seed ' + round.seed + ' found ' + round.bug.replace('-', ' ')
        + '. Hash ' + round.hash + '. Applied: ' + round.title + '.';
      roundsEl.appendChild(li);
    });
    if (state.report.ok && state.rounds.length) {
      const li = document.createElement('li');
      li.textContent = (state.rounds.length + 1) + '. Seeds 1–' + Sim.BUDGET + ' passed. The budget is clean.';
      roundsEl.appendChild(li);
    }
  }

  function renderTimeline(run) {
    seedLine.textContent = 'Seed ' + run.seed + ' · hash ' + run.hash + ' · ' + route(run.spec);
    timelineEl.replaceChildren();
    run.events.forEach(function (event) {
      const li = document.createElement('li');
      li.className = event.tone;
      if (run.violation && event.i === run.violation.at) li.classList.add('bad');
      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(event.i);
      const text = document.createElement('p');
      text.textContent = event.text;
      li.append(idx, text);
      timelineEl.appendChild(li);
    });
    const bad = timelineEl.querySelector('.bad');
    if (bad) timelineEl.scrollTop = Math.max(0, bad.offsetTop - 48);
  }

  function renderFinding() {
    findingEl.replaceChildren();
    const run = state.report.runs[state.focus - 1];
    if (state.report.ok) {
      const kicker = document.createElement('p');
      kicker.className = 'k';
      kicker.style.color = '#1e6b45';
      kicker.textContent = 'Clean';
      const title = document.createElement('h3');
      title.textContent = 'Seeds 1–' + Sim.BUDGET + ' passed';
      const body = document.createElement('p');
      body.textContent = 'The same fault script ran on every seed. No invariant failed. The four fixes are on. Replay a seed and the hash matches.';
      findingEl.append(kicker, title, body);
      return;
    }

    const first = state.report.first;
    const violation = run.ok ? first.violation : run.violation;
    const remedy = Sim.REMEDIES[violation.bug];
    const kicker = document.createElement('p');
    kicker.className = 'k';
    kicker.textContent = run.seed === first.seed ? 'First failure · seed ' + first.seed : 'Seed ' + run.seed + ' · first failure is seed ' + first.seed;
    const title = document.createElement('h3');
    title.textContent = remedy.title;
    const inv = document.createElement('p');
    inv.textContent = 'Invariant: ' + violation.invariant + '.';
    const detail = document.createElement('p');
    detail.textContent = violation.detail;
    const before = document.createElement('p');
    before.className = 'before';
    before.textContent = 'Before. ' + remedy.before;
    const after = document.createElement('p');
    after.className = 'after';
    after.textContent = 'Rectify. ' + remedy.after;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.textContent = 'Apply this fix and run again';
    button.addEventListener('click', function () {
      state.rounds.push({
        bug: first.violation.bug,
        seed: first.seed,
        hash: first.hash,
        title: Sim.REMEDIES[first.violation.bug].title,
      });
      const next = Object.assign({}, state.fixes);
      next[Sim.REMEDIES[first.violation.bug].key] = true;
      state.fixes = Sim.normalizeFixes(next);
      state.replay = '';
      runBudget();
      render();
    });
    findingEl.append(kicker, title, inv, detail, before, after, button);
  }

  function render() {
    const run = state.report.runs[state.focus - 1];
    replayNote.textContent = state.replay;
    renderFixes();
    renderSeeds();
    renderInvariants();
    renderRounds();
    renderTimeline(run);
    renderFinding();
  }

  document.getElementById('replay-seed').addEventListener('click', function () {
    const before = state.report.runs[state.focus - 1];
    const again = Sim.runSeed(state.focus, state.fixes);
    state.replay = again.hash === before.hash
      ? 'Seed ' + state.focus + ' replayed. Hash ' + again.hash + ' matches.'
      : 'Seed ' + state.focus + ' replayed. Hash ' + again.hash + ' does not match ' + before.hash + '.';
    render();
  });

  document.getElementById('replay-budget').addEventListener('click', function () {
    const before = state.report.runs.map(function (run) { return run.hash; }).join(',');
    const focus = state.focus;
    runBudget();
    state.focus = focus;
    const after = state.report.runs.map(function (run) { return run.hash; }).join(',');
    state.replay = before === after
      ? 'The budget replayed. All ' + Sim.BUDGET + ' hashes match.'
      : 'The budget replayed. A hash changed.';
    render();
  });

  document.getElementById('reset').addEventListener('click', function () {
    state.fixes = Sim.normalizeFixes(null);
    state.rounds = [];
    state.replay = '';
    state.focus = 1;
    runBudget();
    render();
  });

  renderTests();
  runBudget();
  render();
})();
