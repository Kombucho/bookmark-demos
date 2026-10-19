const assert = require('node:assert/strict');
const test = require('node:test');
const wiki = require('./wiki.js');

function page(vault, path) {
  return Object.values(vault.pages).find(function (item) { return item.path === path; });
}

test('the opening vault compiles four raw notes and leaves the storm waiting', function () {
  const vault = wiki.openingVault();
  assert.equal(vault.raw.length, 4);
  assert.deepEqual(vault.raw.map(function (note) { return note.id; }), [
    'larkmill-thesis',
    'brine-contract',
    'vell-order',
    'lark-q2',
  ]);
  assert.equal(wiki.waitingNote().id, 'brine-storm');
  assert.equal(vault.raw.some(function (note) { return note.id === 'brine-storm'; }), false);
  assert.ok(page(vault, 'Wiki/index.md'));
  assert.ok(page(vault, 'Wiki/log.md'));
  assert.equal(page(vault, 'Wiki/LARK.MX/index.md').title, 'Larkmill Ceramics');
  assert.equal(wiki.numberValue(vault, 'LARK.MX', 'Kiln utilization').value, '81%');
  assert.equal(wiki.numberValue(vault, 'BRINE.HX', 'Brine price').value, '640 HXD per tonne');
  assert.equal(wiki.numberValue(vault, 'VELL.WY', 'Lamp order').value, '12000');
  assert.equal(vault.log.length, 4);
});

test('an own note outranks a later call, and the call stays on its article', function () {
  const vault = wiki.openingVault();
  const cash = wiki.numberValue(vault, 'LARK.MX', 'Cash');
  assert.equal(cash.value, '38 million MXN');
  assert.equal(cash.source, 'own-note');
  const hub = page(vault, 'Wiki/LARK.MX/index.md');
  const conflict = hub.contradictions.find(function (item) { return item.key === 'Cash'; });
  assert.equal(conflict.kept.value, '38 million MXN');
  assert.equal(conflict.challenged[0].value, '42 million MXN');
  assert.equal(conflict.challenged[0].source, 'call');
  const call = page(vault, 'Wiki/LARK.MX/q2-kiln-call.md');
  assert.equal(call.keyNumbers.find(function (item) { return item.key === 'Cash'; }).value, '42 million MXN');
  assert.match(hub.markdown, /Cash: 38 million MXN/);
  assert.match(call.markdown, /Reporting currency: MXN/);
});

test('pages link to each other and the backlink list points back', function () {
  const vault = wiki.openingVault();
  const article = page(vault, 'Wiki/LARK.MX/larkmill-thesis.md');
  const hub = page(vault, 'Wiki/LARK.MX/index.md');
  assert.ok(article.links.indexOf(hub.id) !== -1);
  assert.ok(article.links.indexOf(wiki.hubId('BRINE.HX')) !== -1);
  assert.ok(hub.backlinks.indexOf(article.id) !== -1);
  assert.match(article.markdown, /\]\(\.\.\/BRINE\.HX\/index\.md\)/);
  const index = page(vault, 'Wiki/index.md');
  assert.match(index.markdown, /LARK\.MX/);
  assert.match(index.markdown, /BRINE\.HX/);
  assert.match(index.markdown, /VELL\.WY/);
  assert.match(index.markdown, /Cross-topic connections/);
  assert.ok(index.connections.length >= 2);
});

test('raw notes stay immutable when a new note is compiled', function () {
  const before = wiki.openingVault();
  const snapshot = structuredClone(before.raw);
  const markdown = page(before, 'Wiki/LARK.MX/larkmill-thesis.md').markdown;
  const revision = page(before, 'Wiki/LARK.MX/larkmill-thesis.md').revision;
  const result = wiki.ingest(before, wiki.waitingNote());
  assert.equal(result.ok, true);
  assert.deepEqual(before.raw, snapshot);
  assert.equal(before.raw.length, 4);
  assert.equal(result.vault.raw.length, 5);
  assert.equal(result.vault.raw[0].text, snapshot[0].text);
  assert.equal(page(result.vault, 'Wiki/LARK.MX/larkmill-thesis.md').markdown, markdown);
  assert.equal(page(result.vault, 'Wiki/LARK.MX/larkmill-thesis.md').revision, revision);
  assert.ok(page(result.vault, 'Wiki/BRINE.HX/index.md').revision > page(before, 'Wiki/BRINE.HX/index.md').revision);
  assert.ok(result.touched.indexOf('Wiki/BRINE.HX/storm-at-saltpier.md') !== -1);
  assert.ok(result.unchanged.indexOf('Wiki/LARK.MX/larkmill-thesis.md') !== -1);
  assert.equal(result.vault.log.length, 5);
  assert.equal(result.vault.log[4].action, 'ingest');
  assert.equal(result.vault.log[4].noteId, 'brine-storm');
});

test('a lower-ranked storm challenges the filed brine price and reaches the other names', function () {
  const opened = wiki.ingest(wiki.openingVault(), wiki.waitingNote());
  const vault = opened.vault;
  const price = wiki.numberValue(vault, 'BRINE.HX', 'Brine price');
  assert.equal(price.value, '640 HXD per tonne');
  assert.equal(price.source, 'filing');
  const hub = page(vault, 'Wiki/BRINE.HX/index.md');
  const conflict = hub.contradictions.find(function (item) { return item.key === 'Brine price'; });
  assert.equal(conflict.kept.value, '640 HXD per tonne');
  assert.equal(conflict.challenged.some(function (item) { return item.value === '710 HXD per tonne' && item.source === 'news'; }), true);
  assert.equal(page(vault, 'Wiki/BRINE.HX/saltpier-supply-contract.md').revision, page(wiki.openingVault(), 'Wiki/BRINE.HX/saltpier-supply-contract.md').revision);
  assert.ok(opened.touched.indexOf('Wiki/LARK.MX/index.md') !== -1);
  assert.ok(opened.touched.indexOf('Wiki/VELL.WY/index.md') !== -1);
  assert.ok(opened.unchanged.indexOf('Wiki/VELL.WY/june-lamp-order.md') !== -1);
  assert.match(page(vault, 'Wiki/concepts/brine-price.md').markdown, /710 HXD per tonne/);
  assert.match(page(vault, 'Wiki/concepts/brine-price.md').markdown, /640 HXD per tonne/);
});

