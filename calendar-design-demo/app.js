(function () {
  const C = window.CalendarDesign;
  const STORAGE = 'bookmark-demos.calendar-design.v1';
  const HOURS = 16;

  const workspace = document.getElementById('workspace');
  const surface = document.getElementById('surface');
  const editor = document.getElementById('editor');
  const leaveDialog = document.getElementById('leave-dialog');
  const helpDialog = document.getElementById('help-dialog');
  const status = document.getElementById('status');

  let state = load();
  let selectedId = null;
  let drag = null;
  let scrollMemory = 52;
  let viewKey = '';
  let editingId = null;
  let creating = false;

  function todayISO() {
    return C.toISO(new Date());
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return C.createSeed();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.events) || !Array.isArray(parsed.requests)) {
        return C.createSeed();
      }
      return parsed;
    } catch (err) {
      return C.createSeed();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch (err) {}
  }

  function say(text) {
    status.textContent = text;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch];
    });
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme === 'dark' ? 'dark' : 'light';
    const button = document.getElementById('theme-btn');
    const dark = state.theme === 'dark';
    button.textContent = dark ? 'Light' : 'Dark';
    button.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }

  function commit(next, message) {
    state = next;
    save();
    render();
    if (message) say(message);
  }

  function fillTimes(select, selected) {
    const html = [];
    for (let minutes = C.DAY_START; minutes <= C.DAY_END; minutes += C.SNAP) {
      html.push('<option value="' + minutes + '"' + (minutes === selected ? ' selected' : '') + '>' + C.clock(minutes) + '</option>');
    }
    select.innerHTML = html.join('');
  }

  function openEditor(existing, preset) {
    const item = existing || null;
    editingId = item ? item.id : null;
    creating = !item;
    document.getElementById('editor-title').textContent = item ? 'Edit event' : 'New event';
    document.getElementById('f-title').value = item ? item.title : (preset && preset.title) || '';
    document.getElementById('f-date').value = item ? item.date : preset.date;
    document.getElementById('f-note').value = item ? item.note : '';
    document.getElementById('f-error').textContent = '';
    const allDay = !!(item && item.allDay);
    document.getElementById('f-allday').hidden = !allDay;
    document.getElementById('f-times').hidden = allDay;
    const start = item && !item.allDay ? item.start : (preset && preset.start) || 9 * 60;
    const end = item && !item.allDay ? item.end : (preset && preset.end) || 10 * 60;
    fillTimes(document.getElementById('f-start'), start);
    fillTimes(document.getElementById('f-end'), end);
    const color = item ? item.color : 'purple';
    const colors = document.getElementById('f-colors');
    colors.innerHTML = '<legend>Colour</legend>' + C.COLORS.map(function (name) {
      return '<label><input type="radio" name="color" value="' + name + '" class="swatch-' + name + '"' + (name === color ? ' checked' : '') + ' aria-label="' + name + '"></label>';
    }).join('');
    document.getElementById('f-delete').hidden = creating;
    if (!editor.open) editor.showModal();
    document.getElementById('f-title').focus();
  }

  function readColor() {
    const picked = document.querySelector('#f-colors input:checked');
    return picked ? picked.value : 'purple';
  }

  function openLeave() {
    document.getElementById('l-from').value = state.anchor;
    document.getElementById('l-to').value = state.anchor;
    document.getElementById('l-note').value = '';
    document.getElementById('l-error').textContent = '';
    updateLeavePreview();
    if (!leaveDialog.open) leaveDialog.showModal();
    document.getElementById('l-from').focus();
  }

  function updateLeavePreview() {
    const from = document.getElementById('l-from').value;
    const to = document.getElementById('l-to').value;
    const preview = document.getElementById('l-preview');
    if (!from || !to || to < from) {
      preview.textContent = 'Choose a start and an end.';
      return;
    }
    const days = C.workingDays(from, to);
    const stats = C.leaveStats(state.requests, todayISO());
    const after = Math.round((stats.available - days) * 100) / 100;
    if (days === 0) {
      preview.textContent = 'That range has no working days. Weekends and holidays are skipped.';
      return;
    }
    preview.textContent = C.formatDays(days) + ' working day' + (days === 1 ? '' : 's') + '. Balance after this request: ' + C.formatDays(after) + '.';
  }

  function eventButton(item, extraClass, style) {
    const compact = !item.allDay && item.end - item.start < 45;
    const note = item.note ? '<small>' + esc(item.note) + '</small>' : '';
    const when = item.allDay ? '' : '<em>' + esc(C.rangeText(item.start, item.end)) + '</em>';
    const resize = item.allDay ? '' : '<span class="resize" data-resize="1"></span>';
    return '<button type="button" class="event color-' + esc(item.color) + (compact ? ' is-short' : '') + (item.id === selectedId ? ' is-selected' : '') + (extraClass ? ' ' + extraClass : '') + '" data-id="' + esc(item.id) + '" style="' + (style || '') + '" title="' + esc(item.title) + '">' +
      resize + '<strong>' + esc(item.title) + '</strong>' + when + note + '</button>';
  }

  function layoutStyle(item, placed) {
    const width = 100 / placed.cols;
    return 'top:' + C.topPercent(item.start) + '%;height:' + C.heightPercent(item.start, item.end) + '%;left:' + (placed.col * width) + '%;width:calc(' + width + '% - 3px);';
  }

  function renderChrome() {
    document.getElementById('month-label').textContent = C.monthTitle(state.anchor);
    document.getElementById('period-label').textContent = C.periodLabel(state.view, state.anchor);
    ['day', 'week', 'month'].forEach(function (view) {
      document.getElementById('view-' + view).setAttribute('aria-pressed', state.view === view ? 'true' : 'false');
    });
    applyTheme();
  }

  function renderMini() {
    const dates = C.monthMatrix(state.anchor);
    const marked = {};
    state.events.forEach(function (item) { marked[item.date] = true; });
    const today = todayISO();
    const cells = dates.map(function (date) {
      const classes = [];
      if (!C.sameMonth(date, state.anchor)) classes.push('is-out');
      if (date === state.anchor) classes.push('is-selected');
      if (date === today) classes.push('is-today');
      if (marked[date]) classes.push('has-events');
      return '<button type="button" class="' + classes.join(' ') + '" data-act="day" data-date="' + date + '" aria-label="' + esc(C.longDate(date)) + '">' + Number(date.slice(8)) + '</button>';
    }).join('');
    document.getElementById('mini').innerHTML =
      '<div class="mini-head"><button type="button" data-act="mini-prev" aria-label="Previous month">‹</button><strong>' +
      esc(C.monthTitle(state.anchor)) + '</strong><button type="button" data-act="mini-next" aria-label="Next month">›</button></div>' +
      '<div class="dow-row mini-grid">' + C.DAYS.map(function (day) { return '<span>' + day.slice(0, 1) + '</span>'; }).join('') + '</div>' +
      '<div class="mini-grid">' + cells + '</div>';
  }

  function renderStats() {
    const stats = C.leaveStats(state.requests, todayISO());
    const cards = [
      [C.formatDays(stats.available), 'days available'],
      [String(stats.pendingCount), 'pending requests'],
      [C.formatDays(stats.upcoming), 'days upcoming'],
      [String(stats.contract), 'days per year'],
      [String(stats.carryover), 'days extra leave'],
    ];
    document.getElementById('stats').innerHTML = '<div class="stats">' + cards.map(function (card) {
      return '<div class="stat"><b>' + esc(card[0]) + '</b><span>' + esc(card[1]) + '</span></div>';
    }).join('') + '</div>';

    const today = todayISO();
    const rows = state.requests.filter(function (request) {
      return request.status === 'pending' || (request.status === 'approved' && request.to >= today);
    }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    document.getElementById('requests').innerHTML = rows.map(function (request) {
      const when = request.from === request.to ? C.shortDate(request.from) : C.shortDate(request.from) + ' – ' + C.shortDate(request.to);
      const cancel = request.status === 'pending'
        ? '<button type="button" data-act="cancel" data-id="' + esc(request.id) + '">Cancel</button>'
        : '';
      return '<div class="request"><button type="button" data-act="jump" data-date="' + esc(request.from) + '"><p>' + esc(request.type) + ' · ' + esc(C.formatDays(request.days)) + 'd</p><small>' + esc(when) + ' <span class="pill is-' + esc(request.status) + '">' + esc(request.status) + '</span></small></button>' + cancel + '</div>';
    }).join('') || '<p class="period">No upcoming requests.</p>';
  }

  function hourMarks() {
    let lines = '';
    let labels = '';
    for (let hour = 0; hour <= HOURS; hour += 1) {
      const top = (hour / HOURS) * 100;
      labels += '<span class="hour-label" style="top:' + top + '%">' + C.clock(C.DAY_START + hour * 60) + '</span>';
      if (hour < HOURS) {
        lines += '<i class="hour-line" style="top:' + top + '%"></i>';
        lines += '<i class="hour-line half" style="top:' + ((hour + 0.5) / HOURS) * 100 + '%"></i>';
      }
    }
    return {lines: lines, labels: labels};
  }

  function nowLine(date) {
    if (date !== todayISO()) return '';
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < C.DAY_START || minutes > C.DAY_END) return '';
    return '<div class="now" style="top:' + C.topPercent(minutes) + '%"></div>';
  }

  function renderTimeGrid(dates) {
    const marks = hourMarks();
    const head = dates.map(function (date) {
      const classes = ['day-num'];
      if (date === state.anchor) classes.push('is-selected');
      if (date === todayISO()) classes.push('is-today');
      return '<div class="day-head"><span>' + C.DAYS[C.weekday(date)] + '</span><button type="button" class="' + classes.join(' ') + '" data-act="day" data-date="' + date + '">' + Number(date.slice(8)) + '</button></div>';
    }).join('');
    const allday = dates.map(function (date) {
      const holiday = C.holidayOn(date);
      const chips = C.eventsOn(state, date, true).map(function (item) {
        return eventButton(item, 'chip', '');
      }).join('');
      const mark = holiday ? '<div class="chip holiday">' + esc(holiday.name) + '</div>' : '';
      return '<div class="allday-cell" data-allday="' + date + '" data-date="' + date + '">' + mark + chips + '</div>';
    }).join('');
    const cols = dates.map(function (date) {
      const weekend = C.weekday(date) === 0 || C.weekday(date) === 6;
      const timed = C.eventsOn(state, date, false);
      const placed = {};
      C.packEvents(timed).forEach(function (item) { placed[item.id] = item; });
      const blocks = timed.map(function (item) {
        return eventButton(item, '', layoutStyle(item, placed[item.id]));
      }).join('');
      return '<div class="day-col' + (weekend ? ' is-weekend' : '') + '" data-timed="' + date + '" data-date="' + date + '">' +
        '<div class="sizer"></div>' +
        '<div class="slots">' + marks.lines + '</div>' +
        '<div class="events">' + blocks + '</div>' + nowLine(date) + '</div>';
    }).join('');
    return '<div class="sheet' + (viewKey !== state.view + state.anchor ? ' is-enter' : '') + '">' +
      '<div class="week-head"><div></div>' + head + '</div>' +
      '<div class="allday"><div class="gutter"></div>' + allday + '</div>' +
      '<div class="time-grid"><div class="gutter"><div class="sizer"></div>' + marks.labels + '</div>' + cols + '</div></div>';
  }

  function renderMonth() {
    const dates = C.monthMatrix(state.anchor);
    const cells = dates.map(function (date) {
      const items = state.events.filter(function (item) { return item.date === date; });
      const shown = items.slice(0, 3).map(function (item) {
        return eventButton(item, 'chip', '');
      }).join('');
      const more = items.length > 3 ? '<span class="more">+' + (items.length - 3) + '</span>' : '';
      const holiday = C.holidayOn(date);
      const numClass = 'day-num' + (date === state.anchor ? ' is-selected' : '') + (date === todayISO() ? ' is-today' : '');
      return '<div class="month-cell' + (C.sameMonth(date, state.anchor) ? '' : ' is-out') + '" data-month="1">' +
        '<button type="button" class="' + numClass + '" data-act="day" data-date="' + date + '">' + Number(date.slice(8)) + '</button>' +
        (holiday ? '<div class="chip holiday">' + esc(holiday.name) + '</div>' : '') +
        shown + more + '</div>';
    }).join('');
    return '<div class="sheet is-month' + (viewKey !== 'month' + state.anchor ? ' is-enter' : '') + '"><div class="week-head">' +
      C.DAYS.map(function (day) { return '<div class="day-head"><span>' + day + '</span></div>'; }).join('') +
      '</div><div class="month-grid">' + cells + '</div></div>';
  }

  function renderSurface() {
    const scroller = document.getElementById('scroller');
    if (scroller) scrollMemory = scroller.scrollTop;
    const enter = viewKey !== state.view + state.anchor;
    surface.classList.toggle('is-day', state.view === 'day');
    if (state.view === 'month') {
      surface.innerHTML = renderMonth();
    } else {
      const dates = state.view === 'day' ? [state.anchor] : C.weekDates(state.anchor);
      surface.innerHTML = '<div class="scroller" id="scroller">' + renderTimeGrid(dates) + '</div>';
      const next = document.getElementById('scroller');
      if (next) next.scrollTop = enter ? 52 : scrollMemory;
    }
    viewKey = state.view + state.anchor;
    if (selectedId) {
      const again = surface.querySelector('[data-id="' + selectedId + '"]');
      if (again && document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id === selectedId) {
        again.focus();
      }
    }
  }

  function render() {
    renderChrome();
    renderMini();
    renderStats();
    renderSurface();
  }

  function minutesAt(clientY, slots) {
    const rect = slots.getBoundingClientRect();
    if (!rect.height) return C.DAY_START;
    return C.minutesFromRatio((clientY - rect.top) / rect.height);
  }

  function columnAt(x) {
    const cols = surface.querySelectorAll('[data-timed]');
    for (let i = 0; i < cols.length; i += 1) {
      const rect = cols[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right) return cols[i];
    }
    return null;
  }

  function allDayAt(x) {
    const cells = surface.querySelectorAll('[data-allday]');
    for (let i = 0; i < cells.length; i += 1) {
      const rect = cells[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right) return cells[i];
    }
    return null;
  }

  function clearDragChrome() {
    surface.querySelectorAll('.ghost, .placeholder').forEach(function (node) { node.remove(); });
    surface.querySelectorAll('.is-target').forEach(function (node) { node.classList.remove('is-target'); });
    document.body.classList.remove('is-cal-drag');
  }

  function paintCreate() {
    const col = surface.querySelector('[data-timed="' + drag.date + '"]');
    if (!col) return;
    const host = col.querySelector('.events');
    let ghost = host.querySelector('.ghost');
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.className = 'event ghost';
      host.appendChild(ghost);
    }
    const start = Math.min(drag.start, drag.end);
    const end = Math.max(Math.max(drag.start, drag.end), start + C.SNAP);
    ghost.style.top = C.topPercent(start) + '%';
    ghost.style.height = C.heightPercent(start, end) + '%';
    ghost.style.left = '0';
    ghost.style.width = 'calc(100% - 3px)';
    ghost.textContent = C.rangeText(start, end);
  }

  function paintMove() {
    surface.querySelectorAll('.placeholder').forEach(function (node) { node.remove(); });
    surface.querySelectorAll('.is-target').forEach(function (node) { node.classList.remove('is-target'); });
    const item = C.findEvent(state, drag.id);
    if (!item) return;
    if (drag.allDay) {
      const cell = surface.querySelector('[data-allday="' + drag.date + '"]');
      if (!cell) return;
      cell.classList.add('is-target');
      return;
    }
    const col = surface.querySelector('[data-timed="' + drag.date + '"]');
    if (!col) return;
    col.classList.add('is-target');
    const moved = C.moveEvent(item, drag.date, drag.start);
    const ph = document.createElement('div');
    ph.className = 'event placeholder';
    ph.style.top = C.topPercent(moved.start) + '%';
    ph.style.height = C.heightPercent(moved.start, moved.end) + '%';
    ph.style.left = '0';
    ph.style.width = 'calc(100% - 3px)';
    ph.textContent = item.title;
    col.querySelector('.events').appendChild(ph);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || drag) return;
    const month = event.target.closest('[data-month]');
    if (month) return;
    const block = event.target.closest('.event');
    const timed = event.target.closest('[data-timed]');
    const allday = event.target.closest('[data-allday]');
    if (block) {
      const item = C.findEvent(state, block.dataset.id);
      if (!item) return;
      selectedId = item.id;
      block.classList.add('is-selected');
      const resizing = event.target.closest('[data-resize]') && !item.allDay;
      drag = {
        kind: resizing ? 'resize' : 'move',
        id: item.id,
        allDay: !!item.allDay,
        date: item.date,
        start: item.start,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        moved: false,
        grab: 0,
      };
      if (!item.allDay && timed) {
        const slots = timed.querySelector('.slots');
        drag.grab = minutesAt(event.clientY, slots) - item.start;
      }
      block.setPointerCapture(event.pointerId);
      return;
    }
    if (!timed || !event.target.closest('.slots')) return;
    const slots = timed.querySelector('.slots');
    const start = minutesAt(event.clientY, slots);
    drag = {
      kind: 'create',
      date: timed.dataset.date,
      start: start,
      end: start,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
    };
    timed.setPointerCapture(event.pointerId);
    paintCreate();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const originX = drag.originX == null ? event.clientX : drag.originX;
    const originY = drag.originY == null ? event.clientY : drag.originY;
    if (Math.hypot(event.clientX - originX, event.clientY - originY) > 5) drag.moved = true;
    if (drag.kind === 'create') {
      if (Math.abs(event.clientY - drag.originY) > 4) drag.moved = true;
      const col = surface.querySelector('[data-timed="' + drag.date + '"]');
      if (!col) return;
      drag.end = minutesAt(event.clientY, col.querySelector('.slots'));
      paintCreate();
      return;
    }
    if (!drag.moved) return;
    document.body.classList.add('is-cal-drag');
    const block = surface.querySelector('[data-id="' + drag.id + '"]');
    if (block) block.classList.add('is-dragging');
    if (drag.allDay) {
      const cell = allDayAt(event.clientX);
      if (cell) drag.date = cell.dataset.date;
      paintMove();
      return;
    }
    const col = columnAt(event.clientX);
    if (col) {
      drag.date = col.dataset.date;
      drag.start = minutesAt(event.clientY, col.querySelector('.slots')) - (drag.kind === 'move' ? drag.grab : 0);
    }
    if (drag.kind === 'resize') {
      const home = surface.querySelector('[data-timed="' + C.findEvent(state, drag.id).date + '"]');
      if (home) drag.end = minutesAt(event.clientY, home.querySelector('.slots'));
      const item = C.findEvent(state, drag.id);
      const blockEl = surface.querySelector('[data-timed="' + item.date + '"] [data-id="' + drag.id + '"]');
      if (blockEl && item) {
        const resized = C.resizeEvent(item, drag.end);
        blockEl.style.transition = 'none';
        blockEl.style.height = C.heightPercent(item.start, resized.end) + '%';
      }
      return;
    }
    paintMove();
  }

  function finishDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const current = drag;
    drag = null;
    clearDragChrome();
    const item = current.id ? C.findEvent(state, current.id) : null;
    if (current.kind === 'create') {
      const start = Math.min(current.start, current.end);
      const end = Math.max(current.start, current.end);
      if (!current.moved || end - start < C.SNAP) {
        openEditor(null, {date: current.date, start: start, end: start + 60});
        return;
      }
      const made = C.createTimedEvent(state, {date: current.date, start: start, end: end, title: 'New event', color: 'purple'});
      selectedId = made.event.id;
      commit(made.state, 'Added ' + C.rangeText(made.event.start, made.event.end) + ' on ' + C.longDate(made.event.date) + '.');
      openEditor(made.event);
      return;
    }
    if (!item) return;
    if (!current.moved) {
      selectedId = item.id;
      renderSurface();
      openEditor(item);
      return;
    }
    let next = item;
    if (current.kind === 'resize') next = C.resizeEvent(item, current.end);
    else next = C.moveEvent(item, current.date, current.start);
    selectedId = item.id;
    const before = surface.querySelector('[data-id="' + item.id + '"]');
    const rect = before ? before.getBoundingClientRect() : null;
    state = C.updateEvent(state, item.id, {date: next.date, start: next.start, end: next.end});
    save();
    render();
    const after = surface.querySelector('[data-id="' + item.id + '"]');
    if (after && rect) {
      const now = after.getBoundingClientRect();
      const dx = rect.left - now.left;
      const dy = rect.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        after.style.transition = 'none';
        after.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        requestAnimationFrame(function () {
          after.style.transition = 'transform 180ms cubic-bezier(0.23, 1, 0.32, 1)';
          after.style.transform = '';
        });
      }
    }
    say((current.kind === 'resize' ? 'Resized ' : 'Moved ') + next.title + ' to ' + C.longDate(next.date) + (next.allDay ? '.' : ', ' + C.rangeText(next.start, next.end) + '.'));
  }

  function onClick(event) {
    const monthEvent = event.target.closest('[data-month] .event');
    if (monthEvent) {
      const item = C.findEvent(state, monthEvent.dataset.id);
      selectedId = item && item.id;
      if (item) openEditor(item);
      return;
    }
    const button = event.target.closest('[data-act]');
    if (!button || !workspace.contains(button)) return;
    const act = button.dataset.act;
    if (act === 'prev') commit(Object.assign({}, state, {anchor: C.stepAnchor(state.view, state.anchor, -1)}));
    else if (act === 'next') commit(Object.assign({}, state, {anchor: C.stepAnchor(state.view, state.anchor, 1)}));
    else if (act === 'mini-prev') commit(Object.assign({}, state, {anchor: C.addMonths(state.anchor, -1)}));
    else if (act === 'mini-next') commit(Object.assign({}, state, {anchor: C.addMonths(state.anchor, 1)}));
    else if (act === 'today') commit(Object.assign({}, state, {anchor: todayISO()}), 'Showing ' + C.longDate(todayISO()) + '.');
    else if (act === 'view') commit(Object.assign({}, state, {view: button.dataset.view}));
    else if (act === 'day') commit(Object.assign({}, state, {anchor: button.dataset.date}));
    else if (act === 'new') openEditor(null, {date: state.anchor, start: 9 * 60, end: 10 * 60});
    else if (act === 'leave') openLeave();
    else if (act === 'theme') commit(Object.assign({}, state, {theme: state.theme === 'dark' ? 'light' : 'dark'}));
    else if (act === 'help') { if (!helpDialog.open) helpDialog.showModal(); }
    else if (act === 'reset') {
      state = C.createSeed();
      selectedId = null;
      save();
      viewKey = '';
      render();
      say('Demo data restored. The week of 8–14 November 2026 is showing.');
    } else if (act === 'jump') {
      commit(Object.assign({}, state, {anchor: button.dataset.date, view: 'day'}), 'Opened ' + C.longDate(button.dataset.date) + '.');
    } else if (act === 'cancel') {
      const next = C.cancelRequest(state, button.dataset.id);
      commit(next, 'Cancelled the pending request.');
    }
  }

  document.getElementById('editor-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const title = document.getElementById('f-title').value;
    const date = document.getElementById('f-date').value;
    const note = document.getElementById('f-note').value;
    const color = readColor();
    const existing = editingId ? C.findEvent(state, editingId) : null;
    if (existing && existing.allDay) {
      state = C.updateEvent(state, editingId, {title: title, date: date, note: note, color: color});
    } else {
      const start = Number(document.getElementById('f-start').value);
      const end = Number(document.getElementById('f-end').value);
      if (end <= start) {
        document.getElementById('f-error').textContent = 'The end is before the start.';
        return;
      }
      if (existing) {
        state = C.updateEvent(state, editingId, {title: title, date: date, note: note, color: color, start: start, end: end});
      } else {
        const made = C.createTimedEvent(state, {title: title, date: date, note: note, color: color, start: start, end: end});
        state = made.state;
        selectedId = made.event.id;
      }
    }
    save();
    editor.close();
    render();
    say('Saved ' + (title.trim() || 'event') + '.');
  });

  document.getElementById('f-cancel').addEventListener('click', function () { editor.close(); });
  document.getElementById('f-delete').addEventListener('click', function () {
    if (!editingId) return;
    const item = C.findEvent(state, editingId);
    state = C.deleteEvent(state, editingId);
    selectedId = null;
    save();
    editor.close();
    render();
    say('Deleted ' + (item ? item.title : 'event') + '.');
  });

  document.getElementById('leave-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const from = document.getElementById('l-from').value;
    const to = document.getElementById('l-to').value;
    if (to < from) {
      document.getElementById('l-error').textContent = 'The end is before the start.';
      return;
    }
    const made = C.requestLeave(state, {
      from: from,
      to: to,
      type: document.getElementById('l-type').value,
      notes: document.getElementById('l-note').value,
    });
    if (!made.ok) {
      document.getElementById('l-error').textContent = 'That range has no working days.';
      return;
    }
    state = made.state;
    state.anchor = from;
    state.view = 'week';
    save();
    leaveDialog.close();
    viewKey = '';
    render();
    const left = C.leaveStats(state.requests, todayISO());
    say('Requested ' + C.formatDays(made.days) + ' working days. ' + C.formatDays(left.available) + ' available after that.');
  });

  document.getElementById('l-from').addEventListener('input', updateLeavePreview);
  document.getElementById('l-to').addEventListener('input', updateLeavePreview);
  document.getElementById('l-cancel').addEventListener('click', function () { leaveDialog.close(); });
  document.getElementById('help-close').addEventListener('click', function () { helpDialog.close(); });

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', finishDrag);
  surface.addEventListener('pointercancel', finishDrag);
  workspace.addEventListener('click', onClick);

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (editor.open || leaveDialog.open || helpDialog.open || typing) return;
    const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.event');
    const key = event.key;
    if (focused && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
      event.preventDefault();
      const item = C.findEvent(state, focused.dataset.id);
      if (!item) return;
      let next = item;
      if (event.shiftKey && key === 'ArrowDown') next = C.resizeEvent(item, item.end + C.SNAP);
      else if (event.shiftKey && key === 'ArrowUp') next = C.resizeEvent(item, item.end - C.SNAP);
      else if (key === 'ArrowUp') next = C.shiftEvent(item, 0, -C.SNAP);
      else if (key === 'ArrowDown') next = C.shiftEvent(item, 0, C.SNAP);
      else if (key === 'ArrowLeft') next = C.shiftEvent(item, -1, 0);
      else if (key === 'ArrowRight') next = C.shiftEvent(item, 1, 0);
      selectedId = item.id;
      state = C.updateEvent(state, item.id, {date: next.date, start: next.start, end: next.end});
      if (!item.allDay && state.view !== 'month') state.anchor = next.date;
      save();
      render();
      const again = surface.querySelector('[data-id="' + item.id + '"]');
      if (again) again.focus();
      say(next.title + ', ' + C.longDate(next.date) + (next.allDay ? '.' : ', ' + C.rangeText(next.start, next.end) + '.'));
      return;
    }
    if (focused && (key === 'Delete' || key === 'Backspace')) {
      event.preventDefault();
      const item = C.findEvent(state, focused.dataset.id);
      state = C.deleteEvent(state, focused.dataset.id);
      selectedId = null;
      save();
      render();
      say('Deleted ' + (item ? item.title : 'event') + '.');
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      commit(Object.assign({}, state, {anchor: C.stepAnchor(state.view, state.anchor, key === 'ArrowLeft' ? -1 : 1)}));
    } else if (key === 't' || key === 'T') {
      commit(Object.assign({}, state, {anchor: todayISO()}), 'Showing ' + C.longDate(todayISO()) + '.');
    } else if (key === 'd' || key === 'D') commit(Object.assign({}, state, {view: 'day'}));
    else if (key === 'w' || key === 'W') commit(Object.assign({}, state, {view: 'week'}));
    else if (key === 'm' || key === 'M') commit(Object.assign({}, state, {view: 'month'}));
    else if (key === 'n' || key === 'N') openEditor(null, {date: state.anchor, start: 9 * 60, end: 10 * 60});
    else if (key === 'r' || key === 'R') openLeave();
    else if (key === '?') { if (!helpDialog.open) helpDialog.showModal(); }
  });

  setInterval(function () {
    if (drag || editor.open || leaveDialog.open) return;
    if (state.view === 'month') return;
    const dates = state.view === 'day' ? [state.anchor] : C.weekDates(state.anchor);
    if (dates.indexOf(todayISO()) === -1) return;
    renderSurface();
  }, 30000);

  render();
  say(C.periodLabel(state.view, state.anchor) + '. Drag on the grid, or press N for a new event.');
})();
