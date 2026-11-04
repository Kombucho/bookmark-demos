const NOTES = {
  today: {
    copy: 'The kettle is on. Leave a title, then save it.',
    line: 'Today’s line stays on the card until you discard it.'
  },
  later: {
    copy: 'A later line, still on this same card.',
    line: 'Later is just another tab. The strokes stay put until the seed changes.'
  },
  margin: {
    copy: 'The margin is a pencil rule down the side.',
    line: 'Check the box and the rule is drawn with the same seed as the frame.'
  }
};

const CDN = 'https://cdn.jsdelivr.net/npm/@inkra/react@0.15.0/dist/pencil.js';
const KNOWN = 'M 0.00 10.26 L 17.43 10.05 L 34.21 8.82 L 50.77 8.83 L 68.37 8.90 L 85.69 8.83 L 102.94 8.80 L 120.00 10.18';

const roughness = document.getElementById('roughness');
const stroke = document.getElementById('stroke');
const seedInput = document.getElementById('seed');
const ink = document.getElementById('ink');
const margin = document.getElementById('margin');
const title = document.getElementById('title');
const source = document.getElementById('pencil-source');
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

let pencil = null;
let frame = 0;

function usable(mod) {
  if (!mod || typeof mod.createPencilPoints !== 'function' || typeof mod.createPencilPath !== 'function') {
    return false;
  }
  const probe = mod.createPencilPath({ seed: 7, width: 120, height: 20, roughness: 1.4, points: 8 });
  return probe === KNOWN;
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (value) {
      clearTimeout(timer);
      resolve(value);
    }, function (error) {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function loadPencil() {
  try {
    const mod = await withTimeout(import(CDN), 4000);
    if (!usable(mod)) throw new Error('probe');
    return { mod: mod, via: 'cdn' };
  } catch (error) {
    await new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = 'vendor/inkra-pencil.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(error); };
      document.head.appendChild(script);
    });
    if (!usable(window.InkraPencil)) throw new Error('vendor');
    return { mod: window.InkraPencil, via: 'vendor' };
  }
}

function schedule() {
  if (!pencil || frame) return;
  frame = requestAnimationFrame(function () {
    frame = 0;
    draw();
  });
}

function paint(svg, paths) {
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren.apply(svg, paths.map(function (path) {
    const el = document.createElementNS(ns, 'path');
    el.setAttribute('d', path.d);
    el.dataset.pass = path.pass;
    el.setAttribute('stroke-width', String(path.stroke));
    return el;
  }));
}

function draw() {
  const rough = Number(roughness.value);
  const width = Number(stroke.value);
  const seed = String(seedInput.value || '7');
  document.getElementById('rough-out').textContent = rough.toFixed(1);
  document.getElementById('stroke-out').textContent = width.toFixed(1);
  const inkValue = Number(ink.value);
  document.getElementById('ink-out').textContent = String(inkValue);
  ink.setAttribute('aria-valuenow', String(inkValue));
  const progress = document.getElementById('progress');
  progress.setAttribute('aria-valuenow', String(inkValue));
  document.getElementById('progress-figure').textContent = inkValue + '%';

  document.querySelectorAll('[data-shape]').forEach(function (host) {
    const svg = host.querySelector(':scope > svg.ink');
    if (!svg) return;
    const boxW = host.clientWidth;
    const boxH = host.clientHeight;
    svg.setAttribute('viewBox', '0 0 ' + boxW + ' ' + boxH);
    const shape = host.dataset.shape;
    const box = host.querySelector('input[type="checkbox"]');
    const result = window.SketchKit.renderShape(pencil.createPencilPoints, {
      shape: shape,
      seed: seed + ':' + (host.dataset.seed || shape),
      roughness: rough,
      strokeWidth: width,
      width: boxW,
      height: boxH,
      checked: box ? box.checked : false,
      value: shape === 'range' || shape === 'progress' ? inkValue / 100 : 0,
      margin: host.id === 'card' && margin.checked
    });
    paint(svg, result.paths);
  });

  const sample = document.getElementById('sample');
  const sampleW = Math.max(32, sample.clientWidth);
  const d = pencil.createPencilPath({
    seed: seed + ':sample',
    width: sampleW,
    height: 28,
    roughness: rough,
    points: Math.max(8, Math.min(42, Math.round(sampleW / 16)))
  });
  sample.setAttribute('viewBox', '0 0 ' + sampleW + ' 28');
  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke-width', String(width));
  sample.replaceChildren(path);
  document.getElementById('sample-note').textContent = 'Seed ' + seed + ' · roughness ' + rough.toFixed(1) + ' · stroke ' + width.toFixed(1) + '. The same seed draws this stroke again.';
}

function selectTab(next) {
  const key = next.id.replace('tab-', '');
  tabs.forEach(function (tab) {
    const on = tab === next;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  });
  document.getElementById('panel').setAttribute('aria-labelledby', next.id);
  document.getElementById('panel-copy').textContent = NOTES[key].copy;
  document.getElementById('panel-line').textContent = NOTES[key].line;
  schedule();
}

function wire() {
  [roughness, stroke, seedInput, ink, margin].forEach(function (el) {
    el.addEventListener('input', schedule);
    el.addEventListener('change', schedule);
  });

  document.getElementById('reseed').addEventListener('click', function () {
    seedInput.value = String(1 + Math.floor(Math.random() * 9999));
    schedule();
  });

  document.getElementById('night').addEventListener('click', function () {
    const on = this.getAttribute('aria-checked') !== 'true';
    this.setAttribute('aria-checked', on ? 'true' : 'false');
    document.getElementById('night-word').textContent = on ? 'On' : 'Off';
    document.getElementById('card').dataset.night = on ? 'true' : 'false';
  });

  document.getElementById('save').addEventListener('click', function () {
    const value = title.value.trim();
    const status = document.getElementById('save-status');
    if (!value) {
      status.textContent = 'Write a title first.';
      return;
    }
    document.getElementById('desk-title').textContent = value;
    status.textContent = 'Saved “' + value + '”.';
  });

  document.getElementById('discard').addEventListener('click', function () {
    title.value = '';
    document.getElementById('desk-title').textContent = 'Field desk';
    document.getElementById('save-status').textContent = 'Discarded. The card title is back.';
    schedule();
  });

  title.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') document.getElementById('save').click();
  });

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + dir + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
    });
  });

  const watch = new ResizeObserver(schedule);
  watch.observe(document.getElementById('card'));
  watch.observe(document.querySelector('.bench'));
  window.addEventListener('resize', schedule);
}

wire();
loadPencil().then(function (loaded) {
  pencil = loaded.mod;
  source.textContent = loaded.via === 'cdn'
    ? 'This view is drawing with Inkra’s pencil module from jsDelivr. The React components are not loaded.'
    : 'The jsDelivr module did not answer. This view is drawing with the vendored copy of that same pencil module.';
  schedule();
}).catch(function () {
  source.textContent = 'The pencil module did not load, so the card has no strokes.';
});
