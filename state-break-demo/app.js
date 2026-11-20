(function () {
  const api = window.StateBreak;
  const switcherEl = document.querySelector('#switcher');
  const liveEl = document.querySelector('#live');
  const liveStatus = document.querySelector('#live-status');
  const gridEl = document.querySelector('#state-grid');
  const gridToggle = document.querySelector('#grid-toggle');
  const statesPanel = document.querySelector('#states-panel');
  const breakPanel = document.querySelector('#break-panel');
  const casesEl = document.querySelector('#cases');
  const summaryEl = document.querySelector('#summary');
  const widthInput = document.querySelector('#width');
  const widthOut = document.querySelector('#width-out');
  const jsonEl = document.querySelector('#mock');
  const jsonError = document.querySelector('#json-error');
  const fieldsConnection = document.querySelector('#fields-connection');
  const fieldsIssue = document.querySelector('#fields-issue');
  const projectField = document.querySelector('#field-project');
  const environmentField = document.querySelector('#field-environment');
  const replaysField = document.querySelector('#field-replays');
  const titleField = document.querySelector('#field-title');
  const bodyField = document.querySelector('#field-body');
  const priorityField = document.querySelector('#field-priority');
  const countField = document.querySelector('#field-count');

  const params = new URLSearchParams(window.location.search);
  let component = params.get('component') === 'issue' ? 'issue' : 'connection';
  let mode = params.get('mode') === 'break' ? 'break' : 'states';
  const selected = { connection: 'connected', issue: 'high' };
  const mocks = {
    connection: api.defaultMock('connection'),
    issue: api.defaultMock('issue'),
  };
  let gridOn = params.get('grid') === '1';
  let width = 320;
  let zoom = params.get('zoom') === '2' ? 2 : 1;
  let measureGen = 0;

  document.querySelectorAll('input[name="component"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      component = input.value;
      render();
    });
  });
  document.querySelectorAll('input[name="mode"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      mode = input.value;
      render();
    });
  });
  document.querySelectorAll('input[name="zoom"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      zoom = Number(input.value) || 1;
      renderBreak();
    });
  });
  gridToggle.addEventListener('click', function () {
    gridOn = !gridOn;
    renderGrid();
  });
  widthInput.addEventListener('input', function () {
    width = Number(widthInput.value);
    widthOut.textContent = width + 'px';
    renderBreak();
  });
  jsonEl.addEventListener('input', onJson);
  projectField.addEventListener('input', function () { setField('connection', 'project', projectField.value); });
  environmentField.addEventListener('input', function () { setField('connection', 'environment', environmentField.value); });
  replaysField.addEventListener('input', function () { setField('connection', 'replays', replaysField.value); });
  titleField.addEventListener('input', function () { setField('issue', 'title', titleField.value); });
  bodyField.addEventListener('input', function () { setField('issue', 'body', bodyField.value); });
  priorityField.addEventListener('input', function () { setField('issue', 'priority', priorityField.value); });
  countField.addEventListener('input', function () { setField('issue', 'count', coerceCount(countField.value)); });
  window.addEventListener('resize', function () { if (mode === 'break') renderBreak(); });

  document.querySelector('input[name="component"][value="' + component + '"]').checked = true;
  document.querySelector('input[name="mode"][value="' + mode + '"]').checked = true;
  document.querySelector('input[name="zoom"][value="' + zoom + '"]').checked = true;
  render();

  function render() {
    statesPanel.hidden = mode !== 'states';
    breakPanel.hidden = mode !== 'break';
    fieldsConnection.hidden = component !== 'connection';
    fieldsIssue.hidden = component !== 'issue';
    fillFields();
    if (document.activeElement !== jsonEl) jsonEl.value = JSON.stringify(mocks[component], null, 2);
    renderSwitcher();
    renderLive();
    renderGrid();
    if (mode === 'break') renderBreak();
  }

  function renderSwitcher() {
    switcherEl.replaceChildren();
    api.groups(component).forEach(function (group) {
      const set = el('fieldset', { class: 'group' });
      const legend = el('legend', {}, group.id);
      set.appendChild(legend);
      const choices = el('div', { class: 'choices', role: 'radiogroup', 'aria-label': group.id });
      group.states.forEach(function (state) {
        const input = el('input', { type: 'radio', name: component + '-state', value: state.id });
        if (state.id === selected[component]) input.checked = true;
        input.addEventListener('change', function () {
          if (!input.checked) return;
          selected[component] = state.id;
          renderLive();
          renderGrid();
        });
        choices.appendChild(el('label', { class: 'choice' }, input, el('span', {}, state.label)));
      });
      set.appendChild(choices);
      switcherEl.appendChild(set);
    });
  }

  function renderLive() {
    const state = api.stateById(component, selected[component]);
    const card = cardForState(state, 'live');
    liveEl.replaceChildren(card);
    liveStatus.textContent = 'Showing ' + state.group + ', ' + state.label + '.';
  }

  function renderGrid() {
    gridToggle.setAttribute('aria-pressed', gridOn ? 'true' : 'false');
    gridToggle.textContent = gridOn ? 'Hide the grid' : 'Show every state';
    gridEl.hidden = !gridOn;
    gridEl.replaceChildren();
    if (!gridOn) return;
    api.groups(component).forEach(function (group) {
      group.states.forEach(function (state) {
        const item = el('article', { class: 'grid-item' });
        if (state.id === selected[component]) item.classList.add('is-selected');
        item.append(el('p', { class: 'grid-label' }, group.id + ' · ' + state.label), cardForState(state, 'grid-' + state.id));
        gridEl.appendChild(item);
      });
    });
  }

  function cardForState(state, uid) {
    if (component === 'connection') return connectionCard(api.presentConnection(state, mocks.connection));
    return issueCard(api.presentIssue(state.record), uid);
  }

  function renderBreak() {
    const gen = ++measureGen;
    const cases = api.casesFor(component, mocks[component]);
    const global = { width: width, zoom: zoom };
    casesEl.replaceChildren();
    const cards = cases.map(function (item) {
      const frame = api.frameFor(item, global);
      const presented = component === 'issue'
        ? api.presentIssue(item.record)
        : api.presentConnection(api.stateById('connection', item.stateId), item.mock);
      const stage = el('div', { class: 'stage' });
      stage.style.width = frame.width + 'px';
      stage.style.setProperty('--zoom', String(frame.zoom));
      stage.appendChild(component === 'issue' ? issueCard(presented, item.id) : connectionCard(presented));
      const badge = el('p', { class: 'badge', 'data-status': 'pass' }, 'Checking');
      const list = el('ul', { class: 'findings' });
      const article = el('article', { class: 'case' },
        el('h3', {}, item.label),
        el('p', { class: 'case-meta' }, frame.width + 'px · ' + Math.round(frame.zoom * 100) + '% text'),
        stage,
        badge,
        list
      );
      casesEl.appendChild(article);
      return { item: item, presented: presented, stage: stage, badge: badge, list: list };
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (gen !== measureGen) return;
        const results = cards.map(function (card) {
          const result = api.judgeCase({
            id: card.item.id,
            probes: measure(card.stage),
            presented: card.presented,
            tolerance: 1,
          });
          card.badge.textContent = result.status === 'flag' ? 'Flag' : 'Pass';
          card.badge.dataset.status = result.status;
          const labels = [];
          result.issues.forEach(function (issue) {
            const label = api.issueLabel(issue);
            if (labels.indexOf(label) === -1) labels.push(label);
          });
          card.list.replaceChildren();
          if (!labels.length) card.list.appendChild(el('li', { class: 'quiet' }, 'No overflow, clipped text, or missing fallback.'));
          labels.forEach(function (label) { card.list.appendChild(el('li', {}, label)); });
          return result;
        });
        summaryEl.textContent = api.summaryText(api.summarize(results));
      });
    });
  }

  function measure(root) {
    return Array.prototype.map.call(root.querySelectorAll('[data-probe]'), function (node) {
      return {
        name: node.dataset.probe,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
    });
  }

  function connectionCard(presented) {
    const card = el('article', {
      class: 'card connection tone-' + presented.tone,
      dir: presented.dir,
      lang: presented.dir === 'rtl' ? 'ar' : 'en',
    });
    card.appendChild(el('p', { class: 'eyebrow' }, 'Integration'));
    if (presented.skeleton) {
      card.setAttribute('aria-busy', 'true');
      card.append(
        el('p', { class: 'sr-only' }, 'Loading connection'),
        el('div', { class: 'bone title' }),
        el('div', { class: 'bone line' }),
        el('div', { class: 'bone short' })
      );
      return card;
    }
    const status = el('h3', { class: 'status', 'data-probe': 'title' });
    status.append(el('span', { class: 'dot', 'aria-hidden': 'true' }), document.createTextNode(presented.title));
    card.append(status, el('p', { class: 'detail' }, presented.detail));
    card.append(
      fieldRow('Project', presented.project, 'project'),
      fieldRow('Environment', presented.environment, 'environment'),
      fieldRow('Session replays', presented.replays, 'replays')
    );
    return card;
  }

  function fieldRow(label, field, probe) {
    const value = el('span', { class: 'value', 'data-probe': probe, title: field.text }, field.text);
    if (field.fallback) value.classList.add('is-fallback');
    return el('p', { class: 'kv' }, el('span', { class: 'key', 'data-probe': probe + '-label' }, label), value);
  }

  function issueCard(presented, uid) {
    const card = el('article', {
      class: 'card issue' + (presented.resolved ? ' is-resolved' : ''),
      dir: presented.dir,
      lang: presented.dir === 'rtl' ? 'ar' : 'en',
    });
    if (presented.loading) {
      card.setAttribute('aria-busy', 'true');
      card.append(
        el('p', { class: 'loading', 'data-probe': 'title' }, presented.title.text),
        el('div', { class: 'bone line' }),
        el('div', { class: 'bone short' })
      );
      return card;
    }
    const id = el('span', { class: 'pid', 'data-probe': 'id' }, presented.id.text);
    const mark = el('span', { class: 'mark', 'data-probe': 'mark' }, presented.mark.text);
    if (presented.id.fallback) id.classList.add('is-fallback');
    if (presented.mark.fallback) mark.classList.add('is-fallback');
    const title = el('h3', { class: 'title', 'data-probe': 'title' }, presented.title.text);
    if (presented.title.fallback) title.classList.add('is-fallback');
    const body = el('p', { class: 'body' });
    if (presented.body.fallback) {
      body.classList.add('is-fallback');
      body.textContent = presented.body.text;
    } else {
      appendText(body, presented.body.text);
    }
    const priority = el('span', { class: 'priority p-' + slug(presented.priority.text) }, presented.priority.text);
    if (presented.priority.fallback) priority.classList.add('is-fallback');
    const count = el('span', { class: 'count', 'data-probe': 'count' }, presented.count.text);
    if (presented.count.fallback) count.classList.add('is-fallback');
    const meta = el('div', { class: 'meta', 'data-probe': 'meta' }, priority, count);
    const reasonId = 'reason-' + uid;
    const button = el('button', { type: 'button', class: 'reason', 'aria-expanded': 'false', 'aria-controls': reasonId }, 'Reasoning');
    const panel = el('p', { id: reasonId, class: 'reason-panel', hidden: true }, 'The discount clears the billing address, and the payment step never finishes.');
    button.addEventListener('click', function () {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', open ? 'false' : 'true');
      panel.hidden = open;
    });
    meta.appendChild(button);
    if (presented.resolved) card.appendChild(el('p', { class: 'eyebrow' }, 'Resolved'));
    card.append(el('div', { class: 'id-row' }, id, mark), title, body, meta, panel);
    return card;
  }

  function appendText(parent, text) {
    const str = String(text || '');
    const re = /(\S{28,})/g;
    let last = 0;
    let match;
    while ((match = re.exec(str))) {
      if (match.index > last) parent.appendChild(document.createTextNode(str.slice(last, match.index)));
      parent.appendChild(el('span', { class: 'unbroken', 'data-probe': 'token' }, match[1]));
      last = match.index + match[1].length;
    }
    if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
  }

  function onJson() {
    const parsed = api.parseMock(jsonEl.value);
    if (!parsed.ok) {
      jsonError.textContent = parsed.error;
      return;
    }
    jsonError.textContent = '';
    mocks[component] = parsed.value;
    fillFields();
    if (mode === 'break') renderBreak();
    if (component === 'connection') {
      renderLive();
      renderGrid();
    }
  }

  function setField(which, key, value) {
    if (which !== component) return;
    mocks[which][key] = value;
    jsonError.textContent = '';
    if (document.activeElement !== jsonEl) jsonEl.value = JSON.stringify(mocks[which], null, 2);
    if (mode === 'break') renderBreak();
    if (which === 'connection') {
      renderLive();
      renderGrid();
    }
  }

  function fillFields() {
    const mock = mocks[component] || {};
    if (component === 'connection') {
      projectField.value = mock.project == null ? '' : mock.project;
      environmentField.value = mock.environment == null ? '' : mock.environment;
      replaysField.value = mock.replays == null ? '' : mock.replays;
    } else {
      titleField.value = mock.title == null ? '' : mock.title;
      bodyField.value = mock.body == null ? '' : mock.body;
      priorityField.value = mock.priority == null ? '' : mock.priority;
      countField.value = mock.count == null ? '' : mock.count;
    }
  }

  function coerceCount(text) {
    const trimmed = String(text).trim();
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }

  function slug(text) {
    return String(text || '').toLowerCase().replace(/[^a-z]+/g, '') || 'unspecified';
  }

  function el(tag, props) {
    const node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      const value = props[key];
      if (value == null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'hidden') node.hidden = true;
      else node.setAttribute(key, value === true ? '' : value);
    });
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid == null || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }
})();
