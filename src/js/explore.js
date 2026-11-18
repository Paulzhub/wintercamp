// Round 16 (B): the "Explore" panel. The 3D model (explore3d.js) loads only when
// the panel comes near the screen, with WebGL and without reduced motion;
// otherwise the same facts show as a plain list of cards (the HTML as rendered).
// Round 17: the page's 3D world shows through the panel; explore3d.js tells it
// (wc:explore, detail.drawing) while the model draws, so phones can share the GPU.
import { reduced } from './motion.js';
import { webglAvailable } from './hero.js';

export function initExplore() {
  const root = document.getElementById('explore');
  if (!root) return;
  if (reduced() || !webglAvailable() || !('IntersectionObserver' in window)) { root.classList.add('is-list'); return; }
  // Round 17: the model frame's room is kept from the start (is-wait), so the page
  // doesn't get shorter when the model arrives (that left scroll effects measured wrong).
  root.classList.add('is-wait');
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    import('./explore3d.js')
      .then((m) => m.createExplore(root, { reduced: reduced() }))
      .catch((err) => {
        console.warn('3D model unavailable, showing the list instead.', err);
        root.classList.remove('is-3d', 'is-wait');
        root.classList.add('is-list');
        root.querySelectorAll('.spot__card').forEach((c) => { c.hidden = false; });
      });
  }, { rootMargin: '600px 0px' });
  // Only after the loading screen: the model is not needed behind it.
  document.addEventListener('wc:ready', () => io.observe(root), { once: true });
}
