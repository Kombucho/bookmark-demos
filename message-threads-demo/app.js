(function () {
  const steps = MessageThreads.run();
  const maxBytes = MessageThreads.maxBytes(steps);
  const maxTtft = steps.reduce(function (max, step) {
    return Math.max(max, step.plain.ttftMs, step.thread.ttftMs);
  }, 1);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nextBtn = document.getElementById('next');
  const playBtn = document.getElementById('play');
  const resetBtn = document.getElementById('reset');
  const turnLabel = document.getElementById('turn-label');
  const compare = document.getElementById('compare');
  const held = document.getElementById('held');
  const slotPlain = document.getElementById('slot-plain');
  const slotThread = document.getElementById('slot-thread');
  let index = -1;
  let timer = 0;

  function group(prefix) {
    return {
      bytes: document.getElementById(prefix + '-bytes'),
      tokens: document.getElementById(prefix + '-tokens'),
      cbytes: document.getElementById(prefix + '-cbytes'),
      ctokens: document.getElementById(prefix + '-ctokens'),
      ttft: document.getElementById(prefix + '-ttft'),
      fill: document.getElementById(prefix + '-fill'),
      headers: document.getElementById(prefix + '-headers'),
      json: document.getElementById(prefix + '-json'),
      origin: document.getElementById('origin-' + prefix)
    };
  }

  const lanes = { plain: group('plain'), thread: group('thread') };

  function comma(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function paintJson(node, req) {
    let html = escapeHtml(req.json);
    const phrase = escapeHtml(req.user);
    const at = html.lastIndexOf(phrase);
    if (at !== -1) {
      html = html.slice(0, at) + '<mark>' + phrase + '</mark>' + html.slice(at + phrase.length);
    }
    node.innerHTML = html;
    node.scrollTop = node.scrollHeight;
  }

  function paintLane(prefix, req) {
    const node = lanes[prefix];
    node.bytes.textContent = comma(req.bytes);
    node.tokens.textContent = comma(req.tokens);
    node.cbytes.textContent = comma(req.cumulativeBytes);
    node.ctokens.textContent = comma(req.cumulativeTokens);
    node.ttft.textContent = comma(req.ttftMs) + ' ms';
    node.fill.style.width = Math.max(6, Math.round(100 * req.ttftMs / maxTtft)) + '%';
    node.headers.textContent = req.headers.join('  ·  ');
    paintJson(node.json, req);
  }

  function clearLane(prefix) {
    const node = lanes[prefix];
    node.bytes.textContent = '0';
    node.tokens.textContent = '0';
    node.cbytes.textContent = '0';
    node.ctokens.textContent = '0';
    node.ttft.textContent = '—';
    node.fill.style.width = '0%';
    node.headers.textContent = '';
    node.json.textContent = 'Press Next turn.';
  }

  function flash(node) {
    node.classList.remove('hot');
    void node.offsetWidth;
    node.classList.add('hot');
  }

  function fly(prefix, req) {
    const from = lanes[prefix].origin.getBoundingClientRect();
    const to = (prefix === 'plain' ? slotPlain : slotThread).getBoundingClientRect();
    const chip = document.createElement('div');
    chip.className = 'packet packet-' + prefix;
    const width = MessageThreads.packetWidth(req.bytes, maxBytes);
    chip.style.width = width + 'px';
    chip.innerHTML = '<strong>' + comma(req.bytes) + ' B</strong><span>' + escapeHtml(req.user) + '</span>';
    chip.style.left = (from.left + from.width / 2 - width / 2) + 'px';
    chip.style.top = from.top + 'px';
    document.body.appendChild(chip);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - from.top;
    requestAnimationFrame(function () {
      chip.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.72)';
      chip.style.opacity = '0.15';
    });
    window.setTimeout(function () {
      chip.remove();
      flash(prefix === 'plain' ? slotPlain : slotThread);
    }, reduce ? 0 : 760);
  }

  function show(i) {
    const step = steps[i];
    paintLane('plain', step.plain);
    paintLane('thread', step.thread);
    turnLabel.textContent = 'Turn ' + (i + 1) + ' of ' + steps.length + ' · ' + step.label;
    compare.textContent = MessageThreads.compare(step);
    held.textContent = step.thread.responseId;
    slotPlain.textContent = 'Stateless lane · answered, and kept nothing';
    nextBtn.disabled = i >= steps.length - 1;
    fly('plain', step.plain);
    fly('thread', step.thread);
  }

  function advance() {
    if (index >= steps.length - 1) return false;
    index += 1;
    show(index);
    return index < steps.length - 1;
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.textContent = 'Play';
  }

  nextBtn.addEventListener('click', function () {
    stop();
    advance();
  });

  playBtn.addEventListener('click', function () {
    if (timer) {
      stop();
      return;
    }
    if (index >= steps.length - 1) return;
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.textContent = 'Pause';
    const more = advance();
    if (!more) {
      stop();
      return;
    }
    timer = window.setInterval(function () {
      if (!advance()) stop();
    }, 2200);
  });

  resetBtn.addEventListener('click', function () {
    stop();
    index = -1;
    clearLane('plain');
    clearLane('thread');
    turnLabel.textContent = 'Nothing sent yet.';
    compare.textContent = MessageThreads.compare(null);
    held.textContent = 'nothing yet';
    slotPlain.textContent = 'Stateless lane · nothing stored between turns';
    slotPlain.classList.remove('hot');
    slotThread.classList.remove('hot');
    nextBtn.disabled = false;
  });
})();
