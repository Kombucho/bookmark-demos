(function () {
  const factory = window.KnowledgeFactory;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = reduce ? 0 : 520;

  const curatorSeries = factory.simulateWeek('curator');
  const selfSeries = factory.simulateWeek('self');

  const floor = document.getElementById('floor');
  const dayLabel = document.getElementById('day-label');
  const daysEl = document.getElementById('days');
  const desksEl = document.getElementById('desks');
  const storeEl = document.getElementById('store');
  const contextEl = document.getElementById('context');
  const inboxEl = document.getElementById('inbox');
  const tracesEl = document.getElementById('traces');
  const sourcesEl = document.getElementById('sources');
  const traceEl = document.getElementById('trace');
  const statusEl = document.getElementById('status');
  const blurbEl = document.getElementById('blurb');
  const chartEl = document.getElementById('chart');
  const tableEl = document.getElementById('table');
  const modeLine = document.getElementById('mode-line');
  const runDayBtn = document.getElementById('run-day');
  const runNightBtn = document.getElementById('run-night');
  const skipBtn = document.getElementById('skip');
  const resetBtn = document.getElementById('reset');
  const modeCurator = document.getElementById('mode-curator');
  const modeSelf = document.getElementById('mode-self');

  let mode = 'curator';
  let state = factory.createState(mode);
  let view = clone(state);
  let scene = freshScene();
  let playing = false;
  let skipRest = false;
  let timer = 0;

  function clone(value) {
    return structuredClone(value);
  }

  function freshScene() {
    return {
      night: false,
      task: null,
      lines: [],
      consults: [],
      diffs: Object.create(null),
      hot: '',
      artifact: '',
    };
  }

  function active(cards, factId) {
    return cards.filter(function (card) {
      return card.fact === factId && !card.retired;
    });
  }

  function conflicts(factId) {
    const bodies = Object.create(null);
    active(view.cards, factId).forEach(function (card) { bodies[card.body] = true; });
    return Object.keys(bodies).length > 1;
  }

  function originLine(card) {
    if (card.kind === 'hedge') return 'Added by an agent on day ' + card.day + ', and it disagrees';
    if (card.origin === 'agent') return 'Added by an agent on day ' + card.day;
    if (card.origin === 'curator') return 'Rewritten by the curator on day ' + card.day;
    return 'Original';
  }

  function sentence(step) {
    if (step.type === 'task-start') return step.agent + ' starts the ' + step.name.toLowerCase() + '.';
    if (step.type === 'consult') {
      const place = (step.index + 1) + ' of ' + step.count;
      return 'Opens “' + step.title + '”, card ' + place + '. ' + (step.matched ? 'It matches the current fact.' : 'It does not match the current fact.');
    }
    if (step.type === 'discover') return 'Reads the ' + step.kind.toLowerCase() + ' and uses that for this run. The card is not edited.';
    if (step.type === 'flag') return 'Flag: ' + step.flag.note;
    if (step.type === 'human') return step.trace.speaker + ', ' + step.trace.role + ': “' + step.trace.text + '”';
    if (step.type === 'write') {
      return step.card.kind === 'hedge'
        ? step.agent + ' adds another card, and it disagrees with the ones already there.'
        : step.agent + ' adds a new card and leaves the old one.';
    }
    if (step.type === 'task-end') {
      return step.success
        ? step.name + ' matches the current fact. ' + scene.artifact
        : step.name + ' goes out stale. ' + scene.artifact;
    }
    if (step.type === 'read-flag') return 'Curator reads the flag on “' + step.title + '”.';
    if (step.type === 'read-trace') return 'Curator reads ' + step.speaker + '’s trace.';
    if (step.type === 'read-source') return 'Curator reads the ' + step.kind.toLowerCase() + '.';
    if (step.type === 'diff') return 'Rewrites “' + step.title + '”.';
    if (step.type === 'close-flag') return 'Closes the flag on “' + step.title + '”.';
    if (step.type === 'idle' || step.type === 'quiet') return step.text;
    return '';
  }

  function artifact(taskId, used) {
    const by = Object.create(null);
    used.forEach(function (row) { by[row.fact] = row; });
    if (taskId === 'revenue') {
      return 'Header “' + factory.headerName(by['report.header'].body) + '”. Column ' + factory.columnName(by['bq.column'].body) + '.';
    }
    if (taskId === 'outbound') return factory.outboundSent(by['outbound.script'].body);
    return 'Ends at ' + factory.launchUrl(by['launch.script'].body) + '.';
  }

  function absorb(step) {
    if (step.type === 'task-start') {
      scene.task = step.taskId;
      scene.consults = [];
      scene.artifact = '';
    } else if (step.type === 'consult') {
      scene.consults.push(step);
      scene.hot = 'card:' + step.cardId;
    } else if (step.type === 'discover') {
      scene.hot = 'source:' + step.sourceId;
    } else if (step.type === 'flag') {
      view.flags.push(clone(step.flag));
      scene.hot = 'flag:' + step.flag.id;
    } else if (step.type === 'human') {
      view.traces.push(clone(step.trace));
      scene.hot = 'trace:' + step.trace.id;
    } else if (step.type === 'write') {
      view.cards.push(clone(step.card));
      scene.hot = 'card:' + step.card.id;
    } else if (step.type === 'task-end') {
      scene.artifact = artifact(step.taskId, step.used);
      scene.task = step.taskId;
    } else if (step.type === 'read-flag') {
      scene.hot = 'flag:' + step.id;
    } else if (step.type === 'read-trace') {
      scene.hot = 'trace:' + step.id;
    } else if (step.type === 'read-source') {
      scene.hot = 'source:' + step.id;
    } else if (step.type === 'diff') {
      const card = view.cards.find(function (item) { return item.id === step.cardId; });
      if (card) {
        card.body = step.after;
        card.origin = 'curator';
        card.day = view.day;
        card.kind = 'curator';
      }
      scene.diffs[step.cardId] = step.words;
      scene.hot = 'card:' + step.cardId;
    } else if (step.type === 'close-flag') {
      const flag = view.flags.find(function (item) { return item.id === step.id; });
      if (flag) flag.open = false;
      scene.hot = 'flag:' + step.id;
    }
    const line = sentence(step);
    if (line) scene.lines.push(line);
  }

  function play(result, night) {
    window.clearTimeout(timer);
    playing = true;
    skipRest = false;
    scene.night = night;
    scene.lines = [];
    scene.consults = [];
    scene.task = null;
    scene.artifact = '';
    scene.hot = '';
    if (!night) scene.diffs = Object.create(null);
    view = clone(state);
    const steps = result.steps;
    let index = 0;

    function finish() {
      window.clearTimeout(timer);
      state = result.state;
      view = clone(state);
      scene.night = false;
      scene.task = null;
      scene.hot = '';
      playing = false;
      if (night && result.summary.diffs) {
        statusEl.textContent = 'The curator rewrote ' + result.summary.diffs + ' card' + (result.summary.diffs === 1 ? '' : 's') + ' and closed the flags. ' + (state.phase === 'week-done' ? 'Seven days are in.' : 'Day ' + state.day + ' is ready. Run the day again.');
      } else if (night) {
        statusEl.textContent = state.mode === 'self'
          ? 'The night passed. The extra cards are still on the shelf. ' + (state.phase === 'week-done' ? 'Seven days are in.' : 'Day ' + state.day + ' is ready.')
          : 'Nothing new tonight. ' + (state.phase === 'week-done' ? 'Seven days are in.' : 'Day ' + state.day + ' is ready.');
      } else {
        statusEl.textContent = 'Day ' + result.summary.day + ' finished. ' + result.summary.finished + ' of ' + result.summary.tasks + ' tasks matched the current fact. ' + result.summary.flags + ' new flag' + (result.summary.flags === 1 ? '' : 's') + '.';
      }
      render();
    }

    function frame() {
      if (skipRest) {
        while (index < steps.length) absorb(steps[index++]);
        finish();
        return;
      }
      if (index >= steps.length) {
        finish();
        return;
      }
      absorb(steps[index++]);
      render();
      traceEl.scrollTop = traceEl.scrollHeight;
      timer = window.setTimeout(frame, delay);
    }

    if (reduce) {
      steps.forEach(absorb);
      finish();
      return;
    }
    render();
    timer = window.setTimeout(frame, delay);
  }

  function h(tag, props, kids) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === 'text') node.textContent = props[key];
        else if (key === 'class') node.className = props[key];
        else node.setAttribute(key, props[key]);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid == null) return;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }

  function renderChartFixed() {
    blurbEl.textContent = factory.chartBlurb(curatorSeries, selfSeries) + ' The lines are this same script, run for all seven days. The mark is the day on the floor.';
    chartEl.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'chart-grid';
    grid.append(svgPanel('Tasks that matched', 'success', 1, function (value) {
      return Math.round(value * 100) + '%';
    }, [0, 0.5, 1]));
    const maxCon = Math.max(1, selfSeries[selfSeries.length - 1].contradictions);
    grid.append(svgPanel('Contradictions', 'contradictions', maxCon, function (value) {
      return String(value);
    }, [0, maxCon]));
    const legend = h('div', { class: 'legend' }, [
      h('span', {}, [h('i', { class: 'curator' }), 'Curator owns it']),
      h('span', {}, [h('i', { class: 'self' }), 'Agents edit it']),
    ]);
    chartEl.append(grid, legend);
    renderTable();
  }

  function svgPanel(title, key, max, format, ticks) {
    const w = 320;
    const hgt = 168;
    const pad = { l: 46, r: 12, t: 22, b: 26 };
    const innerW = w - pad.l - pad.r;
    const innerH = hgt - pad.t - pad.b;
    function x(i) { return pad.l + (i / 6) * innerW; }
    function y(v) { return pad.t + (1 - v / max) * innerH; }
    const markDay = state.phase === 'week-done' ? 7 : state.day;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt);
    svg.setAttribute('role', 'img');
    const titleEl = document.createElementNS(ns, 'title');
    titleEl.textContent = title;
    svg.append(titleEl);
    text(svg, pad.l, 14, title, 12, 'start');
    ticks.forEach(function (tick) {
      const yy = y(tick);
      const rule = document.createElementNS(ns, 'line');
      rule.setAttribute('x1', pad.l);
      rule.setAttribute('x2', w - pad.r);
      rule.setAttribute('y1', yy);
      rule.setAttribute('y2', yy);
      rule.setAttribute('stroke', '#e6dccb');
      svg.append(rule);
      text(svg, 6, yy + 3, format(tick), 10, 'start');
    });
    const guide = document.createElementNS(ns, 'line');
    guide.setAttribute('x1', x(markDay - 1));
    guide.setAttribute('x2', x(markDay - 1));
    guide.setAttribute('y1', pad.t);
    guide.setAttribute('y2', hgt - pad.b);
    guide.setAttribute('stroke', '#1c1917');
    guide.setAttribute('stroke-dasharray', '3 3');
    svg.append(guide);
    stroke(svg, curatorSeries, '#1f6b52', key, x, y, mode === 'curator', markDay);
    stroke(svg, selfSeries, '#9a4030', key, x, y, mode === 'self', markDay);
    for (let i = 0; i < 7; i++) text(svg, x(i), hgt - 8, String(i + 1), 10, 'middle');
    const wrap = document.createElement('div');
    wrap.append(svg);
    return wrap;
  }

  function text(svg, x, y, value, size, anchor) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', x);
    node.setAttribute('y', y);
    node.setAttribute('fill', '#5e564c');
    node.setAttribute('font-size', size);
    node.setAttribute('text-anchor', anchor);
    node.textContent = value;
    svg.append(node);
  }

  function stroke(svg, series, color, key, x, y, marked, markDay) {
    const ns = 'http://www.w3.org/2000/svg';
    const d = series.map(function (point, i) {
      return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(point[key]).toFixed(1);
    }).join(' ');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    svg.append(path);
    if (!marked) return;
    const i = markDay - 1;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x(i).toFixed(1));
    dot.setAttribute('cy', y(series[i][key]).toFixed(1));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', color);
    svg.append(dot);
  }

  function renderTable() {
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = 'Fictional week. A task matches when its result follows the fact as it stands that day, including a workaround or a human correction. A contradiction is an extra card that disagrees with another card on the same fact.';
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Day', 'Curator matched', 'Curator flags', 'Curator contradictions', 'Agents matched', 'Agents flags', 'Agents contradictions'].forEach(function (label) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      hr.append(th);
    });
    head.append(hr);
    const body = document.createElement('tbody');
    curatorSeries.forEach(function (point, i) {
      const self = selfSeries[i];
      const tr = document.createElement('tr');
      [String(point.day), point.finished + '/3', String(point.flags), String(point.contradictions), self.finished + '/3', String(self.flags), String(self.contradictions)].forEach(function (value) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(caption, head, body);
    tableEl.replaceChildren(table);
  }

  function renderDays() {
    const labelDay = state.phase === 'week-done' ? 7 : view.day;
    if (scene.night) dayLabel.textContent = 'Day ' + labelDay + ' · night';
    else if (playing) dayLabel.textContent = 'Day ' + labelDay + ' · running';
    else if (state.phase === 'week-done') dayLabel.textContent = 'Seven days are in';
    else if (state.phase === 'day-done') dayLabel.textContent = 'Day ' + state.day + ' · the day has run';
    else dayLabel.textContent = 'Day ' + state.day + ' · morning';
    daysEl.replaceChildren();
    for (let day = 1; day <= 7; day++) {
      const li = document.createElement('li');
      li.textContent = String(day);
      const done = state.phase === 'week-done' || day < state.day;
      if (done) li.classList.add('is-done');
      if (day === (state.phase === 'week-done' ? 7 : state.day)) li.setAttribute('aria-current', 'step');
      daysEl.append(li);
    }
  }

  function renderDesks() {
    desksEl.replaceChildren();
    factory.TASKS.forEach(function (task) {
      const desk = h('div', { class: 'desk' + (scene.task === task.id ? ' is-on' : '') });
      desk.append(h('span', { class: 'lamp' }));
      desk.append(document.createTextNode(task.agent + ' '));
      desk.append(h('small', { text: task.name }));
      desksEl.append(desk);
    });
  }

  function renderStore() {
    storeEl.replaceChildren();
    factory.SHELVES.forEach(function (shelf) {
      const bay = h('section', { class: 'bay' });
      const heading = h('h3', { text: shelf.name + ' — ' + shelf.line });
      heading.dataset.shelf = shelf.id;
      const cards = h('div', { class: 'cards' });
      view.cards.filter(function (card) {
        return card.shelf === shelf.id && !card.retired;
      }).sort(function (a, b) {
        return a.seq - b.seq;
      }).forEach(function (card) {
        const node = h('article', {
          class: 'card' + (conflicts(card.fact) ? ' is-conflict' : '') + (scene.hot === 'card:' + card.id ? ' is-hot' : ''),
        });
        node.dataset.shelf = card.shelf;
        node.dataset.card = card.id;
        const title = h('p', { class: 'title', text: card.title });
        const origin = h('p', { class: 'origin', text: originLine(card) });
        const body = h('p', { class: 'body' });
        const words = scene.diffs[card.id];
        if (words) {
          words.forEach(function (word) {
            const span = document.createElement('span');
            span.className = word.type === 'same' ? '' : word.type;
            span.textContent = word.text + ' ';
            body.append(span);
          });
        } else {
          body.textContent = card.body;
        }
        node.append(title, origin, body);
        if (conflicts(card.fact)) node.append(h('p', { class: 'badge', text: 'Disagrees' }));
        cards.append(node);
      });
      bay.append(heading, cards);
      storeEl.append(bay);
    });
  }

  function renderContext() {
    contextEl.replaceChildren();
    contextEl.append(h('h3', { text: 'Context and knowledge' }));
    const task = factory.TASKS.find(function (item) { return item.id === scene.task; });
    if (!task) {
      contextEl.append(h('p', { class: 'empty', text: 'Run the day. Each task shows the rows in front of the agent, then the cards it opened.' }));
      return;
    }
    contextEl.append(h('p', { class: 'empty', text: task.context.caption }));
    if (task.context.kind === 'table') {
      const table = document.createElement('table');
      const head = document.createElement('tr');
      task.context.columns.forEach(function (col) {
        const th = document.createElement('th');
        th.textContent = col;
        head.append(th);
      });
      table.append(head);
      task.context.rows.forEach(function (row) {
        const tr = document.createElement('tr');
        row.forEach(function (cell) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.append(td);
        });
        table.append(tr);
      });
      contextEl.append(table);
    } else {
      contextEl.append(h('p', { class: 'draft', text: task.context.text }));
    }
    if (scene.artifact) contextEl.append(h('p', { class: 'query', text: scene.artifact }));
    const list = h('ul', { class: 'used' });
    scene.consults.forEach(function (step) {
      const li = document.createElement('li');
      li.append(document.createTextNode(step.title + ' '));
      li.append(h('span', { class: step.matched ? 'ok' : 'bad', text: step.matched ? 'matched' : 'stale' }));
      list.append(li);
    });
    if (scene.consults.length) contextEl.append(h('p', { class: 'empty', text: 'Knowledge opened' }), list);
  }

  function renderInbox() {
    inboxEl.replaceChildren();
    const open = view.flags.filter(function (flag) { return flag.open; });
    inboxEl.append(h('h3', { text: 'Flag inbox · ' + open.length }));
    if (!open.length) {
      inboxEl.append(h('p', { class: 'empty', text: 'No open flags.' }));
      return;
    }
    open.forEach(function (flag) {
      const slip = h('div', { class: 'slip' + (scene.hot === 'flag:' + flag.id ? ' is-hot' : '') });
      slip.dataset.flag = flag.id;
      slip.append(h('strong', { text: flag.title }));
      slip.append(h('div', { text: flag.note }));
      inboxEl.append(slip);
    });
  }

  function renderTraces() {
    tracesEl.replaceChildren();
    tracesEl.append(h('h3', { text: 'Human corrections' }));
    if (!view.traces.length) {
      tracesEl.append(h('p', { class: 'empty', text: 'A person can correct the draft. That lands in the trace, not in the store.' }));
      return;
    }
    view.traces.forEach(function (trace) {
      const node = h('div', { class: 'trace-item' + (scene.hot === 'trace:' + trace.id ? ' is-hot' : '') });
      node.append(h('strong', { text: trace.speaker + ', day ' + trace.day }));
      node.append(h('div', { text: trace.text }));
      tracesEl.append(node);
    });
  }

  function renderSources() {
    sourcesEl.replaceChildren();
    sourcesEl.append(h('h3', { text: 'Raw notes' }));
    const day = view.day;
    const visible = factory.SOURCES.filter(function (source) { return source.day <= day; });
    if (!visible.length) {
      sourcesEl.append(h('p', { class: 'empty', text: 'Notes show up the morning they are written.' }));
      return;
    }
    visible.forEach(function (source) {
      const node = h('div', { class: 'source' + (scene.hot === 'source:' + source.id ? ' is-hot' : '') });
      node.append(h('strong', { text: source.kind + ' · day ' + source.day }));
      node.append(h('div', { text: source.text }));
      sourcesEl.append(node);
    });
  }

  function renderTrace() {
    traceEl.replaceChildren();
    if (!scene.lines.length) {
      traceEl.append(h('p', { text: playing ? 'Starting.' : 'Morning of day 1. Six cards, three shelves. Run the day.' }));
      return;
    }
    scene.lines.forEach(function (line) {
      traceEl.append(h('p', { text: line }));
    });
  }

  function renderControls() {
    const morning = state.phase === 'morning' && !playing;
    const evening = state.phase === 'day-done' && !playing;
    runDayBtn.disabled = !morning;
    runNightBtn.disabled = !evening;
    resetBtn.disabled = playing;
    modeCurator.disabled = playing;
    modeSelf.disabled = playing;
    skipBtn.hidden = !playing;
    runNightBtn.textContent = mode === 'curator' ? 'Run curator (night)' : 'Let the night pass';
    modeCurator.setAttribute('aria-pressed', mode === 'curator' ? 'true' : 'false');
    modeSelf.setAttribute('aria-pressed', mode === 'self' ? 'true' : 'false');
    modeLine.textContent = mode === 'curator'
      ? 'Workers flag what is wrong. They do not edit the store. The curator does, at night.'
      : 'Workers add a new card when something is wrong, and the old card stays. The night run changes nothing.';
    floor.classList.toggle('is-night', scene.night);
    floor.setAttribute('aria-busy', playing ? 'true' : 'false');
  }

  function render() {
    renderChartFixed();
    renderDays();
    renderDesks();
    renderStore();
    renderContext();
    renderInbox();
    renderTraces();
    renderSources();
    renderTrace();
    renderControls();
  }

  function setMode(next) {
    if (playing || next === mode) return;
    mode = next;
    state = factory.createState(mode);
    view = clone(state);
    scene = freshScene();
    statusEl.textContent = mode === 'curator'
      ? 'Curator week, morning of day 1.'
      : 'Agents edit the store themselves. Morning of day 1.';
    render();
  }

  runDayBtn.addEventListener('click', function () {
    if (playing || state.phase !== 'morning') return;
    play(factory.runDay(state), false);
  });

  runNightBtn.addEventListener('click', function () {
    if (playing || state.phase !== 'day-done') return;
    play(factory.runNight(state), true);
  });

  skipBtn.addEventListener('click', function () { skipRest = true; });

  resetBtn.addEventListener('click', function () {
    if (playing) return;
    state = factory.createState(mode);
    view = clone(state);
    scene = freshScene();
    statusEl.textContent = 'Back to morning of day 1.';
    render();
  });

  modeCurator.addEventListener('click', function () { setMode('curator'); });
  modeSelf.addEventListener('click', function () { setMode('self'); });

  statusEl.textContent = 'Morning of day 1. Run the day, then the night.';
  render();
})();
