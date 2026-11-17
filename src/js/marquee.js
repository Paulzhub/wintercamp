// Round 16: the footer's "Kid's Happy Club" moves as a marquee.
// - One real name (read once by screen readers); copies are added here, aria-hidden.
// - Moves at a steady speed (a marquee has to), but starting, stopping and pausing
//   ease in and out (0.8 s, the standard curve).
// - A visible pause/play button (WCAG 2.2.2), and it also pauses while the mouse is
//   over it or keyboard focus is on its button (on the line under it). It stops when off screen or the tab is
//   hidden. With reduced motion it is the still wordmark, as before, and the button
//   is hidden. All of these are read when they change, not only at start.
import { gsap } from './motion.js';
import { $ } from './i18n.js';

export const MARQUEE = { speed: () => Math.max(40, window.innerWidth * 0.04), ease: 0.8 };

export function initMarquee() {
  const root = $('#marquee');
  if (!root) return null;
  const track = $('.marquee__track', root);
  const group = $('.marquee__group', track);
  const btn = $('#marquee-toggle');
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let loop = null;
  let speedTw = null;
  let width = 0;
  const state = { user: false, hover: false, focus: false, view: false };

  const label = () => {
    if (!btn) return;
    const text = state.user ? btn.dataset.labelPlay : btn.dataset.labelPause;
    btn.setAttribute('aria-label', text);
    btn.dataset.tip = text;
    btn.classList.toggle('is-paused', state.user);
  };
  const wanted = () => !state.user && !state.hover && !state.focus && state.view && !document.hidden;

  // Ease the loop's speed to 1 (moving) or 0 (still).
  const apply = (instant = false) => {
    if (!loop) return;
    const on = wanted();
    root.dataset.moving = on ? 'true' : 'false';
    speedTw?.kill();
    if (on) loop.resume();
    if (instant) {
      loop.timeScale(on ? 1 : 0);
      if (!on) loop.pause();
      return;
    }
    speedTw = gsap.to(loop, {
      timeScale: on ? 1 : 0, duration: MARQUEE.ease, ease: 'std',
      onComplete: () => { if (!on) loop.pause(); },
    });
  };

  const teardown = () => {
    speedTw?.kill();
    loop?.kill();
    loop = null;
    track.querySelectorAll('[data-clone]').forEach((n) => n.remove());
    gsap.set(track, { clearProps: 'transform' });
    root.classList.remove('is-running');
    root.dataset.moving = 'false';
    if (btn) btn.hidden = true;
  };

  const build = () => {
    const progress = loop ? loop.progress() : 0;
    teardown();
    if (reduceMQ.matches) return;
    root.classList.add('is-running');
    width = group.getBoundingClientRect().width;
    if (!width) return;
    // Enough copies that the track always covers the screen while it moves one set along.
    const copies = Math.ceil(root.clientWidth / width) + 1;
    for (let i = 0; i < copies; i++) {
      const c = group.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.dataset.clone = '1';
      track.append(c);
    }
    loop = gsap.fromTo(track, { x: 0 }, { x: -width, duration: width / MARQUEE.speed(), ease: 'none', repeat: -1, paused: true });
    loop.progress(progress);
    if (btn) btn.hidden = false;
    apply(true);
  };

  btn?.addEventListener('click', () => { state.user = !state.user; label(); apply(); });
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { state.hover = true; apply(); } });
  root.addEventListener('pointerleave', () => { if (state.hover) { state.hover = false; apply(); } });
  // Keyboard focus only: a mouse click on the button focuses it too, and must not leave it paused.
  btn?.addEventListener('focus', () => { if (btn.matches(':focus-visible')) { state.focus = true; apply(); } });
  btn?.addEventListener('blur', () => { if (state.focus) { state.focus = false; apply(); } });
  document.addEventListener('visibilitychange', () => apply(true));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { state.view = e.isIntersecting; apply(!state.view); }).observe(root);
  } else state.view = true;
  reduceMQ.addEventListener?.('change', build);
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    build();
  });

  label();
  // Fonts change the width of the name: measure once they are ready.
  (document.fonts?.ready || Promise.resolve()).then(build);
  const api = { get state() { return { ...state, running: Boolean(loop), speed: loop ? loop.timeScale() : 0, x: Number(gsap.getProperty(track, 'x')), width } } };
  root.wcMarquee = api; // read by the end-to-end checks
  return api;
}
