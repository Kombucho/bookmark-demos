(function () {
  const Studio = window.ThemeStudio;
  const keys = ["hue", "contrast", "roundness", "density", "type", "shadow", "ground"];
  const state = {};
  const gallery = document.getElementById("gallery");
  const exportText = document.getElementById("export-text");
  const presetNote = document.getElementById("preset-note");
  const presetGrid = document.getElementById("presets");
  const swatches = document.getElementById("swatches");
  const copyStatus = document.getElementById("copy-status");
  const panels = {
    log: "Three notes are waiting on the evening tide.",
    map: "The channel marker drifted west of the old buoy.",
    crew: "Ada has the late watch. Jules is off the water.",
  };

  function readIntoState() {
    keys.forEach(function (key) {
      if (key === "type") state.type = document.getElementById("type").value;
      else if (key === "ground") {
        const selected = document.querySelector('.grounds button[aria-checked="true"]');
        state.ground = selected ? selected.dataset.ground : "day";
      } else state[key] = Number(document.getElementById(key).value);
    });
  }

  function writeControls() {
    keys.forEach(function (key) {
      if (key === "type") document.getElementById("type").value = state.type;
      else if (key !== "ground") document.getElementById(key).value = String(state[key]);
    });
    document.querySelectorAll(".grounds button").forEach(function (button) {
      button.setAttribute("aria-checked", button.dataset.ground === state.ground ? "true" : "false");
    });
    document.getElementById("out-hue").textContent = Math.round(state.hue) + "°";
    document.getElementById("out-contrast").textContent = String(Math.round(state.contrast));
    document.getElementById("out-roundness").textContent = String(Math.round(state.roundness));
    document.getElementById("out-density").textContent = String(Math.round(state.density));
    document.getElementById("out-shadow").textContent = String(Math.round(state.shadow));
  }

  function publish() {
    const theme = Studio.buildTheme(state);
    Object.keys(theme.tokens).forEach(function (key) {
      gallery.style.setProperty(key, theme.tokens[key]);
    });
    gallery.style.colorScheme = state.ground === "day" ? "light" : "dark";
    exportText.textContent = Studio.exportText(theme);
    const match = Studio.matchPreset(state);
    presetNote.textContent = match ? match.name : "Hand-tuned";
    presetGrid.querySelectorAll(".preset").forEach(function (button) {
      button.setAttribute("aria-pressed", match && button.dataset.preset === match.id ? "true" : "false");
    });
    swatches.replaceChildren();
    theme.swatches.forEach(function (swatch) {
      const chip = document.createElement("span");
      chip.style.background = swatch[1];
      chip.title = swatch[0] + " " + swatch[1];
      swatches.append(chip);
    });
  }

  function apply(next) {
    keys.forEach(function (key) { state[key] = next[key]; });
    writeControls();
    publish();
  }

  Studio.presets.forEach(function (preset) {
    const theme = Studio.buildTheme(preset);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.preset = preset.id;
    button.setAttribute("aria-pressed", "false");
    const strip = document.createElement("span");
    strip.className = "preset-swatch";
    theme.swatches.slice(0, 4).forEach(function (swatch) {
      const bit = document.createElement("i");
      bit.style.background = swatch[1];
      strip.append(bit);
    });
    const name = document.createElement("span");
    name.className = "preset-name";
    name.textContent = preset.name;
    const words = document.createElement("span");
    words.className = "preset-words";
    words.textContent = preset.words;
    button.append(strip, name, words);
    button.addEventListener("click", function () { apply(preset); });
    presetGrid.append(button);
  });

  document.querySelectorAll(".dials input, #type").forEach(function (control) {
    function onControl() {
      readIntoState();
      publish();
    }
    control.addEventListener("input", onControl);
    control.addEventListener("change", onControl);
  });

  const grounds = Array.from(document.querySelectorAll(".grounds button"));
  grounds.forEach(function (button, index) {
    button.addEventListener("click", function () {
      grounds.forEach(function (other) { other.setAttribute("aria-checked", "false"); });
      button.setAttribute("aria-checked", "true");
      readIntoState();
      publish();
    });
    button.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = grounds[(index + delta + grounds.length) % grounds.length];
      next.click();
      next.focus();
    });
  });

  const tabs = Array.from(document.querySelectorAll(".g-tabs button"));
  const panel = document.getElementById("g-panel");
  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (other) { other.setAttribute("aria-selected", "false"); });
      tab.setAttribute("aria-selected", "true");
      const key = tab.id.replace("tab-", "");
      panel.textContent = panels[key];
    });
    tab.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      next.click();
      next.focus();
    });
  });

  const noteBody = document.getElementById("g-note-body");
  const noteInput = document.getElementById("g-input");
  const badge = document.getElementById("g-badge");
  const status = document.getElementById("g-status");
  const placeholder = "Write a field note and it stays on the card.";

  noteInput.addEventListener("input", function () {
    noteBody.textContent = noteInput.value.trim() || placeholder;
  });

  function setBadge(label, name) {
    badge.textContent = label;
    badge.dataset.state = name;
  }

  document.getElementById("g-file").addEventListener("click", function () {
    setBadge("Filed", "filed");
    status.textContent = "Filed the note.";
  });
  document.getElementById("g-save").addEventListener("click", function () {
    status.textContent = "Saved the watch.";
  });
  document.getElementById("g-hold").addEventListener("click", function () {
    setBadge("Held", "held");
    status.textContent = "Holding the watch.";
  });
  document.getElementById("g-discard").addEventListener("click", function () {
    noteInput.value = "";
    noteBody.textContent = placeholder;
    setBadge("Open", "open");
    status.textContent = "Discarded the draft.";
  });

  const toggle = document.getElementById("g-toggle");
  const toggleLabel = document.getElementById("g-toggle-label");
  toggle.addEventListener("click", function () {
    const on = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggleLabel.textContent = on ? "Sharing with the crew" : "Share with the crew";
  });

  function selectExport() {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(exportText);
    selection.removeAllRanges();
    selection.addRange(range);
    exportText.focus();
  }

  document.getElementById("copy").addEventListener("click", function () {
    const text = exportText.textContent;
    function copied(message) { copyStatus.textContent = message; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        copied("Copied tokens and brief.");
      }).catch(function () {
        selectExport();
        copied("Clipboard blocked. The export is selected — copy it from there.");
      });
      return;
    }
    selectExport();
    copied("Clipboard blocked. The export is selected — copy it from there.");
  });

  apply(Studio.presets.find(function (preset) { return preset.id === "night-market"; }));
})();
