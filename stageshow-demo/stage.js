// Rules for the Keel still, taken from benjitaylor/skills stageshow.
// The product is fictional. The skill is not running, and nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StageShow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IDEA = 'It reads as a real product, simplified to what the viewer needs, framed with intent, and every motion has a cause.';

  const RULES = [
    {
      id: 'simplify',
      name: 'Simplify',
      fault: 'Too much',
      note: '“Too much. Real text in every row, numbers everywhere, everything packed. The more detail, the more it looks generated.” Real words stay on the berth the story is about. The other rows become bars. Placeholder widths vary. The stat tile keeps one number, and the sentence tile keeps one sentence.'
    },
    {
      id: 'recognize',
      name: 'Recognize',
      fault: 'Wireframe',
      note: '“Wireframe. Two gray blobs and a button. Built too small, or stripped of what made it recognizable.” The fix is a full, structured screen in quiet grays: chrome, the rows that give the action a reason, and real words on the subject. Logo and nav are not required.'
    },
    {
      id: 'frame',
      name: 'Crop',
      fault: 'Boxed',
      note: '“Boxed. A whole window shrunk into a card with even margins: a screenshot pasted in, not a product shot.” Crop 10 to 40% of the hero off the stage. The window fills at least two thirds of the tile and runs off the bottom. Only filler is meant to be cut.'
    },
    {
      id: 'weight',
      name: 'Weight',
      fault: 'Flat',
      note: '“Flat. Every object the same weight in the same bordered card. The eye has nowhere to land.” One tile is the hero. The slip straddles that window, about half outside, with a tighter shadow. A bento is one picture: not every tile is a window, and neighbors are different kinds.'
    },
    {
      id: 'look',
      name: 'Look',
      fault: 'Bland',
      note: '“Bland. A gray window with a cursor, whatever the brief said.” The brief’s look is the point. Also: “AI features get no sparkle, wand or star, and no purple as the AI color.” “A letter or glyph in a colored square is not the product’s mark.” One quiet family, one accent.'
    },
    {
      id: 'motion',
      name: 'Motion',
      fault: null,
      note: 'The one sentence ends “every motion has a cause.” “No cursor move you can’t explain.” The cursor travels to Assign, the press lands, then the row and the slip answer it. Off, the shot holds the poster: the frame after that lands, “never one caught mid-change, with the result left on screen.” Motion leads in one tile.'
    }
  ];

  function flagsFrom(input) {
    const flags = {};
    RULES.forEach(function (rule) {
      flags[rule.id] = !!(input && input[rule.id]);
    });
    return flags;
  }

  function allOff() {
    return flagsFrom({});
  }

  function allOn() {
    const flags = {};
    RULES.forEach(function (rule) { flags[rule.id] = true; });
    return flags;
  }

  function windowStrings(flags) {
    if (!flags.recognize) return ['Continue'];
    const title = (!flags.look && !flags.simplify) ? 'Dashboard' : 'Berths';
    if (!flags.simplify) {
      return [
        title,
        'Mira Holt',
        'Coastal grain',
        'Gate B',
        '240 t',
        'confirmed for the evening tide',
        'Jonah Pell',
        'Dry dock',
        'inspection hold',
        'Ada Voss',
        'Pilot boat',
        'waiting on fuel',
        'Len Cho',
        'Customs',
        'papers due',
        '12,481',
        'Users',
        '$84,210',
        'Revenue',
        '318',
        'Sessions',
        '10×',
        'Growth',
        'Assigned',
        'Predicted throughput is up across every region this week'
      ];
    }
    return [title, 'Mira Holt', 'Coastal grain', 'Assigned', 'Slip', 'Evening tide'];
  }

  function scene(input) {
    const flags = flagsFrom(input);
    const faults = [];
    if (!flags.recognize) faults.push('Wireframe');
    else if (!flags.simplify) faults.push('Too much');
    if (!flags.frame) faults.push('Boxed');
    if (!flags.weight) faults.push('Flat');
    if (!flags.look) faults.push('Bland');

    let motion = 'poster';
    if (flags.motion && !flags.recognize) motion = 'continue';
    else if (flags.motion) motion = 'assign';

    const strings = windowStrings(flags);
    return {
      flags: flags,
      faults: faults,
      strings: strings,
      stringCount: strings.length,
      bleed: !!flags.frame,
      satellite: flags.weight ? 'straddle' : 'card',
      motion: motion,
      poster: motion === 'poster',
      reading: reading(faults, motion)
    };
  }

  function reading(faults, motion) {
    const motionLine = motion === 'poster'
      ? 'The shot is holding the poster.'
      : motion === 'assign'
        ? 'The cursor’s trip to Assign is the cause of the slip.'
        : 'The cursor presses Continue, and the product never answers.';
    if (!faults.length) {
      return 'It reads as a real product, simplified to the berth, cropped off the foot, with the slip heavier than the list. ' + motionLine;
    }
    return 'Still failing: ' + faults.join(', ') + '. ' + motionLine;
  }

  return {
    IDEA: IDEA,
    RULES: RULES,
    scene: scene,
    allOff: allOff,
    allOn: allOn
  };
});
