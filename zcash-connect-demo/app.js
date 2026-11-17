// Simulated connect modal. The state machine lives in connect.js.
// No wallet, no key, no request.

(function () {
  const C = window.ZcashConnect;
  const modal = document.getElementById('modal');
  const dialog = modal.querySelector('.dialog');
  const walletsEl = document.getElementById('wallets');
  const kindsEl = document.getElementById('kinds');
  const connectBtn = document.getElementById('connect');
  const connectLabel = document.getElementById('connect-label');
  const chip = document.getElementById('chip');
  const chipMark = document.getElementById('chip-mark');
  const chipAddr = document.getElementById('chip-addr');
  const statusEl = document.getElementById('status');
  const account = document.getElementById('account');
  const full = document.getElementById('full');
  const explain = document.getElementById('explain');
  const snippet = document.getElementById('snippet');
  const addressStatus = document.getElementById('copy-address-status');
  const codeStatus = document.getElementById('copy-code-status');

  let state = C.initialState();
  let token = 0;
  let opener = null;

  snippet.textContent = C.snippet();

  C.WALLETS.forEach(function (wallet) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wallet';
    button.dataset.id = wallet.id;
    button.dataset.category = wallet.category;
    button.innerHTML = '<span class="mark"></span><span class="wallet-copy"><span class="wallet-name"></span><span class="wallet-blurb"></span></span><span class="wallet-meta"></span>';
    const mark = button.querySelector('.mark');
    mark.textContent = wallet.letter;
    mark.style.setProperty('--mark', wallet.color);
    mark.style.setProperty('--mark-ink', wallet.ink);
    button.querySelector('.wallet-name').textContent = wallet.name;
    button.querySelector('.wallet-blurb').textContent = wallet.blurb;
    button.querySelector('.wallet-meta').textContent = wallet.category;
    button.addEventListener('click', function () { pick(wallet.id); });
    walletsEl.appendChild(button);
  });

  C.KINDS.forEach(function (kind) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.kind = kind.id;
    button.innerHTML = '<span></span><small></small>';
    button.querySelector('span').textContent = kind.label;
    button.querySelector('small').textContent = kind.short;
    button.addEventListener('click', function () {
      state = C.setAddressKind(state, kind.id);
      render();
    });
    kindsEl.appendChild(button);
  });

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function render() {
    const view = C.present(state);
    const connecting = view.status === 'connecting';
    const connected = view.status === 'connected';

    connectBtn.hidden = connected;
    connectBtn.disabled = connecting;
    connectLabel.textContent = connecting ? 'Connecting…' : 'Connect Zcash Wallet';
    chip.hidden = !connected;

    if (connected && view.wallet) {
      chipMark.textContent = view.wallet.letter;
      chipMark.style.setProperty('--mark', view.wallet.color);
      chipMark.style.setProperty('--mark-ink', view.wallet.ink);
      chipAddr.textContent = view.short;
    }

    account.hidden = !connected;
    if (connected) {
      statusEl.textContent = 'Connected to ' + view.wallet.name + '. The address is fictional.';
      full.textContent = view.address;
      explain.textContent = view.explanation;
    } else if (connecting) {
      statusEl.textContent = 'Connecting to ' + view.wallet.name + '. This pause is the handshake, and it never leaves the page.';
    } else {
      statusEl.textContent = 'Connect a wallet to see a receive address.';
    }

    const kindButtons = kindsEl.querySelectorAll('button');
    for (let i = 0; i < kindButtons.length; i++) {
      const button = kindButtons[i];
      button.setAttribute('aria-pressed', button.dataset.kind === view.kind.id ? 'true' : 'false');
    }

    const walletButtons = walletsEl.querySelectorAll('.wallet');
    for (let i = 0; i < walletButtons.length; i++) {
      const button = walletButtons[i];
      const busy = connecting && view.wallet && button.dataset.id === view.wallet.id;
      button.disabled = connecting && !busy;
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
      const meta = button.querySelector('.wallet-meta');
      meta.textContent = '';
      if (busy) {
        const spinner = document.createElement('i');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        meta.appendChild(spinner);
        meta.appendChild(document.createTextNode('Connecting…'));
      } else {
        meta.textContent = button.dataset.category;
      }
    }
  }

  function openModal() {
    if (state.status === 'connected') return;
    opener = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const first = walletsEl.querySelector('button:not(:disabled)');
    if (first) first.focus();
  }

  function closeModal(next) {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    const target = next || opener;
    opener = null;
    if (target && typeof target.focus === 'function') target.focus();
  }

  function cancelConnect() {
    token += 1;
    if (state.status === 'connecting') state = C.disconnect(state);
    closeModal(connectBtn);
    render();
  }

  function pick(id) {
    if (state.status === 'connecting') return;
    state = C.beginConnect(state, id);
    token += 1;
    const mine = token;
    render();
    const wait = reduceMotion() ? 160 : 700;
    window.setTimeout(function () {
      if (mine !== token) return;
      if (state.status !== 'connecting' || state.walletId !== id) return;
      state = C.finishConnect(state);
      render();
      closeModal(document.getElementById('disconnect'));
    }, wait);
  }

  function tabbables() {
    return Array.prototype.filter.call(
      dialog.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
  }

  function copyText(text, statusEl) {
    function done(message) { statusEl.textContent = message; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        done('Copied.');
      }).catch(function () {
        fallback();
      });
      return;
    }
    fallback();
    function fallback() {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        done('Copied.');
      } catch (err) {
        done('Select the text and copy it.');
      }
      area.remove();
    }
  }

  connectBtn.addEventListener('click', openModal);
  document.getElementById('close').addEventListener('click', cancelConnect);
  modal.addEventListener('click', function (event) {
    if (event.target === modal) cancelConnect();
  });
  document.addEventListener('keydown', function (event) {
    if (modal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelConnect();
      return;
    }
    if (event.key !== 'Tab') return;
    const list = tabbables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.getElementById('disconnect').addEventListener('click', function () {
    addressStatus.textContent = '';
    state = C.disconnect(state);
    render();
    connectBtn.focus();
  });

  document.getElementById('copy-address').addEventListener('click', function () {
    const view = C.present(state);
    if (!view.address) return;
    copyText(view.address, addressStatus);
  });

  document.getElementById('copy-code').addEventListener('click', function () {
    copyText(C.snippet(), codeStatus);
  });

  render();
})();
