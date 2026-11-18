const test = require('node:test');
const assert = require('node:assert/strict');
const doors = require('./doors.js');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: function (key) { return map.has(key) ? map.get(key) : null; },
    setItem: function (key, value) { map.set(key, String(value)); },
    removeItem: function (key) { map.delete(key); },
  };
}

test('Pacific midnight follows standard time and daylight time', () => {
  assert.equal(doors.pacificMidnight(2026, 6, 1).toISOString(), '2026-06-01T07:00:00.000Z');
  assert.equal(doors.pacificMidnight(2026, 11, 1).toISOString(), '2026-11-01T07:00:00.000Z');
  assert.equal(doors.pacificMidnight(2026, 11, 2).toISOString(), '2026-11-02T08:00:00.000Z');
  assert.equal(doors.pacificMidnight(2026, 12, 1).toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(doors.pacificMidnight(2026, 12, 31).toISOString(), '2026-12-31T08:00:00.000Z');
  assert.equal(doors.pacificMidnight(2027, 1, 1).toISOString(), '2027-01-01T08:00:00.000Z');
});

test('civil dates in America/Los_Angeles', () => {
  const noon = doors.pacificParts(new Date('2026-11-18T20:00:00.000Z'));
  assert.equal(noon.year, 2026);
  assert.equal(noon.month, 11);
  assert.equal(noon.day, 18);
  assert.equal(noon.hour, 12);

  const almost = doors.pacificParts(new Date('2026-12-01T07:59:00.000Z'));
  assert.equal(almost.month, 11);
  assert.equal(almost.day, 30);
  assert.equal(almost.hour, 23);

  const midnight = doors.pacificParts(new Date('2026-12-01T08:00:00.000Z'));
  assert.equal(midnight.month, 12);
  assert.equal(midnight.day, 1);
  assert.equal(midnight.hour, 0);
});

test('a season is the December in progress, the next one, or January’s finale', () => {
  assert.equal(doors.seasonYear({ year: 2026, month: 11, day: 18 }), 2026);
  assert.equal(doors.seasonYear({ year: 2026, month: 12, day: 15 }), 2026);
  assert.equal(doors.seasonYear({ year: 2027, month: 1, day: 1 }), 2026);
  assert.equal(doors.seasonYear({ year: 2027, month: 2, day: 2 }), 2027);
  assert.deepEqual(doors.doorDate(1, 2026), { year: 2026, month: 12, day: 1 });
  assert.deepEqual(doors.doorDate(31, 2026), { year: 2026, month: 12, day: 31 });
  assert.deepEqual(doors.doorDate(32, 2026), { year: 2027, month: 1, day: 1 });
});

test('doors unlock on their civil date and stay shut before it', () => {
  const nov = { year: 2026, month: 11, day: 18 };
  assert.equal(doors.describe(nov).unlocked, 0);
  assert.equal(doors.describe(nov).next, 1);
  assert.deepEqual(doors.describe(nov).nextDate, { year: 2026, month: 12, day: 1 });
  assert.equal(doors.isUnlocked(1, nov), false);

  const dec1 = { year: 2026, month: 12, day: 1 };
  assert.equal(doors.describe(dec1).unlocked, 1);
  assert.equal(doors.describe(dec1).next, 2);
  assert.equal(doors.isUnlocked(1, dec1), true);
  assert.equal(doors.isUnlocked(2, dec1), false);

  const dec31 = { year: 2026, month: 12, day: 31 };
  assert.equal(doors.describe(dec31).unlocked, 31);
  assert.equal(doors.describe(dec31).next, 32);
  assert.deepEqual(doors.describe(dec31).nextDate, { year: 2027, month: 1, day: 1 });

  const jan1 = { year: 2027, month: 1, day: 1 };
  assert.equal(doors.describe(jan1).unlocked, 32);
  assert.equal(doors.describe(jan1).next, null);
  assert.equal(doors.isUnlocked(32, jan1), true);
});

test('the next unlock is the following Pacific midnight', () => {
  const nov = doors.nextUnlock(new Date('2026-11-18T20:00:00.000Z'));
  assert.equal(nov.done, false);
  assert.equal(nov.door, 1);
  assert.equal(nov.at.toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(doors.formatRemain(nov.at.getTime() - Date.parse('2026-11-18T20:00:00.000Z')).text, '12d 12h 00m 00s');

  const almost = doors.nextUnlock(new Date('2026-12-01T07:59:00.000Z'));
  assert.equal(almost.door, 1);
  assert.equal(doors.formatRemain(almost.at.getTime() - Date.parse('2026-12-01T07:59:00.000Z')).text, '00h 01m 00s');

  const opened = doors.nextUnlock(new Date('2026-12-01T08:00:00.000Z'));
  assert.equal(opened.door, 2);
  assert.equal(opened.at.toISOString(), '2026-12-02T08:00:00.000Z');

  const mid = doors.nextUnlock(new Date('2026-12-15T20:00:00.000Z'));
  assert.equal(mid.door, 16);

  const finale = doors.nextUnlock(new Date('2027-01-01T20:00:00.000Z'));
  assert.equal(finale.done, true);
  assert.equal(finale.door, null);
  assert.equal(finale.at.toISOString(), '2027-12-01T08:00:00.000Z');
});

test('the scrubber covers the season and the real day', () => {
  const real = { year: 2026, month: 11, day: 18 };
  const range = doors.scrubRange(real);
  assert.deepEqual(range.start, { year: 2026, month: 11, day: 1 });
  assert.deepEqual(range.end, { year: 2027, month: 1, day: 5 });
  const dates = doors.eachDay(range.start, range.end);
  assert.equal(dates.length, 66);
  assert.deepEqual(dates[0], range.start);
  assert.deepEqual(dates[dates.length - 1], range.end);
  assert.equal(dates[doors.dayIndex(dates, real)].day, 18);

  const march = { year: 2027, month: 3, day: 3 };
  const early = doors.scrubRange(march);
  assert.deepEqual(early.start, march);
  assert.equal(doors.dayIndex(doors.eachDay(early.start, early.end), march), 0);
});

test('eight piece kinds repeat, and each door keeps its own interior', () => {
  assert.equal(doors.KINDS.length, 8);
  assert.equal(doors.kindForDoor(1), 'slide');
  assert.equal(doors.kindForDoor(2), 'field');
  assert.equal(doors.kindForDoor(3), 'reflex');
  assert.equal(doors.kindForDoor(4), 'tones');
  assert.equal(doors.kindForDoor(5), 'orbit');
  assert.equal(doors.kindForDoor(6), 'cells');
  assert.equal(doors.kindForDoor(7), 'maze');
  assert.equal(doors.kindForDoor(8), 'match');
  assert.equal(doors.kindForDoor(9), 'slide');
  assert.equal(doors.kindForDoor(32), 'match');
  assert.notEqual(doors.interiorColor(1), doors.interiorColor(2));
  assert.equal(doors.interiorColor(4), doors.interiorColor(4));
});

test('opened doors stay in storage for that season only', () => {
  const storage = memoryStorage();
  assert.deepEqual(doors.readOpened(storage, 2026), []);
  doors.writeOpened(storage, 2026, [4, 1, 4, 0, 40, 32]);
  assert.deepEqual(doors.readOpened(storage, 2026), [1, 4, 32]);
  assert.deepEqual(doors.readOpened(storage, 2025), []);
  doors.writeOpened(storage, 2025, [2]);
  assert.deepEqual(doors.readOpened(storage, 2026), [1, 4, 32]);
  doors.clearOpened(storage, 2026);
  assert.deepEqual(doors.readOpened(storage, 2026), []);
  assert.deepEqual(doors.readOpened(storage, 2025), [2]);

  storage.setItem(doors.STORAGE_KEY, '{');
  assert.deepEqual(doors.readOpened(storage, 2026), []);
});

test('a countdown under an hour drops the day field', () => {
  assert.equal(doors.formatRemain(0).text, '00h 00m 00s');
  assert.equal(doors.formatRemain(-50).text, '00h 00m 00s');
  assert.equal(doors.formatRemain(3661000).text, '01h 01m 01s');
  assert.equal(doors.formatYMD({ year: 2026, month: 12, day: 4 }), '4 Dec 2026');
});
