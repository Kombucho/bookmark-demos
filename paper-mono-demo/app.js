(function () {
  const PRESETS = {
    code: [
      "function ship(score, limit) {",
      "  if (score <= limit && mode !== \"off\") {",
      "    return ready => ready |> ship;",
      "  }",
      "  const next = root::child->leaf;",
      "  return next === path || next !== other;",
      "}",
    ].join("\n"),
    prose: "The warm mellow æther of the œuvre met a mellow wave. Maw of the meadow, where women weave the ægis of a wide œuvre. A mellow warmth moved the meadow.",
    specimen: [
      "┌──────────────────────┐",
      "│  ← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ │",
      "│  ⌘ ⌥ ⇧ ⌃ ⌫ ⏎ ⎋ ⇥    │",
      "│  ┌──┬──┐             │",
      "│  │  │  │             │",
      "│  ├──┼──┤             │",
      "│  │  │  │             │",
      "│  └──┴──┘             │",
      "└──────────────────────┘",
    ].join("\n"),
  };

  const editor = document.getElementById("editor");
  const weight = document.getElementById("weight");
  const weightOut = document.getElementById("weight-out");
  const proof = document.getElementById("proof");
  const probe = document.getElementById("probe");
  const on = {
    ss01: false,
    ss02: false,
    ss03: false,
    ss04: false,
    cv01: false,
    zero: false,
    frac: false,
  };

  editor.value = PRESETS.code;

  function featureList() {
    const tags = ["ss01", "ss02", "ss03", "ss04", "cv01", "zero", "frac", "sups", "subs", "calt", "liga"];
    return tags.map(function (tag) {
      return '"' + tag + '" ' + (on[tag] ? 1 : 0);
    }).join(", ");
  }

  function applyEditor() {
    const wght = String(weight.value);
    document.documentElement.style.setProperty("--wght", wght);
    document.documentElement.style.setProperty("--feat", featureList());
    weightOut.textContent = wght;
    weight.setAttribute("aria-valuenow", wght);
    weight.setAttribute("aria-valuetext", wght);
  }

  function measure(text, features, wght, size) {
    probe.style.fontSize = (size || 40) + "px";
    probe.style.fontWeight = wght;
    probe.style.fontVariationSettings = '"wght" ' + wght;
    probe.style.fontFeatureSettings = features;
    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  }

  function px(n) {
    return (Math.round(n * 10) / 10).toFixed(1) + "px";
  }

  function syncColumns() {
    const text = PRESETS.prose;
    document.getElementById("mono-col").textContent = text;
    document.getElementById("duo-col").textContent = text;
  }

  function report() {
    const wght = weight.value;
    const off = '"ss02" 0, "ss03" 0, "frac" 0, "calt" 0, "liga" 0';
    const duo = '"ss02" 1, "calt" 0, "liga" 0';
    const narrow = '"ss03" 1, "calt" 0, "liga" 0';
    const frac = '"frac" 1, "calt" 0, "liga" 0';
    const cell = measure("0", off, wght, 18);
    document.documentElement.style.setProperty("--cell", cell + "px");
    const mammaOff = measure("MAMMA", off, wght);
    const mammaOn = measure("MAMMA", duo, wght);
    const iiii = measure("IIII", off, wght);
    const spaceOff = measure("a a a a a", off, wght);
    const spaceOn = measure("a a a a a", narrow, wght);
    const halfOff = measure("1/2", off, wght);
    const halfOn = measure("1/2", frac, wght);
    const loaded = document.fonts.check("16px 'Paper Mono'");
    const duoChanged = Math.abs(mammaOn - mammaOff) > 0.5;
    const spaceChanged = spaceOn < spaceOff - 0.5;
    const fracChanged = halfOn < halfOff - 0.5;

    document.getElementById("mono-width").textContent = "MAMMA " + px(mammaOff);
    document.getElementById("duo-width").textContent = "MAMMA " + px(mammaOn);
    document.getElementById("cell-meters").textContent =
      "IIII " + px(iiii) + " in both, one step per letter. MAMMA is " + px(mammaOff) +
      " in strict mono and " + px(mammaOn) + " in duospace.";
    document.getElementById("space-meter").textContent =
      "“a a a a a” is " + px(spaceOff) + " with a normal space and " + px(spaceOn) + " with ss03.";
    document.getElementById("frac-meter").textContent =
      "“1/2” is " + px(halfOff) + " as three characters and " + px(halfOn) + " as the fraction.";

    if (!loaded || !duoChanged) {
      proof.textContent = "The vendored Paper Mono face did not change the duospace width.";
      return;
    }
    const bits = ["Paper Mono is shaping this page."];
    if (duoChanged) bits.push("Duospace widens MAMMA.");
    if (spaceChanged) bits.push("The narrow space is shorter.");
    if (fracChanged) bits.push("1/2 collapses to one fraction.");
    proof.textContent = bits.join(" ");
  }

  document.querySelectorAll("button[data-feat]").forEach(function (button) {
    button.addEventListener("click", function () {
      const feat = button.dataset.feat;
      on[feat] = !on[feat];
      button.setAttribute("aria-pressed", on[feat] ? "true" : "false");
      applyEditor();
    });
  });

  document.querySelectorAll("[data-preset]").forEach(function (button) {
    button.addEventListener("click", function () {
      editor.value = PRESETS[button.dataset.preset];
      syncColumns();
      document.querySelectorAll("[data-preset]").forEach(function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
    });
  });
  document.querySelector('[data-preset="code"]').setAttribute("aria-pressed", "true");

  weight.addEventListener("input", function () {
    applyEditor();
    report();
  });

  applyEditor();
  syncColumns();

  function boot() {
    report();
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.load("400 40px 'Paper Mono'").then(function () {
      return document.fonts.ready;
    }).then(boot).catch(boot);
  } else {
    boot();
  }
})();
