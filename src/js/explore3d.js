// Round 16 (B): the framed 360° model (Paul's choice: the McLeodganj ridge with
// Snow View Residency, and the Lantern floating above it).
// - Drag sideways (or with the mouse in any direction) to turn it; it keeps turning
//   a little after you let go (inertia) and turns slowly by itself when left alone.
// - Up-and-down drags on a phone still scroll the page (touch-action: pan-y).
// - Numbered hotspots are real buttons (in the page's HTML, with their tip cards);
//   this module only places them over the model and hides those round the back.
// - "Tilt to turn" (touch devices): the phone's tilt turns the model, after a tap
//   (iPhone asks for permission then). Off again with the same button.
// Loaded only when the panel comes near the screen.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, HemisphereLight, PointLight, DirectionalLight,
  Mesh, Group, MeshLambertMaterial, ConeGeometry, CylinderGeometry, OctahedronGeometry, BoxGeometry,
  TorusGeometry, PlaneGeometry, Vector3, Spherical, DoubleSide, EdgesGeometry, LineSegments, LineBasicMaterial, Raycaster,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { C, SPECTRUM, flat, glowMat, rand, halo, venueHouse } from './world3d.js';

function ridgeAndVenue() {
  const g = new Group();
  const base = new Mesh(new CylinderGeometry(5.2, 5.6, 0.7, 10), flat('#2E2565'));
  base.position.y = -0.35;
  const top = new Mesh(new CylinderGeometry(5.2, 5.2, 0.06, 10), flat('#E9E4FA'));
  top.position.y = 0.03;
  g.add(base, top);
  const mGeo = new ConeGeometry(2.6, 4.2, 7, 3);
  const r = rand(3);
  const p = mGeo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 2 && p.getY(i) > -2) { p.setX(i, p.getX(i) * (0.85 + r() * 0.3)); p.setZ(i, p.getZ(i) * (0.85 + r() * 0.3)); }
  }
  mGeo.computeVertexNormals();
  const mountain = new Mesh(mGeo, flat(C.r3));
  mountain.position.set(-1.4, 2.1, -1.6);
  const cap = new Mesh(new ConeGeometry(1.05, 1.5, 7), flat(C.snow));
  cap.position.set(-1.4, 3.5, -1.6);
  const m2 = new Mesh(new ConeGeometry(1.8, 2.8, 6), flat(C.r2));
  m2.position.set(1.6, 1.4, -2.4);
  const cap2 = new Mesh(new ConeGeometry(0.62, 0.95, 6), flat(C.snow));
  cap2.position.set(1.6, 2.35, -2.4);
  g.add(mountain, cap, m2, cap2);
  [[3.2, 0.6], [3.6, -0.8], [-3.6, 1.4], [-2.8, 2.6], [0.4, 3.6], [2.4, 2.8], [-4.2, -0.2]].forEach(([x, z], i) => {
    const t = new Group();
    const green = i % 2 ? '#2D7A66' : '#24675A';
    const trunk = new Mesh(new CylinderGeometry(0.08, 0.1, 0.4, 5), flat('#5B3A2E'));
    trunk.position.y = 0.2;
    const c1 = new Mesh(new ConeGeometry(0.5, 0.9, 6), flat(green));
    c1.position.y = 0.75;
    const c2 = new Mesh(new ConeGeometry(0.36, 0.7, 6), flat(green));
    c2.position.y = 1.15;
    const s = new Mesh(new ConeGeometry(0.16, 0.25, 6), flat(C.snow));
    s.position.y = 1.45;
    t.add(trunk, c1, c2, s);
    t.position.set(x, 0, z);
    g.add(t);
  });
  const v = venueHouse();
  v.position.set(0.6, 0, 1.4);
  g.add(v);
  const sheet = new Mesh(new BoxGeometry(1.2, 0.04, 0.9), flat(C.cyan));
  sheet.position.set(-2.6, 0.06, 2.6);
  const post = new Mesh(new CylinderGeometry(0.05, 0.05, 1, 5), flat('#5B3A2E'));
  post.position.set(3.2, 0.5, 2.4);
  const board = new Mesh(new BoxGeometry(0.9, 0.45, 0.06), flat(C.yellow));
  board.position.set(3.2, 1.05, 2.4);
  g.add(sheet, post, board);
  return g;
}

