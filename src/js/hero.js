// Hero: the pointer (device tilt or scroll on phones) is a light source that
// brightens the headline letters and moves the light in the 3D scene.
import { $, $$ } from './i18n.js';
import { reduced } from './motion.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function initHero() {
  const hero = $('#home');
  const canvas = $('#scene');
  const letters = $$('#hero-word .ltr');
  const word = $('#hero-word');
  if (!hero) return { ready: Promise.resolve(), rise() {}, boost() {}, settle() {} };

  let scene = null;
  let pending = null;
  let settleP = 0;
  const light = (cx, cy) => {
    letters.forEach((l) => {
      const r = l.getBoundingClientRect();
      const d = Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2));
      l.style.setProperty('--lit', Math.max(0, 1 - d / 280).toFixed(3));
    });
  };
  const queue = (fn) => {
    pending = fn;
    requestAnimationFrame(() => { pending?.(); pending = null; });
  };

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    queue(() => {
      light(e.clientX, e.clientY);
      scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => queue(() => { light(-9999, -9999); scene?.setPointer(0, 0); }));
  // Touch: the snow and light follow the finger while it is on the hero.
  const follow = (e) => {
    const t0 = e.touches[0];
    if (!t0) return;
    queue(() => {
      light(t0.clientX, t0.clientY);
      scene?.setPointer((t0.clientX / window.innerWidth) * 2 - 1, (t0.clientY / window.innerHeight) * 2 - 1);
    });
  };
  hero.addEventListener('touchstart', follow, { passive: true });
  hero.addEventListener('touchmove', follow, { passive: true });
  hero.addEventListener('touchend', (e) => { if (!e.touches.length) queue(() => { light(-9999, -9999); scene?.setPointer(0, 0); }); }, { passive: true });

  // Phones: tilt where the browser allows it without a permission prompt, else scroll.
  const touch = window.matchMedia('(hover: none)').matches;
  let tilted = false;
  const sweep = (x) => {
    if (!word) return;
    const r = word.getBoundingClientRect();
    light(r.left + ((x + 1) / 2) * r.width, r.top + r.height / 2);
    scene?.setPointer(x, 0);
  };
  if (touch && !reduced()) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      tilted = true;
      queue(() => sweep(Math.max(-1, Math.min(1, e.gamma / 35))));
    }, { passive: true });
    window.addEventListener('scroll', () => {
      if (tilted) return;
      const p = Math.min(1, window.scrollY / Math.max(1, hero.offsetHeight * 0.6));
      queue(() => sweep(p * 2.4 - 1.2));
    }, { passive: true });
  }

  const ready = (canvas && webglAvailable()
    ? import('./hero3d.js')
      .then((m) => m.createScene(canvas, { reduced: reduced() }))
      .then((s) => {
        scene = s;
        s.settle(settleP);
        document.documentElement.classList.add('has-webgl');
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(([e]) => s.setActive(e.isIntersecting)).observe(hero);
        }
        document.addEventListener('visibilitychange', () => s.setActive(!document.hidden));
        return s.firstFrame;
      })
    : Promise.resolve()
  ).catch((err) => {
    console.warn('3D scene unavailable, showing the still image instead.', err);
    document.documentElement.classList.remove('has-webgl');
  });

  hero.wcScene = () => scene?.state || null; // read by the end-to-end checks
  return {
    ready,
    rise: () => scene?.rise(),
    boost: (b) => scene?.boost(b),
    settle: (p) => { settleP = p; scene?.settle(p); },
    get settleP() { return settleP; },
  };
}
