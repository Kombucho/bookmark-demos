const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const factory = require('./factory.js');

test('the store starts as six cards on three shelves, with no contradictions', function () {
  const state = factory.createState('curator');
  assert.equal(state.cards.length, 6);
  assert.equal(factory.contradictionCount(state.cards), 0);
  assert.deepEqual(factory.SHELVES.map(function (shelf) { return shelf.id; }), ['skills', 'domain', 'data']);
  const shelves = state.cards.map(function (card) { return card.shelf; }).sort();
  assert.deepEqual(shelves, ['data', 'domain', 'domain', 'skills', 'skills', 'skills']);
  assert.equal(factory.truthBody('bq.column', 0).includes('amount_usd'), true);
  assert.equal(factory.truthBody('bq.column', 1).includes('net_amount_usd'), true);
  assert.throws(function () { factory.createState('both'); }, /unknown mode/);
});

test('day one matches the blog scene, and the next morning the same report raises no flag', function () {
  const morning = factory.createState('curator');
  const day = factory.runDay(morning);
  assert.equal(morning.phase, 'morning');
  assert.equal(morning.cards.length, 6);
  assert.equal(day.summary.finished, 3);
  assert.equal(day.summary.flags, 1);
  assert.equal(day.summary.contradictions, 0);
  const types = day.steps.map(function (step) { return step.type; });
  assert.ok(types.includes('discover'));
  assert.ok(types.includes('flag'));
  assert.ok(types.includes('human'));
  assert.equal(types.includes('write'), false);
  const flag = day.steps.find(function (step) { return step.type === 'flag'; });
  assert.equal(flag.flag.fact, 'bq.column');
  assert.match(flag.flag.note, /net_amount_usd/);
  const human = day.steps.find(function (step) { return step.type === 'human'; });
  assert.equal(human.trace.speaker, 'Mara Chen');
  assert.match(human.trace.text, /Northline — Monthly revenue/);

  const night = factory.runNight(day.state);
  assert.equal(night.summary.diffs, 2);
  assert.equal(night.summary.contradictions, 0);
  assert.equal(night.summary.openFlags, 0);
  assert.equal(night.state.day, 2);
  assert.equal(night.state.phase, 'morning');
  const column = night.state.cards.find(function (card) { return card.id === 'bq.column'; });
  const header = night.state.cards.find(function (card) { return card.id === 'report.header'; });
  assert.equal(column.origin, 'curator');
  assert.match(column.body, /net_amount_usd/);
  assert.match(header.body, /Northline — Monthly revenue/);
  assert.equal(night.state.cards.filter(function (card) { return !card.retired; }).length, 6);
  const diff = night.steps.find(function (step) { return step.type === 'diff' && step.fact === 'bq.column'; });
  assert.ok(diff.words.some(function (word) { return word.type === 'del' && word.text === 'amount_usd.'; }));
  assert.ok(diff.words.some(function (word) { return word.type === 'add' && word.text === 'net_amount_usd.'; }));

  const next = factory.runDay(night.state);
  assert.equal(next.summary.finished, 3);
  assert.equal(next.summary.flags, 0);
  const usedColumn = next.summary.results[0].used.find(function (row) { return row.fact === 'bq.column'; });
  assert.equal(usedColumn.ok, true);
  assert.equal(usedColumn.via, 'shelf');
  assert.match(usedColumn.body, /net_amount_usd/);
});

test('a curator week stays clean, and agents who edit the store leave contradictions', function () {
  const curator = factory.simulateWeek('curator');
  const self = factory.simulateWeek('self');
  assert.equal(curator.length, 7);
  assert.deepEqual(curator.map(function (point) { return point.finished; }), [3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(curator.map(function (point) { return point.flags; }), [1, 0, 1, 1, 1, 1, 0]);
  assert.ok(curator.every(function (point) { return point.contradictions === 0 && point.openFlags === 0; }));
  assert.deepEqual(self.map(function (point) { return point.finished; }), [3, 2, 2, 2, 2, 0, 3]);
  assert.deepEqual(self.map(function (point) { return point.contradictions; }), [2, 4, 5, 7, 8, 11, 11]);
  assert.ok(self[6].contradictions > curator[6].contradictions);
  assert.match(factory.chartBlurb(curator, self), /end at 0/);
  assert.match(factory.chartBlurb(curator, self), /end at 11/);
  assert.match(factory.chartBlurb(curator, self), /newer card/);

  let state = factory.createState('self');
  const day = factory.runDay(state);
  assert.equal(state.cards.length, 6);
  assert.ok(day.steps.some(function (step) { return step.type === 'write'; }));
  assert.equal(day.state.cards.filter(function (card) { return card.origin === 'agent'; }).length, 2);
  const night = factory.runNight(day.state);
  assert.equal(night.summary.diffs, 0);
  assert.equal(night.state.cards.length, day.state.cards.length);
  assert.ok(night.steps.some(function (step) { return step.type === 'idle'; }));
  assert.throws(function () { factory.runNight(factory.createState('curator')); }, /day has to finish/);
});

test('the artifact lines follow the card the worker actually used', function () {
  assert.equal(factory.columnName(factory.truthBody('bq.column', 1)), 'net_amount_usd');
  assert.equal(factory.headerName(factory.truthBody('report.header', 1)), 'Northline — Monthly revenue');
  assert.match(factory.outboundSent(factory.FACTS[3].seed), /launch discount is 20%/);
  assert.equal(factory.outboundSent(factory.truthBody('outbound.script', 4)), 'Hello Sam. Can we book 15 minutes this week?');
  assert.equal(factory.launchUrl(factory.truthBody('launch.script', 5)), 'https://docs.northline.example/atlas');
  const same = factory.diffWords('Pilots stay out.', 'Pilots stay out.');
  assert.ok(same.every(function (word) { return word.type === 'same'; }));
});

test('the catalog links the factory, and the page credits the post', function () {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(index, /href="knowledge-factory-demo\/"/);
  assert.match(page, /hwchase17\/status\/2124181216719151585/);
  assert.match(page, /langchain\.com\/blog\/knowledge-factory/);
  assert.doesNotMatch(page, /<(script|link)[^>]+https?:/);
  assert.match(page, /Fictional/);
});
