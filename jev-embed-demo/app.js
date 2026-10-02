const QUESTIONS = [
  { label: "is_customer", tone: "tone-customer" },
  { label: "urgent", tone: "tone-urgent" },
  { label: "about_billing", tone: "tone-billing" },
  { label: "needs_reply", tone: "tone-reply" },
];

const DOCS = [
  {
    id: "email",
    kind: "Email",
    from: "Dana Ruiz",
    text: "I got charged twice this month, pls fix asap",
    vector: [1.0, 0.9, 1.0, 1.0],
  },
  {
    id: "news",
    kind: "Newsletter",
    from: "Weekly Digest",
    text: "Five links from this week. No action needed.",
    vector: [0.0, 0.0, 0.0, 0.1],
  },
  {
    id: "friend",
    kind: "Friend",
    from: "Sam Okonkwo",
    text: "Want to grab lunch tomorrow?",
    vector: [0.0, 0.1, 0.0, 0.7],
  },
];

const EXAMPLES = [
  {
    id: "customer",
    ask: "Is Dana’s email from a customer?",
    docId: "email",
    qIndex: 0,
    say: "Yes. is_customer is 1.0. That number is one slot in the embedding.",
  },
  {
    id: "billing",
    ask: "Is the newsletter about billing?",
    docId: "news",
    qIndex: 2,
    say: "No. about_billing is 0.0. A newsletter sits near zero on these questions.",
  },
  {
    id: "reply",
    ask: "Does Sam’s lunch note need a reply?",
    docId: "friend",
    qIndex: 3,
    say: "Mostly. needs_reply is 0.7. It is not billing, and it is not a customer.",
  },
];

const SEARCH = {
  label: "billing issues from customers",
  vector: [1.0, 0.5, 1.0, 0.5],
};

const slot = document.querySelector("#slot");
const slotHint = document.querySelector("#slot-hint");
const tray = document.querySelector("#tray");
const trayLabel = document.querySelector("#tray-label");
const panel = document.querySelector("#panel");
const grip = document.querySelector("#grip");
const badge = document.querySelector("#badge");
const dropBtn = document.querySelector("#drop-btn");
const searchBtn = document.querySelector("#search-btn");
const examplesEl = document.querySelector("#examples");
const answerEl = document.querySelector("#answer");
const docsEl = document.querySelector("#docs");
const legend = document.querySelector("#legend");
const statusEl = document.querySelector("#status");

let embedded = false;
let revealed = false;
let mode = null;
let exampleId = null;
let docId = null;
let urgentFirst = false;
let drag = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function queryVector() {
  const vector = SEARCH.vector.slice();
  if (urgentFirst) vector[1] = 1.0;
  return vector;
}

function findDoc(id) {
  return DOCS.find((doc) => doc.id === id);
}

function requireEmbedded() {
  if (embedded) return true;
  statusEl.textContent = "Drop the panel into the slot first.";
  slot.classList.remove("need");
  void slot.offsetWidth;
  slot.classList.add("need");
  dropBtn.focus();
  return false;
}

function embed() {
  clearDragStyles();
  slot.appendChild(panel);
  slot.dataset.empty = "false";
  slotHint.hidden = true;
  embedded = true;
  statusEl.textContent = "";
  render();
}

function lift() {
  clearDragStyles();
  tray.appendChild(panel);
  slot.dataset.empty = "true";
  slotHint.hidden = false;
  embedded = false;
  revealed = false;
  mode = null;
  exampleId = null;
  docId = null;
  urgentFirst = false;
  statusEl.textContent = "";
  render();
}

function askExample(example) {
  if (!requireEmbedded()) return;
  revealed = true;
  mode = "ask";
  exampleId = example.id;
  docId = example.docId;
  urgentFirst = false;
  statusEl.textContent = "";
  render();
}

function askDoc(id) {
  if (!requireEmbedded()) return;
  revealed = true;
  mode = "doc";
  exampleId = null;
  docId = id;
  urgentFirst = false;
  statusEl.textContent = "";
  render();
}

function askSearch() {
  if (!requireEmbedded()) return;
  revealed = true;
  mode = "search";
  exampleId = null;
  docId = null;
  statusEl.textContent = "";
  render();
}

function vectorList(values, hotIndex) {
  const list = el("ul", "vector");
  QUESTIONS.forEach((question, index) => {
    const item = el("li", hotIndex === index ? "hot" : "");
    item.append(
      el("span", "q tone " + question.tone, question.label),
      el("b", null, values[index].toFixed(1)),
    );
    const track = el("span", "track");
    const bar = el("i", "bar");
    bar.style.transform = "scaleX(" + values[index] + ")";
    track.append(bar);
    item.append(track);
    list.append(item);
  });
  return list;
}

