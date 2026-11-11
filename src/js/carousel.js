// Liquid glass carousel and slider: centre item sharp and large, side items scaled
// and turned in 3D. Drag, swipe, arrow keys, buttons and the slider all move it.
import { gsap, reduced } from './motion.js';
import { T, $, fill } from './i18n.js';
import { initLightbox } from './lightbox.js';

export function initCarousel(audio) {
  const car = $('#carousel');
  if (!car) return;
  const items = [...car.querySelectorAll('.car__item')];
  const n = items.length;
  const range = $('#car-range');
  const posEl = $('#car-pos');
  const state = { pos: 0 };
  let index = 0;
  let spacing = 300;

  // Chromium can refract through an SVG displacement map; others get frosted blur.
  const chromium = Boolean(navigator.userAgentData?.brands?.some((b) => /Chromium/i.test(b.brand)));
  if (chromium) document.documentElement.classList.add('liquid');

  // Skeletons until each image has loaded.
  items.forEach((it) => {
    const img = it.querySelector('.car__media img');
    const wrap = it.querySelector('.car__media');
    const done = () => wrap.classList.remove('skeleton');
    if (!img) { done(); return; }
    if (img.complete && img.naturalWidth) done();
    else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
  });

  function measure() {
    const w = items[0]?.offsetWidth || 300;
    spacing = window.innerWidth < 768 ? w * 0.86 : w * 0.66;
  }

  function layout(p) {
    items.forEach((it, i) => {
      const o = i - p;
      const a = Math.abs(o);
      const x = o * spacing;
      const rot = Math.max(-56, Math.min(56, -o * 28));
      const z = -Math.min(a, 4) * 160;
      const s = 1 - Math.min(a, 3) * 0.08;
      it.style.setProperty('transform', `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg) scale(${s.toFixed(3)})`);
      it.style.setProperty('z-index', String(100 - Math.round(a * 10)));
      it.style.setProperty('opacity', a > 3.6 ? '0' : String(1 - Math.max(0, a - 2.6)));
      it.style.setProperty('visibility', a > 3.6 ? 'hidden' : 'visible');
      it.style.setProperty('filter', `brightness(${(1 - Math.min(a, 3) * 0.2).toFixed(2)})`);
    });
  }

  // Videos play muted inline when centred; full sound is in the lightbox.
  let io = true;
  function syncVideo() {
    items.forEach((it, i) => {
      const media = it.querySelector('.car__media');
      const existing = media.querySelector('video');
      const want = i === index && it.dataset.type === 'video' && io && !reduced();
      if (want && !existing) {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
        v.setAttribute('aria-hidden', 'true');
        v.src = it.dataset.video;
        if (it.dataset.poster) v.poster = it.dataset.poster;
        v.style.setProperty('position', 'absolute');
        v.style.setProperty('inset', '0');
        media.append(v);
        v.play().then(() => it.classList.add('is-playing')).catch(() => {});
      } else if (!want && existing) {
        existing.pause();
        existing.remove();
        it.classList.remove('is-playing');
      }
    });
  }

  function setIndex(i, { animate = true, sound = true } = {}) {
    const next = Math.max(0, Math.min(n - 1, Math.round(i)));
    const changed = next !== index;
    index = next;
    items.forEach((it, k) => it.classList.toggle('is-active', k === index));
    range.value = String(index);
    range.style.setProperty('--fill', `${(index / Math.max(1, n - 1)) * 100}%`);
    posEl.textContent = fill(T.gallery.position, { n: index + 1, total: n });
    if (changed && sound) audio.play('whoosh');
    gsap.killTweensOf(state);
    if (animate && !reduced()) {
      // 0.7 s, easing in and out, for every move (buttons, keys, slider, swipe).
      gsap.to(state, { pos: index, duration: 0.7, ease: 'std', onUpdate: () => layout(state.pos) });
    } else {
      state.pos = index;
      layout(index);
    }
    syncVideo();
  }

  const lightbox = initLightbox({ items, audio, onIndex: (i) => setIndex(i, { sound: false }) });

  // Drag and swipe. Capture only after a real drag so plain clicks still reach the item.
  let drag = null;
  let suppressClick = false;
  car.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('.car__controls')) return;
    drag = { x: e.clientX, y: e.clientY, start: state.pos, from: index, id: e.pointerId, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
  });
  car.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
      drag.moved = true;
      try { car.setPointerCapture(e.pointerId); } catch { /* fine without capture */ }
      car.classList.add('is-dragging');
      gsap.killTweensOf(state);
    }
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
    drag.lastX = e.clientX; drag.lastT = now;
    state.pos = Math.max(-0.4, Math.min(n - 0.6, drag.start - dx / spacing));
    layout(state.pos);
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      // A swipe always moves at least one item in its direction: a short flick of
      // 40 px or a quick one is enough; longer drags can move several.
      const dx = drag.lastX - drag.x;
      const fast = Math.abs(drag.v) > 0.35;
      if (Math.abs(dx) >= 40 || fast) {
        const dir = (Math.abs(dx) >= 40 ? dx : drag.v) < 0 ? 1 : -1;
        const travelled = Math.round(Math.abs(dx) / spacing);
        setIndex(drag.from + dir * Math.max(1, travelled));
      } else {
        setIndex(drag.from);
      }
    }
    car.classList.remove('is-dragging');
    drag = null;
  };
  car.addEventListener('pointerup', endDrag);
  window.addEventListener('pointerup', endDrag);
  car.addEventListener('pointercancel', () => { if (drag && !drag.moved) drag = null; else endDrag(); });

  items.forEach((it, i) => {
    it.querySelector('.car__btn').addEventListener('click', (e) => {
      if (suppressClick) { e.preventDefault(); return; }
      if (i !== index) setIndex(i);
      else lightbox.open(i, e.currentTarget);
    });
    it.querySelector('.car__btn').addEventListener('focus', () => { if (i !== index) setIndex(i); });
  });

  $('#car-prev').addEventListener('click', () => setIndex(index - 1));
  $('#car-next').addEventListener('click', () => setIndex(index + 1));
  range.addEventListener('input', () => setIndex(Number(range.value)));
  car.addEventListener('keydown', (e) => {
    if (e.target === range) return;
    const map = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: n - 1 };
    if (e.key in map) { e.preventDefault(); setIndex(map[e.key]); }
  });
  // Horizontal trackpad swipes.
  let wheelLock = 0;
  car.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelLock < 360) return;
    wheelLock = now;
    setIndex(index + Math.sign(e.deltaX));
  }, { passive: false });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { io = e.isIntersecting; syncVideo(); }).observe(car);
  }
  window.addEventListener('resize', () => { measure(); layout(state.pos); });
  measure();
  setIndex(0, { animate: false, sound: false });
}
