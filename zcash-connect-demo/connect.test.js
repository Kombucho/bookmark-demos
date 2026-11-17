const test = require('node:test');
const assert = require('node:assert/strict');
const connect = require('./connect.js');

test('the modal lists the four wallets from the post, in that order', () => {
  assert.deepEqual(connect.WALLETS.map((wallet) => wallet.id), [
    'noir', 'zelcore', 'zucchini', 'zashi',
  ]);
  assert.deepEqual(connect.WALLETS.map((wallet) => wallet.letter), ['N', 'Z', 'Z', 'Z']);
  assert.equal(new Set(connect.WALLETS.map((wallet) => wallet.color)).size, 4);
  for (const wallet of connect.WALLETS) {
    assert.equal(wallet.name.toLowerCase().includes('logo'), false);
    assert.ok(wallet.blurb.length > 0);
  }
});

test('address prefixes follow getAddressType, and the chip shortens a u1 string', () => {
  assert.equal(connect.getAddressType('u1orchard'), 'unified');
  assert.equal(connect.getAddressType('utest1orchard'), 'unified');
  assert.equal(connect.getAddressType('zs1sapling'), 'sapling');
  assert.equal(connect.getAddressType('ztestsapling1demo'), 'sapling');
  assert.equal(connect.getAddressType('t1demo'), 'transparent');
  assert.equal(connect.getAddressType('t3demo'), 'transparent');
  assert.equal(connect.getAddressType('tmtest'), 'transparent');
  assert.equal(connect.getAddressType(''), 'unknown');
  assert.equal(connect.getAddressType('not-an-address'), 'unknown');
  assert.equal(connect.truncateAddress('u1abcdef987654', 6, 4), 'u1abcd...7654');
  assert.equal(connect.truncateAddress('t1short', 6, 4), 't1short');

  for (const kind of connect.KINDS) {
    const address = connect.demoAddress(kind.id);
    assert.equal(connect.getAddressType(address), kind.id);
    assert.ok(address.includes('demo'));
    assert.ok(address.includes('notakey'));
    assert.equal(address.includes('t1Vpw'), false);
  }
});

test('connect, switch the receiver, and disconnect without leaving the page', () => {
  let state = connect.initialState();
  assert.equal(connect.present(state).status, 'disconnected');
  assert.equal(connect.present(state).short, '');

  assert.throws(() => connect.beginConnect(state, 'ywallet'), { code: 'unknown-wallet' });
  assert.equal(connect.finishConnect(state).status, 'disconnected');

  state = connect.beginConnect(state, 'noir');
  assert.equal(state.status, 'connecting');
  assert.equal(connect.present(state).wallet.name, 'Noir Wallet');
  assert.equal(connect.present(state).address, '');

  state = connect.finishConnect(state);
  const view = connect.present(state);
  assert.equal(view.status, 'connected');
  assert.equal(view.type, 'unified');
  assert.equal(view.short.startsWith('u1'), true);
  assert.ok(view.short.includes('...'));
  assert.equal(view.balance, '12.40');
  assert.equal(view.network, 'mainnet');
  assert.match(view.explanation, /Orchard/);

  state = connect.setAddressKind(state, 'sapling');
  const shielded = connect.present(state);
  assert.equal(shielded.type, 'sapling');
  assert.equal(shielded.short.startsWith('zs1'), true);
  assert.match(shielded.explanation, /viewing key/);

  state = connect.setAddressKind(state, 'transparent');
  const clear = connect.present(state);
  assert.equal(clear.type, 'transparent');
  assert.equal(clear.short.startsWith('t1'), true);
  assert.match(clear.explanation, /public/);
  assert.equal(connect.setAddressKind(state, 'orchard').addressKind, 'transparent');

  state = connect.disconnect(state);
  assert.equal(state.status, 'disconnected');
  assert.equal(state.walletId, null);
  assert.equal(state.addressKind, 'transparent');
  assert.equal(connect.present(state).address, '');
});

test('the snippet names the provider and the four wallet exports', () => {
  const code = connect.snippet();
  assert.match(code, /CiceroProvider/);
  assert.match(code, /CiceroConnectButton/);
  assert.match(code, /useAccount/);
  assert.match(code, /noirWallet/);
  assert.match(code, /zelcoreWallet/);
  assert.match(code, /zucchiniWallet/);
  assert.match(code, /zashiWallet/);
  assert.match(code, /initialNetwork="mainnet"/);
  assert.equal(code.includes('http://'), false);
  assert.equal(code.includes('https://'), false);
  assert.equal(code.includes('fetch('), false);
});
