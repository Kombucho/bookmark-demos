// Simulated usage limits for a menu-bar panel in the shape of Uzzy.
// The numbers are made up. Nothing is read from a provider session.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.UsageReset = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const STORAGE_KEY = 'bookmark-demos.usage-reset.v1';
  const BANDS = { ok: 0, warm: 1, hot: 2, full: 3 };

  const SPECS = [
    {
      id: 'antigravity',
      name: 'Antigravity',
      plan: 'Simulated',
      cost: 6,
      color: '#2c4f86',
      windows: [
        { id: '5h', label: '5-hour rolling', duration: 5 * HOUR, limit: 100, used: 82, resetIn: 42 * MIN },
        { id: 'week', label: 'Weekly', duration: WEEK, limit: 100, used: 37, resetIn: 3 * DAY + 6 * HOUR },
      ],
    },
    {
      id: 'claude',
      name: 'Claude',
      plan: 'Simulated',
      cost: 8,
      color: '#a15c12',
      windows: [
        { id: '5h', label: '5-hour rolling', duration: 5 * HOUR, limit: 100, used: 20, resetIn: 3 * HOUR + 20 * MIN },
        { id: 'week', label: 'Weekly', duration: WEEK, limit: 100, used: 76, resetIn: 20 * HOUR },
      ],
    },
    {
      id: 'codex',
      name: 'Codex',
      plan: 'Simulated',
      cost: 5,
      color: '#24574a',
      windows: [
        { id: '5h', label: '5-hour rolling', duration: 5 * HOUR, limit: 100, used: 90, resetIn: 12 * MIN },
        { id: 'week', label: 'Weekly', duration: WEEK, limit: 100, used: 18, resetIn: 5 * DAY + 4 * HOUR },
      ],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      plan: 'Simulated',
      cost: 7,
      color: '#6b3fa0',
      windows: [
        { id: 'week', label: 'Weekly', duration: WEEK, limit: 100, used: 64, resetIn: 2 * DAY + 8 * HOUR },
      ],
    },
  ];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function createState(now) {
    const at = Number(now);
    return {
      now: at,
      tools: SPECS.map(function (spec) {
        return {
          id: spec.id,
          name: spec.name,
          plan: spec.plan,
          cost: spec.cost,
          color: spec.color,
          windows: spec.windows.map(function (specWindow) {
            return {
              id: specWindow.id,
              label: specWindow.label,
              duration: specWindow.duration,
              limit: specWindow.limit,
              used: specWindow.used,
              resetsAt: at + specWindow.resetIn,
              resetTick: 0,
            };
          }),
        };
      }),
    };
  }

  function toolById(state, toolId) {
    for (let i = 0; i < state.tools.length; i += 1) {
      if (state.tools[i].id === toolId) return state.tools[i];
    }
    return null;
  }

  function left(specWindow) {
    return Math.max(0, specWindow.limit - specWindow.used);
  }

  function ratio(specWindow) {
    if (!specWindow.limit) return 0;
    return specWindow.used / specWindow.limit;
  }

  function band(specWindow) {
    const used = ratio(specWindow);
    if (used >= 1) return 'full';
    if (used >= 0.9) return 'hot';
    if (used >= 0.7) return 'warm';
    return 'ok';
  }

  function worstBand(tool) {
    let best = 'ok';
    tool.windows.forEach(function (specWindow) {
      const next = band(specWindow);
      if (BANDS[next] > BANDS[best]) best = next;
    });
    return best;
  }

  function pressure(state) {
    let max = 0;
    let tone = 'ok';
    state.tools.forEach(function (tool) {
      const toneOfTool = worstBand(tool);
      if (BANDS[toneOfTool] > BANDS[tone]) tone = toneOfTool;
      tool.windows.forEach(function (specWindow) {
        const used = ratio(specWindow);
        if (used > max) max = used;
      });
    });
    return { ratio: max, band: tone };
  }

  function countdown(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
    if (hours > 0) return hours + 'h ' + pad(minutes) + 'm ' + pad(secs) + 's';
    return minutes + 'm ' + pad(secs) + 's';
  }

  function soonest(state) {
    let best = null;
    state.tools.forEach(function (tool) {
      tool.windows.forEach(function (specWindow) {
        const key = tool.name + '\n' + specWindow.label;
        if (!best || specWindow.resetsAt < best.window.resetsAt || (specWindow.resetsAt === best.window.resetsAt && key < best.key)) {
          best = { tool: tool, window: specWindow, key: key };
        }
      });
    });
    return best;
  }

  function nextReset(state) {
    const best = soonest(state);
    if (!best) return null;
    const wait = best.window.resetsAt - state.now;
    return {
      toolId: best.tool.id,
      toolName: best.tool.name,
      windowId: best.window.id,
      label: best.window.label,
      resetsAt: best.window.resetsAt,
      inMs: wait,
      text: best.tool.name + ' · ' + best.window.label + ' · ' + countdown(wait),
    };
  }

  function advance(state, now) {
    const at = Number(now);
    if (at < state.now) return [];
    state.now = at;
    const resets = [];
    state.tools.forEach(function (tool) {
      tool.windows.forEach(function (specWindow) {
        if (at < specWindow.resetsAt) return;
        const periods = Math.floor((at - specWindow.resetsAt) / specWindow.duration) + 1;
        specWindow.resetsAt += periods * specWindow.duration;
        specWindow.used = 0;
        specWindow.resetTick += periods;
        resets.push({
          toolId: tool.id,
          toolName: tool.name,
          windowId: specWindow.id,
          label: specWindow.label,
          periods: periods,
        });
      });
    });
    return resets;
  }

  function room(state, toolId) {
    const tool = toolById(state, toolId);
    if (!tool) return { ok: false, tool: null, blocked: null, message: 'Unknown tool.' };
    const blocked = tool.windows.find(function (specWindow) { return left(specWindow) < tool.cost; });
    if (blocked) {
      return {
        ok: false,
        tool: tool,
        blocked: blocked,
        message: tool.name + ' · ' + blocked.label + ' has ' + left(blocked) + ' left. A prompt uses ' + tool.cost + '.',
      };
    }
    return { ok: true, tool: tool, blocked: null, message: '' };
  }

  function sendPrompt(state, toolId) {
    const check = room(state, toolId);
    if (!check.ok) return { ok: false, message: check.message, windowId: check.blocked ? check.blocked.id : null };
    check.tool.windows.forEach(function (specWindow) { specWindow.used += check.tool.cost; });
    return {
      ok: true,
      cost: check.tool.cost,
      message: 'Sent a prompt to ' + check.tool.name + '. ' + check.tool.cost + ' on each window.',
    };
  }

  function usedLine(specWindow) {
    return specWindow.used + ' used / ' + left(specWindow) + ' left';
  }

  function timeline(state, span) {
    const width = span || WEEK;
    const now = state.now;
    const rows = state.tools.map(function (tool) {
      return tool.windows.map(function (specWindow) {
        const marks = [];
        let at = specWindow.resetsAt;
        while (at <= now + width && marks.length < 48) {
          if (at >= now) marks.push({ at: at, fraction: (at - now) / width });
          at += specWindow.duration;
        }
        return {
          toolId: tool.id,
          toolName: tool.name,
          windowId: specWindow.id,
          label: tool.name + ' · ' + specWindow.label,
          color: tool.color,
          kind: specWindow.id,
          marks: marks,
        };
      });
    });
    return { now: now, span: width, rows: rows.reduce(function (all, part) { return all.concat(part); }, []) };
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function formatClock(ms) {
    const date = new Date(ms);
    return DAYS[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds()) + ' UTC';
  }

  function dayTicks(now, span) {
    const width = span || WEEK;
    const ticks = [{ label: 'now', fraction: 0 }];
    let at = Math.floor(now / DAY) * DAY + DAY;
    while (at < now + width) {
      const fraction = (at - now) / width;
      if (fraction < 0.86) {
        const date = new Date(at);
        ticks.push({
          label: date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()],
          fraction: fraction,
          at: at,
        });
      }
      at += DAY;
    }
    ticks.push({ label: '+7d', fraction: 1 });
    return ticks;
  }

  function clampSpeed(speed) {
    const n = Number(speed);
    if (!isFinite(n) || n < 1) return 1;
    if (n > 3600) return 3600;
    return Math.round(n);
  }

  function speedFromUnit(unit) {
    const t = Math.min(1, Math.max(0, Number(unit) || 0));
    if (t <= 0) return 1;
    return clampSpeed(Math.pow(3600, t));
  }

  function unitFromSpeed(speed) {
    const n = clampSpeed(speed);
    if (n <= 1) return 0;
    return Math.log(n) / Math.log(3600);
  }

  function speedCaption(speed) {
    const n = clampSpeed(speed);
    function trim(value) {
      return String(Math.round(value * 10) / 10);
    }
    if (n >= 3600) {
      const hours = n / 3600;
      return n + '× · 1 real second is ' + trim(hours) + ' simulated hour' + (hours === 1 ? '' : 's');
    }
    if (n >= 60) {
      const minutes = n / 60;
      return n + '× · 1 real second is ' + trim(minutes) + ' simulated minute' + (minutes === 1 ? '' : 's');
    }
    return n + '× · 1 real second is ' + n + ' simulated second' + (n === 1 ? '' : 's');
  }

  function snapshot(state, speed, realNow) {
    return {
      v: 1,
      speed: clampSpeed(speed),
      anchorReal: realNow,
      simNow: state.now,
      tools: state.tools.map(function (tool) {
        return {
          id: tool.id,
          windows: tool.windows.map(function (specWindow) {
            return { id: specWindow.id, used: specWindow.used, resetsAt: specWindow.resetsAt };
          }),
        };
      }),
    };
  }

  function restore(raw, realNow) {
    if (!raw || raw.v !== 1 || !Array.isArray(raw.tools)) return null;
    if (typeof raw.simNow !== 'number' || typeof raw.anchorReal !== 'number') return null;
    if (!isFinite(raw.simNow) || !isFinite(raw.anchorReal)) return null;
    const state = createState(raw.simNow);
    let ok = true;
    if (raw.tools.length !== state.tools.length) return null;
    raw.tools.forEach(function (savedTool) {
      const tool = toolById(state, savedTool && savedTool.id);
      if (!tool || !Array.isArray(savedTool.windows) || savedTool.windows.length !== tool.windows.length) {
        ok = false;
        return;
      }
      savedTool.windows.forEach(function (savedWindow) {
        const specWindow = tool.windows.find(function (item) { return item.id === savedWindow.id; });
        if (!specWindow || typeof savedWindow.used !== 'number' || typeof savedWindow.resetsAt !== 'number') {
          ok = false;
          return;
        }
        if (!isFinite(savedWindow.used) || !isFinite(savedWindow.resetsAt)) ok = false;
        if (savedWindow.used < 0 || savedWindow.used > specWindow.limit) ok = false;
        specWindow.used = savedWindow.used;
        specWindow.resetsAt = savedWindow.resetsAt;
      });
    });
    if (!ok) return null;
    const speed = clampSpeed(raw.speed);
    const elapsed = Math.max(0, realNow - raw.anchorReal);
    advance(state, raw.simNow + elapsed * speed);
    return { state: state, speed: speed };
  }

  function load(storage, realNow) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      const text = storage.getItem(STORAGE_KEY);
      if (!text) return null;
      return restore(JSON.parse(text), realNow);
    } catch (err) {
      return null;
    }
  }

  function save(storage, state, speed, realNow) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state, speed, realNow)));
      return true;
    } catch (err) {
      return false;
    }
  }

  return {
    MIN: MIN,
    HOUR: HOUR,
    DAY: DAY,
    WEEK: WEEK,
    STORAGE_KEY: STORAGE_KEY,
    SPECS: SPECS,
    createState: createState,
    toolById: toolById,
    left: left,
    ratio: ratio,
    band: band,
    worstBand: worstBand,
    pressure: pressure,
    countdown: countdown,
    soonest: soonest,
    nextReset: nextReset,
    advance: advance,
    room: room,
    sendPrompt: sendPrompt,
    usedLine: usedLine,
    timeline: timeline,
    formatClock: formatClock,
    dayTicks: dayTicks,
    clampSpeed: clampSpeed,
    speedFromUnit: speedFromUnit,
    unitFromSpeed: unitFromSpeed,
    speedCaption: speedCaption,
    snapshot: snapshot,
    restore: restore,
    load: load,
    save: save,
  };
});
