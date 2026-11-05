const test = require('node:test');
const assert = require('node:assert/strict');
const desk = require('./mechanics.js');

function near(world) {
  return desk.books(world).near;
}

test('the curve opens at virtual near over virtual token, and k is the product', () => {
  const world = desk.createWorld();
  assert.equal(desk.spotOf(world), desk.V_NEAR / desk.V_TOKEN);
  assert.equal(desk.kOf(world), desk.V_NEAR * desk.V_TOKEN);
  assert.equal(desk.priceAt(0), desk.spotOf(world));
  assert.equal(desk.issuedOf(world), 0);
  assert.equal(desk.openingNear(), 30 + 40 + 30 + 24 + 16);
  assert.ok(Math.abs(near(world) - desk.openingNear()) < 1e-9);
});

test('a buy moves along the curve, takes a fee, and a sell walks back short the fees', () => {
  const world = desk.createWorld();
  const k = desk.kOf(world);
  const quote = desk.kOf(world) / (desk.V_TOKEN - 2000) - desk.V_NEAR;
  const bought = desk.buy(world, 'you', 2000);
  assert.equal(bought.ok, true);
  assert.ok(Math.abs(bought.cost - quote) < 1e-9);
  assert.ok(Math.abs(bought.fee - quote * desk.FEE_BPS / 10000) < 1e-12);
  assert.equal(world.wallets.you.broth, 2000);
  assert.ok(Math.abs(desk.kOf(world) - k) < 1e-6);
  assert.ok(desk.spotOf(world) > desk.V_NEAR / desk.V_TOKEN);
  assert.ok(Math.abs(near(world) - desk.openingNear()) < 1e-8);

  const sold = desk.sell(world, 'you', 2000);
  assert.equal(sold.ok, true);
  assert.equal(world.wallets.you.broth, 0);
  assert.ok(world.wallets.you.near < 30);
  assert.ok(Math.abs(desk.spotOf(world) - desk.V_NEAR / desk.V_TOKEN) < 1e-12);
  assert.ok(Math.abs(world.realNear) < 1e-8);
  assert.ok(Math.abs(near(world) - desk.openingNear()) < 1e-8);
  // Nobody is staked, so the whole fee, both ways, sits in the treasury.
  assert.ok(Math.abs(world.treasury - (bought.fee + sold.fee)) < 1e-9);
  assert.equal(world.feeEscrow, 0);
});

test('the cap refuses a whole order and leaves every balance where it was', () => {
  const world = desk.createWorld();
  const beforeNear = world.nearReserve;
  const beforeToken = world.tokenReserve;
  const sniperNear = world.wallets.sniper.near;
  const blocked = desk.buy(world, 'sniper', desk.SNIPER_TRY);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'cap');
  assert.equal(blocked.wanted, desk.SNIPER_TRY);
  assert.equal(blocked.cap, desk.CAP);
  assert.equal(blocked.held, 0);
  assert.equal(world.wallets.sniper.broth, 0);
  assert.equal(world.wallets.sniper.near, sniperNear);
  assert.equal(world.nearReserve, beforeNear);
  assert.equal(world.tokenReserve, beforeToken);

  assert.equal(desk.buy(world, 'you', desk.CAP).ok, true);
  const second = desk.buy(world, 'you', 1);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cap');
  assert.equal(second.held, desk.CAP);
});

test('staking pays the fee share by stake, and a later staker does not collect the past', () => {
  const world = desk.createWorld();
  const seeded = desk.buy(world, 'kiln', 2500);
  assert.equal(seeded.ok, true);
  // Kiln was not staked yet, so that fee went to the treasury in full.
  const seededTreasury = seeded.fee;
  assert.equal(desk.stake(world, 'kiln', 2500).ok, true);
  assert.equal(world.wallets.kiln.broth, 0);
  assert.equal(world.totalStaked, 2500);

  const trade = desk.buy(world, 'you', 2000);
  const stakerFee = trade.fee * desk.STAKER_BPS / 10000;
  const treasuryFee = trade.fee - stakerFee;
  assert.ok(Math.abs(desk.pendingOf(world, 'kiln') - stakerFee) < 1e-9);
  assert.ok(Math.abs(world.treasury - (seededTreasury + treasuryFee)) < 1e-9);
  assert.ok(Math.abs(world.feeEscrow - stakerFee) < 1e-9);

  assert.equal(desk.stake(world, 'you', 1000).ok, true);
  assert.ok(Math.abs(desk.pendingOf(world, 'you')) < 1e-9);

  const more = desk.buy(world, 'ladle', 1000);
  const moreStakers = more.fee * desk.STAKER_BPS / 10000;
  const youShare = moreStakers * (1000 / 3500);
  const kilnShare = moreStakers * (2500 / 3500);
  assert.ok(Math.abs(desk.pendingOf(world, 'you') - youShare) < 1e-8);
  assert.ok(Math.abs(desk.pendingOf(world, 'kiln') - (stakerFee + kilnShare)) < 1e-8);

  const claimed = desk.claim(world, 'kiln');
  assert.equal(claimed.ok, true);
  assert.ok(Math.abs(claimed.near - (stakerFee + kilnShare)) < 1e-8);
  assert.ok(Math.abs(desk.pendingOf(world, 'kiln')) < 1e-8);
  assert.ok(Math.abs(near(world) - desk.openingNear()) < 1e-8);

  assert.equal(desk.sell(world, 'you', 5000).ok, false);
  assert.equal(world.wallets.you.broth, 1000);
  assert.equal(desk.unstake(world, 'you', 1000).ok, true);
  assert.equal(world.wallets.you.broth, 2000);
  assert.equal(world.wallets.you.staked, 0);
});

