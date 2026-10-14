(function () {
  const C = window.AtomicCompose;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const GOOD = '#1f6b45';
  const RUST = '#9f2d14';
  const PAPER = '#fffdf8';
  const GRID = '#e6dfd2';
  const MUTED = '#5c5348';

  const quoteEl = document.querySelector('#quote');
  const playBtn = document.querySelector('#play');
  const l1Status = document.querySelector('#l1-status');
  const splitStatus = document.querySelector('#split-status');
  const l1Track = document.querySelector('#l1-track');
  const splitTrack = document.querySelector('#split-track');
  const detailEl = document.querySelector('#leg-detail');
  const hist = document.querySelector('#hist');
  const tallyBody = document.querySelector('#tally-body');
  const tallyEmpty = document.querySelector('#tally-empty');

  const fields = ['latency', 'vol', 'traders', 'borrow', 'spread', 'slip', 'margin', 'trials'];
  let seed = 1;
  let timer = 0;
  let run = null;
  let frame = -1;

  fields.forEach(function (id) {
    document.querySelector('#' + id).addEventListener('input', function () {
      renderLabels();
      if (!timer) {
        run = null;
        frame = -1;
      }
      renderQuote();
    });
  });
  playBtn.addEventListener('click', function () {
    if (timer) {
      stop();
      return;
    }
    begin(true);
    if (reduce.matches) {
      frame = lastFrame();
      paint();
      return;
    }
    if (frame < 0) frame = 0;
    playBtn.textContent = 'Stop';
    paint();
    timer = window.setInterval(function () {
      if (frame >= lastFrame()) {
        stop();
        return;
      }
      frame += 1;
      paint();
    }, 420);
  });
  document.querySelector('#step').addEventListener('click', function () {
    stop();
    begin();
    frame = Math.min(lastFrame(), frame + 1);
    paint();
  });
  document.querySelector('#batch').addEventListener('click', runBatch);
  if (window.ResizeObserver) new ResizeObserver(drawHist).observe(hist.parentElement);
  window.addEventListener('resize', drawHist);

  renderLabels();
  renderQuote();
  paintIdle();

  function readConfig() {
    return {
      latency: Number(document.querySelector('#latency').value),
      volatility: Number(document.querySelector('#vol').value) / 100,
      traders: Number(document.querySelector('#traders').value),
      borrow: Number(document.querySelector('#borrow').value),
      spread: Number(document.querySelector('#spread').value) / 100,
      slippageBps: Number(document.querySelector('#slip').value),
      margin: Number(document.querySelector('#margin').value),
      feeBps: 30,
    };
  }

  function renderLabels() {
    document.querySelector('#latency-out').textContent = document.querySelector('#latency').value + ' slots';
    document.querySelector('#vol-out').textContent = Number(document.querySelector('#vol').value).toFixed(1) + '%';
    document.querySelector('#traders-out').textContent = document.querySelector('#traders').value;
    document.querySelector('#borrow-out').textContent = document.querySelector('#borrow').value;
    document.querySelector('#spread-out').textContent = Number(document.querySelector('#spread').value).toFixed(1) + '%';
    document.querySelector('#slip-out').textContent = (Number(document.querySelector('#slip').value) / 100).toFixed(2) + '%';
    document.querySelector('#margin-out').textContent = document.querySelector('#margin').value;
    document.querySelector('#trials-out').textContent = document.querySelector('#trials').value;
  }

  function renderQuote() {
    const config = readConfig();
    const world = C.makeWorld(config);
    const quoted = C.quoteRoute(world, config);
    if (!quoted.ok) {
      quoteEl.className = 'quote bad';
      quoteEl.textContent = quoted.error;
      return;
    }
    const profit = quoted.plan.profit;
    quoteEl.className = profit < 0 ? 'quote bad' : 'quote';
    if (profit < 0) {
      quoteEl.textContent = 'Quoted result ' + money(profit) + '. Both worlds stand down. The route cannot repay, so nothing is sent.';
    } else {
      quoteEl.textContent = 'Quoted result ' + money(profit) + ' if both swaps clear now. The L1 transaction will land. The L2 path can miss it.';
    }
    if (!run) {
      l1Track.replaceChildren();
      splitTrack.replaceChildren();
      detailEl.textContent = 'Run one path to watch the legs. Step walks the bridge one slot at a time.';
      paintTables(world, world, world);
      setStatus(l1Status, null);
      setStatus(splitStatus, null);
    }
  }

  function begin(fresh) {
    if (run && !fresh) return;
    const used = seed;
    seed += 1;
    run = C.runOnce(readConfig(), used);
    frame = -1;
  }

  function lastFrame() {
    if (!run) return 0;
    return Math.max(0, run.split.timeline.length - 1);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    playBtn.textContent = 'Run one';
  }

  function paintIdle() {
    const world = C.makeWorld(readConfig());
    l1Track.replaceChildren();
    splitTrack.replaceChildren();
    detailEl.textContent = 'Run one path to watch the legs. Step walks the bridge one slot at a time.';
    paintTables(world, world, world);
  }

  function paint() {
    if (!run) return;
    const events = run.split.timeline;
    const current = events[Math.max(0, frame)] || null;
    const splitWorld = current ? current.world : run.start;
    setStatus(l1Status, run.atomic);
    setStatus(splitStatus, frame >= lastFrame() ? run.split : null, current);
    renderTrack(l1Track, groupSlots(run.atomic.timeline), run.atomic.timeline.length - 1, true);
    renderTrack(splitTrack, groupSlots(events), frame, false);
    if (current) {
      detailEl.textContent = 'Slot ' + current.t + '. ' + current.detail + ' ' + tradeLine(current.trades);
    } else {
      detailEl.textContent = 'The route was not sent.';
    }
    paintTables(run.start, run.atomic.world, splitWorld);
  }

  function setStatus(el, result, current) {
    el.className = 'status';
    if (!result) {
      if (current && current.id.indexOf('fail') !== -1) {
        el.className = 'status partial';
        el.textContent = 'Open position';
        return;
      }
      el.textContent = current ? 'In flight' : 'Not sent';
      return;
    }
    el.className = 'status ' + result.status;
    if (result.status === 'landed') el.textContent = 'Landed ' + money(result.profit);
    else if (result.status === 'reverted') el.textContent = 'Reverted';
    else if (result.reason === 'sell') el.textContent = 'Partial · sell failed';
    else if (result.reason === 'repay') el.textContent = 'Partial · repay failed';
    else el.textContent = 'Partial';
  }

  function groupSlots(events) {
    const groups = [];
    (events || []).forEach(function (ev) {
      const last = groups[groups.length - 1];
      if (last && last.t === ev.t) last.events.push(ev);
      else groups.push({t: ev.t, events: [ev]});
    });
    return groups;
  }

  function renderTrack(list, groups, activeEvent, atomic) {
    list.replaceChildren();
    let seen = 0;
    groups.forEach(function (group) {
      const li = document.createElement('li');
      const end = seen + group.events.length - 1;
      const failed = group.events.some(function (ev) { return ev.id.indexOf('fail') !== -1; });
      if (failed) li.className = 'fail';
      else if (atomic || end < activeEvent) li.className = 'done';
      else if (seen <= activeEvent && activeEvent <= end) li.className = 'now';
      seen += group.events.length;
      const world = group.events[group.events.length - 1].world;
      const title = document.createElement('p');
      title.className = 'slot-title';
      title.textContent = group.events.map(function (ev) { return ev.title; }).join(' · ');
      const when = document.createElement('p');
      when.className = 'slot-t';
      when.textContent = atomic ? 'One transaction' : 'Slot ' + group.t;
      const meta = document.createElement('p');
      meta.className = 'slot-meta';
      meta.textContent = 'A ' + px(world.venueA) + ' · B ' + px(world.venueB);
      li.append(when, title, meta);
      list.append(li);
    });
    const current = list.querySelector('.now') || list.querySelector('.fail');
    if (!current) return;
    const edge = current.getBoundingClientRect().left - list.getBoundingClientRect().left;
    const next = list.scrollLeft + edge - 8;
    if (reduce.matches) list.scrollLeft = next;
    else list.scrollTo({left: next, behavior: 'smooth'});
  }

  function paintTables(start, atomicWorld, splitWorld) {
    document.querySelector('#l1-table').replaceChildren(balanceTable(start, atomicWorld, 'After'));
    const splitLabel = run && frame < lastFrame() ? 'This leg' : 'After';
    document.querySelector('#split-table').replaceChildren(balanceTable(start, splitWorld, splitLabel));
  }

  function balanceTable(before, after, afterLabel) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    head.innerHTML = '<tr><th></th><th>Before</th><th>' + afterLabel + '</th></tr>';
    const body = document.createElement('tbody');
    const rows = [
      ['Desk USDC', money(before.user.usdc, true), money(after.user.usdc, true)],
      ['Desk SOL', num(before.user.sol, 4), num(after.user.sol, 4)],
      ['Debt', money(before.user.debt, true), money(after.user.debt, true)],
      ['Venue A', px(before.venueA), px(after.venueA)],
      ['Venue B', px(before.venueB), px(after.venueB)],
      ['Lender', money(before.lender.usdc, true), money(after.lender.usdc, true)],
      ['Marked P&L', '0.00', money(C.profitBetween(before, after))],
    ];
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      row.forEach(function (cell, i) {
        const el = document.createElement(i === 0 ? 'th' : 'td');
        el.textContent = cell;
        tr.append(el);
      });
      body.append(tr);
    });
    table.append(head, body);
    return table;
  }

  function runBatch() {
    stop();
    const config = readConfig();
    const used = seed;
    seed += 1;
    const result = C.runTrials(config, Number(document.querySelector('#trials').value), used);
    tallyEmpty.hidden = true;
    tallyBody.hidden = false;
    fill('a', result.atomic);
    fill('s', result.split);
    const partial = result.split.partial;
    document.querySelector('#hist-caption').textContent = result.trials + ' routes, seed ' + result.seed + '. L1 mean ' + money(result.atomic.mean) + '. Split mean ' + money(result.split.mean) + '. ' + partial + ' split route' + (partial === 1 ? '' : 's') + ' left a partial position. L1 partials: ' + result.atomic.partial + '.';
    drawHist(result);
  }

  function fill(prefix, tally) {
    document.querySelector('#' + prefix + '-landed').textContent = String(tally.landed);
    document.querySelector('#' + prefix + '-reverted').textContent = String(tally.reverted);
    document.querySelector('#' + prefix + '-partial').textContent = String(tally.partial);
    document.querySelector('#' + prefix + '-mean').textContent = money(tally.mean);
  }

  let lastHist = null;

  function drawHist(result) {
    if (result && result.atomic) lastHist = result;
    const data = lastHist;
    const rect = hist.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height || 180;
    if (width < 20) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hist.width = Math.round(width * dpr);
    hist.height = Math.round(height * dpr);
    const ctx = hist.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    if (!data) return;
    const all = data.atomic.profits.concat(data.split.profits);
    let min = Math.min.apply(null, all);
    let max = Math.max.apply(null, all);
    if (!Number.isFinite(min)) return;
    if (max - min < 1e-6) {
      min -= 1;
      max += 1;
    }
    const n = 16;
    const widthBin = (max - min) / n;
    const left = 36;
    const right = 8;
    const gap = 8;
    const rowH = (height - 28) / 2;
    drawRow(ctx, counts(data.atomic.profits, min, widthBin, n), left, 8, width - right, rowH, GOOD, 'L1');
    drawRow(ctx, counts(data.split.profits, min, widthBin, n), left, 8 + rowH + gap, width - right, rowH, RUST, 'Split');
    ctx.fillStyle = MUTED;
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(money(min), left, height - 4);
    const end = money(max);
    ctx.fillText(end, width - right - ctx.measureText(end).width, height - 4);
  }

  function counts(values, min, widthBin, n) {
    const bins = [];
    let i;
    for (i = 0; i < n; i += 1) bins.push(0);
    values.forEach(function (value) {
      let b = Math.floor((value - min) / widthBin);
      if (b < 0) b = 0;
      if (b >= n) b = n - 1;
      bins[b] += 1;
    });
    return bins;
  }

  function drawRow(ctx, bins, left, top, right, rowH, color, label) {
    const peak = bins.reduce(function (acc, value) { return Math.max(acc, value); }, 1);
    const plotW = right - left;
    const barW = plotW / bins.length;
    ctx.fillStyle = MUTED;
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(label, 4, top + 14);
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(left, top + rowH - 16);
    ctx.lineTo(right, top + rowH - 16);
    ctx.stroke();
    bins.forEach(function (count, i) {
      const h = count === 0 ? 0 : Math.max(2, (count / peak) * (rowH - 28));
      ctx.fillStyle = color;
      ctx.fillRect(left + i * barW + 1, top + rowH - 16 - h, Math.max(1, barW - 2), h);
    });
  }

  function tradeLine(trades) {
    if (!trades || !trades.length) return 'No competing trades.';
    let a = 0;
    let b = 0;
    trades.forEach(function (trade) {
      if (trade.venue === 'venueA') a += 1;
      else b += 1;
    });
    const parts = [];
    if (a) parts.push(a + ' on A');
    if (b) parts.push(b + ' on B');
    return parts.join(', ') + (trades.length === 1 ? ' competing trade.' : ' competing trades.');
  }

  function px(pool) {
    return num(C.poolPrice(pool), 2);
  }

  function money(n, plain) {
    if (!Number.isFinite(n)) return '–';
    const body = Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (plain) return (n < 0 ? '−' : '') + body;
    if (n > 0) return '+' + body;
    if (n < 0) return '−' + body;
    return body;
  }

  function num(n, digits) {
    if (!Number.isFinite(n)) return '–';
    return n.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }
})();
