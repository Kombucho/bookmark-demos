const test = require('node:test');
const assert = require('node:assert/strict');
const ledgerApi = require('./ledger.js');

function fresh() {
  return ledgerApi.createLedger();
}

function lamports(ledger, id) {
  return ledger.accounts[id].lamports;
}

test('32 zero bytes are the system program id, and one lamport is one-billionth of a SOL', () => {
  assert.equal(ledgerApi.encodeBase58(new Uint8Array(32)), '11111111111111111111111111111111');
  assert.equal(ledgerApi.IDS.system, '11111111111111111111111111111111');
  assert.equal(ledgerApi.IDS.token, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(ledgerApi.formatSol(1000000000), '1');
  assert.equal(ledgerApi.formatSol(5000), '0.000005');
  assert.equal(ledgerApi.formatSol(ledgerApi.ARTICLE_AMOUNT), '4.294967195');
  assert.equal(ledgerApi.formatLamports(5000), '5,000');
});

test('a larger account owes a higher rent-exemption floor', () => {
  assert.ok(ledgerApi.exemptionFloor(41) > ledgerApi.exemptionFloor(0));
  assert.equal(ledgerApi.exemptionFloor(0), (0 + 128) * 3480 * 2);
});

test('Neodyme’s u32 example wraps 2^32-100 plus 1,000 to 899', () => {
  assert.equal(ledgerApi.addU32(ledgerApi.ARTICLE_AMOUNT, ledgerApi.TOKEN_FEE), ledgerApi.ARTICLE_WRAPPED);
  assert.equal(ledgerApi.ARTICLE_WRAPPED, 899);
  assert.equal(ledgerApi.checkedAddU32(ledgerApi.ARTICLE_AMOUNT, ledgerApi.TOKEN_FEE), null);
  assert.equal(ledgerApi.checkedAddU32(100, 1000), 1100);
  const user = ledgerApi.encodeUser(new Uint8Array(32).fill(0x11), 0);
  for (let i = 0; i < 8; i += 1) user[33 + i] = 0x11;
  const misread = ledgerApi.misreadUserAsConfig(user);
  assert.equal(misread.fee, 0x11111111);
  assert.equal(misread.userCount, 0x11111111);
  assert.equal(ledgerApi.unpackConfig(user, true).error, 'InvalidAccountType');
});

test('a ledger is a key/value map of memory regions', () => {
  const ledger = fresh();
  const vault = ledger.accounts[ledgerApi.IDS.vault];
  const till = ledger.accounts[ledgerApi.IDS.till];
  assert.equal(vault.owner, ledgerApi.IDS.till);
  assert.equal(vault.executable, false);
  assert.equal(till.executable, true);
  assert.equal(till.owner, ledgerApi.IDS.loader);
  assert.equal(ledger.accounts[ledgerApi.IDS.honest].owner, ledgerApi.IDS.system);
  assert.equal(ledger.accounts[ledgerApi.IDS.system].owner, ledgerApi.IDS.native);
  assert.match(ledgerApi.describeData(ledger, vault).line, /vault/);
  assert.match(ledgerApi.describeData(ledger, ledger.accounts[ledgerApi.IDS.config]).line, /Admin wallet/);
});

test('deposit moves lamports through the system program and records the balance', () => {
  const before = fresh();
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('deposit'), ledgerApi.defaultChecks());
  assert.equal(result.ok, true);
  assert.equal(lamports(before, ledgerApi.IDS.vault), lamports(fresh(), ledgerApi.IDS.vault));
  assert.equal(
    lamports(result.ledger, ledgerApi.IDS.vault) - lamports(before, ledgerApi.IDS.vault),
    100000000,
  );
  assert.equal(
    lamports(result.ledger, ledgerApi.IDS.honest),
    lamports(before, ledgerApi.IDS.honest) - 100000000 - ledgerApi.FEE_LAMPORTS,
  );
  assert.match(ledgerApi.describeData(result.ledger, result.ledger.accounts[ledgerApi.IDS.honestUser]).line, /1,100,000,000/);
});

