// A simulated KEEL desk.
// Constant-product fair launch, a per-wallet cap, fee staking, a treasury
// buyback-and-burn, and a lock-on-source / mint-on-NEAR bridge.
// No wallet, no network, no signature. The numbers are this file's numbers.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MemeMechanics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const V_NEAR = 40;
  const V_TOKEN = 80000;
  const CAP = 4000;
  const FEE_BPS = 300;
  const STAKER_BPS = 7000;
  const THRESHOLD = 0.12;
  const SNIPER_TRY = 20000;

  const WALLET_ORDER = ['you', 'sniper', 'ladle', 'kiln', 'ferry'];

  const WALLET_SEED = {
    you: {name: 'You', kind: 'human', near: 30},
    sniper: {name: 'Sniper', kind: 'bot', near: 40},
    ladle: {name: 'Ladle', kind: 'bot', near: 30},
    kiln: {name: 'Kiln', kind: 'bot', near: 24},
    ferry: {name: 'Ferry', kind: 'bot', near: 16},
  };

  function round(n, places) {
    const m = Math.pow(10, places);
    return Math.round(n * m) / m;
  }

  function blankWallet(seed) {
    return {
      name: seed.name,
      kind: seed.kind,
      near: seed.near,
      broth: 0,
      staked: 0,
      nearSide: 0,
      claimable: 0,
      rewardDebt: 0,
    };
  }

  function createWorld() {
    const wallets = {};
    WALLET_ORDER.forEach(function (id) {
      wallets[id] = blankWallet(WALLET_SEED[id]);
    });
    return {
      nearReserve: V_NEAR,
      tokenReserve: V_TOKEN,
      realNear: 0,
      burned: 0,
      issued: 0,
      treasury: 0,
      feeEscrow: 0,
      accFeePerStake: 0,
      totalStaked: 0,
      escrow: 0,
      minted: 0,
      time: 0,
      burns: 0,
      lastRule: null,
      lastEvent: null,
      tape: [V_NEAR / V_TOKEN],
      wallets: wallets,
    };
  }

  function spotOf(world) {
    return world.nearReserve / world.tokenReserve;
  }

  function kOf(world) {
    return world.nearReserve * world.tokenReserve;
  }

  function issuedOf(world) {
    return V_TOKEN - world.tokenReserve;
  }

  function holdings(wallet) {
    return wallet.broth + wallet.nearSide + wallet.staked;
  }

  function pendingOf(world, id) {
    const w = world.wallets[id];
    return w.staked * world.accFeePerStake - w.rewardDebt + w.claimable;
  }

  function fail(reason, extra) {
    return Object.assign({ok: false, reason: reason}, extra || {});
  }

  function note(world, ev) {
    world.lastEvent = ev;
    return ev;
  }

  function splitFee(world, fee) {
    const toStakers = fee * STAKER_BPS / 10000;
    const toTreasury = fee - toStakers;
    if (world.totalStaked > 0) world.feeEscrow += toStakers;
    else world.treasury += toStakers;
    if (world.totalStaked > 0) world.accFeePerStake += toStakers / world.totalStaked;
    world.treasury += toTreasury;
  }

  function harvest(world, id) {
    const w = world.wallets[id];
    const gained = w.staked * world.accFeePerStake - w.rewardDebt;
    if (gained > 0) w.claimable += gained;
    w.rewardDebt = w.staked * world.accFeePerStake;
    return gained;
  }

  // Tokens received for spending `nearIn` along the curve. Does not look at wallets.
  function tokensForNear(world, nearIn) {
    const k = kOf(world);
    const newNear = world.nearReserve + nearIn;
    const newToken = k / newNear;
    return {
      newNear: newNear,
      newToken: newToken,
      tokens: world.tokenReserve - newToken,
      price: newNear / newToken,
    };
  }

  function costForTokens(world, tokens) {
    const k = kOf(world);
    const newToken = world.tokenReserve - tokens;
    const newNear = k / newToken;
    return {
      newNear: newNear,
      newToken: newToken,
      cost: newNear - world.nearReserve,
      price: newNear / newToken,
    };
  }

  function proceedsForTokens(world, tokens) {
    const k = kOf(world);
    const newToken = world.tokenReserve + tokens;
    const newNear = k / newToken;
    return {
      newNear: newNear,
      newToken: newToken,
      proceeds: world.nearReserve - newNear,
      price: newNear / newToken,
    };
  }

  function previewBuy(world, id, tokens) {
    const w = world.wallets[id];
    if (!w) return fail('wallet');
    if (!Number.isFinite(tokens) || tokens < 1) return fail('amount');
    const whole = Math.floor(tokens);
    if (holdings(w) + whole > CAP) {
      return fail('cap', {id: id, wanted: whole, cap: CAP, held: holdings(w)});
    }
    if (whole >= world.tokenReserve * 0.5) return fail('curve', {id: id, wanted: whole});
    const quote = costForTokens(world, whole);
    const fee = quote.cost * FEE_BPS / 10000;
    const total = quote.cost + fee;
    if (w.near + 1e-9 < total) {
      return fail('funds', {id: id, wanted: whole, total: total, near: w.near});
    }
    return {
      ok: true,
      type: 'buy',
      id: id,
      tokens: whole,
      cost: quote.cost,
      fee: fee,
      total: total,
      price: quote.price,
    };
  }

  function previewSell(world, id, tokens) {
    const w = world.wallets[id];
    if (!w) return fail('wallet');
    if (!Number.isFinite(tokens) || tokens < 1) return fail('amount');
    const whole = Math.floor(tokens);
    if (w.broth + 1e-9 < whole) return fail('balance', {id: id, wanted: whole, broth: w.broth});
    const quote = proceedsForTokens(world, whole);
    if (quote.proceeds > world.realNear + 1e-8) return fail('curve', {id: id, wanted: whole});
    const fee = quote.proceeds * FEE_BPS / 10000;
    return {
      ok: true,
      type: 'sell',
      id: id,
      tokens: whole,
      proceeds: quote.proceeds,
      fee: fee,
      net: quote.proceeds - fee,
      price: quote.price,
    };
  }

  function applyRule(world) {
    if (world.treasury < THRESHOLD - 1e-12) return {ok: true, fired: false};
    const spend = world.treasury;
    const bought = tokensForNear(world, spend);
    world.treasury = 0;
    world.nearReserve = bought.newNear;
    world.tokenReserve = bought.newToken;
    world.realNear += spend;
    world.issued += bought.tokens;
    world.burned += bought.tokens;
    world.burns += 1;
    const ev = {
      ok: true,
      fired: true,
      type: 'rule',
      time: world.time,
      spent: spend,
      burned: bought.tokens,
      price: spotOf(world),
    };
    world.lastRule = ev;
    return ev;
  }

  function afterTrade(world, trade) {
    const rule = applyRule(world);
    if (rule.fired) trade.rule = note(world, rule);
    return note(world, trade);
  }

  function buy(world, id, tokens) {
    const preview = previewBuy(world, id, tokens);
    if (!preview.ok) return note(world, preview);
    const quote = costForTokens(world, preview.tokens);
    const w = world.wallets[id];
    w.near -= preview.total;
    w.broth += preview.tokens;
    world.nearReserve = quote.newNear;
    world.tokenReserve = quote.newToken;
    world.realNear += preview.cost;
    world.issued += preview.tokens;
    splitFee(world, preview.fee);
    return afterTrade(world, preview);
  }

  function sell(world, id, tokens) {
    const preview = previewSell(world, id, tokens);
    if (!preview.ok) return note(world, preview);
    const quote = proceedsForTokens(world, preview.tokens);
    const w = world.wallets[id];
    w.broth -= preview.tokens;
    w.near += preview.net;
    world.nearReserve = quote.newNear;
    world.tokenReserve = quote.newToken;
    world.realNear -= preview.proceeds;
    world.issued -= preview.tokens;
    splitFee(world, preview.fee);
    return afterTrade(world, preview);
  }

  function stake(world, id, tokens) {
    const w = world.wallets[id];
    if (!w) return note(world, fail('wallet'));
    if (!Number.isFinite(tokens) || tokens < 1) return note(world, fail('amount', {id: id}));
    const whole = Math.floor(tokens);
    if (w.broth + 1e-9 < whole) {
      return note(world, fail('balance', {id: id, wanted: whole, broth: w.broth}));
    }
    harvest(world, id);
    w.broth -= whole;
    w.staked += whole;
    world.totalStaked += whole;
    w.rewardDebt = w.staked * world.accFeePerStake;
    return note(world, {ok: true, type: 'stake', id: id, tokens: whole});
  }

  function unstake(world, id, tokens) {
    const w = world.wallets[id];
    if (!w) return note(world, fail('wallet'));
    if (!Number.isFinite(tokens) || tokens < 1) return note(world, fail('amount', {id: id}));
    const whole = Math.floor(tokens);
    if (w.staked + 1e-9 < whole) {
      return note(world, fail('balance', {id: id, wanted: whole, staked: w.staked}));
    }
    harvest(world, id);
    w.staked -= whole;
    w.broth += whole;
    world.totalStaked -= whole;
    w.rewardDebt = w.staked * world.accFeePerStake;
    return note(world, {ok: true, type: 'unstake', id: id, tokens: whole});
  }

  function claim(world, id) {
    const w = world.wallets[id];
    if (!w) return note(world, fail('wallet'));
    harvest(world, id);
    if (!(w.claimable > 1e-12)) return note(world, fail('claim', {id: id}));
    const near = w.claimable;
    w.claimable = 0;
    w.near += near;
    world.feeEscrow -= near;
    return note(world, {ok: true, type: 'claim', id: id, near: near});
  }

  function bridgeToNear(world, id, tokens) {
    const w = world.wallets[id];
    if (!w) return note(world, fail('wallet'));
    if (!Number.isFinite(tokens) || tokens < 1) return note(world, fail('amount', {id: id}));
    const whole = Math.floor(tokens);
    if (w.broth + 1e-9 < whole) {
      return note(world, fail('balance', {id: id, wanted: whole, broth: w.broth}));
    }
    w.broth -= whole;
    w.nearSide += whole;
    world.escrow += whole;
    world.minted += whole;
    return note(world, {
      ok: true,
      type: 'bridge-near',
      id: id,
      tokens: whole,
      stages: ['lock', 'sign', 'mint'],
    });
  }

  function bridgeToSource(world, id, tokens) {
    const w = world.wallets[id];
    if (!w) return note(world, fail('wallet'));
    if (!Number.isFinite(tokens) || tokens < 1) return note(world, fail('amount', {id: id}));
    const whole = Math.floor(tokens);
    if (w.nearSide + 1e-9 < whole) {
      return note(world, fail('balance', {id: id, wanted: whole, nearSide: w.nearSide}));
    }
    w.nearSide -= whole;
    w.broth += whole;
    world.escrow -= whole;
    world.minted -= whole;
    return note(world, {
      ok: true,
      type: 'bridge-source',
      id: id,
      tokens: whole,
      stages: ['burn', 'sign', 'unlock'],
    });
  }

  function pushTrade(events, ev) {
    if (!ev) return;
    events.push(ev);
    if (ev.rule) events.push(ev.rule);
  }

  // One simulated tick. Bots share this schedule so a replay is the same desk.
  // Sniper asks for more than the cap, then buys the cap.
  // Kiln buys and stakes. Ladle buys and sells. Ferry bridges.
  function step(world) {
    world.time += 1;
    const t = world.time;
    const events = [];
    if (t === 1) pushTrade(events, buy(world, 'sniper', SNIPER_TRY));
    if (t === 2) pushTrade(events, buy(world, 'sniper', CAP));
    if (t === 3) pushTrade(events, buy(world, 'ferry', 2000));
    if (t === 4) pushTrade(events, buy(world, 'kiln', 2500));
    if (t === 5) pushTrade(events, stake(world, 'kiln', world.wallets.kiln.broth));
    if (t >= 6 && t % 2 === 0) pushTrade(events, buy(world, 'ladle', 800));
    if (t >= 7 && t % 2 === 1) {
      const have = world.wallets.ladle.broth;
      if (have >= 500) pushTrade(events, sell(world, 'ladle', 500));
    }
    if (t >= 8 && t % 4 === 0) {
      const have = world.wallets.ferry.broth;
      if (have >= 400) pushTrade(events, bridgeToNear(world, 'ferry', 400));
    }
    if (t >= 18 && t % 8 === 0) {
      const have = world.wallets.ferry.nearSide;
      if (have >= 400) pushTrade(events, bridgeToSource(world, 'ferry', 400));
    }
    if (t === 9) pushTrade(events, buy(world, 'sniper', 1000));
    const rule = applyRule(world);
    if (rule.fired) events.push(note(world, rule));
    world.tape.push(spotOf(world));
    if (world.tape.length > 180) world.tape.shift();
    return events;
  }

  function markTape(world) {
    world.tape.push(spotOf(world));
    if (world.tape.length > 180) world.tape.shift();
  }

  function books(world) {
    let near = world.realNear + world.treasury + world.feeEscrow;
    let tokens = world.burned;
    let bridged = 0;
    WALLET_ORDER.forEach(function (id) {
      const w = world.wallets[id];
      near += w.near;
      tokens += w.broth + w.nearSide + w.staked;
      bridged += w.nearSide;
    });
    return {
      near: near,
      tokens: tokens,
      bridged: bridged,
      escrow: world.escrow,
      minted: world.minted,
      issued: world.issued,
      curveIssued: issuedOf(world),
    };
  }

  function openingNear() {
    let sum = 0;
    WALLET_ORDER.forEach(function (id) { sum += WALLET_SEED[id].near; });
    return sum;
  }

  return {
    V_NEAR: V_NEAR,
    V_TOKEN: V_TOKEN,
    CAP: CAP,
    FEE_BPS: FEE_BPS,
    STAKER_BPS: STAKER_BPS,
    THRESHOLD: THRESHOLD,
    SNIPER_TRY: SNIPER_TRY,
    WALLET_ORDER: WALLET_ORDER,
    round: round,
    createWorld: createWorld,
    spotOf: spotOf,
    kOf: kOf,
    issuedOf: issuedOf,
    holdings: holdings,
    pendingOf: pendingOf,
    previewBuy: previewBuy,
    previewSell: previewSell,
    buy: buy,
    sell: sell,
    stake: stake,
    unstake: unstake,
    claim: claim,
    bridgeToNear: bridgeToNear,
    bridgeToSource: bridgeToSource,
    applyRule: applyRule,
    step: step,
    markTape: markTape,
    books: books,
    openingNear: openingNear,
    priceAt: function (q) {
      const token = V_TOKEN - q;
      if (token <= 0) return Infinity;
      return (V_NEAR * V_TOKEN) / (token * token);
    },
  };
});
