// SVG instrument faces, plus the draw-range and divider maths.
// The paths live in this file and are written into the page.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CeramicKit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IVORY = '#f4efe6';
  const FACE = '#f7f3ea';
  const BEZEL = '#d7c3ab';
  const TICK = '#3e332c';
  const OXIDE = '#7c4034';
  const CELADON = '#3f6d62';
  const HUB = '#fbf7f1';

  function n(v) {
    return (Math.round(v * 100) / 100).toString();
  }

  function circlePath(cx, cy, r, sweep) {
    const s = sweep ? 1 : 0;
    return 'M ' + n(cx) + ' ' + n(cy - r)
      + ' A ' + n(r) + ' ' + n(r) + ' 0 1 ' + s + ' ' + n(cx) + ' ' + n(cy + r)
      + ' A ' + n(r) + ' ' + n(r) + ' 0 1 ' + s + ' ' + n(cx) + ' ' + n(cy - r)
      + ' Z';
  }

  function donut(cx, cy, outer, inner) {
    return circlePath(cx, cy, outer, 1) + ' ' + circlePath(cx, cy, inner, 0);
  }

  function roundRect(x, y, w, h, r) {
    return 'M ' + n(x + r) + ' ' + n(y)
      + ' H ' + n(x + w - r)
      + ' A ' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x + w) + ' ' + n(y + r)
      + ' V ' + n(y + h - r)
      + ' A ' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x + w - r) + ' ' + n(y + h)
      + ' H ' + n(x + r)
      + ' A ' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x) + ' ' + n(y + h - r)
      + ' V ' + n(y + r)
      + ' A ' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x + r) + ' ' + n(y)
      + ' Z';
  }

  function polar(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function tickPath(cx, cy, deg, r0, r1, width) {
    const a = (deg - 90) * Math.PI / 180;
    const px = Math.cos(a);
    const py = Math.sin(a);
    const nx = -py;
    const ny = px;
    const hw = width / 2;
    function p(radius, side) {
      return [cx + px * radius + nx * side, cy + py * radius + ny * side];
    }
    const q1 = p(r0, hw);
    const q2 = p(r1, hw);
    const q3 = p(r1, -hw);
    const q4 = p(r0, -hw);
    return 'M ' + n(q1[0]) + ' ' + n(q1[1])
      + ' L ' + n(q2[0]) + ' ' + n(q2[1])
      + ' L ' + n(q3[0]) + ' ' + n(q3[1])
      + ' L ' + n(q4[0]) + ' ' + n(q4[1]) + ' Z';
  }

  function needlePath(cx, cy, deg, length, base, halfW) {
    const tip = polar(cx, cy, length, deg);
    const a = (deg - 90) * Math.PI / 180;
    const px = Math.cos(a);
    const py = Math.sin(a);
    const nx = -py;
    const ny = px;
    const lx = cx + px * base + nx * halfW;
    const ly = cy + py * base + ny * halfW;
    const rx = cx + px * base - nx * halfW;
    const ry = cy + py * base - ny * halfW;
    return 'M ' + n(tip[0]) + ' ' + n(tip[1]) + ' L ' + n(lx) + ' ' + n(ly) + ' L ' + n(rx) + ' ' + n(ry) + ' Z';
  }

  function pathTag(d, fill, proud, rule) {
    const ruleAttr = rule ? ' fill-rule="' + rule + '"' : '';
    return '<path fill="' + fill + '" data-proud="' + proud + '"' + ruleAttr + ' d="' + d + '"/>';
  }

  function svgDoc(id, name, viewBox, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" id="svg-' + id + '" data-name="' + name + '" role="img" aria-label="' + name + '" viewBox="' + viewBox + '">' + body + '</svg>';
  }

  function dialSvg() {
    const cx = 100;
    const cy = 100;
    let body = pathTag(donut(cx, cy, 94, 76), BEZEL, 'body', 'evenodd');
    body += pathTag(circlePath(cx, cy, 72, 1), FACE, 'face');
    for (let i = 0; i < 12; i += 1) {
      const major = i % 3 === 0;
      body += pathTag(tickPath(cx, cy, i * 30, major ? 46 : 54, major ? 68 : 64, major ? 3.4 : 2), TICK, 'mark');
    }
    body += pathTag(needlePath(cx, cy, 0, 52, 8, 5.5), OXIDE, 'needle');
    body += pathTag(circlePath(cx, cy, 7, 1), HUB, 'needle');
    return svgDoc('dial', 'Dial', '0 0 200 200', body);
  }

  function gaugeSvg() {
    const cx = 120;
    const cy = 112;
    let body = pathTag(roundRect(12, 28, 216, 150, 22), BEZEL, 'body');
    body += pathTag(circlePath(cx, cy, 74, 1), FACE, 'face');
    body += pathTag(donut(cx, cy, 68, 50), IVORY, 'face', 'evenodd');
    for (let i = 0; i <= 10; i += 1) {
      const deg = -110 + (220 * i / 10);
      const major = i % 5 === 0;
      body += pathTag(tickPath(cx, cy, deg, major ? 40 : 48, major ? 64 : 60, major ? 3.2 : 1.8), TICK, 'mark');
    }
    body += pathTag(needlePath(cx, cy, -36, 46, 10, 4.5), CELADON, 'needle');
    body += pathTag(circlePath(cx, cy, 8, 1), HUB, 'needle');
    return svgDoc('gauge', 'Gauge', '0 0 240 200', body);
  }

  function rulerSvg() {
    let body = pathTag(roundRect(8, 14, 324, 58, 12), FACE, 'body');
    for (let i = 0; i <= 18; i += 1) {
      const x = 28 + i * 16;
      const major = i % 3 === 0;
      const y0 = 22;
      const y1 = major ? 48 : 36;
      const w = major ? 2.4 : 1.4;
      const d = 'M ' + n(x - w / 2) + ' ' + n(y0) + ' H ' + n(x + w / 2) + ' V ' + n(y1) + ' H ' + n(x - w / 2) + ' Z';
      body += pathTag(d, TICK, 'mark');
    }
    body += pathTag(roundRect(148, 24, 40, 38, 6), IVORY, 'face');
    body += pathTag('M 166.2 20 H 169.8 V 62 H 166.2 Z', OXIDE, 'needle');
    return svgDoc('ruler', 'Ruler', '0 0 340 86', body);
  }

  function knobSvg() {
    const cx = 90;
    const cy = 90;
    let body = pathTag(donut(cx, cy, 82, 62), BEZEL, 'body', 'evenodd');
    body += pathTag(circlePath(cx, cy, 58, 1), FACE, 'face');
    body += pathTag(tickPath(cx, cy, 0, 64, 78, 4), TICK, 'mark');
    body += pathTag(needlePath(cx, cy, 18, 40, 12, 5), OXIDE, 'needle');
    body += pathTag(circlePath(cx, cy, 8, 1), HUB, 'needle');
    return svgDoc('knob', 'Knob', '0 0 180 180', body);
  }

  const instruments = [
    { id: 'dial', name: 'Dial', svg: dialSvg() },
    { id: 'gauge', name: 'Gauge', svg: gaugeSvg() },
    { id: 'ruler', name: 'Ruler', svg: rulerSvg() },
    { id: 'knob', name: 'Knob', svg: knobSvg() },
  ];

  function drawCount(elapsedMs, durationMs, total) {
    if (!Number.isFinite(total) || total <= 0) return 0;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return total;
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
    const t = Math.min(1, elapsedMs / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    return Math.max(0, Math.min(total, Math.round(eased * total)));
  }

  function splitRatio(clientX, left, width) {
    if (!(width > 0)) return 0.5;
    const raw = (clientX - left) / width;
    if (raw < 0.08) return 0.08;
    if (raw > 0.92) return 0.92;
    return raw;
  }

  function layout(count, selected) {
    const spots = [];
    for (let i = 0; i < count; i += 1) {
      let d = i - selected;
      const half = count / 2;
      if (d > half) d -= count;
      if (d < -half) d += count;
      const a = d * 0.78;
      spots.push({
        x: Math.sin(a) * 1.85,
        z: -(1 - Math.cos(a)) * 0.55,
        scale: Math.abs(d) < 0.5 ? 1 : 0.56,
        ry: -a * 0.45,
      });
    }
    return spots;
  }

  return {
    instruments: instruments,
    drawCount: drawCount,
    splitRatio: splitRatio,
    layout: layout,
  };
});
