// A fictional documentation site and a Search for Agents stand-in.
// The crawl, the Markdown, the chunks, and the BM25 scores all run in the
// page. Nothing is requested from the network. Fieldglass is made up.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SearchForAgents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ORIGIN = 'https://docs.fieldglass.example';
  const ENDPOINT = ORIGIN + '/.well-known/search?q={query}';
  const DOCS = 'https://developers.cloudflare.com/ai-search/how-to/search-for-agents/';
  const INSTRUCTIONS = 'Use this search API to find relevant content across this site with keywords or natural-language queries, instead of crawling individual pages. Results are returned in Markdown.';
  const AGENT_METHOD = 'GET';
  const K1 = 1.2;
  const B = 0.75;
  const TOP = 8;

  const STOP = new Set([
    'a', 'an', 'the', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'with', 'is', 'are',
    'be', 'this', 'that', 'it', 'as', 'by', 'from', 'at', 'your', 'you', 'we', 'our',
    'how', 'do', 'if', 'its', 'into', 'than', 'then', 'can', 'may', 'not', 'but',
  ]);

  const PAGES = [
    {
      path: '/',
      file: 'index.md',
      title: 'Fieldglass docs',
      group: 'Home',
      html: [
        '<h1>Fieldglass docs</h1>',
        '<p>Fieldglass builds tide lanterns for harbours that still keep a night watch. These pages describe the glass, the fuel, the vane, and the small HTTP API a harbour office can call.</p>',
        '<p>Nothing here is a real product. The company, the harbours, and the figures are made up.</p>',
      ].join(''),
    },
    {
      path: '/guides/first-lantern',
      file: 'guides/first-lantern.md',
      title: 'Hang the first lantern',
      group: 'Guides',
      html: [
        '<h1>Hang the first lantern</h1>',
        '<p>Bolt the bracket to a dry post, two metres above the mean high tide the harbour marked. The glass bowl faces the channel, not the shed.</p>',
        '<h2>Lighting</h2>',
        '<p>Open the wick door. Trim once, seat the brass collar, and fill from the green can only. A new lantern takes one quiet hour before the flame holds a line.</p>',
      ].join(''),
    },
    {
      path: '/guides/wick',
      file: 'guides/wick.md',
      title: 'Trim the wick',
      group: 'Guides',
      html: [
        '<h1>Trim the wick</h1>',
        '<p>Trim the cotton wick to 6 mm before every watch. A mushroomed tip smokes the glass and drops the light below the channel mark.</p>',
        '<h2>When to replace</h2>',
        '<p>Replace the wick after forty nights, or sooner if the collar shows char above the line. Spare wicks live in the tin marked spare-wick, not in the oil locker.</p>',
      ].join(''),
    },
    {
      path: '/guides/fuel',
      file: 'guides/fuel.md',
      title: 'Fuel grades',
      group: 'Guides',
      html: [
        '<h1>Fuel grades</h1>',
        '<p>Fieldglass lanterns burn two fictional grades.</p>',
        '<ul><li>Brine oil for still harbours</li><li>Kiln oil for wind over twenty knots</li></ul>',
        '<h2>Do not mix</h2>',
        '<p>Never mix brine oil with kiln oil in the same bowl. The blend climbs the wick and stains the chimney. Drain the bowl before you change grade. Kiln oil smells faintly of cedar.</p>',
      ].join(''),
    },
    {
      path: '/reference/glass',
      file: 'reference/glass.md',
      title: 'Glass grades',
      group: 'Reference',
      html: [
        '<h1>Glass grades</h1>',
        '<p>Clear glass is the default chimney. Amber glass is for channels where shore lights confuse pilots. Ruby glass is a spare for fog, and it is not a signal.</p>',
        '<h2>Cracks</h2>',
        '<p>A hairline crack below the shoulder still holds. A crack through the lip means the chimney comes off the watch and goes to the cullet bin.</p>',
      ].join(''),
    },
    {
      path: '/reference/limits',
      file: 'reference/limits.md',
      title: 'Limits',
      group: 'Reference',
      html: [
        '<h1>Limits</h1>',
        '<p>These limits are fictional numbers for the Fieldglass yard.</p>',
        '<h2>Fill and storage</h2>',
        '<p>The maximum oil delivery per fill is 1.4 litres. A harbour store may hold 80 litres of brine oil and 40 litres of kiln oil.</p>',
        '<h2>API limits</h2>',
        '<p>The events API allows 120 requests per minute per harbour key. A webhook payload may be 64 KiB. Larger bodies are rejected with status 413.</p>',
      ].join(''),
    },
    {
      path: '/reference/vane',
      file: 'reference/vane.md',
      title: 'Read the weather vane',
      group: 'Reference',
      html: [
        '<h1>Read the weather vane</h1>',
        '<p>The vane on a Fieldglass post has four cups and a brass needle. The needle points into the wind. Cups spin only to show that the bearing is free.</p>',
        '<h2>Night reading</h2>',
        '<p>After dusk, read the needle against the luminous ticks, not against the shed roof. A stuck cup means the bearing wants oil, not that the wind has stopped.</p>',
      ].join(''),
    },
    {
      path: '/api/webhooks',
      file: 'api/webhooks.md',
      title: 'Webhooks',
      group: 'API',
      html: [
        '<h1>Webhooks</h1>',
        '<p>The harbour API can POST a webhook when a post reports flame, wick, vane, oil, or glass.</p>',
        '<h2>Verify webhook signatures</h2>',
        '<p>Every webhook carries the header X-Fieldglass-Signature. To verify webhook signatures, compute HMAC-SHA256 over the raw body with the harbour secret, and compare it to the header in constant time.</p>',
        '<pre><code>HMAC-SHA256(secret, raw-body)</code></pre>',
        '<p>Reject the webhook when the timestamp is older than five minutes. A signature mismatch is status 401. Verify the signature before you trust the body.</p>',
      ].join(''),
    },
    {
      path: '/api/events',
      file: 'api/events.md',
      title: 'Events',
      group: 'API',
      html: [
        '<h1>Events</h1>',
        '<p>The events feed lists what a post reported. The event names are flame.low, wick.char, vane.stuck, oil.low, and glass.crack.</p>',
        '<h2>Cursor</h2>',
        '<p>Pass the cursor from the previous page. The feed does not rewind. oil.low fires when the bowl is under a fifth, which is separate from the store limit.</p>',
      ].join(''),
    },
    {
      path: '/ops/night-watch',
      file: 'ops/night-watch.md',
      title: 'Night watch',
      group: 'Operations',
      html: [
        '<h1>Night watch</h1>',
        '<p>The watch walks the posts at dusk and again at the second bell. Check the flame line, the wick length, the vane cups, and the oil colour.</p>',
        '<h2>Log</h2>',
        '<p>Write the post name, the grade in the bowl, and whether the glass is clear, amber, or ruby. A smoked chimney is a wick problem, not a glass problem.</p>',
      ].join(''),
    },
    {
      path: '/changelog',
      file: 'changelog.md',
      title: 'Changelog',
      group: 'Log',
      html: [
        '<h1>Changelog</h1>',
        '<h2>Yard notes, March</h2>',
        '<p>The green can now prints the grade on the cap. Kiln oil caps are cedar-coloured. Webhook signatures gained the five-minute timestamp check. No real release shipped. This log is fiction.</p>',
      ].join(''),
    },
  ];

  function oneLine(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  }

  function decode(text) {
    return String(text)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function inline(html) {
    return decode(String(html)
      .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
      .replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim());
  }

  function htmlToMarkdown(html) {
    const blocks = [];
    const re = /<(h1|h2|h3|p|ul|ol|pre)>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = re.exec(html))) {
      const tag = match[1].toLowerCase();
      const inner = match[2];
      if (tag === 'h1') blocks.push('# ' + inline(inner));
      else if (tag === 'h2') blocks.push('## ' + inline(inner));
      else if (tag === 'h3') blocks.push('### ' + inline(inner));
      else if (tag === 'p') blocks.push(inline(inner));
      else if (tag === 'pre') {
        const code = decode(inner.replace(/<\/?code>/gi, '')).replace(/^\n+|\n+$/g, '');
        blocks.push('```\n' + code + '\n```');
      } else {
        const items = [];
        const li = /<li>([\s\S]*?)<\/li>/gi;
        let item;
        while ((item = li.exec(inner))) items.push('- ' + inline(item[1]));
        if (items.length) blocks.push(items.join('\n'));
      }
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '');
  }

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  }

  function chunkMarkdown(file, markdown) {
    const lines = String(markdown).split('\n');
    const sections = [];
    let current = [];
    function flush() {
      const text = current.join('\n').trim();
      current = [];
      if (text) sections.push(text);
    }
    lines.forEach(function (line) {
      if (/^#{1,3}\s/.test(line) && current.some(function (row) { return row.trim(); })) flush();
      current.push(line);
    });
    flush();
    return sections.map(function (text) {
      const heading = text.match(/^#{1,3}\s+(.+)$/m);
      const title = heading ? heading[1].trim() : file;
      const path = sections.length > 1 ? file + '#' + slugify(title) : file;
      return {
        path: path,
        file: file,
        title: title,
        text: text,
        tokens: tokenize(title + '\n' + text + '\n' + file),
      };
    });
  }

  function tokenize(text) {
    const parts = String(text).toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g) || [];
    const out = [];
    parts.forEach(function (part) {
      if (STOP.has(part)) return;
      if (part.length < 2) return;
      out.push(part);
    });
    return out;
  }

  function termFreq(tokens) {
    const freq = Object.create(null);
    tokens.forEach(function (token) {
      freq[token] = (freq[token] || 0) + 1;
    });
    return freq;
  }

  function prepare(page) {
    const markdown = htmlToMarkdown(page.html);
    return {
      path: page.path,
      file: page.file,
      title: page.title,
      group: page.group,
      html: page.html,
      markdown: markdown,
      chunks: chunkMarkdown(page.file, markdown),
    };
  }

  function buildIndex(pages) {
    const prepared = (pages || PAGES).map(prepare);
    const chunks = [];
    prepared.forEach(function (page) {
      page.chunks.forEach(function (chunk) { chunks.push(chunk); });
    });
    const total = chunks.reduce(function (sum, chunk) { return sum + chunk.tokens.length; }, 0);
    const df = Object.create(null);
    chunks.forEach(function (chunk) {
      const seen = Object.create(null);
      chunk.tokens.forEach(function (token) {
        if (seen[token]) return;
        seen[token] = true;
        df[token] = (df[token] || 0) + 1;
      });
    });
    return {
      pages: prepared,
      chunks: chunks,
      avgdl: chunks.length ? total / chunks.length : 1,
      df: df,
    };
  }

  function bm25(index, queryTokens) {
    const chunks = index.chunks;
    const scores = new Array(chunks.length).fill(0);
    if (!queryTokens.length || !chunks.length) return scores;
    const avgdl = index.avgdl || 1;
    chunks.forEach(function (chunk, indexAt) {
      const freq = termFreq(chunk.tokens);
      let score = 0;
      queryTokens.forEach(function (token) {
        const count = freq[token] || 0;
        if (!count) return;
        const n = index.df[token] || 0;
        const idf = Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5));
        const denom = count + K1 * (1 - B + B * (chunk.tokens.length / avgdl));
        score += idf * (count * (K1 + 1)) / denom;
      });
      scores[indexAt] = score;
    });
    return scores;
  }

  function formatScore(score) {
    return Number(score).toFixed(3);
  }

  function search(index, query, limit) {
    const tokens = tokenize(query);
    const raw = bm25(index, tokens);
    let max = 0;
    raw.forEach(function (score) { if (score > max) max = score; });
    const hits = [];
    raw.forEach(function (score, i) {
      const normalised = max > 0 ? score / max : 0;
      if (normalised < 0.0005) return;
      hits.push({
        path: index.chunks[i].path,
        file: index.chunks[i].file,
        title: index.chunks[i].title,
        text: index.chunks[i].text,
        raw: score,
        score: normalised,
      });
    });
    hits.sort(function (a, b) {
      return b.score - a.score || a.path.localeCompare(b.path);
    });
    return {
      query: oneLine(query),
      tokens: tokens,
      hits: hits.slice(0, limit || TOP),
    };
  }

  function formatResults(query, hits) {
    const title = oneLine(query);
    let out = '# Search results for: "' + title + '"\n';
    if (!hits || !hits.length) {
      out += '\nNo matching chunks.\n';
      return out;
    }
    hits.forEach(function (hit, index) {
      if (index) out += '\n---\n';
      out += '\n## ' + hit.path + ' (score: ' + formatScore(hit.score) + ')\n\n';
      out += String(hit.text).trim() + '\n';
    });
    return out;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function agentMetas() {
    return [
      '<meta name="agent:instructions" content="' + escapeHtml(INSTRUCTIONS) + '">',
      '<meta name="agent:endpoint" content="' + ENDPOINT + '">',
      '<meta name="agent:method" content="' + AGENT_METHOD + '">',
      '<meta name="agent:documentation" content="' + DOCS + '">',
    ].join('\n');
  }

  function agentFrontMatter() {
    return [
      '---',
      'agent:',
      '  instructions: "' + INSTRUCTIONS + '"',
      '  endpoint: "' + ENDPOINT + '"',
      '  method: "' + AGENT_METHOD + '"',
      '  documentation: "' + DOCS + '"',
      '---',
      '',
    ].join('\n');
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(String(text)).length;
  }

  function pageByPath(path) {
    for (let i = 0; i < PAGES.length; i += 1) {
      if (PAGES[i].path === path) return PAGES[i];
    }
    return null;
  }

  function pageResponse(page, accept, enabled) {
    const prepared = prepare(page);
    const markdown = String(accept).indexOf('markdown') !== -1;
    if (markdown) {
      const body = (enabled ? agentFrontMatter() : '') + prepared.markdown;
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
        body: body,
      };
    }
    const head = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<title>' + escapeHtml(page.title) + '</title>',
      enabled ? agentMetas() : '',
      '</head>',
      '<body>',
      page.html,
      '</body>',
      '</html>',
      '',
    ].filter(function (line) { return line !== ''; }).join('\n');
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: head,
    };
  }

  function withLength(response) {
    const headers = {};
    Object.keys(response.headers).forEach(function (key) { headers[key] = response.headers[key]; });
    headers['content-length'] = String(utf8Bytes(response.body));
    return {
      status: response.status,
      statusText: response.statusText,
      headers: headers,
      body: response.body,
    };
  }

  function formatHttp(response) {
    const full = withLength(response);
    const lines = ['HTTP/1.1 ' + full.status + ' ' + full.statusText];
    Object.keys(full.headers).forEach(function (key) {
      lines.push(key + ': ' + full.headers[key]);
    });
    return lines.join('\n') + '\n\n' + full.body;
  }

  function pageExchange(page, accept, enabled) {
    const header = markdownAccept(accept) ? 'text/markdown' : 'text/html';
    const req = [
      'GET ' + page.path + ' HTTP/1.1',
      'Host: docs.fieldglass.example',
      'Accept: ' + header,
    ].join('\n');
    return req + '\n\n' + formatHttp(pageResponse(page, header, enabled));
  }

  function markdownAccept(accept) {
    return String(accept).indexOf('markdown') !== -1;
  }

  function shellSingle(text) {
    return "'" + String(text).replace(/'/g, "'\\''") + "'";
  }

  function curlFor(query, mode) {
    const url = ORIGIN + '/.well-known/search';
    const q = oneLine(query);
    if (mode === 'text') {
      return [
        'curl -X QUERY ' + shellSingle(url) + ' \\',
        "  --header 'Content-Type: text/plain' \\",
        '  --data ' + shellSingle(q),
      ].join('\n');
    }
    if (mode === 'json') {
      return [
        'curl -X QUERY ' + shellSingle(url) + ' \\',
        "  --header 'Content-Type: application/json' \\",
        '  --data ' + shellSingle(JSON.stringify({ q: q })),
      ].join('\n');
    }
    return [
      'curl --get "' + url + '" \\',
      '  --data-urlencode "q=' + q.replace(/"/g, '\\"') + '"',
    ].join('\n');
  }

  function endpointResponse(query, enabled, index) {
    if (!enabled) {
      return {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: 'Search for Agents is off for this zone.\n/.well-known/search is not available.\n',
      };
    }
    const found = search(index || buildIndex(PAGES), query);
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
      body: formatResults(found.query, found.hits),
      found: found,
    };
  }

  function compare(pages, accept, enabled, searchBody) {
    const list = pages || PAGES;
    let crawlBytes = 0;
    list.forEach(function (page) {
      crawlBytes += utf8Bytes(pageResponse(page, accept, enabled).body);
    });
    const searchBytes = utf8Bytes(searchBody || '');
    return {
      crawlRequests: list.length,
      crawlBytes: crawlBytes,
      searchRequests: 1,
      searchBytes: searchBytes,
    };
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    return (n / 1024).toFixed(1) + ' KB';
  }

  return {
    ORIGIN: ORIGIN,
    ENDPOINT: ENDPOINT,
    DOCS: DOCS,
    INSTRUCTIONS: INSTRUCTIONS,
    AGENT_METHOD: AGENT_METHOD,
    PAGES: PAGES,
    oneLine: oneLine,
    htmlToMarkdown: htmlToMarkdown,
    chunkMarkdown: chunkMarkdown,
    tokenize: tokenize,
    prepare: prepare,
    buildIndex: buildIndex,
    search: search,
    formatScore: formatScore,
    formatResults: formatResults,
    agentMetas: agentMetas,
    agentFrontMatter: agentFrontMatter,
    utf8Bytes: utf8Bytes,
    pageByPath: pageByPath,
    pageResponse: pageResponse,
    formatHttp: formatHttp,
    pageExchange: pageExchange,
    curlFor: curlFor,
    endpointResponse: endpointResponse,
    compare: compare,
    formatBytes: formatBytes,
  };
});
