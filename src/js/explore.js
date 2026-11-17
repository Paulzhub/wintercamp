// Round 16 (B): the "Explore" panel. The 3D model (explore3d.js) loads only when
// the panel comes near the screen, with WebGL and without reduced motion;
// otherwise the same facts show as a plain list of cards (the HTML as rendered).
// While the panel covers the whole screen, the background scene pauses (one
// WebGL scene drawing at a time).
import { reduced } from './motion.js';
import { webglAvailable } from './hero.js';

export function initExplore() {
  const root = document.getElementById('explore');
  if (!root) return;
  let covering = false;
  let raf = 0;
  const check = () => {
    raf = 0;
    const r = root.getBoundingClientRect();
    const now = r.top <= 0 && r.bottom >= window.innerHeight;
    if (now === covering) return;
    covering = now;
    document.dispatchEvent(new CustomEvent('wc:explore', { detail: { covering } }));
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(check); }, { passive: true });
  window.addEventListener('resize', check);

  if (reduced() || !webglAvailable() || !('IntersectionObserver' in window)) { root.classList.add('is-list'); return; }
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    import('./explore3d.js')
      .then((m) => m.createExplore(root, { reduced: reduced() }))
      .catch((err) => {
        console.warn('3D model unavailable, showing the list instead.', err);
        root.classList.remove('is-3d');
        root.classList.add('is-list');
        root.querySelectorAll('.spot__card').forEach((c) => { c.hidden = false; });
      });
  }, { rootMargin: '600px 0px' });
  // Only after the loading screen: the model is not needed behind it.
  document.addEventListener('wc:ready', () => io.observe(root), { once: true });
}