test('a question quotes the pages it used and does not invent the storm early', function () {
  const vault = wiki.openingVault();
  const util = wiki.ask(vault, 'What is Larkmill kiln utilization?');
  assert.match(util.answer, /81%/);
  assert.equal(util.answer.indexOf('710'), -1);
  assert.equal(util.opened[0].path, 'Wiki/index.md');
  assert.ok(util.used.some(function (item) { return item.path === 'Wiki/LARK.MX/index.md'; }));
  assert.ok(util.used.some(function (item) { return item.path === 'Wiki/LARK.MX/q2-kiln-call.md'; }));

  const early = wiki.ask(vault, 'What did the storm do to the brine quote?');
  assert.equal(early.answer.indexOf('710'), -1);
  assert.equal(early.answer.toLowerCase().indexOf('storm'), -1);
  assert.equal(early.used.some(function (item) { return item.path.indexOf('storm') !== -1; }), false);

  const later = wiki.ask(wiki.ingest(vault, wiki.waitingNote()).vault, 'What did the storm do to the brine quote?');
  assert.match(later.answer, /710 HXD per tonne/);
  assert.match(later.answer, /640 HXD per tonne/);
  assert.ok(later.used.some(function (item) { return item.path === 'Wiki/BRINE.HX/storm-at-saltpier.md'; }));
  assert.ok(later.used.some(function (item) { return item.path === 'Wiki/BRINE.HX/index.md'; }));
});

test('a cross-company question opens every company the word touches', function () {
  const vault = wiki.openingVault();
  const result = wiki.ask(vault, 'How does brine hit every name?');
  ['Wiki/LARK.MX/index.md', 'Wiki/BRINE.HX/index.md', 'Wiki/VELL.WY/index.md'].forEach(function (path) {
    assert.ok(result.used.some(function (item) { return item.path === path; }), path);
  });
  assert.equal(result.opened[0].path, 'Wiki/index.md');
  const piers = wiki.ask(vault, 'How many piers does Brineharbor have?');
  assert.match(piers.answer, /Pier count is 1/);
  const cash = wiki.ask(vault, 'What cash figure does the vault keep for Larkmill?');
  assert.match(cash.answer, /38 million MXN/);
  assert.match(cash.answer, /42 million MXN/);
});

test('a same-rank later note replaces one number and leaves the old article alone', function () {
  const before = wiki.openingVault();
  const june = page(before, 'Wiki/VELL.WY/june-lamp-order.md');
  const brineHub = page(before, 'Wiki/BRINE.HX/index.md');
  const result = wiki.ingest(before, wiki.CANCELLATION);
  assert.equal(result.ok, true);
  assert.equal(wiki.numberValue(result.vault, 'VELL.WY', 'Lamp order').value, '6000');
  assert.equal(page(result.vault, 'Wiki/VELL.WY/june-lamp-order.md').markdown, june.markdown);
  assert.equal(page(result.vault, 'Wiki/VELL.WY/june-lamp-order.md').keyNumbers[0].value, '12000');
  assert.equal(page(result.vault, 'Wiki/BRINE.HX/index.md').markdown, brineHub.markdown);
  assert.ok(result.touched.indexOf('Wiki/LARK.MX/index.md') !== -1);
  assert.ok(result.unchanged.indexOf('Wiki/BRINE.HX/index.md') !== -1);
});

test('filing an answer writes output and a second file is refused', function () {
  const vault = wiki.openingVault();
  const answer = wiki.ask(vault, 'What is Larkmill kiln utilization?');
  const filed = wiki.fileAnswer(vault, answer);
  assert.equal(filed.ok, true);
  assert.equal(vault.raw.length, filed.vault.raw.length);
  const output = Object.values(filed.vault.pages).find(function (item) { return item.kind === 'output'; });
  assert.ok(output);
  assert.match(output.markdown, /81%/);
  assert.ok(output.links.indexOf(wiki.hubId('LARK.MX')) !== -1);
  assert.equal(filed.vault.log[filed.vault.log.length - 1].action, 'file');
  const again = wiki.fileAnswer(filed.vault, answer);
  assert.equal(again.ok, false);
  assert.equal(again.vault, filed.vault);
});

test('unknown tickers, duplicates, and empty questions stay out of the vault', function () {
  const vault = wiki.openingVault();
  const bad = wiki.ingest(vault, {
    id: 'nope',
    title: 'Nope',
    ticker: 'AAPL',
    date: '2026-10-01',
    source: 'news',
    text: 'Cash: 1',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.vault, vault);
  const dup = wiki.ingest(vault, vault.raw[0]);
  assert.equal(dup.ok, false);
  const prepared = wiki.prepareNote({
    title: 'Pier note',
    ticker: 'brine.hx',
    date: '2026-10-02',
    source: 'own-note',
    text: 'Pier count: 2\n\nA second pier is still a rumor.',
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.note.ticker, 'BRINE.HX');
  const empty = wiki.ask(vault, '');
  assert.match(empty.answer, /did not guess/);
  assert.deepEqual(empty.used, []);
});
