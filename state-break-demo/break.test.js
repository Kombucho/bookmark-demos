const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lab = require('./break.js');

test('connection states are grouped the way the skill shows them', function () {
  const groups = lab.groups('connection');
  assert.deepEqual(groups.map(function (group) { return group.id; }), ['Connection', 'Data', 'Access']);
  assert.deepEqual(groups[0].states.map(function (state) { return state.label; }), [
    'Connected',
    'Setup incomplete',
    'Connected elsewhere',
    'Disconnected',
  ]);
  assert.deepEqual(groups[1].states.map(function (state) { return state.label; }), ['Skeleton', 'Syncing', 'Error']);
  assert.deepEqual(groups[2].states.map(function (state) { return state.label; }), ['Auth expired', 'Missing permissions']);
  assert.equal(lab.CONNECTION_STATES.length, 9);
  assert.equal(lab.stateById('connection', 'missing').id, 'connected');
});

test('issue states cover priority, record, and detail', function () {
  const groups = lab.groups('issue');
  assert.deepEqual(groups.map(function (group) { return group.id; }), ['Priority', 'Record', 'Detail']);
  assert.equal(groups[0].states.length, 3);
  assert.equal(groups[1].states.length, 3);
  assert.equal(groups[2].states.length, 3);
});

test('empty issue fields fall back, and a raw card does not', function () {
  const filled = lab.presentIssue(lab.defaultMock('issue'));
  assert.equal(filled.title.text, 'Checkout fails');
  assert.equal(filled.count.text, '128');
  assert.equal(lab.formatCount(12840), '12,840');
  assert.equal(lab.formatCount('12840'), '12,840');

  const empty = lab.presentIssue({ id: 'PRB-128', mark: '', title: '', body: '', priority: '', count: '' });
  assert.equal(empty.title.text, 'Untitled problem');
  assert.equal(empty.body.text, 'No description provided.');
  assert.equal(empty.count.text, 'Unknown');
  assert.equal(empty.priority.text, 'Unspecified');
  assert.deepEqual(lab.fallbackIssues(empty), []);

  const raw = lab.presentIssue({ id: '', mark: '', title: '', body: '', priority: '', count: '', fallbacks: false });
  const missing = lab.fallbackIssues(raw);
  assert.equal(missing.length, 6);
  assert.ok(missing.every(function (issue) { return issue.code === 'missing-fallback'; }));

  const loading = lab.presentIssue({ loading: true, title: '' });
  assert.equal(loading.loading, true);
  assert.equal(loading.title.text, 'Loading problem\u2026');
  assert.deepEqual(lab.fallbackIssues(loading), []);
});

test('connection mock text overrides the state, and blank fields fall back', function () {
  const state = lab.stateById('connection', 'connected');
  const shown = lab.presentConnection(state, { project: 'other.dev', environment: '', replays: 'On' });
  assert.equal(shown.project.text, 'other.dev');
  assert.equal(shown.environment.text, 'No environment');
  assert.equal(shown.environment.fallback, true);
  const raw = lab.presentConnection(state, { project: '', environment: '   ', replays: '', fallbacks: false });
  assert.equal(lab.fallbackIssues(raw).length, 3);
  const skeleton = lab.presentConnection(lab.stateById('connection', 'skeleton'), {});
  assert.equal(skeleton.skeleton, true);
  assert.deepEqual(lab.fallbackIssues(skeleton), []);
});

test('break cases include the stresses from the skill', function () {
  const issues = lab.issueCases(lab.defaultMock('issue'));
  const byId = {};
  issues.forEach(function (item) { byId[item.id] = item; });
  assert.equal(byId.long.record.title, lab.LONG_TITLE);
  assert.equal(byId.long.record.body, lab.LONG_BODY);
  assert.match(byId.unbroken.record.body, new RegExp(lab.UNBROKEN_ID));
  assert.equal(byId.huge.record.count, 12840);
  assert.equal(byId.empty.record.title, '');
  assert.equal(byId.empty.record.fallbacks, true);
  assert.equal(byId.nofallback.record.fallbacks, false);
  assert.equal(byId.loading.record.loading, true);
  assert.equal(byId.rtl.record.dir, 'rtl');
  assert.match(byId.emoji.record.title, /🛒/);
  assert.equal(byId.narrow.width, 180);
  assert.equal(byId.zoom.zoom, 2);
  assert.equal(lab.frameFor(byId.narrow, { width: 320, zoom: 1 }).width, 180);
  assert.equal(lab.frameFor(byId.default, { width: 280, zoom: 2 }).zoom, 2);

  const connections = lab.connectionCases({ project: 'jakub.kr' });
  assert.equal(connections.find(function (item) { return item.id === 'unbroken'; }).mock.environment, lab.UNBROKEN_ENV);
  assert.equal(lab.casesFor('issue', {}).length, 11);
  assert.equal(lab.casesFor('connection', {}).length, 10);
});

test('layout probes and fallbacks become a pass or flag badge', function () {
  const overflow = lab.judgeProbes([
    { name: 'token', scrollWidth: 420, clientWidth: 180, scrollHeight: 20, clientHeight: 20 },
    { name: 'title', scrollWidth: 180, clientWidth: 180, scrollHeight: 72, clientHeight: 40 },
  ]);
  assert.deepEqual(overflow, [
    { code: 'overflow', name: 'token' },
    { code: 'clipped', name: 'title' },
  ]);
  assert.deepEqual(lab.judgeProbes([{ name: 'title', scrollWidth: 0, clientWidth: 0, scrollHeight: 0, clientHeight: 0 }]), []);
  assert.deepEqual(lab.judgeProbes([{ name: 'token', scrollWidth: 40, clientWidth: 0, scrollHeight: 0, clientHeight: 16 }]), [
    { code: 'overflow', name: 'token' },
  ]);

  const raw = lab.presentIssue({ title: '', body: '', priority: '', count: '', id: '', mark: '', fallbacks: false });
  const flagged = lab.judgeCase({ id: 'nofallback', probes: [], presented: raw });
  assert.equal(flagged.status, 'flag');
  assert.ok(flagged.issues.some(function (issue) { return issue.code === 'missing-fallback' && issue.name === 'title'; }));

  const fine = lab.judgeCase({
    id: 'default',
    probes: [{ name: 'title', scrollWidth: 80, clientWidth: 180, scrollHeight: 24, clientHeight: 48 }],
    presented: lab.presentIssue(lab.defaultMock('issue')),
  });
  assert.equal(fine.status, 'pass');
  assert.equal(lab.issueLabel(flagged.issues[0]).indexOf('Missing fallback'), 0);

  const summary = lab.summarize([flagged, fine]);
  assert.equal(summary.flagged, 1);
  assert.equal(summary.issues, flagged.issues.length);
  assert.equal(lab.summaryText(summary), '1 of 2 cases flagged, ' + flagged.issues.length + ' issues');
});

test('mock JSON has to be an object', function () {
  assert.equal(lab.parseMock('{"title":"Checkout fails"}').ok, true);
  assert.equal(lab.parseMock('[]').ok, false);
  assert.equal(lab.parseMock('{').ok, false);
  assert.match(lab.parseMock('{').error, /JSON:/);
});

test('the page stays local and the catalog links it', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(html, /href="\.\.\/index\.html"/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href="https?:/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width:\s*800px/);
  assert.match(index, /href="state-break-demo\/"/);
  assert.match(readme, /\(state-break-demo\/\)/);
  assert.match(readme, /https:\/\/x\.com\/jakubkrehel\/status\/2123466165204758831/);
  assert.match(readme, /https:\/\/jakub\.kr\/skills/);
});
