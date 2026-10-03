(function () {
  const jev = window.JevEmbed;
  const presets = document.querySelector('#presets');
  const presetNote = document.querySelector('#preset-note');
  const queryLabel = document.querySelector('#query-label');
  const queryVector = document.querySelector('#query-vector');
  const readout = document.querySelector('#vector-readout');
  const docs = document.querySelector('#docs');
  const ranking = document.querySelector('#ranking');
  const questionName = document.querySelector('#question-name');

  let state = jev.clonePreset('inbox');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function readScore(raw) {
    const text = String(raw).trim();
    if (text === '' || text === '.' || text === '-' || text === '0.') return 0;
    const value = Number(text);
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  function paintPresets() {
    presets.replaceChildren();
    for (const preset of Object.values(jev.PRESETS)) {
      const button = el('button', '', preset.label);
      button.type = 'button';
      button.className = state.id === preset.id ? 'primary' : '';
      button.setAttribute('aria-pressed', String(state.id === preset.id));
      button.addEventListener('click', () => {
        state = jev.clonePreset(preset.id);
        renderEditor();
        renderRanking();
      });
      presets.append(button);
    }
    const restore = el('button', '', 'Restore this preset');
    restore.type = 'button';
    restore.addEventListener('click', () => {
      state = jev.clonePreset(state.id);
      renderEditor();
      renderRanking();
    });
    presets.append(restore);
    presetNote.textContent = state.note;
  }

  function scoreControl(value, label, onValue) {
    const wrap = el('span', 'score-line');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.01';
    range.value = String(value);
    range.setAttribute('aria-label', `${label} slider`);
    const number = document.createElement('input');
    number.type = 'number';
    number.min = '0';
    number.max = '1';
    number.step = '0.01';
    number.value = String(value);
    number.setAttribute('aria-label', `${label} value`);
    range.addEventListener('input', () => {
      const next = readScore(range.value);
      number.value = String(next);
      onValue(next);
    });
    number.addEventListener('input', () => {
      const next = readScore(number.value);
      range.value = String(next);
      onValue(next);
    });
    number.addEventListener('blur', () => {
      number.value = String(readScore(number.value));
    });
    wrap.append(range, number);
    return wrap;
  }

  function renderEditor() {
    paintPresets();
    queryLabel.value = state.queryLabel;
    queryVector.replaceChildren();
    state.questions.forEach((question, index) => {
      const column = el('div', 'q-col');
      const name = document.createElement('input');
      name.type = 'text';
      name.value = question;
      name.setAttribute('aria-label', `Question ${index + 1} name`);
      name.addEventListener('input', () => {
        state.questions[index] = name.value;
        renderRanking();
        const heads = docs.querySelectorAll('[data-question-label]');
        heads.forEach(node => {
          if (Number(node.dataset.questionLabel) === index) node.textContent = name.value || 'unnamed';
        });
      });
      const remove = el('button', 'quiet', 'Remove');
      remove.type = 'button';
      remove.disabled = state.questions.length === 1;
      remove.addEventListener('click', () => {
        state.questions.splice(index, 1);
        state.query.splice(index, 1);
        for (const doc of state.docs) doc.scores.splice(index, 1);
        renderEditor();
        renderRanking();
      });
      column.append(document.createTextNode('Question'), name);
      const controls = el('div', 'score-line');
      controls.append(scoreControl(state.query[index], question || 'query', value => {
        state.query[index] = value;
        renderRanking();
      }), remove);
      column.append(controls);
      queryVector.append(column);
    });

    docs.replaceChildren();
    state.docs.forEach((doc, docIndex) => {
      const card = el('article', 'doc');
      const head = el('div', 'doc-head');
      const title = document.createElement('input');
      title.type = 'text';
      title.className = 'doc-title';
      title.value = doc.title;
      title.setAttribute('aria-label', `Document ${docIndex + 1} title`);
      title.addEventListener('input', () => {
        doc.title = title.value;
        renderRanking();
      });
      const remove = el('button', 'quiet', 'Remove document');
      remove.type = 'button';
      remove.disabled = state.docs.length === 1;
      remove.addEventListener('click', () => {
        state.docs.splice(docIndex, 1);
        renderEditor();
        renderRanking();
      });
      head.append(title, remove);
      const text = document.createElement('input');
      text.type = 'text';
      text.className = 'doc-text';
      text.value = doc.text;
      text.setAttribute('aria-label', `Document ${docIndex + 1} text`);
      text.addEventListener('input', () => {
        doc.text = text.value;
        renderRanking();
      });
      const scores = el('div', 'scores');
      state.questions.forEach((question, index) => {
        const line = el('div', 'score-line');
        const name = el('span', '', question || 'unnamed');
        name.dataset.questionLabel = String(index);
        line.append(name, scoreControl(doc.scores[index], question || 'score', value => {
          doc.scores[index] = value;
          renderRanking();
        }));
        scores.append(line);
      });
      card.append(head, text, scores);
      docs.append(card);
    });
  }

  function renderRanking() {
    const ranked = jev.rankDocuments(state);
    readout.textContent = `[${state.query.map(value => jev.formatNum(value)).join(', ')}]`;
    ranking.replaceChildren();
    ranked.forEach((match, index) => {
      const card = el('article', index === 0 ? 'match top' : 'match');
      card.append(el('p', 'rank', `#${match.rank}`));
      const body = el('div');
      body.append(el('h3', '', match.title || 'Untitled'));
      const cosine = match.cosine == null ? 'cosine undefined' : `cosine ${jev.formatNum(match.cosine)} · dot ${jev.formatNum(match.dot)}`;
      body.append(el('p', 'cosine', cosine));
      if (match.text) body.append(el('p', '', match.text));
      body.append(el('p', 'reason', jev.reason(match)));
      const dims = el('div', 'dims');
      for (const part of match.parts) {
        const row = el('div', 'dim');
        row.append(el('span', '', part.question));
        const bar = el('div', 'bar');
        const fill = document.createElement('i');
        const width = Math.max(0, Math.min(1, part.score)) * 100;
        fill.style.width = `${width}%`;
        const tick = document.createElement('b');
        tick.style.left = `${Math.max(0, Math.min(1, part.query)) * 100}%`;
        bar.append(fill, tick);
        row.append(bar);
        row.append(el('span', '', `${jev.formatNum(part.query)} × ${jev.formatNum(part.score)}`));
        dims.append(row);
      }
      body.append(dims);
      card.append(body);
      ranking.append(card);
    });
  }

  queryLabel.addEventListener('input', () => {
    state.queryLabel = queryLabel.value;
  });

  document.querySelector('#add-question').addEventListener('submit', event => {
    event.preventDefault();
    const name = questionName.value.trim() || `question_${state.questions.length + 1}`;
    state.questions.push(name);
    state.query.push(0);
    for (const doc of state.docs) doc.scores.push(0);
    questionName.value = '';
    renderEditor();
    renderRanking();
    questionName.focus();
  });

  document.querySelector('#add-doc').addEventListener('click', () => {
    state.docs.push({
      id: `doc-${Date.now()}`,
      title: 'New document',
      text: '',
      scores: state.questions.map(() => 0),
    });
    renderEditor();
    renderRanking();
  });

  renderEditor();
  renderRanking();
})();
