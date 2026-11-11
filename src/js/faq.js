import { gsap, ScrollTrigger, reduced } from './motion.js';
import { $$ } from './i18n.js';

// Expand and confirm: answers slide open; all answers stay in the HTML either way.
export function initFaq(audio) {
  $$('.qa').forEach((d) => {
    const summary = d.querySelector('summary');
    const body = d.querySelector('.qa__a');
    let busy = false;
    summary.addEventListener('click', (e) => {
      if (reduced()) { audio.play('expand'); setTimeout(() => ScrollTrigger.refresh(), 50); return; }
      e.preventDefault();
      if (busy) return;
      busy = true;
      if (!d.open) {
        d.open = true;
        audio.play('expand');
        gsap.fromTo(body, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.48, clearProps: 'height,opacity', onComplete: () => { busy = false; ScrollTrigger.refresh(); } });
      } else {
        gsap.to(body, { height: 0, opacity: 0, duration: 0.4, onComplete: () => { d.open = false; gsap.set(body, { clearProps: 'height,opacity' }); busy = false; ScrollTrigger.refresh(); } });
      }
    });
  });
}
