// A planner for one person's five-week Colosseum-style sprint.
// The pass/miss lines are this page's reading of "How to Win a Colosseum Hackathon".
// They are not a published rubric, and they do not predict a prize.
// Day weights are this page's, so the article's tradeoffs fit on a board.
// Nothing is submitted. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HackathonPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WEEKS = 5;
  const WEEK_DAYS = 5;
  const DAY_COUNT = WEEKS * WEEK_DAYS;
  const SPRINT_DAYS = 20;
  const PITCH_AT = 20;
  const ARTICLE = 'https://blog.colosseum.org/how-to-win-a-colosseum-hackathon/';

  const SPECS = [
    {id: 'devnet', days: 5, kind: 'core', mark: 'solana'},
    {id: 'aha', days: 5, kind: 'core', mark: 'aha'},
    {id: 'flow', days: 4, kind: 'core', mark: 'flow'},
    {id: 'mobile', days: 8, kind: 'extra'},
    {id: 'token', days: 7, kind: 'extra'},
    {id: 'chain', days: 6, kind: 'extra'},
    {id: 'dash', days: 4, kind: 'extra'},
    {id: 'open', days: 1, kind: 'desk'},
    {id: 'feedback', days: 2, kind: 'desk'},
    {id: 'pitch', days: 5, kind: 'pitch'},
  ];

  const NAMES = {
    kiln: {
      devnet: 'Devnet session',
      aha: 'Place one order',
      flow: 'See it on the book',
      mobile: 'A native phone app',
      token: 'A token and staking',
      chain: 'A second chain',
      dash: 'An analytics suite',
      open: 'Project X account',
      feedback: 'Beta testers on the desk',
      pitch: 'Test the demo and record the pitch',
    },
    streetlamp: {
      devnet: 'Devnet wallet',
      aha: 'Pay for one map pin',
      flow: 'Sell that tile',
      mobile: 'A camera app',
      token: 'A governance token',
      chain: 'Map the whole earth',
      dash: 'A coverage dashboard',
      open: 'Project X account',
      feedback: 'Ride-along beta',
      pitch: 'Test the demo and record the pitch',
    },
    wick: {
      devnet: 'Read one devnet transaction',
      aha: 'Explain the failed instruction',
      flow: 'Share the trace',
      mobile: 'A plugin marketplace',
      token: 'A project token',
      chain: 'Hosted accounts',
      dash: 'A status page',
      open: 'Project X account',
      feedback: 'Office hours with other teams',
      pitch: 'Test the demo and record the pitch',
    },
    custom: {
      devnet: 'Your devnet slice',
      aha: 'The aha moment',
      flow: 'The rest of that one flow',
      mobile: 'A second surface',
      token: 'A token',
      chain: 'Another chain',
      dash: 'A dashboard',
      open: 'Project X account',
      feedback: 'A beta session',
      pitch: 'Test the demo and record the pitch',
    },
  };

  const IDEAS = {
    kiln: {
      id: 'kiln',
      name: 'Kiln',
      line: 'A pro desk for a thin market you already trade.',
      decade: 'The desk for that market, not a weekend order form.',
      like: 'Shaped like the article’s Tensor example. Kiln is fictional.',
      why: 'The retail tools got in the way of how you already trade.',
      marketText: 'An existing market, brought onchain for the people who already trade it.',
      market: true,
      personal: true,
      experience: true,
      priorAttempt: true,
      ambitious: true,
      publicGood: false,
      intent: 'founder',
    },
    streetlamp: {
      id: 'streetlamp',
      name: 'Streetlamp',
      line: 'People map a neighborhood and get paid. A buyer takes the fresh tile without the old broker.',
      decade: 'A live map the old brokers no longer sit in the middle of.',
      like: 'Shaped like the article’s Hivemapper example. Streetlamp is fictional.',
      why: 'You have not marked this as a problem you personally have.',
      marketText: 'An existing market for fresh map data, with the middleman taken out.',
      market: true,
      personal: false,
      experience: false,
      priorAttempt: false,
      ambitious: true,
      publicGood: false,
      intent: 'founder',
    },
    wick: {
      id: 'wick',
      name: 'Wick',
      line: 'A public-good debugger. Other teams open one failed devnet transaction and read it.',
      decade: '',
      like: 'A tool, not a company. The article still has an award for the best public good.',
      why: 'You wanted this while you were building, and the error text did not help.',
      marketText: 'Not marked as a new market, or as an existing one brought onchain.',
      market: false,
      personal: true,
      experience: true,
      priorAttempt: false,
      ambitious: false,
      publicGood: true,
      intent: 'contributor',
    },
    custom: {
      id: 'custom',
      name: 'Your idea',
      line: '',
      decade: '',
      like: 'The boxes start unchecked. They are your claim, not this page’s.',
      why: '',
      marketText: '',
      market: false,
      personal: false,
      experience: false,
      priorAttempt: false,
      ambitious: false,
      publicGood: false,
      intent: 'founder',
    },
  };

  const INTENTS = ['learner', 'contributor', 'founder'];
  const TEAMS = ['solo', 'technical', 'nontechnical', 'both'];
  const CHECKS = ['market', 'personal', 'experience', 'priorAttempt', 'ambitious', 'youBuild', 'publicGood'];
  const TEXTS = {customName: 80, customLine: 180, customAha: 80, customDecade: 180};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function specOf(id) {
    let i;
    for (i = 0; i < SPECS.length; i += 1) {
      if (SPECS[i].id === id) return SPECS[i];
    }
    return null;
  }

  function createState() {
    const idea = IDEAS.kiln;
    return {
      ideaId: 'kiln',
      customName: '',
      customLine: '',
      customAha: '',
      customDecade: '',
      market: idea.market,
      personal: idea.personal,
      experience: idea.experience,
      priorAttempt: idea.priorAttempt,
      ambitious: idea.ambitious,
      publicGood: idea.publicGood,
      intent: idea.intent,
      youBuild: true,
      team: 'solo',
      placements: [],
    };
  }

  function clip(value, max) {
    return String(value == null ? '' : value).slice(0, max);
  }

  function setIdea(state, ideaId) {
    const idea = IDEAS[ideaId];
    if (!idea) return {ok: false, code: 'UnknownIdea', state: state};
    const next = clone(state);
    next.ideaId = idea.id;
    next.market = idea.market;
    next.personal = idea.personal;
    next.experience = idea.experience;
    next.priorAttempt = idea.priorAttempt;
    next.ambitious = idea.ambitious;
    next.publicGood = idea.publicGood;
    next.intent = idea.intent;
    next.placements = [];
    return {ok: true, state: next};
  }

  function setCheck(state, key, value) {
    if (CHECKS.indexOf(key) === -1) return {ok: false, code: 'Unknown', state: state};
    const next = clone(state);
    next[key] = !!value;
    if (key === 'youBuild') return refit(state, next);
    return {ok: true, state: next};
  }

  function setText(state, key, value) {
    if (!TEXTS[key]) return {ok: false, code: 'Unknown', state: state};
    const next = clone(state);
    next[key] = clip(value, TEXTS[key]);
    return {ok: true, state: next};
  }

  function setIntent(state, intent) {
    if (INTENTS.indexOf(intent) === -1) return {ok: false, code: 'Unknown', state: state};
    const next = clone(state);
    next.intent = intent;
    return {ok: true, state: next};
  }

  function setTeam(state, team) {
    if (TEAMS.indexOf(team) === -1) return {ok: false, code: 'Unknown', state: state};
    const next = clone(state);
    next.team = team;
    return refit(state, next);
  }

  function clearBoard(state) {
    const next = clone(state);
    next.placements = [];
    return next;
  }

  function tracksOf(state) {
    let n = 0;
    if (state.youBuild) n += 1;
    if (state.team === 'technical' || state.team === 'both') n += 1;
    return n;
  }

  function deskOf(state) {
    return state.team === 'nontechnical' || state.team === 'both';
  }

  function peopleOf(state) {
    return 1 + (state.team === 'technical' || state.team === 'both' ? 1 : 0) + (state.team === 'nontechnical' || state.team === 'both' ? 1 : 0);
  }

  function placed(state, id) {
    let i;
    for (i = 0; i < state.placements.length; i += 1) {
      if (state.placements[i].id === id) return state.placements[i];
    }
    return null;
  }

  function span(start, days) {
    const out = [];
    let i;
    for (i = 0; i < days; i += 1) out.push(start + i);
    return out;
  }

  function covers(placement) {
    return span(placement.start, specOf(placement.id).days);
  }

  function laneBusy(placements, lane, day) {
    let i;
    for (i = 0; i < placements.length; i += 1) {
      const row = placements[i];
      if (row.lane !== lane) continue;
      if (covers(row).indexOf(day) !== -1) return true;
    }
    return false;
  }

  function pitchPlaced(placements) {
    let i;
    for (i = 0; i < placements.length; i += 1) {
      if (placements[i].id === 'pitch') return placements[i];
    }
    return null;
  }

  function hitsFinalWeek(days) {
    let i;
    for (i = 0; i < days.length; i += 1) {
      if (days[i] >= PITCH_AT) return true;
    }
    return false;
  }

  function place(state, id, start) {
    const spec = specOf(id);
    if (!spec) return {ok: false, code: 'Unknown', state: state};
    if (typeof start !== 'number' || start !== Math.floor(start)) {
      return {ok: false, code: 'Outside', state: state};
    }
    if (placed(state, id)) return {ok: false, code: 'Already', state: state};
    if (spec.kind === 'pitch') {
      if (start !== PITCH_AT) return {ok: false, code: 'NotFinalWeek', state: state};
      const days = span(start, spec.days);
      let blocked = false;
      let i;
      for (i = 0; i < state.placements.length; i += 1) {
        const theirs = covers(state.placements[i]);
        let j;
        for (j = 0; j < theirs.length; j += 1) {
          if (days.indexOf(theirs[j]) !== -1) blocked = true;
        }
      }
      if (blocked) return {ok: false, code: 'WeekBusy', state: state};
      const next = clone(state);
      next.placements = state.placements.concat([{id: id, start: start, lane: 'pitch'}]);
      return {ok: true, state: next};
    }

    const days = span(start, spec.days);
    if (start < 0 || days[days.length - 1] >= DAY_COUNT) {
      return {ok: false, code: 'Outside', state: state};
    }
    if (pitchPlaced(state.placements) && hitsFinalWeek(days)) {
      return {ok: false, code: 'PitchHolds', state: state};
    }

    const useDesk = spec.kind === 'desk' && deskOf(state);
    let lane = null;
    if (useDesk) {
      let free = true;
      let i;
      for (i = 0; i < days.length; i += 1) {
        if (laneBusy(state.placements, 'desk', days[i])) free = false;
      }
      if (free) lane = 'desk';
    } else {
      const tracks = tracksOf(state);
      if (tracks === 0) return {ok: false, code: 'NoLead', state: state};
      let t;
      for (t = 0; t < tracks; t += 1) {
        const name = 'build-' + t;
        let free = true;
        let i;
        for (i = 0; i < days.length; i += 1) {
          if (laneBusy(state.placements, name, days[i])) free = false;
        }
        if (free) {
          lane = name;
          break;
        }
      }
    }
    if (!lane) return {ok: false, code: 'Full', state: state};
    const next = clone(state);
    next.placements = state.placements.concat([{id: id, start: start, lane: lane}]);
    return {ok: true, state: next};
  }

  function remove(state, id) {
    const next = clone(state);
    next.placements = [];
    let removed = false;
    let i;
    for (i = 0; i < state.placements.length; i += 1) {
      if (state.placements[i].id === id) removed = true;
      else next.placements.push(state.placements[i]);
    }
    return {ok: true, state: next, removed: removed};
  }

  function refit(previous, draft) {
    const order = previous.placements.slice();
    draft.placements = [];
    const dropped = [];
    let cursor = draft;
    let i;
    for (i = 0; i < order.length; i += 1) {
      const attempt = place(cursor, order[i].id, order[i].start);
      if (attempt.ok) cursor = attempt.state;
      else dropped.push(order[i].id);
    }
    return {ok: true, state: cursor, dropped: dropped};
  }

  function catalog(state) {
    const names = NAMES[state.ideaId];
    return SPECS.map(function (spec) {
      let name = names[spec.id];
      if (spec.id === 'aha' && state.ideaId === 'custom' && state.customAha.trim()) {
        name = state.customAha.trim();
      }
      return {
        id: spec.id,
        days: spec.days,
        kind: spec.kind,
        mark: spec.mark || '',
        name: name,
      };
    });
  }

  function ideaView(state) {
    const idea = IDEAS[state.ideaId];
    const name = state.ideaId === 'custom' && state.customName.trim() ? state.customName.trim() : idea.name;
    const line = state.ideaId === 'custom' ? (state.customLine.trim() || 'No product line yet.') : idea.line;
    const decade = state.ideaId === 'custom' ? state.customDecade.trim() : idea.decade;
    const why = state.ideaId === 'custom'
      ? (state.personal ? (state.customLine.trim() || 'You marked this as a problem you have.') : 'You have not marked this as a problem you have.')
      : (state.personal ? idea.why : 'You have not marked this as a problem you have.');
    const marketText = state.ideaId === 'custom'
      ? (state.market ? 'You marked a market that needs crypto, or an existing one brought onchain.' : 'You have not marked a market that needs crypto or comes onchain.')
      : (state.market ? idea.marketText : 'You have not marked a market that needs crypto or comes onchain.');
    return {
      id: idea.id,
      name: name,
      line: line,
      decade: decade,
      like: idea.like,
      why: why,
      marketText: marketText,
    };
  }

  function inSprint(placement) {
    const spec = specOf(placement.id);
    return placement.start >= 0 && placement.start + spec.days <= SPRINT_DAYS;
  }

  function usage(state) {
    let sprint = 0;
    let pitchWeek = 0;
    let desk = 0;
    let i;
    for (i = 0; i < state.placements.length; i += 1) {
      const row = state.placements[i];
      const days = covers(row);
      let j;
      for (j = 0; j < days.length; j += 1) {
        if (row.lane === 'pitch') continue;
        if (row.lane === 'desk') desk += 1;
        else if (days[j] < SPRINT_DAYS) sprint += 1;
        else pitchWeek += 1;
      }
    }
    return {
      sprint: sprint,
      pitchWeek: pitchWeek,
      desk: desk,
      capacity: tracksOf(state) * SPRINT_DAYS,
    };
  }

  function line(id, status, title, detail, source) {
    return {
      id: id,
      status: status,
      title: title,
      detail: detail,
      source: source,
      counts: status === 'met' || status === 'missed',
    };
  }

  function note(id, title, detail, source) {
    return {
      id: id,
      status: 'note',
      title: title,
      detail: detail,
      source: source,
      counts: false,
    };
  }

  function corePlacements(state) {
    const out = [];
    let i;
    for (i = 0; i < SPECS.length; i += 1) {
      if (SPECS[i].kind !== 'core') continue;
      const row = placed(state, SPECS[i].id);
      out.push({spec: SPECS[i], row: row, ready: !!(row && inSprint(row))});
    }
    return out;
  }

  function judge(state) {
    const idea = ideaView(state);
    const lines = [];
    const tracks = tracksOf(state);
    const people = peopleOf(state);

    lines.push(line(
      'technical',
      tracks > 0 ? 'met' : 'missed',
      'A technical lead',
      tracks > 0
        ? 'Someone on this board can build the devnet demo.'
        : 'Nobody on this board can build. The article says a non-technical founder should team up with a technical lead, because the hackathon is an engineering competition as well as a business one.',
      'Guide, Team Composition.'
    ));

    lines.push(line(
      'cofounder',
      state.team === 'solo' ? 'missed' : 'met',
      'At least one other cofounder',
      state.team === 'solo'
        ? 'You are solo. The article highly encourages at least one other cofounder: support on a hard build, and more output because the work gets divided. It also says the average winning team size is now above 3. This board has ' + people + '.'
        : 'You added a cofounder, which is the minimum the article encourages. It still says the average winning team size is now above 3. This board has ' + people + '.',
      'Guide, Team Composition.'
    ));

    lines.push(line(
      'market',
      state.market ? 'met' : 'missed',
      'A market crypto changes',
      state.market
        ? idea.marketText
        : 'Not marked. The article’s first ideation point is a market that could not exist without crypto, or an existing market brought onchain.',
      'Guide, Product Ideation, point 1.'
    ));

    lines.push(line(
      'personal',
      state.personal ? 'met' : 'missed',
      'A problem you have',
      state.personal
        ? idea.why
        : 'Not marked. The article’s second point is a problem that affects you personally, even a niche one, if that community is growing.',
      'Guide, Product Ideation, point 2.'
    ));

    lines.push(line(
      'experience',
      state.experience ? 'met' : 'missed',
      'Prior experience in the market',
      state.experience
        ? 'You marked domain experience. The article calls that founder-market fit.'
        : 'Not marked. The article’s third point is to build where you already understand the market.',
      'Guide, Product Ideation, point 3.'
    ));

    if (state.intent === 'founder') {
      lines.push(line(
        'ambitious',
        state.ambitious ? 'met' : 'missed',
        'A long-term product',
        state.ambitious
          ? (idea.decade || 'You marked the vision as ambitious. The article says the hackathon is only the start.')
          : 'Not marked. The article’s fifth point: if you are starting a company, pick a vision that outlasts the five weeks. Only so much fits in the sprint.',
        'Guide, Product Ideation, point 5.'
      ));
    } else {
      lines.push(note(
        'ambitious',
        'A long-term product',
        'The fifth ideation point is aimed at someone embarking on a startup. This board is marked ' + state.intent + ', so it is not counted. ' + (state.ambitious ? 'You marked it ambitious anyway.' : 'The ambitious box is off.'),
        'Guide, Product Ideation, point 5.'
      ));
    }

    lines.push(note(
      'prior',
      'Tried before',
      state.priorAttempt
        ? 'You marked that others have tried this, and that you know how they failed. The article says timing and execution are a reason not to avoid that kind of idea. It is permission, not a requirement, so it is not counted.'
        : 'The box is off. The article does not require the idea to be unprecedented. Point 4 says not to be afraid of an idea others have attempted, if you understand how they failed.',
      'Guide, Product Ideation, point 4.'
    ));

    const cores = corePlacements(state);
    const devnet = placed(state, 'devnet');
    const aha = placed(state, 'aha');
    const devnetReady = !!(devnet && inSprint(devnet));
    const ahaReady = !!(aha && inSprint(aha));
    const coreReady = cores.every(function (row) { return row.ready; });
    const missingCore = cores.filter(function (row) { return !row.ready; }).map(function (row) {
      return NAMES[state.ideaId][row.spec.id];
    });

    lines.push(line(
      'devnet',
      devnetReady ? 'met' : 'missed',
      'A devnet slice',
      devnetReady
        ? 'The Solana-facing slice sits inside the four engineering weeks.'
        : 'The devnet card is not finished inside the four engineering weeks. The article says to prioritize a working demo on devnet, and that the tech requirement which remains is integrating with Solana in some capacity.',
      'Guide, Prioritization, and the bounties note.'
    ));

    lines.push(line(
      'aha',
      ahaReady ? 'met' : 'missed',
      'The aha moment',
      ahaReady
        ? 'The card you marked as the moment users understand the product is inside the engineering weeks.'
        : 'That card is missing from the four engineering weeks. The article says to prioritize the feature that gives users an aha moment: why it fits their need, and how they would use it often.',
      'Guide, Prioritization & Execution.'
    ));

    lines.push(line(
      'core',
      coreReady ? 'met' : 'missed',
      'One core flow',
      coreReady
        ? 'Devnet, the aha moment, and the rest of that flow all sit inside the four engineering weeks.'
        : 'Still off the sprint: ' + missingCore.join(', ') + '. The article says an ambitious vision will not fit, so the sprint is the working demo, not every feature.',
      'Guide, Prioritization & Execution.'
    ));

    const extras = state.placements.filter(function (row) { return specOf(row.id).kind === 'extra'; });
    const extraSpill = extras.filter(function (row) { return !inSprint(row); });
    const scopeMiss = extraSpill.length > 0 || (extras.length > 0 && !coreReady);
    let scopeDetail;
    if (extraSpill.length) {
      scopeDetail = 'An extra runs into the final week (' + extraSpill.map(function (row) { return catalog(state).filter(function (f) { return f.id === row.id; })[0].name; }).join(', ') + '). The article keeps that week for testing and the pitch.';
    } else if (extras.length && !coreReady) {
      scopeDetail = 'An extra is on the board while the core flow is not finished. The article says to prioritize the demo.';
    } else if (!extras.length) {
      scopeDetail = 'No extra is on the board. The ambitious rest can wait. The article says the hackathon is the start.';
    } else {
      scopeDetail = 'The extras that are on the board sit beside a finished core flow, inside the engineering weeks.';
    }
    lines.push(line(
      'scope',
      scopeMiss ? 'missed' : 'met',
      'Extras did not eat the demo',
      scopeDetail,
      'Guide, Prioritization & Execution.'
    ));

    const open = placed(state, 'open');
    let openStatus = 'missed';
    let openDetail = 'No project X account is on the board. The article says to build in the open from the start, so you start marketing and so beta testers can find you.';
    if (open && open.start <= 4) {
      openStatus = 'met';
      openDetail = 'The account is in week 1. This board treats week 1 as “from the start.” The article does not name a day.';
    } else if (open) {
      openDetail = 'The account is on the board, but not in week 1. The article says to share the vision from the start, after you register.';
    }
    lines.push(line('open', openStatus, 'In the open from the start', openDetail, 'Guide, Prioritization & Execution.'));

    const feedback = placed(state, 'feedback');
    let feedbackStatus = 'missed';
    let feedbackDetail = 'No beta session is on the engineering sprint. The article says early users can change the direction of the product.';
    if (feedback && inSprint(feedback)) {
      const ready = cores.some(function (row) { return row.row && row.row.start <= feedback.start; });
      if (ready) {
        feedbackStatus = 'met';
        feedbackDetail = 'The session sits in the engineering weeks, on or after a core card starts, so there is a slice to react to.';
      } else {
        feedbackDetail = 'The session is on the sprint, but no core card has started yet, so there is no working slice to react to.';
      }
    } else if (feedback) {
      feedbackDetail = 'The session runs outside the four engineering weeks. The article wants that feedback during the sprint.';
    }
    lines.push(line('feedback', feedbackStatus, 'Feedback during the sprint', feedbackDetail, 'Guide, Prioritization & Execution.'));

    const pitch = pitchPlaced(state.placements);
    const weekBusy = state.placements.some(function (row) {
      return row.id !== 'pitch' && hitsFinalWeek(covers(row));
    });
    lines.push(line(
      'pitch',
      pitch ? 'met' : 'missed',
      'Final week for the test and the pitch',
      pitch
        ? 'The last week is held for testing the demo and recording the pitch. The article says presentations have to be under 3 minutes, and it recommends Loom over a slide deck. This page does not record one.'
        : (weekBusy
          ? 'Feature work is still on the final week, so the test-and-pitch card does not fit. The article spends that week on testing the demo and the submission pitch.'
          : 'The final week is empty. The article spends it on testing the demo and creating the pitch, not on leaving it blank.'),
      'Guide, Product Presentation, and the final-week note.'
    ));

    lines.push(note(
      'during',
      'Judged on the five weeks',
      'Only this board counts. The article says projects are judged on work done during the hackathon, even though a team may start building two months before the start date. Those earlier days are not extra slots here.',
      'Guide, Length.'
    ));

    lines.push(note(
      'size',
      'Winning teams',
      'The article says the average winning team size is now above 3, and that every project has to divide work to raise output. This board has ' + people + (people > 3 ? ', which is above that average.' : '. That is not above 3.') + ' The cofounder switch is this page’s picture of dividing work. The article does not publish a capacity number. A technical cofounder adds one build track. A non-technical cofounder takes the X account and the beta session off your build track. Marketing, product, and design are the kinds of roles the article names.',
      'Guide, Team Composition.'
    ));

    const intentDetail = state.publicGood
      ? 'Marked as a public good. The article says there will always be an award for the best public good, and that grants exist for open-source work even when the builders are not starting a company. Prizes otherwise go to teams who intend to build full-time and who have a possibly viable business. Learners and contributors are encouraged either way.'
      : (state.intent === 'founder'
        ? 'Marked as a founder. The article says prizes go to teams who intend to build full-time and develop a product with a possibly viable business, and that winning can make a team eligible to be considered for the accelerator. This card does not say you won, and it does not say you are eligible.'
        : 'Marked as a ' + state.intent + '. The article encourages learners and contributors, and it says learners often become contributors and contributors often become founders. The accelerator focus it describes is founders. There is also always an award for the best public good.');
    lines.push(note('intent', 'Who the prizes are aimed at', intentDetail, 'Guide, Judging, and the builder demographics.'));

    lines.push(note(
      'clock',
      'Under 3 minutes',
      'The article says judges review hundreds of submissions, so the presentation has to be under 3 minutes. It recommends Loom rather than a slide deck. Effective pitches, it says, include team background, a product description, why you started, the market, how you will get the first users or the traction you already have, and how the product works. This strip is that list. It is not a recording, and it is not a score Colosseum publishes.',
      'Guide, Product Presentation.'
    ));

    const made = !!pitch;
    const demoReady = coreReady;
    const beats = [
      {
        id: 'team',
        title: 'Team background',
        included: made,
        text: people === 1
          ? 'Solo builder. You can say so. The article would rather you had a cofounder.'
          : people + ' people on the sprint, including you.',
      },
      {
        id: 'product',
        title: 'Product description',
        included: made,
        text: idea.line + (idea.decade && state.ambitious ? ' ' + idea.decade : ''),
      },
      {
        id: 'why',
        title: 'Why you started',
        included: made,
        text: idea.why,
      },
      {
        id: 'market',
        title: 'Market opportunity',
        included: made,
        text: idea.marketText,
      },
      {
        id: 'usage',
        title: 'First users, or traction',
        included: made,
        text: feedbackStatus === 'met'
          ? 'You have a beta session on the sprint, so this beat can be traction and what those users said. The article says early users can change the direction.'
          : 'No beta session landed during the sprint. The article still accepts a beat on how you will get the first users, and treats traction as the case where you already have it.',
      },
      {
        id: 'demo',
        title: 'How it works',
        included: made && demoReady,
        text: demoReady
          ? 'Walk the one flow that is on the engineering weeks. That is the demo.'
          : 'The core flow is not finished inside the four engineering weeks, so this beat has no working demo to show.',
      },
    ];

    let met = 0;
    let counted = 0;
    let i;
    for (i = 0; i < lines.length; i += 1) {
      if (!lines[i].counts) continue;
      counted += 1;
      if (lines[i].status === 'met') met += 1;
    }

    return {
      lines: lines,
      beats: beats,
      met: met,
      counted: counted,
      people: people,
      tracks: tracks,
      usage: usage(state),
      idea: idea,
    };
  }

  function board(state) {
    const features = catalog(state);
    const byId = {};
    features.forEach(function (feature) { byId[feature.id] = feature; });
    const days = [];
    let i;
    for (i = 0; i < DAY_COUNT; i += 1) {
      const cells = [];
      let p;
      for (p = 0; p < state.placements.length; p += 1) {
        const row = state.placements[p];
        const feature = byId[row.id];
        if (i < row.start || i >= row.start + feature.days) continue;
        cells.push({
          id: row.id,
          name: feature.name,
          kind: feature.kind,
          lane: row.lane,
          index: i - row.start,
          days: feature.days,
        });
      }
      days.push({index: i, week: Math.floor(i / WEEK_DAYS) + 1, cells: cells});
    }
    return {
      features: features,
      days: days,
      tracks: tracksOf(state),
      desk: deskOf(state),
      people: peopleOf(state),
      usage: usage(state),
      idea: ideaView(state),
    };
  }

  function reason(code) {
    if (code === 'Unknown') return 'That card is not on this idea.';
    if (code === 'Already') return 'That card is already on the board.';
    if (code === 'Outside') return 'That card runs off the five weeks.';
    if (code === 'NotFinalWeek') return 'Testing and the pitch belong on the final week. The article does not move them earlier.';
    if (code === 'WeekBusy') return 'The final week still has other work on it. Clear those days, then place the test-and-pitch card.';
    if (code === 'PitchHolds') return 'The final week is held for testing and the pitch.';
    if (code === 'NoLead') return 'A non-technical founder needs a technical lead before those cards can land. The article says the hackathon is an engineering competition too.';
    if (code === 'Full') return 'Those days are already taken on every track you have.';
    return 'That card does not fit.';
  }

  return {
    ARTICLE: ARTICLE,
    WEEKS: WEEKS,
    WEEK_DAYS: WEEK_DAYS,
    DAY_COUNT: DAY_COUNT,
    SPRINT_DAYS: SPRINT_DAYS,
    PITCH_AT: PITCH_AT,
    SPECS: SPECS,
    IDEAS: IDEAS,
    createState: createState,
    setIdea: setIdea,
    setCheck: setCheck,
    setText: setText,
    setIntent: setIntent,
    setTeam: setTeam,
    clearBoard: clearBoard,
    place: place,
    remove: remove,
    catalog: catalog,
    ideaView: ideaView,
    judge: judge,
    board: board,
    usage: usage,
    tracksOf: tracksOf,
    peopleOf: peopleOf,
    reason: reason,
  };
});
