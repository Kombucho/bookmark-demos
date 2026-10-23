const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('./plan.js');

function placeAll(state, rows) {
  let cursor = state;
  rows.forEach(function (row) {
    const next = plan.place(cursor, row[0], row[1]);
    assert.equal(next.ok, true, row[0] + ' at ' + row[1] + ' ' + next.code);
    cursor = next.state;
  });
  return cursor;
}

const SOLO_SPRINT = [
  ['open', 0],
  ['devnet', 1],
  ['aha', 6],
  ['flow', 11],
  ['feedback', 15],
  ['pitch', 20],
];

test('the board is five weeks, the sprint is the first four, and the pitch card is the last week', () => {
  assert.equal(plan.WEEKS, 5);
  assert.equal(plan.WEEK_DAYS, 5);
  assert.equal(plan.DAY_COUNT, 25);
  assert.equal(plan.SPRINT_DAYS, 20);
  assert.equal(plan.PITCH_AT, 20);
  const pitch = plan.SPECS.find(function (spec) { return spec.id === 'pitch'; });
  assert.equal(pitch.days, 5);
  const state = plan.createState();
  assert.equal(state.ideaId, 'kiln');
  assert.equal(state.team, 'solo');
  assert.equal(state.youBuild, true);
  assert.equal(plan.tracksOf(state), 1);
  assert.equal(plan.peopleOf(state), 1);
  assert.equal(plan.usage(state).capacity, 20);
  assert.equal(plan.board(state).days.length, 25);
});

test('a solo sprint that follows the article misses only the cofounder', () => {
  const state = placeAll(plan.createState(), SOLO_SPRINT);
  const report = plan.judge(state);
  assert.equal(report.met, 12);
  assert.equal(report.counted, 13);
  const byId = {};
  report.lines.forEach(function (row) { byId[row.id] = row; });
  assert.equal(byId.cofounder.status, 'missed');
  assert.equal(byId.technical.status, 'met');
  assert.equal(byId.devnet.status, 'met');
  assert.equal(byId.aha.status, 'met');
  assert.equal(byId.core.status, 'met');
  assert.equal(byId.scope.status, 'met');
  assert.equal(byId.open.status, 'met');
  assert.equal(byId.feedback.status, 'met');
  assert.equal(byId.pitch.status, 'met');
  assert.equal(byId.ambitious.status, 'met');
  report.lines.forEach(function (row) {
    assert.equal(row.source.indexOf('Guide,'), 0);
    assert.ok(row.detail.length > 20);
  });
  assert.equal(report.beats.length, 6);
  report.beats.forEach(function (beat) { assert.equal(beat.included, true); });
  assert.match(report.beats[5].text, /one flow/i);
});

test('the pitch card only fits on an empty final week, and feature work there blocks it', () => {
  let state = plan.createState();
  assert.equal(plan.place(state, 'pitch', 0).code, 'NotFinalWeek');
  assert.equal(plan.place(state, 'pitch', 15).code, 'NotFinalWeek');
  state = plan.place(state, 'pitch', 20).state;
  assert.equal(plan.place(state, 'dash', 17).code, 'PitchHolds');

  state = plan.createState();
  state = plan.place(state, 'dash', 17).state;
  const spilled = plan.judge(state);
  const scope = spilled.lines.find(function (row) { return row.id === 'scope'; });
  const pitch = spilled.lines.find(function (row) { return row.id === 'pitch'; });
  assert.equal(scope.status, 'missed');
  assert.equal(pitch.status, 'missed');
  assert.match(pitch.detail, /final week/i);
  assert.equal(plan.place(state, 'pitch', 20).code, 'WeekBusy');
  assert.equal(plan.usage(state).pitchWeek, 1);
  assert.equal(plan.usage(state).sprint, 3);
});

test('an extra placed instead of the core flow is called out, and a finished core may keep an extra that fits', () => {
  let crowded = plan.createState();
  crowded = plan.place(crowded, 'mobile', 0).state;
  const missed = plan.judge(crowded).lines.find(function (row) { return row.id === 'scope'; });
  assert.equal(missed.status, 'missed');
  assert.match(missed.detail, /core flow/i);

  let state = placeAll(plan.createState(), [
    ['devnet', 0],
    ['aha', 5],
    ['flow', 10],
  ]);
  assert.equal(plan.place(state, 'dash', 14).ok, true);
  state = plan.place(state, 'dash', 14).state;
  const scope = plan.judge(state).lines.find(function (row) { return row.id === 'scope'; });
  assert.equal(scope.status, 'met');
  assert.equal(plan.place(state, 'mobile', 14).code, 'Full');
});

