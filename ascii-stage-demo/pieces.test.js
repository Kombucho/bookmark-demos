const assert = require('node:assert/strict');
const test = require('node:test');
const { NAMES, GALLERY, has } = require('./pieces.js');

test('the catalog is the live ascii.rest list, and the gallery is inside it', function () {
  assert.equal(NAMES.length, 216);
  assert.equal(new Set(NAMES).size, 216);
  assert.equal(has('donut'), true);
  assert.equal(has('night-coast'), true);
  assert.equal(has('not-a-piece'), false);
  ['a0', 'agentmail', 'autumn', 'collabute', 'elm', 'keiki', 'supermemory', 'svelte'].forEach(function (name) {
    assert.equal(has(name), true, name);
  });
  assert.equal(GALLERY.length, 8);
  GALLERY.forEach(function (item) {
    assert.equal(has(item.name), true, item.name);
    assert.ok(item.title);
    assert.ok(item.group);
  });
});
