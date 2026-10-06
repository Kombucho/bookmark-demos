const assert = require("node:assert/strict");
const test = require("node:test");
const { presets, buildTheme, exportText, hueName } = require("./theme.js");

function luminance(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("presets produce different, valid token sets", function () {
  const themes = presets.map(function (preset) { return buildTheme(preset); });
  const papers = new Set(themes.map(function (theme) { return theme.tokens["--color-paper"]; }));
  assert.ok(papers.size >= 4);
  themes.forEach(function (theme) {
    Object.keys(theme.tokens).forEach(function (key) {
      const value = theme.tokens[key];
      assert.equal(typeof value, "string");
      assert.ok(value.length > 0);
    });
    assert.match(theme.tokens["--color-paper"], /^#[0-9a-f]{6}$/);
    assert.match(theme.tokens["--color-accent"], /^#[0-9a-f]{6}$/);
    assert.match(theme.css, /--color-paper:/);
    assert.match(theme.css, /--radius-control:/);
    assert.match(theme.brief, /Design brief/);
    assert.match(theme.brief, new RegExp(hueName(theme.state.hue), "i"));
  });

  const newsroom = buildTheme(presets.find(function (preset) { return preset.id === "newsroom"; }));
  const signal = buildTheme(presets.find(function (preset) { return preset.id === "signal"; }));
  const glass = buildTheme(presets.find(function (preset) { return preset.id === "glasshouse"; }));
  const ticket = buildTheme(presets.find(function (preset) { return preset.id === "ticket"; }));
  assert.ok(luminance(signal.tokens["--color-paper"]) < luminance(newsroom.tokens["--color-paper"]));
  assert.equal(glass.tokens["--radius-control"], "999px");
  assert.equal(ticket.tokens["--radius-control"], "0.0px");
  assert.equal(ticket.tokens["--shadow-surface"], "none");
  assert.match(newsroom.tokens["--font-body"], /Georgia/);
  assert.match(signal.tokens["--font-mono"], /monospace/);
  assert.equal(signal.tokens["--transform-display"], "none");
  assert.equal(ticket.tokens["--transform-display"], "uppercase");
  assert.match(newsroom.brief, /Newsroom preset/);
  assert.match(exportText(signal), /--color-accent:/);
  assert.match(exportText(signal), /Design brief/);
});

test("moving one control leaves the theme valid and drops the preset match", function () {
  const signal = presets.find(function (preset) { return preset.id === "signal"; });
  const tuned = buildTheme(Object.assign({}, signal, { roundness: 40 }));
  assert.match(tuned.brief, /hand-tuned/);
  assert.notEqual(tuned.tokens["--radius-control"], "999px");
  assert.match(tuned.tokens["--radius-control"], /px$/);
});
