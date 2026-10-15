const test = require('node:test');
const assert = require('node:assert/strict');
const motion = require('./motion.js');

function ballOf(stage) {
  return stage.shapes.find(function (shape) { return shape.id === 'ball'; });
}

function recorded(dx, dy, dr) {
  const stage = motion.createStage();
  const ball = ballOf(stage);
  const take = motion.beginTake(stage, 0);
  motion.sample(take, 'ball', {x: ball.x, y: ball.y, rotation: ball.rotation}, 0);
  motion.sample(take, 'ball', {
    x: ball.x + dx,
    y: ball.y + dy,
    rotation: ball.rotation + (dr || 0),
  }, 200);
  return {stage: stage, ball: ball, done: motion.finishTake(stage, take)};
}

test('samples are offsets from the base captured when the take starts', () => {
  const stage = motion.createStage();
  const ball = ballOf(stage);
  const take = motion.beginTake(stage, 0);
  const first = motion.sample(take, 'ball', {x: ball.x, y: ball.y, rotation: ball.rotation}, 0);
  const later = motion.sample(take, 'ball', {x: ball.x + 40, y: ball.y - 10, rotation: ball.rotation + 15}, 100);
  assert.equal(first.point.dx, 0);
  assert.equal(first.point.dy, 0);
  assert.equal(later.point.dx, 40);
  assert.equal(later.point.dy, -10);
  assert.equal(later.point.dr, 15);
  const done = motion.finishTake(stage, take);
  assert.equal(done.ok, true);
  assert.equal(stage.clips.length, 0);
  assert.equal(ballOf(done.stage).x, ball.x);
  assert.equal(done.stage.clips[0].samples[1].dx, 40);
});

test('a nudge that is too short or too small is not a clip', () => {
  const stage = motion.createStage();
  const ball = ballOf(stage);
  const tiny = motion.beginTake(stage, 0);
  motion.sample(tiny, 'ball', {x: ball.x, y: ball.y, rotation: 0}, 0);
  motion.sample(tiny, 'ball', {x: ball.x + 0.2, y: ball.y, rotation: 0}, 80);
  assert.equal(motion.finishTake(stage, tiny).error, 'NoMotion');

  const brief = motion.beginTake(stage, 0);
  motion.sample(brief, 'ball', {x: ball.x, y: ball.y, rotation: 0}, 0);
  motion.sample(brief, 'ball', {x: ball.x + 30, y: ball.y, rotation: 0}, 20);
  assert.equal(motion.finishTake(stage, brief).error, 'NoMotion');
});

test('poseAt interpolates offsets and returns the base outside the trim', () => {
  const run = recorded(40, -10, 0);
  assert.equal(run.done.ok, true);
  const mid = motion.poseAt(run.done.stage, 'ball', 100);
  assert.equal(mid.active, true);
  assert.equal(mid.x, run.ball.x + 20);
  assert.equal(mid.y, run.ball.y - 5);
  const before = motion.poseAt(run.done.stage, 'ball', -10);
  assert.equal(before.active, false);
  assert.equal(before.x, run.ball.x);
});

test('moving the base shifts playback and leaves the samples alone', () => {
  const run = recorded(40, -10, 20);
  const clip = run.done.stage.clips[0];
  const moved = motion.moveBase(run.done.stage, 'ball', {
    x: run.ball.x + 30,
    y: run.ball.y + 12,
    rotation: run.ball.rotation - 4,
  });
  assert.equal(moved.ok, true);
  const pose = motion.poseAt(moved.stage, 'ball', 200);
  assert.equal(pose.x, run.ball.x + 30 + 40);
  assert.equal(pose.y, run.ball.y + 12 - 10);
  assert.equal(pose.rotation, run.ball.rotation - 4 + 20);
  assert.deepEqual(moved.stage.clips[0].samples, clip.samples);
  assert.equal(ballOf(run.done.stage).x, run.ball.x);
});

test('trimming drops the part of the performance outside the window', () => {
  const run = recorded(40, -10, 0);
  const clip = run.done.stage.clips[0];
  const trimmed = motion.trimClip(run.done.stage, clip.id, 0, 80);
  assert.equal(trimmed.ok, true);
  const outside = motion.poseAt(trimmed.stage, 'ball', 100);
  assert.equal(outside.active, false);
  assert.equal(outside.dx, 0);
  const inside = motion.poseAt(trimmed.stage, 'ball', 80);
  assert.equal(inside.active, true);
  assert.equal(inside.dx, 16);
  const tooShort = motion.trimClip(trimmed.stage, clip.id, 0, 10);
  assert.equal(tooShort.error, 'TooShort');
  assert.equal(tooShort.stage.clips[0].trimOut, 80);
});

