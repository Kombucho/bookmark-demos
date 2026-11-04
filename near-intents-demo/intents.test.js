const test = require('node:test');
const assert = require('node:assert/strict');
const intents = require('./intents.js');

test('made-up prices are deterministic and the known solver ladder holds', () => {
  assert.equal(intents.priceOf('swap', 'harbor', 100), 1.845369);
  assert.equal(intents.priceOf('swap', 'dock', 100), 1.814772);
  assert.equal(intents.guaranteeOf(1.845369), 1.826915);
  assert.equal(intents.priceOf('deposit', 'harbor', 100), 99.450401);
  assert.equal(intents.SLIPPAGE_BPS, 100);
  assert.equal(intents.QUOTE_WAIT_MS, 3000);

  const once = intents.preview({ kind: 'swap', amountIn: 100, minimum: 1.81, solverCount: 6 });
  const twice = intents.preview({ kind: 'swap', amountIn: 100, minimum: 1.81, solverCount: 6 });
  assert.deepEqual(once.quotes.map(function (quote) { return quote.amountOut; }), twice.quotes.map(function (quote) { return quote.amountOut; }));
  assert.equal(once.illustrativePrices, true);
  assert.equal(once.winner.id, 'harbor');
  assert.equal(once.quotes[0].id, 'dock');
  assert.equal(once.quotes[0].shortfall, 'minAmountOut');
  assert.equal(once.quotes[0].mark, 'Guarantee is short');
  assert.equal(once.winner.mark, 'Best valid quote');
  const under = intents.preview({ kind: 'swap', amountIn: 100, minimum: 2, solverCount: 1 });
  assert.equal(under.quotes[0].shortfall, 'amountOut');
  assert.equal(under.quotes[0].mark, 'Below minAmountOut');
});

test('the minimum filters on minAmountOut, and no qualifying quote expires untouched', () => {
  const between = intents.preview({ kind: 'swap', amountIn: 100, minimum: 1.83, solverCount: 6 });
  const harbor = between.quotes.find(function (quote) { return quote.id === 'harbor'; });
  assert.equal(harbor.amountOut > 1.83, true);
  assert.equal(harbor.minAmountOut < 1.83, true);
  assert.equal(harbor.meetsMinimum, false);
  assert.equal(harbor.shortfall, 'minAmountOut');
  assert.equal(harbor.mark, 'Guarantee is short');
  assert.equal(between.status, 'EXPIRED');
  assert.equal(between.fundsUntouched, true);
  assert.equal(between.lockedQuote, null);
  assert.equal(between.steps.length, 0);
  assert.deepEqual(intents.balancesAfter(between, 'SUCCESS'), between.opening);
  assert.equal(between.opening.wallet, 2500);

  const one = intents.preview({ kind: 'swap', amountIn: 100, minimum: 1.81, solverCount: 1 });
  assert.equal(one.status, 'EXPIRED');
  assert.equal(one.quotes.length, 1);
  assert.equal(one.quotes[0].id, 'dock');

  const four = intents.preview({ kind: 'swap', amountIn: 100, minimum: 1.81, solverCount: 4 });
  assert.equal(four.status, 'QUOTED');
  assert.equal(four.winner.id, 'kiln');
  const outbid = four.quotes.find(function (quote) { return quote.id === 'reed'; });
  assert.equal(outbid.meetsMinimum, true);
  assert.equal(outbid.mark, 'Clears the minimum');
});

