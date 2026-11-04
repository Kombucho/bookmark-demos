// A simulated Aurora Intents quote and settlement.
// Prices, solvers, and addresses are fictional. No request is sent.
// Quote fields follow POST /api/quote: EXACT_INPUT, minAmountOut, depositAddress.
// Settlement states follow the execution lifecycle, then the NEAR Intents verifier.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NearIntents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SLIPPAGE_BPS = 100;
  const QUOTE_WAIT_MS = 3000;
  const WALLET = 2500;
  const ATOMS = 1e6;
  const DEADLINE = '2026-11-04T08:00:00.000Z';

  // Listed from the widest fee to the tightest, so raising the solver count
  // can only improve the best quote, or leave it as it is.
  const SOLVERS = [
    { id: 'dock', name: 'Dock', fee: 0.021, bias: 0.002, seconds: 9 },
    { id: 'reed', name: 'Reed', fee: 0.014, bias: 0.004, seconds: 14 },
    { id: 'moth', name: 'Moth', fee: 0.011, bias: -0.001, seconds: 18 },
    { id: 'kiln', name: 'Kiln', fee: 0.008, bias: -0.002, seconds: 22 },
    { id: 'lumen', name: 'Lumen', fee: 0.006, bias: -0.006, seconds: 16 },
    { id: 'harbor', name: 'Harbor', fee: 0.0035, bias: 0.001, seconds: 28 }
  ];

  const PAIRS = {
    swap: {
      kind: 'swap',
      label: 'Swap',
      swapType: 'EXACT_INPUT',
      originChain: 'Solana',
      originAsset: 'USDC',
      originId: 'nep141:sol-usdc.demo.near',
      destinationChain: 'NEAR',
      destinationAsset: 'NEAR',
      destinationId: 'nep141:wrap.demo.near',
      destinationWhere: 'demo.near',
      mid: 0.0185,
      midNote: '1 USDC is priced at 0.0185 NEAR here. That rate is made up.',
      defaultMinimum: 1.81,
      outDigits: 4,
      opening: { wallet: WALLET, deposit: 0, intents: 0, recipient: 12.4, app: 0, vault: 0 }
    },
    deposit: {
      kind: 'deposit',
      label: 'Deposit',
      swapType: 'EXACT_INPUT',
      originChain: 'Solana',
      originAsset: 'USDC',
      originId: 'nep141:sol-usdc.demo.near',
      destinationChain: 'NEAR',
      destinationAsset: 'USDC',
      destinationId: 'nep141:near-usdc.demo.near',
      destinationWhere: 'northglass.demo.near',
      mid: 0.997,
      midNote: '1 USDC on Solana is priced at 0.997 USDC on NEAR here. That rate is made up.',
      defaultMinimum: 97.6,
      outDigits: 2,
      opening: { wallet: WALLET, deposit: 0, intents: 0, recipient: 0, app: 400, vault: 0 }
    }
  };

  const STEP_TEXT = {
    CREATED: 'CREATED. The winning quote is locked, deposit address included. Nothing has moved.',
    SIGNED: 'One simulated signature from the origin wallet. This page has no wallet.',
    DEPOSIT_PENDING: 'DEPOSIT_PENDING. The wallet sends USDC to the deposit address on Solana.',
    DEPOSIT_PROCESSING: 'DEPOSIT_PROCESSING. The deposit is waiting on Solana confirmations.',
    PENDING: 'PENDING at the NEAR Intents verifier. The solver’s quote hash is the one being settled.',
    TX_BROADCASTED: 'TX_BROADCASTED. The settlement transaction has been sent to the verifier.',
    SETTLED: 'SETTLED. The verifier matched the quote. Destination funds are held for delivery.',
    OPERATION_PENDING: 'OPERATION_PENDING. The intermediary account is queued to call Northglass.',
    OPERATION_PROCESSING: 'OPERATION_PROCESSING. That custom call is waiting to be included on NEAR.',
    SUCCESS: 'SUCCESS.'
  };

  const BASE_STEPS = [
    'CREATED',
    'SIGNED',
    'DEPOSIT_PENDING',
    'DEPOSIT_PROCESSING',
    'PENDING',
    'TX_BROADCASTED',
    'SETTLED',
    'SUCCESS'
  ];

  const CUSTOM_STEPS = [
    'CREATED',
    'SIGNED',
    'DEPOSIT_PENDING',
    'DEPOSIT_PROCESSING',
    'PENDING',
    'TX_BROADCASTED',
    'SETTLED',
    'OPERATION_PENDING',
    'OPERATION_PROCESSING',
    'SUCCESS'
  ];

  const STATION = {
    CREATED: 'origin',
    SIGNED: 'origin',
    DEPOSIT_PENDING: 'origin',
    DEPOSIT_PROCESSING: 'origin',
    PENDING: 'intents',
    TX_BROADCASTED: 'intents',
    SETTLED: 'intents',
    OPERATION_PENDING: 'destination',
    OPERATION_PROCESSING: 'destination',
    SUCCESS: 'destination'
  };

  function round6(n) {
    return Math.round(n * ATOMS) / ATOMS;
  }

  function clone(balances) {
    return {
      wallet: balances.wallet,
      deposit: balances.deposit,
      intents: balances.intents,
      recipient: balances.recipient,
      app: balances.app,
      vault: balances.vault
    };
  }

  function pairOf(kind) {
    return PAIRS[kind] || PAIRS.swap;
  }

  function clampSolvers(count) {
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n)) return 4;
    return Math.min(SOLVERS.length, Math.max(1, n));
  }

  function solverById(id) {
    return SOLVERS.find(function (solver) { return solver.id === id; });
  }

  function priceOf(kind, id, amountIn) {
    const pair = pairOf(kind);
    const solver = typeof id === 'string' ? solverById(id) : id;
    const raw = amountIn * pair.mid * (1 - solver.fee) * (1 + solver.bias);
    return round6(raw);
  }

  function guaranteeOf(amountOut) {
    return round6(amountOut * (10000 - SLIPPAGE_BPS) / 10000);
  }

  function atoms(amount) {
    return String(Math.round(amount * ATOMS));
  }

  function stepsFor(kind, custom) {
    if (kind === 'deposit' && custom) return CUSTOM_STEPS.slice();
    return BASE_STEPS.slice();
  }

  function successDetail(preview) {
    if (preview.kind === 'swap') {
      return 'SUCCESS. The swap status is SUCCESS. demo.near holds the NEAR.';
    }
    if (preview.custom) {
      return 'SUCCESS. The custom supply landed in the Northglass vault.';
    }
    return 'SUCCESS. The USDC is in the NEAR app. No further call was asked for.';
  }

  function stepDetail(preview, stepId) {
    if (stepId === 'SUCCESS') return successDetail(preview);
    return STEP_TEXT[stepId] || '';
  }

  function selectWinner(quotes) {
    let winner = null;
    quotes.forEach(function (quote, index) {
      if (!quote.meetsMinimum) return;
      if (!winner || quote.amountOut > winner.amountOut || (quote.amountOut === winner.amountOut && index < winner.index)) {
        winner = quote;
      }
    });
    return winner;
  }

  function buildQuotes(pair, amountIn, minimum, count) {
    return SOLVERS.slice(0, count).map(function (solver, index) {
      const amountOut = priceOf(pair.kind, solver, amountIn);
      const minAmountOut = guaranteeOf(amountOut);
      let shortfall = null;
      if (amountOut < minimum) shortfall = 'amountOut';
      else if (minAmountOut < minimum) shortfall = 'minAmountOut';
      return {
        index: index,
        id: solver.id,
        name: solver.name,
        amountIn: amountIn,
        amountOut: amountOut,
        minAmountOut: minAmountOut,
        timeEstimate: solver.seconds,
        quoteHash: 'sim_' + solver.id,
        meetsMinimum: shortfall === null,
        shortfall: shortfall,
        depositAddress: 'demo-' + solver.id + '-deposit.invalid'
      };
    });
  }

  function markQuotes(quotes, winner) {
    quotes.forEach(function (quote) {
      if (winner && quote.id === winner.id) quote.mark = 'Best valid quote';
      else if (quote.meetsMinimum) quote.mark = 'Clears the minimum';
      else if (quote.shortfall === 'minAmountOut') quote.mark = 'Guarantee is short';
      else quote.mark = 'Below minAmountOut';
    });
  }

  function requestOf(pair, amountIn, recipient) {
    return {
      dry: false,
      swapType: pair.swapType,
      depositType: 'ORIGIN_CHAIN',
      depositMode: 'SIMPLE',
      amount: atoms(amountIn),
      originAsset: pair.originId,
      destinationAsset: pair.destinationId,
      slippageTolerance: SLIPPAGE_BPS,
      refundTo: 'demo-user.invalid',
      refundType: 'ORIGIN_CHAIN',
      recipient: recipient,
      recipientType: 'DESTINATION_CHAIN',
      quoteWaitingTimeMs: QUOTE_WAIT_MS,
      simulated: true
    };
  }

  function lockedFrom(pair, winner) {
    return {
      simulated: true,
      timestamp: '2026-11-04T07:00:00.000Z',
      signature: 'simulated',
      correlationId: 'sim-' + pair.kind + '-' + winner.id,
      quote: {
        timeEstimate: winner.timeEstimate,
        deadline: DEADLINE,
        depositAddress: winner.depositAddress,
        amountIn: atoms(winner.amountIn),
        amountInFormatted: String(winner.amountIn),
        amountOut: atoms(winner.amountOut),
        amountOutFormatted: String(winner.amountOut),
        minAmountOut: atoms(winner.minAmountOut),
        slippageTolerance: SLIPPAGE_BPS
      }
    };
  }

  function preview(input) {
    const pair = pairOf(input && input.kind);
    const custom = pair.kind === 'deposit' && !!(input && input.custom);
    const amountIn = Number(input && input.amountIn);
    const minimum = Number(input && input.minimum);
    const floor = Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
    const count = clampSolvers(input && input.solverCount);
    const opening = clone(pair.opening);
    const base = {
      simulated: true,
      illustrativePrices: true,
      kind: pair.kind,
      custom: custom,
      pair: pair,
      amountIn: amountIn,
      minimum: floor,
      solverCount: count,
      slippageBps: SLIPPAGE_BPS,
      quoteWaitingTimeMs: QUOTE_WAIT_MS,
      opening: opening,
      quotes: [],
      winner: null,
      lockedQuote: null,
      steps: [],
      request: null
    };

    if (!Number.isFinite(amountIn) || amountIn <= 0 || amountIn > WALLET) {
      return Object.assign(base, {
        status: 'INVALID',
        fundsUntouched: true,
        reason: amountIn > WALLET
          ? 'The simulated wallet holds 2500 USDC. This intent asks for more, so it is not signed.'
          : 'Enter an amount of USDC greater than zero.'
      });
    }

    const quotes = buildQuotes(pair, amountIn, floor, count);
    const winner = selectWinner(quotes);
    markQuotes(quotes, winner);
    const request = requestOf(pair, amountIn, pair.destinationWhere);

    if (!winner) {
      return Object.assign(base, {
        status: 'EXPIRED',
        fundsUntouched: true,
        quotes: quotes,
        request: request,
        reason: 'EXPIRED. No solver’s minAmountOut met the floor, so nothing is signed and the deposit is never made. Funds untouched.'
      });
    }

    return Object.assign(base, {
      status: 'QUOTED',
      fundsUntouched: true,
      quotes: quotes,
      winner: winner,
      request: request,
      lockedQuote: lockedFrom(pair, winner),
      steps: stepsFor(pair.kind, custom),
      reason: winner.name + ' wins. The quote locks ' + winner.amountOut.toFixed(pair.outDigits) + ' ' + pair.destinationAsset + ', guaranteed to ' + winner.minAmountOut.toFixed(pair.outDigits) + '.'
    });
  }

  function balancesAfter(previewResult, stepId) {
    const balances = clone(previewResult.opening);
    if (!previewResult.winner || previewResult.status !== 'QUOTED') return balances;
    const steps = previewResult.steps;
    const end = steps.indexOf(stepId);
    if (end < 0) return balances;
    const amountIn = previewResult.amountIn;
    const amountOut = previewResult.winner.amountOut;
    for (let i = 0; i <= end; i += 1) {
      const step = steps[i];
      if (step === 'DEPOSIT_PENDING') {
        balances.wallet = round6(balances.wallet - amountIn);
        balances.deposit = round6(balances.deposit + amountIn);
      } else if (step === 'SETTLED') {
        balances.deposit = 0;
        balances.intents = amountOut;
      } else if (step === 'SUCCESS' && previewResult.kind === 'swap') {
        balances.intents = 0;
        balances.recipient = round6(balances.recipient + amountOut);
      } else if (step === 'SUCCESS' && previewResult.custom) {
        balances.intents = 0;
        balances.vault = round6(balances.vault + amountOut);
      } else if (step === 'SUCCESS') {
        balances.intents = 0;
        balances.app = round6(balances.app + amountOut);
      }
    }
    return balances;
  }

  function bestGuarantee(kind, amountIn) {
    const peek = preview({ kind: kind, amountIn: amountIn, minimum: 0, solverCount: SOLVERS.length, custom: false });
    return peek.winner ? peek.winner.minAmountOut : 0;
  }

  return {
    SOLVERS: SOLVERS,
    PAIRS: PAIRS,
    WALLET: WALLET,
    SLIPPAGE_BPS: SLIPPAGE_BPS,
    QUOTE_WAIT_MS: QUOTE_WAIT_MS,
    STATION: STATION,
    priceOf: priceOf,
    guaranteeOf: guaranteeOf,
    selectWinner: selectWinner,
    preview: preview,
    balancesAfter: balancesAfter,
    stepDetail: stepDetail,
    bestGuarantee: bestGuarantee,
    atoms: atoms
  };
});
