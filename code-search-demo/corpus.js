// Fictional files for the wick job runner. Nothing here is from a real repository.
// Line breaks are the retrieval units, so the arrays are the source of truth.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WickCorpus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WINDOW = 6;

  const FILES = [
    {
      path: 'README.md',
      kind: 'doc',
      lines: [
        '# Wick',
        '',
        'Wick runs small jobs on one machine. A crash should resume the queue instead of losing a job.',
        '',
        '## Jobs',
        '',
        'A job has a name and a payload. The scheduler pulls the next job when a worker is free.',
        '',
        '## Where to look',
        '',
        'Start with the docs for operations, then the source files. The names in the source are the thing to search for.',
      ],
    },
    {
      path: 'docs/operations.md',
      kind: 'doc',
      lines: [
        '# Operations',
        '',
        '## When the disk fills',
        '',
        'The log will say "wal segment rotate failed" again and again. That line is a symptom. It does not seal a segment, and it does not open the next one.',
        '',
        'Read the warning, then look for the function that seals a segment. The warning itself never does that work.',
        '',
        '## Capacity',
        '',
        'The queue refuses a job past the limit in the config file. Retry waits are capped there too.',
        '',
        '## Tokens',
        '',
        'A session token is an opaque string. Replacing a token is a different chore from the write-ahead log, and this toy does not do it.',
      ],
    },
    {
      path: 'logs/wick.log',
      kind: 'log',
      lines: [
        '2026-10-02T03:14:01Z WARN wal segment rotate failed path=data/wal/0008 reason=disk',
        '2026-10-02T03:14:02Z WARN wal segment rotate failed path=data/wal/0008 reason=disk',
        '2026-10-02T03:14:03Z WARN wal segment rotate failed path=data/wal/0009 reason=disk',
        '2026-10-02T03:14:04Z WARN wal segment rotate failed path=data/wal/0009 reason=disk',
        '2026-10-02T03:14:05Z WARN wal segment rotate failed path=data/wal/0010 reason=disk',
        '2026-10-02T03:14:06Z WARN wal segment rotate failed path=data/wal/0010 reason=disk',
        '2026-10-02T03:14:07Z WARN wal segment rotate failed path=data/wal/0008 reason=disk',
        '2026-10-02T03:14:08Z WARN wal segment rotate failed path=data/wal/0008 reason=disk',
        '2026-10-02T03:14:09Z WARN wal segment rotate failed path=data/wal/0009 reason=disk',
        '2026-10-02T03:14:10Z WARN wal segment rotate failed path=data/wal/0009 reason=disk',
        '2026-10-02T03:14:11Z WARN wal segment rotate failed path=data/wal/0010 reason=disk',
        '2026-10-02T03:14:12Z WARN wal segment rotate failed path=data/wal/0010 reason=disk',
        '2026-10-02T03:15:01Z INFO worker idle',
        '2026-10-02T03:15:02Z INFO queue depth 4',
      ],
    },
    {
      path: 'wick.toml',
      kind: 'structured',
      lines: [
        '[runner]',
        'name = "wick"',
        'workers = 2',
        '',
        '[wal]',
        'dir = "data/wal"',
        '',
        '[queue]',
        'capacity = 32',
      ],
    },
    {
      path: 'config/limits.json',
      kind: 'structured',
      lines: [
        '{',
        '  "queueCapacity": 32,',
        '  "retryLimit": 5,',
        '  "retryBaseMs": 40',
        '}',
      ],
    },
    {
      path: 'src/wal.js',
      kind: 'code',
      lines: [
        '// Jobs are appended before they run.',
        'function openWal(dir) {',
        '  return { dir: dir, segment: 0 };',
        '}',
        '',
        'function rotateSegment(dir, segment) {',
        '  // Seal this segment and open the next wal file.',
        '  const next = segment + 1;',
        '  seal(dir, segment);',
        '  return openSegment(dir, next);',
        '}',
        '',
        'function seal(dir, id) {',
        '  return dir + "/" + id + ".sealed";',
        '}',
        '',
        'function openSegment(dir, id) {',
        '  return dir + "/" + id + ".open";',
        '}',
      ],
    },
    {
      path: 'src/retry.js',
      kind: 'code',
      lines: [
        'function scheduleRetry(attempt, baseMs) {',
        '  // Wait longer after each timeout.',
        '  const wait = baseMs * Math.pow(2, attempt);',
        '  return wait;',
        '}',
        '',
        'function giveUp(attempt, limit) {',
        '  return attempt >= limit;',
        '}',
      ],
    },
    {
      path: 'src/queue.js',
      kind: 'code',
      lines: [
        'function enqueue(queue, job, capacity) {',
        '  if (queue.length >= capacity) return false;',
        '  queue.push(job);',
        '  return true;',
        '}',
        '',
        'function dequeue(queue) {',
        '  return queue.shift();',
        '}',
      ],
    },
    {
      path: 'src/scheduler.js',
      kind: 'code',
      lines: [
        'function pullNext(queue) {',
        '  return queue.shift();',
        '}',
        '',
        'function workerFree(busy, workers) {',
        '  return busy < workers;',
        '}',
      ],
    },
    {
      path: 'src/auth.js',
      kind: 'code',
      lines: [
        '// Session checks for wick.',
        '// The write-ahead log is a different file.',
        '',
        'function acceptToken(token, now) {',
        '  if (!token) return false;',
        '  return token.exp > now;',
        '}',
      ],
    },
    {
      path: 'src/metrics.js',
      kind: 'code',
      lines: [
        'function recordLatency(samples, ms) {',
        '  samples.push(ms);',
        '  return samples;',
        '}',
      ],
    },
    {
      path: 'tests/wal.test.js',
      kind: 'code',
      lines: [
        'function testSealName() {',
        '  const name = seal("data/wal", 8);',
        '  return name.endsWith(".sealed");',
        '}',
      ],
    },
  ];

  // Hand-assigned. A word belongs to one bucket. This is the whole embedding.
  const LEXICON = [
    { id: 'wal', label: 'write-ahead log', words: ['wal', 'write', 'ahead', 'segment', 'seal', 'sealed', 'rotate', 'roll', 'rotatesegment', 'opensegment', 'openwal'] },
    { id: 'retry', label: 'retry', words: ['retry', 'timeout', 'wait', 'attempt', 'backoff', 'scheduleretry', 'giveup'] },
    { id: 'queue', label: 'queue', words: ['queue', 'job', 'worker', 'payload', 'capacity', 'enqueue', 'dequeue'] },
    { id: 'auth', label: 'session', words: ['token', 'session', 'auth', 'accepttoken', 'exp'] },
    { id: 'failure', label: 'failure', words: ['failed', 'warn', 'error', 'disk', 'reason'] },
    { id: 'config', label: 'config', words: ['limit', 'workers', 'toml', 'json', 'retrylimit', 'retrybasems', 'queuecapacity'] },
  ];

  const STOP = new Set([
    'a', 'an', 'the', 'of', 'to', 'and', 'in', 'on', 'for', 'is', 'it', 'this', 'that',
    'from', 'be', 'or', 'as', 'at', 'by', 'with', 'into', 'over', 'after', 'each',
    'when', 'how', 'do', 'we', 'does', 'not', 'then', 'than', 'its', 'are', 'was',
  ]);

  const PRESETS = [
    { id: 'rotate', query: 'rotate the wal segment' },
    { id: 'roll', query: 'roll the write-ahead log' },
    { id: 'retry', query: 'retry after a timeout' },
    { id: 'ahead', query: 'write-ahead log' },
    { id: 'token', query: 'session token' },
    { id: 'queue', query: 'queue capacity' },
  ];

  return { FILES, LEXICON, STOP, PRESETS, WINDOW };
});
