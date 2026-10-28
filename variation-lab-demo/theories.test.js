const test = require('node:test');
const assert = require('node:assert/strict');
const Lab = require('./theories.js');

test('the slow loop in the source reads layout every row', () => {
  assert.match(Lab.SLOW_SOURCE, /scrollHeight/);
  assert.match(Lab.SLOW_SOURCE, /appendChild/);
  assert.equal(Lab.THEORIES.length, 4);
  assert.deepEqual(Lab.THEORIES.map(function (item) { return item.id; }), ['nodes', 'layout', 'text', 'paint']);
});

test('row text stays fictional and short is shorter than long', () => {
  const short = Lab.rowText(3, 'short');
  const medium = Lab.rowText(3, 'medium');
  const long = Lab.rowText(3, 'long');
  assert.ok(short.length < medium.length);
  assert.ok(medium.length < long.length);
  assert.match(medium, /fictional/);
  assert.match(long, /fictional/);
  assert.equal(Lab.rowText(3, 'medium'), Lab.rowText(3, 'medium'));
});

test('plans isolate one difference for each theory', () => {
  const count = 200;
  const nodes = Lab.plan('nodes', count);
  assert.equal(nodes[0].mode.read, 'once');
  assert.equal(nodes[1].mode.count, 40);
  assert.equal(nodes[2].mode.read, 'each');
  const layout = Lab.plan('layout', count);
  assert.equal(layout[0].mode.read, 'each');
  assert.equal(layout[1].mode.read, 'once');
  assert.equal(layout[0].mode.text, layout[1].mode.text);
  const text = Lab.plan('text', count);
  assert.equal(text[0].mode.text, 'long');
  assert.equal(text[1].mode.text, 'short');
  assert.equal(text[0].mode.read, 'each');
  const paint = Lab.plan('paint', count);
  assert.equal(paint[0].mode.shadow, true);
  assert.equal(paint[0].mode.read, 'once');
  assert.equal(paint[1].mode.shadow, false);
  assert.equal(paint[1].mode.read, 'each');
  assert.deepEqual(Lab.slowMode(count), {count: 200, read: 'each', text: 'medium', shadow: false});
  assert.throws(function () { Lab.plan('cache', count); }, /Unknown theory/);
});

test('the judge follows the timings it is given', () => {
  assert.equal(Lab.judge('nodes', {many: 6, few: 2, slow: 80}).status, 'not');
  assert.equal(Lab.judge('nodes', {many: 70, few: 20, slow: 80}).status, 'explains');
  assert.equal(Lab.judge('nodes', {many: 2, few: 1, slow: 3}).status, 'inconclusive');

  assert.equal(Lab.judge('layout', {each: 80, once: 4}).status, 'explains');
  assert.equal(Lab.judge('layout', {each: 10, once: 8}).status, 'not');
  assert.equal(Lab.judge('layout', {each: 2, once: 1}).status, 'inconclusive');

  assert.equal(Lab.judge('text', {longEach: 90, shortEach: 30}).status, 'explains');
  assert.equal(Lab.judge('text', {longEach: 82, shortEach: 78}).status, 'not');

  assert.equal(Lab.judge('paint', {decoratedOnce: 5, slow: 80}).status, 'not');
  assert.equal(Lab.judge('paint', {decoratedOnce: 76, slow: 80}).status, 'explains');
  assert.equal(Lab.judge('paint', {decoratedOnce: 2, slow: 4}).status, 'inconclusive');
});

test('the summary names only the checks that lined up', () => {
  const text = Lab.summary([
    {title: 'Too many elements', status: 'not'},
    {title: 'A layout read every row', status: 'explains'},
    {title: 'Long row text', status: 'not'},
    {title: 'A heavy shadow on every row', status: 'inconclusive'},
  ]);
  assert.match(text, /A layout read every row/);
  assert.doesNotMatch(text, /Too many/);
  assert.match(Lab.summary([
    {title: 'A', status: 'inconclusive'},
    {title: 'B', status: 'inconclusive'},
  ]), /too quickly/i);
  assert.equal(Lab.median([4, 9, 2]), 4);
  assert.equal(Lab.formatMs(8.04), '8.0 ms');
  assert.equal(Lab.clampCount(10), Lab.COUNT_MIN);
  assert.equal(Lab.clampCount(9000), Lab.COUNT_MAX);
});
