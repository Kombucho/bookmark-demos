// Calendar rules for the Between Years pass.
// Thirty-one doors open on December 1 through December 31.
// The thirty-second opens on January 1. Midnight is America/Los_Angeles.
// This file does not touch the network, a wallet, or the DOM.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BetweenYears = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DOOR_COUNT = 32;
  const STORAGE_KEY = 'between-years-demo-opened';
  const ZONE = 'America/Los_Angeles';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const KINDS = ['slide', 'field', 'reflex', 'tones', 'orbit', 'cells', 'maze', 'match'];

  function partMap(date) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    const map = {};
    fmt.formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    return map;
  }

  function pacificParts(date) {
    const map = partMap(date);
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: hour,
      minute: Number(map.minute),
      second: Number(map.second),
    };
  }

  function ymd(parts) {
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  function compareYMD(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  }

  function addDays(date, days) {
    const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
    return {
      year: utc.getUTCFullYear(),
      month: utc.getUTCMonth() + 1,
      day: utc.getUTCDate(),
    };
  }

  function daysBetween(start, end) {
    const a = Date.UTC(start.year, start.month - 1, start.day);
    const b = Date.UTC(end.year, end.month - 1, end.day);
    return Math.round((b - a) / 86400000);
  }

  // January still belongs to the December that just finished.
  // Every other month belongs to the December of that same year.
  function seasonYear(parts) {
    if (parts.month === 1) return parts.year - 1;
    return parts.year;
  }

  function doorDate(door, season) {
    const n = clampDoor(door);
    if (n === DOOR_COUNT) return { year: season + 1, month: 1, day: 1 };
    return { year: season, month: 12, day: n };
  }

  function clampDoor(door) {
    const n = Math.round(Number(door));
    if (n < 1) return 1;
    if (n > DOOR_COUNT) return DOOR_COUNT;
    return n;
  }

  function isUnlocked(door, view) {
    const season = seasonYear(view);
    return compareYMD(view, doorDate(door, season)) >= 0;
  }

  function describe(view) {
    const season = seasonYear(view);
    let unlocked = 0;
    let next = null;
    for (let door = 1; door <= DOOR_COUNT; door += 1) {
      if (compareYMD(view, doorDate(door, season)) >= 0) unlocked += 1;
      else if (next === null) next = door;
    }
    return {
      season: season,
      unlocked: unlocked,
      next: next,
      nextDate: next === null ? null : doorDate(next, season),
    };
  }

  function zoneOffsetMinutes(instant) {
    const map = partMap(instant);
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
    return (asUtc - instant.getTime()) / 60000;
  }

  // UTC instant of 00:00:00 on that civil date in America/Los_Angeles.
  function pacificMidnight(year, month, day) {
    const wanted = Date.UTC(year, month - 1, day, 0, 0, 0);
    let guess = wanted;
    for (let i = 0; i < 4; i += 1) {
      const offset = zoneOffsetMinutes(new Date(guess));
      guess = wanted - offset * 60000;
    }
    return new Date(guess);
  }

  function nextUnlock(now) {
    const parts = pacificParts(now);
    const view = ymd(parts);
    const season = seasonYear(view);
    for (let door = 1; door <= DOOR_COUNT; door += 1) {
      const when = doorDate(door, season);
      if (compareYMD(view, when) < 0) {
        return {
          done: false,
          door: door,
          season: season,
          at: pacificMidnight(when.year, when.month, when.day),
          date: when,
        };
      }
    }
    const nextSeason = { year: season + 1, month: 12, day: 1 };
    return {
      done: true,
      door: null,
      season: season,
      at: pacificMidnight(nextSeason.year, nextSeason.month, nextSeason.day),
      date: nextSeason,
    };
  }

  function formatRemain(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    const text = days > 0
      ? days + 'd ' + pad(hours) + 'h ' + pad(mins) + 'm ' + pad(secs) + 's'
      : pad(hours) + 'h ' + pad(mins) + 'm ' + pad(secs) + 's';
    return { days: days, hours: hours, mins: mins, secs: secs, text: text };
  }

  function formatYMD(date) {
    return date.day + ' ' + MONTHS[date.month - 1] + ' ' + date.year;
  }

  function formatMonth(date) {
    return MONTHS[date.month - 1];
  }

  function scrubRange(real) {
    const season = seasonYear(real);
    let start = { year: season, month: 11, day: 1 };
    let end = { year: season + 1, month: 1, day: 5 };
    if (compareYMD(real, start) < 0) start = { year: real.year, month: real.month, day: real.day };
    if (compareYMD(real, end) > 0) end = { year: real.year, month: real.month, day: real.day };
    return { season: season, start: start, end: end };
  }

  function eachDay(start, end) {
    const days = [];
    const count = daysBetween(start, end);
    for (let i = 0; i <= count; i += 1) days.push(addDays(start, i));
    return days;
  }

  function sameDay(a, b) {
    return a.year === b.year && a.month === b.month && a.day === b.day;
  }

  function dayIndex(dates, target) {
    for (let i = 0; i < dates.length; i += 1) {
      if (sameDay(dates[i], target)) return i;
    }
    return -1;
  }

  function kindForDoor(door) {
    return KINDS[(clampDoor(door) - 1) % KINDS.length];
  }

  function interiorColor(door) {
    const hue = (clampDoor(door) * 47 + 18) % 360;
    return 'hsl(' + hue + ' 42% 46%)';
  }

  function normalizeDoors(list) {
    const seen = Object.create(null);
    const out = [];
    if (!Array.isArray(list)) return out;
    list.forEach(function (value) {
      const n = Math.round(Number(value));
      if (n >= 1 && n <= DOOR_COUNT && !seen[n]) {
        seen[n] = true;
        out.push(n);
      }
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function readOpened(storage, season) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
      return normalizeDoors(data[String(season)]);
    } catch (err) {
      return [];
    }
  }

  function writeOpened(storage, season, doors) {
    let data = {};
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    } catch (err) {
      data = {};
    }
    data[String(season)] = normalizeDoors(doors);
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearOpened(storage, season) {
    writeOpened(storage, season, []);
  }

  return {
    DOOR_COUNT: DOOR_COUNT,
    STORAGE_KEY: STORAGE_KEY,
    ZONE: ZONE,
    KINDS: KINDS.slice(),
    pacificParts: pacificParts,
    ymd: ymd,
    compareYMD: compareYMD,
    addDays: addDays,
    seasonYear: seasonYear,
    doorDate: doorDate,
    isUnlocked: isUnlocked,
    describe: describe,
    pacificMidnight: pacificMidnight,
    nextUnlock: nextUnlock,
    formatRemain: formatRemain,
    formatYMD: formatYMD,
    formatMonth: formatMonth,
    scrubRange: scrubRange,
    eachDay: eachDay,
    sameDay: sameDay,
    dayIndex: dayIndex,
    kindForDoor: kindForDoor,
    interiorColor: interiorColor,
    normalizeDoors: normalizeDoors,
    readOpened: readOpened,
    writeOpened: writeOpened,
    clearOpened: clearOpened,
  };
});
