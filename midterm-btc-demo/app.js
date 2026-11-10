(function () {
  const api = window.MidtermBtc;
  const startInput = document.querySelector('#start');
  const yearsEl = document.querySelector('#years');
  const warnEl = document.querySelector('#warn');
  const chartEl = document.querySelector('#chart');
  const plotEl = document.querySelector('#plot');
  const hairEl = document.querySelector('#hair');
  const dotsEl = document.querySelector('#dots');
  const readoutEl = document.querySelector('#readout');
  const notesEl = document.querySelector('#notes');
  const roundingEl = document.querySelector('#rounding');

  const shown = { '2014': true, '2018': true, '2022': true };
  let start = api.IMPLIED_START;
  let plot = null;
  let day = 0;
  let engaged = false;

  api.SCENARIOS.forEach(function (item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'true');
    button.dataset.year = item.id;
    const dot = document.createElement('span');
    dot.className = 'swatch';
    dot.style.setProperty('--swatch', api.COLORS[item.id]);
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);
    button.appendChild(document.createTextNode(String(item.year)));
    yearsEl.appendChild(button);
  });

  yearsEl.addEventListener('click', function (event) {
    const button = event.target.closest('[data-year]');
    if (!button) return;
    const id = button.dataset.year;
    shown[id] = !shown[id];
    button.setAttribute('aria-pressed', shown[id] ? 'true' : 'false');
    paint();
  });

  document.querySelector('.chips').addEventListener('click', function (event) {
    const button = event.target.closest('[data-start]');
    if (!button) return;
    startInput.value = button.dataset.start;
    applyStart(button.dataset.start);
  });

  startInput.addEventListener('input', function () {
    applyStart(startInput.value);
  });
  startInput.addEventListener('blur', function () {
    if (api.sanitizeStart(startInput.value) !== null) startInput.value = plain(start);
  });

  plotEl.addEventListener('pointermove', function (event) {
    if (!plot) return;
    engaged = true;
    showDay(dayFromEvent(event));
  });
  plotEl.addEventListener('pointerleave', function () {
    showDay(day);
  });
  plotEl.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    engaged = true;
    if (event.key === 'Home') day = 0;
    else if (event.key === 'End') day = api.YEAR_DAYS;
    else day = Math.max(0, Math.min(api.YEAR_DAYS, day + (event.key === 'ArrowRight' ? 1 : -1)));
    showDay(day);
  });

  window.addEventListener('resize', function () {
    if (engaged) showDay(day);
  });

  paint();

  function ids() {
    return api.SCENARIOS.map(function (item) { return item.id; }).filter(function (id) { return shown[id]; });
  }

  function applyStart(value) {
    const next = api.sanitizeStart(value);
    if (next === null) {
      warnEl.textContent = 'Enter a price above zero, up to $10,000,000.';
      return;
    }
    warnEl.textContent = '';
    start = next;
    if (document.activeElement !== startInput) startInput.value = plain(start);
    paint();
  }

  function plain(n) {
    const digits = n >= 100 ? 0 : 2;
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
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

  function paint() {
    const visible = ids();
    const spec = api.chartSource(start, visible);
    roundingEl.textContent = roundingCopy();
    notesEl.replaceChildren();
    if (!spec) {
      chartEl.replaceChildren(el('p', { class: 'schematic' }, 'Turn a year on to draw its path.'));
      plot = null;
      hairEl.hidden = true;
      dotsEl.replaceChildren();
      readoutEl.textContent = 'No year is visible.';
      return;
    }
    visible.forEach(function (id, index) {
      chartEl.style.setProperty('--pele-series-' + (index + 1), api.COLORS[id]);
    });
    let rendered;
    try {
      rendered = window.pele.render(spec.source);
    } catch (e) {
      chartEl.textContent = 'The chart could not be drawn.';
      plot = null;
      return;
    }
    chartEl.innerHTML = rendered.svg;
    const svg = chartEl.querySelector('svg');
    plot = readPlot(svg, spec);
    spec.scenarios.forEach(function (item) { notesEl.appendChild(note(item)); });
    showDay(day);
  }

  function note(item) {
    const low = api.pathPrice(item, item.days, start);
    const end = api.pathPrice(item, api.YEAR_DAYS, start);
    return el('article', { class: 'note', 'data-year': item.id },
      el('p', { class: 'year' }, String(item.year) + ' midterm'),
      el('p', { class: 'pct' }, api.formatPercent(item.drawdown)),
      el('p', {}, 'in ' + item.days + ' days, to ' + api.formatUsd(low)),
      el('p', { class: 'cite' }, 'The post’s picture of this low was ' + item.illustratedLow + '.'),
      el('p', { class: 'later' }, 'A year after ' + api.formatPercent(item.yearReturn) + ' · ' + api.formatUsd(end))
    );
  }

  function roundingCopy() {
    const bits = api.SCENARIOS.map(function (item) {
      return api.formatUsd(api.pathPrice(item, item.days, api.IMPLIED_START));
    });
    return 'At the implied $78,000, the stated percents land on ' + bits.join(', ') + '. The post rounded those pictures to ~$40.5K, ~$38.4K, and ~$66.3K. A different starting price scales the same percents. The post says each of those lows was the bear-market bottom.';
  }

  function readPlot(svg, spec) {
    const paths = Array.prototype.filter.call(svg.querySelectorAll('path'), function (path) {
      const stroke = path.getAttribute('stroke') || '';
      const d = path.getAttribute('d') || '';
      return stroke.indexOf('--pele-series-') !== -1 && d.length > 80;
    });
    return {
      svg: svg,
      spec: spec,
      series: paths.map(function (path) {
        const nums = path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
        const pts = [];
        for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
        return pts;
      }),
    };
  }

  function dayFromEvent(event) {
    const svg = plot.svg;
    const rect = svg.getBoundingClientRect();
    const box = viewBox(svg);
    const x = ((event.clientX - rect.left) / rect.width) * box.width + box.x;
    const pts = plot.series[0];
    const span = pts[pts.length - 1].x - pts[0].x || 1;
    return Math.max(0, Math.min(api.YEAR_DAYS, Math.round(((x - pts[0].x) / span) * api.YEAR_DAYS)));
  }

  function viewBox(svg) {
    const parts = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }

  function showDay(next) {
    day = next;
    plotEl.setAttribute('aria-valuenow', String(day));
    const reading = api.hover(start, day, ids());
    if (!reading || !reading.rows.length) {
      readoutEl.textContent = 'No year is visible.';
      hairEl.hidden = true;
      dotsEl.replaceChildren();
      return;
    }
    const bits = reading.rows.map(function (row) {
      return row.year + ' ' + api.formatUsd(row.price) + ' (' + row.phase + ')';
    });
    readoutEl.replaceChildren(
      el('strong', {}, 'Day ' + reading.day + ' of ' + api.YEAR_DAYS),
      document.createTextNode(' · ' + bits.join(' · '))
    );
    if (engaged) placeMarks(reading);
    else {
      hairEl.hidden = true;
      dotsEl.replaceChildren();
    }
  }

  function placeMarks(reading) {
    if (!plot || !plot.series.length || plot.series[0].length < 2) {
      hairEl.hidden = true;
      dotsEl.replaceChildren();
      return;
    }
    const svg = plot.svg;
    const rect = svg.getBoundingClientRect();
    const host = plotEl.getBoundingClientRect();
    const box = viewBox(svg);
    const pts = plot.series[0];
    const span = pts[pts.length - 1].x - pts[0].x || 1;
    const x = pts[0].x + (reading.day / api.YEAR_DAYS) * span;
    const left = ((x - box.x) / box.width) * rect.width + (rect.left - host.left);
    hairEl.hidden = false;
    hairEl.style.left = left + 'px';
    dotsEl.replaceChildren();
    reading.rows.forEach(function (row, index) {
      const series = plot.series[index];
      if (!series || series.length !== api.YEAR_DAYS + 1) return;
      const pt = series[reading.day];
      const dot = el('span', { class: 'dot' });
      dot.style.setProperty('--dot', row.color);
      dot.style.left = (((pt.x - box.x) / box.width) * rect.width + (rect.left - host.left)) + 'px';
      dot.style.top = (((pt.y - box.y) / box.height) * rect.height + (rect.top - host.top)) + 'px';
      dotsEl.appendChild(dot);
    });
  }
})();
