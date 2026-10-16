(function () {
  const api = window.AnchorGotchas;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stage = document.querySelector('#stage');
  const picker = document.querySelector('#picker');

  let which = 'seeds';
  let built = '';
  let seeds = api.createSeeds();
  let vault = api.createVault();
  let cpi = api.createCpi();
  let mint = api.createMint();
  let seedNote = '';
  let vaultNote = '';
  let cpiNote = '';
  const view = {};

  api.GOTCHAS.forEach(function (gotcha) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = gotcha.label;
    button.dataset.gotcha = gotcha.id;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', function () {
      which = gotcha.id;
      render();
    });
    picker.appendChild(button);
  });

  stage.addEventListener('click', onClick);
  stage.addEventListener('change', onChange);
  render();

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.act;
    if (!id) return;
    if (which === 'seeds') {
      if (id === 'create') applySeed(api.createProduct(seeds));
      else if (id === 'bid') applySeed(api.placeBid(seeds));
      else if (id === 'reset') {
        seeds = api.createSeeds();
        seedNote = '';
      }
    } else if (which === 'remaining') {
      if (id === 'winner' || id === 'attacker') {
        vault = api.selectAccount(vault, id);
        vaultNote = '';
      }
      else if (id === 'cash') applyVault(api.cashOut(vault));
      else if (id === 'reset') {
        vault = api.createVault();
        vaultNote = '';
      }
    } else if (which === 'cpi') {
      if (id === 'trusted' || id === 'malicious') {
        cpi = api.selectProgram(cpi, id);
        cpiNote = '';
      }
      else if (id === 'invoke') applyCpi(api.invoke(cpi));
      else if (id === 'reset') {
        cpi = api.createCpi();
        cpiNote = '';
      }
    } else if (id === 'mint') applyMint(api.mintTo(mint));
    else if (id === 'reset') mint = api.createMint();
    render();
  }

  function onChange(event) {
    const input = event.target;
    if (input.id === 'seed-fix') {
      seeds = api.setSeedFix(seeds, input.checked);
      seedNote = '';
    } else if (input.dataset.check) {
      vault = api.setCheck(vault, input.dataset.check, input.checked);
      vaultNote = '';
    } else if (input.id === 'program-check') cpi = api.setProgramCheck(cpi, input.checked);
    else if (input.id === 'reload') mint = api.setReload(mint, input.checked);
    render();
  }

  function applySeed(result) {
    seeds = result.state;
    seedNote = result.code === 'Created'
      ? 'Created at ' + result.address + '.'
      : 'Account already in use. ' + result.holder.label + ' owns ' + result.address + '.';
  }

  function applyVault(result) {
    vault = result.state;
    vaultNote = {
      Drained: 'The wallet was paid the whole vault. Anchor did not check remaining_accounts.',
      Paid: 'The winner PDA was paid. The funds stay in the program.',
      Owner: 'Rejected. Owner is the system program, not the market.',
      Type: 'Rejected. No Winner discriminator.',
      Address: 'Rejected. Address is not the winner PDA.',
      Done: 'Already cashed out.',
    }[result.code];
  }

  function applyCpi(result) {
    cpi = result.state;
    cpiNote = {
      Drained: 'The malicious program signed with the pool PDA and took the vault.',
      Lent: 'Trusted lending recorded the call. The pool stays.',
      ProgramId: 'Rejected. lending_program is not the lending program.',
      Done: 'Already invoked.',
    }[result.code];
  }

  function applyMint(result) {
    if (result.ok) mint = result.state;
  }

  function render() {
    picker.querySelectorAll('button').forEach(function (button) {
      const on = button.dataset.gotcha === which;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (built !== which) {
      stage.replaceChildren();
      if (which === 'seeds') buildSeeds();
      else if (which === 'remaining') buildVault();
      else if (which === 'cpi') buildCpi();
      else buildMint();
      built = which;
    }
    if (which === 'seeds') paintSeeds();
    else if (which === 'remaining') paintVault();
    else if (which === 'cpi') paintCpi();
    else paintMint();
  }

  function buildSeeds() {
    add(stage, 'h2', '', 'Seed collisions');
    add(stage, 'p', 'lede', 'Product seeds and bid seeds are different arrays. With no separator, they concatenate to the same bytes, so the attacker’s product is Bo’s bid PDA.');
    const row = add(stage, 'div', 'fix-row');
    const label = add(row, 'label', 'switch');
    const input = add(label, 'input');
    input.type = 'checkbox';
    input.id = 'seed-fix';
    label.append(document.createTextNode('Hash variable seeds to 32 bytes'));
    view.seedBadge = add(row, 'p', 'badge');
    const split = add(stage, 'div', 'split');
    view.product = seedCard(split, 'Attacker product', 'seeds = [b"product", product_name]');
    view.bid = seedCard(split, "Bo's bid", 'seeds = [product_name, user.key()]');
    view.same = add(stage, 'p', 'same');
    const actions = add(stage, 'div', 'actions');
    view.create = act(actions, 'create', 'Attacker creates product', true);
    view.bidButton = act(actions, 'bid', 'Bo places a bid', true);
    act(actions, 'reset', 'Reset', false);
    view.seedResult = add(stage, 'p', 'result');
    view.seedResult.setAttribute('role', 'status');
  }

  function seedCard(parent, title, formula) {
    const card = add(parent, 'article', 'account');
    add(card, 'h3', '', title);
    add(card, 'p', 'formula', formula);
    return {
      card: card,
      seeds: add(card, 'div', 'seeds'),
      ribbon: add(card, 'div', 'ribbon'),
      addr: add(card, 'p', 'addr'),
      hold: add(card, 'p', 'hold'),
    };
  }

  function paintSeeds() {
    const picture = api.seedView(seeds);
    view.seedBadge.textContent = seeds.fix ? 'Fixed' : 'Vulnerable';
    view.seedBadge.className = 'badge ' + (seeds.fix ? 'is-shut' : 'is-open');
    document.querySelector('#seed-fix').checked = seeds.fix;
    paintDerived(view.product, api.productSeeds(), picture.product, picture.same, picture.productHolder);
    paintDerived(view.bid, api.bidSeeds(), picture.bid, picture.same, picture.bidHolder);
    if (!seeds.fix) {
      view.same.textContent = 'One byte string, two cuts. Bo’s key is the 32 bytes ' + api.VICTIM_KEY + '.';
      view.same.className = 'same is-bad';
    } else {
      view.same.textContent = 'The name is hashed to 32 bytes before it is joined. The addresses diverge.';
      view.same.className = 'same is-ok';
    }
    view.create.disabled = api.hasKind(seeds, 'product');
    view.bidButton.disabled = api.hasKind(seeds, 'bid');
    view.seedResult.textContent = seedNote;
    view.seedResult.className = 'result ' + (seedNote.indexOf('already') === -1 ? 'is-ok' : 'is-bad');
    if (!seedNote) view.seedResult.className = 'result';
  }

  function paintDerived(card, seedList, derived, same, holder) {
    card.card.classList.toggle('is-hit', same && !seeds.fix);
    card.card.classList.toggle('is-ok', seeds.fix);
    card.seeds.replaceChildren();
    card.ribbon.replaceChildren();
    if (seeds.fix) {
      seedList.forEach(function (seed) {
        const chip = document.createElement('span');
        chip.textContent = seed.variable ? '32-byte hash' : seed.label;
        card.seeds.appendChild(chip);
      });
    } else {
      let offset = 0;
      const cuts = {};
      seedList.forEach(function (seed) {
        cuts[offset] = true;
        const chip = document.createElement('span');
        chip.textContent = seed.label + ' · ' + seed.bytes.length;
        card.seeds.appendChild(chip);
        offset += seed.bytes.length;
      });
      derived.text.split('').forEach(function (character, index) {
        const span = document.createElement('span');
        if (cuts[index]) span.className = 'cut';
        span.textContent = character;
        card.ribbon.appendChild(span);
      });
    }
    card.addr.textContent = 'PDA ' + derived.address;
    card.hold.textContent = holder ? 'Occupied by ' + holder.label : 'Empty';
  }

  function buildVault() {
    add(stage, 'h2', '', 'Remaining accounts');
    add(stage, 'p', 'lede', 'Cash-out pays the account in ctx.remaining_accounts. Anchor does not check owner, type, or address on that list.');
    const row = add(stage, 'div', 'fix-row');
    view.checks = {};
    ['owner', 'type', 'address'].forEach(function (key) {
      const label = add(row, 'label', 'switch');
      const input = add(label, 'input');
      input.type = 'checkbox';
      input.dataset.check = key;
      view.checks[key] = input;
      const names = {owner: 'Ownership', type: 'Type', address: 'Address'};
      label.append(document.createTextNode(names[key] + ' check'));
    });
    view.vaultBadge = add(row, 'p', 'badge');
    const cards = add(stage, 'div', 'cards three');
    view.vaultCard = moneyCard(cards, 'Vault', api.VAULT);
    view.winnerCard = partyCard(cards, 'winner');
    view.attackerCard = partyCard(cards, 'attacker');
    const actions = add(stage, 'div', 'actions');
    view.cash = act(actions, 'cash', 'Cash out', true);
    act(actions, 'reset', 'Reset', false);
    view.vaultResult = add(stage, 'p', 'result');
    view.vaultResult.setAttribute('role', 'status');
  }

  function partyCard(parent, id) {
    const party = api.PARTIES[id];
    const card = add(parent, 'article', 'account');
    add(card, 'h3', '', party.name);
    const owner = add(card, 'p', 'owner');
    const disc = add(card, 'p', 'formula');
    const addr = add(card, 'p', 'addr', party.address);
    const money = add(card, 'p', 'money');
    add(money, 'span', '', 'Balance');
    const strong = add(money, 'strong', '', '0');
    const bar = add(card, 'div', 'bar');
    const fill = add(bar, 'span');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick';
    button.dataset.act = id;
    button.textContent = 'Pass this account';
    card.appendChild(button);
    return {card: card, owner: owner, disc: disc, addr: addr, strong: strong, fill: fill, button: button, id: id};
  }

  function paintVault() {
    const open = !vault.checks.owner && !vault.checks.type && !vault.checks.address;
    view.vaultBadge.textContent = open ? 'Vulnerable' : 'Fixed';
    view.vaultBadge.className = 'badge ' + (open ? 'is-open' : 'is-shut');
    Object.keys(view.checks).forEach(function (key) {
      view.checks[key].checked = !!vault.checks[key];
    });
    paintMoney(view.vaultCard, vault.vault, api.VAULT_START, vault.vault === 0);
    [view.winnerCard, view.attackerCard].forEach(function (card) {
      const party = api.PARTIES[card.id];
      const selected = vault.selected === card.id;
      card.owner.textContent = 'Owner ' + party.owner;
      card.disc.textContent = party.discriminator ? 'Discriminator ' + party.discriminator : 'No discriminator';
      card.button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.button.disabled = vault.done;
      card.card.classList.toggle('is-selected', selected);
      const amount = card.id === 'winner' ? vault.winner : vault.attacker;
      paintMoney(card, amount, api.VAULT_START, card.id === 'attacker' && amount > 0);
    });
    view.cash.disabled = vault.done;
    view.vaultResult.textContent = vaultNote;
    view.vaultResult.className = 'result ' + (vaultNote.indexOf('Rejected') === 0 || vaultNote.indexOf('wallet') !== -1 ? 'is-bad' : 'is-ok');
    if (!vaultNote) view.vaultResult.className = 'result';
  }

  function buildCpi() {
    add(stage, 'h2', '', 'Confused deputy');
    add(stage, 'p', 'lede', 'The market program calls lending_program with invoke_signed and the pool PDA as the signer. The program id is whatever the caller passed.');
    const row = add(stage, 'div', 'fix-row');
    const label = add(row, 'label', 'switch');
    const input = add(label, 'input');
    input.type = 'checkbox';
    input.id = 'program-check';
    label.append(document.createTextNode('Check lending_program id'));
    view.cpiBadge = add(row, 'p', 'badge');
    view.call = add(stage, 'p', 'call');
    const cards = add(stage, 'div', 'cards');
    view.pool = moneyCard(cards, 'Pool PDA', api.POOL);
    view.cpiAttacker = moneyCard(cards, 'Attacker wallet', api.ATTACKER);
    const programs = add(stage, 'div', 'programs');
    view.trusted = act(programs, 'trusted', 'Trusted lending', false);
    view.malicious = act(programs, 'malicious', 'Malicious program', false);
    const actions = add(stage, 'div', 'actions');
    view.invoke = act(actions, 'invoke', 'invoke_signed', true);
    act(actions, 'reset', 'Reset', false);
    view.cpiResult = add(stage, 'p', 'result');
    view.cpiResult.setAttribute('role', 'status');
    add(view.pool.card, 'p', 'formula', 'seeds = [b"pool"]');
    add(view.pool.card, 'p', 'owner', 'Authority for the vault');
  }

  function paintCpi() {
    view.cpiBadge.textContent = cpi.checkProgram ? 'Fixed' : 'Vulnerable';
    view.cpiBadge.className = 'badge ' + (cpi.checkProgram ? 'is-shut' : 'is-open');
    document.querySelector('#program-check').checked = cpi.checkProgram;
    const target = cpi.program === 'trusted' ? api.TRUSTED : api.MALICIOUS;
    view.call.textContent = 'invoke_signed(&[b"pool"]) → ' + target;
    paintMoney(view.pool, cpi.pool, api.POOL_START, cpi.pool === 0);
    paintMoney(view.cpiAttacker, cpi.attacker, api.POOL_START, cpi.attacker > 0);
    view.trusted.setAttribute('aria-pressed', cpi.program === 'trusted' ? 'true' : 'false');
    view.malicious.setAttribute('aria-pressed', cpi.program === 'malicious' ? 'true' : 'false');
    view.trusted.disabled = cpi.done;
    view.malicious.disabled = cpi.done;
    view.invoke.disabled = cpi.done;
    view.cpiResult.textContent = cpiNote;
    view.cpiResult.className = 'result ' + (cpiNote.indexOf('malicious') !== -1 ? 'is-bad' : 'is-ok');
    if (!cpiNote) view.cpiResult.className = 'result';
  }

  function buildMint() {
    add(stage, 'h2', '', 'Stale account');
    add(stage, 'p', 'lede', 'The CPI mints 250,000. The on-chain supply moves. The Anchor struct keeps the old supply until reload().');
    const row = add(stage, 'div', 'fix-row');
    const label = add(row, 'label', 'switch');
    const input = add(label, 'input');
    input.type = 'checkbox';
    input.id = 'reload';
    label.append(document.createTextNode('Call reload()'));
    view.mintBadge = add(row, 'p', 'badge');
    const numbers = add(stage, 'div', 'numbers');
    view.before = figure(numbers, 'Before CPI');
    view.chain = figure(numbers, 'On-chain supply');
    view.struct = figure(numbers, 'Anchor struct');
    view.shareLine = add(stage, 'p', 'share-line');
    const actions = add(stage, 'div', 'actions');
    view.mintButton = act(actions, 'mint', 'Mint 250,000', true);
    act(actions, 'reset', 'Reset', false);
    view.mintResult = add(stage, 'p', 'result');
    view.mintResult.setAttribute('role', 'status');
  }

  function figure(parent, title) {
    const card = add(parent, 'article', 'account');
    add(card, 'h3', '', title);
    const strong = add(card, 'strong', '', '0');
    const hint = add(card, 'p', 'hint');
    return {card: card, strong: strong, hint: hint};
  }

  function paintMint() {
    const stale = mint.minted && mint.struct !== mint.chain;
    view.mintBadge.textContent = mint.reload ? 'reload() on' : 'Vulnerable';
    view.mintBadge.className = 'badge ' + (mint.reload ? 'is-shut' : 'is-open');
    document.querySelector('#reload').checked = mint.reload;
    setFigure(view.before, api.SUPPLY_START, 'supply before the CPI');
    setFigure(view.chain, mint.chain, mint.minted ? 'written by the token program' : 'unchanged');
    setFigure(view.struct, mint.struct, stale ? 'still the old read' : 'matches the account');
    view.struct.card.classList.toggle('is-stale', stale);
    view.struct.card.classList.toggle('is-ok', mint.minted && !stale);
    view.chain.card.classList.toggle('is-ok', mint.minted);
    if (!mint.minted) {
      view.shareLine.textContent = 'Share is amount minted ÷ supply. The mint has not run.';
      view.mintResult.textContent = '';
      view.mintResult.className = 'result';
    } else {
      const fromStruct = percent(api.share(api.MINT_AMOUNT, mint.struct));
      const fromChain = percent(api.share(api.MINT_AMOUNT, mint.chain));
      view.shareLine.textContent = 'Share from the struct ' + fromStruct + '. Share from the chain ' + fromChain + '.';
      view.mintResult.textContent = stale
        ? 'The struct still says ' + formatInt(mint.struct) + '. The chain says ' + formatInt(mint.chain) + '.'
        : 'reload() copied the chain supply into the struct.';
      view.mintResult.className = 'result ' + (stale ? 'is-bad' : 'is-ok');
    }
    view.mintButton.disabled = mint.minted;
  }

  function setFigure(figureNode, value, hint) {
    const previous = Number(figureNode.strong.dataset.value || value);
    tween(figureNode.strong, previous, value, formatInt);
    figureNode.strong.dataset.value = String(value);
    figureNode.hint.textContent = hint;
  }

  function moneyCard(parent, title, address) {
    const card = add(parent, 'article', 'account');
    add(card, 'h3', '', title);
    add(card, 'p', 'addr', address);
    const money = add(card, 'p', 'money');
    add(money, 'span', '', 'Balance');
    const strong = add(money, 'strong', '', '0');
    const bar = add(card, 'div', 'bar');
    const fill = add(bar, 'span');
    return {card: card, strong: strong, fill: fill};
  }

  function paintMoney(card, value, max, drained) {
    const previous = Number(card.strong.dataset.value || value);
    tween(card.strong, previous, value, formatInt);
    card.strong.dataset.value = String(value);
    card.fill.style.width = (max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))) + '%';
    card.card.classList.toggle('is-drained', !!drained);
  }

  function tween(el, from, to, format) {
    if (reduce.matches || from === to) {
      el.textContent = format(to);
      return;
    }
    const started = performance.now();
    function step(now) {
      const t = Math.min(1, (now - started) / 480);
      const value = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      el.textContent = format(value);
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  function formatInt(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function percent(ratio) {
    return (ratio * 100).toFixed(1).replace(/\.0$/, '') + '%';
  }

  function act(parent, id, text, primary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.act = id;
    button.textContent = text;
    if (primary) button.className = 'primary';
    parent.appendChild(button);
    return button;
  }

  function add(parent, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  }
})();
