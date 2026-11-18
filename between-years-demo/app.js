(function () {
  const rules = window.BetweenYears;
  const pieces = window.BetweenPieces;
  const probe = { fetch: 0, xhr: 0, beacon: 0, socket: 0, source: 0, wallet: 0 };

  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function () {
      probe.fetch += 1;
      return origFetch.apply(this, arguments);
    };
  }
  if (window.XMLHttpRequest && XMLHttpRequest.prototype.open) {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      probe.xhr += 1;
      return origOpen.apply(this, arguments);
    };
  }
  if (typeof navigator.sendBeacon === 'function') {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    try {
      navigator.sendBeacon = function () {
        probe.beacon += 1;
        return origBeacon.apply(navigator, arguments);
      };
    } catch (err) {
      /* The beacon hook is best-effort. The counter stays at zero if it cannot be wrapped. */
    }
  }
  if (typeof window.WebSocket === 'function') {
    const OrigSocket = window.WebSocket;
    function CountedSocket(url, protocols) {
      probe.socket += 1;
      if (protocols === undefined) return new OrigSocket(url);
      return new OrigSocket(url, protocols);
    }
    CountedSocket.prototype = OrigSocket.prototype;
    CountedSocket.CONNECTING = OrigSocket.CONNECTING;
    CountedSocket.OPEN = OrigSocket.OPEN;
    CountedSocket.CLOSING = OrigSocket.CLOSING;
    CountedSocket.CLOSED = OrigSocket.CLOSED;
    window.WebSocket = CountedSocket;
  }
  if (typeof window.EventSource === 'function') {
    const OrigSource = window.EventSource;
    function CountedSource(url, config) {
      probe.source += 1;
      return new OrigSource(url, config);
    }
    CountedSource.prototype = OrigSource.prototype;
    window.EventSource = CountedSource;
  }
  const ethereum = window.ethereum;
  if (ethereum && typeof ethereum.request === 'function') {
    const origRequest = ethereum.request.bind(ethereum);
    ethereum.request = function () {
      probe.wallet += 1;
      return origRequest.apply(ethereum, arguments);
    };
  }

  const grid = document.getElementById('grid');
  const scrub = document.getElementById('scrub');
  const scrubReadout = document.getElementById('scrub-readout');
  const todayButton = document.getElementById('today');
  const resetButton = document.getElementById('reset');
  const seasonLabel = document.getElementById('season-label');
  const todayLabel = document.getElementById('today-label');
  const countLabel = document.getElementById('count-label');
  const doorStatus = document.getElementById('door-status');
  const countdown = document.getElementById('countdown');
  const pieceKicker = document.getElementById('piece-kicker');
  const pieceTitle = document.getElementById('piece-title');
  const pieceBlurb = document.getElementById('piece-blurb');
  const pieceHost = document.getElementById('piece-host');
  const rulesList = document.getElementById('rules');
  const inspect = document.getElementById('inspect');

  const realAtBoot = rules.ymd(rules.pacificParts(new Date()));
  let dates = [];
  let view = realAtBoot;
  let tracking = true;
  let opened = [];
  let activeDoor = null;
  let activeHandle = null;
  let pieceNetAtMount = 0;
  let pieceMs = null;
  let storageOk = false;
  const loadedMs = Math.round(performance.now());

  function memoryStorage() {
    const map = new Map();
    return {
      getItem: function (key) { return map.has(key) ? map.get(key) : null; },
      setItem: function (key, value) { map.set(key, String(value)); },
      removeItem: function (key) { map.delete(key); },
    };
  }

  let store = memoryStorage();
  try {
    const key = rules.STORAGE_KEY + '-probe';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    store = localStorage;
    storageOk = true;
  } catch (err) {
    storageOk = false;
  }

  function realView() {
    return rules.ymd(rules.pacificParts(new Date()));
  }

  function rebuildRange(anchor) {
    const range = rules.scrubRange(anchor);
    dates = rules.eachDay(range.start, range.end);
    scrub.max = String(Math.max(0, dates.length - 1));
  }

  function networkCount() {
    return probe.fetch + probe.xhr + probe.beacon + probe.socket + probe.source;
  }

  function foreignResources() {
    return performance.getEntriesByType('resource').filter(function (entry) {
      try {
        return new URL(entry.name, location.href).origin !== location.origin;
      } catch (err) {
        return false;
      }
    });
  }

  function scriptsAreLocal() {
    return Array.from(document.scripts).every(function (script) {
      if (!script.src) return true;
      try {
        return new URL(script.src, location.href).origin === location.origin;
      } catch (err) {
        return false;
      }
    });
  }

  function seasonOf(date) {
    return rules.seasonYear(date);
  }

  function loadOpened() {
    opened = rules.readOpened(store, seasonOf(view));
  }

  function saveOpened() {
    try {
      rules.writeOpened(store, seasonOf(view), opened);
    } catch (err) {
      storageOk = false;
    }
  }

  function isOpen(door) {
    return opened.indexOf(door) !== -1 && rules.isUnlocked(door, view);
  }

  function setSliderTo(date) {
    let index = rules.dayIndex(dates, date);
    if (index < 0) {
      rebuildRange(date);
      index = rules.dayIndex(dates, date);
    }
    if (index < 0) index = 0;
    scrub.value = String(index);
    view = dates[index];
  }

  function closePiece() {
    if (activeHandle && activeHandle.destroy) activeHandle.destroy();
    activeHandle = null;
    activeDoor = null;
    pieceHost.replaceChildren();
    pieceKicker.textContent = 'Piece';
    pieceTitle.textContent = 'Open an unlocked door';
    pieceBlurb.textContent = rules.describe(view).unlocked === 0
      ? 'Nothing is unlocked on this date. Drag today into December.'
      : 'Tap a door that is already unlocked. Opened doors stay open in this browser.';
    pieceMs = null;
  }

  function showPiece(door) {
    if (activeDoor === door && activeHandle) return;
    if (activeHandle && activeHandle.destroy) activeHandle.destroy();
    const before = networkCount();
    const started = performance.now();
    activeHandle = pieces.mount(pieceHost, door);
    pieceMs = Math.round(performance.now() - started);
    pieceNetAtMount = networkCount() - before;
    activeDoor = door;
    const when = rules.doorDate(door, seasonOf(view));
    pieceKicker.textContent = door === 32 ? 'Finale · door 32' : 'Door ' + door;
    pieceTitle.textContent = activeHandle.name;
    pieceBlurb.textContent = activeHandle.blurb + ' Unlocks ' + rules.formatYMD(when) + '.';
    pieceTitle.scrollIntoView({ block: 'nearest' });
  }

  function renderGrid() {
    const info = rules.describe(view);
    seasonLabel.textContent = 'Dec ' + info.season + ' · 1 Jan ' + (info.season + 1);
    todayLabel.textContent = rules.formatYMD(view);
    countLabel.textContent = info.unlocked + ' of 32 unlocked';
    const buttons = grid.querySelectorAll('.door');
    buttons.forEach(function (button) {
      const door = Number(button.dataset.door);
      const unlocked = rules.isUnlocked(door, view);
      const open = isOpen(door);
      button.classList.toggle('is-locked', !unlocked);
      button.classList.toggle('is-unlocked', unlocked);
      button.classList.toggle('is-open', open);
      button.setAttribute('aria-pressed', open ? 'true' : 'false');
      const when = rules.doorDate(door, seasonOf(view));
      const state = !unlocked ? 'locked until ' + rules.formatYMD(when) : (open ? 'open' : 'unlocked');
      button.setAttribute('aria-label', 'Door ' + door + ', ' + rules.formatYMD(when) + ', ' + state);
    });
    if (activeDoor !== null && !rules.isUnlocked(activeDoor, view)) closePiece();
    if (!activeHandle) {
      pieceBlurb.textContent = info.unlocked === 0
        ? 'Nothing is unlocked on this date. Drag today into December.'
        : info.unlocked + ' doors are unlocked. Tap one.';
    }
    const real = realView();
    const onReal = rules.sameDay(view, real);
    scrubReadout.textContent = onReal
      ? 'Showing the real Pacific date, ' + rules.formatYMD(view) + '.'
      : 'Previewing ' + rules.formatYMD(view) + '. The countdown below stays on the real clock.';
    todayButton.setAttribute('aria-pressed', onReal ? 'true' : 'false');
    if (!activeHandle && info.unlocked === 0) {
      pieceBlurb.textContent = 'Nothing is unlocked on this date. Drag today into December.';
    }
  }

  function renderCountdown() {
    const now = new Date();
    const next = rules.nextUnlock(now);
    if (next.done) {
      countdown.textContent = 'The real Pacific date has every door of Dec ' + next.season + ' open. The next season starts ' + rules.formatYMD(next.date) + '.';
      return;
    }
    const remain = rules.formatRemain(next.at.getTime() - now.getTime());
    countdown.textContent = 'Real clock: door ' + next.door + ' opens in ' + remain.text + ', midnight Pacific, ' + rules.formatYMD(next.date) + '.';
    if (tracking) {
      const real = realView();
      if (!rules.sameDay(real, view)) {
        setSliderTo(real);
        loadOpened();
        renderGrid();
      }
    }
  }

  function renderRules() {
    const foreign = foreignResources();
    const calls = networkCount();
    const localFiles = scriptsAreLocal();
    const fast = loadedMs < 1200;
    const pieceCalls = activeHandle ? pieceNetAtMount : 0;
    const rows = [
      {
        ok: localFiles,
        title: 'Files only',
        detail: localFiles ? 'The scripts and the stylesheet are in this folder.' : 'A script on this page points at another origin.',
      },
      {
        ok: calls === 0 && foreign.length === 0,
        title: 'No network requests',
        detail: 'fetch, XHR, beacon, WebSocket, and EventSource calls: ' + calls + '. Other-origin resources: ' + foreign.length + '.',
      },
      {
        ok: probe.wallet === 0,
        title: 'No wallet prompt',
        detail: 'Wallet API calls: ' + probe.wallet + '. This page never asks for a signature.',
      },
      {
        ok: fast,
        title: 'Loaded in ' + loadedMs + ' ms',
        detail: fast ? 'The pass was ready in the first second.' : 'This visit took longer than a second to paint the pass.',
      },
      {
        ok: storageOk,
        title: 'Saves stay in this browser',
        detail: storageOk ? 'Opened doors are in localStorage for this season.' : 'This browser blocked localStorage. Opened doors last for this visit.',
      },
    ];
    if (activeHandle) {
      rows.push({
        ok: pieceCalls === 0 && probe.wallet === 0,
        title: activeHandle.name + ' made no request',
        detail: 'Mounted in ' + pieceMs + ' ms. Seed ' + activeHandle.seed + '. Calls during mount: ' + pieceCalls + '.'
          + (activeHandle.audio ? ' Sound is WebAudio in this tab.' : ' No audio in this piece.'),
      });
    }
    rulesList.replaceChildren();
    rows.forEach(function (row) {
      const item = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = 'mark ' + (row.ok ? 'ok' : 'no');
      mark.textContent = row.ok ? 'Yes' : 'No';
      const copy = document.createElement('p');
      copy.className = 'rule-copy';
      const strong = document.createElement('strong');
      strong.textContent = row.title;
      copy.append(strong);
      const small = document.createElement('small');
      small.textContent = row.detail;
      copy.append(small);
      item.append(mark, copy);
      rulesList.appendChild(item);
    });
    if (activeHandle) {
      inspect.textContent = 'Inspecting door ' + activeDoor + ', ' + activeHandle.name + '. It is drawn in this page. Nothing is fetched for it.';
    } else {
      inspect.textContent = 'No piece is open. The check above is the pass itself: the grid, the clock, and the save.';
    }
  }

  function buildDoors() {
    const info = rules.describe(view);
    grid.replaceChildren();
    for (let door = 1; door <= rules.DOOR_COUNT; door += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'door';
      button.dataset.door = String(door);
      button.style.setProperty('--inside', rules.interiorColor(door));
      const slab = document.createElement('span');
      slab.className = 'slab';
      const num = document.createElement('span');
      num.className = 'num';
      const when = rules.doorDate(door, info.season);
      num.textContent = String(when.day);
      slab.appendChild(num);
      if (door === 32) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Jan';
        slab.appendChild(tag);
      }
      button.appendChild(slab);
      button.addEventListener('click', function () { onDoor(door, button); });
      button.addEventListener('animationend', function () { button.classList.remove('shake'); });
      grid.appendChild(button);
    }
  }

  function onDoor(door, button) {
    if (!rules.isUnlocked(door, view)) {
      button.classList.remove('shake');
      void button.offsetWidth;
      button.classList.add('shake');
      const when = rules.doorDate(door, seasonOf(view));
      doorStatus.textContent = 'Door ' + door + ' opens ' + rules.formatYMD(when) + ' at midnight Pacific.';
      return;
    }
    if (opened.indexOf(door) === -1) {
      opened.push(door);
      saveOpened();
      try { pieces.knock(); } catch (err) { /* Audio can fail before a gesture settles. The door still opens. */ }
    }
    const when = rules.doorDate(door, seasonOf(view));
    doorStatus.textContent = 'Door ' + door + ' is open. ' + rules.formatYMD(when) + '.';
    renderGrid();
    showPiece(door);
    renderRules();
  }

  rebuildRange(realAtBoot);
  setSliderTo(realAtBoot);
  loadOpened();
  buildDoors();
  renderGrid();
  renderCountdown();
  renderRules();
  doorStatus.textContent = rules.describe(view).unlocked === 0
    ? 'Every door is still shut. Drag today into December.'
    : 'Tap an unlocked door.';

  scrub.addEventListener('input', function () {
    tracking = false;
    view = dates[Number(scrub.value)] || view;
    loadOpened();
    renderGrid();
    renderRules();
  });

  todayButton.addEventListener('click', function () {
    tracking = true;
    const real = realView();
    rebuildRange(real);
    setSliderTo(real);
    loadOpened();
    renderGrid();
    renderCountdown();
    renderRules();
  });

  resetButton.addEventListener('click', function () {
    opened = [];
    try {
      rules.clearOpened(store, seasonOf(view));
    } catch (err) {
      storageOk = false;
    }
    closePiece();
    renderGrid();
    renderRules();
    doorStatus.textContent = 'Opened doors cleared for this season.';
  });

  window.setInterval(function () {
    renderCountdown();
    renderRules();
  }, 1000);
})();