test('week 1 is the open-from-the-start slot, and feedback before any core card does not count', () => {
  let late = plan.place(plan.createState(), 'open', 5).state;
  let row = plan.judge(late).lines.find(function (line) { return line.id === 'open'; });
  assert.equal(row.status, 'missed');
  assert.match(row.detail, /week 1/i);

  let early = plan.place(plan.createState(), 'feedback', 0).state;
  early = plan.place(early, 'devnet', 5).state;
  row = plan.judge(early).lines.find(function (line) { return line.id === 'feedback'; });
  assert.equal(row.status, 'missed');
  assert.match(row.detail, /no core card/i);
});

test('a non-technical solo cannot place engineering cards, and a technical cofounder can', () => {
  let solo = plan.setCheck(plan.createState(), 'youBuild', false).state;
  assert.equal(plan.tracksOf(solo), 0);
  assert.equal(plan.place(solo, 'devnet', 0).code, 'NoLead');
  assert.equal(plan.place(solo, 'open', 0).code, 'NoLead');
  const pitch = plan.place(solo, 'pitch', 20);
  assert.equal(pitch.ok, true);
  const report = plan.judge(pitch.state);
  assert.equal(report.lines.find(function (row) { return row.id === 'technical'; }).status, 'missed');
  assert.equal(report.beats.find(function (beat) { return beat.id === 'demo'; }).included, false);

  const paired = plan.setTeam(solo, 'technical').state;
  assert.equal(plan.tracksOf(paired), 1);
  assert.equal(plan.place(paired, 'devnet', 0).ok, true);
});

test('a technical cofounder is a second track, and dropping them drops the card that no longer fits', () => {
  let state = plan.setTeam(plan.createState(), 'technical').state;
  state = plan.place(state, 'devnet', 0).state;
  state = plan.place(state, 'mobile', 0).state;
  const lanes = state.placements.map(function (row) { return row.lane; }).sort();
  assert.deepEqual(lanes, ['build-0', 'build-1']);
  assert.equal(plan.usage(state).capacity, 40);

  const back = plan.setTeam(state, 'solo');
  assert.equal(back.ok, true);
  assert.deepEqual(back.dropped, ['mobile']);
  assert.equal(back.state.placements.length, 1);
  assert.equal(back.state.placements[0].id, 'devnet');
  assert.equal(plan.place(plan.createState(), 'mobile', 0).ok, true);
  assert.equal(plan.place(plan.place(plan.createState(), 'devnet', 0).state, 'mobile', 0).code, 'Full');
});

test('a non-technical cofounder takes the desk cards off the build track', () => {
  let state = plan.setTeam(plan.createState(), 'nontechnical').state;
  assert.equal(plan.tracksOf(state), 1);
  assert.equal(plan.peopleOf(state), 2);
  state = plan.place(state, 'devnet', 0).state;
  state = plan.place(state, 'open', 0).state;
  const open = state.placements.find(function (row) { return row.id === 'open'; });
  const devnet = state.placements.find(function (row) { return row.id === 'devnet'; });
  assert.equal(open.lane, 'desk');
  assert.equal(devnet.lane, 'build-0');
  assert.equal(plan.usage(state).sprint, 5);
  assert.equal(plan.usage(state).desk, 1);
  const line = plan.judge(state).lines.find(function (row) { return row.id === 'cofounder'; });
  assert.equal(line.status, 'met');
  assert.match(line.detail, /above 3/);
});

test('you plus both cofounders can hold the whole catalog beside a clear final week', () => {
  let state = plan.setTeam(plan.createState(), 'both').state;
  assert.equal(plan.peopleOf(state), 3);
  assert.equal(plan.tracksOf(state), 2);
  state = placeAll(state, [
    ['devnet', 0],
    ['aha', 5],
    ['flow', 10],
    ['chain', 14],
    ['mobile', 0],
    ['token', 8],
    ['dash', 15],
    ['open', 0],
    ['feedback', 2],
    ['pitch', 20],
  ]);
  const report = plan.judge(state);
  assert.equal(report.met, 13);
  assert.equal(report.counted, 13);
  assert.equal(report.usage.pitchWeek, 0);
  assert.equal(report.usage.sprint, 39);
  assert.equal(report.usage.capacity, 40);
  const size = report.lines.find(function (row) { return row.id === 'size'; });
  assert.equal(size.counts, false);
  assert.match(size.detail, /not above 3/);
});

