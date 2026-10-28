(function () {
  const Stream = window.ScrollStream;
  const Compress = window.ScrollCompress;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SPEEDS = {
    slow: {interval: 140, chars: 420},
    steady: {interval: 80, chars: 780},
    fast: {interval: 40, chars: 1700},
  };

  const viewport = document.getElementById('viewport');
  const streamEl = document.getElementById('stream');
  const openEl = document.createElement('pre');
  openEl.className = 'page live';
  streamEl.appendChild(openEl);

  const els = {
    workloads: document.getElementById('workloads'),
    speeds: document.getElementById('speeds'),
    pause: document.getElementById('pause'),
    clear: document.getElementById('clear'),
    follow: document.getElementById('follow'),
    hint: document.getElementById('hint'),
    raw: document.getElementById('raw'),
    held: document.getElementById('held'),
    saved: document.getElementById('saved'),
    savedPct: document.getElementById('saved-pct'),
    ratio: document.getElementById('ratio'),
    heat: document.getElementById('heat'),
    detail: document.getElementById('detail'),
    termState: document.getElementById('term-state'),
    error: document.getElementById('error'),
  };

  let workload = 'build';
  let speed = 'steady';
  let follow = true;
  let running = !reduced;
  let open = '';
  let pages = [];
  let nextId = 1;
  let runToken = 0;
  let generator = Stream.makeGenerator(workload);
  let timer = 0;
  let reconciling = false;
  let dirty = false;
  let adjusting = false;
  let stick = false;
  let inspect = -1;

  function workloadMeta() {
    return Stream.WORKLOADS.find(function (item) { return item.id === workload; });
  }

  function updateFollowButton() {
    els.follow.textContent = follow ? 'Following' : 'Jump to live';
    els.follow.setAttribute('aria-pressed', follow ? 'true' : 'false');
    els.termState.textContent = follow ? 'following the tail' : 'scrolled back';
  }

  function contentHeight() {
    let lines = Stream.countLines(open);
    for (let i = 0; i < pages.length; i++) lines += pages[i].lines;
    return lines * Stream.LINE_HEIGHT;
  }

  function requestReconcile() {
    dirty = true;
    if (reconciling) return;
    reconciling = true;
    (async function pump() {
      try {
        while (dirty) {
          dirty = false;
          await reconcileOnce();
        }
      } finally {
        reconciling = false;
        if (dirty) requestReconcile();
      }
    })();
  }

  async function deflate(page, token) {
    if (page.compressedBytes != null || page.text == null) return;
    if (page.job) return page.job;
    const text = page.text;
    page.job = Compress.deflateUtf8(text).then(function (bytes) {
      if (token !== runToken || !pages.includes(page)) return;
      page.compressed = bytes;
      page.compressedBytes = bytes.length;
    }).catch(function () {
      els.error.hidden = false;
    }).finally(function () {
      page.job = null;
    });
    return page.job;
  }

  async function inflate(page, token) {
    if (page.text != null || !page.compressed) return;
    if (page.job) return page.job;
    const bytes = page.compressed;
    page.job = Compress.inflateToString(bytes).then(function (text) {
      if (token !== runToken || !pages.includes(page)) return;
      page.text = text;
    }).catch(function () {
      els.error.hidden = false;
    }).finally(function () {
      page.job = null;
    });
    return page.job;
  }

  function pinToTail() {
    if (!follow) return;
    stick = true;
    viewport.scrollTop = viewport.scrollHeight;
    requestAnimationFrame(function () { stick = false; });
  }

  async function reconcileOnce() {
    const token = runToken;
    const height = viewport.clientHeight || 320;
    const top = follow ? Math.max(0, contentHeight() - height) : viewport.scrollTop;
    let range = Stream.hotIndexes(pages, Stream.countLines(open), top, height, Stream.LINE_HEIGHT, 72);
    const jobs = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (range.hot.indexOf(i) !== -1) jobs.push(inflate(page, token));
      else jobs.push(deflate(page, token));
    }
    if (jobs.length) await Promise.all(jobs);
    if (token !== runToken) return;

    const height2 = viewport.clientHeight || 320;
    const top2 = follow ? Math.max(0, contentHeight() - height2) : viewport.scrollTop;
    range = Stream.hotIndexes(pages, Stream.countLines(open), top2, height2, Stream.LINE_HEIGHT, 72);
    const still = new Set(range.hot);
    for (let i = 0; i < pages.length; i++) {
      if (!still.has(i) && pages[i].compressed) pages[i].text = null;
    }
    paint(still);
    pinToTail();
    paintMeters();
    paintHeat(still);
  }

  function paint(hotIds) {
    const host = streamEl;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      let pre = host.children[i];
      if (!pre || pre === openEl || pre.dataset.id !== String(page.id)) {
        pre = document.createElement('pre');
        pre.className = 'page';
        pre.dataset.id = String(page.id);
        host.insertBefore(pre, host.children[i] || openEl);
      }
      const show = hotIds.has(i) ? (page.text || '') : '';
      if (pre.textContent !== show) pre.textContent = show;
      const h = (page.lines * Stream.LINE_HEIGHT) + 'px';
      if (pre.style.height !== h) pre.style.height = h;
    }
    while (host.children.length > pages.length + 1) {
      const extra = host.children[pages.length];
      if (extra === openEl) break;
      extra.remove();
    }
    if (host.lastElementChild !== openEl) host.appendChild(openEl);
    if (openEl.textContent !== open) openEl.textContent = open;
    const lines = Stream.countLines(open);
    openEl.style.height = lines ? (lines * Stream.LINE_HEIGHT) + 'px' : '0px';
  }

  function paintMeters() {
    const totals = Stream.tally(pages, open);
    els.raw.textContent = Stream.formatBytes(totals.raw);
    els.held.textContent = Stream.formatBytes(totals.held);
    els.saved.textContent = (totals.saved < 0 ? '−' : '') + Stream.formatBytes(Math.abs(totals.saved)).replace(/^-/, '');
    els.saved.classList.toggle('over', totals.saved < 0);
    if (!totals.raw) els.savedPct.textContent = 'waiting for output';
    else if (totals.saved >= 0) els.savedPct.textContent = Math.round(totals.saved / totals.raw * 100) + '% of raw';
    else els.savedPct.textContent = Math.round(-totals.saved / totals.raw * 100) + '% over raw';
    els.ratio.textContent = totals.ratio == null ? '—' : Math.round(totals.ratio * 100) + '%';
    if (inspect < 0 || inspect >= pages.length) {
      const meta = workloadMeta();
      const sealed = totals.blobCount
        ? ' Sealed pages are at ' + Math.round(totals.ratio * 100) + '% of their raw size.'
        : ' Nothing has left the screen yet, so nothing is deflated.';
      els.detail.textContent = meta.label + '. ' + meta.hint + '.' + sealed + ' ' + pages.length + ' sealed ' + (pages.length === 1 ? 'page' : 'pages') + '.';
    }
  }

  function paintHeat(hotIds) {
    const host = els.heat;
    while (host.children.length < pages.length) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.addEventListener('click', onHeatClick);
      button.addEventListener('pointerenter', onHeatInspect);
      button.addEventListener('focus', onHeatInspect);
      host.appendChild(button);
    }
    while (host.children.length > pages.length) host.lastElementChild.remove();
    for (let i = 0; i < pages.length; i++) {
      const button = host.children[i];
      const page = pages[i];
      const ratio = Stream.pageRatio(page);
      button.dataset.index = String(i);
      button.classList.toggle('is-hot', hotIds.has(i));
      button.classList.toggle('is-pending', ratio == null);
      const color = Stream.heatColor(ratio);
      button.style.background = color || '';
      const pct = ratio == null ? 'not deflated yet' : Math.round(ratio * 100) + '% of raw';
      const where = hotIds.has(i) ? 'on screen, text expanded' : 'off screen, text dropped';
      const label = 'Page ' + (i + 1) + ', ' + where + ', ' + pct;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }

  function onHeatClick(event) {
    const index = Number(event.currentTarget.dataset.index);
    const page = pages[index];
    if (!page) return;
    follow = false;
    updateFollowButton();
    let y = 0;
    for (let i = 0; i < index; i++) y += pages[i].lines * Stream.LINE_HEIGHT;
    adjusting = true;
    viewport.scrollTop = y;
    adjusting = false;
    inspect = index;
    requestReconcile();
  }

  function onHeatInspect(event) {
    const index = Number(event.currentTarget.dataset.index);
    const page = pages[index];
    if (!page) return;
    inspect = index;
    const ratio = Stream.pageRatio(page);
    const blob = page.compressedBytes == null ? 'not deflated yet' : Stream.formatBytes(page.compressedBytes) + ' deflate';
    els.detail.textContent = 'Page ' + (index + 1) + ' · ' + Stream.formatBytes(page.bytes) + ' of text · ' + blob + (ratio == null ? '' : ' · ' + Math.round(ratio * 100) + '%') + '. Click to scroll there.';
  }

  function tick() {
    const fed = Stream.feed(open, generator.next(SPEEDS[speed].chars));
    open = fed.open;
    for (let i = 0; i < fed.sealed.length; i++) {
      const sealed = fed.sealed[i];
      pages.push({
        id: nextId++,
        text: sealed.text,
        bytes: sealed.bytes,
        lines: sealed.lines,
        compressed: null,
        compressedBytes: null,
        job: null,
      });
    }
    const trimmed = Stream.trimPages(pages, Stream.MAX_PAGES);
    if (trimmed.droppedLines && !follow) {
      adjusting = true;
      viewport.scrollTop = Math.max(0, viewport.scrollTop - trimmed.droppedLines * Stream.LINE_HEIGHT);
      adjusting = false;
    }
    pages = trimmed.pages;
    if (inspect >= pages.length) inspect = -1;
    requestReconcile();
  }

  function setRunning(next) {
    running = next;
    if (timer) clearInterval(timer);
    timer = 0;
    if (running) timer = setInterval(tick, SPEEDS[speed].interval);
    els.pause.textContent = running ? 'Pause' : 'Stream';
    els.pause.setAttribute('aria-pressed', running ? 'true' : 'false');
  }

  function reset(nextWorkload) {
    runToken += 1;
    workload = nextWorkload || workload;
    generator = Stream.makeGenerator(workload);
    open = '';
    pages = [];
    inspect = -1;
    follow = true;
    updateFollowButton();
    els.hint.textContent = workloadMeta().hint;
    for (const button of els.workloads.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', button.dataset.workload === workload ? 'true' : 'false');
    }
    adjusting = true;
    viewport.scrollTop = 0;
    adjusting = false;
    requestReconcile();
  }

  function buildControls() {
    for (const item of Stream.WORKLOADS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.workload = item.id;
      button.textContent = item.label;
      button.setAttribute('aria-pressed', item.id === workload ? 'true' : 'false');
      button.addEventListener('click', function () {
        if (item.id === workload) return;
        reset(item.id);
      });
      els.workloads.appendChild(button);
    }
    for (const name of ['slow', 'steady', 'fast']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.speed = name;
      button.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      button.setAttribute('aria-pressed', name === speed ? 'true' : 'false');
      button.addEventListener('click', function () {
        speed = name;
        for (const peer of els.speeds.querySelectorAll('button')) {
          peer.setAttribute('aria-pressed', peer.dataset.speed === speed ? 'true' : 'false');
        }
        if (running) setRunning(true);
      });
      els.speeds.appendChild(button);
    }
  }

  viewport.addEventListener('scroll', function () {
    if (adjusting || stick) return;
    const gap = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const next = gap < 28;
    if (next !== follow) {
      follow = next;
      updateFollowButton();
    }
    inspect = -1;
    requestReconcile();
  }, {passive: true});

  els.pause.addEventListener('click', function () { setRunning(!running); });
  els.clear.addEventListener('click', function () { reset(workload); });
  els.follow.addEventListener('click', function () {
    follow = true;
    updateFollowButton();
    requestReconcile();
  });

  buildControls();
  els.hint.textContent = workloadMeta().hint;
  updateFollowButton();
  setRunning(running);
  if (!running) requestReconcile();
})();
