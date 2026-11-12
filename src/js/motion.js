import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { $, $$ } from './i18n.js';

gsap.registerPlugin(ScrollTrigger, CustomEase);
// Every animation eases in and out: standard and large-reveal curves from the design rules.
CustomEase.create('std', '0.65,0,0.35,1');
CustomEase.create('big', '0.76,0,0.24,1');
gsap.defaults({ ease: 'std', duration: 0.4 });

const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => reduceMQ.matches;
export { gsap, ScrollTrigger };

const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Splits a heading into words (Tibetan: syllables, split after the tsheg) for the reveal.
function splitWords(el) {
  if (el.dataset.split) return [...el.querySelectorAll('.w > span')];
  el.dataset.split = '1';
  const text = el.textContent;
  const parts = text.split(/(\s+)/);
  el.textContent = '';
  const inner = [];
  parts.forEach((p) => {
    if (!p) return;
    if (/^\s+$/.test(p)) { el.append(document.createTextNode(' ')); return; }
    const w = document.createElement('span');
    w.className = 'w';
    const s = document.createElement('span');
    s.textContent = p;
    w.append(s);
    el.append(w);
    inner.push(s);
  });
  return inner;
}

// Smooth scrolling for a scrolling panel (the registration view).
export function smoothPanel(wrapper, content) {
  if (reduced()) return null;
  const l = new Lenis({ wrapper, content, autoRaf: false, lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
  gsap.ticker.add((t) => l.raf(t * 1000));
  return l;
}

export function initMotion() {
  let lenis = null;
  if (!reduced()) {
    // Wheel and trackpad: a gentle glide that follows the input (lerp), which feels
    // smoother than a fixed-length curve. Jumps to a section use the in-out curve.
    lenis = new Lenis({ autoRaf: false, lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1, syncTouch: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const navH = () => $('#nav')?.offsetHeight || 64;

  const api = {
    lenis,
    reduced,
    stop() { lenis?.stop(); },
    start() { lenis?.start(); },
    scrollTo(target, { focus = true, immediate = false } = {}) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;
      const top = el.id === 'home';
      const done = () => {
        if (!focus) return;
        const f = top ? $('.hero__h1') || el : el;
        if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
        f.focus({ preventScroll: true });
      };
      if (immediate) {
        // Exact position, set directly; then tell the smooth-scroll library where we are.
        const y = top ? 0 : Math.max(0, el.getBoundingClientRect().top + window.scrollY - navH());
        window.scrollTo(0, y);
        lenis?.scrollTo(y, { immediate: true, force: true });
        ScrollTrigger.update();
        done();
      } else if (lenis) {
        lenis.scrollTo(top ? 0 : el, { offset: top ? 0 : -navH(), duration: 1.2, easing: inOutCubic, force: true, onComplete: done });
      } else {
        window.scrollTo({ top: top ? 0 : el.getBoundingClientRect().top + window.scrollY - navH(), behavior: reduced() ? 'auto' : 'smooth' });
        setTimeout(done, reduced() ? 0 : 600);
      }
    },
    heroIntro,
  };

  // Hero starts hidden behind the loader; heroIntro() plays when the loader exits.
  const heroLetters = $$('#hero-word .ltr');
  const heroIn = $$('[data-hero-in]');
  if (heroLetters.length) {
    if (reduced()) gsap.set([...heroLetters, ...heroIn], { opacity: 0 });
    else {
      gsap.set(heroLetters, { yPercent: 60, opacity: 0, filter: 'blur(12px)' });
      gsap.set(heroIn, { opacity: 0, y: 24 });
    }
  }
  function heroIntro() {
    if (!heroLetters.length) return;
    if (reduced()) {
      gsap.to([...heroLetters, ...heroIn], { opacity: 1, duration: 0.32, clearProps: 'opacity' });
      return;
    }
    const tl = gsap.timeline();
    tl.to(heroLetters, { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.96, ease: 'big', clearProps: 'filter' });
    tl.to(heroIn, { opacity: 1, y: 0, duration: 0.8, clearProps: 'transform' }, 0.32);
  }

  // Fade and lift for everything marked data-reveal (all together, no stagger).
  const reveal = $$('[data-reveal]');
  if (reveal.length) {
    gsap.set(reveal, reduced() ? { opacity: 0 } : { opacity: 0, y: 32 });
    ScrollTrigger.batch(reveal, {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => {
        batch.forEach((b) => b.classList.add('is-in'));
        gsap.to(batch, reduced()
          ? { opacity: 1, duration: 0.32 }
          : { opacity: 1, y: 0, duration: 0.8, clearProps: 'transform' });
      },
    });
    // Keyboard users must never land on something still invisible.
    document.addEventListener('focusin', (e) => {
      const r = e.target.closest?.('[data-reveal]');
      if (r && Number(getComputedStyle(r).opacity) < 1) gsap.set(r, { opacity: 1, y: 0 });
    });
  }

  // Headline reveal: words rise out of a mask.
  $$('[data-title]').forEach((title) => {
    const words = splitWords(title);
    if (reduced()) {
      gsap.from(title, { opacity: 0, duration: 0.32, scrollTrigger: { trigger: title, start: 'top 90%', once: true } });
      return;
    }
    gsap.set(words, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: title,
      start: 'top 90%',
      once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, duration: 0.96, ease: 'big' }),
    });
  });

  // Footer wordmark: clip reveal tied to scroll.
  const mark = $('[data-clip] span');
  if (mark) {
    if (reduced()) {
      gsap.from(mark, { opacity: 0, duration: 0.32, scrollTrigger: { trigger: mark, start: 'top 95%', once: true } });
    } else {
      // Ends with the clip opened past the glyph edges so no part of a letter is cut.
      gsap.fromTo(mark, { clipPath: 'inset(100% -4% -4% -4%)', yPercent: 40 }, {
        clipPath: 'inset(-20% -4% -4% -4%)', yPercent: 0, ease: 'none',
        scrollTrigger: { trigger: mark.parentElement, start: 'top 100%', end: 'bottom 95%', scrub: 0.6 },
      });
    }
  }

  // Sticky transform: the hero headline shrinks away as the menu bar wordmark appears.
  const word = $('#hero-word');
  const wordmark = $('#nav .nav__wordmark');
  if (word && wordmark) {
    ScrollTrigger.create({
      trigger: '#home',
      start: 'top top',
      end: () => `+=${Math.max(200, word.getBoundingClientRect().bottom)}`,
      onLeave: () => wordmark.classList.add('is-shown'),
      onEnterBack: () => wordmark.classList.remove('is-shown'),
    });
    if (!reduced()) {
      gsap.to(word, {
        scale: 0.36, yPercent: -64, opacity: 0, ease: 'none',
        scrollTrigger: { trigger: '#home', start: 'top top', end: 'bottom 40%', scrub: 0.4 },
      });
    }
  }

  window.addEventListener('load', () => ScrollTrigger.refresh());
  return api;
}
