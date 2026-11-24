const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const weave = require('./weave.js');

test('tokens stay inside 0 to 127 and the same id always rebuilds the same tapestry', function () {
  assert.equal(weave.clampToken(-4), 0);
  assert.equal(weave.clampToken(200), 127);
  assert.equal(weave.clampToken(3.2), 3);
  assert.equal(weave.clampToken('nope'), 0);
  const seeds = new Set();
  for (let id = 0; id < 128; id += 1) {
    const a = weave.design(id);
    const b = weave.design(id);
    assert.equal(a.id, id);
    assert.deepEqual(a, b);
    assert.equal(a.bands.length >= 16, true);
    assert.equal(a.warpCount % 2, 0);
    seeds.add(a.seed);
    a.bands.forEach(function (band, i) {
      assert.equal(band.color[0], '#');
      if (i > 0) assert.notEqual(band.color, a.bands[i - 1].color);
    });
  }
  assert.equal(seeds.size, 128);
  assert.notDeepEqual(weave.design(0).bands.map(function (band) { return band.y; }), weave.design(1).bands.map(function (band) { return band.y; }));
});

test('wear starts at mint, rises with each transfer, and the step jumps after a hidden threshold', function () {
  let stillMint = 0;
  let wornImmediately = 0;
  for (let id = 0; id < 128; id += 1) {
    const thresholds = weave.thresholdsFor(id);
    assert.ok(thresholds.mint < thresholds.fade);
    assert.ok(thresholds.fade < thresholds.fray);
    assert.ok(thresholds.fray < thresholds.unravel);
    assert.ok(thresholds.unravel < 0.9);
    const zero = weave.conditionAt(id, 0);
    assert.equal(zero.name, 'Mint');
    assert.equal(zero.wear, 0);
    let prev = 0;
    let rising = true;
    for (let n = 1; n <= 12; n += 1) {
      const worn = weave.wearAt(id, n);
      if (!(worn.wear > prev)) rising = false;
      prev = worn.wear;
    }
    assert.equal(rising, true);
    assert.equal(weave.conditionAt(id, 28).name, 'Unravelling');
    if (weave.conditionAt(id, 1).name === 'Mint') stillMint += 1;
    else wornImmediately += 1;
    const early = weave.transferDelta(id, 4, 0, thresholds);
    const late = weave.transferDelta(id, 4, thresholds.unravel, thresholds);
    assert.ok(late > early);
    assert.equal(weave.transferDelta(id, 4, 0, thresholds), early);
  }
  assert.ok(stillMint > 0);
  assert.ok(wornImmediately > 0);
});

test('the ledger is a chain of fake 20-byte addresses and the preview rows sit past the real holder', function () {
  const seen = new Set();
  for (let i = 0; i <= 8; i += 1) {
    const address = weave.addressFor(12, i);
    assert.match(address, /^0x[0-9a-f]{40}$/);
    seen.add(address);
    assert.equal(weave.addressFor(12, i), address);
  }
  assert.equal(seen.size, 9);
  assert.notEqual(weave.addressFor(12, 1), weave.addressFor(13, 1));
  assert.equal(weave.shortAddress(weave.addressFor(1, 0)).includes('…'), true);
  const rows = weave.ledger(4, 3, 1);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].kind, 'Minted');
  assert.equal(rows[0].preview, false);
  assert.equal(rows[1].current, true);
  assert.equal(rows[2].preview, true);
  assert.equal(rows[2].kind, 'Transfer 2');
  assert.equal(weave.conditionAt(4, 3).copy.length > 0, true);
});

test('the index, the readme, and the page name Anna Lucia', function () {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.match(html, /Anna Lucia/);
  assert.match(html, /https:\/\/catalogue\.gallery\/stories\/anna-lucia-unravel-art-blocks\//);
  assert.match(index, /href="unravel-demo\/"/);
  assert.match(index, /Seventy-three/);
  assert.match(readme, /\[Unravel\]\(unravel-demo\/\)/);
  assert.match(readme, /Seventy-three static tools/);
});
