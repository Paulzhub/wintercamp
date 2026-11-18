import { initMotion } from './motion.js';
import { setModalMotion } from './modal.js';
import { initAudio } from './audio.js';
import { initNav } from './nav.js';
import { initPointer } from './pointer.js';
import { initFaq } from './faq.js';
import { initCarousel } from './carousel.js';
import { initCardPhotos } from './lightbox.js';
import { initRegistration } from './register.js';
import { initSeatLine } from './seats-line.js';
import { initHero } from './hero.js';
import { initLoader } from './loader.js';
import { initParticles } from './particles.js';
import { initEffects } from './effects.js';
import { initMarquee } from './marquee.js';
import { initExplore } from './explore.js';
import { arrive, initPageLinks } from './page-curtain.js';

export function boot() {
  const html = document.documentElement;
  html.classList.add('js-ok');
  try {
    // Round 17: opened by the curtain from the privacy notice? Then the curtain covers the page now.
    const arrival = arrive();
    const audio = initAudio();
    html.wcAudio = audio; // read by the end-to-end checks
    const motion = initMotion();
    setModalMotion(motion);
    const hero = initHero();
    initNav(motion, audio);
    initPageLinks(audio);
    initPointer(audio);
    initFaq(audio);
    initCarousel(audio);
    initCardPhotos(audio);
    initParticles();
    initRegistration({ audio, motion });
    initSeatLine();
    initMarquee();
    initExplore();
    const fx = initEffects({ audio, hero, motion });
    const intro = motion.heroIntro;
    motion.heroIntro = () => { intro(); fx.countdown.play(); };
    initLoader({ audio, motion, hero, arrival });
  } catch (err) {
    // Never leave anyone stuck behind the loading screen (or the curtain).
    console.error(err);
    html.classList.remove('wc-arrive');
    document.getElementById('curtain')?.wcCurtain?.reset();
    document.getElementById('loader')?.remove();
    document.querySelectorAll('[inert]').forEach((el) => { el.inert = false; });
  }
}
