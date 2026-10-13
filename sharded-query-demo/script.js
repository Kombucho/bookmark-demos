(function () {
  const customers = [
    { id: 1, name: "Ada Voss" },
    { id: 2, name: "Bo Keller" },
    { id: 3, name: "Chen Ibarra" },
    { id: 4, name: "Dia Novak" },
    { id: 5, name: "Edie Marsh" },
    { id: 6, name: "Farid Cole" },
    { id: 7, name: "Gio Ansel" },
    { id: 8, name: "Hana Pell" },
  ];

  const orders = [
    { id: 11, customerId: 1, total: "42.00", created: "2026-09-12", recent: true },
    { id: 12, customerId: 1, total: "18.50", created: "2026-09-18", recent: true },
    { id: 13, customerId: 2, total: "220.00", created: "2026-09-09", recent: true },
    { id: 14, customerId: 3, total: "15.00", created: "2026-10-01", recent: true },
    { id: 15, customerId: 3, total: "64.20", created: "2026-09-21", recent: true },
    { id: 16, customerId: 5, total: "9.75", created: "2026-09-11", recent: true },
    { id: 17, customerId: 6, total: "130.00", created: "2026-08-02", recent: false },
    { id: 18, customerId: 7, total: "77.10", created: "2026-09-28", recent: true },
    { id: 19, customerId: 8, total: "12.00", created: "2026-09-15", recent: true },
    { id: 20, customerId: 4, total: "54.00", created: "2026-09-30", recent: true },
    { id: 21, customerId: 2, total: "8.00", created: "2026-07-19", recent: false },
    { id: 22, customerId: 5, total: "40.00", created: "2026-09-25", recent: true },
  ];

  const STAGES = ["Auth", "Protocol", "Parse", "Plan", "Sidecar", "Postgres", "Results"];
  const RANGES = ["key mod 4 = 0", "key mod 4 = 1", "key mod 4 = 2", "key mod 4 = 3"];
  const CUST_MIN = 10;
  const CUST_MAX = 2000000;
  const ORDER_MIN = 10;
  const ORDER_MAX = 5000000;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    stage: 0,
    beat: 0,
    topology: "naive",
    protocol: "extended",
    playing: false,
  };

  let beatTimers = [];
  let playTimer = 0;
  let liveKey = "";

  const stageCopyEl = document.getElementById("stage-copy");
  const placementEl = document.getElementById("placement");
  const stepLabel = document.getElementById("step-label");
  const playBtn = document.getElementById("play");
  const routerKicker = document.getElementById("router-kicker");
  const routerBody = document.getElementById("router-body");
  const shardsEl = document.getElementById("shards");
  const versusEl = document.getElementById("versus");
  const optionsEl = document.getElementById("options");
  const qualifyingEl = document.getElementById("qualifying");
  const noteEl = document.getElementById("estimate-note");
  const resultsBody = document.getElementById("results-body");
  const resultsEmpty = document.getElementById("results-empty");
  const orderKey = document.getElementById("order-key");
  const live = document.getElementById("live");
  const custInput = document.getElementById("cust");
  const ordersInput = document.getElementById("orders");
  const selectInput = document.getElementById("select");

  function customerShard(id) { return id % 4; }

  function orderShard(order) {
    return state.topology === "naive" ? order.id % 4 : order.customerId % 4;
  }

  function customerById(id) {
    return customers.find((customer) => customer.id === id);
  }

  function logCount(t, min, max) {
    const value = Math.exp(Math.log(min) + (Number(t) / 1000) * (Math.log(max) - Math.log(min)));
    return humanRound(value);
  }

  function humanRound(n) {
    const value = Math.max(0, Math.round(n));
    if (value < 100) return value;
    const pow = Math.pow(10, Math.floor(Math.log10(value)) - 1);
    return Math.round(value / pow) * pow;
  }

  function formatCount(n) {
    return new Intl.NumberFormat("en-US").format(n);
  }

  function stats() {
    const customerRows = logCount(custInput.value, CUST_MIN, CUST_MAX);
    const orderRows = logCount(ordersInput.value, ORDER_MIN, ORDER_MAX);
    const selectivity = Number(selectInput.value) / 100;
    const qualifying = humanRound(orderRows * selectivity);
    return { customerRows, orderRows, selectivity, qualifying };
  }

  function routerPlans(customerRows, qualifying) {
    const transferred = customerRows + qualifying;
    const options = [
      {
        id: "hash-customers",
        label: "Hash join, build customers",
        requests: 8,
        memory: customerRows,
        transferred: transferred,
        detail: "Four requests for customers, four for orders. Hold every customer in the router.",
      },
      {
        id: "hash-orders",
        label: "Hash join, build orders",
        requests: 8,
        memory: qualifying,
        transferred: transferred,
        detail: "The same eight requests. Hold the qualifying orders instead, and probe with customers.",
      },
      {
        id: "nested-customers",
        label: "Nested loop, outer customers",
        requests: 4 + customerRows * 4,
        memory: 1,
        transferred: transferred,
        detail: "Read customers once, then four shard requests per customer. Orders are not stored by customer_id, so each probe hits every shard.",
      },
      {
        id: "nested-orders",
        label: "Nested loop, outer orders",
        requests: 4 + qualifying,
        memory: 1,
        transferred: qualifying + Math.min(customerRows, qualifying),
        detail: "Scatter the orders once. Each qualifying order looks up its customer on a single shard, because customers.id is the shard key.",
      },
    ];
    options.forEach((option) => {
      option.cost = option.requests * 100 + option.memory * 0.04 + option.transferred * 0.002;
    });
    if (qualifying === 0) {
      return {
        winner: {
          id: "stop",
          label: "Scatter orders and stop",
          requests: 4,
          memory: 0,
          detail: "Nothing passes the date filter, so there is no join to run.",
        },
        options: options,
      };
    }
    const ranked = options.slice().sort((a, b) => a.cost - b.cost || a.memory - b.memory);
    return { winner: ranked[0], options: options };
  }

  function resultRows() {
    return orders
      .filter((order) => order.recent)
      .map((order) => {
        const customer = customerById(order.customerId);
        return {
          name: customer.name,
          total: order.total,
          created: order.created,
          customerId: order.customerId,
          shard: orderShard(order),
          orderId: order.id,
        };
      })
      .sort((a, b) => a.shard - b.shard || a.orderId - b.orderId);
  }

  function stageId() { return STAGES[state.stage]; }

  function copyForStage() {
    const id = stageId();
    const naive = state.topology === "naive";
    if (id === "Auth") {
      return "The application talks only to the router. The router completes the Postgres startup exchange itself: role, database, session settings, then a SCRAM-SHA-256 challenge and proof. The password never crosses the wire. ReadyForQuery means this join can be sent.";
    }
    if (id === "Protocol") {
      return "Clients do not all send SQL the same way. The simple protocol is one Query message, with the timestamp already written into the text. The extended protocol keeps $1 in a Parse message, supplies the cutoff in Bind, then Describe, Execute, and Sync. Drivers prefer that split, so the same sentence can run again with a new date.";
    }
    if (id === "Parse") {
      return "The router checks for a cached plan and misses. It tokenizes the SQL into a tree: customers joined to orders on customer_id, a filter on created_at, and three output columns. Planning rewrites that tree. An identical later statement can skip this step.";
    }
    if (id === "Plan") {
      return naive
        ? "customers.id and orders.id hash to different shards, so a customer and their orders are not stored together. The router collects both sides and joins them in memory. At the row counts below, compare a hash table of the smaller side with a nested loop that pays a network request per probe."
        : "orders.customer_id uses the same hash and the same ranges as customers.id. Each shard already holds the customers and the orders that join to them. The router sends the original statement four times and builds no hash table.";
    }
    if (id === "Sidecar") {
      return "The router still does not dial Postgres. A sidecar beside each shard keeps a pool of warm backends, because every Postgres connection is its own process. It borrows one, clears leftover session state, checks the role, and only then forwards the fragment. Every router shares that pool.";
    }
    if (id === "Postgres") {
      return naive
        ? "Each shard is an ordinary Postgres. It plans the fragment with its own statistics. First all four return customer id and name, and the router fills a hash table as those rows arrive. Then all four return orders on or after the cutoff. The date filter runs on the shard."
        : "Each shard receives the join intact. Postgres filters recent orders and matches them to the customers stored beside them. The router waits on four result streams.";
    }
    return naive
      ? "As orders come back, the router probes the hash table with customer_id and emits name, total, and created_at. The values stay in the encoding the client asked for. The client can read rows before the slowest shard finishes."
      : "The shards return rows that are already joined. The router streams them onward and still holds no hash table. Auth, protocol, and the sidecar pool are unchanged. The distributed join is the part that went away.";
  }

  function lastBeat() {
    const id = stageId();
    if (id === "Postgres" && state.topology === "naive") return 2;
    if (id === "Results") return resultRows().length;
    return 0;
  }

  function clearBeats() {
    beatTimers.forEach(clearTimeout);
    beatTimers = [];
  }

  function armPlay() {
    clearTimeout(playTimer);
    const beats = lastBeat();
    const beatMs = stageId() === "Results" ? 260 : 700;
    const wait = reduce.matches ? 1400 : Math.max(3200, beats * beatMs + 800);
    playTimer = setTimeout(() => {
      if (!state.playing) return;
      if (state.stage >= STAGES.length - 1) {
        state.playing = false;
        render();
        return;
      }
      enter(state.stage + 1);
    }, wait);
  }

  function stopPlay() {
    state.playing = false;
    clearTimeout(playTimer);
  }

  function enter(index) {
    clearBeats();
    state.stage = index;
    const end = lastBeat();
    state.beat = reduce.matches ? end : 0;
    render();
    if (!reduce.matches) {
      for (let beat = 1; beat <= end; beat += 1) {
        const delay = beat * (stageId() === "Results" ? 260 : 700);
        beatTimers.push(setTimeout(() => {
          state.beat = beat;
          render();
        }, delay));
      }
    }
    if (state.playing) armPlay();
  }

  function shardHot(index) {
    const id = stageId();
    if (id === "Plan") return true;
    if (id === "Sidecar") return index === 1;
    if (id === "Postgres") return true;
    if (id === "Results") {
      const rows = resultRows();
      const shown = rows.slice(0, state.beat);
      if (!shown.length) return true;
      return shown[shown.length - 1].shard === index;
    }
    return false;
  }

  function shardBadge(index) {
    const id = stageId();
    const naive = state.topology === "naive";
    if (id === "Plan") return naive ? "Scatter both tables" : "Local join";
    if (id === "Sidecar") return index === 1 ? "Borrow, check role, forward" : "Warm pool";
    if (id === "Postgres") {
      if (!naive) return "Join here";
      if (state.beat === 0) return "Customers";
      if (state.beat === 1) return "Fill the hash table";
      return "Orders after the cutoff";
    }
    if (id === "Results") return naive ? "Probe from here" : "Joined rows";
    return "";
  }

  function shardSql() {
    const id = stageId();
    const naive = state.topology === "naive";
    if (id !== "Postgres" && id !== "Plan") return "";
    if (!naive) {
      return "SELECT customers.name,\n       orders.total, orders.created_at\nFROM customers JOIN orders\n  ON orders.customer_id = customers.id\nWHERE orders.created_at >= $1";
    }
    if (id === "Plan") {
      return "customers: id, name\norders: customer_id, total,\n        created_at after $1";
    }
    if (state.beat < 2) {
      return "SELECT id, name\nFROM customers";
    }
    return "SELECT customer_id, total,\n       created_at\nFROM orders\nWHERE created_at >= $1";
  }

  function renderShards() {
    const sql = shardSql();
    const dim = stageId() === "Auth" || stageId() === "Protocol" || stageId() === "Parse";
    shardsEl.replaceChildren();
    for (let index = 0; index < 4; index += 1) {
      const card = document.createElement("article");
      card.className = "shard";
      if (dim) card.classList.add("is-dim");
      if (shardHot(index) && !dim) card.classList.add("is-hot");
      if (stageId() === "Sidecar" && index === 1) card.classList.add("is-focus");

      const header = document.createElement("header");
      const title = document.createElement("h3");
      title.textContent = "Shard " + (index + 1);
      const range = document.createElement("p");
      range.className = "range";
      range.textContent = RANGES[index];
      header.append(title, range);
      card.append(header);

      const badgeText = shardBadge(index);
      if (badgeText && !dim) {
        const badge = document.createElement("p");
        badge.className = "badge";
        badge.textContent = badgeText;
        card.append(badge);
      }
      if (sql && !dim) {
        const pre = document.createElement("pre");
        pre.className = "sql-mini";
        pre.textContent = sql;
        card.append(pre);
      }

      const chips = document.createElement("div");
      chips.className = "chips";
      customers.filter((customer) => customerShard(customer.id) === index).forEach((customer) => {
        const chip = document.createElement("span");
        chip.className = "chip customer";
        chip.textContent = customer.name.split(" ")[0];
        chip.title = "Customer " + customer.id + " · " + customer.name;
        chips.append(chip);
      });
      orders.filter((order) => orderShard(order) === index).forEach((order) => {
        const chip = document.createElement("span");
        const apart = state.topology === "naive" && customerShard(order.customerId) !== index;
        chip.className = "chip order" + (apart ? " apart" : "") + (order.recent ? "" : " old");
        const who = customerById(order.customerId).name.split(" ")[0];
        chip.textContent = "#" + order.id + " " + who;
        chip.title = "Order " + order.id + " for " + who + ", " + order.total + ", " + order.created + (order.recent ? "" : " (before the cutoff)");
        chips.append(chip);
      });
      card.append(chips);
      shardsEl.append(card);
    }
  }

  function renderRouter(plan) {
    const id = stageId();
    routerKicker.textContent = "Step " + (state.stage + 1) + " · " + id;
    routerBody.replaceChildren();

    if (id === "Auth") {
      routerBody.append(messageList([
        ["Startup", "role, database, session settings"],
        ["Challenge", "SCRAM-SHA-256 nonce"],
        ["Proof", "client proof, then the server signature"],
        ["ReadyForQuery", "the join may be sent"],
      ]));
      return;
    }

    if (id === "Protocol") {
      const wrap = document.createElement("div");
      wrap.className = "proto";
      wrap.append(protocolCard("simple", "Simple", [
        "Query",
        "SQL with the timestamp inlined",
      ]));
      wrap.append(protocolCard("extended", "Extended", [
        "Parse · SQL, $1 still open",
        "Bind · 2026-09-09",
        "Describe",
        "Execute",
        "Sync",
      ]));
      routerBody.append(wrap);
      const note = document.createElement("p");
      note.className = "quiet";
      note.textContent = state.protocol === "simple"
        ? "One round trip. Fine for a one-off statement. The router still has to parse the text."
        : "The unnamed statement can be executed again with a new Bind. This walkthrough uses the extended form.";
      routerBody.append(note);
      return;
    }

    if (id === "Parse") {
      routerBody.append(messageList([
        ["Cache", "miss"],
        ["Tables", "customers, orders"],
        ["Join", "orders.customer_id = customers.id"],
        ["Filter", "created_at >= $1"],
        ["Output", "name, total, created_at"],
      ], "ast"));
      return;
    }

    if (id === "Plan") {
      const naive = state.topology === "naive";
      const lines = naive
        ? [
          ["Topology", "keys do not co-locate"],
          ["Customers", "scatter to all 4 shards"],
          ["Orders", "scatter to all 4 shards"],
          ["Join", plan.winner.label],
          ["Requests", formatCount(plan.winner.requests)],
        ]
        : [
          ["Topology", "orders share the customer key"],
          ["Route", "the original join, once per shard"],
          ["Router join", "none"],
          ["Requests", "4"],
        ];
      routerBody.append(messageList(lines, "ast"));
      return;
    }

    if (id === "Sidecar") {
      routerBody.append(messageList([
        ["Stream", "long-lived, borrowed from a pool"],
        ["Session", "database, role, and settings ride along"],
        ["Shard 2", "reset leftovers, confirm the role"],
        ["Forward", "Parse, Bind, Execute, Sync"],
      ]));
      const note = document.createElement("p");
      note.className = "quiet";
      note.textContent = "The same pool serves every router. A direct connection per router would leave an idle Postgres process on every shard.";
      routerBody.append(note);
      return;
    }

    if (id === "Postgres" && state.topology === "naive") {
      const list = document.createElement("ul");
      list.className = "hash-list";
      const caption = document.createElement("li");
      const label = document.createElement("b");
      label.textContent = state.beat === 0 ? "Waiting" : "Hash table";
      const text = document.createElement("span");
      text.textContent = state.beat === 0
        ? "Customer rows have not arrived."
        : "Keyed by customer id. Toy rows, not the slider count.";
      caption.append(label, text);
      list.append(caption);
      if (state.beat >= 1) {
        customers.forEach((customer) => {
          const item = document.createElement("li");
          const key = document.createElement("b");
          key.textContent = String(customer.id);
          const value = document.createElement("span");
          value.textContent = customer.name;
          item.append(key, value);
          list.append(item);
        });
      }
      routerBody.append(list);
      return;
    }

    if (id === "Postgres") {
      const note = document.createElement("p");
      note.className = "quiet";
      note.textContent = "No hash table in the router. Each Postgres joins the customers and orders that share its range, and streams matched rows back.";
      routerBody.append(note);
      return;
    }

    const rows = resultRows();
    const shown = rows.slice(0, state.beat);
    const list = document.createElement("ul");
    list.className = "hash-list";
    if (state.topology === "naive") {
      const hitId = shown.length ? shown[shown.length - 1].customerId : null;
      customers.forEach((customer) => {
        const item = document.createElement("li");
        if (customer.id === hitId) item.classList.add("is-hit");
        const key = document.createElement("b");
        key.textContent = String(customer.id);
        const value = document.createElement("span");
        value.textContent = customer.name;
        item.append(key, value);
        list.append(item);
      });
      routerBody.append(list);
    }
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = shown.length
      ? shown.length + " of " + rows.length + " recent orders have reached the client."
      : "Waiting for the first shard to return.";
    routerBody.append(note);
  }

  function messageList(pairs, className) {
    const list = document.createElement("ul");
    list.className = className || "messages";
    pairs.forEach((pair) => {
      const item = document.createElement("li");
      const key = document.createElement("b");
      key.textContent = pair[0];
      const value = document.createElement("span");
      value.textContent = pair[1];
      item.append(key, value);
      list.append(item);
    });
    return list;
  }

  function protocolCard(value, title, lines) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "protocol";
    input.value = value;
    input.checked = state.protocol === value;
    input.addEventListener("change", () => {
      state.protocol = value;
      render();
    });
    const name = document.createElement("span");
    name.textContent = " " + title;
    const list = document.createElement("ol");
    lines.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      list.append(item);
    });
    label.append(input, name, list);
    return label;
  }

  function renderEstimate(numbers, plan) {
    document.getElementById("cust-out").textContent = formatCount(numbers.customerRows);
    document.getElementById("orders-out").textContent = formatCount(numbers.orderRows);
    document.getElementById("select-out").textContent = Math.round(numbers.selectivity * 100) + "%";
    qualifyingEl.textContent = formatCount(numbers.qualifying) + " recent orders";

    versusEl.replaceChildren();
    versusEl.append(versusCard(
      "Orders sharded by id",
      formatCount(plan.winner.requests),
      plan.winner.label,
      state.topology === "naive",
      false
    ));
    versusEl.append(versusCard(
      "Orders sharded by customer_id",
      "4",
      "Local join. No router hash table.",
      state.topology === "colocated",
      true
    ));

    optionsEl.classList.toggle("is-shelved", state.topology === "colocated");
    optionsEl.replaceChildren();
    plan.options.forEach((option) => {
      const item = document.createElement("li");
      if (option.id === plan.winner.id) item.classList.add("is-winner");
      const label = document.createElement("span");
      label.textContent = option.label;
      const reqs = document.createElement("span");
      reqs.className = "reqs";
      reqs.textContent = formatCount(option.requests) + " requests · hold " + formatCount(option.memory);
      item.append(label, reqs);
      item.title = option.detail;
      optionsEl.append(item);
    });

    const winner = plan.winner;
    if (state.topology === "colocated") {
      noteEl.textContent = "The highlighted row is the router join you no longer run. Each shard sees about " + formatCount(Math.round(numbers.customerRows / 4)) + " customers and " + formatCount(Math.round(numbers.qualifying / 4)) + " recent orders, and Postgres plans that local join itself.";
    } else if (winner.id === "stop") {
      noteEl.textContent = winner.detail;
    } else if (winner.id.indexOf("hash") === 0) {
      noteEl.textContent = "Hash join wins at these sizes: eight shard requests, and the router holds the smaller side (" + formatCount(winner.memory) + " rows). A nested loop would repeat a probe for every outer row.";
    } else {
      noteEl.textContent = "Nested loop wins. Only " + formatCount(numbers.qualifying) + " orders qualify, so a point lookup per order is cheaper than building a hash table. Customer lookups hit one shard; order lookups would not.";
    }
  }

  function versusCard(kicker, big, label, active, local) {
    const card = document.createElement("article");
    if (active) card.classList.add("is-active");
    if (local) card.classList.add("is-local");
    const k = document.createElement("p");
    k.className = "plan-kicker";
    k.textContent = kicker;
    const n = document.createElement("p");
    n.className = "big";
    n.textContent = big;
    const t = document.createElement("p");
    t.className = "plan-label";
    t.textContent = label;
    card.append(k, n, t);
    return card;
  }

  function renderResults() {
    const rows = resultRows();
    const shown = stageId() === "Results" ? rows.slice(0, state.beat) : [];
    resultsBody.replaceChildren();
    shown.forEach((row, index) => {
      const tr = document.createElement("tr");
      if (!reduce.matches && index === shown.length - 1) tr.classList.add("arrive");
      [row.name, row.total, row.created, "Shard " + (row.shard + 1)].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      resultsBody.append(tr);
    });
    const naive = state.topology === "naive";
    resultsEmpty.hidden = shown.length > 0;
    resultsEmpty.textContent = shown.length
      ? ""
      : (naive
        ? "The table fills on the Results step, after the router probes the hash table. Recent orders only."
        : "The table fills on the Results step. Each shard already joined its own rows. Recent orders only.");
  }

  function render() {
    const numbers = stats();
    const plan = routerPlans(numbers.customerRows, numbers.qualifying);
    const misplaced = orders.filter((order) => customerShard(order.customerId) !== (order.id % 4));
    const together = orders.filter((order) => customerShard(order.customerId) === (order.id % 4));

    stepLabel.textContent = "Step " + (state.stage + 1) + " of " + STAGES.length;
    playBtn.textContent = state.playing ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", state.playing ? "true" : "false");
    document.getElementById("prev").disabled = state.stage === 0;
    document.getElementById("next").disabled = state.stage === STAGES.length - 1;

    document.querySelectorAll("#stage-list button").forEach((button) => {
      const on = Number(button.dataset.stage) === state.stage;
      if (on) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });

    stageCopyEl.textContent = copyForStage();
    placementEl.textContent = state.topology === "naive"
      ? misplaced.length + " of " + orders.length + " sample orders sit on a different shard from their customer. " + together.map((order) => "#" + order.id).join(" and ") + " share a shard with their customers only because those ids fall in the same bucket."
      : "Every sample order sits on its customer’s shard. The join no longer has to meet in the router.";
    orderKey.innerHTML = state.topology === "naive"
      ? "Shard key <code>orders.id</code>"
      : "Shard key <code>customer_id</code>";

    renderEstimate(numbers, plan);
    renderRouter(plan);
    renderShards();
    renderResults();

    const key = state.stage + "|" + state.topology + "|" + state.protocol;
    if (key !== liveKey) {
      liveKey = key;
      live.textContent = STAGES[state.stage] + ". " + copyForStage();
    }
  }

  document.querySelectorAll('input[name="topology"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.topology = input.value;
      clearBeats();
      state.beat = reduce.matches ? lastBeat() : 0;
      render();
      if (!reduce.matches && lastBeat() > 0) {
        const end = lastBeat();
        for (let beat = 1; beat <= end; beat += 1) {
          const delay = beat * (stageId() === "Results" ? 260 : 700);
          beatTimers.push(setTimeout(() => {
            state.beat = beat;
            render();
          }, delay));
        }
      }
    });
  });

  document.getElementById("prev").addEventListener("click", () => {
    if (state.stage === 0) return;
    stopPlay();
    enter(state.stage - 1);
  });
  document.getElementById("next").addEventListener("click", () => {
    if (state.stage === STAGES.length - 1) return;
    stopPlay();
    enter(state.stage + 1);
  });
  playBtn.addEventListener("click", () => {
    if (state.playing) {
      stopPlay();
      render();
      return;
    }
    state.playing = true;
    if (state.stage === STAGES.length - 1 && state.beat >= lastBeat()) enter(0);
    else {
      armPlay();
      render();
    }
  });
  document.getElementById("stage-list").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    stopPlay();
    enter(Number(button.dataset.stage));
  });

  [custInput, ordersInput, selectInput].forEach((input) => {
    input.addEventListener("input", render);
  });

  render();
})();
