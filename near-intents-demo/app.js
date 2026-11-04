(function () {
  const engine = window.NearIntents;
  const amount = document.getElementById('amount');
  const minimum = document.getElementById('minimum');
  const solvers = document.getElementById('solvers');
  const custom = document.getElementById('custom');
  const quotes = document.getElementById('quotes');
  const steps = document.getElementById('steps');
  const bead = document.getElementById('bead');
  const flow = document.getElementById('flow');

  let run = null;
  let stepIndex = -1;
  let timer = 0;
  let playing = false;

  function kind() {
    return document.querySelector('input[name="kind"]:checked').value;
  }

  function readInput() {
    return {
      kind: kind(),
      amountIn: Number(amount.value),
      minimum: Number(minimum.value),
      solverCount: Number(solvers.value),
      custom: custom.checked
    };
  }

  function fmt(n, digits) {
    if (!Number.isFinite(n)) return '–';
    return n.toLocaleString('en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits > 2 ? 0 : 0
    });
  }

  function money(n) {
    return fmt(n, 2);
  }

  function out(n) {
    return fmt(n, run.pair.outDigits);
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
  }

  function currentStep() {
    if (!run || stepIndex < 0 || !run.steps.length) return null;
    return run.steps[stepIndex];
  }

  function viewBalances() {
    const step = currentStep();
    if (!step) return run.opening;
    return engine.balancesAfter(run, step);
  }

  function recompute(animate) {
    stop();
    stepIndex = -1;
    run = engine.preview(readInput());
    render(animate);
  }

  function tone(quote) {
    if (quote.mark === 'Best valid quote') return 'winner';
    if (quote.meetsMinimum) return 'clear';
    return 'short';
  }

  function renderQuotes(animate) {
    quotes.replaceChildren.apply(quotes, run.quotes.map(function (quote, index) {
      const li = document.createElement('li');
      li.className = 'quote' + (animate ? ' arrive' : '');
      li.dataset.tone = tone(quote);
      if (animate) li.style.animationDelay = (index * 70) + 'ms';
      const asset = run.pair.destinationAsset;
      li.innerHTML =
        '<div class="quote-top"><strong>' + quote.name + '</strong><span>' + quote.timeEstimate + 's</span></div>' +
        '<p class="out">' + out(quote.amountOut) + ' ' + asset + '</p>' +
        '<p class="guarantee">minAmountOut ' + out(quote.minAmountOut) + '</p>' +
        '<p class="mark">' + quote.mark + '</p>';
      return li;
    }));
    if (!run.quotes.length) {
      const li = document.createElement('li');
      li.className = 'quote';
      li.textContent = 'No quotes. The wallet amount has to be between 1 and 2,500 USDC.';
      quotes.appendChild(li);
    }
  }

  function renderSteps() {
    steps.replaceChildren();
    if (run.status === 'EXPIRED') {
      const li = document.createElement('li');
      li.className = 'expired';
      li.textContent = run.reason;
      steps.appendChild(li);
      return;
    }
    if (run.status === 'INVALID') {
      const li = document.createElement('li');
      li.className = 'expired';
      li.textContent = run.reason;
      steps.appendChild(li);
      return;
    }
    run.steps.forEach(function (step, index) {
      const li = document.createElement('li');
      if (stepIndex < 0) li.className = 'upcoming';
      else if (index < stepIndex) li.className = 'done';
      else if (index === stepIndex) li.className = 'current';
      else li.className = 'upcoming';
      const name = document.createElement('b');
      name.textContent = step;
      li.appendChild(name);
      let detail = engine.stepDetail(run, step);
      if (detail.indexOf(step) === 0) detail = detail.slice(step.length).replace(/^[\s.]+/, '');
      li.appendChild(document.createTextNode(' ' + detail));
      steps.appendChild(li);
    });
  }

  function renderBalances() {
    const pair = run.pair;
    const balances = viewBalances();
    document.getElementById('origin-chain').textContent = pair.originChain;
    document.getElementById('wallet-bal').textContent = money(balances.wallet);
    document.getElementById('deposit-bal').textContent = money(balances.deposit) + ' USDC';
    const heldAsset = currentStep() && run.steps.indexOf(currentStep()) >= run.steps.indexOf('SETTLED')
      ? pair.destinationAsset
      : 'USDC';
    document.getElementById('intents-label').textContent = 'Held · ' + heldAsset;
    const held = balances.intents;
    document.getElementById('intents-bal').textContent = held ? out(held) : '0';
    document.getElementById('dest-chain').textContent = pair.destinationChain;
    const swap = pair.kind === 'swap';
    document.getElementById('dest-role').textContent = swap
      ? 'Recipient demo.near'
      : (run.custom ? 'Northglass vault, after the app is funded' : 'NEAR app · northglass.demo.near');
    document.getElementById('recipient-row').hidden = !swap;
    document.getElementById('app-row').hidden = swap;
    document.getElementById('vault-row').hidden = swap || !run.custom;
    document.getElementById('recipient-label').textContent = pair.destinationAsset;
    document.getElementById('recipient-bal').textContent = out(balances.recipient);
    document.getElementById('app-bal').textContent = money(balances.app);
    document.getElementById('vault-bal').textContent = money(balances.vault);
    const hash = run.winner ? run.winner.quoteHash : 'none';
    document.getElementById('quote-hash').textContent = run.winner
      ? 'quote_hash ' + hash
      : 'No quote hash. Nothing was published.';
  }

  function fundsLine() {
    const balances = viewBalances();
    const open = run.opening;
    const untouched = balances.wallet === open.wallet && balances.deposit === 0 && balances.intents === 0 &&
      balances.recipient === open.recipient && balances.app === open.app && balances.vault === open.vault;
    if (untouched && (run.status === 'EXPIRED' || run.status === 'INVALID' || stepIndex < 0)) {
      const why = run.status === 'EXPIRED'
        ? ' Funds untouched.'
        : (run.status === 'INVALID' ? ' Nothing was asked of a solver.' : ' Nothing signed yet, so the wallet is still the opening balance.');
      return 'Wallet ' + money(balances.wallet) + ' USDC.' + why;
    }
    return 'Wallet ' + money(balances.wallet) + ' USDC. Deposit address ' + money(balances.deposit) +
      ' USDC. Intent holds ' + (balances.intents ? out(balances.intents) + ' ' + run.pair.destinationAsset : 'nothing') + '.';
  }

  function renderPacket() {
    const body = run.lockedQuote || {
      simulated: true,
      status: run.status,
      reason: run.reason,
      request: run.request
    };
    document.getElementById('json').textContent = JSON.stringify(body, null, 2);
  }

  function activeStation() {
    const step = currentStep();
    if (step) return engine.STATION[step];
    return 'origin';
  }

  function layout() {
    if (!run) return;
    const station = activeStation();
    flow.querySelectorAll('.station').forEach(function (el) {
      el.classList.toggle('hot', el.dataset.station === station);
    });
    const host = flow.querySelector('[data-station="' + station + '"]');
    const svg = document.getElementById('routes');
    const width = flow.clientWidth;
    const height = flow.clientHeight;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    const names = ['origin', 'intents', 'destination'];
    const board = flow.getBoundingClientRect();
    const boxes = names.map(function (name) {
      const rect = flow.querySelector('[data-station="' + name + '"]').getBoundingClientRect();
      return {
        left: rect.left - board.left,
        right: rect.right - board.left,
        top: rect.top - board.top,
        bottom: rect.bottom - board.top,
        cx: rect.left - board.left + rect.width / 2,
        cy: rect.top - board.top + rect.height / 2
      };
    });
    const vertical = boxes[1].top >= boxes[0].bottom - 8;
    const gaps = vertical
      ? [
        [[boxes[0].cx, boxes[0].bottom], [boxes[1].cx, boxes[1].top]],
        [[boxes[1].cx, boxes[1].bottom], [boxes[2].cx, boxes[2].top]]
      ]
      : [
        [[boxes[0].right, boxes[0].cy], [boxes[1].left, boxes[1].cy]],
        [[boxes[1].right, boxes[1].cy], [boxes[2].left, boxes[2].cy]]
      ];
    const rank = { origin: 0, intents: 1, destination: 2 };
    const lit = rank[station];
    function line(pts) {
      return pts.map(function (point) { return point[0].toFixed(1) + ',' + point[1].toFixed(1); }).join(' ');
    }
    svg.innerHTML = gaps.map(function (gap, index) {
      const cls = index < lit ? 'lit' : 'full';
      return '<polyline class="' + cls + '" points="' + line(gap) + '"></polyline>';
    }).join('');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    bead.hidden = false;
    const left = Math.max(8, Math.min(rect.right - board.left - 64, width - 58));
    bead.style.left = left + 'px';
    bead.style.top = (rect.top - board.top + 12) + 'px';
    const step = currentStep();
    const settled = step && run.steps.indexOf(step) >= run.steps.indexOf('SETTLED');
    bead.textContent = run.kind === 'swap' && settled ? 'NEAR' : 'USDC';
  }

  function render(animate) {
    const pair = run.pair;
    document.getElementById('solver-count').textContent = String(run.solverCount);
    document.getElementById('mid-note').textContent = pair.midNote;
    const verb = pair.kind === 'swap' ? 'Swap' : 'Deposit';
    const tail = pair.kind === 'deposit' && run.custom ? ', then supply Northglass.' : '.';
    document.getElementById('intent-line').textContent = run.status === 'INVALID'
      ? run.reason
      : verb + ' ' + money(run.amountIn) + ' USDC on ' + pair.originChain + ' for at least ' +
        out(run.minimum) + ' ' + pair.destinationAsset + ' on ' + pair.destinationChain + tail;
    document.getElementById('status').textContent = run.reason;
    document.getElementById('stamp').hidden = run.status !== 'EXPIRED';
    const started = stepIndex >= 0;
    document.getElementById('sign').disabled = run.status !== 'QUOTED' || started;
    document.getElementById('play').disabled = run.status !== 'QUOTED';
    document.getElementById('step').disabled = run.status !== 'QUOTED';
    document.getElementById('play').textContent = playing ? 'Pause' : 'Play';
    document.getElementById('play').setAttribute('aria-pressed', playing ? 'true' : 'false');
    renderQuotes(animate);
    renderSteps();
    renderBalances();
    document.getElementById('funds').textContent = fundsLine();
    renderPacket();
    requestAnimationFrame(layout);
  }

  function tick() {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(function () {
      if (!playing || !run) return;
      if (stepIndex >= run.steps.length - 1) {
        playing = false;
        render(false);
        return;
      }
      stepIndex += 1;
      render(false);
      tick();
    }, 700);
  }

  function begin() {
    if (run.status !== 'QUOTED') return false;
    if (stepIndex < 0) stepIndex = 0;
    return true;
  }

  document.getElementById('ask').addEventListener('click', function () { recompute(true); });
  document.getElementById('above').addEventListener('click', function () {
    const best = engine.bestGuarantee(kind(), Number(amount.value));
    if (!(best > 0)) return;
    minimum.value = String(Math.round((best + 0.000001) * 1e6) / 1e6);
    recompute(false);
  });
  document.getElementById('floor').addEventListener('click', function () {
    minimum.value = String(engine.PAIRS[kind()].defaultMinimum);
    recompute(false);
  });
  document.getElementById('sign').addEventListener('click', function () {
    if (!begin()) return;
    playing = true;
    render(false);
    tick();
  });
  document.getElementById('play').addEventListener('click', function () {
    if (!begin()) return;
    playing = !playing;
    render(false);
    if (playing) tick();
  });
  document.getElementById('step').addEventListener('click', function () {
    if (!begin()) return;
    stop();
    if (steps.querySelector('.current') && stepIndex < run.steps.length - 1) stepIndex += 1;
    render(false);
  });

  amount.addEventListener('change', function () { recompute(true); });
  minimum.addEventListener('input', function () { recompute(false); });
  solvers.addEventListener('input', function () {
    document.getElementById('solver-count').textContent = solvers.value;
    recompute(true);
  });
  custom.addEventListener('change', function () { recompute(false); });
  document.querySelectorAll('input[name="kind"]').forEach(function (input) {
    input.addEventListener('change', function () {
      const pair = engine.PAIRS[kind()];
      document.getElementById('min-unit').textContent = pair.destinationAsset;
      minimum.step = pair.kind === 'swap' ? '0.001' : '0.01';
      minimum.value = String(pair.defaultMinimum);
      document.getElementById('custom-label').hidden = pair.kind !== 'deposit';
      recompute(true);
    });
  });

  window.addEventListener('resize', function () { requestAnimationFrame(layout); });
  recompute(true);
})();
