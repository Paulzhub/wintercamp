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
      el.width = Number(it.dataset.w) || 1600;
      el.height = Number(it.dataset.h) || 1200;
    }
    return { el, caption: caption || alt };
  }

  function show(i) {
    index = (i + items.length) % items.length;
    stage.querySelector('video')?.pause();
    const { el, caption } = media(index);
    stage.replaceChildren(el);
    cap.textContent = `${caption} · ${fill(T.gallery.position, { n: index + 1, total: items.length })}`;
    onIndex(index);
  }

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
      document.startViewTransition(doOpen);
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
  $('#lightbox-prev').addEventListener('click', () => { show(index - 1); audio.play('whoosh'); });
  $('#lightbox-next').addEventListener('click', () => { show(index + 1); audio.play('whoosh'); });
  box.addEventListener('keydown', (e) => {
    if (e.target.closest('video') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  });
  box.addEventListener('close', () => { stage.querySelector('video')?.pause(); stage.replaceChildren(); });
  box.addEventListener('click', (e) => { if (e.target === box) close(); });

  return { open };
}
