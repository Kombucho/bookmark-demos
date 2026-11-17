// Paints the display list from post.js onto a canvas.
// Two passes hash getImageData with FNV-1a. No request is sent.

(function () {
  const P = window.PostRender;
  const canvas = document.getElementById('post');
  const stats = document.getElementById('stats');
  const summary = document.getElementById('hash-summary');
  const detail = document.getElementById('hash-detail');
  const postText = document.getElementById('post-text');
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');

  const fields = {
    name: document.getElementById('name'),
    handle: document.getElementById('handle'),
    stamp: document.getElementById('stamp'),
    verified: document.getElementById('verified'),
    text: document.getElementById('text'),
    showMore: document.getElementById('show-more'),
  };

  let hashFresh = false;
  let timer = 0;

  function makeMeasurer(scale) {
    const pixel = scale || 1;
    return function (text, spec) {
      measureCtx.font = P.fontCss(spec.weight, spec.size * pixel);
      return measureCtx.measureText(text || '').width / pixel;
    };
  }

  function groupValue(id, fallback) {
    const pressed = document.querySelector('#' + id + ' [aria-pressed="true"]');
    if (!pressed) return fallback;
    const value = Number(pressed.dataset.value);
    return Number.isFinite(value) && pressed.dataset.value !== 'light' && pressed.dataset.value !== 'dark'
      ? value
      : pressed.dataset.value;
  }

  function readForm() {
    return {
      name: fields.name.value,
      handle: fields.handle.value,
      stamp: fields.stamp.value,
      verified: fields.verified.checked,
      text: fields.text.value,
      showMore: fields.showMore.checked,
      theme: groupValue('theme', 'light'),
      width: groupValue('width', 390),
      scale: groupValue('scale', 2),
      media: groupValue('media', 1),
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawIcon(ctx, name, x, y, size, color, scale) {
    const px = Math.round(x * scale);
    const py = Math.round(y * scale);
    const s = size * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s / 24, s / 24);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (name === 'reply') {
      ctx.moveTo(5, 7);
      ctx.lineTo(14, 7);
      ctx.quadraticCurveTo(19, 7, 19, 12);
      ctx.lineTo(19, 13.5);
      ctx.quadraticCurveTo(19, 17.5, 15, 17.5);
      ctx.lineTo(10, 17.5);
      ctx.lineTo(6.5, 21);
      ctx.lineTo(7, 17.5);
      ctx.lineTo(6, 17.5);
      ctx.quadraticCurveTo(4, 17.5, 4, 15);
      ctx.lineTo(4, 10);
      ctx.quadraticCurveTo(4, 7, 7, 7);
      ctx.stroke();
    } else if (name === 'repost') {
      ctx.moveTo(6, 8);
      ctx.lineTo(17, 8);
      ctx.moveTo(14, 5);
      ctx.lineTo(17.5, 8);
      ctx.lineTo(14, 11);
      ctx.moveTo(18, 16);
      ctx.lineTo(7, 16);
      ctx.moveTo(10, 13);
      ctx.lineTo(6.5, 16);
      ctx.lineTo(10, 19);
      ctx.stroke();
    } else if (name === 'like') {
      ctx.moveTo(12, 19.2);
      ctx.bezierCurveTo(6.8, 15.2, 4.4, 12.6, 4.4, 9.4);
      ctx.bezierCurveTo(4.4, 7, 6.2, 5.3, 8.6, 5.3);
      ctx.bezierCurveTo(10.2, 5.3, 11.4, 6.1, 12, 7.3);
      ctx.bezierCurveTo(12.6, 6.1, 13.8, 5.3, 15.4, 5.3);
      ctx.bezierCurveTo(17.8, 5.3, 19.6, 7, 19.6, 9.4);
      ctx.bezierCurveTo(19.6, 12.6, 17.2, 15.2, 12, 19.2);
      ctx.closePath();
      ctx.stroke();
    } else if (name === 'views') {
      ctx.fillRect(4, 13, 3.2, 6);
      ctx.fillRect(10.4, 8, 3.2, 11);
      ctx.fillRect(16.8, 4.5, 3.2, 14.5);
    }
    ctx.restore();
  }

  function paint(target, layout) {
    const scale = layout.scale;
    target.width = layout.pixelWidth;
    target.height = layout.pixelHeight;
    target.style.width = '100%';
    target.style.maxWidth = layout.width + 'px';
    target.style.height = 'auto';
    const ctx = target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < layout.ops.length; i++) {
      const op = layout.ops[i];
      if (op.type === 'rect') {
        ctx.fillStyle = op.fill;
        ctx.fillRect(0, 0, target.width, target.height);
      } else if (op.type === 'circle') {
        ctx.beginPath();
        ctx.fillStyle = op.fill;
        ctx.arc(Math.round(op.x * scale), Math.round(op.y * scale), Math.round(op.r * scale), 0, Math.PI * 2);
        ctx.fill();
      } else if (op.type === 'text' && op.text) {
        ctx.font = P.fontCss(op.weight, op.size * scale);
        ctx.fillStyle = op.fill;
        ctx.textAlign = op.align || 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(op.text, Math.round(op.x * scale), Math.round(op.y * scale));
      } else if (op.type === 'badge') {
        const x = Math.round(op.x * scale);
        const y = Math.round(op.y * scale);
        const s = Math.round(op.size * scale);
        ctx.beginPath();
        ctx.fillStyle = op.fill;
        ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = op.ink;
        ctx.lineWidth = Math.max(1.5, s * 0.14);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(x + s * 0.28, y + s * 0.52);
        ctx.lineTo(x + s * 0.45, y + s * 0.68);
        ctx.lineTo(x + s * 0.74, y + s * 0.34);
        ctx.stroke();
      } else if (op.type === 'icon') {
        drawIcon(ctx, op.name, op.x, op.y, op.size, op.fill, scale);
      } else if (op.type === 'media') {
        const x0 = Math.round(op.x * scale);
        const y0 = Math.round(op.y * scale);
        const w = Math.round((op.x + op.w) * scale) - x0;
        const h = Math.round((op.y + op.h) * scale) - y0;
        ctx.save();
        roundRect(ctx, x0, y0, w, h, op.radius * scale);
        ctx.clip();
        for (let c = 0; c < op.cells.length; c++) {
          const cell = op.cells[c];
          const cx = Math.round(cell.x * scale);
          const cy = Math.round(cell.y * scale);
          const cw = Math.round((cell.x + cell.w) * scale) - cx;
          const ch = Math.round((cell.y + cell.h) * scale) - cy;
          ctx.fillStyle = cell.fill;
          ctx.fillRect(cx, cy, cw, ch);
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          ctx.font = P.fontCss(600, 13 * scale);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.label, cx + Math.round(12 * scale), cy + Math.round(18 * scale));
        }
        ctx.restore();
      } else if (op.type === 'stroke') {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = Math.max(1, scale);
        const inset = ctx.lineWidth / 2;
        ctx.strokeRect(inset, inset, target.width - ctx.lineWidth, target.height - ctx.lineWidth);
      }
    }
    return target;
  }

  function formatMs(ms) {
    if (ms < 10) return ms.toFixed(2);
    if (ms < 100) return ms.toFixed(1);
    return String(Math.round(ms));
  }

  function showStats(layout, ms) {
    const parts = [
      formatMs(ms) + ' ms',
      layout.width + '×' + layout.height + ' CSS',
      layout.pixelWidth + '×' + layout.pixelHeight + ' px',
      layout.lineCount + (layout.lineCount === 1 ? ' line' : ' lines'),
    ];
    if (layout.truncated) parts.push('Show more');
    else if (layout.post.showMore) parts.push('text fits');
    if (layout.clipped) parts.push('text capped');
    stats.textContent = parts.join(' · ');
    const who = layout.post.name + ' @' + layout.post.handle;
    canvas.setAttribute('aria-label', who + ', ' + layout.width + ' CSS pixels, ' + layout.scale + '×');
    postText.textContent = layout.post.text || 'Empty post.';
  }

  function render() {
    const input = readForm();
    const started = performance.now();
    const layout = P.layoutPost(input, makeMeasurer(Number(input.scale) || 2));
    paint(canvas, layout);
    showStats(layout, performance.now() - started);
    return layout;
  }

  function markStale() {
    if (!hashFresh) return;
    hashFresh = false;
    summary.className = 'hash-summary';
    summary.textContent = 'The fields changed. Compare two passes again.';
    detail.textContent = '';
  }

  function schedule() {
    markStale();
    window.clearTimeout(timer);
    timer = window.setTimeout(render, 40);
  }

  function pass(input) {
    const scratch = document.createElement('canvas');
    const started = performance.now();
    const layout = P.layoutPost(input, makeMeasurer(input.scale));
    paint(scratch, layout);
    const ms = performance.now() - started;
    const ctx = scratch.getContext('2d');
    const pixels = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    return {
      hash: P.fnv1a(pixels),
      ms: ms,
      width: scratch.width,
      height: scratch.height,
      bytes: pixels.length,
    };
  }

  function compare() {
    const input = readForm();
    render();
    const first = pass(input);
    const second = pass(input);
    const same = first.hash === second.hash && first.width === second.width && first.height === second.height;
    hashFresh = true;
    summary.className = 'hash-summary ' + (same ? 'match' : 'mismatch');
    summary.textContent = same ? 'Match' : 'Mismatch';
    detail.textContent = [
      'pass 1  ' + first.hash + '  ' + formatMs(first.ms) + ' ms  ' + first.width + '×' + first.height,
      'pass 2  ' + second.hash + '  ' + formatMs(second.ms) + ' ms  ' + second.width + '×' + second.height,
      'FNV-1a over ' + first.bytes + ' bytes of getImageData',
    ].join('\n');
  }

  function download() {
    const layout = render();
    canvas.toBlob(function (blob) {
      if (!blob) {
        stats.textContent = 'The PNG could not be encoded.';
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'post-' + layout.theme + '-' + layout.width + '-' + layout.scale + 'x.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }, 'image/png');
  }

  function bindGroup(id) {
    const root = document.getElementById(id);
    root.addEventListener('click', function (event) {
      const button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      const buttons = root.querySelectorAll('button');
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', buttons[i] === button ? 'true' : 'false');
      }
      schedule();
    });
  }

  function applySample() {
    const sample = P.SAMPLE;
    fields.name.value = sample.name;
    fields.handle.value = sample.handle;
    fields.stamp.value = sample.stamp;
    fields.text.value = sample.text;
    fields.verified.checked = sample.verified;
    fields.showMore.checked = sample.showMore;
    setGroup('theme', sample.theme);
    setGroup('width', String(sample.width));
    setGroup('scale', String(sample.scale));
    setGroup('media', String(sample.media));
  }

  function setGroup(id, value) {
    const buttons = document.querySelectorAll('#' + id + ' button');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].dataset.value === value ? 'true' : 'false');
    }
  }

  ['theme', 'width', 'scale', 'media'].forEach(bindGroup);
  [fields.name, fields.handle, fields.stamp, fields.text].forEach(function (field) {
    field.addEventListener('input', schedule);
  });
  fields.verified.addEventListener('change', schedule);
  fields.showMore.addEventListener('change', schedule);
  document.getElementById('download').addEventListener('click', download);
  document.getElementById('compare').addEventListener('click', compare);
  document.getElementById('reset').addEventListener('click', function () {
    applySample();
    markStale();
    render();
    compare();
  });

  applySample();
  render();
  compare();
})();
