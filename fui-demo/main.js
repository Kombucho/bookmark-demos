// Cinematic FUI, after kc’s three.js portfolio pass.
// Scroll on the page is the only input. Each frame:
// 1. Instanced quads (rings, ticks, bars, grids, readouts) draw into one
//    black-and-white mask using add, subtract, and invert blends.
// 2. That mask is mapped onto a tilted plane.
// 3. A final shader grades the mask through a palette and adds grain,
//    a cheap depth blur, and chromatic aberration.

import * as THREE from 'three';

const PALETTES = {
  amber: {stops: ['#140c08', '#e39b3a', '#fff1d2'], bg: '#070605'},
  phosphor: {stops: ['#031208', '#1f8a4c', '#d7ffd0'], bg: '#020806'},
  ice: {stops: ['#071018', '#3aa6c8', '#e7fbff'], bg: '#05080c'},
  signal: {stops: ['#160812', '#d14b8a', '#ffe1c4'], bg: '#070406'},
};

const NAMES = ['Approach', 'Lock', 'Sweep', 'Hold'];
const BEARINGS = [14, 28, 351, 366];
const RANGES = [2.4, 1.55, 1.1, 1.8];

const MASK_VERT = `
attribute float aShape;
attribute vec4 aParam;
attribute float aAlpha;
varying vec2 vUv;
varying float vShape;
varying vec4 vParam;
varying float vAlpha;
void main() {
  vUv = uv;
  vShape = aShape;
  vParam = aParam;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const MASK_FRAG = `
uniform float uDiscard;
varying vec2 vUv;
varying float vShape;
varying vec4 vParam;
varying float vAlpha;

float ring(vec2 p, float thick) {
  float d = abs(length(p) - 0.36);
  return 1.0 - smoothstep(thick, thick + 0.008, d);
}

float ticks(vec2 p, float freq, float duty, float thick, float phase) {
  float r = length(p);
  float band = 1.0 - smoothstep(thick, thick + 0.012, abs(r - 0.34));
  float a = atan(p.y, p.x) + phase;
  float spoke = abs(fract((a / 6.2831853) * freq) - 0.5);
  float mark = 1.0 - smoothstep(duty, duty + 0.05, spoke);
  return band * mark;
}

float bars(vec2 p, float freq, float duty, float shift) {
  float yBand = 1.0 - smoothstep(0.42, 0.48, abs(p.y));
  float x = p.x + 0.5 + shift;
  float cells = abs(fract(x * freq) - 0.5);
  float seg = 1.0 - smoothstep(duty, duty + 0.05, cells);
  return yBand * seg;
}

float grid(vec2 p, float freq, float thick) {
  vec2 g = abs(fract((p + 0.5) * freq) - 0.5);
  return 1.0 - smoothstep(thick, thick + 0.02, min(g.x, g.y));
}

float readout(vec2 p, float seed) {
  vec2 q = p + 0.5;
  vec2 cell = floor(q * vec2(8.0, 3.0));
  float h = fract(sin(dot(cell + floor(seed), vec2(127.1, 311.7))) * 43758.5453);
  vec2 f = fract(q * vec2(8.0, 3.0));
  float box = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  return step(0.42, h) * box * inside;
}

float bracket(vec2 p, float thick) {
  float nearX = 1.0 - smoothstep(thick, thick + 0.012, abs(p.x + 0.34));
  float nearY = 1.0 - smoothstep(thick, thick + 0.012, abs(p.y + 0.34));
  float armX = step(p.y, 0.02) * nearX;
  float armY = step(p.x, 0.02) * nearY;
  return clamp(max(armX, armY), 0.0, 1.0);
}

float crosshair(vec2 p, float thick) {
  float v = 1.0 - smoothstep(thick, thick + 0.01, abs(p.x));
  float h = 1.0 - smoothstep(thick, thick + 0.01, abs(p.y));
  float box = step(abs(p.x), 0.46) * step(abs(p.y), 0.46);
  return max(v, h) * box;
}

