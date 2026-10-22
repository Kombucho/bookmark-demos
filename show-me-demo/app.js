(function () {
  const show = window.ShowMe;
  const form = document.getElementById('command-form');
  const field = document.getElementById('command');
  const error = document.getElementById('command-error');
  const chips = document.getElementById('chips');
  const diffTokens = document.getElementById('diff-tokens');
  const viewTokens = document.getElementById('view-tokens');
  const viewLabel = document.getElementById('view-label');
  const diffBar = document.getElementById('diff-bar');
  const viewBar = document.getElementById('view-bar');
  const share = document.getElementById('share');
  const diffMeta = document.getElementById('diff-meta');
  const diffEl = document.getElementById('diff');
  const pathEl = document.getElementById('path');
  const prose = document.getElementById('prose');
  const pseudo = document.getElementById('pseudo');
  const files = document.getElementById('files');
  const pr = document.getElementById('pr');
  const copy = document.getElementById('copy');
  const copyStatus = document.getElementById('copy-status');

  let current = show.run('/show-me');

  show.TARGETS.forEach(function (target) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = target.command;
    button.addEventListener('click', function () {
      field.value = target.command;
      submit(target.command);
    });
    chips.appendChild(button);
  });

  function submit(text) {
    const outcome = show.run(text);
    if (!outcome.ok) {
      error.textContent = outcome.error;
      return;
    }
    error.textContent = '';
    copyStatus.textContent = '';
    current = outcome;
    paint();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(field.value);
  });

  function paintDiff() {
    diffEl.replaceChildren();
    show.DIFF.split('\n').forEach(function (line) {
      const row = document.createElement('span');
      row.className = 'diff-line';
      if (line.indexOf('+++') === 0 || line.indexOf('---') === 0 || line.indexOf('diff ') === 0 || line.indexOf('index ') === 0 || line.indexOf('@@') === 0 || line.indexOf('new file') === 0) {
        row.classList.add('meta');
      } else if (line.charAt(0) === '+') row.classList.add('add');
      else if (line.charAt(0) === '-') row.classList.add('del');
      row.textContent = line.length ? line : ' ';
      diffEl.appendChild(row);
    });
  }

  function paint() {
    const view = current.view;
    diffTokens.textContent = String(view.tokens.diff);
    viewTokens.textContent = String(view.tokens.view);
    viewLabel.textContent = view.kind === 'overview' ? 'Overview' : view.label;
    diffBar.style.width = '100%';
    viewBar.style.width = Math.max(2, view.tokens.share) + '%';
    share.textContent = 'This view is ' + view.tokens.share + '% of the diff.';
    diffMeta.textContent = view.tokens.files + ' files · ' + view.tokens.lines + ' lines';
    pathEl.textContent = view.path.join('  /  ');
    prose.textContent = view.prose;
    pseudo.textContent = view.text;
    files.replaceChildren();
    view.files.forEach(function (file) {
      const item = document.createElement('li');
      item.textContent = file;
      files.appendChild(item);
    });
    pr.textContent = current.pr;
    chips.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.textContent === view.command ? 'true' : 'false');
    });
  }

  copy.addEventListener('click', function () {
    const text = current.pr;
    function done(ok) {
      copyStatus.textContent = ok
        ? 'Copied the PR description.'
        : 'Copy is blocked in this browser. The description is in the box below.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else done(false);
  });

  field.value = '/show-me';
  paintDiff();
  paint();
})();
