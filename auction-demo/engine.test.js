const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nextBid,
  resolveProxy,
  shouldExtend,
  visibleOffer,
  money,
  createAuction,
  placeBid,
  applySample,
  formulaText,
  DURATION_MS,
  SNIPE_WINDOW_MS,
  reserveAmount,
} = require('./engine.js');

function bid(id, amount, max, time = 1, owner = id) {
  return {
    id,
    owner,
    amount,
    max_amount: max,
    authorized_at: new Date(time * 1000).toISOString(),
    created_at: new Date(time * 1000).toISOString(),
  };
}

test('opening step and money format', () => {
  assert.equal(nextBid(0), 100);
  assert.equal(nextBid(100), 110);
  assert.equal(nextBid(200000), 220000);
  assert.equal(nextBid(2640), 2904);
  assert.equal(money(2640), '$26.40');
  assert.equal(money(8800), '$88');
  assert.equal(money(100), '$1');
});

test('a sole maximum opens at $1', () => {
  assert.equal(resolveProxy([bid('a', 100, 1000000)]).winner.amount, 100);
});

test('a higher hidden maximum answers one step above a lower challenger', () => {
  const resolved = resolveProxy([bid('a', 100, 100000), bid('b', 110, 10000, 2)]);
  assert.equal(resolved.winner.id, 'a');
  assert.equal(resolved.winner.amount, 11000);
  assert.equal(resolved.offers.find(offer => offer.id === 'b').amount, 10000);
});

test('a higher maximum pays one step above the runner-up ceiling', () => {
  const resolved = resolveProxy([bid('a', 100, 10000), bid('b', 110, 100000, 2)]);
  assert.equal(resolved.winner.id, 'b');
  assert.equal(resolved.winner.amount, 11000);
});

test('automatic bidding stops at the reserved maximum', () => {
  const resolved = resolveProxy([bid('a', 100, 10000), bid('b', 110, 10500, 2)]);
  assert.equal(resolved.winner.id, 'b');
  assert.equal(resolved.winner.amount, 10500);
});

test('equal maxima keep the earlier bidder', () => {
  for (const offers of [
    [bid('b', 110, 10000, 2), bid('a', 100, 10000, 1)],
    [bid('a', 100, 10000, 1), bid('b', 110, 10000, 2)],
  ]) {
    const resolved = resolveProxy(offers);
    assert.equal(resolved.winner.id, 'a');
    assert.equal(resolved.winner.amount, 10000);
  }
});

test('admission order breaks equal maxima', () => {
  const earlier = {...bid('z', 100, 10000), admission_order: '1'};
  const later = {...bid('a', 110, 10000, 2), admission_order: '2'};
  assert.equal(resolveProxy([later, earlier]).winner.id, 'z');
});

test('the public price does not fall when the standing bid is already higher', () => {
  assert.equal(resolveProxy([bid('a', 40000, 100000)]).winner.amount, 40000);
});

test('one buyer does not compete against their own second row', () => {
  const first = bid('a', 100, 100000);
  const second = {...bid('b', 110, 90000, 2), owner: first.owner};
  assert.equal(resolveProxy([first, second]).winner.amount, 110);
});

test('a resolved book is stable when resolved again', () => {
  const once = resolveProxy([bid('a', 100, 8000, 1), bid('b', 110, 5500, 2)]);
  const twice = resolveProxy(once.offers);
  assert.equal(twice.winner.id, once.winner.id);
  assert.equal(twice.price, once.price);
});

test('visible offers hide the maximum from everyone except the owner', () => {
  const offer = bid('a', 100, 100000, 1, 'ada@example.test');
  assert.equal(visibleOffer(offer, 'clerk@example.test').max_amount, undefined);
  assert.equal(visibleOffer(offer, offer.owner).max_amount, 100000);
});

test('the reserve helper prefers the private maximum', () => {
  assert.equal(reserveAmount({amount: 100, max_amount: 500}), 500);
  assert.equal(reserveAmount({amount: 100, max_amount: null}), 100);
});

test('a new auction runs 48 hours', () => {
  const auction = createAuction(new Date('2026-01-01T12:00:00Z'));
  assert.equal(auction.closesAt.getTime() - auction.opensAt.getTime(), DURATION_MS);
  assert.equal(formulaText(auction.offers).includes('$1'), true);
});