function lantern() {
  const g = new Group();
  const n = 8; const R = 1.5; const H = 2.8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const col = new Color('#FFF3E6').lerp(new Color(SPECTRUM[i % SPECTRUM.length]), 0.35);
    const panel = new Mesh(new PlaneGeometry(2 * R * Math.sin(Math.PI / n) * 0.98, H), new MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, side: DoubleSide, transparent: true, opacity: 0.92, flatShading: true }));
    panel.position.set(Math.sin(a + Math.PI / n) * R * Math.cos(Math.PI / n), 0, Math.cos(a + Math.PI / n) * R * Math.cos(Math.PI / n));
    panel.rotation.y = a + Math.PI / n;
    g.add(panel);
  }
  g.add(new LineSegments(new EdgesGeometry(new CylinderGeometry(R, R, H, n)), new LineBasicMaterial({ color: '#2E2565' })));
  const topCap = new Mesh(new CylinderGeometry(0.9, R * 1.05, 0.5, n), flat('#2E2565'));
  topCap.position.y = H / 2 + 0.25;
  const botCap = new Mesh(new CylinderGeometry(R * 1.05, 0.9, 0.4, n), flat('#2E2565'));
  botCap.position.y = -H / 2 - 0.2;
  const handle = new Mesh(new TorusGeometry(0.6, 0.07, 6, 12, Math.PI), flat('#E9E4FA'));
  handle.position.y = H / 2 + 0.5;
  const flame = new Mesh(new OctahedronGeometry(0.42, 0), glowMat('#FFF4FB', 2.4));
  const tassel = new Mesh(new ConeGeometry(0.2, 0.7, 6), flat(C.pink));
  tassel.position.y = -H / 2 - 0.75;
  tassel.rotation.x = Math.PI;
  // Round 17: the lantern shines. A warm inner glow and a wide soft halo (both always facing
  // the camera, added to whatever is behind), which flicker with the flame in tick().
  // Drawn over the paper panels (no depth test), so the light seems to come through them.
  const inner = halo(5.2, 1);
  inner.material.color.set('#FFD9A6');
  const outer = halo(15, 0.6);
  outer.material.color.set('#FFB6D9');
  [inner, outer].forEach((h) => { h.material.depthTest = false; h.renderOrder = 10; });
  g.add(topCap, botCap, handle, flame, inner, outer, tassel);
  g.userData.flame = flame;
  g.userData.inner = inner;
  g.userData.outer = outer;
  g.userData.panels = g.children.filter((o) => o.isMesh && o.geometry.type === 'PlaneGeometry' && !o.userData.billboard);
  return g;
}

// Where each hotspot sits (model coordinates), keyed by the page's data-spot.
const LANTERN_Y = 6.4;
// Round 17: how the lantern shines. flicker() is a calm, uneven flicker in about 0..1
// (three slow waves, never the same twice in a row), shared by the flame, its light and the glows.
export const LAMP = { light: 30, swing: 0.22 };
export const flicker = (t) => 0.5 + 0.22 * Math.sin(t * 5.3) + 0.16 * Math.sin(t * 9.7 + 1.3) + 0.12 * Math.sin(t * 15.1 + 0.4);
const LANTERN_S = 0.62;
const SPOTS = {
  theme: new Vector3(0, LANTERN_Y + 0.4, 1.5 * LANTERN_S),
  dates: new Vector3(-1.4, 4.35, -1.6),
  venue: new Vector3(0.6, 2.15, 1.4),
  picnic: new Vector3(-2.6, 0.45, 2.6),
  fee: new Vector3(3.2, 1.55, 2.4),
};