test('a missing signature never reaches the program and does not take the fee', () => {
  const before = fresh();
  const tx = ledgerApi.buildScenario('deposit');
  tx.signatures = [];
  const result = ledgerApi.execute(before, tx, ledgerApi.defaultChecks());
  assert.equal(result.ok, false);
  assert.equal(result.error, 'MissingSignature');
  assert.equal(result.fee, 0);
  assert.equal(lamports(result.ledger, ledgerApi.IDS.honest), lamports(before, ledgerApi.IDS.honest));
});

test('the system program cannot debit an account it does not own', () => {
  const tx = ledgerApi.buildScenario('deposit');
  const from = tx.instructions[0].accounts.find(function (row) { return row.role === 'from'; });
  from.address = ledgerApi.IDS.vault;
  from.isSigner = true;
  tx.signatures.push(ledgerApi.IDS.vault);
  const result = ledgerApi.execute(fresh(), tx, ledgerApi.defaultChecks());
  assert.equal(result.ok, false);
  assert.equal(result.error, 'OwnerDebitForbidden');
  assert.equal(result.fee, ledgerApi.FEE_LAMPORTS);
});

test('a failed program keeps the fee and rolls the rest back', () => {
  const before = fresh();
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('attack-signer'), ledgerApi.defaultChecks());
  assert.equal(result.ok, false);
  assert.equal(result.error, 'MissingSigner');
  assert.equal(lamports(result.ledger, ledgerApi.IDS.attacker), lamports(before, ledgerApi.IDS.attacker) - 5000);
  assert.equal(lamports(result.ledger, ledgerApi.IDS.vault), lamports(before, ledgerApi.IDS.vault));
  assert.match(ledgerApi.describeData(result.ledger, result.ledger.accounts[ledgerApi.IDS.config]).line, /Admin wallet/);
});

test('with the signer check off, the attacker becomes admin and 1 SOL leaves the vault', () => {
  const before = fresh();
  const checks = ledgerApi.defaultChecks();
  checks.signer = false;
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('attack-signer'), checks);
  assert.equal(result.ok, true, result.why);
  assert.equal(lamports(before, ledgerApi.IDS.vault) - lamports(result.ledger, ledgerApi.IDS.vault), ledgerApi.RESTRICTED_AMOUNT);
  assert.equal(
    lamports(result.ledger, ledgerApi.IDS.attacker),
    lamports(before, ledgerApi.IDS.attacker) + ledgerApi.RESTRICTED_AMOUNT - 5000,
  );
  assert.match(ledgerApi.describeData(result.ledger, result.ledger.accounts[ledgerApi.IDS.config]).line, /Attacker wallet/);
});

test('a fake config drains the vault only when the owner check is off', () => {
  const blocked = ledgerApi.execute(fresh(), ledgerApi.buildScenario('attack-owner'), ledgerApi.defaultChecks());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'InvalidConfigAccount');

  const checks = ledgerApi.defaultChecks();
  checks.owner = false;
  const before = fresh();
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('attack-owner'), checks);
  assert.equal(result.ok, true, result.why);
  assert.equal(lamports(before, ledgerApi.IDS.vault) - lamports(result.ledger, ledgerApi.IDS.vault), ledgerApi.RESTRICTED_AMOUNT);
  assert.equal(result.ledger.accounts[ledgerApi.IDS.fakeConfig].owner, ledgerApi.IDS.system);
});

test('a user account passes the owner check and fails the type check', () => {
  const blocked = ledgerApi.execute(fresh(), ledgerApi.buildScenario('attack-confusion'), ledgerApi.defaultChecks());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'InvalidAccountType');

  const checks = ledgerApi.defaultChecks();
  checks.type = false;
  const before = fresh();
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('attack-confusion'), checks);
  assert.equal(result.ok, true, result.why);
  assert.equal(lamports(before, ledgerApi.IDS.vault) - lamports(result.ledger, ledgerApi.IDS.vault), ledgerApi.RESTRICTED_AMOUNT);
});

