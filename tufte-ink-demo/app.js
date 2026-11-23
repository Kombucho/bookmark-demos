(function () {
  const api = window.TufteInk;
  const stepsEl = document.querySelector('#steps');
  const togglesEl = document.querySelector('#toggles');
  const ratioEl = document.querySelector('#ratio');
  const readEl = document.querySelector('#read');
  const pixelEl = document.querySelector('#pixel');
  const stepCopy = document.querySelector('#step-copy');
  const stage = document.querySelector('#stage');
  const sparkEl = document.querySelector('#spark');
  const caption = document.querySelector('#caption');
  const segData = document.querySelector('#seg-data');
  const segRedundant = document.querySelector('#seg-redundant');
  const segNondata = document.querySelector('#seg-nondata');
  const headRow = document.querySelector('#head-row');
  const bodyRows = document.querySelector('#body-rows');

  const TOGGLES = [
    ['eraseNonData', 'Erase non-data ink'],
    ['eraseRedundant', 'Erase redundant data ink'],
    ['directLabels', 'Direct labels'],
    ['rangeFrame', 'Range-frame axes'],
    ['thinLines', 'Thin lines, drawn by Pele'],
    ['multiples', 'Small multiples'],
    ['sparkline', 'Sparkline'],
  ];

  let flags = api.flagsForStep('junk');

  api.STEPS.forEach(function (step, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'step';
    button.dataset.step = step.id;
    button.textContent = (index + 1) + '. ' + step.title;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', function () {
      flags = api.flagsForStep(step.id);
      render();
    });
    stepsEl.appendChild(button);
  });

  TOGGLES.forEach(function (pair) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle';
    button.dataset.flag = pair[0];
    button.textContent = pair[1];
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', function () {
      flags[pair[0]] = !flags[pair[0]];
      render();
    });
    togglesEl.appendChild(button);
  });

  fillTable();
  render();

  function fillTable() {
    const week = document.createElement('th');
    week.scope = 'col';
    week.textContent = 'Week';
    headRow.appendChild(week);
    api.SERIES.forEach(function (series) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = series.name;
      headRow.appendChild(th);
    });
    for (let i = 0; i < 12; i++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(i + 1);
      tr.appendChild(th);
      api.SERIES.forEach(function (series) {
        const td = document.createElement('td');
        td.textContent = String(series.values[i]);
        tr.appendChild(td);
      });
      bodyRows.appendChild(tr);
    }
  }

  function render() {
    const scene = api.build(flags);
    const active = api.stepForFlags(flags);
    document.querySelectorAll('button.step').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.step === active ? 'true' : 'false');
    });
    document.querySelectorAll('button.toggle').forEach(function (button) {
      button.setAttribute('aria-pressed', flags[button.dataset.flag] ? 'true' : 'false');
    });
    const step = api.STEPS.find(function (item) { return item.id === active; }) || null;
    stepCopy.textContent = step
      ? step.text
      : 'The toggles are off the stacked order. The meter still counts whatever is on the figure.';

    stage.replaceChildren();
    const painted = paintStage(scene);
    paintSpark(scene);
    const reading = api.measure(api.sceneMarks(scene));
    const pixels = sampleVisible(painted, scene);
    paintMeter(reading, pixels);
    caption.textContent = api.NOTE + ' The meter ignores the cream page.';
  }

  function paintStage(scene) {
    if (scene.pele && window.pele) {
      try {
        const host = document.createElement('div');
        host.className = 'pele-host';
        if (flags.eraseNonData) host.classList.add('is-clean');
        if (flags.rangeFrame) host.classList.add('is-range');
        if (flags.directLabels) host.classList.add('is-named');
        const rendered = window.pele.render(scene.pele);
        const mount = document.createElement('div');
        mount.innerHTML = rendered.svg;
        const svg = mount.querySelector('svg');
        if (!svg) throw new Error('no svg');
        host.appendChild(svg);
        const overlay = overlayFromPele(svg);
        if (overlay) host.appendChild(overlay);
        stage.appendChild(host);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Four lines of example cup counts.');
        return { pele: svg, overlay: overlay, scene: scene };
      } catch (error) {
        stage.appendChild(chartSvg(scene));
        return { chart: stage.querySelector('svg'), scene: scene };
      }
    }
    stage.appendChild(chartSvg(scene));
    return { chart: stage.querySelector('svg'), scene: scene };
  }

  function chartSvg(scene) {
    const svg = svgEl('svg', {
      class: 'chart',
      viewBox: '0 0 ' + scene.width + ' ' + scene.height,
      role: 'img',
      'aria-label': 'Example cup counts, redrawn with the rules that are on.',
    });
    scene.marks.forEach(function (mark) { svg.appendChild(markEl(mark)); });
    return svg;
  }

  function overlayFromPele(svg) {
    const axis = svg.querySelector('.pele-axis');
    const box = axis ? plotBox(axis.getAttribute('d')) : null;
    const paths = svg.querySelectorAll('.pele-series.pele-line path');
    if (!box && !paths.length) return null;
    const overlay = svgEl('svg', {
      class: 'overlay',
      viewBox: svg.getAttribute('viewBox') || '0 0 720 420',
      'aria-hidden': 'true',
    });
    if (flags.rangeFrame && box) {
      const bottom = box.y + box.height;
      const right = box.x + box.width;
      overlay.appendChild(markEl({
        role: 'nondata', kind: 'line', x: box.x, y: box.y, x2: box.x, y2: bottom, sw: 1.25, stroke: '#14213d',
      }));
      overlay.appendChild(markEl({
        role: 'nondata', kind: 'line', x: box.x, y: bottom, x2: right, y2: bottom, sw: 1.25, stroke: '#14213d',
      }));
      const span = api.extent(api.allValues());
      overlay.appendChild(markEl({
        role: 'nondata', kind: 'text', x: box.x - 8, y: box.y + 4, text: String(span.max), size: 13, anchor: 'end', fill: '#5c6570',
      }));
      overlay.appendChild(markEl({
        role: 'nondata', kind: 'text', x: box.x - 8, y: bottom, text: String(span.min), size: 13, anchor: 'end', fill: '#5c6570',
      }));
      overlay.appendChild(markEl({
        role: 'nondata', kind: 'text', x: box.x, y: bottom + 18, text: '1', size: 13, anchor: 'start', fill: '#5c6570',
      }));
      overlay.appendChild(markEl({
        role: 'nondata', kind: 'text', x: right, y: bottom + 18, text: '12', size: 13, anchor: 'end', fill: '#5c6570',
      }));
    }
    if (flags.directLabels) {
      const spots = [];
      api.SERIES.forEach(function (series, index) {
        const path = paths[index];
        if (!path) return;
        const last = lastPoint(path.getAttribute('d'));
        if (!last) return;
        spots.push({ index: index, x: last[0] + 8, y: last[1] + 4, name: series.name });
      });
      spots.sort(function (a, b) { return a.y - b.y; });
      let previous = -1000;
      spots.forEach(function (spot) {
        if (spot.y < previous + 16) spot.y = previous + 16;
        previous = spot.y;
        overlay.appendChild(markEl({
          role: 'data', kind: 'text', x: spot.x, y: spot.y,
          text: spot.name, size: 14, anchor: 'start', fill: api.QUIET[spot.index],
        }));
      });
    }
    return overlay;
  }

  function paintSpark(scene) {
    sparkEl.replaceChildren();
    if (!scene.sparkRuns || !scene.sparkRuns.length) {
      sparkEl.hidden = true;
      return;
    }
    sparkEl.hidden = false;
    scene.sparkRuns.forEach(function (run) {
      if (run.type === 'text') {
        sparkEl.appendChild(document.createTextNode(run.text));
        return;
      }
      const svg = svgEl('svg', {
        viewBox: '0 0 86 32',
        'aria-hidden': 'true',
      });
      const minX = run.points[0][0];
      const minY = 8;
      const shifted = run.points.map(function (point) {
        return [point[0] - minX + 4, point[1] - minY];
      });
      svg.appendChild(markEl({
        role: 'data', kind: 'polyline', points: shifted, sw: 1.4, stroke: run.color, fill: 'none',
      }));
      const end = shifted[shifted.length - 1];
      svg.appendChild(markEl({
        role: 'data', kind: 'line', x: end[0], y: end[1], x2: end[0] + 0.2, y2: end[1], sw: 3.5, stroke: run.color,
      }));
      sparkEl.appendChild(svg);
    });
  }

  function paintMeter(reading, pixels) {
    const pct = reading.ratio * 100;
    ratioEl.textContent = pct.toFixed(1) + '%';
    readEl.textContent = 'Data ' + Math.round(reading.data).toLocaleString('en-US')
      + ' · redundant ' + Math.round(reading.redundant).toLocaleString('en-US')
      + ' · non-data ' + Math.round(reading.nondata).toLocaleString('en-US')
      + '. Stroke length times width, fill area, hatch strokes, and a share of each label.';
    const total = reading.total || 1;
    segData.style.width = (100 * reading.data / total) + '%';
    segRedundant.style.width = (100 * reading.redundant / total) + '%';
    segNondata.style.width = (100 * reading.nondata / total) + '%';
    if (!pixels || !pixels.total) {
      pixelEl.textContent = '';
      return;
    }
    pixelEl.textContent = 'Pixel sample of the same marks: ' + (pixels.ratio * 100).toFixed(1)
      + '% data, ' + pixels.data.toLocaleString('en-US') + ' of ' + pixels.total.toLocaleString('en-US') + ' ink pixels.';
  }

  function sampleVisible(painted, scene) {
    const parts = [];
    if (painted.pele) {
      const extra = pelePixelMarks(painted.pele);
      if (painted.overlay) {
        painted.overlay.querySelectorAll('[data-ink]').forEach(function (node) {
          extra.push(markFromNode(node));
        });
      }
      parts.push(sampleMarks(extra, viewSize(painted.pele)));
    } else if (painted.chart) {
      parts.push(sampleMarks(scene.marks, { width: scene.width, height: scene.height }));
    }
    if (scene.spark && scene.spark.length && scene.sparkSize) {
      parts.push(sampleMarks(scene.spark, scene.sparkSize));
    }
    return parts.reduce(function (sum, part) {
      sum.data += part.data;
      sum.redundant += part.redundant;
      sum.nondata += part.nondata;
      sum.total += part.total;
      sum.ratio = sum.total ? sum.data / sum.total : 0;
      return sum;
    }, { data: 0, redundant: 0, nondata: 0, total: 0, ratio: 0 });
  }

  function pelePixelMarks(svg) {
    const marks = [];
    function take(selector, role, when) {
      if (!when) return;
      svg.querySelectorAll(selector).forEach(function (node) {
        const d = node.getAttribute('d');
        if (!d) return;
        let length = 0;
        try { length = node.getTotalLength(); } catch (error) { length = 0; }
        marks.push({
          role: role,
          kind: 'svgpath',
          d: d,
          length: length,
          sw: Number(node.getAttribute('stroke-width') || 1.25),
        });
      });
    }
    take('.pele-series path', 'data', true);
    take('.pele-grid', 'nondata', !flags.eraseNonData);
    take('.pele-axis', 'nondata', !flags.rangeFrame);
    return marks;
  }

  function viewSize(svg) {
    const box = (svg.getAttribute('viewBox') || '0 0 720 420').split(/[\s,]+/).map(Number);
    return { width: box[2] || 720, height: box[3] || 420 };
  }

  function sampleMarks(marks, size) {
    if (!marks || !marks.length || !size.width || !size.height) {
      return { data: 0, redundant: 0, nondata: 0, total: 0, ratio: 0 };
    }
    const scale = Math.min(1, 520 / size.width);
    const w = Math.max(1, Math.round(size.width * scale));
    const h = Math.max(1, Math.round(size.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { data: 0, redundant: 0, nondata: 0, total: 0, ratio: 0 };
    ctx.scale(scale, scale);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    const color = { data: '#ff0000', redundant: '#00ff00', nondata: '#0000ff' };
    marks.forEach(function (mark) {
      if (!mark) return;
      const ink = color[mark.role] || color.nondata;
      ctx.beginPath();
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = mark.sw || 1;
      if (mark.kind === 'rect') {
        if (mark.fill && mark.fill !== 'none') ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
        else ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
      } else if (mark.kind === 'line') {
        ctx.moveTo(mark.x, mark.y);
        ctx.lineTo(mark.x2, mark.y2);
        ctx.stroke();
      } else if (mark.kind === 'polyline') {
        (mark.points || []).forEach(function (point, index) {
          if (index) ctx.lineTo(point[0], point[1]);
          else ctx.moveTo(point[0], point[1]);
        });
        ctx.stroke();
      } else if (mark.kind === 'polygon') {
        (mark.points || []).forEach(function (point, index) {
          if (index) ctx.lineTo(point[0], point[1]);
          else ctx.moveTo(point[0], point[1]);
        });
        ctx.closePath();
        ctx.fill();
      } else if (mark.kind === 'hatch') {
        (mark.lines || []).forEach(function (line) {
          ctx.moveTo(line[0][0], line[0][1]);
          ctx.lineTo(line[1][0], line[1][1]);
        });
        ctx.stroke();
      } else if (mark.kind === 'text') {
        ctx.font = (mark.size || 12) + 'px Georgia, serif';
        ctx.textAlign = mark.anchor === 'middle' ? 'center' : mark.anchor === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(mark.text || ''), mark.x, mark.y);
      } else if (mark.kind === 'svgpath' && mark.d && typeof Path2D === 'function') {
        ctx.stroke(new Path2D(mark.d));
      }
    });
    const img = ctx.getImageData(0, 0, w, h).data;
    const bins = { data: 0, redundant: 0, nondata: 0 };
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 32) continue;
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      if (r >= g && r >= b) bins.data += 1;
      else if (g >= r && g >= b) bins.redundant += 1;
      else bins.nondata += 1;
    }
    const total = bins.data + bins.redundant + bins.nondata;
    return {
      data: bins.data,
      redundant: bins.redundant,
      nondata: bins.nondata,
      total: total,
      ratio: total ? bins.data / total : 0,
    };
  }

  function markFromNode(node) {
    const role = node.getAttribute('data-ink') || 'nondata';
    const tag = node.localName;
    if (tag === 'line') {
      return {
        role: role, kind: 'line',
        x: Number(node.getAttribute('x1')), y: Number(node.getAttribute('y1')),
        x2: Number(node.getAttribute('x2')), y2: Number(node.getAttribute('y2')),
        sw: Number(node.getAttribute('stroke-width') || 1),
      };
    }
    if (tag === 'text') {
      return {
        role: role, kind: 'text',
        x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')),
        text: node.textContent, size: Number(node.getAttribute('font-size') || 12),
        anchor: node.getAttribute('text-anchor') || 'start',
      };
    }
    return { role: role, kind: 'line', x: 0, y: 0, x2: 0, y2: 0, sw: 0 };
  }

  function plotBox(d) {
    const match = String(d || '').match(/M([\d.]+),([\d.]+)V([\d.]+)M[\d.]+,[\d.]+H([\d.]+)/);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const bottom = Number(match[3]);
    const right = Number(match[4]);
    if (!(right > x) || !(bottom > y)) return null;
    return { x: x, y: y, width: right - x, height: bottom - y };
  }

  function lastPoint(d) {
    const found = String(d || '').match(/[ML]([\d.]+),([\d.]+)/g);
    if (!found || !found.length) return null;
    const last = found[found.length - 1];
    const nums = last.match(/([\d.]+),([\d.]+)/);
    if (!nums) return null;
    return [Number(nums[1]), Number(nums[2])];
  }

  function markEl(mark) {
    if (mark.kind === 'rect') {
      return svgEl('rect', {
        x: mark.x, y: mark.y, width: mark.w, height: mark.h,
        fill: mark.fill || 'none',
        stroke: mark.stroke || 'none',
        'stroke-width': mark.sw || 0,
        'data-ink': mark.role,
      });
    }
    if (mark.kind === 'line') {
      return svgEl('line', {
        x1: mark.x, y1: mark.y, x2: mark.x2, y2: mark.y2,
        stroke: mark.stroke || '#14213d',
        'stroke-width': mark.sw || 1,
        fill: 'none',
        'data-ink': mark.role,
      });
    }
    if (mark.kind === 'polyline') {
      return svgEl('polyline', {
        points: (mark.points || []).map(function (point) { return point[0] + ',' + point[1]; }).join(' '),
        fill: 'none',
        stroke: mark.stroke || '#14213d',
        'stroke-width': mark.sw || 1,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'data-ink': mark.role,
      });
    }
    if (mark.kind === 'polygon') {
      return svgEl('polygon', {
        points: (mark.points || []).map(function (point) { return point[0] + ',' + point[1]; }).join(' '),
        fill: mark.fill || '#888',
        stroke: 'none',
        'data-ink': mark.role,
      });
    }
    if (mark.kind === 'hatch') {
      const d = (mark.lines || []).map(function (line) {
        return 'M' + line[0][0] + ',' + line[0][1] + 'L' + line[1][0] + ',' + line[1][1];
      }).join('');
      return svgEl('path', {
        d: d,
        fill: 'none',
        stroke: mark.stroke || '#8a8175',
        'stroke-width': mark.sw || 1,
        'data-ink': mark.role,
      });
    }
    const text = svgEl('text', {
      x: mark.x, y: mark.y,
      fill: mark.fill || '#14213d',
      'font-size': mark.size || 12,
      'font-family': 'Georgia, Palatino, serif',
      'text-anchor': mark.anchor || 'start',
      'data-ink': mark.role,
    });
    text.textContent = mark.text || '';
    return text;
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach(function (key) {
      if (attrs[key] != null) node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }
})();
