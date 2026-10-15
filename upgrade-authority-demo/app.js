(function () {
  const auth = window.UpgradeAuthority;
  const KIND = {
    lumen: 'Lending',
    marrow: 'AMM',
    salt: 'Governance',
    keel: 'Multisig program',
  };
  const MODE_LABEL = {
    single: 'Single key',
    multisig: 'Multisig',
    dao: 'Council',
    locked: 'Locked',
  };

  const boardEl = document.querySelector('#board');
  const dayEl = document.querySelector('#day');
  const summaryEl = document.querySelector('#summary');
  const clockNote = document.querySelector('#clock-note');
  let board = auth.createBoard();
  const notes = {};

  render();

  document.querySelector('#advance-1').addEventListener('click', function () { advance(1); });
  document.querySelector('#advance-2').addEventListener('click', function () { advance(2); });
  boardEl.addEventListener('click', onClick);
  boardEl.addEventListener('change', onChange);

  function item(id) {
    return board.programs.find(function (program) { return program.id === id; });
  }

  function formatTvl(n) {
    if (!n) return '$0';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'm';
    return '$' + n.toLocaleString('en-US');
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function verdictLine(program) {
    const call = auth.verdict(program);
    if (program.mode === 'locked') return 'Upgrade authority is None.';
    if (program.mode === 'dao') return 'Weight ' + call.have + ' of ' + call.need + ' needed.';
    return 'Signatures ' + call.have + ' of ' + call.need + '.';
  }

  function outcome(program, result) {
    if (result.code === 'Upgraded' || result.code === 'Landed') {
      return 'The binary now ends in drain_to(upgrader). ' + formatTvl(program.taken) + ' moved to the upgrader. The old instructions were not edited in place. They were replaced.';
    }
    if (result.code === 'Queued') {
      return 'Queued. The binary is unchanged until day ' + result.landsAt + '. Advance time to land it, or cancel.';
    }
    if (result.code === 'Immutable') {
      return 'Rejected. The upgrade authority is None, so this binary cannot be replaced.';
    }
    if (result.code === 'Threshold') {
      if (program.mode === 'dao') {
        return 'Rejected. Weight ' + result.have + ' is short of ' + result.need + '. The binary stays.';
      }
      return 'Rejected. ' + result.have + ' of ' + result.need + ' signatures. The binary stays.';
    }
    if (result.code === 'AlreadyQueued') return 'A drain is already waiting on the timelock.';
    if (result.code === 'AlreadyDrained') return 'This binary was already replaced.';
    if (result.code === 'Cancelled') return 'Cancelled. The queued binary will not land.';
    if (result.code === 'Restored') return 'Restored. Deposits and the original instructions are back. Signatures were cleared.';
    return '';
  }

  function safeClass(program, note) {
    if (!note) return '';
    if (note.indexOf('Rejected') === 0 || note.indexOf('Cancelled') === 0 || note.indexOf('Restored') === 0) return ' is-safe';
    return '';
  }

  function render() {
    dayEl.textContent = String(board.now);
    const drained = board.programs.filter(function (program) { return program.drained; }).length;
    const queued = board.programs.filter(function (program) { return program.queue; }).length;
    summaryEl.textContent = board.programs.length + ' programs. ' + queued + ' queued. ' + drained + ' drained.';
    const waiting = board.programs.filter(function (program) { return program.queue; });
    clockNote.textContent = waiting.length
      ? waiting.map(function (program) {
        return program.name + ' lands on day ' + program.queue.landsAt;
      }).join('. ') + '.'
      : 'Nothing is queued. A timelock holds a signed upgrade until the day arrives.';
    boardEl.replaceChildren();
    board.programs.forEach(function (program) { boardEl.appendChild(card(program)); });
  }

  function card(program) {
    const call = auth.verdict(program);
    const article = el('article', 'card' + (program.drained ? ' is-drained' : program.queue ? ' is-queued' : program.mode === 'locked' ? ' is-locked' : '') + safeClass(program, notes[program.id]));
    article.dataset.id = program.id;

    const head = el('div');
    head.appendChild(el('p', 'kicker-card', KIND[program.id] || 'Program'));
    head.appendChild(el('h2', null, program.name));
    head.appendChild(el('p', 'blurb', program.blurb));
    if (program.aside && showAside(program)) head.appendChild(el('p', 'aside', program.aside));
    article.appendChild(head);

    const money = el('div', 'money');
    const tvl = el('p');
    tvl.append(el('span', null, 'Deposits'), el('strong', null, formatTvl(program.tvl)));
    const pocket = el('p', 'taken');
    pocket.append(el('span', null, 'Upgrader'), el('strong', null, formatTvl(program.taken)));
    money.append(tvl, pocket);
    article.appendChild(money);

    const modes = el('div', 'modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Upgrade authority for ' + program.name);
    auth.MODES.forEach(function (mode) {
      const button = el('button', null, MODE_LABEL[mode]);
      button.type = 'button';
      button.dataset.mode = mode;
      button.setAttribute('aria-pressed', program.mode === mode ? 'true' : 'false');
      modes.appendChild(button);
    });
    article.appendChild(modes);

    const lock = el('label', 'check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.timelock = 'true';
    box.checked = program.timelock;
    lock.append(box, document.createTextNode(auth.DELAY_DAYS + '-day timelock'));
    article.appendChild(lock);

    article.appendChild(signers(program, call));
    article.appendChild(binary(program));
    article.appendChild(el('p', 'verdict', verdictLine(program)));
    const result = el('p', 'result');
    result.setAttribute('aria-live', 'polite');
    result.textContent = notes[program.id] || hint(program);
    article.appendChild(result);

    const actions = el('div', 'actions');
    const propose = el('button', program.drained ? '' : 'danger', program.drained ? 'Already upgraded' : 'Propose drain upgrade');
    propose.type = 'button';
    propose.dataset.propose = 'true';
    propose.disabled = program.drained;
    actions.appendChild(propose);
    if (program.queue) {
      const cancel = el('button', null, 'Cancel queued upgrade');
      cancel.type = 'button';
      cancel.dataset.cancel = 'true';
      actions.appendChild(cancel);
    }
    if (program.drained) {
      const restore = el('button', null, 'Restore binary');
      restore.type = 'button';
      restore.dataset.restore = 'true';
      actions.appendChild(restore);
    }
    article.appendChild(actions);
    return article;
  }

  function showAside(program) {
    if (program.id === 'salt') return program.mode === 'dao';
    if (program.id === 'keel') return program.mode === 'locked';
    return false;
  }

  function hint(program) {
    if (program.mode === 'locked') return 'Try the upgrade. A locked program has nobody who can sign it.';
    if (program.mode === 'single') return 'Turn on ' + program.single.name + ', then propose. One signature is enough.';
    if (program.mode === 'multisig') return 'Turn on ' + program.multisig.m + ' of ' + program.multisig.members.length + ', then propose.';
    return 'The pass mark is ' + program.dao.pass + '. Toggle blocs until the weight clears it, or until it does not.';
  }

  function signers(program, call) {
    const wrap = el('div');
    if (program.mode === 'locked') {
      wrap.appendChild(el('p', 'stamp', 'Authority None'));
      return wrap;
    }
    const row = el('div', 'signers');
    if (program.mode === 'single') {
      row.appendChild(signerButton(program.single.id, program.single.name, program.single.on, null));
    }
    if (program.mode === 'multisig') {
      program.multisig.members.forEach(function (member) {
        row.appendChild(signerButton(member.id, member.name, member.on, null));
      });
      const threshold = el('label', 'threshold');
      threshold.appendChild(document.createTextNode('Threshold '));
      const select = document.createElement('select');
      select.dataset.threshold = 'true';
      select.setAttribute('aria-label', 'Signatures required for ' + program.name);
      program.multisig.members.forEach(function (member, index) {
        const option = el('option', null, (index + 1) + ' of ' + program.multisig.members.length);
        option.value = String(index + 1);
        if (index + 1 === program.multisig.m) option.selected = true;
        select.appendChild(option);
      });
      threshold.appendChild(select);
      wrap.append(row, threshold);
      return wrap;
    }
    if (program.mode === 'dao') {
      program.dao.voters.forEach(function (voter) {
        row.appendChild(signerButton(voter.id, voter.name, voter.on, voter.weight));
      });
      const meter = el('div', 'meter');
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', call.have + ' of ' + call.need + ' weight');
      const fill = document.createElement('span');
      fill.style.width = Math.min(100, call.have) + '%';
      const mark = document.createElement('i');
      mark.style.left = call.need + '%';
      meter.append(fill, mark);
      wrap.append(row, meter);
      return wrap;
    }
    wrap.appendChild(row);
    return wrap;
  }

  function signerButton(id, name, on, weight) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.signer = id;
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.appendChild(document.createTextNode(name));
    if (weight != null) button.appendChild(el('small', null, String(weight)));
    return button;
  }

  function binary(program) {
    const list = el('ol', 'binary');
    program.binary.forEach(function (op) {
      list.appendChild(el('li', op === auth.DRAIN ? 'drain' : '', op));
    });
    if (program.queue) {
      const waiting = el('li', 'waiting', 'queued ' + auth.DRAIN);
      waiting.title = 'Signed, and waiting out the timelock. Not in the binary yet.';
      list.appendChild(waiting);
    }
    return list;
  }

  function commit(result, note) {
    board = result.board;
    if (result.id && note) notes[result.id] = note;
    render();
  }

  function onClick(event) {
    const cardEl = event.target.closest('.card');
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    const mode = event.target.closest('[data-mode]');
    if (mode) {
      const result = auth.setMode(board, id, mode.dataset.mode);
      commit(result, 'Authority is now ' + MODE_LABEL[mode.dataset.mode] + '. Signatures were cleared, and a queued upgrade was dropped.');
      return;
    }
    const signer = event.target.closest('[data-signer]');
    if (signer) {
      const on = signer.getAttribute('aria-pressed') !== 'true';
      delete notes[id];
      commit(auth.setApproval(board, id, signer.dataset.signer, on));
      return;
    }
    if (event.target.closest('[data-propose]')) {
      const result = auth.propose(board, id);
      commit(result, outcome(itemFrom(result, id), result));
      return;
    }
    if (event.target.closest('[data-cancel]')) {
      const result = auth.cancel(board, id);
      commit(result, outcome(itemFrom(result, id), result));
      return;
    }
    if (event.target.closest('[data-restore]')) {
      const result = auth.restore(board, id);
      commit(result, outcome(itemFrom(result, id), result));
    }
  }

  function itemFrom(result, id) {
    return result.board.programs.find(function (program) { return program.id === id; });
  }

  function onChange(event) {
    const cardEl = event.target.closest('.card');
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    if (event.target.matches('[data-timelock]')) {
      const on = event.target.checked;
      const result = auth.setTimelock(board, id, on);
      commit(result, on
        ? 'Timelock on. A signature that passes waits ' + auth.DELAY_DAYS + ' days before the binary changes.'
        : 'Timelock off. A signature that passes replaces the binary immediately.');
      return;
    }
    if (event.target.matches('[data-threshold]')) {
      const result = auth.setThreshold(board, id, Number(event.target.value));
      const program = itemFrom(result, id);
      commit(result, 'Threshold is now ' + program.multisig.m + ' of ' + program.multisig.members.length + '.');
    }
  }

  function advance(days) {
    const result = auth.advance(board, days);
    board = result.board;
    if (result.code === 'Landed') {
      result.landed.forEach(function (id) {
        const program = item(id);
        notes[id] = outcome(program, {code: 'Landed'});
      });
    }
    render();
  }
})();