export function createExplore(root, { reduced = false } = {}) {
  const frame = root.querySelector('.explore__frame');
  const canvas = root.querySelector('#explore-canvas');
  const spots = [...root.querySelectorAll('.spot')];
  const tiltBtn = root.querySelector('#explore-tilt');

  // Round 17: a see-through canvas, so the page's 3D world shows behind the model.
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2));
  renderer.setClearColor(C.indigo, 0);
  const scene = new Scene();
  scene.fog = new FogExp2(C.indigo, 0.03);
  scene.add(new HemisphereLight('#B7A8FF', '#0E0838', 1.4));
  const key = new DirectionalLight('#FFE9F6', 1.4);
  key.position.set(6, 10, 8);
  scene.add(key);

  const model = new Group();
  model.add(ridgeAndVenue());
  const lamp = lantern();
  lamp.scale.setScalar(LANTERN_S);
  lamp.position.y = LANTERN_Y;
  model.add(lamp);
  const lampLight = new PointLight('#FFE7C4', LAMP.light, 18, 1.5);
  lampLight.position.y = LANTERN_Y - 1;
  model.add(lampLight);
  scene.add(model);
  // Solid parts for the "is this number hidden behind the model?" test, and the glows that face the camera.
  const solids = [];
  const glows = [];
  model.traverse((o) => { if (o.isMesh) (o.userData.billboard ? glows : solids).push(o); });
  const ray = new Raycaster();

  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  const centre = new Vector3(0, 3.2, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(centre);
  controls.enableDamping = true; // inertia
  controls.dampingFactor = 0.07;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = 0.6;
  controls.maxPolarAngle = 1.42;
  controls.autoRotateSpeed = 1;
  canvas.style.touchAction = 'pan-y'; // after OrbitControls, which sets "none"
  camera.position.set(11, 8.5, 14);
  controls.update();

  let idle = 0;
  let interacting = false;
  controls.addEventListener('start', () => { interacting = true; idle = 0; controls.autoRotate = false; });
  controls.addEventListener('end', () => { interacting = false; idle = 0; });

  // Hotspots: the buttons and cards are in the HTML; here they are placed and toggled.
  root.classList.add('is-3d');
  root.classList.remove('is-wait');
  const close = (li, focus = false) => {
    if (!li.classList.contains('is-open')) return;
    li.classList.remove('is-open');
    li.querySelector('.spot__pin').setAttribute('aria-expanded', 'false');
    li.querySelector('.spot__card').hidden = true;
    root.classList.remove('has-open');
    if (focus) li.querySelector('.spot__pin').focus();
  };
  const open = (li) => {
    spots.forEach((o) => { if (o !== li) close(o); });
    li.classList.add('is-open');
    li.querySelector('.spot__pin').setAttribute('aria-expanded', 'true');
    const card = li.querySelector('.spot__card');
    // The card goes to the half of the frame away from its number, so it never covers it.
    const pr = li.querySelector('.spot__pin').getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    card.classList.toggle('is-top', pr.top + pr.height / 2 > fr.top + fr.height / 2);
    card.hidden = false;
    root.classList.add('has-open');
    controls.autoRotate = false;
    idle = -1e9; // no auto-rotate while a card is open
  };
  spots.forEach((li) => {
    li.querySelector('.spot__card').hidden = true;
    li.querySelector('.spot__pin').addEventListener('click', () => (li.classList.contains('is-open') ? close(li) : open(li)));
    li.querySelector('.spot__close')?.addEventListener('click', () => { close(li, true); idle = 0; });
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const li = spots.find((o) => o.classList.contains('is-open'));
    if (li) { e.stopPropagation(); close(li, true); idle = 0; }
  });

  // Tilt to turn (touch devices only; motion starts only after a tap).
  let tilt = null;
  let tiltBase = null;
  const sph = new Spherical();
  const off = new Vector3();
  const onTilt = (e) => {
    if (e.gamma == null) return;
    if (tiltBase === null) {
      off.copy(camera.position).sub(controls.target);
      sph.setFromVector3(off);
      tiltBase = { theta: sph.theta, gamma: e.gamma };
    }
    tilt = tiltBase.theta + ((e.gamma - tiltBase.gamma) * Math.PI) / 180 * 1.4;
  };
  const stopTilt = () => {
    window.removeEventListener('deviceorientation', onTilt);
    tilt = null; tiltBase = null;
    tiltBtn?.setAttribute('aria-pressed', 'false');
  };
  if (tiltBtn && window.matchMedia('(hover: none)').matches && 'DeviceOrientationEvent' in window && !reduced) {
    tiltBtn.hidden = false;
    tiltBtn.addEventListener('click', async () => {
      if (tiltBtn.getAttribute('aria-pressed') === 'true') { stopTilt(); return; }
      try {
        const ask = window.DeviceOrientationEvent.requestPermission;
        if (typeof ask === 'function' && (await ask.call(window.DeviceOrientationEvent)) !== 'granted') return;
      } catch { return; }
      window.addEventListener('deviceorientation', onTilt);
      tiltBtn.setAttribute('aria-pressed', 'true');
      controls.autoRotate = false;
    });
  }

  function resize() {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Phones (portrait-ish frames) step back so the lantern and the ridge both fit.
    const d = w / h < 1.1 ? 22 : 18;
    off.copy(camera.position).sub(controls.target).setLength(d);
    camera.position.copy(controls.target).add(off);
    camera.updateProjectionMatrix();
    controls.update();
    draw();
  }

  const v = new Vector3(); const dir = new Vector3();
  let time = 0; let last = performance.now();
  function draw() {
    glows.forEach((g) => g.quaternion.copy(camera.quaternion));
    model.updateMatrixWorld();
    renderer.render(scene, camera);
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    const placed = [];
    spots.forEach((li) => {
      const at = SPOTS[li.dataset.spot];
      if (!at) return;
      v.copy(at);
      model.localToWorld(v);
      // Hidden if something solid lies between the camera and the hotspot.
      dir.copy(v).sub(camera.position);
      const dist = dir.length();
      ray.set(camera.position, dir.normalize());
      ray.far = dist - 0.35;
      const hidden = ray.intersectObjects(solids, false).length > 0;
      v.project(camera);
      placed.push({ li, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, hidden });
    });
    // Keep the numbers at least 56 px apart (48 px targets that never overlap, WCAG 2.5.8).
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]; const b = placed[j];
          let dx = b.x - a.x; let dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= 56) continue;
          if (d < 0.01) { dx = 1; dy = 0; }
          const push = (56 - d) / 2 / (d || 1);
          a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
        }
      }
    }
    placed.forEach(({ li, x, y, hidden }) => {
      const px = Math.min(w - 26, Math.max(26, x));
      const py = Math.min(h - 26, Math.max(26, y));
      li.querySelector('.spot__pin').style.setProperty('transform', `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`);
      li.classList.toggle('is-behind', hidden);
    });
  }
  function tick(now) {
    const prev = last;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) {
      time += dt;
      lamp.position.y = LANTERN_Y + Math.sin(time * 0.9) * 0.25;
      lamp.rotation.y = time * 0.25;
      lamp.userData.flame.rotation.y = time;
      const f = flicker(time);
      lampLight.intensity = LAMP.light * (1 - LAMP.swing / 2 + LAMP.swing * f);
      lamp.userData.flame.scale.setScalar(0.92 + 0.16 * f);
      lamp.userData.inner.material.opacity = 0.7 + 0.3 * f;
      lamp.userData.outer.material.opacity = 0.42 + 0.26 * f;
      lamp.userData.panels.forEach((m) => { m.material.emissiveIntensity = 1 + 0.3 * f; });
      // Idle time in real seconds (not the capped frame step), so slow devices also start turning after 3 s.
      if (!interacting && tilt === null) { idle += Math.min(0.5, (now - prev) / 1000); if (idle > 3) controls.autoRotate = true; }
    }
    if (tilt !== null) {
      off.copy(camera.position).sub(controls.target);
      sph.setFromVector3(off);
      sph.theta += (tilt - sph.theta) * (1 - Math.exp(-dt / 0.15));
      off.setFromSpherical(sph);
      camera.position.copy(controls.target).add(off);
    }
    controls.update(dt);
    draw();
  }

  let visible = false;
  let drawing = false;
  const sync = () => {
    const on = visible && !document.hidden && !document.documentElement.classList.contains('is-modal');
    renderer.setAnimationLoop(on ? tick : null);
    if (on !== drawing) { drawing = on; document.dispatchEvent(new CustomEvent('wc:explore', { detail: { drawing } })); }
    if (!on) stopTiltIfHidden();
  };
  const stopTiltIfHidden = () => { if (!visible && tilt !== null) stopTilt(); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(frame);
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  resize();

  const api = {
    get state() {
      off.copy(camera.position).sub(controls.target);
      sph.setFromVector3(off);
      return { azimuth: sph.theta, autoRotate: controls.autoRotate, running: visible, drawing, tilt: tilt !== null, lamp: lampLight.intensity, glow: lamp.userData.outer.material.opacity };
    },
  };
  root.wcExplore = api; // read by the end-to-end checks
  return api;
}
