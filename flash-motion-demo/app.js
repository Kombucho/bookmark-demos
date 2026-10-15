(function () {
  const api = window.FlashMotion;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PATHS = {
    circle: 'M50 11c13-4 29 1 36 15 7 15 5 33-7 43-13 11-33 16-46 8C18 68 8 52 12 36 16 18 32 15 50 11z',
    rect: 'M18 24c20-8 48-7 64 2 5 16 7 38 1 52-18 8-46 10-64 1-7-14-8-38-1-55z',
    triangle: 'M50 12c7 2 14 16 22 32 8 18 14 36 7 44-16 6-38 5-56-2-5-12 1-30 10-46C40 22 43 14 50 12z',
  };

  const stageEl = document.querySelector('#stage');
  const world = document.querySelector('#world');
  const paths = document.querySelector('#paths');
  const timeline = document.querySelector('#timeline');
  const statusEl = document.querySelector('#status');
  const readout = document.querySelector('#readout');
  const clock = document.querySelector('#clock');
  const recordBtn = document.querySelector('#record');
  const playBtn = document.querySelector('#play');
  const bounceBtn = document.querySelector('#bounce');
  const removeBtn = document.querySelector('#remove');

  let stage = api.createStage();
  let selected = 'ball';
  let scrub = 0;
  let recording = false;
  let playing = false;
  let take = null;
  let recordStarted = 0;
  let playAnchor = 0;
  let scrubAnchor = 0;
  let live = {};
  let drag = null;
  let trimDrag = null;
  let seeking = null;
  let raf = 0;

  renderShapes();
  renderTimeline();
  paint();
  updateTransport();

  recordBtn.addEventListener('click', function () {
    if (recording) stopRecord();
    else startRecord();
  });
  playBtn.addEventListener('click', function () {
    if (playing) pausePlay();
    else startPlay();
  });
  bounceBtn.addEventListener('click', dropBounce);
  removeBtn.addEventListener('click', removeSelected);
  document.querySelectorAll('[data-add]').forEach(function (button) {
    button.addEventListener('click', function () { addKind(button.dataset.add); });
  });

  world.addEventListener('pointerdown', onShapePointerDown);
  timeline.addEventListener('pointerdown', onTimelinePointerDown);
  timeline.addEventListener('keydown', onTimelineKey);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function seconds(ms) {
    return (ms / 1000).toFixed(1) + 's';
  }

  function signed(n) {
    const rounded = Math.round(n);
    return (rounded > 0 ? '+' : '') + rounded;
  }

  function viewSpan() {
    return Math.max(api.timelineEnd(stage), 2000);
  }

  function shapeById(id) {
    return stage.shapes.find(function (shape) { return shape.id === id; }) || null;
  }

  function kindOf(id) {
    const shape = shapeById(id);
    return shape ? shape.kind : 'circle';
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function toLogical(event) {
    const rect = stageEl.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * api.STAGE_W,
      y: ((event.clientY - rect.top) / rect.height) * api.STAGE_H,
    };
  }

  function elapsed() {
    return performance.now() - recordStarted;
  }

  function baseOf(shape) {
    if (recording && take && take.bases[shape.id]) return take.bases[shape.id];
    return shape;
  }

  function visualPose(shape) {
    if (drag && drag.id === shape.id && drag.preview) return drag.preview;
    if (recording && live[shape.id]) return live[shape.id];
    if (recording) return {x: shape.x, y: shape.y, rotation: shape.rotation};
    return api.poseAt(stage, shape.id, scrub);
  }

  function place(el, pose, withRotation) {
    el.style.left = (pose.x / api.STAGE_W * 100) + '%';
    el.style.top = (pose.y / api.STAGE_H * 100) + '%';
    el.style.transform = withRotation === false
      ? 'translate(-50%, -50%)'
      : 'translate(-50%, -50%) rotate(' + (pose.rotation || 0) + 'deg)';
  }

  function pencil(kind) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', PATHS[kind]);
    path.setAttribute('fill', 'var(--fill)');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '3.2');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    return svg;
  }

  function renderShapes() {
    world.replaceChildren();
    stage.shapes.forEach(function (shape) {
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.dataset.ghost = shape.id;
      ghost.title = shape.name + ' base pose';
      world.appendChild(ghost);

      const el = document.createElement('div');
      el.className = 'shape' + (shape.id === selected ? ' is-selected' : '');
      el.dataset.shape = shape.id;
      el.dataset.kind = shape.kind;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-pressed', shape.id === selected ? 'true' : 'false');
      el.setAttribute('aria-label', shape.name);
      if (shape.kind === 'note') {
        const card = document.createElement('div');
        card.className = 'note-card';
        const label = document.createElement('span');
        label.textContent = shape.text || 'note';
        card.appendChild(label);
        el.appendChild(card);
      } else {
        el.appendChild(pencil(shape.kind));
      }
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'rotate';
      handle.dataset.rotate = shape.id;
      handle.setAttribute('aria-label', 'Rotate ' + shape.name);
      el.appendChild(handle);
      world.appendChild(el);
    });
  }

  function paintPoses() {
    stage.shapes.forEach(function (shape) {
      const el = world.querySelector('[data-shape="' + shape.id + '"]');
      const ghost = world.querySelector('[data-ghost="' + shape.id + '"]');
      if (!el || !ghost) return;
      const pose = visualPose(shape);
      const base = baseOf(shape);
      place(el, pose, true);
      place(ghost, base, false);
      const offset = Math.hypot(pose.x - base.x, pose.y - base.y);
      const twist = Math.abs((pose.rotation || 0) - base.rotation);
      ghost.hidden = offset < 1.2 && twist < 1;
      el.classList.toggle('is-selected', shape.id === selected);
      el.setAttribute('aria-pressed', shape.id === selected ? 'true' : 'false');
    });
  }

  function paintPaths() {
    while (paths.firstChild) paths.removeChild(paths.firstChild);
    const shape = shapeById(selected);
    if (!shape) return;
    api.clipPaths(stage, shape.id).forEach(function (group) {
      stroke(group.points);
    });
    if (recording && take && take.tracks[shape.id]) {
      const base = take.bases[shape.id];
      stroke(take.tracks[shape.id].map(function (sample) {
        return {x: base.x + sample.dx, y: base.y + sample.dy};
      }));
    }
  }

  function stroke(points) {
    if (points.length < 2) return;
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#2a241c');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-dasharray', '5 6');
    line.setAttribute('points', points.map(function (point) {
      return point.x + ',' + point.y;
    }).join(' '));
    paths.appendChild(line);
  }

  function paintPlayhead() {
    const head = timeline.querySelector('.playhead');
    const track = timeline.querySelector('.lane-track') || timeline.querySelector('.ruler');
    const span = viewSpan();
    if (head && track) {
      const host = timeline.getBoundingClientRect();
      const lane = track.getBoundingClientRect();
      const x = lane.left - host.left - timeline.clientLeft + (scrub / span) * lane.width;
      head.style.left = x + 'px';
    }
    const end = api.timelineEnd(stage);
    clock.textContent = seconds(scrub) + (end > 0 ? ' / ' + seconds(end) : '');
    const ruler = timeline.querySelector('.ruler');
    if (ruler) {
      ruler.setAttribute('aria-valuemax', String(Math.round(span)));
      ruler.setAttribute('aria-valuenow', String(Math.round(scrub)));
      ruler.setAttribute('aria-valuetext', seconds(scrub));
    }
  }

  function paintReadout() {
    const shape = shapeById(selected) || stage.shapes[0];
    if (!shape) {
      readout.textContent = 'The stage is empty.';
      return;
    }
    const base = baseOf(shape);
    const pose = visualPose(shape);
    const clips = stage.clips.filter(function (clip) { return clip.shapeId === shape.id; });
    let samples = 0;
    clips.forEach(function (clip) { samples += clip.samples.length; });
    if (recording && take && take.tracks[shape.id]) samples = take.tracks[shape.id].length;
    const tail = samples
      ? ' · ' + samples + ' samples, still measured from the base'
      : ' · no samples yet';
    readout.textContent = shape.name
      + ' · base ' + Math.round(base.x) + ', ' + Math.round(base.y)
      + ' · offset ' + signed(pose.x - base.x) + ', ' + signed(pose.y - base.y)
      + ' · rotation ' + signed((pose.rotation || 0) - base.rotation) + '°'
      + tail;
  }

  function paint() {
    paintPoses();
    paintPaths();
    paintPlayhead();
    paintReadout();
  }

  function updateTransport() {
    recordBtn.textContent = recording ? 'Stop' : 'Record';
    recordBtn.setAttribute('aria-pressed', recording ? 'true' : 'false');
    recordBtn.disabled = playing;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    playBtn.disabled = recording || (!playing && api.timelineEnd(stage) <= 0);
    bounceBtn.disabled = recording || playing;
    removeBtn.disabled = recording || playing || stage.shapes.length <= 1;
    document.querySelectorAll('[data-add]').forEach(function (button) {
      button.disabled = recording || playing || stage.shapes.length >= api.MAX_SHAPES;
    });
  }

  function renderTimeline() {
    const span = viewSpan();
    timeline.replaceChildren();
    timeline.className = 'timeline';
    const ruler = document.createElement('div');
    ruler.className = 'ruler';
    ruler.tabIndex = 0;
    ruler.setAttribute('role', 'slider');
    ruler.setAttribute('aria-label', 'Playhead');
    ruler.setAttribute('aria-valuemin', '0');
    const head = document.createElement('div');
    head.className = 'playhead';
    timeline.append(ruler, head);

    stage.shapes.forEach(function (shape) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      const name = document.createElement('span');
      name.className = 'lane-name';
      name.textContent = shape.name;
      const track = document.createElement('div');
      track.className = 'lane-track';
      stage.clips.filter(function (clip) { return clip.shapeId === shape.id; }).forEach(function (clip) {
        track.appendChild(clipElement(clip, shape, span));
      });
      lane.append(name, track);
      timeline.appendChild(lane);
    });

    if (!stage.clips.length) {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'No clips yet. Record a drag, or drop in a bounce.';
      timeline.appendChild(note);
    }
    paintPlayhead();
  }

  function clipElement(clip, shape, span) {
    const el = document.createElement('div');
    el.className = 'clip' + (clip.shapeId === selected ? ' is-selected' : '');
    el.dataset.clip = clip.id;
    el.dataset.shape = clip.shapeId;
    el.dataset.kind = shape.kind;
    el.tabIndex = 0;
    el.style.left = ((clip.start + clip.trimIn) / span * 100) + '%';
    el.style.width = ((clip.trimOut - clip.trimIn) / span * 100) + '%';
    el.setAttribute('aria-label', shape.name + ' clip, ' + seconds(clip.trimOut - clip.trimIn) + '. Arrows trim the end. Shift plus arrows trim the start.');
    const label = document.createElement('span');
    label.className = 'clip-label';
    label.textContent = shape.name;
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'handle in';
    start.dataset.edge = 'in';
    start.dataset.clip = clip.id;
    start.setAttribute('aria-label', 'Trim start of ' + shape.name);
    const end = document.createElement('button');
    end.type = 'button';
    end.className = 'handle out';
    end.dataset.edge = 'out';
    end.dataset.clip = clip.id;
    end.setAttribute('aria-label', 'Trim end of ' + shape.name);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'clip-remove';
    remove.dataset.removeClip = clip.id;
    remove.setAttribute('aria-label', 'Remove ' + shape.name + ' clip');
    remove.textContent = '×';
    el.append(start, label, remove, end);
    return el;
  }

  function layoutClip(clip, span) {
    const el = timeline.querySelector('.clip[data-clip="' + clip.id + '"]');
    if (!el) return;
    const scale = span || viewSpan();
    el.style.left = ((clip.start + clip.trimIn) / scale * 100) + '%';
    el.style.width = ((clip.trimOut - clip.trimIn) / scale * 100) + '%';
  }

  function startRecord() {
    playing = false;
    recording = true;
    live = {};
    scrub = 0;
    take = api.beginTake(stage, api.timelineEnd(stage));
    recordStarted = performance.now();
    setStatus('Recording. Drag a shape. Stop writes a clip for each one that moved.');
    updateTransport();
    paint();
  }

  function stopRecord() {
    const at = elapsed();
    Object.keys(live).forEach(function (id) {
      api.sample(take, id, live[id], at);
    });
    const result = api.finishTake(stage, take);
    recording = false;
    take = null;
    live = {};
    if (result.ok) {
      stage = result.stage;
      const names = result.clips.map(function (clip) {
        const shape = shapeById(clip.shapeId);
        return shape ? shape.name : clip.shapeId;
      });
      setStatus('Saved ' + names.join(' and ') + '. Play it, then drag the shape without recording.');
    } else {
      setStatus('No motion long enough to keep. Drag farther, then stop.');
    }
    updateTransport();
    renderTimeline();
    paint();
  }

  function startPlay() {
    const end = api.timelineEnd(stage);
    if (end <= 0) {
      setStatus('Nothing recorded yet.');
      return;
    }
    if (scrub >= end - 1) scrub = 0;
    playing = true;
    playAnchor = performance.now();
    scrubAnchor = scrub;
    setStatus('Playing. Pause, then drag a shape. The base moves and the offsets stay.');
    updateTransport();
    raf = requestAnimationFrame(tick);
  }

  function pausePlay() {
    playing = false;
    setStatus('Paused at ' + seconds(scrub) + '. Drag a shape to move its base pose.');
    updateTransport();
    paint();
  }

  function tick(now) {
    if (!playing) return;
    const end = api.timelineEnd(stage);
    const t = scrubAnchor + (now - playAnchor);
    if (t >= end) {
      playing = false;
      scrub = 0;
      setStatus('Back on the base pose. The samples still hold the performance.');
      updateTransport();
      paint();
      return;
    }
    scrub = t;
    paintPoses();
    paintPlayhead();
    paintReadout();
    raf = requestAnimationFrame(tick);
  }

  function dropBounce() {
    const id = shapeById(selected) ? selected : stage.shapes[0].id;
    const result = api.seedBounce(stage, id);
    if (!result.ok) return;
    stage = result.stage;
    selected = id;
    scrub = 0;
    const shape = shapeById(id);
    setStatus('A bounce is on ' + shape.name + '. Play it, trim the ends, then drag ' + shape.name + ' without recording.');
    updateTransport();
    renderTimeline();
    paint();
  }

  function addKind(kind) {
    const result = api.addShape(stage, kind);
    if (!result.ok) {
      setStatus(result.error === 'Full' ? 'Four shapes is the whole cast.' : 'That shape did not land.');
      return;
    }
    stage = result.stage;
    selected = result.shape.id;
    setStatus(result.shape.name + ' is on the stage.');
    updateTransport();
    renderShapes();
    renderTimeline();
    paint();
  }

  function removeSelected() {
    if (stage.shapes.length <= 1) {
      setStatus('Leave at least one shape on the stage.');
      return;
    }
    const doomed = shapeById(selected);
    const result = api.removeShape(stage, selected);
    if (!result.ok) return;
    stage = result.stage;
    selected = stage.shapes[0].id;
    setStatus((doomed ? doomed.name : 'Shape') + ' left, and so did its clips.');
    updateTransport();
    renderShapes();
    renderTimeline();
    paint();
  }

  function onShapePointerDown(event) {
    const rotate = event.target.closest('[data-rotate]');
    const shapeEl = event.target.closest('[data-shape]');
    if (!shapeEl) return;
    const id = shapeEl.dataset.shape;
    selected = id;
    paintPaths();
    paintReadout();
    paintPoses();
    if (playing) return;
    const shape = shapeById(id);
    const shown = visualPose(shape);
    const base = baseOf(shape);
    const pointer = toLogical(event);
    drag = {
      id: id,
      pointerId: event.pointerId,
      kind: rotate ? 'rotate' : 'move',
      originPointer: pointer,
      base: {x: base.x, y: base.y, rotation: base.rotation},
      offset: {
        dx: shown.x - base.x,
        dy: shown.y - base.y,
        dr: (shown.rotation || 0) - base.rotation,
      },
      shown: shown,
      grabAngle: Math.atan2(pointer.y - shown.y, pointer.x - shown.x) * 180 / Math.PI,
      moved: false,
      preview: null,
    };
    if (recording) sampleLive(shape, shown);
    shapeEl.setPointerCapture(event.pointerId);
  }

  function sampleLive(shape, pose) {
    api.sample(take, shape.id, {
      x: pose.x,
      y: pose.y,
      rotation: pose.rotation || 0,
    }, elapsed());
    live[shape.id] = {x: pose.x, y: pose.y, rotation: pose.rotation || 0};
  }

  function onPointerMove(event) {
    if (seeking && event.pointerId === seeking.pointerId) {
      seek(event);
      return;
    }
    if (trimDrag && event.pointerId === trimDrag.pointerId) {
      applyTrim(event);
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId || playing) return;
    const pointer = toLogical(event);
    const shape = shapeById(drag.id);
    if (!shape) return;
    let rotation = drag.shown.rotation || 0;
    let dx = pointer.x - drag.originPointer.x;
    let dy = pointer.y - drag.originPointer.y;
    if (drag.kind === 'rotate') {
      const angle = Math.atan2(pointer.y - drag.shown.y, pointer.x - drag.shown.x) * 180 / Math.PI;
      rotation = (drag.shown.rotation || 0) + (angle - drag.grabAngle);
      dx = 0;
      dy = 0;
    }
    if (Math.hypot(pointer.x - drag.originPointer.x, pointer.y - drag.originPointer.y) > 2) drag.moved = true;
    const nextBase = {
      x: clamp(drag.base.x + dx, 64, api.STAGE_W - 64),
      y: clamp(drag.base.y + dy, 56, api.STAGE_H - 56),
      rotation: drag.base.rotation + (rotation - (drag.shown.rotation || 0)),
    };
    const preview = {
      x: nextBase.x + (drag.kind === 'move' ? drag.offset.dx : 0),
      y: nextBase.y + (drag.kind === 'move' ? drag.offset.dy : 0),
      rotation: nextBase.rotation + drag.offset.dr,
    };
    if (drag.kind === 'rotate') {
      preview.x = drag.shown.x;
      preview.y = drag.shown.y;
      preview.rotation = rotation;
    }
    drag.preview = preview;
    drag.nextBase = nextBase;
    if (recording) {
      const absolute = drag.kind === 'rotate'
        ? {x: drag.base.x + drag.offset.dx, y: drag.base.y + drag.offset.dy, rotation: rotation}
        : {x: preview.x, y: preview.y, rotation: preview.rotation};
      sampleLive(shape, absolute);
      drag.preview = absolute;
    }
    paintPoses();
    if (recording) paintPaths();
    paintReadout();
  }

  function onPointerUp(event) {
    if (seeking && event.pointerId === seeking.pointerId) {
      seeking = null;
      return;
    }
    if (trimDrag && event.pointerId === trimDrag.pointerId) {
      trimDrag = null;
      renderTimeline();
      paint();
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    if (recording) {
      const shape = shapeById(finished.id);
      if (shape && finished.preview) sampleLive(shape, finished.preview);
      paint();
      return;
    }
    if (!finished.moved || !finished.nextBase) {
      paint();
      return;
    }
    const result = api.moveBase(stage, finished.id, {
      x: finished.nextBase.x,
      y: finished.nextBase.y,
      rotation: finished.kind === 'rotate'
        ? finished.base.rotation + ((finished.preview.rotation || 0) - (finished.shown.rotation || 0))
        : finished.nextBase.rotation,
    });
    if (result.ok) {
      stage = result.stage;
      setStatus('Base pose moved. The recorded offsets are unchanged.');
    }
    updateTransport();
    paint();
  }

  function onTimelinePointerDown(event) {
    const remove = event.target.closest('[data-remove-clip]');
    if (remove) {
      event.stopPropagation();
      const result = api.removeClip(stage, remove.dataset.removeClip);
      if (result.ok) {
        stage = result.stage;
        setStatus('Clip removed. The base pose stays.');
        updateTransport();
        renderTimeline();
        paint();
      }
      return;
    }
    const handle = event.target.closest('[data-edge]');
    if (handle) {
      if (playing) pausePlay();
      trimDrag = {
        id: handle.dataset.clip,
        edge: handle.dataset.edge,
        pointerId: event.pointerId,
        span: viewSpan(),
      };
      handle.setPointerCapture(event.pointerId);
      return;
    }
    const clip = event.target.closest('.clip');
    if (clip) selected = clip.dataset.shape;
    if (playing) pausePlay();
    seek(event);
    seeking = {pointerId: event.pointerId};
  }

  function seek(event) {
    const track = timeline.querySelector('.lane-track') || timeline.querySelector('.ruler');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const u = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    scrub = u * viewSpan();
    paint();
  }

  function applyTrim(event) {
    const clip = stage.clips.find(function (item) { return item.id === trimDrag.id; });
    if (!clip) return;
    const track = timeline.querySelector('.lane-track');
    const rect = track.getBoundingClientRect();
    const u = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const local = u * trimDrag.span - clip.start;
    const trimIn = trimDrag.edge === 'in' ? local : clip.trimIn;
    const trimOut = trimDrag.edge === 'out' ? local : clip.trimOut;
    const result = api.trimClip(stage, clip.id, trimIn, trimOut);
    if (!result.ok) return;
    stage = result.stage;
    layoutClip(result.clip, trimDrag.span);
    paint();
  }

  function onTimelineKey(event) {
    const ruler = event.target.closest('.ruler');
    if (ruler && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      scrub = clamp(scrub + dir * 50, 0, viewSpan());
      if (playing) pausePlay();
      paint();
      return;
    }
    const clipEl = event.target.closest('.clip');
    if (!clipEl) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      const result = api.removeClip(stage, clipEl.dataset.clip);
      if (!result.ok) return;
      stage = result.stage;
      setStatus('Clip removed. The base pose stays.');
      updateTransport();
      renderTimeline();
      paint();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const clip = stage.clips.find(function (item) { return item.id === clipEl.dataset.clip; });
    if (!clip) return;
    const dir = event.key === 'ArrowRight' ? 1 : -1;
    const step = 40 * dir;
    const trimIn = event.shiftKey ? clip.trimIn + step : clip.trimIn;
    const trimOut = event.shiftKey ? clip.trimOut : clip.trimOut + step;
    const result = api.trimClip(stage, clip.id, trimIn, trimOut);
    if (!result.ok) return;
    stage = result.stage;
    selected = clip.shapeId;
    setStatus('Trimmed to ' + seconds(result.clip.trimOut - result.clip.trimIn) + '.');
    renderTimeline();
    const next = timeline.querySelector('[data-clip="' + clip.id + '"]');
    if (next) next.focus();
    paint();
  }

  function onKeyDown(event) {
    if (event.target.closest('button, input, select, a, .ruler, .clip, .handle')) return;
    if (recording || playing) return;
    const shape = shapeById(selected);
    if (!shape) return;
    const step = event.shiftKey ? 24 : 10;
    let dx = 0;
    let dy = 0;
    let dr = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else if (event.key === '[') dr = -8;
    else if (event.key === ']') dr = 8;
    else return;
    event.preventDefault();
    const result = api.moveBase(stage, shape.id, {
      x: clamp(shape.x + dx, 64, api.STAGE_W - 64),
      y: clamp(shape.y + dy, 56, api.STAGE_H - 56),
      rotation: shape.rotation + dr,
    });
    if (!result.ok) return;
    stage = result.stage;
    setStatus('Base pose moved. The recorded offsets are unchanged.');
    paint();
  }
})();
