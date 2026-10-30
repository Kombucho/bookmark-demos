(function () {
  const Toy = window.ToyReact;
  const domNode = document.getElementById('dom-screen');
  const asciiNode = document.getElementById('ascii-screen');
  const jsonNode = document.getElementById('json-screen');
  const fiberNode = document.getElementById('fibers');
  const effectNode = document.getElementById('effects');
  const callNode = document.getElementById('calls');
  const logNode = document.getElementById('log');
  const statusNode = document.getElementById('status');
  const discardNode = document.getElementById('discard');
  const treeLabel = document.getElementById('tree-label');
  const laneReadout = document.getElementById('lane-readout');
  const views = document.getElementById('views');

  const domHost = createDomHost(domNode);
  const asciiHost = Toy.createMemoryHost();
  const jsonHost = Toy.createMemoryHost();

  let runtime = null;
  let demo = null;
  let sawCommit = 0;

  function createDomHost(container) {
    const allowed = { section: 1, header: 1, h1: 1, p: 1, ul: 1, li: 1, div: 1, span: 1 };
    function apply(el, props) {
      const className = props && props.className ? props.className : '';
      if (className) el.className = className;
      else el.removeAttribute('class');
    }
    return {
      container: container,
      reset: function () { container.replaceChildren(); },
      createInstance: function (type, props) {
        const el = document.createElement(allowed[type] ? type : 'div');
        apply(el, props);
        return el;
      },
      createTextInstance: function (text) { return document.createTextNode(text); },
      appendChild: function (parent, child) { parent.appendChild(child); },
      insertBefore: function (parent, child, before) { parent.insertBefore(child, before); },
      removeChild: function (parent, child) {
        if (child && child.parentNode === parent) parent.removeChild(child);
      },
      commitTextUpdate: function (node, text) { node.nodeValue = text; },
      commitUpdate: function (node, props) { apply(node, props); },
    };
  }

  function boot(runMount) {
    runtime = Toy.createRuntime({
      hosts: [domHost, asciiHost, jsonHost],
      budgetMs: Number(document.getElementById('budget').value) || 5,
      unitCostMs: Number(document.getElementById('cost').value) || 1,
    });
    demo = runtime.createDemo();
    runtime.mount(demo.element);
    if (runMount) runtime.finish();
    draw();
  }

  function act(fn) {
    try {
      fn();
    } catch (err) {
      statusNode.textContent = err && err.message ? err.message : 'The toy stopped.';
      return;
    }
    draw();
  }

  function fillList(node, items, className) {
    node.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('li');
      empty.textContent = '—';
      node.appendChild(empty);
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const li = document.createElement('li');
      if (className) li.className = className;
      li.textContent = items[i];
      node.appendChild(li);
    }
  }

  function drawFibers(snap) {
    fiberNode.replaceChildren();
    const rows = snap.fibers;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = document.createElement('div');
      line.className = 'fiber' + (row.active ? ' active' : '') + (row.skipped ? ' skipped' : '');
      line.setAttribute('role', 'listitem');
      line.style.paddingLeft = (8 + row.depth * 14) + 'px';
      const label = document.createElement('span');
      label.textContent = (row.active ? '▸ ' : '') + row.name;
      line.appendChild(label);
      if (row.flags.length || row.deletions.length) {
        const flags = document.createElement('span');
        flags.className = 'flags';
        const extra = row.deletions.length ? ' − ' + row.deletions.join(', ') : '';
        flags.textContent = '  ' + row.flags.join(' ') + extra;
        line.appendChild(flags);
      }
      fiberNode.appendChild(line);
    }
    const active = fiberNode.querySelector('.active');
    if (active) {
      const top = active.offsetTop - fiberNode.offsetTop;
      if (top < fiberNode.scrollTop || top > fiberNode.scrollTop + fiberNode.clientHeight - 28) {
        fiberNode.scrollTop = Math.max(0, top - 36);
      }
    }
  }

  function describeEffect(effect) {
    const flags = effect.flags.join(', ') || 'none';
    const gone = effect.deletions && effect.deletions.length
      ? ' · drop ' + effect.deletions.join(', ')
      : '';
    return effect.name + ' · ' + flags + gone;
  }

  function statusText(snap) {
    if (snap.phase === 'commit-ready') {
      return 'Draft finished on ' + snap.lane + '. ' + snap.effects.length + ' effects are waiting. The hosts still show the previous screen. Step or run a slice to commit.';
    }
    if (snap.phase === 'yield') {
      return 'Yielded on ' + snap.lane + ' after ' + snap.units + ' units (' + snap.sliceSpent + 'ms of a ' + snap.budgetMs + 'ms budget). The screen has not changed. A SyncLane update from here calls prepareFreshStack.';
    }
    if (snap.phase === 'render' && snap.units === 0) {
      const how = snap.blocking
        ? 'SyncLane does not yield. Run slice commits the whole click. Step walks it anyway.'
        : 'TransitionLane yields every ' + snap.budgetMs + 'ms. Each unit costs ' + snap.unitCostMs + 'ms on this page.';
      return snap.lane + ' is armed. Nothing new is on screen. ' + how;
    }
    if (snap.phase === 'render') {
      return 'Rendering ' + snap.lane + '. Unit ' + snap.units + ', ' + snap.sliceSpent + 'ms charged this slice. Host nodes prepared in memory: ' + snap.prepared + '.';
    }
    if (snap.lastCommit) {
      return 'Committed ' + snap.lastCommit.effects.length + ' effects on ' + snap.lastCommit.lane + '. All three hosts took the same list.';
    }
    return 'Idle. Pin a note, or filter the drawer.';
  }

  function draw() {
    const snap = runtime.snapshot();
    statusNode.textContent = statusText(snap);
    treeLabel.textContent = snap.treeLabel === 'draft' ? 'workInProgress' : 'current · on screen';
    laneReadout.textContent = snap.lane
      ? snap.lane + (snap.blocking ? ' · blocking' : ' · time sliced')
      : 'idle';
    if (snap.discard) {
      discardNode.hidden = false;
      discardNode.textContent = snap.discard.text;
    } else {
      discardNode.hidden = true;
      discardNode.textContent = '';
    }
    drawFibers(snap);
    const effects = snap.phase === 'commit-ready'
      ? snap.effects
      : (snap.lastCommit ? snap.lastCommit.effects : []);
    fillList(effectNode, effects.map(describeEffect));
    fillList(callNode, snap.lastCommit ? snap.lastCommit.calls : []);
    fillList(logNode, snap.log.slice(-12));
    logNode.scrollTop = logNode.scrollHeight;
    asciiNode.textContent = Toy.treeToAscii(asciiHost.container) || 'Nothing committed yet.';
    const json = Toy.treeToJSON(jsonHost.container);
    jsonNode.textContent = json && json.length ? JSON.stringify(json, null, 2) : 'Nothing committed yet.';
    const commitMark = snap.lastCommit ? snap.lastCommit.effects.length + ':' + (snap.lastCommit.calls || []).length + ':' + snap.lane : '';
    if (commitMark && commitMark !== sawCommit && snap.phase !== 'commit-ready') {
      sawCommit = commitMark;
      views.classList.remove('just-committed');
      void views.offsetWidth;
      views.classList.add('just-committed');
    }
  }

  document.getElementById('pin').addEventListener('click', function () {
    act(function () { demo.bridge.pin(); });
  });
  document.getElementById('filter').addEventListener('click', function () {
    act(function () { demo.bridge.filter('linen'); });
  });
  document.getElementById('show-all').addEventListener('click', function () {
    act(function () { demo.bridge.filter('all'); });
  });
  document.getElementById('step').addEventListener('click', function () {
    act(function () { runtime.step(); });
  });
  document.getElementById('slice').addEventListener('click', function () {
    act(function () { runtime.slice(); });
  });
  document.getElementById('finish').addEventListener('click', function () {
    act(function () { runtime.finish(); });
  });
  document.getElementById('replay').addEventListener('click', function () {
    act(function () { boot(false); });
  });
  document.getElementById('outside').addEventListener('click', function () {
    let message = '';
    act(function () { message = demo.bridge.outside(); });
    statusNode.textContent = message;
  });
  document.getElementById('budget').addEventListener('change', function (event) {
    runtime.setBudget(event.target.value);
    draw();
  });
  document.getElementById('cost').addEventListener('change', function (event) {
    runtime.setUnitCost(event.target.value);
    draw();
  });

  document.addEventListener('keydown', function (event) {
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const key = event.key;
    if (key === 'p' || key === 'P') {
      event.preventDefault();
      act(function () { demo.bridge.pin(); });
    } else if (key === 'g' || key === 'G') {
      event.preventDefault();
      act(function () { demo.bridge.filter('linen'); });
    } else if (key === 'a' || key === 'A') {
      event.preventDefault();
      act(function () { demo.bridge.filter('all'); });
    } else if (key === 's' || key === 'S' || key === '.') {
      event.preventDefault();
      act(function () { runtime.step(); });
    } else if (key === 'l' || key === 'L') {
      event.preventDefault();
      act(function () { runtime.slice(); });
    } else if (key === 'Enter') {
      event.preventDefault();
      act(function () { runtime.finish(); });
    }
  });

  boot(true);
})();
