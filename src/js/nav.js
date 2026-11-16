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
  // Round 14: closing is the exact reverse of opening. Opening unrolls the menu
  // downwards (0.8 s, 'big') while the links rise in (0.64 s, from 0.24 s); closing
  // lowers the links out and rolls the menu back up, ending where opening began.
  const OPEN_DUR = 0.8;
  const ITEMS_DUR = 0.64;
  const ITEMS_DELAY = 0.24;
  const menuItems = () => $$('.menu__links li, .menu__foot', menu);
  const clearMenu = () => gsap.set([menu, ...menuItems()], { clearProps: 'clipPath,opacity,transform' });
  let menuTl = null;
  let closing = false;
  const closeMenu = (after) => {
    if (!menu.open) { after?.(); return; }
    if (closing) return;
    const finish = () => {
      closing = false;
      clearMenu();
      menu.close();
      setTimeout(() => after?.(), 0);
    };
    menuTl?.kill();
    if (reduced()) { finish(); return; }
    closing = true;
    menuTl = gsap.timeline({ onComplete: finish });
    menuTl.to(menuItems(), { opacity: 0, y: 40, duration: ITEMS_DUR, ease: 'std' }, 0);
    menuTl.fromTo(menu, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)', duration: OPEN_DUR, ease: 'big' }, ITEMS_DELAY + ITEMS_DUR - OPEN_DUR);
  };
  openBtn?.addEventListener('click', () => {
    openModal(menu, { trigger: openBtn });
    openBtn.setAttribute('aria-expanded', 'true');
    menu.addEventListener('close', () => openBtn.setAttribute('aria-expanded', 'false'), { once: true });
    audio?.play('whoosh');
    if (reduced()) return;
    menuTl?.kill();
    menuTl = gsap.timeline();
    menuTl.fromTo(menu, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: OPEN_DUR, ease: 'big', clearProps: 'clipPath' }, 0);
    menuTl.fromTo(menuItems(), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: ITEMS_DUR, ease: 'std', clearProps: 'all' }, ITEMS_DELAY);
  });
  closeBtn?.addEventListener('click', () => closeMenu());
  menu?.addEventListener('cancel', (e) => { if (e.target !== menu) return; e.preventDefault(); closeMenu(); });
  // Register closes the menu at once (Paul's decision): the registration view opens over it.
  $$('[data-open-register]', menu).forEach((b) => b.addEventListener('click', () => {
    menuTl?.kill();
    closing = false;
    clearMenu();
    menu.close();
  }, { capture: true }));

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
