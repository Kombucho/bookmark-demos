(function () {
  const api = window.OrchardAction;
  const views = document.querySelector('#views');
  const chainBtn = document.querySelector('#view-chain');
  const ivkBtn = document.querySelector('#view-ivk');
  const noteSelect = document.querySelector('#note');
  const sendButton = document.querySelector('#send-button');
  const statusEl = document.querySelector('#status');
  const anchorEl = document.querySelector('#anchor');
  const leavesEl = document.querySelector('#leaves');
  const treeEl = document.querySelector('#tree');
  const actionEl = document.querySelector('#action');
  const pathEl = document.querySelector('#path');
  const actionsEl = document.querySelector('#actions');
  const walletSection = document.querySelector('#wallet');
  const walletList = document.querySelector('#wallet-list');

  let state = null;
  let view = 'chain';
  let previousAnchor = '';
  let paintGen = 0;

  views.addEventListener('click', function (event) {
    const button = event.target.closest('[role="radio"]');
    if (!button) return;
    setView(button === ivkBtn ? 'ivk' : 'chain');
  });

  views.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'ArrowRight' || event.key === 'End' ? 'ivk' : 'chain';
    setView(next);
    (next === 'ivk' ? ivkBtn : chainBtn).focus();
  });

  document.querySelector('#create').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!state) return;
    const data = new FormData(event.target);
    run(api.createNote(state, data.get('amount'), data.get('memo')));
  });

  document.querySelector('#send').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!state) return;
    const data = new FormData(event.target);
    run(api.send(state, data.get('note'), data.get('amount'), data.get('memo')));
  });

  document.querySelector('#dummy').addEventListener('click', function () {
    if (!state) return;
    run(api.dummyAction(state));
  });

  boot();

  function boot() {
    api.seed().then(function (seeded) {
      state = seeded;
      previousAnchor = state.anchor;
      paint('');
    }).catch(function () {
      statusEl.textContent = 'The tree could not be built.';
    });
  }

  function run(pending) {
    pending.then(function (result) {
      state = result.state;
      paint(result.ok ? result.detail : result.reason);
    }).catch(function () {
      statusEl.textContent = 'That action could not be built.';
    });
  }

  function setView(next) {
    view = next;
    chainBtn.setAttribute('aria-checked', view === 'chain' ? 'true' : 'false');
    ivkBtn.setAttribute('aria-checked', view === 'ivk' ? 'true' : 'false');
    chainBtn.tabIndex = view === 'chain' ? 0 : -1;
    ivkBtn.tabIndex = view === 'ivk' ? 0 : -1;
    if (state) paint(statusEl.textContent);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function draw(host, source) {
    host.replaceChildren();
    try {
      const rendered = window.pele.render(source);
      host.innerHTML = rendered.svg;
      const svg = host.querySelector('svg');
      if (svg) svg.style.maxWidth = 'none';
    } catch (error) {
      host.appendChild(el('p', 'hint', 'The diagram could not be drawn.'));
    }
  }

  function paint(message) {
    const gen = ++paintGen;
    statusEl.textContent = message || '';
    const moved = previousAnchor && previousAnchor !== state.anchor;
    anchorEl.textContent = 'Anchor ' + state.anchor + (moved ? '. Updated.' : '.');
    previousAnchor = state.anchor;
    leavesEl.replaceChildren();
    state.leaves.forEach(function (leaf, index) {
      const latest = index === state.next - 1;
      const empty = leaf === api.UNCOMMITTED;
      const item = el('li', latest ? 'latest' : (empty ? 'empty' : ''));
      item.textContent = empty ? '2' : api.short(leaf);
      item.title = empty ? 'Uncommitted' : leaf;
      leavesEl.appendChild(item);
    });
    draw(treeEl, api.treeSource(state));
    const latest = state.actions[state.actions.length - 1] || null;
    draw(actionEl, api.actionSource(latest));

    pathEl.replaceChildren();
    if (!state.path.length) {
      pathEl.appendChild(el('li', '', 'No leaf yet.'));
    } else {
      state.path.forEach(function (step) {
        const item = el('li');
        item.appendChild(el('span', '', 'Layer ' + step.layer + ', ' + step.side + ' sibling '));
        item.appendChild(el('code', '', api.short(step.siblingValue)));
        pathEl.appendChild(item);
      });
    }

    const notes = api.walletView(state).filter(function (note) { return !note.spent; });
    const selected = noteSelect.value;
    noteSelect.replaceChildren();
    notes.forEach(function (note) {
      const option = document.createElement('option');
      option.value = String(note.position);
      option.textContent = 'Leaf ' + note.position + ' · ' + note.amount + ' · ' + note.memo;
      noteSelect.appendChild(option);
    });
    if (notes.some(function (note) { return String(note.position) === selected; })) noteSelect.value = selected;
    const empty = notes.length === 0;
    noteSelect.disabled = empty;
    sendButton.disabled = empty;

    walletSection.hidden = view !== 'ivk';
    if (view === 'ivk') {
      walletList.replaceChildren();
      api.walletView(state).forEach(function (note) {
        const item = el('li');
        item.appendChild(el('p', 'row', 'Leaf ' + note.position + (note.spent ? ' · spent' : ' · unspent')));
        item.appendChild(el('p', 'row', note.amount + ' · ' + (note.memo || '(empty memo)')));
        const code = el('p', 'row');
        code.appendChild(el('code', '', note.cmx));
        item.appendChild(code);
        walletList.appendChild(item);
      });
    }

    api.readActions(state, api.SELF).then(function (rows) {
      if (gen !== paintGen) return;
      actionsEl.replaceChildren();
      if (!rows.length) {
        actionsEl.appendChild(el('li', '', 'No action yet. The three starting leaves are already in the tree.'));
        return;
      }
      rows.forEach(function (row) {
        const item = el('li');
        item.appendChild(el('p', 'row', 'Appended at leaf ' + row.position));
        addCode(item, 'cmx', row.cmx);
        addCode(item, 'nf', row.nf);
        addCode(item, 'cv', row.cv);
        if (view === 'ivk') {
          if (row.opened) {
            item.appendChild(el('p', 'row', 'Opened · ' + row.opened.amount + ' · ' + (row.opened.memo || '(empty memo)')));
          } else {
            item.appendChild(el('p', 'row sealed', 'Sealed. This incoming key does not open it.'));
          }
        }
        actionsEl.appendChild(item);
      });
    });
  }

  function addCode(item, name, value) {
    const row = el('p', 'row', name + ' ');
    row.appendChild(el('code', '', value));
    item.appendChild(row);
  }
})();
