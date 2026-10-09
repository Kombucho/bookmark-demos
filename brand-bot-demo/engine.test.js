const assert = require('node:assert/strict');
const test = require('node:test');
const {
  POSTS,
  PRIORITY,
  starterRules,
  parseKeywordList,
  matchKeyword,
  classify,
} = require('./engine.js');

const LANES = {
  'ridge-love': 'amplify',
  'canoe-wish': 'feedback',
  'tent-refund': 'attention',
  'spam-crypto': 'ignore',
  'fog-photo': 'amplify',
  'inlet-question': 'feedback',
  'pack-hinge': 'attention',
  'quiet-feature': 'feedback',
  'north-best': 'amplify',
  'lamp-ghost': 'attention',
  'dimmer-steps': 'feedback',
  'buy-followers': 'ignore',
  'lake-coffee': 'ignore',
  'love-cracked': 'attention',
  'shop-window': 'ignore',
};

test('the sample queue is fifteen fictional posts with unique ids', function () {
  assert.equal(POSTS.length, 15);
  assert.equal(new Set(POSTS.map(function (post) { return post.id; })).size, 15);
  POSTS.forEach(function (post) {
    assert.equal(post.source, 'sample');
    assert.match(post.handle, /^@[a-z.]+$/);
    assert.equal(post.text.includes('http'), false);
  });
  assert.deepEqual(PRIORITY, ['attention', 'ignore', 'feedback', 'amplify']);
});

test('starter rules sort every sample post into the expected lane', function () {
  const rules = starterRules();
  POSTS.forEach(function (post) {
    const result = classify(post.text, rules);
    assert.equal(result.lane, LANES[post.id], post.id + ' ' + result.reason);
  });
});

test('the reason names the winning signals, and a complaint beats praise', function () {
  const rules = starterRules();
  const love = classify(POSTS.find(function (post) { return post.id === 'ridge-love'; }).text, rules);
  assert.deepEqual(love.signals, ['obsessed']);
  assert.equal(love.reason, 'Worth amplifying: obsessed.');

  const mixed = classify(POSTS.find(function (post) { return post.id === 'love-cracked'; }).text, rules);
  assert.equal(mixed.lane, 'attention');
  assert.deepEqual(mixed.signals, ['cracked']);
  assert.equal(mixed.reason, 'Needs a person: cracked. Also matched love (Amplify).');

  const spam = classify('I love Mothglass. Follow me for crypto.', rules);
  assert.equal(spam.lane, 'ignore');
  assert.deepEqual(spam.signals, ['crypto', 'follow me']);
  assert.equal(spam.also[0].lane, 'amplify');

  const urgent = classify('Follow me, my Mothglass broke and I want a refund.', rules);
  assert.equal(urgent.lane, 'attention');
  assert.deepEqual(urgent.signals, ['refund', 'broke']);
});

test('a brand mention with no other signal is ignore, and so is a missing brand', function () {
  const rules = starterRules();
  const windowPost = classify(POSTS.find(function (post) { return post.id === 'shop-window'; }).text, rules);
  assert.equal(windowPost.lane, 'ignore');
  assert.deepEqual(windowPost.signals, []);
  assert.deepEqual(windowPost.brandHits, ['mothglass']);
  assert.equal(windowPost.reason, 'A brand mention with no amplify, feedback, or attention signal.');

  const lake = classify(POSTS.find(function (post) { return post.id === 'lake-coffee'; }).text, rules);
  assert.equal(lake.reason, 'No brand mention, so it stays in Ignore.');
  assert.deepEqual(lake.brandHits, []);
});

test('word boundaries keep hot out of photo, and a new brand word can rescue a post', function () {
  const rules = starterRules();
  assert.equal(matchKeyword('photo of a Mothglass', 'hot'), false);
  assert.equal(matchKeyword('the glass got hot.', 'hot'), true);
  assert.equal(classify('A photo of a Mothglass on the dock.', rules).signals.includes('hot'), false);

  const bare = classify('The lake was glass this morning.', rules);
  assert.equal(bare.lane, 'ignore');
  const widened = starterRules();
  widened.brand = ['lake'];
  widened.amplify = ['glass'];
  const pulled = classify('The lake was glass this morning.', widened);
  assert.equal(pulled.lane, 'amplify');
  assert.deepEqual(pulled.signals, ['glass']);
});

test('keyword lines are trimmed, lowercased, and de-duplicated', function () {
  assert.deepEqual(parseKeywordList(' Love \r\n\nobsessed\nlove '), ['love', 'obsessed']);
  assert.deepEqual(parseKeywordList(''), []);
});

test('dropping the only amplify word moves the rave to ignore', function () {
  const rules = starterRules();
  rules.amplify = rules.amplify.filter(function (word) { return word !== 'obsessed'; });
  const post = POSTS.find(function (item) { return item.id === 'ridge-love'; });
  const result = classify(post.text, rules);
  assert.equal(result.lane, 'ignore');
  assert.equal(result.reason, 'A brand mention with no amplify, feedback, or attention signal.');
});
