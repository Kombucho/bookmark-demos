const test = require('node:test');
const assert = require('node:assert/strict');
const {clonePreset, rankDocuments, reason, compare} = require('./engine.js');

test('the billing query ranks the double-charge email first', () => {
  const state = clonePreset('inbox');
  const ranked = rankDocuments(state);
  assert.deepEqual(ranked.map(doc => doc.id), ['charge', 'lunch', 'newsletter']);
  assert.ok(ranked[0].cosine > 0.9);
  assert.ok(ranked[1].cosine > ranked[2].cosine);
  assert.match(reason(ranked[0]), /about_billing/);
  assert.match(reason(ranked[0]), /is_customer/);
});

test('the inbox scores match the note', () => {
  const state = clonePreset('inbox');
  assert.deepEqual(state.questions, ['is_customer', 'urgent', 'about_billing', 'needs_reply']);
  assert.deepEqual(state.query, [1, 0.5, 1, 0.5]);
  assert.deepEqual(state.docs.find(doc => doc.id === 'charge').scores, [1, 0.9, 1, 1]);
  assert.deepEqual(state.docs.find(doc => doc.id === 'newsletter').scores, [0, 0, 0, 0.1]);
  assert.deepEqual(state.docs.find(doc => doc.id === 'lunch').scores, [0, 0.1, 0, 0.7]);
  assert.equal(state.docs.find(doc => doc.id === 'charge').text, 'I got charged twice this month, pls fix asap');
});

test('a needs-reply query ranks the newsletter first because cosine uses direction', () => {
  const state = clonePreset('inbox');
  state.query = [0, 0, 0, 1];
  const ranked = rankDocuments(state);
  assert.deepEqual(ranked.map(doc => doc.id), ['newsletter', 'lunch', 'charge']);
  assert.ok(Math.abs(ranked[0].cosine - 1) < 1e-9);
  assert.ok(ranked[0].dot < ranked[2].dot);
});

test('raising the urgent weight changes the double-charge cosine', () => {
  const state = clonePreset('inbox');
  const before = rankDocuments(state)[0].cosine;
  state.query = [1, 1, 1, 0.5];
  const after = rankDocuments(state).find(doc => doc.id === 'charge').cosine;
  assert.notEqual(before, after);
  assert.equal(rankDocuments(state)[0].id, 'charge');
});

test('a new question is a new dimension', () => {
  const state = clonePreset('inbox');
  const before = compare(state.query, state.docs[0].scores, state.questions).cosine;
  state.questions = [...state.questions, 'mentions_refund'];
  state.query = [...state.query, 0];
  state.docs = state.docs.map(doc => ({...doc, scores: [...doc.scores, 0]}));
  const after = compare(state.query, state.docs[0].scores, state.questions);
  assert.equal(after.parts.length, 5);
  assert.ok(Math.abs(after.cosine - before) < 1e-9);
  state.query[4] = 1;
  state.docs[0].scores[4] = 1;
  const shifted = compare(state.query, state.docs[0].scores, state.questions);
  assert.ok(shifted.cosine > before);
});

test('a zero document sorts last and explains the missing direction', () => {
  const state = clonePreset('inbox');
  state.docs.push({id: 'empty', title: 'Empty', text: 'Blank scores', scores: [0, 0, 0, 0]});
  const ranked = rankDocuments(state);
  assert.equal(ranked.at(-1).id, 'empty');
  assert.equal(ranked.at(-1).cosine, null);
  assert.match(reason(ranked.at(-1)), /undefined/);
});

test('article and ticket presets expose the question names from the note', () => {
  assert.deepEqual(clonePreset('articles').questions, ['is_tutorial', 'about_ai', 'contrarian', 'beginner_friendly']);
  assert.deepEqual(clonePreset('tickets').questions, ['is_bug', 'angry', 'churn_risk', 'enterprise']);
  const articles = rankDocuments(clonePreset('articles'));
  assert.equal(articles[0].id, 'tutorial');
  const tickets = rankDocuments(clonePreset('tickets'));
  assert.equal(tickets[0].id, 'crash');
});