float fill(vec2 p) {
  vec2 d = abs(p) - vec2(0.46);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(0.0, 0.03, sd);
}

float disc(vec2 p, float radius) {
  return 1.0 - smoothstep(radius, radius + 0.02, length(p));
}

void main() {
  if (vAlpha < 0.01) discard;
  vec2 p = vUv - 0.5;
  float ink = 0.0;
  if (vShape < 0.5) ink = ring(p, vParam.x);
  else if (vShape < 1.5) ink = ticks(p, vParam.y, vParam.w, vParam.x, vParam.z);
  else if (vShape < 2.5) ink = bars(p, vParam.y, vParam.w, vParam.z);
  else if (vShape < 3.5) ink = grid(p, vParam.y, vParam.x);
  else if (vShape < 4.5) ink = readout(p, vParam.z);
  else if (vShape < 5.5) ink = bracket(p, vParam.x);
  else if (vShape < 6.5) ink = crosshair(p, vParam.x);
  else if (vShape < 7.5) ink = fill(p);
  else ink = disc(p, vParam.x);
  ink *= vAlpha;
  if (uDiscard > 0.5) {
    if (ink < 0.45) discard;
    gl_FragColor = vec4(1.0);
    return;
  }
  if (ink < 0.004) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, ink);
}
`;

const PLANE_VERT = `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vDepth = clamp((-mvPosition.z - 1.2) / 2.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PLANE_FRAG = `
varying vec2 vUv;
varying float vDepth;
uniform sampler2D tMask;
void main() {
  float m = texture2D(tMask, vUv).r;
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float border = 1.0 - smoothstep(0.003, 0.012, edge);
  float lifted = max(m, 0.05);
  lifted = max(lifted, border);
  gl_FragColor = vec4(lifted, vDepth, 0.0, 1.0);
}
`;

const FINAL_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FINAL_FRAG = `
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec3 uBg;
uniform float uFocus;
uniform float uDof;
uniform float uCa;
uniform float uGrain;
uniform float uTime;
uniform float uMask;

vec3 grade(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.55) return mix(uPal0, uPal1, smoothstep(0.0, 0.55, t));
  return mix(uPal1, uPal2, smoothstep(0.55, 1.0, t));
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 graded(vec2 uv) {
  vec4 sampleA = texture2D(tScene, uv);
  if (sampleA.a < 0.5) return uBg;
  vec3 base = grade(sampleA.r);
  vec2 ca = (uv - 0.5) * uCa;
  float r = texture2D(tScene, uv + ca).r;
  float b = texture2D(tScene, uv - ca).r;
  vec3 fringed = vec3(grade(r).r, base.g, grade(b).b);
  return mix(base, fringed, 0.85);
}

void main() {
  vec4 center = texture2D(tScene, vUv);
  if (uMask > 0.5) {
    vec3 raw = center.a < 0.5 ? vec3(0.0) : vec3(center.r);
    gl_FragColor = linearToOutputTexel(vec4(raw, 1.0));
    return;
  }
  float coc = center.a < 0.5 ? 0.0 : abs(center.g - uFocus) * uDof;
  vec2 ax = vec2(coc, 0.0);
  vec2 ay = vec2(0.0, coc);
  vec2 d1 = vec2(coc, coc) * 0.7;
  vec2 d2 = vec2(-coc, coc) * 0.7;
  vec3 color = graded(vUv);
  color += graded(vUv + ax);
  color += graded(vUv - ax);
  color += graded(vUv + ay);
  color += graded(vUv - ay);
  color += graded(vUv + d1);
  color += graded(vUv - d1);
  color += graded(vUv + d2);
  color += graded(vUv - d2);
  color /= 9.0;
  float vig = smoothstep(0.95, 0.28, length(vUv - 0.5));
  color *= mix(0.8, 1.0, vig);
  float grain = hash(gl_FragCoord.xy + fract(uTime) * 60.0) - 0.5;
  color = clamp(color + grain * uGrain, 0.0, 1.0);
  gl_FragColor = linearToOutputTexel(vec4(color, 1.0));
}
`;

const canvas = document.querySelector('#view');
const fail = document.querySelector('#fail');
const sectionEl = document.querySelector('#section');
const telemetryEl = document.querySelector('#telemetry');
const modeEl = document.querySelector('#mode');
const maskButton = document.querySelector('#mask');
const paletteEl = document.querySelector('#palette');

function showFail(message) {
  fail.hidden = false;
  fail.textContent = message || 'This demo did not start.';
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
  });
} catch (err) {
  showFail('WebGL is unavailable in this browser.');
  throw err;
}

