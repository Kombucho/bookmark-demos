const assert = require('node:assert/strict');
const test = require('node:test');
const {
  REVIEW_BUDGET,
  TOGGLES,
  CHANGES,
  RULES,
  createRun,
  setConstraint,
  submitNext,
  runAll,
  changeById,
  summarize,
  narrate,
} = require('./gate.js');

function withToggles(overrides, budget) {
  let state = createRun(budget == null ? {} : {budget: budget});
  Object.keys(overrides || {}).forEach(function (key) {
    state = setConstraint(state, key, overrides[key]);
  });
  return state;
}

function resultFor(id, overrides, budget) {
  let state = withToggles(overrides, budget);
  while (state.cursor < CHANGES.length) {
    state = submitNext(state);
    const last = state.results[state.results.length - 1];
    if (last.id === id) return {state: state, result: last};
  }
  throw new Error('missing ' + id);
}

test('the queue is twelve diffs with one defect each, plus two clean ones', function () {
  assert.equal(CHANGES.length, 12);
  assert.equal(new Set(CHANGES.map(function (change) { return change.id; })).size, 12);
  const flagged = CHANGES.filter(function (change) {
    return Object.keys(change.flags).some(function (key) { return change.flags[key]; });
  });
  assert.equal(flagged.length, 10);
  flagged.forEach(function (change) {
    const keys = Object.keys(change.flags).filter(function (key) { return change.flags[key]; });
    assert.equal(keys.length, 1);
    assert.ok(change.incident);
  });
  assert.deepEqual(CHANGES.filter(function (change) { return !change.incident; }).map(function (change) { return change.id; }), [
    'fmt-date',
    'rename-label',
  ]);
  assert.equal(REVIEW_BUDGET, 16);
  assert.equal(TOGGLES.length, 9);
});

test('with every constraint on, gates stop the slop and review keeps minutes', function () {
  const done = runAll(createRun());
  const summary = summarize(done);
  assert.deepEqual(summary.caught, {
    types: 2,
    lint: 4,
    abstraction: 1,
    tests: 1,
    observability: 1,
    review: 1,
  });
  assert.equal(summary.shipped, 2);
  assert.equal(summary.incidents, 0);
  assert.equal(summary.reviewLeft, 6);
  assert.equal(summary.reviewSpent, 10);
  assert.equal(summary.reviewOnAutomatable, 0);
  assert.equal(summarize(done).reviewSpent + summary.reviewLeft, REVIEW_BUDGET);
  assert.equal(narrate(summary), 'Review has 6 minutes left. 10 diffs were stopped. 2 shipped. 0 incidents.');
  assert.equal(resultFor('saturday-close').result.gate, 'review');
  assert.equal(resultFor('load-customer').result.rule, 'types-promise');
  assert.equal(resultFor('search-orders').result.rule, 'lint-sql');
  assert.equal(resultFor('fmt-date').result.outcome, 'shipped');
  assert.equal(resultFor('fmt-date').result.reviewed, true);
});

test('the earliest matching rule wins', function () {
  assert.equal(resultFor('load-customer', {types: false}).result.gate, 'lint');
  assert.equal(resultFor('load-customer', {types: false}).result.rule, 'lint-floating');
  assert.equal(resultFor('load-customer', {lintFloating: false}).result.gate, 'types');
  assert.equal(resultFor('search-orders', {lintSql: false}).result.gate, 'abstraction');
  assert.equal(resultFor('search-orders', {lintSql: false}).result.evidence, 'db.query accepts a Query. This argument is a string.');
  assert.equal(resultFor('search-orders', {abstraction: false}).result.rule, 'lint-sql');
  assert.equal(resultFor('raw-charge', {lintSql: true}).result.gate, 'abstraction');
  assert.equal(resultFor('import-button').result.evidence, 'boundaries: billing imported a module from ui.');
  assert.equal(resultFor('retry-charge').result.gate, 'lint');
  assert.equal(resultFor('tax-rate').result.rule, 'lint-magic');
  assert.equal(resultFor('holiday-discount').result.gate, 'tests');
  assert.equal(resultFor('user-id').result.gate, 'types');
  assert.equal(resultFor('ship-fail').result.gate, 'observability');
});

test('a flag with its gates off ships into an incident once review is short', function () {
  const found = resultFor('search-orders', {lintSql: false, abstraction: false}, 0);
  assert.equal(found.result.outcome, 'incident');
  assert.equal(found.result.incident.name, 'The morning report came back empty');
  const holiday = resultFor('holiday-discount', {tests: false}, 0);
  assert.equal(holiday.result.outcome, 'incident');
  const observed = resultFor('ship-fail', {observability: false}, 0);
  assert.equal(observed.result.outcome, 'incident');
  assert.match(observed.result.incident.detail, /No alert/);
});

test('with the gates off, review spends itself on slop and Saturday ships', function () {
  const done = runAll(withToggles({
    types: false,
    lintFloating: false,
    lintSql: false,
    lintBoundary: false,
    lintCatch: false,
    lintMagic: false,
    abstraction: false,
    tests: false,
    observability: false,
  }));
  const summary = summarize(done);
  assert.equal(summary.caught.review, 3);
  assert.equal(summary.reviewOnAutomatable, 12);
  assert.equal(summary.incidents, 7);
  assert.equal(summary.shipped, 2);
  assert.equal(summary.reviewLeft, 0);
  assert.equal(summary.reviewSpent, 16);
  const saturday = done.results.find(function (result) { return result.id === 'saturday-close'; });
  assert.equal(saturday.outcome, 'incident');
  const label = done.results.find(function (result) { return result.id === 'rename-label'; });
  assert.equal(label.outcome, 'shipped');
  assert.equal(label.reviewed, true);
  assert.equal(narrate(summary), 'Review has 0 minutes left. 3 diffs were stopped. 2 shipped. 7 incidents.');
});

test('a zero review budget still lets gates stop diffs', function () {
  const done = runAll(createRun({budget: 0}));
  const summary = summarize(done);
  assert.equal(summary.caught.types, 2);
  assert.equal(summary.caught.review, 0);
  assert.equal(summary.incidents, 1);
  assert.equal(summary.shipped, 2);
  assert.equal(summary.shippedUnreviewed, 2);
  const saturday = done.results.find(function (result) { return result.id === 'saturday-close'; });
  assert.equal(saturday.outcome, 'incident');
});

test('toggling a constraint does not rewrite diffs already sent', function () {
  let state = createRun();
  state = submitNext(state);
  const first = state.results[0];
  assert.equal(first.id, 'fmt-date');
  state = setConstraint(state, 'types', false);
  state = submitNext(state);
  assert.equal(state.results[0], first);
  assert.equal(state.results[1].id, 'load-customer');
  assert.equal(state.results[1].gate, 'lint');
  assert.equal(state.results.length, 2);
});

test('submit past the end stays put, and unknown constraints throw', function () {
  const done = runAll(createRun());
  assert.equal(submitNext(done), done);
  assert.equal(changeById('tax-rate').file, 'billing/tax.js');
  assert.equal(changeById('missing'), null);
  assert.throws(function () { setConstraint(createRun(), 'nope', true); }, /Unknown constraint/);
  assert.throws(function () { createRun({budget: -1}); }, /whole number/);
  assert.equal(RULES.filter(function (rule) { return rule.flag === 'rawSql'; }).length, 2);
});
