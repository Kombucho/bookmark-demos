// Three toy functions over bytes. The "proof" is a loop that tries every input.
// It is not Rocq, and it is not a proof about the libraries in the Anthropic post.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BoundedCheck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DOMAIN = 256;
  const PLANE = DOMAIN * DOMAIN;
  const COPY_SPACE = DOMAIN * DOMAIN * DOMAIN;

  const BOUNDS_TESTS = [
    { index: 0, length: 5 },
    { index: 4, length: 5 },
    { index: 5, length: 4 },
    { index: 2, length: 8 },
    { index: 7, length: 3 },
  ];

  const LENGTH_TESTS = [
    { count: 0, size: 0 },
    { count: 1, size: 1 },
    { count: 2, size: 3 },
    { count: 8, size: 8 },
    { count: 15, size: 15 },
    { count: 1, size: 255 },
  ];

  const COPY_TESTS = [
    { start: 0, count: 4, capacity: 10 },
    { start: 3, count: 5, capacity: 10 },
    { start: 10, count: 1, capacity: 10 },
    { start: 2, count: 20, capacity: 10 },
    { start: 1, count: 1, capacity: 5 },
  ];

  function compileBounds(expression) {
    const source = String(expression || '').trim();
    if (!source) return { ok: false, error: 'The return line is empty.' };
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const ch = source[index];
      if (/\s/.test(ch)) {
        index += 1;
        continue;
      }
      const two = source.slice(index, index + 2);
      if (two === '<=' || two === '>=' || two === '==' || two === '!=' || two === '&&' || two === '||') {
        tokens.push(two);
        index += 2;
        continue;
      }
      if (ch === '<' || ch === '>' || ch === '(' || ch === ')') {
        tokens.push(ch);
        index += 1;
        continue;
      }
      const word = /^[A-Za-z]+/.exec(source.slice(index));
      if (word) {
        if (word[0] !== 'index' && word[0] !== 'length') {
          return { ok: false, error: 'Only index and length can be named here.' };
        }
        tokens.push(word[0]);
        index += word[0].length;
        continue;
      }
      const num = /^\d+/.exec(source.slice(index));
      if (num) {
        if (Number(num[0]) > 255) return { ok: false, error: 'Keep numbers in 0…255.' };
        tokens.push(num[0]);
        index += num[0].length;
        continue;
      }
      return { ok: false, error: 'Use comparisons, parentheses, &&, and ||.' };
    }

    let cursor = 0;
    function peek() { return tokens[cursor]; }
    function parseOr() {
      let left = parseAnd();
      while (peek() === '||') {
        cursor += 1;
        left = { op: '||', left: left, right: parseAnd() };
      }
      return left;
    }
    function parseAnd() {
      let left = parseCmp();
      while (peek() === '&&') {
        cursor += 1;
        left = { op: '&&', left: left, right: parseCmp() };
      }
      return left;
    }
    function parseCmp() {
      if (peek() === '(') {
        cursor += 1;
        const inner = parseOr();
        if (peek() !== ')') throw new Error('A parenthesis is missing.');
        cursor += 1;
        return inner;
      }
      const left = parseAtom();
      const op = peek();
      if (op !== '<' && op !== '>' && op !== '<=' && op !== '>=' && op !== '==' && op !== '!=') {
        throw new Error('Each piece needs a comparison.');
      }
      cursor += 1;
      return { op: op, left: left, right: parseAtom() };
    }
    function parseAtom() {
      const token = peek();
      if (token === 'index' || token === 'length') {
        cursor += 1;
        return { name: token };
      }
      if (token !== undefined && /^\d+$/.test(token)) {
        cursor += 1;
        return { value: Number(token) };
      }
      throw new Error('Expected index, length, or a number.');
    }

    let ast;
    try {
      ast = parseOr();
      if (cursor !== tokens.length) throw new Error('Could not read the rest of the line.');
    } catch (error) {
      return { ok: false, error: error.message };
    }

    function evaluate(node, env) {
      if (Object.prototype.hasOwnProperty.call(node, 'value')) return node.value;
      if (node.name) return env[node.name];
      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);
      if (node.op === '<') return left < right;
      if (node.op === '>') return left > right;
      if (node.op === '<=') return left <= right;
      if (node.op === '>=') return left >= right;
      if (node.op === '==') return left === right;
      if (node.op === '!=') return left !== right;
      if (node.op === '&&') return !!(left && right);
      if (node.op === '||') return !!(left || right);
      throw new Error('Unknown operator.');
    }

    return {
      ok: true,
      fn: function (indexValue, lengthValue) {
        return !!evaluate(ast, { index: indexValue, length: lengthValue });
      },
    };
  }

  function boundsExpected(index, length) {
    return index < length;
  }

  function judgeBounds(expression, index, length) {
    const compiled = compileBounds(expression);
    if (!compiled.ok) return { ok: false, error: compiled.error };
    const actual = compiled.fn(index, length);
    const expected = boundsExpected(index, length);
    return { ok: true, actual: actual, expected: expected, pass: actual === expected };
  }

  function byteLength(count, size, guard) {
    const product = count * size;
    if (guard) {
      if (product > 255) return { ok: false, value: null };
      return { ok: true, value: product };
    }
    return { ok: true, value: product & 255 };
  }

  function lengthExpected(count, size) {
    const product = count * size;
    if (product > 255) return { ok: false, value: null };
    return { ok: true, value: product };
  }

  function judgeLength(count, size, guard) {
    const actual = byteLength(count, size, guard);
    const expected = lengthExpected(count, size);
    const pass = actual.ok === expected.ok && actual.value === expected.value;
    return { ok: true, actual: actual, expected: expected, pass: pass, product: count * size };
  }

  function copyAt(start, count, capacity, guard) {
    if (guard) {
      if (count > capacity) return false;
      if (start > capacity - count) return false;
      return true;
    }
    if (start > capacity) return false;
    if (count > capacity) return false;
    const end = (start + count) & 255;
    return end <= capacity;
  }

  function copyExpected(start, count, capacity) {
    return start + count <= capacity;
  }

  function judgeCopy(start, count, capacity, guard) {
    const actual = copyAt(start, count, capacity, guard);
    const expected = copyExpected(start, count, capacity);
    return {
      ok: true,
      actual: actual,
      expected: expected,
      pass: actual === expected,
      sum: start + count,
    };
  }

  function runBoundsTests(expression) {
    return BOUNDS_TESTS.map(function (row) {
      const judged = judgeBounds(expression, row.index, row.length);
      return Object.assign({ inputs: row }, judged);
    });
  }

  function runLengthTests(guard) {
    return LENGTH_TESTS.map(function (row) {
      const judged = judgeLength(row.count, row.size, guard);
      return Object.assign({ inputs: row }, judged);
    });
  }

  function runCopyTests(guard) {
    return COPY_TESTS.map(function (row) {
      const judged = judgeCopy(row.start, row.count, row.capacity, guard);
      return Object.assign({ inputs: row }, judged);
    });
  }

  function proveBounds(expression) {
    const compiled = compileBounds(expression);
    if (!compiled.ok) return { ok: false, error: compiled.error };
    const plane = new Uint8Array(PLANE);
    let failed = 0;
    let first = null;
    for (let length = 0; length < DOMAIN; length += 1) {
      for (let index = 0; index < DOMAIN; index += 1) {
        const actual = compiled.fn(index, length);
        const expected = index < length;
        const pass = actual === expected;
        plane[length * DOMAIN + index] = pass ? 1 : 0;
        if (pass) continue;
        failed += 1;
        if (!first) first = { index: index, length: length, actual: actual, expected: expected };
      }
    }
    return { ok: true, total: PLANE, failed: failed, first: first, plane: plane };
  }

  function proveLength(guard) {
    const plane = new Uint8Array(PLANE);
    let failed = 0;
    let first = null;
    for (let size = 0; size < DOMAIN; size += 1) {
      for (let count = 0; count < DOMAIN; count += 1) {
        const judged = judgeLength(count, size, guard);
        plane[size * DOMAIN + count] = judged.pass ? 1 : 0;
        if (judged.pass) continue;
        failed += 1;
        if (!first) {
          first = {
            count: count,
            size: size,
            actual: judged.actual,
            expected: judged.expected,
            product: judged.product,
          };
        }
      }
    }
    return { ok: true, total: PLANE, failed: failed, first: first, plane: plane };
  }

  function proveCopy(guard) {
    const strip = new Uint8Array(DOMAIN);
    let failed = 0;
    let first = null;
    let featured = null;
    for (let capacity = 0; capacity < DOMAIN; capacity += 1) {
      for (let count = 0; count < DOMAIN; count += 1) {
        for (let start = 0; start < DOMAIN; start += 1) {
          const actual = copyAt(start, count, capacity, guard);
          const expected = start + count <= capacity;
          if (actual === expected) continue;
          failed += 1;
          strip[capacity] = 1;
          const row = { start: start, count: count, capacity: capacity, actual: actual, expected: expected, sum: start + count };
          if (!first) first = row;
          if (!featured && start + count >= 300 && actual === true) featured = row;
        }
      }
    }
    return {
      ok: true,
      total: COPY_SPACE,
      failed: failed,
      first: first,
      featured: featured || first,
      strip: strip,
    };
  }

  function copyPlane(capacity, guard) {
    const plane = new Uint8Array(PLANE);
    let failed = 0;
    for (let count = 0; count < DOMAIN; count += 1) {
      for (let start = 0; start < DOMAIN; start += 1) {
        const pass = copyAt(start, count, capacity, guard) === (start + count <= capacity);
        plane[count * DOMAIN + start] = pass ? 1 : 0;
        if (!pass) failed += 1;
      }
    }
    return { plane: plane, failed: failed, total: PLANE };
  }

  function boundsSource(expression) {
    return 'function inRange(index, length) {\n  return ' + expression.trim() + ';\n}';
  }

  function lengthSource(guard) {
    if (guard) {
      return [
        'function byteLength(count, size) {',
        '  const product = count * size;',
        '  if (product > 255) return { ok: false, value: null };',
        '  return { ok: true, value: product };',
        '}',
      ].join('\n');
    }
    return [
      'function byteLength(count, size) {',
      '  const product = count * size;',
      '  return { ok: true, value: product & 0xff };',
      '}',
    ].join('\n');
  }

  function copySource(guard) {
    if (guard) {
      return [
        'function copyAt(start, count, capacity) {',
        '  if (count > capacity) return false;',
        '  if (start > capacity - count) return false;',
        '  return true;',
        '}',
      ].join('\n');
    }
    return [
      'function copyAt(start, count, capacity) {',
      '  if (start > capacity) return false;',
      '  if (count > capacity) return false;',
      '  const end = (start + count) & 0xff;',
      '  return end <= capacity;',
      '}',
    ].join('\n');
  }

  return {
    DOMAIN: DOMAIN,
    PLANE: PLANE,
    COPY_SPACE: COPY_SPACE,
    BOUNDS_TESTS: BOUNDS_TESTS,
    LENGTH_TESTS: LENGTH_TESTS,
    COPY_TESTS: COPY_TESTS,
    compileBounds: compileBounds,
    judgeBounds: judgeBounds,
    judgeLength: judgeLength,
    judgeCopy: judgeCopy,
    byteLength: byteLength,
    copyAt: copyAt,
    runBoundsTests: runBoundsTests,
    runLengthTests: runLengthTests,
    runCopyTests: runCopyTests,
    proveBounds: proveBounds,
    proveLength: proveLength,
    proveCopy: proveCopy,
    copyPlane: copyPlane,
    boundsSource: boundsSource,
    lengthSource: lengthSource,
    copySource: copySource,
  };
});
