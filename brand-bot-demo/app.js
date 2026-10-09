(function () {
  const Bot = window.BrandBot;
  const STARTERS = {
    rave: 'The Mothglass beam on the lake is beautiful. I recommend it.',
    wish: 'Wish Mothglass sold a red lens for night walks.',
    complaint: 'The Mothglass latch broke and I need a refund.',
  };

  const handleEl = document.getElementById('handle');
  const postEl = document.getElementById('post');
  const chars = document.getElementById('chars');
  const verdict = document.getElementById('verdict');
  const progress = document.getElementById('progress');
  const pauseBtn = document.getElementById('pause');
  const dutyLabel = document.getElementById('duty-label');
  const dot = document.getElementById('dot');

  let queue = Bot.POSTS.slice();
  let seen = [];
  let paused = false;
  let timer = 0;
  let serial = 0;
  let ruleTimer = 0;

  function readRules() {
    return {
      brand: Bot.parseKeywordList(document.getElementById('rule-brand').value),
      amplify: Bot.parseKeywordList(document.getElementById('rule-amplify').value),
      feedback: Bot.parseKeywordList(document.getElementById('rule-feedback').value),
      attention: Bot.parseKeywordList(document.getElementById('rule-attention').value),
      ignore: Bot.parseKeywordList(document.getElementById('rule-ignore').value),
    };
  }

  function fillRules(rules) {
    document.getElementById('rule-brand').value = Bot.keywordsToText(rules.brand);
    document.getElementById('rule-amplify').value = Bot.keywordsToText(rules.amplify);
    document.getElementById('rule-feedback').value = Bot.keywordsToText(rules.feedback);
    document.getElementById('rule-attention').value = Bot.keywordsToText(rules.attention);
    document.getElementById('rule-ignore').value = Bot.keywordsToText(rules.ignore);
  }

  function kick(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function chipsFor(result) {
    const items = [];
    const seenWords = new Set();
    (result.signals || []).forEach(function (word) {
      if (seenWords.has(word)) return;
      seenWords.add(word);
      items.push({ word: word, kind: 'hit' });
    });
    (result.brandHits || []).forEach(function (word) {
      if (seenWords.has(word)) return;
      seenWords.add(word);
      items.push({ word: word, kind: 'brand' });
    });
    return items;
  }

  function fillCard(card, post, result) {
    card.replaceChildren();
    const head = document.createElement('div');
    head.className = 'card-head';
    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = post.handle;
    const origin = document.createElement('span');
    origin.className = 'origin' + (post.source === 'you' ? ' you' : '');
    origin.textContent = post.source === 'you' ? 'You wrote this' : 'Sample';
    head.append(handle, origin);
    const body = document.createElement('p');
    body.className = 'post-text';
    body.textContent = post.text;
    const why = document.createElement('p');
    why.className = 'why';
    why.textContent = result.reason;
    card.append(head, body, why);
    const chipItems = chipsFor(result);
    if (!chipItems.length) return;
    const list = document.createElement('ul');
    list.className = 'chips';
    chipItems.forEach(function (item) {
      const li = document.createElement('li');
      li.className = item.kind;
      li.textContent = item.word;
      list.appendChild(li);
    });
    card.appendChild(list);
  }

  function refreshCounts() {
    const totals = { amplify: 0, feedback: 0, attention: 0, ignore: 0 };
    seen.forEach(function (item) { totals[item.result.lane] += 1; });
    Object.keys(totals).forEach(function (lane) {
      const el = document.getElementById('count-' + lane);
      const next = String(totals[lane]);
      if (el.textContent !== next) {
        el.textContent = next;
        kick(el.parentElement, 'bump');
      }
      document.getElementById('empty-' + lane).hidden = totals[lane] > 0;
    });
  }

  function updateProgress() {
    const total = Bot.POSTS.length;
    const arrived = total - queue.length;
    if (!queue.length && !paused) {
      progress.textContent = 'All ' + total + ' sample mentions have arrived.';
      return;
    }
    const prefix = paused ? 'Paused. ' : '';
    progress.textContent = prefix + arrived + ' of ' + total + ' sample mentions have arrived.';
  }

  function syncDuty() {
    const idle = paused || !queue.length;
    dot.classList.toggle('idle', idle);
    dutyLabel.textContent = paused ? 'Paused' : (queue.length ? 'On duty' : 'Queue clear');
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  }

  function route(post) {
    const result = Bot.classify(post.text, readRules());
    const card = document.createElement('article');
    card.className = 'card';
    fillCard(card, post, result);
    document.getElementById('stack-' + result.lane).prepend(card);
    kick(card, 'enter');
    const lane = document.querySelector('.lane[data-lane="' + result.lane + '"]');
    kick(lane, 'flash');
    seen.push({ post: post, result: result, card: card });
    refreshCounts();
    verdict.textContent = post.handle + ' to ' + Bot.LANE_TITLE[result.lane] + '. ' + result.reason;
  }

  function cleanHandle(value) {
    let handle = String(value || '').trim().replace(/\s+/g, '');
    if (!handle) handle = 'guest.sample';
    if (handle.charAt(0) !== '@') handle = '@' + handle;
    return handle.slice(0, 32);
  }

  function send(handle, text) {
    serial += 1;
    route({
      id: 'you-' + serial,
      handle: cleanHandle(handle),
      source: 'you',
      text: text.trim(),
    });
  }

  function finishLine() {
    if (!queue.length) updateProgress();
  }

  function stepQueue() {
    if (!queue.length) {
      finishLine();
      syncDuty();
      return;
    }
    route(queue.shift());
    updateProgress();
    if (!queue.length) syncDuty();
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (paused || !queue.length) return;
    timer = setTimeout(function () {
      stepQueue();
      schedule(2200);
    }, ms);
  }

  function resort() {
    const rules = readRules();
    let moved = 0;
    seen.forEach(function (item) {
      const next = Bot.classify(item.post.text, rules);
      const laneChanged = next.lane !== item.result.lane;
      item.result = next;
      fillCard(item.card, item.post, next);
      if (laneChanged) {
        document.getElementById('stack-' + next.lane).prepend(item.card);
        kick(item.card, 'enter');
        kick(document.querySelector('.lane[data-lane="' + next.lane + '"]'), 'flash');
        moved += 1;
      }
    });
    refreshCounts();
    if (!seen.length) {
      verdict.textContent = 'Rules saved. Nothing on the desk yet.';
      return;
    }
    verdict.textContent = moved
      ? 'Rules saved. ' + moved + (moved === 1 ? ' card changed lanes.' : ' cards changed lanes.')
      : 'Rules saved. Every card stayed in its lane.';
  }

  fillRules(Bot.starterRules());
  ['rule-brand', 'rule-amplify', 'rule-feedback', 'rule-attention', 'rule-ignore'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () {
      clearTimeout(ruleTimer);
      ruleTimer = setTimeout(resort, 200);
    });
  });

  document.getElementById('restore').addEventListener('click', function () {
    fillRules(Bot.starterRules());
    resort();
    verdict.textContent = 'Starter rules restored. ' + verdict.textContent.replace(/^Rules saved\. /, '');
  });

  document.getElementById('composer').addEventListener('submit', function (event) {
    event.preventDefault();
    const text = postEl.value.trim();
    if (!text) return;
    send(handleEl.value, text);
    postEl.value = '';
    chars.textContent = '0 / 280';
    postEl.focus();
  });

  postEl.addEventListener('input', function () {
    chars.textContent = postEl.value.length + ' / 280';
  });

  document.querySelectorAll('[data-starter]').forEach(function (button) {
    button.addEventListener('click', function () {
      const text = STARTERS[button.getAttribute('data-starter')];
      postEl.value = text;
      chars.textContent = text.length + ' / 280';
      send(handleEl.value, text);
    });
  });

  pauseBtn.addEventListener('click', function () {
    paused = !paused;
    if (paused) clearTimeout(timer);
    else schedule(400);
    syncDuty();
    updateProgress();
  });

  document.getElementById('next').addEventListener('click', function () {
    if (!queue.length) {
      verdict.textContent = 'The sample queue is finished. Write a post, or replay the samples.';
      return;
    }
    clearTimeout(timer);
    stepQueue();
    if (!paused) schedule(2200);
  });

  document.getElementById('replay').addEventListener('click', function () {
    seen = seen.filter(function (item) {
      if (item.post.source === 'you') return true;
      item.card.remove();
      return false;
    });
    queue = Bot.POSTS.slice();
    paused = false;
    refreshCounts();
    syncDuty();
    updateProgress();
    verdict.textContent = 'Replaying the sample mentions.';
    schedule(500);
  });

  syncDuty();
  schedule(700);
})();
