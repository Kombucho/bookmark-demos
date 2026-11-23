const test = require('node:test');
const assert = require('node:assert/strict');
const chain = require('./chain.js');

function bytesOf(hex) {
  return chain.parseHex(hex);
}

test('the counter is the 20-byte program from the docs', function () {
  const ops = chain.disassemble(bytesOf(chain.COUNTER_HEX));
  assert.deepEqual(ops.map(chain.formatOp), [
    'CALLDATALOAD r1, r0',
    'SLOAD r2, r0',
    'ADD r2, r2, r1',
    'SSTORE r0, r2',
    'RETURN r2',
  ]);
  assert.equal(bytesOf(chain.COUNTER_HEX).length, 20);
});

test('five steps add the word, and a short budget rolls the store back', function () {
  const code = bytesOf(chain.COUNTER_HEX);
  const done = chain.execute(code, {}, 7n, 5);
  assert.equal(done.ok, true);
  assert.equal(done.steps, 5);
  assert.equal(done.returned, 7n);
  assert.equal(done.storage['0'], '7');
  assert.equal(done.trace[3].name, 'SSTORE');

  const short = chain.execute(code, {}, 7n, 4);
  assert.equal(short.ok, false);
  assert.equal(short.reason, 'Step budget exhausted.');
  assert.equal(short.steps, 4);
  assert.equal(short.trace[3].name, 'SSTORE');
  assert.equal(short.haltedAt, 16);
  assert.deepEqual(short.storage, {});

  const again = chain.execute(code, { '0': '7' }, 7n, 8);
  assert.equal(again.storage['0'], '14');
});

test('CONST loads a word and ADD wraps at 2^256', function () {
  function constOp(reg, value) {
    const bytes = [0x01, reg, 0x00, 0x00];
    let rest = value;
    const literal = [];
    for (let i = 0; i < 32; i++) literal.push(Number((rest >> BigInt(8 * (31 - i))) & 0xffn));
    return bytes.concat(literal);
  }
  const mod = 1n << 256n;
  const code = constOp(1, mod - 1n).concat(constOp(2, 2n), [0x03, 0x03, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00]);
  const run = chain.execute(code, {}, 0n, 10);
  assert.equal(run.ok, true);
  assert.equal(run.regs[1], mod - 1n);
  assert.equal(run.regs[3], 1n);
  assert.equal(run.steps, 4);
});

test('deposit, transfer, and withdraw keep the contract whole', async function () {
  let state = chain.fresh();
  assert.equal(chain.invariant(state), true);
  const put = await chain.deposit(state, 'alice', chain.ETHER);
  state = put.state;
  assert.equal(state.held, chain.ETHER);
  assert.equal(state.accounts.alice, chain.ETHER);
  assert.equal(chain.owed(state), state.held);
  assert.equal(state.blocks[0].prev, chain.GENESIS);
  assert.equal(state.blocks[0].head, state.head);
  assert.equal(await chain.sha256(state.blocks[0].payload), state.head);

  const moved = await chain.transfer(state, 'alice', 'bob', chain.ETHER / 4n);
  state = moved.state;
  assert.equal(state.accounts.bob, chain.ETHER / 4n);
  assert.equal(state.accounts.owner, chain.FEE);
  assert.equal(state.accounts.alice, chain.ETHER - chain.ETHER / 4n - chain.FEE);
  assert.equal(state.held, chain.ETHER);
  assert.equal(chain.invariant(state), true);
  assert.equal(state.blocks[1].prev, state.blocks[0].head);

  const out = await chain.withdraw(state, 'bob', chain.ETHER / 4n);
  state = out.state;
  assert.equal(state.accounts.bob, 0n);
  assert.equal(state.held, chain.ETHER - chain.ETHER / 4n);
  assert.equal(chain.invariant(state), true);

  const broke = await chain.withdraw(state, 'bob', 1n);
  assert.equal(broke.ok, false);
  assert.equal(broke.state.head, state.head);
  assert.equal(broke.state.blocks.length, state.blocks.length);
});

test('deploy and call charge a fee, and a revert still links a block', async function () {
  let state = chain.fresh();
  state = (await chain.deposit(state, 'alice', chain.ETHER)).state;
  const guest = await chain.deploy(state, 'alice');
  state = guest.state;
  assert.equal(state.guest.address, chain.GUEST);
  assert.equal(state.guest.code.length, 20);
  assert.equal(state.accounts.owner, chain.FEE);
  assert.equal(chain.slotZero(state), 0n);

  const again = await chain.deploy(state, 'alice');
  assert.equal(again.ok, false);
  assert.equal(again.state.blocks.length, state.blocks.length);

  const aborted = await chain.callGuest(state, 'alice', 7n, 3, 0n);
  state = aborted.state;
  assert.equal(aborted.reverted, true);
  assert.equal(aborted.block.status, 'reverted');
  assert.equal(chain.slotZero(state), 0n);
  assert.equal(state.accounts.owner, chain.FEE * 2n);
  assert.equal(chain.invariant(state), true);

  const called = await chain.callGuest(state, 'alice', 7n, 5, 0n);
  state = called.state;
  assert.equal(called.run.steps, 5);
  assert.equal(called.run.returned, 7n);
  assert.equal(chain.slotZero(state), 7n);
  assert.equal(called.block.status, 'ok');

  const valued = await chain.callGuest(state, 'bob', 1n, 100, chain.ETHER / 10n);
  assert.equal(valued.ok, false);

  state = (await chain.deposit(state, 'bob', chain.ETHER)).state;
  const paid = await chain.callGuest(state, 'bob', 1n, 100, chain.ETHER / 10n);
  state = paid.state;
  assert.equal(state.guest.balance, chain.ETHER / 10n);
  assert.equal(chain.slotZero(state), 8n);
  assert.equal(chain.invariant(state), true);
  assert.equal(state.blocks[state.blocks.length - 1].prev, state.blocks[state.blocks.length - 2].head);
});

test('the same operation from genesis hashes the same head', async function () {
  const left = await chain.deposit(chain.fresh(), 'alice', chain.ETHER);
  const right = await chain.deposit(chain.fresh(), 'alice', chain.ETHER);
  assert.equal(left.state.head, right.state.head);
  assert.match(left.state.blocks[0].payload, /deposit/);
  assert.equal(chain.shortHash(left.state.head).length, 8);
});

test('ETH text parses and prints', function () {
  assert.equal(chain.parseEth('1'), chain.ETHER);
  assert.equal(chain.parseEth('0.25'), chain.ETHER / 4n);
  assert.equal(chain.parseEth('0.001'), chain.FEE);
  assert.equal(chain.parseEth('nope'), null);
  assert.equal(chain.parseEth('-1'), null);
  assert.equal(chain.formatEth(chain.ETHER), '1');
  assert.equal(chain.formatEth(chain.FEE), '0.001');
  assert.equal(chain.formatEth(0n), '0');
});
