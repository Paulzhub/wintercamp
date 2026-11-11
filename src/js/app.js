import { initLangMemory } from './prefs.js';
import { initMotion } from './motion.js';
import { setModalMotion } from './modal.js';
import { initAudio } from './audio.js';
import { initNav } from './nav.js';
import { initPointer } from './pointer.js';
import { initFaq } from './faq.js';
import { initCarousel } from './carousel.js';
import { initRegistration } from './register.js';
import { initHero } from './hero.js';
import { initLoader } from './loader.js';

export function boot() {
  const html = document.documentElement;
  html.classList.add('js-ok');
  if (initLangMemory()) return; // redirecting to the remembered language
  try {
    const audio = initAudio();
    const motion = initMotion();
    setModalMotion(motion);
    const hero = initHero();
    initNav(motion, audio);
    initPointer(audio);
    initFaq(audio);
    initCarousel(audio);
    initRegistration({ audio, motion });
    initLoader({ audio, motion, hero });
  } catch (err) {
    // Never leave anyone stuck behind the loading screen.
    console.error(err);
    document.getElementById('loader')?.remove();
    document.querySelectorAll('[inert]').forEach((el) => { el.inert = false; });
  }
}
