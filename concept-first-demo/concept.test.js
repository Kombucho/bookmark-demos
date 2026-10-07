const assert = require('node:assert/strict');
const test = require('node:test');
const {
  APPS,
  genericFor,
  directionsFor,
  directionById,
  measure,
  critique,
  refineScreen,
  createSession,
  chooseApp,
  chooseDirection,
  runCritique,
  runRefine,
  present,
} = require('./concept.js');

function flaggedIds(screen) {
  return critique(screen).filter(function (item) { return item.flagged; }).map(function (item) { return item.id; });
}

function structure(screen) {
  return screen.blocks.filter(function (block) { return block.kind !== 'chip'; }).map(function (block) { return block.kind; }).join('+');
}

test('four apps each have a dashboard template and three directions', function () {
  assert.deepEqual(APPS.map(function (app) { return app.id; }), ['lane', 'hearth', 'pressed', 'scopa']);
  const genericKinds = APPS.map(function (app) {
    return genericFor(app.id).blocks.map(function (block) { return block.kind; }).join();
  });
  assert.equal(new Set(genericKinds).size, 1);
  APPS.forEach(function (app) {
    const generic = genericFor(app.id);
    assert.equal(generic.layout, 'dashboard');
    assert.equal(generic.gradients.length, 2);
    const directions = directionsFor(app.id);
    assert.equal(directions.length, 3);
    assert.equal(new Set(directions.map(function (item) { return item.layout; })).size, 3);
    assert.equal(new Set(directions.map(structure)).size, 3);
    directions.forEach(function (item) {
      assert.notEqual(item.layout, 'dashboard');
      assert.ok(item.scene);
      assert.ok(item.line.length > 0);
    });
  });
  const layouts = [];
  APPS.forEach(function (app) {
    directionsFor(app.id).forEach(function (item) { layouts.push(item.layout); });
  });
  assert.equal(new Set(layouts).size, 12);
});

test('critique reads measurements and flags the template on every check', function () {
  APPS.forEach(function (app) {
    const generic = genericFor(app.id);
    const measured = measure(generic);
    assert.equal(measured.repetition, 3);
    assert.equal(measured.gradients, 2);
    assert.equal(measured.radius, 16);
    assert.equal(measured.typeSizes, 2);
    assert.equal(measured.layout, 'dashboard');
    assert.ok(measured.spacing.some(function (value) { return value % 4 !== 0; }));
    assert.deepEqual(flaggedIds(generic), ['repetition', 'gradients', 'radius', 'type', 'spacing', 'template']);
  });
  const lane = genericFor('lane');
  const twin = JSON.parse(JSON.stringify(lane));
  twin.name = 'Something else';
  twin.line = 'Different words';
  assert.deepEqual(flaggedIds(lane), flaggedIds(twin));
});

test('each direction is flagged, and the three directions in an app cover every tell', function () {
  APPS.forEach(function (app) {
    const union = new Set();
    directionsFor(app.id).forEach(function (screen) {
      const flags = flaggedIds(screen);
      assert.ok(flags.length >= 2, screen.id);
      assert.equal(flags.indexOf('template'), -1);
      flags.forEach(function (id) { union.add(id); });
      const refined = refineScreen(screen);
      assert.deepEqual(flaggedIds(refined), []);
      assert.equal(refined.layout, screen.layout);
      assert.equal(refined.scene && refined.name, screen.name);
      assert.deepEqual(refineScreen(refined), refined);
    });
    ['repetition', 'gradients', 'radius', 'type', 'spacing'].forEach(function (id) {
      assert.ok(union.has(id), app.id + ' ' + id);
    });
  });
});

test('refine clears the template tells it can, and leaves the dashboard layout', function () {
  const refined = refineScreen(genericFor('pressed'));
  assert.deepEqual(flaggedIds(refined), ['template']);
  assert.equal(measure(refined).gradients, 0);
  assert.ok(measure(refined).repetition < 3);
  assert.ok(measure(refined).typeSizes >= 3);
  assert.ok(measure(refined).spacing.every(function (value) { return value % 4 === 0; }));
  assert.equal(measure(refined).radius, null);
  assert.deepEqual(refineScreen(refined), refined);
});

test('refine grows a weak type scale and drops a repeated card pattern', function () {
  const oval = directionById('lane-oval');
  assert.equal(measure(oval).typeSizes, 2);
  assert.equal(measure(oval).repetition, 3);
  assert.equal(measure(oval).gradients, 1);
  const refined = refineScreen(oval);
  assert.ok(Math.max.apply(null, refined.typeSizes) > Math.max.apply(null, oval.typeSizes));
  assert.equal(measure(refined).repetition, 0);
  assert.equal(measure(refined).gradients, 0);
  assert.equal(refined.blocks.some(function (block) { return block.pattern === 'stat'; }), false);
});

test('the board squares a shared radius and snaps spacing onto the scale', function () {
  const board = directionById('lane-board');
  assert.equal(measure(board).radius, 16);
  assert.ok(measure(board).spacing.some(function (value) { return value % 4 !== 0; }));
  const refined = refineScreen(board);
  assert.ok(refined.blocks.every(function (block) { return block.radius === 0; }));
  assert.ok(refined.spacing.every(function (value) { return value % 4 === 0; }));
  assert.deepEqual(refined.typeSizes, board.typeSizes);
});

test('the session walks app, direction, critique, refine', function () {
  let session = createSession();
  assert.equal(present(session).app, null);
  session = chooseApp(session, 'scopa');
  let view = present(session);
  assert.equal(view.app.name, 'Scopa');
  assert.equal(view.directions.length, 3);
  assert.equal(view.chosen, null);
  session = chooseDirection(session, 'scopa-back');
  session = runCritique(session);
  view = present(session);
  assert.equal(view.critiqued, true);
  assert.equal(view.refined, false);
  assert.ok(view.chosenCritique.some(function (item) { return item.flagged; }));
  session = runRefine(session);
  view = present(session);
  assert.equal(view.refined, true);
  assert.deepEqual(flaggedIds(view.chosen), []);
  assert.equal(view.chosen.layout, 'back');
  session = chooseDirection(session, 'scopa-hand');
  view = present(session);
  assert.equal(view.refined, false);
  assert.equal(view.critiqued, false);
  assert.equal(view.chosen.layout, 'hand');
  assert.throws(function () { chooseApp(session, 'nope'); }, /Unknown app/);
  assert.throws(function () { chooseDirection(session, 'lane-oval'); }, /Unknown direction/);
  assert.throws(function () { runRefine(createSession()); }, /Critique/);
  assert.throws(function () { runCritique(chooseApp(createSession(), 'lane')); }, /direction/);
});
