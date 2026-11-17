// Contextual cursor with a light trail, magnetic buttons, tilt, ripples, tooltips
// and UI sounds. Cursor, trail, magnetism and tilt are for mouse users only;
// touch devices get press feedback (CSS scale + ripple).
// Round 16: the cursor wraps itself around the button under it (a ring in the
// button's own shape: "sticky cursor"), and magnetic buttons spring back with an
// elastic bounce. Both read reduced motion and the pointer type when they run.
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
  // Round 16: the ring that wraps around the hovered button.
  const ring = document.createElement('div');
  ring.className = 'cursor__ring';
  cursor.append(dot, ring);
  document.body.append(cursor);
  document.documentElement.classList.add('has-cursor');

  const dx = gsap.quickTo(dot, 'x', { duration: 0.24, ease: 'std' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.24, ease: 'std' });
  const tq = trail.map((t, i) => [
    gsap.quickTo(t, 'x', { duration: 0.32 + i * 0.08, ease: 'std' }),
    gsap.quickTo(t, 'y', { duration: 0.32 + i * 0.08, ease: 'std' }),
  ]);

  // Tone: red over light surfaces, white over dark ones. Read from the nearest
  // [data-tone] or .light/.dark ancestor (a class lookup, no layout), only when
  // the element under the mouse changes or the page scrolls under a still mouse.
  let tone = '';
  const toneOf = (el) => {
    const host = el?.closest?.('[data-tone], .light, .dark');
    if (!host) return 'dark';
    return host.dataset.tone || (host.classList.contains('light') ? 'light' : 'dark');
  };
  const setTone = (el) => {
    const t = toneOf(el);
    if (t === tone) return;
    tone = t;
    cursor.dataset.tone = t;
  };
  let last = null;
  let pending = 0;
  const probe = () => {
    pending = 0;
    if (!last) return;
    setTone(document.elementFromPoint(last.x, last.y));
  };
  document.addEventListener('scroll', () => { if (last && !pending) pending = requestAnimationFrame(probe); }, { passive: true, capture: true });

  // Open dialogs sit in the top layer, above the page: the cursor moves into the
  // top-most open dialog so it stays visible there (as the tooltip does).
  const home = () => {
    const open = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal'));
    const parent = open.at(-1) || document.body;
    if (cursor.parentElement !== parent) parent.append(cursor);
    if (last) setTone(document.elementFromPoint(last.x, last.y));
  };
  const mo = new MutationObserver(home);
  document.querySelectorAll('dialog').forEach((d) => mo.observe(d, { attributes: true, attributeFilter: ['open'] }));

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    last = { x: e.clientX, y: e.clientY };
    cursor.classList.remove('is-hidden');
    dx(e.clientX); dy(e.clientY);
    tq.forEach(([x, y]) => { x(e.clientX); y(e.clientY); });
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { cursor.classList.add('is-hidden'); unstick(); });
  document.addEventListener('pointerover', (e) => {
    setTone(e.target);
    const host = e.target.closest?.('[data-cursor]');
    const text = host?.dataset.cursor || '';
    label.textContent = text;
    cursor.classList.toggle('has-label', Boolean(text));
    const field = e.target.closest?.('input, textarea, select');
    cursor.classList.toggle('is-hidden', Boolean(field));
    const t = e.pointerType === 'mouse' ? stickTarget(e.target) : null;
    if (t !== stuck) { if (t) stick(t); else unstick(); }
  });

  // ---- Sticky cursor (round 16) ----
  // Over a button the orb becomes a ring in the button's shape (its size plus 6 px
  // each side, its own corner radius). The ring follows the button, which may itself
  // be pulled by the magnet, and leans 8% towards the mouse; it lets go when the
  // mouse leaves the button. Large targets (photos) keep the orb and its label.
  const PAD = 6;
  // The ring follows with a damped glide each frame (time constant 70 ms): calling a
  // fresh in-out tween every frame would keep restarting its slow start.
  const rs = { x: 0, y: 0, w: 16, h: 16 };
  const put = () => gsap.set(ring, { x: rs.x, y: rs.y, width: rs.w, height: rs.h });
  let stuck = null;
  let loop = 0;
  let prev = 0;
  function stickTarget(el) {
    if (reduced()) return null;
    const b = el?.closest?.('.btn, .icon-btn, .nav__link');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return null;
    const r = b.getBoundingClientRect();
    return r.width > 420 || r.height > 120 ? null : b;
  }
  const radiusOf = (el, h) => {
    const v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return v >= h / 2 - 1 ? (h + PAD * 2) / 2 : v + PAD;
  };
  const follow = (now) => {
    loop = 0;
    if (!stuck) return;
    if (!stuck.isConnected || stuck.disabled) { unstick(); return; }
    const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
    prev = now;
    const k = 1 - Math.exp(-dt / 0.07);
    const r = stuck.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const tx = cx + ((last?.x ?? cx) - cx) * 0.08;
    const ty = cy + ((last?.y ?? cy) - cy) * 0.08;
    rs.x += (tx - rs.x) * k;
    rs.y += (ty - rs.y) * k;
    rs.w += (r.width + PAD * 2 - rs.w) * k;
    rs.h += (r.height + PAD * 2 - rs.h) * k;
    put();
    // Scrolled away under a still mouse: let go.
    if (last && (last.x < r.left - PAD * 4 || last.x > r.right + PAD * 4 || last.y < r.top - PAD * 4 || last.y > r.bottom + PAD * 4)) { unstick(); return; }
    loop = requestAnimationFrame(follow);
  };
  function stick(el) {
    const r = el.getBoundingClientRect();
    gsap.killTweensOf(rs);
    if (!stuck) {
      // Start from the orb, so the ring grows out of it.
      Object.assign(rs, { x: last?.x ?? r.left, y: last?.y ?? r.top, w: 16, h: 16 });
      put();
    }
    stuck = el;
    ring.style.setProperty('border-radius', `${radiusOf(el, r.height)}px`);
    cursor.classList.add('is-stuck');
    cursor.wcStuck = el; // read by the end-to-end checks
    prev = 0;
    if (!loop) loop = requestAnimationFrame(follow);
  }
  function unstick() {
    if (!stuck) return;
    stuck = null;
    cursor.wcStuck = null;
    cursor.classList.remove('is-stuck');
    cancelAnimationFrame(loop);
    loop = 0;
    // Shrinks back into the orb while it fades.
    gsap.to(rs, { x: last?.x ?? rs.x, y: last?.y ?? rs.y, w: 16, h: 16, duration: 0.32, ease: 'std', onUpdate: put });
  }
  document.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') unstick(); });
  cursor.dataset.tone = 'dark';
  tone = 'dark';
}

