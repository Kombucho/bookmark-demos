// A diff carries flags. A constraint is a rule that checks one.
// The first matching rule stops the diff. What no rule stops
// spends review minutes, or ships and becomes an incident.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ConstraintGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REVIEW_BUDGET = 16;

  const TOGGLES = [
    {id: 'types', label: 'Type checker', detail: 'Types, and a promise that was thrown away.'},
    {id: 'lintFloating', label: 'No floating promises', detail: 'Lint'},
    {id: 'lintSql', label: 'No raw SQL', detail: 'Lint'},
    {id: 'lintBoundary', label: 'Import boundaries', detail: 'Lint'},
    {id: 'lintCatch', label: 'No empty catch', detail: 'Lint'},
    {id: 'lintMagic', label: 'No magic numbers', detail: 'Lint'},
    {id: 'abstraction', label: 'Locked abstraction', detail: 'The query builder and payments.charge are the only doors.'},
    {id: 'tests', label: 'Tests', detail: 'A new branch needs a test.'},
    {id: 'observability', label: 'Observability', detail: 'A failure path needs an alert.'},
  ];

  const GATES = [
    {id: 'types', label: 'Type checker'},
    {id: 'lint', label: 'Lint'},
    {id: 'abstraction', label: 'Abstraction'},
    {id: 'tests', label: 'Tests'},
    {id: 'observability', label: 'Alerts'},
    {id: 'review', label: 'Review'},
    {id: 'production', label: 'Production'},
  ];

  const RULES = [
    {
      id: 'types-error',
      toggle: 'types',
      flag: 'typeError',
      gate: 'types',
      evidence: 'Argument of type string is not assignable to number.',
    },
    {
      id: 'types-promise',
      toggle: 'types',
      flag: 'floatingPromise',
      gate: 'types',
      evidence: 'A Promise was discarded.',
    },
    {
      id: 'lint-floating',
      toggle: 'lintFloating',
      flag: 'floatingPromise',
      gate: 'lint',
      evidence: 'no-floating-promises: this promise is not awaited or returned.',
    },
    {
      id: 'lint-sql',
      toggle: 'lintSql',
      flag: 'rawSql',
      gate: 'lint',
      evidence: 'no-raw-sql: a query was built from a string.',
    },
    {
      id: 'lint-boundary',
      toggle: 'lintBoundary',
      flag: 'crossLayer',
      gate: 'lint',
      evidence: 'boundaries: billing imported a module from ui.',
    },
    {
      id: 'lint-catch',
      toggle: 'lintCatch',
      flag: 'silentCatch',
      gate: 'lint',
      evidence: 'no-empty-catch: the catch block swallows the error.',
    },
    {
      id: 'lint-magic',
      toggle: 'lintMagic',
      flag: 'magicNumber',
      gate: 'lint',
      evidence: 'no-magic-numbers: 0.0825 is not a named constant.',
    },
    {
      id: 'abstraction-sql',
      toggle: 'abstraction',
      flag: 'rawSql',
      gate: 'abstraction',
      evidence: 'db.query accepts a Query. This argument is a string.',
    },
    {
      id: 'abstraction-client',
      toggle: 'abstraction',
      flag: 'rawClient',
      gate: 'abstraction',
      evidence: 'payments exposes charge(). This file calls fetch.',
    },
    {
      id: 'tests-branch',
      toggle: 'tests',
      flag: 'untested',
      gate: 'tests',
      evidence: 'The HOLIDAY branch has no test. The coverage gate failed.',
    },
    {
      id: 'alerts-path',
      toggle: 'observability',
      flag: 'unobserved',
      gate: 'observability',
      evidence: 'The failure path emits no alert. The release check refused it.',
    },
  ];

  const CHANGES = [
    {
      id: 'fmt-date',
      author: 'agent',
      title: 'Format the invoice date',
      file: 'billing/format.js',
      reviewMinutes: 2,
      flags: {},
      snippet: 'export function formatDate(d) {\n  return d.toISOString().slice(0, 10);\n}',
    },
    {
      id: 'load-customer',
      author: 'agent',
      title: 'Load the customer',
      file: 'billing/customer.js',
      reviewMinutes: 4,
      flags: {floatingPromise: true},
      snippet: 'export function loadCustomer(id) {\n  fetch(`/customers/${id}`);\n}',
      incident: {
        name: 'Checkout never settles',
        detail: 'A rejected fetch was ignored. The button spun until the tab was closed.',
      },
    },
    {
      id: 'search-orders',
      author: 'human',
      title: 'Search orders by name',
      file: 'orders/search.js',
      reviewMinutes: 4,
      flags: {rawSql: true},
      snippet: 'const sql = `SELECT * FROM orders WHERE name = \'${q}\'`;\ndb.query(sql);',
      incident: {
        name: 'The morning report came back empty',
        detail: 'A quote in the search box changed the orders query.',
      },
    },
    {
      id: 'import-button',
      author: 'agent',
      title: 'Add a resend button on the receipt job',
      file: 'billing/receipt.js',
      reviewMinutes: 4,
      flags: {crossLayer: true},
      snippet: 'import { Button } from \'../ui/Button\';\n\nexport function receiptActions() {\n  return Button({ label: \'Resend\' });\n}',
      incident: {
        name: 'The nightly billing run crashed',
        detail: 'The job imported a browser button and died on window.',
      },
    },
    {
      id: 'retry-charge',
      author: 'agent',
      title: 'Retry a declined charge',
      file: 'payments/retry.js',
      reviewMinutes: 4,
      flags: {silentCatch: true},
      snippet: 'try {\n  await charge(card);\n} catch (err) {}',
      incident: {
        name: 'A declined charge looked paid',
        detail: 'The error was swallowed. The receipt said paid.',
      },
    },
    {
      id: 'tax-rate',
      author: 'human',
      title: 'Apply sales tax',
      file: 'billing/tax.js',
      reviewMinutes: 3,
      flags: {magicNumber: true},
      snippet: 'export function tax(cents) {\n  return Math.round(cents * 0.0825);\n}',
      incident: {
        name: 'Two receipts disagreed',
        detail: 'Tax stayed 0.0825 in this file after the rate changed in the other.',
      },
    },
    {
      id: 'holiday-discount',
      author: 'agent',
      title: 'Honor the holiday code',
      file: 'billing/discount.js',
      reviewMinutes: 4,
      flags: {untested: true},
      snippet: 'if (code === \'HOLIDAY\') {\n  total = apply(total, holidayRate);\n}',
      incident: {
        name: 'The holiday code applied twice',
        detail: 'The new branch had no test. A second pass discounted the same cart.',
      },
    },
    {
      id: 'user-id',
      author: 'agent',
      title: 'Open an account from the route',
      file: 'accounts/open.ts',
      reviewMinutes: 3,
      flags: {typeError: true},
      snippet: 'function openAccount(id: string) {\n  return lookup(id);\n}\n\nfunction lookup(id: number) {\n  return accounts[id];\n}',
      incident: {
        name: 'The wrong account opened',
        detail: 'A string id was concatenated instead of matched.',
      },
    },
    {
      id: 'raw-charge',
      author: 'human',
      title: 'Charge the card directly',
      file: 'payments/go.js',
      reviewMinutes: 4,
      flags: {rawClient: true},
      snippet: 'await fetch(\'https://pay.internal/charge\', {\n  method: \'POST\',\n  body: JSON.stringify({ card, cents }),\n});',
      incident: {
        name: 'A retry charged the card twice',
        detail: 'The call skipped payments.charge and its idempotency key.',
      },
    },
    {
      id: 'ship-fail',
      author: 'agent',
      title: 'Dispatch a shipment',
      file: 'shipping/dispatch.js',
      reviewMinutes: 3,
      flags: {unobserved: true},
      snippet: 'export async function dispatch(id) {\n  const ok = await carrier.send(id);\n  if (!ok) return;\n}',
      incident: {
        name: 'Dispatch failed for an hour',
        detail: 'The carrier refused the batch. No alert fired.',
      },
    },
    {
      id: 'saturday-close',
      author: 'human',
      title: 'Set Saturday closing time',
      file: 'hours/close.js',
      reviewMinutes: 6,
      flags: {judgment: true},
      snippet: 'export function closesAt(day) {\n  if (day === \'saturday\') return \'18:00\';\n  return \'17:00\';\n}',
      incident: {
        name: 'The counter shut an hour late',
        detail: 'Saturday close is 17:00. The diff said 18:00, and no rule knows the shop.',
      },
    },
    {
      id: 'rename-label',
      author: 'agent',
      title: 'Rename the resend label',
      file: 'ui/copy.js',
      reviewMinutes: 2,
      flags: {},
      snippet: 'export const resendLabel = \'Send the receipt again\';',
    },
  ];

  function defaultConstraints() {
    const constraints = {};
    TOGGLES.forEach(function (toggle) {
      constraints[toggle.id] = true;
    });
    return constraints;
  }

  function knownToggle(id) {
    return TOGGLES.some(function (toggle) { return toggle.id === id; });
  }

  function createRun(options) {
    const constraints = defaultConstraints();
    const over = options && options.constraints;
    if (over) {
      Object.keys(over).forEach(function (key) {
        if (!knownToggle(key)) throw new Error('Unknown constraint.');
        constraints[key] = Boolean(over[key]);
      });
    }
    const budget = options && options.budget != null ? options.budget : REVIEW_BUDGET;
    if (!Number.isInteger(budget) || budget < 0) throw new Error('Budget must be a whole number.');
    return {
      constraints: constraints,
      reviewLeft: budget,
      reviewBudget: budget,
      cursor: 0,
      results: [],
    };
  }

  function setConstraint(state, id, on) {
    if (!knownToggle(id)) throw new Error('Unknown constraint.');
    const constraints = Object.assign({}, state.constraints);
    constraints[id] = Boolean(on);
    return {
      constraints: constraints,
      reviewLeft: state.reviewLeft,
      reviewBudget: state.reviewBudget,
      cursor: state.cursor,
      results: state.results,
    };
  }

  function hasDefect(change) {
    return Object.keys(change.flags).some(function (key) { return change.flags[key]; });
  }

  function firstRule(change, constraints) {
    return RULES.find(function (rule) {
      return constraints[rule.toggle] && change.flags[rule.flag];
    }) || null;
  }

  function submitNext(state) {
    if (state.cursor >= CHANGES.length) return state;
    const change = CHANGES[state.cursor];
    const rule = firstRule(change, state.constraints);
    let reviewLeft = state.reviewLeft;
    let result;
    if (rule) {
      result = {
        id: change.id,
        outcome: 'caught',
        gate: rule.gate,
        rule: rule.id,
        evidence: rule.evidence,
        reviewMinutes: 0,
        reviewed: false,
        incident: null,
      };
    } else if (reviewLeft >= change.reviewMinutes) {
      reviewLeft -= change.reviewMinutes;
      if (hasDefect(change)) {
        result = {
          id: change.id,
          outcome: 'caught',
          gate: 'review',
          rule: 'review',
          evidence: 'A reviewer had the minutes to read this diff.',
          reviewMinutes: change.reviewMinutes,
          reviewed: true,
          incident: null,
        };
      } else {
        result = {
          id: change.id,
          outcome: 'shipped',
          gate: null,
          rule: null,
          evidence: 'Reviewed. The diff had no defect.',
          reviewMinutes: change.reviewMinutes,
          reviewed: true,
          incident: null,
        };
      }
    } else if (hasDefect(change)) {
      result = {
        id: change.id,
        outcome: 'incident',
        gate: null,
        rule: null,
        evidence: 'Review did not have the minutes. The diff shipped.',
        reviewMinutes: 0,
        reviewed: false,
        incident: {name: change.incident.name, detail: change.incident.detail},
      };
    } else {
      result = {
        id: change.id,
        outcome: 'shipped',
        gate: null,
        rule: null,
        evidence: 'Shipped without a reviewer. The diff had no defect.',
        reviewMinutes: 0,
        reviewed: false,
        incident: null,
      };
    }
    return {
      constraints: state.constraints,
      reviewLeft: reviewLeft,
      reviewBudget: state.reviewBudget,
      cursor: state.cursor + 1,
      results: state.results.concat(result),
    };
  }

  function runAll(state) {
    let next = state;
    while (next.cursor < CHANGES.length) next = submitNext(next);
    return next;
  }

  function changeById(id) {
    return CHANGES.find(function (change) { return change.id === id; }) || null;
  }

  function authorLabel(author) {
    return author === 'human' ? 'Hurried human' : 'Agent';
  }

  function summarize(state) {
    const caught = {types: 0, lint: 0, abstraction: 0, tests: 0, observability: 0, review: 0};
    let shipped = 0;
    let shippedUnreviewed = 0;
    let incidents = 0;
    let reviewSpent = 0;
    let reviewOnAutomatable = 0;
    state.results.forEach(function (result) {
      reviewSpent += result.reviewMinutes;
      if (result.outcome === 'caught') {
        caught[result.gate] += 1;
        if (result.gate === 'review') {
          const change = changeById(result.id);
          const automatable = RULES.some(function (rule) { return change.flags[rule.flag]; });
          if (automatable) reviewOnAutomatable += result.reviewMinutes;
        }
      } else if (result.outcome === 'incident') {
        incidents += 1;
      } else {
        shipped += 1;
        if (!result.reviewed) shippedUnreviewed += 1;
      }
    });
    return {
      caught: caught,
      shipped: shipped,
      shippedUnreviewed: shippedUnreviewed,
      incidents: incidents,
      reviewLeft: state.reviewLeft,
      reviewSpent: reviewSpent,
      reviewBudget: state.reviewBudget,
      reviewOnAutomatable: reviewOnAutomatable,
      done: state.cursor >= CHANGES.length,
      remaining: CHANGES.length - state.cursor,
      seen: state.cursor,
    };
  }

  function narrate(summary) {
    const stopped = Object.keys(summary.caught).reduce(function (sum, key) {
      return sum + summary.caught[key];
    }, 0);
    return 'Review has ' + summary.reviewLeft + ' minutes left. ' +
      stopped + ' diffs were stopped. ' +
      summary.shipped + ' shipped. ' +
      summary.incidents + ' incidents.';
  }

  return {
    REVIEW_BUDGET: REVIEW_BUDGET,
    TOGGLES: TOGGLES,
    GATES: GATES,
    RULES: RULES,
    CHANGES: CHANGES,
    defaultConstraints: defaultConstraints,
    createRun: createRun,
    setConstraint: setConstraint,
    submitNext: submitNext,
    runAll: runAll,
    changeById: changeById,
    authorLabel: authorLabel,
    summarize: summarize,
    narrate: narrate,
  };
});
