// Exclusive intersections for an UpSet plot, plus a 3-set Venn of the same rows.
// The projects are invented. ComplexUpset is not running, and R is not called.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.UpsetPlot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SETS = [
    { id: 'layout', name: 'Layout' },
    { id: 'type', name: 'Type' },
    { id: 'motion', name: 'Motion' },
    { id: 'data', name: 'Data' },
    { id: 'agents', name: 'Agents' },
    { id: 'proof', name: 'Proof' },
  ];

  function row(id, name, skills, note) {
    return { id: id, name: name, skills: skills, note: note };
  }

  const PROJECTS = [
    row('harbor', 'Harbor Index', ['layout'], 'A catalog page with one column and a margin search.'),
    row('kiln', 'Kiln Board', ['layout'], 'Course list for a ceramics school. No photographs.'),
    row('sunday', 'Sunday Route', ['layout'], 'A folded walking sheet. Turns are sentences.'),
    row('lamp', 'Low Lamp', ['layout'], 'A night editor with a title, a body, and nothing else.'),
    row('field', 'Fieldnote', ['layout'], 'The studio page itself, before anyone walks the floor.'),
    row('slip', 'Slip Catalog', ['type'], 'Four slips named as colors, set in a text face.'),
    row('merrow', 'Merrow Sheet', ['type'], 'A walking club wordmark that has to survive a smudge.'),
    row('grey', 'Greyhaven Mark', ['type'], 'A bowl in profile, used as the school wordmark.'),
    row('lantern', 'Lantern Tray', ['motion'], 'Toasts that only move on transform.'),
    row('tide', 'Tide Dial', ['motion'], 'A day-to-night slider on a seeded island.'),
    row('shard', 'Shard Notes', ['data'], 'Orders joined on the shard that already holds the customer.'),
    row('ledger', 'Ledger Desk', ['data'], 'A toy wallet log with the phrases either kept or leaked.'),
    row('pair', 'Pair Slip', ['data'], 'One share charted against a hold and an uncompounded LP.'),
    row('vote', 'Vote Tally', ['data'], 'A fictional bench where the headline picks the winner.'),
    row('mention', 'Mention Sort', ['agents'], 'Four lanes for a lantern that does not exist.'),
    row('desk', 'Desk Agent', ['agents'], 'Scripted edits that land as change requests.'),
    row('bit', 'Bit Square', ['proof'], 'Every 8-bit input, painted when the tests never tried it.'),
    row('clip', 'Clip Folio', ['layout', 'type'], 'A portfolio that has to read at arm’s length.'),
    row('oven', 'Oven Card', ['layout', 'type'], 'A pricing card with the type drawn five ways.'),
    row('rail', 'Rail Sign', ['layout', 'type'], 'Hanging folders. The tab is the title.'),
    row('press', 'Press Sheet', ['layout', 'type'], 'A one-page brief exported with the tokens.'),
    row('toast', 'Toast Rack', ['layout', 'motion'], 'The same tray twice, once expensive and once cheap.'),
    row('folder', 'Folder Rail', ['layout', 'motion'], 'A jacket that comes forward when its tab is chosen.'),
    row('title', 'Title Card', ['type', 'motion'], 'A looping card whose hits land on exact frames.'),
    row('wiki', 'Wiki Compile', ['data', 'agents'], 'Notes become linked pages. A question names the pages it opened.'),
    row('search', 'Search Bench', ['data', 'agents'], 'Passages with file and line, instead of whole files.'),
    row('query', 'Query Board', ['layout', 'data'], 'One join drawn across a router and four shards.'),
    row('canvas', 'Canvas Reply', ['motion', 'agents'], 'A reply that puts a map or a ledger on the canvas.'),
    row('glyph', 'Glyph Proof', ['type', 'proof'], 'A variable face checked for the slashed zero and the fractions.'),
    row('gate', 'Gate Check', ['agents', 'proof'], 'Twelve diffs. A rule stops one, or an incident follows.'),
    row('frame', 'Frame Meter', ['motion', 'data'], 'Frame time read from the page, not from a profiler.'),
    row('exhaust', 'Exhaust Map', ['data', 'proof'], 'The inputs a handful of tests left unpainted.'),
    row('studio', 'Studio Floor', ['layout', 'type', 'motion'], 'A page that becomes a small floor when you press Esc.'),
    row('night', 'Night Editor', ['layout', 'type', 'motion'], 'The lamp dims the page. It does not notify anyone.'),
    row('verify', 'Verify Ledger', ['data', 'agents', 'proof'], 'A seeded run finds the bug, then the scripted fix.'),
    row('spec', 'Spec Walker', ['data', 'agents', 'proof'], 'A guided pass holds while a design comment is open.'),
    row('week', 'Calendar Week', ['layout', 'type', 'data'], 'A people-ops week. Time off counts working days.'),
    row('sound', 'Sound Kit', ['motion', 'data', 'agents'], 'Sixteen sounds derived from one character and a seed.'),
    row('hack', 'Hack Board', ['layout', 'type', 'motion', 'data'], 'Five weeks, one person, and a judge card.'),
    row('inbox', 'Diff Inbox', ['layout', 'data', 'agents', 'proof'], 'A scripted diff that can open on one part.'),
    row('dither', 'Dither Lab', ['type', 'motion', 'data', 'agents', 'proof'], 'A lit sphere, a matrix, and a threshold under the cursor.'),
    row('north', 'Northglass Desk', ['layout', 'type', 'motion', 'data', 'agents', 'proof'], 'Every skill at once. Still a made-up project.'),
  ];

  function hasSkill(project, id) {
    return project.skills.indexOf(id) !== -1;
  }

  function intersections(projects, setIds) {
    const map = {};
    projects.forEach(function (project) {
      const sets = setIds.filter(function (id) { return hasSkill(project, id); });
      if (!sets.length) return;
      const key = sets.join('+');
      if (!map[key]) map[key] = { key: key, sets: sets, degree: sets.length, projects: [] };
      map[key].projects.push(project);
    });
    return Object.keys(map).map(function (key) {
      const item = map[key];
      item.size = item.projects.length;
      return item;
    });
  }

  function setSizes(projects, sets) {
    return sets.map(function (set) {
      return {
        id: set.id,
        name: set.name,
        size: projects.filter(function (project) { return hasSkill(project, set.id); }).length,
      };
    });
  }

  function byKey(a, b) {
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  }

  function sortIntersections(list, mode) {
    const copy = list.slice();
    copy.sort(function (a, b) {
      if (mode === 'degree') {
        if (b.degree !== a.degree) return b.degree - a.degree;
        if (b.size !== a.size) return b.size - a.size;
      } else {
        if (b.size !== a.size) return b.size - a.size;
        if (b.degree !== a.degree) return b.degree - a.degree;
      }
      return byKey(a, b);
    });
    return copy;
  }

  function degreeBreakdown(list, setCount) {
    const rows = [];
    for (let degree = 1; degree <= setCount; degree++) {
      const group = list.filter(function (item) { return item.degree === degree; });
      rows.push({
        degree: degree,
        intersections: group.length,
        projects: group.reduce(function (sum, item) { return sum + item.size; }, 0),
      });
    }
    return rows;
  }

  function view(projects, options) {
    const opts = options || {};
    const minSize = opts.minSize || 1;
    const mode = opts.sort === 'degree' ? 'degree' : 'size';
    const setIds = SETS.map(function (set) { return set.id; });
    const all = intersections(projects || PROJECTS, setIds);
    const shown = sortIntersections(all.filter(function (item) {
      return item.size >= minSize;
    }), mode);
    return {
      sets: setSizes(projects || PROJECTS, SETS),
      intersections: shown,
      hidden: all.length - shown.length,
      degrees: degreeBreakdown(all, setIds.length),
      possible: Math.pow(2, setIds.length) - 1,
      occupied: all.length,
      projectCount: (projects || PROJECTS).length,
      sort: mode,
      minSize: minSize,
    };
  }

  function venn(projects, setIds) {
    if (!setIds || setIds.length !== 3) throw new Error('A Venn here takes three sets.');
    const keys = ['100', '010', '001', '110', '101', '011', '111', '000'];
    const regions = {};
    keys.forEach(function (key) { regions[key] = []; });
    (projects || PROJECTS).forEach(function (project) {
      const mask = setIds.map(function (id) { return hasSkill(project, id) ? '1' : '0'; }).join('');
      regions[mask].push(project);
    });
    return {
      sets: setIds.slice(),
      regions: regions,
      outside: regions['000'].length,
      occupied: keys.filter(function (key) { return key !== '000' && regions[key].length; }).length,
    };
  }

  function replaceVennSet(selected, id) {
    const next = selected.slice();
    const index = next.indexOf(id);
    if (index !== -1) return next;
    next.shift();
    next.push(id);
    return next;
  }

  function regionLabel(mask, setIds, sets) {
    const names = setIds.filter(function (id, index) { return mask.charAt(index) === '1'; }).map(function (id) {
      const found = sets.filter(function (set) { return set.id === id; })[0];
      return found ? found.name : id;
    });
    if (!names.length) return 'Outside all three';
    if (names.length === 1) return 'Only ' + names[0];
    return names.join(' ∩ ');
  }

  return {
    SETS: SETS,
    PROJECTS: PROJECTS,
    example: true,
    intersections: intersections,
    setSizes: setSizes,
    sortIntersections: sortIntersections,
    view: view,
    venn: venn,
    replaceVennSet: replaceVennSet,
    regionLabel: function (mask, setIds) { return regionLabel(mask, setIds, SETS); },
    possibleRegions: function (n) { return Math.pow(2, n) - 1; },
  };
});
