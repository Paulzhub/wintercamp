// Sub-pages (privacy notice): the same menu bar, phone menu, language and sound toggles.
import { initLangMemory } from './prefs.js';
import { initAudio } from './audio.js';
import { initNav } from './nav.js';
import { initPointer } from './pointer.js';
import { setModalMotion } from './modal.js';

export function bootPlain() {
  document.documentElement.classList.add('js-ok');
  initLangMemory();
  const audio = initAudio();
  // No smooth scrolling here; links on this page go to the home page.
  const motion = { start() {}, stop() {}, scrollTo(el) { el?.scrollIntoView(); } };
  setModalMotion(motion);
  initNav(motion, audio);
  initPointer(audio);
}
