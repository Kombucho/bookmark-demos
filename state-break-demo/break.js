// States and stress cases for two sample cards.
// Connection is the grouped state machine. Issue is the card /break walks.
// Checks are pure: the page passes scroll sizes and the rendered text in.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StateBreak = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const UNBROKEN_ID = 'checkout_session_01J8QZ7K3M9X2P6V4N0R5T8W1Y';
  const UNBROKEN_ENV = 'env_01J8QZ7K3M9X2P6V4N0R5T8W1Y';
  const LONG_TITLE = 'Checkout fails when a returning customer applies a discount to an existing subscription';
  const LONG_BODY = "Customers can't complete their purchase after updating their plan. Applying a discount clears the billing address and leaves the checkout stuck on the payment step.";
  const SHORT_BODY = "Customers can't pay after applying a discount code.";

  const ISSUE_FALLBACKS = {
    id: 'PRB-?',
    mark: '?',
    title: 'Untitled problem',
    body: 'No description provided.',
    priority: 'Unspecified',
    count: 'Unknown',
  };

  const CONNECTION_FALLBACKS = {
    project: 'No project',
    environment: 'No environment',
    replays: 'Off',
  };

  const CONNECTION_STATES = [
    { id: 'connected', group: 'Connection', label: 'Connected', tone: 'ok', title: 'Connected', detail: 'Events from this project are arriving.', project: 'jakub.kr', environment: 'Production', replays: 'On' },
    { id: 'setup', group: 'Connection', label: 'Setup incomplete', tone: 'warn', title: 'Setup incomplete', detail: 'Finish setup to start receiving events.', project: 'jakub.kr', environment: 'Production', replays: 'Off' },
    { id: 'elsewhere', group: 'Connection', label: 'Connected elsewhere', tone: 'warn', title: 'Connected elsewhere', detail: 'This project is already connected in another workspace.', project: 'jakub.kr', environment: 'Production', replays: 'On' },
    { id: 'disconnected', group: 'Connection', label: 'Disconnected', tone: 'bad', title: 'Disconnected', detail: 'No live connection to this project.', project: 'jakub.kr', environment: 'Production', replays: 'Off' },
    { id: 'skeleton', group: 'Data', label: 'Skeleton', tone: 'muted', title: 'Loading', detail: '', skeleton: true, project: '', environment: '', replays: '' },
    { id: 'syncing', group: 'Data', label: 'Syncing', tone: 'info', title: 'Syncing', detail: 'Session replays are catching up.', project: 'jakub.kr', environment: 'Production', replays: 'On' },
    { id: 'error', group: 'Data', label: 'Error', tone: 'bad', title: 'Error', detail: 'The project could not be reached.', project: 'jakub.kr', environment: 'Production', replays: 'On' },
    { id: 'auth', group: 'Access', label: 'Auth expired', tone: 'bad', title: 'Auth expired', detail: 'Sign in again to keep receiving events.', project: 'jakub.kr', environment: 'Production', replays: 'Off' },
    { id: 'permissions', group: 'Access', label: 'Missing permissions', tone: 'bad', title: 'Missing permissions', detail: 'This key cannot read session replays.', project: 'jakub.kr', environment: 'Production', replays: 'Off' },
  ];

  const ISSUE_BASE = {
    id: 'PRB-128',
    mark: 'AL',
    title: 'Checkout fails',
    body: SHORT_BODY,
    priority: 'High',
    count: 128,
  };

  const ISSUE_STATES = [
    { id: 'low', group: 'Priority', label: 'Low', record: Object.assign({}, ISSUE_BASE, { priority: 'Low', count: 12 }) },
    { id: 'medium', group: 'Priority', label: 'Medium', record: Object.assign({}, ISSUE_BASE, { priority: 'Medium', count: 64 }) },
    { id: 'high', group: 'Priority', label: 'High', record: Object.assign({}, ISSUE_BASE) },
    { id: 'loading', group: 'Record', label: 'Loading', record: Object.assign({}, ISSUE_BASE, { loading: true }) },
    { id: 'empty', group: 'Record', label: 'Empty', record: { id: 'PRB-128', mark: '', title: '', body: '', priority: '', count: '' } },
    { id: 'resolved', group: 'Record', label: 'Resolved', record: Object.assign({}, ISSUE_BASE, { resolved: true }) },
    { id: 'short', group: 'Detail', label: 'Short', record: Object.assign({}, ISSUE_BASE) },
    { id: 'long', group: 'Detail', label: 'Long title', record: Object.assign({}, ISSUE_BASE, { title: LONG_TITLE, body: LONG_BODY }) },
    { id: 'unbroken', group: 'Detail', label: 'Unbroken id', record: Object.assign({}, ISSUE_BASE, { body: 'Payment rejected for ' + UNBROKEN_ID + '.' }) },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function statesFor(component) {
    return component === 'issue' ? ISSUE_STATES : CONNECTION_STATES;
  }

  function groups(component) {
    const order = [];
    const map = {};
    statesFor(component).forEach(function (state) {
      if (!map[state.group]) {
        map[state.group] = [];
        order.push(state.group);
      }
      map[state.group].push(state);
    });
    return order.map(function (name) { return { id: name, states: map[name] }; });
  }

  function stateById(component, id) {
    const list = statesFor(component);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return list[0];
  }

  function defaultMock(component) {
    if (component === 'issue') return clone(ISSUE_BASE);
    return { project: 'jakub.kr', environment: 'Production', replays: 'On' };
  }

  function isBlank(value) {
    return value == null || String(value).trim() === '';
  }

  function formatCount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
    }
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    const numeric = text.replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(numeric)) {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(numeric));
    }
    return text;
  }

  function pick(value, fallback, useFallback) {
    const empty = isBlank(value);
    if (!empty) return { text: String(value), empty: false, fallback: false };
    if (useFallback) return { text: fallback, empty: true, fallback: true };
    return { text: '', empty: true, fallback: false };
  }

  function presentConnection(state, mock) {
    const source = state || CONNECTION_STATES[0];
    const data = mock || {};
    const use = data.fallbacks !== false && source.fallbacks !== false;
    const projectValue = Object.prototype.hasOwnProperty.call(data, 'project') ? data.project : source.project;
    const environmentValue = Object.prototype.hasOwnProperty.call(data, 'environment') ? data.environment : source.environment;
    const replaysValue = Object.prototype.hasOwnProperty.call(data, 'replays') ? data.replays : source.replays;
    return {
      kind: 'connection',
      id: source.id,
      group: source.group,
      label: source.label,
      tone: source.tone,
      title: source.title,
      detail: source.detail,
      skeleton: !!source.skeleton,
      dir: source.dir || data.dir || 'ltr',
      project: pick(projectValue, CONNECTION_FALLBACKS.project, use),
      environment: pick(environmentValue, CONNECTION_FALLBACKS.environment, use),
      replays: pick(replaysValue, CONNECTION_FALLBACKS.replays, use),
    };
  }

  function presentIssue(record) {
    const data = record || {};
    const use = data.fallbacks !== false;
    const loading = !!data.loading;
    if (loading) {
      return {
        kind: 'issue',
        loading: true,
        resolved: false,
        dir: data.dir || 'ltr',
        id: pick(data.id, ISSUE_FALLBACKS.id, use),
        mark: pick(data.mark, ISSUE_FALLBACKS.mark, use),
        title: { text: 'Loading problem\u2026', empty: false, fallback: false },
        body: { text: '', empty: true, fallback: true },
        priority: pick('High', ISSUE_FALLBACKS.priority, true),
        count: { text: '', empty: true, fallback: true },
      };
    }
    const countEmpty = data.count == null || data.count === '';
    const count = {
      text: countEmpty ? (use ? ISSUE_FALLBACKS.count : '') : formatCount(data.count),
      empty: countEmpty,
      fallback: countEmpty && use,
    };
    return {
      kind: 'issue',
      loading: false,
      resolved: !!data.resolved,
      dir: data.dir || 'ltr',
      id: pick(data.id, ISSUE_FALLBACKS.id, use),
      mark: pick(data.mark, ISSUE_FALLBACKS.mark, use),
      title: pick(data.title, ISSUE_FALLBACKS.title, use),
      body: pick(data.body, ISSUE_FALLBACKS.body, use),
      priority: pick(data.priority, ISSUE_FALLBACKS.priority, use),
      count: count,
    };
  }

  function fallbackIssues(presented) {
    if (!presented || presented.loading || presented.skeleton) return [];
    const fields = presented.kind === 'connection'
      ? ['project', 'environment', 'replays']
      : ['id', 'mark', 'title', 'body', 'priority', 'count'];
    const issues = [];
    fields.forEach(function (name) {
      const field = presented[name];
      if (field && field.empty && !field.fallback) {
        issues.push({ code: 'missing-fallback', name: name });
      }
    });
    return issues;
  }

  function judgeProbes(probes, tolerance) {
    const slack = tolerance == null ? 0 : tolerance;
    const issues = [];
    (probes || []).forEach(function (probe) {
      if (!probe) return;
      const width = probe.clientWidth || 0;
      const height = probe.clientHeight || 0;
      const scrollW = probe.scrollWidth || 0;
      const scrollH = probe.scrollHeight || 0;
      if (width === 0 && height === 0 && scrollW === 0 && scrollH === 0) return;
      if (scrollW > width + slack) issues.push({ code: 'overflow', name: probe.name });
      if (height > 0 && scrollH > height + slack) issues.push({ code: 'clipped', name: probe.name });
    });
    return issues;
  }

  function judgeCase(input) {
    const spec = input || {};
    const issues = judgeProbes(spec.probes, spec.tolerance).concat(fallbackIssues(spec.presented));
    return {
      id: spec.id,
      status: issues.length ? 'flag' : 'pass',
      issues: issues,
    };
  }

  function summarize(results) {
    let issues = 0;
    let flagged = 0;
    (results || []).forEach(function (result) {
      issues += result.issues.length;
      if (result.status === 'flag') flagged += 1;
    });
    return { cases: (results || []).length, flagged: flagged, issues: issues };
  }

  function summaryText(summary) {
    const s = summary || { cases: 0, flagged: 0, issues: 0 };
    const issueWord = s.issues === 1 ? 'issue' : 'issues';
    return s.flagged + ' of ' + s.cases + ' cases flagged, ' + s.issues + ' ' + issueWord;
  }

  function issueLabel(issue) {
    if (!issue) return '';
    if (issue.code === 'overflow') return 'Overflow: ' + issue.name;
    if (issue.code === 'clipped') return 'Clipped text: ' + issue.name;
    if (issue.code === 'missing-fallback') return 'Missing fallback: ' + issue.name;
    return issue.code;
  }

  function frameFor(item, global) {
    const base = global || {};
    return {
      width: item && item.width ? item.width : (base.width || 320),
      zoom: item && item.zoom ? item.zoom : (base.zoom || 1),
    };
  }

  function connectionCases(mock) {
    const base = Object.assign({ project: 'jakub.kr', environment: 'Production', replays: 'On' }, mock || {});
    delete base.fallbacks;
    delete base.dir;
    return [
      { id: 'default', label: 'Default', stateId: 'connected', mock: Object.assign({}, base) },
      { id: 'long', label: 'Long project', stateId: 'connected', mock: Object.assign({}, base, { project: 'jakub.kr/session-replays/production-workspace/north-america/checkout' }) },
      { id: 'unbroken', label: 'Unbroken id', stateId: 'connected', mock: Object.assign({}, base, { environment: UNBROKEN_ENV }) },
      { id: 'empty', label: 'Empty fields', stateId: 'connected', mock: { project: '', environment: '', replays: '', fallbacks: true } },
      { id: 'nofallback', label: 'Missing fallback', stateId: 'connected', mock: { project: '', environment: '', replays: '', fallbacks: false } },
      { id: 'loading', label: 'Loading', stateId: 'skeleton', mock: Object.assign({}, base) },
      { id: 'rtl', label: 'RTL text', stateId: 'connected', mock: Object.assign({}, base, { project: 'مشروع جاكوب', environment: 'الإنتاج', dir: 'rtl' }) },
      { id: 'emoji', label: 'Emoji', stateId: 'connected', mock: Object.assign({}, base, { project: 'jakub.kr 🔌', environment: 'Production 🌱' }) },
      { id: 'narrow', label: 'Narrow width', stateId: 'connected', mock: Object.assign({}, base), width: 180 },
      { id: 'zoom', label: '200% text', stateId: 'connected', mock: Object.assign({}, base), zoom: 2 },
    ];
  }

  function issueCases(mock) {
    const base = Object.assign({}, ISSUE_BASE, mock || {});
    delete base.fallbacks;
    delete base.loading;
    delete base.resolved;
    delete base.dir;
    return [
      { id: 'default', label: 'Default', record: Object.assign({}, base) },
      { id: 'long', label: 'Long title', record: Object.assign({}, base, { title: LONG_TITLE, body: LONG_BODY }) },
      { id: 'unbroken', label: 'Unbroken id', record: Object.assign({}, base, { body: 'Payment rejected for ' + UNBROKEN_ID + '.' }) },
      { id: 'huge', label: 'Huge number', record: Object.assign({}, base, { count: 12840 }) },
      { id: 'empty', label: 'Empty fields', record: { id: base.id || 'PRB-128', mark: '', title: '', body: '', priority: '', count: '', fallbacks: true } },
      { id: 'nofallback', label: 'Missing fallback', record: { id: '', mark: '', title: '', body: '', priority: '', count: '', fallbacks: false } },
      { id: 'loading', label: 'Loading', record: Object.assign({}, base, { loading: true }) },
      { id: 'rtl', label: 'RTL text', record: Object.assign({}, base, { title: 'يفشل إتمام الشراء', body: 'لا يستطيع العملاء الدفع بعد تطبيق رمز الخصم.', dir: 'rtl' }) },
      { id: 'emoji', label: 'Emoji', record: Object.assign({}, base, { title: 'Checkout fails 🛒', body: "Customers can't pay after a discount 🎟️. The payment step stalls.", mark: '💥' }) },
      { id: 'narrow', label: 'Narrow width', record: Object.assign({}, base), width: 180 },
      { id: 'zoom', label: '200% text', record: Object.assign({}, base), zoom: 2 },
    ];
  }

  function casesFor(component, mock) {
    return component === 'issue' ? issueCases(mock) : connectionCases(mock);
  }

  function parseMock(text) {
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'Mock data has to be a JSON object.' };
      }
      return { ok: true, value: value };
    } catch (error) {
      return { ok: false, error: 'JSON: ' + error.message };
    }
  }

  return {
    UNBROKEN_ID: UNBROKEN_ID,
    UNBROKEN_ENV: UNBROKEN_ENV,
    LONG_TITLE: LONG_TITLE,
    LONG_BODY: LONG_BODY,
    ISSUE_FALLBACKS: ISSUE_FALLBACKS,
    CONNECTION_FALLBACKS: CONNECTION_FALLBACKS,
    CONNECTION_STATES: CONNECTION_STATES,
    ISSUE_STATES: ISSUE_STATES,
    groups: groups,
    stateById: stateById,
    defaultMock: defaultMock,
    formatCount: formatCount,
    presentConnection: presentConnection,
    presentIssue: presentIssue,
    fallbackIssues: fallbackIssues,
    judgeProbes: judgeProbes,
    judgeCase: judgeCase,
    summarize: summarize,
    summaryText: summaryText,
    issueLabel: issueLabel,
    frameFor: frameFor,
    connectionCases: connectionCases,
    issueCases: issueCases,
    casesFor: casesFor,
    parseMock: parseMock,
  };
});
