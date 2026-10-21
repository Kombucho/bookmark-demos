const assert = require('node:assert/strict');
const test = require('node:test');
const earshot = require('./sound.js');

function peakBucket(data) {
  let best = -1;
  let index = 0;
  data.env.forEach(function (value, i) {
    if (value > best) {
      best = value;
      index = i;
    }
  });
  return index;
}

test('the library is sixteen finite sounds with unique ids', function () {
  assert.equal(earshot.LIBRARY.length, 16);
  const ids = earshot.LIBRARY.map(function (item) { return item.id; });
  assert.equal(new Set(ids).size, 16);
  earshot.LIBRARY.forEach(function (item) {
    assert.ok(item.duration > 0 && item.duration < 2);
    assert.ok(item.name && item.role);
    const preview = earshot.renderPreview(item, 4000);
    assert.equal(preview.length, Math.max(1, Math.round(item.duration * 4000)));
    for (let i = 0; i < preview.length; i += 17) assert.ok(Number.isFinite(preview[i]));
    const again = earshot.renderPreview(item, 4000);
    assert.deepEqual(preview, again);
  });
});

test('a click peaks at the attack and a whoosh peaks on its apex', function () {
  const click = earshot.libraryById('click.soft');
  const whoosh = earshot.libraryById('whoosh.long');
  const rate = 8000;
  const clickAt = earshot.apexTime(click, rate);
  assert.ok(clickAt <= click.partials[0].attack + 1 / rate + 1e-9);
  const whooshAt = earshot.apexTime(whoosh, rate);
  assert.ok(Math.abs(whooshAt - whoosh.apex * whoosh.duration) <= 1 / rate + 1e-9);
  const clickDraw = earshot.drawData(click, 32, rate);
  const whooshDraw = earshot.drawData(whoosh, 32, rate);
  assert.equal(clickDraw.env.length, 32);
  assert.ok(peakBucket(clickDraw) < peakBucket(whooshDraw));
  assert.deepEqual(earshot.drawData(whoosh, 24, 4000), earshot.drawData(whoosh, 24, 4000));
});

test('the same character and seed rebuild the same kit, and another seed does not', function () {
  const a = earshot.kitFromSeed('calm', 4);
  const b = earshot.kitFromSeed('calm', 4);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  const other = earshot.kitFromSeed('calm', 5);
  assert.notEqual(a.rootHz, other.rootHz);
  assert.notDeepEqual(a, earshot.kitFromSeed('calm', 8));
  assert.throws(function () { earshot.kitFromSeed('loud', 1); }, /Unknown character/);
  assert.throws(function () { earshot.kitFromSeed('calm', 0); }, /Seed/);
});

test('a kit shares one root, a fifth for success, and a minor second for the error', function () {
  ['calm', 'crisp', 'minimal'].forEach(function (character) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const kit = earshot.kitFromSeed(character, seed);
      assert.equal(kit.sounds.success.partials[0].freq, kit.rootHz);
      const fifth = kit.sounds.success.partials[1].freq / kit.sounds.success.partials[0].freq;
      assert.ok(Math.abs(fifth - 1.5) < 1e-12);
      assert.ok(Math.abs(kit.sounds.error.partials[0].freq / kit.rootHz - 16 / 15) < 1e-12);
      assert.ok(Math.abs(kit.sounds.error.partials[1].freq / kit.sounds.error.partials[0].freq - 1.5) > 0.05);
      assert.equal(kit.sounds.click.partials[0].freq, kit.rootHz * 4);
      earshot.ROLES.forEach(function (role) {
        const item = kit.sounds[role];
        assert.equal(item.root, kit.rootHz);
        assert.ok(item.duration > 0);
        assert.equal(Number.isFinite(item.duration), true);
        (item.partials || []).forEach(function (part) {
          assert.ok(part.freq > 0 && Number.isFinite(part.freq));
        });
      });
    }
  });
});

test('crisp is shorter than calm, and minimal uses less noise than crisp', function () {
  const calm = earshot.kitFromSeed('calm', 1);
  const crisp = earshot.kitFromSeed('crisp', 1);
  const minimal = earshot.kitFromSeed('minimal', 1);
  assert.ok(crisp.sounds.click.duration < calm.sounds.click.duration);
  assert.ok(minimal.sounds.whoosh.noise.amount < crisp.sounds.whoosh.noise.amount);
  assert.equal(calm.note.length > 0, true);
  assert.notEqual(calm.rootName, '');
});

