// Twenty variations of one fictional pricing card, split across five axes.
// The click-through figure is a formula in this file. It is not a measurement.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VariationLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRODUCT = 'Paper Kettle';
  const PRICE = '$48';
  const PERIOD = 'per year';
  const FEATURES = ['Version history', 'Offline drafts', 'A shared desk'];
  const VISITS = 2000;
  const MAX_PINS = 6;
  const BASE_TENTHS = 24;

  const AXES = [
    {
      id: 'layout',
      label: 'Layout',
      options: [
        {id: 'stacked', label: 'Stacked', short: 'Stacked'},
        {id: 'split', label: 'Split', short: 'Split'},
        {id: 'banner', label: 'Banner', short: 'Banner'},
        {id: 'compact', label: 'Compact', short: 'Compact'},
      ],
    },
    {
      id: 'type',
      label: 'Type',
      options: [
        {id: 'editorial', label: 'Editorial', short: 'Editorial'},
        {id: 'technical', label: 'Technical', short: 'Technical'},
        {id: 'poster', label: 'Poster', short: 'Poster'},
        {id: 'soft', label: 'Soft', short: 'Soft'},
      ],
    },
    {
      id: 'color',
      label: 'Color',
      options: [
        {id: 'ink', label: 'Ink', short: 'Ink'},
        {id: 'tide', label: 'Tide', short: 'Tide'},
        {id: 'clay', label: 'Clay', short: 'Clay'},
        {id: 'night', label: 'Night', short: 'Night'},
      ],
    },
    {
      id: 'copy',
      label: 'Copy',
      options: [
        {id: 'plain', label: 'Plain', short: 'Plain', plan: 'Pro', lede: 'A yearly desk for one person.', cta: 'Start the desk'},
        {id: 'direct', label: 'Direct', short: 'Direct', plan: 'Pro, yearly', lede: 'History, offline drafts, and a shared desk.', cta: 'Pay yearly'},
        {id: 'quiet', label: 'Quiet', short: 'Quiet', plan: 'The yearly desk', lede: 'A calmer place to keep drafts.', cta: 'Continue'},
        {id: 'urgent', label: 'Urgent', short: 'Urgent', plan: 'Open rate', lede: 'Lock the yearly price on this sketch.', cta: 'Take the rate'},
      ],
    },
    {
      id: 'radius',
      label: 'Radius / shadow',
      options: [
        {id: 'flat', label: 'Flat', short: 'Flat'},
        {id: 'soft', label: 'Soft', short: 'Soft'},
        {id: 'lifted', label: 'Lifted', short: 'Lifted'},
        {id: 'sharp', label: 'Sharp', short: 'Sharp'},
      ],
    },
  ];

  const COLORS = {
    ink: {bg: '#fffdf8', fg: '#1c1917', muted: '#5e564c', accent: '#1c1917', onAccent: '#fffdf8', line: '#e4dcd0'},
    tide: {bg: '#f3faf8', fg: '#102421', muted: '#3d5c57', accent: '#0c6e66', onAccent: '#f4fffd', line: '#cfe3df'},
    clay: {bg: '#fbf6f2', fg: '#2c1812', muted: '#6d4c40', accent: '#a33b1e', onAccent: '#fff8f4', line: '#ead9cf'},
    night: {bg: '#171513', fg: '#f6f1e8', muted: '#cbbba8', accent: '#e2b15a', onAccent: '#1c1408', line: '#3a342c'},
  };

  // Integer tenths of a percent, so the parts on screen add up to the rate.
  const WEIGHTS = {
    layout: {stacked: 4, split: 2, banner: 6, compact: 0},
    type: {editorial: 2, technical: 0, poster: 4, soft: 2},
    color: {ink: 1, tide: 4, clay: 3, night: 2},
    copy: {plain: 1, direct: 7, quiet: 0, urgent: 8},
    radius: {flat: 0, soft: 3, lifted: 2, sharp: 0},
  };

  const FORMULA = 'Simulated rate = base + layout + type + color + copy + radius + a mix term, in tenths of a percent. The same mix always makes the same number. It is not a user test.';

  function option(axisId, optionId) {
    const axis = AXES.find(function (item) { return item.id === axisId; });
    if (!axis) throw new Error('Unknown axis: ' + axisId);
    const found = axis.options.find(function (item) { return item.id === optionId; });
    if (!found) throw new Error('Unknown option: ' + axisId + ':' + optionId);
    return found;
  }

  function defaultSelection() {
    return {layout: 'banner', type: 'editorial', color: 'tide', copy: 'direct', radius: 'soft'};
  }

  function cloneSelection(selection) {
    const out = {};
    for (const axis of AXES) {
      option(axis.id, selection[axis.id]);
      out[axis.id] = selection[axis.id];
    }
    return out;
  }

  function describe(selection) {
    const chosen = cloneSelection(selection);
    const copy = option('copy', chosen.copy);
    return {
      product: PRODUCT,
      fictional: true,
      price: PRICE,
      period: PERIOD,
      features: FEATURES.slice(),
      layout: chosen.layout,
      type: chosen.type,
      radius: chosen.radius,
      color: COLORS[chosen.color],
      colorId: chosen.color,
      plan: copy.plan,
      lede: copy.lede,
      cta: copy.cta,
      selection: chosen,
    };
  }

  function mixTenths(selection) {
    if (selection.copy === 'urgent' && selection.type === 'poster') {
      return {tenths: 4, label: 'Urgent copy with poster type'};
    }
    if (selection.copy === 'quiet' && selection.color === 'night') {
      return {tenths: -2, label: 'Quiet copy on a night card'};
    }
    return null;
  }

  function simulate(selection) {
    const chosen = cloneSelection(selection);
    const parts = [{id: 'base', label: 'Base', tenths: BASE_TENTHS}];
    let total = BASE_TENTHS;
    for (const axis of AXES) {
      const tenths = WEIGHTS[axis.id][chosen[axis.id]];
      total += tenths;
      parts.push({
        id: axis.id,
        label: axis.label + ' · ' + option(axis.id, chosen[axis.id]).short,
        tenths: tenths,
      });
    }
    const mix = mixTenths(chosen);
    if (mix) {
      total += mix.tenths;
      parts.push({id: 'mix', label: mix.label, tenths: mix.tenths});
    }
    return {
      simulated: true,
      visits: VISITS,
      tenths: total,
      rate: total / 10,
      clicks: Math.round(VISITS * (total / 10) / 100),
      parts: parts,
      formula: FORMULA,
    };
  }

  function formatTenths(tenths, signed) {
    const text = (tenths / 10).toFixed(1);
    if (!signed) return text;
    if (tenths > 0) return '+' + text;
    return text;
  }

  function pinKey(selection) {
    return AXES.map(function (axis) { return selection[axis.id]; }).join('.');
  }

  function pinLabel(selection) {
    return AXES.map(function (axis) { return option(axis.id, selection[axis.id]).short; }).join(' · ');
  }

  function addPin(pins, selection) {
    const chosen = cloneSelection(selection);
    const key = pinKey(chosen);
    if (pins.some(function (pin) { return pin.key === key; })) return {pins: pins, added: false, reason: 'already'};
    if (pins.length >= MAX_PINS) return {pins: pins, added: false, reason: 'full'};
    const next = pins.concat([{key: key, selection: chosen, label: pinLabel(chosen)}]);
    return {pins: next, added: true, reason: 'added'};
  }

  function removePin(pins, key) {
    return pins.filter(function (pin) { return pin.key !== key; });
  }

  function optionCount() {
    return AXES.reduce(function (sum, axis) { return sum + axis.options.length; }, 0);
  }

  return {
    PRODUCT: PRODUCT,
    AXES: AXES,
    COLORS: COLORS,
    WEIGHTS: WEIGHTS,
    FORMULA: FORMULA,
    MAX_PINS: MAX_PINS,
    VISITS: VISITS,
    option: option,
    defaultSelection: defaultSelection,
    cloneSelection: cloneSelection,
    describe: describe,
    simulate: simulate,
    formatTenths: formatTenths,
    pinKey: pinKey,
    pinLabel: pinLabel,
    addPin: addPin,
    removePin: removePin,
    optionCount: optionCount,
  };
});
