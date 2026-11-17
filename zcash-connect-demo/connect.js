// A simulated Zcash connect flow, in the shape of Cicero.
// Wallet names and the provider snippet follow @cicero-zcash/react.
// Addresses are fake. Nothing here opens a wallet or sends a request.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZcashConnect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WALLETS = [
    {
      id: 'noir',
      exportName: 'noirWallet',
      name: 'Noir Wallet',
      letter: 'N',
      color: '#171717',
      ink: '#ffffff',
      category: 'Extension',
      blurb: 'Self-custodial privacy extension',
    },
    {
      id: 'zelcore',
      exportName: 'zelcoreWallet',
      name: 'Zelcore Wallet',
      letter: 'Z',
      color: '#5b4b8a',
      ink: '#ffffff',
      category: 'Extension',
      blurb: 'Multi-asset extension',
    },
    {
      id: 'zucchini',
      exportName: 'zucchiniWallet',
      name: 'Zucchini Wallet',
      letter: 'Z',
      color: '#2f7d4a',
      ink: '#ffffff',
      category: 'Extension',
      blurb: 'In-browser extension, one click',
    },
    {
      id: 'zashi',
      exportName: 'zashiWallet',
      name: 'Zashi',
      letter: 'Z',
      color: '#1c1c1c',
      ink: '#f4c95d',
      category: 'Mobile',
      blurb: 'Mobile wallet by Electric Coin Co.',
    },
  ];

  const KINDS = [
    {
      id: 'unified',
      label: 'Unified',
      short: 'u1…',
      text: 'A unified address starts with u1. Under ZIP-316 one string can carry an Orchard receiver, a Sapling receiver, and a transparent receiver. A wallet that understands it prefers Orchard.',
    },
    {
      id: 'sapling',
      label: 'Sapling',
      short: 'zs1…',
      text: 'A Sapling address starts with zs1. The receiver, the amount, and the memo are shielded. A viewing key can read them without spending.',
    },
    {
      id: 'transparent',
      label: 'Transparent',
      short: 't-addr',
      text: 'A transparent address, a t-addr, starts with t1 or t3. The address and the amount are public. It does not take an encrypted memo.',
    },
  ];

  const ADDRESSES = {
    unified: 'u1orcharddemoreceiver' + 'notakey'.repeat(8),
    sapling: 'zs1saplingdemoreceiver' + 'notakey'.repeat(6),
    transparent: 't1transparentdemoreceiver' + 'notakey'.repeat(4),
  };

  const BALANCE = '12.40';
  const NETWORK = 'mainnet';

  function walletById(id) {
    for (let i = 0; i < WALLETS.length; i++) {
      if (WALLETS[i].id === id) return WALLETS[i];
    }
    return null;
  }

  function kindById(id) {
    for (let i = 0; i < KINDS.length; i++) {
      if (KINDS[i].id === id) return KINDS[i];
    }
    return null;
  }

  function getAddressType(address) {
    if (!address || typeof address !== 'string') return 'unknown';
    const clean = address.trim();
    if (clean.indexOf('u1') === 0 || clean.indexOf('utest1') === 0) return 'unified';
    if (clean.indexOf('zs1') === 0 || clean.indexOf('ztestsapling1') === 0) return 'sapling';
    if (clean.indexOf('t1') === 0 || clean.indexOf('t3') === 0 || clean.indexOf('tm') === 0) return 'transparent';
    return 'unknown';
  }

  function truncateAddress(address, start, end) {
    const head = start == null ? 8 : start;
    const tail = end == null ? 8 : end;
    if (!address) return '';
    const clean = String(address).trim();
    if (clean.length <= head + tail + 3) return clean;
    return clean.slice(0, head) + '...' + clean.slice(-tail);
  }

  function demoAddress(kind) {
    return ADDRESSES[kind] || '';
  }

  function initialState() {
    return { status: 'disconnected', walletId: null, addressKind: 'unified' };
  }

  function beginConnect(state, walletId) {
    const wallet = walletById(walletId);
    if (!wallet) {
      const error = new Error('Unknown wallet');
      error.code = 'unknown-wallet';
      throw error;
    }
    return {
      status: 'connecting',
      walletId: wallet.id,
      addressKind: state && state.addressKind ? state.addressKind : 'unified',
    };
  }

  function finishConnect(state) {
    if (!state || state.status !== 'connecting' || !walletById(state.walletId)) return state;
    return {
      status: 'connected',
      walletId: state.walletId,
      addressKind: state.addressKind,
    };
  }

  function setAddressKind(state, kind) {
    if (!kindById(kind)) return state;
    return {
      status: state.status,
      walletId: state.walletId,
      addressKind: kind,
    };
  }

  function disconnect(state) {
    return {
      status: 'disconnected',
      walletId: null,
      addressKind: state && state.addressKind ? state.addressKind : 'unified',
    };
  }

  function present(state) {
    const current = state || initialState();
    const wallet = walletById(current.walletId);
    const kind = kindById(current.addressKind) || KINDS[0];
    const connected = current.status === 'connected';
    const address = connected ? demoAddress(kind.id) : '';
    return {
      status: current.status,
      wallet: wallet,
      kind: kind,
      address: address,
      short: address ? truncateAddress(address, 6, 4) : '',
      type: address ? getAddressType(address) : 'unknown',
      balance: connected ? BALANCE : null,
      network: NETWORK,
      explanation: kind.text,
    };
  }

  function snippet() {
    return [
      "import {",
      "  CiceroProvider,",
      "  CiceroConnectButton,",
      "  useAccount,",
      "  noirWallet,",
      "  zelcoreWallet,",
      "  zucchiniWallet,",
      "  zashiWallet,",
      "} from '@cicero-zcash/react';",
      "",
      "const wallets = [noirWallet, zelcoreWallet, zucchiniWallet, zashiWallet];",
      "",
      "export function App() {",
      "  return (",
      "    <CiceroProvider",
      "      initialNetwork=\"mainnet\"",
      "      appName=\"Orchard desk\"",
      "      wallets={wallets}",
      "    >",
      "      <Header />",
      "    </CiceroProvider>",
      "  );",
      "}",
      "",
      "function Header() {",
      "  const { isConnected, wallet, disconnect } = useAccount();",
      "  return (",
      "    <header>",
      "      <span>{isConnected ? wallet?.name : 'Orchard desk'}</span>",
      "      <CiceroConnectButton variant=\"primary\" size=\"md\" />",
      "      {isConnected ? (",
      "        <button type=\"button\" onClick={() => disconnect()}>",
      "          Disconnect",
      "        </button>",
      "      ) : null}",
      "    </header>",
      "  );",
      "}",
    ].join('\n');
  }

  return {
    WALLETS: WALLETS,
    KINDS: KINDS,
    ADDRESSES: ADDRESSES,
    BALANCE: BALANCE,
    NETWORK: NETWORK,
    walletById: walletById,
    getAddressType: getAddressType,
    truncateAddress: truncateAddress,
    demoAddress: demoAddress,
    initialState: initialState,
    beginConnect: beginConnect,
    finishConnect: finishConnect,
    setAddressKind: setAddressKind,
    disconnect: disconnect,
    present: present,
    snippet: snippet,
  };
});
