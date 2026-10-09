(function () {
  const pieces = window.AsciiPieces;
  const snippet = window.AsciiSnippet;
  const motion = window.AsciiStageMotion;
  const hero = document.getElementById('hero');
  const fallback = document.getElementById('fallback');
  const editor = document.getElementById('editor');
  const status = document.getElementById('status');
  const cueNote = document.getElementById('cue-note');
  const nowLabel = document.getElementById('now-label');
  const nowName = document.getElementById('now-name');
  const motionButton = document.getElementById('motion');
  const motionState = document.getElementById('motion-state');
  const find = document.getElementById('find');
  const hits = document.getElementById('hits');
  const gallery = document.getElementById('gallery');
  const asciiSrc = document.getElementById('ascii-src');

  let current = 'donut';
  let standIn = false;
  let scriptDown = false;
  let ringTimer = 0;
  let ringStep = 0;
  let failTimer = 0;

  function setStatus(text) {
    status.textContent = text;
  }

  function ringFrame(step) {
    const cols = 25;
    const rows = 13;
    const cx = 12;
    const cy = 6;
    const grid = [];
    for (let y = 0; y < rows; y++) grid.push(new Array(cols).fill(' '));
    const dots = 32;
    for (let i = 0; i < dots; i++) {
      const angle = (i / dots) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * 10);
      const y = Math.round(cy + Math.sin(angle) * 5);
      if (grid[y] && grid[y][x] != null) grid[y][x] = '.';
    }
    const mark = ((step % dots) / dots) * Math.PI * 2 - Math.PI / 2;
    const mx = Math.round(cx + Math.cos(mark) * 10);
    const my = Math.round(cy + Math.sin(mark) * 5);
    if (grid[my] && grid[my][mx] != null) grid[my][mx] = 'O';
    const lines = grid.map(function (row) { return row.join('').replace(/\s+$/, ''); });
    lines.push('          -- stage --');
    return lines.join('\n');
  }

  function drawRing() {
    fallback.textContent = ringFrame(motion.reduced ? 0 : ringStep);
  }

  function stopRing() {
    clearInterval(ringTimer);
    ringTimer = 0;
  }

  function syncRing() {
    if (!standIn) {
      stopRing();
      return;
    }
    drawRing();
    if (motion.reduced) {
      stopRing();
      return;
    }
    if (ringTimer) return;
    ringTimer = setInterval(function () {
      ringStep = (ringStep + 1) % 32;
      drawRing();
    }, 140);
  }

  function showStandIn(reason) {
    standIn = true;
    document.body.classList.add('stand-in');
    fallback.hidden = false;
    nowLabel.textContent = 'Stand-in';
    nowName.textContent = 'local ring';
    setStatus(reason);
    syncRing();
  }

  function hideStandIn() {
    if (!standIn) return;
    standIn = false;
    document.body.classList.remove('stand-in');
    fallback.hidden = true;
    stopRing();
    nowLabel.textContent = 'Now playing';
    nowName.textContent = current;
  }

  function heroHasPicture() {
    return !!(hero.querySelector('pre') || hero.querySelector('canvas'));
  }

  function syncGallery() {
    gallery.querySelectorAll('[data-piece]').forEach(function (button) {
      const on = button.getAttribute('data-piece') === current;
      button.closest('.card').classList.toggle('on', on);
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function applyCue(cue) {
    if (cue.fps) hero.setAttribute('fps', String(cue.fps));
    else hero.removeAttribute('fps');
    if (cue.options) hero.setAttribute('options', JSON.stringify(cue.options));
    else hero.removeAttribute('options');
    if (cue.mono) hero.setAttribute('mono', '');
    else hero.removeAttribute('mono');
    hero.setAttribute('label', cue.label || cue.piece);
    hero.setAttribute('piece', cue.piece);
    current = cue.piece;
    syncGallery();
    if (scriptDown || (standIn && !heroHasPicture())) {
      showStandIn('The tag says piece="' + cue.piece + '". ascii.rest is not on the page, so the ring is standing in.');
      return;
    }
    nowLabel.textContent = 'Now playing';
    nowName.textContent = cue.piece;
    setStatus(motion.reduced ? 'Holding the first frame of ' + cue.piece + '.' : 'Playing ' + cue.piece + '.');
  }

  function cueSource(source) {
    const parsed = snippet.parseSnippet(source);
    if (!parsed.ok) {
      cueNote.textContent = parsed.error;
      return false;
    }
    editor.value = source;
    cueNote.textContent = 'The stage is using this tag.';
    applyCue(parsed);
    return true;
  }

  function cueName(name) {
    const source = snippet.buildSnippet({ piece: name });
    if (cueSource(source)) find.value = '';
    hits.replaceChildren();
  }

  function renderGallery() {
    pieces.GALLERY.forEach(function (item) {
      const card = document.createElement('article');
      card.className = 'card';
      const preview = document.createElement('div');
      preview.className = 'preview';
      preview.setAttribute('aria-hidden', 'true');
      const art = document.createElement('ascii-art');
      art.setAttribute('piece', item.name);
      art.setAttribute('label', item.title);
      art.textContent = '···';
      preview.appendChild(art);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-piece', item.name);
      const title = document.createElement('span');
      title.className = 'card-title';
      title.textContent = item.title;
      const group = document.createElement('span');
      group.className = 'card-group';
      group.textContent = item.group;
      button.append(title, group);
      button.addEventListener('click', function () { cueName(item.name); });
      preview.addEventListener('click', function () { button.click(); });
      card.append(preview, button);
      gallery.appendChild(card);
    });
    syncGallery();
  }

  function suggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const rest = [];
    pieces.NAMES.forEach(function (name) {
      if (name.startsWith(q)) starts.push(name);
      else if (name.includes(q)) rest.push(name);
    });
    return starts.concat(rest).slice(0, 8);
  }

  function renderHits() {
    const found = suggestions(find.value);
    hits.replaceChildren();
    if (!find.value.trim()) return;
    if (!found.length) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = 'No piece with that name.';
      hits.appendChild(empty);
      return;
    }
    found.forEach(function (name) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', function () { cueName(name); });
      hits.appendChild(button);
    });
  }

  function syncMotionButton() {
    const on = motion.reduced;
    motionButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    motionState.textContent = on ? 'On' : 'Off';
    syncRing();
  }

  function markScriptDown(reason) {
    if (scriptDown) return;
    scriptDown = true;
    document.body.classList.add('script-down');
    showStandIn(reason);
  }

  editor.value = snippet.buildSnippet({ piece: 'donut' });
  document.getElementById('find-hint').textContent = pieces.NAMES.length + ' names from ascii.rest. Enter cues an exact match.';
  if (motion.nativeReduce) {
    document.getElementById('motion-note').appendChild(document.createTextNode(' Your browser is already asking for reduced motion, so the stage starts held.'));
  }
  renderGallery();
  syncMotionButton();

  motionButton.addEventListener('click', function () {
    const next = motionButton.getAttribute('aria-pressed') !== 'true';
    motion.set(next);
    setStatus(next ? 'Holding the first frame.' : 'Playing ' + (standIn ? 'the stand-in ring' : current) + '.');
  });
  window.addEventListener('ascii-stage-motion', syncMotionButton);

  find.addEventListener('input', renderHits);
  find.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const q = find.value.trim().toLowerCase();
    if (pieces.has(q)) cueName(q);
    else if (hits.querySelector('button')) hits.querySelector('button').click();
  });

  document.getElementById('cue').addEventListener('click', function () {
    cueSource(editor.value);
  });
  editor.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      cueSource(editor.value);
    }
  });

  const watch = new MutationObserver(function () {
    if (!heroHasPicture()) return;
    scriptDown = false;
    document.body.classList.remove('script-down');
    hideStandIn();
    nowName.textContent = current;
    setStatus(motion.reduced ? 'Holding the first frame of ' + current + '.' : 'Playing ' + current + '.');
  });
  watch.observe(hero, { childList: true });

  asciiSrc.addEventListener('error', function () {
    clearTimeout(failTimer);
    markScriptDown('ascii.rest did not load. This ring is drawn on the page.');
  });

  failTimer = setTimeout(function () {
    if (!window.customElements || !customElements.get('ascii-art')) {
      markScriptDown('ascii.rest did not load. This ring is drawn on the page.');
      return;
    }
    if (!heroHasPicture()) {
      showStandIn('The piece did not paint. This ring is drawn on the page.');
    }
  }, 8000);

  if (window.customElements && customElements.get('ascii-art') && heroHasPicture()) {
    setStatus(motion.reduced ? 'Holding the first frame of donut.' : 'Playing donut.');
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopRing();
    else syncRing();
  });
})();
