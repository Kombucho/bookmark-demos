(function () {
  const A = window.Athanor;
  const started = Date.now();
  const state = {
    place: A.PLACES[0],
    scheme: "umber",
    follow: false,
    dlvl: 1,
    inspect: null,
    image: null,
    sourceName: "a drawn plate",
    mask: null,
    queue: [],
    showing: "",
    announced: "",
    battery: null,
    disk: null,
    hourKey: "",
    chartKey: "",
    readKey: "",
  };

  const plate = document.getElementById("plate");
  const drop = document.getElementById("drop");
  const placeSelect = document.getElementById("place");
  const seedInput = document.getElementById("seed");
  const messageBtn = document.getElementById("message");

  A.PLACES.forEach(function (place) {
    const option = document.createElement("option");
    option.value = place.id;
    option.textContent = place.name;
    placeSelect.appendChild(option);
  });

  const levels = document.getElementById("levels");
  A.LEVELS.forEach(function (level) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.dlvl = String(level.dlvl);
    button.textContent = level.dlvl + " " + level.symbol;
    button.setAttribute("aria-pressed", level.dlvl === 1 ? "true" : "false");
    button.title = "Dlvl " + level.dlvl + ", " + level.planet;
    button.addEventListener("click", function () {
      state.dlvl = level.dlvl;
      push("You arrive on Dlvl " + level.dlvl + ", " + level.planet + ".");
      renderLevels();
    });
    levels.appendChild(button);
  });

  const stages = document.getElementById("stages");
  A.SCHEME_ORDER.forEach(function (name) {
    const scheme = A.SCHEMES[name];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.scheme = name;
    button.innerHTML = '<span class="stage-name"></span><span class="stage-latin"></span>';
    button.querySelector(".stage-name").textContent = scheme.label;
    button.querySelector(".stage-latin").textContent = scheme.stage;
    button.addEventListener("click", function () {
      state.follow = false;
      document.getElementById("follow").checked = false;
      state.scheme = name;
      push("You read a scroll of transmutation. The work passes into " + scheme.stage + ".");
      applyScheme();
      renderSky(false);
    });
    stages.appendChild(button);
  });

  document.getElementById("transmute").addEventListener("click", function () {
    state.follow = false;
    document.getElementById("follow").checked = false;
    state.scheme = A.nextScheme(state.scheme);
    const scheme = A.SCHEMES[state.scheme];
    push("You read a scroll of transmutation. The work passes into " + scheme.stage + ".");
    applyScheme();
    renderSky(false);
  });

  document.getElementById("follow").addEventListener("change", function (event) {
    state.follow = event.target.checked;
    push(state.follow ? "The stages follow the sun." : "The stages wait for a hand on the furnace.");
    renderSky(false);
  });

  placeSelect.addEventListener("change", function () {
    const found = A.PLACES.find(function (place) { return place.id === placeSelect.value; });
    if (!found) return;
    state.place = found;
    push("The sky is reckoned from " + found.name + ".");
    renderSky(true);
  });

  document.getElementById("locate").addEventListener("click", function () {
    if (!navigator.geolocation) {
      push("This browser has no location. The sky stays on the chosen city.");
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      const here = {
        id: "here",
        name: "Here",
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      state.place = here;
      let option = placeSelect.querySelector('option[value="here"]');
      if (!option) {
        option = document.createElement("option");
        option.value = "here";
        placeSelect.appendChild(option);
      }
      option.textContent = "Here · " + here.lat.toFixed(2) + ", " + here.lon.toFixed(2);
      placeSelect.value = "here";
      push("The sky is reckoned from this place.");
      renderSky(true);
    }, function () {
      push("The place stays where it was. Location was declined.");
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  });

  seedInput.addEventListener("input", function () {
    renderReading(sky());
  });

  document.getElementById("mint").addEventListener("click", function () {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = "";
    for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, "0");
    seedInput.value = "ssh-ed25519 " + hex;
    renderReading(sky());
    push("A new host key is cut. The sigil changes.");
  });

  document.getElementById("file").addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (file) loadImage(file);
  });

  document.getElementById("reset-plate").addEventListener("click", function () {
    state.image = null;
    state.sourceName = "a drawn plate";
    buildMask();
    push("The plate returns to the drawn furnace.");
  });

  drop.addEventListener("dragover", function (event) {
    event.preventDefault();
    drop.classList.add("hot");
  });
  drop.addEventListener("dragleave", function () { drop.classList.remove("hot"); });
  drop.addEventListener("drop", function (event) {
    event.preventDefault();
    drop.classList.remove("hot");
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file && file.type.indexOf("image/") === 0) loadImage(file);
    else push("Drop an image. That file was something else.");
  });

  messageBtn.addEventListener("click", advance);

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function push(text) {
    if (!text || text === state.showing || state.queue.indexOf(text) !== -1) return;
    if (!state.showing) {
      state.showing = text;
    } else {
      state.queue.push(text);
    }
    renderMessage();
  }

  function advance() {
    if (!state.queue.length) return;
    state.showing = state.queue.shift();
    renderMessage();
  }

  function renderMessage() {
    const more = state.queue.length ? ' <span class="more">--More--</span>' : "";
    messageBtn.innerHTML = escapeHtml(state.showing) + more;
  }

  function sky() {
    return A.planetaryDay(new Date(), state.place);
  }

  function syncSunStage(day, announce) {
    const next = A.schemeForHour(day.current);
    if (!state.follow || next === state.scheme) return;
    state.scheme = next;
    if (announce && state.announced !== next) {
      state.announced = next;
      push("The work passes into " + A.SCHEMES[next].stage + ".");
    }
    applyScheme();
  }

  function applyScheme() {
    const scheme = A.SCHEMES[state.scheme];
    const root = document.documentElement;
    root.style.setProperty("--bg", scheme.bg);
    root.style.setProperty("--fg", scheme.fg);
    root.style.setProperty("--dim", scheme.dim);
    root.style.setProperty("--border", scheme.border);
    root.style.setProperty("--active", scheme.active);
    root.style.setProperty("--bar", scheme.bar);
    root.style.setProperty("--barfg", scheme.barfg);
    root.style.setProperty("--warn", scheme.warn);
    root.style.setProperty("--sigil", scheme.sigil);
    root.style.colorScheme = (state.scheme === "vellum" || state.scheme === "orpiment") ? "light" : "dark";
    stages.querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.scheme === state.scheme ? "true" : "false");
    });
    paintMask();
    renderContrast(scheme);
    renderLevels();
    renderReading(sky());
  }

  function renderContrast(scheme) {
    const body = document.querySelector("#contrast tbody");
    body.replaceChildren();
    A.contrastReport(scheme).forEach(function (row) {
      const tr = document.createElement("tr");
      const ratio = row.ratio.toFixed(2);
      const mark = row.ok ? "meets " + row.minimum + " : 1" : "short of " + row.minimum + " : 1";
      tr.innerHTML =
        "<th scope=\"row\">" + row.label + "</th>" +
        "<td><span class=\"swatch\" style=\"background:" + row.fg + "\"></span>" +
        "<span class=\"swatch\" style=\"background:" + row.bg + "\"></span>" +
        ratio + " : 1</td>" +
        "<td class=\"" + (row.ok ? "ok" : "short") + "\">" + mark + "</td>";
      body.appendChild(tr);
    });
  }

  function renderLevels() {
    const level = A.LEVELS[state.dlvl - 1];
    levels.querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", Number(button.dataset.dlvl) === state.dlvl ? "true" : "false");
    });
    document.getElementById("plate-title").textContent = "Dlvl " + level.dlvl + " · " + level.planet;
    document.getElementById("plate-note").textContent =
      state.sourceName + " · Floyd-Steinberg, then each pixel doubled. Ink " +
      A.SCHEMES[state.scheme].wall[0] + ", paper " + A.SCHEMES[state.scheme].wall[1] +
      ". Drop an image on the plate to dither that instead.";
    renderStats();
  }

  function renderSky(force) {
    const day = sky();
    const place = state.place;
    document.getElementById("date-line").textContent =
      day.localLabel + " · Moon " + day.moon + " · " + place.name;
    const sun = document.getElementById("sun-line");
    sun.textContent = "Sunrise " + A.clock(day.sunrise, place.tz) + ", sunset " + A.clock(day.sunset, place.tz) +
      (day.approximate ? ". No sunrise at this latitude, so the hours use 6:00 and 18:00." : ".");
    const now = day.current;
    document.getElementById("now-line").textContent =
      A.clock(new Date(), place.tz) + " · hour of " + A.withArticle(now.planet) + " · " + now.trump;
    const liveKey = day.localIso + ":" + now.index + ":" + now.planet;
    if (liveKey !== state.hourKey) {
      state.hourKey = liveKey;
      document.getElementById("hour-live").textContent =
        "Hour of " + A.withArticle(now.planet) + ". Trump " + now.trump + ".";
    }

    const chartKey = place.id + ":" + place.lat.toFixed(3) + ":" + day.sunrise.getTime();
    const hours = document.getElementById("hours");
    if (force || chartKey !== state.chartKey) {
      state.chartKey = chartKey;
      hours.replaceChildren();
      day.hours.forEach(function (hour) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.index = String(hour.index);
        button.style.setProperty("--span", String(hour.end - hour.start));
        button.textContent = hour.symbol;
        button.title = "Hour " + (hour.index + 1) + ", " + hour.planet + ", " + hour.trump;
        button.addEventListener("click", function () {
          state.inspect = hour.index;
          renderSky(false);
        });
        hours.appendChild(button);
      });
    }
    hours.querySelectorAll("button").forEach(function (button, index) {
      const hour = day.hours[index];
      button.classList.toggle("is-night", !hour.isDay);
      button.classList.toggle("is-now", hour.index === now.index);
      const selected = state.inspect == null ? hour.index === now.index : hour.index === state.inspect;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    const span = day.nextRise - day.sunrise;
    const needle = document.getElementById("needle");
    const along = (Date.now() - day.sunrise.getTime()) / span;
    if (along >= 0 && along <= 1) {
      needle.hidden = false;
      needle.style.left = (along * 100) + "%";
    } else {
      needle.hidden = true;
    }
    const shown = state.inspect == null ? now : day.hours[state.inspect];
    document.getElementById("hour-detail").textContent =
      "Hour " + (shown.index + 1) + " of 24, " + (shown.isDay ? "day" : "night") +
      ". " + shown.planet + " · " + shown.numeral + " " + shown.trump +
      ". " + A.clock(shown.start, place.tz) + "–" + A.clock(shown.end, place.tz) +
      ". Day of " + A.withArticle(day.dayRuler) + ".";
    const wanted = A.schemeForHour(now);
    document.getElementById("stage-hint").textContent = state.follow
      ? "The sun is holding " + A.SCHEMES[wanted].label + ", " + A.SCHEMES[wanted].stage + "."
      : "The sun would hold " + A.SCHEMES[wanted].label + " (" + A.SCHEMES[wanted].stage + ") for this hour. Night is umber. Day runs vellum, orpiment, then cinnabar.";
    syncSunStage(day, true);
    renderReading(day);
  }

  function cardHtml(draw, position) {
    const article = document.createElement("article");
    article.className = draw.reversed ? "reversed" : "";
    const meaning = draw.reversed ? draw.card.reversed : draw.card.upright;
    article.innerHTML =
      (position ? '<p class="pos">' + escapeHtml(position) + "</p>" : "") +
      '<p class="num">' + escapeHtml(draw.card.numeral || "·") + "</p>" +
      "<h3>" + escapeHtml(draw.card.name) + "</h3>" +
      (draw.reversed ? '<p class="rev">reversed</p>' : '<p class="rev">upright</p>') +
      '<p class="mean">' + escapeHtml(meaning) + "</p>";
    return article;
  }

  function renderReading(day) {
    const seed = seedInput.value || "athanor";
    const digest = A.digestText(seed);
    const key = day.localIso + ":" + seed;
    const dayCard = A.cardOfDay(day.localIso, digest);
    const spread = A.spreadOf(day.localIso, digest);
    document.getElementById("finger").textContent = A.fingerprint(digest);
    drawSigil(document.getElementById("sigil"), A.sigilGrid(digest), A.SCHEMES[state.scheme].sigil);
    if (key === state.readKey) return;
    state.readKey = key;
    const daySlot = document.getElementById("day-card");
    daySlot.replaceChildren(cardHtml(dayCard, "card of the day"));
    const spreadSlot = document.getElementById("spread");
    spreadSlot.replaceChildren();
    spread.forEach(function (draw) {
      spreadSlot.appendChild(cardHtml(draw, draw.position));
    });
  }

  function renderStats() {
    const minutes = Math.floor((Date.now() - started) / 60000);
    let hp = "Hp:AC";
    let hurt = false;
    if (state.battery) {
      hp = "Hp:" + state.battery.percent + (state.battery.charging ? "+" : "");
      hurt = !state.battery.charging && state.battery.percent <= 20;
    }
    const stats = document.getElementById("stats");
    stats.innerHTML =
      "<span>Dlvl:" + state.dlvl + "</span> " +
      "<span>$:" + A.formatBytes(state.disk) + "</span> " +
      "<span class=\"" + (hurt ? "hurt" : "") + "\">" + hp + "</span> " +
      "<span>T:" + minutes + "</span>";
  }

  function loadImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      state.image = img;
      state.sourceName = file.name;
      URL.revokeObjectURL(url);
      buildMask();
      push("The plate takes " + file.name + ".");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      push("That image could not be read.");
    };
    img.src = url;
  }

  function drawPlate(ctx, w, h) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, "#141414");
    skyGrad.addColorStop(0.45, "#7d7d7d");
    skyGrad.addColorStop(1, "#d5d5d5");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#efefef";
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 97) % w;
      const y = (i * 53) % Math.floor(h * 0.42);
      ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, 1);
    }

    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.2, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6e6e6e";
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.185, w * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    ctx.arc(w * 0.755, h * 0.21, w * 0.012, 0, Math.PI * 2);
    ctx.arc(w * 0.79, h * 0.16, w * 0.008, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#5a5a5a";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.2, h * 0.58, w * 0.42, h * 0.7);
    ctx.quadraticCurveTo(w * 0.62, h * 0.82, w, h * 0.64);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.fillStyle = "#3a3a3a";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.84);
    ctx.quadraticCurveTo(w * 0.35, h * 0.74, w * 0.7, h * 0.86);
    ctx.lineTo(w, h * 0.8);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    const tx = w * 0.4;
    const tw = w * 0.15;
    const top = h * 0.22;
    const base = h * 0.8;
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(tx, top, tw, base - top);
    ctx.fillRect(tx + tw * 0.28, h * 0.12, tw * 0.44, top - h * 0.12);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(tx + tw * 0.42, h * 0.06, tw * 0.16, h * 0.08);

    ctx.strokeStyle = "rgba(230,230,230,0.45)";
    ctx.lineWidth = 1;
    for (let y = top + 4; y < base; y += 5) {
      ctx.beginPath();
      ctx.moveTo(tx + 2, y);
      ctx.lineTo(tx + tw - 2, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    for (let y = top; y < base; y += 6) {
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx + tw, y + 10);
      ctx.stroke();
    }

    ctx.fillStyle = "#d8d8d8";
    ctx.beginPath();
    ctx.moveTo(tx + tw * 0.28, base);
    ctx.lineTo(tx + tw * 0.28, base - h * 0.1);
    ctx.arc(tx + tw * 0.5, base - h * 0.1, tw * 0.22, Math.PI, 0);
    ctx.lineTo(tx + tw * 0.72, base);
    ctx.fill();
    ctx.fillStyle = "#f7f7f7";
    ctx.beginPath();
    ctx.moveTo(tx + tw * 0.5, base - 2);
    ctx.quadraticCurveTo(tx + tw * 0.22, base - h * 0.08, tx + tw * 0.5, base - h * 0.14);
    ctx.quadraticCurveTo(tx + tw * 0.78, base - h * 0.08, tx + tw * 0.5, base - 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(220,220,220,0.55)";
    ctx.beginPath();
    ctx.moveTo(tx + tw * 0.55, h * 0.08);
    ctx.bezierCurveTo(tx + tw, h * 0.02, tx + tw * 1.3, h * 0.16, tx + tw * 1.5, h * 0.08);
    ctx.stroke();

    const fx = w * 0.28;
    const fy = h * 0.74;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(fx, fy + h * 0.08);
    ctx.lineTo(fx + w * 0.03, fy);
    ctx.lineTo(fx + w * 0.06, fy + h * 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx + w * 0.03, fy - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function buildMask() {
    const w = 480;
    const h = 270;
    const scratch = document.createElement("canvas");
    scratch.width = w;
    scratch.height = h;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (state.image) {
      const scale = Math.max(w / state.image.width, h / state.image.height);
      const dw = state.image.width * scale;
      const dh = state.image.height * scale;
      ctx.drawImage(state.image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      drawPlate(ctx, w, h);
    }
    const img = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i += 1) {
      const r = img.data[i * 4];
      const g = img.data[i * 4 + 1];
      const b = img.data[i * 4 + 2];
      const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      gray[i] = A.sigmoidalContrast(Math.min(1, Math.max(0, y)));
    }
    state.mask = A.floydSteinberg(gray, w, h);
    state.workW = w;
    state.workH = h;
    paintMask();
    renderLevels();
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function paintMask() {
    if (!state.mask) return;
    const w = state.workW;
    const h = state.workH;
    const scheme = A.SCHEMES[state.scheme];
    const ink = hexRgb(scheme.wall[0]);
    const paper = hexRgb(scheme.wall[1]);
    plate.width = w * 2;
    plate.height = h * 2;
    const ctx = plate.getContext("2d", { willReadFrequently: true });
    const image = ctx.createImageData(w * 2, h * 2);
    const data = image.data;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const rgb = state.mask[y * w + x] ? paper : ink;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const p = ((y * 2 + dy) * (w * 2) + (x * 2 + dx)) * 4;
            data[p] = rgb[0];
            data[p + 1] = rgb[1];
            data[p + 2] = rgb[2];
            data[p + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function drawSigil(canvas, cells, color) {
    const scale = Math.floor(canvas.width / cells.length);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    for (let y = 0; y < cells.length; y += 1) {
      for (let x = 0; x < cells[y].length; x += 1) {
        if (cells[y][x]) ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }

  function watchBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(function (battery) {
      function read() {
        state.battery = {
          percent: Math.round(battery.level * 100),
          charging: battery.charging,
        };
        renderStats();
      }
      read();
      battery.addEventListener("levelchange", read);
      battery.addEventListener("chargingchange", read);
    }).catch(function () {});
  }

  function readDisk() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (est) {
      if (est && est.quota != null) state.disk = est.quota - (est.usage || 0);
      renderStats();
    }).catch(function () {});
  }

  applyScheme();
  buildMask();
  renderSky(true);
  renderStats();
  const opening = sky();
  push("The furnace holds a low heat.");
  push("Hour of " + A.withArticle(opening.current.planet) + ". The trump is " + opening.current.trump + ".");
  push("A card of the day and three more wait on the bench.");
  watchBattery();
  readDisk();
  setInterval(function () {
    renderSky(false);
    renderStats();
  }, 1000);
})();
