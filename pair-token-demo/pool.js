// A full-range constant-product pool and a Pair Token share of it.
// Swap fees stay out of the reserves, so k is unchanged by trading.
// Compound folds 90% of those fees back into the reserves and keeps 10%.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PairPool = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FEE_CUT = 0.1;
  const SEED = {amount0: 100, amount1: 10000, feeBps: 30, desk0: 40, desk1: 4000};

  function clonePool(pool) {
    return {
      reserve0: pool.reserve0,
      reserve1: pool.reserve1,
      fee0: pool.fee0,
      fee1: pool.fee1,
      supply: pool.supply,
      feeBps: pool.feeBps,
      cut0: pool.cut0,
      cut1: pool.cut1,
    };
  }

  function kOf(pool) {
    return pool.reserve0 * pool.reserve1;
  }

  function spot(pool) {
    return pool.reserve1 / pool.reserve0;
  }

  function perShare(pool) {
    if (!(pool.supply > 0)) {
      return {reserve0: 0, reserve1: 0, fee0: 0, fee1: 0, total0: 0, total1: 0};
    }
    const s = pool.supply;
    return {
      reserve0: pool.reserve0 / s,
      reserve1: pool.reserve1 / s,
      fee0: pool.fee0 / s,
      fee1: pool.fee1 / s,
      total0: (pool.reserve0 + pool.fee0) / s,
      total1: (pool.reserve1 + pool.fee1) / s,
    };
  }

  function mark(pool, price) {
    const share = perShare(pool);
    return share.total0 * price + share.total1;
  }

  function validFee(feeBps) {
    return Number.isInteger(feeBps) && feeBps >= 0 && feeBps < 10000;
  }

  function createPool(amount0, amount1, feeBps) {
    if (!(amount0 > 0) || !(amount1 > 0) || !Number.isFinite(amount0) || !Number.isFinite(amount1)) {
      return {ok: false, error: 'Both tokens must be positive.'};
    }
    if (!validFee(feeBps)) return {ok: false, error: 'Fee tier must be a whole number of basis points under 10000.'};
    return {
      ok: true,
      pool: {
        reserve0: amount0,
        reserve1: amount1,
        fee0: 0,
        fee1: 0,
        supply: Math.sqrt(amount0 * amount1),
        feeBps: feeBps,
        cut0: 0,
        cut1: 0,
      },
    };
  }

  function swap(pool, tokenIn, amountIn) {
    if (tokenIn !== 0 && tokenIn !== 1) return {ok: false, error: 'Unknown token.'};
    if (!(amountIn > 0) || !Number.isFinite(amountIn)) return {ok: false, error: 'Amount must be positive.'};
    if (!(pool.reserve0 > 0) || !(pool.reserve1 > 0)) return {ok: false, error: 'Pool is empty.'};
    const feeFactor = (10000 - pool.feeBps) / 10000;
    const amountInAfter = amountIn * feeFactor;
    const fee = amountIn - amountInAfter;
    if (!(amountInAfter > 0)) return {ok: false, error: 'Fee consumes the input.'};
    const reserveIn = tokenIn === 0 ? pool.reserve0 : pool.reserve1;
    const reserveOut = tokenIn === 0 ? pool.reserve1 : pool.reserve0;
    const amountOut = reserveOut * amountInAfter / (reserveIn + amountInAfter);
    if (!(amountOut > 0) || amountOut >= reserveOut) return {ok: false, error: 'Pool cannot fill this swap.'};
    const next = clonePool(pool);
    if (tokenIn === 0) {
      next.reserve0 = pool.reserve0 + amountInAfter;
      next.reserve1 = pool.reserve1 - amountOut;
      next.fee0 = pool.fee0 + fee;
    } else {
      next.reserve1 = pool.reserve1 + amountInAfter;
      next.reserve0 = pool.reserve0 - amountOut;
      next.fee1 = pool.fee1 + fee;
    }
    return {ok: true, pool: next, amountOut: amountOut, fee: fee, amountInAfter: amountInAfter, tokenIn: tokenIn};
  }

  function arbToPrice(pool, targetPrice) {
    if (!(targetPrice > 0) || !Number.isFinite(targetPrice)) return {ok: false, error: 'Price must be positive.'};
    if (!(pool.reserve0 > 0) || !(pool.reserve1 > 0)) return {ok: false, error: 'Pool is empty.'};
    const k = kOf(pool);
    const target0 = Math.sqrt(k / targetPrice);
    const target1 = Math.sqrt(k * targetPrice);
    if (Math.abs(target0 - pool.reserve0) <= 1e-12 * pool.reserve0) {
      return {ok: true, pool: clonePool(pool), amountIn: 0, amountOut: 0, fee: 0, tokenIn: 0};
    }
    const feeFactor = (10000 - pool.feeBps) / 10000;
    if (!(feeFactor > 0)) return {ok: false, error: 'Fee tier leaves nothing to swap.'};
    if (target0 < pool.reserve0) {
      const amountInAfter = target1 - pool.reserve1;
      return swap(pool, 1, amountInAfter / feeFactor);
    }
    const amountInAfter = target0 - pool.reserve0;
    return swap(pool, 0, amountInAfter / feeFactor);
  }

  function mint(pool, amount0) {
    if (!(pool.supply > 0)) return {ok: false, error: 'Pool is empty.'};
    if (!(amount0 > 0) || !Number.isFinite(amount0)) return {ok: false, error: 'Amount must be positive.'};
    const total0 = pool.reserve0 + pool.fee0;
    const total1 = pool.reserve1 + pool.fee1;
    if (!(total0 > 0) || !(total1 > 0)) return {ok: false, error: 'Pool has no backing.'};
    const amount1 = amount0 * total1 / total0;
    const shares = pool.supply * amount0 / total0;
    const next = clonePool(pool);
    next.reserve0 = pool.reserve0 + amount0 * (pool.reserve0 / total0);
    next.reserve1 = pool.reserve1 + amount1 * (pool.reserve1 / total1);
    next.fee0 = pool.fee0 + amount0 * (pool.fee0 / total0);
    next.fee1 = pool.fee1 + amount1 * (pool.fee1 / total1);
    next.supply = pool.supply + shares;
    return {ok: true, pool: next, amount0: amount0, amount1: amount1, shares: shares};
  }

  function redeem(pool, shares) {
    if (!(shares > 0) || !Number.isFinite(shares)) return {ok: false, error: 'Shares must be positive.'};
    if (!(pool.supply > 0)) return {ok: false, error: 'Pool is empty.'};
    if (shares > pool.supply + 1e-9) return {ok: false, error: 'Not enough shares.'};
    const fraction = Math.min(1, shares / pool.supply);
    const amount0 = (pool.reserve0 + pool.fee0) * fraction;
    const amount1 = (pool.reserve1 + pool.fee1) * fraction;
    const next = clonePool(pool);
    if (fraction >= 1 - 1e-15) {
      next.reserve0 = 0;
      next.reserve1 = 0;
      next.fee0 = 0;
      next.fee1 = 0;
      next.supply = 0;
    } else {
      next.reserve0 = pool.reserve0 * (1 - fraction);
      next.reserve1 = pool.reserve1 * (1 - fraction);
      next.fee0 = pool.fee0 * (1 - fraction);
      next.fee1 = pool.fee1 * (1 - fraction);
      next.supply = pool.supply - shares;
    }
    return {ok: true, pool: next, amount0: amount0, amount1: amount1, shares: shares};
  }

  function compound(pool) {
    if (!(pool.reserve0 > 0) || !(pool.reserve1 > 0)) return {ok: false, error: 'Pool is empty.'};
    if (pool.fee0 <= 0 && pool.fee1 <= 0) {
      return {ok: true, pool: clonePool(pool), cut0: 0, cut1: 0, add0: 0, add1: 0};
    }
    const cut0 = pool.fee0 / 10;
    const cut1 = pool.fee1 / 10;
    const net0 = pool.fee0 - cut0;
    const net1 = pool.fee1 - cut1;
    const price = spot(pool);
    const value = net0 * price + net1;
    const add0 = value / (2 * price);
    const add1 = value / 2;
    const next = clonePool(pool);
    next.reserve0 = pool.reserve0 + add0;
    next.reserve1 = pool.reserve1 + add1;
    next.fee0 = 0;
    next.fee1 = 0;
    next.cut0 = pool.cut0 + cut0;
    next.cut1 = pool.cut1 + cut1;
    return {ok: true, pool: next, cut0: cut0, cut1: cut1, add0: add0, add1: add1};
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

  function sample(state) {
    const idx = indexes(state);
    return {
      step: state.step,
      pair: idx.pair,
      hold: idx.hold,
      flat: idx.flat,
      price: state.price,
      k: idx.k,
      kFlat: idx.kFlat,
    };
  }

  function indexes(state) {
    const price = state.price;
    return {
      pair: mark(state.pool, price) / state.origin,
      flat: mark(state.shadow, price) / state.origin,
      hold: (state.hold0 * price + state.hold1) / state.origin,
      price: price,
      k: kOf(state.pool),
      kFlat: kOf(state.shadow),
      perShare: perShare(state.pool),
    };
  }

  function createState(opts) {
    const o = opts || {};
    const built = createPool(
      o.amount0 == null ? SEED.amount0 : o.amount0,
      o.amount1 == null ? SEED.amount1 : o.amount1,
      o.feeBps == null ? SEED.feeBps : o.feeBps
    );
    if (!built.ok) return built;
    const pool = built.pool;
    const price = spot(pool);
    const state = {
      pool: pool,
      shadow: clonePool(pool),
      price: price,
      initialPrice: price,
      hold0: pool.reserve0 / pool.supply,
      hold1: pool.reserve1 / pool.supply,
      origin: mark(pool, price),
      step: 0,
      history: [],
      desk: {
        token0: o.desk0 == null ? SEED.desk0 : o.desk0,
        token1: o.desk1 == null ? SEED.desk1 : o.desk1,
        shares: pool.supply,
      },
    };
    state.history.push(sample(state));
    return {ok: true, state: state};
  }

  function withPool(state, pool, price, step) {
    const next = {
      pool: pool,
      shadow: state.shadow,
      price: price,
      initialPrice: state.initialPrice,
      hold0: state.hold0,
      hold1: state.hold1,
      origin: state.origin,
      step: step,
      desk: state.desk,
      history: state.history,
    };
    next.history = state.history.concat([sample(next)]);
    return next;
  }

  function flow(pool, targetPrice, volume, direction) {
    const opened = arbToPrice(pool, targetPrice);
    if (!opened.ok) return opened;
    if (!(volume > 0)) return opened;
    const tokenIn = direction < 0.5 ? 0 : 1;
    const reserveIn = tokenIn === 0 ? opened.pool.reserve0 : opened.pool.reserve1;
    const traded = swap(opened.pool, tokenIn, reserveIn * volume);
    if (!traded.ok) return traded;
    return arbToPrice(traded.pool, targetPrice);
  }

  function stepState(state, opts) {
    const o = opts || {};
    if (!(state.pool.supply > 0)) return {ok: false, error: 'Pool is empty.'};
    if (typeof o.rng !== 'function') return {ok: false, error: 'Missing random stream.'};
    const vol = Number(o.volatility);
    const volatility = Number.isFinite(vol) && vol > 0 ? vol : 0;
    let volume = Number(o.volume);
    if (!Number.isFinite(volume) || volume < 0) volume = 0;
    if (volume > 0.5) volume = 0.5;
    const shock = (o.rng() * 2 - 1) * volatility;
    const direction = o.rng();
    let price = state.price * Math.exp(shock);
    const floor = state.initialPrice / 10000;
    const cap = state.initialPrice * 10000;
    if (price < floor) price = floor;
    if (price > cap) price = cap;
    const live = flow(state.pool, price, volume, direction);
    if (!live.ok) return live;
    const shadow = flow(state.shadow, price, volume, direction);
    if (!shadow.ok) return shadow;
    let nextPool = live.pool;
    if (o.autoCompound && (nextPool.fee0 > 0 || nextPool.fee1 > 0)) {
      const folded = compound(nextPool);
      if (!folded.ok) return folded;
      nextPool = folded.pool;
    }
    const next = {
      pool: nextPool,
      shadow: shadow.pool,
      price: price,
      initialPrice: state.initialPrice,
      hold0: state.hold0,
      hold1: state.hold1,
      origin: state.origin,
      step: state.step + 1,
      desk: state.desk,
      history: state.history,
    };
    next.history = state.history.concat([sample(next)]);
    return {ok: true, state: next, price: price};
  }

  function markTo(state, price) {
    if (!(price > 0) || !Number.isFinite(price)) return {ok: false, error: 'Price must be positive.'};
    const live = arbToPrice(state.pool, price);
    if (!live.ok) return live;
    const shadow = arbToPrice(state.shadow, price);
    if (!shadow.ok) return shadow;
    const next = {
      pool: live.pool,
      shadow: shadow.pool,
      price: price,
      initialPrice: state.initialPrice,
      hold0: state.hold0,
      hold1: state.hold1,
      origin: state.origin,
      step: state.step + 1,
      desk: state.desk,
      history: state.history,
    };
    next.history = state.history.concat([sample(next)]);
    return {ok: true, state: next};
  }

  function scalePool(pool, factor) {
    const next = clonePool(pool);
    next.reserve0 *= factor;
    next.reserve1 *= factor;
    next.fee0 *= factor;
    next.fee1 *= factor;
    next.supply *= factor;
    next.cut0 *= factor;
    next.cut1 *= factor;
    return next;
  }

  function mintDesk(state, amount0) {
    const quoted = mint(state.pool, amount0);
    if (!quoted.ok) return quoted;
    if (state.desk.token0 + 1e-9 < quoted.amount0 || state.desk.token1 + 1e-6 < quoted.amount1) {
      return {ok: false, error: 'The desk does not hold both tokens in the pool ratio.', amount0: quoted.amount0, amount1: quoted.amount1};
    }
    const factor = quoted.pool.supply / state.pool.supply;
    return {
      ok: true,
      state: {
        pool: quoted.pool,
        shadow: scalePool(state.shadow, factor),
        price: state.price,
        initialPrice: state.initialPrice,
        hold0: state.hold0,
        hold1: state.hold1,
        origin: state.origin,
        step: state.step,
        history: state.history,
        desk: {
          token0: state.desk.token0 - quoted.amount0,
          token1: state.desk.token1 - quoted.amount1,
          shares: state.desk.shares + quoted.shares,
        },
      },
      amount0: quoted.amount0,
      amount1: quoted.amount1,
      shares: quoted.shares,
    };
  }

  function redeemDesk(state, shares) {
    if (shares > state.desk.shares + 1e-9) return {ok: false, error: 'The desk does not hold that many shares.'};
    const quoted = redeem(state.pool, shares);
    if (!quoted.ok) return quoted;
    const factor = state.pool.supply > 0 ? quoted.pool.supply / state.pool.supply : 0;
    return {
      ok: true,
      state: {
        pool: quoted.pool,
        shadow: scalePool(state.shadow, factor),
        price: state.price,
        initialPrice: state.initialPrice,
        hold0: state.hold0,
        hold1: state.hold1,
        origin: state.origin,
        step: state.step,
        history: state.history,
        desk: {
          token0: state.desk.token0 + quoted.amount0,
          token1: state.desk.token1 + quoted.amount1,
          shares: state.desk.shares - quoted.shares,
        },
      },
      amount0: quoted.amount0,
      amount1: quoted.amount1,
      shares: quoted.shares,
    };
  }

  function compoundState(state) {
    if (state.pool.fee0 <= 1e-12 && state.pool.fee1 <= 1e-12) return {ok: false, error: 'No fees to compound.'};
    const done = compound(state.pool);
    if (!done.ok) return done;
    return {
      ok: true,
      state: withPool(state, done.pool, state.price, state.step + 1),
      cut0: done.cut0,
      cut1: done.cut1,
      add0: done.add0,
      add1: done.add1,
    };
  }

  function setFeeBps(state, feeBps) {
    if (!validFee(feeBps)) return {ok: false, error: 'Bad fee tier.'};
    const pool = clonePool(state.pool);
    const shadow = clonePool(state.shadow);
    pool.feeBps = feeBps;
    shadow.feeBps = feeBps;
    return {
      ok: true,
      state: {
        pool: pool,
        shadow: shadow,
        price: state.price,
        initialPrice: state.initialPrice,
        hold0: state.hold0,
        hold1: state.hold1,
        origin: state.origin,
        step: state.step,
        history: state.history,
        desk: state.desk,
      },
    };
  }

  return {
    FEE_CUT: FEE_CUT,
    SEED: SEED,
    clonePool: clonePool,
    kOf: kOf,
    spot: spot,
    perShare: perShare,
    mark: mark,
    createPool: createPool,
    swap: swap,
    arbToPrice: arbToPrice,
    mint: mint,
    redeem: redeem,
    compound: compound,
    mulberry32: mulberry32,
    indexes: indexes,
    createState: createState,
    stepState: stepState,
    markTo: markTo,
    mintDesk: mintDesk,
    redeemDesk: redeemDesk,
    compoundState: compoundState,
    setFeeBps: setFeeBps,
  };
});
