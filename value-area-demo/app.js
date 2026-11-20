(function () {
  const api = window.ValueArea;
  const playBtn = document.querySelector('#play');
  const pauseBtn = document.querySelector('#pause');
  const stepBtn = document.querySelector('#step');
  const resetBtn = document.querySelector('#reset');
  const forceBtn = document.querySelector('#force');
  const rerollBtn = document.querySelector('#reroll');
  const seedInput = document.querySelector('#seed');
  const balanceInput = document.querySelector('#balance');
  const breakoutInput = document.querySelector('#breakout');
  const volatilityInput = document.querySelector('#volatility');
  const balanceOut = document.querySelector('#balance-out');
  const breakoutOut = document.querySelector('#breakout-out');
  const volatilityOut = document.querySelector('#volatility-out');
  const warnEl = document.querySelector('#warn');
  const tickerEl = document.querySelector('#ticker');
  const priceEl = document.querySelector('#price');
  const profileEl = document.querySelector('#profile');
  const bandsEl = document.querySelector('#bands');
  const plotEl = document.querySelector('#price-plot');
  const scaleEl = document.querySelector('#scale');
  const paceInEl = document.querySelector('#pace-in');
  const paceOutEl = document.querySelector('#pace-out');
  const claimEl = document.querySelector('#claim');
  const dwellEl = document.querySelector('#dwell');
  const statusEl = document.querySelector('#status');
  const bucketsEl = document.querySelector('#buckets');
  const zonesEl = document.querySelector('#zones');
  const motionNote = document.querySelector('#motion-note');

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let config = {
    seed: api.DEFAULTS.seed,
    steps: api.DEFAULTS.steps,
    balanceLength: api.DEFAULTS.balanceLength,
    breakoutProbability: api.DEFAULTS.breakoutProbability,
    volatility: api.DEFAULTS.volatility,
    forceAt: null,
  };
  let series = null;
  let cursor = -1;
  let playing = false;
  let timer = null;
  let speed = 2;

  document.querySelector('.speeds').addEventListener('change', function (event) {
    const input = event.target.closest('input[name="speed"]');
    if (!input) return;
    speed = Number(input.value) || 1;
  });

  playBtn.addEventListener('click', play);
  pauseBtn.addEventListener('click', function () { pause(true); });
  stepBtn.addEventListener('click', step);
  resetBtn.addEventListener('click', reset);
  forceBtn.addEventListener('click', forceBreakdown);
  rerollBtn.addEventListener('click', function () {
    pause(false);
    config.seed = (config.seed + 997) >>> 0;
    config.forceAt = null;
    seedInput.value = String(config.seed);
    cursor = -1;
    rebuild();
  });

  [balanceInput, breakoutInput, volatilityInput].forEach(function (input) {
    input.addEventListener('input', onSlider);
  });
  seedInput.addEventListener('change', onSeed);
  window.addEventListener('resize', function () { if (series) paint(false); });
  reduceQuery.addEventListener('change', syncMotion);
  syncMotion();
  syncOutputs();
  rebuild();

  function syncMotion() {
    motionNote.hidden = !reduceQuery.matches;
  }

  function onSlider() {
    pause(false);
    config.balanceLength = Number(balanceInput.value);
    config.breakoutProbability = Number(breakoutInput.value);
    config.volatility = Number(volatilityInput.value);
    config.forceAt = null;
    cursor = -1;
    syncOutputs();
    rebuild();
  }

  function onSeed() {
    const next = Number(String(seedInput.value).trim());
    if (!Number.isFinite(next)) {
      warnEl.textContent = 'Enter a numeric seed.';
      seedInput.value = String(config.seed);
      return;
    }
    warnEl.textContent = '';
    pause(false);
    config.seed = next >>> 0;
    config.forceAt = null;
    seedInput.value = String(config.seed);
    cursor = -1;
    rebuild();
  }

  function syncOutputs() {
    balanceOut.textContent = String(Math.round(Number(balanceInput.value)));
    breakoutOut.textContent = Math.round(Number(breakoutInput.value) * 100) + '%';
    volatilityOut.textContent = Number(volatilityInput.value).toFixed(2);
  }

  function rebuild() {
    series = api.generate(config);
    paint(true);
  }

  function visibleBars() {
    if (cursor < 0) return series.bars;
    const end = Math.max(2, Math.min(series.bars.length, cursor + 1));
    return series.bars.slice(0, end);
  }

  function play() {
    if (!series) return;
    if (cursor < 0 || cursor >= series.bars.length - 1) cursor = 1;
    playing = true;
    playBtn.setAttribute('aria-pressed', 'true');
    pauseBtn.disabled = false;
    clearInterval(timer);
    const ms = reduceQuery.matches ? 280 : 140;
    timer = setInterval(tick, ms);
    paint(false);
  }

  function tick() {
    cursor = Math.min(series.bars.length - 1, cursor + speed);
    const done = cursor >= series.bars.length - 1;
    paint(done);
    if (done) pause(true);
  }

  function pause(announce) {
    playing = false;
    playBtn.setAttribute('aria-pressed', 'false');
    pauseBtn.disabled = true;
    clearInterval(timer);
    timer = null;
    if (announce && series) writeStatus(api.analyze(visibleBars()));
  }

  function step() {
    pause(false);
    if (!series) return;
    if (cursor < 0 || cursor >= series.bars.length - 1) cursor = 1;
    else cursor += 1;
    paint(true);
  }

  function reset() {
    pause(false);
    config = {
      seed: api.DEFAULTS.seed,
      steps: api.DEFAULTS.steps,
      balanceLength: api.DEFAULTS.balanceLength,
      breakoutProbability: api.DEFAULTS.breakoutProbability,
      volatility: api.DEFAULTS.volatility,
      forceAt: null,
    };
    cursor = -1;
    speed = 2;
    document.querySelector('input[name="speed"][value="2"]').checked = true;
    seedInput.value = String(config.seed);
    balanceInput.value = String(config.balanceLength);
    breakoutInput.value = String(config.breakoutProbability);
    volatilityInput.value = String(config.volatility);
    warnEl.textContent = '';
    syncOutputs();
    rebuild();
  }

  function forceBreakdown() {
    pause(false);
    const steps = config.steps;
    const at = cursor >= 0 && cursor < steps - 8 ? cursor : Math.floor(steps * 0.42);
    config.forceAt = at;
    if (cursor < 0) cursor = -1;
    rebuild();
    warnEl.textContent = 'Breakdown forced at step ' + at + '. The path drops from there.';
  }

  function paint(announce) {
    const bars = visibleBars();
    const analysis = api.analyze(bars);
    drawPrice(bars, analysis);
    drawProfile(analysis);
    drawReadout(analysis, bars);
    drawZones(analysis);
    if (announce || !playing) writeStatus(analysis);
  }

  function drawPrice(bars, analysis) {
    const spec = api.priceChart(bars);
    priceEl.style.setProperty('--pele-series-1', api.COLORS.price);
    if (!spec || !window.pele) {
      priceEl.textContent = 'The chart could not be drawn.';
      bandsEl.replaceChildren();
      return;
    }
    let rendered;
    try {
      rendered = window.pele.render(spec.source);
    } catch (error) {
      priceEl.textContent = 'The chart could not be drawn.';
      bandsEl.replaceChildren();
      return;
    }
    priceEl.innerHTML = rendered.svg;
    const svg = priceEl.querySelector('svg');
    drawBands(svg, spec.bounds, analysis);
  }

  function drawBands(svg, bounds, analysis) {
    bandsEl.replaceChildren();
    if (!svg || !bounds || bounds.max === bounds.min) return;
    const axis = svg.querySelector('.pele-axis');
    const box = axis ? api.plotBoxFromPath(axis.getAttribute('d')) : null;
    if (!box) return;
    const svgRect = svg.getBoundingClientRect();
    const host = plotEl.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!svgRect.height || !vb.height) return;
    function yPx(price) {
      const t = (price - bounds.min) / (bounds.max - bounds.min);
      const yVb = box.y + box.height * (1 - Math.max(0, Math.min(1, t)));
      return ((yVb - vb.y) / vb.height) * svgRect.height + (svgRect.top - host.top);
    }
    function place(lo, hi) {
      const top = yPx(hi);
      const bottom = yPx(lo);
      return {
        top: Math.min(top, bottom) + 'px',
        height: Math.max(2, Math.abs(bottom - top)) + 'px',
        left: ((box.x - vb.x) / vb.width) * svgRect.width + (svgRect.left - host.left) + 'px',
        width: (box.width / vb.width) * svgRect.width + 'px',
      };
    }
    analysis.gaps.forEach(function (gap) {
      const node = el('div', { class: 'band gap' });
      Object.assign(node.style, place(gap.lo, gap.hi));
      bandsEl.appendChild(node);
    });
    analysis.zones.forEach(function (zone) {
      const band = el('div', { class: 'band value' });
      Object.assign(band.style, place(zone.val, zone.vah));
      bandsEl.appendChild(band);
      const poc = el('div', { class: 'band poc' });
      const line = place(zone.poc, zone.poc);
      const y = yPx(zone.poc);
      line.top = (y - 1) + 'px';
      line.height = '2px';
      Object.assign(poc.style, line);
      bandsEl.appendChild(poc);
    });
  }

  function drawProfile(analysis) {
    const spec = api.profileChart(analysis.profile);
    profileEl.classList.remove('is-horizontal');
    profileEl.style.setProperty('--pele-series-1', api.COLORS.value);
    if (!spec || !window.pele) {
      profileEl.textContent = 'The profile could not be drawn.';
      return;
    }
    let rendered;
    try {
      rendered = window.pele.render(spec.source);
    } catch (error) {
      profileEl.textContent = 'The profile could not be drawn.';
      return;
    }
    profileEl.innerHTML = rendered.svg;
    const svg = profileEl.querySelector('svg');
    const axis = svg.querySelector('.pele-axis');
    const box = axis ? api.plotBoxFromPath(axis.getAttribute('d')) : null;
    const rects = svg.querySelectorAll('.pele-bars rect');
    const laid = box ? api.horizontalBars(analysis.profile.bins, box) : [];
    if (box && rects.length === laid.length) {
      laid.forEach(function (bar, index) {
        const rect = rects[index];
        rect.setAttribute('x', bar.x.toFixed(2));
        rect.setAttribute('y', bar.y.toFixed(2));
        rect.setAttribute('width', Math.max(0, bar.width).toFixed(2));
        rect.setAttribute('height', bar.height.toFixed(2));
        rect.setAttribute('fill', api.binColor(analysis.profile.bins[index]));
      });
      svg.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.width + ' ' + box.height);
      svg.setAttribute('width', String(box.width));
      svg.setAttribute('height', String(box.height));
      profileEl.classList.add('is-horizontal');
    }
    drawScale(analysis);
  }

  function drawScale(analysis) {
    const min = analysis.profile.min;
    const max = analysis.profile.max;
    const span = max > min ? max - min : 1;
    const rows = [];
    analysis.zones.forEach(function (zone, index) {
      rows.push({ price: zone.poc, name: 'POC ' + (index + 1) });
    });
    [max, min].forEach(function (price) {
      const crowded = rows.some(function (row) { return Math.abs(row.price - price) / span < 0.08; });
      if (!crowded) rows.push({ price: price, name: '' });
    });
    scaleEl.replaceChildren();
    rows.forEach(function (row) {
      const item = el('span', {}, api.formatPrice(row.price));
      if (row.name) item.appendChild(el('b', {}, row.name));
      const t = Math.max(0, Math.min(1, (row.price - min) / span));
      item.style.top = Math.max(8, Math.min(92, (1 - t) * 100)) + '%';
      scaleEl.appendChild(item);
    });
  }

  function drawReadout(analysis, bars) {
    const speed = analysis.speeds;
    paceInEl.textContent = api.formatPace(speed.inside);
    paceOutEl.textContent = api.formatPace(speed.between);
    claimEl.textContent = api.claimText(speed);
    dwellEl.textContent = analysis.time.inside + ' steps inside balance · ' + analysis.time.between + ' steps between zones';
    const total = series.bars.length;
    const shown = bars.length;
    const last = bars[bars.length - 1];
    const where = last.mode === 'imbalance' ? 'Between zones' : 'Inside balance';
    tickerEl.textContent = 'Step ' + shown + ' of ' + total + ' · ' + where + ' · price index ' + api.formatPrice(last.price);
    plotEl.setAttribute('aria-label', tickerEl.textContent + '. ' + api.claimText(speed));
    bucketsEl.replaceChildren();
    const bins = analysis.profile.bins.slice().sort(function (a, b) { return b.mid - a.mid; });
    bins.forEach(function (bin) {
      const tr = document.createElement('tr');
      if (bin.thin) tr.className = 'is-gap';
      else if (bin.tags.indexOf('poc') !== -1) tr.className = 'is-poc';
      tr.append(
        cell(api.formatPrice(bin.mid)),
        cell(String(bin.count)),
        cell(Math.round(bin.share * 100) + '%'),
        cell(mark(bin))
      );
      bucketsEl.appendChild(tr);
    });
  }

  function mark(bin) {
    if (bin.thin) return 'Gap';
    if (bin.tags.indexOf('poc') !== -1) return 'Point of control';
    if (bin.tags.indexOf('value') !== -1) return 'Value area';
    if (bin.count) return 'Outside value';
    return '';
  }

  function drawZones(analysis) {
    zonesEl.replaceChildren();
    analysis.zones.forEach(function (zone, index) {
      zonesEl.appendChild(el('article', { class: 'note' },
        el('p', { class: 'year' }, 'Balance ' + (index + 1)),
        el('p', { class: 'pct' }, api.formatPrice(zone.poc)),
        el('p', {}, 'Point of control · ' + zone.steps + ' steps'),
        el('p', {}, 'VAH ' + api.formatPrice(zone.vah) + ' · VAL ' + api.formatPrice(zone.val))
      ));
    });
    analysis.moves.forEach(function (move, index) {
      zonesEl.appendChild(el('article', { class: 'note is-gap' },
        el('p', { class: 'year' }, 'Inefficiency ' + (index + 1)),
        el('p', { class: 'pct' }, api.formatPace(move.pace)),
        el('p', {}, 'per step · ' + move.steps + ' steps'),
        el('p', {}, api.formatPrice(move.start) + ' → ' + api.formatPrice(move.end))
      ));
    });
    if (!analysis.zones.length) {
      zonesEl.appendChild(el('p', { class: 'schematic' }, 'No balance zone in this window yet.'));
    }
  }

  function writeStatus(analysis) {
    const forced = config.forceAt == null ? '' : ' Forced breakdown at step ' + config.forceAt + '.';
    statusEl.textContent = tickerEl.textContent + '. ' + api.claimText(analysis.speeds) + forced;
  }

  function cell(text) {
    return el('td', {}, text);
  }

  function el(tag, props) {
    const node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === 'class') node.className = props[key];
      else node.setAttribute(key, props[key]);
    });
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid == null) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }
})();
