(function () {
  const Pool = window.PairPool;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const INK = '#1c1917';
  const HOLD = '#1f6b45';
  const FLAT = '#8c3a22';
  const GRID = '#e6dfd2';
  const PAPER = '#fffdf8';

  const priceEl = document.querySelector('#price');
  const kEl = document.querySelector('#k');
  const kNote = document.querySelector('#k-note');
  const ps0 = document.querySelector('#ps0');
  const ps1 = document.querySelector('#ps1');
  const fee0El = document.querySelector('#fee0');
  const fee1El = document.querySelector('#fee1');
  const feesEl = document.querySelector('#fees');
  const cutEl = document.querySelector('#cut');
  const logEl = document.querySelector('#log');
  const storyEl = document.querySelector('#story');
  const captionEl = document.querySelector('#chart-caption');
  const canvas = document.querySelector('#chart');
  const feeInput = document.querySelector('#fee');
  const volInput = document.querySelector('#vol');
  const volumeInput = document.querySelector('#volume');
  const autoInput = document.querySelector('#auto');
  const runBtn = document.querySelector('#run');
  const compoundBtn = document.querySelector('#compound');
  const mintInput = document.querySelector('#mint-eth');
  const redeemInput = document.querySelector('#redeem-shares');
  const mintQuote = document.querySelector('#mint-quote');
  const redeemQuote = document.querySelector('#redeem-quote');
  const mintBtn = document.querySelector('#mint-btn');
  const redeemBtn = document.querySelector('#redeem-btn');

  let seed = 1;
  let rng = Pool.mulberry32(seed);
  let state = Pool.createState({feeBps: 30}).state;
  let timer = 0;
  let running = false;

  document.querySelector('#step').addEventListener('click', function () {
    stop();
    takeSteps(1);
  });
  runBtn.addEventListener('click', function () {
    if (running) {
      stop();
      return;
    }
    if (reduce.matches) {
      takeSteps(24);
      return;
    }
    running = true;
    runBtn.textContent = 'Stop';
    timer = window.setInterval(function () { takeSteps(1); }, 90);
  });
  document.querySelector('#compound').addEventListener('click', compoundNow);
  document.querySelector('#reset').addEventListener('click', reset);
  document.querySelector('#mint-form').addEventListener('submit', function (event) {
    event.preventDefault();
    mintNow();
  });
  document.querySelector('#redeem-form').addEventListener('submit', function (event) {
    event.preventDefault();
    redeemNow();
  });
  feeInput.addEventListener('change', function () {
    const next = Pool.setFeeBps(state, Number(feeInput.value));
    if (!next.ok) {
      say(next.error);
      return;
    }
    state = next.state;
    say('Fee tier is now ' + (Number(feeInput.value) / 100).toFixed(2) + '%.');
    render();
  });
  volInput.addEventListener('input', renderLabels);
  volumeInput.addEventListener('input', renderLabels);
  mintInput.addEventListener('input', renderDesk);
  redeemInput.addEventListener('input', renderDesk);

  if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas.parentElement);
  else window.addEventListener('resize', draw);

  render();
  say('Seeded with 100 ETH and 10,000 NVDA. You hold the shares. k is 1,000,000.');

  function opts() {
    return {
      volatility: Number(volInput.value) / 100,
      volume: Number(volumeInput.value) / 100,
      autoCompound: autoInput.checked,
      rng: rng,
    };
  }

  function takeSteps(count) {
    let i;
    for (i = 0; i < count; i += 1) {
      if (state.step >= 480) {
        stop();
        say('480 steps. Reset to start again.');
        render();
        return;
      }
      const beforeK = Pool.kOf(state.pool);
      const beforePrice = state.price;
      const stepped = Pool.stepState(state, opts());
      if (!stepped.ok) {
        stop();
        say(stepped.error);
        render();
        return;
      }
      state = stepped.state;
      if (count === 1) {
        const pool = state.pool;
        say('Price ' + fmt(beforePrice, 2) + ' → ' + fmt(state.price, 2) + '. ' + kPhrase(beforeK, Pool.kOf(pool)) + '. Uncollected ' + fmt(pool.fee0, 4) + ' ETH and ' + fmt(pool.fee1, 2) + ' NVDA.');
      }
    }
    if (count > 1) say(count + ' steps. Price is ' + fmt(state.price, 2) + '.');
    render();
  }

  function compoundNow() {
    const beforeK = Pool.kOf(state.pool);
    const done = Pool.compoundState(state);
    if (!done.ok) {
      say(done.error);
      return;
    }
    state = done.state;
    say('Kept ' + fmt(done.cut0, 4) + ' ETH and ' + fmt(done.cut1, 2) + ' NVDA. Folded the rest into the pool. ' + kPhrase(beforeK, Pool.kOf(state.pool)) + '.');
    render();
  }

  function mintNow() {
    const amount = Number(mintInput.value);
    const done = Pool.mintDesk(state, amount);
    if (!done.ok) {
      say(done.error);
      render();
      return;
    }
    state = done.state;
    say('Minted ' + fmt(done.shares, 2) + ' ETHNVDA for ' + fmt(done.amount0, 4) + ' ETH and ' + fmt(done.amount1, 2) + ' NVDA. Per share is unchanged.');
    render();
  }

  function redeemNow() {
    const shares = Number(redeemInput.value);
    const done = Pool.redeemDesk(state, shares);
    if (!done.ok) {
      say(done.error);
      render();
      return;
    }
    state = done.state;
    say('Redeemed ' + fmt(done.shares, 2) + ' shares for ' + fmt(done.amount0, 4) + ' ETH and ' + fmt(done.amount1, 2) + ' NVDA.');
    render();
  }

  function reset() {
    stop();
    rng = Pool.mulberry32(seed);
    const built = Pool.createState({feeBps: Number(feeInput.value)});
    state = built.state;
    say('Reset. Same seed, empty fee buckets, k back to ' + fmt(Pool.kOf(state.pool), 0) + '.');
    render();
  }

  function stop() {
    running = false;
    if (timer) window.clearInterval(timer);
    timer = 0;
    runBtn.textContent = reduce.matches ? 'Run 24 steps' : 'Run';
  }

  function renderLabels() {
    document.querySelector('#vol-out').textContent = Number(volInput.value).toFixed(1) + '%';
    document.querySelector('#volume-out').textContent = volumeInput.value + '%';
  }

  function render() {
    renderLabels();
    const pool = state.pool;
    const idx = Pool.indexes(state);
    const share = idx.perShare;
    const price = state.price;
    priceEl.textContent = fmt(price, price >= 20 ? 2 : 4);
    kEl.textContent = fmt(idx.k, 0);
    kNote.textContent = kPhrase(Pool.SEED.amount0 * Pool.SEED.amount1, idx.k);
    ps0.textContent = fmt(share.reserve0, 4);
    ps1.textContent = fmt(share.reserve1, 4);
    fee0El.textContent = 'plus ' + fmt(share.fee0, 4) + ' in fees';
    fee1El.textContent = 'plus ' + fmt(share.fee1, 4) + ' in fees';
    const feeValue = pool.fee0 * price + pool.fee1;
    feesEl.textContent = fmt(feeValue, 2) + ' NVDA';
    const cutValue = pool.cut0 * price + pool.cut1;
    cutEl.textContent = fmt(cutValue, 2) + ' NVDA';
    compoundBtn.disabled = pool.fee0 <= 1e-12 && pool.fee1 <= 1e-12;

    document.querySelector('#leg-pair').textContent = fmt(idx.pair, 3);
    document.querySelector('#leg-hold').textContent = fmt(idx.hold, 3);
    document.querySelector('#leg-flat').textContent = fmt(idx.flat, 3);
    storyEl.textContent = story(idx);
    captionEl.textContent = 'Value index at step ' + state.step + '. Pair token ' + fmt(idx.pair, 3) + ', 50/50 hold ' + fmt(idx.hold, 3) + ', uncompounded LP ' + fmt(idx.flat, 3) + '. Index 1 is the starting mark of one share, in NVDA.';

    paintBook('live', pool, price);
    paintBook('flat', state.shadow, price);
    document.querySelector('#hold0').textContent = fmt(state.hold0, 4);
    document.querySelector('#hold1').textContent = fmt(state.hold1, 4);
    const mark = share.total0 * price + share.total1;
    document.querySelector('#desk-line').textContent = fmt(state.desk.shares, 2) + ' ETHNVDA, marked ' + fmt(state.desk.shares * mark, 2) + ' NVDA. Side balance ' + fmt(state.desk.token0, 2) + ' ETH and ' + fmt(state.desk.token1, 2) + ' NVDA.';
    renderDesk();
    draw();
  }

  function paintBook(prefix, pool, price) {
    document.querySelector('#' + prefix + '0').textContent = fmt(pool.reserve0, 2);
    document.querySelector('#' + prefix + '1').textContent = fmt(pool.reserve1, 2);
    const feeValue = pool.fee0 * price + pool.fee1;
    document.querySelector('#' + prefix + '-fee').textContent = fmt(feeValue, 2) + ' NVDA';
  }

  function renderDesk() {
    const amount = Number(mintInput.value);
    const quoted = Pool.mint(state.pool, amount);
    if (!quoted.ok) {
      mintQuote.textContent = quoted.error;
      mintBtn.disabled = true;
    } else {
      const short = state.desk.token0 + 1e-9 < quoted.amount0 || state.desk.token1 + 1e-6 < quoted.amount1;
      mintQuote.textContent = fmt(quoted.amount0, 4) + ' ETH and ' + fmt(quoted.amount1, 2) + ' NVDA for ' + fmt(quoted.shares, 2) + ' shares.' + (short ? ' The desk is short.' : '');
      mintBtn.disabled = short;
    }
    const shares = Number(redeemInput.value);
    const back = Pool.redeem(state.pool, shares);
    if (!back.ok || shares > state.desk.shares + 1e-9) {
      redeemQuote.textContent = shares > state.desk.shares + 1e-9 ? 'The desk does not hold that many shares.' : back.error;
      redeemBtn.disabled = true;
    } else {
      redeemQuote.textContent = fmt(back.amount0, 4) + ' ETH and ' + fmt(back.amount1, 2) + ' NVDA back. No fee.';
      redeemBtn.disabled = false;
    }
    const live = state.pool;
    const shadow = state.shadow;
    const ethScale = Math.max(live.reserve0, shadow.reserve0, 1);
    const nvdaScale = Math.max(live.reserve1, shadow.reserve1, 1);
    const feeScale = Math.max(live.fee0 * state.price + live.fee1, shadow.fee0 * state.price + shadow.fee1, 1);
    setBar('#bar-live0', live.reserve0, ethScale);
    setBar('#bar-live1', live.reserve1, nvdaScale);
    setBar('#bar-live-fee', live.fee0 * state.price + live.fee1, feeScale);
    setBar('#bar-flat0', shadow.reserve0, ethScale);
    setBar('#bar-flat1', shadow.reserve1, nvdaScale);
    setBar('#bar-flat-fee', shadow.fee0 * state.price + shadow.fee1, feeScale);
  }

  function setBar(id, value, scale) {
    const pct = scale > 0 ? Math.max(0, Math.min(100, value / scale * 100)) : 0;
    document.querySelector(id).style.width = pct + '%';
  }

  function story(idx) {
    let first;
    if (Math.abs(idx.pair - idx.flat) < 0.0008) first = 'The pair token and the uncompounded LP are still the same book.';
    else if (idx.pair > idx.flat) first = 'Compounding is ahead of the uncompounded LP by ' + fmt(idx.pair - idx.flat, 3) + '.';
    else first = 'The 10% cut has the pair token behind the uncompounded LP by ' + fmt(idx.flat - idx.pair, 3) + '.';
    const gap = idx.hold - idx.flat;
    let second;
    if (Math.abs(gap) <= 0.0008) second = ' The hold still matches the LP.';
    else if (gap > 0) second = ' The hold leads the uncompounded LP by ' + fmt(gap, 3) + '. That gap is impermanent loss the fees have not covered.';
    else second = ' Fees have the uncompounded LP ahead of the hold by ' + fmt(-gap, 3) + '.';
    return first + second;
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width < 20 || height < 20) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    const history = state.history;
    const left = 48;
    const right = 12;
    const top = 12;
    const bottom = 22;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    let min = Infinity;
    let max = -Infinity;
    history.forEach(function (row) {
      min = Math.min(min, row.pair, row.hold, row.flat);
      max = Math.max(max, row.pair, row.hold, row.flat);
    });
    if (!Number.isFinite(min)) return;
    if (max - min < 0.01) {
      min -= 0.01;
      max += 0.01;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#5c5348';
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    let t;
    for (t = 0; t < 4; t += 1) {
      const value = min + (max - min) * t / 3;
      const y = top + plotH - ((value - min) / (max - min)) * plotH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(fmt(value, 2), 4, y + 4);
    }
    const x0 = history[0].step;
    const x1 = history[history.length - 1].step;
    const span = Math.max(1, x1 - x0);
    function xOf(step) { return left + ((step - x0) / span) * plotW; }
    function yOf(value) { return top + plotH - ((value - min) / (max - min)) * plotH; }
    if (min < 1 && max > 1) {
      ctx.save();
      ctx.strokeStyle = '#c8bfb0';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(left, yOf(1));
      ctx.lineTo(width - right, yOf(1));
      ctx.stroke();
      ctx.restore();
    }
    stroke(ctx, history, 'hold', HOLD, [5, 4], xOf, yOf);
    stroke(ctx, history, 'flat', FLAT, [2, 3], xOf, yOf);
    stroke(ctx, history, 'pair', INK, [], xOf, yOf);
    ctx.fillStyle = '#5c5348';
    ctx.fillText(String(x0), left, height - 6);
    const end = String(x1);
    ctx.fillText(end, width - right - ctx.measureText(end).width, height - 6);
  }

  function stroke(ctx, history, key, color, dash, xOf, yOf) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = key === 'pair' ? 2.4 : 1.8;
    ctx.setLineDash(dash);
    ctx.beginPath();
    history.forEach(function (row, i) {
      const x = xOf(row.step);
      const y = yOf(row[key]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (history.length === 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xOf(history[0].step), yOf(history[0][key]), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function kPhrase(before, after) {
    if (!(before > 0)) return 'k';
    const rel = (after - before) / before;
    if (Math.abs(rel) < 1e-8) return 'k unchanged';
    const pct = rel * 100;
    return 'k ' + (pct > 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%';
  }

  function fmt(n, digits) {
    if (!Number.isFinite(n)) return '–';
    return n.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }

  function say(text) { logEl.textContent = text; }

  if (reduce.matches) runBtn.textContent = 'Run 24 steps';
})();
