(function () {
  const site = window.SearchForAgents;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepWait = reduce ? 0 : 160;

  const toggle = document.getElementById('zone-toggle');
  const statusEl = document.getElementById('zone-status');
  const instanceEl = document.getElementById('instance');
  const recrawl = document.getElementById('recrawl');
  const pipeline = document.getElementById('pipeline');
  const treeEl = document.getElementById('tree');
  const treeCount = document.getElementById('tree-count');
  const inspectNote = document.getElementById('inspect-note');
  const inspectBody = document.getElementById('inspect-body');
  const acceptHtml = document.getElementById('accept-html');
  const acceptMd = document.getElementById('accept-md');
  const methodGet = document.getElementById('method-get');
  const methodText = document.getElementById('method-text');
  const methodJson = document.getElementById('method-json');
  const methodNote = document.getElementById('method-note');
  const form = document.getElementById('search-form');
  const queryInput = document.getElementById('query');
  const curlEl = document.getElementById('curl');
  const resultEl = document.getElementById('result');
  const resultStatus = document.getElementById('result-status');
  const chipsEl = document.getElementById('chips');
  const compareNote = document.getElementById('compare-note');
  const crawlStat = document.getElementById('crawl-stat');
  const searchStat = document.getElementById('search-stat');
  const crawlBar = document.getElementById('crawl-bar');
  const searchBar = document.getElementById('search-bar');

  const STEPS = ['fetch', 'markdown', 'chunk', 'index'];
  const CHIPS = [
    'How do I verify webhook signatures?',
    'maximum oil delivery per fill',
    'ruby glass for fog',
    'stuck cup bearing',
  ];

  const buttons = Object.create(null);
  let enabled = false;
  let accept = 'text/html';
  let mode = 'get';
  let selected = site.PAGES[0].path;
  let job = 0;
  let ready = [];
  let index = null;
  let crawling = false;
  let lastBody = '';

  function wait(ms) {
    if (!ms) return Promise.resolve();
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function setStep(step) {
    Array.prototype.forEach.call(pipeline.children, function (item) {
      item.classList.toggle('on', item.getAttribute('data-step') === step);
    });
  }

  function clearSteps() {
    Array.prototype.forEach.call(pipeline.children, function (item) {
      item.classList.remove('on');
    });
  }

  function indexedCount() {
    return ready.reduce(function (sum, page) {
      return sum + site.prepare(page).chunks.length;
    }, 0);
  }

  function paintTree() {
    const groups = [];
    site.PAGES.forEach(function (page) {
      let group = groups.find(function (item) { return item.name === page.group; });
      if (!group) {
        group = { name: page.group, pages: [] };
        groups.push(group);
      }
      group.pages.push(page);
    });
    treeEl.replaceChildren();
    groups.forEach(function (group) {
      const label = document.createElement('p');
      label.className = 'group-label';
      label.textContent = group.name;
      treeEl.appendChild(label);
      group.pages.forEach(function (page) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'page-btn';
        button.setAttribute('role', 'treeitem');
        const dot = document.createElement('span');
        dot.className = 'dot';
        const name = document.createElement('span');
        name.className = 'page-name';
        name.textContent = page.title;
        const meta = document.createElement('span');
        meta.className = 'page-meta';
        button.append(dot, name, meta);
        button.addEventListener('click', function () {
          selected = page.path;
          paintSelection();
          paintInspector();
        });
        buttons[page.path] = { button: button, meta: meta };
        treeEl.appendChild(button);
      });
    });
    paintSelection();
  }

  function paintSelection() {
    site.PAGES.forEach(function (page) {
      const row = buttons[page.path];
      const on = ready.some(function (item) { return item.path === page.path; });
      const state = row.button.getAttribute('data-state');
      if (on && state !== 'fetch' && state !== 'markdown' && state !== 'chunk') {
        row.button.setAttribute('data-state', 'indexed');
        row.meta.textContent = site.prepare(page).chunks.length + ' chunks';
      } else if (!on && !crawling) {
        row.button.removeAttribute('data-state');
        row.meta.textContent = '';
      }
      row.button.setAttribute('aria-current', page.path === selected ? 'true' : 'false');
    });
    const chunks = indexedCount();
    if (!enabled) treeCount.textContent = site.PAGES.length + ' pages · not indexed';
    else if (crawling) treeCount.textContent = ready.length + ' / ' + site.PAGES.length + ' pages · ' + chunks + ' chunks';
    else treeCount.textContent = site.PAGES.length + ' pages · ' + chunks + ' chunks indexed';
  }

  function mark(page, state) {
    const row = buttons[page.path];
    row.button.setAttribute('data-state', state);
    if (state === 'fetch') row.meta.textContent = 'fetch';
    if (state === 'markdown') row.meta.textContent = 'markdown';
    if (state === 'chunk') row.meta.textContent = 'chunk';
    if (state === 'index' || state === 'indexed') {
      row.button.setAttribute('data-state', 'indexed');
      row.meta.textContent = site.prepare(page).chunks.length + ' chunks';
    }
  }

  function paintInspector() {
    const page = site.pageByPath(selected);
    inspectBody.textContent = site.pageExchange(page, accept, enabled);
    if (!enabled) {
      inspectNote.textContent = 'Search for Agents is off, so this response has no agent advertisement.';
    } else if (accept === 'text/markdown') {
      inspectNote.textContent = 'Markdown for Agents is on for this zone, so Accept: text/markdown carries the same advertisement as YAML front matter.';
    } else {
      inspectNote.textContent = 'The HTML response carries the four agent meta tags. The page body is unchanged.';
    }
  }

  function methodCopy() {
    if (mode === 'text') {
      return 'QUERY (RFC 10008) sends the question as a plain-text body. The call is safe and idempotent: it does not modify the index.';
    }
    if (mode === 'json') {
      return 'QUERY can also send a JSON object with a q field. Repeating it returns the same chunks.';
    }
    return 'GET puts the question in the q parameter. The response is retrieved Markdown, not a generated answer.';
  }

  function paintMethod() {
    methodGet.setAttribute('aria-checked', mode === 'get' ? 'true' : 'false');
    methodText.setAttribute('aria-checked', mode === 'text' ? 'true' : 'false');
    methodJson.setAttribute('aria-checked', mode === 'json' ? 'true' : 'false');
    methodNote.textContent = methodCopy();
    curlEl.textContent = site.curlFor(queryInput.value, mode);
  }

  function paintCompare() {
    const shown = site.compare(site.PAGES, accept, enabled, lastBody);
    crawlStat.textContent = shown.crawlRequests + ' requests · ' + site.formatBytes(shown.crawlBytes);
    if (!lastBody) searchStat.textContent = enabled ? '1 request · run a query' : '1 request · 404';
    else searchStat.textContent = '1 request · ' + site.formatBytes(shown.searchBytes);
    const width = Math.max(shown.crawlBytes, shown.searchBytes, 1);
    crawlBar.style.width = (100 * shown.crawlBytes / width) + '%';
    searchBar.style.width = lastBody ? (100 * shown.searchBytes / width) + '%' : '0%';
    const kind = accept === 'text/markdown' ? 'Markdown' : 'HTML';
    if (!enabled) {
      compareNote.textContent = 'The zone is off. Opening every page is still ' + shown.crawlRequests + ' ' + kind + ' responses. The search endpoint answers 404.';
    } else if (crawling) {
      compareNote.textContent = 'The crawl is still walking the tree. One search call is a single response, against ' + shown.crawlRequests + ' page fetches.';
    } else if (lastBody) {
      compareNote.textContent = 'Fetching all ' + shown.crawlRequests + ' ' + kind + ' pages moves ' + site.formatBytes(shown.crawlBytes) + '. The search response is ' + site.formatBytes(shown.searchBytes) + '.';
    } else {
      compareNote.textContent = 'Run a query to compare one search response with fetching every page.';
    }
  }

  function paintResult(response) {
    resultStatus.textContent = response.status + ' ' + response.statusText;
    resultStatus.setAttribute('data-code', String(response.status));
    resultEl.textContent = response.body;
    lastBody = response.body;
    paintCompare();
  }

  function runSearch() {
    paintMethod();
    if (!enabled) {
      paintResult(site.endpointResponse(queryInput.value, false, null));
      return;
    }
    if (!index || !index.chunks.length) {
      paintResult({
        status: 503,
        statusText: 'Index building',
        body: 'The crawl has not indexed a page yet.\n',
      });
      return;
    }
    paintResult(site.endpointResponse(queryInput.value, true, index));
  }

  function zoneCopy() {
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    recrawl.hidden = !enabled || crawling;
    if (!enabled) {
      statusEl.textContent = 'Off. Pages are ordinary HTML, and /.well-known/search is a 404.';
      instanceEl.textContent = 'No AI Search instance for this zone.';
      return;
    }
    if (crawling) {
      statusEl.textContent = 'Crawling ' + ready.length + ' of ' + site.PAGES.length + ' pages.';
      instanceEl.textContent = 'Creating search-for-agents-fieldglass and indexing this tab.';
      return;
    }
    statusEl.textContent = 'On. Every page advertises /.well-known/search.';
    instanceEl.textContent = 'Instance search-for-agents-fieldglass · ' + indexedCount() + ' chunks · BM25 in this tab.';
  }

  async function crawl(mine) {
    crawling = true;
    ready = [];
    index = site.buildIndex([]);
    zoneCopy();
    paintSelection();
    for (let i = 0; i < site.PAGES.length; i += 1) {
      const page = site.PAGES[i];
      for (let s = 0; s < STEPS.length; s += 1) {
        if (mine !== job) return;
        const step = STEPS[s];
        setStep(step);
        mark(page, step);
        statusEl.textContent = page.file + ' · ' + (step === 'markdown' ? 'HTML to Markdown' : step);
        await wait(stepWait);
      }
      if (mine !== job) return;
      ready.push(page);
      index = site.buildIndex(ready);
      mark(page, 'indexed');
      paintSelection();
      zoneCopy();
    }
    if (mine !== job) return;
    crawling = false;
    clearSteps();
    Array.prototype.forEach.call(pipeline.children, function (item) { item.classList.add('on'); });
    zoneCopy();
    paintSelection();
    paintInspector();
    paintCompare();
    if (queryInput.value.trim()) runSearch();
  }

  function turnOn() {
    enabled = true;
    job += 1;
    paintInspector();
    crawl(job);
  }

  function turnOff() {
    enabled = false;
    crawling = false;
    job += 1;
    ready = [];
    index = null;
    clearSteps();
    site.PAGES.forEach(function (page) {
      buttons[page.path].button.removeAttribute('data-state');
      buttons[page.path].meta.textContent = '';
    });
    zoneCopy();
    paintSelection();
    paintInspector();
    runSearch();
  }

  toggle.addEventListener('click', function () {
    if (enabled) turnOff();
    else turnOn();
  });

  recrawl.addEventListener('click', function () {
    if (!enabled || crawling) return;
    job += 1;
    crawl(job);
  });

  acceptHtml.addEventListener('click', function () {
    accept = 'text/html';
    acceptHtml.setAttribute('aria-checked', 'true');
    acceptMd.setAttribute('aria-checked', 'false');
    paintInspector();
    paintCompare();
  });

  acceptMd.addEventListener('click', function () {
    accept = 'text/markdown';
    acceptHtml.setAttribute('aria-checked', 'false');
    acceptMd.setAttribute('aria-checked', 'true');
    paintInspector();
    paintCompare();
  });

  function setMode(next) {
    mode = next;
    paintMethod();
  }

  methodGet.addEventListener('click', function () { setMode('get'); });
  methodText.addEventListener('click', function () { setMode('text'); });
  methodJson.addEventListener('click', function () { setMode('json'); });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    runSearch();
  });

  queryInput.addEventListener('input', function () { paintMethod(); });

  CHIPS.forEach(function (text) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = text;
    chip.addEventListener('click', function () {
      queryInput.value = text;
      runSearch();
    });
    chipsEl.appendChild(chip);
  });

  paintTree();
  zoneCopy();
  paintInspector();
  paintMethod();
  runSearch();
})();
