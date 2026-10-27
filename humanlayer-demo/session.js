// A scripted task for one fictional refresh function.
// The phase names and the two workflows are the ones published for HumanLayer.
// Nothing here launches a daemon, a model, or a fetch.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HumanLayerSketch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PHASES = [
    { id: 'questions', label: 'Questions' },
    { id: 'research', label: 'Research', artifact: 'research.md' },
    { id: 'design', label: 'Design', artifact: 'design.md' },
    { id: 'structure', label: 'Structure', artifact: 'structure.md' },
    { id: 'plan', label: 'Plan', artifact: 'plan.md' },
    { id: 'implement', label: 'Implement' },
  ];

  const WORKFLOWS = {
    rpi: {
      id: 'rpi',
      label: 'RPI Guided',
      summary: 'Research, plan, then implement. On this page, Design is a comment checkpoint.',
      phases: ['questions', 'research', 'design', 'structure', 'plan', 'implement'],
    },
    oneshot: {
      id: 'oneshot',
      label: 'Oneshot',
      summary: 'Implement the ticket or task directly.',
      phases: ['implement'],
    },
  };

  const ANSWERS = {
    share: 'Share one in-flight call.',
    every: 'Call refresh every time.',
  };

  const SCRIPTED_COMMENT = 'Refresh can overlap. Share one in-flight call.';
  const COMMENT_LIMIT = 180;

  const SESSION_LABEL = {
    questions: 'Clarifying questions',
    research: 'Research authentication patterns',
    design: 'Design discussion: token refresh',
    structure: 'Structure outline',
    plan: 'Implementation plan',
    implement: 'Implement token refresh',
  };

  const BARE = [
    'function refresh(token) {',
    '  return fetch(URL, { headers: { authorization: token } });',
    '}',
  ];

  const MUTEX = [
    'function refresh(token) {',
    '  return mutex.run(function () {',
    '    return fetch(URL, { headers: { authorization: token } });',
    '  });',
    '}',
  ];

  function workflow(id) {
    const flow = WORKFLOWS[id];
    if (!flow) return null;
    return {
      id: flow.id,
      label: flow.label,
      summary: flow.summary,
      phases: flow.phases.slice(),
    };
  }

  function workflows() {
    return [workflow('rpi'), workflow('oneshot')];
  }

  function phaseList() {
    return PHASES.map(function (phase) {
      return { id: phase.id, label: phase.label, artifact: phase.artifact || null };
    });
  }

  function create(id) {
    const flow = WORKFLOWS[id];
    if (!flow) return null;
    return {
      workflow: id,
      phase: flow.phases[0],
      answer: null,
      design: null,
      comment: null,
    };
  }

  function fail(state, code) {
    return { ok: false, state: state, code: code };
  }

  function ok(state, code) {
    return { ok: true, state: state, code: code };
  }

  function copyComment(comment) {
    if (!comment) return null;
    return { text: comment.text, resolved: comment.resolved, reply: comment.reply };
  }

  function answer(state, choice) {
    if (state.phase !== 'questions') return fail(state, 'Phase');
    if (!ANSWERS[choice]) return fail(state, 'Choice');
    return ok({
      workflow: state.workflow,
      phase: state.phase,
      answer: choice,
      design: choice === 'share' ? 'mutex' : 'bare',
      comment: copyComment(state.comment),
    }, 'Answered');
  }

  function advance(state) {
    const flow = WORKFLOWS[state.workflow];
    const index = flow.phases.indexOf(state.phase);
    if (index === -1 || index === flow.phases.length - 1) return fail(state, 'Phase');
    if (state.phase === 'questions' && !state.answer) return fail(state, 'Question');
    if (state.phase === 'design' && state.comment && !state.comment.resolved) return fail(state, 'Open');
    return ok({
      workflow: state.workflow,
      phase: flow.phases[index + 1],
      answer: state.answer,
      design: state.design,
      comment: copyComment(state.comment),
    }, 'Advanced');
  }

  function comment(state, text) {
    if (state.phase !== 'design') return fail(state, 'Phase');
    if (state.comment && !state.comment.resolved) return fail(state, 'Open');
    const body = String(text || '').trim();
    if (!body || body.length > COMMENT_LIMIT) return fail(state, 'Text');
    return ok({
      workflow: state.workflow,
      phase: state.phase,
      answer: state.answer,
      design: state.design,
      comment: { text: body, resolved: false, reply: null },
    }, 'Commented');
  }

  function resolve(state) {
    if (state.phase !== 'design' || !state.comment || state.comment.resolved) return fail(state, 'Phase');
    const scripted = state.comment.text === SCRIPTED_COMMENT;
    const already = state.design === 'mutex';
    let reply = 'Read. The design is unchanged.';
    if (scripted && already) reply = 'The design already shares one in-flight call.';
    if (scripted && !already) reply = 'Updated the design to wrap refresh in a mutex.';
    return ok({
      workflow: state.workflow,
      phase: state.phase,
      answer: state.answer,
      design: scripted ? 'mutex' : state.design,
      comment: { text: state.comment.text, resolved: true, reply: reply },
    }, scripted && !already ? 'Revised' : 'Noted');
  }

  function phaseMark(id, state) {
    const flow = WORKFLOWS[state.workflow];
    const index = flow.phases.indexOf(id);
    if (index === -1) return 'skip';
    const current = flow.phases.indexOf(state.phase);
    if (index < current) return 'done';
    if (index === current) return 'now';
    return 'wait';
  }

  function sessions(state) {
    const flow = WORKFLOWS[state.workflow];
    const current = flow.phases.indexOf(state.phase);
    return flow.phases.map(function (id, index) {
      let status = 'IDLE';
      if (index < current) status = 'DONE';
      else if (index === current) status = 'RUNNING';
      else if (id === 'implement') status = 'DRAFT';
      return {
        id: id,
        label: SESSION_LABEL[id],
        status: status,
      };
    });
  }

  function bodyFor(lines) {
    return lines.slice();
  }

  function codeFor(state) {
    return state.design === 'mutex' ? bodyFor(MUTEX) : bodyFor(BARE);
  }

  function sheet(state) {
    if (state.phase === 'questions') {
      const blocks = [
        { kind: 'p', text: 'Token refresh. One question before any artifact is written.' },
        { kind: 'p', text: 'Should refresh share one in-flight call?' },
      ];
      if (state.answer) blocks.push({ kind: 'p', text: 'Answer: ' + ANSWERS[state.answer] });
      return { kicker: 'Task', title: 'token-refresh', blocks: blocks };
    }
    if (state.phase === 'research') {
      return {
        kicker: 'Artifact',
        title: 'research.md',
        blocks: [
          { kind: 'p', text: 'The refresh entry point is src/auth/refresh.js.' },
          { kind: 'p', text: 'The answer on this task: ' + ANSWERS[state.answer] },
          { kind: 'p', text: 'Two overlapping callers are the case the design has to name.' },
        ],
      };
    }
    if (state.phase === 'design') {
      const shared = state.design === 'mutex';
      return {
        kicker: 'Artifact',
        title: 'design.md',
        blocks: [
          { kind: 'p', text: shared ? 'Refresh shares one in-flight call.' : 'Refresh calls fetch on every invocation.' },
          { kind: 'p', text: shared ? 'A mutex wraps the fetch so overlapping callers wait.' : 'Nothing in the design stops two refreshes from overlapping.' },
          { kind: 'code', lines: codeFor(state) },
        ],
      };
    }
    if (state.phase === 'structure') {
      const shared = state.design === 'mutex';
      return {
        kicker: 'Artifact',
        title: 'structure.md',
        blocks: [
          { kind: 'p', text: 'Step 1. Keep refresh in src/auth/refresh.js.' },
          { kind: 'p', text: 'Step 2. Callers use that one entry point.' },
          { kind: 'p', text: shared ? 'Step 3. The entry point waits on a mutex.' : 'Step 3. The entry point calls fetch on every invocation.' },
        ],
      };
    }
    if (state.phase === 'plan') {
      const shared = state.design === 'mutex';
      return {
        kicker: 'Artifact',
        title: 'plan.md',
        blocks: [
          { kind: 'p', text: 'File: src/auth/refresh.js.' },
          { kind: 'p', text: shared ? 'Acceptance: two overlapping calls share one fetch.' : 'Acceptance: each call fetches on its own.' },
        ],
      };
    }
    return {
      kicker: 'Session',
      title: 'Implement token refresh',
      blocks: [
        { kind: 'p', text: 'The session is running. The visible edit is src/auth/refresh.js.' },
        { kind: 'p', text: 'The diff is the text beside this sheet. This page does not apply it, and it does not call fetch.' },
        { kind: 'code', lines: codeFor(state) },
      ],
    };
  }

  function diffLines(state) {
    if (state.phase !== 'implement') return null;
    const lines = ['src/auth/refresh.js'].concat(codeFor(state));
    return lines;
  }

  function runState(state) {
    if (state.workflow === 'oneshot') {
      return { id: 'direct', label: 'Oneshot is on Implement. There is no design document, and the diff is the bare fetch.' };
    }
    if (state.comment && !state.comment.resolved) {
      return { id: 'held', label: 'An open comment holds the task on Design. Resolve it before the next phase.' };
    }
    if (state.design === 'mutex' && state.phase === 'implement') {
      return { id: 'revised', label: 'The implement session is running. The diff wraps fetch in mutex.run, which is the revised design.' };
    }
    if (state.phase === 'implement') {
      return { id: 'bare', label: 'The implement session is running. The design was not revised, so the diff is the bare fetch.' };
    }
    if (state.design === 'mutex') {
      return { id: 'revised', label: 'The design shares one in-flight call. Implement stays a draft until the task reaches it.' };
    }
    return { id: 'walking', label: 'The task is still before Implement. The running session is ' + SESSION_LABEL[state.phase] + '.' };
  }

  function gates(state) {
    const flow = WORKFLOWS[state.workflow];
    const last = state.phase === flow.phases[flow.phases.length - 1];
    const open = !!(state.comment && !state.comment.resolved);
    return {
      answer: state.phase === 'questions' && !state.answer,
      advance: !last && !(state.phase === 'questions' && !state.answer) && !(state.phase === 'design' && open),
      comment: state.phase === 'design' && !open,
      resolve: state.phase === 'design' && open,
    };
  }

  function deny(code) {
    if (code === 'Question') return 'Pick an answer before leaving Questions.';
    if (code === 'Open') return 'Resolve the open comment before leaving Design.';
    if (code === 'Text') return 'The comment needs one short sentence, at most 180 characters.';
    if (code === 'Choice') return 'That is not one of the two answers.';
    if (code === 'Phase') return 'That action does not apply in this phase.';
    return 'That did not apply.';
  }

  return {
    PHASES: phaseList(),
    ANSWERS: ANSWERS,
    SCRIPTED_COMMENT: SCRIPTED_COMMENT,
    COMMENT_LIMIT: COMMENT_LIMIT,
    BARE: BARE,
    MUTEX: MUTEX,
    workflow: workflow,
    workflows: workflows,
    create: create,
    answer: answer,
    advance: advance,
    comment: comment,
    resolve: resolve,
    phaseMark: phaseMark,
    sessions: sessions,
    sheet: sheet,
    diffLines: diffLines,
    runState: runState,
    gates: gates,
    deny: deny,
  };
});
