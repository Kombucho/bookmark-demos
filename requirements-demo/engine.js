// Eighteen-characteristic requirements review.
// The checks follow gnur.io/nurijanian-skills, skills/make-requirements-great.
// Per-item checks look at one statement. Set-level checks need the whole catalogue,
// including verb + object duplicates.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RequirementsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHARACTERISTICS = [
    {id: 'unambiguous', n: 1, level: 'item', name: 'Unambiguous', test: 'Two competent readers could walk away with different interpretations, often because a weasel or unbounded word is doing the work of a number.'},
    {id: 'clear', n: 2, level: 'item', name: 'Clear', test: 'A reader from the affected group can parse the sentence in one pass, and every acronym is expanded on first use.'},
    {id: 'concise', n: 3, level: 'item', name: 'Concise', test: 'Words that can be deleted without losing a constraint are still in the sentence.'},
    {id: 'correct', n: 4, level: 'item', name: 'Correct', test: 'Correct is the sign-off gate: every other check that applies to this requirement has to pass.'},
    {id: 'testable', n: 5, level: 'item', name: 'Testable', test: 'Someone can write a test with a specific input and an objective pass condition.'},
    {id: 'implementation-independent', n: 6, level: 'item', name: 'Implementation-independent', test: 'Named technology or a named UI control is standing in for the behaviour the business needs.'},
    {id: 'owned', n: 7, level: 'item', name: 'Owned', test: 'A named person, not a team or a blank, can confirm the requirement and resolve a dispute.'},
    {id: 'relevant', n: 8, level: 'item', name: 'Relevant', test: 'The statement traces to the stated scope or purpose, or it is an explicit boundary.'},
    {id: 'feasible', n: 9, level: 'item', name: 'Feasible', test: 'The demand fits known limits of time, skill, and the state of the art.'},
    {id: 'unique', n: 10, level: 'set', name: 'Unique', test: 'Sort the catalogue by verb + object. The same pair, or a strict restatement of it, should appear once.'},
    {id: 'cohesive', n: 11, level: 'item', name: 'Cohesive', test: 'One requirement is about one behaviour. A second action verb usually means it should be split.'},
    {id: 'consistent', n: 12, level: 'set', name: 'Consistent', test: 'No requirement contradicts another, and each concept has one name.'},
    {id: 'conformant', n: 13, level: 'set', name: 'Conformant', test: 'The catalogue uses one agreed form. Mixed shall-statements, user stories, and fragments fail.'},
    {id: 'current', n: 14, level: 'set', name: 'Current', test: 'Each requirement carries a date or a last-reviewed mark so stale text can be found.'},
    {id: 'modifiable', n: 15, level: 'set', name: 'Modifiable', test: 'Stable identifiers and grouped topics let a change be traced. Positional numbers do not.'},
    {id: 'traceable', n: 16, level: 'set', name: 'Traceable', test: 'Each requirement names where it came from, and can point at a test or design that checks it.'},
    {id: 'categorised', n: 17, level: 'set', name: 'Categorised', test: 'The catalogue is partitioned by type. An empty standard category is a gap to confirm, not a requirement to invent.'},
    {id: 'complete', n: 18, level: 'set', name: 'Complete', test: 'CRUD, lifecycle, and failure paths are covered or explicitly excluded. Absence is checked with those techniques, and is never fully provable.'},
  ];

  const SAMPLE_CATALOGUE = `Scope: Checkout redesign to reduce cart abandonment.

Owner: Product team

The system shall be fast and user-friendly.
Users shall be able to export the report to PDF.
The system shall provide PDF export functionality for reports.
The system shall authenticate users via SSO and log all login attempts and send an alert to security if more than five failed attempts occur within ten minutes.
Sessions expire after 30 minutes of inactivity.
Sessions remain active until the browser closes.
As a user I want a birthday email.
The CDP shall enrich identified visitors via the RTCDP using the FPID-to-ECID stitching rule.
Reports shall be generated.
The system shall predict customer churn with 99.9% accuracy two years in advance.
It is required that the system, in order to support the user's workflow, shall be able to provide the user with the ability to export the cart to a PDF file format when the user chooses to do so.
Users shall be able to create an account.
The report shall be available to all users.
Access to the report shall require Manager-level permission.
We are not building a CRM.
REQ-CHECKOUT-014. The checkout shall show the cart total, including tax and shipping, before payment details are requested. Owner: Priya Shah, Director of Revenue Operations. Source: Interview, Priya Shah, 2026-03-12, transcript line 14. Type: functional. Last reviewed: 2026-03-12.
`;

  const SAMPLE_MESSY = `our sales team loses deals because quotes take forever. customers want them the same day.
we are not building a CRM.
Sales wants a button labelled Submit on the Redis cart.`;

  const WEASEL = [
    ['where applicable', 'where applicable'],
    ['if necessary', 'if necessary'],
    ['as needed', 'as needed'],
    ['high-quality', 'high-quality'],
    ['user-friendly', 'user-friendly'],
    ['real-time', 'real-time'],
    ['real time', 'real time'],
    ['and/or', 'and/or'],
    ['appropriate', 'appropriate'],
    ['suitable', 'suitable'],
    ['adequate', 'adequate'],
    ['reasonable', 'reasonable'],
    ['intuitive', 'intuitive'],
    ['efficient', 'efficient'],
    ['robust', 'robust'],
    ['scalable', 'scalable'],
    ['seamless', 'seamless'],
    ['flexible', 'flexible'],
    ['optimised', 'optimised'],
    ['optimized', 'optimized'],
    ['sufficient', 'sufficient'],
    ['normal', 'normal'],
    ['typical', 'typical'],
    ['standard', 'standard'],
    ['forever', 'forever'],
    ['quickly', 'quickly'],
    ['timely', 'timely'],
    ['immediately', 'immediately'],
    ['simple', 'simple'],
    ['modern', 'modern'],
    ['secure', 'secure'],
    ['easy', 'easy'],
    ['fast', 'fast'],
    ['slow', 'slow'],
    ['asap', 'asap'],
    ['soon', 'soon'],
    ['might', 'might'],
    ['could', 'could'],
    ['may', 'may'],
    ['etc', 'etc'],
  ];

  const FILLERS = [
    [/it is required that/gi, 'it is required that'],
    [/in order to/gi, 'in order to'],
    [/it should be noted that/gi, 'it should be noted that'],
    [/the purpose of this requirement is to/gi, 'the purpose of this requirement is to'],
    [/with the ability to/gi, 'with the ability to'],
    [/be able to/gi, 'be able to'],
    [/when the user chooses to do so/gi, 'when the user chooses to do so'],
    [/due to the fact that/gi, 'due to the fact that'],
    [/at this point in time/gi, 'at this point in time'],
    [/in the event that/gi, 'in the event that'],
  ];

  const GENERIC = new Set(['functionality', 'ability', 'capability', 'feature', 'system', 'user', 'able', 'provide', 'allow', 'enable', 'support', 'shall', 'should', 'must', 'will', 'the', 'a', 'an', 'to', 'for', 'of', 'and', 'or', 'via', 'with', 'in', 'on', 'by', 'from', 'that', 'this', 'be', 'into', 'onto', 'within', 'when', 'where', 'who', 'their', 'its', 'it', 'as', 'at', 'per', 'all', 'every', 'other', 'than', 'then', 'also', 'not', 'our', 'we', 'they', 'them', 'are', 'is', 'was', 'be', 'been', 'being', 'have', 'has', 'had', 'can', 'each', 'any', 'more', 'most', 'such', 'using', 'use', 'used']);

  const VERBS = new Set(['authenticate', 'log', 'record', 'send', 'alert', 'raise', 'store', 'display', 'show', 'export', 'email', 'notify', 'expire', 'predict', 'generate', 'enrich', 'save', 'delete', 'create', 'update', 'validate', 'encrypt', 'redirect', 'charge', 'refund', 'calculate', 'sync', 'propagate', 'render', 'prevent', 'block', 'limit', 'publish', 'archive', 'revoke', 'import', 'download', 'upload', 'search', 'filter', 'sort', 'assign', 'approve', 'reject', 'escalate', 'retry', 'remain', 'register']);

  const TECH = /\b(redis|postgres|postgresql|mysql|mongodb|kafka|kubernetes|docker|react|angular|vue\.?js|graphql|elasticsearch|dynamodb|firebase|supabase|stripe|twilio|salesforce|snowflake|bigquery|webpack|oauth|saml|ldap|sso)\b/gi;
  const UI_CONTROL = /\b(dropdown|drop-down|checkbox|radio button|modal|pop-up|popup|hamburger menu|button)\b/gi;

  const CATEGORIES = [
    {id: 'functional', label: 'Functional', pattern: /\b(shall|must)\b/i},
    {id: 'performance', label: 'Performance', pattern: /\b(latency|percentile|throughput|response time|milliseconds?|mbps)\b/i},
    {id: 'security', label: 'Security', pattern: /\b(encrypt|authenticat\w*|authoriz\w*|authoris\w*|permission|password|audit)\b/i},
    {id: 'usability', label: 'Usability', pattern: /\b(usability|accessible|accessibility|onboarding)\b/i},
    {id: 'reliability', label: 'Reliability', pattern: /\b(uptime|failover|redundancy|recover|backup|availability)\b/i},
    {id: 'business', label: 'Business', pattern: /\b(revenue|complaint|churn|conversion|kpi)\b/i},
    {id: 'regulatory', label: 'Regulatory', pattern: /\b(gdpr|hipaa|regulation|compliance|statutory)\b/i},
    {id: 'constraint', label: 'Constraint', pattern: /\b(out of scope|not building|shall not|constraint)\b/i},
  ];

  const TERM_GROUPS = [
    {name: 'the person using the product', terms: ['account holder', 'end user', 'end-user', 'subscriber', 'customer', 'client', 'user']},
    {name: 'signing in', terms: ['sign-in', 'sign in', 'log on', 'logon', 'log in', 'login']},
    {name: 'the cart', terms: ['shopping cart', 'basket']},
  ];

  function byId(id) {
    return CHARACTERISTICS.find(item => item.id === id);
  }

  function stem(word) {
    let value = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!value) return '';
    if (value.endsWith('ies') && value.length > 4) value = value.slice(0, -3) + 'y';
    else if (value.endsWith('ing') && value.length > 6) value = value.slice(0, -3);
    else if (value.endsWith('ed') && value.length > 4) value = value.slice(0, -2);
    else if (value.endsWith('s') && !value.endsWith('ss') && value.length > 3) value = value.slice(0, -1);
    return value;
  }

  function tokens(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map(stem)
      .filter(word => word.length > 1 && !GENERIC.has(word));
  }

  function bodyOf(text) {
    return text
      .replace(/\bOwner\s*:[\s\S]*$/i, '')
      .replace(/\bREQ-[A-Z0-9-]+\.?\s*/i, '')
      .trim();
  }

  function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  function findWeasel(text) {
    const found = [];
    const lower = text.toLowerCase();
    for (const [pattern, label] of WEASEL) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i');
      if (regex.test(lower) && !found.includes(label)) found.push(label);
    }
    return found;
  }

  function actionVerbs(text) {
    const found = [];
    for (const token of tokens(text)) {
      if (VERBS.has(token) && !found.includes(token)) found.push(token);
    }
    return found;
  }

  function verbObject(text) {
    const words = tokens(bodyOf(text));
    const verbs = words.filter(word => VERBS.has(word));
    const nouns = words.filter(word => !VERBS.has(word));
    return {verb: verbs[0] || null, nouns, verbs};
  }

  function nounOverlap(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    const intersection = [...a].filter(word => b.has(word));
    const union = new Set([...a, ...b]);
    return {intersection, jaccard: union.size ? intersection.length / union.size : 0};
  }

  function isDuplicate(left, right) {
    if (!left.verb || left.verb !== right.verb) return false;
    const overlap = nounOverlap(left.nouns, right.nouns);
    if (!overlap.intersection.length) return false;
    const sameNouns = left.nouns.length && right.nouns.length && overlap.jaccard === 1;
    return sameNouns || (overlap.intersection.length >= 2 && overlap.jaccard >= 0.5);
  }

  function signature(parsed) {
    return `${parsed.verb} + ${parsed.nouns.join(', ')}`;
  }

  function isBoundary(text) {
    return /\b(out of scope|not building|won'?t build|will not build|shall not|do not build|don'?t build)\b/i.test(text);
  }

  function hasMeasure(text) {
    return /\b\d+(\.\d+)?\s*(%|percent|seconds?|secs?|minutes?|mins?|hours?|days?|users?|mbps|ms)\b/i.test(text)
      || /\b\d+(\.\d+)?%/.test(text)
      || /\b(same day|next day)\b/i.test(text);
  }

  function personName(value) {
    if (!value) return false;
    const head = value.split(',')[0].replace(/\.$/, '').trim();
    if (/product|team|engineering|stakeholder|business|tbd|tba|unassigned|everyone/i.test(head)) return false;
    const parts = head.split(/\s+/);
    return parts.length >= 2 && parts.slice(0, 2).every(part => /^[A-Z][a-zA-Z'’.-]+$/.test(part));
  }

  function inlineOwner(text) {
    const match = text.match(/\bOwner:\s*([^.]+)/i);
    return match ? match[1].trim() : null;
  }

  function hasSource(text) {
    const match = text.match(/\b(?:source|verified-by|verified by)\s*:\s*([^.]+)/i);
    if (!match) return false;
    return !/^(tbd|tba|n\/a|unknown|none|todo)$/i.test(match[1].trim());
  }

  function hasDate(text) {
    return /\b20\d{2}-\d{2}-\d{2}\b/.test(text) || /\blast reviewed\b/i.test(text);
  }

  function hasStableId(text) {
    return /\bREQ-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/i.test(text);
  }

  function styleOf(text) {
    if (/\bas an?\b[\s\S]+\bi want\b/i.test(text)) return 'user story';
    if (/\b(shall|must)\b/i.test(text)) return 'shall';
    return 'fragment';
  }

  function expandedAcronyms(note) {
    const found = new Set();
    for (const match of note.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,6}\s*\(([A-Z]{2,})\)/g)) {
      found.add(match[1].toUpperCase());
    }
    for (const match of note.matchAll(/\b([A-Z]{2,})\s*\([A-Za-z][^)]+\)/g)) {
      found.add(match[1].toUpperCase());
    }
    return found;
  }

  function acronymsIn(text) {
    const stripped = text.replace(/\bREQ-[A-Z0-9-]+\b/g, ' ');
    return [...new Set((stripped.match(/\b[A-Z]{2,}\b/g) || []))];
  }

  function contentWords(text) {
    return tokens(bodyOf(text)).filter(word => word.length > 3 && !VERBS.has(word));
  }

  function splitSentences(line) {
    if (/\bREQ-[A-Z0-9-]+/i.test(line) || /\bOwner\s*:/i.test(line) || /\bSource\s*:/i.test(line)) return [line];
    const parts = line.split(/(?<=[.!?])\s+/).map(part => part.trim()).filter(Boolean);
    return parts.length ? parts : [line];
  }

  function parse(note) {
    const scopeBits = [];
    const items = [];
    let runningOwner = null;
    for (const rawLine of String(note || '').split(/\r?\n/)) {
      const line = rawLine.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');
      if (!line) continue;
      const scopeMatch = line.match(/^(?:project|scope|purpose|goal|business need)\s*:\s*(.+)$/i);
      if (scopeMatch && !/\b(shall|must)\b/i.test(line)) {
        scopeBits.push(scopeMatch[1].trim());
        continue;
      }
      const ownerOnly = line.match(/^owner\s*:\s*(.+)$/i);
      if (ownerOnly && !/\b(shall|must|should)\b/i.test(line)) {
        runningOwner = ownerOnly[1].trim().replace(/\.$/, '');
        continue;
      }
      for (const chunk of splitSentences(line)) {
        if (wordCount(chunk) < 3) continue;
        items.push({
          text: chunk,
          owner: inlineOwner(chunk) || runningOwner,
        });
      }
    }
    return {scopeBits, items};
  }

  function fail(item, characteristic, evidence) {
    if (item.failures.some(entry => entry.characteristic === characteristic && entry.evidence === evidence)) return;
    item.failures.push({characteristic, evidence});
  }

  function labelFor(item) {
    return item.stableId || item.id;
  }

  function review(note, scopeInput = '') {
    const parsed = parse(note);
    const scope = [String(scopeInput || '').trim(), ...parsed.scopeBits].filter(Boolean).join(' ');
    const expansions = expandedAcronyms(String(note || ''));
    const scopeWords = new Set(contentWords(scope));

    const items = parsed.items.map((item, index) => ({
      id: `R${index + 1}`,
      stableId: hasStableId(item.text) ? item.text.match(/\bREQ-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/i)[0].toUpperCase() : null,
      text: item.text,
      owner: item.owner,
      style: styleOf(item.text),
      failures: [],
    }));

    items.forEach(item => {
      const body = bodyOf(item.text);
      const weasels = findWeasel(body);
      if (weasels.length) {
        fail(item, 'unambiguous', `Unbounded wording: ${weasels.map(word => `“${word}”`).join(', ')}. Two readers can pick different bars for each one.`);
      }
      if (/^(reports|emails|notifications|data|invoices)\b/i.test(body) && /\bshall\b/i.test(body)) {
        fail(item, 'unambiguous', 'The grammatical subject is the thing produced, so the actor who must do the work is unstated.');
      }

      const unknownAcronyms = acronymsIn(body).filter(token => !expansions.has(token));
      if (unknownAcronyms.length) {
        fail(item, 'clear', `${unknownAcronyms.join(', ')} ${unknownAcronyms.length === 1 ? 'is' : 'are'} not expanded anywhere in the note.`);
      }
      if (wordCount(body) > 50) {
        fail(item, 'clear', `The statement is ${wordCount(body)} words, which is hard to parse in one pass.`);
      }

      const fillers = [];
      for (const [pattern, name] of FILLERS) {
        pattern.lastIndex = 0;
        if (pattern.test(body) && !fillers.includes(name)) fillers.push(name);
      }
      if (fillers.length) {
        fail(item, 'concise', `These words can usually be cut without losing a constraint: ${fillers.map(word => `“${word}”`).join(', ')}.`);
      }

      const verbs = actionVerbs(body);
      if (verbs.length >= 2) {
        fail(item, 'cohesive', `More than one behaviour is joined here (${verbs.join(', ')}). Split them so each has its own test and owner.`);
      }

      if (!isBoundary(body)) {
        if (weasels.length && !hasMeasure(body)) {
          fail(item, 'testable', `A test cannot be written while ${weasels.map(word => `“${word}”`).join(', ')} ${weasels.length === 1 ? 'stands' : 'stand'} in for the pass condition.`);
        } else if (!hasMeasure(body) && wordCount(body) < 8 && !/\b(before|after|when|if|unless|within|including)\b/i.test(body)) {
          fail(item, 'testable', 'The statement is too thin to test: it has no measure, no condition, and no concrete expected result.');
        } else if (!verbs.length && !hasMeasure(body)) {
          fail(item, 'testable', 'There is no observable action or measure a tester could score the same way twice.');
        }
      }

      if (!/\bconstraint\b|\bexternal interface\b/i.test(item.text)) {
        const tech = [...body.matchAll(TECH)].map(match => match[0]);
        const controls = [...body.matchAll(UI_CONTROL)].map(match => match[0]);
        const hits = [...new Set([...tech, ...controls].map(hit => hit.toLowerCase()))];
        if (hits.length) {
          fail(item, 'implementation-independent', `Named technology or UI control: ${hits.join(', ')}. Restate the behaviour, and keep the product name only when an external interface is the requirement.`);
        }
      }

      if (!personName(item.owner)) {
        fail(item, 'owned', item.owner
          ? `The owner in force is “${item.owner}”. The check wants a named person, not a team or a placeholder.`
          : 'No owner is named. An unowned requirement has nobody to confirm it or settle a dispute.');
      }

      if (!isBoundary(body)) {
        if (!scope) {
          fail(item, 'relevant', 'No project scope or purpose is stated, so this requirement cannot be traced to a business need.');
        } else {
          const shared = contentWords(body).filter(word => scopeWords.has(word));
          if (!shared.length) {
            fail(item, 'relevant', `None of the content words appear in the stated scope (“${scope}”). Tie the requirement to that purpose, or mark it out of scope.`);
          }
        }
      }

      if (/\b99(\.\d+)?\s*%/.test(body) && /\b(accuracy|predict|churn)\b/i.test(body)) {
        fail(item, 'feasible', 'Predicting at 99% or better, as written, sits outside what a delivery team can honestly commit to.');
      }
      if (/\b(two|2)\s+years?\s+in advance\b/i.test(body)) {
        fail(item, 'feasible', 'A two-year advance prediction is not a deliverable constraint. Mark it feasibility-pending or narrow the claim.');
      }
      const regions = body.match(/\ball\s+(\d+)\s+(regional|regions|countries|markets|sites)\b/i);
      const rush = body.match(/\b(\d+)\s+weeks?\b/i);
      if (regions && rush && Number(rush[1]) <= 3) {
        fail(item, 'feasible', `Launching across ${regions[1]} ${regions[2]} in ${rush[1]} weeks leaves no room for the approvals that work usually needs.`);
      }

      if (!hasDate(item.text)) {
        fail(item, 'current', 'This requirement has no date and no last-reviewed mark, so a reader cannot tell whether it survived the latest scope change.');
      }
      if (!hasSource(item.text)) {
        fail(item, 'traceable', 'No source is named. There is nowhere to look up the interview, ticket, or regulation that produced this line.');
      }
      if (!hasStableId(item.text)) {
        const unstable = /\brequirement\s+\d+\b/i.test(item.text);
        fail(item, 'modifiable', unstable
          ? 'The identifier is a positional number, so it changes when the list is reordered.'
          : 'There is no stable identifier such as REQ-CHECKOUT-014, so a later edit cannot point at this line.');
      }
    });

    const setFindings = [];
    const parsedVerbs = items.map(item => verbObject(item.text));
    const duplicated = new Set();
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!isDuplicate(parsedVerbs[i], parsedVerbs[j])) continue;
        const key = `${i}:${j}`;
        if (duplicated.has(key)) continue;
        duplicated.add(key);
        const sig = signature(parsedVerbs[i]);
        fail(items[i], 'unique', `Same verb + object (${sig}) as ${labelFor(items[j])}: “${items[j].text}”`);
        fail(items[j], 'unique', `Same verb + object (${sig}) as ${labelFor(items[i])}: “${items[i].text}”`);
        setFindings.push({
          characteristic: 'unique',
          itemIds: [labelFor(items[i]), labelFor(items[j])],
          evidence: `${labelFor(items[i])} and ${labelFor(items[j])} share the verb + object pair ${sig}. Keep one, and point the other place at it.`,
        });
      }
    }

    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const clash = sessionClash(items[i].text, items[j].text) || accessClash(items[i].text, items[j].text);
        if (!clash) continue;
        fail(items[i], 'consistent', clash);
        fail(items[j], 'consistent', clash);
        setFindings.push({
          characteristic: 'consistent',
          itemIds: [labelFor(items[i]), labelFor(items[j])],
          evidence: `${labelFor(items[i])} and ${labelFor(items[j])}: ${clash}`,
        });
      }
    }

    for (const group of TERM_GROUPS) {
      const hits = [];
      for (const item of items) {
        let remaining = ` ${item.text} `;
        for (const term of [...group.terms].sort((a, b) => b.length - a.length)) {
          if (!containsTerm(remaining, term)) continue;
          hits.push({term, id: labelFor(item)});
          remaining = maskTerm(remaining, term);
        }
      }
      const byTerm = new Map();
      for (const hit of hits) {
        if (!byTerm.has(hit.term)) byTerm.set(hit.term, []);
        byTerm.get(hit.term).push(hit.id);
      }
      if (byTerm.size < 2) continue;
      const listed = [...byTerm.entries()].map(([term, ids]) => `“${term}” in ${[...new Set(ids)].join(', ')}`).join('; ');
      const evidence = `${group.name[0].toUpperCase()}${group.name.slice(1)} is named more than one way (${listed}). Pick one term and use it everywhere.`;
      const involved = [...new Set(hits.map(hit => hit.id))];
      for (const item of items) {
        if (involved.includes(labelFor(item))) fail(item, 'consistent', evidence);
      }
      setFindings.push({characteristic: 'consistent', itemIds: involved, evidence});
    }

    const styleCounts = countStyles(items);
    const stylesUsed = Object.entries(styleCounts).filter(([, count]) => count > 0);
    if (stylesUsed.length > 1) {
      setFindings.push({
        characteristic: 'conformant',
        itemIds: items.map(labelFor),
        evidence: `The catalogue mixes forms: ${stylesUsed.map(([style, count]) => `${count} ${style}`).join(', ')}. Pick one form and apply it to every line.`,
      });
    }

    const undated = items.filter(item => item.failures.some(entry => entry.characteristic === 'current'));
    if (undated.length) {
      setFindings.push({
        characteristic: 'current',
        itemIds: undated.map(labelFor),
        evidence: `${undated.length} of ${items.length} requirements have no review date. Anything older than the last scope change is suspect until someone dates it.`,
      });
    }

    const unstable = items.filter(item => !item.stableId);
    if (unstable.length) {
      setFindings.push({
        characteristic: 'modifiable',
        itemIds: unstable.map(labelFor),
        evidence: `${unstable.length} of ${items.length} requirements have no stable id. A reorder would break any cross-reference that uses position.`,
      });
    }

    const untraced = items.filter(item => item.failures.some(entry => entry.characteristic === 'traceable'));
    if (untraced.length) {
      setFindings.push({
        characteristic: 'traceable',
        itemIds: untraced.map(labelFor),
        evidence: `${untraced.length} of ${items.length} requirements name no source. Leave them in the log until an owner confirms where they came from.`,
      });
    }

    if (items.length) {
      const present = [];
      const missing = [];
      const corpus = items.map(item => item.text).join('\n');
      for (const category of CATEGORIES) {
        if (category.pattern.test(corpus)) present.push(category.label);
        else missing.push(category.label);
      }
      if (missing.length) {
        setFindings.push({
          characteristic: 'categorised',
          itemIds: [],
          evidence: `Detected: ${present.join(', ') || 'none'}. No requirements detected for: ${missing.join(', ')}. Confirm each empty category, and do not invent lines just to fill it.`,
        });
      }

      const techniques = ['category checklist', 'CRUD / lifecycle scan', 'failure-path scan'];
      const gaps = [];
      if (/\b(create|register|sign up|open)\b/i.test(corpus) && /\baccount\b/i.test(corpus) && !/\b(delete|deactivate|offboard|close the account|remove the account)\b/i.test(corpus)) {
        gaps.push('Accounts can be created, and nothing covers delete, deactivate, or offboarding.');
      }
      if (!/\b(error|fail|failed|unavailable|exception|outage)\b/i.test(corpus)) {
        gaps.push('No requirement describes what happens on failure, an error, or an unavailable dependency.');
      }
      if (gaps.length) {
        setFindings.push({
          characteristic: 'complete',
          itemIds: [],
          evidence: `${gaps.join(' ')} Techniques applied: ${techniques.join(', ')}. Completeness is not fully provable; this is the gap those passes can see.`,
        });
      }
    }

    for (const item of items) {
      const open = [...new Set(item.failures.map(entry => entry.characteristic))];
      if (!open.length) continue;
      const names = open.map(id => byId(id).name).join(', ');
      fail(item, 'correct', `Correct waits until the other checks pass. Still open: ${names}.`);
    }

    const openQuestions = [];
    const weaselItems = items.filter(item => item.failures.some(entry => entry.characteristic === 'unambiguous'));
    if (weaselItems.length) {
      openQuestions.push(`Quantify or remove the unbounded words on ${weaselItems.map(labelFor).join(', ')} before anyone treats those lines as agreed.`);
    }
    const unowned = items.filter(item => item.failures.some(entry => entry.characteristic === 'owned'));
    if (unowned.length) {
      openQuestions.push(`Name a person who can sign off ${unowned.map(labelFor).join(', ')}.`);
    }
    if (!scope) openQuestions.push('State the project scope or purpose so relevance can be checked against it.');
    const pending = items.filter(item => item.failures.some(entry => entry.characteristic === 'feasible'));
    if (pending.length) {
      openQuestions.push(`Feasibility is pending on ${pending.map(labelFor).join(', ')}. Record what would have to be true for each one.`);
    }
    if (items.length) {
      openQuestions.push('The note does not record that the owning stakeholder confirmed the wording.');
    }

    const failureCount = items.reduce((sum, item) => sum + item.failures.length, 0);
    return {
      scope,
      items,
      setFindings,
      openQuestions,
      counts: {
        items: items.length,
        itemFailures: failureCount,
        setFindings: setFindings.length,
      },
    };
  }

  function sessionClash(left, right) {
    const expiry = /session[\s\S]{0,80}(expire|inactivity)|(expire|inactivity)[\s\S]{0,80}session/i;
    const sticky = /session[\s\S]{0,80}(until the browser closes|remain active)|until the browser closes/i;
    if ((expiry.test(left) && sticky.test(right)) || (expiry.test(right) && sticky.test(left))) {
      return 'Session rules contradict: one ends the session after inactivity, and the other keeps it until the browser closes.';
    }
    return null;
  }

  function accessClash(left, right) {
    const open = /available to all users|all users shall|every user/i;
    const closed = /manager-level permission|only managers|require manager/i;
    const aboutReport = /report/i;
    if (!aboutReport.test(left) || !aboutReport.test(right)) return null;
    if ((open.test(left) && closed.test(right)) || (open.test(right) && closed.test(left))) {
      return 'Report access contradicts itself: one line opens the report to all users, and another requires Manager-level permission.';
    }
    return null;
  }

  function containsTerm(text, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[^a-z0-9]+');
    const plural = term.includes(' ') || term.includes('-') ? '' : 's?';
    return new RegExp(`(?:^|[^a-z0-9])${escaped}${plural}(?:[^a-z0-9]|$)`, 'i').test(text);
  }

  function maskTerm(text, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[^a-z0-9]+');
    const plural = term.includes(' ') || term.includes('-') ? '' : 's?';
    return text.replace(new RegExp(`(^|[^a-z0-9])${escaped}${plural}(?=[^a-z0-9]|$)`, 'gi'), '$1 ');
  }

  function countStyles(items) {
    return items.reduce((counts, item) => {
      counts[item.style] = (counts[item.style] || 0) + 1;
      return counts;
    }, {'shall': 0, 'user story': 0, fragment: 0});
  }

  return {
    CHARACTERISTICS,
    SAMPLE_CATALOGUE,
    SAMPLE_MESSY,
    review,
    verbObject,
    parse,
  };
});
