// A toy MiniChain. One ledger, one guest, one hash-linked head.
// ETH is the only asset. Every internal wei is counted against ETH the
// contract holds. Fees move inside that ledger. Nothing here talks to a
// network, and the hashes are SHA-256 stand-ins for the chain's own hash.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MiniChain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ETHER = 10n ** 18n;
  const MOD = 1n << 256n;
  const FEE = ETHER / 1000n;
  const GENESIS = '0x' + '00'.repeat(32);
  const GUEST = '0x000000000000000000000000000000000000c047';
  const COUNTER_HEX = '130100001602000003020201170002001a020000';

  const OPCODES = {
    0x00: 'STOP',
    0x01: 'CONST',
    0x02: 'MOV',
    0x03: 'ADD',
    0x13: 'CALLDATALOAD',
    0x16: 'SLOAD',
    0x17: 'SSTORE',
    0x1a: 'RETURN',
  };

  function parseHex(hex) {
    const clean = String(hex).replace(/^0x/, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
    return bytes;
  }

  function formatOp(op) {
    if (!op || !op.name) return '';
    if (op.name === 'CONST') return 'CONST r' + op.a + ', ' + op.literal.toString();
    if (op.name === 'MOV') return 'MOV r' + op.a + ', r' + op.b;
    if (op.name === 'ADD') return 'ADD r' + op.a + ', r' + op.b + ', r' + op.c;
    if (op.name === 'CALLDATALOAD' || op.name === 'SLOAD') return op.name + ' r' + op.a + ', r' + op.b;
    if (op.name === 'SSTORE') return 'SSTORE r' + op.a + ', r' + op.b;
    if (op.name === 'RETURN') return 'RETURN r' + op.a;
    if (op.name === 'STOP') return 'STOP';
    return op.name;
  }

  function disassemble(bytes) {
    const ops = [];
    let pc = 0;
    while (pc < bytes.length) {
      if (pc + 4 > bytes.length) {
        ops.push({ pc: pc, op: bytes[pc], name: 'INVALID', width: bytes.length - pc });
        break;
      }
      const op = bytes[pc];
      const a = bytes[pc + 1];
      const b = bytes[pc + 2];
      const c = bytes[pc + 3];
      const name = OPCODES[op];
      if (!name) {
        ops.push({ pc: pc, op: op, a: a, b: b, c: c, name: 'INVALID', width: 4 });
        break;
      }
      if (op === 0x01) {
        if (pc + 36 > bytes.length) {
          ops.push({ pc: pc, op: op, a: a, b: b, c: c, name: 'INVALID', width: bytes.length - pc });
          break;
        }
        let literal = 0n;
        for (let i = 0; i < 32; i++) literal = (literal << 8n) + BigInt(bytes[pc + 4 + i]);
        ops.push({ pc: pc, op: op, a: a, b: b, c: c, name: 'CONST', literal: literal, width: 36 });
        pc += 36;
        continue;
      }
      ops.push({ pc: pc, op: op, a: a, b: b, c: c, name: name, width: 4 });
      pc += 4;
    }
    return ops;
  }

  function fresh() {
    return {
      held: 0n,
      height: 0,
      head: GENESIS,
      accounts: { alice: 0n, bob: 0n, owner: 0n },
      guest: null,
      blocks: [],
    };
  }

  function clone(state) {
    return {
      held: state.held,
      height: state.height,
      head: state.head,
      accounts: {
        alice: state.accounts.alice,
        bob: state.accounts.bob,
        owner: state.accounts.owner,
      },
      guest: state.guest ? {
        address: state.guest.address,
        code: state.guest.code.slice(),
        storage: Object.assign({}, state.guest.storage),
        balance: state.guest.balance,
      } : null,
      blocks: state.blocks.slice(),
    };
  }

  function owed(state) {
    let sum = state.accounts.alice + state.accounts.bob + state.accounts.owner;
    if (state.guest) sum += state.guest.balance;
    return sum;
  }

  function invariant(state) {
    return owed(state) === state.held;
  }

  function isWho(who) {
    return who === 'alice' || who === 'bob';
  }

  function fail(state, message) {
    return { ok: false, error: message, state: state, block: null, run: null };
  }

  function storageGet(storage, slot) {
    const key = slot.toString();
    return storage[key] != null ? BigInt(storage[key]) : 0n;
  }

  function execute(code, storage, word, budget) {
    const regs = Array.from({ length: 16 }, function () { return 0n; });
    const mem = Object.assign({}, storage);
    const trace = [];
    const input = BigInt(word);
    let pc = 0;
    let steps = 0;
    const limit = Number(budget);
    while (pc < code.length) {
      if (steps >= limit) {
        return {
          ok: false,
          reason: 'Step budget exhausted.',
          steps: steps,
          trace: trace,
          storage: storage,
          regs: regs,
          returned: null,
          haltedAt: pc,
        };
      }
      if (pc + 4 > code.length) {
        return {
          ok: false,
          reason: 'The program ended mid-instruction.',
          steps: steps,
          trace: trace,
          storage: storage,
          regs: regs,
          returned: null,
          haltedAt: pc,
        };
      }
      const op = code[pc];
      const a = code[pc + 1];
      const b = code[pc + 2];
      const c = code[pc + 3];
      const name = OPCODES[op];
      if (!name || a > 15 || b > 15 || c > 15) {
        return {
          ok: false,
          reason: 'Unknown opcode at byte ' + pc + '.',
          steps: steps,
          trace: trace,
          storage: storage,
          regs: regs,
          returned: null,
          haltedAt: pc,
        };
      }
      steps += 1;
      let width = 4;
      if (op === 0x01) {
        if (pc + 36 > code.length) {
          return {
            ok: false,
            reason: 'CONST ran off the end of the code.',
            steps: steps,
            trace: trace,
            storage: storage,
            regs: regs,
            returned: null,
            haltedAt: pc,
          };
        }
        let literal = 0n;
        for (let i = 0; i < 32; i++) literal = (literal << 8n) + BigInt(code[pc + 4 + i]);
        regs[a] = literal % MOD;
        width = 36;
      } else if (op === 0x02) {
        regs[a] = regs[b];
      } else if (op === 0x03) {
        regs[a] = (regs[b] + regs[c]) % MOD;
      } else if (op === 0x13) {
        regs[a] = regs[b] === 0n ? input % MOD : 0n;
      } else if (op === 0x16) {
        regs[a] = storageGet(mem, regs[b]);
      } else if (op === 0x17) {
        mem[regs[a].toString()] = regs[b].toString();
      } else if (op === 0x1a || op === 0x00) {
        trace.push({
          pc: pc, op: op, a: a, b: b, c: c, name: name, steps: steps, width: width,
          regs: regs.slice(),
        });
        return {
          ok: true,
          reason: '',
          steps: steps,
          trace: trace,
          storage: mem,
          regs: regs,
          returned: op === 0x1a ? regs[a] : null,
          haltedAt: null,
        };
      }
      trace.push({
        pc: pc, op: op, a: a, b: b, c: c, name: name, steps: steps, width: width,
        regs: regs.slice(),
      });
      pc += width;
    }
    return {
      ok: true,
      reason: '',
      steps: steps,
      trace: trace,
      storage: mem,
      regs: regs,
      returned: null,
      haltedAt: null,
    };
  }

  function payloadOf(prev, height, op) {
    return prev + '|' + String(height) + '|' + JSON.stringify(op);
  }

  async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(digest)).map(function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    return '0x' + hex;
  }

  async function appendBlock(state, op, status) {
    const height = state.height + 1;
    const payload = payloadOf(state.head, height, op);
    const head = await sha256(payload);
    const block = {
      height: height,
      prev: state.head,
      head: head,
      op: op,
      status: status,
      payload: payload,
    };
    state.height = height;
    state.head = head;
    state.blocks = state.blocks.concat([block]);
    return block;
  }

  function parseEth(text) {
    const source = String(text == null ? '' : text).trim();
    if (!/^\d+(\.\d+)?$/.test(source)) return null;
    const parts = source.split('.');
    const whole = parts[0];
    const frac = parts[1] || '';
    if (frac.length > 18) return null;
    if (whole.length > 6) return null;
    const padded = (frac + '000000000000000000').slice(0, 18);
    return BigInt(whole) * ETHER + BigInt(padded);
  }

  function formatEth(wei) {
    const negative = wei < 0n;
    let value = negative ? -wei : wei;
    const whole = value / ETHER;
    const frac = (value % ETHER).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    const body = frac ? whole.toString() + '.' + frac : whole.toString();
    return (negative ? '-' : '') + body;
  }

  function shortHash(hex) {
    return String(hex).slice(2, 10);
  }

  async function deposit(state, who, amount) {
    if (!isWho(who)) return fail(state, 'Choose Alice or Bob.');
    if (typeof amount !== 'bigint' || amount <= 0n) return fail(state, 'Deposit more than zero.');
    if (amount > 1000n * ETHER) return fail(state, 'This desk stops at 1,000 ETH.');
    const next = clone(state);
    next.accounts[who] += amount;
    next.held += amount;
    const op = { kind: 'deposit', who: who, amount: amount.toString(), fee: '0' };
    const block = await appendBlock(next, op, 'ok');
    return { ok: true, error: '', state: next, block: block, run: null };
  }

  async function withdraw(state, who, amount) {
    if (!isWho(who)) return fail(state, 'Choose Alice or Bob.');
    if (typeof amount !== 'bigint' || amount <= 0n) return fail(state, 'Withdraw more than zero.');
    if (state.accounts[who] < amount) {
      return fail(state, nameOf(who) + ' has ' + formatEth(state.accounts[who]) + ' ETH inside.');
    }
    const next = clone(state);
    next.accounts[who] -= amount;
    next.held -= amount;
    const op = { kind: 'withdraw', who: who, amount: amount.toString(), fee: '0' };
    const block = await appendBlock(next, op, 'ok');
    return { ok: true, error: '', state: next, block: block, run: null };
  }

  async function transfer(state, from, to, amount) {
    if (!isWho(from) || !isWho(to) || from === to) return fail(state, 'Transfer between Alice and Bob.');
    if (typeof amount !== 'bigint' || amount <= 0n) return fail(state, 'Transfer more than zero.');
    const cost = amount + FEE;
    if (state.accounts[from] < cost) {
      return fail(state, nameOf(from) + ' needs ' + formatEth(cost) + ' ETH inside, including the 0.001 ETH fee.');
    }
    const next = clone(state);
    next.accounts[from] -= cost;
    next.accounts[to] += amount;
    next.accounts.owner += FEE;
    const op = { kind: 'transfer', who: from, to: to, amount: amount.toString(), fee: FEE.toString() };
    const block = await appendBlock(next, op, 'ok');
    return { ok: true, error: '', state: next, block: block, run: null };
  }

  async function deploy(state, who) {
    if (!isWho(who)) return fail(state, 'Choose Alice or Bob.');
    if (state.guest) return fail(state, 'The counter is already deployed.');
    if (state.accounts[who] < FEE) {
      return fail(state, nameOf(who) + ' needs 0.001 ETH inside to deploy.');
    }
    const next = clone(state);
    next.accounts[who] -= FEE;
    next.accounts.owner += FEE;
    next.guest = {
      address: GUEST,
      code: parseHex(COUNTER_HEX),
      storage: {},
      balance: 0n,
    };
    const op = { kind: 'deploy', who: who, guest: GUEST, code: '0x' + COUNTER_HEX, fee: FEE.toString() };
    const block = await appendBlock(next, op, 'ok');
    return { ok: true, error: '', state: next, block: block, run: null };
  }

  async function callGuest(state, who, word, budget, value) {
    if (!isWho(who)) return fail(state, 'Choose Alice or Bob.');
    if (!state.guest) return fail(state, 'Deploy the counter first.');
    let input;
    try { input = BigInt(word); } catch (error) { return fail(state, 'The word has to be a whole number.'); }
    if (input < 0n || input >= MOD) return fail(state, 'The word has to fit in 256 bits.');
    const steps = Number(budget);
    if (!Number.isInteger(steps) || steps < 1 || steps > 1000000) {
      return fail(state, 'The step budget has to be a whole number from 1 to 1,000,000.');
    }
    const attached = typeof value === 'bigint' ? value : 0n;
    if (attached < 0n) return fail(state, 'Value with the call cannot be negative.');
    const need = FEE + attached;
    if (state.accounts[who] < need) {
      return fail(state, nameOf(who) + ' needs ' + formatEth(need) + ' ETH inside for the call.');
    }
    const run = execute(state.guest.code, state.guest.storage, input, steps);
    const next = clone(state);
    next.accounts[who] -= FEE;
    next.accounts.owner += FEE;
    if (run.ok && attached > 0n) {
      next.accounts[who] -= attached;
      next.guest.balance += attached;
      next.guest.storage = run.storage;
    } else if (run.ok) {
      next.guest.storage = run.storage;
    }
    const op = {
      kind: 'call',
      who: who,
      word: input.toString(),
      budget: steps,
      steps: run.steps,
      value: attached.toString(),
      fee: FEE.toString(),
      returned: run.returned == null ? '' : run.returned.toString(),
    };
    const block = await appendBlock(next, op, run.ok ? 'ok' : 'reverted');
    return {
      ok: true,
      error: run.ok ? '' : run.reason,
      state: next,
      block: block,
      run: run,
      reverted: !run.ok,
    };
  }

  function nameOf(who) {
    if (who === 'alice') return 'Alice';
    if (who === 'bob') return 'Bob';
    if (who === 'owner') return 'Fee owner';
    return who;
  }

  function slotZero(state) {
    if (!state.guest) return null;
    return storageGet(state.guest.storage, 0n);
  }

  return {
    ETHER: ETHER,
    FEE: FEE,
    GENESIS: GENESIS,
    GUEST: GUEST,
    COUNTER_HEX: COUNTER_HEX,
    OPCODES: OPCODES,
    parseHex: parseHex,
    disassemble: disassemble,
    formatOp: formatOp,
    fresh: fresh,
    clone: clone,
    owed: owed,
    invariant: invariant,
    execute: execute,
    payloadOf: payloadOf,
    sha256: sha256,
    parseEth: parseEth,
    formatEth: formatEth,
    shortHash: shortHash,
    deposit: deposit,
    withdraw: withdraw,
    transfer: transfer,
    deploy: deploy,
    callGuest: callGuest,
    nameOf: nameOf,
    slotZero: slotZero,
  };
});
