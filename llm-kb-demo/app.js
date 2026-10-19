(function () {
  const wiki = window.StockWiki;
  const state = {
    vault: wiki.openingVault(),
    selected: 'wiki/index',
    answer: null,
    touched: {},
    report: 'Four notes are compiled. Storm at Saltpier is still in raw, unread by the wiki.',
  };

  const report = document.getElementById('report');
  const graph = document.getElementById('graph');
  const jump = document.getElementById('page-jump');
  const rawList = document.getElementById('raw-list');
  const pageEl = document.getElementById('page');
  const pathEl = document.getElementById('wiki-path');
  const questions = document.getElementById('questions');
  const answerEl = document.getElementById('answer');
  const formError = document.getElementById('form-error');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function colorOf(node) {
    if (node.ticker === 'LARK.MX') return '#0f6e6a';
    if (node.ticker === 'BRINE.HX') return '#1d4e89';
    if (node.ticker === 'VELL.WY') return '#8a5a12';
    if (node.kind === 'concept') return '#6b6258';
    if (node.kind === 'output') return '#6d3a78';
    return '#241c14';
  }

  function shortTitle(node) {
    if (node.kind === 'hub') return node.ticker;
    if (node.kind === 'master') return 'index';
    if (node.kind === 'log') return 'log';
    if (node.title.length > 18) return node.title.slice(0, 16) + '…';
    return node.title;
  }

  function select(id) {
    if (!state.vault.pages[id]) return;
    state.selected = id;
    paint();
  }

  function applyIngest(result) {
    if (!result.ok) {
      formError.textContent = result.error;
      return;
    }
    formError.textContent = '';
    state.vault = result.vault;
    state.selected = result.articleId;
    state.answer = null;
    state.touched = {};
    result.touched.forEach(function (path) { state.touched[path] = true; });
    const note = result.vault.raw[result.vault.raw.length - 1];
    state.report = 'Compiled ' + note.title + '. Touched ' + result.touched.length + ' pages. Left ' + result.unchanged.length + ' pages as they were.';
    paint();
  }

  function paint() {
    report.textContent = state.report;
    paintGraph();
    paintJump();
    paintRaw();
    paintPage();
    paintAnswer();
  }

  function paintGraph() {
    const map = wiki.graph(state.vault);
    const used = {};
    if (state.answer) state.answer.used.forEach(function (item) { used[item.id] = true; });
    clear(graph);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + map.width + ' ' + map.height);
    svg.setAttribute('width', map.width);
    svg.setAttribute('height', map.height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Linked wiki pages');
    const byId = {};
    map.nodes.forEach(function (node) { byId[node.id] = node; });
    map.edges.forEach(function (edge) {
      const from = byId[edge.from];
      const to = byId[edge.to];
      if (!from || !to) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'link');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);
      svg.appendChild(line);
    });
    map.nodes.forEach(function (node) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const classes = ['dot'];
      if (node.id === state.selected) classes.push('selected');
      if (state.touched[node.path]) classes.push('touched');
      if (used[node.id]) classes.push('used');
      dot.setAttribute('class', classes.join(' '));
      dot.setAttribute('cx', node.x);
      dot.setAttribute('cy', node.y);
      dot.setAttribute('r', node.kind === 'hub' || node.kind === 'master' ? 8 : 5);
      dot.setAttribute('fill', colorOf(node));
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('role', 'button');
      const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      tip.textContent = node.path;
      dot.appendChild(tip);
      dot.setAttribute('aria-label', node.path);
      dot.addEventListener('click', function () { select(node.id); });
      dot.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(node.id);
        }
      });
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', node.x + 12);
      label.setAttribute('y', node.y + 4);
      label.textContent = shortTitle(node);
      svg.appendChild(dot);
      svg.appendChild(label);
    });
    graph.appendChild(svg);
  }

  function paintJump() {
    const current = jump.value;
    clear(jump);
    state.vault.order.forEach(function (id) {
      const page = state.vault.pages[id];
      const option = el('option', '', page.path);
      option.value = id;
      if (id === state.selected) option.selected = true;
      jump.appendChild(option);
    });
    if (current && state.vault.pages[current] && current !== state.selected) jump.value = state.selected;
  }

  function paintRaw() {
    clear(rawList);
    const waiting = wiki.waitingNote();
    const ingested = {};
    state.vault.raw.forEach(function (note) { ingested[note.id] = true; });
    const notes = state.vault.raw.slice();
    if (!ingested[waiting.id]) notes.push(waiting);
    notes.forEach(function (note) {
      const card = el('article', 'note');
      const head = el('header');
      head.appendChild(el('h3', '', note.title));
      const badge = el('span', ingested[note.id] ? 'badge' : 'badge wait', ingested[note.id] ? 'Compiled' : 'Waiting');
      head.appendChild(badge);
      card.appendChild(head);
      card.appendChild(el('p', 'meta', wiki.rawPath(note) + ' · ' + note.date + ' · ' + wiki.SOURCE_LABEL[note.source]));
      const parsed = wiki.splitNote(note.text);
      card.appendChild(el('p', '', parsed.prose));
      if (!ingested[note.id]) {
        const button = el('button', '', 'Compile the waiting note');
        button.type = 'button';
        button.addEventListener('click', function () { applyIngest(wiki.ingest(state.vault, waiting)); });
        card.appendChild(button);
      }
      rawList.appendChild(card);
    });
  }

  function linkButton(id) {
    const target = state.vault.pages[id];
    if (!target) return null;
    const button = el('button', 'text-button', target.title);
    button.type = 'button';
    button.addEventListener('click', function () { select(id); });
    return button;
  }

  function paintPage() {
    const page = state.vault.pages[state.selected] || state.vault.pages['wiki/index'];
    state.selected = page.id;
    pathEl.textContent = page.path + ' · rev ' + page.revision + ' · ' + page.type;
    clear(pageEl);
    pageEl.appendChild(el('h3', '', page.title));
    if (page.currency && page.kind !== 'hub' && page.kind !== 'master') {
      pageEl.appendChild(el('p', 'meta', 'Reporting currency: ' + page.currency));
    }

    if (page.kind === 'master') {
      page.topics.forEach(function (topic) {
        const block = el('article', 'block');
        block.appendChild(el('h3', '', topic.ticker + ' · ' + topic.title));
        block.appendChild(el('p', '', topic.thesis));
        block.appendChild(el('p', 'meta', 'Status: ' + topic.status));
        block.appendChild(el('p', 'meta', 'Biggest risk: ' + topic.risk));
        const open = el('button', 'text-button', 'Open hub');
        open.type = 'button';
        open.addEventListener('click', function () { select(wiki.hubId(topic.ticker)); });
        block.appendChild(open);
        pageEl.appendChild(block);
      });
      const links = el('div', 'block');
      links.appendChild(el('h3', '', 'Cross-topic connections'));
      if (!page.connections.length) links.appendChild(el('p', '', 'None yet.'));
      page.connections.forEach(function (link) {
        links.appendChild(el('p', '', link.from + ' → ' + link.to + ' — ' + link.why));
      });
      pageEl.appendChild(links);
    } else if (page.kind === 'log') {
      state.vault.log.forEach(function (entry) {
        const block = el('article', 'block');
        block.appendChild(el('h3', '', entry.date + ' · ' + entry.action));
        block.appendChild(el('p', '', entry.title));
        block.appendChild(el('p', 'meta', entry.files.join(', ')));
        pageEl.appendChild(block);
      });
    } else if (page.kind === 'hub') {
      const company = wiki.COMPANIES[page.ticker];
      pageEl.appendChild(el('p', 'meta', company.place + ' · ' + company.exchange));
      pageEl.appendChild(el('p', 'prose', page.thesis));
      paintNumbers(page);
      paintConflicts(page);
      if (page.crossChecks.length) {
        const block = el('div', 'block');
        block.appendChild(el('h3', '', 'Cross-checks'));
        page.crossChecks.forEach(function (item) { block.appendChild(el('p', '', item.text)); });
        pageEl.appendChild(block);
      }
      const articles = el('div', 'block');
      articles.appendChild(el('h3', '', 'Articles'));
      page.articles.forEach(function (article) {
        const row = el('div', 'row');
        const button = linkButton(article.pageId);
        row.appendChild(button);
        row.appendChild(el('span', 'meta', article.date));
        articles.appendChild(row);
        articles.appendChild(el('p', 'meta', article.summary));
      });
      pageEl.appendChild(articles);
    } else if (page.kind === 'article') {
      pageEl.appendChild(el('p', 'prose', page.prose));
      paintNumbers(page);
    } else if (page.kind === 'concept') {
      page.entries.forEach(function (entry) {
        pageEl.appendChild(el('p', '', entry.date + ' · ' + entry.ticker + ' · ' + entry.value + ' (' + wiki.SOURCE_LABEL[entry.source] + ')'));
      });
    } else if (page.kind === 'output') {
      pageEl.appendChild(el('p', 'prose', page.answer));
    }

    const related = el('div', 'block');
    related.appendChild(el('h3', '', 'Links'));
    if (!page.links.length) related.appendChild(el('p', 'meta', 'No links.'));
    page.links.forEach(function (id) {
      const button = linkButton(id);
      if (button) related.appendChild(button);
    });
    pageEl.appendChild(related);

    const back = el('div', 'block');
    back.appendChild(el('h3', '', 'Backlinks'));
    if (!page.backlinks.length) back.appendChild(el('p', 'meta', 'Nothing points here yet.'));
    page.backlinks.forEach(function (id) {
      const button = linkButton(id);
      if (button) back.appendChild(button);
    });
    pageEl.appendChild(back);

    const details = el('details');
    details.appendChild(el('summary', '', 'Compiled markdown'));
    details.appendChild(el('pre', 'path', page.markdown));
    pageEl.appendChild(details);
  }

  function paintNumbers(page) {
    if (!page.keyNumbers.length) return;
    const challenged = {};
    page.contradictions.forEach(function (item) { challenged[item.key] = true; });
    const table = el('table');
    const head = el('tr');
    ['Key', 'Kept value', 'As of', 'Source'].forEach(function (label) { head.appendChild(el('th', '', label)); });
    table.appendChild(head);
    page.keyNumbers.slice().sort(function (a, b) { return a.key.localeCompare(b.key); }).forEach(function (item) {
      const row = el('tr', challenged[item.key] ? 'challenged' : '');
      row.appendChild(el('td', '', item.key));
      row.appendChild(el('td', '', item.value));
      row.appendChild(el('td', '', item.date));
      row.appendChild(el('td', '', wiki.SOURCE_LABEL[item.source]));
      table.appendChild(row);
    });
    pageEl.appendChild(table);
  }

  function paintConflicts(page) {
    if (!page.contradictions.length) return;
    const block = el('div', 'block');
    block.appendChild(el('h3', '', 'Challenged'));
    page.contradictions.forEach(function (item) {
      const challenge = item.challenged.map(function (entry) {
        return wiki.SOURCE_LABEL[entry.source] + ' on ' + entry.date + ' said ' + entry.value;
      }).join('; ');
      block.appendChild(el('p', 'conflict', item.key + ' keeps ' + item.kept.value + ' from the ' + wiki.SOURCE_LABEL[item.kept.source] + '. ' + challenge + '.'));
    });
    pageEl.appendChild(block);
  }

  function paintAnswer() {
    clear(answerEl);
    if (!state.answer) {
      answerEl.appendChild(el('p', 'meta', 'No question yet. The storm question stays empty until that note is compiled.'));
      return;
    }
    const result = state.answer;
    answerEl.appendChild(el('p', 'lead', result.answer));
    const opened = el('div', 'block');
    opened.appendChild(el('h3', '', 'Opened'));
    result.opened.forEach(function (item) {
      const row = el('div', 'row');
      const button = linkButton(item.id);
      row.appendChild(button);
      const quoted = result.quotes.some(function (quote) { return quote.pageId === item.id; });
      row.appendChild(el('span', 'meta', item.kind === 'master' ? 'read first' : (quoted ? 'quoted' : 'retrieved')));
      opened.appendChild(row);
    });
    answerEl.appendChild(opened);
    if (result.used.length) {
      const scores = el('div', 'block');
      scores.appendChild(el('h3', '', 'Why these pages'));
      result.used.forEach(function (item) {
        scores.appendChild(el('p', 'meta', item.path + ' · score ' + item.score));
      });
      answerEl.appendChild(scores);
      const file = el('button', 'primary', 'File this answer');
      file.type = 'button';
      file.addEventListener('click', function () {
        const filed = wiki.fileAnswer(state.vault, result);
        if (!filed.ok) {
          state.report = filed.error;
          paint();
          return;
        }
        state.vault = filed.vault;
        state.selected = filed.pageId;
        state.report = 'Filed the answer under output/. The pages it cited gained a backlink.';
        paint();
      });
      answerEl.appendChild(file);
    }
  }

  wiki.QUESTIONS.forEach(function (item) {
    const button = el('button', '', item.text);
    button.type = 'button';
    button.addEventListener('click', function () {
      document.getElementById('question').value = item.text;
      ask(item.text);
    });
    questions.appendChild(button);
  });

  function ask(text) {
    state.answer = wiki.ask(state.vault, text);
    state.touched = {};
    const count = state.answer.used.length;
    state.report = count
      ? 'Opened the index, then ' + count + ' compiled ' + (count === 1 ? 'page' : 'pages') + '.'
      : 'Opened the index. No compiled page matched, so the vault did not guess.';
    paint();
  }

  document.getElementById('question-form').addEventListener('submit', function (event) {
    event.preventDefault();
    ask(document.getElementById('question').value);
  });

  document.getElementById('composer').addEventListener('submit', function (event) {
    event.preventDefault();
    const prepared = wiki.prepareNote({
      title: document.getElementById('title').value,
      ticker: document.getElementById('ticker').value,
      source: document.getElementById('source').value,
      date: document.getElementById('date').value,
      text: document.getElementById('body').value,
    });
    if (!prepared.ok) {
      formError.textContent = prepared.error;
      return;
    }
    applyIngest(wiki.ingest(state.vault, prepared.note));
  });

  document.getElementById('fill-cut').addEventListener('click', function () {
    const note = wiki.CANCELLATION;
    document.getElementById('title').value = note.title;
    document.getElementById('ticker').value = note.ticker;
    document.getElementById('source').value = note.source;
    document.getElementById('date').value = note.date;
    document.getElementById('body').value = note.text;
    formError.textContent = 'Ready to compile. The June article should stay at 12000.';
  });

  document.getElementById('reset').addEventListener('click', function () {
    state.vault = wiki.openingVault();
    state.selected = 'wiki/index';
    state.answer = null;
    state.touched = {};
    state.report = 'Reset to the four compiled notes. The storm is waiting in raw again.';
    formError.textContent = '';
    document.getElementById('composer').reset();
    document.getElementById('date').value = '2026-10-01';
    paint();
  });

  jump.addEventListener('change', function () { select(jump.value); });

  paint();
})();
