(function () {
  const worldApi = window.PaintedWorld;
  const renderApi = window.PaintedRender;
  const canvas = document.getElementById('view');
  const backendEl = document.getElementById('backend');
  const modeEl = document.getElementById('mode');
  const fpsEl = document.getElementById('fps');
  const brush = document.getElementById('brush');
  const brushReadout = document.getElementById('brush-readout');
  const paintButton = document.getElementById('paint');
  const seedInput = document.getElementById('seed');
  const walkButton = document.getElementById('walk');
  const rerollButton = document.getElementById('reroll');
  const status = document.getElementById('status');
  const moveStick = document.getElementById('move-stick');
  const lookStick = document.getElementById('look-stick');

  const keys = new Set();
  const stick = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
  let painted = true;
  let built = null;
  let player = null;
  let renderer = null;
  let fps = 0;
  let last = performance.now();
  const WORDS = ['ridge', 'glass', 'cedar', 'ford', 'mica', 'basin', 'thicket', 'lantern', 'meadow', 'quartz'];

  function seedFromHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return 'ridge-walk';
    try { return decodeURIComponent(raw).slice(0, 48) || 'ridge-walk'; }
    catch (err) { return 'ridge-walk'; }
  }

  function applySeed(seed, replaceHash) {
    const next = String(seed || 'ridge-walk').slice(0, 48);
    seedInput.value = next;
    if (replaceHash) {
      const hash = '#' + encodeURIComponent(next);
      if (location.hash !== hash) history.replaceState(null, '', hash);
    }
    built = worldApi.buildWorld(next);
    player = worldApi.spawnPlayer(built);
    if (renderer) renderer.setWorld(built);
    status.textContent = next + '. ' + built.trees.length + ' trees, ' + built.rocks.length + ' rocks. WASD or arrows walk. Drag the picture to look.';
  }

  function readBrush() {
    const settings = worldApi.brushSettings(brush.value);
    brushReadout.textContent = 'Brush ' + settings.radius + ' · ' + Math.round(settings.strength * 100) + '%';
    return settings;
  }

  function typingTarget(event) {
    const tag = event.target && event.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  window.addEventListener('keydown', function (event) {
    if (typingTarget(event)) return;
    const map = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'l', ArrowRight: 'r' };
    if (!map[event.code]) return;
    keys.add(map[event.code]);
    event.preventDefault();
  });
  window.addEventListener('keyup', function (event) {
    const map = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'l', ArrowRight: 'r' };
    if (map[event.code]) keys.delete(map[event.code]);
  });
  window.addEventListener('blur', function () { keys.clear(); });

  let dragging = false;
  let lastPointer = null;
  canvas.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'touch') return;
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!dragging || !lastPointer || !player) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    player.yaw += dx * 0.005;
    player.pitch = Math.max(-1.15, Math.min(1.15, player.pitch - dy * 0.004));
  });
  function endDrag() { dragging = false; lastPointer = null; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function bindStick(el, onMove) {
    const knob = el.querySelector('.knob');
    let active = false;
    function place(event) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const max = rect.width * 0.34;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, max);
      dx = dx / len * clamped;
      dy = dy / len * clamped;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      onMove(dx / max, dy / max);
    }
    function clear() {
      active = false;
      knob.style.transform = 'translate(0, 0)';
      onMove(0, 0);
    }
    el.addEventListener('pointerdown', function (event) {
      active = true;
      el.setPointerCapture(event.pointerId);
      place(event);
    });
    el.addEventListener('pointermove', function (event) {
      if (!active) return;
      place(event);
    });
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointercancel', clear);
  }

  bindStick(moveStick, function (x, y) {
    stick.moveX = x;
    stick.moveY = y;
  });
  bindStick(lookStick, function (x, y) {
    stick.lookX = x;
    stick.lookY = y;
  });

  brush.addEventListener('input', readBrush);
  paintButton.addEventListener('click', function () {
    painted = !painted;
    paintButton.setAttribute('aria-pressed', painted ? 'true' : 'false');
    paintButton.textContent = painted ? 'Painted' : 'Raw';
    modeEl.textContent = painted ? 'Painted' : 'Raw';
  });

  function go(seed) {
    applySeed(seed, true);
  }

  walkButton.addEventListener('click', function () { go(seedInput.value.trim() || 'ridge-walk'); });
  seedInput.addEventListener('change', function () { go(seedInput.value.trim() || 'ridge-walk'); });
  rerollButton.addEventListener('click', function () {
    const a = WORDS[Math.floor(Math.random() * WORDS.length)];
    const b = WORDS[Math.floor(Math.random() * WORDS.length)];
    const n = Math.floor(Math.random() * 90 + 10);
    go(a + '-' + b + '-' + n);
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    const instant = 1000 / Math.max(1, now - last);
    last = now;
    fps += (instant - fps) * 0.08;
    if (player && built) {
      let forward = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) - stick.moveY;
      let strafe = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + stick.moveX;
      player = worldApi.stepPlayer(player, {
        forward: forward,
        strafe: strafe,
        lookX: stick.lookX * dt * 1.7,
        lookY: -stick.lookY * dt * 1.25,
      }, built, dt);
      const settings = worldApi.brushSettings(brush.value);
      if (renderer) {
        renderer.render(player, {
          radius: settings.radius,
          strength: settings.strength,
          painted: painted,
        });
      }
    }
    fpsEl.textContent = Math.round(fps) + ' fps';
    requestAnimationFrame(frame);
  }

  readBrush();
  applySeed(seedFromHash(), false);
  status.textContent = 'Starting the renderer…';
  renderApi.create(canvas).then(function (created) {
    renderer = created;
    backendEl.textContent = created.backend;
    renderer.setWorld(built);
    status.textContent = created.backend + '. ' + built.seed + '. ' + built.trees.length + ' trees, ' + built.rocks.length + ' rocks. Drag to look, WASD to walk.';
    requestAnimationFrame(frame);
  }).catch(function (err) {
    backendEl.textContent = 'Unavailable';
    status.textContent = err && err.message ? err.message : 'The renderer did not start.';
  });
})();
