const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const A = require("./alchemy.js");

test("sha256 matches node", function () {
  const hash = Buffer.from(A.sha256("abc")).toString("hex");
  assert.equal(hash, crypto.createHash("sha256").update("abc").digest("hex"));
});

test("sunrise in Prague matches the almanac", function () {
  const times = A.sunTimes(2026, 10, 8, 50.0875, 14.4213, "Europe/Prague");
  assert.ok(Math.abs(times.rise.getTime() - Date.parse("2026-10-08T05:12:26.954Z")) < 1500);
  assert.ok(Math.abs(times.set.getTime() - Date.parse("2026-10-08T16:26:33.443Z")) < 1500);
  assert.equal(times.approximate, false);
});

test("planetary hours follow the weekday ruler", function () {
  const prague = A.PLACES[0];
  const noon = A.zonedWallToUtc(2026, 10, 8, 12, 0, prague.tz);
  const day = A.planetaryDay(noon, prague);
  assert.equal(day.dayRuler, "Jupiter");
  assert.equal(day.current.index, 5);
  assert.equal(day.current.isDay, true);
  assert.equal(day.current.planet, "Moon");
  assert.equal(day.current.trump, "The High Priestess");
  assert.equal(A.schemeForHour(day.current), "orpiment");
  assert.equal(A.clock(day.sunrise, prague.tz), "07:12");
  assert.equal(A.clock(day.sunset, prague.tz), "18:26");

  const evening = A.zonedWallToUtc(2026, 10, 8, 20, 0, prague.tz);
  const night = A.planetaryDay(evening, prague);
  assert.equal(night.current.index, 13);
  assert.equal(night.current.planet, "Saturn");
  assert.equal(A.schemeForHour(night.current), "umber");

  const before = A.zonedWallToUtc(2026, 10, 8, 5, 0, prague.tz);
  const prior = A.planetaryDay(before, prague);
  assert.equal(prior.dayRuler, "Mercury");
  assert.equal(prior.current.index, 21);
  assert.equal(prior.current.planet, "Mercury");
  assert.equal(prior.current.trump, "The Magician");

  const solstice = A.zonedWallToUtc(2026, 6, 21, 12, 0, prague.tz);
  const midsummer = A.planetaryDay(solstice, prague);
  assert.equal(midsummer.dayRuler, "Sun");
  assert.equal(midsummer.current.planet, "Jupiter");
  assert.equal(midsummer.current.trump, "Wheel of Fortune");
});

test("daylight stages split the twelve day hours", function () {
  assert.equal(A.schemeForHour({ isDay: true, index: 0 }), "vellum");
  assert.equal(A.schemeForHour({ isDay: true, index: 3 }), "vellum");
  assert.equal(A.schemeForHour({ isDay: true, index: 4 }), "orpiment");
  assert.equal(A.schemeForHour({ isDay: true, index: 7 }), "orpiment");
  assert.equal(A.schemeForHour({ isDay: true, index: 8 }), "cinnabar");
  assert.equal(A.schemeForHour({ isDay: true, index: 11 }), "cinnabar");
  assert.equal(A.schemeForHour({ isDay: false, index: 12 }), "umber");
  assert.equal(A.nextScheme("cinnabar"), "umber");
});

test("body text clears 7:1 and accents clear 4.5:1, except the known orpiment sigil", function () {
  A.SCHEME_ORDER.forEach(function (name) {
    const report = A.contrastReport(A.SCHEMES[name]);
    const body = report.find(function (row) { return row.id === "body"; });
    const accent = report.find(function (row) { return row.id === "accent"; });
    const bar = report.find(function (row) { return row.id === "bar"; });
    const sigil = report.find(function (row) { return row.id === "sigil"; });
    assert.ok(body.ratio >= 7, name + " body " + body.ratio);
    assert.ok(accent.ratio >= 4.5, name + " accent " + accent.ratio);
    assert.ok(bar.ratio >= 7, name + " bar " + bar.ratio);
    assert.equal(body.ok, true);
    assert.equal(accent.ok, true);
    if (name === "orpiment") assert.equal(sigil.ok, false);
    else assert.equal(sigil.ok, true);
  });
  const umber = A.contrastReport(A.SCHEMES.umber)[0];
  assert.ok(Math.abs(umber.ratio - 12.93) < 0.02);
});

test("sigil and card of the day are a pure function of the seed", function () {
  const digest = A.digestText("athanor");
  assert.equal(Buffer.from(digest).toString("hex"), "8ca375046088497a85270a40ba18f25d9caf09a0229122fd729b1b59687aa6f8");
  const grid = A.sigilGrid(digest);
  assert.equal(grid.length, 11);
  assert.equal(grid[0].every(Boolean), true);
  assert.equal(grid[2][2], grid[2][8]);
  assert.equal(A.sigilText(grid).split("\n")[2], "██      ██████      ██");
  const draw = A.cardOfDay("2026-10-08", digest);
  assert.equal(draw.card.name, "Nine of Cups");
  assert.equal(draw.reversed, true);
  const again = A.spreadOf("2026-10-08", digest);
  const otherDay = A.spreadOf("2026-10-09", digest);
  assert.equal(again.length, 3);
  assert.deepEqual(again.map(function (card) { return card.card.name; }), A.spreadOf("2026-10-08", digest).map(function (card) { return card.card.name; }));
  assert.notDeepEqual(again.map(function (card) { return card.card.index; }), otherDay.map(function (card) { return card.card.index; }));
  assert.equal(new Set(again.map(function (card) { return card.card.index; })).size, 3);
  assert.deepEqual(again.map(function (card) { return card.position; }), ["past", "present", "future"]);
});

test("floyd-steinberg stays two-tone and keeps a ramp's ends", function () {
  const width = 32;
  const height = 8;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = (i % width) / (width - 1);
  const curved = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) curved[i] = A.sigmoidalContrast(gray[i]);
  const mask = A.floydSteinberg(curved, width, height);
  assert.equal(mask[0], 0);
  assert.equal(mask[width - 1], 1);
  const ones = mask.reduce(function (sum, bit) { return sum + bit; }, 0);
  assert.ok(ones > width && ones < mask.length - width);
  const flat = A.floydSteinberg(new Float32Array(16).fill(0), 4, 4);
  assert.equal(flat.every(function (bit) { return bit === 0; }), true);
});
