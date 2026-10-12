(function () {
  const bench = window.AnimationBench;
  const hotRoot = document.querySelector('#hot-stage');
  const coolRoot = document.querySelector('#cool-stage');
  const countInput = document.querySelector('#count');
  const countOut = document.querySelector('#count-out');
  const pauseBtn = document.querySelector('#pause');
  const spark = document.querySelector('#spark');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const CHIP = {
    'blur-over-20': 'blur 24–48px',
    'blur-within-20': 'blur 2–5px',
    'shadow-paint': 'box-shadow',
    'shadow-opacity': 'shadow opacity',
    'inherited-variable': 'CSS variable',
    'direct-transform': 'transform',
  };

  let views = {hot: null, cool: null};
  let plan = bench.scenePlan(readToggles());
  let samples = [];
  let running = !reduce.matches;
  let raf = 0;
  let last = 0;
  let ticks = 0;
  let live = {hotBlur: 0, coolBlur: 0};

  document.querySelector('#device-note').textContent = bench.DEVICE_NOTE;
  document.querySelectorAll('#rule-blur, #rule-shadow, #rule-variable').forEach(function (input) {
    input.addEventListener('change', rebuild);
  });
  document.querySelectorAll('input[name="measure"]').forEach(function (input) {
    input.addEventListener('change', function () {
      samples = [];
      last = 0;
      paintReadout();
    });
  });
  countInput.addEventListener('input', rebuild);
  pauseBtn.addEventListener('click', function () {
    running = !running;
    pauseBtn.textContent = running ? 'Pause' : (reduce.matches ? 'Run the bench' : 'Resume');
    if (running) start();
    else stop();
  });

  rebuild();
  if (!running) pauseBtn.textContent = 'Run the bench';

  function readToggles() {
    return {
      blur: document.querySelector('#rule-blur').checked,
      shadow: document.querySelector('#rule-shadow').checked,
      variable: document.querySelector('#rule-variable').checked,
    };
  }

  function mode() {
    const picked = document.querySelector('input[name="measure"]:checked');
    return picked ? picked.value : 'both';
  }

  function rebuild() {
    const count = bench.clampCount(countInput.value);
    countInput.value = String(count);
    countOut.textContent = String(count);
    plan = bench.scenePlan(readToggles());
    views.hot = buildStage(hotRoot, 'hot-title', 'Breaks the rule', count, plan.expensive, 'hot');
    views.cool = buildStage(coolRoot, 'cool-title', 'Follows the rule', count, plan.cheap, 'cool');
    samples = [];
    last = 0;
    applySide(views.hot, plan.expensive, 0, true);
    applySide(views.cool, plan.cheap, 0, true);
    paintReadout();
    if (running) start();
  }

  function buildStage(root, titleId, title, count, sidePlan, kind) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'stage-head';
    const h2 = document.createElement('h2');
    h2.id = titleId;
    h2.textContent = title;
    const chips = document.createElement('ul');
    chips.className = 'chips';
    bench.findings(sidePlan).forEach(function (id) {
      const li = document.createElement('li');
      li.textContent = CHIP[id] || id;
      chips.appendChild(li);
    });
    const liveLine = document.createElement('p');
    liveLine.className = 'live';
    head.append(h2, chips, liveLine);

    const tray = document.createElement('div');
    tray.className = 'tray';
    const cards = [];
    let i;
    for (i = 0; i < count; i += 1) {
      const card = document.createElement('article');
      card.className = 'toast';
      const shade = document.createElement('div');
      shade.className = 'shade';
      const glow = document.createElement('div');
      glow.className = 'glow';
      const face = document.createElement('div');
      face.className = 'face';
      const strong = document.createElement('strong');
      strong.textContent = 'Toast ' + String(i + 1).padStart(2, '0');
      const em = document.createElement('em');
      em.textContent = kind === 'hot' ? 'expensive path' : 'composite path';
      const span = document.createElement('span');
      span.textContent = (i + 1) + ' / ' + count;
      face.append(strong, em, span);
      card.append(shade, glow, face);
      tray.appendChild(card);
      cards.push({el: card, face: face, shade: shade, glow: glow, em: em});
    }
    root.append(head, tray);
    root.classList.toggle('is-shadow', sidePlan.shadow === 'box-shadow');
    root.classList.toggle('is-variable', sidePlan.motion === 'inherited-variable');
    return {root: root, tray: tray, cards: cards, live: liveLine, plan: sidePlan};
  }

  function applySide(view, sidePlan, time, active) {
    if (!view || !active) return 0;
    const started = performance.now();
    const drift = bench.driftPx(time);
    const blur = bench.blurAt(time, sidePlan.blur);
    const fade = bench.shadowOpacity(time);
    const shadow = bench.shadowBlurPx(time);
    if (sidePlan.motion === 'inherited-variable') {
      view.tray.style.setProperty('--drift', drift.toFixed(2) + 'px');
      view.tray.style.transform = 'none';
    } else {
      view.tray.style.removeProperty('--drift');
      view.tray.style.transform = 'translate3d(' + drift.toFixed(2) + 'px, 0, 0)';
    }
    const filter = 'blur(' + blur.toFixed(2) + 'px)';
    const box = '0 12px ' + shadow.toFixed(1) + 'px rgba(23, 32, 40, 0.45)';
    let i;
    for (i = 0; i < view.cards.length; i += 1) {
      const card = view.cards[i];
      card.glow.style.filter = filter;
      if (sidePlan.shadow === 'box-shadow') card.face.style.boxShadow = box;
      else card.shade.style.opacity = fade.toFixed(3);
    }
    if (sidePlan.motion === 'inherited-variable' && view.cards[0]) {
      window.getComputedStyle(view.cards[0].em).transform;
    }
    if (view === views.hot) live.hotBlur = blur;
    else live.coolBlur = blur;
    return performance.now() - started;
  }

  function start() {
    stop();
    last = 0;
    raf = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function tick(now) {
    raf = window.requestAnimationFrame(tick);
    const frameMs = last ? now - last : 0;
    last = now;
    if (!frameMs) return;
    const which = mode();
    const hotMs = applySide(views.hot, plan.expensive, now, which !== 'cool');
    const coolMs = applySide(views.cool, plan.cheap, now, which !== 'hot');
    samples.push({frameMs: frameMs, hotMs: hotMs, coolMs: coolMs});
    if (samples.length > 60) samples.shift();
    ticks += 1;
    if (ticks % 12 === 0) paintReadout();
  }

  function paintReadout() {
    const summary = bench.summarizeFrames(samples);
    document.querySelector('#fps').textContent = summary.frames ? summary.fps.toFixed(0) : '–';
    document.querySelector('#frame-ms').textContent = summary.frames ? summary.avgMs.toFixed(1) : '–';
    document.querySelector('#hot-ms').textContent = summary.frames ? summary.hotAvg.toFixed(2) : '–';
    document.querySelector('#cool-ms').textContent = summary.frames ? summary.coolAvg.toFixed(2) : '–';
    const which = mode();
    const scope = which === 'hot' ? 'the expensive tray only' : which === 'cool' ? 'the rule-following tray only' : 'both trays';
    const missed = summary.frames ? summary.over60 + ' of ' + summary.frames + ' frames missed 16.7ms' : 'waiting for frames';
    document.querySelector('#meter-caption').textContent = 'Frame time includes ' + scope + '. ' + missed + '. 120Hz budget is 8ms.';
    if (views.hot) {
      views.hot.live.textContent = 'blur ' + live.hotBlur.toFixed(1) + 'px · ' + bench.recalcTargets(views.hot.cards.length, plan.expensive.motion) + ' style targets';
    }
    if (views.cool) {
      views.cool.live.textContent = 'blur ' + live.coolBlur.toFixed(1) + 'px · ' + bench.recalcTargets(views.cool.cards.length, plan.cheap.motion) + ' style targets';
    }
    drawSpark(summary);
  }

  function drawSpark() {
    const ctx = spark.getContext('2d');
    const width = spark.clientWidth || 320;
    const height = 72;
    const ratio = window.devicePixelRatio || 1;
    spark.width = Math.round(width * ratio);
    spark.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const max = Math.max(bench.FRAME_60_MS, samples.reduce(function (m, row) {
      return Math.max(m, row.frameMs);
    }, 0));
    ctx.strokeStyle = 'rgba(154, 171, 186, 0.85)';
    ctx.setLineDash([3, 3]);
    ruleLine(ctx, width, height, bench.FRAME_60_MS, max);
    ctx.strokeStyle = 'rgba(226, 61, 18, 0.7)';
    ruleLine(ctx, width, height, bench.FRAME_120_MS, max);
    ctx.setLineDash([]);
    if (samples.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = '#f4f7fa';
    ctx.lineWidth = 1.5;
    samples.forEach(function (row, index) {
      const x = (index / (samples.length - 1)) * (width - 8) + 4;
      const y = height - 8 - (row.frameMs / max) * (height - 16);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function ruleLine(ctx, width, height, ms, max) {
    const y = height - 8 - (Math.min(ms, max) / max) * (height - 16);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
})();
