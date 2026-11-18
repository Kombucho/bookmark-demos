// WebGPU when the browser can compile it, otherwise WebGL2.
// The scene is a heightfield, trees, and rocks. A Kuwahara pass paints it.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PaintedRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LIGHT = [0.78, 0.46, 0.24];
  const FOG = [0.86, 0.74, 0.62];
  const FOG_START = 16;
  const FOG_END = 68;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function lookAt(eye, target, up) {
    const z = normalize(sub(eye, target));
    let x = cross(up, z);
    const xLen = Math.hypot(x[0], x[1], x[2]);
    x = xLen ? [x[0] / xLen, x[1] / xLen, x[2] / xLen] : [1, 0, 0];
    let y = cross(z, x);
    const yLen = Math.hypot(y[0], y[1], y[2]);
    y = yLen ? [y[0] / yLen, y[1] / yLen, y[2] / yLen] : [0, 1, 0];
    const out = new Float32Array(16);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
    out[12] = -dot(x, eye);
    out[13] = -dot(y, eye);
    out[14] = -dot(z, eye);
    out[15] = 1;
    return out;
  }

  function perspectiveGL(fovy, aspect, near, far) {
    const out = new Float32Array(16);
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  function perspectiveGPU(fovy, aspect, near, far) {
    const out = new Float32Array(16);
    const f = 1 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = far / (near - far);
    out[11] = -1;
    out[14] = (near * far) / (near - far);
    return out;
  }

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[col * 4 + row] =
          a[row] * b[col * 4] +
          a[4 + row] * b[col * 4 + 1] +
          a[8 + row] * b[col * 4 + 2] +
          a[12 + row] * b[col * 4 + 3];
      }
    }
    return out;
  }

  function translation(x, y, z) {
    const out = new Float32Array(16);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    out[12] = x;
    out[13] = y;
    out[14] = z;
    return out;
  }

  function identity() {
    return translation(0, 0, 0);
  }

  function invert(a) {
    const out = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return identity();
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }

  function viewProj(camera, aspect, perspective) {
    const cp = Math.cos(camera.pitch);
    const eye = [camera.x, camera.y, camera.z];
    const target = [
      eye[0] + Math.sin(camera.yaw) * cp,
      eye[1] + Math.sin(camera.pitch),
      eye[2] - Math.cos(camera.yaw) * cp,
    ];
    const view = lookAt(eye, target, [0, 1, 0]);
    const proj = perspective(62 * Math.PI / 180, aspect, 0.08, 220);
    return multiply(proj, view);
  }

  function drawingSize(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    let w = Math.max(2, Math.round((canvas.clientWidth || 640) * dpr));
    let h = Math.max(2, Math.round((canvas.clientHeight || 360) * dpr));
    const cap = 768;
    if (w > cap) {
      h = Math.max(2, Math.round(h * (cap / w)));
      w = cap;
    }
    return { w: w, h: h };
  }

  function interleave(mesh) {
    const count = mesh.positions.length / 3;
    const data = new Float32Array(count * 9);
    for (let i = 0; i < count; i += 1) {
      const p = i * 3;
      const o = i * 9;
      data[o] = mesh.positions[p];
      data[o + 1] = mesh.positions[p + 1];
      data[o + 2] = mesh.positions[p + 2];
      data[o + 3] = mesh.normals[p];
      data[o + 4] = mesh.normals[p + 1];
      data[o + 5] = mesh.normals[p + 2];
      data[o + 6] = mesh.colors[p];
      data[o + 7] = mesh.colors[p + 1];
      data[o + 8] = mesh.colors[p + 2];
    }
    return data;
  }

  function writeScene(buffer, viewProjection, model, lit, camera) {
    buffer.set(viewProjection, 0);
    buffer.set(model, 16);
    buffer[32] = LIGHT[0];
    buffer[33] = LIGHT[1];
    buffer[34] = LIGHT[2];
    buffer[35] = lit;
    buffer[36] = FOG[0];
    buffer[37] = FOG[1];
    buffer[38] = FOG[2];
    buffer[39] = FOG_START;
    buffer[40] = camera.x;
    buffer[41] = camera.y;
    buffer[42] = camera.z;
    buffer[43] = FOG_END;
  }

  const SKY_WGSL = `
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) ndc : vec2<f32>,
};
@vertex
fn vs(@builtin(vertex_index) index : u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out : VSOut;
  let xy = pos[index];
  out.clip = vec4<f32>(xy, 1.0, 1.0);
  out.ndc = xy;
  return out;
}
struct Sky {
  invViewProj : mat4x4<f32>,
  cam : vec3<f32>,
  pad : f32,
};
@group(0) @binding(0) var<uniform> u : Sky;
@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let w = u.invViewProj * vec4<f32>(in.ndc, 1.0, 1.0);
  let dir = normalize(w.xyz / w.w - u.cam);
  let zenith = vec3<f32>(0.36, 0.56, 0.84);
  let horizon = vec3<f32>(0.91, 0.76, 0.60);
  let ground = vec3<f32>(0.50, 0.56, 0.46);
  let up = smoothstep(0.0, 0.7, dir.y);
  var col = mix(horizon, zenith, up);
  col = mix(ground, col, smoothstep(-0.4, 0.08, dir.y));
  return vec4<f32>(col, 1.0);
}`;

