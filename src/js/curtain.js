// Round 16: curtain between sections. When a menu link jumps to a section, two
// layers wipe across the screen (indigo, then pink to purple), the section's name
// shows in Anton, the page moves underneath, and the layers wipe off the other
// side. Ordinary scrolling never plays it.
//
// The curtain is a manual popover, so it sits in the top layer above an open
// phone menu (also a <dialog>, in the top layer). Without popover support, or with
// reduced motion, there is no curtain: the menu jump works as before.
import { gsap, reduced } from './motion.js';

export const CURTAIN = { cover: 0.5, gap: 0.1, hold: 0.28, uncover: 0.5 };

export function createCurtain() {
  if (typeof HTMLElement === 'undefined' || typeof HTMLElement.prototype.showPopover !== 'function') return null;
  const el = document.createElement('div');
  el.className = 'curtain';
  el.id = 'curtain';
  el.setAttribute('popover', 'manual');
  el.setAttribute('aria-hidden', 'true');
  const a = document.createElement('div');
  a.className = 'curtain__layer curtain__layer--a';
  const b = document.createElement('div');
  b.className = 'curtain__layer curtain__layer--b';
  const name = document.createElement('p');
  name.className = 'curtain__name';
  el.append(a, b, name);
  document.body.append(el);

  let tl = null;
  const api = {
    get busy() { return Boolean(tl); },
    get available() { return !reduced(); },
    // down: moving further down the page, so the layers rise from the bottom and leave at the top.
    play(label, { down = true, onCovered } = {}) {
      tl?.progress(1);
      name.textContent = label;
      const from = down ? '50% 100%' : '50% 0%';
      const to = down ? '50% 0%' : '50% 100%';
      const shift = down ? 32 : -32;
      el.showPopover();
      el.dataset.state = 'covering';
      return new Promise((resolve) => {
        const C = CURTAIN;
        const covered = C.cover + C.gap;
        tl = gsap.timeline({
          defaults: { ease: 'big' },
          onComplete: () => {
            tl = null;
            gsap.set([a, b, name], { clearProps: 'all' });
            el.dataset.state = '';
            if (el.matches(':popover-open')) el.hidePopover();
            resolve();
          },
        });
        tl.fromTo(a, { scaleY: 0, transformOrigin: from }, { scaleY: 1, duration: C.cover }, 0);
        tl.fromTo(b, { scaleY: 0, transformOrigin: from }, { scaleY: 1, duration: C.cover }, C.gap);
        tl.fromTo(name, { opacity: 0, y: shift }, { opacity: 1, y: 0, duration: 0.36, ease: 'std' }, covered - 0.24);
        tl.call(() => {
          el.dataset.state = 'covered';
          tl.pause();
          Promise.resolve()
            .then(() => onCovered?.())
            .catch((err) => console.error(err))
            .finally(() => { el.dataset.state = 'uncovering'; tl?.resume(); });
        }, null, covered);
        tl.to(name, { opacity: 0, y: -shift, duration: 0.3, ease: 'std' }, covered + C.hold);
        tl.set([a, b], { transformOrigin: to }, covered + C.hold);
        tl.to(b, { scaleY: 0, duration: C.uncover }, covered + C.hold + 0.06);
        tl.to(a, { scaleY: 0, duration: C.uncover }, covered + C.hold + 0.06 + C.gap);
      });
    },
  };
  el.wcCurtain = api; // read by the end-to-end checks
  return api;
}
