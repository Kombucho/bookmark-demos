const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site.js');

test('eleven fictional pages, each with a path, a file, and markdown', function () {
  assert.equal(site.PAGES.length, 11);
  const paths = site.PAGES.map(function (page) { return page.path; });
  const files = site.PAGES.map(function (page) { return page.file; });
  assert.equal(new Set(paths).size, 11);
  assert.equal(new Set(files).size, 11);
  site.PAGES.forEach(function (page) {
    assert.equal(page.html.indexOf('agent:instructions'), -1);
    const markdown = site.htmlToMarkdown(page.html);
    assert.match(markdown, new RegExp('# ' + page.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(site.chunkMarkdown(page.file, markdown).length >= 1);
  });
  const fuel = site.htmlToMarkdown(site.pageByPath('/guides/fuel').html);
  assert.match(fuel, /- Brine oil for still harbours/);
  const hooks = site.htmlToMarkdown(site.pageByPath('/api/webhooks').html);
  assert.match(hooks, /HMAC-SHA256/);
  assert.match(hooks, /```/);
});

test('HTML gains the four agent meta tags only while the zone is on', function () {
  const page = site.pageByPath('/api/webhooks');
  const off = site.pageResponse(page, 'text/html', false);
  const on = site.pageResponse(page, 'text/html', true);
  assert.equal(off.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(off.body.indexOf('agent:instructions'), -1);
  assert.equal(off.body.indexOf('agent:endpoint'), -1);
  assert.match(on.body, /<meta name="agent:instructions" content="Use this search API/);
  assert.match(on.body, /name="agent:endpoint" content="https:\/\/docs\.fieldglass\.example\/\.well-known\/search\?q=\{query\}"/);
  assert.match(on.body, /name="agent:method" content="GET"/);
  assert.match(on.body, /developers\.cloudflare\.com\/ai-search\/how-to\/search-for-agents/);
  assert.equal(site.INSTRUCTIONS, 'Use this search API to find relevant content across this site with keywords or natural-language queries, instead of crawling individual pages. Results are returned in Markdown.');
});

test('Accept text/markdown carries the same advertisement as YAML front matter', function () {
  const page = site.pageByPath('/');
  const off = site.pageResponse(page, 'text/markdown', false);
  const on = site.pageResponse(page, 'text/markdown', true);
  assert.equal(off.body.indexOf('agent:'), -1);
  assert.match(off.body, /^# Fieldglass docs/);
  assert.match(on.body, /^---\nagent:\n {2}instructions: "/);
  assert.match(on.body, /endpoint: "https:\/\/docs\.fieldglass\.example\/\.well-known\/search\?q=\{query\}"/);
  assert.match(on.body, /method: "GET"/);
  assert.ok(on.body.indexOf('# Fieldglass docs') > on.body.indexOf('---'));
  const exchange = site.pageExchange(page, 'text/markdown', true);
  assert.match(exchange, /^GET \/ HTTP\/1.1/);
  assert.match(exchange, /Accept: text\/markdown/);
  assert.match(exchange, /content-type: text\/markdown/);
});

test('BM25 ranks webhook signatures, oil delivery, and a stuck cup, with the top score at 1.000', function () {
  const index = site.buildIndex(site.PAGES);
  assert.ok(index.chunks.length > site.PAGES.length);

  const hooks = site.search(index, 'How do I verify webhook signatures?');
  assert.equal(hooks.hits[0].file, 'api/webhooks.md');
  assert.equal(hooks.hits[0].score, 1);
  assert.ok(hooks.hits[0].raw > hooks.hits[1].raw);
  assert.equal(site.formatScore(hooks.hits[0].score), '1.000');
  assert.ok(Number(site.formatScore(hooks.hits[1].score)) < 1);
  const body = site.formatResults(hooks.query, hooks.hits);
  assert.match(body, /^# Search results for: "How do I verify webhook signatures\?"\n/);
  assert.match(body, /^## api\/webhooks\.md#verify-webhook-signatures \(score: 1\.000\)/m);
  assert.match(body, /## .* \(score: 0\.\d{3}\)/);

  const oil = site.search(index, 'maximum oil delivery per fill');
  assert.equal(oil.hits[0].file, 'reference/limits.md');
  assert.match(oil.hits[0].text, /1\.4 litres/);

  const vane = site.search(index, 'stuck cup bearing');
  assert.equal(vane.hits[0].file, 'reference/vane.md');

  const ruby = site.search(index, 'ruby glass fog');
  assert.equal(ruby.hits[0].file, 'reference/glass.md');

  const empty = site.search(index, 'the a of');
  assert.equal(empty.hits.length, 0);
  assert.match(site.formatResults(empty.query, empty.hits), /No matching chunks/);

  const again = site.search(index, 'How do I verify webhook signatures?');
  assert.equal(site.formatResults(again.query, again.hits), body);
  assert.equal(index.chunks.length > 0, true);
});

test('the endpoint is 404 while the zone is off, and QUERY does not change the index', function () {
  const index = site.buildIndex();
  const before = index.chunks.length;
  const off = site.endpointResponse('verify webhook signatures', false, index);
  assert.equal(off.status, 404);
  assert.equal(off.body.indexOf('score:'), -1);
  assert.match(off.body, /not available/);

  const on = site.endpointResponse("what's a webhook signature?", true, index);
  assert.equal(on.status, 200);
  assert.match(on.body, /^# Search results for: "what's a webhook signature\?"/);
  assert.match(on.body, /score: 1\.000/);
  assert.equal(index.chunks.length, before);

  const get = site.curlFor('How do I verify webhook signatures?', 'get');
  assert.match(get, /curl --get "https:\/\/docs\.fieldglass\.example\/\.well-known\/search"/);
  assert.match(get, /--data-urlencode "q=How do I verify webhook signatures\?"/);
  const text = site.curlFor('How do I verify webhook signatures?', 'text');
  assert.match(text, /curl -X QUERY/);
  assert.match(text, /Content-Type: text\/plain/);
  const json = site.curlFor("what's left", 'json');
  assert.match(json, /Content-Type: application\/json/);
  const payload = JSON.stringify({ q: "what's left" });
  assert.equal(json.split('--data ')[1], "'" + payload.replace(/'/g, "'\\''") + "'");
  assert.equal(index.chunks.length, before);
});

test('one search call is a single request, against one fetch per page', function () {
  const index = site.buildIndex();
  const found = site.endpointResponse('How do I verify webhook signatures?', true, index);
  const cost = site.compare(site.PAGES, 'text/html', true, found.body);
  assert.equal(cost.crawlRequests, 11);
  assert.equal(cost.searchRequests, 1);
  assert.ok(cost.crawlBytes > cost.searchBytes);
  assert.ok(cost.searchBytes === site.utf8Bytes(found.body));
  const off = site.endpointResponse('How do I verify webhook signatures?', false, index);
  const offCost = site.compare(site.PAGES, 'text/html', false, off.body);
  assert.equal(offCost.crawlRequests, 11);
  assert.ok(offCost.crawlBytes < cost.crawlBytes);
});

test('the catalog links the demo, and the page credits the post', function () {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.match(index, /href="search-for-agents-demo\/"/);
  assert.match(page, /Cloudflare\/status\/2125591595965702452/);
  assert.match(page, /blog\.cloudflare\.com\/search-for-agents/);
  assert.match(readme, /search-for-agents-demo/);
  assert.doesNotMatch(page, /<(script|link)[^>]+https?:/);
  assert.match(page, /Fictional/);
});