test('checked math rejects the wrapped withdraw, and wrapping math pays it', () => {
  const blocked = ledgerApi.execute(fresh(), ledgerApi.buildScenario('attack-overflow'), ledgerApi.defaultChecks());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'InvalidArgument');

  const checks = ledgerApi.defaultChecks();
  checks.math = false;
  const before = fresh();
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('attack-overflow'), checks);
  assert.equal(result.ok, true, result.why);
  assert.equal(lamports(before, ledgerApi.IDS.vault) - lamports(result.ledger, ledgerApi.IDS.vault), ledgerApi.ARTICLE_AMOUNT);
  assert.match(
    ledgerApi.describeData(result.ledger, result.ledger.accounts[ledgerApi.IDS.attackerUser]).line,
    /100,000/,
  );
});

test('a fake token program drains the vault only when the program id is not checked', () => {
  const blocked = ledgerApi.execute(fresh(), ledgerApi.buildScenario('attack-cpi'), ledgerApi.defaultChecks());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'InvalidTokenProgram');

  const checks = ledgerApi.defaultChecks();
  checks.programId = false;
  const before = fresh();
  const result = ledgerApi.execute(before, ledgerApi.buildScenario('attack-cpi'), checks);
  assert.equal(result.ok, true, result.why);
  const floor = ledgerApi.exemptionFloor(before.accounts[ledgerApi.IDS.vault].data.length);
  assert.equal(lamports(result.ledger, ledgerApi.IDS.vault), floor);

  const honest = ledgerApi.buildScenario('attack-cpi');
  honest.instructions[0].accounts.find(function (row) { return row.role === 'tokenProgram'; }).address = ledgerApi.IDS.token;
  const paid = ledgerApi.execute(fresh(), honest, ledgerApi.defaultChecks());
  assert.equal(paid.ok, true, paid.why);
  assert.equal(lamports(fresh(), ledgerApi.IDS.vault) - lamports(paid.ledger, ledgerApi.IDS.vault), ledgerApi.SPL_AMOUNT);
});

test('an honest withdraw and set-admin succeed while the checks stay on', () => {
  const withdrawn = ledgerApi.execute(fresh(), ledgerApi.buildScenario('withdraw'), ledgerApi.defaultChecks());
  assert.equal(withdrawn.ok, true, withdrawn.why);
  const appointed = ledgerApi.execute(fresh(), ledgerApi.buildScenario('set-admin'), ledgerApi.defaultChecks());
  assert.equal(appointed.ok, true, appointed.why);
  assert.match(ledgerApi.describeData(appointed.ledger, appointed.ledger.accounts[ledgerApi.IDS.config]).line, /Successor wallet/);
});

test('Till cannot rewrite a system-owned account even with every check off', () => {
  const tx = ledgerApi.buildScenario('set-admin');
  tx.instructions[0].accounts.find(function (row) { return row.role === 'config'; }).address = ledgerApi.IDS.fakeConfig;
  tx.feePayer = ledgerApi.IDS.attacker;
  tx.signatures = [ledgerApi.IDS.attacker];
  tx.instructions[0].accounts.find(function (row) { return row.role === 'admin'; }).address = ledgerApi.IDS.attacker;
  tx.instructions[0].accounts.find(function (row) { return row.role === 'admin'; }).isSigner = true;
  const checks = {signer: false, owner: false, type: false, math: false, programId: false};
  const before = fresh();
  const result = ledgerApi.execute(before, tx, checks);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'OwnerDebitForbidden');
  assert.equal(
    ledgerApi.hex(result.ledger.accounts[ledgerApi.IDS.fakeConfig].data),
    ledgerApi.hex(before.accounts[ledgerApi.IDS.fakeConfig].data),
  );
});
