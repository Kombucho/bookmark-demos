(function () {
  const desk = window.MemeMechanics;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motion.matches;
  motion.addEventListener('change', function (event) { reduce = event.matches; });

  const world = desk.createWorld();
  const notes = {};
  let speed = 1;
  let timer = null;
  let bridgeTimer = null;
  const open = desk.V_NEAR / desk.V_TOKEN;

  const textCache = new Map();
  function setText(id, value) {
    if (textCache.get(id) === value) return;
    textCache.set(id, value);
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function near(n) {
    return Number(n).toLocaleString('en-US', {minimumFractionDigits: 4, maximumFractionDigits: 4});
  }

  function tokens(n) {
    return Math.round(Number(n)).toLocaleString('en-US');
  }

  function price(n) {
    return Number(n).toFixed(6);
  }

  function fit(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx: ctx, w: rect.width, h: rect.height};
  }

  function remember(ev) {
    if (!ev || !ev.id) return;
    if (ev.reason === 'cap') notes[ev.id] = ev;
    else if (!notes[ev.id] || notes[ev.id].reason !== 'cap') notes[ev.id] = ev;
  }

  function say(ev) {
    if (!ev) return '';
    const who = ev.id && world.wallets[ev.id] ? world.wallets[ev.id].name : 'The desk';
    const tick = 'Tick ' + world.time + '. ';
    if (ev.type === 'rule' && ev.fired) {
      return tick + 'Treasury rule. Spent ' + near(ev.spent) + ' NEAR and burned ' + tokens(ev.burned) + ' KEEL. Spot is ' + price(ev.price) + '.';
    }
    if (ev.reason === 'cap') {
      return tick + who + ' asked for ' + tokens(ev.wanted) + ' KEEL. The cap is ' + tokens(ev.cap) + ', and this wallet holds ' + tokens(ev.held) + '. The order was refused.';
    }
    if (!ev.ok) return tick + who + ' was refused (' + ev.reason + ').';
    if (ev.type === 'buy') return tick + who + ' bought ' + tokens(ev.tokens) + ' KEEL for ' + near(ev.cost) + ' NEAR, fee ' + near(ev.fee) + '.';
    if (ev.type === 'sell') return tick + who + ' sold ' + tokens(ev.tokens) + ' KEEL and received ' + near(ev.net) + ' NEAR after the fee.';
    if (ev.type === 'stake') return tick + who + ' staked ' + tokens(ev.tokens) + ' KEEL.';
    if (ev.type === 'unstake') return tick + who + ' unstaked ' + tokens(ev.tokens) + ' KEEL.';
    if (ev.type === 'claim') return tick + who + ' claimed ' + near(ev.near) + ' NEAR.';
    if (ev.type === 'bridge-near') return tick + who + ' locked ' + tokens(ev.tokens) + ' KEEL on Solana. The same amount was minted on NEAR.';
    if (ev.type === 'bridge-source') return tick + who + ' burned ' + tokens(ev.tokens) + ' KEEL on NEAR and unlocked it on Solana.';
    return '';
  }

  function narrate(events) {
    if (!events || !events.length) return;
    events.forEach(remember);
    const rule = events.find(function (ev) { return ev.type === 'rule' && ev.fired; });
    const cap = events.find(function (ev) { return ev.reason === 'cap'; });
    const bridge = events.find(function (ev) { return ev.type === 'bridge-near' || ev.type === 'bridge-source'; });
    const pick = rule || cap || bridge || events[events.length - 1];
    const line = say(pick);
    if (line) setText('event', line);
    if (bridge && bridge.ok) runBridge(bridge);
    if (rule) document.getElementById('treasury').classList.add('fired');
  }

  function runBridge(ev) {
    const forward = ev.type === 'bridge-near';
    const labels = forward ? ['Lock', 'Sign', 'Mint'] : ['Burn', 'Sign', 'Unlock'];
    const stops = ['0%', '50%', '100%'];
    for (let i = 0; i < 3; i++) {
      const node = document.getElementById('st-' + i);
      node.textContent = labels[i];
      node.classList.remove('on');
    }
    const bead = document.getElementById('bead');
    const who = world.wallets[ev.id].name;
    if (bridgeTimer) clearInterval(bridgeTimer);
    function show(step) {
      bead.style.setProperty('--p', stops[step]);
      for (let i = 0; i <= step; i++) document.getElementById('st-' + i).classList.add('on');
      const word = labels[step].toLowerCase();
      setText('bridge-caption', who + ' · ' + tokens(ev.tokens) + ' KEEL · ' + word + '.');
    }
    if (reduce) {
      show(2);
      return;
    }
    show(0);
    let step = 0;
    bridgeTimer = setInterval(function () {
      step += 1;
      if (step > 2) {
        clearInterval(bridgeTimer);
        bridgeTimer = null;
        return;
      }
      show(step);
    }, 280);
  }

  function renderWallets() {
    const list = document.getElementById('wallet-list');
    list.replaceChildren();
    desk.WALLET_ORDER.forEach(function (id) {
      const w = world.wallets[id];
      const held = desk.holdings(w);
      const li = document.createElement('li');
      li.className = 'wallet' + (id === 'you' ? ' you' : '') + (held >= desk.CAP - 1e-9 ? ' at-cap' : '');
      const who = document.createElement('div');
      who.className = 'who';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = w.name;
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = w.kind;
      who.append(name, kind);
      li.append(who);
      li.append(line(near(w.near) , ' NEAR'));
      li.append(line(tokens(w.broth), ' KEEL on the curve'));
      li.append(line(tokens(w.staked), ' staked · ' + near(desk.pendingOf(world, id)) + ' claimable'));
      li.append(line(tokens(w.nearSide), ' minted on NEAR'));
      const bar = document.createElement('div');
      bar.className = 'capbar';
      bar.style.setProperty('--p', Math.min(100, (held / desk.CAP) * 100) + '%');
      bar.title = tokens(held) + ' of ' + tokens(desk.CAP);
      const fill = document.createElement('span');
      bar.append(fill);
      li.append(bar);
      const note = notes[id];
      if (note && note.reason === 'cap') {
        const flag = document.createElement('p');
        flag.className = 'flag';
        flag.textContent = 'Cap refused an order for ' + tokens(note.wanted) + '.';
        li.append(flag);
      }
      list.append(li);
    });
  }

  function line(strong, rest) {
    const p = document.createElement('p');
    p.className = 'bal';
    const b = document.createElement('b');
    b.textContent = strong;
    p.append(b, document.createTextNode(rest));
    return p;
  }

  function render() {
    const spot = desk.spotOf(world);
    const issued = desk.issuedOf(world);
    setText('tick', String(world.time));
    setText('spot', price(spot));
    const pct = ((spot / open) - 1) * 100;
    setText('delta', (pct >= 0 ? '+' : '') + pct.toFixed(2) + '% from the open');
    setText('issued', tokens(issued));
    setText('burned', tokens(world.burned));
    setText('k-val', Math.round(desk.kOf(world)).toLocaleString('en-US'));
    setText('reserve', near(world.realNear));
    setText('pool', tokens(world.totalStaked));
    setText('your-stake', tokens(world.wallets.you.staked));
    setText('claimable', near(desk.pendingOf(world, 'you')));
    setText('index', world.accFeePerStake.toFixed(6));
    setText('treasury-now', near(world.treasury));
    setText('burned-hero', tokens(world.burned));
    const meter = document.getElementById('meter');
    const ratio = Math.max(0, Math.min(1, world.treasury / desk.THRESHOLD));
    document.getElementById('meter-fill').style.width = (ratio * 100) + '%';
    meter.setAttribute('aria-valuenow', world.treasury.toFixed(4));
    meter.setAttribute('aria-valuemax', String(desk.THRESHOLD));
    if (world.lastRule) {
      setText('rule-line', 'Last rule at tick ' + world.lastRule.time + '. Spent ' + near(world.lastRule.spent) + ' NEAR, burned ' + tokens(world.lastRule.burned) + ' KEEL.');
    }
    setText('src-bal', tokens(world.wallets.you.broth));
    setText('near-bal', tokens(world.wallets.you.nearSide));
    setText('escrow', tokens(world.escrow));
    setText('minted', tokens(world.minted));
    renderWallets();
    drawChart();
    writeQuote();
  }

  function writeQuote() {
    const amount = Number(document.getElementById('amount').value);
    const buyQ = desk.previewBuy(world, 'you', amount);
    const sellQ = desk.previewSell(world, 'you', amount);
    const parts = [];
    if (buyQ.ok) parts.push('Buy ' + tokens(buyQ.tokens) + ' for ' + near(buyQ.cost) + ' NEAR + ' + near(buyQ.fee) + ' fee. Spot after ' + price(buyQ.price) + '.');
    else if (buyQ.reason === 'cap') parts.push('Buy refused. Cap ' + tokens(buyQ.cap) + ', held ' + tokens(buyQ.held) + '.');
    else if (buyQ.reason === 'funds') parts.push('Buy needs ' + near(buyQ.total) + ' NEAR. You have ' + near(buyQ.near) + '.');
    else parts.push('Buy is not available.');
    if (sellQ.ok) parts.push(' Sell returns ' + near(sellQ.net) + ' NEAR after the fee.');
    else if (sellQ.reason === 'balance') parts.push(' Sell needs ' + tokens(sellQ.wanted) + ' KEEL on the curve. You have ' + tokens(sellQ.broth) + '.');
    setText('quote', parts.join(''));
  }

  function drawChart() {
    const canvas = document.getElementById('chart');
    const box = fit(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    ctx.clearRect(0, 0, w, h);
    const padL = 78;
    const padR = 12;
    const padT = 12;
    const tapeH = Math.max(64, h * 0.24);
    const plotB = h - tapeH - 16;
    const issued = Math.max(0, desk.issuedOf(world));
    const qMax = Math.max(20000, issued * 1.35);
    const yMax = desk.priceAt(Math.min(qMax, desk.V_TOKEN - 1)) * 1.05;
    const yMin = open * 0.94;
    function X(q) { return padL + (q / qMax) * (w - padL - padR); }
    function Y(p) { return padT + (1 - (p - yMin) / (yMax - yMin)) * (plotB - padT); }

    ctx.strokeStyle = '#e4d8c4';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6a5b4c';
    ctx.font = '11px ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const p = yMin + ((yMax - yMin) * i) / 3;
      const y = Y(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(6), padL - 6, y);
    }

    ctx.strokeStyle = '#1b140f';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, plotB);
    ctx.lineTo(w - padR, plotB);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#b43322';
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= 80; i++) {
      const q = (qMax * i) / 80;
      const x = X(q);
      const y = Y(desk.priceAt(q));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const spot = desk.spotOf(world);
    const qx = X(issued);
    const qy = Y(spot);
    ctx.strokeStyle = '#1b140f';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, qy);
    ctx.lineTo(qx, qy);
    ctx.lineTo(qx, plotB);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1b140f';
    ctx.fillRect(qx - 3, qy - 3, 6, 6);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#6a5b4c';
    ctx.fillText('issued KEEL', w - padR, plotB + 14);

    const tape = world.tape;
    const tapeTop = plotB + 28;
    const tapeBot = h - 10;
    let lo = tape[0];
    let hi = tape[0];
    for (let i = 0; i < tape.length; i++) {
      if (tape[i] < lo) lo = tape[i];
      if (tape[i] > hi) hi = tape[i];
    }
    const span = hi - lo || 1e-6;
    const paddedLo = lo - span * 0.15;
    const paddedHi = hi + span * 0.15;
    ctx.textAlign = 'left';
    ctx.fillText('tape', padL, tapeTop - 4);
    ctx.beginPath();
    ctx.strokeStyle = '#1e5c40';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < tape.length; i++) {
      const x = padL + (i / Math.max(1, tape.length - 1)) * (w - padL - padR);
      const y = tapeTop + (1 - (tape[i] - paddedLo) / (paddedHi - paddedLo)) * (tapeBot - tapeTop);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function amount() {
    return Number(document.getElementById('amount').value);
  }

  function userAct(ev) {
    const events = [];
    if (ev) events.push(ev);
    if (ev && ev.rule) events.push(ev.rule);
    narrate(events);
    if (ev && ev.ok && (ev.type === 'buy' || ev.type === 'sell' || ev.type === 'rule')) desk.markTape(world);
    render();
  }

  document.getElementById('buy').addEventListener('click', function () {
    userAct(desk.buy(world, 'you', amount()));
  });
  document.getElementById('sell').addEventListener('click', function () {
    userAct(desk.sell(world, 'you', amount()));
  });
  document.getElementById('stake-btn').addEventListener('click', function () {
    userAct(desk.stake(world, 'you', amount()));
  });
  document.getElementById('unstake-btn').addEventListener('click', function () {
    userAct(desk.unstake(world, 'you', amount()));
  });
  document.getElementById('claim').addEventListener('click', function () {
    userAct(desk.claim(world, 'you'));
  });
  document.getElementById('bridge-go').addEventListener('click', function () {
    userAct(desk.bridgeToNear(world, 'you', amount()));
  });
  document.getElementById('bridge-back').addEventListener('click', function () {
    userAct(desk.bridgeToSource(world, 'you', amount()));
  });
  document.getElementById('amount').addEventListener('input', writeQuote);

  function tick() {
    const events = desk.step(world);
    narrate(events);
    render();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    document.getElementById('play').disabled = false;
    document.getElementById('pause').disabled = true;
  }

  function play() {
    stop();
    document.getElementById('play').disabled = true;
    document.getElementById('pause').disabled = false;
    timer = setInterval(tick, speed === 4 ? 120 : 480);
  }

  document.getElementById('play').addEventListener('click', play);
  document.getElementById('pause').addEventListener('click', stop);
  document.getElementById('step').addEventListener('click', function () {
    stop();
    tick();
  });

  function setSpeed(next) {
    speed = next;
    document.getElementById('speed-1').setAttribute('aria-pressed', next === 1 ? 'true' : 'false');
    document.getElementById('speed-4').setAttribute('aria-pressed', next === 4 ? 'true' : 'false');
    if (timer) play();
  }
  document.getElementById('speed-1').addEventListener('click', function () { setSpeed(1); });
  document.getElementById('speed-4').addEventListener('click', function () { setSpeed(4); });

  setText('cap-label', tokens(desk.CAP));
  setText('fee-label', (desk.FEE_BPS / 100).toFixed(2) + '%');
  setText('staker-split', String(desk.STAKER_BPS / 100) + '%');
  setText('threshold-label', near(desk.THRESHOLD) + ' NEAR');
  setText('treasury-max', near(desk.THRESHOLD));

  window.addEventListener('resize', drawChart);
  render();
})();
