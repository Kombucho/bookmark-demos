const test = require('node:test');
const assert = require('node:assert/strict');
const gotchas = require('./gotchas.js');

test('two seed arrays concatenate to one PDA, and a hash splits them', () => {
  assert.equal(gotchas.VICTIM_KEY.length, 32);
  assert.equal(gotchas.ATTACKER_NAME.length, 27);
  const product = gotchas.derive(gotchas.productSeeds(), false);
  const bid = gotchas.derive(gotchas.bidSeeds(), false);
  assert.equal(gotchas.ascii(product.bytes), 'productyoushouldbuythisproductfast');
  assert.equal(gotchas.ascii(bid.bytes), gotchas.ascii(product.bytes));
  assert.equal(product.address, bid.address);
  assert.equal(gotchas.hex(gotchas.bytesOf(gotchas.VICTIM_KEY)).indexOf('6f64756374'), 0);

  const fixedProduct = gotchas.derive(gotchas.productSeeds(), true);
  const fixedBid = gotchas.derive(gotchas.bidSeeds(), true);
  assert.notEqual(fixedProduct.address, fixedBid.address);
  assert.notEqual(fixedProduct.bytes.length, product.bytes.length);
  assert.equal(fixedProduct.bytes.length, 7 + 32);
  assert.equal(fixedBid.bytes.length, 64);
});

test('the attacker product occupies the bid PDA until variable seeds are hashed', () => {
  let state = gotchas.createSeeds();
  const created = gotchas.createProduct(state);
  assert.equal(created.ok, true);
  state = created.state;
  const blocked = gotchas.placeBid(state);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'AccountInUse');
  assert.equal(blocked.holder.kind, 'product');
  assert.equal(gotchas.seedView(state).same, true);
  assert.equal(gotchas.hasKind(state, 'bid'), false);

  const reversed = gotchas.createSeeds();
  const bidFirst = gotchas.placeBid(reversed);
  assert.equal(gotchas.createProduct(bidFirst.state).code, 'AccountInUse');

  let fixed = gotchas.setSeedFix(gotchas.createSeeds(), true);
  fixed = gotchas.createProduct(fixed).state;
  const bid = gotchas.placeBid(fixed);
  assert.equal(bid.ok, true);
  assert.notEqual(gotchas.seedView(fixed).product.address, bid.address);
  assert.equal(gotchas.seedView(bid.state).same, false);
});

test('turning the fix on after the product exists lets the bid use a new address', () => {
  let state = gotchas.createProduct(gotchas.createSeeds()).state;
  const blocked = gotchas.seedView(state).bid.address;
  state = gotchas.setSeedFix(state, true);
  const bid = gotchas.placeBid(state);
  assert.equal(bid.ok, true);
  assert.notEqual(bid.address, blocked);
  assert.equal(state.accounts[blocked].kind, 'product');
});

test('remaining accounts pay whoever is passed until a check is on', () => {
  let open = gotchas.createVault();
  assert.equal(open.selected, 'attacker');
  assert.deepEqual(open.checks, {owner: false, type: false, address: false});
  const drained = gotchas.cashOut(open);
  assert.equal(drained.code, 'Drained');
  assert.equal(drained.state.vault, 0);
  assert.equal(drained.state.attacker, gotchas.VAULT_START);
  assert.equal(drained.state.winner, 0);
  assert.equal(gotchas.cashOut(drained.state).code, 'Done');

  ['owner', 'type', 'address'].forEach(function (key) {
    let guarded = gotchas.setCheck(gotchas.createVault(), key, true);
    const stopped = gotchas.cashOut(guarded);
    assert.equal(stopped.ok, false);
    assert.equal(stopped.state.vault, gotchas.VAULT_START);
    assert.equal(stopped.state.attacker, 0);
  });

  let winner = gotchas.selectAccount(gotchas.createVault(), 'winner');
  winner = gotchas.setCheck(winner, 'owner', true);
  winner = gotchas.setCheck(winner, 'type', true);
  winner = gotchas.setCheck(winner, 'address', true);
  const paid = gotchas.cashOut(winner);
  assert.equal(paid.code, 'Paid');
  assert.equal(paid.state.vault, 0);
  assert.equal(paid.state.winner, gotchas.VAULT_START);
  assert.equal(paid.state.attacker, 0);
});

test('invoke_signed lets an unchecked program spend the pool PDA', () => {
  const open = gotchas.invoke(gotchas.createCpi());
  assert.equal(open.code, 'Drained');
  assert.equal(open.state.pool, 0);
  assert.equal(open.state.attacker, gotchas.POOL_START);

  let guarded = gotchas.setProgramCheck(gotchas.createCpi(), true);
  assert.equal(gotchas.invoke(guarded).code, 'ProgramId');
  assert.equal(gotchas.invoke(guarded).state.pool, gotchas.POOL_START);

  guarded = gotchas.selectProgram(guarded, 'trusted');
  const lent = gotchas.invoke(guarded);
  assert.equal(lent.code, 'Lent');
  assert.equal(lent.state.pool, gotchas.POOL_START);
  assert.equal(lent.state.attacker, 0);

  const trustedOpen = gotchas.invoke(gotchas.selectProgram(gotchas.createCpi(), 'trusted'));
  assert.equal(trustedOpen.code, 'Lent');
  assert.equal(trustedOpen.state.pool, gotchas.POOL_START);
});

test('mint supply stays on the old struct until reload', () => {
  const start = gotchas.createMint();
  assert.equal(start.chain, gotchas.SUPPLY_START);
  assert.equal(start.struct, start.chain);
  const stale = gotchas.mintTo(start);
  assert.equal(stale.code, 'Minted');
  assert.equal(stale.state.chain, gotchas.SUPPLY_START + gotchas.MINT_AMOUNT);
  assert.equal(stale.state.struct, gotchas.SUPPLY_START);
  assert.equal(gotchas.share(gotchas.MINT_AMOUNT, stale.state.struct), 0.25);
  assert.equal(gotchas.share(gotchas.MINT_AMOUNT, stale.state.chain), 0.2);

  const caught = gotchas.setReload(stale.state, true);
  assert.equal(caught.struct, caught.chain);
  assert.equal(gotchas.share(gotchas.MINT_AMOUNT, caught.struct), 0.2);
  const kept = gotchas.setReload(caught, false);
  assert.equal(kept.reload, false);
  assert.equal(kept.struct, caught.chain);

  let fresh = gotchas.setReload(gotchas.createMint(), true);
  fresh = gotchas.mintTo(fresh).state;
  assert.equal(fresh.struct, fresh.chain);
  assert.equal(gotchas.mintTo(fresh).code, 'Done');
});
