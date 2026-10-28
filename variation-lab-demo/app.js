(function () {
  const Lab = window.VariationLab;
  const Theory = window.TheoryLab;

  const els = {
    axes: document.getElementById('axes'),
    bench: document.getElementById('bench'),
    rate: document.getElementById('rate'),
    clicks: document.getElementById('clicks'),
    visits: document.getElementById('visits'),
    parts: document.getElementById('parts'),
    formula: document.getElementById('formula'),
    pin: document.getElementById('pin'),
    shuffle: document.getElementById('shuffle'),
    pinList: document.getElementById('pin-list'),
    compare: document.getElementById('compare'),
    pinNote: document.getElementById('pin-note'),
    status: document.getElementById('status'),
    source: document.getElementById('slow-source'),
    count: document.getElementById('count'),
    countOut: document.getElementById('count-out'),
    renderSlow: document.getElementById('render-slow'),
    checkAll: document.getElementById('check-all'),
    slowTime: document.getElementById('slow-time'),
    listHost: document.getElementById('list-host'),
    theoryGrid: document.getElementById('theory-grid'),
    theorySummary: document.getElementById('theory-summary'),
  };

  let selection = Lab.defaultSelection();
  let pins = [];
  let busy = false;
  const results = new Map();

  function frame() {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        resolve();
      };
      requestAnimationFrame(finish);
      setTimeout(finish, 32);
    });
  }

  function applyCard(card, spec) {
    card.className = 'price layout-' + spec.layout + ' type-' + spec.type + ' radius-' + spec.radius;
    card.style.setProperty('--card-bg', spec.color.bg);
    card.style.setProperty('--card-fg', spec.color.fg);
    card.style.setProperty('--card-muted', spec.color.muted);
    card.style.setProperty('--card-accent', spec.color.accent);
    card.style.setProperty('--card-on', spec.color.onAccent);
    card.style.setProperty('--card-line', spec.color.line);
    card.querySelector('.product').textContent = spec.product;
    card.querySelector('.plan').textContent = spec.plan;
    card.querySelector('.amount strong').textContent = spec.price;
    card.querySelector('.amount span').textContent = spec.period;
    card.querySelector('.lede').textContent = spec.lede;
    const list = card.querySelector('.features');
    list.replaceChildren();
    for (const feature of spec.features) {
      const item = document.createElement('li');
      item.textContent = feature;
      list.appendChild(item);
    }
    const cta = card.querySelector('.cta');
    cta.textContent = spec.cta;
  }

  function makeCard(spec) {
    const card = document.createElement('article');
    card.innerHTML = [
      '<p class="fictional">Fictional</p>',
      '<p class="product"></p>',
      '<div class="price-head"><p class="plan"></p><p class="amount"><strong></strong> <span></span></p></div>',
      '<p class="lede"></p>',
      '<ul class="features"></ul>',
      '<button type="button" class="cta"></button>',
    ].join('');
    applyCard(card, spec);
    card.setAttribute('aria-label', spec.product + ', ' + spec.plan + ', fictional');
    card.querySelector('.cta').addEventListener('click', function () {
      els.status.textContent = 'Nothing was sent. Paper Kettle is a fictional sketch, not a product for sale.';
    });
    return card;
  }

  function renderStage() {
    const spec = Lab.describe(selection);
    els.bench.replaceChildren(makeCard(spec));
    const sim = Lab.simulate(selection);
    els.rate.textContent = sim.rate.toFixed(1) + '%';
    els.clicks.textContent = String(sim.clicks);
    els.visits.textContent = sim.visits.toLocaleString('en-US');
    els.parts.replaceChildren();
    for (const part of sim.parts) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = part.label;
      const value = document.createElement('b');
      value.textContent = Lab.formatTenths(part.tenths, part.id !== 'base');
      row.append(name, value);
      els.parts.appendChild(row);
    }
    const pinned = pins.some(function (pin) { return pin.key === Lab.pinKey(selection); });
    els.pin.textContent = pinned ? 'Pinned' : 'Pin this mix';
    els.pin.disabled = pinned || pins.length >= Lab.MAX_PINS && !pinned;
    if (!pinned && pins.length >= Lab.MAX_PINS) els.pin.textContent = 'Board is full';
  }

  function renderPins() {
    els.pinList.replaceChildren();
    if (!pins.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Nothing pinned yet.';
      els.pinList.appendChild(empty);
    }
    for (const pin of pins) {
      const chip = document.createElement('div');
      chip.className = 'pin';
      const load = document.createElement('button');
      load.type = 'button';
      load.textContent = pin.label;
      load.addEventListener('click', function () {
        selection = Lab.cloneSelection(pin.selection);
        syncAxes();
        renderStage();
        els.status.textContent = 'Loaded ' + pin.label + '.';
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'unpin';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove ' + pin.label);
      remove.addEventListener('click', function () {
        pins = Lab.removePin(pins, pin.key);
        renderPins();
        renderStage();
      });
      chip.append(load, remove);
      els.pinList.appendChild(chip);
    }

    els.compare.replaceChildren();
    if (pins.length < 2) {
      els.pinNote.textContent = pins.length === 1
        ? 'Pin another mix to compare them side by side.'
        : 'Pin two mixes to compare them side by side.';
      return;
    }
    els.pinNote.textContent = 'Side by side. The rates are the same simulated formula, so the gap is the mix, not a sample.';
    for (const pin of pins) {
      const wrap = document.createElement('div');
      wrap.className = 'compare-card';
      const spec = Lab.describe(pin.selection);
      const card = makeCard(spec);
      card.classList.add('mini');
      const sim = Lab.simulate(pin.selection);
      const meta = document.createElement('p');
      meta.className = 'compare-rate';
      meta.textContent = 'Simulated ' + sim.rate.toFixed(1) + '% · ' + sim.clicks + ' clicks / ' + sim.visits.toLocaleString('en-US') + ' visits';
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.setProperty('--w', Math.max(6, sim.rate / 6 * 100) + '%');
      wrap.append(card, meta, bar);
      els.compare.appendChild(wrap);
    }
  }

  function syncAxes() {
    for (const button of els.axes.querySelectorAll('[role="radio"]')) {
      const on = selection[button.dataset.axis] === button.dataset.option;
      button.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  function buildAxes() {
    for (const axis of Lab.AXES) {
      const field = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = axis.label;
      const group = document.createElement('div');
      group.className = 'chips';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', axis.label);
      for (const item of axis.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'radio');
        button.dataset.axis = axis.id;
        button.dataset.option = item.id;
        button.textContent = item.label;
        button.setAttribute('aria-checked', selection[axis.id] === item.id ? 'true' : 'false');
        button.addEventListener('click', function () {
          selection = Lab.cloneSelection(selection);
          selection[axis.id] = item.id;
          syncAxes();
          renderStage();
        });
        group.appendChild(button);
      }
      group.addEventListener('keydown', function (event) {
        const buttons = Array.from(group.querySelectorAll('[role="radio"]'));
        const index = buttons.indexOf(document.activeElement);
        if (index < 0) return;
        let next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
        else return;
        event.preventDefault();
        buttons[next].click();
        buttons[next].focus();
      });
      field.append(legend, group);
      els.axes.appendChild(field);
    }
  }

  function timeMode(mode) {
    const host = els.listHost;
    const t0 = performance.now();
    host.replaceChildren();
    for (let i = 0; i < mode.count; i++) {
      const row = document.createElement('div');
      row.className = mode.shadow ? 'row row-heavy' : 'row';
      row.textContent = Theory.rowText(i, mode.text);
      host.appendChild(row);
      if (mode.read === 'each') void host.scrollHeight;
    }
    if (mode.read !== 'each') void host.scrollHeight;
    return performance.now() - t0;
  }

  async function measure(mode) {
    const runs = mode.count > 360 ? 1 : 3;
    const samples = [];
    for (let i = 0; i < runs; i++) {
      await frame();
      samples.push(timeMode(mode));
    }
    return Theory.median(samples);
  }

  function setBusy(next) {
    busy = next;
    els.renderSlow.disabled = next;
    els.checkAll.disabled = next;
    els.count.disabled = next;
    for (const button of els.theoryGrid.querySelectorAll('button')) button.disabled = next;
  }

  function renderTheoryCards() {
    els.theoryGrid.replaceChildren();
    for (const theory of Theory.THEORIES) {
      const card = document.createElement('article');
      card.className = 'theory';
      card.dataset.theory = theory.id;
      const title = document.createElement('h3');
      title.textContent = theory.title;
      const hypothesis = document.createElement('p');
      hypothesis.textContent = theory.hypothesis;
      const method = document.createElement('p');
      method.className = 'method';
      method.textContent = theory.method;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Check';
      button.addEventListener('click', function () { runTheory(theory.id); });
      const out = document.createElement('div');
      out.className = 'finding';
      out.dataset.finding = theory.id;
      card.append(title, hypothesis, method, button, out);
      els.theoryGrid.appendChild(card);
    }
  }

  function showFinding(id, samples, verdict) {
    results.set(id, {title: Theory.THEORIES.find(function (item) { return item.id === id; }).title, status: verdict.status});
    const theory = Theory.THEORIES.find(function (item) { return item.id === id; });
    const steps = Theory.plan(id, Number(els.count.value));
    const out = els.theoryGrid.querySelector('[data-finding="' + id + '"]');
    const card = out.closest('.theory');
    card.dataset.status = verdict.status;
    out.replaceChildren();
    for (const step of steps) {
      const row = document.createElement('p');
      row.className = 'sample';
      const name = document.createElement('span');
      name.textContent = step.label;
      const value = document.createElement('b');
      value.textContent = Theory.formatMs(samples[step.key]);
      row.append(name, value);
      out.appendChild(row);
    }
    const text = document.createElement('p');
    text.className = 'verdict';
    text.textContent = verdict.text;
    out.appendChild(text);
    const done = Theory.THEORIES.filter(function (item) { return results.has(item.id); }).map(function (item) {
      return {title: item.title, status: results.get(item.id).status};
    });
    els.theorySummary.textContent = done.length === Theory.THEORIES.length ? Theory.summary(done) : theory.title + ' checked.';
  }

  async function execute(id) {
    const button = els.theoryGrid.querySelector('[data-theory="' + id + '"] button');
    button.textContent = 'Checking…';
    try {
      const steps = Theory.plan(id, Number(els.count.value));
      const samples = {};
      for (const step of steps) samples[step.key] = await measure(step.mode);
      showFinding(id, samples, Theory.judge(id, samples));
    } finally {
      button.textContent = 'Check';
    }
  }

  async function runTheory(id) {
    if (busy) return;
    setBusy(true);
    try {
      await execute(id);
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    if (busy) return;
    setBusy(true);
    results.clear();
    for (const theory of Theory.THEORIES) {
      const out = els.theoryGrid.querySelector('[data-finding="' + theory.id + '"]');
      out.replaceChildren();
      out.closest('.theory').dataset.status = '';
    }
    els.theorySummary.textContent = 'Checking all four…';
    try {
      for (const theory of Theory.THEORIES) await execute(theory.id);
    } finally {
      setBusy(false);
    }
  }

  els.pin.addEventListener('click', function () {
    const result = Lab.addPin(pins, selection);
    pins = result.pins;
    if (!result.added && result.reason === 'full') {
      els.status.textContent = 'Six mixes are pinned. Remove one to pin another.';
    } else if (result.added) {
      els.status.textContent = 'Pinned ' + Lab.pinLabel(selection) + '.';
    }
    renderPins();
    renderStage();
  });

  els.shuffle.addEventListener('click', function () {
    const next = {};
    for (const axis of Lab.AXES) {
      const index = Math.floor(Math.random() * axis.options.length);
      next[axis.id] = axis.options[index].id;
    }
    selection = next;
    syncAxes();
    renderStage();
    els.status.textContent = 'Shuffled to ' + Lab.pinLabel(selection) + '.';
  });

  els.count.addEventListener('input', function () {
    const count = Theory.clampCount(els.count.value);
    els.countOut.textContent = String(count);
    results.clear();
    els.theorySummary.textContent = 'Row count changed. Check again.';
    els.slowTime.textContent = '';
    for (const card of els.theoryGrid.querySelectorAll('.theory')) {
      card.dataset.status = '';
      card.querySelector('.finding').replaceChildren();
    }
  });

  els.renderSlow.addEventListener('click', async function () {
    if (busy) return;
    setBusy(true);
    els.renderSlow.textContent = 'Rendering…';
    try {
      const mode = Theory.slowMode(Number(els.count.value));
      const ms = await measure(mode);
      els.slowTime.textContent = Theory.formatMs(ms) + ' to build ' + mode.count + ' fictional rows, reading layout every row.';
    } finally {
      els.renderSlow.textContent = 'Render the slow list';
      setBusy(false);
    }
  });

  els.checkAll.addEventListener('click', runAll);

  els.source.textContent = Theory.SLOW_SOURCE;
  els.formula.textContent = Lab.FORMULA;
  els.count.min = String(Theory.COUNT_MIN);
  els.count.max = String(Theory.COUNT_MAX);
  els.count.value = String(Theory.COUNT_DEFAULT);
  els.countOut.textContent = String(Theory.COUNT_DEFAULT);
  buildAxes();
  renderTheoryCards();
  renderStage();
  renderPins();
})();
