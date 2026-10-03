const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CHARACTERISTICS,
  SAMPLE_CATALOGUE,
  SAMPLE_MESSY,
  review,
  verbObject,
} = require('./engine.js');

function ids(item) {
  return item.failures.map(failure => failure.characteristic);
}

function find(result, snippet) {
  const item = result.items.find(entry => entry.text.includes(snippet));
  assert.ok(item, `missing item: ${snippet}`);
  return item;
}

test('the catalogue lists the 18 characteristics in skill order', () => {
  assert.deepEqual(CHARACTERISTICS.map(item => item.id), [
    'unambiguous',
    'clear',
    'concise',
    'correct',
    'testable',
    'implementation-independent',
    'owned',
    'relevant',
    'feasible',
    'unique',
    'cohesive',
    'consistent',
    'conformant',
    'current',
    'modifiable',
    'traceable',
    'categorised',
    'complete',
  ]);
});

test('verb + object collapses the two PDF report lines onto one signature', () => {
  const left = verbObject('Users shall be able to export the report to PDF.');
  const right = verbObject('The system shall provide PDF export functionality for reports.');
  assert.equal(left.verb, 'export');
  assert.equal(right.verb, 'export');
  assert.deepEqual([...left.nouns].sort(), [...right.nouns].sort());
});

test('the sample catalogue fails the characteristics the skill describes', () => {
  const result = review(SAMPLE_CATALOGUE);
  assert.equal(result.items.length, 16);
  assert.match(result.scope, /cart abandonment/);

  const pdf = find(result, 'export the report to PDF');
  const pdfAgain = find(result, 'PDF export functionality');
  assert.ok(ids(pdf).includes('unique'));
  assert.ok(ids(pdfAgain).includes('unique'));
  assert.ok(result.setFindings.some(finding =>
    finding.characteristic === 'unique' && /export/.test(finding.evidence)));

  const compound = find(result, 'authenticate users via SSO');
  assert.ok(ids(compound).includes('cohesive'));
  assert.ok(ids(compound).includes('implementation-independent'));
  assert.match(compound.failures.find(failure => failure.characteristic === 'cohesive').evidence, /authenticate/);

  const expire = find(result, 'Sessions expire');
  const sticky = find(result, 'browser closes');
  assert.ok(ids(expire).includes('consistent'));
  assert.ok(ids(sticky).includes('consistent'));
  assert.match(expire.failures.find(failure => failure.characteristic === 'consistent').evidence, /inactivity/);

  const openReport = find(result, 'available to all users');
  const closedReport = find(result, 'Manager-level permission');
  assert.ok(ids(openReport).includes('consistent'));
  assert.ok(ids(closedReport).includes('consistent'));

  const fast = find(result, 'fast and user-friendly');
  assert.ok(ids(fast).includes('unambiguous'));
  assert.ok(ids(fast).includes('testable'));
  assert.ok(ids(fast).includes('owned'));
  assert.match(fast.failures.find(failure => failure.characteristic === 'owned').evidence, /Product team/);

  const jargon = find(result, 'FPID-to-ECID');
  assert.match(jargon.failures.find(failure => failure.characteristic === 'clear').evidence, /CDP/);
  assert.match(jargon.failures.find(failure => failure.characteristic === 'clear').evidence, /FPID/);

  const churn = find(result, '99.9%');
  assert.ok(ids(churn).includes('feasible'));

  const bloated = find(result, 'in order to support');
  assert.ok(ids(bloated).includes('concise'));
  assert.ok(!ids(bloated).includes('unique'));

  const birthday = find(result, 'birthday email');
  assert.ok(ids(birthday).includes('relevant'));
  assert.equal(birthday.style, 'user story');

  const actor = find(result, 'Reports shall be generated');
  assert.match(actor.failures.find(failure => failure.characteristic === 'unambiguous').evidence, /actor/i);

  const boundary = find(result, 'not building a CRM');
  assert.ok(!ids(boundary).includes('relevant'));

  const good = find(result, 'REQ-CHECKOUT-014');
  assert.deepEqual(ids(good), [], ids(good).join(', '));

  assert.ok(result.setFindings.some(finding => finding.characteristic === 'conformant' && /user story/.test(finding.evidence)));
  assert.ok(result.setFindings.some(finding => finding.characteristic === 'categorised' && /Usability/.test(finding.evidence) && !/No requirements detected for:[\s\S]*Security/.test(finding.evidence)));
  assert.ok(result.setFindings.some(finding => finding.characteristic === 'complete' && /delete|offboard/i.test(finding.evidence)));
  assert.ok(result.setFindings.some(finding => finding.characteristic === 'modifiable'));
  assert.ok(result.setFindings.some(finding => finding.characteristic === 'consistent' && /customer/.test(finding.evidence) && /user/.test(finding.evidence)));
  assert.ok(result.openQuestions.length >= 3);
});

test('an expanded acronym is not flagged again', () => {
  const result = review('Scope: Documents.\n\nThe system shall export a Portable Document Format (PDF) file. Owner: Priya Shah. Source: Interview, Priya Shah, 2026-04-01. Last reviewed: 2026-04-01. REQ-DOC-001.');
  const item = result.items[0];
  assert.ok(!ids(item).includes('clear'), ids(item).join(', '));
});

test('a messy note is split into statements and the Redis button is implementation detail', () => {
  const result = review(SAMPLE_MESSY);
  assert.equal(result.items.length, 4);
  assert.equal(result.scope, '');
  const redis = find(result, 'Redis');
  assert.ok(ids(redis).includes('implementation-independent'));
  assert.match(redis.failures.find(failure => failure.characteristic === 'implementation-independent').evidence, /redis/);
  assert.match(redis.failures.find(failure => failure.characteristic === 'implementation-independent').evidence, /button/);
  const forever = find(result, 'forever');
  assert.ok(ids(forever).includes('unambiguous'));
  assert.ok(result.items.every(item => item.text.includes('not building') || ids(item).includes('relevant')));
});

test('a typed scope can clear a relevance miss', () => {
  const note = 'The checkout shall show the cart total before payment. Owner: Priya Shah. Source: Interview, Priya Shah, 2026-04-01. Last reviewed: 2026-04-01. REQ-CHECKOUT-020.';
  const missing = review(note);
  assert.ok(ids(missing.items[0]).includes('relevant'));
  const scoped = review(note, 'Checkout redesign to reduce cart abandonment');
  assert.ok(!ids(scoped.items[0]).includes('relevant'));
});
