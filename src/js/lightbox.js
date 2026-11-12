// Full-screen gallery view.
// - Opens and closes in 0.7 s, easing in and out: a shared-element view transition
//   from the carousel where the browser supports it, the same motion with GSAP elsewhere.
// - Moving between items: the current item slides out in the direction of travel and
//   fades while the next slides in from the same side and fades in, together, 0.7 s.
// - Swipe anywhere in the view; pinch to zoom photos and videos (eases back on release).
import { gsap, reduced } from './motion.js';
import { T, $, fill } from './i18n.js';
import { openModal } from './modal.js';

const DUR = 0.7;
const MAX_ZOOM = 4;

export function initLightbox({ items, onIndex, audio }) {
  const box = $('#lightbox');
  const stage = $('#lightbox-stage');
  const cap = $('#lightbox-cap');
  let index = 0;

  // The size the media will have in the view, known before it loads, so the opening
  // transition (and the GSAP fallback) always has a real box to move into.
  function fit(it) {
    const w = Number(it.dataset.w) || 1600;
    const h = Number(it.dataset.h) || 1200;
    const natural = Number(it.dataset.fw) || w; // photos: width of the largest file
    const maxW = Math.max(1, window.innerWidth - 32);
    const maxH = Math.max(1, window.innerHeight - 176);
    const s = Math.min(natural / w, maxW / w, maxH / h);
    return { width: Math.round(w * s), height: Math.round(h * s) };
  }
  function size(el, it) {
    const { width, height } = fit(it);
    el.style.setProperty('width', `${width}px`);
    el.style.setProperty('height', `${height}px`);
  }

  function media(i) {
    const it = items[i];
    const thumb = it.querySelector('img');
    const alt = thumb?.getAttribute('alt') || it.querySelector('[role=img]')?.getAttribute('aria-label') || '';
    const caption = it.querySelector('.car__caption')?.textContent || '';
    let el;
    if (it.dataset.type === 'video') {
      el = document.createElement('video');
      el.src = it.dataset.video;
      if (it.dataset.poster) el.poster = it.dataset.poster;
      el.controls = true;
      el.playsInline = true;
      el.preload = 'metadata';
      el.setAttribute('aria-label', alt);
      el.autoplay = !reduced();
    } else {
      el = document.createElement('img');
      el.alt = alt;
      el.draggable = false;
      el.decoding = 'sync';
      // Start with the thumbnail the carousel already decoded, then swap in the
      // large file once it has loaded and decoded, so nothing ever shows blank.
      const full = it.dataset.full;
      const ready = thumb && thumb.complete && thumb.naturalWidth ? thumb.currentSrc : '';
      if (ready && ready !== new URL(full, location.href).href) {
        el.src = ready;
        const hi = new Image();
        hi.src = full;
        const swap = () => { el.src = full; };
        hi.decode().then(swap, swap);
      } else {
        el.src = full;
      }
    }
    el.dataset.fullSrc = it.dataset.full || it.dataset.video || '';
    size(el, it);
    // The wrapper slides; the media inside it zooms.
    const wrap = document.createElement('div');
    wrap.className = 'lightbox__item';
    wrap.append(el);
    return { wrap, el, caption: caption || alt };
  }
  // Waits (briefly) until the media can be painted, so the new snapshot has pixels.
  function painted(el, ms = 150) {
    const wait = el?.decode ? el.decode().catch(() => {}) : Promise.resolve();
    return Promise.race([wait, new Promise((r) => setTimeout(r, ms))]);
  }

  const current = () => stage.querySelector('.lightbox__item:not(.is-leaving)');
  const currentMedia = () => current()?.firstElementChild || null;
  const thumbOf = (i) => items[i]?.querySelector('.car__media img') || null;

  function setCaption(caption) {
    cap.textContent = `${caption} · ${fill(T.gallery.position, { n: index + 1, total: items.length })}`;
  }

  // ---------- Moving between items ----------
  let slide = null; // the running slide timeline
  function show(i, dir = 0) {
    slide?.progress(1); // a quick second move finishes the first one at once
    resetZoom(true);
    index = (i + items.length) % items.length;
    const out = current();
    out?.querySelector('video')?.pause();
    const { wrap, caption } = media(index);
    setCaption(caption);
    onIndex(index);
    if (!out || !dir || reduced()) {
      stage.replaceChildren(wrap);
      return;
    }
    out.classList.add('is-leaving');
    stage.append(wrap);
    const w = Math.min(window.innerWidth, 900) * 0.6;
    slide = gsap.timeline({ defaults: { duration: DUR, ease: 'std' }, onComplete: () => { out.remove(); slide = null; } })
      .to(out, { x: -dir * w, opacity: 0 }, 0)
      .fromTo(wrap, { x: dir * w, opacity: 0 }, { x: 0, opacity: 1, clearProps: 'transform,opacity' }, 0);
  }
  const step = (dir) => { show(index + dir, dir); audio.play('whoosh'); };

  // ---------- Pinch to zoom ----------
  const pointers = new Map();
  let pinch = null; // { el, d0, mid0 }
  let zoomTween = null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const zoomed = () => {
    const el = currentMedia();
    return Boolean(pinch) || (el ? Number(gsap.getProperty(el, 'scale')) > 1.01 : false);
  };

  function startPinch() {
    const el = currentMedia();
    if (!el) return;
    zoomTween?.kill();
    const [a, b] = [...pointers.values()];
    const r = el.getBoundingClientRect();
    const mid0 = midOf(a, b);
    // Zoom around the point between the fingers.
    gsap.set(el, { scale: 1, x: 0, y: 0, transformOrigin: `${mid0.x - r.left}px ${mid0.y - r.top}px` });
    pinch = { el, d0: Math.max(1, dist(a, b)), mid0 };
    box.classList.add('is-zooming');
  }
  function movePinch() {
    if (!pinch || pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const scale = Math.min(MAX_ZOOM, Math.max(1, dist(a, b) / pinch.d0));
    const mid = midOf(a, b);
    gsap.set(pinch.el, { scale, x: (mid.x - pinch.mid0.x) * 0.6, y: (mid.y - pinch.mid0.y) * 0.6 });
  }
  function endPinch() {
    if (!pinch) return;
    const { el } = pinch;
    pinch = null;
    box.classList.remove('is-zooming');
    // On release the item eases back to its normal size.
    zoomTween = gsap.to(el, { scale: 1, x: 0, y: 0, duration: reduced() ? 0 : DUR, ease: 'std', onComplete: () => gsap.set(el, { clearProps: 'transform,transformOrigin' }) });
  }
  function resetZoom(now) {
    pinch = null;
    box.classList.remove('is-zooming');
    zoomTween?.kill();
    const el = currentMedia();
    if (el && now) gsap.set(el, { clearProps: 'transform,transformOrigin' });
  }
  // iOS Safari: stop the page itself from zooming inside the view.
  ['gesturestart', 'gesturechange'].forEach((t) => box.addEventListener(t, (e) => e.preventDefault()));

  // ---------- Swipe anywhere in the view ----------
  let swipe = null;
  let suppressClick = false;
  box.addEventListener('pointerdown', (e) => {
    if (pointers.size === 0) suppressClick = false;
    if (e.button > 0 || e.target.closest('button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { swipe = null; startPinch(); return; }
    if (pointers.size > 2) return;
    // Leave the bottom of a video to its own controls (seek bar).
    const v = e.target.closest('video');
    if (v && e.clientY > v.getBoundingClientRect().bottom - 56) return;
    swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  box.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) movePinch();
  });
  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) { endPinch(); swipe = null; suppressClick = true; return; }
    if (!swipe || e.type === 'pointercancel') { swipe = null; return; }
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const fast = Math.abs(dx) / Math.max(1, performance.now() - swipe.t) > 0.35;
    swipe = null;
    if (Math.hypot(dx, dy) > 10) suppressClick = true;
    if (zoomed()) return;
    if (Math.abs(dx) < Math.abs(dy) || (Math.abs(dx) < 40 && !(fast && Math.abs(dx) > 16))) return;
    step(dx < 0 ? 1 : -1);
  };
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);

  // ---------- Open and close ----------
  let animating = false;
  function open(i, trigger) {
    const thumb = thumbOf(i);
    const doOpen = () => {
      show(i);
      if (thumb) thumb.style.removeProperty('view-transition-name');
      openModal(box, { trigger });
      $('#lightbox-close').focus();
      return painted(currentMedia());
    };
    audio.play('expand');
    if (reduced()) { doOpen(); return; }
    if (document.startViewTransition && thumb) {
      thumb.style.setProperty('view-transition-name', 'wc-media');
      const vt = document.startViewTransition(doOpen);
      // A transition can be skipped (e.g. the page is hidden); the view still opens.
      vt.ready.catch(() => {});
      vt.finished.catch(() => {});
      return;
    }
    // Fallback: the same motion with GSAP, from the thumbnail into place.
    doOpen();
    animating = true;
    const el = currentMedia();
    const tl = gsap.timeline({ defaults: { duration: DUR, ease: 'std' }, onComplete: () => { animating = false; } });
    tl.fromTo(box, { backgroundColor: 'rgba(12,12,12,0)' }, { backgroundColor: 'rgba(12,12,12,0.96)', clearProps: 'backgroundColor' }, 0);
    tl.fromTo([cap, ...box.querySelectorAll('button')], { opacity: 0 }, { opacity: 1, clearProps: 'opacity' }, 0);
    if (el) tl.fromTo(el, fromThumb(el, thumb), { x: 0, y: 0, scale: 1, opacity: 1, clearProps: 'transform,opacity' }, 0);
  }

  // Where the media must start (or end) to sit exactly over its carousel thumbnail.
  function fromThumb(el, thumb) {
    const r = el.getBoundingClientRect();
    const t = thumb?.getBoundingClientRect();
    if (!t || !t.width || !r.width) return { x: 0, y: 0, scale: 0.88, opacity: 0, transformOrigin: '50% 50%' };
    return {
      x: t.left + t.width / 2 - (r.left + r.width / 2),
      y: t.top + t.height / 2 - (r.top + r.height / 2),
      scale: t.width / r.width,
      opacity: 1,
      transformOrigin: '50% 50%',
    };
  }

  function finishClose() {
    current()?.querySelector('video')?.pause();
    if (box.open) box.close();
    stage.replaceChildren();
    animating = false;
  }
  function close() {
    if (!box.open || animating) return;
    slide?.progress(1);
    resetZoom(true);
    current()?.querySelector('video')?.pause();
    const thumb = thumbOf(index);
    if (reduced()) { finishClose(); return; }
    if (document.startViewTransition && thumb) {
      animating = true;
      const vt = document.startViewTransition(() => {
        finishClose();
        thumb.style.setProperty('view-transition-name', 'wc-media');
      });
      const clean = () => { thumb.style.removeProperty('view-transition-name'); animating = false; };
      vt.finished.then(clean, clean);
      vt.ready.catch(() => {});
      return;
    }
    animating = true;
    const el = currentMedia();
    const tl = gsap.timeline({ defaults: { duration: DUR, ease: 'std' }, onComplete: () => { gsap.set([box, cap, ...box.querySelectorAll('button')], { clearProps: 'backgroundColor,opacity' }); finishClose(); } });
    tl.to(box, { backgroundColor: 'rgba(12,12,12,0)' }, 0);
    tl.to([cap, ...box.querySelectorAll('button')], { opacity: 0 }, 0);
    if (el) tl.to(el, fromThumb(el, thumb), 0);
  }

  window.addEventListener('resize', () => {
    if (!box.open) return;
    stage.querySelectorAll('.lightbox__item > *').forEach((el) => size(el, items[index]));
  });

  $('#lightbox-close').addEventListener('click', close);
  $('#lightbox-prev').addEventListener('click', () => step(-1));
  $('#lightbox-next').addEventListener('click', () => step(1));
  box.addEventListener('keydown', (e) => {
    if (e.target.closest('video') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  // Escape (or the Android back gesture) closes with the same animation.
  box.addEventListener('cancel', (e) => {
    if (e.target !== box) return;
    e.preventDefault();
    close();
  });
  box.addEventListener('close', () => {
    current()?.querySelector('video')?.pause();
    stage.replaceChildren();
    pointers.clear();
    resetZoom(false);
  });
  // A tap on the dark area closes; a swipe or pinch that ends there does not.
  box.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target === box || e.target === stage || e.target.classList?.contains('lightbox__fig')) close();
  });

  return { open, close };
}