test('streetlamp starts without your experience, wick is a public good and does not count the startup-vision line', () => {
  const street = plan.setIdea(plan.createState(), 'streetlamp').state;
  assert.equal(street.personal, false);
  assert.equal(street.experience, false);
  assert.equal(street.market, true);
  assert.equal(street.placements.length, 0);
  const missed = plan.judge(street).lines.filter(function (row) { return row.status === 'missed'; }).map(function (row) { return row.id; });
  assert.ok(missed.indexOf('personal') !== -1);
  assert.ok(missed.indexOf('experience') !== -1);
  assert.equal(plan.judge(street).lines.find(function (row) { return row.id === 'market'; }).status, 'met');

  const wick = plan.setIdea(street, 'wick').state;
  assert.equal(wick.publicGood, true);
  assert.equal(wick.intent, 'contributor');
  assert.equal(wick.ambitious, false);
  const vision = plan.judge(wick).lines.find(function (row) { return row.id === 'ambitious'; });
  assert.equal(vision.status, 'note');
  assert.equal(vision.counts, false);
  const intent = plan.judge(wick).lines.find(function (row) { return row.id === 'intent'; });
  assert.match(intent.detail, /public good/i);
  assert.match(intent.detail, /grant/i);
});

test('a typed idea uses the typed line, and the checks stay the user’s claim', () => {
  let state = plan.setIdea(plan.createState(), 'custom').state;
  assert.equal(state.market, false);
  state = plan.setText(state, 'customName', 'Lantern').state;
  state = plan.setText(state, 'customLine', 'A lamp for night markets.').state;
  state = plan.setText(state, 'customAha', 'Light one stall').state;
  state = plan.setCheck(state, 'market', true).state;
  const view = plan.ideaView(state);
  assert.equal(view.name, 'Lantern');
  assert.match(view.line, /night markets/);
  const aha = plan.catalog(state).find(function (feature) { return feature.id === 'aha'; });
  assert.equal(aha.name, 'Light one stall');
  assert.equal(plan.judge(state).lines.find(function (row) { return row.id === 'market'; }).status, 'met');
  assert.equal(plan.judge(state).lines.find(function (row) { return row.id === 'personal'; }).status, 'missed');
  const huge = plan.setText(state, 'customName', 'x'.repeat(200)).state;
  assert.equal(huge.customName.length, 80);
});

test('day weights are fixed, the devnet card occupies five days, and bad drops do not change the board', () => {
  const weights = {};
  plan.SPECS.forEach(function (spec) { weights[spec.id] = spec.days; });
  assert.deepEqual(weights, {
    devnet: 5,
    aha: 5,
    flow: 4,
    mobile: 8,
    token: 7,
    chain: 6,
    dash: 4,
    open: 1,
    feedback: 2,
    pitch: 5,
  });
  const buildDays = plan.SPECS.filter(function (spec) { return spec.kind !== 'pitch'; }).reduce(function (sum, spec) {
    return sum + spec.days;
  }, 0);
  assert.equal(buildDays, 42);
  assert.ok(buildDays > 20);

  const state = plan.createState();
  const placed = plan.place(state, 'devnet', 0);
  assert.equal(placed.state.placements[0].lane, 'build-0');
  const days = plan.board(placed.state).days;
  assert.equal(days[0].cells[0].id, 'devnet');
  assert.equal(days[4].cells[0].index, 4);
  assert.equal(days[5].cells.length, 0);
  assert.equal(plan.place(placed.state, 'devnet', 10).code, 'Already');
  assert.equal(plan.place(state, 'nope', 0).code, 'Unknown');
  assert.equal(plan.place(state, 'devnet', 21).code, 'Outside');
  assert.equal(plan.place(state, 'devnet', 1.5).code, 'Outside');
  assert.equal(plan.place(state, 'devnet', 21).state, state);
  assert.match(plan.reason('NoLead'), /technical lead/i);
  const during = plan.judge(state).lines.find(function (row) { return row.id === 'during'; });
  assert.match(during.detail, /two months/i);
  assert.equal(during.counts, false);
});
