(function () {
  const Lisp = window.LispImage;
  const steps = window.LispSteps;
  const canvas = document.getElementById("stage");
  const runtime = document.getElementById("runtime");
  const functionsEl = document.getElementById("functions");
  const fnCount = document.getElementById("fn-count");
  const worldEl = document.getElementById("world");
  const stepKicker = document.getElementById("step-kicker");
  const stepSay = document.getElementById("step-say");
  const stepForm = document.getElementById("step-form");
  const nextButton = document.getElementById("next-step");
  const pauseButton = document.getElementById("pause");
  const resetButton = document.getElementById("reset");
  const runLabel = document.getElementById("run-label");
  const runWrap = document.querySelector(".run-label");
  const form = document.getElementById("repl");
  const source = document.getElementById("source");
  const reply = document.getElementById("reply");
  const transcript = document.getElementById("transcript");

  const OPS = { clear: 1, rect: 1, circle: 1, line: 1, ring: 1, text: 1 };
  let image = Lisp.createImage();
  let stepIndex = 0;
  let running = true;
  let lastStamp = 0;
  let worldSig = "";
  let openNames = new Set();
  const history = [];

  function isCons(value) {
    return !!value && value.t === "cons";
  }

  function isCommand(value) {
    return isCons(value) && value.a && value.a.t === "sym" && OPS[value.a.n];
  }

  function items(list) {
    const out = [];
    let node = list;
    let guard = 0;
    while (isCons(node)) {
      out.push(node.a);
      node = node.d;
      guard += 1;
      if (guard > 5000) throw new Error("scene too large");
    }
    return out;
  }

  function num(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(name + " needs a number");
    return value;
  }

  function paintColor(value, name) {
    if (typeof value !== "string" || !value) throw new Error(name + " needs a color");
    return value;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawCommand(ctx, command) {
    const name = command.a.n;
    const args = items(command.d);
    if (name === "clear") {
      ctx.fillStyle = paintColor(args[0], "clear");
      ctx.fillRect(0, 0, 480, 280);
      return;
    }
    if (name === "rect") {
      ctx.fillStyle = paintColor(args[4], "rect");
      ctx.fillRect(num(args[0], "rect"), num(args[1], "rect"), num(args[2], "rect"), num(args[3], "rect"));
      return;
    }
    if (name === "circle" || name === "ring") {
      ctx.beginPath();
      ctx.arc(num(args[0], name), num(args[1], name), num(args[2], name), 0, Math.PI * 2);
      if (name === "circle") {
        ctx.fillStyle = paintColor(args[3], name);
        ctx.fill();
      } else {
        ctx.strokeStyle = paintColor(args[3], name);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      return;
    }
    if (name === "line") {
      ctx.beginPath();
      ctx.moveTo(num(args[0], "line"), num(args[1], "line"));
      ctx.lineTo(num(args[2], "line"), num(args[3], "line"));
      ctx.strokeStyle = paintColor(args[4], "line");
      ctx.lineWidth = 1.4;
      ctx.stroke();
      return;
    }
    if (name === "text") {
      const size = num(args[4], "text");
      ctx.fillStyle = paintColor(args[3], "text");
      ctx.font = size + 'px Palatino, "Palatino Linotype", Georgia, serif';
      ctx.textBaseline = "top";
      ctx.fillText(String(args[2]), num(args[0], "text"), num(args[1], "text"));
    }
  }

  function drawScene(ctx, scene) {
    if (scene == null) return;
    if (isCommand(scene)) {
      drawCommand(ctx, scene);
      return;
    }
    items(scene).forEach(function (item) {
      if (isCommand(item)) drawCommand(ctx, item);
      else if (isCons(item)) drawScene(ctx, item);
    });
  }

  function paint(scene, placeholder) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    resize();
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(width / 480, 0, 0, height / 280, 0, 0);
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, 480, 280);
    if (placeholder) {
      ctx.strokeStyle = "#2c3448";
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, 460, 260);
      ctx.fillStyle = "#f6f1e7";
      ctx.font = '26px Palatino, Georgia, serif';
      ctx.textBaseline = "top";
      ctx.fillText("No render yet", 24, 108);
      ctx.fillStyle = "#9aa3b5";
      ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText("Evaluate a form to grow the image.", 24, 146);
      return;
    }
    drawScene(ctx, scene);
  }

  function showRuntime(message) {
    const text = message || "";
    if (runtime.textContent !== text) runtime.textContent = text;
  }

  function frame(now) {
    const dt = Math.min(0.05, lastStamp ? (now - lastStamp) / 1000 : 0.016);
    lastStamp = now;
    let problem = "";
    if (running && image.has("tick")) {
      try { image.call("tick", [dt, now / 1000]); }
      catch (error) { problem = error.message; }
    }
    if (image.has("render")) {
      try { paint(image.call("render", [now / 1000]), false); }
      catch (error) { problem = problem || error.message; }
    } else {
      try { paint(null, true); }
      catch (error) { problem = error.message; }
    }
    showRuntime(problem);
    renderWorld();
    window.requestAnimationFrame(frame);
  }

  function renderWorld() {
    const rows = image.describeWorld();
    const sig = rows.map(function (row) { return row.key + "=" + row.value; }).join("|");
    if (sig === worldSig) return;
    worldSig = sig;
    worldEl.replaceChildren();
    if (rows.length === 0) {
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = "value";
      detail.textContent = "nil";
      wrap.append(term, detail);
      worldEl.append(wrap);
      return;
    }
    rows.forEach(function (row) {
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = row.key;
      detail.textContent = row.value;
      wrap.append(term, detail);
      worldEl.append(wrap);
    });
  }

  function renderFunctions(sourceText) {
    const fns = image.functions();
    const touched = new Set();
    if (sourceText) {
      fns.forEach(function (fn) {
        if (fn.source && sourceText.indexOf(fn.source) !== -1) touched.add(fn.name);
      });
    }
    touched.forEach(function (name) { openNames.add(name); });
    fnCount.textContent = fns.length === 0
      ? "No functions yet"
      : fns.length === 1 ? "1 function" : fns.length + " functions";
    functionsEl.replaceChildren();
    fns.forEach(function (fn) {
      const details = document.createElement("details");
      details.dataset.name = fn.name;
      if (openNames.has(fn.name)) details.open = true;
      details.addEventListener("toggle", function () {
        if (details.open) openNames.add(fn.name);
        else openNames.delete(fn.name);
      });
      const summary = document.createElement("summary");
      summary.append(document.createTextNode(fn.name + " "));
      const params = document.createElement("span");
      params.textContent = "(" + fn.params.join(" ") + ")";
      summary.append(params);
      const pre = document.createElement("pre");
      pre.textContent = fn.source;
      details.append(summary, pre);
      functionsEl.append(details);
    });
  }

  function clip(text) {
    const clean = String(text);
    return clean.length > 500 ? clean.slice(0, 500) + "…" : clean;
  }

  function renderTranscript() {
    transcript.replaceChildren();
    history.forEach(function (entry) {
      const article = document.createElement("article");
      if (entry.kind === "err") article.className = "err";
      const who = document.createElement("p");
      who.className = "who";
      who.textContent = entry.who;
      const ask = document.createElement("p");
      ask.className = "ask";
      ask.textContent = entry.ask;
      const code = document.createElement("pre");
      code.textContent = entry.code;
      const result = document.createElement("p");
      result.className = "result";
      result.textContent = entry.result;
      article.append(who, ask, code, result);
      transcript.append(article);
    });
    transcript.scrollTop = transcript.scrollHeight;
  }

  function setReply(kind, text) {
    reply.className = "reply " + (kind || "");
    reply.textContent = text;
  }

  function accept(sourceText, ask, who) {
    try {
      const value = image.eval(sourceText);
      const printed = "=> " + clip(image.format(value));
      history.push({ kind: "ok", who: who, ask: ask, code: sourceText.trim(), result: printed });
      setReply("ok", printed);
      showRuntime("");
      renderFunctions(sourceText);
      renderWorld();
      renderTranscript();
      return true;
    } catch (error) {
      const printed = error.message;
      history.push({ kind: "err", who: who, ask: ask, code: sourceText.trim(), result: printed });
      setReply("err", printed);
      renderTranscript();
      return false;
    }
  }

  function showStep() {
    if (stepIndex >= steps.length) {
      stepKicker.textContent = "Conversation complete";
      stepSay.textContent = "The script is finished. The image is still running. Redefine body-color, or type any form.";
      stepForm.textContent = "";
      nextButton.hidden = true;
      return;
    }
    const step = steps[stepIndex];
    stepKicker.textContent = "Step " + (stepIndex + 1) + " of " + steps.length;
    stepSay.textContent = step.say;
    stepForm.textContent = step.form;
    nextButton.hidden = false;
  }

  function setRunning(next) {
    running = next;
    pauseButton.setAttribute("aria-pressed", running ? "false" : "true");
    pauseButton.textContent = running ? "Pause" : "Run";
    runLabel.textContent = running ? "Running" : "Paused";
    runWrap.dataset.running = running ? "true" : "false";
  }

  nextButton.addEventListener("click", function () {
    if (stepIndex >= steps.length) return;
    const step = steps[stepIndex];
    if (accept(step.form, step.say, "You")) stepIndex += 1;
    showStep();
  });

  pauseButton.addEventListener("click", function () {
    setRunning(!running);
  });

  resetButton.addEventListener("click", function () {
    image = Lisp.createImage();
    stepIndex = 0;
    history.length = 0;
    openNames = new Set();
    worldSig = "";
    lastStamp = 0;
    transcript.replaceChildren();
    setReply("", "");
    showRuntime("");
    renderFunctions("");
    renderWorld();
    showStep();
    paint(null, true);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = source.value.trim();
    if (!text) {
      setReply("err", "Write a form first.");
      return;
    }
    accept(text, "Typed a form", "You");
  });

  source.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.querySelectorAll(".chips button").forEach(function (button) {
    button.addEventListener("click", function () {
      source.value = button.getAttribute("data-form") || "";
      source.focus();
    });
  });

  canvas.addEventListener("click", function (event) {
    if (!image.has("on-click")) {
      setReply("err", "No on-click yet. That arrives in the script, or define it yourself.");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 480;
    const y = ((event.clientY - rect.top) / rect.height) * 280;
    try {
      const value = image.call("on-click", [x, y]);
      setReply("ok", "=> " + image.format(value));
      showRuntime("");
      renderWorld();
    } catch (error) {
      showRuntime(error.message);
    }
  });

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(function () { resize(); }).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  setRunning(running);
  showStep();
  renderFunctions("");
  renderWorld();
  window.requestAnimationFrame(frame);
})();
