(function () {
  const engine = window.AuctionEngine;
  const lot = document.querySelector('#lot');
  const phase = document.querySelector('#phase');
  const price = document.querySelector('#price');
  const leader = document.querySelector('#leader');
  const nextStep = document.querySelector('#next-step');
  const clock = document.querySelector('#clock');
  const closeLabel = document.querySelector('#close-label');
  const run = document.querySelector('#run');
  const speed = document.querySelector('#speed');
  const jump = document.querySelector('#jump');
  const plusMin = document.querySelector('#plus-min');
  const plusTen = document.querySelector('#plus-ten');
  const form = document.querySelector('#bid-form');
  const bidder = document.querySelector('#bidder');
  const maximum = document.querySelector('#maximum');
  const hint = document.querySelector('#hint');
  const formError = document.querySelector('#form-error');
  const submit = document.querySelector('#submit');
  const formula = document.querySelector('#formula');
  const bookBody = document.querySelector('#book-body');
  const room = document.querySelector('#room');
  const clerk = document.querySelector('#clerk');

  let auction = engine.createAuction(new Date());
  let simNow = new Date(auction.opensAt);
  let paused = true;
  let lastTs = 0;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function closed() {
    return simNow.getTime() >= auction.closesAt.getTime();
  }

  function remaining() {
    return auction.closesAt.getTime() - simNow.getTime();
  }

  function parseDollars(raw) {
    const cleaned = String(raw || '').replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    return Math.round(Number(cleaned) * 100);
  }

  function paintClock() {
    const left = remaining();
    clock.textContent = left <= 0 ? '00:00:00' : formatRemaining(left);
    clock.classList.toggle('inside', left > 0 && left <= engine.SNIPE_WINDOW_MS);
    clock.classList.toggle('closed', left <= 0);
    const extensions = auction.events.filter(event => event.extended).length;
    const closeText = auction.closesAt.toLocaleString(undefined, {hour: 'numeric', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric'});
    closeLabel.textContent = left <= 0
      ? `Closed ${closeText}, simulated.`
      : `Closes ${closeText}, simulated.${extensions ? ` Extended ${extensions} ${extensions === 1 ? 'time' : 'times'}.` : ''}`;
    run.textContent = paused ? 'Run clock' : 'Pause';
    jump.disabled = left <= engine.SNIPE_WINDOW_MS;
    plusMin.disabled = left <= 0;
    plusTen.disabled = left <= 0;
  }

  function paintHint() {
    if (closed()) {
      hint.textContent = 'The auction is closed. Reset it to open a new 48-hour lot.';
      return;
    }
    const name = bidder.value.trim();
    const existing = auction.offers.find(offer => offer.owner.toLowerCase() === name.toLowerCase());
    if (existing) {
      hint.textContent = `${existing.owner} already reserved ${engine.money(existing.max_amount)}. A higher maximum replaces it and keeps that admission order.`;
      return;
    }
    const current = engine.resolveProxy(auction.offers);
    const floor = engine.nextBid(current.price || 0);
    hint.textContent = `A new bidder's maximum covers the next 10% step, ${engine.money(floor)}, or more. The maximum stays in the book.`;
  }

  function fillList(list, events, key) {
    list.replaceChildren();
    if (!events.length) {
      const item = document.createElement('li');
      item.className = 'empty';
      item.textContent = 'Bids will show up here.';
      list.append(item);
      return;
    }
    for (const event of [...events].reverse()) {
      const item = document.createElement('li');
      item.textContent = event[key];
      list.append(item);
    }
  }

  function render() {
    const resolved = engine.resolveProxy(auction.offers);
    const left = remaining();
    if (!auction.offers.length && left > 0) phase.textContent = 'Waiting for the first bid';
    else if (left <= 0) phase.textContent = 'Closed';
    else if (left <= engine.SNIPE_WINDOW_MS) phase.textContent = 'Anti-snipe window';
    else phase.textContent = 'Live';

    price.textContent = resolved.winner ? engine.money(resolved.price) : '—';
    if (resolved.winner) {
      leader.textContent = `${resolved.winner.owner} leads.`;
      nextStep.textContent = left <= 0
        ? 'The winning public price is fixed.'
        : `Next 10% step ${engine.money(engine.nextBid(resolved.price))}.`;
    } else {
      leader.textContent = 'Opening bid $1 once somebody reserves a maximum.';
      nextStep.textContent = '';
    }
    formula.textContent = engine.formulaText(auction.offers);
    submit.disabled = left <= 0;
    paintClock();
    paintHint();

    bookBody.replaceChildren();
    if (!auction.offers.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No bids yet.';
      row.append(cell);
      bookBody.append(row);
    } else {
      const ordered = [...auction.offers].sort((a, b) => Number(a.admission_order) - Number(b.admission_order));
      for (const offer of ordered) {
        const row = document.createElement('tr');
        if (resolved.winner && offer.id === resolved.winner.id) row.className = 'lead';
        for (const value of [
          offer.owner,
          `#${offer.admission_order}`,
          engine.money(offer.max_amount),
          resolved.winner && offer.id === resolved.winner.id ? 'Leading' : 'Outbid',
        ]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        bookBody.append(row);
      }
    }
    fillList(room, auction.events, 'room');
    fillList(clerk, auction.events, 'clerk');
  }

  function advance(ms) {
    if (closed()) return;
    simNow = new Date(Math.min(auction.closesAt.getTime(), simNow.getTime() + ms));
    if (closed()) paused = true;
    render();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    formError.textContent = '';
    const maxCents = parseDollars(maximum.value);
    if (maxCents == null) {
      formError.textContent = 'Enter a maximum in dollars and cents, such as 80 or 26.40.';
      return;
    }
    const result = engine.placeBid(auction, {
      name: bidder.value,
      maxCents,
      bidAt: simNow,
      now: simNow,
    });
    if (!result.ok) {
      formError.textContent = result.error;
      return;
    }
    auction = result.auction;
    maximum.value = '';
    render();
    maximum.focus();
  });

  bidder.addEventListener('input', paintHint);
  run.addEventListener('click', () => {
    if (closed()) return;
    paused = !paused;
    lastTs = 0;
    paintClock();
  });
  speed.addEventListener('change', () => {
    lastTs = 0;
  });
  jump.addEventListener('click', () => {
    const start = auction.closesAt.getTime() - engine.SNIPE_WINDOW_MS;
    if (simNow.getTime() < start) simNow = new Date(start);
    paused = true;
    render();
  });
  plusMin.addEventListener('click', () => advance(60 * 1000));
  plusTen.addEventListener('click', () => advance(10 * 60 * 1000));
  document.querySelector('#sample').addEventListener('click', () => {
    const opened = engine.createAuction(new Date());
    auction = engine.applySample(opened, opened.opensAt);
    simNow = new Date(opened.opensAt);
    paused = true;
    formError.textContent = '';
    render();
  });
  document.querySelector('#reset').addEventListener('click', () => {
    auction = engine.createAuction(new Date());
    simNow = new Date(auction.opensAt);
    paused = true;
    formError.textContent = '';
    lot.value = 'Untitled lot';
    render();
  });

  function tick(nowTs) {
    if (!lastTs) lastTs = nowTs;
    if (!paused && !closed()) {
      const rate = Number(speed.value) || 1;
      simNow = new Date(simNow.getTime() + (nowTs - lastTs) * rate);
      if (closed()) {
        simNow = new Date(auction.closesAt);
        paused = true;
        render();
      } else {
        paintClock();
      }
    }
    lastTs = nowTs;
    requestAnimationFrame(tick);
  }

  render();
  requestAnimationFrame(tick);
})();
