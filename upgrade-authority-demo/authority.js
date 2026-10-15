// Fictional vault programs and the upgrade authority that can replace their binary.
// A drain instruction stands in for a program that withdraws every deposit.
// Nothing here is a real program id, and nothing is sent to a cluster.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.UpgradeAuthority = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DRAIN = 'drain_to(upgrader)';
  const MODES = ['single', 'multisig', 'dao', 'locked'];
  const DELAY_DAYS = 2;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function member(id, name, weight) {
    const row = {id: id, name: name, on: false};
    if (weight != null) row.weight = weight;
    return row;
  }

  function program(spec) {
    return {
      id: spec.id,
      name: spec.name,
      blurb: spec.blurb,
      aside: spec.aside || '',
      originalTvl: spec.tvl,
      tvl: spec.tvl,
      taken: 0,
      safeBinary: spec.binary.slice(),
      binary: spec.binary.slice(),
      mode: spec.mode,
      timelock: false,
      delay: DELAY_DAYS,
      single: {id: 'hot', name: spec.singleName, on: false},
      multisig: {
        m: spec.m,
        members: spec.members.map(function (row) { return member(row.id, row.name); }),
      },
      dao: {
        pass: spec.pass,
        voters: spec.voters.map(function (row) { return member(row.id, row.name, row.weight); }),
      },
      queue: null,
      drained: false,
    };
  }

  function createBoard() {
    return {
      now: 0,
      programs: [
        program({
          id: 'lumen',
          name: 'Lumen Vault',
          blurb: 'A lending pool. Deposits sit here until someone borrows them.',
          tvl: 42000000,
          binary: ['deposit', 'borrow', 'repay', 'liquidate'],
          mode: 'single',
          singleName: 'Deployer hot key',
          m: 2,
          members: [
            {id: 'nia', name: 'Nia'},
            {id: 'omar', name: 'Omar'},
            {id: 'priya', name: 'Priya'},
          ],
          pass: 60,
          voters: [
            {id: 'founder', name: 'Founder', weight: 48},
            {id: 'fund', name: 'Fund', weight: 27},
            {id: 'public', name: 'Public', weight: 25},
          ],
        }),
        program({
          id: 'marrow',
          name: 'Marrow AMM',
          blurb: 'A constant-product pool. Liquidity stays in the reserves.',
          tvl: 18400000,
          binary: ['swap', 'add_liquidity', 'remove_liquidity'],
          mode: 'multisig',
          singleName: 'Ops key',
          m: 2,
          members: [
            {id: 'ada', name: 'Ada'},
            {id: 'bo', name: 'Bo'},
            {id: 'chen', name: 'Chen'},
          ],
          pass: 75,
          voters: [
            {id: 'ada', name: 'Ada', weight: 25},
            {id: 'bo', name: 'Bo', weight: 25},
            {id: 'chen', name: 'Chen', weight: 25},
            {id: 'public', name: 'Public', weight: 25},
          ],
        }),
        program({
          id: 'salt',
          name: 'Salt Council',
          blurb: 'A governance treasury. Four blocs split the voting weight.',
          aside: 'Treasury holds 45 of 100. That bloc cannot pass the mark of 60 alone.',
          tvl: 9100000,
          binary: ['deposit', 'harvest', 'set_fee'],
          mode: 'dao',
          singleName: 'Council admin',
          m: 2,
          members: [
            {id: 'treasury', name: 'Treasury'},
            {id: 'guild', name: 'Guild'},
            {id: 'desk', name: 'Market desk'},
          ],
          pass: 60,
          voters: [
            {id: 'treasury', name: 'Treasury', weight: 45},
            {id: 'guild', name: 'Guild', weight: 22},
            {id: 'desk', name: 'Market desk', weight: 18},
            {id: 'public', name: 'Public float', weight: 15},
          ],
        }),
        program({
          id: 'keel',
          name: 'Keel',
          blurb: 'A small multisig program. Other vaults point at this binary.',
          aside: 'With the authority set to None, nobody can replace the lock.',
          tvl: 600000,
          binary: ['approve', 'execute'],
          mode: 'locked',
          singleName: 'Maintainer key',
          m: 3,
          members: [
            {id: 'ada', name: 'Ada'},
            {id: 'bo', name: 'Bo'},
            {id: 'chen', name: 'Chen'},
          ],
          pass: 60,
          voters: [
            {id: 'ada', name: 'Ada', weight: 34},
            {id: 'bo', name: 'Bo', weight: 33},
            {id: 'chen', name: 'Chen', weight: 33},
          ],
        }),
      ],
    };
  }

  function find(board, id) {
    return board.programs.find(function (item) { return item.id === id; }) || null;
  }

  function result(ok, code, board, extra) {
    const row = {ok: ok, code: code, board: board};
    if (extra) {
      Object.keys(extra).forEach(function (key) { row[key] = extra[key]; });
    }
    return row;
  }

  function clearApprovals(item) {
    item.single.on = false;
    item.multisig.members.forEach(function (row) { row.on = false; });
    item.dao.voters.forEach(function (row) { row.on = false; });
  }

  function verdict(item) {
    if (item.mode === 'locked') {
      return {ok: false, code: 'Immutable', have: 0, need: null};
    }
    if (item.mode === 'single') {
      const have = item.single.on ? 1 : 0;
      return {ok: have === 1, code: have === 1 ? 'Signed' : 'Threshold', have: have, need: 1};
    }
    if (item.mode === 'multisig') {
      const have = item.multisig.members.filter(function (row) { return row.on; }).length;
      const need = item.multisig.m;
      return {ok: have >= need, code: have >= need ? 'Signed' : 'Threshold', have: have, need: need};
    }
    const have = item.dao.voters.reduce(function (sum, row) {
      return sum + (row.on ? row.weight : 0);
    }, 0);
    const need = item.dao.pass;
    return {ok: have >= need, code: have >= need ? 'Signed' : 'Threshold', have: have, need: need};
  }

  function withDrain(binary) {
    return binary.filter(function (op) { return op !== DRAIN; }).concat([DRAIN]);
  }

  function markDrained(item, binary) {
    item.binary = binary.slice();
    item.taken = item.originalTvl;
    item.tvl = 0;
    item.drained = true;
    item.queue = null;
  }

  function applyDrain(item) {
    markDrained(item, withDrain(item.safeBinary));
  }

  function missing(board, id) {
    if (!find(board, id)) return result(false, 'MissingProgram', clone(board), {id: id});
    return null;
  }

  function setMode(board, id, mode) {
    const absent = missing(board, id);
    if (absent) return absent;
    if (MODES.indexOf(mode) < 0) return result(false, 'BadMode', clone(board), {id: id});
    const next = clone(board);
    const item = find(next, id);
    item.mode = mode;
    clearApprovals(item);
    item.queue = null;
    return result(true, 'Mode', next, {id: id, mode: mode});
  }

  function setTimelock(board, id, on) {
    const absent = missing(board, id);
    if (absent) return absent;
    const next = clone(board);
    find(next, id).timelock = Boolean(on);
    return result(true, 'Timelock', next, {id: id, timelock: Boolean(on)});
  }

  function setThreshold(board, id, m) {
    const absent = missing(board, id);
    if (absent) return absent;
    const next = clone(board);
    const item = find(next, id);
    const size = item.multisig.members.length;
    const need = Math.round(Number(m));
    if (!(need >= 1 && need <= size)) return result(false, 'BadThreshold', next, {id: id});
    item.multisig.m = need;
    return result(true, 'ThresholdSet', next, {id: id, need: need});
  }

  function setApproval(board, id, signerId, on) {
    const absent = missing(board, id);
    if (absent) return absent;
    const next = clone(board);
    const item = find(next, id);
    let row = null;
    if (item.mode === 'single' && item.single.id === signerId) row = item.single;
    if (item.mode === 'multisig') {
      row = item.multisig.members.find(function (member) { return member.id === signerId; }) || null;
    }
    if (item.mode === 'dao') {
      row = item.dao.voters.find(function (voter) { return voter.id === signerId; }) || null;
    }
    if (!row) return result(false, 'BadSigner', next, {id: id});
    row.on = Boolean(on);
    const call = verdict(item);
    return result(true, 'Approval', next, {id: id, have: call.have, need: call.need, approved: call.ok});
  }

  function propose(board, id) {
    const absent = missing(board, id);
    if (absent) return absent;
    const next = clone(board);
    const item = find(next, id);
    if (item.drained) return result(false, 'AlreadyDrained', next, {id: id});
    if (item.queue) return result(false, 'AlreadyQueued', next, {id: id, landsAt: item.queue.landsAt});
    const call = verdict(item);
    if (!call.ok) {
      return result(false, call.code, next, {id: id, have: call.have, need: call.need});
    }
    if (item.timelock) {
      item.queue = {
        binary: withDrain(item.safeBinary),
        at: next.now,
        landsAt: next.now + item.delay,
      };
      return result(true, 'Queued', next, {id: id, have: call.have, need: call.need, landsAt: item.queue.landsAt});
    }
    applyDrain(item);
    return result(true, 'Upgraded', next, {id: id, have: call.have, need: call.need, taken: item.taken});
  }

  function cancel(board, id) {
    const absent = missing(board, id);
    if (absent) return absent;
    const next = clone(board);
    const item = find(next, id);
    if (!item.queue) return result(false, 'NoQueue', next, {id: id});
    item.queue = null;
    return result(true, 'Cancelled', next, {id: id});
  }

  function landDue(board) {
    const next = clone(board);
    const landed = [];
    next.programs.forEach(function (item) {
      if (item.queue && next.now >= item.queue.landsAt) {
        markDrained(item, item.queue.binary);
        landed.push(item.id);
      }
    });
    if (landed.length) return result(true, 'Landed', next, {landed: landed});
    const waiting = next.programs.some(function (item) { return item.queue; });
    return result(false, waiting ? 'TooEarly' : 'NoQueue', next, {landed: []});
  }

  function advance(board, days) {
    const next = clone(board);
    const step = Number(days);
    if (!(step > 0)) return result(false, 'BadTime', next, {landed: []});
    next.now += step;
    return landDue(next);
  }

  function restore(board, id) {
    const absent = missing(board, id);
    if (absent) return absent;
    const next = clone(board);
    const item = find(next, id);
    item.binary = item.safeBinary.slice();
    item.tvl = item.originalTvl;
    item.taken = 0;
    item.drained = false;
    item.queue = null;
    clearApprovals(item);
    return result(true, 'Restored', next, {id: id});
  }

  return {
    DRAIN: DRAIN,
    MODES: MODES,
    DELAY_DAYS: DELAY_DAYS,
    createBoard: createBoard,
    verdict: verdict,
    setMode: setMode,
    setTimelock: setTimelock,
    setThreshold: setThreshold,
    setApproval: setApproval,
    propose: propose,
    cancel: cancel,
    landDue: landDue,
    advance: advance,
    restore: restore,
  };
});
