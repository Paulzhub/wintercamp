// Hero: the pointer (device tilt or scroll on phones) is a light source that
// brightens the headline letters and moves the light in the 3D scene.
// Round 16 (B): the 3D scene is one continuous world behind the whole home page
// (world3d.js, a fixed canvas). The page scroll scrubs it through four scenes;
// it pauses while a dialog is open, the tab is hidden or the 3D model panel
// covers the screen. Activities and FAQ turn into frosted lavender panels over it
// (html.has-world). Reduced motion or no WebGL: a still frame and today's page.
import { $, $$ } from './i18n.js';
import { reduced } from './motion.js';

export function webglAvailable() {
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

  // Scroll position -> scene progress. Anchors: the top (hero), the middle of
  // Activities, the middle of the Gallery, the bottom (footer). Between anchors the
  // camera eases in and out (smoothstep), so it lingers on each scene.
  const html = document.documentElement;
  let anchors = [0, 1, 2, 3];
  const layout = () => {
    const max = Math.max(1, html.scrollHeight - window.innerHeight);
    const mid = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.min(max, Math.max(0, r.top + window.scrollY + r.height / 2 - window.innerHeight / 2));
    };
    const a = [0, mid('activities') ?? max / 3, mid('gallery') ?? (2 * max) / 3, max];
    for (let i = 1; i < a.length; i++) a[i] = Math.max(a[i], a[i - 1] + 1);
    anchors = a;
  };
  const progressAt = (y) => {
    const a = anchors;
    if (y <= a[0]) return 0;
    for (let i = 0; i < a.length - 1; i++) {
      if (y <= a[i + 1]) {
        const t = (y - a[i]) / (a[i + 1] - a[i]);
        return (i + t * t * (3 - 2 * t)) / (a.length - 1);
      }
    }
    return 1;
  };
  hero.wcProgressAt = progressAt; // read by the end-to-end checks
  const lite = () => {
    const nav = navigator;
    const small = window.innerWidth < 768;
    return Boolean(nav.connection?.saveData) || (small && ((nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4));
  };

  const ready = (canvas && webglAvailable()
    ? import('./world3d.js')
      .then((m) => m.createWorld(canvas, { reduced: reduced(), lite: lite() }))
      .then((s) => {
        scene = s;
        s.settle(settleP);
        html.classList.add('has-webgl');
        if (!reduced()) html.classList.add('has-world');
        // Pause while a dialog is open (is-modal) or the tab is hidden. Round 17: the world no
        // longer pauses under the Explore panel (it shows through it); while the model draws,
        // phones run the world at half rate (share()).
        const sync = () => s.setActive(!document.hidden && !html.classList.contains('is-modal') && !html.classList.contains('wc-vt'));
        document.addEventListener('visibilitychange', sync);
        document.addEventListener('wc:explore', (e) => s.share(Boolean(e.detail?.drawing)));
        new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['class'] });
        sync();
        // Scrub with the scroll (not with reduced motion: the scene stays on scene 1).
        let raf = 0;
        const update = () => { raf = 0; if (!reduced()) s.setProgress(progressAt(window.scrollY)); };
        window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
        const relayout = () => { layout(); update(); };
        window.addEventListener('resize', relayout);
        window.addEventListener('load', relayout);
        if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.getElementById('main') || document.body);
        relayout();
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
          html.classList.toggle('has-world', !e.matches);
          s.setProgress(e.matches ? 0 : progressAt(window.scrollY));
        });
        return s.firstFrame;
      })
    : Promise.resolve()
  ).catch((err) => {
    console.warn('3D scene unavailable, showing the still image instead.', err);
    html.classList.remove('has-webgl', 'has-world');
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
