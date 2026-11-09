(function () {
  const Lab = window.ImageLab;

  const net = document.getElementById('net');
  const netCount = document.getElementById('net-count');
  const sourceMeta = document.getElementById('source-meta');
  const sourcePreview = document.getElementById('source-preview');
  const drop = document.getElementById('drop');
  const dropCopy = document.getElementById('drop-copy');
  const fileInput = document.getElementById('file');
  const note = document.getElementById('note');
  const edge = document.getElementById('edge');
  const edgeOut = document.getElementById('edge-out');
  const quality = document.getElementById('quality');
  const qualityOut = document.getElementById('quality-out');
  const fmtJpeg = document.getElementById('fmt-jpeg');
  const fmtWebp = document.getElementById('fmt-webp');
  const beforePreview = document.getElementById('before-preview');
  const afterPreview = document.getElementById('after-preview');
  const beforeBytes = document.getElementById('before-bytes');
  const afterBytes = document.getElementById('after-bytes');
  const compressSteps = document.getElementById('compress-steps');
  const downloadCompressed = document.getElementById('download-compressed');
  const colors = document.getElementById('colors');
  const colorsOut = document.getElementById('colors-out');
  const sampleSteps = document.getElementById('sample-steps');
  const swatches = document.getElementById('swatches');
  const beforeMarkers = document.getElementById('before-markers');
  const afterMarkers = document.getElementById('after-markers');
  const beforeExif = document.getElementById('before-exif');
  const verdict = document.getElementById('verdict');
  const downloadStripped = document.getElementById('download-stripped');

  const work = document.createElement('canvas');
  const sample = document.createElement('canvas');
  const strip = document.createElement('canvas');

  const state = {
    bytes: null,
    bitmap: null,
    planted: false,
    name: '',
    width: 0,
    height: 0,
    format: 'image/jpeg',
    compressed: null,
    stripped: null,
    sourceUrl: '',
    resultUrl: '',
  };

  let requests = 0;
  let token = 0;
  let timer = 0;
  let pixels = null;
  let sampleW = 0;
  let sampleH = 0;
  let sawAlpha = false;

  function countRequests() {
    if (!window.PerformanceObserver) return;
    try {
      const observer = new PerformanceObserver(function (list) {
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const type = entry.initiatorType;
          const name = entry.name || '';
          const http = /^https?:/i.test(name);
          if (!http) continue;
          if (type === 'fetch' || type === 'xmlhttprequest' || type === 'beacon' || type === 'ping' || type === 'img' || type === 'image') {
            requests += 1;
          }
        }
        netCount.textContent = String(requests);
        net.classList.toggle('hot', requests > 0);
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch (err) {
      netCount.textContent = '0';
    }
  }

  function qualityValue() {
    return Number(quality.value) / 100;
  }

  function edgeValue() {
    return Number(edge.value);
  }

  function paintSliders() {
    edgeOut.textContent = edge.value + ' px';
    qualityOut.textContent = qualityValue().toFixed(2);
    colorsOut.textContent = colors.value;
    fmtJpeg.setAttribute('aria-pressed', state.format === 'image/jpeg' ? 'true' : 'false');
    fmtWebp.setAttribute('aria-pressed', state.format === 'image/webp' ? 'true' : 'false');
  }

  function drawSample(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#7ea4bc');
    sky.addColorStop(0.55, '#d5e2ea');
    sky.addColorStop(1, '#f3e6cf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#f0b429';
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.24, Math.min(w, h) * 0.11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8ea06a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.25, h * 0.5, w * 0.5, h * 0.68);
    ctx.quadraticCurveTo(w * 0.75, h * 0.86, w, h * 0.58);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.fillStyle = '#6e8a55';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.82);
    ctx.quadraticCurveTo(w * 0.35, h * 0.68, w, h * 0.86);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    const hx = w * 0.12;
    const hy = h * 0.42;
    const hw = w * 0.34;
    const hh = h * 0.34;
    ctx.fillStyle = '#f7f1e6';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = '#b94a3a';
    ctx.fillRect(hx + hw * 0.72, hy - h * 0.045, hw * 0.08, h * 0.05);
    ctx.fillStyle = '#2c2824';
    ctx.beginPath();
    ctx.moveTo(hx - w * 0.02, hy);
    ctx.lineTo(hx + hw / 2, hy - h * 0.1);
    ctx.lineTo(hx + hw + w * 0.02, hy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e7a15a';
    ctx.fillRect(hx + hw * 0.62, hy + hh * 0.22, hw * 0.22, hh * 0.28);
    ctx.strokeStyle = '#2c2824';
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.strokeRect(hx + hw * 0.62, hy + hh * 0.22, hw * 0.22, hh * 0.28);

    ctx.fillStyle = '#8d4b32';
    ctx.fillRect(hx + hw * 0.16, hy + hh * 0.4, hw * 0.16, hh * 0.6);

    ctx.fillStyle = '#3d342c';
    ctx.fillRect(w * 0.58, h * 0.58, w * 0.02, h * 0.2);
    ctx.fillStyle = '#2f6a45';
    ctx.beginPath();
    ctx.arc(w * 0.59, h * 0.52, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3e7d52';
    ctx.beginPath();
    ctx.arc(w * 0.65, h * 0.56, w * 0.045, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d9c7a4';
    ctx.beginPath();
    ctx.moveTo(hx + hw * 0.18, h);
    ctx.lineTo(hx + hw * 0.4, h);
    ctx.lineTo(hx + hw * 0.32, hy + hh);
    ctx.lineTo(hx + hw * 0.18, hy + hh);
    ctx.fill();
  }

  function canvasBytes(canvas, type, q) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          resolve(null);
          return;
        }
        blob.arrayBuffer().then(function (buffer) {
          resolve({ bytes: new Uint8Array(buffer), type: blob.type || type });
        }, function () { resolve(null); });
      }, type, q);
    });
  }

  function replaceUrl(prev, bytes, type) {
    if (prev) URL.revokeObjectURL(prev);
    return URL.createObjectURL(new Blob([bytes], { type: type }));
  }

  function saveFile(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type: type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function setSource(next) {
    if (state.bitmap && state.bitmap.close) state.bitmap.close();
    state.bytes = next.bytes;
    state.bitmap = next.bitmap;
    state.planted = next.planted;
    state.name = next.name;
    state.width = next.width;
    state.height = next.height;
    state.sourceUrl = replaceUrl(state.sourceUrl, next.bytes, next.type || 'image/jpeg');
    sourcePreview.src = state.sourceUrl;
    sourcePreview.hidden = false;
    beforePreview.src = state.sourceUrl;
    beforePreview.hidden = false;
    dropCopy.hidden = true;
    const info = Lab.inspectBytes(state.bytes);
    const planted = state.planted ? ' An APP1 segment was planted in this JPEG so the strip is visible with no file.' : '';
    sourceMeta.textContent = state.name + ' · ' + info.kind.toUpperCase() + ' · ' + Lab.formatBytes(state.bytes.length) + ' · ' + state.width + '×' + state.height + '.' + planted;
    note.textContent = '';
    schedule();
  }

  async function useSample() {
    const w = 640;
    const h = 480;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    drawSample(canvas.getContext('2d'), w, h);
    const encoded = await canvasBytes(canvas, 'image/jpeg', 0.92);
    if (!encoded) {
      note.textContent = 'This browser did not encode the sample JPEG.';
      return;
    }
    const planted = Lab.injectApp1Exif(encoded.bytes, {
      make: 'Local image lab',
      model: 'Canvas',
      software: 'bookmark-demos',
      imageDescription: 'Drawn in this page. APP1 planted so the strip is visible with no file.',
      dateTime: '2026:11:09 07:15:00',
    });
    const bitmap = await createImageBitmap(new Blob([planted], { type: 'image/jpeg' }));
    setSource({
      bytes: planted,
      bitmap: bitmap,
      planted: true,
      name: 'sample.jpg',
      width: bitmap.width,
      height: bitmap.height,
      type: 'image/jpeg',
    });
  }

  async function useFile(file) {
    if (!file) return;
    const looksImage = /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || '');
    if (!looksImage) {
      note.textContent = 'That file is not an image this page can open.';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      note.textContent = 'That file is over 25 MB. Pick a smaller one.';
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes], { type: file.type || 'application/octet-stream' }));
    } catch (err) {
      note.textContent = 'This browser could not decode that image.';
      return;
    }
    fileInput.value = '';
    setSource({
      bytes: bytes,
      bitmap: bitmap,
      planted: false,
      name: file.name || 'image',
      width: bitmap.width,
      height: bitmap.height,
      type: file.type || 'image/jpeg',
    });
  }

  function drawWork() {
    const fitted = Lab.fitSize(state.width, state.height, edgeValue());
    work.width = fitted.width;
    work.height = fitted.height;
    const ctx = work.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fitted.width, fitted.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.bitmap, 0, 0, fitted.width, fitted.height);

    const box = Lab.sampleBox(fitted.width, fitted.height);
    sample.width = box.width;
    sample.height = box.height;
    const sampleCtx = sample.getContext('2d');
    sampleCtx.clearRect(0, 0, box.width, box.height);
    sampleCtx.imageSmoothingEnabled = true;
    sampleCtx.drawImage(state.bitmap, 0, 0, box.width, box.height);
    const raw = sampleCtx.getImageData(0, 0, box.width, box.height);
    pixels = raw.data;
    sampleW = box.width;
    sampleH = box.height;
    sawAlpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 250) {
        sawAlpha = true;
        break;
      }
    }

    const stripEdge = Math.min(2048, Math.max(state.width, state.height));
    const stripFit = Lab.fitSize(state.width, state.height, stripEdge);
    strip.width = stripFit.width;
    strip.height = stripFit.height;
    const stripCtx = strip.getContext('2d');
    stripCtx.fillStyle = '#ffffff';
    stripCtx.fillRect(0, 0, stripFit.width, stripFit.height);
    stripCtx.imageSmoothingEnabled = true;
    stripCtx.imageSmoothingQuality = 'high';
    stripCtx.drawImage(state.bitmap, 0, 0, stripFit.width, stripFit.height);
    return { fitted: fitted, stripFit: stripFit };
  }

  function paintPalette() {
    const count = Number(colors.value);
    const colorsFound = Lab.paletteFromPixels(pixels, count);
    swatches.textContent = '';
    colorsFound.forEach(function (color) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.hex = color.hex;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = color.hex;
      const code = document.createElement('code');
      code.textContent = color.hex;
      button.appendChild(chip);
      button.appendChild(code);
      button.setAttribute('aria-label', 'Copy ' + color.hex);
      button.addEventListener('click', function () {
        copyHex(color.hex, button);
      });
      item.appendChild(button);
      swatches.appendChild(item);
    });
    sampleSteps.textContent = 'Sampled ' + sampleW + '×' + sampleH + ' pixels from the resized image, then cut them into ' + colorsFound.length + ' colors.';
  }

  function copyHex(hex, button) {
    const code = button.querySelector('code');
    function showCopied() {
      code.textContent = 'Copied';
      window.setTimeout(function () { code.textContent = hex; }, 900);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(hex).then(showCopied, showCopied);
      return;
    }
    showCopied();
  }

  function markerLine(info) {
    if (!info.segments.length) {
      return (info.kind || 'file').toUpperCase() + ' · ' + Lab.formatBytes(info.byteLength) + (info.note ? ' · ' + info.note : '');
    }
    return info.segments.map(function (segment) { return segment.name; }).join(' · ');
  }

  function exifItems(info) {
    const rows = [];
    if (state.planted) rows.push('Planted in this browser. It was not in a camera file.');
    for (let i = 0; i < info.app1.length; i++) {
      const block = info.app1[i];
      const exif = block.exif || {};
      rows.push('APP1 · ' + Lab.formatBytes(block.size) + (exif.exif ? ' · Exif' : ' · not Exif'));
      if (exif.make) rows.push('Make · ' + exif.make);
      if (exif.model) rows.push('Model · ' + exif.model);
      if (exif.software) rows.push('Software · ' + exif.software);
      if (exif.dateTime) rows.push('Date · ' + exif.dateTime);
      if (exif.dateTimeOriginal) rows.push('Original date · ' + exif.dateTimeOriginal);
      if (exif.imageDescription) rows.push('Description · ' + exif.imageDescription);
      if (exif.artist) rows.push('Artist · ' + exif.artist);
      if (exif.copyright) rows.push('Copyright · ' + exif.copyright);
      if (exif.gps) rows.push('GPS directory · present');
    }
    if (!info.app1.length && info.note) rows.push(info.note);
    if (!info.app1.length && info.kind === 'jpeg') rows.push('APP1 segments · 0');
    return rows;
  }

  function paintStrip(strippedBytes, stripFit) {
    const before = Lab.inspectBytes(state.bytes);
    const after = Lab.inspectBytes(strippedBytes);
    beforeMarkers.textContent = markerLine(before) + ' · ' + Lab.formatBytes(before.byteLength);
    afterMarkers.textContent = markerLine(after) + ' · ' + Lab.formatBytes(after.byteLength);
    beforeExif.textContent = '';
    exifItems(before).forEach(function (row) {
      const item = document.createElement('li');
      item.textContent = row;
      beforeExif.appendChild(item);
    });
    const capped = stripFit.width !== state.width || stripFit.height !== state.height;
    const capNote = capped ? ' The draw was capped at ' + stripFit.width + '×' + stripFit.height + '.' : '';
    verdict.textContent = 'APP1 segments before: ' + before.app1Count + '. After re-encode: ' + after.app1Count + '. APP0 and APP2, when they remain, belong to the JPEG encoder. The camera EXIF lived in APP1.' + capNote;
  }

  async function run(mine) {
    if (!state.bitmap) return;
    paintSliders();
    const drawn = drawWork();
    paintPalette();
    const q = qualityValue();
    const mime = state.format;
    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    beforeBytes.textContent = Lab.formatBytes(state.bytes.length) + ' · ' + state.width + '×' + state.height;

    const atQuality = await canvasBytes(work, mime, q);
    if (mine !== token) return;
    const atFull = await canvasBytes(work, mime, 1);
    if (mine !== token) return;
    const stripped = await canvasBytes(strip, 'image/jpeg', Lab.STRIP_QUALITY);
    if (mine !== token || !atQuality || !stripped) {
      if (mine === token) note.textContent = 'This browser did not encode that format.';
      return;
    }
    note.textContent = sawAlpha ? 'JPEG has no transparency, so the encode sits on white.' : '';

    state.compressed = atQuality.bytes;
    state.stripped = stripped.bytes;
    state.resultUrl = replaceUrl(state.resultUrl, atQuality.bytes, atQuality.type);
    afterPreview.src = state.resultUrl;
    afterPreview.hidden = false;

    const fitted = drawn.fitted;
    afterBytes.textContent = Lab.formatBytes(atQuality.bytes.length) + ' · ' + fitted.width + '×' + fitted.height + ' · ' + Lab.shareOf(atQuality.bytes.length, state.bytes.length) + '% of the file';
    const fullLabel = atFull ? Lab.formatBytes(atFull.bytes.length) : '—';
    compressSteps.textContent = 'Resize ' + state.width + '×' + state.height + ' → ' + fitted.width + '×' + fitted.height + '. That size at quality 1.00 is ' + fullLabel + '. This quality ' + q.toFixed(2) + ' is ' + Lab.formatBytes(atQuality.bytes.length) + '.';

    downloadCompressed.disabled = false;
    downloadCompressed.textContent = 'Download compressed .' + ext;
    downloadCompressed.onclick = function () {
      saveFile(state.compressed, 'lab-compressed.' + ext, atQuality.type);
    };

    paintStrip(stripped.bytes, drawn.stripFit);
    downloadStripped.disabled = false;
    downloadStripped.onclick = function () {
      saveFile(state.stripped, 'lab-stripped.jpg', 'image/jpeg');
    };
  }

  function schedule() {
    const mine = ++token;
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      run(mine).catch(function (err) {
        if (mine !== token) return;
        note.textContent = err && err.message ? err.message : 'The encode failed.';
      });
    }, 40);
  }

  edge.addEventListener('input', function () {
    paintSliders();
    schedule();
  });
  quality.addEventListener('input', function () {
    paintSliders();
    schedule();
  });
  colors.addEventListener('input', function () {
    paintSliders();
    if (pixels) paintPalette();
  });
  fmtJpeg.addEventListener('click', function () {
    state.format = 'image/jpeg';
    schedule();
  });
  fmtWebp.addEventListener('click', function () {
    state.format = 'image/webp';
    schedule();
  });

  document.getElementById('use-sample').addEventListener('click', function () {
    useSample().catch(function (err) {
      note.textContent = err && err.message ? err.message : 'The sample failed.';
    });
  });

  fileInput.addEventListener('change', function () {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      useFile(file).catch(function (err) {
        note.textContent = err && err.message ? err.message : 'The file could not be read.';
      });
    }
  });

  drop.addEventListener('dragover', function (event) {
    event.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', function () {
    drop.classList.remove('over');
  });
  drop.addEventListener('drop', function (event) {
    event.preventDefault();
    drop.classList.remove('over');
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) {
      useFile(file).catch(function (err) {
        note.textContent = err && err.message ? err.message : 'The file could not be read.';
      });
    }
  });

  countRequests();
  paintSliders();
  useSample().catch(function (err) {
    note.textContent = err && err.message ? err.message : 'The sample failed.';
  });
})();