test('the treasury rule spends its balance buying KEEL and burns it, which lifts the price', () => {
  const world = desk.createWorld();
  const open = desk.spotOf(world);
  world.treasury = desk.THRESHOLD;
  const beforeK = desk.kOf(world);
  const fired = desk.applyRule(world);
  assert.equal(fired.fired, true);
  assert.equal(world.treasury, 0);
  assert.ok(fired.burned > 0);
  assert.equal(world.burned, fired.burned);
  assert.ok(desk.spotOf(world) > open);
  assert.ok(Math.abs(desk.kOf(world) - beforeK) < 1e-6);
  assert.equal(desk.books(world).tokens, desk.books(world).issued);
  // A second call finds nothing left to spend.
  assert.equal(desk.applyRule(world).fired, false);

  const quiet = desk.createWorld();
  quiet.treasury = desk.THRESHOLD - 0.001;
  assert.equal(desk.applyRule(quiet).fired, false);
  assert.equal(quiet.burned, 0);
});

test('bridging locks on the source and mints the same amount, then burns it back', () => {
  const world = desk.createWorld();
  assert.equal(desk.buy(world, 'you', 2000).ok, true);
  const reserves = {near: world.nearReserve, token: world.tokenReserve};
  const sent = desk.bridgeToNear(world, 'you', 500);
  assert.equal(sent.ok, true);
  assert.deepEqual(sent.stages, ['lock', 'sign', 'mint']);
  assert.equal(world.wallets.you.broth, 1500);
  assert.equal(world.wallets.you.nearSide, 500);
  assert.equal(world.escrow, 500);
  assert.equal(world.minted, 500);
  assert.equal(world.nearReserve, reserves.near);
  assert.equal(world.tokenReserve, reserves.token);
  assert.equal(desk.holdings(world.wallets.you), 2000);

  // The cap counts the minted balance, so bridging is not a way around it.
  assert.equal(desk.buy(world, 'you', 2500).ok, false);
  assert.equal(world.lastEvent.reason, 'cap');

  const back = desk.bridgeToSource(world, 'you', 500);
  assert.equal(back.ok, true);
  assert.deepEqual(back.stages, ['burn', 'sign', 'unlock']);
  assert.equal(world.wallets.you.broth, 2000);
  assert.equal(world.wallets.you.nearSide, 0);
  assert.equal(world.escrow, 0);
  assert.equal(world.minted, 0);
  assert.equal(desk.bridgeToSource(world, 'you', 1).ok, false);
});

test('the clock is deterministic, the sniper is refused, and the books still balance', () => {
  const a = desk.createWorld();
  const b = desk.createWorld();
  let first = null;
  for (let i = 0; i < 40; i++) {
    const ev = desk.step(a);
    desk.step(b);
    if (i === 0) first = ev;
  }
  assert.equal(first[0].ok, false);
  assert.equal(first[0].reason, 'cap');
  assert.equal(first[0].wanted, desk.SNIPER_TRY);
  assert.equal(a.wallets.sniper.broth, desk.CAP);
  assert.equal(a.wallets.sniper.nearSide, 0);
  assert.equal(a.wallets.kiln.staked, 2500);
  assert.equal(a.wallets.kiln.broth, 0);
  assert.ok(desk.pendingOf(a, 'kiln') > 0);
  assert.ok(a.treasury < desk.THRESHOLD);
  assert.ok(a.burns >= 1);
  assert.ok(a.burned > 0);

  const book = desk.books(a);
  assert.ok(Math.abs(book.near - desk.openingNear()) < 1e-6);
  assert.ok(Math.abs(book.tokens - book.issued) < 1e-6);
  assert.ok(Math.abs(book.issued - book.curveIssued) < 1e-6);
  assert.equal(book.escrow, book.minted);
  assert.equal(book.bridged, book.minted);
  assert.deepEqual(a.tape, b.tape);
  assert.equal(a.burned, b.burned);
  assert.equal(a.wallets.ladle.broth, b.wallets.ladle.broth);
  assert.ok(desk.holdings(a.wallets.ladle) <= desk.CAP);
  assert.ok(desk.holdings(a.wallets.ferry) <= desk.CAP);
  assert.ok(Number.isFinite(desk.spotOf(a)));
});
