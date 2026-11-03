// Simulated Messages API bodies for one fictional support conversation.
// Shapes follow Anthropic's message-threads docs. No request is sent.
// Byte counts are the compact JSON body. Token counts are characters ÷ 4.
// Time to first token is 140 ms plus 0.42 ms per body byte. All three are illustrative.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MessageThreads = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MODEL = 'claude-opus-5-5';
  const MAX_TOKENS = 1024;
  const SYSTEM = 'You are a support agent for Northwind. Keep replies short.';
  const BETA = 'message-threads-2026-08-12';
  const VERSION = '2023-06-01';
  const ILLUSTRATIVE = true;

  const TOOLS = [
    {
      name: 'lookup_order',
      description: 'Look up one Northwind order by id.',
      input_schema: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'Order id, such as NW-1842.'
          }
        },
        required: ['order_id']
      }
    }
  ];

  const TURNS = [
    {
      label: 'Opens with an order question',
      user: 'Hi! I have a question about an order.',
      assistant: 'Happy to help. What is the order number?',
      responseId: 'msg_01DemoThreadTurn1aaa'
    },
    {
      label: 'Asks about standard shipping',
      user: 'How long does standard shipping usually take?',
      assistant: 'Standard shipping is 5 to 7 business days.',
      responseId: 'msg_01DemoThreadTurn2bbb'
    },
    {
      label: 'Names the order and the missed departure',
      user: 'The order is NW-1842. It was supposed to leave the harbor on Tuesday.',
      assistant: 'NW-1842 is still at the dock. I can look up a faster option.',
      responseId: 'msg_01DemoThreadTurn3ccc'
    },
    {
      label: 'Asks to switch that order to express',
      user: 'Can you switch NW-1842 to express, and keep the same dock pickup?',
      assistant: 'Express would leave Thursday and keep the dock pickup.',
      responseId: 'msg_01DemoThreadTurn4ddd'
    },
    {
      label: 'Adds a note for the driver',
      user: 'Add a note for the driver: gate B, ask for Mira Holt.',
      assistant: 'Noted. Gate B, ask for Mira Holt.',
      responseId: 'msg_01DemoThreadTurn5eee'
    }
  ];

  function headers(lane) {
    const lines = [
      'POST /v1/messages',
      'content-type: application/json',
      'anthropic-version: ' + VERSION
    ];
    if (lane === 'thread') lines.push('anthropic-beta: ' + BETA);
    return lines;
  }

  function history(turnIndex) {
    const messages = [];
    for (let i = 0; i <= turnIndex; i++) {
      messages.push({ role: 'user', content: TURNS[i].user });
      if (i < turnIndex) messages.push({ role: 'assistant', content: TURNS[i].assistant });
    }
    return messages;
  }

  function body(lane, turnIndex) {
    if (turnIndex < 0 || turnIndex >= TURNS.length) {
      throw new Error('turn out of range');
    }
    if (lane === 'plain') {
      return {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        tools: TOOLS,
        messages: history(turnIndex)
      };
    }
    if (lane !== 'thread') throw new Error('unknown lane');
    if (turnIndex === 0) {
      return {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        cache_control: { type: 'ephemeral' },
        system: SYSTEM,
        tools: TOOLS,
        messages: [{ role: 'user', content: TURNS[0].user }],
        thread: { type: 'create' }
      };
    }
    return {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      cache_control: { type: 'ephemeral' },
      messages: [{ role: 'user', content: TURNS[turnIndex].user }],
      thread: {
        type: 'continue',
        previous_message_id: TURNS[turnIndex - 1].responseId
      }
    };
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(text).length;
  }

  function measure(value) {
    const compact = JSON.stringify(value);
    const bytes = utf8Bytes(compact);
    const tokens = Math.ceil(compact.length / 4);
    return {
      bytes: bytes,
      tokens: tokens,
      ttftMs: Math.round(140 + bytes * 0.42)
    };
  }

  function packetWidth(bytes, maxBytes) {
    const span = maxBytes > 0 ? bytes / maxBytes : 1;
    return Math.round(72 + 160 * span);
  }

  function request(lane, turnIndex) {
    const value = body(lane, turnIndex);
    const size = measure(value);
    return {
      lane: lane,
      turnIndex: turnIndex,
      body: value,
      headers: headers(lane),
      json: JSON.stringify(value, null, 2),
      bytes: size.bytes,
      tokens: size.tokens,
      ttftMs: size.ttftMs,
      responseId: TURNS[turnIndex].responseId,
      user: TURNS[turnIndex].user
    };
  }

  function run() {
    let plainBytes = 0;
    let plainTokens = 0;
    let threadBytes = 0;
    let threadTokens = 0;
    const steps = [];
    for (let i = 0; i < TURNS.length; i++) {
      const plain = request('plain', i);
      const thread = request('thread', i);
      plainBytes += plain.bytes;
      plainTokens += plain.tokens;
      threadBytes += thread.bytes;
      threadTokens += thread.tokens;
      plain.cumulativeBytes = plainBytes;
      plain.cumulativeTokens = plainTokens;
      thread.cumulativeBytes = threadBytes;
      thread.cumulativeTokens = threadTokens;
      steps.push({
        index: i,
        label: TURNS[i].label,
        plain: plain,
        thread: thread
      });
    }
    return steps;
  }

  function compare(step) {
    if (!step) return 'Nothing sent yet. Numbers below stay at zero until a turn goes out.';
    const plain = step.plain;
    const thread = step.thread;
    if (step.index === 0) {
      const extra = thread.bytes - plain.bytes;
      return 'Turn 1 sends the full conversation on both lanes. The thread body is ' +
        extra + ' bytes ' + (extra >= 0 ? 'larger' : 'smaller') +
        ' because it adds thread.create and cache_control. Illustrative.';
    }
    const pct = Math.round(100 * thread.cumulativeBytes / plain.cumulativeBytes);
    return 'Through turn ' + (step.index + 1) + ', the thread lane has sent ' +
      thread.cumulativeBytes + ' body bytes against ' + plain.cumulativeBytes +
      ' on the stateless lane (' + pct + '%). Illustrative.';
  }

  function maxBytes(steps) {
    let max = 1;
    steps.forEach(function (step) {
      if (step.plain.bytes > max) max = step.plain.bytes;
      if (step.thread.bytes > max) max = step.thread.bytes;
    });
    return max;
  }

  return {
    illustrative: ILLUSTRATIVE,
    MODEL: MODEL,
    BETA: BETA,
    SYSTEM: SYSTEM,
    TOOLS: TOOLS,
    TURNS: TURNS,
    headers: headers,
    body: body,
    measure: measure,
    packetWidth: packetWidth,
    request: request,
    run: run,
    compare: compare,
    maxBytes: maxBytes
  };
});
