// Round 5 effects. Every one eases in and out, none is staggered, and each is
// static or off with reduced motion. No requests leave the site.
//   A  spotlight that follows the mouse across cards and questions
//   B  countdown to the first day of camp, in the hero
//   C  burst of light on a successful registration
//   D  light sweep over a seat count when it appears or changes
//   E  slow pan on the centre gallery photo (CSS, see main.css)
//   F  hold the hero word to "illuminate" the scene
//   G  music opens up as the page scrolls (audio.js, wired here)
//   H  sections open from a rounded inset as they scroll in
//   I  snow settles along the hero ridges as the page scrolls (hero3d.js, wired here)
import { gsap, ScrollTrigger, reduced } from './motion.js';
import { T, $, $$, fill } from './i18n.js';
import { finePointer } from './pointer.js';

// ---------- A. Spotlight ----------
function initSpotlight() {
  if (!finePointer() || reduced()) return;
  $$('.card__in, .qa').forEach((el) => {
    el.classList.add('has-spot');
    let raf = 0;
    let x = 0;
    let y = 0;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${(x - r.left).toFixed(0)}px`);
        el.style.setProperty('--my', `${(y - r.top).toFixed(0)}px`);
      });
    }, { passive: true });
  });
}

// ---------- B. Countdown ----------
const DAY = 86400000;
const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export function countdownState(now = new Date()) {
  const cats = Object.values(T.cats || {});
  if (!cats.length) return null;
  const start = Math.min(...cats.map((c) => dayOf(c.start)));
  const end = Math.max(...cats.map((c) => dayOf(c.end)));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const n = Math.round((start - today) / DAY);
  if (n > 0) return { n };
  if (today <= end) return { on: true };
  return null;
}
function initCountdown() {
  const el = $('#hero-count');
  if (!el || !T.count) return { play() {} };
  const st = countdownState();
  if (!st) { el.hidden = true; return { play() {} }; }
  const pattern = st.on ? T.count.on : (st.n === 1 ? T.count.day : T.count.days);
  $('.hero__count-sr', el).textContent = fill(pattern, { n: st.n ?? '' });
  // Visible: the number on its own, larger, with the phrase read around it.
  const [before, after = ''] = pattern.split('{n}');
  $('.hero__count-b', el).textContent = before.trim();
  $('.hero__count-a', el).textContent = after.trim();
  const num = $('.hero__count-n', el);
  num.hidden = Boolean(st.on);
  el.hidden = false;
  const from = st.on ? 0 : Math.max(0, st.n - Math.min(st.n, 24));
  num.textContent = String(reduced() || st.on ? st.n ?? '' : from);
  // Rolls up to the number once, as the hero comes in.
  const play = () => {
    if (st.on || reduced()) return;
    const o = { v: from };
    gsap.to(o, { v: st.n, duration: 1.6, ease: 'big', delay: 0.4, onUpdate: () => { num.textContent = String(Math.round(o.v)); } });
  };
  return { play, state: st };
}

// ---------- C. Burst of light ----------
export function burst(host, { x, y } = {}) {
  if (!host || reduced()) return;
  const r = host.getBoundingClientRect();
  const cx = x ?? r.left + r.width / 2;
  const cy = y ?? r.top + r.height / 2;
  const canvas = document.createElement('canvas');
  canvas.className = 'burst';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  (host.closest('dialog') || document.body).append(canvas);
  const ctx = canvas.getContext('2d');
  const light = host.closest('[data-tone="light"], .light');
  // The poster's strokes; on light surfaces only the colours that stay visible there.
  const colors = light ? ['230,30,123', '12,170,228', '131,25,209', '248,156,56', '209,20,108'] : ['230,30,123', '248,156,56', '252,241,40', '145,234,67', '12,170,228', '205,16,221', '244,241,251'];
  const parts = Array.from({ length: window.innerWidth < 768 ? 48 : 72 }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const d = 80 + Math.random() * Math.min(360, Math.max(window.innerWidth, window.innerHeight) * 0.42);
    return { tx: Math.cos(a) * d, ty: Math.sin(a) * d * 0.8 + 40 * Math.random(), r: 1.6 + Math.random() * 3.2, c: colors[i % colors.length] };
  });
  // All together: each light travels out on the same in-out curve, then fades.
  const o = { t: 0 };
  const ease = gsap.parseEase('std');
  gsap.to(o, {
    t: 1, duration: 1.6, ease: 'none',
    onUpdate: () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const p = ease(Math.min(1, o.t / 0.8));
      const a = 1 - ease(Math.max(0, (o.t - 0.35) / 0.65));
      for (const s of parts) {
        const px = cx + s.tx * p;
        const py = cy + s.ty * p;
        const g = ctx.createRadialGradient(px, py, 0, px, py, s.r * 3);
        g.addColorStop(0, `rgba(${s.c},${0.9 * a})`);
        g.addColorStop(1, `rgba(${s.c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, s.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    onComplete: () => canvas.remove(),
  });
}

// ---------- D. Seat sweep ----------
export function sweep(el) {
  if (!el) return;
  el.classList.remove('is-swept');
  // Restart the CSS animation.
  void el.offsetWidth;
  el.classList.add('is-swept');
}

// ---------- F. Hold to illuminate ----------
function initIlluminate(hero, audio) {
  const word = $('#hero-word');
  const home = $('#home');
  if (!word || !home) return;
  word.classList.add('can-hold');
  const v = { b: 0 };
  let tween = null;
  let full = false;
  const apply = () => {
    home.style.setProperty('--boost', v.b.toFixed(3));
    hero.boost?.(v.b);
    home.wcBoost = v.b; // read by the end-to-end checks
  };
  const to = (b, duration, onComplete) => {
    tween?.kill();
    if (reduced()) { v.b = b; apply(); onComplete?.(); return; }
    tween = gsap.to(v, { b, duration, ease: 'std', onUpdate: apply, onComplete });
  };
  let holding = false;
  const start = (e) => {
    if (e.button > 0) return;
    holding = true;
    full = false;
    word.classList.add('is-holding');
    to(1, 1.2, () => {
      if (!holding || full) return;
      full = true;
      word.classList.add('is-lit');
      audio.play('glow');
    });
  };
  const end = () => {
    if (!holding) return;
    holding = false;
    word.classList.remove('is-holding', 'is-lit');
    to(0, 0.8);
  };
  word.addEventListener('pointerdown', start);
  word.addEventListener('contextmenu', (e) => { if (holding) e.preventDefault(); });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  word.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') end(); });
}

// ---------- G. Music follows scroll; I. snow settles ----------
function initScrollLinked(hero, audio) {
  const home = $('#home');
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    audio.setScroll?.(Math.min(1, window.scrollY / max));
    if (home) hero.settle?.(Math.min(1, window.scrollY / Math.max(1, home.offsetHeight * 0.8)));
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

// ---------- H. Sections open as they scroll in ----------
function initWipe() {
  if (reduced() || !window.matchMedia('(min-width: 768px)').matches) return;
  $$('main > .section').forEach((s) => {
    s.classList.add('has-wipe');
    gsap.fromTo(s, { clipPath: 'inset(0% 4% 0% 4% round 48px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'big',
      scrollTrigger: { trigger: s, start: 'top 100%', end: 'top 30%', scrub: 0.5 },
    });
  });
  ScrollTrigger.refresh();
}

export function initEffects({ audio, hero }) {
  initSpotlight();
  const count = initCountdown();
  initIlluminate(hero, audio);
  initScrollLinked(hero, audio);
  initWipe();
  return { countdown: count };
}
