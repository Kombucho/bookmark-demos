const test = require('node:test');
const assert = require('node:assert/strict');
const compose = require('./compose.js');

function close(actual, expected, eps) {
  const tol = eps == null ? 1e-8 : eps;
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol * scale, actual + ' ≉ ' + expected);
}

test('a swap charges the fee and leaves the invariant unchanged', () => {
  const pool = {sol: 1000, usdc: 100000};
  const amountIn = 1000;
  const feeBps = 30;
  const traded = compose.swapPool(pool, 'usdc', amountIn, feeBps);
  assert.equal(traded.ok, true);
  const feeFactor = (10000 - feeBps) / 10000;
  const amountInAfter = amountIn * feeFactor;
  const amountOut = pool.sol * amountInAfter / (pool.usdc + amountInAfter);
  close(traded.fee, amountIn - amountInAfter);
  close(traded.amountOut, amountOut);
  close(traded.pool.usdc, pool.usdc + amountInAfter);
  close(traded.pool.sol, pool.sol - amountOut);
  close(compose.invariant(traded.pool), compose.invariant(pool), 1e-9);
  assert.ok(Math.abs(traded.pool.usdc - pool.usdc - amountIn) > 1);
});

test('the L1 route lands in one piece when the quote clears', () => {
  const config = Object.assign({}, compose.DEFAULTS, {spread: 0.03, borrow: 400, latency: 0, traders: 0, volatility: 0});
  const world = compose.makeWorld(config);
  const quote = compose.quoteRoute(world, config);
  assert.equal(quote.ok, true);
  assert.ok(quote.plan.profit > 0);
  const atomic = compose.executeAtomic(world, config);
  assert.equal(atomic.status, 'landed');
  assert.ok(atomic.profit > 0);
  close(atomic.profit, quote.plan.profit);
  assert.equal(atomic.world.user.sol, 0);
  assert.equal(atomic.world.user.debt, 0);
  close(atomic.world.lender.usdc, world.lender.usdc);
  assert.ok(atomic.world.venueA.usdc > world.venueA.usdc);
  assert.ok(atomic.world.venueB.sol > world.venueB.sol);
  close(compose.invariant(atomic.world.venueA), compose.invariant(world.venueA), 1e-9);
  close(compose.invariant(atomic.world.venueB), compose.invariant(world.venueB), 1e-9);
  assert.deepEqual(world.user, {sol: 0, usdc: config.margin, debt: 0});
  assert.ok(Number.isFinite(atomic.profit));
});

test('a route that cannot pay for itself reverts and leaves the L1 state alone', () => {
  const config = Object.assign({}, compose.DEFAULTS, {spread: 0, borrow: 5000});
  const world = compose.makeWorld(config);
  const atomic = compose.executeAtomic(world, config);
  assert.equal(atomic.status, 'reverted');
  assert.equal(atomic.profit, 0);
  assert.equal(atomic.reason, 'no-edge');
  assert.deepEqual(atomic.world, world);
});

test('a failed last leg rolls the whole L1 transaction back', () => {
  const config = Object.assign({}, compose.DEFAULTS, {spread: 0.03, borrow: 400, breakLeg: 'repay'});
  const world = compose.makeWorld(config);
  const broken = compose.executeAtomic(world, config);
  assert.equal(broken.status, 'reverted');
  assert.equal(broken.profit, 0);
  assert.equal(broken.reason, 'repay');
  assert.deepEqual(broken.world, world);
  const fine = compose.executeAtomic(world, Object.assign({}, config, {breakLeg: null}));
  assert.equal(fine.status, 'landed');
  assert.ok(fine.world.venueA.usdc !== world.venueA.usdc);
});

test('with no delay and no one else trading, the split world matches the L1', () => {
  const config = Object.assign({}, compose.DEFAULTS, {
    spread: 0.03,
    borrow: 400,
    latency: 0,
    traders: 8,
    volatility: 0.05,
    slippageBps: 50,
  });
  const once = compose.runOnce(config, 4);
  assert.equal(once.atomic.status, 'landed');
  assert.equal(once.split.status, 'landed');
  close(once.split.profit, once.atomic.profit);
  close(once.split.world.venueA.usdc, once.atomic.world.venueA.usdc);
  close(once.split.world.venueB.usdc, once.atomic.world.venueB.usdc);
  assert.equal(once.split.world.user.sol, 0);
  assert.equal(once.split.world.user.debt, 0);
});

