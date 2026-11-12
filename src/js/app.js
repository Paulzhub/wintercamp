import { initMotion } from './motion.js';
import { setModalMotion } from './modal.js';
import { initAudio } from './audio.js';
import { initNav } from './nav.js';
import { initPointer } from './pointer.js';
import { initFaq } from './faq.js';
import { initCarousel } from './carousel.js';
import { initRegistration } from './register.js';
import { initSeatLine } from './seats-line.js';
import { initHero } from './hero.js';
import { initLoader } from './loader.js';
import { initParticles } from './particles.js';
import { initEffects } from './effects.js';

export function boot() {
  const html = document.documentElement;
  html.classList.add('js-ok');
  try {
    const audio = initAudio();
    html.wcAudio = audio; // read by the end-to-end checks
    const motion = initMotion();
    setModalMotion(motion);
    const hero = initHero();
    initNav(motion, audio);
    initPointer(audio);
    initFaq(audio);
    initCarousel(audio);
    initParticles();
    initRegistration({ audio, motion });
    initSeatLine();
    const fx = initEffects({ audio, hero, motion });
    const intro = motion.heroIntro;
    motion.heroIntro = () => { intro(); fx.countdown.play(); };
    initLoader({ audio, motion, hero });
  } catch (err) {
    // Never leave anyone stuck behind the loading screen.
    console.error(err);
    document.getElementById('loader')?.remove();
    document.querySelectorAll('[inert]').forEach((el) => { el.inert = false; });
  }
}
