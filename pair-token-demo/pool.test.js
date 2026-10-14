const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('./pool.js');

function close(actual, expected, eps) {
  const tol = eps == null ? 1e-8 : eps;
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol * scale, actual + ' ≉ ' + expected);
}

test('a swap keeps k, pays the fee, and grows only the input-token fee bucket', () => {
  const built = pool.createPool(1000, 1000, 100);
  assert.equal(built.ok, true);
  const start = built.pool;
  const amountIn = 100;
  const traded = pool.swap(start, 0, amountIn);
  assert.equal(traded.ok, true);
  const feeFactor = (10000 - 100) / 10000;
  const amountInAfter = amountIn * feeFactor;
  const amountOut = 1000 * amountInAfter / (1000 + amountInAfter);
  close(traded.fee, amountIn - amountInAfter);
  close(traded.amountInAfter, amountInAfter);
  close(traded.amountOut, amountOut);
  close(traded.pool.reserve0, start.reserve0 + amountInAfter);
  close(traded.pool.reserve1, start.reserve1 - amountOut);
  close(traded.pool.fee0, traded.fee);
  assert.equal(traded.pool.fee1, 0);
  close(pool.kOf(traded.pool), pool.kOf(start), 1e-9);
  assert.ok(Math.abs(traded.pool.reserve0 - start.reserve0 - amountIn) > 0.5);
});

test('arbing to a new price lands on that price and does not change k', () => {
  const start = pool.createPool(100, 10000, 30).pool;
  const moved = pool.arbToPrice(start, 200);
  assert.equal(moved.ok, true);
  close(pool.spot(moved.pool), 200, 1e-9);
  close(pool.kOf(moved.pool), pool.kOf(start), 1e-9);
  assert.ok(moved.pool.fee0 + moved.pool.fee1 > 0);
});

test('mint and redeem are proportional and charge nothing', () => {
  const start = pool.createPool(100, 10000, 30).pool;
  assert.equal(start.supply, 1000);
  const before = pool.perShare(start);
  const minted = pool.mint(start, 10);
  assert.equal(minted.ok, true);
  close(minted.amount1, 1000);
  close(minted.shares, 100);
  const afterMint = pool.perShare(minted.pool);
  close(afterMint.total0, before.total0);
  close(afterMint.total1, before.total1);
  close(pool.spot(minted.pool), pool.spot(start));
  assert.equal(minted.pool.cut0, 0);
  assert.equal(minted.pool.cut1, 0);
  assert.ok(pool.kOf(minted.pool) > pool.kOf(start));

  const redeemed = pool.redeem(minted.pool, minted.shares);
  assert.equal(redeemed.ok, true);
  close(redeemed.amount0, 10);
  close(redeemed.amount1, 1000);
  close(redeemed.pool.supply, start.supply);
  close(redeemed.pool.reserve0, start.reserve0);
  close(pool.perShare(redeemed.pool).total0, before.total0);
});

test('redeem returns a proportional claim on reserves and uncollected fees', () => {
  const start = pool.createPool(1000, 1000, 100).pool;
  const traded = pool.swap(start, 0, 100);
  const half = pool.redeem(traded.pool, traded.pool.supply / 2);
  assert.equal(half.ok, true);
  close(half.pool.fee0, traded.pool.fee0 / 2);
  close(half.pool.reserve0, traded.pool.reserve0 / 2);
  close(half.pool.reserve1, traded.pool.reserve1 / 2);
  close(half.amount0, (traded.pool.reserve0 + traded.pool.fee0) / 2);
  close(pool.perShare(half.pool).total0, pool.perShare(traded.pool).total0);
  close(pool.perShare(half.pool).fee0, pool.perShare(traded.pool).fee0);
});

test('the desk mint and redeem round-trip and scale the uncompounded twin with them', () => {
  const state = pool.createState().state;
  const before = pool.perShare(state.pool);
  const shadowBefore = pool.perShare(state.shadow);
  const shadowK = pool.kOf(state.shadow);
  const minted = pool.mintDesk(state, 10);
  assert.equal(minted.ok, true);
  close(pool.perShare(minted.state.pool).total0, before.total0);
  close(pool.perShare(minted.state.pool).total1, before.total1);
  close(minted.state.desk.token0, state.desk.token0 - minted.amount0);
  close(minted.state.desk.shares, state.desk.shares + minted.shares);
  const factor = minted.state.pool.supply / state.pool.supply;
  close(pool.kOf(minted.state.shadow) / shadowK, factor * factor);
  close(pool.perShare(minted.state.shadow).total0, shadowBefore.total0);
  assert.equal(pool.indexes(minted.state).pair, 1);
  close(pool.indexes(minted.state).flat, 1);

  const back = pool.redeemDesk(minted.state, minted.shares);
  assert.equal(back.ok, true);
  close(back.state.desk.token0, state.desk.token0, 1e-8);
  close(back.state.desk.token1, state.desk.token1, 1e-8);
  close(back.state.pool.supply, state.pool.supply, 1e-8);
  close(pool.kOf(back.state.shadow), shadowK, 1e-8);

  const poor = pool.createState({desk0: 1, desk1: 1}).state;
  const refused = pool.mintDesk(poor, 10);
  assert.equal(refused.ok, false);
  assert.equal(poor.desk.token0, 1);
});