function renderAnswer() {
  answerEl.replaceChildren();
  if (!embedded || !mode) return;

  if (mode === "ask") {
    const example = EXAMPLES.find((item) => item.id === exampleId);
    const doc = findDoc(example.docId);
    answerEl.append(el("h3", null, example.ask));
    const big = el("p", "big");
    big.append(
      el("b", null, doc.vector[example.qIndex].toFixed(1)),
      el("span", "tone " + QUESTIONS[example.qIndex].tone, QUESTIONS[example.qIndex].label),
    );
    answerEl.append(big, el("p", "why", example.say), vectorList(doc.vector, example.qIndex));
    return;
  }

  if (mode === "doc") {
    const doc = findDoc(docId);
    answerEl.append(el("h3", null, "Scores for " + doc.from));
    answerEl.append(vectorList(doc.vector, -1));
    const highs = QUESTIONS.filter((_, index) => doc.vector[index] >= 0.5).map((question) => question.label);
    const say = highs.length
      ? "High on " + highs.join(", ") + "."
      : "Near zero on every question. This one is a newsletter, not a customer.";
    answerEl.append(el("p", "why", say));
    return;
  }

  const vector = queryVector();
  const ranked = DOCS.map((doc) => ({ doc, score: cosine(doc.vector, vector) }))
    .sort((a, b) => b.score - a.score);
  answerEl.append(el("h3", null, SEARCH.label));
  answerEl.append(vectorList(vector, urgentFirst ? 1 : -1));
  const top = ranked[0];
  answerEl.append(el(
    "p",
    "why",
    top.doc.from + " is closest at " + top.score.toFixed(2) +
      ". The double charge is a customer, about billing, and it needs a reply.",
  ));
  const urgentBtn = el("button", "urgent", urgentFirst ? "Urgent first · on" : "Urgent first");
  urgentBtn.type = "button";
  urgentBtn.setAttribute("aria-pressed", urgentFirst ? "true" : "false");
  urgentBtn.addEventListener("click", () => {
    urgentFirst = !urgentFirst;
    render();
    const next = answerEl.querySelector(".urgent");
    if (next) next.focus();
  });
  answerEl.append(urgentBtn);
}

function renderDocs() {
  const vector = queryVector();
  const scores = DOCS.map((doc) => ({
    id: doc.id,
    score: cosine(doc.vector, vector),
  }));
  const best = scores.slice().sort((a, b) => b.score - a.score)[0].id;

  docsEl.replaceChildren();
  DOCS.forEach((doc) => {
    const item = el("li");
    const button = el("button", "doc");
    button.type = "button";
    button.dataset.id = doc.id;
    if (mode !== "search" && doc.id === docId) button.classList.add("is-selected");
    if (mode === "search" && doc.id === best) button.classList.add("is-top");

    const top = el("div", "doc-top");
    top.append(el("span", "kind", doc.kind), el("span", "from", doc.from));
    if (mode === "search") {
      const score = scores.find((entry) => entry.id === doc.id).score;
      top.append(el("span", "match", score.toFixed(2)));
    }
    button.append(top, el("p", "doc-text", doc.text));

    if (revealed) {
      const row = el("div", "doc-scores");
      const hot = mode === "ask" && doc.id === docId
        ? EXAMPLES.find((example) => example.id === exampleId).qIndex
        : -1;
      doc.vector.forEach((value, index) => {
        const num = el("span", "num " + QUESTIONS[index].tone, value.toFixed(1));
        if (index === hot) num.classList.add("hot");
        row.append(num);
      });
      button.append(row);
    }

    button.addEventListener("click", () => askDoc(doc.id));
    item.append(button);
    docsEl.append(item);
  });

  legend.hidden = !revealed;
}

function renderChrome() {
  badge.textContent = embedded ? "embedded" : "loose";
  badge.classList.toggle("on", embedded);
  dropBtn.textContent = embedded ? "Lift out" : "Drop into slot";
  dropBtn.classList.toggle("is-quiet", embedded);
  trayLabel.textContent = embedded
    ? "Embedded in the slot."
    : "Loose panel. Not on the page yet.";
  searchBtn.setAttribute("aria-pressed", mode === "search" ? "true" : "false");
  examplesEl.querySelectorAll(".example").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.id === exampleId ? "true" : "false");
  });
}

function render() {
  renderChrome();
  renderDocs();
  renderAnswer();
}

function clearDragStyles() {
  panel.classList.remove("dragging");
  panel.style.position = "";
  panel.style.left = "";
  panel.style.top = "";
  panel.style.width = "";
  panel.style.zIndex = "";
  const placeholder = document.querySelector(".panel-placeholder");
  if (placeholder) placeholder.remove();
  drag = null;
}

function overSlot(x, y) {
  const rect = slot.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

EXAMPLES.forEach((example) => {
  const button = el("button", "example", example.ask);
  button.type = "button";
  button.dataset.id = example.id;
  button.addEventListener("click", () => askExample(example));
  examplesEl.append(button);
});

dropBtn.addEventListener("click", () => {
  if (embedded) lift();
  else embed();
});

searchBtn.addEventListener("click", askSearch);

grip.addEventListener("pointerdown", (event) => {
  if (embedded || event.button !== 0) return;
  event.preventDefault();
  const rect = panel.getBoundingClientRect();
  const placeholder = el("div", "panel-placeholder");
  placeholder.style.height = rect.height + "px";
  panel.after(placeholder);
  panel.style.width = rect.width + "px";
  panel.style.position = "fixed";
  panel.style.left = rect.left + "px";
  panel.style.top = rect.top + "px";
  panel.style.zIndex = "5";
  panel.classList.add("dragging");
  drag = {
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top,
  };
  grip.setPointerCapture(event.pointerId);
});

grip.addEventListener("pointermove", (event) => {
  if (!drag) return;
  panel.style.left = event.clientX - drag.dx + "px";
  panel.style.top = event.clientY - drag.dy + "px";
  slot.classList.toggle("over", overSlot(event.clientX, event.clientY));
});

grip.addEventListener("pointerup", (event) => {
  if (!drag) return;
  const shouldEmbed = overSlot(event.clientX, event.clientY);
  slot.classList.remove("over");
  clearDragStyles();
  if (shouldEmbed) embed();
});

grip.addEventListener("pointercancel", () => {
  slot.classList.remove("over");
  clearDragStyles();
});

render();
