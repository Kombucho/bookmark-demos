// One route, two worlds. On a single L1 the four legs share a state and a
// transaction. With venue B on an L2, the buy commits before the sell, and
// the gap in between is long enough for other people to trade.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AtomicCompose = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULTS = {
    fair: 100,
    sol: 1000,
    spread: 0.03,
    margin: 250,
    borrow: 400,
    feeBps: 30,
    slippageBps: 100,
    latency: 4,
    volatility: 0.02,
    traders: 3,
    traderSize: 0.012,
    trials: 80,
    lender: 1000000,
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function num(value, fallback) {
    const x = Number(value);
    return Number.isFinite(x) ? x : fallback;
  }

  function settings(config) {
    const c = config || {};
    let latency = Math.round(num(c.latency == null ? DEFAULTS.latency : c.latency, DEFAULTS.latency));
    if (latency < 0) latency = 0;
    if (latency > 48) latency = 48;
    let traders = Math.round(num(c.traders == null ? DEFAULTS.traders : c.traders, DEFAULTS.traders));
    if (traders < 0) traders = 0;
    if (traders > 24) traders = 24;
    let traderSize = num(c.traderSize == null ? DEFAULTS.traderSize : c.traderSize, DEFAULTS.traderSize);
    if (traderSize < 0) traderSize = 0;
    if (traderSize > 0.25) traderSize = 0.25;
    let slippageBps = num(c.slippageBps == null ? DEFAULTS.slippageBps : c.slippageBps, DEFAULTS.slippageBps);
    if (slippageBps < 0) slippageBps = 0;
    if (slippageBps > 5000) slippageBps = 5000;
    return {
      fair: num(c.fair == null ? DEFAULTS.fair : c.fair, DEFAULTS.fair),
      sol: num(c.sol == null ? DEFAULTS.sol : c.sol, DEFAULTS.sol),
      spread: num(c.spread == null ? DEFAULTS.spread : c.spread, DEFAULTS.spread),
      margin: num(c.margin == null ? DEFAULTS.margin : c.margin, DEFAULTS.margin),
      borrow: num(c.borrow == null ? DEFAULTS.borrow : c.borrow, DEFAULTS.borrow),
      feeBps: c.feeBps == null ? DEFAULTS.feeBps : c.feeBps,
      slippageBps: slippageBps,
      latency: latency,
      volatility: Math.max(0, num(c.volatility == null ? DEFAULTS.volatility : c.volatility, DEFAULTS.volatility)),
      traders: traders,
      traderSize: traderSize,
      breakLeg: c.breakLeg || null,
      script: c.script || null,
      lender: num(c.lender == null ? DEFAULTS.lender : c.lender, DEFAULTS.lender),
    };
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function poolPrice(pool) {
    return pool.usdc / pool.sol;
  }

  function invariant(pool) {
    return pool.sol * pool.usdc;
  }

  function makeWorld(config) {
    const cfg = settings(config);
    const priceA = cfg.fair;
    const priceB = cfg.fair * (1 + cfg.spread);
    return {
      venueA: {sol: cfg.sol, usdc: cfg.sol * priceA},
      venueB: {sol: cfg.sol, usdc: cfg.sol * priceB},
      user: {sol: 0, usdc: cfg.margin, debt: 0},
      lender: {usdc: cfg.lender},
      fair: cfg.fair,
    };
  }

  function swapPool(pool, give, amountIn, feeBps) {
    if (give !== 'usdc' && give !== 'sol') return {ok: false, error: 'Unknown token.'};
    if (!(amountIn > 0) || !Number.isFinite(amountIn)) return {ok: false, error: 'Amount must be positive.'};
    const feeFactor = (10000 - feeBps) / 10000;
    const amountInAfter = amountIn * feeFactor;
    const fee = amountIn - amountInAfter;
    if (!(amountInAfter > 0)) return {ok: false, error: 'Fee consumes the input.'};
    const reserveIn = give === 'usdc' ? pool.usdc : pool.sol;
    const reserveOut = give === 'usdc' ? pool.sol : pool.usdc;
    const amountOut = reserveOut * amountInAfter / (reserveIn + amountInAfter);
    if (!(amountOut > 0) || amountOut >= reserveOut) return {ok: false, error: 'Pool cannot fill this swap.'};
    const next = {sol: pool.sol, usdc: pool.usdc};
    if (give === 'usdc') {
      next.usdc = pool.usdc + amountInAfter;
      next.sol = pool.sol - amountOut;
    } else {
      next.sol = pool.sol + amountInAfter;
      next.usdc = pool.usdc - amountOut;
    }
    return {ok: true, pool: next, amountOut: amountOut, fee: fee, amountInAfter: amountInAfter, give: give};
  }

  function quoteRoute(world, config) {
    const cfg = settings(config);
    if (!(cfg.borrow > 0) || cfg.borrow > world.lender.usdc) return {ok: false, error: 'Borrow is not available.'};
    const buy = swapPool(world.venueA, 'usdc', cfg.borrow, cfg.feeBps);
    if (!buy.ok) return buy;
    const sell = swapPool(world.venueB, 'sol', buy.amountOut, cfg.feeBps);
    if (!sell.ok) return sell;
    const slip = cfg.slippageBps / 10000;
    return {
      ok: true,
      plan: {
        borrow: cfg.borrow,
        solOut: buy.amountOut,
        usdcOut: sell.amountOut,
        minSol: buy.amountOut * (1 - slip),
        minUsdc: sell.amountOut * (1 - slip),
        profit: sell.amountOut - cfg.borrow,
        feeBps: cfg.feeBps,
      },
    };
  }

  function profitBetween(start, end) {
    const equity = end.user.usdc + end.user.sol * end.fair - end.user.debt;
    return equity - start.user.usdc;
  }

  function event(t, id, title, detail, world, trades) {
    return {
      t: t,
      id: id,
      title: title,
      detail: detail,
      world: clone(world),
      trades: trades || [],
    };
  }

  function outcome(status, world, profit, timeline, plan, reason) {
    return {
      status: status,
      profit: profit,
      world: world,
      timeline: timeline,
      plan: plan,
      reason: reason || null,
    };
  }

  function atomicTimeline(world, landed) {
    const detail = landed ? 'Included in the one transaction.' : 'Rolled back with the transaction.';
    return [
      event(0, 'borrow', 'Flash borrow', detail, world),
      event(0, 'buy', 'Swap on venue A', detail, world),
      event(0, 'sell', 'Swap on venue B', detail, world),
      event(0, 'repay', 'Repay', detail, world),
    ];
  }

  function applyRoute(world, plan, cfg) {
    const w = clone(world);
    if (cfg.breakLeg === 'borrow') return {ok: false, reason: 'borrow'};
    if (w.lender.usdc < plan.borrow) return {ok: false, reason: 'lender'};
    w.lender.usdc -= plan.borrow;
    w.user.usdc += plan.borrow;
    w.user.debt += plan.borrow;

    if (cfg.breakLeg === 'buy') return {ok: false, reason: 'buy'};
    const buy = swapPool(w.venueA, 'usdc', plan.borrow, plan.feeBps);
    if (!buy.ok || buy.amountOut + 1e-9 < plan.minSol) return {ok: false, reason: 'buy'};
    w.venueA = buy.pool;
    w.user.usdc -= plan.borrow;
    w.user.sol += buy.amountOut;

    if (cfg.breakLeg === 'sell') return {ok: false, reason: 'sell'};
    const sell = swapPool(w.venueB, 'sol', w.user.sol, plan.feeBps);
    if (!sell.ok || sell.amountOut + 1e-9 < plan.minUsdc) return {ok: false, reason: 'sell'};
    w.venueB = sell.pool;
    w.user.sol = 0;
    w.user.usdc += sell.amountOut;

    if (cfg.breakLeg === 'repay') return {ok: false, reason: 'repay'};
    if (w.user.usdc + 1e-8 < w.user.debt) return {ok: false, reason: 'repay'};
    w.lender.usdc += w.user.debt;
    w.user.usdc -= w.user.debt;
    w.user.debt = 0;
    const profit = w.user.usdc - world.user.usdc;
    if (profit < -1e-8) return {ok: false, reason: 'loss'};
    return {ok: true, world: w, profit: profit};
  }

  function executeAtomic(world, config) {
    const cfg = settings(config);
    const start = clone(world);
    const quoted = quoteRoute(start, cfg);
    if (!quoted.ok || quoted.plan.profit < -1e-8) {
      return outcome('reverted', start, 0, atomicTimeline(start, false), quoted.ok ? quoted.plan : null, 'no-edge');
    }
    const applied = applyRoute(start, quoted.plan, cfg);
    if (!applied.ok) {
      return outcome('reverted', start, 0, atomicTimeline(start, false), quoted.plan, applied.reason);
    }
    return outcome('landed', applied.world, applied.profit, atomicTimeline(applied.world, true), quoted.plan, null);
  }

  function takeShock(cfg, script, rng) {
    if (script.values && script.i < script.values.length) {
      const shock = script.values[script.i];
      script.i += 1;
      return shock;
    }
    return (rng() * 2 - 1) * cfg.volatility;
  }

  function advance(world, cfg, rng, script) {
    const shock = takeShock(cfg, script, rng);
    const next = clone(world);
    next.fair = world.fair * Math.exp(shock);
    const trades = [];
    let i;
    for (i = 0; i < cfg.traders; i += 1) {
      const name = rng() < 0.5 ? 'venueA' : 'venueB';
      const pool = next[name];
      const price = poolPrice(pool);
      if (Math.abs(price - next.fair) / next.fair < 0.0005) continue;
      const give = price > next.fair ? 'sol' : 'usdc';
      const amountIn = (give === 'sol' ? pool.sol : pool.usdc) * cfg.traderSize;
      const traded = swapPool(pool, give, amountIn, cfg.feeBps);
      if (!traded.ok) continue;
      next[name] = traded.pool;
      trades.push({venue: name, give: give, amountIn: amountIn, amountOut: traded.amountOut});
    }
    return {world: next, trades: trades, shock: shock};
  }

  function executeSplit(world, config, rng) {
    const cfg = settings(config);
    const random = rng || mulberry32(1);
    const start = clone(world);
    const quoted = quoteRoute(start, cfg);
    if (!quoted.ok || quoted.plan.profit < -1e-8) {
      return outcome('reverted', start, 0, atomicTimeline(start, false), quoted.ok ? quoted.plan : null, 'no-edge');
    }
    const plan = quoted.plan;
    const timeline = [];
    const script = {i: 0, values: cfg.script};

    const w = clone(start);
    if (w.lender.usdc < plan.borrow) return outcome('reverted', start, 0, timeline, plan, 'lender');
    w.lender.usdc -= plan.borrow;
    w.user.usdc += plan.borrow;
    w.user.debt += plan.borrow;
    const buy = swapPool(w.venueA, 'usdc', plan.borrow, plan.feeBps);
    if (!buy.ok || buy.amountOut + 1e-9 < plan.minSol) {
      return outcome('reverted', start, 0, timeline, plan, 'buy');
    }
    w.venueA = buy.pool;
    w.user.usdc -= plan.borrow;
    w.user.sol += buy.amountOut;
    timeline.push(event(0, 'borrow', 'Flash borrow', 'Borrowed on L1. This leg is already committed.', w));
    timeline.push(event(0, 'buy', 'Swap on venue A', 'Bought SOL on L1. It now has to reach venue B.', w));

    let slot = 0;
    let i;
    for (i = 0; i < cfg.latency; i += 1) {
      slot += 1;
      const stepped = advance(w, cfg, random, script);
      w.fair = stepped.world.fair;
      w.venueA = stepped.world.venueA;
      w.venueB = stepped.world.venueB;
      timeline.push(event(slot, 'gap', 'Bridge to the L2', 'SOL is in flight. Venue B keeps its own sequence.', w, stepped.trades));
    }

    const sell = swapPool(w.venueB, 'sol', w.user.sol, plan.feeBps);
    if (!sell.ok || sell.amountOut + 1e-9 < plan.minUsdc) {
      timeline.push(event(slot, 'sell-failed', 'Swap on venue B failed', 'The L2 leg reverted. The L1 borrow and buy did not.', w));
      return outcome('partial', clone(w), profitBetween(start, w), timeline, plan, 'sell');
    }
    w.venueB = sell.pool;
    w.user.sol = 0;
    w.user.usdc += sell.amountOut;
    timeline.push(event(slot, 'sell', 'Swap on venue B', 'Sold SOL on the L2, at whatever price is there now.', w));

    for (i = 0; i < cfg.latency; i += 1) {
      slot += 1;
      const stepped = advance(w, cfg, random, script);
      w.fair = stepped.world.fair;
      w.venueA = stepped.world.venueA;
      w.venueB = stepped.world.venueB;
      timeline.push(event(slot, 'return', 'Bridge back to L1', 'USDC is in flight. The repay cannot run yet.', w, stepped.trades));
    }

    if (w.user.usdc + 1e-8 < w.user.debt) {
      timeline.push(event(slot, 'repay-failed', 'Repay failed', 'The desk cannot cover the loan. The position is already open.', w));
      return outcome('partial', clone(w), profitBetween(start, w), timeline, plan, 'repay');
    }
    w.lender.usdc += w.user.debt;
    w.user.usdc -= w.user.debt;
    w.user.debt = 0;
    const profit = w.user.usdc - start.user.usdc;
    timeline.push(event(slot, 'repay', 'Repay', 'Debt cleared on L1, after the bridge.', w));
    return outcome('landed', clone(w), profit, timeline, plan, null);
  }

  function emptyTally() {
    return {landed: 0, reverted: 0, partial: 0, profits: []};
  }

  function pushTally(tally, row) {
    tally[row.status] += 1;
    tally.profits.push(row.profit);
  }

  function finishTally(tally) {
    const sum = tally.profits.reduce(function (acc, value) { return acc + value; }, 0);
    return {
      landed: tally.landed,
      reverted: tally.reverted,
      partial: tally.partial,
      mean: tally.profits.length ? sum / tally.profits.length : 0,
      profits: tally.profits,
    };
  }

  function runOnce(config, seed) {
    const cfg = settings(config);
    const world = makeWorld(cfg);
    const rng = mulberry32(seed == null ? 1 : seed);
    return {
      seed: seed == null ? 1 : seed >>> 0,
      start: world,
      quote: quoteRoute(world, cfg),
      atomic: executeAtomic(world, cfg),
      split: executeSplit(world, cfg, rng),
    };
  }

  function runTrials(config, n, seed) {
    const cfg = settings(config);
    let count = Math.round(num(n, DEFAULTS.trials));
    if (count < 1) count = 1;
    if (count > 500) count = 500;
    const rng = mulberry32(seed == null ? 1 : seed);
    const world = makeWorld(cfg);
    const atomic = emptyTally();
    const split = emptyTally();
    let i;
    for (i = 0; i < count; i += 1) {
      pushTally(atomic, executeAtomic(world, cfg));
      pushTally(split, executeSplit(world, cfg, rng));
    }
    return {
      trials: count,
      seed: seed == null ? 1 : seed >>> 0,
      quote: quoteRoute(world, cfg),
      atomic: finishTally(atomic),
      split: finishTally(split),
    };
  }

  return {
    DEFAULTS: DEFAULTS,
    settings: settings,
    mulberry32: mulberry32,
    poolPrice: poolPrice,
    invariant: invariant,
    makeWorld: makeWorld,
    swapPool: swapPool,
    quoteRoute: quoteRoute,
    profitBetween: profitBetween,
    executeAtomic: executeAtomic,
    executeSplit: executeSplit,
    runOnce: runOnce,
    runTrials: runTrials,
  };
});
