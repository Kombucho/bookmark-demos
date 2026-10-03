(function () {
  const engine = window.RequirementsEngine;
  const note = document.querySelector('#note');
  const scope = document.querySelector('#scope');
  const report = document.querySelector('#report');
  const byId = new Map(engine.CHARACTERISTICS.map(item => [item.id, item]));
  let filter = 'all';
  let latest = null;
  let timer = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function nameOf(id) {
    return byId.get(id)?.name || id;
  }

  function plainLog(result) {
    const lines = [];
    lines.push(result.scope ? `Scope: ${result.scope}` : 'Scope: (none)');
    lines.push('');
    lines.push('Catalogue');
    if (!result.setFindings.length) lines.push('No set-level findings.');
    for (const finding of result.setFindings) {
      lines.push(`- ${nameOf(finding.characteristic)}: ${finding.evidence}`);
    }
    lines.push('');
    for (const item of result.items) {
      lines.push(`${item.stableId || item.id}`);
      lines.push(item.text);
      if (!item.failures.length) lines.push('No defects.');
      for (const failure of item.failures) {
        lines.push(`- ${nameOf(failure.characteristic)}: ${failure.evidence}`);
      }
      lines.push('');
    }
    if (result.openQuestions.length) {
      lines.push('Open questions');
      for (const question of result.openQuestions) lines.push(`- ${question}`);
    }
    return lines.join('\n');
  }

  function render() {
    const result = engine.review(note.value, scope.value);
    latest = result;
    report.replaceChildren();
    if (!note.value.trim()) {
      report.append(el('p', 'empty', 'Paste a note, or load one of the samples. The defect log will name the characteristic and the words that failed it.'));
      return;
    }

    const summary = el('div', 'summary');
    summary.append(
      el('strong', '', `${result.counts.items} requirements`),
      el('span', '', `${result.counts.itemFailures} item findings`),
      el('span', '', `${result.counts.setFindings} catalogue findings`),
    );
    const copy = el('button', 'copy', 'Copy defect log');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      const text = plainLog(result);
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Copy failed';
      }
      setTimeout(() => { copy.textContent = 'Copy defect log'; }, 1200);
    });
    summary.append(copy);
    report.append(summary);
    report.append(el('p', 'scope-line', result.scope ? `Scope in force: ${result.scope}` : 'No scope is in force, so relevance fails until you add one.'));

    const counts = new Map();
    for (const item of result.items) {
      for (const failure of item.failures) counts.set(failure.characteristic, (counts.get(failure.characteristic) || 0) + 1);
    }
    for (const finding of result.setFindings) {
      if (!counts.has(finding.characteristic)) counts.set(finding.characteristic, 0);
    }

    const chips = el('div', 'chips');
    const all = el('button', 'chip', 'All');
    all.type = 'button';
    all.setAttribute('aria-pressed', String(filter === 'all'));
    all.addEventListener('click', () => { filter = 'all'; render(); });
    chips.append(all);
    const ordered = [...counts.keys()].sort((a, b) => byId.get(a).n - byId.get(b).n);
    for (const id of ordered) {
      const chip = el('button', 'chip', `${nameOf(id)} ${counts.get(id) || result.setFindings.filter(finding => finding.characteristic === id).length}`);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(filter === id));
      chip.addEventListener('click', () => { filter = id; render(); });
      chips.append(chip);
    }
    report.append(chips);

    const catalogue = el('section', 'catalogue');
    catalogue.append(el('h2', '', 'Catalogue'));
    const findings = result.setFindings.filter(finding => filter === 'all' || finding.characteristic === filter);
    if (!findings.length) {
      catalogue.append(el('p', 'empty', 'No catalogue findings in this filter.'));
    }
    for (const finding of findings) {
      const card = el('article', 'finding');
      card.append(el('h3', '', nameOf(finding.characteristic)));
      card.append(el('p', 'test', byId.get(finding.characteristic).test));
      card.append(el('p', '', finding.evidence));
      catalogue.append(card);
    }
    report.append(catalogue);

    const list = el('div', 'items');
    const visible = result.items.filter(item => filter === 'all' || item.failures.some(failure => failure.characteristic === filter));
    if (!visible.length) list.append(el('p', 'empty', 'No requirement failed this check.'));
    for (const item of visible) {
      const defects = item.failures.filter(failure => filter === 'all' || failure.characteristic === filter);
      const card = el('article', defects.length ? 'card bad' : 'card good');
      const title = el('h2');
      title.append(el('span', 'req-id', item.stableId || item.id));
      title.append(document.createTextNode(item.style));
      card.append(title);
      card.append(el('p', 'statement', item.text));
      if (!defects.length) {
        card.append(el('p', '', 'No defects on this requirement.'));
      }
      for (const failure of defects) {
        const block = el('div', 'failure');
        block.append(el('h3', '', nameOf(failure.characteristic)));
        block.append(el('p', 'test', byId.get(failure.characteristic).test));
        block.append(el('p', '', failure.evidence));
        card.append(block);
      }
      list.append(card);
    }
    report.append(list);

    if (result.openQuestions.length && (filter === 'all')) {
      const questions = el('section', 'catalogue');
      questions.append(el('h2', '', 'Open questions'));
      for (const question of result.openQuestions) questions.append(el('p', 'question', question));
      report.append(questions);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  note.addEventListener('input', schedule);
  scope.addEventListener('input', schedule);
  document.querySelector('#catalogue').addEventListener('click', () => {
    note.value = engine.SAMPLE_CATALOGUE;
    scope.value = '';
    filter = 'all';
    render();
  });
  document.querySelector('#messy').addEventListener('click', () => {
    note.value = engine.SAMPLE_MESSY;
    scope.value = '';
    filter = 'all';
    render();
  });
  document.querySelector('#clear').addEventListener('click', () => {
    note.value = '';
    scope.value = '';
    filter = 'all';
    render();
  });

  render();
})();