test('anti-snipe is the last 10 minutes and only when the new close is still ahead', () => {
  const close = new Date('2026-01-03T12:00:00Z');
  const inside = new Date(close.getTime() - SNIPE_WINDOW_MS);
  assert.equal(shouldExtend(close, inside, inside), true);
  const outside = new Date(close.getTime() - SNIPE_WINDOW_MS - 1);
  assert.equal(shouldExtend(close, outside, outside), false);
  const after = new Date(close.getTime() + 1);
  assert.equal(shouldExtend(close, after, after), false);
  const bid = new Date('2026-01-03T11:55:00Z');
  assert.equal(shouldExtend(close, bid, new Date(bid.getTime() + SNIPE_WINDOW_MS)), false);
  assert.equal(shouldExtend(close, bid, new Date(bid.getTime() + SNIPE_WINDOW_MS - 1)), true);
});

test('the sample book lets the high maximum answer one step above Harbor', () => {
  const opened = createAuction(new Date('2026-01-01T12:00:00Z'));
  const auction = applySample(opened, opened.opensAt);
  const resolved = resolveProxy(auction.offers);
  assert.equal(resolved.winner.owner, 'Northwind');
  assert.equal(resolved.price, 6050);
  assert.match(formulaText(auction.offers), /Northwind/);
  assert.match(formulaText(auction.offers), /\$60\.50/);
  assert.match(formulaText(auction.offers), /Harbor/);
  const again = resolveProxy(auction.offers);
  assert.equal(resolveProxy(again.offers).price, 6050);
});

test('raising the only maximum leaves the public price at the opening bid', () => {
  const when = new Date('2026-01-01T12:00:00Z');
  let auction = createAuction(when);
  auction = placeBid(auction, {name: 'Ada', maxCents: 5000, bidAt: when, now: when}).auction;
  assert.equal(resolveProxy(auction.offers).price, 100);
  const raised = placeBid(auction, {name: 'ada', maxCents: 9000, bidAt: when, now: when});
  assert.equal(raised.ok, true);
  assert.equal(raised.auction.offers.length, 1);
  assert.equal(resolveProxy(raised.auction.offers).price, 100);
  assert.match(raised.event.clerk, /one live offer/i);
  assert.doesNotMatch(raised.event.room, /\$90/);
});

test('an equal maximum loses to the earlier bidder and the price meets the ceiling', () => {
  const when = new Date('2026-01-01T12:00:00Z');
  let auction = createAuction(when);
  auction = placeBid(auction, {name: 'North', maxCents: 10000, bidAt: when, now: when}).auction;
  const later = new Date(when.getTime() + 1000);
  const tied = placeBid(auction, {name: 'Ada', maxCents: 10000, bidAt: later, now: later});
  assert.equal(tied.ok, true);
  assert.equal(resolveProxy(tied.auction.offers).winner.owner, 'North');
  assert.equal(resolveProxy(tied.auction.offers).price, 10000);
  assert.match(tied.event.clerk, /Equal maxima/);
  assert.match(tied.event.clerk, /earlier admission/);
});

test('a bid in the last 10 minutes extends the close, and a rejected bid does not', () => {
  const auction = createAuction(new Date('2026-01-01T12:00:00Z'));
  const bidAt = new Date(auction.closesAt.getTime() - 5 * 60 * 1000);
  const accepted = placeBid(auction, {name: 'Ada', maxCents: 5000, bidAt, now: bidAt});
  assert.equal(accepted.ok, true);
  assert.equal(accepted.auction.closesAt.getTime(), auction.closesAt.getTime() + SNIPE_WINDOW_MS);
  assert.match(accepted.event.room, /10 minutes/);
  assert.match(accepted.event.clerk, /10 minutes/);

  const rejected = placeBid(auction, {name: 'Bea', maxCents: 50, bidAt, now: bidAt});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.auction.closesAt.getTime(), auction.closesAt.getTime());
  assert.match(rejected.error, /\$1/);
});

test('a closed auction refuses bids', () => {
  const auction = createAuction(new Date('2026-01-01T12:00:00Z'));
  const late = new Date(auction.closesAt.getTime() + 1000);
  const result = placeBid(auction, {name: 'Ada', maxCents: 5000, bidAt: late, now: late});
  assert.equal(result.ok, false);
  assert.match(result.error, /closed/);
});

test('a new bidder below the next step is refused', () => {
  const when = new Date('2026-01-01T12:00:00Z');
  let auction = createAuction(when);
  auction = applySample(auction, when);
  const low = placeBid(auction, {name: 'Ada', maxCents: 6000, bidAt: when, now: when});
  assert.equal(low.ok, false);
  assert.match(low.error, /10%/);
});
