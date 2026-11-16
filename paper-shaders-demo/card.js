// Which shader is on the card, and the uniforms that shader reads.
// The fragment shaders themselves stay in the vendored package.
// Nothing here touches the DOM or the network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PaperCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COLOR_COUNT = 10;

  const SHADERS = [
    {id: 'mesh', label: 'Mesh gradient', fragment: 'meshGradientFragmentShader'},
    {id: 'dots', label: 'Dot orbit', fragment: 'dotOrbitFragmentShader'},
    {id: 'metal', label: 'Liquid metal', fragment: 'liquidMetalFragmentShader'},
    {id: 'paper', label: 'Paper texture', fragment: 'paperTextureFragmentShader'},
    {id: 'glass', label: 'Fluted glass', fragment: 'flutedGlassFragmentShader'},
    {id: 'dither', label: 'Dithering', fragment: 'ditheringFragmentShader'},
  ];

  const METAL_SHAPES = ['circle', 'daisy', 'diamond', 'metaballs'];
  const DITHER_TYPES = ['random', '2x2', '4x4', '8x8'];

  const METAL_SHAPE = {none: 0, circle: 1, daisy: 2, diamond: 3, metaballs: 4};
  const DITHER_TYPE = {random: 1, '2x2': 2, '4x4': 3, '8x8': 4};
  const FIT = {none: 0, contain: 1, cover: 2};

  const BLURBS = {
    mesh: 'Mesh gradient fills the card, the headline band, and the pill.',
    dots: 'Dot orbit fills the same three surfaces. The four swatches are the dots.',
    metal: 'Liquid metal sits on a built-in shape, the letter mark. The band and the pill are the same shader, filled.',
    paper: 'Paper texture is the sheet on the card, the band, and the pill. No picture is fed in.',
    glass: 'Fluted glass refracts the picture bundled in this folder, on all three surfaces.',
    dither: 'Dithering draws a sphere in two colors. The type is the matrix.',
  };

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  function shaderById(id) {
    for (let i = 0; i < SHADERS.length; i++) {
      if (SHADERS[i].id === id) return SHADERS[i];
    }
    return null;
  }

  function vec4(color) {
    let hex = String(color == null ? '' : color).trim().replace(/^#/, '');
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map(function (char) { return char + char; }).join('');
    }
    if (hex.length === 6) hex += 'ff';
    if (!/^[0-9a-f]{8}$/i.test(hex)) return [0.5, 0.5, 0.5, 1];
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
      parseInt(hex.slice(6, 8), 16) / 255,
    ];
  }

  function initialState(reducedMotion) {
    return {
      shader: 'mesh',
      colors: ['#243056', '#e25b45', '#f0c36a', '#7eb8a2'],
      speed: 0.35,
      scale: 1,
      paused: !!reducedMotion,
      distortion: 0.7,
      swirl: 0.45,
      metalShape: 'diamond',
      ditherType: '4x4',
    };
  }

  function copy(state) {
    return {
      shader: state.shader,
      colors: state.colors.slice(),
      speed: state.speed,
      scale: state.scale,
      paused: state.paused,
      distortion: state.distortion,
      swirl: state.swirl,
      metalShape: state.metalShape,
      ditherType: state.ditherType,
    };
  }

  function selectShader(state, id) {
    const next = copy(state);
    if (shaderById(id)) next.shader = id;
    return next;
  }

  function setColor(state, index, hex) {
    const next = copy(state);
    const i = Number(index);
    if (i < 0 || i > 3 || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(hex))) return next;
    next.colors[i] = String(hex).toLowerCase();
    return next;
  }

  function setNumber(state, key, value) {
    const next = copy(state);
    const n = Number(value);
    if (!Number.isFinite(n)) return next;
    if (key === 'speed') next.speed = clamp(n, 0, 1.5);
    else if (key === 'scale') next.scale = clamp(n, 0.25, 2.5);
    else if (key === 'distortion') next.distortion = clamp(n, 0, 1);
    else if (key === 'swirl') next.swirl = clamp(n, 0, 1);
    return next;
  }

  function setChoice(state, key, value) {
    const next = copy(state);
    if (key === 'metalShape' && METAL_SHAPES.indexOf(value) >= 0) next.metalShape = value;
    else if (key === 'ditherType' && DITHER_TYPES.indexOf(value) >= 0) next.ditherType = value;
    return next;
  }

  function setPaused(state, paused) {
    const next = copy(state);
    next.paused = !!paused;
    return next;
  }

  function playbackSpeed(state) {
    if (state.paused) return 0;
    return clamp(Number(state.speed) || 0, 0, 1.5);
  }

  function colorJobs(shader) {
    if (shader === 'mesh' || shader === 'dots') return ['Spot 1', 'Spot 2', 'Spot 3', 'Spot 4'];
    if (shader === 'metal') return ['Background', 'Tint', 'Not used here', 'Not used here'];
    if (shader === 'paper') return ['Behind', 'Paper', 'Shadow', 'Not used here'];
    if (shader === 'glass') return ['Background', 'Shadow', 'Highlight', 'Not used here'];
    return ['Ink', 'Ground', 'Not used here', 'Not used here'];
  }

  function controlVisible(shader) {
    return {
      distortion: shader === 'mesh',
      swirl: shader === 'mesh',
      metalShape: shader === 'metal',
      ditherType: shader === 'dither',
    };
  }

  function sizing(scale, fit) {
    return {
      u_fit: fit,
      u_scale: scale,
      u_rotation: 0,
      u_originX: 0.5,
      u_originY: 0.5,
      u_offsetX: 0,
      u_offsetY: 0,
      u_worldWidth: 0,
      u_worldHeight: 0,
    };
  }

  function palette(colors) {
    const list = [];
    for (let i = 0; i < COLOR_COUNT; i++) {
      list.push(i < colors.length ? vec4(colors[i]) : [0, 0, 0, 0]);
    }
    return list;
  }

  function uniforms(state, assets, role) {
    const fitRole = role === 'mark' ? 'mark' : 'fill';
    const colors = palette(state.colors);
    const scale = clamp(Number(state.scale) || 1, 0.25, 2.5);
    if (state.shader === 'mesh') {
      return Object.assign(sizing(scale, FIT.cover), {
        u_colors: colors,
        u_colorsCount: 4,
        u_distortion: state.distortion,
        u_swirl: state.swirl,
        u_grainMixer: 0.15,
        u_grainOverlay: 0.08,
      });
    }
    if (state.shader === 'dots') {
      return Object.assign(sizing(scale, FIT.none), {
        u_colorBack: vec4('#14120e'),
        u_colors: colors,
        u_colorsCount: 4,
        u_size: 0.55,
        u_sizeRange: 0.35,
        u_spreading: 0.55,
        u_stepsPerColor: 1,
        u_noiseTexture: assets.noise,
      });
    }
    if (state.shader === 'metal') {
      const shape = fitRole === 'mark' ? METAL_SHAPE[state.metalShape] : METAL_SHAPE.none;
      return Object.assign(sizing(scale, fitRole === 'mark' ? FIT.contain : FIT.cover), {
        u_colorBack: colors[0],
        u_colorTint: colors[1],
        u_image: assets.empty,
        u_repetition: 3,
        u_softness: 0.15,
        u_shiftRed: 0.25,
        u_shiftBlue: 0.25,
        u_contour: 0.45,
        u_distortion: 0.12,
        u_angle: 70,
        u_shape: shape,
        u_isImage: false,
      });
    }
    if (state.shader === 'paper') {
      return Object.assign(sizing(scale, FIT.cover), {
        u_image: assets.empty,
        u_isImage: false,
        u_colorBack: colors[0],
        u_colorPaper: colors[1],
        u_colorShadow: colors[2],
        u_blending: 0,
        u_distortion: 0,
        u_clip: false,
        u_angle: 45,
        u_seed: 7,
        u_roughness: 0.55,
        u_roughnessSize: 0.4,
        u_roughnessRows: 0.35,
        u_fiber: 0.45,
        u_fiberSize: 0.5,
        u_folds: 0.25,
        u_foldSizeX: 0.4,
        u_foldSizeY: 0.35,
        u_foldOffsetX: 0.1,
        u_foldOffsetY: 0.2,
        u_wrinkles: 0.3,
        u_wrinkleSize: 0.45,
        u_crumples: 0.2,
        u_crumpleCount: 6,
        u_drops: 0.15,
        u_noiseTexture: assets.noise,
      });
    }
    if (state.shader === 'glass') {
      return Object.assign(sizing(scale, FIT.cover), {
        u_image: assets.glass,
        u_colorBack: colors[0],
        u_colorShadow: colors[1],
        u_colorHighlight: colors[2],
        u_shadows: 0.35,
        u_highlights: 0.45,
        u_size: 0.35,
        u_angle: 78,
        u_distortion: 0.55,
        u_shift: 0.1,
        u_blur: 0.15,
        u_edges: 0.2,
        u_marginLeft: 0,
        u_marginRight: 0,
        u_marginTop: 0,
        u_marginBottom: 0,
        u_stretch: 0.2,
        u_distortionShape: 1,
        u_shape: 1,
        u_grainMixer: 0.1,
        u_grainOverlay: 0.12,
      });
    }
    return Object.assign(sizing(scale, FIT.cover), {
      u_colorFront: colors[0],
      u_colorBack: colors[1],
      u_shape: 7,
      u_type: DITHER_TYPE[state.ditherType],
      u_pxSize: 3,
    });
  }

  return {
    COLOR_COUNT: COLOR_COUNT,
    SHADERS: SHADERS,
    METAL_SHAPES: METAL_SHAPES,
    DITHER_TYPES: DITHER_TYPES,
    METAL_SHAPE: METAL_SHAPE,
    DITHER_TYPE: DITHER_TYPE,
    BLURBS: BLURBS,
    vec4: vec4,
    initialState: initialState,
    selectShader: selectShader,
    setColor: setColor,
    setNumber: setNumber,
    setChoice: setChoice,
    setPaused: setPaused,
    playbackSpeed: playbackSpeed,
    colorJobs: colorJobs,
    controlVisible: controlVisible,
    blurb: function (id) { return BLURBS[id] || ''; },
    uniforms: uniforms,
    shaderById: shaderById,
  };
});
