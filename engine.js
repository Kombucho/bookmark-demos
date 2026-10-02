// Public-price rules for a proxy auction.
// Amounts are integer cents. The opening bid is $1.
// A higher private maximum wins. The public price is one 10% step
// above the next-highest maximum, and it never exceeds the leader's maximum.
// Equal maxima: the earlier reservation keeps the lead.

(function (root) {
  const OPENING_CENTS = 100;
  const MAX_CENTS = 100_000_000;

  function nextBid(cents) {
    return Math.max(OPENING_CENTS, Math.ceil((cents * 110) / 100));
  }

  function money(cents) {
    const whole = cents % 100 === 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(cents / 100);
  }

  function rank(offers) {
    return [...offers].sort(
      (a, b) => b.max - a.max || a.at - b.at || String(a.id).localeCompare(String(b.id)),
    );
  }

  function resolve(offers) {
    if (!offers.length) {
      return {leader: null, price: 0, minimum: OPENING_CENTS, ranked: []};
    }
    const ranked = rank(offers);
    const leader = ranked[0];
    const runner = ranked[1];
    const step = runner ? nextBid(runner.max) : OPENING_CENTS;
    const price = Math.min(leader.max, Math.max(step, OPENING_CENTS));
    return {leader, price, minimum: nextBid(price), ranked};
  }

  function admit(offers, incoming) {
    if (!Number.isInteger(incoming.max) || incoming.max < OPENING_CENTS) {
      return {ok: false, error: 'Enter a maximum of at least $1.'};
    }
    if (incoming.max > MAX_CENTS) {
      return {ok: false, error: 'This demo caps a maximum at $1,000,000.'};
    }

    const before = resolve(offers);
    const existing = offers.find(offer => offer.id === incoming.id);
    let next;
    let raised = false;

    if (existing) {
      if (incoming.max <= existing.max) {
        return {ok: false, error: 'Raise the maximum above the one already reserved.'};
      }
      raised = true;
      next = offers.map(offer =>
        offer.id === incoming.id ? {...existing, name: incoming.name, max: incoming.max} : offer,
      );
    } else if (incoming.max < before.minimum) {
      return {ok: false, error: `The minimum bid is ${money(before.minimum)}.`};
    } else {
      next = [...offers, incoming];
    }

    return {ok: true, offers: next, before, after: resolve(next), raised};
  }

  function shouldExtend(remainingMs, windowMs) {
    return remainingMs > 0 && remainingMs <= windowMs;
  }

  const api = {
    OPENING_CENTS,
    MAX_CENTS,
    nextBid,
    money,
    resolve,
    admit,
    shouldExtend,
  };

  root.AuctionEngine = api;

  const entry = typeof process !== 'undefined' ? process.argv?.[1] : '';
  if (entry && entry.endsWith('engine.js')) {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };

    assert(nextBid(200000) === 220000, '10% of $2,000');
    assert(nextBid(100) === 110, 'step from the opening bid');
    assert(nextBid(2640) === 2904, 'step from $26.40');
    assert(money(2640) === '$26.40', 'cents format');
    assert(money(8800) === '$88', 'whole dollar format');

    const seeded = [
      {id: 'lumen', name: 'Lumen', max: 2400, at: 1},
      {id: 'north', name: 'Northwind', max: 8000, at: 2},
    ];
    const open = resolve(seeded);
    assert(open.leader.id === 'north', 'higher maximum leads');
    assert(open.price === 2640, 'public price is one step above the runner-up');
    assert(open.minimum === 2904, 'next public floor');
    assert(resolve([{id: 'solo', name: 'Solo', max: 50000, at: 1}]).price === 100, 'first bid opens at $1');

    const harbor = admit(seeded, {id: 'harbor', name: 'Harbor', max: 5500, at: 3});
    assert(harbor.ok && harbor.after.leader.id === 'north', 'a lower maximum stays behind');
    assert(harbor.after.price === 6050, 'leader proxy answers one step above the new maximum');

    const field = admit(harbor.offers, {id: 'field', name: 'Field', max: 9600, at: 4});
    assert(field.ok && field.after.leader.id === 'field', 'a higher maximum takes the lead');
    assert(field.after.price === 8800, 'public price stops one step above the previous leader');

    const inside = admit(seeded, {id: 'you', name: 'Ada', max: 8500, at: 3});
    assert(inside.after.leader.id === 'you' && inside.after.price === 8500, 'last step can meet the maximum');

    const tie = admit(seeded, {id: 'you', name: 'Ada', max: 8000, at: 3});
    assert(tie.after.leader.id === 'north' && tie.after.price === 8000, 'equal maxima keep the earlier bidder');

    const low = admit(seeded, {id: 'you', name: 'Ada', max: 2000, at: 3});
    assert(!low.ok, 'bids under the public floor are refused');

    const raised = admit(inside.offers, {id: 'you', name: 'Ada', max: 9000, at: 9});
    assert(raised.ok && raised.raised && raised.after.price === 8800, 'raising a ceiling can leave the public price still');

    const same = admit(inside.offers, {id: 'you', name: 'Ada', max: 8500, at: 9});
    assert(!same.ok, 'a maximum has to increase');

    assert(shouldExtend(15000, 15000) && shouldExtend(1, 15000), 'bids inside the window extend');
    assert(!shouldExtend(15001, 15000) && !shouldExtend(0, 15000), 'early and closed bids do not extend');

    console.log('engine ok');
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
