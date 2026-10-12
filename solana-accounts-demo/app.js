(function () {
  const api = window.SolanaLedger;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const CHECKS = [
    ['signer', 'Signer check', 'is_signer'],
    ['owner', 'Owner check', 'AccountInfo::owner'],
    ['type', 'Type check', 'type byte'],
    ['math', 'Checked math', 'u32 add'],
    ['programId', 'Program id', 'invoke target'],
  ];
  const ROLE = {
    from: 'From',
    to: 'To',
    user: 'User account',
    authority: 'Authority',
    config: 'Config',
    admin: 'Admin',
    newAdmin: 'New admin',
    vault: 'Vault',
    destination: 'Destination',
    tokenProgram: 'Token program',
  };
  const IX = {
    transfer: 'System transfer',
    credit_user: 'Till records the deposit',
    update_admin: 'Till writes a new admin',
    withdraw_restricted: 'Till pays the admin from the vault',
    withdraw_token: 'Till pays a recorded balance',
    withdraw_spl: 'Till invokes a token program',
  };

  let ledger = api.createLedger();
  let checks = api.defaultChecks();
  let tx = api.buildScenario('deposit');
  const cards = new Map();

  renderChecks();
  renderScenarios();
  renderLedger();
  loadScenario('deposit');

  document.querySelector('#reset').addEventListener('click', function () {
    ledger = api.createLedger();
    checks = api.defaultChecks();
    syncChecks();
    renderLedger();
    loadScenario(tx.id || 'deposit');
  });
  document.querySelector('#send').addEventListener('click', send);

  function renderChecks() {
    const host = document.querySelector('#toggles');
    CHECKS.forEach(function (row) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.dataset.check = row[0];
      input.addEventListener('change', function () {
        checks[row[0]] = input.checked;
      });
      const text = document.createElement('span');
      text.textContent = row[1];
      const small = document.createElement('small');
      small.textContent = row[2];
      text.appendChild(small);
      label.append(input, text);
      host.appendChild(label);
    });
  }

  function syncChecks() {
    document.querySelectorAll('#toggles input').forEach(function (input) {
      input.checked = checks[input.dataset.check] !== false;
    });
  }

  function renderScenarios() {
    const host = document.querySelector('#scenarios');
    api.SCENARIOS.forEach(function (scenario) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = scenario.title;
      button.dataset.group = scenario.group;
      button.dataset.id = scenario.id;
      button.addEventListener('click', function () { loadScenario(scenario.id); });
      host.appendChild(button);
    });
  }

  function loadScenario(id) {
    tx = api.buildScenario(id);
    document.querySelectorAll('.scenarios button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.id === id ? 'true' : 'false');
    });
    const scenario = api.SCENARIOS.filter(function (item) { return item.id === id; })[0];
    document.querySelector('#blurb').textContent = scenario ? scenario.blurb : '';
    renderComposer();
    markInvolved();
    const receipt = document.querySelector('#receipt');
    receipt.className = 'receipt';
    receipt.replaceChildren();
    const waiting = document.createElement('p');
    waiting.textContent = 'Not sent. The highlighted cards are the ones this transaction names.';
    receipt.appendChild(waiting);
  }

  function renderComposer() {
    const payer = ledger.accounts[tx.feePayer];
    document.querySelector('#payer').textContent = 'Fee payer ' + payer.name + ' · ' + api.shortAddress(payer.address) + ' · fee 5,000 lamports';
    const steps = document.querySelector('#steps');
    steps.replaceChildren();
    tx.instructions.forEach(function (instruction, index) {
      const block = document.createElement('div');
      block.className = 'step';
      const title = document.createElement('h3');
      const program = ledger.accounts[instruction.programId];
      title.textContent = (index + 1) + '. ' + (IX[instruction.data.ix] || instruction.data.ix) + ' · ' + (program ? program.name : 'program');
      block.appendChild(title);
      instruction.accounts.forEach(function (account, slot) {
        block.appendChild(renderSlot(index, slot, account));
      });
      steps.appendChild(block);
    });
    const amount = firstAmount(tx);
    const label = document.querySelector('#amount-label');
    const input = document.querySelector('#amount');
    if (amount == null) {
      label.hidden = true;
    } else {
      label.hidden = false;
      input.value = String(amount);
    }
  }

  function renderSlot(index, slot, account) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    const selectLabel = document.createElement('label');
    selectLabel.textContent = ROLE[account.role] || account.role;
    const select = document.createElement('select');
    select.dataset.ix = String(index);
    select.dataset.slot = String(slot);
    select.dataset.field = 'address';
    Object.keys(ledger.accounts).forEach(function (address) {
      const option = document.createElement('option');
      option.value = address;
      option.textContent = ledger.accounts[address].name + ' · ' + api.shortAddress(address);
      if (address === account.address) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', function () {
      const signer = wrap.querySelector('[data-field="signer"]');
      if (select.value === tx.feePayer) {
        signer.checked = true;
        signer.disabled = true;
      } else {
        signer.disabled = false;
      }
      markInvolved();
    });
    selectLabel.appendChild(select);

    const flags = document.createElement('div');
    flags.className = 'flags';
    flags.appendChild(flagBox(index, slot, 'signer', 'Signed', account.isSigner, account.address === tx.feePayer));
    flags.appendChild(flagBox(index, slot, 'writable', 'Writable', account.isWritable, false));
    wrap.append(selectLabel, flags);
    return wrap;
  }

  function flagBox(index, slot, field, text, checked, locked) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked || locked;
    input.disabled = locked;
    input.dataset.ix = String(index);
    input.dataset.slot = String(slot);
    input.dataset.field = field;
    label.append(input, document.createTextNode(text));
    return label;
  }

  function firstAmount(transaction) {
    let i;
    for (i = 0; i < transaction.instructions.length; i += 1) {
      const amount = transaction.instructions[i].data && transaction.instructions[i].data.amount;
      if (amount) return amount;
    }
    return null;
  }

  function readForm() {
    const amountInput = document.querySelector('#amount');
    const amount = amountInput && !document.querySelector('#amount-label').hidden ? Number(amountInput.value) : null;
    const instructions = tx.instructions.map(function (instruction, index) {
      const accounts = instruction.accounts.map(function (account, slot) {
        const select = document.querySelector('[data-ix="' + index + '"][data-slot="' + slot + '"][data-field="address"]');
        const signer = document.querySelector('[data-ix="' + index + '"][data-slot="' + slot + '"][data-field="signer"]');
        const writable = document.querySelector('[data-ix="' + index + '"][data-slot="' + slot + '"][data-field="writable"]');
        return {
          role: account.role,
          address: select.value,
          isSigner: signer.checked,
          isWritable: writable.checked,
        };
      });
      const nextAmount = instruction.data.amount && amount != null ? amount : instruction.data.amount;
      return {
        programId: instruction.programId,
        data: {ix: instruction.data.ix, amount: nextAmount},
        accounts: accounts,
      };
    });
    const signatures = [tx.feePayer];
    instructions.forEach(function (instruction) {
      instruction.accounts.forEach(function (account) {
        if (account.isSigner && signatures.indexOf(account.address) === -1) signatures.push(account.address);
      });
    });
    return {id: tx.id, feePayer: tx.feePayer, signatures: signatures, instructions: instructions};
  }

  function send() {
    const previous = ledger;
    const submitted = readForm();
    const result = api.execute(ledger, submitted, checks);
    ledger = result.ledger;
    renderLedger();
    flash(result.changes);
    fly(previous, result);
    renderReceipt(result);
  }

  function renderReceipt(result) {
    const receipt = document.querySelector('#receipt');
    receipt.className = 'receipt ' + (result.ok ? 'ok' : 'bad');
    receipt.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = result.ok ? 'Committed' : 'Rejected';
    receipt.appendChild(title);
    if (result.error) {
      const code = document.createElement('p');
      code.className = 'code';
      code.textContent = result.error;
      receipt.appendChild(code);
    }
    result.log.forEach(function (line) {
      const p = document.createElement('p');
      p.textContent = line;
      receipt.appendChild(p);
    });
    if (result.why && result.log.indexOf(result.why) === -1) {
      const why = document.createElement('p');
      why.textContent = result.why;
      receipt.appendChild(why);
    }
  }

  function renderLedger() {
    const host = document.querySelector('#ledger');
    if (!host.dataset.built) {
      host.dataset.built = '1';
      const legend = document.createElement('ul');
      legend.className = 'legend';
      legend.appendChild(swatch('type', 'type'));
      legend.appendChild(swatch('pubkey', 'pubkey'));
      legend.appendChild(swatch('number', 'numbers'));
      legend.appendChild(swatch('code', 'bytecode stand-in'));
      host.appendChild(legend);
      [['program', 'Programs'], ['data', 'Data accounts'], ['wallet', 'Wallets']].forEach(function (group) {
        const section = document.createElement('section');
        section.className = 'group';
        const heading = document.createElement('h2');
        heading.textContent = group[1];
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.id = 'group-' + group[0];
        section.append(heading, grid);
        host.appendChild(section);
      });
      Object.keys(ledger.accounts).forEach(function (address) {
        const account = ledger.accounts[address];
        const card = buildCard(account);
        document.querySelector('#group-' + account.group).appendChild(card);
        cards.set(address, card);
      });
    }
    cards.forEach(function (card, address) {
      updateCard(card, ledger.accounts[address]);
    });
  }

  function swatch(kind, text) {
    const li = document.createElement('li');
    const sw = document.createElement('i');
    sw.style.background = kind === 'type' ? '#e0a106' : kind === 'pubkey' ? '#3d4a8a' : kind === 'number' ? '#1f8a70' : '#e15b48';
    li.append(sw, document.createTextNode(text));
    return li;
  }

  function buildCard(account) {
    const card = document.createElement('article');
    card.className = 'account';
    card.dataset.address = account.address;
    const head = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = account.name;
    const flag = document.createElement('span');
    flag.className = 'flag';
    head.append(title, flag);
    const kind = document.createElement('p');
    kind.className = 'id-kind';
    const addr = document.createElement('p');
    addr.className = 'addr';
    const lamports = document.createElement('p');
    lamports.className = 'lamports';
    const sol = document.createElement('p');
    sol.className = 'sol';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('span');
    bar.appendChild(fill);
    const owner = document.createElement('p');
    owner.className = 'owner';
    const data = document.createElement('p');
    data.className = 'data-line';
    const note = document.createElement('p');
    note.className = 'note';
    const bytes = document.createElement('div');
    bytes.className = 'bytes';
    card.append(head, kind, addr, lamports, sol, bar, owner, data, note, bytes);
    card._els = {flag: flag, kind: kind, addr: addr, lamports: lamports, sol: sol, fill: fill, owner: owner, data: data, note: note, bytes: bytes};
    return card;
  }

  function updateCard(card, account) {
    const els = card._els;
    const previous = Number(card.dataset.lamports || account.lamports);
    els.flag.textContent = account.executable ? 'executable' : 'data';
    els.flag.classList.toggle('on', account.executable);
    els.kind.textContent = account.wellKnown ? 'well-known id' : 'stand-in address';
    els.addr.textContent = account.address;
    els.sol.textContent = api.formatSol(account.lamports) + ' SOL';
    const owner = ledger.accounts[account.owner];
    els.owner.textContent = 'owner ' + (owner ? owner.name : api.shortAddress(account.owner));
    els.data.textContent = api.describeData(ledger, account).line;
    els.note.textContent = account.note;
    els.fill.style.width = fillWidth(account.lamports);
    if (previous !== account.lamports && card.dataset.lamports) tween(els.lamports, previous, account.lamports);
    else els.lamports.textContent = api.formatLamports(account.lamports);
    card.dataset.lamports = String(account.lamports);
    paintBytes(els.bytes, account);
  }

  function fillWidth(lamports) {
    if (lamports <= 0) return '0%';
    const pct = (Math.log10(lamports) / Math.log10(5000000000)) * 100;
    return Math.max(8, Math.min(100, pct)) + '%';
  }

  function tween(el, from, to) {
    if (reduce.matches) {
      el.textContent = api.formatLamports(to);
      return;
    }
    const started = performance.now();
    function step(now) {
      const t = Math.min(1, (now - started) / 480);
      const value = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      el.textContent = api.formatLamports(value);
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  function paintBytes(host, account) {
    const stamp = account.data.length + ':' + api.hex(account.data, 8);
    if (host.dataset.stamp === stamp) return;
    host.dataset.stamp = stamp;
    host.replaceChildren();
    const kinds = [];
    api.regions(account).forEach(function (region) {
      let i;
      for (i = region.start; i < region.end; i += 1) kinds[i] = region.kind;
    });
    let i;
    for (i = 0; i < account.data.length; i += 1) {
      const cell = document.createElement('i');
      cell.className = kinds[i] || 'raw';
      host.appendChild(cell);
    }
  }

  function flash(changes) {
    const seen = {};
    changes.forEach(function (change) { seen[change.address] = true; });
    Object.keys(seen).forEach(function (address) {
      const card = cards.get(address);
      if (!card) return;
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
    });
  }

  function fly(before, result) {
    if (reduce.matches) return;
    const downs = result.changes.filter(function (change) {
      return change.field === 'lamports' && change.after < change.before;
    });
    const ups = result.changes.filter(function (change) {
      return change.field === 'lamports' && change.after > change.before;
    });
    if (!downs.length) return;
    const from = cards.get(downs[0].address);
    const to = ups.length ? cards.get(ups[0].address) : null;
    if (!from) return;
    const start = from.getBoundingClientRect();
    if (start.bottom < 0 || start.top > window.innerHeight) return;
    const coin = document.createElement('div');
    coin.className = 'coin';
    coin.style.left = (start.left + start.width / 2) + 'px';
    coin.style.top = (start.top + 28) + 'px';
    document.body.appendChild(coin);
    window.requestAnimationFrame(function () {
      if (to) {
        const end = to.getBoundingClientRect();
        coin.style.left = (end.left + end.width / 2) + 'px';
        coin.style.top = (end.top + 28) + 'px';
      } else {
        coin.style.top = (start.top - 40) + 'px';
        coin.style.opacity = '0';
      }
    });
    window.setTimeout(function () { coin.remove(); }, 700);
  }

  function markInvolved() {
    const submitted = document.querySelector('#steps select') ? readForm() : tx;
    const involved = {};
    involved[submitted.feePayer] = true;
    submitted.instructions.forEach(function (instruction) {
      instruction.accounts.forEach(function (account) { involved[account.address] = true; });
    });
    cards.forEach(function (card, address) {
      card.classList.toggle('in-tx', Boolean(involved[address]));
    });
  }
})();