if (!renderer.getContext()) {
  showFail('WebGL is unavailable in this browser.');
} else {
  start();
}

function start() {
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    const vertex = gl.getShaderInfoLog(vertexShader).trim();
    const fragment = gl.getShaderInfoLog(fragmentShader).trim();
    showFail(vertex || fragment || 'The HUD shader did not compile.');
  };

  const halfH = 0.62;
  const halfW = halfH * (16 / 9);
  const maskCam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 10);
  maskCam.position.z = 2;

  const maskRT = new THREE.WebGLRenderTarget(1280, 720, {
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
  maskRT.texture.colorSpace = THREE.NoColorSpace;
  maskRT.texture.minFilter = THREE.LinearFilter;
  maskRT.texture.magFilter = THREE.LinearFilter;
  maskRT.texture.generateMipmaps = false;

  const sceneRT = new THREE.WebGLRenderTarget(2, 2, {
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
  sceneRT.texture.colorSpace = THREE.NoColorSpace;
  sceneRT.texture.minFilter = THREE.LinearFilter;
  sceneRT.texture.magFilter = THREE.LinearFilter;
  sceneRT.texture.generateMipmaps = false;

  const maskScenes = {
    add: new THREE.Scene(),
    sub: new THREE.Scene(),
    invert: new THREE.Scene(),
  };
  const groups = buildGroups(maskScenes);

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 12);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.78, 1),
    new THREE.ShaderMaterial({
      uniforms: {tMask: {value: maskRT.texture}},
      vertexShader: PLANE_VERT,
      fragmentShader: PLANE_FRAG,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    })
  );
  world.add(plane);

  const finalScene = new THREE.Scene();
  const finalMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: {value: sceneRT.texture},
      uPal0: {value: new THREE.Vector3()},
      uPal1: {value: new THREE.Vector3()},
      uPal2: {value: new THREE.Vector3()},
      uBg: {value: new THREE.Vector3()},
      uFocus: {value: 0.5},
      uDof: {value: 0.2},
      uCa: {value: 0.02},
      uGrain: {value: 0.05},
      uTime: {value: 0},
      uMask: {value: 0},
    },
    vertexShader: FINAL_VERT,
    fragmentShader: FINAL_FRAG,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  finalScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMat));
  const finalCam = new THREE.Camera();

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motionQuery.matches;
  let maskView = false;
  let target = 0;
  let shown = 0;
  let clock = 0;
  let last = 0;
  let dirty = true;
  const dummy = new THREE.Object3D();
  const focusPoint = new THREE.Vector3();

  applyPalette(paletteEl.value);
  resize();
  readScroll();
  shown = target;

  maskButton.addEventListener('click', () => {
    maskView = !maskView;
    maskButton.setAttribute('aria-pressed', maskView ? 'true' : 'false');
    maskButton.textContent = maskView ? 'Show graded' : 'Show mask';
    dirty = true;
  });
  paletteEl.addEventListener('change', () => {
    applyPalette(paletteEl.value);
    dirty = true;
  });
  document.querySelectorAll('[data-section]').forEach(button => {
    button.addEventListener('click', () => {
      const section = document.getElementById(button.dataset.section);
      section.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block: 'start'});
    });
  });
  motionQuery.addEventListener('change', () => {
    reduce = motionQuery.matches;
    dirty = true;
  });
  window.addEventListener('scroll', readScroll, {passive: true});
  window.addEventListener('resize', () => {
    resize();
    readScroll();
    dirty = true;
  });

  let raf = requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  });

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (!reduce) clock += dt;
    const previous = shown;
    if (reduce) shown = target;
    else shown += (target - shown) * (1 - Math.exp(-dt * 7));
    const moving = Math.abs(shown - previous) > 0.00005 || Math.abs(shown - target) > 0.0004;
    if (!moving && reduce && !dirty) return;
    dirty = false;
    draw();
  }

  function draw() {
    const mix = sectionMix(shown);
    layout(mix, reduce ? 0 : clock);
    const cam = blendCam(mix);
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    plane.rotation.set(cam.tilt, cam.yaw, cam.roll);
    fitPlane();

    renderer.setRenderTarget(maskRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(maskScenes.add, maskCam);
    renderer.render(maskScenes.sub, maskCam);
    renderer.render(maskScenes.invert, maskCam);

    focusPoint.set(0, 0, 0);
    focusPoint.applyMatrix4(camera.matrixWorldInverse);
    const focus = THREE.MathUtils.clamp((-focusPoint.z - 1.2) / 2, 0, 1);
    finalMat.uniforms.uFocus.value = focus;
    finalMat.uniforms.uTime.value = clock;
    finalMat.uniforms.uMask.value = maskView ? 1 : 0;

    renderer.setRenderTarget(sceneRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(world, camera);

    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(finalScene, finalCam);

    const nameIndex = mix.s < 0.5 ? mix.i : Math.min(3, mix.i + 1);
    const name = NAMES[nameIndex];
    if (sectionEl.textContent !== name) sectionEl.textContent = name;
    const bearing = ((BEARINGS[mix.i] + (BEARINGS[mix.i + 1] - BEARINGS[mix.i]) * mix.s) % 360 + 360) % 360;
    const range = RANGES[mix.i] + (RANGES[mix.i + 1] - RANGES[mix.i]) * mix.s;
    const telemetry = `${String(Math.round(bearing)).padStart(3, '0')}° · range ${range.toFixed(2)}`;
    if (telemetryEl.textContent !== telemetry) telemetryEl.textContent = telemetry;
    const mode = maskView ? 'Black-and-white mask' : 'Graded output';
    if (modeEl.textContent !== mode) modeEl.textContent = mode;
    document.querySelectorAll('[data-section]').forEach((button, index) => {
      button.setAttribute('aria-current', index === nameIndex ? 'true' : 'false');
    });
  }

  function layout(mix, time) {
    for (const group of groups) {
      group.items.forEach((element, index) => {
        const key = mixKey(element.keys[mix.i], element.keys[mix.i + 1], mix.s);
        const phase = key[7] + time * element.spin;
        dummy.position.set(key[0], key[1], 0);
        dummy.rotation.set(0, 0, key[2]);
        dummy.scale.set(Math.max(key[3], 0.0001), Math.max(key[4], 0.0001), 1);
        dummy.updateMatrix();
        group.mesh.setMatrixAt(index, dummy.matrix);
        const offset = index * 4;
        group.params[offset] = key[5];
        group.params[offset + 1] = key[6];
        group.params[offset + 2] = phase;
        group.params[offset + 3] = key[8];
        group.alpha[index] = key[9];
      });
      group.mesh.instanceMatrix.needsUpdate = true;
      group.paramAttr.needsUpdate = true;
      group.alphaAttr.needsUpdate = true;
    }
  }

  function fitPlane() {
    const distance = camera.position.length();
    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
    const visibleW = visibleH * camera.aspect;
    const fit = Math.min((visibleW * 0.8) / 1.78, (visibleH * 0.8) / 1);
    plane.scale.setScalar(Math.max(0.2, fit));
  }

  function resize() {
    const dpr = pickDpr();
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    sceneRT.setSize(Math.max(2, size.x), Math.max(2, size.y));
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }

  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = max <= 1 ? 0 : Math.min(1, Math.max(0, window.scrollY / max));
  }

  function applyPalette(name) {
    const palette = PALETTES[name] || PALETTES.amber;
    finalMat.uniforms.uPal0.value.copy(linear(palette.stops[0]));
    finalMat.uniforms.uPal1.value.copy(linear(palette.stops[1]));
    finalMat.uniforms.uPal2.value.copy(linear(palette.stops[2]));
    finalMat.uniforms.uBg.value.copy(linear(palette.bg));
  }
}

