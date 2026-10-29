// People-ops calendar rules: views, overlap packing, drag snap, and leave math.
// The week of 8–14 Nov 2026 and the allowance figures follow the published
// Kargul design seed. This file does not include that project's source.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CalendarDesign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SNAP = 15;
  const DAY_START = 6 * 60;
  const DAY_END = 22 * 60;
  const DESIGN_DATE = '2026-11-10';
  const CONTRACT_DAYS = 12;
  const CARRYOVER_DAYS = 4;
  const ALLOWANCE = CONTRACT_DAYS + CARRYOVER_DAYS;
  const COLORS = ['blue', 'cyan', 'green', 'orange', 'pink', 'purple'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const HOLIDAYS = [
    {date: '2026-01-01', name: "New Year's Day"},
    {date: '2026-01-26', name: 'Republic Day'},
    {date: '2026-03-04', name: 'Holi'},
    {date: '2026-04-03', name: 'Good Friday'},
    {date: '2026-05-01', name: 'Labour Day'},
    {date: '2026-06-26', name: 'Muharram'},
    {date: '2026-08-15', name: 'Independence Day'},
    {date: '2026-10-02', name: 'Gandhi Jayanti'},
    {date: '2026-10-20', name: 'Dussehra'},
    {date: '2026-11-14', name: 'Diwali'},
    {date: '2026-11-24', name: 'Guru Nanak Jayanti'},
    {date: '2026-12-25', name: 'Christmas Day'},
  ];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function parseISO(iso) {
    const parts = String(iso).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function addDays(iso, n) {
    const date = parseISO(iso);
    date.setDate(date.getDate() + n);
    return toISO(date);
  }

  function addMonths(iso, n) {
    const date = parseISO(iso);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + n);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, last));
    return toISO(date);
  }

  function weekday(iso) {
    return parseISO(iso).getDay();
  }

  function startOfWeek(iso) {
    return addDays(iso, -weekday(iso));
  }

  function weekDates(iso) {
    const start = startOfWeek(iso);
    const dates = [];
    for (let i = 0; i < 7; i += 1) dates.push(addDays(start, i));
    return dates;
  }

  function monthMatrix(iso) {
    const date = parseISO(iso);
    const first = toISO(new Date(date.getFullYear(), date.getMonth(), 1));
    const start = startOfWeek(first);
    const dates = [];
    for (let i = 0; i < 42; i += 1) dates.push(addDays(start, i));
    return dates;
  }

  function sameMonth(iso, anchor) {
    return iso.slice(0, 7) === anchor.slice(0, 7);
  }

  function isoWeek(iso) {
    const date = parseISO(iso);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const thursdayDay = (firstThursday.getDay() + 6) % 7;
    const firstWeekThursday = new Date(firstThursday.getFullYear(), 0, 4 - thursdayDay);
    return 1 + Math.round((target - firstWeekThursday) / 86400000 / 7);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function snap(minutes) {
    return Math.round(minutes / SNAP) * SNAP;
  }

  function clock(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return pad(h) + ':' + pad(m);
  }

  function rangeText(start, end) {
    return clock(start) + ' – ' + clock(end);
  }

  function monthTitle(iso) {
    const date = parseISO(iso);
    return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  function shortDate(iso) {
    const date = parseISO(iso);
    return MONTHS_SHORT[date.getMonth()] + ' ' + date.getDate();
  }

  function dayHeading(iso) {
    const date = parseISO(iso);
    return DAYS[date.getDay()] + ' ' + date.getDate();
  }

  function longDate(iso) {
    const date = parseISO(iso);
    return DAYS_LONG[date.getDay()] + ', ' + MONTHS[date.getMonth()] + ' ' + date.getDate();
  }

  function periodLabel(view, anchor) {
    if (view === 'day') return longDate(anchor);
    if (view === 'month') return monthTitle(anchor);
    const dates = weekDates(anchor);
    return 'Week ' + isoWeek(anchor) + ' · ' + shortDate(dates[0]) + ' – ' + shortDate(dates[6]);
  }

  function stepAnchor(view, anchor, dir) {
    if (view === 'day') return addDays(anchor, dir);
    if (view === 'month') return addMonths(anchor, dir);
    return addDays(anchor, dir * 7);
  }

  function holidayOn(iso) {
    for (let i = 0; i < HOLIDAYS.length; i += 1) {
      if (HOLIDAYS[i].date === iso) return HOLIDAYS[i];
    }
    return null;
  }

  function isWeekend(iso) {
    const day = weekday(iso);
    return day === 0 || day === 6;
  }

  function workingDays(from, to) {
    if (!from || !to || to < from) return 0;
    let count = 0;
    let cursor = from;
    for (let guard = 0; guard < 400 && cursor <= to; guard += 1) {
      if (!isWeekend(cursor) && !holidayOn(cursor)) count += 1;
      cursor = addDays(cursor, 1);
    }
    return count;
  }

  function roundDays(n) {
    return Math.round(n * 100) / 100;
  }

  function formatDays(n) {
    const rounded = roundDays(n);
    if (Number.isInteger(rounded)) return String(rounded);
    return String(rounded);
  }

  function leaveStats(requests, today) {
    let approved = 0;
    let pendingDays = 0;
    let pendingCount = 0;
    let upcoming = 0;
    for (let i = 0; i < requests.length; i += 1) {
      const request = requests[i];
      if (request.status === 'approved') {
        approved += request.days;
        if (request.to >= today) upcoming += request.days;
      } else if (request.status === 'pending') {
        pendingDays += request.days;
        pendingCount += 1;
      }
    }
    return {
      available: roundDays(ALLOWANCE - approved - pendingDays),
      pendingCount: pendingCount,
      pendingDays: roundDays(pendingDays),
      upcoming: roundDays(upcoming),
      approved: roundDays(approved),
      contract: CONTRACT_DAYS,
      carryover: CARRYOVER_DAYS,
      allowance: ALLOWANCE,
    };
  }

  function packEvents(events) {
    const sorted = events.slice().sort(function (a, b) {
      return a.start - b.start || a.end - b.end;
    });
    const placed = [];
    let cluster = [];
    let clusterEnd = -1;

    function flush() {
      if (!cluster.length) return;
      const columns = [];
      const rows = [];
      for (let i = 0; i < cluster.length; i += 1) {
        const event = cluster[i];
        let col = -1;
        for (let c = 0; c < columns.length; c += 1) {
          if (columns[c] <= event.start) {
            col = c;
            break;
          }
        }
        if (col === -1) {
          col = columns.length;
          columns.push(event.end);
        } else {
          columns[col] = event.end;
        }
        rows.push({event: event, col: col});
      }
      const cols = columns.length;
      for (let i = 0; i < rows.length; i += 1) {
        placed.push({
          id: rows[i].event.id,
          col: rows[i].col,
          cols: cols,
        });
      }
      cluster = [];
      clusterEnd = -1;
    }

    for (let i = 0; i < sorted.length; i += 1) {
      const event = sorted[i];
      if (cluster.length && event.start >= clusterEnd) flush();
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.end);
    }
    flush();
    return placed;
  }

  function event(fields) {
    return {
      id: fields.id,
      title: fields.title,
      date: fields.date,
      start: fields.start,
      end: fields.end,
      allDay: !!fields.allDay,
      color: fields.color || 'purple',
      note: fields.note || '',
      requestId: fields.requestId || '',
    };
  }

  function h(hours, minutes) {
    return hours * 60 + (minutes || 0);
  }

  function createSeed() {
    return {
      version: 1,
      anchor: DESIGN_DATE,
      view: 'week',
      theme: 'light',
      nextEvent: 100,
      nextRequest: 100,
      events: [
        event({id: 'ev-1', title: 'Time off', date: '2026-11-09', start: 0, end: 1440, allDay: true, color: 'green', note: 'Approved', requestId: 'rq-5'}),
        event({id: 'ev-2', title: 'Personal matters', date: '2026-11-08', start: h(11), end: h(12), color: 'cyan'}),
        event({id: 'ev-3', title: 'Personal appointment', date: '2026-11-10', start: h(7), end: h(9), color: 'orange', note: 'Pending', requestId: 'rq-6'}),
        event({id: 'ev-4', title: 'Extra leave', date: '2026-11-10', start: h(11), end: h(13), color: 'pink', note: 'From carryover days'}),
        event({id: 'ev-5', title: 'Submit medical certificate', date: '2026-11-11', start: h(10), end: h(11), color: 'blue'}),
        event({id: 'ev-6', title: 'Update time tracking', date: '2026-11-12', start: h(7, 30), end: h(8), color: 'cyan'}),
        event({id: 'ev-7', title: 'Benefits review', date: '2026-11-12', start: h(12), end: h(13), color: 'blue'}),
        event({id: 'ev-8', title: 'Half-day leave', date: '2026-11-13', start: h(8), end: h(12), color: 'green', note: 'Approved', requestId: 'rq-7'}),
        event({id: 'ev-9', title: 'Design review', date: '2026-10-27', start: h(14), end: h(15, 30), color: 'purple'}),
        event({id: 'ev-10', title: 'Team sync', date: '2026-10-26', start: h(9, 30), end: h(10, 30), color: 'blue'}),
        event({id: 'ev-11', title: 'Time off', date: '2026-12-23', start: 0, end: 1440, allDay: true, color: 'green', note: 'Approved', requestId: 'rq-8'}),
        event({id: 'ev-12', title: 'Time off', date: '2026-12-24', start: h(8), end: h(12), color: 'green', note: 'Approved', requestId: 'rq-8'}),
        event({id: 'ev-13', title: 'Time off', date: '2026-12-28', start: h(9), end: h(15), color: 'green', note: 'Pending', requestId: 'rq-9'}),
      ],
      requests: [
        {id: 'rq-1', status: 'approved', type: 'Time off', days: 2.5, from: '2026-04-19', to: '2026-04-22', notes: 'Family vacation, including a half-day leave on April 19'},
        {id: 'rq-2', status: 'declined', type: 'Sick', days: 1.25, from: '2026-04-17', to: '2026-04-19', notes: 'Request submitted without medical certificate'},
        {id: 'rq-3', status: 'approved', type: 'Time off', days: 1.5, from: '2026-04-12', to: '2026-04-16', notes: 'Traveling out of town for personal matters'},
        {id: 'rq-4', status: 'approved', type: 'Time off', days: 1, from: '2026-04-08', to: '2026-04-14', notes: 'Personal appointment during working hours'},
        {id: 'rq-5', status: 'approved', type: 'Time off', days: 1, from: '2026-11-09', to: '2026-11-09', notes: 'Long weekend'},
        {id: 'rq-6', status: 'pending', type: 'Personal', days: 0.25, from: '2026-11-10', to: '2026-11-10', notes: 'Personal appointment'},
        {id: 'rq-7', status: 'approved', type: 'Half-day leave', days: 0.5, from: '2026-11-13', to: '2026-11-13', notes: 'Half-day leave'},
        {id: 'rq-8', status: 'approved', type: 'Time off', days: 1.5, from: '2026-12-23', to: '2026-12-24', notes: 'Holiday travel'},
        {id: 'rq-9', status: 'pending', type: 'Time off', days: 0.75, from: '2026-12-28', to: '2026-12-28', notes: 'Moving apartments'},
      ],
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function eventsOn(state, date, allDay) {
    return state.events.filter(function (item) {
      return item.date === date && !!item.allDay === !!allDay;
    });
  }

  function findEvent(state, id) {
    for (let i = 0; i < state.events.length; i += 1) {
      if (state.events[i].id === id) return state.events[i];
    }
    return null;
  }

  function replaceEvent(state, next) {
    const copy = cloneState(state);
    copy.events = copy.events.map(function (item) {
      return item.id === next.id ? next : item;
    });
    return copy;
  }

  function moveEvent(item, date, startMinutes) {
    const next = cloneState({events: [item]}).events[0];
    next.date = date;
    if (next.allDay) return next;
    const duration = Math.max(SNAP, next.end - next.start);
    let start = snap(startMinutes);
    start = clamp(start, DAY_START, DAY_END - duration);
    next.start = start;
    next.end = start + duration;
    return next;
  }

  function resizeEvent(item, endMinutes) {
    const next = cloneState({events: [item]}).events[0];
    if (next.allDay) return next;
    next.end = clamp(snap(endMinutes), next.start + SNAP, DAY_END);
    return next;
  }

  function shiftEvent(item, days, minutes) {
    if (item.allDay) return moveEvent(item, addDays(item.date, days), item.start);
    return moveEvent(item, addDays(item.date, days), item.start + minutes);
  }

  function createTimedEvent(state, fields) {
    const copy = cloneState(state);
    let start = snap(fields.start);
    let end = snap(fields.end);
    start = clamp(start, DAY_START, DAY_END - SNAP);
    end = clamp(end, start + SNAP, DAY_END);
    const made = event({
      id: 'ev-' + copy.nextEvent,
      title: (fields.title || 'New event').trim() || 'New event',
      date: fields.date,
      start: start,
      end: end,
      color: COLORS.indexOf(fields.color) === -1 ? 'purple' : fields.color,
      note: fields.note || '',
    });
    copy.events.push(made);
    copy.nextEvent += 1;
    return {state: copy, event: made};
  }

  function updateEvent(state, id, fields) {
    const current = findEvent(state, id);
    if (!current) return state;
    const next = cloneState({events: [current]}).events[0];
    if (fields.title != null) next.title = String(fields.title).trim() || current.title;
    if (fields.color && COLORS.indexOf(fields.color) !== -1) next.color = fields.color;
    if (fields.note != null) next.note = String(fields.note);
    if (fields.date) next.date = fields.date;
    if (!next.allDay && fields.start != null && fields.end != null) {
      const moved = moveEvent(next, next.date, fields.start);
      const resized = resizeEvent(moved, fields.end);
      next.start = resized.start;
      next.end = resized.end;
    }
    return replaceEvent(state, next);
  }

  function deleteEvent(state, id) {
    const copy = cloneState(state);
    copy.events = copy.events.filter(function (item) { return item.id !== id; });
    return copy;
  }

  function requestLeave(state, fields) {
    const from = fields.from;
    const to = fields.to;
    const days = workingDays(from, to);
    if (days <= 0) return {ok: false, reason: 'no-working-days', state: state};
    const copy = cloneState(state);
    const id = 'rq-' + copy.nextRequest;
    copy.nextRequest += 1;
    const type = fields.type || 'Time off';
    copy.requests.unshift({
      id: id,
      status: 'pending',
      type: type,
      days: days,
      from: from,
      to: to,
      notes: (fields.notes || '').trim(),
    });
    let cursor = from;
    for (let guard = 0; guard < 400 && cursor <= to; guard += 1) {
      if (!isWeekend(cursor) && !holidayOn(cursor)) {
        copy.events.push(event({
          id: 'ev-' + copy.nextEvent,
          title: type,
          date: cursor,
          start: 0,
          end: 1440,
          allDay: true,
          color: 'green',
          note: 'Pending',
          requestId: id,
        }));
        copy.nextEvent += 1;
      }
      cursor = addDays(cursor, 1);
    }
    return {ok: true, state: copy, id: id, days: days};
  }

  function cancelRequest(state, id) {
    const copy = cloneState(state);
    let found = false;
    copy.requests = copy.requests.map(function (request) {
      if (request.id !== id || request.status !== 'pending') return request;
      found = true;
      return Object.assign({}, request, {status: 'cancelled'});
    });
    if (!found) return state;
    copy.events = copy.events.filter(function (item) { return item.requestId !== id; });
    return copy;
  }

  function minutesFromRatio(ratio) {
    const span = DAY_END - DAY_START;
    return snap(DAY_START + clamp(ratio, 0, 1) * span);
  }

  function topPercent(minutes) {
    return ((minutes - DAY_START) / (DAY_END - DAY_START)) * 100;
  }

  function heightPercent(start, end) {
    return ((end - start) / (DAY_END - DAY_START)) * 100;
  }

  return {
    SNAP: SNAP,
    DAY_START: DAY_START,
    DAY_END: DAY_END,
    DESIGN_DATE: DESIGN_DATE,
    COLORS: COLORS,
    HOLIDAYS: HOLIDAYS,
    MONTHS: MONTHS,
    DAYS: DAYS,
    parseISO: parseISO,
    toISO: toISO,
    addDays: addDays,
    addMonths: addMonths,
    weekday: weekday,
    weekDates: weekDates,
    monthMatrix: monthMatrix,
    sameMonth: sameMonth,
    isoWeek: isoWeek,
    snap: snap,
    clamp: clamp,
    clock: clock,
    rangeText: rangeText,
    monthTitle: monthTitle,
    shortDate: shortDate,
    dayHeading: dayHeading,
    longDate: longDate,
    periodLabel: periodLabel,
    stepAnchor: stepAnchor,
    holidayOn: holidayOn,
    workingDays: workingDays,
    formatDays: formatDays,
    leaveStats: leaveStats,
    packEvents: packEvents,
    createSeed: createSeed,
    cloneState: cloneState,
    eventsOn: eventsOn,
    findEvent: findEvent,
    moveEvent: moveEvent,
    resizeEvent: resizeEvent,
    shiftEvent: shiftEvent,
    createTimedEvent: createTimedEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    requestLeave: requestLeave,
    cancelRequest: cancelRequest,
    minutesFromRatio: minutesFromRatio,
    topPercent: topPercent,
    heightPercent: heightPercent,
  };
});
