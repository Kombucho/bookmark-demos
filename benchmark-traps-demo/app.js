(function () {
  const bench = window.BenchTraps;
  const form = document.getElementById('desk');
  const presets = {
    'Fair desk': {},
    'Cold caches': {warm: {lumen: false, harbor: false}, window: 'warmup'},
    'Both fit in RAM': {dataset: 'fits'},
    'Only Lumen fits': {dataset: 'lumen-fits'},
    'Uniform reads': {pattern: 'uniform'},
    'Harbor, 16 cores': {connections: 64, cores: {harbor: 16}},
    'Lumen on the far link': {connections: 1, farSide: 'lumen'},
    'Short run hides the flush': {duration: 20, checkpoint: 'lumen'},
    'Flush inside 72 seconds': {checkpoint: 'lumen'},
    'Closed stall': {stall: true, loop: 'closed'},
    'Open stall': {stall: true, loop: 'open'},
    'Client cap': {clientBottleneck: true, connections: 32},
    'Headline: the mean': {headline: 'mean'},
  };

  let sketchConnections = 1;

  function fmtMs(n) {
    if (Math.abs(n) >= 100) return Math.round(n).toLocaleString('en-US') + ' ms';
    return (Math.round(n * 10) / 10).toFixed(1) + ' ms';
  }

  function fmtQps(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtRatio(n) {
    return n.toFixed(2);
  }

  function readSetup() {
    const data = new FormData(form);
    return bench.setup({
      duration: Number(data.get('duration')),
      connections: Number(data.get('connections')),
      rttMs: Number(data.get('rttMs')),
      farSide: data.get('farSide'),
      dataset: data.get('dataset'),
      pattern: data.get('pattern'),
      readRatio: Number(data.get('readRatio')),
      warm: {lumen: data.get('warmLumen') === 'on', harbor: data.get('warmHarbor') === 'on'},
      window: data.get('window'),
      cores: {lumen: Number(data.get('coresLumen')), harbor: Number(data.get('coresHarbor'))},
      newerCpu: data.get('newerCpu'),
      checkpoint: data.get('checkpoint'),
      loop: data.get('loop'),
      stall: data.get('stall') === 'on',
      clientBottleneck: data.get('clientBottleneck') === 'on',
      headline: data.get('headline'),
    });
  }

  function writeSetup(desk) {
    form.elements.dataset.value = desk.dataset;
    form.elements.pattern.value = desk.pattern;
    form.elements.readRatio.value = String(desk.readRatio);
    form.elements.warmLumen.checked = desk.warm.lumen;
    form.elements.warmHarbor.checked = desk.warm.harbor;
    form.elements.window.value = desk.window;
    form.elements.coresLumen.value = String(desk.cores.lumen);
    form.elements.coresHarbor.value = String(desk.cores.harbor);
    form.elements.newerCpu.value = desk.newerCpu;
    form.elements.connections.value = String(desk.connections);
    form.elements.rttMs.value = String(desk.rttMs);
    form.elements.farSide.value = desk.farSide;
    form.elements.clientBottleneck.checked = desk.clientBottleneck;
    form.elements.loop.value = desk.loop;
    form.elements.stall.checked = desk.stall;
    form.elements.checkpoint.value = desk.checkpoint;
    form.elements.duration.value = String(desk.duration);
    form.elements.headline.value = desk.headline;
    syncOutputs();
  }

  function syncOutputs() {
    document.getElementById('read-out').textContent = Math.round(Number(form.elements.readRatio.value) * 100) + '%';
    document.getElementById('conn-out').textContent = form.elements.connections.value;
  }

  function draw(id, source) {
    const host = document.getElementById(id);
    host.replaceChildren();
    try {
      host.innerHTML = window.pele.render(source).svg;
    } catch (error) {
      const note = document.createElement('p');
      note.textContent = error && error.message ? error.message : 'This chart did not render.';
      host.appendChild(note);
    }
  }

  function row(label, lumen, harbor) {
    const tr = document.createElement('tr');
    [label, lumen, harbor].forEach(function (value, index) {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = value;
      tr.appendChild(cell);
    });
    return tr;
  }

  function fillList(id, lines) {
    const list = document.getElementById(id);
    list.replaceChildren();
    lines.forEach(function (line) {
      const item = document.createElement('li');
      item.textContent = line;
      list.appendChild(item);
    });
  }

  function renderSketch() {
    const sketch = bench.articleSketch(sketchConnections);
    draw('sketch-chart', sketch.source);
    document.getElementById('sketch-read').textContent =
      sketch.connections + ' × 1000 / (10 + 2.5) = ' + Math.round(sketch.nearQps).toLocaleString('en-US') +
      ' QPS. ' + sketch.connections + ' × 1000 / (10 + 15) = ' + Math.round(sketch.farQps).toLocaleString('en-US') + ' QPS.';
    document.querySelectorAll('[data-sketch]').forEach(function (button) {
      button.setAttribute('aria-pressed', Number(button.getAttribute('data-sketch')) === sketchConnections ? 'true' : 'false');
    });
  }

  function render() {
    syncOutputs();
    const result = bench.run(readSetup());
    document.getElementById('headline').textContent = result.ok ? result.reading.headline : result.error;
    if (!result.ok) return;
    fillList('also', result.reading.also);
    const winners = {};
    Object.keys(result.headlines).forEach(function (metric) {
      winners[result.headlines[metric].winner] = true;
    });
    const calm = result.crimes.length
      ? result.crimeCopy.map(function (crime) { return crime.text; })
      : [Object.keys(winners).length > 1
        ? 'No tracked pitfall is on. The headlines still disagree. Lumen’s median stays on the fast path, and the slow misses are what p99 is made of.'
        : 'No tracked pitfall is on, and the four headlines agree.'];
    fillList('crimes', calm);
    document.getElementById('pitfall-kicker').textContent = result.crimes.length
      ? result.crimes.length + (result.crimes.length === 1 ? ' pitfall on this desk' : ' pitfalls on this desk')
      : 'No tracked pitfall on this desk';
    fillList('variance', result.variance);
    const stats = document.getElementById('stats');
    stats.replaceChildren(
      row('Mean QPS', fmtQps(result.lumen.qpsMean), fmtQps(result.harbor.qpsMean)),
      row('Coefficient of variation', fmtRatio(result.lumen.qpsCov), fmtRatio(result.harbor.qpsCov)),
      row('Interquartile range', fmtQps(result.lumen.qpsIqr), fmtQps(result.harbor.qpsIqr)),
      row('Client p50', fmtMs(result.lumen.p50), fmtMs(result.harbor.p50)),
      row('Client p95', fmtMs(result.lumen.p95), fmtMs(result.harbor.p95)),
      row('Client p99', fmtMs(result.lumen.p99), fmtMs(result.harbor.p99)),
      row('Client mean', fmtMs(result.lumen.meanLatency), fmtMs(result.harbor.meanLatency)),
      row('Service p50', fmtMs(result.lumen.serviceP50), fmtMs(result.harbor.serviceP50)),
      row('Service p99', fmtMs(result.lumen.serviceP99), fmtMs(result.harbor.serviceP99)),
      row('Omitted requests', Math.round(result.lumen.omitted).toLocaleString('en-US'), Math.round(result.harbor.omitted).toLocaleString('en-US'))
    );
    const loopLine = result.setup.loop === 'open'
      ? 'Open loop sends about ' + fmtQps(result.arrivalQps) + ' queries a second and keeps that pace through a stall.'
      : 'Closed loop waits for each response. The omitted count is how many requests the open-loop pace would have sent beyond what completed.';
    document.getElementById('arrival').textContent = loopLine;
    draw('chart-qps', result.charts.qps);
    draw('chart-tail', result.charts.tail);
    draw('chart-latency', result.charts.latency);
    draw('chart-hist', result.charts.histogram);
  }

  Object.keys(presets).forEach(function (label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', function () {
      writeSetup(bench.setup(presets[label]));
      render();
    });
    document.getElementById('presets').appendChild(button);
  });

  document.querySelectorAll('[data-sketch]').forEach(function (button) {
    button.addEventListener('click', function () {
      sketchConnections = Number(button.getAttribute('data-sketch'));
      renderSketch();
    });
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  renderSketch();
  render();
})();
