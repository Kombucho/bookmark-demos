// A hand-written statechart for the Northglass espresso machine.
// Hierarchy, parallel regions, history, and guards are the behavior.
// The flat counts are the same machine with those features expanded away.
// XState is not loaded. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Statechart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EVENT_LABEL = {
    POWER: 'Power',
    PLACE_CUP: 'Cup',
    LIFT_CUP: 'Lift cup',
    FILL: 'Fill',
    BREW: 'Brew',
    HEAT: 'Heat',
    BREW_TICK: 'Brew tick',
    LATCH: 'Latch',
    STEAM: 'Steam',
    STEAM_TICK: 'Steam tick',
  };

  function machine() {
    return {
      id: 'root',
      type: 'compound',
      label: 'Machine',
      initial: 'off',
      on: {
        PLACE_CUP: {
          id: 'place-cup',
          guard: 'noCup',
          actions: ['placeCup'],
          note: 'A cup lands on the tray.',
        },
        FILL: {
          id: 'fill',
          guard: 'tankRoom',
          actions: ['fill'],
          note: 'Water goes into the tank.',
        },
      },
      states: {
        off: {
          id: 'off',
          label: 'Off',
          on: {
            POWER: {
              id: 'power-on',
              target: 'on.H',
              note: 'Power on. Deep history restores the last configuration, or a cold idle machine.',
            },
          },
        },
        on: {
          id: 'on',
          type: 'parallel',
          label: 'On',
          history: 'deep',
          on: {
            POWER: {
              id: 'power-off',
              target: 'off',
              note: 'Power off. The three regions are saved as one history state.',
            },
          },
          states: {
            boiler: {
              id: 'on.boiler',
              label: 'Boiler',
              initial: 'on.boiler.cold',
              on: {
                STEAM_TICK: {
                  id: 'cool-tick',
                  guard: 'isSteaming',
                  actions: ['coolTick'],
                  note: 'Steam draws heat out of the boiler.',
                },
              },
              states: {
                cold: {
                  id: 'on.boiler.cold',
                  label: 'Cold',
                  entry: ['resetTemp'],
                  on: {
                    HEAT: {
                      id: 'heat-start',
                      target: 'on.boiler.heating',
                      note: 'The element switches on.',
                    },
                  },
                },
                heating: {
                  id: 'on.boiler.heating',
                  label: 'Heating',
                  on: {
                    HEAT: {
                      id: 'heat-tick',
                      actions: ['heatTick'],
                      note: 'The boiler climbs.',
                    },
                  },
                  always: [
                    {
                      id: 'heat-ready',
                      target: 'on.boiler.hot',
                      guard: 'tempReady',
                      note: 'The boiler reaches brewing heat.',
                    },
                  ],
                },
                hot: {
                  id: 'on.boiler.hot',
                  label: 'Hot',
                  on: {
                    HEAT: {
                      id: 'heat-full',
                      note: 'The boiler is already hot.',
                    },
                  },
                  always: [
                    {
                      id: 'heat-drop',
                      target: 'on.boiler.heating',
                      guard: 'tempDropped',
                      note: 'The boiler falls out of brewing heat.',
                    },
                  ],
                },
              },
            },
            cycle: {
              id: 'on.cycle',
              label: 'Brew',
              initial: 'on.cycle.idle',
              on: {
                LIFT_CUP: {
                  id: 'lift-cup',
                  target: 'on.cycle.idle',
                  actions: ['liftCup'],
                  note: 'The cup leaves the tray. The shot is cleared.',
                },
              },
              states: {
                idle: {
                  id: 'on.cycle.idle',
                  label: 'Idle',
                  on: {
                    BREW: [
                      {
                        id: 'brew-now',
                        target: 'on.cycle.pulling',
                        guard: 'canBrewNow',
                        note: 'Brew starts. The cup, the water, and the heat are all in.',
                      },
                      {
                        id: 'brew-wait',
                        target: 'on.cycle.waiting',
                        guard: 'canBrewSoon',
                        note: 'Brew waits. The cup is in, and the boiler is not hot yet.',
                      },
                    ],
                  },
                },
                waiting: {
                  id: 'on.cycle.waiting',
                  label: 'Waiting',
                  always: [
                    {
                      id: 'wait-pull',
                      target: 'on.cycle.pulling',
                      guard: 'canBrewNow',
                      note: 'The boiler is hot. The waiting shot starts.',
                    },
                  ],
                },
                pulling: {
                  id: 'on.cycle.pulling',
                  label: 'Pulling',
                  initial: 'on.cycle.pulling.preinfuse',
                  history: 'shallow',
                  on: {
                    LATCH: {
                      id: 'latch-open',
                      target: 'on.cycle.held',
                      note: 'The group head opens. Shallow history keeps the phase.',
                    },
                  },
                  states: {
                    preinfuse: {
                      id: 'on.cycle.pulling.preinfuse',
                      label: 'Preinfuse',
                      on: {
                        BREW_TICK: {
                          id: 'preinfuse-done',
                          target: 'on.cycle.pulling.pouring',
                          note: 'Preinfusion ends. The shot starts to pour.',
                        },
                      },
                    },
                    pouring: {
                      id: 'on.cycle.pulling.pouring',
                      label: 'Pouring',
                      on: {
                        BREW_TICK: {
                          id: 'pour-tick',
                          actions: ['pourTick'],
                          note: 'Coffee lands in the cup.',
                        },
                      },
                      always: [
                        {
                          id: 'pour-done',
                          target: 'on.cycle.done',
                          guard: 'shotDone',
                          note: 'The shot is finished.',
                        },
                      ],
                    },
                  },
                },
                held: {
                  id: 'on.cycle.held',
                  label: 'Held',
                  on: {
                    LATCH: {
                      id: 'latch-close',
                      target: 'on.cycle.pulling.H',
                      note: 'The group head closes on the phase it left.',
                    },
                  },
                },
                done: {
                  id: 'on.cycle.done',
                  label: 'Done',
                },
              },
            },
            wand: {
              id: 'on.wand',
              label: 'Wand',
              initial: 'on.wand.parked',
              states: {
                parked: {
                  id: 'on.wand.parked',
                  label: 'Parked',
                  on: {
                    STEAM: {
                      id: 'steam-open',
                      target: 'on.wand.steaming',
                      guard: 'boilerHot',
                      note: 'The wand opens. Steam is allowed only while the boiler is hot.',
                    },
                  },
                },
                steaming: {
                  id: 'on.wand.steaming',
                  label: 'Steaming',
                  on: {
                    STEAM: {
                      id: 'steam-close',
                      target: 'on.wand.parked',
                      note: 'The wand is parked.',
                    },
                  },
                  always: [
                    {
                      id: 'steam-cool-stop',
                      target: 'on.wand.parked',
                      guard: 'boilerNotHot',
                      note: 'The wand closes. The boiler left brewing heat.',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };
  }

  const guards = {
    noCup: {
      test: function (ctx) { return !ctx.cup; },
      fail: function () { return 'A cup is already on the tray.'; },
    },
    tankRoom: {
      test: function (ctx) { return ctx.water < 4; },
      fail: function () { return 'The tank is full.'; },
    },
    canBrewNow: {
      test: function (ctx, active) {
        return ctx.cup && ctx.water > 0 && active.has('on.boiler.hot');
      },
      fail: function (ctx) {
        if (!ctx.cup) return 'There is no cup.';
        if (ctx.water <= 0) return 'The tank is empty.';
        return 'The boiler is not hot yet.';
      },
    },
    canBrewSoon: {
      test: function (ctx, active) {
        return ctx.cup && ctx.water > 0 && !active.has('on.boiler.hot');
      },
      fail: function (ctx) {
        if (!ctx.cup) return 'There is no cup.';
        if (ctx.water <= 0) return 'The tank is empty.';
        return 'The boiler is already hot.';
      },
    },
    tempReady: {
      test: function (ctx) { return ctx.temp >= 90; },
      fail: function () { return 'The boiler is still climbing.'; },
    },
    tempDropped: {
      test: function (ctx) { return ctx.temp < 80; },
      fail: function () { return 'The boiler is still hot.'; },
    },
    shotDone: {
      test: function (ctx) { return ctx.poured >= 3 || ctx.water <= 0; },
      fail: function () { return 'The cup is not full yet.'; },
    },
    isSteaming: {
      test: function (ctx, active) { return active.has('on.wand.steaming'); },
      fail: function () { return 'The wand is parked.'; },
    },
    boilerHot: {
      test: function (ctx, active) { return active.has('on.boiler.hot'); },
      fail: function () { return 'The boiler is not hot yet.'; },
    },
    boilerNotHot: {
      test: function (ctx, active) { return !active.has('on.boiler.hot'); },
      fail: function () { return 'The boiler is still hot.'; },
    },
  };

  const actions = {
    placeCup: function (ctx) { ctx.cup = true; },
    liftCup: function (ctx) { ctx.cup = false; ctx.poured = 0; },
    fill: function (ctx) { ctx.water = Math.min(4, ctx.water + 1); },
    heatTick: function (ctx) { ctx.temp = Math.min(100, ctx.temp + 25); },
    coolTick: function (ctx) { ctx.temp = Math.max(20, ctx.temp - 15); },
    pourTick: function (ctx) {
      ctx.poured += 1;
      ctx.water = Math.max(0, ctx.water - 1);
    },
    resetTemp: function (ctx) { ctx.temp = 20; },
  };

  // Boxes are the diagram. A child box sits inside its parent box.
  const LAYOUT = {
    off: { x: 24, y: 308, w: 108, h: 64 },
    on: { x: 168, y: 16, w: 692, h: 668 },
    'on.boiler': { x: 184, y: 52, w: 660, h: 132 },
    'on.boiler.cold': { x: 200, y: 92, w: 148, h: 68 },
    'on.boiler.heating': { x: 420, y: 92, w: 164, h: 68 },
    'on.boiler.hot': { x: 660, y: 92, w: 148, h: 68 },
    'on.cycle': { x: 184, y: 200, w: 660, h: 292 },
    'on.cycle.idle': { x: 200, y: 240, w: 136, h: 60 },
    'on.cycle.waiting': { x: 368, y: 240, w: 148, h: 60 },
    'on.cycle.pulling': { x: 540, y: 228, w: 284, h: 148 },
    'on.cycle.pulling.preinfuse': { x: 556, y: 268, w: 120, h: 56 },
    'on.cycle.pulling.pouring': { x: 688, y: 268, w: 120, h: 56 },
    'on.cycle.held': { x: 540, y: 400, w: 160, h: 64 },
    'on.cycle.done': { x: 200, y: 400, w: 136, h: 64 },
    'on.wand': { x: 184, y: 508, w: 660, h: 156 },
    'on.wand.parked': { x: 200, y: 560, w: 168, h: 72 },
    'on.wand.steaming': { x: 440, y: 560, w: 180, h: 72 },
  };

  const VIEW = { width: 960, height: 700 };

  function indexTree(node, byId) {
    byId[node.id] = node;
    const kids = node.states || {};
    Object.keys(kids).forEach(function (key) {
      kids[key].parentId = node.id;
      indexTree(kids[key], byId);
    });
    return byId;
  }

  function isAtomic(node) {
    return !node.states || Object.keys(node.states).length === 0;
  }

  function create() {
    const rootNode = machine();
    const byId = indexTree(rootNode, {});
    return { root: rootNode, byId: byId };
  }

  function ancestors(byId, id) {
    const chain = [];
    let cur = id;
    while (cur) {
      chain.push(cur);
      cur = byId[cur].parentId || null;
    }
    return chain;
  }

  function isDescendant(byId, id, ancestorId) {
    let cur = byId[id] && byId[id].parentId;
    while (cur) {
      if (cur === ancestorId) return true;
      cur = byId[cur].parentId || null;
    }
    return false;
  }

  function depth(byId, id) {
    let n = 0;
    let cur = id;
    while (byId[cur] && byId[cur].parentId) {
      n += 1;
      cur = byId[cur].parentId;
    }
    return n;
  }

  function lca(byId, a, b) {
    const seen = {};
    ancestors(byId, a).forEach(function (id) { seen[id] = true; });
    let cur = b;
    while (cur) {
      if (seen[cur]) return cur;
      cur = byId[cur].parentId || null;
    }
    return 'root';
  }

  function listOptions(node, event) {
    const raw = event == null ? node.always : node.on && node.on[event];
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  function leafUnder(chart, regionId, active) {
    const leaves = [];
    active.forEach(function (id) {
      if (!isAtomic(chart.byId[id])) return;
      if (id === regionId || isDescendant(chart.byId, id, regionId)) leaves.push(id);
    });
    return leaves.length === 1 ? leaves[0] : null;
  }

  function remember(chart, node, active) {
    if (!node.history) return null;
    if (node.type === 'parallel') {
      const saved = {};
      Object.keys(node.states).forEach(function (key) {
        const child = node.states[key];
        saved[child.id] = leafUnder(chart, child.id, active);
      });
      return { kind: 'parallel', saved: saved };
    }
    const child = Object.keys(node.states).map(function (key) {
      return node.states[key];
    }).filter(function (item) {
      return active.has(item.id);
    })[0];
    return child ? { kind: 'child', id: child.id } : null;
  }

  function addState(active, entered, id) {
    if (active.has(id)) return;
    active.add(id);
    entered.push(id);
  }

  function enterPath(chart, active, entered, ancestorId, leafId) {
    const chain = [];
    let cur = leafId;
    while (cur && cur !== ancestorId) {
      chain.push(cur);
      cur = chart.byId[cur].parentId || null;
    }
    chain.push(ancestorId);
    chain.reverse();
    chain.forEach(function (id) { addState(active, entered, id); });
  }

  function fill(chart, active, history, entered, id, useHistory) {
    const node = chart.byId[id];
    if (isAtomic(node)) return;
    if (node.type === 'parallel') {
      const saved = useHistory && history[id] && history[id].kind === 'parallel' ? history[id].saved : null;
      Object.keys(node.states).forEach(function (key) {
        const child = node.states[key];
        const occupied = active.has(child.id) || leafUnder(chart, child.id, active);
        if (occupied) return;
        if (saved && saved[child.id]) enterPath(chart, active, entered, child.id, saved[child.id]);
        else {
          addState(active, entered, child.id);
          fill(chart, active, history, entered, child.id, false);
        }
      });
      return;
    }
    const childActive = Object.keys(node.states).some(function (key) {
      return active.has(node.states[key].id);
    });
    if (childActive) return;
    if (useHistory && history[id] && history[id].kind === 'child') {
      addState(active, entered, history[id].id);
      fill(chart, active, history, entered, history[id].id, false);
      return;
    }
    addState(active, entered, node.initial);
    fill(chart, active, history, entered, node.initial, false);
  }

  function parseTarget(target) {
    if (!target) return null;
    if (target.slice(-2) === '.H') return { id: target.slice(0, -2), history: true };
    return { id: target, history: false };
  }

  function runNamed(list, ctx) {
    (list || []).forEach(function (name) {
      actions[name](ctx);
    });
  }

  function applyTransition(chart, active, history, context, transition) {
    const entered = [];
    const exited = [];
    if (!transition.target) {
      runNamed(transition.actions, context);
      return done(transition, exited, entered);
    }
    const target = parseTarget(transition.target);
    const pivot = lca(chart.byId, transition.source, target.id);
    const toExit = [];
    active.forEach(function (id) {
      if (id !== pivot && (id === pivot || isDescendant(chart.byId, id, pivot))) toExit.push(id);
    });
    toExit.sort(function (a, b) { return depth(chart.byId, b) - depth(chart.byId, a); });
    const memories = [];
    toExit.forEach(function (id) {
      const mem = remember(chart, chart.byId[id], active);
      if (mem) memories.push([id, mem]);
    });
    toExit.forEach(function (id) {
      runNamed(chart.byId[id].exit, context);
      active.delete(id);
      exited.push(id);
    });
    memories.forEach(function (pair) { history[pair[0]] = pair[1]; });
    runNamed(transition.actions, context);
    enterPath(chart, active, entered, pivot, target.id);
    fill(chart, active, history, entered, target.id, target.history);
    entered.forEach(function (id) {
      runNamed(chart.byId[id].entry, context);
    });
    return done(transition, exited, entered);
  }

  function done(transition, exited, entered) {
    const target = parseTarget(transition.target);
    return {
      kind: 'take',
      id: transition.id,
      event: transition.event,
      source: transition.source,
      target: target ? target.id : transition.source,
      history: !!(target && target.history),
      note: transition.note,
      exited: exited,
      entered: entered,
    };
  }

  function pickForAtomic(chart, atomicId, event, context, active) {
    const chain = ancestors(chart.byId, atomicId);
    let fallback = null;
    for (let i = 0; i < chain.length; i++) {
      const options = listOptions(chart.byId[chain[i]], event).map(function (item) {
        return Object.assign({ source: chain[i], event: event }, item);
      });
      if (!options.length) continue;
      for (let j = 0; j < options.length; j++) {
        const guard = options[j].guard && guards[options[j].guard];
        if (guard && !guard.test(context, active)) {
          if (!fallback) fallback = guard.fail(context, active);
          continue;
        }
        return { take: options[j] };
      }
    }
    return { take: null, message: fallback };
  }

  function resolveConflicts(chart, list) {
    const unique = [];
    const seen = {};
    list.forEach(function (item) {
      if (seen[item.id]) return;
      seen[item.id] = true;
      unique.push(item);
    });
    return unique.filter(function (item) {
      return !unique.some(function (other) {
        return other.id !== item.id && isDescendant(chart.byId, other.source, item.source);
      });
    });
  }

  function atomicsOf(chart, active) {
    const list = [];
    active.forEach(function (id) {
      if (isAtomic(chart.byId[id])) list.push(id);
    });
    list.sort();
    return list;
  }

  function settle(chart, active, history, context, steps) {
    for (let n = 0; n < 8; n++) {
      const picks = [];
      atomicsOf(chart, active).forEach(function (id) {
        const pick = pickForAtomic(chart, id, null, context, active);
        if (pick.take) picks.push(pick.take);
      });
      const fires = resolveConflicts(chart, picks);
      if (!fires.length) return;
      fires.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
      steps.push(applyTransition(chart, active, history, context, fires[0]));
    }
  }

  function freeze(active, context, history) {
    return {
      active: Array.from(active).sort(),
      context: {
        cup: context.cup,
        water: context.water,
        temp: context.temp,
        poured: context.poured,
      },
      history: JSON.parse(JSON.stringify(history)),
    };
  }

  function boot(chart) {
    const active = new Set();
    const entered = [];
    const history = {};
    const context = { cup: false, water: 0, temp: 20, poured: 0 };
    addState(active, entered, chart.root.id);
    fill(chart, active, history, entered, chart.root.id, false);
    entered.forEach(function (id) { runNamed(chart.byId[id].entry, context); });
    const steps = [];
    settle(chart, active, history, context, steps);
    return { state: freeze(active, context, history), steps: steps };
  }

  function send(chart, state, event) {
    const active = new Set(state.active);
    const context = {
      cup: state.context.cup,
      water: state.context.water,
      temp: state.context.temp,
      poured: state.context.poured,
    };
    const history = JSON.parse(JSON.stringify(state.history));
    const steps = [];
    const picks = [];
    const ignores = [];
    atomicsOf(chart, active).forEach(function (id) {
      const pick = pickForAtomic(chart, id, event, context, active);
      if (pick.take) picks.push(pick.take);
      else if (pick.message) ignores.push(pick.message);
    });
    const fires = resolveConflicts(chart, picks);
    if (!fires.length) {
      const label = EVENT_LABEL[event] || event;
      steps.push({
        kind: 'ignore',
        event: event,
        text: ignores[0] || (label + ' does nothing from here.'),
      });
    } else {
      fires.forEach(function (transition) {
        steps.push(applyTransition(chart, active, history, context, transition));
      });
    }
    settle(chart, active, history, context, steps);
    return { state: freeze(active, context, history), steps: steps };
  }

  function has(state, id) {
    return state.active.indexOf(id) !== -1;
  }

  function atomsUnder(chart, id) {
    const node = chart.byId[id];
    if (isAtomic(node)) return [id];
    const list = [];
    Object.keys(node.states).forEach(function (key) {
      atomsUnder(chart, node.states[key].id).forEach(function (atom) { list.push(atom); });
    });
    return list;
  }

  function countFlat(node) {
    if (isAtomic(node)) return 1;
    const kids = Object.keys(node.states).map(function (key) { return node.states[key]; });
    if (node.type === 'parallel') {
      return kids.reduce(function (product, child) { return product * countFlat(child); }, 1);
    }
    return kids.reduce(function (sum, child) { return sum + countFlat(child); }, 0);
  }

  function countNodes(node) {
    const kids = node.states ? Object.keys(node.states) : [];
    return 1 + kids.reduce(function (sum, key) {
      return sum + countNodes(node.states[key]);
    }, 0);
  }

  function eachTransition(chart, visit) {
    Object.keys(chart.byId).forEach(function (id) {
      const node = chart.byId[id];
      const events = Object.keys(node.on || {});
      events.forEach(function (event) {
        listOptions(node, event).forEach(function (item) {
          visit(Object.assign({ source: id, event: event }, item));
        });
      });
      listOptions(node, null).forEach(function (item) {
        visit(Object.assign({ source: id, event: null }, item));
      });
    });
  }

  function weight(chart, sourceId) {
    let total = countFlat(chart.byId[sourceId]);
    let id = sourceId;
    while (chart.byId[id].parentId) {
      const parent = chart.byId[chart.byId[id].parentId];
      if (parent.type === 'parallel') {
        Object.keys(parent.states).forEach(function (key) {
          const sibling = parent.states[key];
          if (sibling.id !== id) total *= countFlat(sibling);
        });
      }
      id = parent.id;
    }
    return total;
  }

  function explosion(chart) {
    let chartTransitions = 0;
    let flatTransitions = 0;
    eachTransition(chart, function (item) {
      chartTransitions += 1;
      flatTransitions += weight(chart, item.source);
    });
    const boiler = countFlat(chart.byId['on.boiler']);
    const cycle = countFlat(chart.byId['on.cycle']);
    const wand = countFlat(chart.byId['on.wand']);
    return {
      chartStates: countNodes(chart.root),
      chartTransitions: chartTransitions,
      flatStates: countFlat(chart.root),
      flatTransitions: flatTransitions,
      boiler: boiler,
      cycle: cycle,
      wand: wand,
      product: boiler * cycle * wand,
    };
  }

  function flatCells(chart) {
    const cells = [{ id: 'off', parts: ['off'], label: 'Off' }];
    atomsUnder(chart, 'on.boiler').forEach(function (boiler) {
      atomsUnder(chart, 'on.cycle').forEach(function (cycle) {
        atomsUnder(chart, 'on.wand').forEach(function (wand) {
          cells.push({
            id: boiler + '|' + cycle + '|' + wand,
            parts: [boiler, cycle, wand],
            label: chart.byId[boiler].label + ' · ' + chart.byId[cycle].label + ' · ' + chart.byId[wand].label,
          });
        });
      });
    });
    return cells;
  }

  function currentFlat(chart, state) {
    return flatCells(chart).filter(function (cell) {
      return cell.parts.every(function (id) { return has(state, id); });
    })[0] || null;
  }

  function dueEvents(state) {
    const events = [];
    const steaming = has(state, 'on.wand.steaming');
    const heating = has(state, 'on.boiler.heating');
    const hot = has(state, 'on.boiler.hot');
    if (steaming && (heating || hot)) events.push('STEAM_TICK');
    else if (heating || has(state, 'on.boiler.cold')) events.push('HEAT');
    if (has(state, 'on.cycle.pulling.preinfuse') || has(state, 'on.cycle.pulling.pouring')) {
      events.push('BREW_TICK');
    }
    return events;
  }

  function phaseText(chart, state) {
    if (has(state, 'off')) return 'Off';
    const atoms = state.active.filter(function (id) { return isAtomic(chart.byId[id]); });
    const bits = atoms.map(function (id) {
      if (id === 'on.boiler.heating' && has(state, 'on.wand.steaming')) return 'Cooling';
      return chart.byId[id].label;
    });
    const ctx = state.context;
    bits.push(ctx.temp + '°');
    bits.push(ctx.cup ? 'cup in' : 'no cup');
    bits.push(ctx.water + (ctx.water === 1 ? ' dose of water' : ' doses of water'));
    if (ctx.poured) bits.push(ctx.poured + ' poured');
    return bits.join(' · ');
  }

  function stepText(chart, step) {
    if (step.kind === 'ignore') return (EVENT_LABEL[step.event] || step.event) + ' · ' + step.text;
    const from = chart.byId[step.source].label;
    const to = chart.byId[step.target].label;
    const via = step.history ? ' · history' : '';
    const arrow = from === to ? from : from + ' → ' + to;
    return (step.event ? (EVENT_LABEL[step.event] || step.event) + ' · ' : 'Auto · ') + arrow + via + ' · ' + step.note;
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function boxOf(id) {
    return LAYOUT[id];
  }

  function center(box) {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }

  function containsBox(outer, inner) {
    if (outer === inner) return false;
    return inner.x >= outer.x && inner.y >= outer.y
      && inner.x + inner.w <= outer.x + outer.w
      && inner.y + inner.h <= outer.y + outer.h
      && (inner.w < outer.w || inner.h < outer.h);
  }

  function borderPoint(box, toward) {
    const c = center(box);
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    if (!dx && !dy) return c;
    const sx = dx === 0 ? Infinity : (box.w / 2) / Math.abs(dx);
    const sy = dy === 0 ? Infinity : (box.h / 2) / Math.abs(dy);
    const scale = Math.min(sx, sy);
    return { x: c.x + dx * scale, y: c.y + dy * scale };
  }

  function edgeGeometry(transition) {
    const target = parseTarget(transition.target);
    const from = boxOf(transition.source);
    const toId = target ? target.id : transition.source;
    const to = boxOf(toId);
    if (!from || !to) return null;
    const nested = containsBox(from, to) || containsBox(to, from);
    if (!target || target.id === transition.source) {
      const x = from.x + from.w - (from.w > 220 ? 28 : 0);
      const y = from.y + (from.w > 220 ? 14 : 22);
      const reach = from.w > 220 ? 0 : 26;
      return {
        d: 'M ' + x + ' ' + y + ' C ' + (x + reach) + ' ' + (y - 18) + ', ' + (x + reach) + ' ' + (y + 24) + ', ' + (x - 2) + ' ' + (y + 14),
        lx: x + reach + 4,
        ly: y - 2,
      };
    }
    if (nested) {
      const child = containsBox(from, to) ? to : from;
      const x = child.x + child.w / 2;
      const y = child.y;
      return {
        d: 'M ' + x + ' ' + (y - 14) + ' L ' + x + ' ' + (y - 1),
        lx: x + 6,
        ly: y - 4,
      };
    }
    const a = center(from);
    const b = center(to);
    const start = borderPoint(from, b);
    const end = borderPoint(to, a);
    const bend = transition.event == null ? 16 : -12;
    const mx = (start.x + end.x) / 2 + (start.y < end.y ? bend : -bend);
    const my = (start.y + end.y) / 2;
    return {
      d: 'M ' + start.x + ' ' + start.y + ' Q ' + mx + ' ' + my + ' ' + end.x + ' ' + end.y,
      lx: mx,
      ly: my - 4,
    };
  }

  function renderDiagram(chart, state, firedIds) {
    const fired = {};
    (firedIds || []).forEach(function (id) { fired[id] = true; });
    const edges = [];
    eachTransition(chart, function (item) {
      const geo = edgeGeometry(item);
      if (!geo) return;
      const label = item.event ? (EVENT_LABEL[item.event] || item.event) : 'auto';
      edges.push({ id: item.id, geo: geo, label: label, fired: !!fired[item.id], auto: item.event == null });
    });
    let body = '';
    edges.forEach(function (edge) {
      const cls = 'edge' + (edge.fired ? ' fired' : '') + (edge.auto ? ' auto' : '');
      body += '<path class="' + cls + '" data-edge="' + edge.id + '" d="' + edge.geo.d + '" marker-end="url(#arrow)"></path>';
      body += '<text class="edge-label" x="' + edge.geo.lx + '" y="' + edge.geo.ly + '">' + escapeXml(edge.label) + '</text>';
    });
    Object.keys(LAYOUT).forEach(function (id) {
      const box = LAYOUT[id];
      const node = chart.byId[id];
      const active = has(state, id);
      const kind = isAtomic(node) ? 'atomic' : (node.type === 'parallel' ? 'parallel' : 'compound');
      const cls = 'state ' + kind + (active ? ' active' : '');
      body += '<rect class="' + cls + '" data-state="' + id + '" x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h + '" rx="8"></rect>';
      body += '<text class="state-label" x="' + (box.x + 10) + '" y="' + (box.y + 22) + '">' + escapeXml(node.label) + '</text>';
      if (node.history === 'deep') {
        body += '<circle class="hist" cx="' + (box.x + box.w - 22) + '" cy="' + (box.y + 20) + '" r="11"></circle>';
        body += '<text class="hist-label" x="' + (box.x + box.w - 22) + '" y="' + (box.y + 24) + '">H*</text>';
      } else if (node.history === 'shallow') {
        body += '<circle class="hist" cx="' + (box.x + box.w - 18) + '" cy="' + (box.y + 18) + '" r="10"></circle>';
        body += '<text class="hist-label" x="' + (box.x + box.w - 18) + '" y="' + (box.y + 22) + '">H</text>';
      }
    });
    const title = 'Statechart. Active: ' + phaseText(chart, state);
    const marker = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path></marker></defs>';
    return '<svg viewBox="0 0 ' + VIEW.width + ' ' + VIEW.height + '" role="img" aria-label="' + escapeXml(title) + '">' +
      '<title>' + escapeXml(title) + '</title>' + marker + body + '</svg>';
  }

  const chart = create();

  return {
    chart: chart,
    guards: guards,
    LAYOUT: LAYOUT,
    VIEW: VIEW,
    EVENT_LABEL: EVENT_LABEL,
    boot: function () { return boot(chart); },
    send: function (state, event) { return send(chart, state, event); },
    has: has,
    dueEvents: dueEvents,
    phaseText: function (state) { return phaseText(chart, state); },
    stepText: function (step) { return stepText(chart, step); },
    explosion: function () { return explosion(chart); },
    flatCells: function () { return flatCells(chart); },
    currentFlat: function (state) { return currentFlat(chart, state); },
    renderDiagram: function (state, firedIds) { return renderDiagram(chart, state, firedIds); },
    isAtomic: function (id) { return isAtomic(chart.byId[id]); },
    eachTransition: function (visit) { eachTransition(chart, visit); },
    parseTarget: parseTarget,
  };
});
