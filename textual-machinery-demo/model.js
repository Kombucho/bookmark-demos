// Character model: five letters in, one letter out.
// An embedding, one leaky-ReLU hidden layer, and a softmax, plus a bigram
// and a hashed trigram that share the same logits. SGD runs only when the
// guess is wrong. Nothing here touches the DOM or the network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TextualMachinery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CONTEXT = 5;
  const EMBED = 8;
  const HIDDEN = 32;
  const TRI = 96;
  const LEAK = 0.05;

  const PRESETS = {
    metaphor: 'the machine does not read the way we do\ntakes one letter looks at the five before it\nand guesses the next\nwhen the guess is wrong a small correction runs back through every part that took part in it',
    alice: 'alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it.',
    times: 'it was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.'
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randn(rand) {
    const u = Math.max(1e-8, rand());
    const v = Math.max(1e-8, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  function triBucket(a, b, c) {
    let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77) ^ Math.imul(c + 1, 0xc2b2ae35);
    return (h >>> 0) % TRI;
  }

  function createModel(text, opts) {
    const options = opts || {};
    const seed = options.seed == null ? 7 : options.seed | 0;
    const lr = options.lr == null ? 0.22 : options.lr;
    const lrBi = options.lrBigram == null ? 0.55 : options.lrBigram;
    const lrTri = options.lrTrigram == null ? 0.4 : options.lrTrigram;
    const chars = [];
    const index = Object.create(null);
    function pushChar(ch) {
      if (index[ch] != null) return;
      index[ch] = chars.length;
      chars.push(ch);
    }
    pushChar(' ');
    const source = String(text || '');
    for (let i = 0; i < source.length; i++) pushChar(source[i]);
    const V = chars.length;
    const In = CONTEXT * EMBED;

    const embed = new Float32Array(V * EMBED);
    const W1 = new Float32Array(HIDDEN * In);
    const b1 = new Float32Array(HIDDEN);
    const W2 = new Float32Array(V * HIDDEN);
    const b2 = new Float32Array(V);
    const bigram = new Float32Array(V * V);
    const trigram = new Float32Array(TRI * V);

    const x = new Float32Array(In);
    const h = new Float32Array(HIDDEN);
    const preNeg = new Uint8Array(HIDDEN);
    const logits = new Float32Array(V);
    const probs = new Float32Array(V);
    const dLog = new Float32Array(V);
    const dH = new Float32Array(HIDDEN);
    const dX = new Float32Array(In);
    const scratch = new Float32Array(V);

    let burned = 0;
    let lastPred = 0;

    function init() {
      const fresh = mulberry32(seed);
      for (let i = 0; i < embed.length; i++) embed[i] = (fresh() * 2 - 1) * 0.45;
      const s1 = Math.sqrt(2 / In);
      for (let i = 0; i < W1.length; i++) W1[i] = randn(fresh) * s1;
      b1.fill(0);
      const s2 = 0.12 / Math.sqrt(HIDDEN);
      for (let i = 0; i < W2.length; i++) W2[i] = randn(fresh) * s2;
      b2.fill(0);
      bigram.fill(0);
      trigram.fill(0);
      burned = 0;
      h.fill(0);
    }
    init();

    function idOf(ch) {
      const v = index[ch];
      return v == null ? index[' '] : v;
    }

    function clampId(ctx, i) {
      const id = ctx && ctx[i] != null ? ctx[i] | 0 : 0;
      return id < 0 || id >= V ? 0 : id;
    }

    function forward(ctx) {
      for (let c = 0; c < CONTEXT; c++) {
        const row = clampId(ctx, c) * EMBED;
        const off = c * EMBED;
        for (let k = 0; k < EMBED; k++) x[off + k] = embed[row + k];
      }
      for (let j = 0; j < HIDDEN; j++) {
        let s = b1[j];
        const row = j * In;
        for (let i = 0; i < In; i++) s += W1[row + i] * x[i];
        if (s >= 0) {
          h[j] = s;
          preNeg[j] = 0;
        } else {
          h[j] = s * LEAK;
          preNeg[j] = 1;
        }
      }
      const prev = clampId(ctx, CONTEXT - 1);
      const tri = triBucket(clampId(ctx, 2), clampId(ctx, 3), clampId(ctx, 4)) * V;
      const bi = prev * V;
      let maxLog = -1e9;
      for (let v = 0; v < V; v++) {
        let s = b2[v] + bigram[bi + v] + trigram[tri + v];
        const row = v * HIDDEN;
        for (let j = 0; j < HIDDEN; j++) s += W2[row + j] * h[j];
        logits[v] = s;
        if (s > maxLog) maxLog = s;
      }
      if (!Number.isFinite(maxLog)) {
        init();
        maxLog = 0;
        logits.fill(0);
      }
      let sum = 0;
      for (let v = 0; v < V; v++) {
        const e = Math.exp(logits[v] - maxLog);
        probs[v] = e;
        sum += e;
      }
      const inv = sum > 0 ? 1 / sum : 1;
      let pred = 0;
      let best = -1;
      for (let v = 0; v < V; v++) {
        probs[v] *= inv;
        if (probs[v] > best) {
          best = probs[v];
          pred = v;
        }
      }
      lastPred = pred;
      return pred;
    }

    function backward(ctx, target) {
      for (let v = 0; v < V; v++) dLog[v] = probs[v] - (v === target ? 1 : 0);
      let n2 = 0;
      for (let v = 0; v < V; v++) n2 += dLog[v] * dLog[v];
      const nrm = Math.sqrt(n2);
      if (nrm > 4) {
        const scale = 4 / nrm;
        for (let v = 0; v < V; v++) dLog[v] *= scale;
      }

      dH.fill(0);
      for (let v = 0; v < V; v++) {
        const g = dLog[v];
        const row = v * HIDDEN;
        for (let j = 0; j < HIDDEN; j++) dH[j] += W2[row + j] * g;
      }
      for (let j = 0; j < HIDDEN; j++) {
        if (preNeg[j]) dH[j] *= LEAK;
      }

      dX.fill(0);
      for (let j = 0; j < HIDDEN; j++) {
        const g = dH[j];
        if (g === 0) continue;
        const row = j * In;
        for (let i = 0; i < In; i++) dX[i] += W1[row + i] * g;
      }

      for (let v = 0; v < V; v++) {
        const g = dLog[v] * lr;
        b2[v] -= g;
        const row = v * HIDDEN;
        for (let j = 0; j < HIDDEN; j++) W2[row + j] -= g * h[j];
      }

      const bi = clampId(ctx, CONTEXT - 1) * V;
      const tri = triBucket(clampId(ctx, 2), clampId(ctx, 3), clampId(ctx, 4)) * V;
      for (let v = 0; v < V; v++) {
        bigram[bi + v] -= lrBi * dLog[v];
        trigram[tri + v] -= lrTri * dLog[v];
      }

      for (let j = 0; j < HIDDEN; j++) {
        const g = dH[j] * lr;
        b1[j] -= g;
        const row = j * In;
        for (let i = 0; i < In; i++) W1[row + i] -= g * x[i];
      }

      for (let c = 0; c < CONTEXT; c++) {
        const row = clampId(ctx, c) * EMBED;
        const off = c * EMBED;
        for (let k = 0; k < EMBED; k++) embed[row + k] -= lr * dX[off + k];
      }
      burned += 1;
    }

    function lossOf(target) {
      const p = probs[target] > 0 ? probs[target] : 1e-8;
      return -Math.log(p);
    }

    function observe(ctx, target) {
      const pred = forward(ctx);
      const correct = pred === target;
      const loss = lossOf(target);
      let updated = false;
      if (!correct && Number.isFinite(loss)) {
        backward(ctx, target);
        updated = true;
      }
      return {
        pred: pred,
        correct: correct,
        loss: loss,
        updated: updated,
        burned: burned
      };
    }

    function predict(ctx) {
      return forward(ctx);
    }

    function sampleIndex(ctx, temperature, randFn) {
      forward(ctx);
      const temp = temperature == null ? 0.8 : temperature;
      if (temp <= 0.05) return lastPred;
      let maxLog = -1e9;
      for (let v = 0; v < V; v++) {
        const s = logits[v] / temp;
        if (s > maxLog) maxLog = s;
      }
      let sum = 0;
      for (let v = 0; v < V; v++) {
        const e = Math.exp(logits[v] / temp - maxLog);
        scratch[v] = e;
        sum += e;
      }
      let r = (randFn || Math.random)() * sum;
      for (let v = 0; v < V; v++) {
        r -= scratch[v];
        if (r <= 0) return v;
      }
      return V - 1;
    }

    function checksum() {
      let s = 0;
      for (let i = 0; i < W2.length; i += 5) s += W2[i];
      for (let i = 0; i < W1.length; i += 11) s += W1[i];
      for (let i = 0; i < bigram.length; i += 7) s += bigram[i];
      for (let i = 0; i < trigram.length; i += 9) s += trigram[i];
      for (let i = 0; i < embed.length; i += 4) s += embed[i];
      return Math.round(s * 1e6);
    }

    function hiddenCopy() {
      return h;
    }

    function activeHidden(threshold) {
      const t = threshold == null ? 0.2 : threshold;
      let n = 0;
      for (let j = 0; j < HIDDEN; j++) if (h[j] > t) n += 1;
      return n;
    }

    return {
      context: CONTEXT,
      vocab: V,
      hiddenSize: HIDDEN,
      chars: chars,
      idOf: idOf,
      charAt: function (i) { return chars[i] || ' '; },
      observe: observe,
      predict: predict,
      sampleIndex: sampleIndex,
      reset: init,
      checksum: checksum,
      hidden: hiddenCopy,
      activeHidden: activeHidden,
      burned: function () { return burned; }
    };
  }

  function createTrainer(model, text) {
    const raw = String(text || '');
    const ids = new Int32Array(Math.max(1, raw.length));
    const shown = [];
    const space = model.idOf(' ');
    let n = 0;
    for (let i = 0; i < raw.length; i++) {
      ids[n] = model.idOf(raw[i]);
      shown.push(raw[i]);
      n += 1;
    }
    if (n === 0) {
      ids[0] = space;
      shown.push(' ');
      n = 1;
    }
    const ctx = new Int32Array(CONTEXT);
    let t = 0;
    let seen = 0;
    let correct = 0;

    function at(i) {
      if (i < 0 || n === 0) return space;
      return ids[i % n];
    }

    function fill(targetPos) {
      for (let k = 0; k < CONTEXT; k++) ctx[k] = at(targetPos - CONTEXT + k);
      return ctx;
    }

    const event = {
      pred: 0,
      correct: false,
      loss: 0,
      updated: false,
      burned: 0,
      pos: 0,
      said: ' ',
      next: ' ',
      lanes: [' ', ' ', ' ', ' ', ' '],
      step: 0,
      letters: 0,
      waiting: 0,
      hits: 0,
      total: 0
    };

    function step() {
      const pos = n ? t % n : 0;
      fill(t);
      const target = at(t);
      const out = model.observe(ctx, target);
      seen += 1;
      if (out.correct) correct += 1;
      event.pred = out.pred;
      event.correct = out.correct;
      event.loss = out.loss;
      event.updated = out.updated;
      event.burned = out.burned;
      event.pos = pos;
      event.said = shown[pos] || ' ';
      event.next = model.charAt(out.pred);
      for (let k = 0; k < CONTEXT; k++) event.lanes[k] = model.charAt(ctx[k]);
      event.step = seen;
      event.letters = seen;
      event.waiting = n - pos - 1;
      event.hits = correct;
      event.total = seen;
      t += 1;
      return event;
    }

    function recentContext() {
      const copy = new Int32Array(CONTEXT);
      for (let k = 0; k < CONTEXT; k++) copy[k] = ctx[k];
      return copy;
    }

    function resetCursor() {
      t = 0;
      seen = 0;
      correct = 0;
      for (let k = 0; k < CONTEXT; k++) ctx[k] = space;
    }

    return {
      step: step,
      recentContext: recentContext,
      resetCursor: resetCursor,
      length: n,
      event: event
    };
  }

  function generate(model, ctx, count, temperature, randFn) {
    const window = new Int32Array(CONTEXT);
    for (let k = 0; k < CONTEXT; k++) window[k] = ctx && ctx[k] != null ? ctx[k] : model.idOf(' ');
    let out = '';
    const n = count == null ? 80 : count | 0;
    for (let i = 0; i < n; i++) {
      const id = model.sampleIndex(window, temperature == null ? 0.75 : temperature, randFn);
      out += model.charAt(id);
      for (let k = 0; k < CONTEXT - 1; k++) window[k] = window[k + 1];
      window[CONTEXT - 1] = id;
    }
    return out;
  }

  function rollingAccuracy(model, text, warmup, span) {
    const trainer = createTrainer(model, text);
    const heat = warmup | 0;
    const width = span | 0;
    for (let i = 0; i < heat; i++) trainer.step();
    let hits = 0;
    for (let i = 0; i < width; i++) if (trainer.step().correct) hits += 1;
    return { hits: hits, span: width, rate: width ? hits / width : 0, trainer: trainer };
  }

  return {
    CONTEXT: CONTEXT,
    PRESETS: PRESETS,
    createModel: createModel,
    createTrainer: createTrainer,
    generate: generate,
    rollingAccuracy: rollingAccuracy
  };
});
