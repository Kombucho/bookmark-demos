// A schematic Orchard Action on a depth-4 note-commitment tree.
// SHA-256 stands in for Sinsemilla and for Poseidon. It is not consensus crypto.
// Uncommitted leaves are the value 2, the readable stand-in for Uncommitted^Orchard.
// Nothing here touches the DOM, the network, or a proving system.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrchardAction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEPTH = 4;
  const LEAF_COUNT = 16;
  const UNCOMMITTED = '2';
  const SELF = 'ivk';
  const OTHER = 'other';
  const MAX_AMOUNT = 1000000;
  const MAX_MEMO = 48;

  const SEEDS = [
    {owner: SELF, amount: 8, memo: 'grove', rcm: 'rcm-seed-0', rho: 'rho-seed-0'},
    {owner: SELF, amount: 5, memo: 'kiln', rcm: 'rcm-seed-1', rho: 'rho-seed-1'},
    {owner: OTHER, amount: 3, memo: 'sealed', rcm: 'rcm-seed-2', rho: 'rho-seed-2'},
  ];

  function hexOf(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += bytes[i].toString(16).padStart(2, '0');
    return text;
  }

  function bytesOf(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(buf);
  }

  async function digestHex(parts) {
    return hexOf(await sha256(parts.join('|')));
  }

  async function cmxOf(note) {
    return digestHex(['cmx', 'sinsemilla-stand-in', note.owner, note.amount, note.memo, note.rcm, note.rho]);
  }

  async function nfOf(note) {
    return digestHex(['nf', 'poseidon-stand-in', note.owner, note.rho, note.cmx]);
  }

  async function layersOf(leaves) {
    const layers = new Array(DEPTH + 1);
    layers[DEPTH] = leaves.slice();
    for (let parent = DEPTH - 1; parent >= 0; parent--) {
      const kids = layers[parent + 1];
      const row = new Array(kids.length / 2);
      for (let i = 0; i < row.length; i++) {
        row[i] = await digestHex([
          'MerkleCRH', 'sinsemilla-stand-in', parent, kids[i * 2], kids[i * 2 + 1],
        ]);
      }
      layers[parent] = row;
    }
    return layers;
  }

  function authSteps(layers, index) {
    const steps = [];
    let i = index;
    for (let layer = DEPTH; layer > 0; layer--) {
      const sibling = i ^ 1;
      steps.push({
        layer: layer,
        index: i,
        sibling: sibling,
        side: (i & 1) === 0 ? 'L' : 'R',
        siblingValue: layers[layer][sibling],
      });
      i >>= 1;
    }
    return steps;
  }

  function finish(leaves, next, layers) {
    const latest = next > 0 ? next - 1 : 0;
    return {
      leaves: leaves,
      next: next,
      layers: layers,
      anchor: layers[0][0],
      path: next > 0 ? authSteps(layers, latest) : [],
    };
  }

  async function seed() {
    const leaves = new Array(LEAF_COUNT);
    for (let i = 0; i < LEAF_COUNT; i++) leaves[i] = UNCOMMITTED;
    const notes = [];
    for (let i = 0; i < SEEDS.length; i++) {
      const spec = SEEDS[i];
      const cmx = await cmxOf(spec);
      leaves[i] = cmx;
      if (spec.owner === SELF) {
        const nf = await nfOf({
          owner: spec.owner,
          rho: spec.rho,
          cmx: cmx,
        });
        notes.push({
          position: i,
          owner: spec.owner,
          amount: spec.amount,
          memo: spec.memo,
          rcm: spec.rcm,
          rho: spec.rho,
          cmx: cmx,
          nf: nf,
        });
      }
    }
    const tree = finish(leaves, SEEDS.length, await layersOf(leaves));
    return {
      depth: DEPTH,
      leaves: tree.leaves,
      next: tree.next,
      layers: tree.layers,
      anchor: tree.anchor,
      path: tree.path,
      nullifiers: [],
      actions: [],
      notes: notes,
      seq: 0,
    };
  }

  function parseAmount(value) {
    const text = String(value == null ? '' : value).trim();
    if (!/^(0|[1-9]\d*)$/.test(text)) return {error: 'Amount is a whole number from 0.'};
    const amount = Number(text);
    if (amount > MAX_AMOUNT) return {error: 'Amount is at most ' + MAX_AMOUNT + '.'};
    return {value: amount};
  }

  function parseMemo(value) {
    const text = String(value == null ? '' : value);
    if (text.length > MAX_MEMO) return {error: 'Memo is at most ' + MAX_MEMO + ' characters.'};
    return {value: text};
  }

  function fail(state, reason) {
    return {ok: false, reason: reason, detail: '', state: state};
  }

  function encodePlain(amount, memo) {
    return 'v1|' + amount + '|' + memo.length + '|' + memo;
  }

  async function keystream(ivk, rho, length) {
    const out = new Uint8Array(length);
    let filled = 0;
    let n = 0;
    while (filled < length) {
      const block = await sha256(['mask', ivk, rho, n].join('|'));
      for (let i = 0; i < block.length && filled < length; i++) out[filled++] = block[i];
      n += 1;
    }
    return out;
  }

  async function seal(ivk, rho, amount, memo) {
    const plain = new TextEncoder().encode(encodePlain(amount, memo));
    const mask = await keystream(ivk, rho, plain.length);
    const out = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i++) out[i] = plain[i] ^ mask[i];
    return hexOf(out);
  }

  async function openSeal(ivk, rho, sealed) {
    if (typeof sealed !== 'string' || sealed.length % 2 !== 0 || !/^[0-9a-f]*$/.test(sealed)) return null;
    const raw = bytesOf(sealed);
    const mask = await keystream(ivk, rho, raw.length);
    const plain = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) plain[i] = raw[i] ^ mask[i];
    const text = new TextDecoder().decode(plain);
    const match = /^v1\|(\d+)\|(\d+)\|([\s\S]*)$/.exec(text);
    if (!match) return null;
    const amount = Number(match[1]);
    const memo = match[3];
    if (!Number.isInteger(amount) || memo.length !== Number(match[2])) return null;
    const again = await seal(ivk, rho, amount, memo);
    if (again !== sealed) return null;
    return {amount: amount, memo: memo};
  }

  async function place(state, spec, detail) {
    if (state.next >= LEAF_COUNT) return fail(state, 'The tree is full.');
    const spendCmx = spec.spend.cmx || await cmxOf(spec.spend);
    const spendNf = spec.spend.nf || await nfOf({
      owner: spec.spend.owner,
      rho: spec.spend.rho,
      cmx: spendCmx,
    });
    const seq = state.seq + 1;
    const output = {
      owner: spec.output.owner,
      amount: spec.output.amount,
      memo: spec.output.memo,
      rcm: 'rcm-out-' + seq,
      rho: spendNf,
    };
    const cmx = await cmxOf(output);
    const cv = await digestHex([
      'cv', 'value-commitment-stand-in', spec.vOld, output.amount, 'rcv-' + seq,
    ]);
    const ciphertext = await seal(output.owner, spendNf, output.amount, output.memo);
    const leaves = state.leaves.slice();
    const position = state.next;
    leaves[position] = cmx;
    const layers = await layersOf(leaves);
    const tree = finish(leaves, position + 1, layers);
    const notes = state.notes.slice();
    if (output.owner === SELF) {
      notes.push({
        position: position,
        owner: SELF,
        amount: output.amount,
        memo: output.memo,
        rcm: output.rcm,
        rho: output.rho,
        cmx: cmx,
        nf: await nfOf({owner: SELF, rho: spendNf, cmx: cmx}),
      });
    }
    return {
      ok: true,
      reason: '',
      detail: detail,
      state: {
        depth: DEPTH,
        leaves: tree.leaves,
        next: tree.next,
        layers: tree.layers,
        anchor: tree.anchor,
        path: tree.path,
        nullifiers: state.nullifiers.concat([spendNf]),
        actions: state.actions.concat([{
          cmx: cmx,
          nf: spendNf,
          cv: cv,
          position: position,
          ciphertext: ciphertext,
        }]),
        notes: notes,
        seq: seq,
      },
    };
  }

  function dummySpec(seq) {
    return {
      owner: 'dummy',
      amount: 0,
      memo: '',
      rcm: 'dummy-rcm-' + seq,
      rho: 'dummy-rho-' + seq,
    };
  }

  async function createNote(state, amount, memo) {
    const parsed = parseAmount(amount);
    if (parsed.error) return fail(state, parsed.error);
    const text = parseMemo(memo);
    if (text.error) return fail(state, text.error);
    return place(state, {
      spend: dummySpec(state.seq),
      output: {owner: SELF, amount: parsed.value, memo: text.value},
      vOld: 0,
    }, 'Appended a note. The spend is a dummy, so no leaf is named.');
  }

  async function send(state, position, amount, memo) {
    const parsed = parseAmount(amount);
    if (parsed.error) return fail(state, parsed.error);
    const text = parseMemo(memo);
    if (text.error) return fail(state, text.error);
    const index = Number(position);
    const note = state.notes.find(function (item) { return item.position === index && item.owner === SELF; });
    if (!note) return fail(state, 'Pick a note this key can spend.');
    if (state.nullifiers.indexOf(note.nf) >= 0) return fail(state, 'That note is already spent.');
    return place(state, {
      spend: note,
      output: {owner: OTHER, amount: parsed.value, memo: text.value},
      vOld: note.amount,
    }, 'Appended a note. The spent leaf is not on the chain.');
  }

  async function dummyAction(state) {
    return place(state, {
      spend: dummySpec(state.seq),
      output: {owner: SELF, amount: 0, memo: ''},
      vOld: 0,
    }, 'A dummy spend and a dummy output. The chain still shows one nf and one cmx.');
  }

  function chainAction(action) {
    return {
      cmx: action.cmx,
      nf: action.nf,
      cv: action.cv,
      position: action.position,
    };
  }

  function chainView(state) {
    return {
      anchor: state.anchor,
      depth: state.depth,
      uncommitted: UNCOMMITTED,
      leaves: state.leaves.slice(),
      nullifiers: state.nullifiers.slice(),
      actions: state.actions.map(chainAction),
    };
  }

  function walletView(state) {
    return state.notes.filter(function (note) { return note.owner === SELF; }).map(function (note) {
      return {
        position: note.position,
        amount: note.amount,
        memo: note.memo,
        cmx: note.cmx,
        spent: state.nullifiers.indexOf(note.nf) >= 0,
      };
    });
  }

  async function readActions(state, ivk) {
    const rows = [];
    for (let i = 0; i < state.actions.length; i++) {
      const action = state.actions[i];
      rows.push({
        cmx: action.cmx,
        nf: action.nf,
        cv: action.cv,
        position: action.position,
        opened: await openSeal(ivk, action.nf, action.ciphertext),
      });
    }
    return rows;
  }

  function short(hex) {
    return String(hex || '').slice(0, 6);
  }

  function treeSource(state) {
    const lines = ['flowchart TD'];
    lines.push('  classDef path fill:#efe6c8,stroke:#1a2e24,stroke-width:3px');
    lines.push('  classDef sib fill:#d7e4dc,stroke:#1a2e24');
    const onPath = {};
    const sibs = {};
    if (state.next > 0) {
      let index = state.next - 1;
      for (let layer = DEPTH; layer >= 0; layer--) {
        onPath[layer + '_' + index] = true;
        index >>= 1;
      }
      index = state.next - 1;
      for (let layer = DEPTH; layer > 0; layer--) {
        sibs[layer + '_' + (index ^ 1)] = true;
        index >>= 1;
      }
    }
    for (let layer = 0; layer <= DEPTH; layer++) {
      const count = 1 << layer;
      for (let i = 0; i < count; i++) {
        const key = layer + '_' + i;
        let label;
        if (layer === DEPTH) {
          label = state.leaves[i] === UNCOMMITTED ? '2' : ('cm ' + short(state.leaves[i]));
        } else if (layer === 0) {
          label = 'anchor ' + short(state.anchor);
        } else if (onPath[key]) {
          label = 'path';
        } else if (sibs[key]) {
          label = 'sib ' + short(state.layers[layer][i]);
        } else {
          label = 'node';
        }
        let cls = '';
        if (onPath[key]) cls = ':::path';
        else if (sibs[key]) cls = ':::sib';
        lines.push('  n' + layer + '_' + i + '["' + label + '"]' + cls);
      }
    }
    for (let layer = 0; layer < DEPTH; layer++) {
      const count = 1 << layer;
      for (let i = 0; i < count; i++) {
        lines.push('  n' + layer + '_' + i + ' --> n' + (layer + 1) + '_' + (i * 2));
        lines.push('  n' + layer + '_' + i + ' --> n' + (layer + 1) + '_' + (i * 2 + 1));
      }
    }
    return lines.join('\n');
  }

  function actionSource(action) {
    if (!action) {
      return [
        'flowchart LR',
        '  spend["spend"] --> act["Action"]',
        '  act --> out["output"]',
        '  act --> cvn["cv net"]',
      ].join('\n');
    }
    return [
      'flowchart LR',
      '  spend["nf ' + action.nf.slice(0, 8) + '"] --> act["Action"]',
      '  act --> out["cmx ' + action.cmx.slice(0, 8) + '"]',
      '  act --> cvn["cv ' + action.cv.slice(0, 8) + '"]',
    ].join('\n');
  }

  return {
    DEPTH: DEPTH,
    LEAF_COUNT: LEAF_COUNT,
    UNCOMMITTED: UNCOMMITTED,
    SELF: SELF,
    OTHER: OTHER,
    seed: seed,
    createNote: createNote,
    send: send,
    dummyAction: dummyAction,
    chainView: chainView,
    chainAction: chainAction,
    walletView: walletView,
    readActions: readActions,
    openSeal: openSeal,
    treeSource: treeSource,
    actionSource: actionSource,
    short: short,
    layersOf: layersOf,
    authSteps: authSteps,
  };
});
