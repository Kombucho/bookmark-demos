// Design Gospel and Engineering Gospel are separate sources of truth.
// A branch can hold an exploration. Gospel changes only on merge.
// Production changes only when the approved engineering gospel deploys.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DesignOps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TASKS = [
    {
      id: 'home',
      title: 'Home card',
      slug: 'home-card',
      explorations: ['quiet', 'night', 'ticket'],
    },
    {
      id: 'status',
      title: 'Status row',
      slug: 'status-row',
      explorations: ['chips', 'list', 'dial'],
    },
  ];

  const SCREENS = {
    plain: {label: 'Plain list'},
    quiet: {label: 'Quiet'},
    night: {label: 'Night'},
    ticket: {label: 'Ticket'},
    chips: {label: 'Chips'},
    list: {label: 'List'},
    dial: {label: 'Dial'},
  };

  const DESIGN_STEPS = [
    {id: 'assigned', label: 'Tasks are assigned'},
    {id: 'branched', label: 'Branch pulled from Gospel'},
    {id: 'drafting', label: 'Person A creates designs'},
    {id: 'submitted', label: 'Designs are submitted'},
    {id: 'review', label: 'Person B reviews'},
    {id: 'merged', label: 'Merged into Design Gospel'},
  ];

  const ENG_STEPS = [
    {id: 'handed', label: 'Hand off'},
    {id: 'branched', label: 'Branch pulled from Gospel'},
    {id: 'addressing', label: 'Engineer addresses requirements'},
    {id: 'applied', label: 'Changes are applied'},
    {id: 'merged', label: 'Approved and merged'},
    {id: 'production', label: 'Approved gospel becomes production'},
  ];

  const REQUIREMENTS = ['Layout', 'Type', 'Color'];

  const NOTES = {
    quiet: ['One time, one action', 'Type set large'],
    night: ['Dark ground', 'Light type'],
    ticket: ['Stub header', 'Dashed rule'],
    chips: ['Three status chips', 'List rows removed'],
    list: ['Marked rows', 'Tight leading'],
    dial: ['Tide ring', 'Time inside the ring'],
  };

  function create() {
    return {
      taskIndex: 0,
      phase: 'assigned',
      exploration: null,
      feedback: false,
      design: {version: 1, screen: 'plain'},
      designBranch: null,
      engineering: {version: 1, screen: 'plain'},
      engBranch: null,
      packet: null,
      production: {version: 1, screen: 'plain'},
    };
  }

  function task(state) {
    return TASKS[state.taskIndex];
  }

  function fail(state, code) {
    return {ok: false, state: state, code: code};
  }

  function ok(state, code) {
    return {ok: true, state: state, code: code};
  }

  function gates(state) {
    const more = state.taskIndex < TASKS.length - 1;
    return {
      pullDesign: state.phase === 'assigned',
      choose: state.phase === 'branched' || state.phase === 'drafting',
      submit: state.phase === 'drafting' && !!state.exploration,
      feedback: state.phase === 'submitted',
      approve: state.phase === 'submitted',
      mergeDesign: state.phase === 'approved',
      handoff: state.phase === 'designMerged',
      pullEng: state.phase === 'handed',
      address: state.phase === 'engBranched',
      apply: state.phase === 'addressing',
      mergeEng: state.phase === 'applied',
      deploy: state.phase === 'engMerged',
      nextTask: state.phase === 'deployed' && more,
    };
  }

  function designMark(id, phase) {
    const order = ['assigned', 'branched', 'drafting', 'submitted', 'review', 'merged'];
    let focus = 'past';
    if (phase === 'assigned') focus = 'assigned';
    else if (phase === 'branched') focus = 'branched';
    else if (phase === 'drafting') focus = 'drafting';
    else if (phase === 'submitted') focus = 'review';
    else if (phase === 'approved' || phase === 'designMerged') focus = 'merged';
    if (focus === 'past') return 'done';
    const current = order.indexOf(focus);
    const mine = order.indexOf(id);
    if (mine < current) return 'done';
    if (mine === current) return 'now';
    return 'wait';
  }

  function engMark(id, phase) {
    const order = ['handed', 'branched', 'addressing', 'applied', 'merged', 'production'];
    let focus = '';
    if (phase === 'handed') focus = 'handed';
    else if (phase === 'engBranched') focus = 'branched';
    else if (phase === 'addressing') focus = 'addressing';
    else if (phase === 'applied') focus = 'applied';
    else if (phase === 'engMerged') focus = 'merged';
    else if (phase === 'deployed') focus = 'production';
    if (!focus) return 'wait';
    const current = order.indexOf(focus);
    const mine = order.indexOf(id);
    if (mine < current) return 'done';
    if (mine === current) return 'now';
    return 'wait';
  }

  function pullDesign(state) {
    if (!gates(state).pullDesign) return fail(state, 'Phase');
    const current = task(state);
    return ok({
      ...state,
      phase: 'branched',
      exploration: null,
      feedback: false,
      designBranch: {name: 'a/' + current.slug, screen: state.design.screen},
      engBranch: null,
    }, 'Branched');
  }

  function choose(state, screen) {
    if (!gates(state).choose) return fail(state, 'Phase');
    if (task(state).explorations.indexOf(screen) === -1) return fail(state, 'Screen');
    return ok({
      ...state,
      phase: 'drafting',
      exploration: screen,
      designBranch: {name: state.designBranch.name, screen: screen},
    }, 'Drafting');
  }

  function submit(state) {
    if (!gates(state).submit) return fail(state, 'Phase');
    return ok({...state, phase: 'submitted', feedback: false}, 'Submitted');
  }

  function feedback(state) {
    if (!gates(state).feedback) return fail(state, 'Phase');
    return ok({...state, phase: 'drafting', feedback: true}, 'Feedback');
  }

  function approve(state) {
    if (!gates(state).approve) return fail(state, 'Phase');
    return ok({...state, phase: 'approved'}, 'Approved');
  }

  function mergeDesign(state) {
    if (!gates(state).mergeDesign) return fail(state, 'Phase');
    return ok({
      ...state,
      phase: 'designMerged',
      design: {version: state.design.version + 1, screen: state.exploration},
      designBranch: null,
      feedback: false,
    }, 'DesignMerged');
  }

  function handoff(state) {
    if (!gates(state).handoff) return fail(state, 'Phase');
    return ok({
      ...state,
      phase: 'handed',
      packet: {
        screen: state.design.screen,
        version: state.design.version,
        title: task(state).title,
      },
    }, 'Handed');
  }

  function pullEng(state) {
    if (!gates(state).pullEng) return fail(state, 'Phase');
    return ok({
      ...state,
      phase: 'engBranched',
      engBranch: {name: 'eng/' + task(state).slug, screen: state.engineering.screen},
    }, 'EngBranched');
  }

  function address(state) {
    if (!gates(state).address) return fail(state, 'Phase');
    return ok({...state, phase: 'addressing'}, 'Addressing');
  }

  function apply(state) {
    if (!gates(state).apply) return fail(state, 'Phase');
    return ok({
      ...state,
      phase: 'applied',
      engBranch: {name: state.engBranch.name, screen: state.packet.screen},
    }, 'Applied');
  }

  function mergeEng(state) {
    if (!gates(state).mergeEng) return fail(state, 'Phase');
    return ok({
      ...state,
      phase: 'engMerged',
      engineering: {version: state.engineering.version + 1, screen: state.engBranch.screen},
      engBranch: null,
    }, 'EngMerged');
  }

  function deploy(state) {
    if (!gates(state).deploy) return fail(state, 'Phase');
    return ok({
      ...state,
      phase: 'deployed',
      production: {version: state.engineering.version, screen: state.engineering.screen},
    }, 'Deployed');
  }

  function nextTask(state) {
    if (!gates(state).nextTask) return fail(state, 'Phase');
    return ok({
      ...state,
      taskIndex: state.taskIndex + 1,
      phase: 'assigned',
      exploration: null,
      feedback: false,
      designBranch: null,
      engBranch: null,
      packet: null,
    }, 'Assigned');
  }

  return {
    TASKS: TASKS,
    SCREENS: SCREENS,
    DESIGN_STEPS: DESIGN_STEPS,
    ENG_STEPS: ENG_STEPS,
    REQUIREMENTS: REQUIREMENTS,
    NOTES: NOTES,
    create: create,
    task: task,
    gates: gates,
    designMark: designMark,
    engMark: engMark,
    pullDesign: pullDesign,
    choose: choose,
    submit: submit,
    feedback: feedback,
    approve: approve,
    mergeDesign: mergeDesign,
    handoff: handoff,
    pullEng: pullEng,
    address: address,
    apply: apply,
    mergeEng: mergeEng,
    deploy: deploy,
    nextTask: nextTask,
  };
});
