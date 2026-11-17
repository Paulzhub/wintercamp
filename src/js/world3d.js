// Round 16 (B): one continuous low-poly 3D scene behind the whole home page
// (Paul's choice: option C on desktop and phones, with the Lantern Star).
//
// Four scenes along one camera path, scrubbed by the page scroll:
//   0    Hero        ridges, the Lantern Star rising behind them, falling snow
//   1/3  Activities  the light glides down into a campfire circle of children
//   2/3  Gallery     the camera tilts up: lanterns rise, photo frames float
//   1    Footer      pull back to a quiet starry ridge; the light settles as a star
//
// The sky, light rays and snow carry on the round 5 hero (hold to illuminate,
// snow settling on the ridges). Haze stands in for depth of field. Loaded on
// demand, paused when hidden, and it lowers its own quality on slow devices.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, HemisphereLight, PointLight, DirectionalLight,
  Mesh, Group, MeshLambertMaterial, MeshBasicMaterial, PlaneGeometry, ConeGeometry, CylinderGeometry,
  OctahedronGeometry, IcosahedronGeometry, BoxGeometry, CircleGeometry, BufferGeometry, BufferAttribute,
  Points, PointsMaterial, ShaderMaterial, Vector2, Vector3, CatmullRomCurve3, AdditiveBlending,
  CanvasTexture, SRGBColorSpace,
} from 'three';

export const C = {
  indigo: '#180E55', snow: '#F4F1FB', pink: '#D1146C', glow: '#E61E7B', cyan: '#0CAAE4', yellow: '#FCF128',
  lime: '#91EA43', orange: '#F89C38', red: '#EF3D2C', purple: '#8319D1', r1: '#1F1268', r2: '#3B2486', r3: '#5A3A9E',
};
export const SPECTRUM = [C.glow, C.orange, C.yellow, C.lime, C.cyan, C.purple];
// Lambert (not Standard) shading: much cheaper per pixel on phones, and the low-poly look doesn't need more.
export const flat = (color, extra = {}) => new MeshLambertMaterial({ color, flatShading: true, ...extra });
export const glowMat = (color, intensity = 1.6) => new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
export function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,255,1)');
  g.addColorStop(0.25, 'rgba(255,220,240,0.55)');
  g.addColorStop(1, 'rgba(230,30,123,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  GLOW = new CanvasTexture(cv);
  GLOW.colorSpace = SRGBColorSpace;
  return GLOW;
}
// A soft round glow that always faces the camera.
export function halo(size, opacity = 0.8) {
  const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity, depthWrite: false, blending: AdditiveBlending }));
  m.userData.billboard = true;
  return m;
}

// ---------- The Lantern Star ----------
export function lanternStar() {
  const g = new Group();
  const core = new Mesh(new OctahedronGeometry(0.7, 0), glowMat('#FFF4FB', 2.2));
  const shell = new Mesh(new OctahedronGeometry(1.05, 0), new MeshLambertMaterial({ color: C.glow, emissive: C.glow, emissiveIntensity: 0.5, transparent: true, opacity: 0.35, flatShading: true }));
  shell.rotation.y = Math.PI / 4;
  const h = halo(7, 0.9);
  g.add(core, shell, h);
  g.userData.spin = (t, boost = 0) => {
    core.rotation.y = t * 0.6;
    shell.rotation.y = -t * 0.4 + Math.PI / 4;
    shell.rotation.x = Math.sin(t * 0.5) * 0.2;
    h.material.opacity = 0.85 + boost * 0.15;
    h.scale.setScalar(1 + boost * 0.6);
  };
  return g;
}