// Magnetic buttons (round 16). Within 24 px of a button the button leans towards the
// mouse (32% of the distance from its centre, at most 14 px), following with the
// standard in-out curve; when the mouse leaves it springs home with an elastic
// bounce (Paul's choice). The pull is set with the CSS "translate" property, not
// "transform", so it adds to the press scale and never fights it, and the button's
// rest position is its box minus the current pull, so measuring never drifts.
// Mouse only; nothing moves with reduced motion or behind an open dialog.
export const MAGNET = { pull: 0.32, max: 14, field: 24, follow: 0.48, release: 1.2, ease: 'elastic.out(1, 0.3)' };
function initMagnetic() {
  const items = $$('[data-magnetic]').map((el) => ({ el, x: 0, y: 0, on: false, tw: null }));
  if (!items.length) return;
  const write = (it) => {
    if (Math.abs(it.x) < 0.01 && Math.abs(it.y) < 0.01) it.el.style.removeProperty('translate');
    else it.el.style.setProperty('translate', `${it.x.toFixed(2)}px ${it.y.toFixed(2)}px`);
  };
  const to = (it, x, y, release) => {
    it.tw?.kill();
    it.tw = gsap.to(it, release
      ? { x: 0, y: 0, duration: MAGNET.release, ease: MAGNET.ease, onUpdate: () => write(it), onComplete: () => { it.x = 0; it.y = 0; write(it); } }
      : { x, y, duration: MAGNET.follow, ease: 'std', onUpdate: () => write(it) });
  };
  const letGo = (it) => {
    if (!it.on) return;
    it.on = false;
    it.el.classList.remove('is-pulled');
    if (reduced()) { it.tw?.kill(); it.x = 0; it.y = 0; write(it); return; }
    to(it, 0, 0, true);
  };
  const clamp = (v) => Math.max(-MAGNET.max, Math.min(MAGNET.max, v));
  let mouse = null;
  let raf = 0;
  const frame = () => {
    raf = 0;
    const modal = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1);
    for (const it of items) {
      const el = it.el;
      const r = el.getBoundingClientRect();
      const blocked = !mouse || reduced() || el.disabled || !r.width || (modal && !modal.contains(el)) || el.closest('[inert]');
      // Rest box: where the button sits without the pull.
      const left = r.left - it.x;
      const top = r.top - it.y;
      const near = !blocked && mouse.x > left - MAGNET.field && mouse.x < left + r.width + MAGNET.field
        && mouse.y > top - MAGNET.field && mouse.y < top + r.height + MAGNET.field;
      if (!near) { letGo(it); continue; }
      if (!it.on) { it.on = true; el.classList.add('is-pulled'); }
      to(it, clamp((mouse.x - (left + r.width / 2)) * MAGNET.pull), clamp((mouse.y - (top + r.height / 2)) * MAGNET.pull), false);
    }
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(frame); };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') { if (mouse) { mouse = null; queue(); } return; }
    mouse = { x: e.clientX, y: e.clientY };
    queue();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { mouse = null; queue(); });
  window.addEventListener('scroll', queue, { passive: true, capture: true });
  window.addEventListener('blur', () => { mouse = null; queue(); });
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
  initMagnetic();
  if (reduced()) return;
  initTilt();
}
