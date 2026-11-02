(function () {
  const plot = window.UpsetPlot;
  const sortSize = document.getElementById('sort-size');
  const sortDegree = document.getElementById('sort-degree');
  const minInput = document.getElementById('min');
  const minRead = document.getElementById('min-read');
  const filterNote = document.getElementById('filter-note');
  const rail = document.getElementById('rail');
  const scroller = document.getElementById('scroller');
  const memberTitle = document.getElementById('member-title');
  const memberNote = document.getElementById('member-note');
  const memberList = document.getElementById('member-list');
  const chips = document.getElementById('chips');
  const vennHost = document.getElementById('venn');
  const regionsHost = document.getElementById('regions');
  const vennTitle = document.getElementById('venn-title');
  const breakCopy = document.getElementById('break-copy');
  const degreesHost = document.getElementById('degrees');

  const ROW = 36;
  const TOP = 148;
  let sort = 'size';
  let minSize = 1;
  let pinnedKey = null;
  let hoverKey = null;
  let vennMask = null;
  let vennSets = ['layout', 'type', 'motion'];
  let columns = [];

  function nameOf(id) {
    const found = plot.SETS.filter(function (set) { return set.id === id; })[0];
    return found ? found.name : id;
  }

  function picture() {
    return plot.view(plot.PROJECTS, { sort: sort, minSize: minSize });
  }

  function paintControls(view) {
    sortSize.setAttribute('aria-pressed', sort === 'size' ? 'true' : 'false');
    sortDegree.setAttribute('aria-pressed', sort === 'degree' ? 'true' : 'false');
    minRead.textContent = String(minSize);
    if (view.intersections.length) {
      filterNote.textContent = view.hidden
        ? view.intersections.length + ' intersections shown. ' + view.hidden + ' smaller than ' + minSize + ' are hidden. Set sizes still count every project.'
        : view.intersections.length + ' intersections. Nothing is hidden.';
    } else {
      filterNote.textContent = 'No intersection has ' + minSize + ' or more projects.';
    }
  }

  function paintRail(view) {
    const max = view.sets.reduce(function (n, set) { return Math.max(n, set.size); }, 1);
    rail.replaceChildren();
    const top = document.createElement('div');
    top.className = 'rail-top';
    top.textContent = 'Set size';
    rail.appendChild(top);
    view.sets.forEach(function (set) {
      const row = document.createElement('div');
      row.className = 'rail-row';
      row.dataset.set = set.id;
      const name = document.createElement('span');
      name.className = 'set-name';
      name.textContent = set.name;
      const track = document.createElement('span');
      track.className = 'set-track';
      const bar = document.createElement('span');
      bar.className = 'set-bar';
      bar.style.width = Math.max(8, Math.round((set.size / max) * 100)) + '%';
      track.appendChild(bar);
      const count = document.createElement('span');
      count.className = 'set-n';
      count.textContent = String(set.size);
      row.append(name, track, count);
      rail.appendChild(row);
    });
  }

  function paintColumns(view) {
    const max = view.intersections.reduce(function (n, item) { return Math.max(n, item.size); }, 1);
    const cols = document.createElement('div');
    cols.className = 'cols';
    columns = view.intersections;
    if (!view.intersections.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Lower the minimum to bring columns back.';
      scroller.replaceChildren(empty);
      return;
    }
    view.intersections.forEach(function (item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'col';
      button.dataset.key = item.key;
      button.setAttribute('aria-pressed', pinnedKey === item.key ? 'true' : 'false');
      const names = item.sets.map(nameOf).join(', ');
      button.setAttribute('aria-label', names + ', ' + item.size + (item.size === 1 ? ' project' : ' projects'));
      const slot = document.createElement('span');
      slot.className = 'bar-slot';
      const bar = document.createElement('span');
      bar.className = 'ibar';
      bar.style.height = Math.max(6, Math.round((item.size / max) * TOP * 0.72)) + 'px';
      const count = document.createElement('span');
      count.className = 'bar-count';
      count.textContent = String(item.size);
      slot.append(bar, count);
      button.appendChild(slot);
      const from = view.sets.findIndex(function (set) { return item.sets.indexOf(set.id) !== -1; });
      let to = from;
      view.sets.forEach(function (set, index) {
        if (item.sets.indexOf(set.id) !== -1) to = index;
      });
      if (to > from) {
        const link = document.createElement('span');
        link.className = 'link';
        link.style.top = (TOP + from * ROW + ROW / 2) + 'px';
        link.style.height = ((to - from) * ROW) + 'px';
        button.appendChild(link);
      }
      view.sets.forEach(function (set) {
        const cell = document.createElement('span');
        cell.className = 'cell';
        const dot = document.createElement('span');
        dot.className = 'dot' + (item.sets.indexOf(set.id) === -1 ? '' : ' on');
        cell.appendChild(dot);
        button.appendChild(cell);
      });
      button.addEventListener('pointerenter', function () {
        hoverKey = item.key;
        paintSelection(view);
      });
      button.addEventListener('pointerleave', function () {
        if (hoverKey === item.key) hoverKey = null;
        paintSelection(view);
      });
      button.addEventListener('click', function () {
        pinnedKey = pinnedKey === item.key ? null : item.key;
        vennMask = null;
        paintAll();
      });
      cols.appendChild(button);
    });
    scroller.replaceChildren(cols);
  }

  function activeIntersection(view) {
    const key = hoverKey || pinnedKey;
    if (!key) return null;
    return view.intersections.filter(function (item) { return item.key === key; })[0] || null;
  }

  function paintSelection(view) {
    const active = activeIntersection(view);
    scroller.querySelectorAll('.col').forEach(function (col) {
      const on = active && col.dataset.key === active.key;
      col.classList.toggle('hot', !!on);
      col.setAttribute('aria-pressed', pinnedKey === col.dataset.key ? 'true' : 'false');
    });
    rail.querySelectorAll('.rail-row').forEach(function (row) {
      const inSet = active && active.sets.indexOf(row.dataset.set) !== -1;
      row.classList.toggle('hot', !!inSet);
    });
    if (active) {
      memberTitle.textContent = active.sets.map(nameOf).join(' ∩ ');
      memberNote.textContent = active.size + (active.size === 1 ? ' project uses' : ' projects use') + ' exactly these ' + (active.degree === 1 ? 'skill' : active.degree + ' skills') + ', and no others.';
      fillMembers(active.projects);
      return;
    }
    if (vennMask) {
      const region = plot.venn(plot.PROJECTS, vennSets);
      const projects = region.regions[vennMask] || [];
      memberTitle.textContent = plot.regionLabel(vennMask, vennSets);
      memberNote.textContent = 'Counted with only ' + vennSets.map(nameOf).join(', ') + '. Skills outside those three are ignored, so this list can mix columns from the plot above.';
      fillMembers(projects);
      return;
    }
    memberTitle.textContent = 'Members';
    memberNote.textContent = 'Hover a column, or a Venn region. The projects in that combination are listed here.';
    memberList.replaceChildren();
  }

  function fillMembers(projects) {
    memberList.replaceChildren();
    projects.forEach(function (project) {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = project.name;
      const note = document.createElement('span');
      note.textContent = project.note;
      item.append(name, note);
      memberList.appendChild(item);
    });
  }

  const SPOTS = {
    '100': { x: 78, y: 96 },
    '010': { x: 248, y: 96 },
    '001': { x: 164, y: 214 },
    '110': { x: 164, y: 72 },
    '101': { x: 108, y: 158 },
    '011': { x: 220, y: 158 },
    '111': { x: 164, y: 128 },
  };

  function paintVenn() {
    const region = plot.venn(plot.PROJECTS, vennSets);
    vennTitle.textContent = vennSets.map(nameOf).join(', ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 340 260');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Venn diagram of ' + vennSets.map(nameOf).join(', '));
    const circles = [
      { cx: 118, cy: 108, cls: 'c-a', name: nameOf(vennSets[0]) },
      { cx: 210, cy: 108, cls: 'c-b', name: nameOf(vennSets[1]) },
      { cx: 164, cy: 176, cls: 'c-c', name: nameOf(vennSets[2]) },
    ];
    circles.forEach(function (circle) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      node.setAttribute('cx', circle.cx);
      node.setAttribute('cy', circle.cy);
      node.setAttribute('r', '72');
      node.setAttribute('class', circle.cls);
      svg.appendChild(node);
    });
    Object.keys(SPOTS).forEach(function (mask) {
      const spot = SPOTS[mask];
      const count = region.regions[mask].length;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'spot' + (vennMask === mask ? ' on' : ''));
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('data-mask', mask);
      const label = plot.regionLabel(mask, vennSets) + ', ' + count;
      group.setAttribute('aria-label', label);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', spot.x);
      text.setAttribute('y', spot.y);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = String(count);
      group.appendChild(text);
      group.addEventListener('click', function () { chooseRegion(mask); });
      group.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          chooseRegion(mask);
        }
      });
      svg.appendChild(group);
    });
    vennHost.replaceChildren(svg);
    const caption = document.createElement('p');
    caption.className = 'venn-caption';
    caption.textContent = region.occupied + ' of 7 regions are occupied. ' + region.outside + (region.outside === 1 ? ' project sits' : ' projects sit') + ' outside all three circles.';
    vennHost.appendChild(caption);

    regionsHost.replaceChildren();
    ['100', '010', '001', '110', '101', '011', '111', '000'].forEach(function (mask) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'region' + (vennMask === mask ? ' on' : '');
      button.textContent = plot.regionLabel(mask, vennSets) + ' · ' + region.regions[mask].length;
      button.addEventListener('click', function () { chooseRegion(mask); });
      regionsHost.appendChild(button);
    });

    chips.querySelectorAll('button').forEach(function (button) {
      const on = vennSets.indexOf(button.dataset.set) !== -1;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function chooseRegion(mask) {
    vennMask = vennMask === mask ? null : mask;
    pinnedKey = null;
    hoverKey = null;
    paintAll();
  }

  function paintDegrees(view) {
    const five = plot.possibleRegions(5);
    breakCopy.textContent = 'A five-set Venn has ' + five + ' regions. These six skills have ' + view.possible + '. ' + view.occupied + ' of them occur in the example, and they hold all ' + view.projectCount + ' projects. The plot above is that breakdown. The circles stop at three.';
    const max = view.degrees.reduce(function (n, row) { return Math.max(n, row.projects); }, 1);
    degreesHost.replaceChildren();
    view.degrees.forEach(function (row) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'deg-label';
      label.textContent = row.degree + (row.degree === 1 ? ' skill' : ' skills');
      const track = document.createElement('span');
      track.className = 'deg-track';
      const bar = document.createElement('span');
      bar.className = 'deg-bar';
      bar.style.width = (row.projects ? Math.max(6, Math.round((row.projects / max) * 100)) : 0) + '%';
      track.appendChild(bar);
      const note = document.createElement('span');
      note.className = 'deg-note';
      note.textContent = row.intersections + (row.intersections === 1 ? ' intersection' : ' intersections') + ' · ' + row.projects + (row.projects === 1 ? ' project' : ' projects');
      item.append(label, track, note);
      degreesHost.appendChild(item);
    });
  }

  function paintChips() {
    if (chips.childElementCount) return;
    plot.SETS.forEach(function (set) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.set = set.id;
      button.textContent = set.name;
      button.addEventListener('click', function () {
        const next = plot.replaceVennSet(vennSets, set.id);
        if (next.join() === vennSets.join()) return;
        vennSets = next;
        vennMask = null;
        paintAll();
      });
      chips.appendChild(button);
    });
  }

  function paintAll() {
    const view = picture();
    if (pinnedKey && !view.intersections.some(function (item) { return item.key === pinnedKey; })) pinnedKey = null;
    if (hoverKey && !view.intersections.some(function (item) { return item.key === hoverKey; })) hoverKey = null;
    paintControls(view);
    paintRail(view);
    paintColumns(view);
    paintSelection(view);
    paintVenn();
    paintDegrees(view);
  }

  sortSize.addEventListener('click', function () { sort = 'size'; paintAll(); });
  sortDegree.addEventListener('click', function () { sort = 'degree'; paintAll(); });
  minInput.addEventListener('input', function () {
    minSize = Number(minInput.value);
    paintAll();
  });
  scroller.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (!columns.length) return;
    event.preventDefault();
    const current = columns.findIndex(function (item) { return item.key === (pinnedKey || hoverKey); });
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = columns[(current + step + columns.length) % columns.length];
    pinnedKey = next.key;
    vennMask = null;
    paintAll();
    const button = scroller.querySelector('[data-key="' + next.key + '"]');
    if (button) button.focus();
  });

  paintChips();
  paintAll();
})();
