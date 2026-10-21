(function () {
  const S = window.Earshot;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const libraryEl = document.getElementById('library');
  const charactersEl = document.getElementById('characters');
  const rolesEl = document.getElementById('roles');
  const seedForm = document.getElementById('seed-form');
  const seedInput = document.getElementById('seed');
  const kitRead = document.getElementById('kit-read');
  const wave = document.getElementById('wave');
  const waveMeta = document.getElementById('wave-meta');
  const audioStatus = document.getElementById('audio-status');
  const fpsNote = document.getElementById('fps-note');
  const fpsRead = document.getElementById('fps-read');
  const frameRead = document.getElementById('frame-read');
  const bar = document.getElementById('bar');
  const notch = document.getElementById('notch');
  const ring = document.getElementById('ring');
  const word = document.getElementById('word');
  const check = document.getElementById('check');
  const checkPath = document.getElementById('check-path');
  const chip = document.getElementById('chip');
  const hitEl = document.getElementById('hit');
  const playBtn = document.getElementById('play');
  const fpsEl = document.getElementById('fps');
  const transportStatus = document.getElementById('transport-status');
  const ghostsEl = document.getElementById('ghosts');
  const markersEl = document.getElementById('markers');
  const playhead = document.getElementById('playhead');
  const cuesEl = document.getElementById('cues');

  const groups = ['click', 'pop', 'tick', 'whoosh', 'hit', 'success', 'error', 'toggle', 'shimmer'];
  let character = 'calm';
  let seed = 1;
  let kit = S.kitFromSeed(character, seed);
  let fps = 24;
  let selected = { source: 'library', id: S.LIBRARY[0].id };
  let rows = [];
  let audio = null;
  let armed = false;
  let playing = false;
  let voices = [];
  let origin = 0;
  let scheduledUntil = 0;
  let rafId = 0;
  let previewId = 0;
  let previewStart = 0;
  let shownHit = null;

  function sec(n) {
    return (Math.round(n * 1000) / 1000).toFixed(3) + 's';
  }

  function pad(n) {
    const text = String(Math.max(0, n));
    return text.length >= 3 ? text : ('000' + text).slice(-3);
  }

  function currentRecipe() {
    if (selected.source === 'kit') return kit.sounds[selected.id];
    return S.libraryById(selected.id);
  }

  function spark(recipe) {
    const data = S.drawData(recipe, 28, 8000);
    const max = data.envMax || 1;
    const points = data.env.map(function (value, index) {
      const x = (index / (data.env.length - 1)) * 96;
      const y = 26 - (value / max) * 22;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    return '<svg viewBox="0 0 96 28" aria-hidden="true"><polyline points="' + points + '"></polyline></svg>';
  }

  function renderLibrary() {
    libraryEl.replaceChildren();
    groups.forEach(function (role) {
      const items = S.LIBRARY.filter(function (item) { return item.role === role; });
      if (!items.length) return;
      const group = document.createElement('div');
      group.className = 'group';
      const title = document.createElement('h3');
      title.textContent = role;
      const row = document.createElement('div');
      row.className = 'pills';
      items.forEach(function (item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.name;
        button.setAttribute('aria-pressed', selected.source === 'library' && selected.id === item.id ? 'true' : 'false');
        button.addEventListener('click', function () {
          selected = { source: 'library', id: item.id };
          renderLibrary();
          renderRoles();
          drawWave();
          audition(item);
        });
        row.appendChild(button);
      });
      group.append(title, row);
      libraryEl.appendChild(group);
    });
  }

  function renderCharacters() {
    charactersEl.replaceChildren();
    Object.keys(S.CHARACTERS).forEach(function (key) {
      const spec = S.CHARACTERS[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = spec.label;
      button.title = spec.note;
      button.setAttribute('aria-pressed', key === character ? 'true' : 'false');
      button.addEventListener('click', function () {
        character = key;
        derive(true);
      });
      charactersEl.appendChild(button);
    });
  }

  function renderRoles() {
    rolesEl.replaceChildren();
    S.ROLES.forEach(function (role) {
      const recipe = kit.sounds[role];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'role';
      button.setAttribute('aria-pressed', selected.source === 'kit' && selected.id === role ? 'true' : 'false');
      const name = document.createElement('span');
      name.textContent = recipe.name;
      const note = document.createElement('small');
      note.textContent = sec(recipe.duration);
      button.insertAdjacentHTML('beforeend', spark(recipe));
      button.prepend(name);
      button.appendChild(note);
      button.addEventListener('click', function () {
        selected = { source: 'kit', id: role };
        renderLibrary();
        renderRoles();
        drawWave();
        audition(recipe);
      });
      rolesEl.appendChild(button);
    });
  }

  function renderKitRead() {
    kitRead.textContent = kit.label + ' · seed ' + kit.seed + ' · root ' + kit.rootName
      + ' (' + kit.rootHz.toFixed(1) + ' Hz) · ' + kit.wave
      + ' · snap ' + kit.snap.toFixed(2)
      + '. ' + kit.note;
  }

  function drawWave() {
    const recipe = currentRecipe();
    const peak = S.apexTime(recipe, 12000);
    const bits = [recipe.name, sec(recipe.duration)];
    if (selected.source === 'kit') bits.push('root ' + kit.rootName);
    bits.push('envelope peak ' + sec(peak));
    if (recipe.apex) bits.push('apex mark ' + Math.round(recipe.apex * 100) + '%');
    waveMeta.textContent = bits.join(' · ');

    const rect = wave.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height || 150);
    wave.width = Math.floor(width * dpr);
    wave.height = Math.floor(height * dpr);
    const ctx = wave.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const data = S.drawData(recipe, 180, 16000);
    const mid = height / 2;
    const waveMax = data.waveMax || 1;
    const envMax = data.envMax || 1;
    ctx.fillStyle = '#231e19';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < data.wave.length; i += 1) {
      const x = (i / (data.wave.length - 1)) * width;
      ctx.lineTo(x, mid - (data.wave[i] / waveMax) * (mid - 10));
    }
    for (let i = data.wave.length - 1; i >= 0; i -= 1) {
      const x = (i / (data.wave.length - 1)) * width;
      ctx.lineTo(x, mid + (data.wave[i] / waveMax) * (mid - 10));
    }
    ctx.closePath();
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    data.env.forEach(function (value, i) {
      const x = (i / (data.env.length - 1)) * width;
      const y = mid - (value / envMax) * (mid - 16);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#d85a2a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const apexX = (peak / recipe.duration) * width;
    ctx.beginPath();
    ctx.moveTo(apexX, 8);
    ctx.lineTo(apexX, height - 8);
    ctx.strokeStyle = '#d85a2a';
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function renderScore() {
    rows = S.score(kit, fps);
    const loop = S.FRAMES / fps;
    fpsRead.textContent = fps + ' fps';
    const settle = rows.find(function (row) { return row.role === 'click'; });
    fpsNote.textContent = 'Frame ' + settle.frame + ' stays frame ' + settle.frame
      + '. At ' + fps + ' fps the settle is ' + sec(settle.hit) + '.'
      + (fps === 60 ? '' : ' At 60 fps it is ' + sec(settle.frame / 60) + '.');

    ghostsEl.replaceChildren();
    markersEl.replaceChildren();
    rows.forEach(function (row) {
      if (row.align === 'apex') {
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.style.left = (row.start / loop) * 100 + '%';
        ghost.style.width = ((row.end - row.start) / loop) * 100 + '%';
        ghostsEl.appendChild(ghost);
      }
      const marker = document.createElement('div');
      marker.className = 'marker';
      marker.dataset.frame = String(row.frame);
      marker.style.left = ((row.frame + 0.5) / S.FRAMES) * 100 + '%';
      marker.title = row.label;
      markersEl.appendChild(marker);
    });

    cuesEl.replaceChildren();
    rows.forEach(function (row) {
      const item = document.createElement('li');
      item.dataset.frame = String(row.frame);
      const frame = document.createElement('span');
      frame.className = 'frame';
      frame.textContent = 'f ' + pad(row.frame);
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = row.align === 'apex' ? row.role + ' · apex' : row.role;
      const label = document.createElement('span');
      label.textContent = row.label;
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = row.align === 'apex'
        ? 'starts ' + sec(row.start) + ' · hits ' + sec(row.hit)
        : 'hits ' + sec(row.hit);
      item.append(frame, role, label, when);
      cuesEl.appendChild(item);
    });
  }

  function renderFrame(frame) {
    const pose = S.pose(frame);
    frameRead.textContent = 'f ' + pad(pose.frame);
    bar.style.setProperty('--bar', String(pose.bar));
    notch.classList.toggle('on', pose.tick);
    ring.style.setProperty('--disc', String(pose.disc));
    const letters = word.querySelectorAll('span');
    letters.forEach(function (letter, index) {
      letter.style.setProperty('--p', String(pose.letters[index]));
    });
    check.classList.toggle('on', pose.check > 0);
    checkPath.style.strokeDashoffset = String(1 - pose.check);
    chip.classList.toggle('on', pose.reject);
    playhead.style.left = ((pose.frame + 0.5) / S.FRAMES) * 100 + '%';
    cuesEl.querySelectorAll('li').forEach(function (item) {
      item.classList.toggle('now', Number(item.dataset.frame) === pose.frame);
    });
    markersEl.querySelectorAll('.marker').forEach(function (item) {
      item.classList.toggle('now', Number(item.dataset.frame) === pose.frame);
    });
    const active = rows.find(function (row) { return row.frame === pose.frame; });
    const upcoming = rows.find(function (row) { return row.frame > pose.frame; }) || rows[0];
    const key = active ? active.id : 'next-' + (upcoming ? upcoming.id : '');
    if (key !== shownHit) {
      shownHit = key;
      if (active) {
        hitEl.textContent = active.label + ' · frame ' + active.frame + ' · ' + sec(active.hit);
      } else if (upcoming) {
        hitEl.textContent = 'Next · frame ' + upcoming.frame + ' · ' + upcoming.label + ' · ' + sec(upcoming.hit);
      } else {
        hitEl.textContent = '';
      }
    }
  }

  function armAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('This browser has no Web Audio.');
    if (!audio) audio = new AC();
    audio.resume();
    armed = true;
    audioStatus.textContent = 'Audio is on. Tones are synthesized in this page.';
    return audio;
  }

  function audition(recipe) {
    try {
      const ctx = armAudio();
      S.playRecipe(ctx, recipe, ctx.currentTime + 0.02);
    } catch (err) {
      audioStatus.textContent = err.message;
    }
  }

  function stopVoices() {
    voices.forEach(function (item) { item.voice.stop(); });
    voices = [];
  }

  function stopPreview() {
    if (previewId) cancelAnimationFrame(previewId);
    previewId = 0;
    previewStart = 0;
  }

  function scheduleLoop(startTime) {
    S.score(kit, fps).forEach(function (row) {
      const voice = S.playRecipe(audio, kit.sounds[row.role], startTime + row.start);
      voices.push({ voice: voice, end: startTime + row.end + 0.08 });
    });
  }

  function stopShow() {
    playing = false;
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.textContent = 'Play';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    stopVoices();
    if (!reduce) startPreview();
    else renderFrame(48);
    transportStatus.textContent = armed
      ? 'Stopped. Press Play to schedule the kit on the frames again.'
      : 'Muted until Play. The frame clock then follows the audio clock.';
  }

  function tick() {
    if (!playing) return;
    const now = audio.currentTime;
    const loop = S.FRAMES / fps;
    voices = voices.filter(function (item) {
      if (now > item.end) {
        item.voice.stop();
        return false;
      }
      return true;
    });
    if (now > scheduledUntil) {
      stopVoices();
      origin = now + 0.06;
      scheduledUntil = origin;
    }
    while (scheduledUntil - now < loop + 0.08) {
      scheduleLoop(scheduledUntil);
      scheduledUntil += loop;
    }
    const elapsed = now - origin;
    const frame = elapsed < 0 ? 0 : Math.floor(elapsed * fps) % S.FRAMES;
    renderFrame(frame);
    rafId = requestAnimationFrame(tick);
  }

  function startShow(ctx) {
    stopPreview();
    stopVoices();
    playing = true;
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.textContent = 'Stop';
    shownHit = null;
    origin = ctx.currentTime + 0.06;
    scheduledUntil = origin;
    transportStatus.textContent = 'Playing at ' + fps + ' fps. Hits are scheduled on the audio clock, on the frame.';
    tick();
  }

  function previewTick(now) {
    if (playing || reduce) return;
    if (!previewStart) previewStart = now;
    const elapsed = (now - previewStart) / 1000;
    renderFrame(Math.floor(elapsed * fps) % S.FRAMES);
    previewId = requestAnimationFrame(previewTick);
  }

  function startPreview() {
    stopPreview();
    if (reduce || playing) return;
    previewId = requestAnimationFrame(previewTick);
  }

  function derive(restart) {
    const next = Number(seedInput.value);
    if (!Number.isInteger(next) || next < 1 || next > 9999) {
      seedInput.value = String(seed);
      return;
    }
    seed = next;
    kit = S.kitFromSeed(character, seed);
    if (selected.source === 'kit' && !kit.sounds[selected.id]) selected = { source: 'kit', id: 'click' };
    renderCharacters();
    renderRoles();
    renderKitRead();
    renderScore();
    drawWave();
    if (playing && restart) {
      try { startShow(armAudio()); } catch (err) { transportStatus.textContent = err.message; }
    }
  }

  playBtn.addEventListener('click', function () {
    if (playing) {
      stopShow();
      return;
    }
    try {
      startShow(armAudio());
    } catch (err) {
      transportStatus.textContent = err.message;
    }
  });

  seedForm.addEventListener('submit', function (event) {
    event.preventDefault();
    derive(true);
  });

  S.FPS.forEach(function (rate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = rate + ' fps';
    button.setAttribute('aria-pressed', rate === fps ? 'true' : 'false');
    button.addEventListener('click', function () {
      fps = rate;
      fpsEl.querySelectorAll('button').forEach(function (item) {
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
      renderScore();
      shownHit = null;
      if (playing) {
        try { startShow(armAudio()); } catch (err) { transportStatus.textContent = err.message; }
      } else if (!reduce) startPreview();
      else renderFrame(48);
    });
    fpsEl.appendChild(button);
  });

  window.addEventListener('resize', drawWave);

  renderLibrary();
  renderCharacters();
  renderRoles();
  renderKitRead();
  renderScore();
  drawWave();
  if (reduce) {
    renderFrame(48);
    transportStatus.textContent = 'Reduced motion is on, so the card holds the settle until you press Play.';
  } else {
    renderFrame(0);
    startPreview();
  }
  requestAnimationFrame(drawWave);
})();
