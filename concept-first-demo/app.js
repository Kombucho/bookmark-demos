(function () {
  const studio = window.ConceptStudio;
  const SVG = 'http://www.w3.org/2000/svg';

  const appsEl = document.querySelector('#apps');
  const conceptLine = document.querySelector('#concept-line');
  const genericSection = document.querySelector('#generic-section');
  const genericEl = document.querySelector('#generic');
  const directionSection = document.querySelector('#direction-section');
  const directionsEl = document.querySelector('#directions');
  const checkSection = document.querySelector('#check-section');
  const checksEl = document.querySelector('#checks');
  const stepsEl = document.querySelector('#steps');
  const revealBtn = document.querySelector('#reveal');
  const critiqueBtn = document.querySelector('#critique');
  const refineBtn = document.querySelector('#refine');
  const fitBtn = document.querySelector('#fit');
  const fullBtn = document.querySelector('#full');

  let session = studio.createSession();
  let revealed = false;
  let scale = 'fit';

  studio.APPS.forEach(function (app) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.app = app.id;
    button.className = 'app';
    const kind = document.createElement('span');
    kind.textContent = app.kind;
    const name = document.createElement('strong');
    name.textContent = app.name;
    button.append(kind, name);
    appsEl.appendChild(button);
  });

  document.querySelector('#studio').addEventListener('click', onClick);
  document.querySelector('#reset').addEventListener('click', function () {
    session = studio.createSession();
    revealed = false;
    render();
  });
  fitBtn.addEventListener('click', function () { scale = 'fit'; render(); });
  fullBtn.addEventListener('click', function () { scale = 'full'; render(); });

  render();

  function onClick(event) {
    const appBtn = event.target.closest('[data-app]');
    if (appBtn) {
      session = studio.chooseApp(session, appBtn.dataset.app);
      revealed = false;
      render();
      return;
    }
    if (event.target.closest('#reveal')) {
      revealed = true;
      render();
      return;
    }
    const choose = event.target.closest('[data-choose]');
    if (choose) {
      session = studio.chooseDirection(session, choose.dataset.choose);
      render();
      return;
    }
    if (event.target.closest('#critique')) {
      session = studio.runCritique(session);
      render();
      document.querySelector('#check-section').scrollIntoView({block: 'nearest'});
      return;
    }
    if (event.target.closest('#refine')) {
      session = studio.runRefine(session);
      render();
      return;
    }
    const phone = event.target.closest('.screen');
    if (!phone) return;
    const lap = event.target.closest('[data-lap]');
    if (lap) advanceLap(phone);
    const split = event.target.closest('[data-split]');
    if (split) advanceSplit(phone);
    const marks = event.target.closest('[data-marks-btn]');
    if (marks) advanceMarks(phone);
    const light = event.target.closest('[data-light]');
    if (light) toggleLight(light);
    const front = event.target.closest('[data-front]');
    if (front) front.classList.toggle('is-asleep');
    const water = event.target.closest('[data-water]');
    if (water) {
      water.textContent = 'Watered';
      water.closest('.world').classList.add('is-watered');
    }
    const card = event.target.closest('[data-pick-card]');
    if (card) pickCard(phone, card);
    const guess = event.target.closest('[data-suit-guess]');
    if (guess) {
      phone.querySelectorAll('[data-suit-guess]').forEach(function (el) { el.classList.remove('is-picked'); });
      guess.classList.add('is-picked');
    }
    const flip = event.target.closest('[data-flip]');
    if (flip) flip.classList.toggle('is-flipped');
  }

  function advanceLap(phone) {
    const hero = phone.querySelector('[data-lap-value]');
    const runner = phone.querySelector('.runner');
    const n = Number(hero.textContent) + 1;
    hero.textContent = String(n);
    const t = Math.PI + n * 0.55;
    runner.setAttribute('cx', (180 + Math.cos(t) * 150).toFixed(1));
    runner.setAttribute('cy', (118 + Math.sin(t) * 78).toFixed(1));
  }

  function advanceSplit(phone) {
    const rows = phone.querySelectorAll('.split');
    let live = 0;
    rows.forEach(function (row, index) {
      if (row.classList.contains('is-live')) live = index;
    });
    rows[live].classList.remove('is-live');
    rows[(live + 1) % rows.length].classList.add('is-live');
  }

  function advanceMarks(phone) {
    const el = phone.querySelector('[data-marks]');
    el.textContent = el.textContent === 'On your marks' ? 'Set' : 'Go';
  }

  function toggleLight(light) {
    light.classList.toggle('is-dark');
    const screen = light.closest('.screen');
    const lit = screen.querySelectorAll('.pane:not(.is-dark)').length;
    screen.querySelector('[data-lit-count]').textContent = String(lit);
  }

  function pickCard(phone, card) {
    phone.querySelectorAll('[data-pick-card]').forEach(function (el) { el.classList.remove('is-up'); });
    card.classList.add('is-up');
    phone.querySelector('[data-word]').textContent = card.dataset.pickCard;
  }

  function render() {
    const view = studio.present(session);
    appsEl.querySelectorAll('[data-app]').forEach(function (button) {
      const on = view.app && button.dataset.app === view.app.id;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    conceptLine.textContent = view.app ? view.app.concept : 'Four apps. Each one starts from a place, a material, or a game.';
    revealBtn.hidden = !view.app || revealed;
    critiqueBtn.disabled = !session.directionId;
    refineBtn.disabled = !session.critiqued || session.refined;
    refineBtn.textContent = session.refined ? 'Refined' : 'Refine';
    fitBtn.setAttribute('aria-pressed', scale === 'fit' ? 'true' : 'false');
    fullBtn.setAttribute('aria-pressed', scale === 'full' ? 'true' : 'false');
    renderSteps(view);
    genericEl.textContent = '';
    directionsEl.textContent = '';
    if (!view.app) {
      genericSection.hidden = true;
      directionSection.hidden = true;
      checkSection.hidden = true;
      return;
    }
    genericSection.hidden = false;
    mountPhone(genericEl, view.generic, {scale: scale});
    directionSection.hidden = !revealed;
    if (revealed) {
      view.directions.forEach(function (screen) {
        const selected = view.chosen && screen.id === view.chosen.id;
        const shown = selected ? view.chosen : screen;
        mountPhone(directionsEl, shown, {
          scale: scale,
          chooseId: screen.id,
          selected: selected,
        });
      });
    }
    checkSection.hidden = !view.critiqued;
    if (view.critiqued) renderChecks(view);
  }

  function renderSteps(view) {
    const labels = ['App', 'Template', 'Directions', 'Critique', 'Refine'];
    let current = 0;
    if (view.app) current = 1;
    if (revealed) current = 2;
    if (view.chosen) current = 2;
    if (view.critiqued) current = 3;
    if (view.refined) current = 4;
    stepsEl.textContent = '';
    labels.forEach(function (label, index) {
      const li = document.createElement('li');
      if (index < current) li.className = 'is-done';
      if (index === current) li.className = 'is-now';
      li.textContent = label;
      stepsEl.appendChild(li);
    });
  }

  function renderChecks(view) {
    checksEl.textContent = '';
    const head = document.createElement('li');
    head.className = 'check check-head';
    head.append(cell('Check'), cell('Template'), cell(view.chosen.name));
    checksEl.appendChild(head);
    view.genericCritique.forEach(function (item, index) {
      const other = view.chosenCritique[index];
      const row = document.createElement('li');
      row.className = 'check';
      row.append(
        cell(item.label),
        finding(item),
        finding(other)
      );
      checksEl.appendChild(row);
    });
  }

  function cell(text) {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
  }

  function finding(item) {
    const el = document.createElement('span');
    el.className = item.flagged ? 'is-flagged' : 'is-clear';
    const mark = document.createElement('strong');
    mark.textContent = item.flagged ? 'Flagged' : 'Clear';
    const detail = document.createElement('span');
    detail.textContent = item.detail;
    el.append(mark, detail);
    return el;
  }

  function mountPhone(parent, screen, options) {
    const phone = document.createElement('div');
    phone.className = 'phone' + (options.selected ? ' is-chosen' : '');
    const scaler = document.createElement('div');
    scaler.className = 'scaler';
    scaler.dataset.scale = options.scale;
    const device = document.createElement('div');
    device.className = 'device';
    const face = document.createElement('div');
    face.className = 'screen tone-' + screen.tone;
    phone.setAttribute('aria-label', screen.name + '. ' + screen.line);
    const status = document.createElement('div');
    status.className = 'status';
    status.appendChild(cell('9:41'));
    const scene = document.createElement('div');
    scene.className = 'scene';
    applyMetrics(scene, screen);
    const world = document.createElement('div');
    world.className = 'world';
    (PAINTERS[screen.layout] || paintDashboard)(screen, world);
    if (screen.gradients.length) {
      const sheen = document.createElement('div');
      sheen.className = 'sheen';
      sheen.setAttribute('aria-hidden', 'true');
      world.appendChild(sheen);
    }
    scene.appendChild(world);
    const chips = screen.blocks.filter(function (block) { return block.kind === 'chip'; });
    if (chips.length) scene.appendChild(leakBar(chips));
    const grabber = document.createElement('div');
    grabber.className = 'grabber';
    grabber.setAttribute('aria-hidden', 'true');
    grabber.appendChild(document.createElement('span'));
    face.append(status, scene);
    device.append(face, grabber);
    scaler.appendChild(device);
    const caption = document.createElement('div');
    caption.className = 'caption';
    const name = document.createElement('strong');
    name.textContent = screen.name;
    const line = document.createElement('p');
    line.textContent = screen.line;
    caption.append(name, line);
    if (options.chooseId) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.choose = options.chooseId;
      button.textContent = options.selected ? 'Chosen' : 'Choose';
      button.setAttribute('aria-pressed', options.selected ? 'true' : 'false');
      caption.appendChild(button);
    }
    phone.append(scaler, caption);
    parent.appendChild(phone);
  }

  function applyMetrics(scene, screen) {
    const sizes = screen.typeSizes.slice().sort(function (a, b) { return a - b; });
    scene.style.setProperty('--type-max', sizes[sizes.length - 1] + 'px');
    scene.style.setProperty('--type-min', sizes[0] + 'px');
    scene.style.setProperty('--gap', screen.spacing[0] + 'px');
    scene.style.setProperty('--pad', screen.spacing[1] + 'px');
    const structural = screen.blocks.filter(function (block) {
      return block.kind !== 'chip' && typeof block.radius === 'number';
    });
    const radius = structural.length ? structural[0].radius : 0;
    scene.style.setProperty('--radius', radius + 'px');
  }

  function leakBar(chips) {
    const bar = document.createElement('div');
    bar.className = 'leak';
    chips.forEach(function (chip) {
      const el = document.createElement('div');
      el.className = 'chip';
      el.style.borderRadius = chip.radius + 'px';
      const value = document.createElement('b');
      value.textContent = chip.value;
      const label = document.createElement('span');
      label.textContent = chip.label;
      el.append(value, label);
      bar.appendChild(el);
    });
    return bar;
  }

  function node(name, className, text) {
    const el = document.createElement(name);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function button(className, text, attrs) {
    const el = node('button', className, text);
    el.type = 'button';
    Object.keys(attrs || {}).forEach(function (key) { el.dataset[key] = attrs[key]; });
    return el;
  }

  function paintDashboard(screen, world) {
    world.classList.add('dashboard');
    const accent = screen.scene.accent;
    world.style.background = screen.gradients.length
      ? 'linear-gradient(180deg, ' + accent + ' 0 150px, #f5f4fb 150px)'
      : '#f4f1ea';
    const greeting = screen.blocks.find(function (block) { return block.kind === 'greeting'; });
    world.appendChild(node('div', 'meta dash-kicker', 'Today'));
    world.appendChild(node('div', 'hero dash-title', greeting ? greeting.text : 'Home'));
    const stats = node('div', 'stats');
    screen.blocks.filter(function (block) { return block.kind === 'stat'; }).forEach(function (block) {
      const card = node('div', 'stat');
      card.style.borderRadius = block.radius + 'px';
      const value = node('b', null, block.value);
      const label = node('span', null, block.label);
      card.append(value, label);
      stats.appendChild(card);
    });
    if (stats.childNodes.length) world.appendChild(stats);
    const section = screen.blocks.find(function (block) { return block.kind === 'section'; });
    if (section) world.appendChild(node('div', 'meta dash-section', section.text));
    screen.blocks.filter(function (block) { return block.kind === 'row'; }).forEach(function (block) {
      const row = node('div', 'dash-row');
      row.style.borderRadius = block.radius + 'px';
      row.append(node('span', null, block.text), node('i', null, 'Open'));
      world.appendChild(row);
    });
  }

  function paintOval(screen, world) {
    world.classList.add('oval');
    world.appendChild(trackSvg());
    const plate = node('div', 'plate');
    const lap = node('strong', 'hero', screen.scene.lap);
    lap.dataset.lapValue = '1';
    const meta = node('div', 'meta plate-copy');
    meta.append(node('div', null, screen.scene.place), node('div', null, 'Lane ' + screen.scene.lane + ' · ' + screen.scene.split));
    plate.append(lap, meta, button('text', 'A lap', {lap: '1'}));
    world.appendChild(plate);
  }

  function trackSvg() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 360 230');
    svg.setAttribute('class', 'track');
    svg.setAttribute('aria-hidden', 'true');
    function ellipse(attrs) {
      const el = document.createElementNS(SVG, 'ellipse');
      Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
      svg.appendChild(el);
    }
    ellipse({cx: '180', cy: '118', rx: '156', ry: '84', fill: '#5c221c'});
    ellipse({cx: '180', cy: '118', rx: '150', ry: '78', fill: 'none', stroke: '#f4efe6', 'stroke-width': '36'});
    ellipse({cx: '180', cy: '118', rx: '132', ry: '64', fill: 'none', stroke: 'rgba(255,255,255,.8)', 'stroke-width': '1.4'});
    ellipse({cx: '180', cy: '118', rx: '112', ry: '50', fill: 'none', stroke: 'rgba(255,255,255,.8)', 'stroke-width': '1.4'});
    ellipse({cx: '180', cy: '118', rx: '92', ry: '36', fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': '1'});
    ellipse({cx: '180', cy: '118', rx: '70', ry: '20', fill: '#2d6a44'});
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('x1', '180');
    line.setAttribute('x2', '180');
    line.setAttribute('y1', '40');
    line.setAttribute('y2', '196');
    line.setAttribute('stroke', '#f4efe6');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);
    const runner = document.createElementNS(SVG, 'circle');
    runner.setAttribute('class', 'runner');
    runner.setAttribute('cx', '30');
    runner.setAttribute('cy', '118');
    runner.setAttribute('r', '7');
    runner.setAttribute('fill', '#f6f1e6');
    svg.appendChild(runner);
    return svg;
  }

  function paintBoard(screen, world) {
    world.classList.add('board');
    const slab = node('div', 'slab');
    const head = node('div', 'board-head');
    head.append(node('span', 'lamp'), node('span', 'meta', 'Live'));
    const time = node('div', 'hero clock', screen.scene.time);
    const list = node('div', 'splits');
    screen.scene.splits.forEach(function (split, index) {
      const row = node('div', 'split' + (index === 0 ? ' is-live' : ''));
      row.append(node('span', null, split.mark), node('span', null, split.time));
      list.appendChild(row);
    });
    slab.append(head, time, list, button('text', 'Next split', {split: '1'}));
    world.appendChild(slab);
  }

  function paintBlocks(screen, world) {
    world.classList.add('blocks');
    const sky = node('div', 'sky');
    const word = node('div', 'meta marks', screen.scene.word);
    word.dataset.marks = '1';
    sky.append(word, button('text', 'Set', {'marksBtn': '1'}));
    const lanes = node('div', 'lanes');
    for (let i = 0; i < 6; i += 1) {
      lanes.appendChild(node('div', 'lane' + (i === 3 ? ' is-yours' : '')));
    }
    world.append(sky, lanes, node('div', 'hero lane-no', screen.scene.lane), node('div', 'meta gun', 'Gun ' + screen.scene.gun));
  }

  function paintWindows(screen, world) {
    world.classList.add('windows');
    world.appendChild(node('div', 'stars'));
    const count = node('div', 'hero lit-count', String(screen.scene.lit.length));
    count.dataset.litCount = '1';
    world.append(count, node('div', 'meta lit-line', screen.scene.line));
    const row = node('div', 'houses');
    for (let i = 0; i < 7; i += 1) {
      const house = node('div', 'house');
      const body = node('div', 'body');
      const pane = button('pane' + (screen.scene.lit.indexOf(i) === -1 ? ' is-dark' : ''), '', {light: '1'});
      pane.setAttribute('aria-label', 'Window ' + (i + 1));
      body.appendChild(pane);
      house.append(node('div', 'roof'), body);
      row.appendChild(house);
    }
    world.appendChild(row);
  }

  function paintStreet(screen, world) {
    world.classList.add('street');
    screen.scene.houses.forEach(function (house) {
      const row = button('front' + (house.asleep ? ' is-asleep' : ''), '', {front: '1'});
      const name = node('span', house.name === 'You' ? 'hero house-name' : 'house-name', house.name);
      row.append(node('span', 'door'), name, node('span', 'win'));
      world.appendChild(row);
    });
  }

  function paintBell(screen, world) {
    world.classList.add('bell');
    const dial = node('div', 'dial');
    ['XII', 'III', 'VI', 'IX'].forEach(function (numeral, index) {
      dial.appendChild(node('span', 'numeral n' + index, numeral));
    });
    dial.append(node('div', 'hand'), node('div', 'hub'));
    const cottages = node('div', 'cottages');
    for (let i = 0; i < 5; i += 1) cottages.appendChild(node('span', 'cottage' + (i === 4 ? ' is-lit' : '')));
    world.append(node('div', 'meta bell-line', screen.scene.line), dial, node('div', 'hero hour', screen.scene.hour), cottages);
  }

  function paintCut(screen, world) {
    world.classList.add('cut');
    const tag = button('tag', screen.scene.tag, {water: '1'});
    world.append(
      node('div', 'hero plant-name', screen.scene.name),
      node('div', 'leaf l1'),
      node('div', 'leaf l2'),
      node('div', 'leaf l3'),
      node('div', 'stem'),
      node('div', 'pot'),
      tag
    );
  }

  function paintSheet(screen, world) {
    world.classList.add('sheet');
    const mount = node('div', 'mount');
    const specimen = node('div', 'specimen');
    specimen.append(
      node('span', 'stem-line'),
      node('span', 'blade b1'),
      node('span', 'blade b2'),
      node('span', 'blade b3'),
      node('span', 'blade b4')
    );
    mount.append(
      node('div', 'hero latin', screen.scene.latin),
      node('div', 'meta', screen.scene.common),
      specimen,
      node('div', 'stamp meta', screen.scene.collected)
    );
    world.appendChild(mount);
  }

  function paintSill(screen, world) {
    world.classList.add('sill');
    world.append(node('div', 'hero sill-title', 'Fig'), node('div', 'glass'), node('div', 'plank'));
    screen.scene.pots.forEach(function (pot, index) {
      const el = node('div', 'sill-pot p' + index);
      el.append(node('div', 'sill-leaf'), node('div', 'sill-body'), node('div', 'meta pot-name', pot.name));
      if (pot.tag === 'dry') el.appendChild(button('tag', pot.tag, {water: '1'}));
      world.appendChild(el);
    });
  }

  function paintHand(screen, world) {
    world.classList.add('hand');
    const fan = node('div', 'fan');
    screen.scene.cards.forEach(function (card, index) {
      const el = playingCard(card);
      el.classList.add('fan-card', 'r' + index);
      el.dataset.pickCard = card.word;
      if (index === 0) el.classList.add('is-up');
      fan.appendChild(el);
    });
    const word = node('div', 'hero word', screen.scene.cards[0].word);
    word.dataset.word = '1';
    world.append(node('div', 'meta prompt', screen.scene.prompt), fan, word);
  }

  function paintTrick(screen, world) {
    world.classList.add('trick');
    const coins = node('div', 'coins');
    coins.append(node('div', 'hero', screen.scene.captured), node('div', 'meta', 'denari taken'));
    const table = node('div', 'table');
    screen.scene.table.forEach(function (card, index) {
      const el = playingCard(card);
      el.classList.add('table-card', 't' + index);
      table.appendChild(el);
    });
    const backs = node('div', 'backs');
    ['denari', 'coppe', 'spade'].forEach(function (suit) {
      const back = button('mini-back', '', {suitGuess: suit});
      back.setAttribute('aria-label', suit);
      backs.appendChild(back);
    });
    world.append(coins, table, node('div', 'meta trick-prompt', screen.scene.prompt), backs);
  }

  function paintBack(screen, world) {
    world.classList.add('back');
    const flip = button('flipper', '', {flip: '1'});
    flip.setAttribute('aria-label', 'Turn the card');
    const back = node('span', 'cardback');
    back.appendChild(node('span', 'medallion'));
    const face = node('span', 'face');
    face.append(node('span', 'idx', screen.scene.rank), node('span', 'hero', screen.scene.word), node('span', 'meta', screen.scene.suit));
    flip.append(back, face);
    world.appendChild(flip);
  }

  function playingCard(card) {
    const el = button('pcard suit-' + card.suit, '');
    const suit = node('span', 'suit-mark');
    el.append(node('span', 'idx', card.rank), suit, node('span', 'idx idx-bottom', card.rank));
    return el;
  }

  const PAINTERS = {
    dashboard: paintDashboard,
    oval: paintOval,
    board: paintBoard,
    blocks: paintBlocks,
    windows: paintWindows,
    street: paintStreet,
    bell: paintBell,
    cut: paintCut,
    sheet: paintSheet,
    sill: paintSill,
    hand: paintHand,
    trick: paintTrick,
    back: paintBack,
  };
})();
