(function () {
  const shelf = window.EngineeringShelf;
  const caseEl = document.getElementById('case');
  const stackEl = document.getElementById('stack');
  const lineEl = document.getElementById('path-line');
  const bookEl = document.getElementById('book');
  const savedEl = document.getElementById('saved');
  const clearBtn = document.getElementById('clear');

  let storage = null;
  let persistent = false;
  try {
    const probe = window.localStorage;
    const key = shelf.STORAGE_KEY + '.probe';
    probe.setItem(key, '1');
    probe.removeItem(key);
    storage = probe;
    persistent = true;
  } catch (err) {
    storage = {
      value: null,
      getItem: function () { return this.value; },
      setItem: function (_key, value) { this.value = value; },
    };
  }

  let read = shelf.loadRead(storage);
  let openId = null;
  const order = shelf.BOOKS.map(function (book) { return book.id; });

  function persist() {
    try {
      read = shelf.saveRead(storage, read);
    } catch (err) {
      persistent = false;
    }
  }

  function isRead(id) {
    return read.indexOf(id) !== -1;
  }

  function toggleRead(id) {
    if (isRead(id)) read = read.filter(function (item) { return item !== id; });
    else read = read.concat(id);
    persist();
    paintSpines();
    paintStack();
    paintBook();
  }

  function paintCase() {
    caseEl.replaceChildren();
    shelf.SHELVES.forEach(function (bay) {
      const block = document.createElement('section');
      block.className = 'bay';
      const name = document.createElement('h2');
      name.className = 'bay-name';
      name.textContent = bay.name;
      const row = document.createElement('div');
      row.className = 'row';
      shelf.booksOnShelf(bay.group).forEach(function (book) {
        row.append(spineButton(book));
      });
      const ledge = document.createElement('div');
      ledge.className = 'ledge';
      ledge.setAttribute('aria-hidden', 'true');
      block.append(name, row, ledge);
      caseEl.append(block);
    });
  }

  function spineButton(book) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spine';
    button.id = 'spine-' + book.id;
    button.dataset.id = book.id;
    button.style.setProperty('--w', book.w + 'px');
    button.style.setProperty('--h', book.h + 'px');
    button.style.setProperty('--bg', book.bg);
    button.style.setProperty('--fg', book.fg);
    button.style.setProperty('--band', book.band);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = shelf.pad(book.n);
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = book.spine;
    const by = document.createElement('span');
    by.className = 'by';
    by.textContent = book.short;
    const avail = Math.max(40, book.h - 40);
    const size = Math.min(10, avail / book.short.length);
    by.style.fontSize = size.toFixed(2) + 'px';
    const band = document.createElement('span');
    band.className = 'band';
    button.append(num, title, by, band);
    return button;
  }

  function paintSpines() {
    const active = document.activeElement;
    let tab = 0;
    if (active && active.classList && active.classList.contains('spine')) {
      tab = order.indexOf(active.dataset.id);
    } else if (openId) {
      tab = Math.max(0, order.indexOf(openId));
    }
    const buttons = caseEl.querySelectorAll('.spine');
    buttons.forEach(function (button, index) {
      const id = button.dataset.id;
      const book = shelf.bookById(id);
      const open = id === openId;
      button.classList.toggle('is-open', open);
      button.classList.toggle('is-read', isRead(id));
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.tabIndex = index === tab ? 0 : -1;
      const readNote = isRead(id) ? ' Marked read.' : '';
      button.setAttribute('aria-label', shelf.pad(book.n) + ' ' + book.spine + ', ' + book.short + '. ' + book.stage + '.' + readNote);
    });
  }

  function focusIndex() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('spine')) {
      return order.indexOf(active.dataset.id);
    }
    const current = order.indexOf(openId);
    return current === -1 ? 0 : current;
  }

  function paintStack() {
    const view = shelf.layerView(read);
    lineEl.textContent = shelf.pathSentence(view);
    stackEl.replaceChildren();
    view.slice().reverse().forEach(function (layer) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layer ' + layer.state;
      button.style.setProperty('--tone', layer.tone);
      button.dataset.layer = layer.id;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = layer.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = layer.have + '/' + layer.total;
      button.append(name, count);
      const books = layer.books.map(function (id) { return shelf.bookById(id).spine; }).join(', ');
      button.setAttribute('aria-label', layer.name + ', ' + layer.have + ' of ' + layer.total + ' read. ' + books);
      item.append(button);
      stackEl.append(item);
    });
    const lit = view.filter(function (layer) { return layer.state === 'lit'; }).length;
    savedEl.textContent = persistent
      ? lit + ' of 9 layers lit. Marks stay in this browser.'
      : lit + ' of 9 layers lit. This browser blocked localStorage, so marks last for this visit.';
  }

  function paintBook() {
    bookEl.replaceChildren();
    const book = shelf.bookById(openId);
    if (!book) {
      const note = document.createElement('p');
      note.className = 'placeholder';
      note.textContent = 'The shelf is full. Pull a book out.';
      bookEl.append(note);
      return;
    }
    const pages = document.createElement('div');
    pages.className = 'pages';
    const left = document.createElement('div');
    left.className = 'page';
    const num = document.createElement('p');
    num.className = 'num';
    num.textContent = shelf.pad(book.n) + '  ·  ' + shelf.SHELVES[book.group].name;
    const stage = document.createElement('p');
    stage.className = 'stage';
    stage.textContent = book.stage;
    const title = document.createElement('h2');
    title.textContent = book.title;
    const authors = document.createElement('p');
    authors.className = 'authors';
    authors.textContent = book.authors + (book.ed ? ' · ' + book.ed : '');
    left.append(num, stage, title, authors);

    const right = document.createElement('div');
    right.className = 'page';
    const summary = document.createElement('p');
    summary.className = 'summary';
    summary.textContent = book.summary;
    const shown = book.topics.slice(0, 4);
    const list = document.createElement('ul');
    list.className = 'topics';
    shown.forEach(function (topic) {
      const item = document.createElement('li');
      item.textContent = topic;
      list.append(item);
    });
    right.append(summary, list);
    if (book.topics.length > shown.length) {
      const more = document.createElement('details');
      more.className = 'more';
      const summaryMore = document.createElement('summary');
      summaryMore.textContent = 'The rest of the shelf’s map';
      const rest = document.createElement('ul');
      rest.className = 'topics';
      book.topics.slice(shown.length).forEach(function (topic) {
        const item = document.createElement('li');
        item.textContent = topic;
        rest.append(item);
      });
      more.append(summaryMore, rest);
      right.append(more);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.id = 'mark';
    mark.setAttribute('aria-pressed', isRead(book.id) ? 'true' : 'false');
    mark.textContent = isRead(book.id) ? 'Read' : 'Mark read';
    const link = document.createElement('a');
    link.className = 'book-link';
    link.href = book.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Book page';
    const close = document.createElement('button');
    close.type = 'button';
    close.id = 'close-book';
    close.textContent = 'Put it back';
    actions.append(mark, link, close);
    right.append(actions);
    pages.append(left, right);
    bookEl.append(pages);
  }

  function openBook(id, focus) {
    openId = openId === id ? null : id;
    paintSpines();
    paintBook();
    if (openId && focus) {
      const close = document.getElementById('close-book');
      if (close) close.focus();
    }
  }

  function move(delta) {
    const index = focusIndex();
    const next = order[(index + delta + order.length) % order.length];
    const button = document.getElementById('spine-' + next);
    if (button) button.focus();
  }

  caseEl.addEventListener('click', function (event) {
    const button = event.target.closest('.spine');
    if (!button) return;
    openBook(button.dataset.id, false);
  });

  caseEl.addEventListener('keydown', function (event) {
    const button = event.target.closest('.spine');
    if (!button) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      document.getElementById('spine-' + order[0]).focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      document.getElementById('spine-' + order[order.length - 1]).focus();
    }
  });

  caseEl.addEventListener('focusin', function (event) {
    const button = event.target.closest('.spine');
    if (!button) return;
    paintSpines();
    button.tabIndex = 0;
  });

  stackEl.addEventListener('mouseover', function (event) {
    const layer = event.target.closest('.layer');
    hint(layer ? layer.dataset.layer : null);
  });
  stackEl.addEventListener('mouseout', function (event) {
    if (event.target.closest('.layer')) hint(null);
  });
  stackEl.addEventListener('focusin', function (event) {
    const layer = event.target.closest('.layer');
    hint(layer ? layer.dataset.layer : null);
  });
  stackEl.addEventListener('focusout', function () { hint(null); });

  function hint(layerId) {
    const ids = Object.create(null);
    const layer = shelf.LAYERS.find(function (item) { return item.id === layerId; });
    if (layer) layer.books.forEach(function (id) { ids[id] = true; });
    caseEl.querySelectorAll('.spine').forEach(function (button) {
      button.classList.toggle('is-hinted', !!ids[button.dataset.id]);
    });
  }

  bookEl.addEventListener('click', function (event) {
    if (event.target.id === 'mark' && openId) toggleRead(openId);
    if (event.target.id === 'close-book') {
      const returnTo = openId;
      openId = null;
      paintSpines();
      paintBook();
      const spine = document.getElementById('spine-' + returnTo);
      if (spine) spine.focus();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && openId) {
      const returnTo = openId;
      openId = null;
      paintSpines();
      paintBook();
      const spine = document.getElementById('spine-' + returnTo);
      if (spine) spine.focus();
    }
  });

  clearBtn.addEventListener('click', function () {
    read = [];
    persist();
    paintSpines();
    paintStack();
    paintBook();
  });

  paintCase();
  paintSpines();
  paintStack();
  paintBook();
})();
