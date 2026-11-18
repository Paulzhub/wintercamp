// Sub-pages (privacy notice): the same menu bar, phone menu, language and sound toggles.
import { initAudio } from './audio.js';
import { initNav } from './nav.js';
import { initPointer } from './pointer.js';
import { setModalMotion } from './modal.js';
import { initMotion } from './motion.js';
import { initParticles } from './particles.js';
import { arrive, initPageLinks } from './page-curtain.js';

export function bootPlain() {
  document.documentElement.classList.add('js-ok');
  // Round 17: opened by the curtain from the home page: uncover once the fonts are in (at most 0.8 s).
  const arrival = arrive();
  const audio = initAudio();
  const motion = initMotion();
  setModalMotion(motion);
  initParticles();
  initNav(motion, audio);
  initPageLinks(audio);
  initPointer(audio);
  if (arrival) Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 800))]).then(() => arrival.uncover());
}