test('apex alignment puts the peak on the frame, and onset starts on the frame', function () {
  const whoosh = { duration: 0.5, apex: 0.75, partials: [] };
  const scheduled = earshot.scheduleCue(
    { id: 'whoosh', frame: 24, align: 'apex', role: 'whoosh', label: 'The bar arrives' },
    whoosh,
    24
  );
  assert.equal(scheduled.hit, 1);
  assert.equal(scheduled.start, 0.625);
  assert.equal(scheduled.end, 1.125);
  assert.equal(scheduled.apexAt, 1);

  const click = { duration: 0.05, apex: 0, partials: [] };
  const onset = earshot.scheduleCue(
    { id: 'click', frame: 48, align: 'onset', role: 'click', label: 'OPEN settles' },
    click,
    24
  );
  assert.equal(onset.hit, 2);
  assert.equal(onset.start, 2);
  assert.equal(earshot.scheduleCue(
    { id: 'click', frame: 48, align: 'onset', role: 'click', label: 'OPEN settles' },
    click,
    60
  ).hit, 48 / 60);
  assert.throws(function () { earshot.scheduleCue(onset, click, 0); }, /fps/);
});

test('every kit cue stays inside the loop at 12, 24, 30, and 60 fps', function () {
  assert.deepEqual(earshot.FPS, [12, 24, 30, 60]);
  assert.equal(earshot.FRAMES, 96);
  const frames = earshot.CUES.map(function (cue) { return cue.frame; });
  assert.deepEqual(frames, frames.slice().sort(function (a, b) { return a - b; }));
  earshot.FPS.forEach(function (fps) {
    ['calm', 'crisp', 'minimal'].forEach(function (character) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const rows = earshot.score(earshot.kitFromSeed(character, seed), fps);
        assert.equal(rows.length, earshot.CUES.length);
        rows.forEach(function (row) {
          assert.equal(row.hit, row.frame / fps);
          assert.ok(row.start >= -1e-9);
          assert.ok(row.end <= earshot.FRAMES / fps + 1e-9);
          if (row.align === 'apex') assert.ok(Math.abs(row.apexAt - row.hit) < 1e-9);
          if (row.align === 'onset') assert.equal(row.start, row.hit);
        });
      }
    });
  });
});

test('picture poses land on the same frames as the cues', function () {
  assert.equal(earshot.pose(0).bar, 0);
  assert.equal(earshot.pose(24).bar, 1);
  assert.ok(earshot.pose(23).bar < 1);
  assert.equal(earshot.pose(11).tick, false);
  assert.equal(earshot.pose(12).tick, true);
  assert.equal(earshot.pose(28).disc, 1.12);
  assert.ok(earshot.pose(28).disc > earshot.pose(36).disc);
  assert.equal(earshot.pose(36).disc, 1);
  assert.equal(earshot.pose(36).letters[0], 0);
  assert.ok(earshot.pose(37).letters[0] > 0);
  assert.equal(earshot.pose(47).wordSettled, false);
  assert.equal(earshot.pose(48).wordSettled, true);
  assert.ok(earshot.pose(48).letters.every(function (level) { return level === 1; }));
  assert.ok(earshot.pose(71).check < 1);
  assert.equal(earshot.pose(72).check, 1);
  assert.equal(earshot.pose(83).reject, false);
  assert.equal(earshot.pose(84).reject, true);
  assert.equal(earshot.pose(92).reject, false);
  assert.equal(earshot.pose(96).frame, 0);
  assert.equal(earshot.CUES.find(function (cue) { return cue.role === 'whoosh'; }).frame, 24);
  assert.equal(earshot.CUES.find(function (cue) { return cue.role === 'click'; }).frame, 48);
  assert.equal(earshot.CUES.find(function (cue) { return cue.role === 'success'; }).frame, 72);
  assert.equal(earshot.CUES.find(function (cue) { return cue.role === 'error'; }).frame, 84);
});
