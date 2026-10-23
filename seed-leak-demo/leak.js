// A toy wallet, a log pipeline, and an attacker who sweeps phrases they can read.
// Lantern is not Slope. Every phrase and balance is fictional.
// The switches follow what was reported: a message filter that misses another
// field, a mnemonic that did not have to be logged, plaintext at rest after TLS,
// and a store somebody might be able to read.
// Nothing onchain is contacted. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SeedLeak = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const UNIT = 'glass';
  const HOST = 'log.lantern.invalid';

  const PHRASES = {
    moth: ['toy-moth', 'toy-glass', 'toy-pine', 'toy-keel', 'toy-salt', 'toy-wren', 'toy-ink', 'toy-bay', 'toy-fig', 'toy-elm', 'toy-rue', 'toy-yew'],
    pebble: ['toy-pebble', 'toy-glass', 'toy-reed', 'toy-dock', 'toy-lime', 'toy-nave', 'toy-orb', 'toy-coin', 'toy-ash', 'toy-fir', 'toy-dew', 'toy-ivy'],
    harbor: ['toy-harbor', 'toy-cold', 'toy-iron', 'toy-lock', 'toy-vault', 'toy-quiet', 'toy-north', 'toy-stone', 'toy-key', 'toy-safe', 'toy-deep', 'toy-hold'],
    quill: ['toy-quill', 'toy-page', 'toy-ink', 'toy-left', 'toy-alone', 'toy-never', 'toy-here', 'toy-other', 'toy-room', 'toy-kept', 'toy-out', 'toy-safe'],
  };

  const WALLETS = [
    {
      id: 'moth',
      name: 'Moth',
      phraseKey: 'moth',
      balance: 40,
      emits: true,
      action: 'create',
      home: 'Created in Lantern, this toy wallet.',
    },
    {
      id: 'pebble',
      name: 'Pebble',
      phraseKey: 'pebble',
      balance: 25,
      emits: true,
      action: 'import',
      home: 'The phrase was made elsewhere, then imported into Lantern.',
    },
    {
      id: 'kindling',
      name: 'Kindling',
      phraseKey: 'pebble',
      balance: 18,
      emits: false,
      action: '',
      home: 'The same phrase as Pebble, opened only in a second toy wallet. Kindling never runs Lantern.',
    },
    {
      id: 'harbor',
      name: 'Harbor',
      phraseKey: 'harbor',
      balance: 30,
      emits: false,
      action: '',
      home: 'A hardware wallet. The phrase is never typed into Lantern.',
    },
    {
      id: 'quill',
      name: 'Quill',
      phraseKey: 'quill',
      balance: 12,
      emits: false,
      action: '',
      home: 'Created somewhere else. The phrase is never imported into Lantern.',
    },
  ];

  function phraseText(key) {
    return PHRASES[key].join(' ');
  }

  function toySeal(text) {
    let n = 2166136261;
    let i;
    for (i = 0; i < text.length; i += 1) {
      n ^= text.charCodeAt(i);
      n = Math.imul(n, 16777619);
    }
    return 'seal:' + (n >>> 0).toString(16);
  }

  function walletById(id) {
    let i;
    for (i = 0; i < WALLETS.length; i += 1) {
      if (WALLETS[i].id === id) return WALLETS[i];
    }
    return null;
  }

  function flagsOf(input) {
    const src = input || {};
    return {
      omitMnemonic: !!src.omitMnemonic,
      redactAll: !!src.redactAll,
      encryptAtRest: !!src.encryptAtRest,
      restrictAccess: !!src.restrictAccess,
    };
  }

  function compose(wallet, flags) {
    const text = phraseText(wallet.phraseKey);
    if (flags.omitMnemonic) {
      return {
        walletId: wallet.id,
        name: wallet.name,
        action: wallet.action,
        category: 'navigation',
        message: 'opened ' + wallet.name,
        arguments: null,
        phraseIncluded: false,
        phraseKey: null,
      };
    }
    const redacted = flags.redactAll;
    return {
      walletId: wallet.id,
      name: wallet.name,
      action: wallet.action,
      category: 'navigation',
      message: '[redacted]',
      arguments: redacted ? '[redacted]' : text,
      phraseIncluded: !redacted,
      phraseKey: redacted ? null : wallet.phraseKey,
    };
  }

  function storeOf(event, flags) {
    if (!event.phraseIncluded) {
      return {
        walletId: event.walletId,
        name: event.name,
        action: event.action,
        message: event.message,
        arguments: event.arguments,
        stored: 'redacted',
        body: event.arguments == null ? event.message : event.arguments,
        readable: false,
        phraseKey: null,
      };
    }
    if (flags.encryptAtRest) {
      return {
        walletId: event.walletId,
        name: event.name,
        action: event.action,
        message: event.message,
        arguments: event.arguments,
        stored: 'ciphertext',
        body: toySeal(event.arguments),
        readable: false,
        phraseKey: null,
      };
    }
    return {
      walletId: event.walletId,
      name: event.name,
      action: event.action,
      message: event.message,
      arguments: event.arguments,
      stored: 'plaintext',
      body: event.arguments,
      readable: true,
      phraseKey: event.phraseKey,
    };
  }

  function openedIds(opened) {
    const source = opened == null ? ['moth', 'pebble'] : opened;
    const out = [];
    let i;
    for (i = 0; i < source.length; i += 1) {
      const wallet = walletById(source[i]);
      if (!wallet || !wallet.emits) continue;
      if (out.indexOf(wallet.id) === -1) out.push(wallet.id);
    }
    return out;
  }

  function walletView(wallet, drained) {
    return {
      id: wallet.id,
      name: wallet.name,
      phraseKey: wallet.phraseKey,
      phrase: phraseText(wallet.phraseKey),
      balance: drained ? 0 : wallet.balance,
      openedBalance: wallet.balance,
      taken: drained ? wallet.balance : 0,
      drained: drained,
      emits: wallet.emits,
      action: wallet.action,
      home: wallet.home,
      shares: wallet.phraseKey,
    };
  }

  function applyDrain(phrases, swept) {
    const held = {};
    let i;
    for (i = 0; i < phrases.length; i += 1) held[phrases[i]] = true;
    return WALLETS.map(function (wallet) {
      const drained = swept && !!held[wallet.phraseKey];
      return walletView(wallet, drained);
    });
  }

  function filterText(event, flags) {
    if (flags.omitMnemonic) {
      return 'The mnemonic was never put in the event. The log line is only that ' + event.name + ' opened.';
    }
    if (flags.redactAll) {
      return 'The message field is [redacted], and the arguments are [redacted] too. The phrase does not leave the phone.';
    }
    return 'The message field is [redacted]. The navigation arguments still carry the phrase. A filter on one field missed the other.';
  }

  function diskText(record) {
    if (record.stored === 'plaintext') return 'Stored in the clear on ' + HOST + '. TLS already ended at the server.';
    if (record.stored === 'ciphertext') return 'Stored as a toy seal. This attacker has no key for it. The seal is not a cipher from the incident reports.';
    return 'The stored event has no phrase.';
  }

  function simulate(input, opened) {
    const flags = flagsOf(input);
    const ids = openedIds(opened);
    const events = ids.map(function (id) { return compose(walletById(id), flags); });
    const disk = events.map(function (event) { return storeOf(event, flags); });
    const steps = [];

    let i;
    for (i = 0; i < events.length; i += 1) {
      const event = events[i];
      const record = disk[i];
      steps.push({
        stage: 'phone',
        walletId: event.walletId,
        title: event.action === 'import' ? 'Import ' + event.name : 'Create ' + event.name,
        text: event.action === 'import'
          ? event.name + ' types an existing phrase into Lantern.'
          : event.name + ' is created inside Lantern. The phrase exists only here.',
      });
      steps.push({
        stage: 'filter',
        walletId: event.walletId,
        title: 'Filter',
        text: filterText(event, flags),
        message: event.message,
        arguments: event.arguments,
      });
      steps.push({
        stage: 'tls',
        walletId: event.walletId,
        title: 'TLS',
        text: 'The body is sent with TLS to ' + HOST + '. The server unwraps TLS and can read whatever the filter allowed. TLS does not hide that body from the log store.',
      });
      steps.push({
        stage: 'disk',
        walletId: event.walletId,
        title: 'Log store',
        text: diskText(record),
        record: record,
      });
    }

    const readable = [];
    for (i = 0; i < disk.length; i += 1) {
      if (disk[i].readable) readable.push(disk[i].phraseKey);
    }
    const access = flags.restrictAccess ? 'denied' : 'read';
    const phrases = access === 'denied' ? [] : readable.slice();
    let readerText;
    if (access === 'denied' && readable.length) {
      readerText = 'The store is locked. The attacker reads nothing. A phrase is still sitting on the server in the clear.';
    } else if (access === 'denied') {
      readerText = 'The store is locked. The attacker reads nothing.';
    } else if (phrases.length) {
      readerText = 'The store is open. The attacker reads ' + phrases.length + (phrases.length === 1 ? ' phrase.' : ' phrases.');
    } else {
      readerText = 'The store is open. The attacker finds no phrase.';
    }
    steps.push({
      stage: 'reader',
      walletId: null,
      title: 'Who can read',
      text: readerText,
      access: access,
      phrases: phrases.slice(),
    });

    const sweptWallets = applyDrain(phrases, true);
    const drainedIds = sweptWallets.filter(function (wallet) { return wallet.drained; }).map(function (wallet) { return wallet.id; });
    steps.push({
      stage: 'sweep',
      walletId: null,
      title: 'Sweep',
      text: drainedIds.length
        ? 'Every toy wallet whose phrase was readable is drained, including one that reused a phrase and never opened Lantern. Phrases that never entered Lantern stay put.'
        : 'The attacker has no phrase, so no toy wallet moves. A phrase that never entered Lantern was never on this path.',
      drainedIds: drainedIds,
    });

    const wallets = applyDrain(phrases, true);
    let taken = 0;
    for (i = 0; i < wallets.length; i += 1) taken += wallets[i].taken;

    return {
      flags: flags,
      host: HOST,
      unit: UNIT,
      opened: ids,
      events: events,
      disk: disk,
      access: access,
      phrases: phrases,
      plaintextAtRest: readable.length > 0,
      wallets: wallets,
      drainedIds: drainedIds,
      taken: taken,
      steps: steps,
    };
  }

  function frame(result, count) {
    const n = Math.max(0, Math.min(count == null ? result.steps.length : count, result.steps.length));
    const steps = result.steps.slice(0, n);
    const disk = [];
    let access = null;
    let swept = false;
    let drainedIds = [];
    let i;
    for (i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (step.stage === 'disk') disk.push(step.record);
      if (step.stage === 'reader') access = step.access;
      if (step.stage === 'sweep') {
        swept = true;
        drainedIds = step.drainedIds.slice();
      }
    }
    const phrases = [];
    if (access === 'read') {
      for (i = 0; i < disk.length; i += 1) {
        if (disk[i].readable) phrases.push(disk[i].phraseKey);
      }
    }
    const wallets = applyDrain(phrases, swept);
    let taken = 0;
    for (i = 0; i < wallets.length; i += 1) taken += wallets[i].taken;
    return {
      steps: steps,
      disk: disk,
      access: access,
      phrases: phrases,
      swept: swept,
      drainedIds: swept ? drainedIds : [],
      wallets: wallets,
      taken: taken,
      done: n === result.steps.length,
      index: n,
    };
  }

  return {
    UNIT: UNIT,
    HOST: HOST,
    PHRASES: PHRASES,
    WALLETS: WALLETS,
    phraseText: phraseText,
    toySeal: toySeal,
    simulate: simulate,
    frame: frame,
  };
});
