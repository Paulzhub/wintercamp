// Lightbox with a shared-element transition from the carousel where supported.
import { gsap, reduced } from './motion.js';
import { T, $, fill } from './i18n.js';
import { openModal } from './modal.js';

export function initLightbox({ items, onIndex, audio }) {
  const box = $('#lightbox');
  const stage = $('#lightbox-stage');
  const cap = $('#lightbox-cap');
  let index = 0;

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
      el.src = it.dataset.full;
      el.alt = alt;
      el.draggable = false;
      el.width = Number(it.dataset.w) || 1600;
      el.height = Number(it.dataset.h) || 1200;
    }
    return { el, caption: caption || alt };
  }

  // dir: 1 = next, -1 = previous, 0 = no slide (opening). Moves take 0.7 s, easing in and out.
  let busy = false;
  function show(i, dir = 0) {
    if (busy) return;
    index = (i + items.length) % items.length;
    stage.querySelector('video')?.pause();
    const { el, caption } = media(index);
    const swap = () => {
      stage.replaceChildren(el);
      cap.textContent = `${caption} · ${fill(T.gallery.position, { n: index + 1, total: items.length })}`;
      onIndex(index);
    };
    if (!dir || reduced()) { swap(); return; }
    busy = true;
    const w = Math.min(window.innerWidth, 900) * 0.6;
    gsap.timeline({ onComplete: () => { busy = false; } })
      .to(stage, { x: -dir * w, opacity: 0, duration: 0.35, ease: 'std' })
      .add(swap)
      .fromTo(stage, { x: dir * w, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'std', clearProps: 'transform,opacity' });
  }

  // Swipe left or right on the photo or video (finger, pen or mouse).
  let swipe = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  const endSwipe = (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const fast = Math.abs(dx) / Math.max(1, performance.now() - swipe.t) > 0.35;
    swipe = null;
    if (Math.abs(dx) < Math.abs(dy) || (Math.abs(dx) < 40 && !(fast && Math.abs(dx) > 16))) return;
    show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    audio.play('whoosh');
  };
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', () => { swipe = null; });

  function open(i, trigger) {
    const thumb = items[i].querySelector('.car__media img');
    const doOpen = () => {
      show(i);
      if (thumb) thumb.style.removeProperty('view-transition-name');
      openModal(box, { trigger });
      $('#lightbox-close').focus();
    };
    audio.play('expand');
    if (document.startViewTransition && !reduced() && thumb) {
      thumb.style.setProperty('view-transition-name', 'wc-media');
      const vt = document.startViewTransition(doOpen);
      // A transition can be skipped (e.g. the page is hidden); the lightbox still opens.
      vt.ready.catch(() => {});
      vt.finished.catch(() => {});
    } else {
      doOpen();
      if (!reduced()) gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.48, clearProps: 'opacity' });
    }
  }

  function close() {
    stage.querySelector('video')?.pause();
    box.close();
    stage.replaceChildren();
  }

  $('#lightbox-close').addEventListener('click', close);
  $('#lightbox-prev').addEventListener('click', () => { show(index - 1, -1); audio.play('whoosh'); });
  $('#lightbox-next').addEventListener('click', () => { show(index + 1, 1); audio.play('whoosh'); });
  box.addEventListener('keydown', (e) => {
    if (e.target.closest('video') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1, -1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1, 1); }
  });
  box.addEventListener('close', () => { stage.querySelector('video')?.pause(); stage.replaceChildren(); });
  box.addEventListener('click', (e) => { if (e.target === box) close(); });

  return { open };
}
