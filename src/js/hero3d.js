// three.js hero: layered Himalayan ridges, light rising behind them with soft
// rays, glowing snow, and snow that settles on the ridges as the page scrolls. Loaded on demand; paused when off screen.
import {
  WebGLRenderer, Scene, OrthographicCamera, Mesh, PlaneGeometry, ShaderMaterial, Shape, ShapeGeometry,
  MeshBasicMaterial, BufferGeometry, BufferAttribute, Points, Color, AdditiveBlending, Vector2, Float32BufferAttribute,
} from 'three';

const SKY_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uAspect; uniform float uTime; uniform float uRise; uniform vec2 uLight; uniform float uBoost;
float hash(float n){ return fract(sin(n) * 43758.5453); }
float noise(float x){ float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
// The poster's paint strokes: a smooth spectrum around the light.
vec3 spectrum(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main(){
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * uAspect, vUv.y * 2.0 - 1.0);
  // Deep indigo (#180E55), a little lighter low down where the light rises.
  vec3 col = mix(vec3(0.115, 0.07, 0.40), vec3(0.06, 0.035, 0.24), smoothstep(-1.0, 1.0, p.y));
  vec2 d = p - uLight; float r = length(d);
  float k = uRise * (1.0 + uBoost * 1.3);
  col += vec3(1.0, 0.96, 1.0) * exp(-r * (2.4 - uBoost * 0.9)) * 0.42 * k;
  col += vec3(0.90, 0.12, 0.48) * exp(-r * 1.3) * 0.16 * k;
  col += vec3(0.05, 0.67, 0.89) * exp(-r * 0.8) * 0.04 * k;
  float a = atan(d.y, d.x);
  float rays = noise(a * 10.0 + uTime * 0.12) * noise(a * 23.0 - uTime * 0.08);
  rays = pow(rays, 1.6) * smoothstep(1.9, 0.05, r) * smoothstep(-0.2, 0.5, d.y / max(r, 0.001));
  col += mix(vec3(1.0), spectrum(a * 0.48 + 0.1), 0.7) * rays * 0.34 * k;
  col *= 1.0 - 0.32 * smoothstep(0.6, 1.7, length(p * vec2(0.7, 1.0)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const SNOW_VERT = /* glsl */ `
attribute vec3 aSeed;
varying vec3 vTint;
uniform float uTime; uniform float uAspect; uniform float uPx; uniform vec2 uWind; uniform vec2 uLight; uniform float uRise; uniform float uBoost;
varying float vAlpha;
void main(){
  float speed = 0.035 + aSeed.z * 0.07;
  float y = 1.1 - mod(aSeed.y * 2.3 + uTime * speed, 2.3);
  float x = (aSeed.x * 2.0 - 1.0) * (uAspect + 0.25) + sin(uTime * 0.45 + aSeed.y * 24.0) * 0.035 + uWind.x * (1.1 - y) * 0.12 * (0.4 + aSeed.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.0, 1.0);
  gl_PointSize = (1.6 + aSeed.z * 3.6) * uPx;
  float near = exp(-length(vec2(x, y) - uLight) * 1.5);
  // Most flakes are white; about one in eight takes a colour from the poster.
  vec3 tint = 0.5 + 0.5 * cos(6.28318 * (fract(aSeed.x * 7.13) + vec3(0.0, 0.33, 0.67)));
  vTint = mix(vec3(1.0, 0.98, 1.0), tint, step(0.875, fract(aSeed.y * 13.7)) * 0.9);
  vAlpha = (0.22 + aSeed.z * 0.48) * (0.55 + near * 1.6 * uRise * (1.0 + uBoost));
}`;
const SNOW_FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;
varying vec3 vTint;
void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vTint, smoothstep(0.5, 0.0, d) * vAlpha); }`;

// Snow settling on the ridge lines: a strip that hugs each ridge and thickens with uSettle.
const CAP_VERT = /* glsl */ `
attribute float aSide; attribute float aThick;
uniform float uSettle;
varying float vSide;
void main(){
  vec3 p = position;
  // The lower edge sits just under the ridge line; the upper edge rises with uSettle.
  p.y += aSide > 0.0 ? aThick * uSettle : -0.0025;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const CAP_FRAG = /* glsl */ `
precision highp float;
uniform float uSettle; uniform float uRise; uniform float uOpacity;
varying float vSide;
void main(){
  // Brightest along the ridge line, fading softly towards the top of the drift.
  float t = (vSide + 1.0) * 0.5;
  float a = (1.0 - smoothstep(0.35, 1.0, t)) * uOpacity * min(1.0, uSettle * 3.0);
  gl_FragColor = vec4(vec3(0.957, 0.945, 0.984) * (0.75 + 0.25 * uRise), a);
}`;

// Seeded ridge profile: a few layered sines read as a mountain line.
function ridgeY(x, k) {
  const base = [-0.36, -0.56, -0.76][k];
  const amp = [0.2, 0.15, 0.1][k];
  const s = k * 1.7 + 0.3;
  const v =
    Math.sin(x * 2.1 + s) * 0.5 +
    Math.sin(x * 4.7 + s * 2.3) * 0.28 +
    Math.abs(Math.sin(x * 9.3 + s * 3.1)) * 0.22 +
    Math.sin(x * 17.0 + s) * 0.06;
  return base + v * amp;
}

const RIDGE = [
  { base: new Color('#2A1A78'), top: new Color('#5A3A9E'), depth: 0.03 },
  { base: new Color('#1F1268'), top: new Color('#3B2486'), depth: 0.06 },
  { base: new Color('#180E55'), top: new Color('#25166C'), depth: 0.1 },
];

export function createScene(canvas, { reduced = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  // Pixel ratio capped at 2 (1.5 on phones, where the scene sits behind text).
  const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor('#180E55', 1);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  let aspect = 1;

  const uniforms = {
    uAspect: { value: 1 }, uTime: { value: 0 }, uRise: { value: reduced ? 1 : 0.12 },
    uLight: { value: new Vector2(0, -0.62) }, uPx: { value: dpr }, uWind: { value: new Vector2(0, 0) },
    uBoost: { value: 0 }, uSettle: { value: 0 },
  };
  const sky = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms, depthWrite: false, depthTest: false }));
  sky.frustumCulled = false;
  sky.renderOrder = 0;
  scene.add(sky);

  const ridges = RIDGE.map((r, k) => {
    const m = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
    m.renderOrder = 1 + k * 2;
    scene.add(m);
    return m;
  });
  // Snow caps: drawn just after their own ridge, so nearer ridges still cover them.
  const caps = RIDGE.map((r, k) => {
    const mat = new ShaderMaterial({
      vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uSettle: uniforms.uSettle, uRise: uniforms.uRise, uOpacity: { value: [0.35, 0.55, 0.8][k] } },
    });
    const m = new Mesh(new BufferGeometry(), mat);
    m.renderOrder = 2 + k * 2;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  function buildRidges() {
    ridges.forEach((mesh, k) => {
      const shape = new Shape();
      const x0 = -aspect - 0.4; const x1 = aspect + 0.4;
      const steps = 160;
      shape.moveTo(x0, -1.3);
      for (let i = 0; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps;
        shape.lineTo(x, ridgeY(x, k));
      }
      shape.lineTo(x1, -1.3);
      const geo = new ShapeGeometry(shape);
      const pos = geo.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      const c = new Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i); const y = pos.getY(i);
        const isTop = y > -1.2;
        const warm = isTop ? Math.max(0, 1 - Math.abs(x) / (aspect + 0.6)) : 0;
        c.copy(RIDGE[k].base).lerp(RIDGE[k].top, isTop ? 0.35 + warm * 0.65 : 0);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
      mesh.geometry.dispose();
      mesh.geometry = geo;
      // The matching snow cap: two vertices per step, one each side of the ridge line.
      const n = 241;
      const pos2 = new Float32Array(n * 2 * 3);
      const side = new Float32Array(n * 2);
      const thick = new Float32Array(n * 2);
      const idx = [];
      const x0c = -aspect - 0.4; const x1c = aspect + 0.4;
      const base = [0.005, 0.008, 0.012][k];
      for (let i = 0; i < n; i++) {
        const x = x0c + ((x1c - x0c) * i) / (n - 1);
        const y = ridgeY(x, k);
        // Thicker where the ridge is flatter, thinner on steep slopes.
        const slope = Math.abs(ridgeY(x + 0.01, k) - ridgeY(x - 0.01, k)) / 0.02;
        const t = base * (1.4 - Math.min(1, slope * 0.9)) * (0.8 + 0.4 * Math.abs(Math.sin(x * 13.1 + k)));
        pos2.set([x, y, 0, x, y, 0], i * 6);
        side.set([1, -1], i * 2);
        thick.set([t, t], i * 2);
        if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const cg = new BufferGeometry();
      cg.setAttribute('position', new BufferAttribute(pos2, 3));
      cg.setAttribute('aSide', new BufferAttribute(side, 1));
      cg.setAttribute('aThick', new BufferAttribute(thick, 1));
      cg.setIndex(idx);
      caps[k].geometry.dispose();
      caps[k].geometry = cg;
    });
  }

  const count = window.innerWidth < 768 ? 260 : 520;
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const snowGeo = new BufferGeometry();
  snowGeo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  snowGeo.setAttribute('aSeed', new BufferAttribute(seeds, 3));
  const snow = new Points(snowGeo, new ShaderMaterial({ vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, uniforms, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending }));
  snow.frustumCulled = false;
  snow.renderOrder = 10;
  scene.add(snow);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.left = -aspect; camera.right = aspect;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = aspect;
    buildRidges();
    if (!running) render();
  }

  const target = new Vector2(0, 0);
  const cur = new Vector2(0, 0);
  let rise = uniforms.uRise.value;
  let riseTarget = rise;
  let settleTarget = 0;
  let running = false;
  let active = true;
  let started = false; // stays on a still frame until the visitor leaves the loader
  let frames = 0;
  let slowFrames = 0;
  let lowered = false;
  let last = performance.now();
  let resolveFirst;
  const firstFrame = new Promise((r) => { resolveFirst = r; });

  function render() {
    uniforms.uLight.value.set(cur.x * 0.3, -0.62 + rise * 0.24 - cur.y * 0.06);
    uniforms.uWind.value.set(cur.x, 0);
    ridges.forEach((m, k) => { m.position.x = cur.x * RIDGE[k].depth; m.position.y = -cur.y * RIDGE[k].depth * 0.3; caps[k].position.copy(m.position); });
    renderer.render(scene, camera);
    if (resolveFirst) { resolveFirst(); resolveFirst = null; }
  }

  function tick(now) {
    const raw = now - last;
    // Slow device: drop to 1x resolution once.
    if (!lowered && frames++ > 10) {
      if (raw > 28) slowFrames++;
      if (slowFrames > 20) { lowered = true; renderer.setPixelRatio(1); uniforms.uPx.value = 1; resize(); }
    }
    const dt = Math.min(0.05, raw / 1000);
    last = now;
    uniforms.uTime.value += dt;
    cur.lerp(target, 1 - Math.pow(0.001, dt));
    rise += (riseTarget - rise) * (1 - Math.pow(0.12, dt));
    uniforms.uRise.value = rise;
    // Snow settles towards the scroll position, easing (critically damped follow).
    uniforms.uSettle.value += (settleTarget - uniforms.uSettle.value) * (1 - Math.pow(0.05, dt));
    render();
  }

  function setRunning(on) {
    if (reduced || !started) { running = false; render(); return; }
    if (on === running) return;
    running = on;
    last = performance.now();
    renderer.setAnimationLoop(on ? tick : null);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setRunning(false);
    document.documentElement.classList.remove('has-webgl');
  });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  resize();
  setRunning(true);

  return {
    firstFrame,
    setPointer(x, y) { target.set(x, y); if (reduced) { cur.copy(target); render(); } },
    boost(b) { uniforms.uBoost.value = b; if (!running) render(); },
    settle(p) {
      settleTarget = p;
      if (reduced || !running) { uniforms.uSettle.value = p; render(); }
    },
    get state() { return { boost: uniforms.uBoost.value, settle: uniforms.uSettle.value }; },
    setActive(on) { active = on && !document.hidden; setRunning(active); },
    rise() {
      riseTarget = 1;
      started = true;
      if (reduced) { rise = 1; uniforms.uRise.value = 1; render(); return; }
      setRunning(active);
    },
  };
}