// ---------- Ridges: snow line rises and falls with uSettle ----------
function ridgeHeight(x, k) {
  const s = k * 1.7 + 0.3;
  return Math.sin(x * 0.21 + s) * 0.5 + Math.sin(x * 0.47 + s * 2.3) * 0.28 + Math.abs(Math.sin(x * 0.93 + s * 3.1)) * 0.22;
}
function ridge({ width, height, k, base, top, seg = 46 }, snow) {
  const g = new PlaneGeometry(width, height, seg, 5).toNonIndexed();
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const hs = new Float32Array(pos.count);
  const r = rand(11 + k * 7);
  const cb = new Color(base); const ct = new Color(top); const c = new Color();
  // Same jitter for the same grid point, so the surface has no cracks.
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = (pos.getY(i) + height / 2) / height;
    const key = `${x.toFixed(3)}:${t.toFixed(3)}`;
    if (!jit.has(key)) jit.set(key, [(r() - 0.5) * 0.5, (r() - 0.5) * 0.9]);
    const [jy, jz] = jit.get(key);
    const ht = t * (0.55 + ridgeHeight(x, k) * 0.45);
    pos.setY(i, -height / 2 + ht * height + (t > 0 && t < 1 ? jy : 0));
    pos.setZ(i, jz * t);
    c.copy(cb).lerp(ct, Math.min(1, t * 1.2));
    colors.set([c.r, c.g, c.b], i * 3);
    hs[i] = ht;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.setAttribute('aH', new BufferAttribute(hs, 1));
  g.computeVertexNormals();
  const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = snow;
    sh.vertexShader = `attribute float aH;\nvarying float vH;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH;');
    sh.fragmentShader = `uniform float uSnow;\nvarying float vH;\n${sh.fragmentShader}`.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.957, 0.945, 0.984), smoothstep(uSnow - 0.015, uSnow + 0.015, vH) * 0.85);');
  };
  return new Mesh(g, mat);
}

function stars(count, spread, y0) {
  const p = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const r = rand(5 + count);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    p.set([(r() - 0.5) * spread, y0 + r() * spread * 0.35, -20 - r() * spread * 0.5], i * 3);
    c.set(r() > 0.88 ? SPECTRUM[Math.floor(r() * SPECTRUM.length)] : '#ffffff');
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  return new Points(g, new PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }));
}

function figure(color, scale = 1) {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.22, 0.34, 0.8, 6), flat(color));
  body.position.y = 0.4;
  const head = new Mesh(new IcosahedronGeometry(0.24, 0), flat('#F2D7C9'));
  head.position.y = 1.02;
  const hat = new Mesh(new ConeGeometry(0.22, 0.32, 6), flat(color));
  hat.position.y = 1.32;
  g.add(body, head, hat);
  g.scale.setScalar(scale);
  return g;
}
function campfire() {
  const g = new Group();
  const ground = new Mesh(new CircleGeometry(7, 9), flat('#22175F'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  g.add(ground);
  for (let i = 0; i < 5; i++) {
    const log = new Mesh(new CylinderGeometry(0.12, 0.14, 1.5, 5), flat('#5B3A2E'));
    log.rotation.z = Math.PI / 2.6;
    log.rotation.y = (i / 5) * Math.PI * 2;
    log.position.y = 0.25;
    g.add(log);
  }
  const flames = new Group();
  [[C.orange, 0.55, 1.4], [C.yellow, 0.36, 1.0], [C.glow, 0.42, 1.15]].forEach(([col, r, h], i) => {
    const f = new Mesh(new ConeGeometry(r, h, 5), glowMat(col, 1.8));
    f.position.set((i - 1) * 0.16, h / 2 + 0.2, (i % 2) * 0.12);
    flames.add(f);
  });
  const fireGlow = halo(5, 0.55);
  fireGlow.position.y = 0.9;
  g.add(flames, fireGlow);
  for (let i = 0; i < 9; i++) {
    const s = new Mesh(new IcosahedronGeometry(0.18, 0), flat('#4A3D86'));
    const a = (i / 9) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95);
    g.add(s);
  }
  [C.cyan, C.pink, C.lime, C.orange, C.purple, C.yellow, C.glow].forEach((col, i, all) => {
    const a = (i / all.length) * Math.PI * 2 + 0.3;
    const f = figure(col, i % 3 === 0 ? 1.1 : 0.85);
    f.position.set(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5);
    f.lookAt(0, 0.4, 0);
    g.add(f);
  });
  const light = new PointLight('#FFB070', 18, 14, 1.6);
  light.position.y = 1.4;
  g.add(light);
  g.userData.flicker = (t) => {
    flames.children.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 7 + i * 2) * 0.12; f.rotation.y = t * (0.6 + i * 0.2); });
    light.intensity = (16 + Math.sin(t * 9) * 2 + Math.sin(t * 13) * 1.5) * g.scale.x;
  };
  return g;
}
function lanterns(count) {
  const g = new Group();
  const r = rand(77);
  for (let i = 0; i < count; i++) {
    const l = new Group();
    const col = r() > 0.7 ? SPECTRUM[Math.floor(r() * SPECTRUM.length)] : '#FFC985';
    l.add(new Mesh(new CylinderGeometry(0.28, 0.22, 0.6, 6), new MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, flatShading: true })));
    l.add(halo(1.6, 0.35));
    l.position.set((r() - 0.5) * 14, 4 + r() * 12, -6 - r() * 11);
    l.userData = { speed: 0.25 + r() * 0.4, phase: r() * 6, y0: l.position.y, x0: l.position.x };
    g.add(l);
  }
  g.userData.drift = (t, glow) => g.children.forEach((l) => {
    const u = l.userData;
    l.position.y = u.y0 + ((t * u.speed) % 6) - 1;
    l.position.x = u.x0 + Math.sin(t * 0.4 + u.phase) * 0.4;
    l.children[0].material.emissiveIntensity = 0.4 + 1.2 * glow;
  });
  return g;
}
function photoFrames() {
  const g = new Group();
  [['#F4C7D9', C.pink], ['#BFE8F7', C.cyan], ['#FFF1B8', C.orange], ['#DCF7C4', C.lime], ['#E5D1FB', C.purple], ['#FFD9C2', C.red]].forEach(([fill, edge], i, all) => {
    const f = new Group();
    const card = new Mesh(new BoxGeometry(2.2, 1.5, 0.08), flat('#F5F5F5'));
    const pic = new Mesh(new PlaneGeometry(1.95, 1.25), new MeshLambertMaterial({ color: fill, emissive: fill, emissiveIntensity: 0.35 }));
    pic.position.z = 0.05;
    const sun = new Mesh(new CircleGeometry(0.18, 8), new MeshBasicMaterial({ color: edge }));
    sun.position.set(0.5, 0.25, 0.06);
    const hill = new Mesh(new ConeGeometry(0.7, 0.5, 3), new MeshBasicMaterial({ color: '#3B2486' }));
    hill.position.set(-0.3, -0.38, 0.06);
    f.add(card, pic, sun, hill);
    const a = (i / all.length) * Math.PI * 2;
    f.position.set(Math.cos(a) * 6, 9, -12 + Math.sin(a) * 4);
    f.rotation.y = -a + Math.PI / 2;
    f.userData.phase = i;
    g.add(f);
  });
  g.userData.float = (t, show) => g.children.forEach((f) => {
    f.position.y = 9 + Math.sin(t * 0.7 + f.userData.phase * 1.7) * 0.6;
    f.rotation.z = Math.sin(t * 0.5 + f.userData.phase) * 0.06;
    f.scale.setScalar(Math.max(0.001, show));
  });
  return g;
}
export function venueHouse() {
  const v = new Group();
  const house = new Mesh(new BoxGeometry(2.2, 1.1, 1.4), flat('#F5F1FF'));
  house.position.y = 0.55;
  const roof = new Mesh(new CylinderGeometry(0.01, 1.6, 0.9, 4), flat(C.pink));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.55;
  const win = new Mesh(new PlaneGeometry(1.5, 0.35), glowMat('#FFD27A', 1.3));
  win.position.set(0, 0.62, 0.71);
  const door = new Mesh(new PlaneGeometry(0.3, 0.55), flat(C.indigo));
  door.position.set(0.75, 0.28, 0.715);
  v.add(house, roof, win, door);
  return v;
}

// ---------- Sky (the round 5 hero sky, now following the star on screen) ----------
const SKY_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uAspect; uniform float uTime; uniform float uRise; uniform vec2 uLight; uniform float uBoost;
float hash(float n){ return fract(sin(n) * 43758.5453); }
float noise(float x){ float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
vec3 spectrum(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main(){
  vec2 p = vec2((vUv.x * 2.0 - 1.0) * uAspect, vUv.y * 2.0 - 1.0);
  vec3 col = mix(vec3(0.115, 0.07, 0.40), vec3(0.06, 0.035, 0.24), smoothstep(-1.0, 1.0, p.y));
  vec2 d = p - uLight; float r = length(d);
  float k = uRise * (1.0 + uBoost * 1.3);
  col += vec3(1.0, 0.96, 1.0) * exp(-r * (2.4 - uBoost * 0.9)) * 0.34 * k;
  col += vec3(0.90, 0.12, 0.48) * exp(-r * 1.3) * 0.14 * k;
  col += vec3(0.05, 0.67, 0.89) * exp(-r * 0.8) * 0.04 * k;
  float a = atan(d.y, d.x);
  float rays = noise(a * 10.0 + uTime * 0.12) * noise(a * 23.0 - uTime * 0.08);
  rays = pow(rays, 1.6) * smoothstep(1.9, 0.05, r) * smoothstep(-0.2, 0.5, d.y / max(r, 0.001));
  col += mix(vec3(1.0), spectrum(a * 0.48 + 0.1), 0.7) * rays * 0.3 * k;
  col *= 1.0 - 0.28 * smoothstep(0.6, 1.7, length(p * vec2(0.7, 1.0)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// Snow falls in a box in front of the camera wherever it goes (a child of the camera).
const SNOW_VERT = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime; uniform float uPx; uniform float uBoost;
varying float vAlpha; varying vec3 vTint;
void main(){
  float speed = 0.5 + aSeed.z * 0.9;
  float y = 7.0 - mod(aSeed.y * 14.0 + uTime * speed, 14.0);
  float x = (aSeed.x - 0.5) * 20.0 + sin(uTime * 0.45 + aSeed.y * 24.0) * 0.4;
  float z = -3.0 - aSeed.z * 17.0;
  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (2.0 + aSeed.z * 4.0) * uPx * (8.0 / -mv.z);
  vec3 tint = 0.5 + 0.5 * cos(6.28318 * (fract(aSeed.x * 7.13) + vec3(0.0, 0.33, 0.67)));
  vTint = mix(vec3(1.0, 0.98, 1.0), tint, step(0.875, fract(aSeed.y * 13.7)) * 0.9);
  vAlpha = (0.3 + aSeed.z * 0.45) * (1.0 + uBoost * 0.6);
}`;
const SNOW_FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha; varying vec3 vTint;
void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vTint, smoothstep(0.5, 0.0, d) * vAlpha); }`;

// Camera path: position, where it looks, and where the light is, for scenes 0..3.
const KEYS = {
  cam: [new Vector3(0, 3.2, 16), new Vector3(5.5, 2.6, 5.5), new Vector3(0.5, 3, -1), new Vector3(0, 9, 30)],
  look: [new Vector3(0, 4.6, -22), new Vector3(0, 0.8, -3), new Vector3(0, 10, -12), new Vector3(0, 6, -26)],
  light: [new Vector3(0, 4.4, -20), new Vector3(0, 2.8, -3), new Vector3(0, 10.5, -12), new Vector3(0, 13, -30)],
};
export const SCENES = 4;

export function createWorld(canvas, { reduced = false, lite = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: lite ? 'low-power' : 'high-performance' });
  const phone = () => window.innerWidth < 768;
  let dprCap = lite ? 1 : Math.min(window.devicePixelRatio || 1, phone() ? 1.5 : 2);
  renderer.setPixelRatio(dprCap);
  renderer.setClearColor(C.indigo, 1);

  const scene = new Scene();
  scene.fog = new FogExp2(C.indigo, 0.022);
  const camera = new PerspectiveCamera(48, 1, 0.1, 200);
  scene.add(camera);
  scene.add(new HemisphereLight('#8C7BFF', '#0E0838', 1.1));
  const moon = new DirectionalLight('#C9BEFF', 0.9);
  moon.position.set(-8, 14, 6);
  scene.add(moon);

  const U = {
    uAspect: { value: 1 }, uTime: { value: 0 }, uRise: { value: reduced ? 1 : 0.12 }, uLight: { value: new Vector2(0, -0.4) },
    uBoost: { value: 0 }, uPx: { value: dprCap }, uSnow: { value: 0.74 },
  };
  const sky = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: U, depthWrite: false, depthTest: false, fog: false }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const ridges = [
    ridge({ k: 0, base: C.r3, top: '#7C62C2', width: 120, height: 16 }, U.uSnow),
    ridge({ k: 1, base: C.r2, top: C.r3, width: 110, height: 12 }, U.uSnow),
    ridge({ k: 2, base: C.r1, top: C.r2, width: 100, height: 9 }, U.uSnow),
  ];
  ridges[0].position.set(0, 3, -40);
  ridges[1].position.set(4, 1, -30);
  ridges[2].position.set(-3, -0.5, -21);
  ridges.forEach((m) => scene.add(m));
  const floor = new Mesh(new PlaneGeometry(200, 200), flat('#140B47'));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const sky2 = stars(lite ? 300 : 600, 140, 6);
  scene.add(sky2);

  const fire = campfire();
  fire.position.set(0, 0, -3);
  scene.add(fire);
  const lan = lanterns(lite ? 20 : 44);
  scene.add(lan);
  const frames = photoFrames();
  scene.add(frames);
  const venue = venueHouse();
  venue.position.set(6, 0, -18);
  venue.scale.setScalar(0.9);
  scene.add(venue);

  const star = lanternStar();
  scene.add(star);
  const starLight = new PointLight('#FFE6F4', 26, 30, 1.4);
  scene.add(starLight);

  const snowCount = lite ? 220 : phone() ? 320 : 560;
  const seeds = new Float32Array(snowCount * 3);
  const rs = rand(42);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rs();
  const snowGeo = new BufferGeometry();
  snowGeo.setAttribute('position', new BufferAttribute(new Float32Array(snowCount * 3), 3));
  snowGeo.setAttribute('aSeed', new BufferAttribute(seeds, 3));
  const snow = new Points(snowGeo, new ShaderMaterial({ vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  snow.frustumCulled = false;
  camera.add(snow);

  const camCurve = new CatmullRomCurve3(KEYS.cam, false, 'centripetal');
  const lookCurve = new CatmullRomCurve3(KEYS.look, false, 'centripetal');
  const lightCurve = new CatmullRomCurve3(KEYS.light, false, 'centripetal');

  const pointer = new Vector2(); const pCur = new Vector2();
  const look = new Vector3(); const proj = new Vector3();
  let target = 0; let cur = 0;
  let rise = U.uRise.value; let riseTarget = rise;
  let settleTarget = 0;
  let time = 0; let last = performance.now();
  let started = false; let active = true; let running = false;
  // Quality steps, taken one at a time when frames are slow (over 30 ms on average for a second):
  // 1 no blur behind the frosted sections, 2 resolution 1x, 3 half the lanterns and snow,
  // 4 resolution 0.75x, 5 half frame rate, 6 resolution 0.5x.
  let quality = 0;
  let halfRate = false;
  let winStart = 0; let winFrames = 0; let skip = false;
  let resolveFirst;
  const firstFrame = new Promise((r) => { resolveFirst = r; });

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 64 : 48;
    camera.updateProjectionMatrix();
    U.uAspect.value = w / h;
    if (!running) render();
  }
  const near = (q, c, w) => Math.max(0, 1 - Math.abs(q - c) / w);

  function place(q, t) {
    camera.position.copy(camCurve.getPoint(q));
    camera.position.x += Math.sin(q * Math.PI * 2) * 0.8 + pCur.x * 0.9; // parallax with scroll and pointer
    camera.position.y += -pCur.y * 0.35;
    look.copy(lookCurve.getPoint(q));
    camera.lookAt(look);
    star.position.copy(lightCurve.getPoint(q));
    star.position.x += pCur.x * 0.6;
    star.position.y += (rise - 1) * 3 + Math.sin(t * 1.2) * 0.12;
    const b = U.uBoost.value;
    star.scale.setScalar((q > 0.85 ? 1 - 0.45 * ((q - 0.85) / 0.15) : 1) * (1 + b * 0.3));
    star.userData.spin(t, b);
    starLight.position.copy(star.position);
    starLight.intensity = 26 * rise * (1 + b * 1.2);
    // Morphs: the campfire grows in for Activities, lanterns brighten and frames appear for the Gallery.
    fire.scale.setScalar(Math.max(0.001, Math.min(1, near(q, 1 / 3, 0.3) * 2)));
    fire.visible = fire.scale.x > 0.01;
    fire.userData.flicker(t);
    lan.visible = q > 0.35;
    if (lan.visible) lan.userData.drift(t, near(q, 2 / 3, 0.3));
    const fs = Math.min(1, near(q, 2 / 3, 0.22) * 1.8);
    frames.visible = fs > 0.01;
    if (frames.visible) frames.userData.float(t, fs);
    scene.fog.density = 0.026 - 0.012 * near(q, 1, 0.3);
    sky2.material.opacity = 0.5 + 0.5 * Math.max(near(q, 0, 0.3), near(q, 1, 0.4));
    scene.traverse((o) => { if (o.userData.billboard) o.quaternion.copy(camera.quaternion); });
    // The sky's glow and rays follow the star on screen.
    proj.copy(star.position).project(camera);
    U.uLight.value.set(proj.x * U.uAspect.value, proj.z < 1 ? proj.y : -2);
  }

  function render() {
    place(cur, time);
    renderer.render(scene, camera);
    if (resolveFirst) { resolveFirst(); resolveFirst = null; }
  }

  const setDpr = (d) => { dprCap = Math.min(dprCap, d); renderer.setPixelRatio(dprCap); U.uPx.value = dprCap; resize(); };
  function lower() {
    quality++;
    if (quality === 1) document.documentElement.classList.add('world-lite');
    if (quality === 2) setDpr(1);
    if (quality === 3) {
      lan.children.forEach((l, i) => { l.visible = i % 2 === 0; });
      snowGeo.setDrawRange(0, Math.floor(snowCount / 2));
    }
    if (quality === 4) setDpr(0.75);
    if (quality === 5) halfRate = true;
    if (quality === 6) setDpr(0.5);
  }
  if (lite) { lower(); lower(); }

  function tick(now) {
    const raw = now - last;
    last = now;
    // Slow device: one quality step down per second of slow frames (see lower()).
    if (!winStart) winStart = now;
    winFrames++;
    if (now - winStart > 1000) {
      if ((now - winStart) / winFrames > (halfRate ? 60 : 30) && quality < 6) lower();
      winStart = now; winFrames = 0;
    }
    if (halfRate) { skip = !skip; if (skip) return; }
    const dt = Math.min(0.05, raw / 1000) * (halfRate ? 2 : 1);
    time += dt;
    U.uTime.value = time;
    // Scroll scrub with smooth easing: a damped follow of the scroll position. It uses
    // real time (up to 0.25 s a frame), so a slow device lags no further behind.
    const real = Math.min(0.25, raw / 1000) * (halfRate ? 2 : 1);
    cur += (target - cur) * (1 - Math.exp(-real / 0.28));
    pCur.lerp(pointer, 1 - Math.exp(-dt / 0.25));
    rise += (riseTarget - rise) * (1 - Math.exp(-dt / 0.9));
    U.uRise.value = rise;
    U.uSnow.value += (0.74 - settleTarget * 0.2 - U.uSnow.value) * (1 - Math.exp(-dt / 0.6));
    render();
  }

  function setRunning(on) {
    if (reduced || !started) { if (running) renderer.setAnimationLoop(null); running = false; render(); return; }
    if (on === running) return;
    running = on;
    last = performance.now();
    winStart = 0; winFrames = 0;
    renderer.setAnimationLoop(on ? tick : null);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setRunning(false);
    document.documentElement.classList.remove('has-webgl', 'has-world');
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  resize();

  return {
    firstFrame,
    setPointer(x, y) { pointer.set(x, y); if (reduced) { pCur.copy(pointer); render(); } },
    boost(b) { U.uBoost.value = b; if (!running) render(); },
    settle(p) {
      settleTarget = p;
      if (reduced || !running) { U.uSnow.value = 0.74 - p * 0.2; render(); }
    },
    // p: 0 hero, 1/3 activities, 2/3 gallery, 1 footer.
    setProgress(p) {
      target = Math.min(1, Math.max(0, p));
      if (!running) { cur = target; render(); }
    },
    get state() {
      return { boost: U.uBoost.value, settle: Math.min(1, Math.max(0, (0.74 - U.uSnow.value) / 0.2)), settleTarget, progress: cur, target, quality, running, lite };
    },
    setActive(on) { active = on && !document.hidden; setRunning(active); },
    rise() {
      riseTarget = 1;
      started = true;
      if (reduced) { rise = 1; U.uRise.value = 1; render(); return; }
      setRunning(active);
    },
  };
}