const SCENE_WGSL = `
struct Scene {
  viewProj : mat4x4<f32>,
  model : mat4x4<f32>,
  light : vec3<f32>,
  lit : f32,
  fogColor : vec3<f32>,
  fogStart : f32,
  camPos : vec3<f32>,
  fogEnd : f32,
};
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) color : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) world : vec3<f32>,
};
@group(0) @binding(0) var<uniform> u : Scene;
@vertex
fn vs(@location(0) pos : vec3<f32>, @location(1) nrm : vec3<f32>, @location(2) col : vec3<f32>) -> VSOut {
  var out : VSOut;
  let world4 = u.model * vec4<f32>(pos, 1.0);
  out.clip = u.viewProj * world4;
  out.color = col;
  out.normal = nrm;
  out.world = world4.xyz;
  return out;
}
@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let ndl = clamp(dot(n, normalize(u.light)), 0.0, 1.0);
  let hemi = n.y * 0.5 + 0.5;
  let shade = 0.30 + 0.85 * ndl + 0.14 * hemi;
  let lit = in.color * shade;
  var col = mix(in.color, lit, u.lit);
  let dist = distance(in.world, u.camPos);
  let fog = clamp((dist - u.fogStart) / max(u.fogEnd - u.fogStart, 0.001), 0.0, 1.0) * u.lit;
  col = mix(col, u.fogColor, fog);
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

  const PAINT_WGSL = `
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
};
@vertex
fn vs(@builtin(vertex_index) index : u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out : VSOut;
  let xy = pos[index];
  out.clip = vec4<f32>(xy, 0.0, 1.0);
  out.uv = xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var src : texture_2d<f32>;
struct Paint {
  texel : vec2<f32>,
  radius : f32,
  strength : f32,
  painted : f32,
  pad : f32,
};
@group(0) @binding(2) var<uniform> p : Paint;
fn sampleAt(uv : vec2<f32>) -> vec3<f32> {
  return textureSample(src, samp, uv).rgb;
}
@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let raw = sampleAt(in.uv);
  if (p.painted < 0.5) {
    return vec4<f32>(raw, 1.0);
  }
  let spread = clamp(p.radius, 1.0, 4.0);
  var bestVar = 1000000000.0;
  var best = raw;
  for (var q : i32 = 0; q < 4; q++) {
    let xSign = select(-1, 1, q < 2);
    let ySign = select(-1, 1, q == 0 || q == 2);
    var mean = vec3<f32>(0.0);
    var sq = vec3<f32>(0.0);
    for (var y : i32 = 0; y <= 2; y++) {
      for (var x : i32 = 0; x <= 2; x++) {
        let off = vec2<f32>(f32(x * xSign), f32(y * ySign)) * p.texel * spread * 2.0;
        let c = sampleAt(in.uv + off);
        mean += c;
        sq += c * c;
      }
    }
    mean /= 9.0;
    let variance = sq / 9.0 - mean * mean;
    let v = variance.r + variance.g + variance.b;
    if (v < bestVar) {
      bestVar = v;
      best = mean;
    }
  }
  let amount = clamp(p.strength, 0.0, 1.0);
  var col = mix(raw, best, amount);
  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(luma), col, 1.0 + 0.12 * amount);
  let grain = fract(sin(dot(in.clip.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.035 * amount;
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

  function gpuBuffer(device, data, usage) {
    const buffer = device.createBuffer({ size: data.byteLength, usage: usage });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  async function tryWebGPU(canvas) {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', function (event) {
      const message = event.error && event.error.message ? event.error.message : String(event.error);
      console.error(message);
    });
    device.pushErrorScope('validation');
    const sceneModule = device.createShaderModule({ code: SCENE_WGSL });
    const skyModule = device.createShaderModule({ code: SKY_WGSL });
    const paintModule = device.createShaderModule({ code: PAINT_WGSL });
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    const buffers = {
      arrayStride: 36,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
      ],
    };
    function scenePipeline(cull) {
      return device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: sceneModule, entryPoint: 'vs', buffers: [buffers] },
        fragment: { module: sceneModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list', cullMode: cull },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      });
    }
    const skyPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: skyModule, entryPoint: 'vs' },
      fragment: { module: skyModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    });
    const landPipeline = scenePipeline('back');
    const paintPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: paintModule, entryPoint: 'vs' },
      fragment: { module: paintModule, entryPoint: 'fs', targets: [{ format: canvasFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    const pipelineError = await device.popErrorScope();
    if (pipelineError) {
      device.destroy();
      return null;
    }
    const context = canvas.getContext('webgpu');
    if (!context) {
      device.destroy();
      return null;
    }
    let configuredSize = '';
    function configure(w, h) {
      const key = w + 'x' + h;
      if (configuredSize === key) return;
      canvas.width = w;
      canvas.height = h;
      context.configure({ device: device, format: canvasFormat, alphaMode: 'opaque' });
      configuredSize = key;
    }
    const skyUniform = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const landUniform = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const paintUniform = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    const skyBytes = new Float32Array(20);
    const landBytes = new Float32Array(64);
    const paintBytes = new Float32Array(8);
    const skyBind = device.createBindGroup({
      layout: skyPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: skyUniform } }],
    });
    const landBind = device.createBindGroup({
      layout: landPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: landUniform } }],
    });
    let landGeo = null;
    let colorTex = null;
    let depthTex = null;
    let paintBind = null;
    let size = { w: 0, h: 0 };

    function uploadGeo(mesh) {
      const data = interleave(mesh);
      return {
        vbo: gpuBuffer(device, data, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST),
        ibo: gpuBuffer(device, mesh.indices, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST),
        count: mesh.indices.length,
      };
    }

    function ensureTargets(w, h) {
      if (colorTex && size.w === w && size.h === h) return;
      if (colorTex) colorTex.destroy();
      if (depthTex) depthTex.destroy();
      colorTex = device.createTexture({
        size: [w, h],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      depthTex = device.createTexture({
        size: [w, h],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      paintBind = device.createBindGroup({
        layout: paintPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: colorTex.createView() },
          { binding: 2, resource: { buffer: paintUniform } },
        ],
      });
      size = { w: w, h: h };
    }

    return {
      backend: 'WebGPU',
      setWorld: function (world) {
        if (landGeo) { landGeo.vbo.destroy(); landGeo.ibo.destroy(); }
        landGeo = uploadGeo(world.land);
      },
      render: function (camera, paint) {
        if (!landGeo) return;
        const next = drawingSize(canvas);
        configure(next.w, next.h);
        ensureTargets(next.w, next.h);
        const vp = viewProj(camera, next.w / next.h, perspectiveGPU);
        const inv = invert(vp);
        skyBytes.set(inv, 0);
        skyBytes[16] = camera.x;
        skyBytes[17] = camera.y;
        skyBytes[18] = camera.z;
        writeScene(landBytes, vp, identity(), 1, camera);
        device.queue.writeBuffer(skyUniform, 0, skyBytes);
        device.queue.writeBuffer(landUniform, 0, landBytes);
        paintBytes[0] = 1 / next.w;
        paintBytes[1] = 1 / next.h;
        paintBytes[2] = paint.radius;
        paintBytes[3] = paint.strength;
        paintBytes[4] = paint.painted ? 1 : 0;
        device.queue.writeBuffer(paintUniform, 0, paintBytes);
        const encoder = device.createCommandEncoder();
        const scenePass = encoder.beginRenderPass({
          colorAttachments: [{
            view: colorTex.createView(),
            clearValue: { r: FOG[0], g: FOG[1], b: FOG[2], a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
          depthStencilAttachment: {
            view: depthTex.createView(),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        scenePass.setPipeline(skyPipeline);
        scenePass.setBindGroup(0, skyBind);
        scenePass.draw(3);
        scenePass.setPipeline(landPipeline);
        scenePass.setBindGroup(0, landBind);
        scenePass.setVertexBuffer(0, landGeo.vbo);
        scenePass.setIndexBuffer(landGeo.ibo, 'uint32');
        scenePass.drawIndexed(landGeo.count);
        scenePass.end();
        const paintPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            clearValue: { r: FOG[0], g: FOG[1], b: FOG[2], a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
        });
        paintPass.setPipeline(paintPipeline);
        paintPass.setBindGroup(0, paintBind);
        paintPass.draw(3);
        paintPass.end();
        device.queue.submit([encoder.finish()]);
      },
    };
  }

  const SCENE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vCol;
out vec3 vNrm;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
  vCol = aCol;
  vNrm = aNrm;
  vWorld = world.xyz;
}`;

  const SCENE_FS = `#version 300 es
precision highp float;
in vec3 vCol;
in vec3 vNrm;
in vec3 vWorld;
uniform vec3 uLight;
uniform float uLit;
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;
uniform vec3 uCam;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNrm);
  float ndl = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
  float hemi = n.y * 0.5 + 0.5;
  float shade = 0.30 + 0.85 * ndl + 0.14 * hemi;
  vec3 col = mix(vCol, vCol * shade, uLit);
  float dist = distance(vWorld, uCam);
  float fog = clamp((dist - uFogStart) / max(uFogEnd - uFogStart, 0.001), 0.0, 1.0) * uLit;
  col = mix(col, uFogColor, fog);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  const PAINT_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(-1.0, -1.0);
  if (gl_VertexID == 1) p = vec2(3.0, -1.0);
  if (gl_VertexID == 2) p = vec2(-1.0, 3.0);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = p * 0.5 + 0.5;
}`;

  const PAINT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uPainted;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 raw = texture(uTex, vUv).rgb;
  if (uPainted < 0.5) {
    outColor = vec4(raw, 1.0);
    return;
  }
  float spread = clamp(uRadius, 1.0, 4.0);
  float bestVar = 1e9;
  vec3 best = raw;
  for (int q = 0; q < 4; q++) {
    int xSign = q < 2 ? 1 : -1;
    int ySign = (q == 0 || q == 2) ? 1 : -1;
    vec3 mean = vec3(0.0);
    vec3 sq = vec3(0.0);
    for (int y = 0; y <= 2; y++) {
      for (int x = 0; x <= 2; x++) {
        vec2 off = vec2(float(x * xSign), float(y * ySign)) * uTexel * spread * 2.0;
        vec3 c = texture(uTex, vUv + off).rgb;
        mean += c;
        sq += c * c;
      }
    }
    mean /= 9.0;
    vec3 variance = sq / 9.0 - mean * mean;
    float v = variance.r + variance.g + variance.b;
    if (v < bestVar) {
      bestVar = v;
      best = mean;
    }
  }
  float amount = clamp(uStrength, 0.0, 1.0);
  vec3 col = mix(raw, best, amount);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.0 + 0.12 * amount);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.035 * amount;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  const SKY_VS = `#version 300 es
out vec2 vClip;
void main() {
  vec2 p = vec2(-1.0, -1.0);
  if (gl_VertexID == 1) p = vec2(3.0, -1.0);
  if (gl_VertexID == 2) p = vec2(-1.0, 3.0);
  gl_Position = vec4(p, 1.0, 1.0);
  vClip = p;
}`;

  const SKY_FS = `#version 300 es
precision highp float;
uniform mat4 uInvViewProj;
uniform vec3 uCam;
in vec2 vClip;
out vec4 outColor;
void main() {
  vec4 w = uInvViewProj * vec4(vClip, 1.0, 1.0);
  vec3 dir = normalize(w.xyz / w.w - uCam);
  vec3 zenith = vec3(0.36, 0.56, 0.84);
  vec3 horizon = vec3(0.91, 0.76, 0.60);
  vec3 ground = vec3(0.50, 0.56, 0.46);
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.7, dir.y));
  col = mix(ground, col, smoothstep(-0.4, 0.08, dir.y));
  outColor = vec4(col, 1.0);
}`;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(log || 'Shader failed');
    }
    return shader;
  }

  function program(gl, vs, fs) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'Link failed');
    }
    return prog;
  }

  function createWebGL(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    const scene = program(gl, SCENE_VS, SCENE_FS);
    const sky = program(gl, SKY_VS, SKY_FS);
    const paint = program(gl, PAINT_VS, PAINT_FS);
    const sceneLoc = {
      view: gl.getUniformLocation(scene, 'uViewProj'),
      model: gl.getUniformLocation(scene, 'uModel'),
      light: gl.getUniformLocation(scene, 'uLight'),
      lit: gl.getUniformLocation(scene, 'uLit'),
      fog: gl.getUniformLocation(scene, 'uFogColor'),
      fogStart: gl.getUniformLocation(scene, 'uFogStart'),
      fogEnd: gl.getUniformLocation(scene, 'uFogEnd'),
      cam: gl.getUniformLocation(scene, 'uCam'),
    };
    const paintLoc = {
      texel: gl.getUniformLocation(paint, 'uTexel'),
      radius: gl.getUniformLocation(paint, 'uRadius'),
      strength: gl.getUniformLocation(paint, 'uStrength'),
      painted: gl.getUniformLocation(paint, 'uPainted'),
    };
    const skyLoc = {
      inv: gl.getUniformLocation(sky, 'uInvViewProj'),
      cam: gl.getUniformLocation(sky, 'uCam'),
    };
    let target = null;
    let land = null;

    function upload(mesh) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, interleave(mesh), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao: vao, count: mesh.indices.length };
    }

    function ensureTarget(w, h) {
      if (target && target.w === w && target.h === h) return;
      if (target) {
        gl.deleteFramebuffer(target.fb);
        gl.deleteTexture(target.tex);
        gl.deleteRenderbuffer(target.depth);
      }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      target = { fb: fb, tex: tex, depth: depth, w: w, h: h };
    }

    function drawMesh(geo, model, lit, camera) {
      gl.bindVertexArray(geo.vao);
      gl.uniformMatrix4fv(sceneLoc.model, false, model);
      gl.uniform1f(sceneLoc.lit, lit);
      gl.uniform3f(sceneLoc.cam, camera.x, camera.y, camera.z);
      gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_INT, 0);
    }

    return {
      backend: 'WebGL2',
      setWorld: function (world) {
        land = upload(world.land);
      },
      render: function (camera, paintSettings) {
        if (!land) return;
        const next = drawingSize(canvas);
        if (canvas.width !== next.w || canvas.height !== next.h) {
          canvas.width = next.w;
          canvas.height = next.h;
        }
        ensureTarget(next.w, next.h);
        const vp = viewProj(camera, next.w / next.h, perspectiveGL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.viewport(0, 0, next.w, next.h);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(sky);
        gl.uniformMatrix4fv(skyLoc.inv, false, invert(vp));
        gl.uniform3f(skyLoc.cam, camera.x, camera.y, camera.z);
        gl.bindVertexArray(null);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(scene);
        gl.uniformMatrix4fv(sceneLoc.view, false, vp);
        gl.uniform3fv(sceneLoc.light, LIGHT);
        gl.uniform3fv(sceneLoc.fog, FOG);
        gl.uniform1f(sceneLoc.fogStart, FOG_START);
        gl.uniform1f(sceneLoc.fogEnd, FOG_END);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        drawMesh(land, identity(), 1, camera);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(paint);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, target.tex);
        gl.uniform2f(paintLoc.texel, 1 / next.w, 1 / next.h);
        gl.uniform1f(paintLoc.radius, paintSettings.radius);
        gl.uniform1f(paintLoc.strength, paintSettings.strength);
        gl.uniform1f(paintLoc.painted, paintSettings.painted ? 1 : 0);
        gl.bindVertexArray(null);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  async function create(canvas) {
    try {
      const gpu = await tryWebGPU(canvas);
      if (gpu) return gpu;
    } catch (err) {
      /* WebGPU was present but rejected the device or the shaders. WebGL2 draws the same world. */
    }
    try {
      const gl = createWebGL(canvas);
      if (gl) return gl;
    } catch (err) {
      throw new Error(err && err.message ? err.message : 'WebGL2 failed');
    }
    throw new Error('This browser has no WebGPU device and no WebGL2.');
  }

  return { create: create };
});
