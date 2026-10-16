(function () {
  const api = window.DesignOps;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const buttons = {
    'pull-design': document.querySelector('#pull-design'),
    submit: document.querySelector('#submit'),
    feedback: document.querySelector('#feedback'),
    approve: document.querySelector('#approve'),
    'merge-design': document.querySelector('#merge-design'),
    handoff: document.querySelector('#handoff'),
    'pull-eng': document.querySelector('#pull-eng'),
    address: document.querySelector('#address'),
    apply: document.querySelector('#apply'),
    'merge-eng': document.querySelector('#merge-eng'),
    deploy: document.querySelector('#deploy'),
    'deploy-eng': document.querySelector('#deploy-eng'),
    'next-task': document.querySelector('#next-task'),
  };

  const gateFor = {
    'pull-design': 'pullDesign',
    submit: 'submit',
    feedback: 'feedback',
    approve: 'approve',
    'merge-design': 'mergeDesign',
    handoff: 'handoff',
    'pull-eng': 'pullEng',
    address: 'address',
    apply: 'apply',
    'merge-eng': 'mergeEng',
    deploy: 'deploy',
    'deploy-eng': 'deploy',
    'next-task': 'nextTask',
  };

  const primaryFor = {
    assigned: 'pull-design',
    drafting: 'submit',
    submitted: 'approve',
    approved: 'merge-design',
    designMerged: 'handoff',
    handed: 'pull-eng',
    engBranched: 'address',
    addressing: 'apply',
    applied: 'merge-eng',
    engMerged: 'deploy',
    deployed: 'next-task',
  };

  let model = api.create();
  let explorationTask = -1;

  mountSteps(document.querySelector('#design-steps'), api.DESIGN_STEPS);
  mountSteps(document.querySelector('#eng-steps'), api.ENG_STEPS);
  const designGospel = mountBook(document.querySelector('#design-gospel'));
  const designBranch = mountBook(document.querySelector('#design-branch'));
  const engGospel = mountBook(document.querySelector('#eng-gospel'));
  const engBranch = mountBook(document.querySelector('#eng-branch'));
  const packet = mountPacket(document.querySelector('#packet'));
  const production = mountProduction(document.querySelector('#production'));
  mountReqs(document.querySelector('#reqs'));

  document.querySelector('#reset').addEventListener('click', function () {
    model = api.create();
    explorationTask = -1;
    render();
  });

  Object.keys(buttons).forEach(function (id) {
    buttons[id].addEventListener('click', function () {
      const result = action(id);
      model = result.state;
      render();
      if (result.ok && result.code === 'Deployed') {
        document.querySelector('.ship').scrollIntoView({behavior: reduce.matches ? 'auto' : 'smooth', block: 'center'});
      }
    });
  });

  document.querySelector('#explorations').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-screen]');
    if (!button || button.disabled) return;
    const result = api.choose(model, button.dataset.screen);
    model = result.state;
    render();
  });

  function action(id) {
    if (id === 'pull-design') return api.pullDesign(model);
    if (id === 'submit') return api.submit(model);
    if (id === 'feedback') return api.feedback(model);
    if (id === 'approve') return api.approve(model);
    if (id === 'merge-design') return api.mergeDesign(model);
    if (id === 'handoff') return api.handoff(model);
    if (id === 'pull-eng') return api.pullEng(model);
    if (id === 'address') return api.address(model);
    if (id === 'apply') return api.apply(model);
    if (id === 'merge-eng') return api.mergeEng(model);
    if (id === 'deploy' || id === 'deploy-eng') return api.deploy(model);
    return api.nextTask(model);
  }

  function render() {
    const open = api.gates(model);
    const current = api.task(model);
    document.querySelector('#status').textContent = sentence(model);
    document.querySelector('#design-task').textContent = 'Person A · ' + current.title;
    document.querySelector('#eng-task').textContent = model.engBranch
      ? model.engBranch.name
      : 'Engineer';
    markSteps(document.querySelector('#design-steps'), api.DESIGN_STEPS, api.designMark);
    markSteps(document.querySelector('#eng-steps'), api.ENG_STEPS, api.engMark);
    paintBook(designGospel, {
      kicker: 'Design Gospel',
      name: 'v' + model.design.version + ' · ' + api.SCREENS[model.design.screen].label,
      tag: 'Source of truth',
      screen: model.design.screen,
      gospel: true,
    });
    paintBook(designBranch, branchView(model.designBranch, model.design.screen));
    paintBook(engGospel, {
      kicker: 'Engineering Gospel',
      name: 'v' + model.engineering.version + ' · ' + api.SCREENS[model.engineering.screen].label,
      tag: 'Source of truth',
      screen: model.engineering.screen,
      gospel: true,
    });
    paintBook(engBranch, branchView(model.engBranch, model.engineering.screen));
    paintExplorations(current);
    paintPacket();
    paintReqs();
    paintProduction();
    Object.keys(buttons).forEach(function (id) {
      const button = buttons[id];
      button.disabled = !open[gateFor[id]];
      const deploys = model.phase === 'engMerged' && (id === 'deploy' || id === 'deploy-eng');
      button.classList.toggle('primary', (primaryFor[model.phase] === id || deploys) && !button.disabled);
    });
    if (model.phase === 'deployed' && !open.nextTask) {
      buttons['next-task'].textContent = 'No further task';
    } else {
      buttons['next-task'].textContent = 'Assign next task';
    }
  }

  function branchView(branch, gospelScreen) {
    if (!branch) {
      return {kicker: 'Branch', name: 'No branch', tag: 'Gospel is untouched', screen: null, empty: true};
    }
    const dirty = branch.screen !== gospelScreen;
    return {
      kicker: branch.name,
      name: api.SCREENS[branch.screen].label,
      tag: dirty ? 'Not in Gospel' : 'Matches Gospel',
      screen: branch.screen,
      dirty: dirty,
      match: !dirty,
    };
  }

  function sentence(state) {
    const current = api.task(state);
    const designLabel = api.SCREENS[state.design.screen].label;
    const engLabel = api.SCREENS[state.engineering.screen].label;
    if (state.phase === 'assigned') {
      return current.title + ' is assigned to Person A. Design Gospel is v' + state.design.version + ' ' + designLabel + '.';
    }
    if (state.phase === 'branched') {
      return 'Branch ' + state.designBranch.name + ' matches Design Gospel. Pick an exploration. Gospel stays.';
    }
    if (state.phase === 'drafting') {
      const back = state.feedback ? ' Person B sent it back.' : '';
      return 'Branch ' + state.designBranch.name + ' is ' + api.SCREENS[state.exploration].label + '. Design Gospel is still ' + designLabel + '.' + back;
    }
    if (state.phase === 'submitted') {
      return 'Person B is reviewing ' + api.SCREENS[state.exploration].label + '. Approve it, or send it back.';
    }
    if (state.phase === 'approved') {
      return 'Approved. Design Gospel is still v' + state.design.version + ' until you merge.';
    }
    if (state.phase === 'designMerged') {
      return 'Design Gospel is v' + state.design.version + ' ' + designLabel + '. Engineering Gospel is still v' + state.engineering.version + ' ' + engLabel + '.';
    }
    if (state.phase === 'handed') {
      return 'Handed off. The engineer has not pulled a branch.';
    }
    if (state.phase === 'engBranched') {
      return 'Branch ' + state.engBranch.name + ' matches Engineering Gospel. The requirement is ' + api.SCREENS[state.packet.screen].label + '.';
    }
    if (state.phase === 'addressing') {
      return 'Requirements checked. The branch has not taken the design yet.';
    }
    if (state.phase === 'applied') {
      return 'Branch ' + state.engBranch.name + ' is ' + api.SCREENS[state.engBranch.screen].label + '. Engineering Gospel is still ' + engLabel + '.';
    }
    if (state.phase === 'engMerged') {
      return 'Engineering Gospel is v' + state.engineering.version + ' ' + engLabel + '. Production is still v' + state.production.version + '.';
    }
    return 'Production is v' + state.production.version + ' ' + api.SCREENS[state.production.screen].label + '. Approved gospel is the app.';
  }

  function paintExplorations(current) {
    const host = document.querySelector('#explorations');
    const show = model.phase === 'branched' || model.phase === 'drafting' || model.phase === 'submitted' || model.phase === 'approved';
    if (!show) {
      host.replaceChildren();
      explorationTask = -1;
      return;
    }
    if (explorationTask !== model.taskIndex) {
      host.replaceChildren();
      current.explorations.forEach(function (id) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'explore';
        button.dataset.screen = id;
        const glass = mountDevice(button, 'mini');
        fillScreen(glass, id, false);
        const name = document.createElement('small');
        name.textContent = api.SCREENS[id].label;
        button.appendChild(name);
        host.appendChild(button);
      });
      explorationTask = model.taskIndex;
    }
    const open = api.gates(model).choose;
    host.querySelectorAll('button').forEach(function (button) {
      button.disabled = !open;
      button.setAttribute('aria-pressed', button.dataset.screen === model.exploration ? 'true' : 'false');
    });
  }

  function paintPacket() {
    const packetState = model.packet;
    if (!packetState) {
      packet.glass.dataset.screen = '';
      packet.device.hidden = true;
      packet.label.textContent = 'Nothing handed off.';
      packet.meta.textContent = '';
      return;
    }
    packet.device.hidden = false;
    fillScreen(packet.glass, packetState.screen, !reduce.matches);
    packet.label.textContent = packetState.title;
    packet.meta.textContent = 'Design Gospel v' + packetState.version;
  }

  function paintReqs() {
    const host = document.querySelector('#reqs');
    const notes = host.nextElementSibling;
    const show = !!model.packet;
    host.hidden = !show;
    notes.hidden = !show;
    if (!show) {
      notes.replaceChildren();
      return;
    }
    const on = ['addressing', 'applied', 'engMerged', 'deployed'].indexOf(model.phase) !== -1;
    host.querySelectorAll('li').forEach(function (itemNode) {
      itemNode.classList.toggle('is-on', on);
    });
    notes.replaceChildren();
    if (model.phase === 'applied' || model.phase === 'engMerged') {
      const screen = model.phase === 'applied' ? model.engBranch.screen : model.engineering.screen;
      api.NOTES[screen].forEach(function (line) {
        const li = document.createElement('li');
        li.textContent = line;
        notes.appendChild(li);
      });
    }
  }

  function paintProduction() {
    fillScreen(production.glass, model.production.screen, !reduce.matches);
    production.meta.textContent = 'v' + model.production.version + ' · ' + api.SCREENS[model.production.screen].label;
    const ahead = model.engineering.version !== model.production.version;
    document.querySelector('#ship-line').textContent = ahead
      ? 'Engineering Gospel is v' + model.engineering.version + '. Production is v' + model.production.version + '.'
      : 'Production matches Engineering Gospel.';
  }

  function mountSteps(host, steps) {
    steps.forEach(function (step) {
      const li = document.createElement('li');
      li.dataset.step = step.id;
      li.textContent = step.label;
      host.appendChild(li);
    });
  }

  function markSteps(host, steps, marker) {
    steps.forEach(function (step) {
      const li = host.querySelector('[data-step="' + step.id + '"]');
      const mark = marker(step.id, model.phase);
      li.classList.toggle('is-now', mark === 'now');
      li.classList.toggle('is-done', mark === 'done');
      if (mark === 'now') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  function mountBook(host) {
    const kicker = add(host, 'p', 'book-kicker');
    const name = add(host, 'p', 'book-name');
    const tag = add(host, 'p', 'tag');
    const glass = mountDevice(host, '');
    const meta = add(host, 'p', 'meta');
    return {kicker: kicker, name: name, tag: tag, glass: glass, meta: meta};
  }

  function paintBook(book, view) {
    book.kicker.textContent = view.kicker;
    book.name.textContent = view.name;
    book.tag.textContent = view.tag;
    book.tag.classList.toggle('is-dirty', !!view.dirty);
    book.tag.classList.toggle('is-match', !!view.match);
    const host = book.glass.parentNode.parentNode;
    host.classList.toggle('is-gospel', !!view.gospel);
    host.classList.toggle('is-branch', !view.gospel);
    host.classList.toggle('is-empty', !!view.empty);
    host.classList.toggle('is-dirty', !!view.dirty);
    host.classList.toggle('is-match', !!view.match);
    if (view.screen) fillScreen(book.glass, view.screen, !reduce.matches);
    else book.glass.dataset.screen = '';
  }

  function mountPacket(host) {
    const label = add(host, 'p', '');
    const glass = mountDevice(host, 'mini');
    const meta = add(host, 'p', 'meta');
    glass.parentNode.hidden = true;
    return {label: label, device: glass.parentNode, glass: glass, meta: meta};
  }

  function mountProduction(host) {
    const glass = mountDevice(host, 'large');
    const meta = add(host, 'p', 'meta');
    return {glass: glass, meta: meta};
  }

  function mountReqs(host) {
    api.REQUIREMENTS.forEach(function (label) {
      const li = document.createElement('li');
      li.textContent = label;
      host.appendChild(li);
    });
    const notes = document.createElement('ul');
    notes.className = 'notes';
    host.after(notes);
  }

  function mountDevice(parent, size) {
    const device = add(parent, 'div', 'device' + (size ? ' is-' + size : ''));
    add(device, 'div', 'ear');
    return add(device, 'div', 'glass');
  }

  function fillScreen(glass, id, animate) {
    if (glass.dataset.screen === id) return;
    const had = !!glass.dataset.screen;
    glass.dataset.screen = id;
    glass.className = 'glass is-' + id;
    if (animate && had) glass.classList.add('is-fresh');
    glass.replaceChildren();
    builders[id](glass);
  }

  function add(parent, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function row(list, label, value) {
    const li = document.createElement('li');
    li.append(document.createTextNode(label), add(li, 'span', '', value));
    list.appendChild(li);
  }

  const builders = {
    plain: function (glass) {
      add(glass, 'p', 'brand', 'Harbor');
      const list = add(glass, 'ul', 'rows');
      row(list, 'Tide', '6:12');
      row(list, 'Wind', '14 kt');
      row(list, 'Light', 'Low');
    },
    quiet: function (glass) {
      add(glass, 'p', 'brand', 'Harbor');
      add(glass, 'p', 'clock', '6:12');
      add(glass, 'p', 'sub', 'High tide');
      add(glass, 'p', 'pill', 'Stay');
    },
    night: function (glass) {
      add(glass, 'p', 'brand', 'Harbor');
      add(glass, 'p', 'clock', '6:12');
      add(glass, 'p', 'sub', 'High tide');
      add(glass, 'p', 'meta-line', 'Wind 14 · Light low');
    },
    ticket: function (glass) {
      add(glass, 'p', 'band', 'Harbor');
      const body = add(glass, 'div', 'body');
      add(body, 'p', 'clock', '6:12');
      add(body, 'div', 'perf');
      add(body, 'p', 'sub', 'High tide');
      add(body, 'p', 'meta-line', 'Board');
    },
    chips: function (glass) {
      add(glass, 'p', 'brand', 'Harbor');
      const stack = add(glass, 'div', 'stack');
      chip(stack, 'Tide', '6:12');
      chip(stack, 'Wind', '14');
      chip(stack, 'Light', 'Low');
    },
    list: function (glass) {
      add(glass, 'p', 'brand', 'Harbor');
      const stack = add(glass, 'div', 'stack');
      item(stack, 'High tide', '6:12');
      item(stack, 'Wind', '14 kt');
      item(stack, 'Light', 'Low');
    },
    dial: function (glass) {
      add(glass, 'p', 'brand', 'Harbor');
      const dial = add(glass, 'div', 'dial');
      add(dial, 'span', '', '6:12');
      add(glass, 'p', 'sub', 'High tide');
    },
  };

  function chip(stack, label, value) {
    const node = add(stack, 'div', 'chip', label);
    add(node, 'span', '', value);
  }

  function item(stack, label, value) {
    const node = add(stack, 'div', 'item');
    add(node, 'i', 'mark');
    node.append(document.createTextNode(label));
    add(node, 'b', '', value);
  }

  render();
})();
