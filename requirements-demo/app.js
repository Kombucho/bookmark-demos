(function () {
  var FILLER = /\b(basically|honestly|literally|kinda|kind of|tbh|um+|uh+|just|really|ok so|okay so|anyway)\b/gi;

  var OUT_RE = /\b(out of scope|won't|wont|will not|don't|dont|do not|not building|not doing|we're not|we are not|we aren't|we arent|aren't|arent|later|can wait|hold off|next quarter|no need|skip|never|not a|not an|not the)\b/i;

  var SUCCESS_RE = /(\d+\s*%|\bpercent\b|\bsuccess\b|\bgoal\b|\bkpi\b|\btarget\b|\bfewer\b|\bfaster\b|\bunder\b|\bwithin\b|\bat least\b|\bsame day\b|\breduce\b|\bincrease\b)/i;

  var ROLE_WORDS = toSet("user users customer customers client clients admin admins manager managers team teams buyer buyers people person staff folks parent parents teacher teachers student students kid kids employee employees");

  var STOP_WORDS = toSet("a an the our their my your its we i they them he she you some all any each every mostly other another this that these those and or but if so because when while than then for of to in on with from into by at as not no nor just really basically honestly literally kinda kind ok okay um uh tbh anyway who what which is are was were be been being has have had do does did doing can could will would should keep keeps kept lose loses losing get gets got want wants wanted need needs hate hates make makes making take takes taking send sends wait waits email emails build building ship shipping reset resetting complain complains use uses using try tries see sees go goes work works let lets help helps ask asks call calls give gives feel feels know knows come comes");

  var SAMPLES = [
    "ok so basically our sales team keeps losing deals because the quote tool is a nightmare. they copy numbers into a spreadsheet and then slack the finance person and wait. customers, mostly mid-market ops managers, get annoyed when a quote takes 2 days. we need a quote back in under an hour. success looks like 80% of quotes sent the same day and fewer where's-my-quote tickets. also we are NOT building a full CRM. we won't do multi-currency. later maybe mobile. the design system refresh can wait.",
    "parents hate resetting a password for their kid every sunday. the kid is locked out of reading practice and emails us. teachers want the class moving again in under 5 minutes. success is cutting password tickets by 50%. we are not building a parent social network. chat can wait."
  ];

  function toSet(words) {
    var set = {};
    words.split(/\s+/).forEach(function (word) { set[word] = true; });
    return set;
  }

  function tidy(sentence) {
    var text = sentence.replace(FILLER, " ");
    text = text.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
    text = text.replace(/^[,;:\-–—\s]+/, "").replace(/[,;:\s]+$/, "").trim();
    if (!text) return "";
    var letters = text.replace(/[^A-Za-z]+/g, "");
    if (letters && letters === letters.toUpperCase()) text = text.toLowerCase();
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (!/[.!?]$/.test(text)) text += ".";
    return text;
  }

  function asScope(sentence) {
    var text = sentence.replace(FILLER, " ").replace(/[.!?]+$/g, "").trim();
    text = text.replace(/^(?:and|also|plus|oh and)[, ]+/i, "");
    var removedHedge = false;
    var guard = 0;
    var previous;
    do {
      previous = text;
      var before = text;
      text = text.replace(/^(?:we|i)\s+(?:are|am|'re|'m)\s+(?:not|n't)\s+/i, "");
      text = text.replace(/^(?:we|i)\s+(?:aren't|arent|ain't)\s+/i, "");
      text = text.replace(/^(?:we|i)\s+(?:won't|wont|will not|don't|dont|do not|never)\s+/i, "");
      text = text.replace(/^(?:won't|wont|will not|don't|dont|do not|not|never|skip)\s+/i, "");
      text = text.replace(/^(?:later|maybe|perhaps|eventually)[, ]*/i, "");
      text = text.replace(/\b(?:can wait|hold off|out of scope|for later|next quarter)\b/ig, " ");
      if (text !== before) removedHedge = true;
      if (removedHedge) {
        text = text.replace(/^(?:building|doing|do|build|include|support|ship|shipping|making|be)\s+/i, "");
      }
      text = text.replace(/^[,:\-–—\s]+/, "").replace(/[,:\-–—\s]+$/, "").replace(/\s+/g, " ").trim();
      guard += 1;
    } while (text !== previous && guard < 6);
    return tidy(text) || tidy(sentence);
  }

  function titleCase(value) {
    return value.replace(/(^|[\s-])([a-z])/g, function (_, sep, ch) {
      return sep + ch.toUpperCase();
    });
  }

  function rolesIn(piece) {
    var words = piece.split(/[^A-Za-z0-9-]+/).filter(Boolean);
    var found = [];
    words.forEach(function (word, index) {
      if (!ROLE_WORDS[word.toLowerCase()]) return;
      var next = words[index + 1];
      if (next && !STOP_WORDS[next.toLowerCase()]) return;
      var parts = [word.toLowerCase()];
      var back = index - 1;
      while (back >= 0 && parts.length < 4 && !STOP_WORDS[words[back].toLowerCase()]) {
        parts.unshift(words[back].toLowerCase());
        back -= 1;
      }
      found.push(titleCase(parts.join(" ")));
    });
    return found;
  }

  function piecesOf(raw) {
    var lines = raw.replace(/\r/g, "").split(/\n+/);
    var pieces = [];
    lines.forEach(function (line) {
      line.split(/(?<=[.!?])\s+/).forEach(function (sentence) {
        sentence.split(/\s*(?:;|(?:,|\s)\s*but|,)\s+(?=(?:we\s+|i\s+)?(?:are\s+not|aren't|arent|not|don't|dont|do not|won't|wont|will not|later|never|skip)\b)/i).forEach(function (bit) {
          var trimmed = bit.trim();
          if (trimmed) pieces.push(trimmed);
        });
      });
    });
    return pieces;
  }

  function dedupe(items) {
    var seen = {};
    var unique = [];
    items.forEach(function (item) {
      if (!item) return;
      var key = item.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      unique.push(item);
    });
    return unique;
  }

  function makeRequirements(raw) {
    var source = (raw || "").trim();
    if (!source) return null;

    var problem = [];
    var users = [];
    var success = [];
    var out = [];

    piecesOf(source).forEach(function (piece) {
      rolesIn(piece).forEach(function (role) { users.push(role); });

      if (OUT_RE.test(piece)) {
        out.push(asScope(piece));
        return;
      }
      if (SUCCESS_RE.test(piece)) {
        success.push(tidy(piece));
        return;
      }
      var problemLine = tidy(piece);
      if (problemLine) problem.push(problemLine);
    });

    return {
      problem: dedupe(problem),
      users: dedupe(users),
      success: dedupe(success),
      out: dedupe(out)
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { makeRequirements: makeRequirements, samples: SAMPLES };
  }

  if (typeof document === "undefined") return;

  var note = document.getElementById("note");
  var form = document.getElementById("sharpener");
  var status = document.getElementById("status");
  var sampleButton = document.getElementById("sample");
  var clearButton = document.getElementById("clear");
  var copyButton = document.getElementById("copy");
  var result = document.getElementById("result");
  var lists = {
    problem: document.getElementById("problem-list"),
    users: document.getElementById("users-list"),
    success: document.getElementById("success-list"),
    out: document.getElementById("out-list")
  };
  var emptyCopy = {
    problem: "Pain still hiding in the note.",
    users: "No one named yet.",
    success: "No finish line yet.",
    out: "Nothing ruled out."
  };
  var sampleIndex = 0;
  var runId = 0;
  var lastResult = null;

  function fillList(key, items) {
    var list = lists[key];
    var card = list.closest("article");
    list.replaceChildren();
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = emptyCopy[key];
      list.append(empty);
      card.classList.remove("is-filled");
      return;
    }
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    });
    card.classList.add("is-filled");
  }

  function render(made) {
    fillList("problem", made.problem);
    fillList("users", made.users);
    fillList("success", made.success);
    fillList("out", made.out);
    result.classList.add("is-ready");
    copyButton.disabled = false;
    lastResult = made;
  }

  function resetCards() {
    fillList("problem", []);
    fillList("users", []);
    fillList("success", []);
    fillList("out", []);
    result.classList.remove("is-ready");
    copyButton.disabled = true;
    lastResult = null;
  }

  function bit(count, singular, plural) {
    return count + " " + (count === 1 ? singular : plural);
  }

  function summary(made) {
    var total = made.problem.length + made.users.length + made.success.length + made.out.length;
    if (!total) return "Nothing in there looked like a requirement. Name a person, a number, or a no.";
    return "Sharpened into " + bit(made.problem.length, "problem", "problems") + ", " + bit(made.users.length, "user", "users") + ", " + bit(made.success.length, "finish line", "finish lines") + ", and " + bit(made.out.length, "no", "nos") + ".";
  }

  function plainList(made) {
    function block(title, items) {
      if (!items.length) return title + "\n- (none)";
      return title + "\n" + items.map(function (item) { return "- " + item; }).join("\n");
    }
    return [
      block("Problem", made.problem),
      block("Users", made.users),
      block("Success", made.success),
      block("Out of scope", made.out)
    ].join("\n\n");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = note.value;
    var id = ++runId;
    if (!text.trim()) {
      status.textContent = "Paste a note first. Even a rambling one.";
      note.focus();
      return;
    }
    status.textContent = "Crossing out the fluff…";
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(function () {
      if (id !== runId) return;
      var made = makeRequirements(text);
      render(made);
      status.textContent = summary(made);
      if (window.matchMedia("(max-width: 800px)").matches) {
        result.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }
    }, reduce ? 0 : 280);
  });

  note.addEventListener("keydown", function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  sampleButton.addEventListener("click", function () {
    note.value = SAMPLES[sampleIndex % SAMPLES.length];
    sampleIndex += 1;
    form.requestSubmit();
  });

  clearButton.addEventListener("click", function () {
    runId += 1;
    note.value = "";
    resetCards();
    status.textContent = "Blank page. The mess can come back.";
    note.focus();
  });

  copyButton.addEventListener("click", function () {
    if (!lastResult) return;
    var text = plainList(lastResult);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        status.textContent = "Copied the tight list.";
      }).catch(function () {
        status.textContent = "Copy is blocked in this browser. Select the list instead.";
      });
      return;
    }
    status.textContent = "Copy is blocked in this browser. Select the list instead.";
  });

  resetCards();
})();
