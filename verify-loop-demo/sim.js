// A toy ledger and one replica. Happy-path tests pass with the bugs still in.
// A seeded run then reorders a pair of messages, drops an ack, crashes between
// debit and credit, and jumps the replica clock. The same seed replays the
// same events. Fixes are scripted. No model is called. Nothing is fetched.
// This is not Overalls, and it is not Antithesis.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VerifyLoop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ACCOUNTS = ['Ada', 'Bo', 'Cy'];
  const START = 100;
  const OPENING = 300;
  const BUDGET = 8;

  const REMEDIES = {
    'snapshot-reorder': {
      key: 'orderedLog',
      title: 'Replicate operations in index order',
      before: 'The replica installs whichever balance snapshot arrives last.',
      after: 'The replica buffers operations and applies the next index only. A reordered pair still lands in order.',
    },
    'double-apply': {
      key: 'idempotent',
      title: 'Ignore a transfer id that already landed',
      before: 'A retry applies the transfer again, so the replica moves the money twice.',
      after: 'The replica remembers the id. A second delivery changes nothing.',
    },
    'torn-transfer': {
      key: 'atomic',
      title: 'Seal debit and credit as one record',
      before: 'The debit is written first. A crash keeps the debit and loses the credit.',
      after: 'Debit and credit are one record. A crash before it is sealed leaves both accounts as they were.',
    },
    'stale-read': {
      key: 'indexRead',
      title: 'Read the longer log, not the faster clock',
      before: 'The read picks the node with the higher clock. A skewed replica clock hides a missing commit.',
      after: 'The read picks the node with the higher log index. The clock is not a version.',
    },
  };

  const INVARIANTS = [
    { id: 'snapshot-reorder', text: 'After the network drains, the replica matches the primary.' },
    { id: 'double-apply', text: 'Each transfer id is applied once.' },
    { id: 'torn-transfer', text: 'Balances sum to the opening 300.' },
    { id: 'stale-read', text: 'A read after a commit returns the committed balance.' },
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function normalizeFixes(fixes) {
    return {
      orderedLog: !!(fixes && fixes.orderedLog),
      idempotent: !!(fixes && fixes.idempotent),
      atomic: !!(fixes && fixes.atomic),
      indexRead: !!(fixes && fixes.indexRead),
    };
  }

  function balances() {
    return { Ada: START, Bo: START, Cy: START };
  }

  function copyBal(bal) {
    return { Ada: bal.Ada, Bo: bal.Bo, Cy: bal.Cy };
  }

  function same(a, b) {
    return a.Ada === b.Ada && a.Bo === b.Bo && a.Cy === b.Cy;
  }

  function sumBal(bal) {
    return bal.Ada + bal.Bo + bal.Cy;
  }

  function fmt(bal) {
    return 'Ada ' + bal.Ada + ', Bo ' + bal.Bo + ', Cy ' + bal.Cy;
  }

  function create() {
    return {
      primary: { bal: balances(), index: 0, clock: 0, log: [], seen: {}, alive: true },
      replica: { bal: balances(), index: 0, clock: 0, log: [], seen: {}, alive: true, buffer: [] },
      net: [],
      sent: [],
      nextSeq: 1,
    };
  }

  function cloneMsg(msg) {
    if (msg.kind === 'snapshot') {
      return {
        kind: 'snapshot',
        index: msg.index,
        id: msg.id,
        clock: msg.clock,
        bal: copyBal(msg.bal),
      };
    }
    return {
      kind: 'op',
      id: msg.id,
      from: msg.from,
      to: msg.to,
      amount: msg.amount,
      index: msg.index,
    };
  }

  function send(world, msg) {
    const item = { seq: world.nextSeq, msg: cloneMsg(msg) };
    world.nextSeq += 1;
    world.net.push(item);
    world.sent.push(item);
    return item;
  }

  function commitOp(world, tx, fixes, log) {
    const primary = world.primary;
    if (primary.bal[tx.from] < tx.amount) {
      log({
        kind: 'reject',
        tone: 'work',
        text: tx.id + ' rejected: ' + tx.from + ' has ' + primary.bal[tx.from] + '.',
      });
      return false;
    }
    primary.bal[tx.from] -= tx.amount;
    primary.bal[tx.to] += tx.amount;
    primary.index += 1;
    primary.clock += 1;
    primary.seen[tx.id] = (primary.seen[tx.id] || 0) + 1;
    primary.log.push(tx.id);
    if (fixes.orderedLog) {
      send(world, {
        kind: 'op',
        id: tx.id,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        index: primary.index,
      });
      log({
        kind: 'commit',
        tone: 'work',
        text: 'Commit ' + tx.id + ': ' + tx.from + ' sends ' + tx.amount + ' to ' + tx.to + '. Op ' + primary.index + ' is on the wire.',
      });
    } else {
      send(world, {
        kind: 'snapshot',
        index: primary.index,
        id: tx.id,
        clock: primary.clock,
        bal: copyBal(primary.bal),
      });
      log({
        kind: 'commit',
        tone: 'work',
        text: 'Commit ' + tx.id + ': ' + tx.from + ' sends ' + tx.amount + ' to ' + tx.to + '. Snapshot ' + primary.index + ' is on the wire (' + fmt(primary.bal) + ').',
      });
    }
    return true;
  }

  function applyOp(replica, msg) {
    replica.bal[msg.from] -= msg.amount;
    replica.bal[msg.to] += msg.amount;
    replica.seen[msg.id] = (replica.seen[msg.id] || 0) + 1;
    replica.clock += 1;
  }

  function deliverOne(world, item, fixes, log) {
    const msg = item.msg;
    const replica = world.replica;
    if (!replica.alive) {
      log({ kind: 'deliver', tone: 'fault', text: 'Message ' + item.seq + ' arrived. The replica is down, so it is lost.' });
      return;
    }
    if (msg.kind === 'snapshot') {
      replica.bal = copyBal(msg.bal);
      replica.index = msg.index;
      replica.clock += 1;
      replica.log.push(msg.id);
      log({
        kind: 'deliver',
        tone: 'work',
        text: 'Replica installs snapshot ' + msg.index + ' for ' + msg.id + ' (' + fmt(replica.bal) + ').',
      });
      return;
    }
    if (msg.index <= replica.index) {
      if (fixes.idempotent) {
        log({
          kind: 'deliver',
          tone: 'ok',
          text: 'Replica already applied ' + msg.id + ' at index ' + msg.index + '. The retry does nothing.',
        });
        return;
      }
      applyOp(replica, msg);
      log({
        kind: 'deliver',
        tone: 'fault',
        text: 'Replica applies ' + msg.id + ' again. ' + msg.from + ' is ' + replica.bal[msg.from] + ', ' + msg.to + ' is ' + replica.bal[msg.to] + '.',
      });
      return;
    }
    replica.buffer.push(msg);
    replica.buffer.sort(function (a, b) { return a.index - b.index; });
    while (replica.buffer.length && replica.buffer[0].index === replica.index + 1) {
      const op = replica.buffer.shift();
      applyOp(replica, op);
      replica.index = op.index;
      replica.log.push(op.id);
      log({
        kind: 'deliver',
        tone: 'work',
        text: 'Replica applies op ' + op.index + ' ' + op.id + ': ' + op.from + ' sends ' + op.amount + ' to ' + op.to + ' (' + fmt(replica.bal) + ').',
      });
    }
    if (replica.buffer.length) {
      log({
        kind: 'deliver',
        tone: 'work',
        text: 'Replica holds index ' + replica.buffer[0].index + ' until ' + (replica.index + 1) + ' arrives.',
      });
    }
  }

  function deliverAll(world, fixes, log) {
    while (world.net.length) deliverOne(world, world.net.shift(), fixes, log);
  }

  function reorderLastTwo(world, log) {
    const n = world.net.length;
    const later = world.net[n - 1];
    const earlier = world.net[n - 2];
    world.net[n - 2] = later;
    world.net[n - 1] = earlier;
    log({
      kind: 'reorder',
      tone: 'fault',
      text: 'Reorder: message ' + later.seq + ' (' + later.msg.id + ') will arrive before message ' + earlier.seq + ' (' + earlier.msg.id + ').',
    });
  }

  function retryLast(world, log) {
    const prev = world.sent[world.sent.length - 1];
    log({
      kind: 'drop',
      tone: 'fault',
      text: 'The ack for ' + prev.msg.id + ' is dropped. Primary sends ' + prev.msg.id + ' again.',
    });
    send(world, prev.msg);
  }

  function checkMatch(world, bug, log, fail) {
    if (same(world.primary.bal, world.replica.bal)) {
      log({ kind: 'check', tone: 'ok', text: 'Replica matches primary (' + fmt(world.primary.bal) + ').' });
      return;
    }
    log({
      kind: 'check',
      tone: 'bad',
      text: 'Invariant fails: replica (' + fmt(world.replica.bal) + ') does not match primary (' + fmt(world.primary.bal) + ').',
    });
    fail(
      bug,
      'after the network drains, the replica matches the primary',
      'Replica is ' + fmt(world.replica.bal) + '. Primary is ' + fmt(world.primary.bal) + '.'
    );
  }

  function checkOnce(world, tx, log, fail) {
    const times = world.replica.seen[tx.id] || 0;
    const match = same(world.primary.bal, world.replica.bal);
    if (times === 1 && match) {
      log({
        kind: 'check',
        tone: 'ok',
        text: tx.id + ' is on the replica once. Balances match (' + fmt(world.primary.bal) + ').',
      });
      return;
    }
    log({
      kind: 'check',
      tone: 'bad',
      text: 'Invariant fails: ' + tx.id + ' is on the replica ' + times + ' times. Replica (' + fmt(world.replica.bal) + '). Primary (' + fmt(world.primary.bal) + ').',
    });
    fail(
      'double-apply',
      'each transfer id is applied once, and the replica matches the primary',
      tx.id + ' landed ' + times + ' times on the replica. Replica is ' + fmt(world.replica.bal) + '. Primary is ' + fmt(world.primary.bal) + '.'
    );
  }

  function tear(world, tx, fixes, log, fail) {
    const primary = world.primary;
    if (fixes.atomic) {
      log({
        kind: 'stage',
        tone: 'work',
        text: 'Stage ' + tx.id + ' as one record: ' + tx.from + ' sends ' + tx.amount + ' to ' + tx.to + '. The record is not sealed.',
      });
      log({ kind: 'crash', tone: 'fault', text: 'Primary crashes before the record is sealed.' });
      log({
        kind: 'restart',
        tone: 'ok',
        text: 'Primary restarts. ' + tx.id + ' is absent. Balances are ' + fmt(primary.bal) + '. Sum is ' + sumBal(primary.bal) + '.',
      });
    } else {
      primary.bal[tx.from] -= tx.amount;
      primary.log.push(tx.id + ':debit');
      primary.clock += 1;
      log({
        kind: 'debit',
        tone: 'fault',
        text: 'Debit ' + tx.id + ': ' + tx.from + ' loses ' + tx.amount + '. ' + tx.to + ' is not credited. Balances are ' + fmt(primary.bal) + '.',
      });
      log({ kind: 'crash', tone: 'fault', text: 'Primary crashes between the debit and the credit.' });
      log({
        kind: 'restart',
        tone: 'fault',
        text: 'Primary restarts from the log. The debit remains. Sum is ' + sumBal(primary.bal) + '.',
      });
    }
    const sum = sumBal(primary.bal);
    if (sum !== OPENING) {
      log({ kind: 'check', tone: 'bad', text: 'Invariant fails: the books sum to ' + sum + ', not ' + OPENING + '.' });
      fail(
        'torn-transfer',
        'balances sum to the opening 300',
        'Primary sums to ' + sum + '. ' + tx.from + ' was debited and ' + tx.to + ' was never credited.'
      );
    } else {
      log({ kind: 'check', tone: 'ok', text: 'Books sum to ' + OPENING + '.' });
    }
  }

  function choose(world, fixes) {
    const primary = world.primary;
    const replica = world.replica;
    if (!replica.alive) return { name: 'primary', node: primary, why: 'the replica is down' };
    if (fixes.indexRead) {
      if (replica.index > primary.index) return { name: 'replica', node: replica, why: 'it has the longer log' };
      return { name: 'primary', node: primary, why: 'the primary log is at least as long' };
    }
    if (replica.clock > primary.clock) return { name: 'replica', node: replica, why: 'its clock is ahead' };
    return { name: 'primary', node: primary, why: 'its clock is not behind' };
  }

  function stale(world, tx, skew, fixes, log, fail) {
    commitOp(world, tx, fixes, log);
    log({
      kind: 'hold',
      tone: 'fault',
      text: 'The replica message for ' + tx.id + ' stays on the wire (' + world.net.length + ' undelivered).',
    });
    world.replica.clock += skew;
    log({
      kind: 'skew',
      tone: 'fault',
      text: 'Replica clock jumps by ' + skew + ' to ' + world.replica.clock + '. Primary clock is ' + world.primary.clock + '. Replica index is ' + world.replica.index + '. Primary index is ' + world.primary.index + '.',
    });
    const choice = choose(world, fixes);
    const actual = choice.node.bal[tx.to];
    const expected = world.primary.bal[tx.to];
    log({
      kind: 'read',
      tone: actual === expected ? 'ok' : 'bad',
      text: 'Read ' + tx.to + ' from ' + choice.name + '. Clock ' + choice.node.clock + ', index ' + choice.node.index + '. Value ' + actual + '. Primary has ' + expected + '. ' + choice.why + '.',
    });
    if (actual !== expected) {
      fail(
        'stale-read',
        'a read after a commit returns the committed balance',
        'The read used ' + choice.name + ' because ' + choice.why + '. ' + tx.to + ' came back ' + actual + '. Primary committed ' + tx.id + ' and has ' + expected + '.'
      );
    }
  }

  function scenario(seed) {
    const rng = mulberry32(seed >>> 0);
    function party(id) {
      const from = ACCOUNTS[Math.floor(rng() * 3)];
      let to = ACCOUNTS[Math.floor(rng() * 3)];
      if (to === from) to = ACCOUNTS[(ACCOUNTS.indexOf(from) + 1) % 3];
      return { id: id, from: from, to: to, amount: 10 };
    }
    return {
      t1: party('t1'),
      t2: party('t2'),
      t3: party('t3'),
      t4: party('t4'),
      t5: party('t5'),
      t6: party('t6'),
      skew: 40 + Math.floor(rng() * 50),
    };
  }

  function hashRun(events, violation) {
    const lines = events.map(function (event) {
      return event.kind + '|' + event.tone + '|' + event.text;
    });
    lines.push(violation ? '!' + violation.bug + '|' + violation.invariant + '|' + violation.detail : 'clean');
    const text = lines.join('\n');
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  }

  function runSeed(seed, fixes) {
    const fx = normalizeFixes(fixes);
    const spec = scenario(seed >>> 0);
    const world = create();
    const events = [];
    let violation = null;

    function log(entry) {
      events.push({ i: events.length, kind: entry.kind, tone: entry.tone, text: entry.text });
    }
    function fail(bug, invariant, detail) {
      if (violation) return;
      violation = { bug: bug, invariant: invariant, detail: detail, at: events.length - 1 };
    }

    commitOp(world, spec.t1, fx, log);
    deliverAll(world, fx, log);
    checkMatch(world, 'setup', log, fail);

    if (!violation) {
      commitOp(world, spec.t2, fx, log);
      commitOp(world, spec.t3, fx, log);
      reorderLastTwo(world, log);
      deliverAll(world, fx, log);
      checkMatch(world, 'snapshot-reorder', log, fail);
    }
    if (!violation) {
      commitOp(world, spec.t4, fx, log);
      deliverAll(world, fx, log);
      retryLast(world, log);
      deliverAll(world, fx, log);
      checkOnce(world, spec.t4, log, fail);
    }
    if (!violation) {
      tear(world, spec.t5, fx, log, fail);
    }
    if (!violation) {
      stale(world, spec.t6, spec.skew, fx, log, fail);
    }

    return {
      seed: seed >>> 0,
      ok: !violation,
      violation: violation,
      events: events,
      hash: hashRun(events, violation),
      spec: spec,
    };
  }

  function discover(fixes, budget) {
    const n = budget || BUDGET;
    const fx = normalizeFixes(fixes);
    const runs = [];
    let first = null;
    for (let seed = 1; seed <= n; seed += 1) {
      const run = runSeed(seed, fx);
      runs.push(run);
      if (!run.ok && !first) first = run;
    }
    return { ok: !first, budget: n, fixes: fx, runs: runs, first: first };
  }

  function rectifyLoop(budget) {
    let fixes = normalizeFixes(null);
    const rounds = [];
    for (let i = 0; i < 6; i += 1) {
      const found = discover(fixes, budget || BUDGET);
      if (found.ok) return { ok: true, rounds: rounds, fixes: fixes, discover: found };
      const bug = found.first.violation.bug;
      const remedy = REMEDIES[bug];
      if (!remedy) return { ok: false, rounds: rounds, fixes: fixes, discover: found };
      rounds.push({
        bug: bug,
        seed: found.first.seed,
        hash: found.first.hash,
        key: remedy.key,
        title: remedy.title,
      });
      const next = Object.assign({}, fixes);
      next[remedy.key] = true;
      fixes = normalizeFixes(next);
    }
    return { ok: false, rounds: rounds, fixes: fixes };
  }

  function unitTests(fixes) {
    const fx = normalizeFixes(fixes);
    const tests = [];

    const moved = create();
    commitOp(moved, { id: 'h1', from: 'Ada', to: 'Bo', amount: 25 }, fx, function () {});
    deliverAll(moved, fx, function () {});
    tests.push({
      name: 'A transfer moves money from one account to the other',
      pass: moved.primary.bal.Ada === 75 && moved.primary.bal.Bo === 125 && same(moved.primary.bal, moved.replica.bal),
      detail: 'Ada 75, Bo 125, Cy 100. The replica matches.',
    });

    const books = create();
    [
      { id: 'a', from: 'Ada', to: 'Bo', amount: 10 },
      { id: 'b', from: 'Bo', to: 'Cy', amount: 15 },
      { id: 'c', from: 'Cy', to: 'Ada', amount: 5 },
    ].forEach(function (tx) {
      commitOp(books, tx, fx, function () {});
      deliverAll(books, fx, function () {});
    });
    tests.push({
      name: 'Three transfers keep the books at 300',
      pass: sumBal(books.primary.bal) === OPENING && same(books.primary.bal, books.replica.bal),
      detail: fmt(books.primary.bal) + '. Sum ' + sumBal(books.primary.bal) + '.',
    });

    const rich = create();
    const before = copyBal(rich.primary.bal);
    commitOp(rich, { id: 'big', from: 'Ada', to: 'Bo', amount: 500 }, fx, function () {});
    tests.push({
      name: 'A transfer larger than the balance is rejected',
      pass: same(rich.primary.bal, before) && rich.net.length === 0,
      detail: 'Ada stays at 100. Nothing is sent.',
    });

    const read = create();
    commitOp(read, { id: 'h2', from: 'Cy', to: 'Ada', amount: 30 }, fx, function () {});
    deliverAll(read, fx, function () {});
    const choice = choose(read, fx);
    tests.push({
      name: 'A read with no clock skew sees the committed balance',
      pass: choice.name === 'primary' && choice.node.bal.Ada === 130,
      detail: 'Read Ada from ' + choice.name + ': ' + choice.node.bal.Ada + '.',
    });

    return {
      loaded: true,
      ok: tests.every(function (item) { return item.pass; }),
      note: 'There is no compiler in this page. These four checks are the happy path. They do not inject faults.',
      tests: tests,
    };
  }

  function fixList(fixes) {
    const fx = normalizeFixes(fixes);
    return [
      ['orderedLog', 'ordered log'],
      ['idempotent', 'idempotent ids'],
      ['atomic', 'atomic record'],
      ['indexRead', 'index read'],
    ].filter(function (pair) { return fx[pair[0]]; }).map(function (pair) { return pair[1]; });
  }

  return {
    ACCOUNTS: ACCOUNTS,
    START: START,
    OPENING: OPENING,
    BUDGET: BUDGET,
    REMEDIES: REMEDIES,
    INVARIANTS: INVARIANTS,
    normalizeFixes: normalizeFixes,
    scenario: scenario,
    runSeed: runSeed,
    discover: discover,
    rectifyLoop: rectifyLoop,
    unitTests: unitTests,
    fixList: fixList,
    hashRun: hashRun,
  };
});
