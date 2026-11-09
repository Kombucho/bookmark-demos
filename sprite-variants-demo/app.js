(function () {
  const S = window.SpriteVariants;
  const dex = document.getElementById('dex');
  const who = document.getElementById('who');
  const hint = document.getElementById('hint');
  const stage = document.getElementById('stage');
  const stageState = document.getElementById('stage-state');
  const stageImg = document.getElementById('stage-img');
  const stagePath = document.getElementById('stage-path');
  const grid = document.getElementById('grid');
  const styles = document.getElementById('styles');
  const backBtn = document.getElementById('back');
  const shinyBtn = document.getElementById('shiny');
  const femaleBtn = document.getElementById('female');

  const state = {
    id: 25,
    style: 'pixel',
    back: false,
    shiny: false,
    female: false,
  };

  let idTimer = 0;
  let stageToken = 0;
  let gridToken = 0;
  let gridKey = '';

  S.STYLES.forEach(function (style) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = style.label;
    button.dataset.style = style.id;
    button.addEventListener('click', function () {
      state.style = style.id;
      render();
    });
    styles.appendChild(button);
  });

  function readHash() {
    const n = Number(String(location.hash || '').replace('#', ''));
    if (Number.isFinite(n) && n >= 1 && n <= S.MAX_ID) return n;
    return 25;
  }

  function flags() {
    return { back: state.back, shiny: state.shiny, female: state.female };
  }

  function activeCell() {
    const cells = S.matrix(state.style, state.id);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.back === state.back && cell.shiny === state.shiny && cell.female === state.female) return cell;
    }
    return cells[0];
  }

  function appendBroken(parent, text) {
    const bits = text.split('/');
    for (let i = 0; i < bits.length; i++) {
      if (i) {
        parent.appendChild(document.createTextNode('/'));
        parent.appendChild(document.createElement('wbr'));
      }
      parent.appendChild(document.createTextNode(bits[i]));
    }
  }

  function paintPath(node, url, full) {
    const relative = url.indexOf(S.RAW_ROOT) === 0 ? url.slice(S.RAW_ROOT.length) : url;
    const marker = 'sprites/pokemon/';
    const at = relative.indexOf(marker);
    const head = at < 0 ? relative : relative.slice(0, at + marker.length);
    const tail = at < 0 ? '' : relative.slice(at + marker.length);
    node.textContent = '';
    node.title = url;
    if (full) appendBroken(node, S.RAW_ROOT);
    appendBroken(node, head);
    if (tail) {
      const strong = document.createElement('b');
      appendBroken(strong, tail);
      node.appendChild(strong);
    }
  }

  function bindImage(img, url, token, getToken, done) {
    let settled = false;
    function finish(ok) {
      if (settled || token !== getToken()) return;
      settled = true;
      done(ok && img.naturalWidth > 0);
    }
    img.onload = function () { finish(true); };
    img.onerror = function () { finish(false); };
    img.src = url;
    if (img.complete) finish(img.naturalWidth > 0);
  }

  function showStage(cell) {
    const token = ++stageToken;
    const style = S.styleOf(state.style);
    stage.classList.toggle('crisp', style.pixelated);
    paintPath(stagePath, cell.url, true);
    stageState.hidden = false;
    stageState.textContent = 'Loading';
    stageImg.hidden = true;
    stageImg.alt = '';
    bindImage(stageImg, cell.url, token, function () { return stageToken; }, function (ok) {
      if (!ok) {
        stageImg.onload = null;
        stageImg.onerror = null;
        stageImg.removeAttribute('src');
        stageImg.hidden = true;
        stageState.hidden = false;
        stageState.textContent = 'No file at this path.';
        return;
      }
      stageImg.alt = S.nameOf(state.id) + ', ' + cell.label.toLowerCase() + ', ' + style.label;
      stageImg.hidden = false;
      stageState.hidden = true;
    });
  }

  function ensureGrid() {
    const cells = S.matrix(state.style, state.id);
    const key = state.style + ':' + state.id;
    if (key === gridKey && grid.children.length === cells.length) return cells;
    gridKey = key;
    const token = ++gridToken;
    grid.classList.toggle('crisp', S.styleOf(state.style).pixelated);
    grid.textContent = '';
    cells.forEach(function (cell, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.dataset.index = String(index);

      const label = document.createElement('span');
      label.className = 'cell-label';
      label.textContent = cell.label;

      const frame = document.createElement('span');
      frame.className = 'frame';
      const missing = document.createElement('p');
      missing.className = 'missing';
      missing.textContent = 'Loading';
      const img = document.createElement('img');
      img.alt = '';
      img.hidden = true;
      frame.appendChild(missing);
      frame.appendChild(img);

      const path = document.createElement('code');
      paintPath(path, cell.url, false);

      button.appendChild(label);
      button.appendChild(frame);
      button.appendChild(path);
      button.addEventListener('click', function () {
        state.back = cell.back;
        state.shiny = cell.shiny;
        state.female = cell.female;
        render();
      });
      grid.appendChild(button);

      bindImage(img, cell.url, token, function () { return gridToken; }, function (ok) {
        if (!ok) {
          img.onload = null;
          img.onerror = null;
          img.removeAttribute('src');
          img.hidden = true;
          missing.textContent = 'No file';
          return;
        }
        img.alt = S.nameOf(state.id) + ', ' + cell.label.toLowerCase();
        img.hidden = false;
        missing.hidden = true;
      });
    });
    return cells;
  }

  function render() {
    const style = S.styleOf(state.style);
    state.id = S.clampId(state.id);
    if (dex.value !== String(state.id)) dex.value = String(state.id);
    who.textContent = state.id + ' · ' + S.nameOf(state.id);
    hint.textContent = style.blurb;
    backBtn.setAttribute('aria-pressed', state.back ? 'true' : 'false');
    shinyBtn.setAttribute('aria-pressed', state.shiny ? 'true' : 'false');
    femaleBtn.setAttribute('aria-pressed', state.female ? 'true' : 'false');
    const styleButtons = styles.querySelectorAll('button');
    for (let i = 0; i < styleButtons.length; i++) {
      const on = styleButtons[i].dataset.style === state.style;
      styleButtons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const cells = ensureGrid();
    const buttons = grid.querySelectorAll('.cell');
    for (let i = 0; i < buttons.length; i++) {
      const on = cells[i].back === state.back && cells[i].shiny === state.shiny && cells[i].female === state.female;
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    showStage(activeCell());
    if (location.hash !== '#' + state.id) {
      history.replaceState(null, '', '#' + state.id);
    }
  }

  function applyTyped() {
    const raw = dex.value.trim();
    if (!/^\d+$/.test(raw)) return;
    state.id = S.clampId(raw);
    render();
  }

  dex.addEventListener('input', function () {
    window.clearTimeout(idTimer);
    idTimer = window.setTimeout(applyTyped, 220);
  });
  dex.addEventListener('change', applyTyped);
  dex.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      window.clearTimeout(idTimer);
      applyTyped();
    }
  });

  document.getElementById('random').addEventListener('click', function () {
    let next = state.id;
    while (next === state.id) next = 1 + Math.floor(Math.random() * S.MAX_ID);
    state.id = next;
    render();
  });

  document.querySelectorAll('.examples button').forEach(function (button) {
    button.addEventListener('click', function () {
      state.id = S.clampId(button.dataset.id);
      render();
    });
  });

  backBtn.addEventListener('click', function () {
    state.back = !state.back;
    render();
  });
  shinyBtn.addEventListener('click', function () {
    state.shiny = !state.shiny;
    render();
  });
  femaleBtn.addEventListener('click', function () {
    state.female = !state.female;
    render();
  });

  window.addEventListener('hashchange', function () {
    const n = readHash();
    if (n !== state.id) {
      state.id = n;
      render();
    }
  });

  state.id = readHash();
  render();
})();
