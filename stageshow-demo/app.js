(function () {
  const well = document.getElementById('well');
  const list = document.getElementById('rule-list');
  const reading = document.getElementById('reading');
  const count = document.getElementById('count');
  const flags = StageShow.allOff();
  const buttons = {};

  StageShow.RULES.forEach(function (rule) {
    const block = document.createElement('div');
    block.className = 'rule-block';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.textContent = rule.name;
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = rule.note;
    button.addEventListener('click', function () {
      flags[rule.id] = !flags[rule.id];
      render();
    });
    block.appendChild(button);
    block.appendChild(note);
    list.appendChild(block);
    buttons[rule.id] = { button: button, block: block };
  });

  document.getElementById('none').addEventListener('click', function () {
    const off = StageShow.allOff();
    Object.keys(off).forEach(function (id) { flags[id] = off[id]; });
    render();
  });
  document.getElementById('all').addEventListener('click', function () {
    const on = StageShow.allOn();
    Object.keys(on).forEach(function (id) { flags[id] = on[id]; });
    render();
  });

  function render() {
    const view = StageShow.scene(flags);
    Object.keys(view.flags).forEach(function (id) {
      well.dataset[id] = view.flags[id] ? 'on' : 'off';
      buttons[id].button.setAttribute('aria-pressed', view.flags[id] ? 'true' : 'false');
      buttons[id].block.classList.toggle('is-on', view.flags[id]);
    });
    reading.textContent = view.reading;
    const noun = view.stringCount === 1 ? 'string' : 'strings';
    count.textContent = view.stringCount + ' real ' + noun + ' in the window';
  }

  render();
})();
