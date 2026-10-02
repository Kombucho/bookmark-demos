// Proxy-auction rules from visualizevalue/auctionanything.
// Amounts are integer cents. The opening bid is $1.
// resolveProxy ranks by reserved maximum, then admission order.
// The public price is min(leaderMax, max(standing, leaderAmount, nextBid(runnerUpMax))).
// Equal maxima keep the earlier bidder. One live offer per buyer.
// A bid inside the last 10 minutes extends the close by 10 minutes.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AuctionEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OPENING_BID = 100;
  const INCREMENT = 110;
  const MAX_CENTS = 99999999;
  const DURATION_MS = 48 * 60 * 60 * 1000;
  const SNIPE_WINDOW_MS = 10 * 60 * 1000;

  function nextBid(current) {
    const basis = Number.isFinite(current) ? current : 0;
    return Math.max(OPENING_BID, Math.ceil((basis * INCREMENT) / 100));
  }

  function reserveAmount(bid) {
    return bid.max_amount == null ? bid.amount : bid.max_amount;
  }

  function timeOf(value) {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
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
    return [...offers].sort((a, b) =>
      reserveAmount(b) - reserveAmount(a) ||
      Number(a.admission_order || 0) - Number(b.admission_order || 0) ||
      timeOf(a.authorized_at || a.created_at) - timeOf(b.authorized_at || b.created_at) ||
      timeOf(a.created_at) - timeOf(b.created_at) ||
      String(a.id).localeCompare(String(b.id)));
  }

  function resolveProxy(offers) {
    const ranked = rank(offers);
    const distinct = ranked.filter((offer, index) =>
      ranked.findIndex(other => String(other.owner).toLowerCase() === String(offer.owner).toLowerCase()) === index);
    const first = distinct[0];
    if (!first) return {winner: null, second: null, offers: [], price: 0, breakdown: null};
    const second = distinct[1] || null;
    const standing = Math.max(...offers.map(offer => offer.amount));
    const step = second ? nextBid(reserveAmount(second)) : OPENING_BID;
    const price = Math.min(
      reserveAmount(first),
      Math.max(standing, first.amount, step),
    );
    const resolvedOffers = offers.map(offer => ({
      ...offer,
      amount: offer.id === first.id
        ? price
        : distinct.some(item => item.id === offer.id)
          ? reserveAmount(offer)
          : offer.amount,
    }));
    return {
      winner: resolvedOffers.find(offer => offer.id === first.id),
      second: second ? resolvedOffers.find(offer => offer.id === second.id) : null,
      offers: resolvedOffers,
      price,
      breakdown: {
        standing,
        leaderReserve: reserveAmount(first),
        leaderAmount: first.amount,
        runnerReserve: second ? reserveAmount(second) : null,
        step,
        tie: Boolean(second) && reserveAmount(second) === reserveAmount(first),
      },
    };
  }

  function shouldExtend(closesAt, bidAt, now = new Date(), windowMs = SNIPE_WINDOW_MS) {
    const close = new Date(closesAt).getTime();
    const bid = new Date(bidAt).getTime();
    const current = new Date(now).getTime();
    return bid < close && close - bid <= windowMs && bid + windowMs > current;
  }

  function extendedClose(closesAt, windowMs = SNIPE_WINDOW_MS) {
    return new Date(new Date(closesAt).getTime() + windowMs);
  }

  function visibleOffer(offer, owner) {
    if (offer.owner === owner) return {...offer};
    const copy = {...offer};
    delete copy.max_amount;
    return copy;
  }

  function displayName(offer) {
    return offer?.name || offer?.owner || 'Bidder';
  }

  function formulaText(offers) {
    const resolved = resolveProxy(offers);
    if (!resolved.winner) {
      return 'No bids yet. The first public price is the opening bid, $1. A private maximum above that stays off the board.';
    }
    const breakdown = resolved.breakdown;
    const leader = displayName(resolved.winner);
    const lines = [
      `${leader} leads with a private maximum of ${money(breakdown.leaderReserve)}, admitted #${resolved.winner.admission_order}.`,
    ];
    if (!resolved.second) {
      lines.push(`No second maximum is on the book. The public price is ${money(resolved.price)}, held by the standing bid, and the ceiling stays unpublished.`);
      return lines.join(' ');
    }
    const runner = displayName(resolved.second);
    lines.push(`The next maximum is ${runner} at ${money(breakdown.runnerReserve)}, admitted #${resolved.second.admission_order}.`);
    lines.push(`One 10% step above that maximum is ${money(breakdown.step)}.`);
    if (breakdown.tie) {
      lines.push(`The maxima match, so the earlier admission keeps the lead. The step sits above the shared ceiling, and the public price stops at ${money(resolved.price)}.`);
    } else if (resolved.price < breakdown.step) {
      lines.push(`The step is above the leader's maximum, so the public price stops early at ${money(resolved.price)}.`);
    } else if (breakdown.standing > breakdown.step) {
      lines.push(`The standing bid of ${money(breakdown.standing)} is already above that step, so the public price stays at ${money(resolved.price)} and does not fall.`);
    } else {
      lines.push(`The public price is ${money(resolved.price)}: min(${money(breakdown.leaderReserve)}, max(standing ${money(breakdown.standing)}, step ${money(breakdown.step)})).`);
    }
    return lines.join(' ');
  }

  function createAuction(now = new Date()) {
    const opensAt = new Date(now);
    return {
      opensAt,
      closesAt: new Date(opensAt.getTime() + DURATION_MS),
      offers: [],
      events: [],
      seq: 1,
    };
  }

  function cloneAuction(auction) {
    return {
      opensAt: new Date(auction.opensAt),
      closesAt: new Date(auction.closesAt),
      offers: auction.offers.map(offer => ({...offer})),
      events: auction.events.map(event => ({...event})),
      seq: auction.seq,
    };
  }

  function placeBid(auction, input) {
    const next = cloneAuction(auction);
    const name = String(input.name || '').trim();
    const max = input.maxCents;
    const bidAt = new Date(input.bidAt);
    const now = new Date(input.now || bidAt);

    if (!name) return {ok: false, error: 'Enter a bidder name.', auction: next};
    if (name.length > 40) return {ok: false, error: 'Use a bidder name of 40 characters or fewer.', auction: next};
    if (!Number.isInteger(max)) return {ok: false, error: 'Enter a maximum in dollars and cents.', auction: next};
    if (bidAt.getTime() >= next.closesAt.getTime() || now.getTime() >= next.closesAt.getTime()) {
      return {ok: false, error: 'This auction is closed.', auction: next};
    }
    if (max < OPENING_BID) {
      return {ok: false, error: `A maximum has to be at least ${money(OPENING_BID)}.`, auction: next};
    }
    if (max > MAX_CENTS) {
      return {ok: false, error: `A maximum has to be at most ${money(MAX_CENTS)}.`, auction: next};
    }

    const before = resolveProxy(next.offers);
    const existing = next.offers.find(offer => offer.owner.toLowerCase() === name.toLowerCase());
    let raised = false;
    let enteredAmount = null;

    if (existing) {
      if (max <= existing.max_amount) {
        return {
          ok: false,
          error: `${existing.owner} already reserved ${money(existing.max_amount)}. Raise that maximum. A buyer has one live offer.`,
          auction: next,
        };
      }
      existing.max_amount = max;
      raised = true;
    } else {
      const floor = nextBid(before.price || 0);
      if (max < floor) {
        return {
          ok: false,
          error: `A new bidder's maximum has to cover the next 10% step, ${money(floor)}.`,
          auction: next,
        };
      }
      enteredAmount = floor;
      next.offers.push({
        id: `bid-${next.seq}`,
        owner: name,
        name,
        amount: floor,
        max_amount: max,
        admission_order: next.seq,
        authorized_at: bidAt.toISOString(),
        created_at: bidAt.toISOString(),
      });
      next.seq += 1;
    }

    const after = resolveProxy(next.offers);
    next.offers = after.offers;
    let extended = false;
    if (shouldExtend(next.closesAt, bidAt, now)) {
      next.closesAt = extendedClose(next.closesAt);
      extended = true;
    }

    const bidder = existing ? existing.owner : name;
    const event = {
      id: `event-${next.events.length + 1}`,
      bidder,
      raised,
      max,
      priceBefore: before.price || 0,
      priceAfter: after.price,
      leader: displayName(after.winner),
      extended,
      closesAt: next.closesAt.toISOString(),
      room: roomLine({bidder, raised, before, after, extended}),
      clerk: clerkLine({bidder, raised, max, enteredAmount, before, after, extended}),
    };
    next.events = [...next.events, event];
    return {ok: true, auction: next, event};
  }

  function roomLine({bidder, before, after, extended}) {
    const from = before.price || 0;
    const to = after.price;
    const moved = from === to
      ? `The public price stays ${from ? money(to) : money(to)}.`
      : `The public price moves from ${from ? money(from) : 'no bid'} to ${money(to)}.`;
    const lead = `${displayName(after.winner)} leads.`;
    const extra = extended ? ' The bid landed in the last 10 minutes, so the close moves 10 minutes later.' : '';
    return `${bidder} bid. ${moved} ${lead}${extra}`;
  }

  function clerkLine({bidder, raised, max, enteredAmount, after, extended}) {
    const breakdown = after.breakdown;
    const leader = displayName(after.winner);
    const sentences = [];
    if (raised) {
      sentences.push(`${bidder} raised the private maximum to ${money(max)}. The earlier admission stays, because a buyer has one live offer.`);
    } else {
      sentences.push(`${bidder} reserved ${money(max)}. The offer enters at ${money(enteredAmount)}, the next 10% step.`);
    }
    if (breakdown.tie) {
      sentences.push(`Equal maxima of ${money(breakdown.leaderReserve)}. ${leader} keeps the lot on the earlier admission. The 10% step would be ${money(breakdown.step)}, so the public price stops at the shared ceiling, ${money(after.price)}.`);
    } else if (!after.second) {
      sentences.push(`No competing maximum. The public price is ${money(after.price)}. The ceiling stays unpublished.`);
    } else if (leader.toLowerCase() === bidder.toLowerCase()) {
      const capped = after.price < breakdown.step
        ? `, capped by the leader's maximum of ${money(breakdown.leaderReserve)}`
        : '';
      sentences.push(`${leader} takes the lead. One 10% step above the next maximum (${money(breakdown.runnerReserve)}) is ${money(breakdown.step)}. The public price is ${money(after.price)}${capped}.`);
    } else {
      sentences.push(`${leader} keeps the lead. The public price is ${money(after.price)}, answered from a higher private maximum of ${money(breakdown.leaderReserve)} against the next maximum of ${money(breakdown.runnerReserve)}.`);
    }
    if (extended) {
      sentences.push('The bid is inside the last 10 minutes and the extended close is still in the future, so the close moves 10 minutes later.');
    }
    return sentences.join(' ');
  }

  function applySample(auction, when) {
    const bidAt = new Date(when || auction.opensAt);
    const steps = [
      ['Lumen', 2400],
      ['Northwind', 8000],
      ['Harbor', 5500],
    ];
    let current = auction;
    for (const [name, maxCents] of steps) {
      const result = placeBid(current, {name, maxCents, bidAt, now: bidAt});
      if (!result.ok) throw new Error(result.error);
      current = result.auction;
    }
    return current;
  }

  return {
    OPENING_BID,
    MAX_CENTS,
    DURATION_MS,
    SNIPE_WINDOW_MS,
    nextBid,
    reserveAmount,
    resolveProxy,
    shouldExtend,
    extendedClose,
    visibleOffer,
    money,
    formulaText,
    createAuction,
    placeBid,
    applySample,
  };
});
