// A screen is a description: blocks, radii, type sizes, spacing, gradients, layout.
// Critique measures that description. Refine rewrites the fields the checks flagged.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ConceptStudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const APPS = [
    {
      id: 'lane',
      name: 'Lane',
      kind: 'Running',
      concept: 'An athletics track. The screen is the oval, the board, or the blocks.',
      accent: '#6d5ef0',
      greeting: 'Good morning, Alex',
      section: 'Recent activity',
      leak: [
        {label: 'Distance', value: '5.2 km'},
        {label: 'Pace', value: '5:40'},
        {label: 'Calories', value: '420'},
      ],
      rows: ['Morning run', 'Easy 5k', 'Track session'],
    },
    {
      id: 'hearth',
      name: 'Hearth',
      kind: 'Sleep',
      concept: 'A village going to sleep. Lights go out one house at a time.',
      accent: '#7d6cf6',
      greeting: 'Good evening, Alex',
      section: 'Sounds',
      leak: [
        {label: 'Score', value: '82'},
        {label: 'Bedtime', value: '22:30'},
        {label: 'Alarm', value: '06:30'},
      ],
      rows: ['Rain', 'Fan', 'Brown noise'],
    },
    {
      id: 'pressed',
      name: 'Pressed',
      kind: 'Plants',
      concept: 'Paper cut-outs. A collage, a specimen sheet, or a windowsill.',
      accent: '#3d9a62',
      greeting: 'Your plants',
      section: 'Today',
      leak: [
        {label: 'Healthy', value: '6'},
        {label: 'Due', value: '2'},
        {label: 'Streak', value: '12'},
      ],
      rows: ['Fig', 'Mint', 'Fern'],
    },
    {
      id: 'scopa',
      name: 'Scopa',
      kind: 'Italian',
      concept: 'Neapolitan playing cards. Coins, cups, swords, and clubs.',
      accent: '#e25b45',
      greeting: 'Continue learning',
      section: 'Recommended',
      leak: [
        {label: 'Streak', value: '8'},
        {label: 'XP', value: '120'},
        {label: 'Lesson', value: '3'},
      ],
      rows: ['Greetings', 'Food', 'At the bar'],
    },
  ];

  function appById(id) {
    return APPS.find(function (app) { return app.id === id; }) || null;
  }

  function chipsFor(appId) {
    return appById(appId).leak.map(function (item) {
      return {kind: 'chip', pattern: 'stat', radius: 16, label: item.label, value: item.value};
    });
  }

  function genericFor(appId) {
    const app = appById(appId);
    if (!app) throw new Error('Unknown app.');
    const blocks = [
      {kind: 'greeting', pattern: 'hero', radius: 16, text: app.greeting},
    ];
    app.leak.forEach(function (item) {
      blocks.push({kind: 'stat', pattern: 'stat', radius: 16, label: item.label, value: item.value});
    });
    blocks.push({kind: 'section', pattern: 'section', radius: 16, text: app.section});
    app.rows.forEach(function (text) {
      blocks.push({kind: 'row', pattern: 'row', radius: 16, text: text});
    });
    return {
      id: app.id + '-generic',
      app: app.id,
      name: 'Template',
      line: 'Rounded cards, a soft gradient, a dashboard.',
      layout: 'dashboard',
      tone: 'light',
      gradients: ['wash', 'header'],
      spacing: [18, 11, 22, 9],
      typeSizes: [22, 13],
      blocks: blocks,
      scene: {accent: app.accent},
    };
  }

  function domain(kinds, radius) {
    return kinds.map(function (kind, index) {
      const value = radius == null ? (index % 2 === 0 ? 0 : 2) : radius;
      return {kind: kind, radius: value};
    });
  }

  function direction(spec) {
    const radius = spec.uniformRadius == null ? null : spec.uniformRadius;
    const blocks = domain(spec.kinds, radius);
    const chips = spec.chips ? chipsFor(spec.app) : [];
    if (radius != null) {
      chips.forEach(function (chip) { chip.radius = radius; });
    }
    return {
      id: spec.id,
      app: spec.app,
      name: spec.name,
      line: spec.line,
      layout: spec.layout,
      tone: spec.tone,
      gradients: spec.gradients ? ['sheen'] : [],
      spacing: spec.spacing.slice(),
      typeSizes: spec.typeSizes.slice(),
      blocks: blocks.concat(chips),
      scene: spec.scene,
    };
  }

  const DIRECTION_SPECS = [
    {
      id: 'lane-oval',
      app: 'lane',
      name: 'The oval',
      line: 'You are a mark on the track.',
      layout: 'oval',
      tone: 'dark',
      kinds: ['field', 'marker', 'plate'],
      chips: true,
      gradients: true,
      spacing: [16, 16, 24, 16],
      typeSizes: [28, 14],
      scene: {lap: '3', lane: '4', split: '62.4', place: 'Back straight'},
    },
    {
      id: 'lane-board',
      app: 'lane',
      name: 'The board',
      line: 'A stadium clock. Splits in amber.',
      layout: 'board',
      tone: 'dark',
      kinds: ['clock', 'split', 'split', 'split', 'split'],
      chips: true,
      gradients: false,
      uniformRadius: 16,
      spacing: [14, 10, 18, 22],
      typeSizes: [64, 22, 13],
      scene: {
        time: '18:42',
        splits: [
          {mark: '400', time: '1:28'},
          {mark: '800', time: '3:01'},
          {mark: '1200', time: '4:40'},
          {mark: '1600', time: '6:12'},
        ],
      },
    },
    {
      id: 'lane-blocks',
      app: 'lane',
      name: 'The blocks',
      line: 'Lane 4, seen from the start.',
      layout: 'blocks',
      tone: 'light',
      kinds: ['sky', 'lane', 'lane', 'lane', 'lane', 'number'],
      chips: false,
      gradients: true,
      spacing: [10, 14, 8, 18],
      typeSizes: [32, 15],
      scene: {word: 'On your marks', lane: '4', gun: '0:12'},
    },
    {
      id: 'hearth-windows',
      app: 'hearth',
      name: 'Windows',
      line: 'The lane is going dark. Two windows are still lit.',
      layout: 'windows',
      tone: 'dark',
      kinds: ['house', 'house', 'house', 'house', 'house', 'house', 'house'],
      chips: true,
      gradients: true,
      spacing: [16, 16, 24, 16],
      typeSizes: [28, 14],
      scene: {lit: [2, 5], line: 'still lit'},
    },
    {
      id: 'hearth-street',
      app: 'hearth',
      name: 'The street',
      line: 'House fronts. Most of them are already asleep.',
      layout: 'street',
      tone: 'light',
      kinds: ['front', 'front', 'front', 'front'],
      chips: true,
      gradients: false,
      uniformRadius: 16,
      spacing: [14, 10, 18, 22],
      typeSizes: [64, 22, 13],
      scene: {
        houses: [
          {name: 'Baker', asleep: true},
          {name: 'Miller', asleep: true},
          {name: 'You', asleep: false},
          {name: 'Porter', asleep: false},
        ],
      },
    },
    {
      id: 'hearth-bell',
      app: 'hearth',
      name: 'The bell',
      line: 'Bedtime is the parish bell.',
      layout: 'bell',
      tone: 'light',
      kinds: ['dial', 'hand', 'cottage', 'cottage', 'cottage'],
      chips: false,
      gradients: true,
      spacing: [10, 14, 8, 18],
      typeSizes: [32, 15],
      scene: {hour: 'X', line: 'The parish bell'},
    },
    {
      id: 'pressed-cut',
      app: 'pressed',
      name: 'Cut paper',
      line: 'A fig built from cut paper on a kraft table.',
      layout: 'cut',
      tone: 'light',
      kinds: ['pot', 'leaf', 'leaf', 'leaf', 'tag'],
      chips: true,
      gradients: true,
      spacing: [16, 16, 24, 16],
      typeSizes: [28, 14],
      scene: {name: 'Fig', tag: 'Thirsty'},
    },
    {
      id: 'pressed-sheet',
      app: 'pressed',
      name: 'Herbarium',
      line: 'One specimen on a mount.',
      layout: 'sheet',
      tone: 'light',
      kinds: ['mount', 'specimen', 'stamp'],
      chips: true,
      gradients: false,
      uniformRadius: 16,
      spacing: [14, 10, 18, 22],
      typeSizes: [64, 22, 13],
      scene: {latin: 'Ficus carica', common: 'Fig', collected: '12 May'},
    },
    {
      id: 'pressed-sill',
      app: 'pressed',
      name: 'The sill',
      line: 'Three pots on the sill. The fig is dry.',
      layout: 'sill',
      tone: 'light',
      kinds: ['frame', 'plank', 'pot', 'pot', 'pot'],
      chips: false,
      gradients: true,
      spacing: [10, 14, 8, 18],
      typeSizes: [32, 15],
      scene: {
        pots: [
          {name: 'Mint', tag: 'damp'},
          {name: 'Fig', tag: 'dry'},
          {name: 'Fern', tag: 'damp'},
        ],
      },
    },
    {
      id: 'scopa-hand',
      app: 'scopa',
      name: 'A hand',
      line: 'A fan of Neapolitan cards. Name the top one.',
      layout: 'hand',
      tone: 'dark',
      kinds: ['card', 'card', 'card'],
      chips: true,
      gradients: false,
      spacing: [14, 10, 18, 22],
      typeSizes: [72, 18, 13],
      scene: {
        prompt: 'Name the card on top',
        cards: [
          {suit: 'denari', rank: '7', word: 'sette'},
          {suit: 'coppe', rank: 'F', word: 'fante'},
          {suit: 'spade', rank: '2', word: 'due'},
        ],
      },
    },
    {
      id: 'scopa-trick',
      app: 'scopa',
      name: 'The trick',
      line: 'A trick in progress on the felt.',
      layout: 'trick',
      tone: 'dark',
      kinds: ['table-card', 'table-card', 'back', 'back', 'back', 'coins'],
      chips: true,
      gradients: true,
      spacing: [16, 16, 24, 16],
      typeSizes: [28, 14],
      scene: {
        prompt: 'Name the suit',
        captured: '4',
        table: [
          {suit: 'bastoni', rank: '5'},
          {suit: 'coppe', rank: '3'},
        ],
      },
    },
    {
      id: 'scopa-back',
      app: 'scopa',
      name: 'The back',
      line: 'The word sits under the card back.',
      layout: 'back',
      tone: 'dark',
      kinds: ['cardback', 'medallion', 'face'],
      chips: false,
      gradients: true,
      uniformRadius: 20,
      spacing: [16, 16, 24, 16],
      typeSizes: [32, 15],
      scene: {word: 'denaro', suit: 'Coins', rank: 'A'},
    },
  ];

  function directionsFor(appId) {
    if (!appById(appId)) throw new Error('Unknown app.');
    return DIRECTION_SPECS.filter(function (spec) { return spec.app === appId; }).map(direction);
  }

  function directionById(id) {
    const spec = DIRECTION_SPECS.find(function (item) { return item.id === id; });
    return spec ? direction(spec) : null;
  }

  function repetitionCount(screen) {
    const counts = {};
    screen.blocks.forEach(function (block) {
      if (!block.pattern) return;
      counts[block.pattern] = (counts[block.pattern] || 0) + 1;
    });
    const values = Object.keys(counts).map(function (key) { return counts[key]; });
    if (!values.length) return 0;
    return Math.max.apply(null, values);
  }

  function sharedRadius(screen) {
    const radii = screen.blocks.map(function (block) { return block.radius; }).filter(function (value) {
      return typeof value === 'number';
    });
    if (radii.length < 3) return null;
    const first = radii[0];
    if (!radii.every(function (value) { return value === first; })) return null;
    return first;
  }

  function measure(screen) {
    return {
      repetition: repetitionCount(screen),
      gradients: screen.gradients.length,
      radius: sharedRadius(screen),
      typeSizes: new Set(screen.typeSizes).size,
      spacing: screen.spacing.slice(),
      layout: screen.layout,
    };
  }

  function spacingList(values) {
    return values.join(', ');
  }

  function critique(screen) {
    const measured = measure(screen);
    const spacingOff = measured.spacing.some(function (value) { return value % 4 !== 0; });
    const radiusFlag = measured.radius != null && measured.radius >= 8;
    return [
      {
        id: 'repetition',
        label: 'Repeated cards',
        value: measured.repetition,
        flagged: measured.repetition >= 3,
        detail: 'The same card pattern appears ' + measured.repetition + (measured.repetition === 1 ? ' time.' : ' times.'),
      },
      {
        id: 'gradients',
        label: 'Gradients',
        value: measured.gradients,
        flagged: measured.gradients >= 1,
        detail: measured.gradients === 1
          ? '1 gradient is painted on the screen.'
          : measured.gradients + ' gradients are painted on the screen.',
      },
      {
        id: 'radius',
        label: 'Radius',
        value: measured.radius,
        flagged: radiusFlag,
        detail: measured.radius == null
          ? 'Corners differ.'
          : 'Every measured corner is ' + measured.radius + 'px.',
      },
      {
        id: 'type',
        label: 'Type sizes',
        value: measured.typeSizes,
        flagged: measured.typeSizes < 3,
        detail: measured.typeSizes + ' type sizes are in use.',
      },
      {
        id: 'spacing',
        label: 'Spacing',
        value: measured.spacing,
        flagged: spacingOff,
        detail: spacingOff
          ? 'Spacing ' + spacingList(measured.spacing) + ' leaves the 4px scale.'
          : 'Spacing ' + spacingList(measured.spacing) + ' sits on a 4px scale.',
      },
      {
        id: 'template',
        label: 'Layout',
        value: measured.layout,
        flagged: measured.layout === 'dashboard',
        detail: measured.layout === 'dashboard'
          ? 'The layout is a dashboard.'
          : 'The layout is ' + measured.layout + '.',
      },
    ];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snap4(value) {
    return Math.max(4, Math.round(value / 4) * 4);
  }

  function expandType(sizes) {
    const unique = Array.from(new Set(sizes));
    if (!unique.length) return [16, 32, 56];
    const display = Math.max.apply(null, unique) + 36;
    const midRaw = Math.round((Math.min.apply(null, unique) + display) / 2);
    const mid = Math.max(4, Math.round(midRaw / 4) * 4);
    const next = unique.slice();
    if (next.indexOf(display) === -1) next.push(display);
    if (next.indexOf(mid) === -1) next.push(mid);
    next.sort(function (a, b) { return a - b; });
    return next;
  }

  function refineScreen(screen) {
    const before = critique(screen);
    function hit(id) {
      return before.some(function (item) { return item.id === id && item.flagged; });
    }
    let blocks = screen.blocks.map(function (block) { return Object.assign({}, block); });
    if (hit('repetition')) {
      const counts = {};
      blocks.forEach(function (block) {
        if (block.pattern) counts[block.pattern] = (counts[block.pattern] || 0) + 1;
      });
      blocks = blocks.filter(function (block) {
        return !block.pattern || counts[block.pattern] < 3;
      });
    }
    if (hit('radius')) {
      blocks = blocks.map(function (block) { return Object.assign({}, block, {radius: 0}); });
    }
    return {
      id: screen.id,
      app: screen.app,
      name: screen.name,
      line: screen.line,
      layout: screen.layout,
      tone: screen.tone,
      gradients: hit('gradients') ? [] : screen.gradients.slice(),
      spacing: hit('spacing') ? screen.spacing.map(snap4) : screen.spacing.slice(),
      typeSizes: hit('type') ? expandType(screen.typeSizes) : screen.typeSizes.slice(),
      blocks: blocks,
      scene: clone(screen.scene),
      refined: true,
    };
  }

  function createSession() {
    return {appId: null, directionId: null, critiqued: false, refined: false};
  }

  function chooseApp(session, appId) {
    if (!appById(appId)) throw new Error('Unknown app.');
    return {appId: appId, directionId: null, critiqued: false, refined: false};
  }

  function chooseDirection(session, directionId) {
    if (!session.appId) throw new Error('Choose an app first.');
    const found = directionsFor(session.appId).some(function (item) { return item.id === directionId; });
    if (!found) throw new Error('Unknown direction.');
    return {appId: session.appId, directionId: directionId, critiqued: false, refined: false};
  }

  function runCritique(session) {
    if (!session.directionId) throw new Error('Choose a direction first.');
    return {
      appId: session.appId,
      directionId: session.directionId,
      critiqued: true,
      refined: session.refined,
    };
  }

  function runRefine(session) {
    if (!session.critiqued) throw new Error('Critique the screens first.');
    return {
      appId: session.appId,
      directionId: session.directionId,
      critiqued: true,
      refined: true,
    };
  }

  function present(session) {
    if (!session.appId) {
      return {
        app: null,
        generic: null,
        directions: [],
        chosen: null,
        genericCritique: null,
        chosenCritique: null,
        critiqued: false,
        refined: false,
      };
    }
    const app = appById(session.appId);
    const generic = genericFor(app.id);
    const directions = directionsFor(app.id);
    const base = session.directionId
      ? directions.find(function (item) { return item.id === session.directionId; })
      : null;
    const chosen = base && session.refined ? refineScreen(base) : base;
    return {
      app: {
        id: app.id,
        name: app.name,
        kind: app.kind,
        concept: app.concept,
      },
      generic: generic,
      directions: directions,
      chosen: chosen,
      genericCritique: critique(generic),
      chosenCritique: chosen ? critique(chosen) : null,
      critiqued: Boolean(session.critiqued),
      refined: Boolean(session.refined),
    };
  }

  return {
    APPS: APPS,
    appById: appById,
    genericFor: genericFor,
    directionsFor: directionsFor,
    directionById: directionById,
    measure: measure,
    critique: critique,
    refineScreen: refineScreen,
    createSession: createSession,
    chooseApp: chooseApp,
    chooseDirection: chooseDirection,
    runCritique: runCritique,
    runRefine: runRefine,
    present: present,
  };
});
