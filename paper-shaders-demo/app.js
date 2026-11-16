(function () {
  const card = window.PaperCard;
  const shaderUrl = new URL('vendor/paper-shaders/dist/index.js', document.currentScript.src);
  const sampleUrl = new URL('sample.png', document.currentScript.src);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const hero = document.querySelector('#hero');
  const headlineShader = document.querySelector('#headline-shader');
  const pillShader = document.querySelector('#pill-shader');
  const product = document.querySelector('#card');
  const blurb = document.querySelector('#blurb');
  const shadersEl = document.querySelector('#shaders');
  const swatchesEl = document.querySelector('#swatches');
  const warnEl = document.querySelector('#warn');
  const pauseBtn = document.querySelector('#pause');
  const bagBtn = document.querySelector('#bag');
  const bagLabel = bagBtn.querySelector('.pill-label');

  const speed = document.querySelector('#speed');
  const scale = document.querySelector('#scale');
  const distortion = document.querySelector('#distortion');
  const swirl = document.querySelector('#swirl');
  const shape = document.querySelector('#shape');
  const dither = document.querySelector('#dither');

  let state = card.initialState(motion.matches);
  let pkg = null;
  let assets = null;
  let mounts = [];
  let added = false;

  card.SHADERS.forEach(function (item, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'radio';
    button.dataset.shader = item.id;
    button.textContent = item.label;
    button.tabIndex = index === 0 ? 0 : -1;
    shadersEl.appendChild(button);
  });

  for (let i = 0; i < 4; i++) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.className = 'job';
    const input = document.createElement('input');
    input.type = 'color';
    input.dataset.index = String(i);
    input.value = state.colors[i];
    label.appendChild(name);
    label.appendChild(input);
    swatchesEl.appendChild(label);
  }

  shadersEl.addEventListener('click', function (event) {
    const button = event.target.closest('[data-shader]');
    if (!button) return;
    choose(button.dataset.shader);
  });

  shadersEl.addEventListener('keydown', function (event) {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (keys.indexOf(event.key) < 0) return;
    event.preventDefault();
    const buttons = Array.prototype.slice.call(shadersEl.querySelectorAll('[data-shader]'));
    let index = buttons.findIndex(function (button) { return button.dataset.shader === state.shader; });
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % buttons.length;
    else index = (index - 1 + buttons.length) % buttons.length;
    choose(buttons[index].dataset.shader);
    buttons[index].focus();
  });

  swatchesEl.addEventListener('input', function (event) {
    const input = event.target.closest('input');
    if (!input) return;
    state = card.setColor(state, input.dataset.index, input.value);
    sync();
  });

  [['speed', speed], ['scale', scale], ['distortion', distortion], ['swirl', swirl]].forEach(function (pair) {
    pair[1].addEventListener('input', function () {
      state = card.setNumber(state, pair[0], pair[1].value);
      sync();
    });
  });

  shape.addEventListener('input', function () {
    state = card.setChoice(state, 'metalShape', card.METAL_SHAPES[Number(shape.value)]);
    sync();
  });

  dither.addEventListener('input', function () {
    state = card.setChoice(state, 'ditherType', card.DITHER_TYPES[Number(dither.value)]);
    sync();
  });

  pauseBtn.addEventListener('click', function () {
    state = card.setPaused(state, !state.paused);
    sync();
  });

  bagBtn.addEventListener('click', function () {
    added = !added;
    bagBtn.setAttribute('aria-pressed', added ? 'true' : 'false');
    bagLabel.textContent = added ? 'Added' : 'Add to bag';
  });

  motion.addEventListener('change', function () {
    if (motion.matches) {
      state = card.setPaused(state, true);
      sync();
    }
  });

  boot();

  function choose(id) {
    const previous = state.shader;
    state = card.selectShader(state, id);
    if (state.shader !== previous) mountAll();
    sync();
  }

  function ready(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve(img);
    return new Promise(function (resolve, reject) {
      img.addEventListener('load', function () { resolve(img); }, {once: true});
      img.addEventListener('error', function () { reject(new Error('image')); }, {once: true});
    });
  }

  function load(src) {
    const img = new Image();
    img.src = src;
    return ready(img);
  }

  async function boot() {
    try {
      pkg = await import(shaderUrl.href);
      const noise = pkg.getShaderNoiseTexture();
      const empty = await load(pkg.emptyPixel);
      const glass = await load(sampleUrl.href);
      await ready(noise);
      assets = {noise: noise, empty: empty, glass: glass};
      mountAll();
      sync();
    } catch (error) {
      warnEl.textContent = 'The shader could not start in this browser.';
    }
  }

  function hosts() {
    return [
      {el: hero, role: 'mark'},
      {el: headlineShader, role: 'fill'},
      {el: pillShader, role: 'fill'},
    ];
  }

  function mountAll() {
    mounts.forEach(function (mount) { mount.dispose(); });
    mounts = [];
    warnEl.textContent = '';
    if (!pkg || !assets) return;
    const spec = card.shaderById(state.shader);
    const fragment = pkg[spec.fragment];
    hosts().forEach(function (host) {
      const role = state.shader === 'metal' && host.role === 'mark' ? 'mark' : 'fill';
      try {
        const mount = new pkg.ShaderMount(
          host.el,
          fragment,
          card.uniforms(state, assets, role),
          undefined,
          card.playbackSpeed(state),
          0,
          1,
          1280 * 720
        );
        mounts.push(mount);
      } catch (error) {
        warnEl.textContent = 'WebGL2 is not available, so the shader cannot draw.';
      }
    });
  }

  function sync() {
    const visible = card.controlVisible(state.shader);
    document.querySelector('#distortion-field').hidden = !visible.distortion;
    document.querySelector('#swirl-field').hidden = !visible.swirl;
    document.querySelector('#shape-field').hidden = !visible.metalShape;
    document.querySelector('#dither-field').hidden = !visible.ditherType;
    product.classList.toggle('is-mark', state.shader === 'metal');
    hero.setAttribute('aria-label', state.shader === 'metal' ? 'Letter mark' : 'Product surface');
    blurb.textContent = card.blurb(state.shader);

    const jobs = card.colorJobs(state.shader);
    Array.prototype.forEach.call(swatchesEl.querySelectorAll('label'), function (label, index) {
      label.querySelector('.job').textContent = jobs[index];
      const input = label.querySelector('input');
      input.value = state.colors[index];
      const unused = jobs[index] === 'Not used here';
      input.disabled = unused;
      label.style.opacity = unused ? '0.45' : '1';
    });

    speed.value = String(state.speed);
    scale.value = String(state.scale);
    distortion.value = String(state.distortion);
    swirl.value = String(state.swirl);
    document.querySelector('#speed-out').textContent = Number(state.speed).toFixed(2);
    document.querySelector('#scale-out').textContent = Number(state.scale).toFixed(2);
    document.querySelector('#distortion-out').textContent = Number(state.distortion).toFixed(2);
    document.querySelector('#swirl-out').textContent = Number(state.swirl).toFixed(2);
    const shapeIndex = Math.max(0, card.METAL_SHAPES.indexOf(state.metalShape));
    const ditherIndex = Math.max(0, card.DITHER_TYPES.indexOf(state.ditherType));
    shape.value = String(shapeIndex);
    dither.value = String(ditherIndex);
    document.querySelector('#shape-out').textContent = state.metalShape;
    shape.setAttribute('aria-valuetext', state.metalShape);
    const ditherLabel = state.ditherType === 'random' ? 'random' : state.ditherType.replace('x', '×');
    document.querySelector('#dither-out').textContent = ditherLabel;
    dither.setAttribute('aria-valuetext', ditherLabel);
    pauseBtn.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
    pauseBtn.textContent = state.paused ? 'Play' : 'Pause';

    const buttons = shadersEl.querySelectorAll('[data-shader]');
    Array.prototype.forEach.call(buttons, function (button) {
      const on = button.dataset.shader === state.shader;
      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
    });

    if (!mounts.length) return;
    const speedNow = card.playbackSpeed(state);
    hosts().forEach(function (host, index) {
      const mount = mounts[index];
      if (!mount) return;
      const role = state.shader === 'metal' && host.role === 'mark' ? 'mark' : 'fill';
      const values = card.uniforms(state, assets, role);
      const numeric = {};
      Object.keys(values).forEach(function (key) {
        if (values[key] instanceof HTMLImageElement) return;
        numeric[key] = values[key];
      });
      mount.setUniforms(numeric);
      mount.setSpeed(speedNow);
    });
  }
})();
