const assert = require("node:assert/strict");
const test = require("node:test");
const { createImage } = require("./lisp.js");
const steps = require("./steps.js");

function names(image) {
  return image.functions().map(function (fn) { return fn.name; });
}

test("arithmetic, quote, let, and strings", function () {
  const image = createImage();
  assert.equal(image.eval("(+ 1 2 3)"), 6);
  assert.equal(image.eval("(- 10 3 1)"), 6);
  assert.equal(image.eval("(* 2 3 4)"), 24);
  assert.equal(image.eval("(upcase \"harbor\")"), "HARBOR");
  assert.equal(image.eval("(string-reverse \"HELLO\")"), "OLLEH");
  assert.equal(image.format(image.eval("(if nil \"no\" \"yes\")")), '"yes"');
  assert.equal(image.eval("(let ((x 2) (y 3)) (+ x y))"), 5);
  assert.equal(image.eval("(let* ((x 2) (y (+ x 4))) y)"), 6);
  assert.equal(image.format(image.eval("'pulse")), "pulse");
});

test("redefining a function keeps *world*", function () {
  const image = createImage();
  image.eval("(setq *world* '(name \"Pulse\" count 3))");
  image.eval("(defun body-color () \"#e2b657\")");
  assert.equal(image.eval("(body-color)"), "#e2b657");
  image.eval("(defun body-color () \"#7ee0d6\")");
  assert.equal(image.eval("(body-color)"), "#7ee0d6");
  assert.equal(image.eval("(world 'name)"), "Pulse");
  assert.equal(image.eval("(world 'count)"), 3);
  const source = image.functions().find(function (fn) { return fn.name === "body-color"; }).source;
  assert.match(source, /#7ee0d6/);
  assert.doesNotMatch(source, /#e2b657/);
});

test("the scripted conversation grows the image without resetting state", function () {
  const image = createImage();
  image.eval(steps[0].form);
  assert.equal(image.eval("(world 'name)"), "Pulse");
  assert.equal(image.eval("(world 'count)"), 0);
  assert.equal(image.eval("(caption)"), "awake");
  assert.ok(image.has("render"));

  image.eval(steps[1].form);
  assert.equal(image.eval("(body-color)"), "#e2b657");
  assert.equal(image.eval("(world 'x)"), 48);
  assert.equal(image.eval("(caption)"), "still");

  image.eval(steps[2].form);
  image.call("tick", [0.5, 1]);
  image.call("tick", [0.5, 1.5]);
  const count = image.eval("(world 'count)");
  const trail = image.eval("(length (world 'trail))");
  assert.ok(count > 0.9 && count < 1.1);
  assert.equal(trail, 2);
  assert.notEqual(image.eval("(world 'x)"), 48);

  image.eval(steps[3].form);
  assert.equal(image.eval("(world 'count)"), count);
  assert.equal(image.eval("(length (world 'trail))"), 2);
  assert.equal(image.eval("(body-color)"), "#e2b657");
  image.call("tick", [0.25, 2]);
  assert.ok(image.eval("(world 'count)") > count);
  assert.notEqual(image.eval("(world 'y)"), 150);

  const midCount = image.eval("(world 'count)");
  image.eval(steps[4].form);
  assert.equal(image.call("on-click", [80, 90]), 1);
  assert.equal(image.call("on-click", [120, 40]), 2);
  assert.equal(image.eval("(world 'count)"), midCount);
  assert.equal(image.eval("(length (world 'marks))"), 2);

  image.eval(steps[5].form);
  assert.equal(image.eval("(shout-backwards \"Hello\")"), "OLLEH");
  assert.equal(image.eval("(shout-backwards \"steady\")"), "YDAETS");
  assert.equal(image.eval("(caption)"), "YDAETS");
  assert.equal(image.eval("(length (world 'marks))"), 2);
  assert.equal(image.eval("(world 'name)"), "Pulse");
  assert.ok(names(image).includes("reverse-string"));
  assert.ok(names(image).includes("uppercase-string"));

  image.eval(steps[6].form);
  assert.equal(image.eval("(body-color)"), "#7ee0d6");
  assert.equal(image.eval("(world 'name)"), "Pulse");
  assert.equal(image.eval("(length (world 'marks))"), 2);
  assert.equal(image.eval("(length (world 'trail))"), 3);
  assert.equal(image.eval("(shout-backwards \"steady\")"), "YDAETS");
  const scene = image.call("render", [3]);
  assert.equal(scene.t, "cons");
});

test("a bad form does not wipe the image", function () {
  const image = createImage();
  image.eval("(defun body-color () \"#fff\")");
  assert.throws(function () { image.eval("(body-color"); }, /unterminated/);
  assert.equal(image.eval("(body-color)"), "#fff");
  assert.throws(function () { image.eval("(missing 1)"); }, /unbound symbol missing/);
});
