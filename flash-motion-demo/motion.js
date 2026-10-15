// A stage of shapes and performance clips.
// Samples are offsets from the base pose captured when recording started.
// Moving the base later does not rewrite the samples.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FlashMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STAGE_W = 720;
  const STAGE_H = 400;
  const MAX_SHAPES = 4;
  const MIN_SPAN = 40;
  const MOVE_EPSILON = 0.5;
  const KINDS = ['circle', 'rect', 'triangle', 'note'];
  const KIND_NAME = {circle: 'Circle', rect: 'Rect', triangle: 'Triangle', note: 'Note'};
  const SPOTS = [
    {x: 540, y: 250},
    {x: 180, y: 90},
    {x: 520, y: 100},
    {x: 400, y: 320},
  ];

  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  function cloneSample(sample) {
    return {t: sample.t, dx: sample.dx, dy: sample.dy, dr: sample.dr};
  }

  function cloneClip(clip) {
    return {
      id: clip.id,
      shapeId: clip.shapeId,
      start: clip.start,
      duration: clip.duration,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      samples: clip.samples.map(cloneSample),
    };
  }

  function cloneShape(shape) {
    return {
      id: shape.id,
      kind: shape.kind,
      name: shape.name,
      x: shape.x,
      y: shape.y,
      rotation: shape.rotation,
      text: shape.text,
    };
  }

  function cloneStage(stage) {
    return {
      shapes: stage.shapes.map(cloneShape),
      clips: stage.clips.map(cloneClip),
      nextClip: stage.nextClip,
      nextShape: stage.nextShape,
    };
  }

  function shape(id, kind, name, x, y, rotation, text) {
    return {id: id, kind: kind, name: name, x: x, y: y, rotation: rotation, text: text || ''};
  }

  function createStage() {
    return {
      shapes: [
        shape('ball', 'circle', 'Ball', 160, 210, 0, ''),
        shape('box', 'rect', 'Box', 400, 150, -8, ''),
        shape('note', 'note', 'Note', 270, 300, 6, 'up'),
      ],
      clips: [],
      nextClip: 1,
      nextShape: 1,
    };
  }

  function findShape(stage, shapeId) {
    return stage.shapes.find(function (item) { return item.id === shapeId; }) || null;
  }

  function addShape(stage, kind) {
    const next = cloneStage(stage);
    if (KINDS.indexOf(kind) < 0) return {ok: false, error: 'BadKind', stage: next};
    if (next.shapes.length >= MAX_SHAPES) return {ok: false, error: 'Full', stage: next};
    const spot = SPOTS[next.shapes.length % SPOTS.length];
    const made = shape(
      'shape-' + next.nextShape,
      kind,
      KIND_NAME[kind],
      spot.x,
      spot.y,
      kind === 'note' ? 5 : 0,
      kind === 'note' ? 'hey' : '',
    );
    next.nextShape += 1;
    next.shapes.push(made);
    return {ok: true, stage: next, shape: made};
  }

  function removeShape(stage, shapeId) {
    const next = cloneStage(stage);
    const before = next.shapes.length;
    next.shapes = next.shapes.filter(function (item) { return item.id !== shapeId; });
    if (next.shapes.length === before) return {ok: false, error: 'MissingShape', stage: next};
    next.clips = next.clips.filter(function (clip) { return clip.shapeId !== shapeId; });
    return {ok: true, stage: next};
  }

  function beginTake(stage, at) {
    const bases = {};
    stage.shapes.forEach(function (item) {
      bases[item.id] = {x: item.x, y: item.y, rotation: item.rotation};
    });
    return {
      at: at > 0 ? at : 0,
      bases: bases,
      tracks: {},
    };
  }

  function sample(take, shapeId, pose, elapsed) {
    const base = take.bases[shapeId];
    if (!base) return {ok: false, error: 'MissingShape'};
    if (!(elapsed >= 0)) return {ok: false, error: 'BadTime'};
    const point = {
      t: round(elapsed),
      dx: round(pose.x - base.x),
      dy: round(pose.y - base.y),
      dr: round((pose.rotation || 0) - base.rotation),
    };
    if (!take.tracks[shapeId]) take.tracks[shapeId] = [];
    const track = take.tracks[shapeId];
    const last = track[track.length - 1];
    if (last && point.t < last.t) return {ok: false, error: 'TimeWentBack'};
    if (last && point.t - last.t < 12 && Math.hypot(point.dx - last.dx, point.dy - last.dy) < 0.35 && Math.abs(point.dr - last.dr) < 0.2) {
      return {ok: true, skipped: true};
    }
    track.push(point);
    return {ok: true, skipped: false, point: point};
  }

  function traveled(samples) {
    let peak = 0;
    samples.forEach(function (item) {
      peak = Math.max(peak, Math.hypot(item.dx, item.dy), Math.abs(item.dr));
    });
    return peak;
  }

  function finishTake(stage, take) {
    const next = cloneStage(stage);
    const made = [];
    next.shapes.forEach(function (item) {
      const samples = (take.tracks[item.id] || []).map(cloneSample);
      if (samples.length < 2) return;
      const duration = samples[samples.length - 1].t;
      const span = duration - samples[0].t;
      if (span < MIN_SPAN) return;
      if (traveled(samples) < MOVE_EPSILON) return;
      const clip = {
        id: 'clip-' + next.nextClip,
        shapeId: item.id,
        start: take.at,
        duration: duration,
        trimIn: samples[0].t,
        trimOut: duration,
        samples: samples,
      };
      next.nextClip += 1;
      next.clips.push(clip);
      made.push(cloneClip(clip));
    });
    if (!made.length) return {ok: false, error: 'NoMotion', stage: next};
    return {ok: true, stage: next, clips: made};
  }

  function timelineEnd(stage) {
    let end = 0;
    stage.clips.forEach(function (clip) {
      end = Math.max(end, clip.start + clip.trimOut);
    });
    return end;
  }

  function interpolate(samples, time) {
    if (!samples.length) return {dx: 0, dy: 0, dr: 0};
    if (time <= samples[0].t) return {dx: samples[0].dx, dy: samples[0].dy, dr: samples[0].dr};
    const last = samples[samples.length - 1];
    if (time >= last.t) return {dx: last.dx, dy: last.dy, dr: last.dr};
    for (let i = 1; i < samples.length; i += 1) {
      const b = samples[i];
      if (time <= b.t) {
        const a = samples[i - 1];
        const span = b.t - a.t || 1;
        const u = (time - a.t) / span;
        return {
          dx: a.dx + (b.dx - a.dx) * u,
          dy: a.dy + (b.dy - a.dy) * u,
          dr: a.dr + (b.dr - a.dr) * u,
        };
      }
    }
    return {dx: last.dx, dy: last.dy, dr: last.dr};
  }

  function covers(clip, time) {
    const local = time - clip.start;
    return local >= clip.trimIn - 1e-6 && local <= clip.trimOut + 1e-6;
  }

  function poseAt(stage, shapeId, time) {
    const item = findShape(stage, shapeId);
    if (!item) return null;
    const hits = stage.clips.filter(function (clip) {
      return clip.shapeId === shapeId && covers(clip, time);
    });
    if (!hits.length) {
      return {
        x: item.x,
        y: item.y,
        rotation: item.rotation,
        dx: 0,
        dy: 0,
        dr: 0,
        active: false,
        clipId: null,
      };
    }
    const clip = hits[hits.length - 1];
    const off = interpolate(clip.samples, time - clip.start);
    return {
      x: item.x + off.dx,
      y: item.y + off.dy,
      rotation: item.rotation + off.dr,
      dx: off.dx,
      dy: off.dy,
      dr: off.dr,
      active: true,
      clipId: clip.id,
    };
  }

  function moveBase(stage, shapeId, pose) {
    const next = cloneStage(stage);
    const item = findShape(next, shapeId);
    if (!item) return {ok: false, error: 'MissingShape', stage: next};
    if (pose.x != null) item.x = pose.x;
    if (pose.y != null) item.y = pose.y;
    if (pose.rotation != null) item.rotation = pose.rotation;
    return {ok: true, stage: next, shape: cloneShape(item)};
  }

  function trimClip(stage, clipId, trimIn, trimOut) {
    const next = cloneStage(stage);
    const clip = next.clips.find(function (item) { return item.id === clipId; });
    if (!clip) return {ok: false, error: 'MissingClip', stage: next};
    const first = clip.samples[0].t;
    const last = clip.samples[clip.samples.length - 1].t;
    let a = Number(trimIn);
    let b = Number(trimOut);
    if (!(b > a)) return {ok: false, error: 'BadSpan', stage: next};
    a = Math.min(last, Math.max(first, a));
    b = Math.min(last, Math.max(first, b));
    if (b - a < MIN_SPAN) return {ok: false, error: 'TooShort', stage: next};
    clip.trimIn = round(a);
    clip.trimOut = round(b);
    return {ok: true, stage: next, clip: cloneClip(clip)};
  }

  function removeClip(stage, clipId) {
    const next = cloneStage(stage);
    const before = next.clips.length;
    next.clips = next.clips.filter(function (clip) { return clip.id !== clipId; });
    if (next.clips.length === before) return {ok: false, error: 'MissingClip', stage: next};
    return {ok: true, stage: next};
  }

  function clipStats(clip) {
    let peak = 0;
    let peakSample = clip.samples[0];
    clip.samples.forEach(function (sample) {
      const distance = Math.hypot(sample.dx, sample.dy);
      if (distance >= peak) {
        peak = distance;
        peakSample = sample;
      }
    });
    return {
      count: clip.samples.length,
      peak: peak,
      dx: peakSample.dx,
      dy: peakSample.dy,
      dr: peakSample.dr,
      span: clip.trimOut - clip.trimIn,
    };
  }

  function seedBounce(stage, shapeId) {
    const next = cloneStage(stage);
    const item = findShape(next, shapeId);
    if (!item) return {ok: false, error: 'MissingShape', stage: next};
    const duration = 900;
    const frames = 18;
    const samples = [];
    for (let i = 0; i <= frames; i += 1) {
      const u = i / frames;
      const hop = Math.sin(u * Math.PI);
      samples.push({
        t: round(u * duration),
        dx: round(u * 160),
        dy: round(-hop * 110),
        dr: round(hop * 18),
      });
    }
    const clip = {
      id: 'clip-' + next.nextClip,
      shapeId: shapeId,
      start: timelineEnd(next),
      duration: duration,
      trimIn: 0,
      trimOut: duration,
      samples: samples,
    };
    next.nextClip += 1;
    next.clips.push(clip);
    return {ok: true, stage: next, clip: cloneClip(clip)};
  }

  function clipPaths(stage, shapeId) {
    const item = findShape(stage, shapeId);
    if (!item) return [];
    return stage.clips.filter(function (clip) {
      return clip.shapeId === shapeId;
    }).map(function (clip) {
      return {
        id: clip.id,
        points: clip.samples.filter(function (sample) {
          return sample.t >= clip.trimIn - 1e-6 && sample.t <= clip.trimOut + 1e-6;
        }).map(function (sample) {
          return {x: item.x + sample.dx, y: item.y + sample.dy, t: clip.start + sample.t};
        }),
      };
    });
  }

  return {
    STAGE_W: STAGE_W,
    STAGE_H: STAGE_H,
    MAX_SHAPES: MAX_SHAPES,
    MIN_SPAN: MIN_SPAN,
    MOVE_EPSILON: MOVE_EPSILON,
    KINDS: KINDS,
    createStage: createStage,
    addShape: addShape,
    removeShape: removeShape,
    beginTake: beginTake,
    sample: sample,
    finishTake: finishTake,
    timelineEnd: timelineEnd,
    poseAt: poseAt,
    moveBase: moveBase,
    trimClip: trimClip,
    removeClip: removeClip,
    clipStats: clipStats,
    seedBounce: seedBounce,
    clipPaths: clipPaths,
  };
});
