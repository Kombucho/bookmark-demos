// A scripted week of a knowledge factory. Northline, the people, the
// warehouse names, and the figures are fictional. No model is called.
//
// Workers may flag a stale card. In "curator" mode only the night curator
// rewrites the store. In "self" mode each worker also appends a card, and
// the old card stays, so the same fact can disagree with itself.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KnowledgeFactory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SHELVES = [
    { id: 'skills', name: 'Skills', line: 'How to do the work' },
    { id: 'domain', name: 'Domain knowledge', line: 'How the business works' },
    { id: 'data', name: 'Data access', line: 'Where current data lives, and how to query it' },
  ];

  const FACTS = [
    {
      id: 'bq.column',
      shelf: 'data',
      title: 'Where revenue rows live',
      seed: 'Query BigQuery finance.revenue_daily. The amount column is amount_usd. The account id is account_id.',
      changes: [
        { day: 1, body: 'Query BigQuery finance.revenue_daily. The amount column is net_amount_usd. The account id is account_id.' },
      ],
      hedge: 'If a query fails, try amount_usd, then net_amount_usd, then booked_usd.',
      learn: 'source',
      task: 'revenue',
      note: 'The card still names amount_usd. The warehouse changelog renamed that column to net_amount_usd.',
      source: {
        id: 'changelog',
        day: 1,
        kind: 'Warehouse changelog',
        text: 'finance.revenue_daily.amount_usd was renamed to net_amount_usd. Fictional changelog.',
      },
      human: null,
    },
    {
      id: 'report.header',
      shelf: 'skills',
      title: 'Revenue report style',
      seed: 'Revenue reports use the header "Northline revenue". Amounts are plain numbers.',
      changes: [
        { day: 1, body: 'Revenue reports use the header "Northline — Monthly revenue". Amounts use thousands separators.' },
      ],
      hedge: 'The header is "Northline revenue" unless a draft already says otherwise.',
      learn: 'human',
      task: 'revenue',
      note: '',
      source: null,
      human: {
        day: 1,
        task: 'revenue',
        speaker: 'Mara Chen',
        role: 'finance lead',
        text: 'Use the header "Northline — Monthly revenue", and put thousands separators on the amounts.',
      },
    },
    {
      id: 'arr.rule',
      shelf: 'domain',
      title: 'How ARR is calculated',
      seed: 'ARR is the sum of active annual contracts. Monthly plans count as twelve times the monthly price. Trials are excluded. Pilots are excluded until they convert.',
      changes: [
        { day: 3, body: 'ARR is the sum of active annual contracts. Monthly plans count as twelve times the monthly price. Trials are excluded. Pilot contracts count at half until they convert.' },
      ],
      hedge: 'Pilots are excluded, the same as trials. Do not count a pilot at half.',
      learn: 'source',
      task: 'revenue',
      note: 'The card still excludes pilots. The finance note counts a pilot at half until it converts.',
      source: {
        id: 'policy',
        day: 3,
        kind: 'Finance policy note',
        text: 'Pilot contracts count at half of ARR until they convert. Trials stay excluded. Fictional note.',
      },
      human: {
        day: 3,
        task: 'revenue',
        speaker: 'Mara Chen',
        role: 'finance lead',
        text: 'Pilots count at half until they convert. I changed the footnote on this report.',
      },
    },
    {
      id: 'outbound.script',
      shelf: 'skills',
      title: 'Outbound email',
      seed: 'Greet by first name, mention the launch discount in the first line, one ask, sign as Northline Sales.',
      changes: [
        { day: 4, body: 'Greet by first name, do not mention a discount in the first email, one ask, sign as Northline Sales.' },
      ],
      hedge: 'Mention the launch discount in the first line. A later note said not to, but the skill still leads with it.',
      learn: 'source',
      task: 'outbound',
      note: 'The skill still leads with the launch discount. The sales note says the first email must not.',
      source: {
        id: 'sales',
        day: 4,
        kind: 'Sales note',
        text: 'First outbound emails do not mention a discount. The discount waits for the second note. Fictional note.',
      },
      human: {
        day: 4,
        task: 'outbound',
        speaker: 'Ivo Park',
        role: 'sales lead',
        text: 'Take the discount out of the first email. That line is for the second note.',
      },
    },
    {
      id: 'launch.script',
      shelf: 'skills',
      title: 'Launch post',
      seed: 'Lead with Atlas, one sentence on who it is for, end with https://docs.northline.example/launch.',
      changes: [
        { day: 5, body: 'Lead with Atlas, one sentence on who it is for, end with https://docs.northline.example/atlas.' },
      ],
      hedge: 'End with https://docs.northline.example/launch. The /atlas path is only an alias.',
      learn: 'source',
      task: 'launch',
      note: 'The skill still ends at /launch. The docs note moved the page to /atlas.',
      source: {
        id: 'docs',
        day: 5,
        kind: 'Docs move',
        text: 'The Atlas docs URL is now https://docs.northline.example/atlas. Fictional note.',
      },
      human: null,
    },
    {
      id: 'segment.studio',
      shelf: 'domain',
      title: 'Studio segment',
      seed: 'Studio accounts are those with under 50 seats. Fleet is everyone else.',
      changes: [
        { day: 6, body: 'Studio accounts are those with under 20 seats. Fleet is everyone else.' },
      ],
      hedge: 'Studio is under 50 seats. A note about 20 seats is unofficial.',
      learn: 'source',
      task: 'outbound',
      note: 'The card still says Studio is under 50 seats. Planning moved the line to 20.',
      source: {
        id: 'planning',
        day: 6,
        kind: 'Planning note',
        text: 'Studio is under 20 seats, not 50. Fleet starts at 20. Fictional note.',
      },
      human: {
        day: 6,
        task: 'outbound',
        speaker: 'Ivo Park',
        role: 'sales lead',
        text: 'Studio is under 20 seats now. Fleet starts at 20.',
      },
    },
  ];

  const TASKS = [
    {
      id: 'revenue',
      name: 'Revenue report',
      agent: 'Lumen',
      facts: ['bq.column', 'report.header', 'arr.rule'],
      context: {
        kind: 'table',
        caption: 'Fictional rows for March, in front of the agent for this run only.',
        columns: ['Account', 'Seats', 'Amount'],
        rows: [
          ['Harbor & Co', '40', '12000'],
          ['Kite Studio', '12', '3600'],
          ['Fleet North', '210', '84000'],
        ],
      },
    },
    {
      id: 'outbound',
      name: 'Outbound email',
      agent: 'Harbor',
      facts: ['outbound.script', 'segment.studio'],
      context: {
        kind: 'note',
        caption: 'Fictional contact. Nothing is sent.',
        text: 'To Sam Keene at Kite Studio, 12 seats.',
      },
    },
    {
      id: 'launch',
      name: 'Launch post',
      agent: 'Quill',
      facts: ['launch.script'],
      context: {
        kind: 'note',
        caption: 'Fictional product. The URL is an example.',
        text: 'Atlas, for Studio teams.',
      },
    },
  ];

  const SOURCES = FACTS.filter(function (fact) { return fact.source; }).map(function (fact) {
    return {
      id: fact.source.id,
      day: fact.source.day,
      kind: fact.source.kind,
      text: fact.source.text,
      fact: fact.id,
    };
  });

  const factById = Object.create(null);
  FACTS.forEach(function (fact) { factById[fact.id] = fact; });
  const taskById = Object.create(null);
  TASKS.forEach(function (task) { taskById[task.id] = task; });

  function clone(value) {
    return structuredClone(value);
  }

  function assertMode(mode) {
    if (mode !== 'curator' && mode !== 'self') throw new Error('unknown mode ' + mode);
  }

  function createState(mode) {
    assertMode(mode);
    return {
      mode: mode,
      day: 1,
      phase: 'morning',
      cards: FACTS.map(function (fact, index) {
        return {
          id: fact.id,
          fact: fact.id,
          shelf: fact.shelf,
          title: fact.title,
          body: fact.seed,
          origin: 'seed',
          day: 0,
          seq: index,
          retired: false,
          kind: 'seed',
        };
      }),
      flags: [],
      traces: [],
    };
  }

  function activeCards(cards, factId) {
    return cards.filter(function (card) {
      return card.fact === factId && !card.retired;
    }).slice().sort(function (a, b) { return a.seq - b.seq; });
  }

  function truthBody(factId, day) {
    const fact = factById[factId];
    if (!fact) throw new Error('unknown fact ' + factId);
    let body = fact.seed;
    fact.changes.forEach(function (change) {
      if (change.day <= day) body = change.body;
    });
    return body;
  }

  function changesToday(fact, day) {
    return fact.changes.some(function (change) { return change.day === day; });
  }

  function contradictionCount(cards) {
    const groups = Object.create(null);
    cards.forEach(function (card) {
      if (card.retired) return;
      if (!groups[card.fact]) groups[card.fact] = [];
      groups[card.fact].push(card.body);
    });
    let extras = 0;
    Object.keys(groups).forEach(function (factId) {
      const distinct = Object.create(null);
      groups[factId].forEach(function (body) { distinct[body] = true; });
      const kinds = Object.keys(distinct).length;
      if (kinds > 1) extras += groups[factId].length - 1;
    });
    return extras;
  }

  function appendCard(cards, fact, body, day, kind) {
    const exists = cards.some(function (card) {
      return card.fact === fact.id && !card.retired && card.body === body;
    });
    if (exists) return null;
    let seq = 0;
    cards.forEach(function (card) { if (card.seq >= seq) seq = card.seq + 1; });
    const card = {
      id: fact.id + '.' + kind + day,
      fact: fact.id,
      shelf: fact.shelf,
      title: fact.title,
      body: body,
      origin: 'agent',
      day: day,
      seq: seq,
      retired: false,
      kind: kind,
    };
    cards.push(card);
    return card;
  }

  function diffWords(before, after) {
    const a = String(before).split(' ');
    const b = String(after).split(' ');
    const n = a.length;
    const m = b.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        out.push({ type: 'same', text: a[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({ type: 'del', text: a[i] });
        i += 1;
      } else {
        out.push({ type: 'add', text: b[j] });
        j += 1;
      }
    }
    while (i < n) out.push({ type: 'del', text: a[i++] });
    while (j < m) out.push({ type: 'add', text: b[j++] });
    return out;
  }

  function columnName(body) {
    const match = String(body).match(/column is ([a-z0-9_]+)/i);
    return match ? match[1] : '';
  }

  function headerName(body) {
    const match = String(body).match(/header "([^"]+)"/);
    return match ? match[1] : '';
  }

  function outboundSent(scriptBody) {
    if (/do not mention a discount/i.test(scriptBody)) {
      return 'Hello Sam. Can we book 15 minutes this week?';
    }
    return 'Hello Sam. The launch discount is 20% this week. Can we book 15 minutes?';
  }

  function launchUrl(scriptBody) {
    const match = String(scriptBody).match(/https:\/\/\S+/);
    return match ? match[0].replace(/[.,]$/, '') : '';
  }

  function advance(state) {
    if (state.day >= 7) return { day: 7, phase: 'week-done' };
    return { day: state.day + 1, phase: 'morning' };
  }

  function runDay(state) {
    if (!state || state.phase !== 'morning') throw new Error('run the morning, not a day that already ran');
    assertMode(state.mode);
    const day = state.day;
    const cards = clone(state.cards);
    const flags = clone(state.flags);
    const traces = clone(state.traces);
    const steps = [];
    const results = [];
    let opened = 0;

    TASKS.forEach(function (task) {
      steps.push({
        type: 'task-start',
        taskId: task.id,
        name: task.name,
        agent: task.agent,
        context: task.context,
      });
      const used = [];
      let ok = true;

      task.facts.forEach(function (factId) {
        const fact = factById[factId];
        const truth = truthBody(factId, day);
        const list = activeCards(cards, factId);
        const today = changesToday(fact, day);
        const discover = today && fact.learn === 'source';
        let card;
        let body;
        let via;

        if (discover) {
          card = list[0];
          body = truth;
          via = 'source';
          steps.push({
            type: 'consult',
            taskId: task.id,
            fact: factId,
            title: fact.title,
            cardId: card.id,
            body: card.body,
            matched: card.body === truth,
            index: 0,
            count: list.length,
          });
          steps.push({
            type: 'discover',
            taskId: task.id,
            fact: factId,
            sourceId: fact.source.id,
            kind: fact.source.kind,
            text: fact.source.text,
          });
          const flag = {
            id: 'f' + day + '-' + factId,
            day: day,
            taskId: task.id,
            fact: factId,
            cardId: card.id,
            title: fact.title,
            note: fact.note,
            suggested: truth,
            open: true,
          };
          flags.push(flag);
          opened += 1;
          steps.push({ type: 'flag', flag: clone(flag) });
          if (state.mode === 'self') {
            const written = appendCard(cards, fact, truth, day, 'found');
            if (written) steps.push({ type: 'write', card: clone(written), agent: task.agent });
          }
        } else {
          const index = state.mode === 'self' ? day % list.length : 0;
          card = list[index];
          body = card.body;
          via = 'shelf';
          steps.push({
            type: 'consult',
            taskId: task.id,
            fact: factId,
            title: fact.title,
            cardId: card.id,
            body: body,
            matched: body === truth,
            index: index,
            count: list.length,
          });
        }

        if (fact.human && fact.human.day === day && fact.human.task === task.id) {
          const trace = {
            id: 't' + day + '-' + factId,
            day: day,
            taskId: task.id,
            fact: factId,
            speaker: fact.human.speaker,
            role: fact.human.role,
            text: fact.human.text,
          };
          traces.push(trace);
          steps.push({ type: 'human', trace: clone(trace) });
          body = truth;
          via = via === 'source' ? 'source' : 'human';
          if (state.mode === 'self') {
            const written = appendCard(cards, fact, truth, day, 'found');
            if (written) steps.push({ type: 'write', card: clone(written), agent: task.agent });
          }
        }

        if (state.mode === 'self' && body !== truth) {
          const written = appendCard(cards, fact, fact.hedge, day, 'hedge');
          if (written) steps.push({ type: 'write', card: clone(written), agent: task.agent });
        }

        const factOk = body === truth;
        if (!factOk) ok = false;
        used.push({
          fact: factId,
          title: fact.title,
          cardId: card.id,
          body: body,
          ok: factOk,
          via: via,
        });
      });

      steps.push({ type: 'task-end', taskId: task.id, name: task.name, agent: task.agent, success: ok, used: used });
      results.push({ taskId: task.id, name: task.name, agent: task.agent, success: ok, used: used });
    });

    const finished = results.filter(function (result) { return result.success; }).length;
    const next = {
      mode: state.mode,
      day: day,
      phase: 'day-done',
      cards: cards,
      flags: flags,
      traces: traces,
    };
    return {
      state: next,
      steps: steps,
      summary: {
        day: day,
        finished: finished,
        tasks: TASKS.length,
        success: finished / TASKS.length,
        flags: opened,
        contradictions: contradictionCount(cards),
        openFlags: flags.filter(function (flag) { return flag.open; }).length,
        results: results,
      },
    };
  }

  function runNight(state) {
    if (!state || state.phase !== 'day-done') throw new Error('the day has to finish before the night run');
    assertMode(state.mode);
    const day = state.day;
    const moved = advance(state);

    if (state.mode === 'self') {
      const next = {
        mode: state.mode,
        day: moved.day,
        phase: moved.phase,
        cards: clone(state.cards),
        flags: clone(state.flags),
        traces: clone(state.traces),
      };
      return {
        state: next,
        steps: [{
          type: 'idle',
          text: 'Night passes. No curator runs, so every card the agents added is still on the shelf.',
        }],
        summary: {
          day: day,
          contradictions: contradictionCount(next.cards),
          openFlags: next.flags.filter(function (flag) { return flag.open; }).length,
          diffs: 0,
        },
      };
    }

    const cards = clone(state.cards);
    const flags = clone(state.flags);
    const traces = clone(state.traces);
    const steps = [];
    const factsToFix = [];
    const seen = Object.create(null);

    function mark(factId) {
      if (!factId || seen[factId]) return;
      seen[factId] = true;
      factsToFix.push(factId);
    }

    flags.forEach(function (flag) {
      if (!flag.open) return;
      steps.push({
        type: 'read-flag',
        id: flag.id,
        fact: flag.fact,
        title: flag.title,
        note: flag.note,
      });
      mark(flag.fact);
    });
    traces.forEach(function (trace) {
      if (trace.day !== day) return;
      steps.push({
        type: 'read-trace',
        id: trace.id,
        fact: trace.fact,
        speaker: trace.speaker,
        role: trace.role,
        text: trace.text,
      });
      mark(trace.fact);
    });
    SOURCES.forEach(function (source) {
      if (source.day !== day) return;
      steps.push({
        type: 'read-source',
        id: source.id,
        fact: source.fact,
        kind: source.kind,
        text: source.text,
      });
      mark(source.fact);
    });

    let diffs = 0;
    factsToFix.forEach(function (factId) {
      const fact = factById[factId];
      const truth = truthBody(factId, day);
      const list = activeCards(cards, factId);
      const canonical = list[0];
      if (canonical && canonical.body !== truth) {
        steps.push({
          type: 'diff',
          cardId: canonical.id,
          fact: factId,
          title: fact.title,
          shelf: fact.shelf,
          before: canonical.body,
          after: truth,
          words: diffWords(canonical.body, truth),
        });
        canonical.body = truth;
        canonical.origin = 'curator';
        canonical.day = day;
        canonical.kind = 'curator';
        diffs += 1;
      }
      list.slice(1).forEach(function (card) { card.retired = true; });
    });

    flags.forEach(function (flag) {
      if (!flag.open || !seen[flag.fact]) return;
      flag.open = false;
      steps.push({ type: 'close-flag', id: flag.id, fact: flag.fact, title: flag.title });
    });

    if (!diffs && !factsToFix.length) {
      steps.push({ type: 'quiet', text: 'Nothing new in the flags, the traces, or the raw notes. The store stays as it is.' });
    }

    const next = {
      mode: 'curator',
      day: moved.day,
      phase: moved.phase,
      cards: cards,
      flags: flags,
      traces: traces,
    };
    return {
      state: next,
      steps: steps,
      summary: {
        day: day,
        contradictions: contradictionCount(cards),
        openFlags: flags.filter(function (flag) { return flag.open; }).length,
        diffs: diffs,
      },
    };
  }

  function simulateWeek(mode) {
    assertMode(mode);
    let state = createState(mode);
    const points = [];
    for (let guard = 0; guard < 7; guard++) {
      const day = runDay(state);
      const night = runNight(day.state);
      points.push({
        day: day.summary.day,
        success: day.summary.success,
        finished: day.summary.finished,
        tasks: day.summary.tasks,
        flags: day.summary.flags,
        contradictions: night.summary.contradictions,
        openFlags: night.summary.openFlags,
      });
      state = night.state;
    }
    return points;
  }

  function chartBlurb(curator, self) {
    const curatorContradictions = curator[curator.length - 1].contradictions;
    const last = self[self.length - 1];
    const selfMisses = self.filter(function (point) { return point.success < 1; }).length;
    let line = 'With a curator, contradictions end at ' + curatorContradictions + '. When agents edit the store, they end at ' + last.contradictions + ', and ' + selfMisses + ' of the 7 days finish under 100%.';
    if (last.success === 1 && last.contradictions > 0) {
      line += ' A later day can still finish every task, when the pick lands on the newer card. The older cards stay on the shelf.';
    }
    return line;
  }

  return {
    SHELVES: SHELVES,
    FACTS: FACTS,
    TASKS: TASKS,
    SOURCES: SOURCES,
    createState: createState,
    runDay: runDay,
    runNight: runNight,
    simulateWeek: simulateWeek,
    contradictionCount: contradictionCount,
    truthBody: truthBody,
    activeCards: activeCards,
    diffWords: diffWords,
    columnName: columnName,
    headerName: headerName,
    outboundSent: outboundSent,
    launchUrl: launchUrl,
    chartBlurb: chartBlurb,
    taskById: taskById,
    factById: factById,
  };
});
