const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('./behaviors.js');

test('each behavior passes on and stays quiet when it is off', () => {
  kit.BEHAVIORS.forEach((behavior) => {
    const on = kit.runScenario(behavior.id, true);
    const off = kit.runScenario(behavior.id, false);
    assert.equal(on.pass, true, behavior.id + ' on ' + JSON.stringify(on.lines));
    assert.equal(off.pass, true, behavior.id + ' off ' + JSON.stringify(off.lines));
    assert.ok(on.lines.length >= 1);
  });
});

test('the spec lists only the behaviors that are on, under their library names', () => {
  const none = kit.specText(kit.blankBehaviors());
  assert.match(none, /behaviors:\n {2}\[\]/);
  const all = kit.specText(kit.allOn());
  [
    'press: {}',
    'openOnHover: { delay: 600, closeDelay: 300 }',
    'bindLayer: { dismiss: [escape-key, outside-press] }',
    'createRovingFocus: { orientation: vertical }',
    'createTypeahead: {}',
    'createSelection: { multiple: false }',
    'createReorder: { threshold: 3 }',
  ].forEach((line) => {
    assert.ok(all.includes(line), line);
  });
  const only = kit.blankBehaviors();
  only.createTypeahead = true;
  const text = kit.specText(only);
  assert.match(text, /createTypeahead/);
  assert.equal(text.includes('createReorder'), false);
  assert.equal(text.includes('press:'), false);
});

test('hover can be cancelled, and moving into the panel keeps it open', () => {
  const behaviors = kit.blankBehaviors();
  behaviors.openOnHover = true;
  let state = kit.initialState(false);
  state = kit.reduce(state, {type: 'pointerenter', target: 'trigger', now: 0}, behaviors);
  state = kit.reduce(state, {type: 'pointerleave', target: 'trigger', now: 100}, behaviors);
  state = kit.reduce(state, {type: 'clock', now: 600}, behaviors);
  assert.equal(state.open, false);

  state = kit.initialState(false);
  state = kit.reduce(state, {type: 'pointerenter', target: 'trigger', now: 0}, behaviors);
  state = kit.reduce(state, {type: 'clock', now: 600}, behaviors);
  assert.equal(state.open, true);
  assert.equal(state.lastReason, 'trigger-hover');
  state = kit.reduce(state, {type: 'pointerleave', target: 'trigger', now: 600}, behaviors);
  state = kit.reduce(state, {type: 'pointerenter', target: 'panel', now: 700}, behaviors);
  state = kit.reduce(state, {type: 'clock', now: 1200}, behaviors);
  assert.equal(state.open, true);

  state = kit.reduce(state, {type: 'focusout', to: 'outside', now: 1200}, behaviors);
  state = kit.reduce(state, {type: 'clock', now: 1499}, behaviors);
  assert.equal(state.open, true);
  state = kit.reduce(state, {type: 'clock', now: 1500}, behaviors);
  assert.equal(state.open, false);
});

test('typeahead, selection, and reorder compose, and a short drag does not count', () => {
  const behaviors = kit.allOn();
  let state = kit.initialState(true);
  state = kit.reduce(state, {type: 'keydown', key: 'p', target: 'item', now: 0}, behaviors);
  assert.equal(state.items[state.focus].id, 'pine');
  state = kit.reduce(state, {type: 'keydown', key: 'ArrowDown', target: 'item', now: 10}, behaviors);
  assert.equal(state.items[state.focus].id, 'yew');
  state = kit.reduce(state, {type: 'click', target: 'item', index: 2, id: state.items[2].id, dragged: false, now: 20}, behaviors);
  const selected = state.selected;
  assert.equal(selected, 'elm');
  state = kit.reduce(state, {type: 'keydown', key: 'ArrowDown', alt: true, target: 'item', now: 30}, behaviors);
  assert.equal(state.selected, 'elm');
  assert.notEqual(state.items[2].id, 'elm');

  state = kit.initialState(true);
  state = kit.reduce(state, {type: 'pointerdown', target: 'item', index: 0, id: 'oak', now: 0}, behaviors);
  state = kit.reduce(state, {type: 'pointermove', distance: 2, overIndex: 4, now: 0}, behaviors);
  assert.equal(state.items.map((item) => item.id).join(','), kit.ORIGINAL);
  state = kit.reduce(state, {type: 'pointermove', distance: kit.DRAG_THRESHOLD, overIndex: 4, now: 0}, behaviors);
  assert.equal(state.items.map((item) => item.id).join(','), 'ash,elm,birch,pine,oak,yew');
  assert.equal(state.pressed, null);
});

test('keyboard focus uses the same hover delay, and Escape names its reason', () => {
  const behaviors = kit.blankBehaviors();
  behaviors.openOnHover = true;
  behaviors.bindLayer = true;
  let state = kit.initialState(false);
  state = kit.reduce(state, {type: 'focus', target: 'trigger', now: 0}, behaviors);
  state = kit.reduce(state, {type: 'clock', now: 599}, behaviors);
  assert.equal(state.open, false);
  state = kit.reduce(state, {type: 'clock', now: 600}, behaviors);
  assert.equal(state.open, true);
  assert.equal(kit.keyClaims(state, {key: 'Escape'}, behaviors), true);
  state = kit.reduce(state, {type: 'keydown', key: 'Escape', target: 'list', now: 700}, behaviors);
  assert.equal(state.open, false);
  assert.equal(state.lastReason, 'escape-key');
  assert.equal(kit.statusText(state), 'Dismissed · escape-key.');
  assert.match(kit.instructions(behaviors), /600 ms/);
  assert.match(kit.instructions(kit.blankBehaviors()), /plain buttons/);
});
