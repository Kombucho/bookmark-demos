(function () {
  const api = window.MiniChain;
  const heldLiquid = document.querySelector('#held-liquid');
  const owedLiquid = document.querySelector('#owed-liquid');
  const heldNum = document.querySelector('#held-num');
  const owedNum = document.querySelector('#owed-num');
  const lamp = document.querySelector('#lamp');
  const lampText = document.querySelector('#lamp-text');
  const accountsEl = document.querySelector('#accounts');
  const statusEl = document.querySelector('#status');
  const transferBtn = document.querySelector('#transfer');
  const amountInput = document.querySelector('#amount');
  const wordInput = document.querySelector('#word');
  const budgetInput = document.querySelector('#budget');
  const budgetOut = document.querySelector('#budget-out');
  const valueInput = document.querySelector('#call-value');
  const bytesEl = document.querySelector('#bytes');
  const tapeEl = document.querySelector('#tape');
  const regsEl = document.querySelector('#regs');
  const slotEl = document.querySelector('#slot');
  const guestAddr = document.querySelector('#guest-addr');
  const haltEl = document.querySelector('#halt');
  const strip = document.querySelector('#strip');
  const detail = document.querySelector('#detail');
  const buttons = Array.from(document.querySelectorAll('button'));

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const program = api.disassemble(api.parseHex(api.COUNTER_HEX));
  const codeBytes = api.parseHex(api.COUNTER_HEX);

  let state = api.fresh();
  let who = 'alice';
  let busy = false;
  let selected = 0;
  let liveRegs = Array.from({ length: 16 }, function () { return 0n; });
  let livePc = null;
  let haltPc = null;

  document.querySelector('#who-alice').addEventListener('click', function () { setWho('alice'); });
  document.querySelector('#who-bob').addEventListener('click', function () { setWho('bob'); });
  document.querySelector('#deposit').addEventListener('click', function () { act(deposit); });
  document.querySelector('#deploy').addEventListener('click', function () { act(deploy); });
  document.querySelector('#call').addEventListener('click', function () { act(call); });
  document.querySelector('#transfer').addEventListener('click', function () { act(transfer); });
  document.querySelector('#withdraw').addEventListener('click', function () { act(withdraw); });
  document.querySelector('#tour').addEventListener('click', function () { act(tour); });
  budgetInput.addEventListener('input', function () {
    budgetOut.textContent = budgetInput.value;
  });

  drawProgram();
  drawRegs();
  render();

  function setWho(next) {
    who = next;
    document.querySelector('#who-alice').setAttribute('aria-pressed', who === 'alice' ? 'true' : 'false');
    document.querySelector('#who-bob').setAttribute('aria-pressed', who === 'bob' ? 'true' : 'false');
    transferBtn.textContent = who === 'alice' ? 'Transfer to Bob' : 'Transfer to Alice';
  }

  function setBusy(on) {
    busy = on;
    buttons.forEach(function (button) { button.disabled = on; });
  }

  async function act(fn) {
    if (busy) return;
    setBusy(true);
    try { await fn(); }
    finally { setBusy(false); }
  }

  function amount() {
    return api.parseEth(amountInput.value);
  }

  function word() {
    const text = String(wordInput.value).trim();
    if (!/^\d+$/.test(text)) return null;
    try { return BigInt(text); }
    catch (error) { return null; }
  }

  function callValue() {
    const parsed = api.parseEth(valueInput.value || '0');
    return parsed == null ? null : parsed;
  }

  function budget() {
    return Number(budgetInput.value);
  }

  async function deposit() {
    const value = amount();
    if (value == null) return say('Enter an ETH amount, such as 1 or 0.25.');
    await apply(await api.deposit(state, who, value), name(who) + ' deposited ' + api.formatEth(value) + ' ETH. No fee.');
  }

  async function withdraw() {
    const value = amount();
    if (value == null) return say('Enter an ETH amount to withdraw.');
    await apply(await api.withdraw(state, who, value), name(who) + ' withdrew ' + api.formatEth(value) + ' ETH. No fee.');
  }

  async function transfer() {
    const value = amount();
    if (value == null) return say('Enter an ETH amount to transfer.');
    const other = who === 'alice' ? 'bob' : 'alice';
    await apply(
      await api.transfer(state, who, other, value),
      name(who) + ' sent ' + api.formatEth(value) + ' ETH to ' + name(other) + '. The 0.001 ETH fee went to the owner.'
    );
  }

  async function deploy() {
    await apply(await api.deploy(state, who), name(who) + ' deployed the counter. The fee stayed inside the ledger.');
  }

  async function call() {
    const input = word();
    const attached = callValue();
    if (input == null) return say('The word to add has to be a whole number.');
    if (attached == null) return say('ETH sent with the call has to be a number, or 0.');
    if (!state.guest) return say('Deploy the counter first.');
    const need = api.FEE + attached;
    if (state.accounts[who] < need) {
      return say(name(who) + ' needs ' + api.formatEth(need) + ' ETH inside for this call.');
    }
    const preview = api.execute(state.guest.code, state.guest.storage, input, budget());
    haltPc = null;
    for (let i = 0; i < preview.trace.length; i++) {
      const step = preview.trace[i];
      liveRegs = step.regs;
      livePc = step.pc;
      drawTape();
      drawRegs();
      haltEl.textContent = 'Step ' + step.steps + ' of the budget ' + budget() + ' · ' + api.formatOp(step);
      if (!reduceQuery.matches) await wait(220);
    }
    if (!preview.ok) {
      haltPc = preview.haltedAt;
      livePc = null;
      drawTape();
      haltEl.textContent = preview.reason + ' Storage rolls back. The fee still moves.';
    }
    const result = await api.callGuest(state, who, input, budget(), attached);
    if (!result.ok) return say(result.error);
    state = result.state;
    selected = state.height;
    if (result.reverted) {
      say(result.error + ' Block ' + result.block.height + ' records the revert. Slot 0 is unchanged.');
    } else {
      const returned = result.run.returned == null ? 'nothing' : result.run.returned.toString();
      say('Call returned ' + returned + '. Slot 0 is ' + api.slotZero(state).toString() + '.');
      haltEl.textContent = 'Returned ' + returned + ' in ' + result.run.steps + ' steps.';
      haltPc = null;
    }
    render();
  }

  async function tour() {
    state = api.fresh();
    liveRegs = Array.from({ length: 16 }, function () { return 0n; });
    livePc = null;
    haltPc = null;
    selected = 0;
    wordInput.value = '7';
    if (budget() < 5) {
      budgetInput.value = '8';
      budgetOut.textContent = '8';
    }
    render();
    say('Empty contract. Alice deposits 1 ETH.');
    await wait(reduceQuery.matches ? 0 : 280);
    let result = await api.deposit(state, 'alice', api.ETHER);
    if (!take(result, 'Alice deposited 1 ETH.')) return;
    await wait(reduceQuery.matches ? 0 : 320);
    result = await api.deploy(state, 'alice');
    if (!take(result, 'The counter is in the contract’s state.')) return;
    await wait(reduceQuery.matches ? 0 : 320);
    const input = 7n;
    const preview = api.execute(state.guest.code, state.guest.storage, input, budget());
    for (let i = 0; i < preview.trace.length; i++) {
      liveRegs = preview.trace[i].regs;
      livePc = preview.trace[i].pc;
      drawTape();
      drawRegs();
      if (!reduceQuery.matches) await wait(180);
    }
    result = await api.callGuest(state, 'alice', input, budget(), 0n);
    if (!take(result, result.reverted ? result.error : 'The counter returned 7.')) return;
    await wait(reduceQuery.matches ? 0 : 320);
    result = await api.withdraw(state, 'alice', api.ETHER / 4n);
    take(result, 'Alice withdrew 0.25 ETH. The rest is still inside. Held still matches owed.');
  }

  function take(result, message) {
    if (!result.ok) {
      say(result.error);
      return false;
    }
    state = result.state;
    selected = state.height;
    say(message);
    render();
    return true;
  }

  async function apply(result, message) {
    if (!result.ok) return say(result.error);
    state = result.state;
    selected = state.height;
    say(message);
    render();
  }

  function say(text) {
    statusEl.textContent = text;
  }

  function render() {
    const held = state.held;
    const inside = api.owed(state);
    const matched = api.invariant(state);
    heldNum.textContent = api.formatEth(held);
    owedNum.textContent = api.formatEth(inside);
    heldLiquid.style.height = level(held);
    owedLiquid.style.height = level(inside);
    lamp.classList.toggle('is-bad', !matched);
    lampText.textContent = matched ? 'In balance' : 'Out of balance';
    guestAddr.textContent = state.guest ? state.guest.address : 'not deployed';
    const slot = api.slotZero(state);
    slotEl.textContent = slot == null ? 'Slot 0 is empty. Deploy, then call.' : 'Slot 0 holds ' + slot.toString() + '.';
    drawAccounts();
    drawTape();
    drawRegs();
    drawStrip();
    drawDetail();
  }

  function level(wei) {
    const cap = api.ETHER * 2n;
    const pct = wei <= 0n ? 0 : wei >= cap ? 100 : Number((wei * 100n) / cap);
    return pct + '%';
  }

  function drawAccounts() {
    const rows = [
      ['Alice', state.accounts.alice, 'deposits and calls'],
      ['Bob', state.accounts.bob, 'the other account'],
      ['Fee owner', state.accounts.owner, 'fees land here'],
    ];
    if (state.guest) rows.push(['Guest', state.guest.balance, state.guest.address]);
    accountsEl.replaceChildren();
    rows.forEach(function (row) {
      const li = document.createElement('li');
      const label = document.createElement('div');
      const whoEl = document.createElement('span');
      whoEl.className = 'who';
      whoEl.textContent = row[0];
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = row[2];
      label.append(whoEl, sub);
      const bal = document.createElement('span');
      bal.className = 'bal';
      bal.textContent = api.formatEth(row[1]);
      li.append(label, bal);
      accountsEl.appendChild(li);
    });
  }

  function drawProgram() {
    codeBytes.forEach(function (byte, index) {
      const li = document.createElement('li');
      if (index % 4 === 0) li.className = 'word';
      li.textContent = byte.toString(16).padStart(2, '0');
      bytesEl.appendChild(li);
    });
  }

  function drawTape() {
    tapeEl.replaceChildren();
    program.forEach(function (op) {
      const li = document.createElement('li');
      if (op.pc === livePc) li.className = 'on';
      else if (op.pc === haltPc) li.className = 'halt';
      const pc = document.createElement('span');
      pc.textContent = hex(op.pc);
      const text = document.createElement('span');
      text.textContent = api.formatOp(op);
      li.append(pc, text);
      tapeEl.appendChild(li);
    });
  }

  function drawRegs() {
    regsEl.replaceChildren();
    liveRegs.forEach(function (value, index) {
      const li = document.createElement('li');
      const touched = livePc != null && program.some(function (op) {
        return op.pc === livePc && (op.a === index || op.b === index || op.c === index);
      });
      if (touched) li.className = 'on';
      const name = document.createElement('span');
      name.className = 'r';
      name.textContent = 'r' + index;
      const shown = document.createElement('span');
      shown.className = 'v';
      shown.textContent = value.toString();
      li.append(name, shown);
      regsEl.appendChild(li);
    });
  }

  function drawStrip() {
    strip.replaceChildren();
    strip.appendChild(blockButton({
      height: 0,
      kind: 'genesis',
      prev: '',
      head: api.GENESIS,
      status: 'start',
      who: '',
    }, true));
    state.blocks.forEach(function (block) {
      strip.appendChild(blockButton(block, false));
    });
  }

  function blockButton(block, genesis) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'block' + (block.status === 'reverted' ? ' is-reverted' : '');
    button.setAttribute('aria-pressed', selected === block.height ? 'true' : 'false');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = genesis ? 'start' : 'block ' + block.height;
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = genesis ? 'genesis' : block.op.kind;
    const link = document.createElement('span');
    link.className = 'link';
    const prev = document.createElement('span');
    prev.textContent = genesis ? '—' : api.shortHash(block.prev);
    prev.style.color = genesis ? '' : hue(block.prev);
    const head = document.createElement('span');
    head.textContent = api.shortHash(block.head);
    head.style.color = hue(block.head);
    link.append(prev, document.createTextNode(' → '), head);
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = genesis ? 'zero head' : block.status + (block.op.who ? ' · ' + block.op.who : '');
    button.append(n, kind, link, mark);
    button.addEventListener('click', function () {
      selected = block.height;
      drawStrip();
      drawDetail();
    });
    return button;
  }

  function drawDetail() {
    if (selected === 0) {
      detail.textContent = 'Genesis head\n' + api.GENESIS + '\n\nThe first operation hashes this head, the next height, and the operation JSON.';
      return;
    }
    const block = state.blocks[selected - 1];
    if (!block) {
      detail.textContent = '';
      return;
    }
    detail.textContent = [
      'block ' + block.height + ' · ' + block.op.kind + ' · ' + block.status,
      'prev ' + block.prev,
      'head ' + block.head,
      '',
      'SHA-256 over',
      block.payload,
    ].join('\n');
  }

  function hue(hex) {
    const n = parseInt(String(hex).slice(2, 8), 16);
    return 'hsl(' + (n % 360) + ' 62% 32%)';
  }

  function hex(n) {
    return '0x' + n.toString(16).padStart(2, '0');
  }

  function name(id) {
    return api.nameOf(id);
  }

  function wait(ms) {
    if (!ms) return Promise.resolve();
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
})();
