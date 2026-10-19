// A Karpathy-style wiki for a fictional stock desk.
// Raw notes are immutable. Ingest compiles them into linked pages,
// backlinks, and an index. A question is answered only from those pages.
// A later note rewrites the pages it touches and leaves the rest.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StockWiki = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COMPANIES = {
    'LARK.MX': {name: 'Larkmill Ceramics', exchange: 'Mesa Exchange', currency: 'MXN', place: 'Redkettle'},
    'BRINE.HX': {name: 'Brineharbor Works', exchange: 'Harbor Exchange', currency: 'HXD', place: 'Saltpier'},
    'VELL.WY': {name: 'Vellum & Wick', exchange: 'Wye Board', currency: 'WYD', place: 'Quillford'},
  };

  const SOURCE_RANK = {'own-note': 1, filing: 2, call: 3, news: 4};
  const SOURCE_LABEL = {'own-note': 'own note', filing: 'filing', call: 'call', news: 'news'};
  const SOURCE_TYPE = {'own-note': 'analysis', filing: 'primary-source', call: 'primary-source', news: 'analysis'};

  const MASTER = 'wiki/index';
  const LOG = 'wiki/log';
  const PLACEHOLDER = 'No own note yet.';

  const STOP = {
    the: 1, and: 1, how: 1, does: 1, what: 1, did: 1, for: 1, from: 1, with: 1,
    this: 1, that: 1, are: 1, was: 1, has: 1, have: 1, its: 1, not: 1, but: 1,
    you: 1, your: 1, into: 1, about: 1, when: 1, who: 1, why: 1, can: 1, will: 1,
    just: 1, than: 1, then: 1, them: 1, they: 1, their: 1, our: 1, out: 1, any: 1,
    one: 1, many: 1,
  };

  const QUESTIONS = [
    {id: 'util', text: 'What is Larkmill kiln utilization?'},
    {id: 'cash', text: 'What cash figure does the vault keep for Larkmill?'},
    {id: 'piers', text: 'How many piers does Brineharbor have?'},
    {id: 'every', text: 'How does brine hit every name?'},
    {id: 'storm', text: 'What did the storm do to the brine quote?'},
  ];

  const SEED_NOTES = [
    {
      id: 'larkmill-thesis',
      ticker: 'LARK.MX',
      date: '2026-04-03',
      source: 'own-note',
      title: 'Larkmill thesis',
      text: [
        'Kiln count: 3',
        'Customer share: 70%',
        'Cash: 38 million MXN',
        '',
        'Larkmill Ceramics fires lamp bodies in Redkettle. Vellum & Wick (VELL.WY) takes most of them. The bet is that the kilns stay full if brine from BRINE.HX stays cheap.',
      ].join('\n'),
    },
    {
      id: 'brine-contract',
      ticker: 'BRINE.HX',
      date: '2026-05-19',
      source: 'filing',
      title: 'Saltpier supply contract',
      text: [
        'Brine price: 640 HXD per tonne',
        'Contract end: 2027-03-31',
        'Pier count: 1',
        '',
        'Brineharbor Works sells kiln-grade brine to Larkmill Ceramics (LARK.MX). One pier at Saltpier handles the loads. The supply contract runs through March 2027.',
      ].join('\n'),
    },
    {
      id: 'vell-order',
      ticker: 'VELL.WY',
      date: '2026-06-02',
      source: 'own-note',
      title: 'June lamp order',
      text: [
        'Lamp order: 12000',
        'Gross margin: 22%',
        '',
        'Vellum & Wick in Quillford ordered twelve thousand lamp bodies from LARK.MX. The margin assumes the Larkmill price holds. A brine shock at BRINE.HX would land here too.',
      ].join('\n'),
    },
    {
      id: 'lark-q2',
      ticker: 'LARK.MX',
      date: '2026-08-12',
      source: 'call',
      title: 'Q2 kiln call',
      text: [
        'Kiln utilization: 81%',
        'Cash: 42 million MXN',
        'Brine cost: rising',
        '',
        'On the Q2 call, Larkmill said the three kilns ran at 81% and cash was 42 million MXN. Management said brine from BRINE.HX is getting more expensive. VELL.WY has not cut the lamp order.',
      ].join('\n'),
    },
    {
      id: 'brine-storm',
      ticker: 'BRINE.HX',
      date: '2026-09-02',
      source: 'news',
      title: 'Storm at Saltpier',
      text: [
        'Brine price: 710 HXD per tonne',
        'Pier status: shut for a week',
        '',
        'A storm shut the Saltpier pier for a week. Brineharbor lifted the kiln-grade quote to 710 HXD per tonne. The supply note with LARK.MX still names 640 HXD until March 2027, so the spot quote and the contract disagree.',
      ].join('\n'),
    },
  ];

  const CANCELLATION = {
    id: 'vell-cut',
    ticker: 'VELL.WY',
    date: '2026-10-01',
    source: 'own-note',
    title: 'Half the lamp order',
    text: [
      'Lamp order: 6000',
      '',
      'Vellum & Wick cut the order from LARK.MX in half after the June note of 12000 lamp bodies.',
    ].join('\n'),
  };

  function slugify(value) {
    const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return slug || 'note';
  }

  function hubId(ticker) {
    return 'wiki/' + String(ticker || '').toLowerCase() + '/index';
  }

  function conceptId(key) {
    return 'wiki/concepts/' + slugify(key);
  }

  function rawPath(note) {
    return 'raw/' + note.ticker + '/' + note.id + '.md';
  }

  function firstSentence(prose) {
    const text = String(prose || '').trim();
    if (!text) return '';
    const match = text.match(/^[\s\S]*?[.!?](?:\s|$)/);
    return (match ? match[0] : text).trim();
  }

  function splitNote(text) {
    const facts = [];
    const prose = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (/^(ticker|date|source)\s*:/i.test(trimmed)) return;
      const fact = trimmed.match(/^([A-Z][A-Za-z0-9 /&%+-]{0,40}):\s+(\S.*)$/);
      if (fact) facts.push({key: fact[1].trim(), value: fact[2].trim()});
      else prose.push(trimmed);
    });
    return {facts: facts, prose: prose.join(' ')};
  }

  function mentionsOf(text, primary) {
    const found = [];
    const hay = String(text || '');
    Object.keys(COMPANIES).forEach(function (ticker) {
      if (ticker === primary) return;
      const first = COMPANIES[ticker].name.split(/\s+/)[0];
      if (hay.indexOf(ticker) !== -1 || hay.indexOf(first) !== -1) found.push(ticker);
    });
    return found;
  }

  function emptyVault() {
    return {raw: [], pages: {}, order: [], log: []};
  }

  function blankPage(fields) {
    return {
      id: fields.id,
      path: fields.path,
      title: fields.title,
      type: fields.type || 'overview',
      ticker: fields.ticker || null,
      kind: fields.kind,
      lastUpdated: fields.lastUpdated || '',
      currency: fields.currency || '',
      sourceNote: fields.sourceNote || null,
      sourceKind: fields.sourceKind || null,
      links: [],
      backlinks: [],
      keyNumbers: [],
      contradictions: [],
      articles: [],
      thesis: fields.thesis || '',
      prose: fields.prose || '',
      crossChecks: [],
      summary: fields.summary || '',
      mentions: [],
      factKeys: [],
      entries: [],
      topics: [],
      connections: [],
      usedIds: [],
      answer: fields.answer || '',
      revision: 1,
      markdown: '',
    };
  }

  function addPage(vault, page) {
    vault.pages[page.id] = page;
    vault.order.push(page.id);
    return page;
  }

  function ensureMaster(vault) {
    if (vault.pages[MASTER]) return vault.pages[MASTER];
    return addPage(vault, blankPage({
      id: MASTER,
      path: 'Wiki/index.md',
      title: 'Stock Ideas',
      type: 'overview',
      kind: 'master',
      summary: 'Master index',
    }));
  }

  function ensureLog(vault) {
    if (vault.pages[LOG]) return vault.pages[LOG];
    return addPage(vault, blankPage({
      id: LOG,
      path: 'Wiki/log.md',
      title: 'Log',
      type: 'overview',
      kind: 'log',
      summary: 'Append-only ingest log',
    }));
  }

  function ensureHub(vault, ticker) {
    const id = hubId(ticker);
    if (vault.pages[id]) return vault.pages[id];
    const company = COMPANIES[ticker];
    return addPage(vault, blankPage({
      id: id,
      path: 'Wiki/' + ticker + '/index.md',
      title: company.name,
      type: 'overview',
      ticker: ticker,
      kind: 'hub',
      currency: company.currency,
      thesis: PLACEHOLDER,
      summary: company.name + ' on the ' + company.exchange,
    }));
  }

  function articleIdFor(vault, ticker, title) {
    const base = 'wiki/' + ticker.toLowerCase() + '/' + slugify(title);
    if (!vault.pages[base]) return base;
    let n = 2;
    while (vault.pages[base + '-' + n]) n += 1;
    return base + '-' + n;
  }

  function ensureConcept(vault, key) {
    const id = conceptId(key);
    if (vault.pages[id]) return vault.pages[id];
    return addPage(vault, blankPage({
      id: id,
      path: 'Wiki/concepts/' + slugify(key) + '.md',
      title: key,
      type: 'analysis',
      kind: 'concept',
      summary: 'Every place the vault recorded ' + key,
    }));
  }

  function upsertKey(hub, fact, note) {
    const incoming = {
      key: fact.key,
      value: fact.value,
      date: note.date,
      source: note.source,
      noteId: note.id,
      rank: SOURCE_RANK[note.source],
    };
    const existing = hub.keyNumbers.find(function (item) { return item.key === fact.key; });
    if (!existing) {
      hub.keyNumbers.push(incoming);
      return;
    }
    if (existing.value === incoming.value) {
      if (incoming.date >= existing.date && incoming.rank <= existing.rank) {
        existing.date = incoming.date;
        existing.source = incoming.source;
        existing.noteId = incoming.noteId;
        existing.rank = incoming.rank;
      }
      return;
    }
    let contradiction = hub.contradictions.find(function (item) { return item.key === fact.key; });
    if (!contradiction) {
      contradiction = {key: fact.key, kept: null, challenged: []};
      hub.contradictions.push(contradiction);
    }
    const incomingWins = incoming.rank < existing.rank || (incoming.rank === existing.rank && incoming.date >= existing.date);
    if (incomingWins) {
      contradiction.challenged.push({
        value: existing.value,
        date: existing.date,
        source: existing.source,
        noteId: existing.noteId,
        rank: existing.rank,
      });
      existing.value = incoming.value;
      existing.date = incoming.date;
      existing.source = incoming.source;
      existing.noteId = incoming.noteId;
      existing.rank = incoming.rank;
    } else {
      contradiction.challenged.push({
        value: incoming.value,
        date: incoming.date,
        source: incoming.source,
        noteId: incoming.noteId,
        rank: incoming.rank,
      });
    }
    contradiction.kept = {
      value: existing.value,
      date: existing.date,
      source: existing.source,
      noteId: existing.noteId,
      rank: existing.rank,
    };
  }

  function addCrossCheck(vault, targetTicker, note, facts) {
    if (targetTicker === note.ticker) return;
    const hub = ensureHub(vault, targetTicker);
    if (hub.crossChecks.some(function (item) { return item.noteId === note.id; })) return;
    const bits = facts.map(function (fact) { return fact.key + ' is ' + fact.value; });
    let text = note.date + ' ' + SOURCE_LABEL[note.source] + ' from ' + note.ticker + ': ' + (bits.join('; ') || note.title) + '.';
    const sourceHub = vault.pages[hubId(note.ticker)];
    if (sourceHub) {
      facts.forEach(function (fact) {
        const conflict = sourceHub.contradictions.find(function (item) { return item.key === fact.key; });
        if (conflict && conflict.kept) {
          text += ' ' + fact.key + ' keeps ' + conflict.kept.value + ' from the ' + SOURCE_LABEL[conflict.kept.source] + '.';
        }
      });
    }
    hub.crossChecks.push({noteId: note.id, date: note.date, from: note.ticker, text: text});
  }

  function tickerBlob(vault, ticker) {
    const hub = vault.pages[hubId(ticker)];
    if (!hub) return '';
    const parts = [hub.thesis, hub.prose];
    hub.keyNumbers.forEach(function (item) { parts.push(item.key + ' ' + item.value); });
    hub.articles.forEach(function (article) {
      const page = vault.pages[article.pageId];
      if (page) parts.push(page.prose, page.title);
    });
    return parts.join(' ');
  }

  function propagate(vault, note, facts) {
    const mentioned = mentionsOf(note.text, note.ticker);
    mentioned.forEach(function (ticker) { addCrossCheck(vault, ticker, note, facts); });
    const stems = [];
    facts.forEach(function (fact) {
      const stem = fact.key.split(/\s+/)[0].toLowerCase();
      if (stem.length >= 4 && stems.indexOf(stem) === -1) stems.push(stem);
    });
    Object.keys(COMPANIES).forEach(function (ticker) {
      if (ticker === note.ticker || mentioned.indexOf(ticker) !== -1) return;
      const blob = tickerBlob(vault, ticker).toLowerCase();
      if (!blob) return;
      if (stems.some(function (stem) { return blob.indexOf(stem) !== -1; })) {
        addCrossCheck(vault, ticker, note, facts);
      }
    });
    return mentioned;
  }

  function statusOf(hub) {
    if (!hub.keyNumbers.length) return 'No numbers yet.';
    const latest = hub.keyNumbers.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.key.localeCompare(b.key);
    })[0];
    return latest.key + ' ' + latest.value + ' (' + latest.date + ')';
  }

  function riskOf(hub) {
    if (hub.contradictions.length) {
      const conflict = hub.contradictions.slice().sort(function (a, b) { return a.key.localeCompare(b.key); })[0];
      return conflict.key + ' is challenged';
    }
    const risky = hub.keyNumbers.find(function (item) {
      return /rising|shut|risk|expensive|disagree|cut|cancel/i.test(item.value);
    });
    if (risky) return risky.key + ' ' + risky.value;
    if (hub.crossChecks.length) return 'Cross-check from ' + hub.crossChecks[hub.crossChecks.length - 1].from;
    return 'None filed';
  }

  function connectionsOf(vault) {
    const rows = [];
    const seen = {};
    vault.raw.forEach(function (note) {
      mentionsOf(note.text, note.ticker).forEach(function (other) {
        const key = [note.ticker, other].sort().join('|');
        if (seen[key]) return;
        seen[key] = true;
        rows.push({
          from: note.ticker,
          to: other,
          why: 'Named together in ' + rawPath(note),
        });
      });
    });
    rows.sort(function (a, b) { return (a.from + a.to).localeCompare(b.from + b.to); });
    return rows;
  }

  function rebuildMaster(vault) {
    const page = ensureMaster(vault);
    const hubs = vault.order.map(function (id) { return vault.pages[id]; }).filter(function (item) {
      return item.kind === 'hub';
    });
    page.topics = hubs.map(function (hub) {
      return {
        ticker: hub.ticker,
        title: hub.title,
        thesis: hub.thesis,
        status: statusOf(hub),
        risk: riskOf(hub),
      };
    });
    page.connections = connectionsOf(vault);
    page.summary = hubs.length + (hubs.length === 1 ? ' topic' : ' topics');
  }

  function relativeLink(fromPath, toPath) {
    const fromDir = fromPath.split('/').slice(0, -1);
    const toParts = toPath.split('/');
    const toFile = toParts[toParts.length - 1];
    const toDir = toParts.slice(0, -1);
    let shared = 0;
    while (shared < fromDir.length && shared < toDir.length && fromDir[shared] === toDir[shared]) shared += 1;
    const parts = [];
    for (let i = shared; i < fromDir.length; i += 1) parts.push('..');
    toDir.slice(shared).forEach(function (part) { parts.push(part); });
    parts.push(toFile);
    return parts.join('/');
  }

  function linkLines(page, vault, ids) {
    if (!ids.length) return ['None yet.'];
    return ids.map(function (id) {
      const target = vault.pages[id];
      if (!target) return '- ' + id;
      return '- [' + target.title + '](' + relativeLink(page.path, target.path) + ')';
    });
  }

  function renderPage(page, vault) {
    const lines = ['---', 'title: ' + page.title, 'source: compiled', 'type: ' + page.type, 'last_updated: ' + (page.lastUpdated || 'uncompiled'), '---', ''];
    if (page.kind !== 'master' && page.kind !== 'hub' && page.kind !== 'log') {
      lines.push(page.currency ? 'Reporting currency: ' + page.currency : 'Reporting currency: see the company pages.');
      lines.push('');
    }
    lines.push('# ' + page.title);
    lines.push('');

    if (page.kind === 'master') {
      lines.push('## Topics at a glance');
      lines.push('');
      if (!page.topics.length) lines.push('No topics yet.');
      page.topics.forEach(function (topic) {
        lines.push('- ' + topic.ticker + ' — ' + topic.title + '. Thesis: ' + topic.thesis + ' Status: ' + topic.status + ' Biggest risk: ' + topic.risk);
      });
      lines.push('');
      lines.push('## Cross-topic connections');
      lines.push('');
      if (!page.connections.length) lines.push('None yet.');
      page.connections.forEach(function (link) {
        lines.push('- ' + link.from + ' → ' + link.to + ' — ' + link.why);
      });
    } else if (page.kind === 'log') {
      if (!vault.log.length) lines.push('No ingests yet.');
      vault.log.forEach(function (entry) {
        lines.push('- ' + entry.date + ' ' + entry.action + ' ' + entry.title + ' — ' + entry.files.join(', '));
      });
    } else if (page.kind === 'hub') {
      const company = COMPANIES[page.ticker];
      lines.push(company.place + ' · ' + company.exchange + ' · ' + company.currency);
      lines.push('');
      lines.push('## Articles');
      lines.push('');
      if (!page.articles.length) lines.push('No articles yet.');
      page.articles.forEach(function (article) {
        lines.push('- ' + article.date + ' [' + article.title + '](' + relativeLink(page.path, vault.pages[article.pageId].path) + ') — ' + article.summary);
      });
      lines.push('');
      lines.push('## Key numbers');
      lines.push('');
      if (!page.keyNumbers.length) lines.push('No numbers yet.');
      page.keyNumbers.slice().sort(function (a, b) { return a.key.localeCompare(b.key); }).forEach(function (item) {
        lines.push('- ' + item.key + ': ' + item.value + ' (' + item.date + ', ' + SOURCE_LABEL[item.source] + ')');
      });
      lines.push('');
      lines.push('## Thesis');
      lines.push('');
      lines.push(page.thesis || PLACEHOLDER);
      lines.push('');
      lines.push('## Cross-checks');
      lines.push('');
      if (!page.crossChecks.length) lines.push('None yet.');
      page.crossChecks.forEach(function (item) { lines.push('- ' + item.text); });
    } else if (page.kind === 'article') {
      lines.push(page.prose || page.title);
      lines.push('');
      lines.push('## Facts in this note');
      lines.push('');
      if (!page.keyNumbers.length) lines.push('No labeled facts.');
      page.keyNumbers.forEach(function (item) {
        lines.push('- ' + item.key + ': ' + item.value);
      });
    } else if (page.kind === 'concept') {
      lines.push('Figures for ' + page.title + ', newest last. The company page keeps the value the source hierarchy allows.');
      lines.push('');
      page.entries.forEach(function (entry) {
        lines.push('- ' + entry.date + ' ' + entry.ticker + ': ' + entry.value + ' (' + SOURCE_LABEL[entry.source] + ')');
      });
    } else if (page.kind === 'output') {
      lines.push(page.answer || '');
    }

    if (page.kind === 'hub' || page.kind === 'concept') {
      lines.push('');
      lines.push('## Contradictions');
      lines.push('');
      if (!page.contradictions.length) lines.push('None.');
      page.contradictions.slice().sort(function (a, b) { return a.key.localeCompare(b.key); }).forEach(function (item) {
        const challenges = item.challenged.map(function (challenge) {
          return SOURCE_LABEL[challenge.source] + ' on ' + challenge.date + ' said ' + challenge.value;
        }).join('; ');
        lines.push('- ' + item.key + ' keeps ' + item.kept.value + ' from the ' + SOURCE_LABEL[item.kept.source] + ' (' + item.kept.date + '). ' + challenges + '.');
      });
    }

    lines.push('');
    lines.push('## Related articles');
    lines.push('');
    lines.push.apply(lines, linkLines(page, vault, page.links));
    lines.push('');
    lines.push('## Backlinks');
    lines.push('');
    lines.push.apply(lines, linkLines(page, vault, page.backlinks));
    lines.push('');
    return lines.join('\n');
  }

  function relink(page, vault) {
    const ids = {};
    function add(id) {
      if (id && id !== page.id && vault.pages[id]) ids[id] = true;
    }
    if (page.kind === 'master') {
      add(LOG);
      vault.order.forEach(function (id) {
        if (vault.pages[id].kind === 'hub') add(id);
      });
    } else if (page.kind === 'hub') {
      add(MASTER);
      page.articles.forEach(function (article) { add(article.pageId); });
      page.keyNumbers.forEach(function (item) { add(conceptId(item.key)); });
      page.mentions.forEach(function (ticker) { add(hubId(ticker)); });
      page.crossChecks.forEach(function (item) { add(hubId(item.from)); });
    } else if (page.kind === 'article') {
      add(hubId(page.ticker));
      page.mentions.forEach(function (ticker) { add(hubId(ticker)); });
      page.factKeys.forEach(function (key) { add(conceptId(key)); });
    } else if (page.kind === 'concept') {
      page.entries.forEach(function (entry) {
        add(hubId(entry.ticker));
        add(entry.articleId);
      });
    } else if (page.kind === 'output') {
      page.usedIds.forEach(add);
    }
    page.links = Object.keys(ids).sort();
  }

  function recomputeBacklinks(vault) {
    const incoming = {};
    vault.order.forEach(function (id) { incoming[id] = []; });
    vault.order.forEach(function (id) {
      vault.pages[id].links.forEach(function (target) {
        if (incoming[target]) incoming[target].push(id);
      });
    });
    vault.order.forEach(function (id) {
      vault.pages[id].backlinks = incoming[id].slice().sort();
    });
  }

  function renderAll(vault) {
    vault.order.forEach(function (id) {
      vault.pages[id].markdown = renderPage(vault.pages[id], vault);
    });
  }

  function paint(next, previous, noteDate) {
    next.order.forEach(function (id) { relink(next.pages[id], next); });
    recomputeBacklinks(next);
    next.order.forEach(function (id) {
      const prev = previous.pages[id];
      next.pages[id].lastUpdated = prev ? prev.lastUpdated : noteDate;
      next.pages[id].revision = prev ? prev.revision : 1;
    });
    renderAll(next);
    const dirty = [];
    next.order.forEach(function (id) {
      const prev = previous.pages[id];
      if (!prev || next.pages[id].markdown !== prev.markdown) dirty.push(id);
    });
    dirty.forEach(function (id) {
      const prev = previous.pages[id];
      next.pages[id].lastUpdated = noteDate;
      next.pages[id].revision = prev ? prev.revision + 1 : 1;
    });
    renderAll(next);
    return dirty;
  }

  function validate(note, vault) {
    if (!note || typeof note !== 'object') return 'Missing note.';
    if (!note.id || !note.title) return 'A note needs an id and a title.';
    if (!COMPANIES[note.ticker]) return 'Unknown ticker. Use LARK.MX, BRINE.HX, or VELL.WY.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date || '')) return 'Use a YYYY-MM-DD date.';
    if (!SOURCE_RANK[note.source]) return 'Source must be an own note, a filing, a call, or news.';
    if (!String(note.text || '').trim()) return 'Write the note first.';
    if (vault.raw.some(function (item) { return item.id === note.id; })) return 'That note is already in raw.';
    return '';
  }

  function prepareNote(input) {
    const sourceMap = {own: 'own-note', 'own-note': 'own-note', filing: 'filing', call: 'call', news: 'news'};
    const title = String((input && input.title) || '').trim();
    const ticker = String((input && input.ticker) || '').trim().toUpperCase();
    const date = String((input && input.date) || '').trim();
    const source = sourceMap[String((input && input.source) || '').trim()] || '';
    const text = String((input && input.text) || '').trim();
    const note = {
      id: slugify(title),
      title: title,
      ticker: ticker,
      date: date,
      source: source,
      text: text,
    };
    const error = validate(note, emptyVault());
    if (error) return {ok: false, error: error};
    return {ok: true, note: note};
  }

  function ingest(vault, note) {
    const error = validate(note, vault);
    if (error) return {ok: false, error: error, vault: vault, touched: [], unchanged: []};
    const next = structuredClone(vault);
    const stored = structuredClone(note);
    next.raw.push(stored);
    const parsed = splitNote(stored.text);
    const summary = firstSentence(parsed.prose) || stored.title;
    const id = articleIdFor(next, stored.ticker, stored.title);
    const article = addPage(next, blankPage({
      id: id,
      path: 'Wiki/' + stored.ticker + '/' + id.split('/').pop() + '.md',
      title: stored.title,
      type: SOURCE_TYPE[stored.source],
      ticker: stored.ticker,
      kind: 'article',
      currency: COMPANIES[stored.ticker].currency,
      sourceNote: stored.id,
      sourceKind: stored.source,
      prose: parsed.prose,
      summary: summary,
    }));
    article.factKeys = parsed.facts.map(function (fact) { return fact.key; });
    article.keyNumbers = parsed.facts.map(function (fact) {
      return {key: fact.key, value: fact.value, date: stored.date, source: stored.source, noteId: stored.id, rank: SOURCE_RANK[stored.source]};
    });
    article.mentions = mentionsOf(stored.text, stored.ticker);

    const hub = ensureHub(next, stored.ticker);
    parsed.facts.forEach(function (fact) { upsertKey(hub, fact, stored); });
    hub.articles.push({pageId: article.id, title: stored.title, summary: summary, date: stored.date});
    hub.articles.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    if (stored.source === 'own-note' && parsed.prose) hub.thesis = firstSentence(parsed.prose);
    else if (hub.thesis === PLACEHOLDER && parsed.prose) hub.thesis = firstSentence(parsed.prose);
    article.mentions.forEach(function (ticker) {
      if (hub.mentions.indexOf(ticker) === -1) hub.mentions.push(ticker);
    });

    parsed.facts.forEach(function (fact) {
      const concept = ensureConcept(next, fact.key);
      concept.entries.push({
        ticker: stored.ticker,
        key: fact.key,
        value: fact.value,
        date: stored.date,
        source: stored.source,
        noteId: stored.id,
        rank: SOURCE_RANK[stored.source],
        articleId: article.id,
      });
    });

    propagate(next, stored, parsed.facts);
    rebuildMaster(next);
    ensureLog(next);

    const predicted = paint(next, vault, stored.date).filter(function (pageId) { return pageId !== LOG; });
    const files = predicted.map(function (pageId) { return next.pages[pageId].path; });
    if (files.indexOf('Wiki/log.md') === -1) files.push('Wiki/log.md');
    files.sort();
    next.log.push({
      date: stored.date,
      action: 'ingest',
      noteId: stored.id,
      title: stored.title,
      files: files,
    });
    const touchedIds = paint(next, vault, stored.date);
    const touched = {};
    touchedIds.forEach(function (pageId) { touched[pageId] = true; });
    const unchanged = next.order.filter(function (pageId) { return !touched[pageId]; });
    return {
      ok: true,
      error: '',
      vault: next,
      noteId: stored.id,
      articleId: article.id,
      touched: touchedIds.map(function (pageId) { return next.pages[pageId].path; }).sort(),
      unchanged: unchanged.map(function (pageId) { return next.pages[pageId].path; }).sort(),
    };
  }

  function tokensOf(question) {
    const raw = String(question || '').toLowerCase().match(/[a-z0-9][a-z0-9.%+-]*/g) || [];
    const out = [];
    raw.forEach(function (token) {
      if (token.length < 3 || STOP[token]) return;
      if (out.indexOf(token) === -1) out.push(token);
      if (token.length > 4 && token.charAt(token.length - 1) === 's') {
        const stem = token.slice(0, -1);
        if (!STOP[stem] && out.indexOf(stem) === -1) out.push(stem);
      }
    });
    return out;
  }

  function pageBlob(page) {
    const parts = [page.title, page.thesis, page.prose, page.summary, page.answer];
    page.keyNumbers.forEach(function (item) { parts.push(item.key, item.value); });
    page.contradictions.forEach(function (item) {
      parts.push(item.key, item.kept && item.kept.value);
      item.challenged.forEach(function (challenge) { parts.push(challenge.value); });
    });
    page.crossChecks.forEach(function (item) { parts.push(item.text); });
    page.entries.forEach(function (entry) { parts.push(entry.ticker, entry.value, entry.key); });
    return parts.join(' ').toLowerCase();
  }

  function companyHit(page, tokens) {
    if (!page.ticker || !COMPANIES[page.ticker]) return false;
    const company = COMPANIES[page.ticker];
    const names = [page.ticker.toLowerCase(), company.name.toLowerCase(), company.name.split(/\s+/)[0].toLowerCase()];
    return tokens.some(function (token) {
      return names.some(function (name) { return name.indexOf(token) !== -1; });
    });
  }

  function ask(vault, question) {
    const tokens = tokensOf(question);
    const broad = /\b(all|every|each|across)\b/i.test(question || '');
    const rows = vault.order.map(function (id) {
      const page = vault.pages[id];
      if (page.kind === 'log' || page.kind === 'master') return {id: id, score: 0};
      const blob = pageBlob(page);
      let content = 0;
      tokens.forEach(function (token) {
        if (page.title.toLowerCase().indexOf(token) !== -1) content += 3;
        const hits = blob.split(token).length - 1;
        if (hits > 0) content += Math.min(hits, 4);
        page.keyNumbers.forEach(function (item) {
          if ((item.key + ' ' + item.value).toLowerCase().indexOf(token) !== -1) content += 4;
        });
      });
      let score = content;
      if (companyHit(page, tokens)) score += page.kind === 'hub' ? 6 : (content > 0 ? 2 : 0);
      return {id: id, score: score};
    });

    let picked = rows.filter(function (row) { return row.score >= 7; });
    if (broad) {
      rows.forEach(function (row) {
        if (vault.pages[row.id].kind === 'hub' && row.score >= 1 && !picked.some(function (item) { return item.id === row.id; })) {
          picked.push(row);
        }
      });
    }
    picked.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
    const hubs = picked.filter(function (row) { return vault.pages[row.id].kind === 'hub'; });
    const rest = picked.filter(function (row) { return vault.pages[row.id].kind !== 'hub'; });
    const used = (broad ? hubs.concat(rest) : picked).slice(0, 6);

    const quotes = [];
    used.forEach(function (row) {
      const page = vault.pages[row.id];
      page.keyNumbers.forEach(function (item) {
        const blob = (item.key + ' ' + item.value).toLowerCase();
        if (!tokens.some(function (token) { return blob.indexOf(token) !== -1; })) return;
        quotes.push({
          pageId: page.id,
          text: page.title + ': ' + item.key + ' is ' + item.value + ' as of ' + item.date + ' (' + SOURCE_LABEL[item.source] + ').',
        });
      });
      page.contradictions.forEach(function (item) {
        if (!tokens.some(function (token) { return item.key.toLowerCase().indexOf(token) !== -1; })) return;
        const challenge = item.challenged[0];
        quotes.push({
          pageId: page.id,
          text: page.title + ': ' + item.key + ' keeps ' + item.kept.value + ' from the ' + SOURCE_LABEL[item.kept.source] + '. A ' + SOURCE_LABEL[challenge.source] + ' said ' + challenge.value + '.',
        });
      });
      const sentences = String(page.prose || '').split(/(?<=[.!?])\s+/).filter(Boolean);
      const sentence = sentences.find(function (line) {
        const lower = line.toLowerCase();
        return tokens.some(function (token) { return lower.indexOf(token) !== -1; });
      });
      if (sentence) quotes.push({pageId: page.id, text: page.title + ': ' + sentence});
    });

    const seenQuote = {};
    const uniqueQuotes = [];
    quotes.forEach(function (quote) {
      if (seenQuote[quote.text]) return;
      seenQuote[quote.text] = true;
      const weight = tokens.reduce(function (score, token) {
        return quote.text.toLowerCase().indexOf(token) === -1 ? score : score + token.length;
      }, 0);
      uniqueQuotes.push({pageId: quote.pageId, text: quote.text, weight: weight});
    });
    uniqueQuotes.sort(function (a, b) { return b.weight - a.weight || a.text.localeCompare(b.text); });
    const shown = uniqueQuotes.slice(0, 4);
    const opened = [];
    if (vault.pages[MASTER]) opened.push(MASTER);
    used.forEach(function (row) {
      if (opened.indexOf(row.id) === -1) opened.push(row.id);
    });

    return {
      question: question,
      tokens: tokens,
      answer: shown.length ? shown.map(function (quote) { return quote.text; }).join(' ') : 'Nothing in the compiled pages answers that. The vault did not guess.',
      quotes: shown,
      used: used.map(function (row) {
        const page = vault.pages[row.id];
        return {id: page.id, path: page.path, title: page.title, score: row.score, kind: page.kind};
      }),
      opened: opened.map(function (id) {
        const page = vault.pages[id];
        return {id: page.id, path: page.path, title: page.title, kind: page.kind};
      }),
    };
  }

  function fileAnswer(vault, result) {
    if (!result || !result.quotes || !result.quotes.length) {
      return {ok: false, error: 'Nothing to file.', vault: vault};
    }
    const id = 'output/' + slugify(result.question);
    if (vault.pages[id]) return {ok: false, error: 'That answer is already filed.', vault: vault};
    const next = structuredClone(vault);
    const date = next.raw.length ? next.raw[next.raw.length - 1].date : '2026-10-18';
    const page = addPage(next, blankPage({
      id: id,
      path: 'output/' + slugify(result.question) + '.md',
      title: result.question,
      type: 'analysis',
      kind: 'output',
      answer: result.answer,
      summary: 'Filed answer',
    }));
    page.usedIds = result.used.map(function (item) { return item.id; });
    ensureLog(next);
    const files = result.used.map(function (item) { return item.path; }).concat([page.path, 'Wiki/log.md']);
    files.sort();
    next.log.push({
      date: date,
      action: 'file',
      noteId: id,
      title: result.question,
      files: files.filter(function (file, index) { return files.indexOf(file) === index; }),
    });
    paint(next, vault, date);
    return {ok: true, error: '', vault: next, pageId: page.id};
  }

  function graph(vault) {
    const tickers = Object.keys(COMPANIES);
    const rows = {};
    const nodes = vault.order.map(function (id) {
      const page = vault.pages[id];
      let col = 0;
      if (page.kind === 'concept') col = 1 + tickers.length;
      else if (page.kind === 'output') col = 2 + tickers.length;
      else if (page.kind === 'hub' || page.kind === 'article') {
        const index = tickers.indexOf(page.ticker);
        col = 1 + (index < 0 ? 0 : index);
      }
      rows[col] = rows[col] || 0;
      const row = rows[col];
      rows[col] += 1;
      return {
        id: page.id,
        title: page.title,
        kind: page.kind,
        ticker: page.ticker,
        path: page.path,
        col: col,
        row: row,
        x: 36 + col * 128,
        y: 28 + row * 58,
      };
    });
    const edges = [];
    vault.order.forEach(function (id) {
      vault.pages[id].links.forEach(function (target) {
        if (vault.pages[target]) edges.push({from: id, to: target});
      });
    });
    const height = 36 + Math.max.apply(null, Object.keys(rows).map(function (key) { return rows[key]; }).concat([1])) * 58;
    return {nodes: nodes, edges: edges, width: 36 + (3 + tickers.length) * 128, height: height};
  }

  function openingNotes() {
    return SEED_NOTES.filter(function (note) { return note.id !== 'brine-storm'; });
  }

  function waitingNote() {
    return SEED_NOTES.find(function (note) { return note.id === 'brine-storm'; });
  }

  function compileNotes(notes) {
    return notes.reduce(function (vault, note) {
      const result = ingest(vault, note);
      if (!result.ok) throw new Error(result.error);
      return result.vault;
    }, emptyVault());
  }

  function openingVault() {
    return compileNotes(openingNotes());
  }

  function numberValue(vault, ticker, key) {
    const hub = vault.pages[hubId(ticker)];
    if (!hub) return null;
    return hub.keyNumbers.find(function (item) { return item.key === key; }) || null;
  }

  return {
    COMPANIES: COMPANIES,
    SOURCE_RANK: SOURCE_RANK,
    SOURCE_LABEL: SOURCE_LABEL,
    SEED_NOTES: SEED_NOTES,
    CANCELLATION: CANCELLATION,
    QUESTIONS: QUESTIONS,
    emptyVault: emptyVault,
    openingNotes: openingNotes,
    waitingNote: waitingNote,
    openingVault: openingVault,
    compileNotes: compileNotes,
    prepareNote: prepareNote,
    ingest: ingest,
    ask: ask,
    fileAnswer: fileAnswer,
    graph: graph,
    splitNote: splitNote,
    relativeLink: relativeLink,
    rawPath: rawPath,
    numberValue: numberValue,
    hubId: hubId,
  };
});