test('a drag that starts late does not cover the quiet lead-in', () => {
  const stage = motion.createStage();
  const ball = ballOf(stage);
  const take = motion.beginTake(stage, 0);
  motion.sample(take, 'ball', {x: ball.x, y: ball.y, rotation: 0}, 200);
  motion.sample(take, 'ball', {x: ball.x + 50, y: ball.y, rotation: 0}, 500);
  const done = motion.finishTake(stage, take);
  const clip = done.stage.clips[0];
  assert.equal(clip.trimIn, 200);
  assert.equal(clip.trimOut, 500);
  assert.equal(motion.poseAt(done.stage, 'ball', 100).active, false);
  assert.equal(motion.poseAt(done.stage, 'ball', 200).dx, 0);
  assert.equal(motion.timelineEnd(done.stage), 500);
});

test('two shapes in one take share a clock, and the next take starts after it', () => {
  const stage = motion.createStage();
  const ball = ballOf(stage);
  const box = stage.shapes.find(function (shape) { return shape.id === 'box'; });
  const take = motion.beginTake(stage, motion.timelineEnd(stage));
  motion.sample(take, 'ball', {x: ball.x, y: ball.y, rotation: ball.rotation}, 0);
  motion.sample(take, 'ball', {x: ball.x + 20, y: ball.y, rotation: ball.rotation}, 120);
  motion.sample(take, 'box', {x: box.x, y: box.y, rotation: box.rotation}, 120);
  motion.sample(take, 'box', {x: box.x, y: box.y + 30, rotation: box.rotation}, 240);
  const done = motion.finishTake(stage, take);
  assert.equal(done.clips.length, 2);
  assert.equal(done.clips[0].start, 0);
  assert.equal(done.clips[1].start, 0);
  assert.equal(motion.timelineEnd(done.stage), 240);
  const again = motion.beginTake(done.stage, motion.timelineEnd(done.stage));
  assert.equal(again.at, 240);
  motion.sample(again, 'ball', {x: ball.x, y: ball.y, rotation: ball.rotation}, 0);
  motion.sample(again, 'ball', {x: ball.x - 25, y: ball.y, rotation: ball.rotation}, 80);
  const second = motion.finishTake(done.stage, again);
  assert.equal(second.stage.clips[2].start, 240);
  assert.equal(motion.poseAt(second.stage, 'ball', 240).dx, 0);
  assert.equal(motion.poseAt(second.stage, 'ball', 320).dx, -25);
});

test('a seeded bounce hops above its base, and the path follows a later move', () => {
  const stage = motion.createStage();
  const ball = ballOf(stage);
  const seeded = motion.seedBounce(stage, 'ball');
  assert.equal(seeded.ok, true);
  assert.equal(ballOf(seeded.stage).x, ball.x);
  const mid = motion.poseAt(seeded.stage, 'ball', 450);
  assert.equal(mid.active, true);
  assert.equal(mid.dx, 80);
  assert.equal(mid.dy, -110);
  const moved = motion.moveBase(seeded.stage, 'ball', {x: ball.x, y: ball.y - 40, rotation: ball.rotation});
  const paths = motion.clipPaths(moved.stage, 'ball');
  assert.equal(paths.length, 1);
  assert.equal(paths[0].points[9].y, ball.y - 40 - 110);
  const trimmed = motion.trimClip(moved.stage, seeded.clip.id, 200, 700);
  const after = motion.clipPaths(trimmed.stage, 'ball');
  assert.ok(after[0].points[0].t >= 200);
  assert.ok(after[0].points[after[0].points.length - 1].t <= 700);
  assert.equal(motion.poseAt(trimmed.stage, 'ball', 100).active, false);
});

test('the stage holds four shapes and removing one drops its clips', () => {
  let stage = motion.createStage();
  const added = motion.addShape(stage, 'triangle');
  assert.equal(added.ok, true);
  assert.equal(motion.addShape(added.stage, 'circle').error, 'Full');
  const seeded = motion.seedBounce(added.stage, 'ball');
  const removed = motion.removeShape(seeded.stage, 'ball');
  assert.equal(removed.ok, true);
  assert.equal(removed.stage.clips.length, 0);
  assert.equal(removed.stage.shapes.length, 3);
  assert.equal(motion.clipStats(seeded.clip).count, 19);
});
