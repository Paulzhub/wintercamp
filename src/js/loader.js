// Loading screen: ILLUMINATE lights up letter by letter with real loading progress
// (fonts, 3D scene), capped at about 2.5 seconds; then "Enter with sound" or
// "Enter silently", and light expands from the word into the hero.
// A remembered sound choice (wc-sound) skips that step.
import { gsap, ScrollTrigger, reduced } from './motion.js';
import { $, $$ } from './i18n.js';
import { prefs } from './prefs.js';

const CAP_MS = 2500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function deepLink() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || id === 'home' || id === 'register' || !/^[\w-]+$/.test(id)) return null;
  const el = document.getElementById(id);
  return el && el.matches('[data-section]') ? el : null;
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

export function initLoader({ audio, motion, hero }) {
  const loader = $('#loader');
  const outside = $$('body > :not(#loader):not(script):not(dialog)');
  const finishPage = () => {
    outside.forEach((el) => { el.inert = false; });
    motion.start();
    hero.rise();
    motion.heroIntro();
    // Opened or reloaded on a section (#gallery, #faq...): go straight back there.
    const target = deepLink();
    if (target) {
      ScrollTrigger.refresh();
      motion.scrollTo(target, { immediate: true });
      // Images and fonts can still shift the layout for a moment: align again once settled.
      [350, 1000].forEach((ms) => setTimeout(() => {
        if (Math.abs(target.getBoundingClientRect().top - ($('#nav')?.offsetHeight || 64)) > 24 && location.hash === `#${target.id}`) {
          motion.scrollTo(target, { immediate: true, focus: false });
        }
      }, ms));
    } else {
      const h1 = $('.hero__h1');
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
      }
    }
    document.dispatchEvent(new Event('wc:ready'));
  };
  if (!loader) { finishPage(); return; }

  outside.forEach((el) => { el.inert = true; });
  motion.stop();
  window.scrollTo(0, 0);

  const letters = $$('.loader__ltr', loader);
  const bar = $('.loader__bar', loader);
  let shown = 0; // letters lit so far
  let target = 0; // real progress, 0..1
  let lastLit = 0;

  const paint = (now) => {
    const want = Math.round(target * letters.length);
    // At most one letter per 96ms, so they light one by one even on a fast connection.
    if (shown < want && now - lastLit > (reduced() ? 0 : 96)) {
      letters[shown].classList.add('is-lit');
      audio.play('letter', shown);
      shown += 1;
      lastLit = now;
    }
    const p = shown / letters.length;
    bar.style.setProperty('--p', String(p));
    bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (shown < letters.length) requestAnimationFrame(paint);
    else ready();
  };

  const tasks = [
    document.fonts ? document.fonts.ready : Promise.resolve(),
    hero.ready,
    new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true }))),
  ];
  let done = 0;
  tasks.forEach((t) => Promise.resolve(t).catch(() => {}).then(() => {
    done += 1;
    target = Math.max(target, done / tasks.length);
  }));
  // Real progress, but never longer than the cap.
  wait(CAP_MS - letters.length * 96).then(() => { target = 1; });
  target = 0.1;
  requestAnimationFrame(paint);

  let isReady = false;
  function ready() {
    if (isReady) return;
    isReady = true;
    loader.classList.add('is-ready');
    soundChoice();
  }

  const soundStep = $('#loader-sound', loader);
  let current = null;
  // One step at a time, cross-fading (0.48 s, eased in and out; instant with reduced motion).
  function showStep(step) {
    if (current === step) return;
    const prev = current;
    current = step;
    if (prev) {
      prev.classList.remove('is-in');
      prev.classList.add('is-out');
      const done = () => { prev.hidden = true; prev.classList.remove('is-out'); };
      if (reduced()) done(); else setTimeout(done, 480);
    }
    step.hidden = false;
    step.classList.add('is-in');
  }

  function soundChoice() {
    // Returning visitors who already chose skip the choice.
    const stored = audio.stored();
    if (stored) {
      setTimeout(() => exit(stored === 'on'), reduced() ? 200 : 640);
      return;
    }
    showStep(soundStep);
    setTimeout(() => $('#enter-sound')?.focus({ preventScroll: true }), 300);
  }

  let leaving = false;
  function exit(withSound) {
    if (leaving) return;
    leaving = true;
    audio.enable(withSound);
    if (withSound) audio.play('rise');
    const remove = () => { loader.remove(); finishPage(); };
    if (reduced()) {
      gsap.to(loader, { opacity: 0, duration: 0.32, onComplete: remove });
      return;
    }
    const light = document.createElement('span');
    light.className = 'loader__light';
    loader.append(light);
    const cover = (Math.hypot(window.innerWidth, window.innerHeight) / 32) * 1.6;
    gsap.timeline({ onComplete: remove })
      .to($('.loader__in', loader), { opacity: 0, scale: 1.04, duration: 0.48 }, 0)
      .to(light, { scale: cover, duration: 0.96, ease: 'big' }, 0.08)
      .to(loader, { opacity: 0, duration: 0.64 }, 0.72);
  }

  $('#enter-sound')?.addEventListener('click', () => exit(true));
  $('#enter-silent')?.addEventListener('click', () => exit(false));
}