test('a price break during the bridge leaves the SOL and the debt', () => {
  const config = Object.assign({}, compose.DEFAULTS, {
    spread: 0.03,
    borrow: 400,
    margin: 250,
    latency: 4,
    volatility: 0,
    traders: 6,
    traderSize: 0.02,
    slippageBps: 40,
    script: [-0.35, -0.35, -0.35, -0.35, -0.35, -0.35, -0.35, -0.35],
  });
  const world = compose.makeWorld(config);
  const atomic = compose.executeAtomic(world, config);
  assert.equal(atomic.status, 'landed');
  assert.ok(atomic.profit > 0);
  const split = compose.executeSplit(world, config, compose.mulberry32(1));
  assert.equal(split.status, 'partial');
  assert.equal(split.reason, 'sell');
  assert.ok(split.profit < 0);
  close(split.world.user.sol, split.plan.solOut);
  close(split.world.user.debt, config.borrow);
  close(split.world.user.usdc, config.margin);
  const buyEvent = split.timeline.filter(function (row) { return row.id === 'buy'; })[0];
  assert.ok(buyEvent.world.venueA.usdc > world.venueA.usdc);
  assert.ok(split.world.lender.usdc < world.lender.usdc);
  const ids = split.timeline.map(function (row) { return row.id; });
  assert.ok(ids.indexOf('buy') !== -1);
  assert.ok(ids.indexOf('gap') !== -1);
  assert.ok(ids.indexOf('sell-failed') !== -1);
  assert.equal(ids.indexOf('repay'), -1);
});

test('competing traders in the gap take the edge the L1 still captures', () => {
  const config = Object.assign({}, compose.DEFAULTS, {
    spread: 0.03,
    borrow: 400,
    margin: 5000,
    latency: 6,
    volatility: 0,
    traders: 8,
    traderSize: 0.015,
    slippageBps: 400,
  });
  const world = compose.makeWorld(config);
  const atomic = compose.executeAtomic(world, config);
  const split = compose.executeSplit(world, config, compose.mulberry32(2));
  assert.equal(atomic.status, 'landed');
  assert.ok(atomic.profit > 1);
  assert.ok(split.status === 'landed' || split.status === 'partial');
  assert.ok(split.profit < atomic.profit - 0.5);
  const gap = split.timeline.filter(function (row) { return row.id === 'gap'; });
  assert.ok(gap.length === 6);
  assert.ok(gap.some(function (row) { return row.trades.length > 0; }));
});

test('trials tally all-or-nothing against partials, and the same seed repeats', () => {
  const config = Object.assign({}, compose.DEFAULTS, {
    spread: 0.03,
    borrow: 400,
    latency: 4,
    volatility: 0.03,
    traders: 4,
    slippageBps: 80,
  });
  const first = compose.runTrials(config, 30, 7);
  const second = compose.runTrials(config, 30, 7);
  assert.equal(first.trials, 30);
  assert.equal(first.atomic.partial, 0);
  assert.equal(first.atomic.landed, 30);
  assert.equal(first.atomic.reverted, 0);
  assert.ok(Number.isFinite(first.atomic.mean) && first.atomic.mean > 0);
  assert.equal(first.atomic.landed + first.atomic.reverted + first.atomic.partial, 30);
  assert.equal(first.split.landed + first.split.reverted + first.split.partial, 30);
  assert.ok(first.split.partial > 0 || first.split.profits.some(function (profit, i) {
    return Math.abs(profit - first.atomic.profits[i]) > 1e-6;
  }));
  assert.deepEqual(first.split.profits, second.split.profits);
  assert.equal(first.atomic.mean, second.atomic.mean);

  const still = compose.runTrials(Object.assign({}, config, {latency: 0, volatility: 0, traders: 0}), 12, 3);
  assert.deepEqual(still.split.profits, still.atomic.profits);
  assert.equal(still.split.partial, 0);
});
