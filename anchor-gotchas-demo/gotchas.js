// Four Anchor-specific failures. Seed bytes are concatenated with no
// separator. remaining_accounts skip account constraints. invoke_signed
// lends a PDA signature to the program id the caller passed. A deserialized
// account keeps its old fields until reload().

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AnchorGotchas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ATTACKER_NAME = 'youshouldbuythisproductfast';
  const VICTIM_PRODUCT = 'pr';
  const VICTIM_KEY = 'oductyoushouldbuythisproductfast';
  const VAULT_START = 1000;
  const POOL_START = 5000;
  const SUPPLY_START = 1000000;
  const MINT_AMOUNT = 250000;

  const WINNER = 'WinBo111111111111111111111111111111111111111';
  const ATTACKER = 'AtkWa111111111111111111111111111111111111111';
  const VAULT = 'Vau1t111111111111111111111111111111111111111';
  const POOL = 'Poo1PDA11111111111111111111111111111111111111';
  const TRUSTED = 'Lend111111111111111111111111111111111111111';
  const MALICIOUS = 'Evi1111111111111111111111111111111111111111';

  const GOTCHAS = [
    {id: 'seeds', label: 'Seed collisions'},
    {id: 'remaining', label: 'Remaining accounts'},
    {id: 'cpi', label: 'Confused deputy'},
    {id: 'stale', label: 'Stale account'},
  ];

  const PARTIES = {
    winner: {id: 'winner', name: 'Winner PDA', owner: 'Market program', discriminator: 'Winner', address: WINNER},
    attacker: {id: 'attacker', name: 'Attacker wallet', owner: 'System program', discriminator: '', address: ATTACKER},
  };

  function bytesOf(text) {
    const out = [];
    let i;
    for (i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i));
    return out;
  }

  function fnv32(bytes) {
    let hash = 2166136261;
    let i;
    for (i = 0; i < bytes.length; i += 1) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function hash32(bytes) {
    const out = [];
    let hash = fnv32(bytes);
    let i;
    for (i = 0; i < 32; i += 1) {
      hash = Math.imul(hash ^ (i + 1), 2246822519) >>> 0;
      out.push(hash & 255);
    }
    return out;
  }

  function addressFrom(bytes) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let hash = fnv32(bytes) ^ Math.imul(bytes.length, 0x9e3779b9);
    let out = '';
    let i;
    for (i = 0; i < 8; i += 1) {
      out += alphabet[hash % 58];
      hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    }
    return out;
  }

  function ascii(bytes) {
    let out = '';
    let i;
    for (i = 0; i < bytes.length; i += 1) {
      const byte = bytes[i];
      out += byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.';
    }
    return out;
  }

  function hex(bytes) {
    return bytes.map(function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function productSeeds() {
    return [
      {label: 'b"product"', bytes: bytesOf('product'), variable: false},
      {label: 'product_name', bytes: bytesOf(ATTACKER_NAME), variable: true},
    ];
  }

  function bidSeeds() {
    return [
      {label: 'product_name', bytes: bytesOf(VICTIM_PRODUCT), variable: true},
      {label: 'user.key()', bytes: bytesOf(VICTIM_KEY), variable: false},
    ];
  }

  function derive(seeds, fix) {
    const parts = [];
    seeds.forEach(function (seed) {
      parts.push(fix && seed.variable ? hash32(seed.bytes) : seed.bytes.slice());
    });
    const bytes = [];
    parts.forEach(function (part) {
      part.forEach(function (byte) { bytes.push(byte); });
    });
    return {
      bytes: bytes,
      text: ascii(bytes),
      address: addressFrom(bytes),
      parts: parts,
    };
  }

  function createSeeds() {
    return {fix: false, accounts: {}};
  }

  function setSeedFix(state, fix) {
    return {fix: !!fix, accounts: state.accounts};
  }

  function holder(accounts, address) {
    return accounts[address] || null;
  }

  function seedView(state) {
    const product = derive(productSeeds(), state.fix);
    const bid = derive(bidSeeds(), state.fix);
    return {
      product: product,
      bid: bid,
      same: product.address === bid.address,
      productHolder: holder(state.accounts, product.address),
      bidHolder: holder(state.accounts, bid.address),
    };
  }

  function hasKind(state, kind) {
    return Object.keys(state.accounts).some(function (address) {
      return state.accounts[address].kind === kind;
    });
  }

  function occupy(state, kind) {
    const view = seedView(state);
    const derived = kind === 'product' ? view.product : view.bid;
    const existing = state.accounts[derived.address];
    if (existing) {
      return {ok: false, state: state, code: 'AccountInUse', address: derived.address, holder: existing};
    }
    const accounts = {...state.accounts};
    accounts[derived.address] = {
      kind: kind,
      label: kind === 'product' ? 'Attacker product' : "Bo's bid",
    };
    return {
      ok: true,
      state: {fix: state.fix, accounts: accounts},
      code: 'Created',
      address: derived.address,
    };
  }

  function createProduct(state) {
    return occupy(state, 'product');
  }

  function placeBid(state) {
    return occupy(state, 'bid');
  }

  function createVault() {
    return {
      checks: {owner: false, type: false, address: false},
      selected: 'attacker',
      vault: VAULT_START,
      winner: 0,
      attacker: 0,
      done: false,
    };
  }

  function setCheck(state, key, on) {
    if (!Object.prototype.hasOwnProperty.call(state.checks, key)) return state;
    return {
      ...state,
      checks: {...state.checks, [key]: !!on},
    };
  }

  function selectAccount(state, id) {
    if (!PARTIES[id] || state.done) return state;
    return {...state, selected: id};
  }

  function cashOut(state) {
    if (state.done) return {ok: false, state: state, code: 'Done'};
    const party = PARTIES[state.selected];
    if (state.checks.owner && party.owner !== 'Market program') {
      return {ok: false, state: state, code: 'Owner'};
    }
    if (state.checks.type && party.discriminator !== 'Winner') {
      return {ok: false, state: state, code: 'Type'};
    }
    if (state.checks.address && party.address !== WINNER) {
      return {ok: false, state: state, code: 'Address'};
    }
    const drained = state.selected === 'attacker';
    return {
      ok: true,
      code: drained ? 'Drained' : 'Paid',
      state: {
        checks: state.checks,
        selected: state.selected,
        vault: 0,
        winner: drained ? state.winner : state.vault,
        attacker: drained ? state.vault : state.attacker,
        done: true,
      },
    };
  }

  function createCpi() {
    return {checkProgram: false, program: 'malicious', pool: POOL_START, attacker: 0, done: false};
  }

  function setProgramCheck(state, on) {
    return {...state, checkProgram: !!on};
  }

  function selectProgram(state, id) {
    if ((id !== 'trusted' && id !== 'malicious') || state.done) return state;
    return {...state, program: id};
  }

  function invoke(state) {
    if (state.done) return {ok: false, state: state, code: 'Done'};
    if (state.checkProgram && state.program !== 'trusted') {
      return {ok: false, state: state, code: 'ProgramId'};
    }
    if (state.program === 'malicious') {
      return {
        ok: true,
        code: 'Drained',
        state: {
          checkProgram: state.checkProgram,
          program: state.program,
          pool: 0,
          attacker: state.pool,
          done: true,
        },
      };
    }
    return {ok: true, code: 'Lent', state: {...state, done: true}};
  }

  function createMint() {
    return {reload: false, chain: SUPPLY_START, struct: SUPPLY_START, minted: false};
  }

  function setReload(state, on) {
    if (!on) return {...state, reload: false};
    return {...state, reload: true, struct: state.chain};
  }

  function mintTo(state) {
    if (state.minted) return {ok: false, state: state, code: 'Done'};
    const chain = state.chain + MINT_AMOUNT;
    return {
      ok: true,
      code: 'Minted',
      state: {
        reload: state.reload,
        chain: chain,
        struct: state.reload ? chain : state.struct,
        minted: true,
      },
    };
  }

  function share(amount, supply) {
    return amount / supply;
  }

  return {
    GOTCHAS: GOTCHAS,
    PARTIES: PARTIES,
    ATTACKER_NAME: ATTACKER_NAME,
    VICTIM_PRODUCT: VICTIM_PRODUCT,
    VICTIM_KEY: VICTIM_KEY,
    VAULT_START: VAULT_START,
    POOL_START: POOL_START,
    SUPPLY_START: SUPPLY_START,
    MINT_AMOUNT: MINT_AMOUNT,
    WINNER: WINNER,
    ATTACKER: ATTACKER,
    VAULT: VAULT,
    POOL: POOL,
    TRUSTED: TRUSTED,
    MALICIOUS: MALICIOUS,
    bytesOf: bytesOf,
    ascii: ascii,
    hex: hex,
    productSeeds: productSeeds,
    bidSeeds: bidSeeds,
    derive: derive,
    createSeeds: createSeeds,
    setSeedFix: setSeedFix,
    seedView: seedView,
    hasKind: hasKind,
    createProduct: createProduct,
    placeBid: placeBid,
    createVault: createVault,
    setCheck: setCheck,
    selectAccount: selectAccount,
    cashOut: cashOut,
    createCpi: createCpi,
    setProgramCheck: setProgramCheck,
    selectProgram: selectProgram,
    invoke: invoke,
    createMint: createMint,
    setReload: setReload,
    mintTo: mintTo,
    share: share,
  };
});
