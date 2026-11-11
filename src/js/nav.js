import { gsap, reduced } from './motion.js';
import { $, $$ } from './i18n.js';
import { openModal } from './modal.js';

export function initNav(motion, audio) {
  const nav = $('#nav');
  if (!nav) return;

  // Sticky transform: translucent frosted glass once the page scrolls.
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      nav.classList.toggle('is-stuck', window.scrollY > 16);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Clear active state for the section in view.
  const links = $$('.nav__link, .menu__link');
  const sections = $$('[data-section]');
  // Once the page is ready, the address follows the section in view (#gallery,
  // #faq...), so reloading or sharing the link returns to the same place.
  let trackHash = false;
  document.addEventListener('wc:ready', () => { trackHash = true; });
  const setActive = (id) => {
    links.forEach((l) => {
      const on = l.getAttribute('href') === `#${id}`;
      l.classList.toggle('is-active', on);
      if (on) l.setAttribute('aria-current', 'true');
      else l.removeAttribute('aria-current');
    });
    if (!trackHash || document.documentElement.classList.contains('is-modal')) return;
    const want = id === 'home' ? '' : `#${id}`;
    if (location.hash !== want) history.replaceState(null, '', want || location.pathname + location.search);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((s) => io.observe(s));
  }

  // Full-screen menu on phones.
  const menu = $('#menu');
  const openBtn = $('#menu-open');
  const closeBtn = $('#menu-close');
  const closeMenu = (after) => {
    if (!menu.open) { after?.(); return; }
    const finish = () => { menu.close(); setTimeout(() => after?.(), 0); };
    if (reduced()) finish();
    else gsap.to(menu, { opacity: 0, duration: 0.32, onComplete: () => { gsap.set(menu, { clearProps: 'opacity' }); finish(); } });
  };
  openBtn?.addEventListener('click', () => {
    openModal(menu, { trigger: openBtn });
    openBtn.setAttribute('aria-expanded', 'true');
    menu.addEventListener('close', () => openBtn.setAttribute('aria-expanded', 'false'), { once: true });
    audio?.play('whoosh');
    if (reduced()) return;
    gsap.fromTo(menu, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'big', clearProps: 'clipPath' });
    gsap.fromTo($$('.menu__links li, .menu__foot', menu), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.64, stagger: 0.064, delay: 0.24, clearProps: 'all' });
  });
  closeBtn?.addEventListener('click', () => closeMenu());
  menu?.addEventListener('cancel', (e) => { if (e.target !== menu) return; e.preventDefault(); closeMenu(); });
  $$('[data-open-register]', menu).forEach((b) => b.addEventListener('click', () => menu.close(), { capture: true }));

  // In-page links glide (or jump, with reduced motion) and move focus to the target.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || a.classList.contains('skip')) return;
    if (a.closest('dialog') && !a.closest('#menu')) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    closeMenu(() => {
      motion.start();
      motion.scrollTo(target);
      history.replaceState(null, '', id === '#home' ? location.pathname + location.search : id);
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu?.open) closeMenu();
  });
}
