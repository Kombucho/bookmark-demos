(function () {
  const sc = window.Statechart;
  const machine = document.getElementById('machine');
  const readout = document.getElementById('readout');
  const diagram = document.getElementById('diagram');
  const explosion = document.getElementById('explosion');
  const logEl = document.getElementById('log');
  const flat = document.getElementById('flat');
  const clockBtn = document.getElementById('clock');
  const mercury = document.getElementById('mercury');
  const tempEl = document.getElementById('temp');
  const lamp = document.getElementById('lamp');
  const pips = document.getElementById('pips');
  const shot = document.getElementById('shot');
  const cupBtn = document.getElementById('cup');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let model = sc.boot().state;
  let clockOn = !reduce;
  const lines = ['Power is off. The chart is a single state.'];
  let lastFired = [];

  function leaf(prefix) {
    return model.active.filter(function (id) {
      return id.indexOf(prefix) === 0 && sc.isAtomic(id);
    })[0] || 'off';
  }

  function take(event) {
    const result = sc.send(model, event);
    model = result.state;
    lastFired = [];
    result.steps.forEach(function (step) {
      lines.unshift(sc.stepText(step));
      if (step.kind === 'take') lastFired.push(step.id);
    });
    if (lines.length > 14) lines.length = 14;
    paint();
  }

  function advance() {
    const events = sc.dueEvents(model);
    if (!events.length) return false;
    events.forEach(takeSilent);
    paint();
    return true;
  }

  function takeSilent(event) {
    const result = sc.send(model, event);
    model = result.state;
    result.steps.forEach(function (step) {
      lines.unshift(sc.stepText(step));
      if (step.kind === 'take') lastFired.push(step.id);
    });
    if (lines.length > 14) lines.length = 14;
  }

  function paintMachine() {
    const on = sc.has(model, 'on');
    machine.dataset.power = on ? 'on' : 'off';
    machine.dataset.boiler = leaf('on.boiler').split('.').pop();
    machine.dataset.cycle = leaf('on.cycle').split('.').pop();
    machine.dataset.wand = sc.has(model, 'on.wand.steaming') ? 'steaming' : 'parked';
    machine.dataset.cup = model.context.cup ? 'in' : 'out';
    const heat = Math.max(0, Math.min(100, ((model.context.temp - 20) / 80) * 100));
    mercury.style.height = heat + '%';
    tempEl.textContent = model.context.temp + '°';
    document.getElementById('lamp-word').textContent = on ? 'On' : 'Off';
    cupBtn.textContent = model.context.cup ? 'Lift cup' : 'Place cup';
    pips.replaceChildren();
    for (let i = 0; i < 4; i++) {
      const pip = document.createElement('span');
      if (i < model.context.water) pip.className = 'full';
      pips.appendChild(pip);
    }
    shot.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const mark = document.createElement('span');
      if (i < model.context.poured) mark.className = 'full';
      shot.appendChild(mark);
    }
    readout.textContent = sc.phaseText(model);
  }

  function paintLog() {
    logEl.replaceChildren();
    lines.forEach(function (line) {
      const item = document.createElement('li');
      item.textContent = line;
      logEl.appendChild(item);
    });
  }

  function paintFlat() {
    if (!flat.checked) {
      explosion.hidden = true;
      explosion.replaceChildren();
      return;
    }
    const count = sc.explosion();
    explosion.hidden = false;
    explosion.replaceChildren();
    const lead = document.createElement('p');
    lead.innerHTML = 'The chart has <strong>' + count.chartStates + '</strong> states and <strong>' + count.chartTransitions + '</strong> transitions. Written flat, the same regions are <strong>' + count.flatStates + '</strong> states and <strong>' + count.flatTransitions + '</strong> transitions.';
    const product = document.createElement('p');
    product.textContent = count.boiler + ' boiler × ' + count.cycle + ' brew × ' + count.wand + ' wand = ' + count.product + ' configurations while the machine is on, plus off. Each arrow is copied onto every configuration where its source is active. The lit cell is the one the chart is in.';
    const grid = document.createElement('div');
    grid.className = 'flat-grid';
    const current = sc.currentFlat(model);
    sc.flatCells().forEach(function (cell) {
      const item = document.createElement('span');
      item.className = 'flat-cell' + (current && current.id === cell.id ? ' on' : '');
      item.title = cell.label;
      item.textContent = cell.id === 'off' ? 'Off' : '';
      grid.appendChild(item);
    });
    explosion.append(lead, product, grid);
  }

  function paint() {
    paintMachine();
    diagram.innerHTML = sc.renderDiagram(model, lastFired);
    paintLog();
    paintFlat();
  }

  document.getElementById('power').addEventListener('click', function () { take('POWER'); });
  document.getElementById('fill').addEventListener('click', function () { take('FILL'); });
  document.getElementById('brew').addEventListener('click', function () { take('BREW'); });
  document.getElementById('latch').addEventListener('click', function () { take('LATCH'); });
  document.getElementById('steam').addEventListener('click', function () { take('STEAM'); });
  cupBtn.addEventListener('click', function () {
    take(model.context.cup ? 'LIFT_CUP' : 'PLACE_CUP');
  });
  document.getElementById('advance').addEventListener('click', function () {
    lastFired = [];
    if (!advance()) {
      lines.unshift('Advance · the clock has nothing waiting.');
      if (lines.length > 14) lines.length = 14;
      paint();
    }
  });

  clockBtn.setAttribute('aria-pressed', clockOn ? 'true' : 'false');
  clockBtn.textContent = clockOn ? 'Clock on' : 'Clock off';
  clockBtn.addEventListener('click', function () {
    clockOn = !clockOn;
    clockBtn.setAttribute('aria-pressed', clockOn ? 'true' : 'false');
    clockBtn.textContent = clockOn ? 'Clock on' : 'Clock off';
  });
  flat.addEventListener('change', paintFlat);

  window.setInterval(function () {
    if (!clockOn) return;
    lastFired = [];
    advance();
  }, 900);

  paint();
})();
