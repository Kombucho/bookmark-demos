(function () {
  const leak = window.SeedLeak;
  const SWITCHES = [
    ['omitMnemonic', 'Leave the mnemonic out', 'The event records that a wallet opened. The phrase is not in it.'],
    ['redactAll', 'Redact every field', 'The message is already filtered. This also clears the navigation arguments.'],
    ['encryptAtRest', 'Encrypt the log store', 'The server keeps a toy seal. This attacker has no key.'],
    ['restrictAccess', 'Restrict log access', 'The attacker cannot read the store. A plaintext phrase can still be sitting there.'],
  ];

  const flags = {
    omitMnemonic: false,
    redactAll: false,
    encryptAtRest: false,
    restrictAccess: false,
  };
  let opened = ['moth', 'pebble'];
  let result = leak.simulate(flags, opened);
  let cursor = result.steps.length;
  let timer = null;

  const switchesEl = document.querySelector('#switches');
  const pipelineEl = document.querySelector('#pipeline');
  const walletEl = document.querySelector('#wallet-list');
  const watchBtn = document.querySelector('#watch');
  const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  SWITCHES.forEach(function (row) {
    const label = document.createElement('label');
    label.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.flag = row[0];
    const strong = document.createElement('strong');
    strong.textContent = row[1];
    const span = document.createElement('span');
    span.textContent = row[2];
    label.append(input, strong, span);
    switchesEl.appendChild(label);
  });

  switchesEl.addEventListener('change', function (event) {
    const input = event.target;
    if (!input.dataset.flag) return;
    flags[input.dataset.flag] = input.checked;
    rerun(result.steps.length);
  });
  watchBtn.addEventListener('click', watch);
  document.querySelector('#end').addEventListener('click', function () {
    stop();
    cursor = result.steps.length;
    render();
  });
  document.querySelector('#clear').addEventListener('click', function () {
    opened = [];
    rerun(null);
  });
  walletEl.addEventListener('click', function (event) {
    const button = event.target.closest('[data-open]');
    if (!button) return;
    const id = button.dataset.open;
    if (opened.indexOf(id) === -1) opened.push(id);
    else opened = opened.filter(function (item) { return item !== id; });
    opened = leak.WALLETS.map(function (wallet) { return wallet.id; }).filter(function (item) {
      return opened.indexOf(item) !== -1;
    });
    rerun(null);
  });

  render();

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    watchBtn.textContent = 'Watch the session';
  }

  function rerun(nextCursor) {
    stop();
    result = leak.simulate(flags, opened);
    cursor = nextCursor == null ? result.steps.length : nextCursor;
    render();
  }

  function watch() {
    stop();
    if (!motionOk || result.steps.length === 0) {
      cursor = result.steps.length;
      render();
      return;
    }
    cursor = 0;
    render();
    timer = setInterval(function () {
      cursor += 1;
      render();
      if (cursor >= result.steps.length) stop();
    }, 420);
  }

  function render() {
    const frame = leak.frame(result, cursor);
    const reached = {};
    frame.steps.forEach(function (step) {
      if (!step.walletId) return;
      reached[step.walletId] = reached[step.walletId] || {};
      reached[step.walletId][step.stage] = step;
    });

    pipelineEl.replaceChildren();
    pipelineEl.append(
      column('phone', 'Phone', 'Lantern', phoneColumn(frame, reached)),
      column('filter', 'Filter', 'Before it leaves', listColumn(reached, 'filter', function (step) {
        return fieldCard(step.walletId, 'Message ' + shown(step.message), step.arguments == null ? 'No arguments field.' : 'Arguments ' + shown(step.arguments), argsClass(step.arguments));
      })),
      column('tls', 'TLS', leak.HOST, listColumn(reached, 'tls', function (step) {
        return fieldCard(step.walletId, 'In transit', step.text, 'safe');
      })),
      column('disk', 'Log store', 'At rest', diskColumn(frame)),
      column('attacker', 'Attacker', frame.access === 'denied' ? 'Locked out' : (frame.access === 'read' ? 'Reading the store' : 'Not yet'), attackerColumn(frame))
    );

    walletEl.replaceChildren();
    frame.wallets.forEach(function (wallet) {
      const card = document.createElement('article');
      card.className = 'wallet' + (wallet.drained ? ' is-drained' : (frame.swept ? ' is-quiet' : ''));
      const name = document.createElement('strong');
      name.textContent = wallet.name;
      const bal = document.createElement('p');
      bal.className = 'bal';
      bal.textContent = wallet.balance + ' ' + leak.UNIT;
      const home = document.createElement('p');
      home.textContent = wallet.home;
      const phrase = document.createElement('p');
      phrase.className = 'phrase';
      phrase.textContent = wallet.phrase;
      card.append(name, bal, home, phrase);
      if (wallet.emits) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.open = wallet.id;
        const on = result.opened.indexOf(wallet.id) !== -1;
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        button.textContent = wallet.action === 'import'
          ? (on ? 'Imported — take it out of this session' : 'Import phrase')
          : (on ? 'Created — take it out of this session' : 'Create wallet');
        card.appendChild(button);
      }
      if (wallet.drained) {
        const gone = document.createElement('p');
        gone.textContent = 'Drained. ' + wallet.taken + ' ' + leak.UNIT + ' moved.';
        card.appendChild(gone);
      }
      walletEl.appendChild(card);
    });
  }

  function shown(value) {
    return value == null ? '' : value;
  }

  function argsClass(value) {
    if (value == null || value === '[redacted]') return 'safe';
    if (String(value).indexOf('toy-') === 0) return 'leak';
    return '';
  }

  function column(id, title, kicker, body) {
    const section = document.createElement('section');
    section.className = 'stage' + (id === 'phone' ? ' is-phone' : '');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const note = document.createElement('p');
    note.className = 'stage-kicker';
    note.textContent = kicker;
    section.append(heading, note, body);
    return section;
  }

  function phoneColumn(frame, reached) {
    const wrap = document.createElement('div');
    let any = false;
    Object.keys(reached).forEach(function (id) {
      const step = reached[id].phone;
      if (!step) return;
      any = true;
      wrap.appendChild(fieldCard(id, step.title, step.text, ''));
    });
    if (!any) {
      wrap.appendChild(fieldCard(null, 'No session', 'Create Moth or import Pebble. Harbor and Quill have nothing to send.', ''));
    }
    return wrap;
  }

  function listColumn(reached, stage, builder) {
    const wrap = document.createElement('div');
    let any = false;
    Object.keys(reached).forEach(function (id) {
      if (!reached[id][stage]) return;
      any = true;
      wrap.appendChild(builder(reached[id][stage]));
    });
    if (!any) wrap.appendChild(fieldCard(null, 'Waiting', 'This stage has not happened yet.', ''));
    return wrap;
  }

  function diskColumn(frame) {
    const wrap = document.createElement('div');
    if (!frame.disk.length) {
      wrap.appendChild(fieldCard(null, 'Empty', 'Nothing stored yet.', ''));
      return wrap;
    }
    frame.disk.forEach(function (record) {
      const kind = record.stored === 'plaintext' ? 'leak' : (record.stored === 'ciphertext' ? 'sealed' : 'safe');
      const label = record.stored === 'plaintext' ? 'Plaintext' : (record.stored === 'ciphertext' ? 'Sealed' : 'No phrase');
      wrap.appendChild(fieldCard(record.walletId, record.name + ' · ' + label, record.body, kind));
    });
    return wrap;
  }

  function attackerColumn(frame) {
    const wrap = document.createElement('div');
    const hold = document.createElement('p');
    hold.className = 'attacker-hold';
    const unit = document.createElement('span');
    unit.textContent = frame.swept ? 'Held after the sweep' : 'Held so far';
    hold.append(unit, document.createTextNode(frame.taken + ' ' + leak.UNIT));
    wrap.appendChild(hold);
    if (!frame.access) {
      wrap.appendChild(fieldCard(null, 'Not reading', 'The sweep waits until the session reaches the store.', ''));
      return wrap;
    }
    if (frame.access === 'denied') {
      const sitting = frame.disk.some(function (record) { return record.stored === 'plaintext'; });
      wrap.appendChild(fieldCard(null, 'Access denied', sitting ? 'The attacker reads nothing. Plaintext is still on the server.' : 'The attacker reads nothing.', 'safe'));
    } else if (!frame.phrases.length) {
      wrap.appendChild(fieldCard(null, 'Nothing to spend', 'The open store has no phrase this attacker can use.', 'safe'));
    } else {
      frame.disk.forEach(function (record) {
        if (!record.readable) return;
        wrap.appendChild(fieldCard(record.walletId, record.name, record.body, 'leak'));
      });
    }
    if (frame.swept) {
      const names = frame.wallets.filter(function (wallet) { return wallet.drained; }).map(function (wallet) { return wallet.name; });
      wrap.appendChild(fieldCard(null, 'Sweep', names.length ? 'Drained ' + names.join(', ') + '.' : 'No wallet moved.', names.length ? 'leak' : 'safe'));
    }
    return wrap;
  }

  function fieldCard(walletId, title, text, kind) {
    const card = document.createElement('article');
    card.className = 'event' + (kind ? ' ' + kind : '');
    const strong = document.createElement('strong');
    strong.textContent = title;
    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = text;
    card.append(strong, body);
    if (walletId) card.dataset.wallet = walletId;
    return card;
  }
})();
