// Sub-pages (privacy notice): the same menu bar, phone menu, language and sound toggles.
import { initAudio } from './audio.js';
import { initNav } from './nav.js';
import { initPointer } from './pointer.js';
import { setModalMotion } from './modal.js';
import { initMotion } from './motion.js';
import { initParticles } from './particles.js';

export function bootPlain() {
  document.documentElement.classList.add('js-ok');
  const audio = initAudio();
  const motion = initMotion();
  setModalMotion(motion);
  initParticles();
  initNav(motion, audio);
  initPointer(audio);
}
