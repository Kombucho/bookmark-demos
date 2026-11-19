(function () {
  const TM = window.TextualMachinery;
  const stage = window.TextualViz.createStage(document.getElementById('view'));
  const play = document.getElementById('play');
  const speed = document.getElementById('speed');
  const speedReadout = document.getElementById('speed-readout');
  const reset = document.getElementById('reset');
  const preset = document.getElementById('preset');
  const text = document.getElementById('text');
  const sampleBtn = document.getElementById('sample');
  const sampleOut = document.getElementById('sample-out');
  const status = document.getElementById('status');

  const SPEEDS = [
    { label: '1×', sps: 12 },
    { label: '2×', sps: 24 },
    { label: '3×', sps: 36 },
    { label: '4×', sps: 48 },
    { label: '6×', sps: 72 },
    { label: '8×', sps: 100 },
    { label: '12×', sps: 160 },
    { label: '16×', sps: 240 },
    { label: '24×', sps: 360 },
    { label: '32×', sps: 520 },
    { label: '48×', sps: 780 },
    { label: '64×', sps: 1100 },
    { label: '96×', sps: 1600 },
    { label: '128×', sps: 2300 },
    { label: '192×', sps: 3400 },
    { label: 'max', sps: 4800 }
  ];

  let running = true;
  let model = null;
  let trainer = null;
  let currentText = '';
  let carry = 0;
  let last = performance.now();
  let editTimer = 0;

  function speedChoice() {
    const index = Math.max(0, Math.min(SPEEDS.length - 1, (Number(speed.value) || 1) - 1));
    return SPEEDS[index];
  }

  function applySpeed() {
    const choice = speedChoice();
    speedReadout.textContent = choice.label;
    speed.setAttribute('aria-valuenow', speed.value);
    speed.setAttribute('aria-valuetext', choice.label);
  }

  function setRunning(on) {
    running = on;
    play.textContent = on ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function writeStatus() {
    const hud = stage.hud();
    const pct = hud.total ? Math.round(100 * hud.hits / hud.total) : 0;
    status.textContent = 'STEP ' + hud.step + '   RIGHT ' + hud.hits + ' / ' + hud.total + '   ' + pct + '%';
    status.dataset.step = String(hud.step);
    status.dataset.hits = String(hud.hits);
    status.dataset.total = String(hud.total);
    status.dataset.burned = String(hud.burned);
    status.dataset.waiting = String(hud.waiting);
    status.dataset.memory = String(stage.memoryCount());
    status.dataset.next = hud.next;
    status.dataset.said = hud.said;
    status.dataset.pct = String(pct);
  }

  function boot(next, keepSample) {
    const cleaned = String(next || '').replace(/\r\n/g, '\n');
    if (!cleaned.length) return;
    currentText = cleaned;
    model = TM.createModel(cleaned, { seed: 7 });
    trainer = TM.createTrainer(model, cleaned);
    stage.clearParticles();
    stage.resetText();
    stage.resetHud(trainer.length);
    stage.setHidden(model.hidden());
    carry = 0;
    if (!keepSample) sampleOut.textContent = 'Sample runs eighty characters from the weights as they are.';
    writeStatus();
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (running && trainer) {
      carry += speedChoice().sps * dt;
      let steps = Math.floor(carry);
      carry -= steps;
      if (steps > 96) steps = 96;
      const light = steps > 2;
      for (let i = 0; i < steps; i++) {
        const event = trainer.step();
        stage.pushChar(event.said);
        const lastStep = i === steps - 1;
        if (!light || lastStep) {
          stage.spawnForward(event);
          if (!event.correct) stage.spawnError(event, light ? 0.34 : 1);
        } else if (!event.correct && i % 5 === 0) {
          stage.spawnError(event, 0.28);
        }
      }
      if (steps > 0) stage.setHud(trainer.event);
    }
    if (model) stage.setHidden(model.hidden());
    stage.update(running ? dt : 0);
    stage.draw();
    writeStatus();
    window.requestAnimationFrame(frame);
  }

  play.addEventListener('click', function () {
    setRunning(!running);
  });

  speed.addEventListener('input', applySpeed);

  reset.addEventListener('click', function () {
    if (!model || !trainer) return;
    model.reset();
    trainer.resetCursor();
    stage.clearParticles();
    stage.resetText();
    stage.resetHud(trainer.length);
    stage.setHidden(model.hidden());
    carry = 0;
    writeStatus();
  });

  preset.addEventListener('change', function () {
    if (preset.value === 'custom') return;
    const next = TM.PRESETS[preset.value];
    if (!next) return;
    text.value = next;
    boot(next, false);
  });

  text.addEventListener('input', function () {
    const match = Object.keys(TM.PRESETS).find(function (key) {
      return TM.PRESETS[key] === text.value;
    });
    preset.value = match || 'custom';
    window.clearTimeout(editTimer);
    editTimer = window.setTimeout(function () {
      boot(text.value, false);
    }, 320);
  });

  sampleBtn.addEventListener('click', function () {
    if (!model || !trainer) return;
    const ctx = trainer.recentContext();
    sampleOut.textContent = TM.generate(model, ctx, 80, 0.4);
  });

  document.addEventListener('keydown', function (event) {
    if (event.code !== 'Space') return;
    const tag = event.target && event.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
    event.preventDefault();
    setRunning(!running);
  });

  const screen = document.querySelector('.screen');
  if (window.ResizeObserver && screen) {
    const observer = new ResizeObserver(function () { stage.resize(); });
    observer.observe(screen);
  } else {
    window.addEventListener('resize', function () { stage.resize(); });
  }

  text.value = TM.PRESETS.metaphor;
  preset.value = 'metaphor';
  applySpeed();
  setRunning(true);
  stage.resize();
  boot(TM.PRESETS.metaphor, false);
  window.requestAnimationFrame(frame);
})();
