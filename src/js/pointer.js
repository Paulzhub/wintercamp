// Contextual cursor with a light trail, magnetic buttons, tilt, ripples, tooltips
// and UI sounds. Cursor, trail, magnetism and tilt are for mouse users only;
// touch devices get press feedback (CSS scale + ripple).
import { gsap, reduced } from './motion.js';
import { T, $$ } from './i18n.js';

export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function initCursor() {
  const cursor = document.createElement('div');
  cursor.className = 'cursor is-hidden';
  cursor.setAttribute('aria-hidden', 'true');
  const dot = document.createElement('div');
  dot.className = 'cursor__dot';
  const label = document.createElement('span');
  label.className = 'cursor__label';
  label.lang = T.lang || 'en';
  dot.append(label);
  const trail = reduced() ? [] : Array.from({ length: 6 }, (_, i) => {
    const t = document.createElement('span');
    t.className = 'cursor__trail';
    t.style.setProperty('opacity', String(0.5 - i * 0.07));
    t.style.setProperty('transform', `scale(${1 - i * 0.12})`);
    cursor.append(t);
    return t;
  });
  cursor.append(dot);
  document.body.append(cursor);
  document.documentElement.classList.add('has-cursor');

  const dx = gsap.quickTo(dot, 'x', { duration: 0.24, ease: 'std' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.24, ease: 'std' });
  const tq = trail.map((t, i) => [
    gsap.quickTo(t, 'x', { duration: 0.32 + i * 0.08, ease: 'std' }),
    gsap.quickTo(t, 'y', { duration: 0.32 + i * 0.08, ease: 'std' }),
  ]);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    cursor.classList.remove('is-hidden');
    dx(e.clientX); dy(e.clientY);
    tq.forEach(([x, y]) => { x(e.clientX); y(e.clientY); });
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
  document.addEventListener('pointerover', (e) => {
    const host = e.target.closest?.('[data-cursor]');
    const text = host?.dataset.cursor || '';
    label.textContent = text;
    cursor.classList.toggle('has-label', Boolean(text));
    const field = e.target.closest?.('input, textarea, select');
    cursor.classList.toggle('is-hidden', Boolean(field));
  });
}

function initMagnetic() {
  $$('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.48, ease: 'std' });
    const y = gsap.quickTo(el, 'y', { duration: 0.48, ease: 'std' });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.32);
      y((e.clientY - (r.top + r.height / 2)) * 0.32);
    });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}

function initTilt() {
  $$('[data-tilt]').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.64, ease: 'std' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.64, ease: 'std' });
    const lift = gsap.quickTo(el, 'y', { duration: 0.64, ease: 'std' });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 12);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 12);
      lift(-8);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); lift(0); });
  });
}

function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest?.('.btn');
    if (!btn || btn.disabled || reduced()) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.setProperty('width', `${size}px`);
    s.style.setProperty('height', `${size}px`);
    s.style.setProperty('left', `${e.clientX - r.left - size / 2}px`);
    s.style.setProperty('top', `${e.clientY - r.top - size / 2}px`);
    btn.append(s);
    setTimeout(() => s.remove(), 700);
  });
}

// One tooltip element, moved into an open <dialog> when needed (dialogs sit in the top layer).
function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'wc-tip';
  let timer = 0;
  let current = null;
  const show = (el, delay = 320) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      current = el;
      (el.closest('dialog') || document.body).append(tip);
      tip.textContent = el.dataset.tip;
      tip.lang = T.lang || 'en';
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
      let top = r.top - t.height - 8;
      if (top < 8) top = r.bottom + 8;
      tip.style.setProperty('left', `${left}px`);
      tip.style.setProperty('top', `${top}px`);
      tip.classList.add('is-shown');
    }, delay);
  };
  const hide = () => {
    clearTimeout(timer);
    current = null;
    tip.classList.remove('is-shown');
  };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && e.pointerType === 'mouse') show(el);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && el.matches(':focus-visible')) show(el, 160);
    else hide();
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) hide(); });
  // Touch: tap a help icon to show its tip.
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('.tip-btn[data-tip]');
    if (!el) return;
    show(el, 0);
    setTimeout(hide, 2400);
  });
  window.addEventListener('scroll', hide, { passive: true });
}

function initSounds(audio) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('button, a.btn, a.nav__link, a.menu__link, .lang__opt, summary');
    if (!el || el.matches('[data-sound-toggle], summary')) return;
    audio.play('click');
  });
  if (!finePointer()) return;
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('.btn, .icon-btn, .nav__link, .lang__opt, .qa__q');
    if (el && !el.contains(e.relatedTarget)) audio.play('tick');
  });
}

export function initPointer(audio) {
  initRipple();
  initTooltips();
  initSounds(audio);
  if (!finePointer()) return;
  initCursor();
  if (reduced()) return;
  initMagnetic();
  initTilt();
}
