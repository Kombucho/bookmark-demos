const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shelf = require('./shelf.js');

test('fourteen books, each stage and summary from the shelf, partitioned into nine layers', function () {
  assert.equal(shelf.BOOKS.length, 14);
  assert.equal(shelf.LAYERS.length, 9);
  const ids = shelf.BOOKS.map(function (book) { return book.id; });
  assert.equal(new Set(ids).size, 14);
  shelf.BOOKS.forEach(function (book) {
    assert.ok(book.summary.length > 20);
    assert.equal(book.summary.indexOf('"'), -1);
    assert.ok(book.topics.length >= 2);
    assert.ok(book.stage);
    assert.equal(shelf.bookById(book.id).title, book.title);
  });
  const csapp = shelf.bookById('csapp');
  assert.equal(csapp.stage, 'The Machine');
  assert.equal(csapp.summary, 'How code actually runs: bits, assembly, memory, linking, I/O.');
  assert.equal(shelf.bookById('aie').stage, 'AI Engineering');
  assert.equal(shelf.bookById('ostep').n, 2);
  const seen = [];
  shelf.LAYERS.forEach(function (layer) {
    layer.books.forEach(function (id) {
      assert.ok(shelf.bookById(id));
      seen.push(id);
    });
  });
  assert.deepEqual(seen.slice().sort(), ids.slice().sort());
  assert.deepEqual(shelf.LAYERS.map(function (layer) { return layer.name; }), [
    'Hardware', 'OS', 'Network', 'Data', 'Services', 'Infra', 'Ops', 'ML', 'LLM apps',
  ]);
  assert.deepEqual(shelf.booksOnShelf(3).map(function (book) { return book.id; }), ['dl', 'dmls', 'llm', 'aie']);
  assert.equal(shelf.pad(4), '04');
  assert.equal(shelf.pad(14), '14');
});

test('a layer lights only when every book on it is marked, and the sentence names the first gap', function () {
  const none = shelf.layerView([]);
  assert.ok(none.every(function (layer) { return layer.state === 'off'; }));
  assert.match(shelf.pathSentence(none), /Nothing is lit yet/);

  const partial = shelf.layerView(['sdi']);
  const services = partial.find(function (layer) { return layer.id === 'services'; });
  assert.equal(services.state, 'partial');
  assert.equal(services.have, 1);
  assert.equal(partial.find(function (layer) { return layer.id === 'hardware'; }).state, 'off');

  const one = shelf.layerView(['csapp', 'csapp', 'nope']);
  assert.equal(one[0].state, 'lit');
  assert.equal(one.filter(function (layer) { return layer.state === 'lit'; }).length, 1);
  assert.match(shelf.pathSentence(one), /1 of 9/);
  assert.match(shelf.pathSentence(one), /OS still needs 1 book/);

  const all = shelf.layerView(shelf.BOOKS.map(function (book) { return book.id; }));
  assert.ok(all.every(function (layer) { return layer.state === 'lit'; }));
  assert.match(shelf.pathSentence(all), /All nine layers are lit/);

  const infra = shelf.layerView(['docker', 'k8s']);
  assert.equal(infra.find(function (layer) { return layer.id === 'infra'; }).state, 'partial');
  assert.match(shelf.pathSentence(shelf.layerView(['csapp'])), /OS still needs 1 book/);
});

test('read marks round-trip through storage and drop unknown ids', function () {
  const mem = {
    value: null,
    getItem: function () { return this.value; },
    setItem: function (key, value) { this.value = value; assert.equal(key, shelf.STORAGE_KEY); },
  };
  assert.deepEqual(shelf.loadRead(null), []);
  assert.deepEqual(shelf.loadRead({ getItem: function () { return '{'; } }), []);
  assert.deepEqual(shelf.loadRead({ getItem: function () { return '"nope"'; } }), []);
  const saved = shelf.saveRead(mem, ['aie', 'csapp', 'missing', 'csapp']);
  assert.deepEqual(saved, ['aie', 'csapp']);
  assert.deepEqual(shelf.loadRead(mem), ['aie', 'csapp']);
  assert.equal(shelf.STORAGE_KEY, 'bookmark-demos.engineering-shelf.v1');
});

test('the catalog links the shelf, and the page credits the post', function () {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(index, /href="engineering-shelf-demo\/"/);
  assert.match(page, /vineerpasam\/status\/2124902293254594759/);
  assert.match(page, /layoffsandhires\.com\/engineering/);
  assert.doesNotMatch(page, /<(script|link)[^>]+https?:/);
});
