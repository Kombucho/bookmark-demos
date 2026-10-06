/* High-level controls -> CSS variables and a short design brief. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ThemeStudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const presets = [
    {
      id: "newsroom",
      name: "Newsroom",
      words: "Serif, sharp, daylight",
      hue: 36,
      contrast: 74,
      roundness: 4,
      density: 56,
      type: "editorial",
      shadow: 8,
      ground: "day",
    },
    {
      id: "night-market",
      name: "Night market",
      words: "Poster, dusk, deep shadow",
      hue: 318,
      contrast: 80,
      roundness: 20,
      density: 48,
      type: "poster",
      shadow: 82,
      ground: "dusk",
    },
    {
      id: "glasshouse",
      name: "Glasshouse",
      words: "Soft, pill, airy",
      hue: 146,
      contrast: 42,
      roundness: 96,
      density: 84,
      type: "soft",
      shadow: 34,
      ground: "day",
    },
    {
      id: "signal",
      name: "Signal",
      words: "Mono, ink, dense",
      hue: 214,
      contrast: 92,
      roundness: 2,
      density: 16,
      type: "technical",
      shadow: 4,
      ground: "ink",
    },
    {
      id: "orchard",
      name: "Orchard",
      words: "Serif, dusk, olive",
      hue: 92,
      contrast: 62,
      roundness: 14,
      density: 50,
      type: "editorial",
      shadow: 28,
      ground: "dusk",
    },
    {
      id: "ticket",
      name: "Ticket",
      words: "Poster, flat, vermillion",
      hue: 18,
      contrast: 88,
      roundness: 0,
      density: 30,
      type: "poster",
      shadow: 2,
      ground: "day",
    },
  ];

  const typeSpecs = {
    editorial: {
      display: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      body: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
      mono: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
      weight: "600",
      tracking: "-0.03em",
      transform: "none",
      leading: "1.45",
      sentence: "Type is an old-style serif for titles and body. Labels and the metric stay monospace.",
    },
    technical: {
      display: 'ui-sans-serif, "Segoe UI", system-ui, sans-serif',
      body: 'ui-sans-serif, "Segoe UI", system-ui, sans-serif',
      mono: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
      weight: "700",
      tracking: "-0.04em",
      transform: "none",
      leading: "1.35",
      sentence: "Interface text is a plain sans. Numbers, badges, and meta labels are monospace.",
    },
    soft: {
      display: 'Verdana, "Trebuchet MS", "Gill Sans", sans-serif',
      body: 'Verdana, "Trebuchet MS", "Gill Sans", sans-serif',
      mono: 'ui-monospace, Menlo, Consolas, monospace',
      weight: "600",
      tracking: "-0.015em",
      transform: "none",
      leading: "1.5",
      sentence: "Type is a rounded humanist sans, medium weight, with relaxed line height.",
    },
    poster: {
      display: '"Arial Narrow", "Helvetica Neue", Haettenschweiler, Impact, sans-serif',
      body: '"Segoe UI", Verdana, sans-serif',
      mono: 'ui-monospace, Menlo, Consolas, monospace',
      weight: "700",
      tracking: "0.08em",
      transform: "uppercase",
      leading: "1.15",
      sentence: "Titles and buttons are condensed, uppercase, and widely tracked. Body copy stays a regular sans and is not shouted.",
    },
  };

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hueName(hue) {
    const h = ((hue % 360) + 360) % 360;
    const bands = [
      [12, "red"],
      [28, "vermillion"],
      [48, "orange"],
      [70, "gold"],
      [98, "lime"],
      [150, "green"],
      [178, "teal"],
      [200, "cyan"],
      [255, "blue"],
      [290, "violet"],
      [325, "magenta"],
      [345, "rose"],
      [360, "red"],
    ];
    for (let i = 0; i < bands.length; i += 1) {
      if (h <= bands[i][0]) return bands[i][1];
    }
    return "red";
  }

  function linearToSrgb(channel) {
    const value = Math.max(0, channel);
    if (value <= 0.0031308) return 12.92 * value;
    return 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  }

  function oklabToLinear(l, a, b) {
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ * l_ * l_;
    const m3 = m_ * m_ * m_;
    const s3 = s_ * s_ * s_;
    return [
      4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
      -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
      -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
    ];
  }

  function inGamut(rgb) {
    return rgb.every(function (channel) { return channel >= -0.002 && channel <= 1.002; });
  }

  function hexByte(channel) {
    return Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, "0");
  }

  function color(lightness, chroma, hue, alpha) {
    const l = clamp(lightness, 0, 100) / 100;
    const h = ((hue % 360) + 360) % 360;
    let c = Math.max(0, chroma);
    let linear = [0, 0, 0];
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const rad = (h * Math.PI) / 180;
      linear = oklabToLinear(l, c * Math.cos(rad), c * Math.sin(rad));
      if (inGamut(linear)) break;
      c *= 0.82;
    }
    const rgb = linear.map(linearToSrgb);
    if (alpha == null || alpha >= 0.999) return "#" + rgb.map(hexByte).join("");
    const parts = rgb.map(function (channel) { return Math.round(clamp(channel, 0, 1) * 255); });
    return "rgba(" + parts[0] + ", " + parts[1] + ", " + parts[2] + ", " + Math.round(alpha * 1000) / 1000 + ")";
  }

  function normalize(state) {
    const type = typeSpecs[state.type] ? state.type : "editorial";
    const ground = state.ground === "dusk" || state.ground === "ink" ? state.ground : "day";
    return {
      hue: clamp(Number(state.hue) || 0, 0, 360),
      contrast: clamp(Number(state.contrast) || 0, 0, 100),
      roundness: clamp(Number(state.roundness) || 0, 0, 100),
      density: clamp(Number(state.density) || 0, 0, 100),
      shadow: clamp(Number(state.shadow) || 0, 0, 100),
      type: type,
      ground: ground,
    };
  }

  function surfaces(state) {
    const t = state.contrast / 100;
    const h = state.hue;
    if (state.ground === "ink") {
      return {
        paperL: lerp(28, 16, t),
        paperC: lerp(0.025, 0.045, t),
        raisedL: lerp(36, 23, t),
        inkL: lerp(86, 97, t),
        inkC: 0.012,
        accentL: lerp(78, 68, t),
        accentC: lerp(0.1, 0.17, t),
      };
    }
    if (state.ground === "dusk") {
      return {
        paperL: lerp(40, 24, t),
        paperC: lerp(0.03, 0.055, t),
        raisedL: lerp(48, 32, t),
        inkL: lerp(92, 98, t),
        inkC: 0.016,
        accentL: lerp(82, 72, t),
        accentC: lerp(0.09, 0.16, t),
      };
    }
    return {
      paperL: lerp(86, 97, t),
      paperC: lerp(0.03, 0.012, t),
      raisedL: lerp(93, 99, t),
      inkL: lerp(36, 14, t),
      inkC: lerp(0.035, 0.02, t),
      accentL: lerp(58, 46, t),
      accentC: lerp(0.11, 0.17, t),
    };
  }

  function buildTheme(input) {
    const state = normalize(input);
    const face = surfaces(state);
    const h = state.hue;
    const spec = typeSpecs[state.type];
    const paper = color(face.paperL, face.paperC, h);
    const raised = color(face.raisedL, face.paperC + 0.006, h);
    const ink = color(face.inkL, face.inkC, h);
    const muted = color(lerp(face.inkL, face.paperL, state.ground === "day" ? 0.42 : 0.38), face.inkC, h);
    const lineMix = state.ground === "day" ? lerp(0.18, 0.34, state.contrast / 100) : lerp(0.16, 0.42, state.contrast / 100);
    const line = color(lerp(face.paperL, face.inkL, lineMix), face.paperC, h);
    const accent = color(face.accentL, face.accentC, h);
    const accentInk = color(face.accentL > 62 ? 16 : 98, 0.02, h);
    const accentSoft = color(
      lerp(face.paperL, face.accentL, state.ground === "day" ? 0.28 : 0.42),
      face.accentC * 0.55,
      h
    );
    const dangerL = state.ground === "day" ? lerp(50, 42, state.contrast / 100) : lerp(74, 66, state.contrast / 100);
    const danger = color(dangerL, 0.15, 25);
    const dangerInk = color(dangerL > 70 ? 22 : 98, 0.03, 25);
    const okL = state.ground === "day" ? lerp(46, 38, state.contrast / 100) : lerp(78, 70, state.contrast / 100);
    const ok = color(okL, 0.12, 152);
    const okInk = color(okL > 70 ? 18 : 98, 0.02, 152);

    const round = state.roundness / 100;
    const dense = state.density / 100;
    const lift = state.shadow / 100;
    const radiusControl = round >= 0.86 ? "999px" : (round * 16).toFixed(1) + "px";
    const radiusSurface = (round * 32).toFixed(1) + "px";
    const shadowAlpha = lift * (state.ground === "day" ? 0.28 : 0.5);
    const shadowColor = color(state.ground === "day" ? 18 : 6, 0.02, h, shadowAlpha);
    const shadowSurface = lift < 0.04
      ? "none"
      : "0 " + lerp(1, 22, lift).toFixed(1) + "px " + lerp(2, 48, lift).toFixed(1) + "px " + shadowColor;
    const shadowPop = lift < 0.04
      ? "none"
      : "0 " + lerp(1, 8, lift).toFixed(1) + "px " + lerp(1, 16, lift).toFixed(1) + "px " + shadowColor;
    const borderWidth = state.roundness < 8 && state.contrast > 72 ? "1.5px" : "1px";

    const tokens = {
      "--color-paper": paper,
      "--color-paper-raised": raised,
      "--color-ink": ink,
      "--color-muted": muted,
      "--color-line": line,
      "--color-accent": accent,
      "--color-accent-ink": accentInk,
      "--color-accent-soft": accentSoft,
      "--color-danger": danger,
      "--color-danger-ink": dangerInk,
      "--color-ok": ok,
      "--color-ok-ink": okInk,
      "--font-display": spec.display,
      "--font-body": spec.body,
      "--font-mono": spec.mono,
      "--text-display": lerp(26, 46, dense).toFixed(1) + "px",
      "--text-body": lerp(13.5, 17.5, dense).toFixed(1) + "px",
      "--text-meta": lerp(11, 13, dense).toFixed(1) + "px",
      "--leading-body": spec.leading,
      "--tracking-display": spec.tracking,
      "--weight-display": spec.weight,
      "--transform-display": spec.transform,
      "--radius-control": radiusControl,
      "--radius-surface": radiusSurface,
      "--space-page": lerp(12, 32, dense).toFixed(0) + "px",
      "--space-stack": lerp(8, 22, dense).toFixed(0) + "px",
      "--control-height": lerp(32, 50, dense).toFixed(0) + "px",
      "--shadow-surface": shadowSurface,
      "--shadow-pop": shadowPop,
      "--border-width": borderWidth,
    };

    return {
      state: state,
      tokens: tokens,
      css: toCSS(tokens),
      brief: brief(state, spec),
      swatches: [
        ["Paper", paper],
        ["Ink", ink],
        ["Accent", accent],
        ["Danger", danger],
        ["Ok", ok],
      ],
    };
  }

  function toCSS(tokens) {
    const lines = Object.keys(tokens).map(function (key) {
      return "  " + key + ": " + tokens[key] + ";";
    });
    return ":root {\n" + lines.join("\n") + "\n}";
  }

function band(value, low, mid, words) {
  if (value < low) return words[0];
  if (value < mid) return words[1];
  return words[2];
}

  function brief(state, spec) {
    const contrast = band(state.contrast, 35, 70, ["soft and low", "medium", "stark"]);
    const round = state.roundness < 8
      ? "nearly square"
      : state.roundness < 40
        ? "slightly rounded"
        : state.roundness < 75
          ? "clearly rounded"
          : "pill-shaped";
    const density = band(state.density, 30, 65, ["compact", "comfortable", "airy"]);
    const shadow = state.shadow < 8
      ? "flat, so separate surfaces with the border token rather than a drop shadow"
      : state.shadow < 45
        ? "lightly lifted"
        : state.shadow < 75
          ? "clearly lifted off the ground"
          : "deeply shadowed";
    const ground = {
      day: "a light ground",
      dusk: "a dusk ground, mid-dark, with light type",
      ink: "an ink ground, near-black, with light type",
    }[state.ground];
    const match = presets.find(function (preset) {
      return ["hue", "contrast", "roundness", "density", "type", "shadow", "ground"].every(function (key) {
        return preset[key] === state[key];
      });
    });
    const lines = [
      "Design brief",
      "",
      "Build on " + ground + ". The brand hue is " + hueName(state.hue) + " (" + Math.round(state.hue) + "°). Contrast is " + contrast + ": use the paper and ink tokens below instead of inventing new neutrals per screen.",
      "Corners are " + round + ". Controls use --radius-control. Cards, tiles, and other surfaces use --radius-surface.",
      "Density is " + density + ". Size hit targets with --control-height. Space a screen with --space-page and stacks with --space-stack.",
      spec.sentence,
      "Elevation is " + shadow + ".",
      "The accent is the only brand color. Primary actions pair --color-accent with --color-accent-ink. Quiet actions are paper with a line. Destructive actions use --color-danger and --color-danger-ink. Status uses --color-ok. Do not add a second highlight.",
      "When you add a screen, match this personality. Do not fall back to a generic indigo UI kit, default 8px radii, or an extra typeface.",
    ];
    if (match) lines.push("This matches the " + match.name + " preset.");
    else lines.push("These values are hand-tuned and do not match a named preset exactly.");
    return lines.join("\n");
  }

function exportText(theme) {
  return theme.css + "\n\n" + theme.brief + "\n";
}

  function matchPreset(input) {
    const state = normalize(input);
    return presets.find(function (preset) {
      return ["hue", "contrast", "roundness", "density", "type", "shadow", "ground"].every(function (key) {
        return preset[key] === state[key];
      });
    }) || null;
  }

  return {
    presets: presets,
    buildTheme: buildTheme,
    exportText: exportText,
    hueName: hueName,
    matchPreset: matchPreset,
  };
});
