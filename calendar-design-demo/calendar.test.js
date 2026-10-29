const test = require('node:test');
const assert = require('node:assert/strict');
const cal = require('./calendar.js');

test('the design week around 10 Nov 2026 runs Sunday to Saturday', () => {
  assert.equal(cal.weekday('2026-11-10'), 2);
  const week = cal.weekDates('2026-11-10');
  assert.deepEqual(week, [
    '2026-11-08',
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
  ]);
  assert.equal(cal.isoWeek('2026-11-10'), 46);
  assert.equal(cal.periodLabel('week', '2026-11-10'), 'Week 46 · Nov 8 – Nov 14');
});

test('month and day steps move the anchor, and the month grid stays six weeks', () => {
  assert.equal(cal.stepAnchor('week', '2026-11-10', 1), '2026-11-17');
  assert.equal(cal.stepAnchor('day', '2026-11-10', -1), '2026-11-09');
  assert.equal(cal.stepAnchor('month', '2026-11-10', 1), '2026-12-10');
  assert.equal(cal.stepAnchor('month', '2026-03-31', 1), '2026-04-30');
  const cells = cal.monthMatrix('2026-11-10');
  assert.equal(cells.length, 42);
  assert.equal(cells[0], '2026-11-01');
  assert.equal(cal.sameMonth('2026-11-14', '2026-11-10'), true);
  assert.equal(cal.sameMonth('2026-12-01', '2026-11-10'), false);
});

test('overlapping timed events share a row, and a touching edge does not', () => {
  const overlap = cal.packEvents([
    {id: 'a', start: 7 * 60, end: 9 * 60},
    {id: 'b', start: 8 * 60, end: 10 * 60},
    {id: 'c', start: 8 * 60 + 30, end: 9 * 60 + 30},
  ]);
  const byId = Object.fromEntries(overlap.map(function (item) { return [item.id, item]; }));
  assert.equal(byId.a.cols, 3);
  assert.equal(byId.b.col, 1);
  assert.equal(byId.c.col, 2);

  const touch = cal.packEvents([
    {id: 'a', start: 7 * 60, end: 8 * 60},
    {id: 'b', start: 8 * 60, end: 9 * 60},
  ]);
  assert.equal(touch[0].cols, 1);
  assert.equal(touch[1].cols, 1);

  const nested = cal.packEvents([
    {id: 'a', start: 7 * 60, end: 12 * 60},
    {id: 'b', start: 8 * 60, end: 9 * 60},
    {id: 'c', start: 10 * 60, end: 11 * 60},
  ]);
  const nestedById = Object.fromEntries(nested.map(function (item) { return [item.id, item]; }));
  assert.equal(nestedById.a.cols, 2);
  assert.equal(nestedById.b.col, 1);
  assert.equal(nestedById.c.col, 1);
});

test('move and resize snap to 15 minutes and stay inside the day', () => {
  const item = {id: 'ev-3', title: 'Personal appointment', date: '2026-11-10', start: 7 * 60, end: 9 * 60, allDay: false, color: 'orange', note: '', requestId: ''};
  assert.equal(cal.snap(7 * 60 + 7), 7 * 60);
  assert.equal(cal.snap(7 * 60 + 8), 7 * 60 + 15);
  const moved = cal.moveEvent(item, '2026-11-11', 21 * 60 + 10);
  assert.equal(moved.date, '2026-11-11');
  assert.equal(moved.end - moved.start, 120);
  assert.equal(moved.end <= cal.DAY_END, true);
  assert.equal(moved.start >= cal.DAY_START, true);
  const grown = cal.resizeEvent(item, 9 * 60 + 7);
  assert.equal(grown.end, 9 * 60);
  const tooSmall = cal.resizeEvent(item, 7 * 60);
  assert.equal(tooSmall.end - tooSmall.start, cal.SNAP);
  const shifted = cal.shiftEvent(item, 1, 30);
  assert.equal(shifted.date, '2026-11-11');
  assert.equal(shifted.start, 7 * 60 + 30);
});

test('working days skip weekends and Diwali, and the seed balance matches the design figures', () => {
  assert.equal(cal.workingDays('2026-11-09', '2026-11-09'), 1);
  assert.equal(cal.workingDays('2026-11-13', '2026-11-16'), 2);
  assert.equal(cal.workingDays('2026-11-14', '2026-11-15'), 0);
  assert.equal(cal.holidayOn('2026-11-14').name, 'Diwali');
  assert.equal(cal.workingDays('2026-11-16', '2026-11-13'), 0);
  const stats = cal.leaveStats(cal.createSeed().requests, '2026-10-29');
  assert.equal(stats.available, 7);
  assert.equal(stats.pendingCount, 2);
  assert.equal(stats.upcoming, 3);
  assert.equal(stats.contract, 12);
  assert.equal(stats.carryover, 4);
});

test('a leave request adds one all-day block per working day and cancel removes them', () => {
  const seed = cal.createSeed();
  const before = seed.events.length;
  const made = cal.requestLeave(seed, {
    from: '2026-11-16',
    to: '2026-11-18',
    type: 'Time off',
    notes: 'A long weekend at home',
  });
  assert.equal(made.ok, true);
  assert.equal(made.days, 3);
  assert.equal(made.state.events.length, before + 3);
  const blocks = made.state.events.filter(function (item) { return item.requestId === made.id; });
  assert.deepEqual(blocks.map(function (item) { return item.date; }), ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.equal(blocks.every(function (item) { return item.allDay && item.color === 'green'; }), true);
  const stats = cal.leaveStats(made.state.requests, '2026-10-29');
  assert.equal(stats.available, 4);
  assert.equal(stats.pendingCount, 3);
  const cancelled = cal.cancelRequest(made.state, made.id);
  assert.equal(cancelled.events.some(function (item) { return item.requestId === made.id; }), false);
  assert.equal(cal.leaveStats(cancelled.requests, '2026-10-29').available, 7);

  const none = cal.requestLeave(seed, {from: '2026-11-14', to: '2026-11-15', type: 'Time off', notes: ''});
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'no-working-days');
});

test('creating, editing, and deleting a timed event keeps the grid rules', () => {
  const seed = cal.createSeed();
  const made = cal.createTimedEvent(seed, {
    date: '2026-11-10',
    start: 15 * 60 + 7,
    end: 15 * 60 + 10,
    title: '  ',
    color: 'nope',
    note: 'Desk',
  });
  assert.equal(made.event.title, 'New event');
  assert.equal(made.event.color, 'purple');
  assert.equal(made.event.start, 15 * 60);
  assert.equal(made.event.end, 15 * 60 + 15);
  const edited = cal.updateEvent(made.state, made.event.id, {
    title: 'Portfolio review',
    color: 'pink',
    start: 16 * 60,
    end: 17 * 60 + 30,
    note: 'Bring the frames',
  });
  const found = cal.findEvent(edited, made.event.id);
  assert.equal(found.title, 'Portfolio review');
  assert.equal(found.color, 'pink');
  assert.equal(cal.rangeText(found.start, found.end), '16:00 – 17:30');
  const removed = cal.deleteEvent(edited, made.event.id);
  assert.equal(cal.findEvent(removed, made.event.id), null);
});
