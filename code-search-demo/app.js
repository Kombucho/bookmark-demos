(function () {
  const CS = window.CodeSearch;
  const state = {
    query: 'rotate the wal segment',
    mode: 'hybrid',
    codeAware: true,
    opened: 0,
    timer: 0,
    pick: null,
  };

  const queryInput = document.getElementById('query');
  const filesEl = document.getElementById('files');
  const hitsEl = document.getElementById('hits');
  const readerEl = document.getElementById('reader');
  const byPath = new Map(CS.FILES.map(function (file) { return [file.path, file]; }));

  function format(n) {
    return n.toLocaleString('en-US');
  }

  function stop() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = 0;
    const play = document.getElementById('play');
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Play';
  }

  function terms() {
    return CS.tokenize(state.query, false);
  }

  function result() {
    return CS.search(state.query, { mode: state.mode, codeAware: state.codeAware });
  }

  function walked() {
    return CS.walk(state.query, state.opened);
  }

  function activePick(found) {
    if (state.pick && byPath.has(state.pick.path)) return state.pick;
    const top = found.shown[0];
    if (!top) return null;
    return { path: top.path, start: top.start, end: top.end, whole: false };
  }

  function setPressed(selector, attr, value) {
    document.querySelectorAll(selector).forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute(attr) === value ? 'true' : 'false');
    });
  }

  function appendHighlighted(parent, text, tokens) {
    if (!tokens.length) {
      parent.textContent = text;
      return;
    }
    const pattern = new RegExp('(' + tokens.map(function (token) {
      return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') + ')', 'ig');
    text.split(pattern).forEach(function (bit, index) {
      if (!bit) return;
      if (index % 2 === 1) {
        const mark = document.createElement('mark');
        mark.textContent = bit;
        parent.appendChild(mark);
      } else {
        parent.appendChild(document.createTextNode(bit));
      }
    });
  }

  function chip(text, kind) {
    const span = document.createElement('span');
    span.className = 'chip' + (kind ? ' ' + kind : '');
    span.textContent = text;
    return span;
  }

  function where(hit) {
    const span = hit.start === hit.end ? String(hit.start) : hit.start + '–' + hit.end;
    if (hit.symbol && hit.kind === 'symbol') return hit.symbol + ' · ' + hit.path + ':' + span;
    if (hit.kind === 'section' && hit.symbol) return hit.symbol + ' · ' + hit.path + ':' + span;
    if (hit.kind === 'preamble') return 'file comment · ' + hit.path + ':' + span;
    if (hit.kind === 'record') return hit.path;
    return hit.path + ':' + span;
  }

  function paintMeters(found, walk) {
    const tree = found.treeRead.chars || 1;
    document.getElementById('open-chars').textContent = format(walk.openedRead.chars);
    document.getElementById('open-sub').textContent = format(walk.openedRead.tokens) + ' tokens · ' + walk.opened + ' of ' + walk.total + ' files · tree is ' + format(found.treeRead.chars);
    document.getElementById('pass-chars').textContent = format(found.passageRead.chars);
    document.getElementById('pass-sub').textContent = format(found.passageRead.tokens) + ' tokens · ' + found.shown.length + ' passages';
    document.getElementById('open-bar').style.width = Math.min(100, (walk.openedRead.chars / tree) * 100) + '%';
    document.getElementById('pass-bar').style.width = Math.min(100, (found.passageRead.chars / tree) * 100) + '%';

    const tokens = found.queryTokens;
    let text;
    if (!tokens.length) {
      text = 'That query is only stop words. The tree is still ' + format(found.treeRead.chars) + ' characters.';
    } else if (found.firstMention) {
      text = 'The first file containing every query word is ' + found.firstMention.path + '. The whole tree is ' + format(found.treeRead.chars) + ' characters (' + format(found.treeRead.tokens) + ' tokens). These passages are ' + format(found.passageRead.chars) + ' characters (' + format(found.passageRead.tokens) + ' tokens).';
    } else {
      text = 'No file contains every query word, including inside a longer identifier. The walker can read all ' + format(found.treeRead.chars) + ' characters and still not land. These passages are ' + format(found.passageRead.chars) + ' characters.';
    }
    document.getElementById('compare').textContent = text;
  }

  function paintIndex(found) {
    const how = state.codeAware
      ? 'Symbol chunks for functions, sections for docs, one line per log record, one record per config.'
      : 'Flat windows of ' + CS.WINDOW + ' lines. Camel-case names stay one token.';
    const buckets = found.queryVector.length
      ? ' Query words fall in ' + found.queryVector.map(function (dim) { return dim.label; }).join(', ') + '.'
      : '';
    document.getElementById('index-line').textContent = found.chunkCount + ' chunks. ' + how + buckets;
  }

  function paintFiles(walk) {
    const pick = state.pick;
    filesEl.replaceChildren();
    walk.files.forEach(function (file) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'file' + (file.opened ? ' opened' : '') + (file.mention ? ' mention' : '');
      button.setAttribute('aria-pressed', pick && pick.whole && pick.path === file.path ? 'true' : 'false');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = file.path;
      const meta = document.createElement('small');
      const flags = [];
      flags.push(format(file.chars) + ' chars');
      if (file.opened) flags.push('opened');
      if (file.mention) flags.push('words land here');
      meta.textContent = flags.join(' · ');
      button.append(name, meta);
      button.addEventListener('click', function () {
        state.pick = { path: file.path, whole: true };
        paint();
      });
      filesEl.appendChild(button);
    });
  }

  function paintHits(found) {
    const pick = activePick(found);
    hitsEl.replaceChildren();
    const count = document.getElementById('hit-count');
    if (!found.queryTokens.length) {
      count.textContent = 'Nothing to rank.';
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = 'Try one of the presets. “roll the write-ahead log” is the one where the word never occurs in the function.';
      hitsEl.appendChild(note);
      return;
    }
    if (!found.shown.length) {
      count.textContent = 'No passage scored.';
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = 'Neither the words nor the lexicon buckets matched a chunk.';
      hitsEl.appendChild(note);
      return;
    }
    const topScore = found.shown[0].score || 1;
    count.textContent = found.hits.length + ' scoring chunks. Showing ' + found.shown.length + ', duplicates collapsed.';
    found.shown.forEach(function (hit) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hit';
      const on = pick && !pick.whole && pick.path === hit.path && pick.start === hit.start && pick.end === hit.end;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      const head = document.createElement('header');
      const loc = document.createElement('span');
      loc.className = 'where';
      loc.textContent = where(hit);
      const score = document.createElement('span');
      score.className = 'meta';
      if (state.mode === 'bm25') score.textContent = hit.bm25.toFixed(2);
      else if (state.mode === 'vector') score.textContent = hit.cosine.toFixed(2) + ' · ' + hit.dot + ' hits';
      else score.textContent = hit.score.toFixed(2);
      head.append(loc, score);
      const why = document.createElement('p');
      if (state.mode === 'hybrid') {
        why.textContent = 'BM25 ' + hit.bm25.toFixed(2) + ' · cosine ' + hit.cosine.toFixed(2);
      } else if (!hit.matched.length) {
        why.textContent = 'No query word occurs here.';
      } else {
        why.textContent = 'Matched ' + hit.matched.join(', ') + '.';
      }
      const chips = document.createElement('div');
      chips.className = 'chips';
      hit.matched.forEach(function (token) { chips.appendChild(chip(token)); });
      if (hit.copies > 1) chips.appendChild(chip('×' + hit.copies + ' identical', 'warn'));
      hit.dims.slice(0, 3).forEach(function (dim) {
        chips.appendChild(chip(dim.label + ' ' + dim.mass, 'dim'));
      });
      const bar = document.createElement('div');
      bar.className = 'score';
      bar.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.style.width = Math.max(4, (hit.score / topScore) * 100) + '%';
      bar.appendChild(fill);
      button.append(head, why, chips, bar);
      button.addEventListener('click', function () {
        state.pick = { path: hit.path, start: hit.start, end: hit.end, whole: false };
        paint();
      });
      hitsEl.appendChild(button);
    });
  }

  function paintReader(found) {
    const pick = activePick(found);
    const meta = document.getElementById('reader-meta');
    readerEl.replaceChildren();
    if (!pick) {
      meta.textContent = 'No passage yet.';
      return;
    }
    const file = byPath.get(pick.path);
    const span = pick.whole ? null : pick;
    meta.textContent = pick.whole
      ? file.path + ' · the whole file, ' + format(CS.fileText(file).length) + ' characters'
      : file.path + ':' + (pick.start === pick.end ? pick.start : pick.start + '–' + pick.end);
    let focusLine = null;
    file.lines.forEach(function (line, index) {
      const number = index + 1;
      const item = document.createElement('li');
      if (span && number >= span.start && number <= span.end) {
        item.className = 'in';
        if (!focusLine) focusLine = item;
      }
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(number);
      const code = document.createElement('span');
      appendHighlighted(code, line.length ? line : ' ', terms());
      item.append(n, code);
      readerEl.appendChild(item);
    });
    if (focusLine) readerEl.scrollTop = Math.max(0, focusLine.offsetTop - 8);
  }

  function paintLexicon() {
    const root = document.getElementById('lexicon');
    if (root.childElementCount) return;
    CS.LEXICON.forEach(function (dim) {
      const block = document.createElement('div');
      block.className = 'bucket';
      const title = document.createElement('strong');
      title.textContent = dim.label;
      const words = document.createElement('span');
      words.textContent = dim.words.join(', ');
      block.append(title, words);
      root.appendChild(block);
    });
  }

  function paintPresets() {
    const root = document.getElementById('presets');
    CS.PRESETS.forEach(function (preset) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.query;
      button.addEventListener('click', function () {
        state.query = preset.query;
        state.pick = null;
        state.opened = 0;
        stop();
        queryInput.value = preset.query;
        paint();
      });
      root.appendChild(button);
    });
  }

  function paint() {
    const found = result();
    const walk = walked();
    setPressed('[data-mode]', 'data-mode', state.mode);
    setPressed('[data-aware]', 'data-aware', state.codeAware ? '1' : '0');
    paintIndex(found);
    paintMeters(found, walk);
    paintFiles(walk);
    paintHits(found);
    paintReader(found);
  }

  document.getElementById('ask').addEventListener('submit', function (event) {
    event.preventDefault();
    state.query = queryInput.value;
    state.pick = null;
    if (state.opened === 0) {
      document.getElementById('play').click();
      return;
    }
    paint();
  });

  queryInput.addEventListener('input', function () {
    state.query = queryInput.value;
    state.pick = null;
    state.opened = 0;
    stop();
    paint();
  });

  document.querySelectorAll('[data-mode]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.mode = button.getAttribute('data-mode');
      state.pick = null;
      paint();
    });
  });

  document.querySelectorAll('[data-aware]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.codeAware = button.getAttribute('data-aware') === '1';
      state.pick = null;
      paint();
    });
  });

  document.getElementById('step').addEventListener('click', function () {
    if (state.opened < CS.FILES.length) state.opened += 1;
    paint();
  });

  document.getElementById('reset-walk').addEventListener('click', function () {
    state.opened = 0;
    stop();
    paint();
  });

  document.getElementById('play').addEventListener('click', function () {
    if (state.timer) {
      stop();
      return;
    }
    if (state.opened >= CS.FILES.length) state.opened = 0;
    const play = document.getElementById('play');
    play.setAttribute('aria-pressed', 'true');
    play.textContent = 'Pause';
    function advance() {
      if (state.opened >= CS.FILES.length) {
        stop();
        return;
      }
      state.opened += 1;
      paint();
    }
    advance();
    state.timer = window.setInterval(advance, 420);
  });

  paintPresets();
  paintLexicon();
  paint();
})();
