const test = require('node:test');
const assert = require('node:assert/strict');
const threads = require('./thread.js');

test('the sample is labeled illustrative and follows the documented turn shape', () => {
  assert.equal(threads.illustrative, true);
  assert.equal(threads.BETA, 'message-threads-2026-08-12');
  assert.equal(threads.TURNS.length, 5);
  const steps = threads.run();
  assert.equal(steps.length, 5);

  steps.forEach(function (step, i) {
    const plain = step.plain.body;
    const thread = step.thread.body;
    assert.equal(plain.model, threads.MODEL);
    assert.equal(thread.model, threads.MODEL);
    assert.equal(plain.max_tokens, thread.max_tokens);
    assert.equal(plain.system, threads.SYSTEM);
    assert.equal(plain.tools.length, 1);
    assert.equal(plain.messages.length, i * 2 + 1);
    assert.equal(plain.messages[plain.messages.length - 1].role, 'user');
    assert.equal(plain.messages[plain.messages.length - 1].content, threads.TURNS[i].user);
    assert.equal(Object.prototype.hasOwnProperty.call(plain, 'thread'), false);
    assert.equal(step.plain.headers.indexOf('anthropic-beta: message-threads-2026-08-12') === -1, true);
    assert.equal(step.thread.headers.indexOf('anthropic-beta: message-threads-2026-08-12') !== -1, true);

    if (i === 0) {
      assert.deepEqual(thread.thread, { type: 'create' });
      assert.equal(thread.system, threads.SYSTEM);
      assert.equal(thread.tools.length, 1);
      assert.equal(thread.messages.length, 1);
      assert.equal(step.thread.bytes > step.plain.bytes, true);
    } else {
      assert.equal(Object.prototype.hasOwnProperty.call(thread, 'system'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(thread, 'tools'), false);
      assert.equal(thread.messages.length, 1);
      assert.equal(thread.messages[0].content, threads.TURNS[i].user);
      assert.deepEqual(thread.thread, {
        type: 'continue',
        previous_message_id: threads.TURNS[i - 1].responseId
      });
      assert.deepEqual(thread.cache_control, { type: 'ephemeral' });
      assert.equal(step.thread.bytes < step.plain.bytes, true);
      assert.equal(step.plain.bytes > steps[i - 1].plain.bytes, true);
      assert.equal(step.thread.ttftMs < step.plain.ttftMs, true);
    }
  });

  assert.equal(steps[4].thread.cumulativeBytes < steps[4].plain.cumulativeBytes / 2, true);
  assert.equal(steps[4].thread.cumulativeTokens < steps[4].plain.cumulativeTokens, true);
});

test('token and time figures are the documented illustration, not a measurement', () => {
  const sample = threads.measure({ hello: 'northwind' });
  const compact = JSON.stringify({ hello: 'northwind' });
  assert.equal(sample.bytes, new TextEncoder().encode(compact).length);
  assert.equal(sample.tokens, Math.ceil(compact.length / 4));
  assert.equal(sample.ttftMs, Math.round(140 + sample.bytes * 0.42));
  const steps = threads.run();
  const width = threads.packetWidth(steps[4].plain.bytes, threads.maxBytes(steps));
  assert.equal(width > threads.packetWidth(steps[4].thread.bytes, threads.maxBytes(steps)), true);
  assert.equal(threads.compare(null).indexOf('Nothing sent') === 0, true);
  assert.equal(threads.compare(steps[0]).indexOf('Illustrative.') !== -1, true);
  assert.equal(threads.compare(steps[4]).indexOf('Illustrative.') !== -1, true);
});
