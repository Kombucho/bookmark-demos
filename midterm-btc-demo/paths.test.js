const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const paths = require('./paths.js');

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, actual + ' vs ' + expected);
}

test('the three scenarios are the figures in the post', function () {
  assert.deepEqual(paths.SCENARIOS.map(function (item) {
    return [item.year, item.drawdown, item.days, item.illustratedLow, item.yearReturn];
  }), [
    [2014, -0.48, 71, '~$40.5K', 0.24],
    [2018, -0.51, 39, '~$38.4K', 0.45],
    [2022, -0.15, 13, '~$66.3K', 0.92],
  ]);
  assert.equal(paths.IMPLIED_START, 78000);
  assert.equal(paths.YEAR_DAYS, 365);
});

test('each path falls to the stated low, then to the one-year percent, scaled from the start', function () {
  const start = paths.IMPLIED_START;
  paths.SCENARIOS.forEach(function (item) {
    close(paths.pathPrice(item, 0, start), start);
    close(paths.pathPrice(item, item.days, start), start * (1 + item.drawdown));
    close(paths.pathPrice(item, paths.YEAR_DAYS, start), start * (1 + item.yearReturn));
    const mid = Math.floor(item.days / 2);
    const low = start * (1 + item.drawdown);
    close(paths.pathPrice(item, mid, start), start + (low - start) * (mid / item.days));
    const later = item.days + Math.floor((paths.YEAR_DAYS - item.days) / 2);
    const end = start * (1 + item.yearReturn);
    close(paths.pathPrice(item, later, start), low + (end - low) * ((later - item.days) / (paths.YEAR_DAYS - item.days)));
    close(paths.pathPrice(item, item.days, start * 2), paths.pathPrice(item, item.days, start) * 2);
  });
  close(paths.pathPrice(paths.SCENARIOS[2], 13, start), 66300);
});

test('the chart source is an xychart, and a hidden year is left out', function () {
  const all = paths.chartSource(78000, ['2014', '2018', '2022']);
  assert.match(all.source, /xychart-beta/);
  assert.match(all.source, /USD, thousands/);
  assert.match(paths.chartSource(50, ['2014']).source, /y-axis "USD"/);
  assert.match(all.source, /line "2014"/);
  assert.match(all.source, /line "2018"/);
  assert.match(all.source, /line "2022"/);
  assert.equal(all.scenarios.length, 3);
  const hidden = paths.chartSource('78,000', ['2018']);
  assert.match(hidden.source, /line "2018"/);
  assert.doesNotMatch(hidden.source, /line "2014"/);
  assert.doesNotMatch(hidden.source, /line "2022"/);
  assert.equal(paths.chartSource(78000, []), null);
  assert.equal(paths.chartSource(0, ['2014']), null);
  assert.equal(paths.chartSource('$78,000', ['2022']).start, 78000);
});

test('hover names the phase on the stated day', function () {
  const atLow = paths.hover(78000, 71, ['2014', '2018']);
  assert.equal(atLow.day, 71);
  assert.equal(atLow.rows[0].phase, 'low');
  assert.equal(atLow.rows[1].phase, 'after the low');
  assert.equal(atLow.rows.length, 2);
  assert.equal(paths.hover(78000, 400, ['2022']).day, 365);
  assert.equal(paths.formatPercent(-0.48), '−48%');
  assert.equal(paths.formatPercent(0.92), '+92%');
});

test('Pele draws one point per day for each visible year', function () {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'vendor/pele.global.js'), 'utf8'), ctx);
  const spec = paths.chartSource(paths.IMPLIED_START, ['2014', '2018', '2022']);
  const svg = ctx.pele.render(spec.source).svg;
  assert.match(svg, /pele-xychart/);
  const draws = svg.match(/<path d="[^"]+" fill="none" stroke="var\(--pele-series-/g);
  assert.equal(draws.length, 3);
  const first = svg.match(/<path d="([^"]+)" fill="none" stroke="var\(--pele-series-1/);
  const coords = first[1].match(/-?\d+(?:\.\d+)?/g);
  assert.equal(coords.length / 2, paths.YEAR_DAYS + 1);
  const license = fs.readFileSync(path.join(__dirname, 'vendor/PELE-LICENSE.txt'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 kepano/);
});
