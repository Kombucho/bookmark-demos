(function () {
  const flow = window.Flowchart;
  const source = document.getElementById('source');
  const stage = document.getElementById('stage');
  const msEl = document.getElementById('ms');
  const budget = document.getElementById('budget');
  const timeCard = document.querySelector('.time');
  const nodeCount = document.getElementById('node-count');
  const edgeCount = document.getElementById('edge-count');
  const renderCount = document.getElementById('render-count');
  const errors = document.getElementById('errors');
  const stress = document.getElementById('stress');
  const stressOut = document.getElementById('stress-out');
  const dirTd = document.getElementById('dir-td');
  const dirLr = document.getElementById('dir-lr');
  let renders = 0;
  let fromSlider = false;

  function directionOf(text) {
    return /^\s*(?:flowchart|graph)\s+LR\b/im.test(text) ? 'LR' : 'TD';
  }

  function draw() {
    const started = performance.now();
    const result = flow.render(source.value, {now: function () { return performance.now(); }});
    stage.innerHTML = result.svg;
    const drawn = stage.querySelector('svg');
    if (drawn) {
      drawn.setAttribute('width', result.placed.width);
      drawn.setAttribute('height', result.placed.height);
    }
    stage.getBoundingClientRect();
    const outer = performance.now() - started;
    const ms = Math.max(outer, result.ms);
    renders += 1;
    msEl.textContent = ms < 10 ? ms.toFixed(2) : ms.toFixed(1);
    timeCard.classList.toggle('late', ms > flow.FRAME_MS);
    nodeCount.textContent = String(result.nodes);
    edgeCount.textContent = String(result.edges);
    renderCount.textContent = String(renders);
    budget.textContent = ms > flow.FRAME_MS
      ? 'Longer than a 16.7ms frame. The next keystroke waits on this drawing.'
      : 'Inside a 16.7ms frame. Grow the graph until a keystroke has to wait.';
    const dir = result.direction;
    dirTd.setAttribute('aria-pressed', dir === 'TD' ? 'true' : 'false');
    dirLr.setAttribute('aria-pressed', dir === 'LR' ? 'true' : 'false');
    errors.replaceChildren();
    result.errors.forEach(function (error) {
      const item = document.createElement('li');
      item.textContent = 'Line ' + error.line + ': ' + error.message;
      errors.appendChild(item);
    });
  }

  source.value = flow.STARTER;
  source.addEventListener('input', function () {
    if (fromSlider) return;
    stressOut.textContent = 'custom';
    draw();
  });

  dirTd.addEventListener('click', function () {
    source.value = flow.setDirection(source.value, 'TD');
    draw();
  });
  dirLr.addEventListener('click', function () {
    source.value = flow.setDirection(source.value, 'LR');
    draw();
  });

  stress.addEventListener('input', function () {
    fromSlider = true;
    stressOut.textContent = stress.value;
    source.value = flow.stressSource(Number(stress.value), directionOf(source.value));
    fromSlider = false;
    draw();
  });

  document.getElementById('starter').addEventListener('click', function () {
    stress.value = '12';
    stressOut.textContent = '12';
    fromSlider = true;
    source.value = flow.STARTER;
    fromSlider = false;
    draw();
  });

  document.getElementById('bad').addEventListener('click', function () {
    source.value = source.value.replace(/\s*$/, '') + '\nthis is not a node\n';
    draw();
  });

  stressOut.textContent = stress.value;
  draw();
})();
