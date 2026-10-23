(function () {
  const plan = window.HackathonPlan;
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const CHECKS = [
    ['market', 'A market that needs crypto, or an existing one brought onchain'],
    ['personal', 'A problem I actually have'],
    ['experience', 'I already know this market'],
    ['priorAttempt', 'Others have tried it, and I know how they failed'],
    ['ambitious', 'The vision outlasts these five weeks'],
  ];
  const TEAMS = [
    ['solo', 'Solo'],
    ['technical', '+ technical'],
    ['nontechnical', '+ non-technical'],
    ['both', '+ both'],
  ];
  const INTENTS = [
    ['learner', 'Learner'],
    ['contributor', 'Contributor'],
    ['founder', 'Founder'],
  ];
  const KIND = {core: 'Core', extra: 'Extra', desk: 'Open', pitch: 'Final week'};

  let state = plan.createState();
  let selected = 'devnet';
  let dragging = '';

  const ideasEl = document.querySelector('#ideas');
  const checksEl = document.querySelector('#checks');
  const teamEl = document.querySelector('#team');
  const intentEl = document.querySelector('#intent');
  const customEl = document.querySelector('#custom');
  const likeEl = document.querySelector('#like');
  const trayEl = document.querySelector('#tray');
  const calendarEl = document.querySelector('#calendar');
  const linesEl = document.querySelector('#lines');
  const beatsEl = document.querySelector('#beats');
  const scoreEl = document.querySelector('#score');
  const capacityEl = document.querySelector('#capacity');
  const noticeEl = document.querySelector('#notice');
  const youBuildEl = document.querySelector('#you-build');
  const publicGoodEl = document.querySelector('#public-good');

  Object.keys(plan.IDEAS).forEach(function (id) {
    const idea = plan.IDEAS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.idea = id;
    button.textContent = idea.name;
    ideasEl.appendChild(button);
  });

  CHECKS.forEach(function (pair) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.check = pair[0];
    label.appendChild(input);
    label.appendChild(document.createTextNode(pair[1]));
    checksEl.appendChild(label);
  });

  TEAMS.forEach(function (pair) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.team = pair[0];
    button.textContent = pair[1];
    teamEl.appendChild(button);
  });

  INTENTS.forEach(function (pair) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.intent = pair[0];
    button.textContent = pair[1];
    intentEl.appendChild(button);
  });

  document.querySelector('#setup').addEventListener('submit', function (event) { event.preventDefault(); });
  ideasEl.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button) return;
    const next = plan.setIdea(state, button.dataset.idea);
    if (!next.ok) return;
    state = next.state;
    notice('');
    render();
  });
  checksEl.addEventListener('change', function (event) {
    const input = event.target;
    if (!input.dataset.check) return;
    state = plan.setCheck(state, input.dataset.check, input.checked).state;
    render();
  });
  youBuildEl.addEventListener('change', function () {
    const next = plan.setCheck(state, 'youBuild', youBuildEl.checked);
    state = next.state;
    if (next.dropped && next.dropped.length) notice('Some cards came off. There is no build track for them now.');
    render();
  });
  publicGoodEl.addEventListener('change', function () {
    state = plan.setCheck(state, 'publicGood', publicGoodEl.checked).state;
    render();
  });
  teamEl.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button) return;
    const next = plan.setTeam(state, button.dataset.team);
    if (!next.ok) return;
    state = next.state;
    notice(next.dropped.length ? 'A card came off. The tracks changed and it no longer fit where it was.' : '');
    render();
  });
  intentEl.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button) return;
    const next = plan.setIntent(state, button.dataset.intent);
    if (!next.ok) return;
    state = next.state;
    render();
  });
  customEl.addEventListener('input', function (event) {
    const input = event.target;
    if (!input.name) return;
    state = plan.setText(state, input.name, input.value).state;
    render();
  });
  document.querySelector('#clear').addEventListener('click', function () {
    state = plan.clearBoard(state);
    notice('');
    render();
  });
  trayEl.addEventListener('click', function (event) {
    const button = event.target.closest('[data-feature]');
    if (!button) return;
    selected = button.dataset.feature;
    render();
  });
  trayEl.addEventListener('dragstart', function (event) {
    const button = event.target.closest('[data-feature]');
    if (!button) return;
    selected = button.dataset.feature;
    dragging = button.dataset.feature;
    event.dataTransfer.setData('text/plain', button.dataset.feature);
    event.dataTransfer.effectAllowed = 'move';
  });
  calendarEl.addEventListener('dragstart', function (event) {
    const chip = event.target.closest('[data-feature]');
    if (!chip) return;
    dragging = chip.dataset.feature;
    event.dataTransfer.setData('text/plain', chip.dataset.feature);
    event.dataTransfer.effectAllowed = 'move';
  });
  calendarEl.addEventListener('dragover', function (event) {
    const day = event.target.closest('[data-day]');
    if (!day) return;
    event.preventDefault();
  });
  calendarEl.addEventListener('drop', function (event) {
    const day = event.target.closest('[data-day]');
    if (!day) return;
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || dragging || selected;
    dragging = '';
    dropOn(id, Number(day.dataset.day));
  });
  calendarEl.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const day = event.target.closest('[data-day]');
    if (!day || event.target.closest('.chip') || !selected) return;
    event.preventDefault();
    dropOn(selected, Number(day.dataset.day));
  });
  calendarEl.addEventListener('click', function (event) {
    const chip = event.target.closest('.chip');
    if (chip) {
      state = plan.remove(state, chip.dataset.feature).state;
      selected = chip.dataset.feature;
      notice('');
      render();
      return;
    }
    const day = event.target.closest('[data-day]');
    if (!day || !selected) return;
    dropOn(selected, Number(day.dataset.day));
  });

  render();

  function notice(text) {
    noticeEl.textContent = text;
  }

  function dropOn(id, day) {
    const had = state.placements.some(function (row) { return row.id === id; });
    const base = had ? plan.remove(state, id).state : state;
    const next = plan.place(base, id, day);
    if (!next.ok) {
      notice(plan.reason(next.code));
      return;
    }
    state = next.state;
    selected = id;
    notice('');
    render();
  }

  function render() {
    const view = plan.board(state);
    const report = plan.judge(state);
    ideasEl.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.idea === state.ideaId ? 'true' : 'false');
    });
    checksEl.querySelectorAll('input').forEach(function (input) {
      input.checked = !!state[input.dataset.check];
    });
    youBuildEl.checked = !!state.youBuild;
    publicGoodEl.checked = !!state.publicGood;
    teamEl.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.team === state.team ? 'true' : 'false');
    });
    intentEl.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.intent === state.intent ? 'true' : 'false');
    });
    customEl.hidden = state.ideaId !== 'custom';
    likeEl.textContent = view.idea.like;

    const usage = view.usage;
    if (view.tracks === 0) {
      capacityEl.textContent = 'No build track. The article says a non-technical founder needs a technical lead before the engineering cards will stick. The pitch card can still be placed.';
    } else {
      let text = usage.sprint + ' of ' + usage.capacity + ' build-days used in the four-week sprint. ';
      text += view.tracks === 1 ? 'One track.' : view.tracks + ' tracks.';
      if (view.desk) text += ' The X account and the beta session sit on a separate desk track.';
      if (usage.pitchWeek) text += ' ' + usage.pitchWeek + ' feature-day' + (usage.pitchWeek === 1 ? '' : 's') + ' landed on the final week.';
      capacityEl.textContent = text;
    }

    trayEl.replaceChildren();
    view.features.forEach(function (feature) {
      const onBoard = state.placements.some(function (row) { return row.id === feature.id; });
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card kind-' + feature.kind + (onBoard ? ' on-board' : '');
      button.dataset.feature = feature.id;
      button.draggable = true;
      button.setAttribute('aria-pressed', selected === feature.id ? 'true' : 'false');
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = KIND[feature.kind] + (onBoard ? ' · on the board' : '');
      const name = document.createElement('strong');
      name.textContent = feature.name;
      const days = document.createElement('em');
      days.textContent = feature.days + (feature.days === 1 ? ' day' : ' days');
      button.append(meta, name, days);
      trayEl.appendChild(button);
    });

    calendarEl.replaceChildren();
    for (let week = 1; week <= 5; week += 1) {
      const row = document.createElement('div');
      row.className = 'week' + (week === 5 ? ' is-pitch' : '');
      const label = document.createElement('div');
      label.className = 'week-label';
      const strong = document.createElement('strong');
      strong.textContent = 'Week ' + week;
      const span = document.createElement('span');
      span.textContent = week === 5 ? 'Test and pitch' : 'Engineering';
      label.append(strong, span);
      row.appendChild(label);
      view.days.filter(function (day) { return day.week === week; }).forEach(function (day) {
        const cell = document.createElement('div');
        cell.className = 'day';
        cell.dataset.day = String(day.index);
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', 'Week ' + week + ' ' + DOW[day.index % 5] + '. Place the selected card.');
        const dow = document.createElement('span');
        dow.className = 'dow';
        dow.textContent = DOW[day.index % 5];
        cell.appendChild(dow);
        day.cells.forEach(function (item) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'chip kind-' + item.kind;
          chip.dataset.feature = item.id;
          chip.draggable = true;
          chip.setAttribute('aria-label', 'Remove ' + item.name);
          const name = document.createElement('strong');
          name.textContent = item.name;
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = (item.index + 1) + '/' + item.days + (item.lane === 'desk' ? ' · desk' : '');
          chip.append(name, meta);
          cell.appendChild(chip);
        });
        row.appendChild(cell);
      });
      calendarEl.appendChild(row);
    }

    scoreEl.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = String(report.met);
    scoreEl.append(strong, document.createTextNode(' of ' + report.counted + ' on this card'));

    linesEl.replaceChildren();
    report.lines.forEach(function (row) {
      const item = document.createElement('li');
      item.className = row.status;
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = row.status === 'met' ? 'Met' : (row.status === 'missed' ? 'Missed' : 'Note');
      const title = document.createElement('strong');
      title.textContent = row.title;
      const detail = document.createElement('p');
      detail.textContent = row.detail;
      const source = document.createElement('p');
      source.className = 'source';
      source.textContent = row.source;
      item.append(mark, title, detail, source);
      linesEl.appendChild(item);
    });

    beatsEl.replaceChildren();
    report.beats.forEach(function (beat) {
      const item = document.createElement('li');
      item.className = beat.included ? 'in' : 'out';
      const title = document.createElement('strong');
      title.textContent = beat.title;
      const text = document.createElement('p');
      text.textContent = beat.included ? beat.text : 'Not in the video. ' + beat.text;
      item.append(title, text);
      beatsEl.appendChild(item);
    });
  }
})();
