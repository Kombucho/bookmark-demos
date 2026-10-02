(function () {
  const engine = globalThis.AuctionEngine;
  const YOU = 'you';
  const DURATION_MS = 40_000;
  const WINDOW_MS = 15_000;
  const EXTEND_MS = 15_000;

  const lotInput = document.querySelector('#lot');
  const countEl = document.querySelector('#count');
  const priceEl = document.querySelector('#price');
  const leaderEl = document.querySelector('#leader');
  const floorEl = document.querySelector('#floor');
  const statusEl = document.querySelector('#status');
  const clockEl = document.querySelector('#clock');
  const clockWrap = document.querySelector('#clock-wrap');
  const bidOpen = document.querySelector('#bid-open');
  const jumpBtn = document.querySelector('#jump');
  const replayBtn = document.querySelector('#replay');
  const chart = document.querySelector('#chart');
  const privateEl = document.querySelector('#private');
  const legendYou = document.querySelector('#legend-you');
  const standingEl = document.querySelector('#standing');
  const logEl = document.querySelector('#log');
  const sheet = document.querySelector('#sheet');
  const form = document.querySelector('#bid-form');
  const bidderInput = document.querySelector('#bidder');
  const maximumInput = document.querySelector('#maximum');
  const minimumHint = document.querySelector('#minimum-hint');
  const formError = document.querySelector('#form-error');
  const cancelBtn = document.querySelector('#bid-cancel');
  const tape = document.querySelector('#tape');

  const state = {
    offers: [],
    history: [],
    closesAt: 0,
    seq: 1,
    yourName: '',
    note: '',
    timers: [],
  };

  function seed() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    const now = Date.now();
    state.offers = [
      {id: 'lumen', name: 'Lumen', max: 2400, at: 1},
      {id: 'north', name: 'Northwind', max: 8000, at: 2},
    ];
    state.seq = 3;
    state.closesAt = now + DURATION_MS;
    const opened = engine.resolve(state.offers.slice(0, 1));
    const answered = engine.resolve(state.offers);
    state.history = [
      {id: 'h1', actor: 'Lumen', leader: 'Lumen', price: opened.price, auto: false, verb: 'opened', at: now - 90_000},
      {id: 'h2', actor: 'Northwind', leader: 'Northwind', price: answered.price, auto: true, verb: 'leads', at: now - 40_000},
    ];
    state.note = 'Two ceilings are already reserved. The public price sits one step above the lower one.';
    state.timers.push(window.setTimeout(() => botBid({id: 'harbor', name: 'Harbor', max: 5500}), 4500));
    state.timers.push(window.setTimeout(() => botBid({id: 'field', name: 'Field', max: 9600}), 12000));
  }

  function book() {
    return engine.resolve(state.offers);
  }

  function you() {
    return state.offers.find(offer => offer.id === YOU) || null;
  }

  function closed() {
    return Date.now() >= state.closesAt;
  }

  function remaining() {
    return state.closesAt - Date.now();
  }

  function clockText() {
    const seconds = Math.max(0, Math.ceil(remaining() / 1000));
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function cleanName(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 40) return null;
    if (/https?:|www\.|@/i.test(name)) return null;
    if (!/^[\p{L}\p{N}&.'’ -]+$/u.test(name)) return null;
    return name;
  }

  function parseDollars(raw) {
    const cleaned = String(raw || '').trim().replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    const [dollars, cents = ''] = cleaned.split('.');
    const value = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(value)) return null;
    return value;
  }

  function historyLine(event) {
    if (event.verb === 'opened') return 'Opened the bidding';
    if (event.verb === 'raised') return 'Raised a private maximum';
    if (event.verb === 'answered') return `Bid · ${event.leader} answered`;
    return 'Leads';
  }

  function classify(before, after, actorId, actorName, raised) {
    const leader = after.leader;
    if (raised && before.price === after.price && before.leader?.id === leader?.id) {
      return {verb: 'raised', auto: false, actor: actorName, leader: leader.name, price: after.price};
    }
    if (leader.id === actorId) {
      return {
        verb: 'leads',
        auto: after.price < leader.max,
        actor: actorName,
        leader: leader.name,
        price: after.price,
      };
    }
    return {verb: 'answered', auto: true, actor: actorName, leader: leader.name, price: after.price};
  }

  function statusFor(event, actorId, after, incomingMax) {
    const price = engine.money(event.price);
    if (event.verb === 'raised') return `Private maximum updated. The public price stays ${price}.`;
    if (event.verb === 'leads' && actorId === YOU) {
      if (after.price === incomingMax) {
        return `You lead at ${price}. The price stopped at your maximum.`;
      }
      return `You lead at ${price}. The rest of your maximum stays on this screen.`;
    }
    if (event.verb === 'leads') return `${event.leader} leads at ${price}.`;
    if (event.verb === 'answered' && actorId === YOU) {
      if (after.leader.max === incomingMax) {
        return `Equal maxima stay with the earlier bidder. The public price is ${price}.`;
      }
      return `A higher maximum is already reserved. The public price is ${price}. Your ceiling stays on this screen.`;
    }
    return `${event.actor} bid. ${event.leader}'s proxy answered at ${price}.`;
  }

  function pushHistory(event) {
    state.seq += 1;
    state.history.push({...event, id: `h${state.seq}`, at: Date.now()});
  }

  function applyBid(incoming) {
    if (closed()) return {ok: false, error: 'Bidding is closed.'};
    const result = engine.admit(state.offers, incoming);
    if (!result.ok) return result;

    const extended = engine.shouldExtend(remaining(), WINDOW_MS);
    state.offers = result.offers;
    const event = classify(result.before, result.after, incoming.id, incoming.name, result.raised);
    pushHistory(event);
    if (extended) state.closesAt += EXTEND_MS;

    let note = statusFor(event, incoming.id, result.after, incoming.max);
    if (extended) note += ' The close moved forward 15 seconds.';
    state.note = note;
    return {ok: true};
  }

  function botBid(partial) {
    if (closed()) return;
    const current = book();
    if (partial.max < current.minimum) return;
    applyBid({...partial, at: ++state.seq});
    render();
  }

  function renderTape() {
    if (tape.childElementCount) return;
    const group = () => {
      const row = document.createElement('p');
      ['count', 'high', 'step', 'time', 'rule'].forEach(key => {
        const span = document.createElement('span');
        span.dataset.k = key;
        row.append(span);
      });
      return row;
    };
    const one = group();
    const two = group();
    tape.append(one, two);
  }

  function fillTape() {
    const current = book();
    const high = current.price ? engine.money(current.price) : engine.money(engine.OPENING_CENTS);
    const values = {
      count: `${state.history.length} ${state.history.length === 1 ? 'bid' : 'bids'}`,
      high: `High bid ${high}`,
      step: current.price ? `Next bid ${engine.money(current.minimum)} · +10%` : 'Opening $1',
      time: closed() ? 'Bidding ended' : `${clockText()} left`,
      rule: 'Private maxima',
    };
    tape.querySelectorAll('span').forEach(span => {
      span.textContent = values[span.dataset.k];
    });
    tape.parentElement.setAttribute('aria-label', Object.values(values).join(', '));
  }

  function renderChart() {
    const current = book();
    const yours = you();
    const width = Math.max(320, Math.round(chart.clientWidth || 640));
    const height = 180;
    chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    chart.replaceChildren();

    const prices = state.history.map(event => event.price);
    const maxY = Math.max(engine.OPENING_CENTS, current.price, yours?.max || 0, ...prices);
    const xAt = index => {
      if (state.history.length <= 1) return 12;
      return 12 + (index / (state.history.length - 1)) * (width - 24);
    };
    const yAt = price => height - 18 - (price / maxY) * (height - 36);

    const ns = 'http://www.w3.org/2000/svg';
    const add = (name, attrs) => {
      const node = document.createElementNS(ns, name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      chart.append(node);
      return node;
    };

    add('line', {x1: 0, x2: width, y1: yAt(0), y2: yAt(0), stroke: 'rgba(243,241,234,0.16)'});

    let path = '';
    state.history.forEach((event, index) => {
      const x = xAt(index);
      const y = yAt(event.price);
      path += index === 0 ? `M ${x} ${y}` : ` H ${x} V ${y}`;
    });
    if (state.history.length) path += ` H ${width - 8}`;
    add('path', {d: path, fill: 'none', stroke: '#f3f1ea', 'stroke-width': 2});

    if (yours) {
      const y = yAt(yours.max);
      add('line', {
        x1: 8,
        x2: width - 8,
        y1: y,
        y2: y,
        stroke: '#9a978e',
        'stroke-dasharray': '4 5',
        'stroke-width': 1.5,
      });
      const label = add('text', {
        x: 12,
        y: y < 24 ? y + 14 : y - 8,
        fill: '#9a978e',
        'font-size': 11,
        'text-anchor': 'start',
        'font-family': 'Liberation Sans, Helvetica, sans-serif',
      });
      label.textContent = `your max ${engine.money(yours.max)}`;
    }
  }

  function renderLists() {
    const current = book();
    standingEl.replaceChildren();
    state.offers.forEach(offer => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const meta = document.createElement('span');
      const amount = document.createElement('span');
      const leading = current.leader?.id === offer.id;
      name.textContent = offer.id === YOU ? `${offer.name} · you` : offer.name;
      meta.className = 'tag';
      meta.textContent = leading ? 'Leading' : 'Outbid';
      amount.className = 'amount';
      amount.textContent = leading ? engine.money(current.price) : 'Hidden';
      row.append(name, meta, amount);
      standingEl.append(row);
    });

    logEl.replaceChildren();
    [...state.history].reverse().forEach(event => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const note = document.createElement('span');
      const amount = document.createElement('span');
      name.textContent = event.actor;
      note.className = 'note';
      note.textContent = `${historyLine(event)}${event.auto ? ' · Auto' : ''}`;
      amount.className = 'amount';
      amount.textContent = engine.money(event.price);
      row.append(name, note, amount);
      const time = document.createElement('span');
      time.className = 'when';
      time.textContent = new Date(event.at).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', second: '2-digit'});
      note.append(' · ', time);
      logEl.append(row);
    });
  }

  function render() {
    const current = book();
    const yours = you();
    const isClosed = closed();
    const high = current.price ? engine.money(current.price) : '—';

    countEl.textContent = `Current bid · ${state.history.length} ${state.history.length === 1 ? 'bid' : 'bids'}`;
    if (priceEl.textContent !== high) {
      priceEl.textContent = high;
      priceEl.classList.remove('is-hot');
      void priceEl.offsetWidth;
      priceEl.classList.add('is-hot');
    }
    leaderEl.textContent = current.leader ? current.leader.name : 'No bids yet';
    floorEl.textContent = current.price
      ? `Next min bid ${engine.money(current.minimum)} (+10%)`
      : `Opening bid ${engine.money(engine.OPENING_CENTS)}`;
    statusEl.textContent = state.note;

    bidOpen.disabled = isClosed;
    bidOpen.textContent = isClosed ? 'Bidding closed' : 'Make a bid';
    jumpBtn.disabled = isClosed || remaining() <= WINDOW_MS;
    clockWrap.classList.toggle('is-urgent', !isClosed && remaining() <= WINDOW_MS);
    clockEl.textContent = clockText();
    clockEl.dateTime = new Date(state.closesAt).toISOString();

    legendYou.hidden = !yours;
    if (yours) {
      privateEl.hidden = false;
      privateEl.textContent = '';
      const label = document.createElement('span');
      label.textContent = 'Your private maximum ';
      const strong = document.createElement('strong');
      strong.textContent = engine.money(yours.max);
      const rest = document.createElement('span');
      rest.textContent = yours.id === current.leader?.id && yours.max > current.price
        ? ` · ${engine.money(yours.max - current.price)} of headroom is unpublished.`
        : ' · shown only in this tab.';
      privateEl.append(label, strong, rest);
    } else {
      privateEl.hidden = true;
    }

    renderChart();
    renderLists();
    fillTape();
    document.title = `${high} · ${lotInput.value.trim() || 'Auction anything'}`;

    if (isClosed && current.leader && !state.note.startsWith('Closed.')) {
      state.note = `Closed. ${current.leader.name} wins at ${engine.money(current.price)}.`;
      statusEl.textContent = state.note;
    }
  }

  function tick() {
    const wasClosed = bidOpen.disabled;
    clockEl.textContent = clockText();
    clockWrap.classList.toggle('is-urgent', !closed() && remaining() <= WINDOW_MS);
    fillTape();
    if (closed() && !wasClosed) render();
  }

  function fitLot() {
    const length = Math.max(lotInput.value.trim().length, 4);
    lotInput.style.fontSize = `${Math.max(28, Math.min(108, 640 / length))}px`;
  }

  lotInput.addEventListener('input', () => {
    fitLot();
    const name = lotInput.value.trim();
    const current = book();
    document.title = `${current.price ? engine.money(current.price) : 'Auction'} · ${name || 'Auction anything'}`;
  });

  bidOpen.addEventListener('click', () => {
    formError.textContent = '';
    const current = book();
    minimumHint.textContent = current.price
      ? `Minimum ${engine.money(current.minimum)}. A higher reserved maximum keeps the lead without publishing its ceiling.`
      : 'The first public price is $1, whatever maximum you reserve above it.';
    if (state.yourName) bidderInput.value = state.yourName;
    sheet.showModal();
    (state.yourName ? maximumInput : bidderInput).focus();
  });

  cancelBtn.addEventListener('click', () => sheet.close());

  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = cleanName(bidderInput.value);
    const max = parseDollars(maximumInput.value);
    if (!name) {
      formError.textContent = 'Use a plain name, without a link.';
      return;
    }
    if (max == null) {
      formError.textContent = 'Enter a dollar amount, such as 120 or 120.50.';
      return;
    }
    const existing = you();
    const result = applyBid({
      id: YOU,
      name,
      max,
      at: existing ? existing.at : ++state.seq,
    });
    if (!result.ok) {
      formError.textContent = result.error;
      return;
    }
    state.yourName = name;
    maximumInput.value = '';
    sheet.close();
    render();
  });

  jumpBtn.addEventListener('click', () => {
    if (closed()) return;
    state.closesAt = Date.now() + WINDOW_MS;
    state.note = 'Final 15 seconds. A bid now moves the close forward.';
    render();
  });

  replayBtn.addEventListener('click', () => {
    seed();
    render();
  });

  window.addEventListener('resize', renderChart);

  renderTape();
  seed();
  fitLot();
  render();
  window.setInterval(tick, 250);
})();
