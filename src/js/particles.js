// Falling particles behind section content, like the snow in the hero:
//   light sections  -> accent red  (#E3171A)
//   dark sections   -> secondary   (#E9ECEF)
// Any element with data-particles="accent" or "secondary" gets a canvas. One
// shared animation loop draws only the canvases that are on screen. Reduced
// motion: particles are drawn once, standing still.
// Touch (and the mouse) pushes nearby particles aside, and a tap scatters them;
// each one eases back to its own path afterwards.

const COLORS = { accent: [227, 23, 26], secondary: [233, 236, 239] };
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeField(host) {
  const kind = host.dataset.particles in COLORS ? host.dataset.particles : 'secondary';
  const [r, g, b] = COLORS[kind];
  const canvas = document.createElement('canvas');
  canvas.className = 'particles';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  host.classList.add('has-particles');
  const ctx = canvas.getContext('2d');
  const field = { host, canvas, ctx, parts: [], w: 0, h: 0, dpr: 1, visible: false };
  host.wcParticles = field; // read by the end-to-end checks
  // Light backgrounds get fewer, fainter particles so text stays easy to read.
  const light = kind === 'accent';
  const density = Number(host.dataset.particlesDensity || 1);

  field.resize = () => {
    const rect = host.getBoundingClientRect();
    field.dpr = Math.min(window.devicePixelRatio || 1, 2);
    field.w = rect.width;
    field.h = rect.height;
    canvas.width = Math.round(rect.width * field.dpr);
    canvas.height = Math.round(rect.height * field.dpr);
    const want = Math.round(Math.min(110, (rect.width * rect.height) / (light ? 26000 : 18000)) * density);
    while (field.parts.length < want) field.parts.push(spawn(field, true));
    field.parts.length = want;
    if (reduce()) draw(field, 0);
  };

  function spawn(f, anywhere) {
    const z = Math.random(); // depth: near particles are bigger, faster, brighter
    return {
      x: Math.random() * f.w,
      y: anywhere ? Math.random() * f.h : -10,
      r: 0.8 + z * (light ? 2.2 : 2.6),
      vy: 14 + z * 34, // px per second
      sway: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      a: (light ? 0.14 : 0.18) + z * (light ? 0.28 : 0.42),
      dx: 0, dy: 0, ux: 0, uy: 0, // push from a finger or pointer, and its velocity
      z,
    };
  }
  field.spawn = spawn;
  field.rgb = `${r},${g},${b}`;
  return field;
}

// Where the finger or pointer is (viewport coordinates), and any tap to answer.
const touch = { x: 0, y: 0, active: false, until: 0, taps: [] };
const REACH = 140; // px around the finger that particles move away from
const SPRING = 7; // how quickly a pushed particle returns
const DAMP = 9;

function draw(f, dt, t = performance.now() / 1000) {
  const { ctx, dpr } = f;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, f.w, f.h);
  const rect = dt ? f.host.getBoundingClientRect() : null;
  const near = rect && touch.active && performance.now() < touch.until;
  const fx = near ? touch.x - rect.left : 0;
  const fy = near ? touch.y - rect.top : 0;
  const taps = rect ? touch.taps.map((tp) => [tp.x - rect.left, tp.y - rect.top]) : [];
  for (const p of f.parts) {
    if (dt) {
      p.y += p.vy * dt;
      if (p.y - p.r > f.h) Object.assign(p, f.spawn(f, false));
      const px = p.x + Math.sin(t * 0.6 + p.phase) * p.sway + p.dx;
      const py = p.y + p.dy;
      const push = (cx, cy, reach, power) => {
        const ddx = px - cx;
        const ddy = py - cy;
        const d = Math.hypot(ddx, ddy);
        if (d >= reach || d < 0.01) return;
        const k = (1 - d / reach) ** 2 * power * (0.6 + p.z * 0.8);
        p.ux += (ddx / d) * k;
        p.uy += (ddy / d) * k;
      };
      if (near) push(fx, fy, REACH, 5000 * dt);
      taps.forEach(([cx, cy]) => push(cx, cy, REACH * 1.8, 520));
      // Spring back to the particle's own path, with damping.
      p.ux += (-p.dx * SPRING * SPRING - p.ux * DAMP) * dt;
      p.uy += (-p.dy * SPRING * SPRING - p.uy * DAMP) * dt;
      p.dx += p.ux * dt;
      p.dy += p.uy * dt;
    }
    const x = p.x + Math.sin(t * 0.6 + p.phase) * p.sway + p.dx;
    const py = p.y + p.dy;
    const glow = ctx.createRadialGradient(x, py, 0, x, py, p.r * 3);
    glow.addColorStop(0, `rgba(${f.rgb},${p.a})`);
    glow.addColorStop(0.35, `rgba(${f.rgb},${p.a * 0.6})`);
    glow.addColorStop(1, `rgba(${f.rgb},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, py, p.r * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function initParticles(root = document) {
  const hosts = [...root.querySelectorAll('[data-particles]')];
  if (!hosts.length) return;
  const fields = hosts.map(makeField);
  let last = performance.now();
  let running = false;

  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let any = false;
    for (const f of fields) {
      if (!f.visible) continue;
      any = true;
      draw(f, dt, now / 1000);
    }
    touch.taps.length = 0;
    running = any && !document.hidden && !reduce();
    if (running) requestAnimationFrame(loop);
  };
  const kick = () => {
    if (running || reduce() || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const f = fields.find((x) => x.host === e.target);
      if (f) f.visible = e.isIntersecting;
    });
    kick();
  }, { rootMargin: '100px 0px' });

  const ro = 'ResizeObserver' in window ? new ResizeObserver((entries) => {
    entries.forEach((e) => fields.find((x) => x.host === e.target)?.resize());
  }) : null;

  fields.forEach((f) => {
    f.resize();
    io.observe(f.host);
    ro?.observe(f.host);
  });
  if (!ro) window.addEventListener('resize', () => fields.forEach((f) => f.resize()));
  document.addEventListener('visibilitychange', kick);

  // Touch: follow the finger while it is down, also while the page scrolls under it.
  if (reduce()) return;
  const at = (x, y) => { touch.x = x; touch.y = y; touch.active = true; touch.until = performance.now() + 400; };
  window.addEventListener('touchstart', (e) => {
    const t0 = e.touches[0];
    if (!t0) return;
    at(t0.clientX, t0.clientY);
    touch.taps.push({ x: t0.clientX, y: t0.clientY });
    kick();
  }, { passive: true });
  window.addEventListener('touchmove', (e) => { const t0 = e.touches[0]; if (t0) at(t0.clientX, t0.clientY); }, { passive: true });
  window.addEventListener('touchend', (e) => { if (!e.touches.length) touch.active = false; }, { passive: true });
  window.addEventListener('touchcancel', () => { touch.active = false; }, { passive: true });
  // Mouse and pen: a gentler push as the pointer moves, a scatter on click.
  window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') at(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') touch.taps.push({ x: e.clientX, y: e.clientY }); }, { passive: true });
  // (Touch also fires pointerleave as soon as the page starts to scroll: ignore that.)
  document.documentElement.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') touch.active = false; });
}
