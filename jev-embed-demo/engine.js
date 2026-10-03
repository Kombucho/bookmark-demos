// Named-question embeddings.
// Each question is a dimension. The answers are the vector.
// Rank is cosine similarity. No model is called.
// The inbox numbers are the ones from Kieran Klaassen's note.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JevEmbed = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRESETS = {
    inbox: {
      id: 'inbox',
      label: 'Inbox',
      note: 'Scores below are the ones in the note.',
      queryLabel: 'billing issues from customers',
      questions: ['is_customer', 'urgent', 'about_billing', 'needs_reply'],
      query: [1, 0.5, 1, 0.5],
      docs: [
        {id: 'charge', title: 'Double charge', text: 'I got charged twice this month, pls fix asap', scores: [1, 0.9, 1, 1]},
        {id: 'newsletter', title: 'Newsletter', text: 'A newsletter', scores: [0, 0, 0, 0.1]},
        {id: 'lunch', title: 'Lunch', text: 'A friend asking about lunch', scores: [0, 0.1, 0, 0.7]},
      ],
    },
    articles: {
      id: 'articles',
      label: 'Articles',
      note: 'Question names are from the note. The article scores are a starting book you can edit; the note did not publish them.',
      queryLabel: 'beginner tutorials about AI',
      questions: ['is_tutorial', 'about_ai', 'contrarian', 'beginner_friendly'],
      query: [1, 1, 0, 1],
      docs: [
        {id: 'tutorial', title: 'Fine-tune a small model', text: 'A short tutorial for training a small model on one GPU.', scores: [1, 1, 0, 1]},
        {id: 'contrarian', title: 'RAG is the wrong default', text: 'An argument that retrieval should not be the first architecture.', scores: [0.2, 1, 1, 0.2]},
        {id: 'notes', title: 'Quarterly notes', text: 'Internal notes from the quarter, with no how-to.', scores: [0, 0.1, 0, 0]},
      ],
    },
    tickets: {
      id: 'tickets',
      label: 'Tickets',
      note: 'Question names are from the note. The ticket scores are a starting book you can edit; the note did not publish them.',
      queryLabel: 'angry enterprise bugs',
      questions: ['is_bug', 'angry', 'churn_risk', 'enterprise'],
      query: [1, 1, 1, 1],
      docs: [
        {id: 'crash', title: 'Export crash', text: 'Export crashes on the enterprise plan and we are done if this is not fixed today.', scores: [1, 1, 1, 1]},
        {id: 'avatar', title: 'Avatar help', text: 'How do I change my avatar?', scores: [0, 0, 0, 0]},
        {id: 'slow', title: 'Slow billing page', text: 'The billing page is slow for our admin.', scores: [0.4, 0.3, 0.2, 1]},
      ],
    },
  };

  function align(scores, width) {
    const source = Array.isArray(scores) ? scores : [];
    const aligned = [];
    for (let index = 0; index < width; index += 1) {
      const value = Number(source[index]);
      aligned.push(Number.isFinite(value) ? value : 0);
    }
    return aligned;
  }

  function compare(query, scores, questions) {
    const width = questions.length;
    const q = align(query, width);
    const d = align(scores, width);
    let dot = 0;
    let querySquare = 0;
    let docSquare = 0;
    const parts = questions.map((question, index) => {
      const product = q[index] * d[index];
      dot += product;
      querySquare += q[index] * q[index];
      docSquare += d[index] * d[index];
      return {
        question,
        query: q[index],
        score: d[index],
        product,
      };
    });
    const queryMagnitude = Math.sqrt(querySquare);
    const docMagnitude = Math.sqrt(docSquare);
    const cosine = queryMagnitude === 0 || docMagnitude === 0 ? null : dot / (queryMagnitude * docMagnitude);
    return {dot, queryMagnitude, docMagnitude, cosine, parts};
  }

  function rankDocuments(state) {
    const questions = state.questions.map(question => String(question || '').trim() || 'unnamed');
    const ranked = state.docs.map((doc, index) => {
      const math = compare(state.query, doc.scores, questions);
      return {
        ...doc,
        index,
        ...math,
      };
    });
    ranked.sort((left, right) => {
      if (left.cosine == null && right.cosine == null) return left.index - right.index;
      if (left.cosine == null) return 1;
      if (right.cosine == null) return -1;
      return right.cosine - left.cosine || left.index - right.index;
    });
    return ranked.map((doc, rank) => ({...doc, rank: rank + 1}));
  }

  function reason(match) {
    if (match.cosine == null) {
      const which = match.queryMagnitude === 0 ? 'query' : 'document';
      return `Cosine is undefined because the ${which} vector has length 0. There is no direction to compare.`;
    }
    const supporting = [...match.parts].sort((left, right) => right.product - left.product);
    const leaders = supporting.filter(part => part.product > 0).slice(0, 3);
    const leadText = leaders.length
      ? leaders.map(part => `${part.question} (${formatNum(part.query)} × ${formatNum(part.score)} = ${formatNum(part.product)})`).join(', ')
      : 'no question contributes a positive product';
    return `Cosine ${formatNum(match.cosine)} from dot ${formatNum(match.dot)} / (|query| ${formatNum(match.queryMagnitude)} × |doc| ${formatNum(match.docMagnitude)}). Largest overlaps: ${leadText}.`;
  }

  function formatNum(value) {
    if (!Number.isFinite(value)) return '—';
    const rounded = Math.round(value * 1000) / 1000;
    return String(rounded);
  }

  function clonePreset(id) {
    const preset = PRESETS[id] || PRESETS.inbox;
    return {
      id: preset.id,
      label: preset.label,
      note: preset.note,
      queryLabel: preset.queryLabel,
      questions: [...preset.questions],
      query: [...preset.query],
      docs: preset.docs.map(doc => ({...doc, scores: [...doc.scores]})),
    };
  }

  return {PRESETS, align, compare, rankDocuments, reason, formatNum, clonePreset};
});
