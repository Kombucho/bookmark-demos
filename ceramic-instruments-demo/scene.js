// SVG paths → extruded clearcoat ceramic, outlines via setDrawRange,
// and the same scene drawn twice with a scissor and an override material.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const kit = window.CeramicKit;
const canvas = document.getElementById('view');
const seam = document.getElementById('seam');
const labelLeft = document.getElementById('label-left');
const labelRight = document.getElementById('label-right');
const statusEl = document.getElementById('status');
const replayBtn = document.getElementById('replay');
const picksEl = document.getElementById('picks');
const materialBtn = document.getElementById('material');
const spinBtn = document.getElementById('spin');
const sources = document.getElementById('sources');
const failEl = document.getElementById('fail');

const PROUD = { body: 1, face: 1.08, mark: 1.18, needle: 1.28 };

function showFail(message) {
  if (!failEl) return;
  failEl.hidden = false;
  if (message) failEl.textContent = message;
}

function mountSources() {
  sources.innerHTML = kit.instruments.map(function (inst) { return inst.svg; }).join('');
}

function ribbonGeometry(points, halfWidth, z) {
  const segs = Math.max(0, points.length - 1);
  const positions = new Float32Array(Math.max(1, segs) * 18);
  let offset = 0;
  for (let i = 0; i < segs; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy * halfWidth;
    const ny = dx * halfWidth;
    const quad = [
      a.x + nx, a.y + ny, z,
      a.x - nx, a.y - ny, z,
      b.x + nx, b.y + ny, z,
      a.x - nx, a.y - ny, z,
      b.x - nx, b.y - ny, z,
      b.x + nx, b.y + ny, z,
    ];
    for (let k = 0; k < quad.length; k += 1) positions[offset++] = quad[k];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function extrude(shape, options) {
  try {
    return new THREE.ExtrudeGeometry(shape, options);
  } catch (err) {
    return new THREE.ExtrudeGeometry(shape, {
      depth: options.depth,
      bevelEnabled: false,
      curveSegments: 8,
    });
  }
}

mountSources();

if (!kit) {
  showFail('The instrument paths did not load.');
} else {
  boot();
}

function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  } catch (err) {
    showFail('This browser did not start WebGL.');
    return;
  }
  if (!renderer.getContext()) {
    showFail('This browser did not start WebGL.');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0xd2c6b4, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd2c6b4, 9, 18);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(0.28, 1.22, 4.25);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.32, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.55;
  controls.minDistance = 3.1;
  controls.maxDistance = 7.2;
  controls.minPolarAngle = 0.78;
  controls.maxPolarAngle = 1.28;
  controls.update();

  const hemi = new THREE.HemisphereLight(0xfff6ea, 0xb9a48e, 0.42);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e2, 2.05);
  key.position.set(-3.2, 5.4, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 18;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf0d2bc, 0.55);
  fill.position.set(3.4, 2.2, 2.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe6c4, 0.4);
  rim.position.set(0.4, 2.4, -3.2);
  scene.add(rim);

  const materialCache = new Map();
  function ceramicMaterial(color) {
    const hex = color.getHexString();
    if (materialCache.has(hex)) return materialCache.get(hex);
    const lum = color.r * 0.3 + color.g * 0.59 + color.b * 0.11;
    const mat = new THREE.MeshPhysicalMaterial({
      color: color,
      roughness: lum > 0.55 ? 0.55 : 0.38,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.78,
      sheen: 0.42,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#f4d4c2'),
    });
    materialCache.set(hex, mat);
    return mat;
  }

  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2a211c });
  lineMaterial.polygonOffset = true;
  lineMaterial.polygonOffsetFactor = -2;
  lineMaterial.allowOverride = false;
  const inlayMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x3b2b26,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.6,
  });
  inlayMaterial.allowOverride = false;

  const loader = new SVGLoader();
  const built = [];
  const outlines = [];

  kit.instruments.forEach(function (inst) {
    const data = loader.parse(inst.svg);
    const viewBox = /viewBox="([^"]+)"/.exec(inst.svg);
    const parts = viewBox[1].split(/[\s,]+/).map(Number);
    const vbMax = Math.max(parts[2], parts[3]);
    const baseDepth = vbMax * 0.2;
    const group = new THREE.Group();

    data.paths.forEach(function (path) {
      const node = path.userData && path.userData.node;
      const proud = (node && node.getAttribute && node.getAttribute('data-proud')) || 'body';
      const depth = baseDepth * (PROUD[proud] || 1);
      const color = path.color ? path.color.clone() : new THREE.Color('#f4efe6');
      const shapes = SVGLoader.createShapes(path);
      shapes.forEach(function (shape) {
        const geo = extrude(shape, {
          depth: depth,
          bevelEnabled: proud !== 'mark',
          bevelThickness: vbMax * 0.011,
          bevelSize: vbMax * 0.009,
          bevelSegments: 2,
          curveSegments: proud === 'mark' ? 2 : 10,
        });
        const mesh = new THREE.Mesh(geo, ceramicMaterial(color));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });

      path.subPaths.forEach(function (sub) {
        const pts = sub.getPoints(proud === 'mark' ? 2 : 14);
        if (pts.length < 2) return;
        const z = depth + vbMax * 0.012;
        const positions = new Float32Array(pts.length * 3);
        pts.forEach(function (p, i) {
          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = z;
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setDrawRange(0, 0);
        const line = new THREE.Line(geo, lineMaterial);
        group.add(line);
        const ribbonGeo = ribbonGeometry(pts, vbMax * 0.0075, z);
        ribbonGeo.setDrawRange(0, 0);
        const ribbon = new THREE.Mesh(ribbonGeo, inlayMaterial);
        group.add(ribbon);
        outlines.push({ geo: geo, ribbonGeo: ribbonGeo, total: pts.length, line: line, ribbon: ribbon, delay: outlines.length * 34 });
      });
    });

    group.scale.y = -1;
    group.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(group);
    let size = box.getSize(new THREE.Vector3());
    const fit = 1.38 / Math.max(size.x, size.y, 0.001);
    group.scale.multiplyScalar(fit);
    group.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.x -= center.x;
    group.position.y -= center.y;
    group.position.z -= center.z;
    group.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(group);
    size = box.getSize(new THREE.Vector3());

    const pivot = new THREE.Group();
    pivot.add(group);
    built.push({ id: inst.id, name: inst.name, pivot: pivot, height: size.y });
  });

  const rig = new THREE.Group();
  rig.rotation.x = -0.18;
  scene.add(rig);
  const slabMat = ceramicMaterial(new THREE.Color('#e7d8c4'));
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 1.85), slabMat);
  slab.position.y = -0.07;
  slab.receiveShadow = true;
  slab.castShadow = true;
  rig.add(slab);
  built.forEach(function (item) { rig.add(item.pivot); });

  const overrides = [
    { name: 'Wireframe', material: new THREE.MeshBasicMaterial({ color: 0x2a211c, wireframe: true }) },
    { name: 'Normals', material: new THREE.MeshNormalMaterial() },
    { name: 'Flat clay', material: new THREE.MeshLambertMaterial({ color: 0xd7c6b2 }) },
  ];

  let selected = 0;
  let overrideIndex = 0;
  let ratio = 0.56;
  let spinOn = !reduce;
  let drawOrigin = performance.now();
  let lineDuration = reduce ? 0 : 2200;
  let statusText = '';

  function place(dt, snap) {
    const spots = kit.layout(built.length, selected);
    built.forEach(function (item, i) {
      const spot = spots[i];
      const u = item.pivot.userData;
      if (u.x === undefined || snap) {
        u.x = spot.x;
        u.z = spot.z;
        u.scale = spot.scale;
        u.ry = spot.ry;
      } else {
        const k = 1 - Math.exp(-dt / 160);
        u.x += (spot.x - u.x) * k;
        u.z += (spot.z - u.z) * k;
        u.scale += (spot.scale - u.scale) * k;
        u.ry += (spot.ry - u.ry) * k;
      }
      item.pivot.position.set(u.x, (item.height / 2) * u.scale, u.z);
      item.pivot.scale.setScalar(Math.max(0.001, u.scale));
      item.pivot.rotation.y = u.ry;
    });
  }

  function applyDraw(now) {
    let done = true;
    outlines.forEach(function (item) {
      const shown = kit.drawCount(now - drawOrigin - item.delay, lineDuration, item.total);
      item.geo.setDrawRange(0, shown);
      item.ribbonGeo.setDrawRange(0, Math.max(0, shown - 1) * 6);
      if (shown < item.total) done = false;
    });
    const next = done
      ? (reduce && lineDuration === 0 ? 'Reduced motion is on. The outlines are drawn.' : 'Outlines are in.')
      : 'Outlines are drawing.';
    if (next !== statusText) {
      statusText = next;
      statusEl.textContent = next;
    }
  }

  function setOutlinesVisible(on) {
    outlines.forEach(function (item) {
      item.line.visible = on;
      item.ribbon.visible = on;
    });
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function paintSeam() {
    seam.style.left = (ratio * 100) + '%';
    seam.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    labelRight.textContent = overrides[overrideIndex].name;
    labelRight.style.left = 'calc(' + (ratio * 100) + '% + 18px)';
    labelRight.style.right = 'auto';
    labelLeft.hidden = ratio < 0.16;
    labelRight.hidden = ratio > 0.82;
    canvas.setAttribute('aria-label', 'Ceramic instruments. Left of the divider is glazed. Right is ' + overrides[overrideIndex].name + '.');
  }

  function renderPass(now) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const split = Math.max(1, Math.min(w - 1, Math.round(w * ratio)));
    renderer.setScissorTest(true);

    setOutlinesVisible(true);
    scene.overrideMaterial = null;
    renderer.setViewport(0, 0, split, h);
    renderer.setScissor(0, 0, split, h);
    renderer.render(scene, camera);

    setOutlinesVisible(false);
    scene.overrideMaterial = overrides[overrideIndex].material;
    renderer.setViewport(split, 0, Math.max(1, w - split), h);
    renderer.setScissor(split, 0, Math.max(1, w - split), h);
    renderer.render(scene, camera);

    scene.overrideMaterial = null;
    setOutlinesVisible(true);
  }

  built.forEach(function (item, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.name;
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.addEventListener('click', function () {
      selected = index;
      drawOrigin = performance.now();
      lineDuration = reduce ? 700 : 2200;
      picksEl.querySelectorAll('button').forEach(function (el, i) {
        el.setAttribute('aria-pressed', i === index ? 'true' : 'false');
      });
    });
    picksEl.appendChild(button);
  });

  replayBtn.addEventListener('click', function () {
    drawOrigin = performance.now();
    lineDuration = reduce ? 700 : 2200;
  });

  materialBtn.addEventListener('click', function () {
    overrideIndex = (overrideIndex + 1) % overrides.length;
    materialBtn.textContent = 'Right side: ' + overrides[overrideIndex].name;
    paintSeam();
  });

  spinBtn.addEventListener('click', function () {
    spinOn = !spinOn;
    spinBtn.setAttribute('aria-pressed', spinOn ? 'true' : 'false');
    controls.autoRotate = spinOn;
  });
  spinBtn.setAttribute('aria-pressed', spinOn ? 'true' : 'false');
  if (reduce) {
    spinBtn.setAttribute('aria-pressed', 'false');
    statusEl.textContent = 'Reduced motion is on. The outlines are drawn. Replay plays them quickly.';
  }

  function setRatio(clientX) {
    const rect = canvas.getBoundingClientRect();
    ratio = kit.splitRatio(clientX, rect.left, rect.width);
    paintSeam();
  }

  let wiping = false;
  seam.addEventListener('pointerdown', function (e) {
    wiping = true;
    if (seam.setPointerCapture) seam.setPointerCapture(e.pointerId);
    setRatio(e.clientX);
    e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (!wiping) return;
    setRatio(e.clientX);
  });
  window.addEventListener('pointerup', function () { wiping = false; });
  window.addEventListener('pointercancel', function () { wiping = false; });
  seam.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const delta = e.key === 'ArrowLeft' ? -0.02 : 0.02;
    ratio = kit.splitRatio(rect.left + (ratio + delta) * rect.width, rect.left, rect.width);
    paintSeam();
  });

  window.addEventListener('resize', resize);

  place(0, true);
  paintSeam();
  resize();
  applyDraw(performance.now());

  let dragging = false;
  canvas.addEventListener('pointerdown', function () { dragging = true; });
  window.addEventListener('pointerup', function () { dragging = false; });
  window.addEventListener('pointercancel', function () { dragging = false; });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    controls.autoRotate = spinOn && !reduce && !dragging;
    controls.update();
    const pr = renderer.getPixelRatio();
    const wantW = Math.floor(canvas.clientWidth * pr);
    const wantH = Math.floor(canvas.clientHeight * pr);
    if (wantW > 1 && (renderer.domElement.width !== wantW || renderer.domElement.height !== wantH)) resize();
    place(dt, false);
    applyDraw(now);
    renderPass(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__ceramicReady = true;
  if (failEl) failEl.hidden = true;
}
