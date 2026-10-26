// Toy retrieval over the fictional wick tree.
// BM25 is Okapi. The vector is a hand lexicon, not a model and not XERJ.
// Code-aware chunks are a brace matcher standing in for tree-sitter.

(function (root, factory) {
  const corpus = (typeof module === 'object' && module.exports)
    ? require('./corpus.js')
    : root.WickCorpus;
  const api = factory(corpus);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CodeSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (corpus) {
  const FILES = corpus.FILES;
  const STOP = corpus.STOP;
  const LEXICON = corpus.LEXICON;
  const WINDOW = corpus.WINDOW;
  const PASSAGES = 6;
  const K1 = 1.2;
  const B = 0.75;

  const WORD_DIM = new Map();
  LEXICON.forEach(function (dim, index) {
    dim.words.forEach(function (word) {
      WORD_DIM.set(word, index);
    });
  });

  function splitIdent(token) {
    return token
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .map(function (part) { return part.toLowerCase(); })
      .filter(Boolean);
  }

  function tokenize(text, splitIdents) {
    const parts = String(text).match(/[A-Za-z0-9]+/g) || [];
    const out = [];
    parts.forEach(function (part) {
      const bits = splitIdents ? splitIdent(part) : [part.toLowerCase()];
      bits.forEach(function (bit) {
        if (STOP.has(bit)) return;
        if (/^[0-9]+$/.test(bit)) return;
        if (bit.length < 2) return;
        out.push(bit);
      });
    });
    return out;
  }

  function fileText(file) {
    return file.lines.join('\n');
  }

  function makeChunk(file, start, end, text, symbol, kind, splitIdents) {
    return {
      path: file.path,
      kind: kind,
      symbol: symbol,
      start: start,
      end: end,
      text: text,
      tokens: tokenize(text, splitIdents),
    };
  }

  function windows(file) {
    const chunks = [];
    const lines = file.lines;
    if (!lines.length) return chunks;
    for (let start = 0; start < lines.length; start += WINDOW) {
      const slice = lines.slice(start, start + WINDOW);
      chunks.push(makeChunk(file, start + 1, start + slice.length, slice.join('\n'), null, 'window', false));
    }
    return chunks;
  }

  function lineChunks(file) {
    const chunks = [];
    file.lines.forEach(function (line, index) {
      if (!line.trim()) return;
      chunks.push(makeChunk(file, index + 1, index + 1, line, null, 'line', false));
    });
    return chunks;
  }

  function sectionChunks(file) {
    const lines = file.lines;
    const starts = [];
    lines.forEach(function (line, index) {
      if (/^#{1,3}\s+/.test(line)) starts.push(index);
    });
    if (!starts.length) {
      return [makeChunk(file, 1, lines.length, lines.join('\n'), null, 'section', false)];
    }
    const chunks = [];
    if (starts[0] > 0 && lines.slice(0, starts[0]).some(function (line) { return line.trim(); })) {
      chunks.push(makeChunk(file, 1, starts[0], lines.slice(0, starts[0]).join('\n'), null, 'section', false));
    }
    starts.forEach(function (start, index) {
      const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
      const title = lines[start].replace(/^#{1,3}\s+/, '').trim();
      const text = lines.slice(start, end).join('\n');
      if (!text.trim()) return;
      chunks.push(makeChunk(file, start + 1, end, text, title, 'section', false));
    });
    return chunks;
  }

  function codeChunks(file) {
    const lines = file.lines;
    const chunks = [];
    let cursor = 0;

    function functionName(line) {
      const match = /^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
      return match ? match[1] : null;
    }

    while (cursor < lines.length && !functionName(lines[cursor])) cursor += 1;
    if (cursor > 0 && lines.slice(0, cursor).some(function (line) { return line.trim(); })) {
      chunks.push(makeChunk(file, 1, cursor, lines.slice(0, cursor).join('\n'), null, 'preamble', false));
    }

    let consumed = cursor;
    while (cursor < lines.length) {
      if (!functionName(lines[cursor])) {
        cursor += 1;
        continue;
      }
      let from = cursor;
      let look = cursor - 1;
      while (look >= consumed && /^\s*\/\//.test(lines[look])) {
        from = look;
        look -= 1;
      }
      let depth = 0;
      let end = cursor;
      for (; end < lines.length; end += 1) {
        const opens = (lines[end].match(/\{/g) || []).length;
        const closes = (lines[end].match(/\}/g) || []).length;
        depth += opens - closes;
        if (end > cursor && depth <= 0) {
          end += 1;
          break;
        }
      }
      const name = functionName(lines[cursor]);
      const text = lines.slice(from, end).join('\n');
      chunks.push(makeChunk(file, from + 1, end, text, name, 'symbol', true));
      consumed = end;
      cursor = end;
    }
    return chunks;
  }

  function chunksFor(file, codeAware) {
    if (!codeAware) return windows(file);
    if (file.kind === 'code') return codeChunks(file);
    if (file.kind === 'log') return lineChunks(file);
    if (file.kind === 'doc') return sectionChunks(file);
    return [makeChunk(file, 1, file.lines.length, fileText(file), null, 'record', true)];
  }

  function buildIndex(codeAware) {
    const chunks = [];
    FILES.forEach(function (file) {
      chunksFor(file, codeAware).forEach(function (chunk) { chunks.push(chunk); });
    });
    return chunks;
  }

  function termFreq(tokens) {
    const freq = Object.create(null);
    tokens.forEach(function (token) {
      freq[token] = (freq[token] || 0) + 1;
    });
    return freq;
  }

  function bm25Scores(chunks, queryTokens) {
    const scores = new Array(chunks.length).fill(0);
    if (!queryTokens.length || !chunks.length) return scores;
    const total = chunks.reduce(function (sum, chunk) { return sum + chunk.tokens.length; }, 0);
    const avgdl = total / chunks.length || 1;
    const df = Object.create(null);
    chunks.forEach(function (chunk) {
      const seen = Object.create(null);
      chunk.tokens.forEach(function (token) {
        if (seen[token]) return;
        seen[token] = true;
        df[token] = (df[token] || 0) + 1;
      });
    });
    chunks.forEach(function (chunk, index) {
      const freq = termFreq(chunk.tokens);
      let score = 0;
      queryTokens.forEach(function (token) {
        const count = freq[token] || 0;
        if (!count) return;
        const n = df[token] || 0;
        const idf = Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5));
        const denom = count + K1 * (1 - B + B * (chunk.tokens.length / avgdl));
        score += idf * (count * (K1 + 1)) / denom;
      });
      scores[index] = score;
    });
    return scores;
  }

  function vectorFor(tokens) {
    const vector = new Array(LEXICON.length).fill(0);
    tokens.forEach(function (token) {
      const index = WORD_DIM.get(token);
      if (index === undefined) return;
      vector[index] += 1;
    });
    return vector;
  }

  function dot(left, right) {
    let sum = 0;
    for (let i = 0; i < left.length; i += 1) sum += left[i] * right[i];
    return sum;
  }

  function norm(vector) {
    return Math.sqrt(dot(vector, vector));
  }

  function cosine(left, right) {
    const leftNorm = norm(left);
    const rightNorm = norm(right);
    if (!leftNorm || !rightNorm) return 0;
    return dot(left, right) / (leftNorm * rightNorm);
  }

  function topDims(vector) {
    return LEXICON
      .map(function (dim, index) { return { id: dim.id, label: dim.label, mass: vector[index] }; })
      .filter(function (dim) { return dim.mass > 0; })
      .sort(function (a, b) { return b.mass - a.mass || a.id.localeCompare(b.id); });
  }

  function readStats(texts) {
    let chars = 0;
    let tokens = 0;
    texts.forEach(function (text) {
      chars += text.length;
      tokens += tokenize(text, false).length;
    });
    return { chars: chars, tokens: tokens };
  }

  function containsMention(text, queryTokens) {
    const lower = text.toLowerCase();
    return queryTokens.every(function (token) { return lower.indexOf(token) !== -1; });
  }

  function search(query, options) {
    const mode = options && options.mode ? options.mode : 'bm25';
    const codeAware = !!(options && options.codeAware);
    const limit = options && options.limit ? options.limit : PASSAGES;
    const queryTokens = tokenize(query, false);
    const chunks = buildIndex(codeAware);
    const lexical = bm25Scores(chunks, queryTokens);
    const queryVector = vectorFor(queryTokens);
    const vectors = chunks.map(function (chunk) { return vectorFor(chunk.tokens); });
    const cosines = vectors.map(function (vector) { return cosine(queryVector, vector); });
    const dots = vectors.map(function (vector) { return dot(queryVector, vector); });
    const maxLexical = lexical.reduce(function (max, score) { return Math.max(max, score); }, 0);

    const hits = [];
    chunks.forEach(function (chunk, index) {
      const lexicalScore = lexical[index];
      const vectorScore = cosines[index];
      let score = 0;
      if (mode === 'bm25') score = lexicalScore;
      else if (mode === 'vector') score = vectorScore;
      else score = 0.5 * (maxLexical ? lexicalScore / maxLexical : 0) + 0.5 * vectorScore;
      if (score <= 0) return;
      const matched = queryTokens.filter(function (token) { return chunk.tokens.indexOf(token) !== -1; });
      hits.push({
        path: chunk.path,
        kind: chunk.kind,
        symbol: chunk.symbol,
        start: chunk.start,
        end: chunk.end,
        text: chunk.text,
        tokens: chunk.tokens,
        score: score,
        bm25: lexicalScore,
        cosine: vectorScore,
        dot: dots[index],
        matched: matched,
        dims: topDims(vectors[index]),
      });
    });

    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (mode === 'vector' && b.dot !== a.dot) return b.dot - a.dot;
      if (b.bm25 !== a.bm25) return b.bm25 - a.bm25;
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      return a.start - b.start;
    });

    // Repeated warnings are the same passage. Keep one, and remember the copies,
    // so a dozen identical log lines cannot crowd out every other hit.
    const shown = [];
    const seen = new Map();
    hits.forEach(function (hit) {
      const key = hit.text.toLowerCase().replace(/[0-9]+/g, '0').replace(/\s+/g, ' ').trim();
      const prev = seen.get(key);
      if (prev) {
        prev.copies += 1;
        return;
      }
      const card = Object.assign({}, hit, { copies: 1 });
      seen.set(key, card);
      if (shown.length < limit) shown.push(card);
    });

    const passageRead = readStats(shown.map(function (hit) { return hit.text; }));
    const rawRead = readStats(hits.slice(0, limit).map(function (hit) { return hit.text; }));
    const treeRead = readStats(FILES.map(fileText));
    let firstMention = null;
    FILES.forEach(function (file, index) {
      if (firstMention) return;
      if (queryTokens.length && containsMention(fileText(file), queryTokens)) {
        firstMention = { path: file.path, index: index };
      }
    });

    return {
      mode: mode,
      codeAware: codeAware,
      queryTokens: queryTokens,
      chunkCount: chunks.length,
      hits: hits,
      shown: shown,
      passageRead: passageRead,
      rawRead: rawRead,
      treeRead: treeRead,
      firstMention: firstMention,
      queryVector: topDims(queryVector),
    };
  }

  function walk(query, openedCount) {
    const queryTokens = tokenize(query, false);
    const opened = Math.max(0, Math.min(FILES.length, openedCount || 0));
    const files = FILES.map(function (file, index) {
      const text = fileText(file);
      const stats = readStats([text]);
      return {
        path: file.path,
        kind: file.kind,
        lines: file.lines,
        text: text,
        chars: stats.chars,
        tokens: stats.tokens,
        opened: index < opened,
        mention: queryTokens.length > 0 && containsMention(text, queryTokens),
      };
    });
    const openedFiles = files.filter(function (file) { return file.opened; });
    const openedRead = readStats(openedFiles.map(function (file) { return file.text; }));
    const mention = files.find(function (file) { return file.mention; }) || null;
    return {
      files: files,
      opened: opened,
      total: files.length,
      openedRead: openedRead,
      firstMention: mention,
      reachedMention: !!(mention && mention.opened),
    };
  }

  return {
    FILES: FILES,
    LEXICON: LEXICON,
    PRESETS: corpus.PRESETS,
    WINDOW: WINDOW,
    PASSAGES: PASSAGES,
    tokenize: tokenize,
    splitIdent: splitIdent,
    fileText: fileText,
    buildIndex: buildIndex,
    search: search,
    walk: walk,
    readStats: readStats,
  };
});
