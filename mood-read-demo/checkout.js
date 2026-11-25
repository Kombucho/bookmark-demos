// Rules for the mock desk: what locks Pay, which field is next,
// and where a buried setting actually lives.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Checkout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SAVE_MS = 2200;
  const DESK_HOLD_MS = 4 * 60 * 1000;

  const SETTINGS = [
    {
      id: 'lots',
      title: 'Lot numbers',
      hint: 'Receipts, inside Preferences',
      keys: 'lot numbers receipt paper',
      open: ['account', 'prefs', 'receipts'],
      focus: 'lots',
    },
    {
      id: 'gift',
      title: 'Gift note',
      hint: 'Receipts, inside Preferences',
      keys: 'gift note message',
      open: ['account', 'prefs', 'receipts'],
      focus: 'gift',
    },
    {
      id: 'terms',
      title: 'Warehouse terms',
      hint: 'Delivery notes, above Pay',
      keys: 'terms warehouse pay delivery',
      open: ['delivery'],
      focus: 'terms',
    },
    {
      id: 'hold',
      title: 'Desk hold',
      hint: 'The timer on this order',
      keys: 'hold timer pause desk',
      open: [],
      focus: 'hold-readout',
    },
  ];

  function emptyForm() {
    return {
      name: '',
      street: '',
      date: '',
      email: '',
      promo: '',
      terms: false,
      lots: false,
      gift: '',
    };
  }

  function parseShipDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
    if (!match) return { ok: false };
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (year < 1900 || year > 2100 || month < 1 || month > 12) return { ok: false };
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
      return { ok: false };
    }
    return { ok: true, day: day, month: month, year: year };
  }

  function payLock(form) {
    const parts = [];
    if (!String(form.name || '').trim()) {
      parts.push({ code: 'name', vague: 'The order is incomplete.', clear: 'A name is still missing.' });
    }
    if (!String(form.street || '').trim()) {
      parts.push({ code: 'street', vague: 'The order is incomplete.', clear: 'A street is still missing.' });
    }
    if (!parseShipDate(form.date).ok) {
      parts.push({
        code: 'date',
        vague: 'The ship date was not accepted.',
        clear: 'The ship date has to be a real day as DD/MM/YYYY, such as 25/11/2026.',
      });
    }
    if (!form.terms) {
      parts.push({
        code: 'terms',
        vague: 'Payment is not open yet.',
        clear: 'Pay stays off until Warehouse terms is checked. It sits inside Delivery notes.',
      });
    }
    if (!parts.length) {
      return { locked: false, vague: '', clear: '', signature: 'open' };
    }
    return {
      locked: true,
      vague: parts[0].vague,
      clear: parts.map(function (part) { return part.clear; }).join(' '),
      signature: parts.map(function (part) { return part.code; }).join('+') + '|' + String(form.date || '').trim(),
    };
  }

  function nextStep(form) {
    if (!String(form.name || '').trim()) return { id: 'name', label: 'Name' };
    if (!String(form.street || '').trim()) return { id: 'street', label: 'Street' };
    if (!parseShipDate(form.date).ok) return { id: 'date', label: 'Ship date, written DD/MM/YYYY' };
    if (!form.terms) return { id: 'delivery', label: 'Warehouse terms, inside Delivery notes' };
    return { id: 'pay', label: 'Pay' };
  }

  function findSettings(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return SETTINGS.slice();
    return SETTINGS.filter(function (row) {
      const hay = (row.title + ' ' + row.hint + ' ' + row.keys).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function promoDisabled(code) {
    return String(code || '').trim().length < 4;
  }

  return {
    SAVE_MS: SAVE_MS,
    DESK_HOLD_MS: DESK_HOLD_MS,
    SETTINGS: SETTINGS,
    emptyForm: emptyForm,
    parseShipDate: parseShipDate,
    payLock: payLock,
    nextStep: nextStep,
    findSettings: findSettings,
    promoDisabled: promoDisabled,
  };
});
