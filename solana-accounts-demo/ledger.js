// A local ledger. Solana is a key/value store: an address is the key, and the
// account is a memory region holding lamports, an owner, an executable flag,
// and data. Transactions are atomic. The runtime, not the toy program, decides
// who may debit. The checks below are the five Neodyme keeps finding missing.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SolanaLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FEE_LAMPORTS = 5000;
  const LAMPORTS_PER_SOL = 1000000000;
  const LAMPORTS_PER_BYTE_YEAR = 3480;
  const EXEMPTION_YEARS = 2;
  const ACCOUNT_OVERHEAD = 128;
  const TOKEN_FEE = 1000;
  const TYPE_CONFIG = 1;
  const TYPE_USER = 2;
  const TYPE_VAULT = 3;
  const ARTICLE_AMOUNT = 4294967195;
  const ARTICLE_WRAPPED = 899;
  const ATTACKER_BALANCE = 100000;
  const RESTRICTED_AMOUNT = 1000000000;
  const SPL_AMOUNT = 1000;

  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  const NATIVE = 'NativeLoader1111111111111111111111111111111';
  const LOADER = 'BPFLoader2111111111111111111111111111111111';
  const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

  function tag(label) {
    const bytes = new Uint8Array(32);
    let i;
    for (i = 0; i < label.length && i < 28; i += 1) bytes[i] = label.charCodeAt(i);
    bytes[30] = label.length;
    bytes[31] = 0x5a;
    return bytes;
  }

  function encodeBase58(bytes) {
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
    const digits = [0];
    let i;
    for (i = zeros; i < bytes.length; i += 1) {
      let carry = bytes[i];
      let j;
      for (j = 0; j < digits.length; j += 1) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    let significant = digits.length;
    while (significant > 0 && digits[significant - 1] === 0) significant -= 1;
    let out = '';
    for (i = 0; i < zeros; i += 1) out += '1';
    for (i = significant - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
    return out || '1';
  }

  function equalBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let i;
    for (i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function standIn(label) {
    const key = tag(label);
    return {key: key, address: encodeBase58(key)};
  }

  const SYSTEM_KEY = new Uint8Array(32);
  const SYSTEM = encodeBase58(SYSTEM_KEY);

  const till = standIn('till-program');
  const configId = standIn('config-account');
  const vaultId = standIn('vault-account');
  const honestUser = standIn('honest-user');
  const attackerUser = standIn('attacker-user');
  const honestWallet = standIn('honest-wallet');
  const adminWallet = standIn('admin-wallet');
  const attackerWallet = standIn('attacker-wallet');
  const successorWallet = standIn('successor-wallet');
  const fakeConfig = standIn('fake-config');
  const fakeToken = standIn('fake-token-program');

  const IDS = {
    native: NATIVE,
    system: SYSTEM,
    loader: LOADER,
    token: TOKEN,
    till: till.address,
    config: configId.address,
    vault: vaultId.address,
    honestUser: honestUser.address,
    attackerUser: attackerUser.address,
    honest: honestWallet.address,
    admin: adminWallet.address,
    attacker: attackerWallet.address,
    successor: successorWallet.address,
    fakeConfig: fakeConfig.address,
    fakeToken: fakeToken.address,
  };

  function writeU32(buf, offset, value) {
    let n = value >>> 0;
    let i;
    for (i = 0; i < 4; i += 1) {
      buf[offset + i] = n % 256;
      n = Math.floor(n / 256);
    }
  }

  function readU32(buf, offset) {
    return buf[offset] + buf[offset + 1] * 256 + buf[offset + 2] * 65536 + buf[offset + 3] * 16777216;
  }

  function writeU64(buf, offset, value) {
    let n = value;
    let i;
    for (i = 0; i < 8; i += 1) {
      buf[offset + i] = n % 256;
      n = Math.floor(n / 256);
    }
  }

  function readU64(buf, offset) {
    let n = 0;
    let i;
    for (i = 7; i >= 0; i -= 1) n = n * 256 + buf[offset + i];
    return n;
  }

  function encodeConfig(adminKey, fee, userCount) {
    const data = new Uint8Array(41);
    data[0] = TYPE_CONFIG;
    data.set(adminKey, 1);
    writeU32(data, 33, fee);
    writeU32(data, 37, userCount);
    return data;
  }

  function encodeUser(authority, balance) {
    const data = new Uint8Array(41);
    data[0] = TYPE_USER;
    data.set(authority, 1);
    writeU64(data, 33, balance);
    return data;
  }

  function encodeVault() {
    const data = new Uint8Array(1);
    data[0] = TYPE_VAULT;
    return data;
  }

  function unpackConfig(data, checkType) {
    if (!data || data.length < 41) return {error: 'AccountDataTooSmall'};
    if (checkType && data[0] !== TYPE_CONFIG) return {error: 'InvalidAccountType'};
    return {
      admin: data.slice(1, 33),
      fee: readU32(data, 33),
      userCount: readU32(data, 37),
    };
  }

  function unpackUser(data, checkType) {
    if (!data || data.length < 41) return {error: 'AccountDataTooSmall'};
    if (checkType && data[0] !== TYPE_USER) return {error: 'InvalidAccountType'};
    return {
      authority: data.slice(1, 33),
      balance: readU64(data, 33),
    };
  }

  function addU32(a, b) {
    return (a + b) >>> 0;
  }

  function checkedAddU32(a, b) {
    if (!isU32(a) || !isU32(b)) return null;
    const sum = a + b;
    if (sum > 0xffffffff) return null;
    return sum;
  }

  function isU32(n) {
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  }

  function exemptionFloor(dataLen) {
    return (dataLen + ACCOUNT_OVERHEAD) * LAMPORTS_PER_BYTE_YEAR * EXEMPTION_YEARS;
  }

  function formatLamports(n) {
    const sign = n < 0 ? '-' : '';
    const body = String(Math.abs(Math.trunc(n)));
    return sign + body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatSol(lamports) {
    const sign = lamports < 0 ? '-' : '';
    const abs = Math.abs(Math.trunc(lamports));
    const whole = Math.floor(abs / LAMPORTS_PER_SOL);
    const frac = abs % LAMPORTS_PER_SOL;
    if (frac === 0) return sign + String(whole);
    const digits = String(frac).padStart(9, '0').replace(/0+$/, '');
    return sign + whole + '.' + digits;
  }

  function shortAddress(address) {
    if (!address || address.length <= 10) return address || '';
    return address.slice(0, 4) + '…' + address.slice(-4);
  }

  function hex(bytes, max) {
    const limit = max == null ? bytes.length : max;
    const parts = [];
    let i;
    for (i = 0; i < bytes.length && i < limit; i += 1) {
      parts.push(bytes[i].toString(16).padStart(2, '0'));
    }
    return parts.join(' ');
  }

  function elfStandIn() {
    return Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x00, 0x00, 0x00]);
  }

  function makeAccount(spec) {
    const data = spec.data || new Uint8Array(0);
    const lamports = spec.lamports == null ? exemptionFloor(data.length) : spec.lamports;
    return {
      address: spec.address,
      name: spec.name,
      group: spec.group,
      key: spec.key || new Uint8Array(32),
      owner: spec.owner,
      executable: Boolean(spec.executable),
      lamports: lamports,
      data: data,
      wellKnown: Boolean(spec.wellKnown),
      note: spec.note || '',
    };
  }

  function createLedger() {
    const accounts = {};
    function add(account) {
      accounts[account.address] = account;
    }

    add(makeAccount({
      address: NATIVE,
      name: 'Native loader',
      group: 'program',
      owner: NATIVE,
      executable: true,
      data: elfStandIn(),
      wellKnown: true,
      note: 'Owns the builtin programs and the loaders.',
    }));
    add(makeAccount({
      address: SYSTEM,
      name: 'System program',
      group: 'program',
      key: SYSTEM_KEY,
      owner: NATIVE,
      executable: true,
      data: elfStandIn(),
      wellKnown: true,
      note: 'Creates accounts and is the only program that can debit a wallet.',
    }));
    add(makeAccount({
      address: LOADER,
      name: 'BPF loader v2',
      group: 'program',
      owner: NATIVE,
      executable: true,
      data: elfStandIn(),
      wellKnown: true,
      note: 'Owns the SPL Token program and this page’s toy program.',
    }));
    add(makeAccount({
      address: TOKEN,
      name: 'SPL Token',
      group: 'program',
      owner: LOADER,
      executable: true,
      data: elfStandIn(),
      wellKnown: true,
      note: 'The program id a careful invoke has to match.',
    }));
    add(makeAccount({
      address: till.address,
      name: 'Till',
      group: 'program',
      key: till.key,
      owner: LOADER,
      executable: true,
      data: elfStandIn(),
      note: 'Toy program. Stateless. It only sees the accounts a transaction passes in.',
    }));
    add(makeAccount({
      address: fakeToken.address,
      name: 'Fake token program',
      group: 'program',
      key: fakeToken.key,
      owner: LOADER,
      executable: true,
      data: Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x00, 0x01]),
      note: 'Executable, so the runtime will call it. It is not SPL Token.',
    }));

    const vaultData = encodeVault();
    add(makeAccount({
      address: configId.address,
      name: 'Config',
      group: 'data',
      key: configId.key,
      owner: till.address,
      data: encodeConfig(adminWallet.key, TOKEN_FEE, 2),
      note: 'Till’s admin pubkey lives here. Only Till should write it.',
    }));
    add(makeAccount({
      address: vaultId.address,
      name: 'Vault',
      group: 'data',
      key: vaultId.key,
      owner: till.address,
      lamports: ARTICLE_AMOUNT + exemptionFloor(vaultData.length),
      data: vaultData,
      note: 'Holds lamports for every depositor, not just the attacker’s 100,000.',
    }));
    add(makeAccount({
      address: honestUser.address,
      name: 'Honest user',
      group: 'data',
      key: honestUser.key,
      owner: till.address,
      data: encodeUser(honestWallet.key, 1000000000),
      note: 'Type byte, authority, recorded balance.',
    }));
    add(makeAccount({
      address: attackerUser.address,
      name: 'Attacker user',
      group: 'data',
      key: attackerUser.key,
      owner: till.address,
      data: encodeUser(attackerWallet.key, ATTACKER_BALANCE),
      note: 'A real User account Till owns. Its authority is the attacker.',
    }));
    add(makeAccount({
      address: fakeConfig.address,
      name: 'Fake config',
      group: 'data',
      key: fakeConfig.key,
      owner: SYSTEM,
      data: encodeConfig(attackerWallet.key, TOKEN_FEE, 1),
      note: 'Config-shaped bytes, owned by the System Program, not by Till.',
    }));

    add(makeAccount({
      address: honestWallet.address,
      name: 'Honest wallet',
      group: 'wallet',
      key: honestWallet.key,
      owner: SYSTEM,
      lamports: 2000000000,
      note: 'System account. Can pay fees and sign.',
    }));
    add(makeAccount({
      address: adminWallet.address,
      name: 'Admin wallet',
      group: 'wallet',
      key: adminWallet.key,
      owner: SYSTEM,
      lamports: 100000000,
      note: 'The admin pubkey stored in Config.',
    }));
    add(makeAccount({
      address: attackerWallet.address,
      name: 'Attacker wallet',
      group: 'wallet',
      key: attackerWallet.key,
      owner: SYSTEM,
      lamports: 500000000,
      note: 'Signs the exploit transactions.',
    }));
    add(makeAccount({
      address: successorWallet.address,
      name: 'Successor wallet',
      group: 'wallet',
      key: successorWallet.key,
      owner: SYSTEM,
      lamports: 50000000,
      note: 'A new admin the current admin can appoint.',
    }));

    return {accounts: accounts, ids: IDS, simulation: true};
  }

  function defaultChecks() {
    return {signer: true, owner: true, type: true, math: true, programId: true};
  }

  function flag(checks, name) {
    return !checks || checks[name] !== false;
  }

  function findByKey(ledger, bytes) {
    const ids = Object.keys(ledger.accounts);
    let i;
    for (i = 0; i < ids.length; i += 1) {
      const account = ledger.accounts[ids[i]];
      if (equalBytes(account.key, bytes) && account.address === encodeBase58(account.key)) return account;
    }
    return null;
  }

  function describeData(ledger, account) {
    if (account.executable) {
      return {
        kind: 'program',
        line: account.address === fakeToken.address ? 'Fake bytecode stand-in' : 'Bytecode stand-in',
      };
    }
    if (!account.data.length) return {kind: 'empty', line: 'No data'};
    if (account.data[0] === TYPE_CONFIG && account.data.length >= 41) {
      const unpacked = unpackConfig(account.data, false);
      const admin = findByKey(ledger, unpacked.admin);
      return {
        kind: 'config',
        line: 'config · admin ' + (admin ? admin.name : shortAddress(encodeBase58(unpacked.admin))) + ' · fee ' + unpacked.fee,
        admin: admin ? admin.address : null,
      };
    }
    if (account.data[0] === TYPE_USER && account.data.length >= 41) {
      const unpacked = unpackUser(account.data, false);
      const authority = findByKey(ledger, unpacked.authority);
      return {
        kind: 'user',
        line: 'user · authority ' + (authority ? authority.name : 'unknown') + ' · balance ' + formatLamports(unpacked.balance),
        authority: authority ? authority.address : null,
        balance: unpacked.balance,
      };
    }
    if (account.data[0] === TYPE_VAULT) return {kind: 'vault', line: 'vault'};
    return {kind: 'raw', line: hex(account.data, 8)};
  }

  function regions(account) {
    if (account.executable) return [{start: 0, end: account.data.length, kind: 'code'}];
    if (account.data[0] === TYPE_CONFIG || account.data[0] === TYPE_USER) {
      return [
        {start: 0, end: 1, kind: 'type'},
        {start: 1, end: 33, kind: 'pubkey'},
        {start: 33, end: 41, kind: 'number'},
      ];
    }
    if (account.data[0] === TYPE_VAULT) return [{start: 0, end: 1, kind: 'type'}];
    return [{start: 0, end: account.data.length, kind: 'raw'}];
  }

  function misreadUserAsConfig(data) {
    return unpackConfig(data, false);
  }

  function cloneLedger(ledger) {
    return {
      accounts: structuredClone(ledger.accounts),
      ids: ledger.ids,
      simulation: true,
    };
  }

  function meta(ledger, ix, role) {
    const found = (ix.accounts || []).filter(function (row) { return row.role === role; })[0];
    if (!found) return {error: 'MissingAccount', why: 'The instruction is missing ' + role + '.'};
    const account = ledger.accounts[found.address];
    if (!account) return {error: 'UnknownAccount', why: 'No account at that address is in this ledger.'};
    return {row: found, account: account};
  }

  function fail(code, why) {
    return {ok: false, error: code, why: why, log: [why]};
  }

  function debit(account, row, amount, programId) {
    if (!row.isWritable) return 'AccountNotWritable';
    if (account.owner !== programId) return 'OwnerDebitForbidden';
    if (!Number.isInteger(amount) || amount < 0) return 'InvalidArgument';
    if (account.lamports < amount) return 'InsufficientFunds';
    const left = account.lamports - amount;
    if (left !== 0 && left < exemptionFloor(account.data.length)) return 'BelowExemption';
    account.lamports = left;
    return null;
  }

  function credit(account, row, amount) {
    if (!row.isWritable) return 'AccountNotWritable';
    if (!Number.isInteger(amount) || amount < 0) return 'InvalidArgument';
    account.lamports += amount;
    return null;
  }

  function systemTransfer(ledger, ix) {
    const from = meta(ledger, ix, 'from');
    if (from.error) return fail(from.error, from.why);
    const to = meta(ledger, ix, 'to');
    if (to.error) return fail(to.error, to.why);
    const amount = ix.data && ix.data.amount;
    if (!Number.isInteger(amount) || amount <= 0) return fail('InvalidArgument', 'A transfer needs a positive whole-lamport amount.');
    if (!from.row.isSigner) {
      return fail('MissingSignature', 'The System Program will not debit a wallet that did not sign. Till cannot debit it either: Till does not own wallets.');
    }
    const problem = debit(from.account, from.row, amount, SYSTEM);
    if (problem === 'OwnerDebitForbidden') {
      return fail(problem, 'Only the owner can debit lamports. The System Program owns wallets. It does not own this account.');
    }
    if (problem) return fail(problem, 'The system transfer could not debit the source (' + problem + ').');
    const credited = credit(to.account, to.row, amount);
    if (credited) {
      from.account.lamports += amount;
      return fail(credited, 'The destination must be writable. Anyone may credit lamports, but only if the transaction marks the account writable.');
    }
    return {ok: true, log: ['System program moved ' + formatLamports(amount) + ' lamports.']};
  }

  function writeUserBalance(account, balance) {
    writeU64(account.data, 33, balance);
  }

  function requireOwned(account, checks) {
    if (flag(checks, 'owner') && account.owner !== till.address) {
      return fail('InvalidConfigAccount', 'AccountInfo::owner is not Till. Neodyme: do not trust an account your program does not own. The runtime lets you read it. It does not make the bytes true.');
    }
    return null;
  }

  function tillCredit(ledger, ix, checks) {
    const user = meta(ledger, ix, 'user');
    if (user.error) return fail(user.error, user.why);
    const authority = meta(ledger, ix, 'authority');
    if (authority.error) return fail(authority.error, authority.why);
    const amount = ix.data && ix.data.amount;
    if (!Number.isInteger(amount) || amount <= 0) return fail('InvalidArgument', 'Credit needs a positive amount.');
    const owned = requireOwned(user.account, checks);
    if (owned) return owned;
    const unpacked = unpackUser(user.account.data, flag(checks, 'type'));
    if (unpacked.error === 'InvalidAccountType') {
      return fail('InvalidAccountType', 'The account Till owns is not a User. Account data has no types of its own. The program has to check the type byte.');
    }
    if (unpacked.error) return fail(unpacked.error, 'The user account could not be read.');
    if (!equalBytes(unpacked.authority, authority.account.key)) {
      return fail('InvalidAdminAccount', 'The authority pubkey does not match the user account.');
    }
    if (flag(checks, 'signer') && !authority.row.isSigner) {
      return fail('MissingSigner', 'The authority pubkey matches, but AccountInfo::is_signer is false. Listing an account is not a signature.');
    }
    if (!user.row.isWritable) return fail('AccountNotWritable', 'Till needs the user account writable to update its balance.');
    if (user.account.owner !== till.address) {
      return fail('OwnerDebitForbidden', 'The runtime refused the write. Only Till can change data on accounts Till owns, even when the owner check is off.');
    }
    writeUserBalance(user.account, unpacked.balance + amount);
    return {ok: true, log: ['Till added ' + formatLamports(amount) + ' to the recorded user balance.']};
  }

  function updateAdmin(ledger, ix, checks) {
    const config = meta(ledger, ix, 'config');
    if (config.error) return fail(config.error, config.why);
    const admin = meta(ledger, ix, 'admin');
    if (admin.error) return fail(admin.error, admin.why);
    const next = meta(ledger, ix, 'newAdmin');
    if (next.error) return fail(next.error, next.why);
    const owned = requireOwned(config.account, checks);
    if (owned) return owned;
    const unpacked = unpackConfig(config.account.data, flag(checks, 'type'));
    if (unpacked.error === 'InvalidAccountType') {
      return fail('InvalidAccountType', 'Those bytes are not a Config. The type byte does not match, so Till will not treat them as an admin key.');
    }
    if (unpacked.error) return fail(unpacked.error, 'The config account could not be read.');
    if (!equalBytes(unpacked.admin, admin.account.key)) {
      return fail('InvalidAdminAccount', 'The admin account is not the pubkey stored in config.');
    }
    if (flag(checks, 'signer') && !admin.row.isSigner) {
      return fail('MissingSigner', 'The admin pubkey matched config.admin. The account did not sign. Neodyme’s missing signer check is this gap: is_signer was never read.');
    }
    if (!config.row.isWritable) return fail('AccountNotWritable', 'Config has to be writable for Till to store a new admin.');
    if (config.account.owner !== till.address) {
      return fail('OwnerDebitForbidden', 'The runtime refused the write. A program cannot change data on an account it does not own, whether or not it remembered the owner check.');
    }
    config.account.data.set(next.account.key, 1);
    return {ok: true, log: ['Till stored ' + next.account.name + ' as the config admin.']};
  }

  function withdrawRestricted(ledger, ix, checks) {
    const vault = meta(ledger, ix, 'vault');
    if (vault.error) return fail(vault.error, vault.why);
    const admin = meta(ledger, ix, 'admin');
    if (admin.error) return fail(admin.error, admin.why);
    const config = meta(ledger, ix, 'config');
    if (config.error) return fail(config.error, config.why);
    const amount = ix.data && ix.data.amount;
    if (!Number.isInteger(amount) || amount <= 0) return fail('InvalidArgument', 'Withdraw needs a positive amount.');
    const owned = requireOwned(config.account, checks);
    if (owned) return owned;
    const unpacked = unpackConfig(config.account.data, flag(checks, 'type'));
    if (unpacked.error === 'InvalidAccountType') {
      return fail('InvalidAccountType', 'Till expected a Config and found another type. Neodyme’s account-confusion bug is what happens when this check is missing: the first 32 bytes after the type are read as the admin.');
    }
    if (unpacked.error) return fail(unpacked.error, 'The config account could not be read.');
    if (!equalBytes(unpacked.admin, admin.account.key)) {
      return fail('InvalidAdminAccount', 'The signer candidate is not the admin stored in the account Till just unpacked.');
    }
    if (flag(checks, 'signer') && !admin.row.isSigner) {
      return fail('MissingSigner', 'The unpacked admin matches, and that account did not sign.');
    }
    const problem = debit(vault.account, vault.row, amount, till.address);
    if (problem === 'OwnerDebitForbidden') {
      return fail(problem, 'Till tried to debit an account it does not own. The runtime rejects that even when every program check is off. Only the owner debits lamports. Anyone may credit them.');
    }
    if (problem) return fail(problem, 'The vault debit failed (' + problem + ').');
    const credited = credit(admin.account, admin.row, amount);
    if (credited) {
      vault.account.lamports += amount;
      return fail(credited, 'The admin account has to be writable to receive lamports.');
    }
    return {ok: true, log: ['Till moved ' + formatLamports(amount) + ' lamports from the vault to ' + admin.account.name + '.']};
  }

  function withdrawToken(ledger, ix, checks) {
    const vault = meta(ledger, ix, 'vault');
    if (vault.error) return fail(vault.error, vault.why);
    const user = meta(ledger, ix, 'user');
    if (user.error) return fail(user.error, user.why);
    const authority = meta(ledger, ix, 'authority');
    if (authority.error) return fail(authority.error, authority.why);
    const destination = meta(ledger, ix, 'destination');
    if (destination.error) return fail(destination.error, destination.why);
    const amount = ix.data && ix.data.amount;
    if (!isU32(amount)) return fail('InvalidArgument', 'This instruction takes a u32 amount.');
    const owned = requireOwned(user.account, checks);
    if (owned) return owned;
    const unpacked = unpackUser(user.account.data, flag(checks, 'type'));
    if (unpacked.error === 'InvalidAccountType') {
      return fail('InvalidAccountType', 'The user account is not a User.');
    }
    if (unpacked.error) return fail(unpacked.error, 'The user account could not be read.');
    if (!equalBytes(unpacked.authority, authority.account.key)) {
      return fail('InvalidAdminAccount', 'That authority is not on the user account.');
    }
    if (flag(checks, 'signer') && !authority.row.isSigner) {
      return fail('MissingSigner', 'The authority did not sign.');
    }
    const realSum = amount + TOKEN_FEE;
    let compared;
    if (flag(checks, 'math')) {
      compared = checkedAddU32(amount, TOKEN_FEE);
      if (compared === null) {
        return fail('InvalidArgument', 'amount + fee overflowed u32. Checked add returns an error, and the transfer does not run. Neodyme’s example wraps ' + formatLamports(ARTICLE_AMOUNT) + ' + ' + TOKEN_FEE + ' to ' + ARTICLE_WRAPPED + ' when this check is off.');
      }
    } else {
      compared = addU32(amount, TOKEN_FEE);
    }
    if (compared > unpacked.balance) {
      return fail('AttemptToWithdrawTooMuch', 'The recorded balance does not cover the amount plus the ' + TOKEN_FEE + ' fee.');
    }
    const problem = debit(vault.account, vault.row, amount, till.address);
    if (problem === 'OwnerDebitForbidden') {
      return fail(problem, 'Till can debit the vault because Till owns it. This account has a different owner, so the runtime keeps the lamports where they are.');
    }
    if (problem) return fail(problem, 'The vault debit failed (' + problem + ').');
    const credited = credit(destination.account, destination.row, amount);
    if (credited) {
      vault.account.lamports += amount;
      return fail(credited, 'The destination has to be writable.');
    }
    if (compared === realSum && user.row.isWritable && user.account.owner === till.address) {
      writeUserBalance(user.account, unpacked.balance - realSum);
    }
    const wrapped = compared !== realSum;
    const line = wrapped
      ? 'Wrapping add turned amount + ' + TOKEN_FEE + ' into ' + compared + ', which is under the recorded ' + formatLamports(unpacked.balance) + '. Till transferred the unwrapped amount anyway. The books still show the old balance.'
      : 'Till transferred ' + formatLamports(amount) + ' lamports and reduced the recorded balance by the amount plus the fee.';
    return {ok: true, log: [line]};
  }

  function withdrawSpl(ledger, ix, checks) {
    const tokenProgram = meta(ledger, ix, 'tokenProgram');
    if (tokenProgram.error) return fail(tokenProgram.error, tokenProgram.why);
    if (!tokenProgram.account.executable) {
      return fail('ProgramNotExecutable', 'The runtime will not invoke an account that is not executable.');
    }
    if (flag(checks, 'programId') && tokenProgram.account.address !== TOKEN) {
      return fail('InvalidTokenProgram', 'The program about to be invoked is not SPL Token. Neodyme: the caller picks the program id, so Till has to check it before invoke_signed.');
    }
    if (tokenProgram.account.address === TOKEN) {
      const inner = withdrawToken(ledger, ix, checks);
      if (!inner.ok) return inner;
      inner.log.unshift('Till invoked SPL Token. The transfer is the requested amount, not the whole vault.');
      return inner;
    }
    const vault = meta(ledger, ix, 'vault');
    if (vault.error) return fail(vault.error, vault.why);
    const destination = meta(ledger, ix, 'destination');
    if (destination.error) return fail(destination.error, destination.why);
    const floor = exemptionFloor(vault.account.data.length);
    const drain = vault.account.lamports - floor;
    if (drain <= 0) return fail('InsufficientFunds', 'The vault has nothing above its exemption floor.');
    const problem = debit(vault.account, vault.row, drain, till.address);
    if (problem) return fail(problem, 'The fake program could not debit the vault (' + problem + ').');
    const credited = credit(destination.account, destination.row, drain);
    if (credited) {
      vault.account.lamports += drain;
      return fail(credited, 'The destination has to be writable.');
    }
    return {
      ok: true,
      log: ['Till invoked ' + tokenProgram.account.name + ' without checking the program id. That program’s transfer drained the vault instead of moving ' + formatLamports(SPL_AMOUNT) + ' lamports.'],
    };
  }

  function runInstruction(ledger, ix, checks) {
    const program = ledger.accounts[ix.programId];
    if (!program || !program.executable) {
      return fail('ProgramNotExecutable', 'Solana rejects an instruction whose program account is not executable. Programs are accounts with the flag set.');
    }
    if (ix.programId === SYSTEM) return systemTransfer(ledger, ix);
    if (ix.programId !== till.address) {
      return fail('UnknownProgram', 'This simulation only executes the System Program and Till.');
    }
    const name = ix.data && ix.data.ix;
    if (name === 'credit_user') return tillCredit(ledger, ix, checks);
    if (name === 'update_admin') return updateAdmin(ledger, ix, checks);
    if (name === 'withdraw_restricted') return withdrawRestricted(ledger, ix, checks);
    if (name === 'withdraw_token') return withdrawToken(ledger, ix, checks);
    if (name === 'withdraw_spl') return withdrawSpl(ledger, ix, checks);
    return fail('UnknownInstruction', 'Till does not have that instruction.');
  }

  function validate(ledger, tx) {
    if (!tx || !tx.feePayer || !tx.instructions || !tx.instructions.length) {
      return fail('InvalidTransaction', 'A transaction needs a fee payer and at least one instruction.');
    }
    const payer = ledger.accounts[tx.feePayer];
    if (!payer) return fail('UnknownAccount', 'The fee payer is not in this ledger.');
    if (payer.owner !== SYSTEM) {
      return fail('FeePayerNotSystem', 'The fee payer has to be a system account. Program accounts do not pay fees.');
    }
    const signatures = tx.signatures || [];
    if (signatures.indexOf(tx.feePayer) === -1) {
      return fail('MissingSignature', 'The fee payer has to sign.');
    }
    if (payer.lamports < FEE_LAMPORTS) return fail('InsufficientFunds', 'The fee payer cannot cover the 5,000 lamport fee.');
    let p;
    for (p = 0; p < tx.instructions.length; p += 1) {
      const ix = tx.instructions[p];
      let a;
      for (a = 0; a < (ix.accounts || []).length; a += 1) {
        const row = ix.accounts[a];
        if (!ledger.accounts[row.address]) return fail('UnknownAccount', 'An instruction account is not in this ledger.');
        if (row.isSigner && signatures.indexOf(row.address) === -1) {
          return fail('MissingSignature', 'is_signer is set by the runtime from the signatures. This account is marked signer and did not sign, so the runtime rejects the transaction before the program runs.');
        }
      }
    }
    return null;
  }

  function diff(before, after) {
    const changes = [];
    Object.keys(after.accounts).forEach(function (address) {
      const left = before.accounts[address];
      const right = after.accounts[address];
      if (left.lamports !== right.lamports) {
        changes.push({address: address, field: 'lamports', before: left.lamports, after: right.lamports});
      }
      if (!equalBytes(left.data, right.data)) {
        changes.push({address: address, field: 'data', before: hex(left.data), after: hex(right.data)});
      }
    });
    return changes;
  }

  function execute(ledger, tx, checks) {
    const rejected = validate(ledger, tx);
    if (rejected) {
      return {
        ok: false,
        ledger: ledger,
        fee: 0,
        error: rejected.error,
        why: rejected.why,
        changes: [],
        log: rejected.log,
      };
    }
    const charged = cloneLedger(ledger);
    charged.accounts[tx.feePayer].lamports -= FEE_LAMPORTS;
    const working = cloneLedger(charged);
    const log = ['Runtime took a 5,000 lamport fee from the fee payer.'];
    let i;
    for (i = 0; i < tx.instructions.length; i += 1) {
      const step = runInstruction(working, tx.instructions[i], checks || defaultChecks());
      log.push.apply(log, step.log);
      if (!step.ok) {
        log.push('The instruction failed. Every account change except the fee is rolled back. A transaction is atomic.');
        return {
          ok: false,
          ledger: charged,
          fee: FEE_LAMPORTS,
          error: step.error,
          why: step.why,
          changes: diff(ledger, charged),
          log: log,
        };
      }
    }
    return {
      ok: true,
      ledger: working,
      fee: FEE_LAMPORTS,
      error: null,
      why: '',
      changes: diff(ledger, working),
      log: log,
    };
  }

  function ix(programId, name, amount, accounts) {
    return {
      programId: programId,
      data: {ix: name, amount: amount},
      accounts: accounts,
    };
  }

  function row(role, address, isSigner, isWritable) {
    return {role: role, address: address, isSigner: isSigner, isWritable: isWritable};
  }

  const SCENARIOS = [
    {
      id: 'deposit',
      group: 'honest',
      title: 'Deposit',
      blurb: 'The wallet signs a System Program transfer into the vault. Till records the same amount. Till cannot debit a wallet it does not own.',
    },
    {
      id: 'withdraw',
      group: 'honest',
      title: 'Withdraw',
      blurb: 'Till debits the vault it owns and credits the wallet. The recorded balance has to cover the amount plus a fee of 1,000.',
    },
    {
      id: 'set-admin',
      group: 'honest',
      title: 'Set admin',
      blurb: 'The current admin signs, and Till writes the successor into the config it owns.',
    },
    {
      id: 'attack-signer',
      group: 'attack',
      title: 'Missing signer',
      blurb: 'One atomic transaction updates the admin, then withdraws. The current admin is listed and does not sign. The check reads is_signer.',
    },
    {
      id: 'attack-owner',
      group: 'attack',
      title: 'Missing owner',
      blurb: 'The config slot is a system account whose bytes name the attacker as admin. The check reads AccountInfo::owner.',
    },
    {
      id: 'attack-confusion',
      group: 'attack',
      title: 'Account confusion',
      blurb: 'The config slot is a User account Till owns. The check reads the type byte before trusting the next 32 bytes as an admin.',
    },
    {
      id: 'attack-overflow',
      group: 'attack',
      title: 'Integer wrap',
      blurb: 'The amount is 2³²−100. Plus a fee of 1,000 it wraps to 899, under the recorded 100,000. Checked add rejects it.',
    },
    {
      id: 'attack-cpi',
      group: 'attack',
      title: 'Arbitrary invoke',
      blurb: 'The token program in the account list is a fake executable. The check compares its address to SPL Token before the invoke.',
    },
  ];

  function buildScenario(id) {
    if (id === 'deposit') {
      return {
        id: id,
        feePayer: honestWallet.address,
        signatures: [honestWallet.address],
        instructions: [
          ix(SYSTEM, 'transfer', 100000000, [
            row('from', honestWallet.address, true, true),
            row('to', vaultId.address, false, true),
          ]),
          ix(till.address, 'credit_user', 100000000, [
            row('user', honestUser.address, false, true),
            row('authority', honestWallet.address, true, false),
          ]),
        ],
      };
    }
    if (id === 'withdraw') {
      return {
        id: id,
        feePayer: honestWallet.address,
        signatures: [honestWallet.address],
        instructions: [
          ix(till.address, 'withdraw_token', 50000000, [
            row('vault', vaultId.address, false, true),
            row('user', honestUser.address, false, true),
            row('authority', honestWallet.address, true, false),
            row('destination', honestWallet.address, false, true),
          ]),
        ],
      };
    }
    if (id === 'set-admin') {
      return {
        id: id,
        feePayer: adminWallet.address,
        signatures: [adminWallet.address],
        instructions: [
          ix(till.address, 'update_admin', 0, [
            row('config', configId.address, false, true),
            row('admin', adminWallet.address, true, false),
            row('newAdmin', successorWallet.address, false, false),
          ]),
        ],
      };
    }
    if (id === 'attack-signer') {
      return {
        id: id,
        feePayer: attackerWallet.address,
        signatures: [attackerWallet.address],
        instructions: [
          ix(till.address, 'update_admin', 0, [
            row('config', configId.address, false, true),
            row('admin', adminWallet.address, false, false),
            row('newAdmin', attackerWallet.address, true, false),
          ]),
          ix(till.address, 'withdraw_restricted', RESTRICTED_AMOUNT, [
            row('vault', vaultId.address, false, true),
            row('admin', attackerWallet.address, true, true),
            row('config', configId.address, false, false),
          ]),
        ],
      };
    }
    if (id === 'attack-owner') {
      return {
        id: id,
        feePayer: attackerWallet.address,
        signatures: [attackerWallet.address],
        instructions: [
          ix(till.address, 'withdraw_restricted', RESTRICTED_AMOUNT, [
            row('vault', vaultId.address, false, true),
            row('admin', attackerWallet.address, true, true),
            row('config', fakeConfig.address, false, false),
          ]),
        ],
      };
    }
    if (id === 'attack-confusion') {
      return {
        id: id,
        feePayer: attackerWallet.address,
        signatures: [attackerWallet.address],
        instructions: [
          ix(till.address, 'withdraw_restricted', RESTRICTED_AMOUNT, [
            row('vault', vaultId.address, false, true),
            row('admin', attackerWallet.address, true, true),
            row('config', attackerUser.address, false, false),
          ]),
        ],
      };
    }
    if (id === 'attack-overflow') {
      return {
        id: id,
        feePayer: attackerWallet.address,
        signatures: [attackerWallet.address],
        instructions: [
          ix(till.address, 'withdraw_token', ARTICLE_AMOUNT, [
            row('vault', vaultId.address, false, true),
            row('user', attackerUser.address, false, true),
            row('authority', attackerWallet.address, true, false),
            row('destination', attackerWallet.address, false, true),
          ]),
        ],
      };
    }
    if (id === 'attack-cpi') {
      return {
        id: id,
        feePayer: attackerWallet.address,
        signatures: [attackerWallet.address],
        instructions: [
          ix(till.address, 'withdraw_spl', SPL_AMOUNT, [
            row('vault', vaultId.address, false, true),
            row('user', attackerUser.address, false, true),
            row('authority', attackerWallet.address, true, false),
            row('destination', attackerWallet.address, false, true),
            row('tokenProgram', fakeToken.address, false, false),
          ]),
        ],
      };
    }
    return null;
  }

  return {
    FEE_LAMPORTS: FEE_LAMPORTS,
    LAMPORTS_PER_SOL: LAMPORTS_PER_SOL,
    TOKEN_FEE: TOKEN_FEE,
    ARTICLE_AMOUNT: ARTICLE_AMOUNT,
    ARTICLE_WRAPPED: ARTICLE_WRAPPED,
    ATTACKER_BALANCE: ATTACKER_BALANCE,
    RESTRICTED_AMOUNT: RESTRICTED_AMOUNT,
    SPL_AMOUNT: SPL_AMOUNT,
    IDS: IDS,
    SCENARIOS: SCENARIOS,
    encodeBase58: encodeBase58,
    exemptionFloor: exemptionFloor,
    formatLamports: formatLamports,
    formatSol: formatSol,
    shortAddress: shortAddress,
    hex: hex,
    addU32: addU32,
    checkedAddU32: checkedAddU32,
    unpackConfig: unpackConfig,
    encodeUser: encodeUser,
    misreadUserAsConfig: misreadUserAsConfig,
    createLedger: createLedger,
    cloneLedger: cloneLedger,
    defaultChecks: defaultChecks,
    describeData: describeData,
    regions: regions,
    buildScenario: buildScenario,
    execute: execute,
  };
});