test('a locked quote uses the documented fields, and settlement moves balances once', () => {
  const swap = intents.preview({ kind: 'swap', amountIn: 100, minimum: 1.81, solverCount: 6, custom: true });
  assert.deepEqual(swap.steps, [
    'CREATED', 'SIGNED', 'DEPOSIT_PENDING', 'DEPOSIT_PROCESSING',
    'PENDING', 'TX_BROADCASTED', 'SETTLED', 'SUCCESS'
  ]);
  assert.equal(swap.request.swapType, 'EXACT_INPUT');
  assert.equal(swap.request.depositType, 'ORIGIN_CHAIN');
  assert.equal(swap.request.quoteWaitingTimeMs, 3000);
  assert.equal(swap.request.slippageTolerance, 100);
  assert.equal(swap.request.amount, '100000000');
  assert.equal(swap.request.originAsset, 'nep141:sol-usdc.demo.near');
  assert.equal(swap.lockedQuote.quote.depositAddress, 'demo-harbor-deposit.invalid');
  assert.equal(swap.lockedQuote.quote.minAmountOut, intents.atoms(swap.winner.minAmountOut));
  assert.equal(swap.lockedQuote.signature, 'simulated');

  const pending = intents.balancesAfter(swap, 'DEPOSIT_PENDING');
  assert.equal(pending.wallet, 2400);
  assert.equal(pending.deposit, 100);
  assert.equal(pending.recipient, swap.opening.recipient);

  const settled = intents.balancesAfter(swap, 'SETTLED');
  assert.equal(settled.deposit, 0);
  assert.equal(settled.intents, swap.winner.amountOut);
  assert.equal(settled.recipient, swap.opening.recipient);

  const done = intents.balancesAfter(swap, 'SUCCESS');
  assert.equal(done.wallet, 2400);
  assert.equal(done.intents, 0);
  assert.equal(done.deposit, 0);
  assert.equal(done.recipient, round6(swap.opening.recipient + swap.winner.amountOut));
  assert.equal(intents.STATION.SETTLED, 'intents');
  assert.equal(intents.STATION.SUCCESS, 'destination');
  assert.equal(intents.stepDetail(swap, 'DEPOSIT_PENDING').indexOf('DEPOSIT_PENDING') !== -1, true);
});

test('a deposit can stop at the app, or continue into a custom vault call', () => {
  const plain = intents.preview({ kind: 'deposit', amountIn: 100, minimum: 97.6, solverCount: 6, custom: false });
  const custom = intents.preview({ kind: 'deposit', amountIn: 100, minimum: 97.6, solverCount: 6, custom: true });
  assert.equal(plain.winner.id, 'harbor');
  assert.equal(plain.steps.indexOf('OPERATION_PENDING'), -1);
  assert.equal(custom.steps.indexOf('OPERATION_PENDING') !== -1, true);
  assert.equal(custom.steps[custom.steps.length - 1], 'SUCCESS');

  const plainDone = intents.balancesAfter(plain, 'SUCCESS');
  assert.equal(plainDone.app, round6(plain.opening.app + plain.winner.amountOut));
  assert.equal(plainDone.vault, 0);
  assert.equal(plainDone.intents, 0);

  const held = intents.balancesAfter(custom, 'OPERATION_PENDING');
  assert.equal(held.intents, custom.winner.amountOut);
  assert.equal(held.vault, 0);
  const customDone = intents.balancesAfter(custom, 'SUCCESS');
  assert.equal(customDone.vault, custom.winner.amountOut);
  assert.equal(customDone.app, custom.opening.app);
  assert.equal(customDone.intents, 0);

  const few = intents.preview({ kind: 'deposit', amountIn: 100, minimum: 98, solverCount: 4 });
  assert.equal(few.status, 'EXPIRED');
  const enough = intents.preview({ kind: 'deposit', amountIn: 100, minimum: 98, solverCount: 6 });
  assert.equal(enough.status, 'QUOTED');
  assert.equal(enough.winner.id, 'harbor');
});

test('an amount the wallet cannot cover is not quoted, and a tie keeps the earlier solver', () => {
  const over = intents.preview({ kind: 'swap', amountIn: 2501, minimum: 0, solverCount: 6 });
  assert.equal(over.status, 'INVALID');
  assert.equal(over.fundsUntouched, true);
  assert.equal(over.quotes.length, 0);
  assert.deepEqual(intents.balancesAfter(over, 'DEPOSIT_PENDING'), over.opening);

  const empty = intents.preview({ kind: 'swap', amountIn: 0, minimum: 0, solverCount: 3 });
  assert.equal(empty.status, 'INVALID');

  const tied = intents.selectWinner([
    { id: 'a', amountOut: 5, meetsMinimum: true, index: 0 },
    { id: 'b', amountOut: 5, meetsMinimum: true, index: 1 },
    { id: 'c', amountOut: 4, meetsMinimum: true, index: 2 }
  ]);
  assert.equal(tied.id, 'a');
  assert.equal(intents.bestGuarantee('swap', 100), intents.guaranteeOf(intents.priceOf('swap', 'harbor', 100)));
});

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
