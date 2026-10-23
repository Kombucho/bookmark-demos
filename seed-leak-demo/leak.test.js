const test = require('node:test');
const assert = require('node:assert/strict');
const leak = require('./leak.js');

function ids(result) {
  return result.drainedIds.slice().sort();
}

function diskText(result) {
  return result.disk.map(function (row) { return row.body; }).join('\n');
}

test('with the safeguards off, plaintext phrases reach an open store and drain every wallet that reused one', () => {
  const result = leak.simulate({}, ['moth', 'pebble']);
  assert.deepEqual(ids(result), ['kindling', 'moth', 'pebble']);
  assert.equal(result.taken, 40 + 25 + 18);
  assert.equal(result.access, 'read');
  assert.equal(result.plaintextAtRest, true);
  assert.deepEqual(result.phrases, ['moth', 'pebble']);
  result.disk.forEach(function (row) {
    assert.equal(row.stored, 'plaintext');
    assert.equal(row.message, '[redacted]');
    assert.match(row.arguments, /^toy-/);
    assert.equal(row.body, row.arguments);
  });
  const harbor = result.wallets.find(function (wallet) { return wallet.id === 'harbor'; });
  const quill = result.wallets.find(function (wallet) { return wallet.id === 'quill'; });
  assert.equal(harbor.drained, false);
  assert.equal(harbor.balance, 30);
  assert.equal(quill.drained, false);
  assert.equal(quill.balance, 12);
  assert.equal(diskText(result).indexOf('toy-harbor'), -1);
  assert.equal(diskText(result).indexOf('toy-quill'), -1);
  assert.equal(result.host, 'log.lantern.invalid');
  assert.equal(result.unit, 'glass');
});

test('creating only Moth does not drain the wallet that reused Pebble’s phrase', () => {
  const result = leak.simulate({}, ['moth']);
  assert.deepEqual(ids(result), ['moth']);
  assert.equal(result.taken, 40);
  const kindling = result.wallets.find(function (wallet) { return wallet.id === 'kindling'; });
  assert.equal(kindling.phraseKey, 'pebble');
  assert.equal(kindling.drained, false);
  assert.equal(kindling.balance, 18);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].action, 'create');
  assert.equal(result.events[0].category, 'navigation');
});

test('leaving the mnemonic out means the log, the store, and the attacker never see a phrase', () => {
  const result = leak.simulate({omitMnemonic: true});
  assert.deepEqual(result.drainedIds, []);
  assert.equal(result.taken, 0);
  assert.equal(result.plaintextAtRest, false);
  result.events.forEach(function (event) {
    assert.equal(event.phraseIncluded, false);
    assert.equal(event.arguments, null);
    assert.match(event.message, /^opened /);
    assert.equal(event.message.indexOf('toy-'), -1);
  });
  result.disk.forEach(function (row) {
    assert.equal(row.stored, 'redacted');
    assert.equal(row.readable, false);
    assert.equal(row.body.indexOf('toy-'), -1);
  });
  const filter = result.steps.find(function (step) { return step.stage === 'filter'; });
  assert.match(filter.text, /never put in the event/i);
});

test('redacting every field stops the navigation arguments, which is the field the message filter missed', () => {
  const open = leak.simulate({});
  const sealed = leak.simulate({redactAll: true});
  assert.match(open.disk[0].arguments, /toy-moth/);
  assert.equal(open.disk[0].message, '[redacted]');
  assert.equal(sealed.disk[0].arguments, '[redacted]');
  assert.equal(sealed.disk[0].message, '[redacted]');
  assert.equal(sealed.plaintextAtRest, false);
  assert.deepEqual(sealed.drainedIds, []);
  assert.equal(diskText(sealed).indexOf('toy-'), -1);
  const missed = open.steps.find(function (step) { return step.stage === 'filter' && step.walletId === 'moth'; });
  assert.match(missed.text, /navigation arguments/i);
});

test('encryption at rest leaves a seal the attacker cannot spend, and TLS still delivered the body to the server', () => {
  const result = leak.simulate({encryptAtRest: true});
  assert.equal(result.access, 'read');
  assert.deepEqual(result.phrases, []);
  assert.deepEqual(result.drainedIds, []);
  result.disk.forEach(function (row) {
    assert.equal(row.stored, 'ciphertext');
    assert.match(row.body, /^seal:/);
    assert.equal(row.body.indexOf('toy-'), -1);
    assert.match(row.arguments, /^toy-/);
  });
  const tls = result.steps.filter(function (step) { return step.stage === 'tls'; });
  assert.equal(tls.length, 2);
  tls.forEach(function (step) { assert.match(step.text, /TLS/); });
  assert.notEqual(leak.toySeal('toy-moth'), leak.toySeal('toy-pebble'));
});

test('a locked store can still hold plaintext, and the attacker’s sweep stays empty', () => {
  const result = leak.simulate({restrictAccess: true});
  assert.equal(result.access, 'denied');
  assert.equal(result.plaintextAtRest, true);
  assert.deepEqual(result.phrases, []);
  assert.deepEqual(result.drainedIds, []);
  assert.match(result.disk[0].body, /toy-moth/);
  const reader = result.steps.find(function (step) { return step.stage === 'reader'; });
  assert.match(reader.text, /still sitting/i);
  const both = leak.simulate({restrictAccess: true, encryptAtRest: true, redactAll: true, omitMnemonic: true});
  assert.equal(both.plaintextAtRest, false);
  assert.deepEqual(both.drainedIds, []);
});

test('hardware and never-imported wallets are not events, even if someone asks to open them', () => {
  const result = leak.simulate({}, ['harbor', 'quill', 'kindling', 'moth', 'nope']);
  assert.deepEqual(result.opened, ['moth']);
  assert.equal(result.events.length, 1);
  assert.deepEqual(ids(result), ['moth']);
  const empty = leak.simulate({}, []);
  assert.deepEqual(empty.opened, []);
  assert.equal(empty.disk.length, 0);
  assert.deepEqual(empty.drainedIds, []);
  assert.equal(empty.taken, 0);
});

test('the walk shows an empty attacker until the read, then the sweep, and the last frame matches the result', () => {
  const result = leak.simulate({});
  const start = leak.frame(result, 0);
  assert.equal(start.disk.length, 0);
  assert.equal(start.access, null);
  assert.equal(start.swept, false);
  assert.deepEqual(start.drainedIds, []);
  assert.equal(start.wallets.every(function (wallet) { return wallet.drained === false; }), true);

  const readerAt = result.steps.findIndex(function (step) { return step.stage === 'reader'; });
  const beforeRead = leak.frame(result, readerAt);
  assert.equal(beforeRead.disk.length, 2);
  assert.equal(beforeRead.access, null);
  assert.equal(beforeRead.phrases.length, 0);
  assert.equal(beforeRead.swept, false);

  const afterRead = leak.frame(result, readerAt + 1);
  assert.equal(afterRead.access, 'read');
  assert.deepEqual(afterRead.phrases, ['moth', 'pebble']);
  assert.equal(afterRead.swept, false);
  assert.equal(afterRead.taken, 0);

  const end = leak.frame(result, result.steps.length);
  assert.equal(end.done, true);
  assert.deepEqual(end.drainedIds.slice().sort(), result.drainedIds.slice().sort());
  assert.equal(end.taken, result.taken);
  assert.equal(result.steps[result.steps.length - 1].stage, 'sweep');
  const stages = result.steps.map(function (step) { return step.stage; });
  assert.deepEqual(stages.slice(0, 4), ['phone', 'filter', 'tls', 'disk']);
});