test('compound takes a 10% cut and folds the rest in without moving the price', () => {
  const start = pool.createPool(100, 10000, 30).pool;
  const traded = pool.swap(start, 0, 5);
  assert.ok(traded.pool.fee0 > 0);
  const price = pool.spot(traded.pool);
  const before = pool.mark(traded.pool, price);
  const shareBefore = pool.perShare(traded.pool);
  const done = pool.compound(traded.pool);
  assert.equal(done.ok, true);
  close(done.cut0, traded.pool.fee0 / 10);
  close(done.cut1, traded.pool.fee1 / 10);
  close(done.cut0 + (traded.pool.fee0 - done.cut0), traded.pool.fee0);
  assert.equal(done.pool.fee0, 0);
  assert.equal(done.pool.fee1, 0);
  assert.equal(done.pool.supply, traded.pool.supply);
  close(pool.spot(done.pool), price, 1e-9);
  assert.ok(done.pool.reserve0 > traded.pool.reserve0);
  assert.ok(done.pool.reserve1 > traded.pool.reserve1);
  assert.ok(pool.kOf(done.pool) > pool.kOf(traded.pool));
  const shareAfter = pool.perShare(done.pool);
  assert.ok(shareAfter.reserve0 > shareBefore.reserve0);
  assert.ok(shareAfter.reserve1 > shareBefore.reserve1);
  const cutValue = done.cut0 * price + done.cut1;
  const whole = (traded.pool.reserve0 + traded.pool.fee0) * price + traded.pool.reserve1 + traded.pool.fee1;
  const folded = done.pool.reserve0 * price + done.pool.reserve1;
  close(folded + cutValue, whole, 1e-9);
  assert.ok(pool.mark(done.pool, price) < before);
  assert.equal(pool.FEE_CUT, 0.1);
});

test('a fee-free doubling of price shows impermanent loss against the 50/50 hold', () => {
  const state = pool.createState({amount0: 100, amount1: 10000, feeBps: 0}).state;
  const moved = pool.markTo(state, 200);
  assert.equal(moved.ok, true);
  const idx = pool.indexes(moved.state);
  assert.ok(idx.hold > idx.flat);
  close(idx.pair, idx.flat, 1e-9);
  close(pool.kOf(moved.state.pool), pool.kOf(state.pool), 1e-9);
  close(idx.hold, (0.1 * 200 + 10) / 20);
});

test('swap flow leaves k put until compound, which then beats a shadow that never compounds', () => {
  let state = pool.createState({feeBps: 30}).state;
  const rng = pool.mulberry32(1);
  const k0 = pool.kOf(state.pool);
  const once = pool.stepState(state, {volatility: 0, volume: 0.05, autoCompound: false, rng: rng});
  assert.equal(once.ok, true);
  state = once.state;
  close(pool.kOf(state.pool), k0, 1e-9);
  close(pool.kOf(state.shadow), k0, 1e-9);
  assert.ok(state.pool.fee0 + state.pool.fee1 > 0);
  const reserves = pool.perShare(state.pool);
  const folded = pool.compoundState(state);
  assert.equal(folded.ok, true);
  assert.ok(pool.kOf(folded.state.pool) > k0);
  assert.ok(pool.perShare(folded.state.pool).reserve0 > reserves.reserve0);
  close(pool.kOf(folded.state.shadow), k0, 1e-9);
  assert.ok(folded.cut0 > 0 || folded.cut1 > 0);

  let raced = pool.createState({feeBps: 100}).state;
  const stream = pool.mulberry32(1);
  for (let i = 0; i < 220; i += 1) {
    const stepped = pool.stepState(raced, {volatility: 0.025, volume: 0.15, autoCompound: true, rng: stream});
    assert.equal(stepped.ok, true);
    raced = stepped.state;
  }
  assert.ok(pool.kOf(raced.pool) > pool.kOf(raced.shadow));
  const end = pool.indexes(raced);
  assert.ok(end.pair > end.flat);
  assert.equal(raced.pool.fee0, 0);
  assert.equal(raced.pool.fee1, 0);
  assert.ok(raced.shadow.fee0 + raced.shadow.fee1 > 0);
});