function pickDpr() {
  const capped = Math.min(window.devicePixelRatio || 1, 1.5);
  const area = Math.max(1, window.innerWidth * window.innerHeight);
  const budget = 1920 * 1080;
  if (area * capped * capped <= budget) return capped;
  return Math.min(capped, Math.sqrt(budget / area));
}

function linear(hex) {
  const color = new THREE.Color(hex);
  return new THREE.Vector3(color.r, color.g, color.b);
}

function sectionMix(t) {
  if (t >= 1) return {i: 2, s: 1};
  const x = t * 3;
  const i = Math.min(2, Math.floor(x));
  const f = x - i;
  return {i, s: f * f * (3 - 2 * f)};
}

function mixKey(a, b, t) {
  const out = new Array(10);
  for (let i = 0; i < 10; i += 1) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

function blendCam(mix) {
  const cams = [
    {pos: [0.0, 0.08, 2.45], tilt: -0.42, yaw: 0.04, roll: 0.0},
    {pos: [0.32, 0.02, 2.05], tilt: -0.55, yaw: 0.22, roll: 0.03},
    {pos: [-0.28, 0.16, 1.9], tilt: -0.3, yaw: -0.24, roll: -0.04},
    {pos: [0.06, 0.0, 2.25], tilt: -0.46, yaw: 0.08, roll: 0.01},
  ];
  const a = cams[mix.i];
  const b = cams[mix.i + 1];
  return {
    pos: [
      a.pos[0] + (b.pos[0] - a.pos[0]) * mix.s,
      a.pos[1] + (b.pos[1] - a.pos[1]) * mix.s,
      a.pos[2] + (b.pos[2] - a.pos[2]) * mix.s,
    ],
    tilt: a.tilt + (b.tilt - a.tilt) * mix.s,
    yaw: a.yaw + (b.yaw - a.yaw) * mix.s,
    roll: a.roll + (b.roll - a.roll) * mix.s,
  };
}

function k(x, y, rot, sx, sy, thick, freq, phase, duty, alpha) {
  return [x, y, rot, sx, sy, thick, freq, phase, duty, alpha];
}

function item(blend, shape, spin, keys) {
  return {blend, shape, spin, keys};
}

function buildElements() {
  const primary = [
    [0.0, 0.02, 0.96],
    [-0.36, 0.02, 0.6],
    [0.46, 0.12, 0.38],
    [0.02, 0.0, 0.66],
  ];
  const secondary = [
    [0.24, -0.08, 0.7],
    [0.08, 0.1, 0.42],
    [-0.5, -0.06, 0.32],
    [0.2, 0.06, 0.48],
  ];
  const elements = [];

  elements.push(item('add', 3, 0, [
    k(0, 0, 0, 2.05, 1.12, 0.028, 8, 0, 0.5, 0.42),
    k(-0.08, 0, 0.03, 2.15, 1.16, 0.022, 11, 0, 0.5, 0.55),
    k(0, 0, 0, 2.2, 1.2, 0.018, 16, 0, 0.5, 0.72),
    k(0, 0, 0, 1.55, 0.9, 0.03, 9, 0, 0.5, 0.34),
  ]));
  elements.push(item('add', 3, 0, [
    k(-0.72, 0.36, 0, 0.55, 0.36, 0.04, 5, 0, 0.5, 0.5),
    k(0.7, -0.28, 0, 0.7, 0.42, 0.035, 6, 0, 0.5, 0.7),
    k(-0.2, 0.2, 0.2, 0.9, 0.5, 0.03, 8, 0, 0.5, 0.45),
    k(0.55, 0.3, 0, 0.4, 0.28, 0.045, 4, 0, 0.5, 0.4),
  ]));

  elements.push(ring(primary, 0.1));
  elements.push(ring(secondary, 0.06));
  elements.push(ring([
    [-0.18, 0.12, 0.3],
    [-0.36, 0.02, 0.22],
    [0.46, 0.12, 0.16],
    [-0.22, -0.04, 0.28],
  ], 0));
  elements.push(tickRing(primary, 1.08, 18, 0.35));
  elements.push(tickRing(secondary, 1.12, 11, -0.28));

  for (let i = 0; i < 16; i += 1) {
    const keys = [0, 1, 2, 3].map(section => {
      if (section === 2) {
        const x = -0.78 + (i / 15) * 1.56;
        return k(x, -0.3, 0, 0.014, 0.045 + (i % 5) * 0.016, 0.02, 1, 0, 0.5, 1);
      }
      const radius = [0.5, 0.32, 0.22, 0.42][section];
      const len = [0.08, 0.055, 0.1, 0.07][section];
      const shift = [0, 0.55, 0, 0.3][section];
      const angle = (i / 16) * Math.PI * 2 - Math.PI / 2 + shift;
      return k(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.9, angle + Math.PI / 2, 0.012, len, 0.02, 1, 0, 0.5, 1);
    });
    elements.push(item('add', 7, 0, keys));
  }

  for (let i = 0; i < 5; i += 1) {
    elements.push(item('add', 2, 0, [
      k(0.78, 0.24 - i * 0.09, 0, 0.32, 0.045, 0.02, 6, i * 0.17, 0.22, i < 2 ? 0.95 : 0.15),
      k(0.68, 0.3 - i * 0.11, 0, 0.46, 0.05, 0.02, 8, i * 0.13, 0.3, 1),
      k(-0.55 + i * 0.26, 0.42, 0, 0.2, 0.05, 0.02, 4, i * 0.2, 0.34, 1),
      k(0.62, -0.18 - i * 0.055, 0, 0.36, 0.032, 0.02, 7, i * 0.11, 0.26, i < 4 ? 1 : 0.35),
    ]));
  }

  const spots = [
    [[-0.78, 0.4], [-0.78, -0.4], [0.78, 0.4], [0.78, -0.4]],
    [[0.82, 0.36], [0.82, 0.18], [0.82, 0.0], [0.82, -0.18]],
    [[-0.62, -0.46], [-0.2, -0.46], [0.22, -0.46], [0.64, -0.46]],
    [[-0.72, -0.44], [0.72, -0.44], [0.72, 0.4], [-0.72, 0.4]],
  ];
  for (let i = 0; i < 4; i += 1) {
    elements.push(item('add', 4, 0.55, [0, 1, 2, 3].map(section => {
      const spot = spots[section][i];
      const alpha = section === 3 && i > 1 ? 0.25 : 1;
      return k(spot[0], spot[1], 0, 0.32, 0.12, 0.02, 1, 1 + section * 3 + i, 0.5, alpha);
    })));
  }

  const corners = [
    [-1, -1, 0],
    [1, -1, Math.PI / 2],
    [1, 1, Math.PI],
    [-1, 1, -Math.PI / 2],
  ];
  const frames = [
    [0.62, 0.36, 0.42],
    [0.86, 0.46, 0.7],
    [0.7, 0.4, 0.5],
    [0.58, 0.34, 0.56],
  ];
  for (const corner of corners) {
    elements.push(item('add', 5, 0, frames.map((frame, section) => k(
      corner[0] * frame[0],
      corner[1] * frame[1],
      corner[2],
      frame[2],
      frame[2],
      0.035,
      1,
      0,
      0.5,
      section === 0 ? 0.7 : 1
    ))));
  }

  elements.push(item('add', 6, 0, primary.map(point => k(point[0], point[1], 0, point[2] * 0.28, point[2] * 0.28, 0.025, 1, 0, 0.5, 1))));
  elements.push(item('sub', 8, 0, primary.map(point => k(point[0], point[1], 0, point[2] * 0.55, point[2] * 0.55, 0.3, 1, 0, 0.5, 0.95))));
  elements.push(item('sub', 1, -0.2, secondary.map(point => k(point[0], point[1], 0, point[2] * 1.05, point[2] * 1.05, 0.02, 14, 0.2, 0.08, 0.85))));
  elements.push(item('invert', 7, 0, [
    k(0, 0.16, 0, 1.55, 0.02, 0.02, 1, 0, 0.5, 1),
    k(0, -0.04, 0.15, 1.8, 0.016, 0.02, 1, 0, 0.5, 1),
    k(0.15, 0.2, -0.35, 1.0, 0.02, 0.02, 1, 0, 0.5, 1),
    k(0, 0.02, 0.2, 1.25, 0.014, 0.02, 1, 0, 0.5, 0.85),
  ]));
  elements.push(item('invert', 8, 0, [
    k(0.42, -0.22, 0, 0.24, 0.24, 0.32, 1, 0, 0.5, 1),
    k(-0.55, 0.18, 0, 0.2, 0.2, 0.32, 1, 0, 0.5, 1),
    k(0.05, -0.32, 0, 0.28, 0.28, 0.32, 1, 0, 0.5, 1),
    k(-0.18, 0.2, 0, 0.18, 0.18, 0.32, 1, 0, 0.5, 1),
  ]));
  return elements;
}

function ring(path, spin) {
  return item('add', 0, spin, path.map(point => k(point[0], point[1], 0, point[2], point[2], 0.012, 1, 0, 0.5, 1)));
}

function tickRing(path, scale, freq, spin) {
  return item('add', 1, spin, path.map(point => k(
    point[0], point[1], 0, point[2] * scale, point[2] * scale, 0.02, freq, 0, 0.07, 1
  )));
}

function buildGroups(scenes) {
  const elements = buildElements();
  const groups = [];
  for (const blend of ['add', 'sub', 'invert']) {
    const items = elements.filter(element => element.blend === blend);
    const geometry = new THREE.PlaneGeometry(1, 1);
    const shape = new Float32Array(items.length);
    const params = new Float32Array(items.length * 4);
    const alpha = new Float32Array(items.length);
    items.forEach((element, index) => {
      shape[index] = element.shape;
      alpha[index] = 1;
    });
    const shapeAttr = new THREE.InstancedBufferAttribute(shape, 1);
    const paramAttr = new THREE.InstancedBufferAttribute(params, 4);
    const alphaAttr = new THREE.InstancedBufferAttribute(alpha, 1);
    paramAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aShape', shapeAttr);
    geometry.setAttribute('aParam', paramAttr);
    geometry.setAttribute('aAlpha', alphaAttr);
    const material = blendMaterial(blend);
    material.name = `mask-${blend}`;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scenes[blend].add(mesh);
    groups.push({blend, items, mesh, params, alpha, paramAttr, alphaAttr});
  }
  return groups;
}

function blendMaterial(kind) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uDiscard: {value: kind === 'invert' ? 1 : 0}},
    vertexShader: MASK_VERT,
    fragmentShader: MASK_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
  });
  if (kind === 'add') {
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
  } else if (kind === 'sub') {
    material.blendEquation = THREE.ReverseSubtractEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
  } else {
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneMinusDstColorFactor;
    material.blendDst = THREE.ZeroFactor;
  }
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}
