/* Planetary hours, pigment stages, sigil, and dither. Ported from athanor. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Athanor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CHALDEAN = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];
  const DAY_RULER = [6, 2, 5, 1, 4, 0, 3];
  const PLANET_SYMBOL = {
    Saturn: "♄",
    Jupiter: "♃",
    Mars: "♂",
    Sun: "☉",
    Venus: "♀",
    Mercury: "☿",
    Moon: "☽",
  };
  const PLANET_TRUMP = {
    Mercury: 1,
    Moon: 2,
    Venus: 3,
    Jupiter: 10,
    Mars: 16,
    Sun: 19,
    Saturn: 21,
  };
  const ZENITH = 90.833;
  const LEVELS = CHALDEAN.map(function (planet, index) {
    return { dlvl: index + 1, planet: planet, symbol: PLANET_SYMBOL[planet] };
  });
  const PLACES = [
    { id: "prague", name: "Prague", lat: 50.0875, lon: 14.4213, tz: "Europe/Prague" },
    { id: "kyoto", name: "Kyoto", lat: 35.0116, lon: 135.7681, tz: "Asia/Tokyo" },
    { id: "cairo", name: "Cairo", lat: 30.0444, lon: 31.2357, tz: "Africa/Cairo" },
    { id: "mexico", name: "Mexico City", lat: 19.4326, lon: -99.1332, tz: "America/Mexico_City" },
    { id: "reykjavik", name: "Reykjavík", lat: 64.1466, lon: -21.9426, tz: "Atlantic/Reykjavik" },
  ];

  const MAJORS = [
    ["0", "The Fool", "beginnings, a leap, innocence", "recklessness, hesitation"],
    ["I", "The Magician", "will, skill, making it happen", "trickery, untapped talent"],
    ["II", "The High Priestess", "intuition, the hidden, silence", "secrets kept, surface reading"],
    ["III", "The Empress", "abundance, growth, care", "smothering, stalled work"],
    ["IV", "The Emperor", "structure, authority, order", "rigidity, control slipping"],
    ["V", "The Hierophant", "tradition, teaching, convention", "dogma, breaking the rules"],
    ["VI", "The Lovers", "union, choice, alignment", "discord, a choice avoided"],
    ["VII", "The Chariot", "drive, victory through control", "scattered will, losing the road"],
    ["VIII", "Strength", "patience, quiet courage", "self-doubt, force over gentleness"],
    ["IX", "The Hermit", "solitude, searching, an inner light", "isolation, withdrawal"],
    ["X", "Wheel of Fortune", "cycles, turning luck", "bad timing, resisting change"],
    ["XI", "Justice", "fairness, cause and effect", "imbalance, dodging accountability"],
    ["XII", "The Hanged Man", "pause, surrender, a new view", "stalling, needless sacrifice"],
    ["XIII", "Death", "endings, transformation", "clinging, slow decay"],
    ["XIV", "Temperance", "balance, moderation, mixing well", "excess, impatience"],
    ["XV", "The Devil", "bondage, appetite, attachment", "release, breaking chains"],
    ["XVI", "The Tower", "upheaval, sudden truth", "disaster averted, fear of change"],
    ["XVII", "The Star", "hope, renewal, calm", "discouragement, faith wavering"],
    ["XVIII", "The Moon", "illusion, dreams, unease", "confusion lifting, fear released"],
    ["XIX", "The Sun", "clarity, success, warmth", "clouded joy, delay"],
    ["XX", "Judgement", "reckoning, awakening, a call", "self-doubt, ignoring the call"],
    ["XXI", "The World", "completion, integration, arrival", "loose ends, a near finish"],
  ];
  const RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
  const SUITS = [
    ["Wands", [
      ["spark, inspiration", "delays, a false start"],
      ["planning, looking ahead", "fear of the unknown"],
      ["expansion, foresight", "obstacles at a distance"],
      ["celebration, homecoming", "shaky foundations"],
      ["conflict, competition", "avoidance, an uneasy truce"],
      ["victory, recognition", "pride before a fall"],
      ["holding your ground", "overwhelmed, giving way"],
      ["speed, news in motion", "delays, frustration"],
      ["resilience, the last stand", "exhaustion"],
      ["burden, overcommitment", "setting the load down"],
      ["curiosity, a message", "scattered energy"],
      ["action, adventure", "haste"],
      ["confidence, warmth", "jealousy"],
      ["vision, leadership", "impulsiveness"],
    ]],
    ["Cups", [
      ["new feeling, overflow", "emotional block"],
      ["partnership, mutual pull", "imbalance between two"],
      ["friendship, celebration", "overindulgence"],
      ["apathy, contemplation", "renewed interest"],
      ["loss, regret", "acceptance"],
      ["nostalgia, kindness", "stuck in the past"],
      ["choices, fantasy", "clarity arrives"],
      ["walking away", "fear of leaving"],
      ["contentment, a wish granted", "smugness"],
      ["harmony, family", "a broken home"],
      ["tender news, intuition", "emotional immaturity"],
      ["romance, an invitation", "moodiness"],
      ["compassion, calm", "martyrdom"],
      ["emotional balance", "manipulation"],
    ]],
    ["Swords", [
      ["clarity, breakthrough", "confusion"],
      ["stalemate, a hard choice", "too much information"],
      ["heartbreak, grief", "recovery"],
      ["rest, recovery", "restlessness"],
      ["a hollow victory", "reconciliation"],
      ["transition, passage", "an unfinished move"],
      ["deception, stealth", "coming clean"],
      ["restriction, self-made traps", "release"],
      ["anxiety, sleeplessness", "hope returning"],
      ["rock bottom, an ending", "recovery begins"],
      ["vigilance, curiosity", "gossip"],
      ["a charge, ambition", "recklessness"],
      ["perception, honesty", "coldness"],
      ["intellect, judgment", "tyranny"],
    ]],
    ["Pentacles", [
      ["opportunity, prosperity", "a missed chance"],
      ["juggling, adaptability", "overwhelm"],
      ["craft, teamwork", "poor workmanship"],
      ["holding on, security", "greed"],
      ["hardship, left out in the cold", "recovery"],
      ["generosity, fair exchange", "strings attached"],
      ["patience, the long view", "impatience"],
      ["diligence, practice", "perfectionism"],
      ["self-sufficiency, comfort", "overwork"],
      ["legacy, wealth", "family trouble"],
      ["study, a plan", "procrastination"],
      ["steady work", "boredom"],
      ["nurture, practicality", "self-neglect"],
      ["abundance, security", "stubbornness"],
    ]],
  ];

  const DECK = MAJORS.map(function (row, index) {
    return { index: index, numeral: row[0], name: row[1], upright: row[2], reversed: row[3] };
  });
  SUITS.forEach(function (suit) {
    suit[1].forEach(function (meanings, rank) {
      DECK.push({
        index: DECK.length,
        numeral: "",
        name: RANKS[rank] + " of " + suit[0],
        upright: meanings[0],
        reversed: meanings[1],
      });
    });
  });
  const TRUMPS = CHALDEAN.map(function (planet) {
    return DECK[PLANET_TRUMP[planet]];
  });

  const SCHEME_ORDER = ["umber", "vellum", "orpiment", "cinnabar"];
  const STAGE_NAME = {
    umber: "nigredo",
    vellum: "albedo",
    orpiment: "citrinitas",
    cinnabar: "rubedo",
  };
  const DAYLIGHT = ["vellum", "orpiment", "cinnabar"];
  const SCHEMES = {
    umber: {
      label: "Umber", stage: "nigredo",
      bg: "#16120e", fg: "#e3d6b8", dim: "#8d7d65", border: "#3a3126",
      active: "#d49a3a", bar: "#0d0b08", barfg: "#cfc1a3", warn: "#dd7357", sigil: "#d49a3a",
      wall: ["#16120e", "#5c4c39"],
    },
    vellum: {
      label: "Vellum", stage: "albedo",
      bg: "#ece1c6", fg: "#1f1914", dim: "#6e5f4c", border: "#b9aa86",
      active: "#7c5510", bar: "#ddd0ae", barfg: "#2b241c", warn: "#9a3522", sigil: "#7c5510",
      wall: ["#c8b994", "#ece1c6"],
    },
    orpiment: {
      label: "Orpiment", stage: "citrinitas",
      bg: "#eddca8", fg: "#241a0c", dim: "#6a5737", border: "#c9b27a",
      active: "#7a4f06", bar: "#2a1d0a", barfg: "#e9c766", warn: "#e8775a", sigil: "#8a5a08",
      wall: ["#d4bd80", "#eddca8"],
    },
    cinnabar: {
      label: "Cinnabar", stage: "rubedo",
      bg: "#1c0e0c", fg: "#ecd9c0", dim: "#a8857a", border: "#4a2420",
      active: "#e2a24a", bar: "#6e1a14", barfg: "#f3e4cc", warn: "#ffd27a", sigil: "#ee6a46",
      wall: ["#1c0e0c", "#6e3428"],
    },
  };

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256(input) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    const msg = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
    const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
    padded.set(msg);
    padded[msg.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, (msg.length * 8) >>> 0, false);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let i = 0; i < padded.length; i += 64) {
      for (let j = 0; j < 16; j += 1) w[j] = view.getUint32(i + j * 4, false);
      for (let j = 16; j < 64; j += 1) {
        const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let j = 0; j < 64; j += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + s1 + ch + K[j] + w[j]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function (value, index) {
      ov.setUint32(index * 4, value, false);
    });
    return out;
  }

  function u32(bytes, offset) {
    return ((bytes[offset] * 16777216) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  }

  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  }

  function digestText(text) {
    return sha256(new TextEncoder().encode(String(text)));
  }

  function fingerprint(digest) {
    let raw = "";
    for (let i = 0; i < digest.length; i += 1) raw += String.fromCharCode(digest[i]);
    return "SHA256:" + btoa(raw).replace(/=+$/, "");
  }

  function parts(date, timeZone) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    });
    const bag = {};
    fmt.formatToParts(date).forEach(function (part) { bag[part.type] = part.value; });
    let hour = bag.hour === "24" ? 0 : Number(bag.hour);
    return {
      y: Number(bag.year),
      m: Number(bag.month),
      d: Number(bag.day),
      hour: hour,
      minute: Number(bag.minute),
      second: Number(bag.second),
      weekday: bag.weekday,
    };
  }

  function dateKey(y, m, d) {
    return y * 10000 + m * 100 + d;
  }

  function addDays(y, m, d, n) {
    const next = new Date(Date.UTC(y, m - 1, d + n));
    return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
  }

  function isoDate(y, m, d) {
    return String(y) + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function weekdayMon(y, m, d) {
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  }

  function zonedWallToUtc(y, m, d, hour, minute, timeZone) {
    let utc = Date.UTC(y, m - 1, d, hour, minute, 0);
    for (let i = 0; i < 4; i += 1) {
      const local = parts(new Date(utc), timeZone);
      const asUtc = Date.UTC(local.y, local.m - 1, local.d, local.hour, local.minute, local.second);
      const want = Date.UTC(y, m - 1, d, hour, minute, 0);
      const diff = want - asUtc;
      if (diff === 0) break;
      utc += diff;
    }
    return new Date(utc);
  }

  function onto(moment, y, m, d, timeZone) {
    const local = parts(moment, timeZone);
    const have = dateKey(local.y, local.m, local.d);
    const want = dateKey(y, m, d);
    if (have < want) return new Date(moment.getTime() + 86400000);
    if (have > want) return new Date(moment.getTime() - 86400000);
    return moment;
  }

  /* Almanac for Computers, 1990. Same steps as athanor sky.py. */
  function sunEventHours(y, m, d, lat, lon, rising) {
    const yday = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const lngHour = lon / 15;
    const t = yday + ((rising ? 6 : 18) - lngHour) / 24;
    const mean = 0.9856 * t - 3.289;
    const trueLon = mod(mean + 1.916 * Math.sin(rad(mean)) + 0.020 * Math.sin(rad(2 * mean)) + 282.634, 360);
    let ra = mod(deg(Math.atan(0.91764 * Math.tan(rad(trueLon)))), 360);
    ra += Math.floor(trueLon / 90) * 90 - Math.floor(ra / 90) * 90;
    ra /= 15;
    const sinDec = 0.39782 * Math.sin(rad(trueLon));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(rad(ZENITH)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
    if (cosH < -1 || cosH > 1) return null;
    const hourAngle = (rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
    return mod(hourAngle + ra - 0.06571 * t - 6.622 - lngHour, 24);
  }

  function rad(n) { return n * Math.PI / 180; }
  function deg(n) { return n * 180 / Math.PI; }

  function sunTimes(y, m, d, lat, lon, timeZone) {
    const riseH = sunEventHours(y, m, d, lat, lon, true);
    const setH = sunEventHours(y, m, d, lat, lon, false);
    if (riseH == null || setH == null) return null;
    const base = Date.UTC(y, m - 1, d);
    return {
      rise: onto(new Date(base + riseH * 3600000), y, m, d, timeZone),
      set: onto(new Date(base + setH * 3600000), y, m, d, timeZone),
      approximate: false,
    };
  }

  function dayBounds(y, m, d, lat, lon, timeZone) {
    const times = sunTimes(y, m, d, lat, lon, timeZone);
    if (times) return times;
    return {
      rise: zonedWallToUtc(y, m, d, 6, 0, timeZone),
      set: zonedWallToUtc(y, m, d, 18, 0, timeZone),
      approximate: true,
    };
  }

  function hourSlot(index, ruler, isDay, startMs, span) {
    const planet = CHALDEAN[(ruler + index) % 7];
    const card = DECK[PLANET_TRUMP[planet]];
    return {
      index: index,
      isDay: isDay,
      planet: planet,
      symbol: PLANET_SYMBOL[planet],
      trump: card.name,
      numeral: card.numeral,
      start: new Date(startMs),
      end: new Date(startMs + span),
    };
  }

  function planetaryDay(now, place) {
    const tz = place.tz;
    const today = parts(now, tz);
    const todayBounds = dayBounds(today.y, today.m, today.d, place.lat, place.lon, tz);
    let day = today;
    let sunrise;
    let sunset;
    let nextRise;
    let approximate = todayBounds.approximate;
    if (now < todayBounds.rise) {
      day = addDays(today.y, today.m, today.d, -1);
      const prev = dayBounds(day.y, day.m, day.d, place.lat, place.lon, tz);
      sunrise = prev.rise;
      sunset = prev.set;
      nextRise = todayBounds.rise;
      approximate = approximate || prev.approximate;
    } else {
      const next = addDays(today.y, today.m, today.d, 1);
      const nextBounds = dayBounds(next.y, next.m, next.d, place.lat, place.lon, tz);
      sunrise = todayBounds.rise;
      sunset = todayBounds.set;
      nextRise = nextBounds.rise;
      approximate = approximate || nextBounds.approximate;
    }
    const ruler = DAY_RULER[weekdayMon(day.y, day.m, day.d)];
    const daySpan = (sunset.getTime() - sunrise.getTime()) / 12;
    const nightSpan = (nextRise.getTime() - sunset.getTime()) / 12;
    const hours = [];
    for (let i = 0; i < 12; i += 1) {
      hours.push(hourSlot(i, ruler, true, sunrise.getTime() + i * daySpan, daySpan));
    }
    for (let i = 0; i < 12; i += 1) {
      hours.push(hourSlot(12 + i, ruler, false, sunset.getTime() + i * nightSpan, nightSpan));
    }
    let current = hours[23];
    for (let i = 0; i < hours.length; i += 1) {
      if (now >= hours[i].start && now < hours[i].end) {
        current = hours[i];
        break;
      }
    }
    const local = parts(now, tz);
    return {
      approximate: approximate,
      dayRuler: CHALDEAN[ruler],
      iso: isoDate(day.y, day.m, day.d),
      localIso: isoDate(local.y, local.m, local.d),
      localLabel: local.weekday + ", the " + ordinal(local.d) + " of " + monthName(local.m),
      sunrise: sunrise,
      sunset: sunset,
      nextRise: nextRise,
      hours: hours,
      current: current,
      moon: moonPhase(now),
    };
  }

  function monthName(m) {
    return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
  }

  function ordinal(n) {
    const suffix = (n % 100 >= 10 && n % 100 <= 20) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
    return String(n) + suffix;
  }

  function clock(date, timeZone) {
    const local = parts(date, timeZone);
    return String(local.hour).padStart(2, "0") + ":" + String(local.minute).padStart(2, "0");
  }

  const PHASES = ["new", "waxing crescent", "first quarter", "waxing gibbous", "full", "waning gibbous", "last quarter", "waning crescent"];
  const SYNODIC = 29.530588853;
  const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  function moonPhase(now) {
    const age = mod((now.getTime() - NEW_MOON) / 86400000, SYNODIC);
    return PHASES[Math.floor(age / SYNODIC * 8 + 0.5) % 8];
  }

  function schemeForHour(hour) {
    if (!hour.isDay) return "umber";
    return DAYLIGHT[Math.floor(hour.index / 4)];
  }

  function nextScheme(name) {
    return SCHEME_ORDER[(SCHEME_ORDER.indexOf(name) + 1) % SCHEME_ORDER.length];
  }

  function channel(v) {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = channel((n >> 16) & 255);
    const g = channel((n >> 8) & 255);
    const b = channel(n & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const hi = Math.max(luminance(a), luminance(b));
    const lo = Math.min(luminance(a), luminance(b));
    return (hi + 0.05) / (lo + 0.05);
  }

  function contrastReport(scheme) {
    return [
      { id: "body", label: "Body", pair: "fg on bg", fg: scheme.fg, bg: scheme.bg, minimum: 7 },
      { id: "accent", label: "Accent", pair: "active on bg", fg: scheme.active, bg: scheme.bg, minimum: 4.5 },
      { id: "bar", label: "Bar", pair: "bar text on bar", fg: scheme.barfg, bg: scheme.bar, minimum: 7 },
      { id: "sigil", label: "Sigil", pair: "sigil on bg", fg: scheme.sigil, bg: scheme.bg, minimum: 4.5 },
    ].map(function (row) {
      const ratio = contrast(row.fg, row.bg);
      return {
        id: row.id,
        label: row.label,
        pair: row.pair,
        fg: row.fg,
        bg: row.bg,
        minimum: row.minimum,
        ratio: ratio,
        ok: ratio >= row.minimum - 1e-9,
      };
    });
  }

  const SIGIL_SIZE = 11;

  function sigilGrid(digest) {
    const cells = [];
    for (let y = 0; y < SIGIL_SIZE; y += 1) {
      cells.push(new Array(SIGIL_SIZE).fill(false));
    }
    for (let i = 0; i < SIGIL_SIZE; i += 1) {
      cells[0][i] = cells[SIGIL_SIZE - 1][i] = cells[i][0] = cells[i][SIGIL_SIZE - 1] = true;
    }
    let bit = 0;
    for (let y = 2; y < SIGIL_SIZE - 2; y += 1) {
      for (let x = 2; x <= Math.floor(SIGIL_SIZE / 2); x += 1) {
        const on = Boolean((digest[Math.floor(bit / 8)] >> (bit % 8)) & 1);
        cells[y][x] = cells[y][SIGIL_SIZE - 1 - x] = on;
        bit += 1;
      }
    }
    return cells;
  }

  function sigilText(cells) {
    return cells.map(function (row) {
      return row.map(function (on) { return on ? "██" : "  "; }).join("");
    }).join("\n");
  }

  function cardOfDay(iso, seedBytes) {
    const hash = sha256(concat(new TextEncoder().encode(iso), seedBytes));
    const index = u32(hash, 0) % DECK.length;
    return { card: DECK[index], reversed: Boolean(hash[4] & 1) };
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SPREAD_POSITIONS = ["past", "present", "future"];

  function spreadOf(iso, seedBytes) {
    const hash = sha256(concat(seedBytes, new TextEncoder().encode(iso + ":spread")));
    const rnd = mulberry32(u32(hash, 0));
    const order = DECK.map(function (card) { return card.index; });
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
    return order.slice(0, 3).map(function (index, place) {
      return {
        position: SPREAD_POSITIONS[place],
        card: DECK[index],
        reversed: rnd() < 0.5,
      };
    });
  }

  function sigmoidalContrast(value, contrastAmount, midpoint) {
    const amount = contrastAmount == null ? 4 : contrastAmount;
    const mid = midpoint == null ? 0.5 : midpoint;
    function sig(x) {
      return 1 / (1 + Math.exp(amount * (mid - x)));
    }
    const min = sig(0);
    const max = sig(1);
    return (sig(value) - min) / (max - min);
  }

  function floydSteinberg(gray, width, height) {
    const buf = new Float32Array(gray);
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const old = buf[i];
        const neu = old < 0.5 ? 0 : 1;
        out[i] = neu;
        const err = old - neu;
        if (x + 1 < width) buf[i + 1] += err * (7 / 16);
        if (y + 1 < height) {
          if (x > 0) buf[i + width - 1] += err * (3 / 16);
          buf[i + width] += err * (5 / 16);
          if (x + 1 < width) buf[i + width + 1] += err * (1 / 16);
        }
      }
    }
    return out;
  }

  function formatBytes(n) {
    if (n == null || !Number.isFinite(n)) return "--";
    const gib = n / (2 ** 30);
    if (gib >= 1000) return (gib / 1024).toFixed(1) + "T";
    if (gib >= 10) return gib.toFixed(0) + "G";
    return gib.toFixed(1) + "G";
  }

  function withArticle(planet) {
    return (planet === "Sun" || planet === "Moon") ? "the " + planet : planet;
  }

  return {
    CHALDEAN: CHALDEAN,
    LEVELS: LEVELS,
    PLACES: PLACES,
    DECK: DECK,
    SCHEME_ORDER: SCHEME_ORDER,
    SCHEMES: SCHEMES,
    STAGE_NAME: STAGE_NAME,
    sha256: sha256,
    digestText: digestText,
    fingerprint: fingerprint,
    zonedWallToUtc: zonedWallToUtc,
    sunTimes: sunTimes,
    planetaryDay: planetaryDay,
    clock: clock,
    schemeForHour: schemeForHour,
    nextScheme: nextScheme,
    luminance: luminance,
    contrast: contrast,
    contrastReport: contrastReport,
    sigilGrid: sigilGrid,
    sigilText: sigilText,
    cardOfDay: cardOfDay,
    spreadOf: spreadOf,
    sigmoidalContrast: sigmoidalContrast,
    floydSteinberg: floydSteinberg,
    formatBytes: formatBytes,
    moonPhase: moonPhase,
    withArticle: withArticle,
  };
});
