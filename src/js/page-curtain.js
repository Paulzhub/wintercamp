// Round 17: the curtain between the home page and the privacy notice, both ways
// (Paul's choice). A same-tab link to the other page plays the first half of the
// curtain (indigo, then pink to purple, with the page's name); once the screen is
// covered the next page loads. That page opens covered (public/arrive.js sets
// html.wc-arrive before the first paint, from a short-lived flag in sessionStorage)
// and uncovers when it is ready. Links that open a new tab (the registration form's
// privacy link), direct visits, reduced motion and browsers without popovers get
// no curtain. No View Transitions API: round 16 showed Chrome aborting that one on
// the 3D page.
import { reduced } from './motion.js';
import { createCurtain } from './curtain.js';

const KEY = 'wc-arrive';
const FRESH_MS = 8000;
const here = () => location.pathname.replace(/index\.html$/, '');

// Call before anything else draws. Returns { uncover() } when this page was opened by
// the curtain (the screen is then covered by the real curtain), otherwise null.
export function arrive() {
  const html = document.documentElement;
  let v = null;
  try {
    v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
  const fresh = v && Date.now() - v.t < FRESH_MS && v.path === here();
  const curtain = fresh && html.classList.contains('wc-arrive') && !reduced() ? createCurtain() : null;
  let held = null;
  if (curtain) held = curtain.hold(String(v.label || ''), { down: v.down !== false });
  html.classList.remove('wc-arrive'); // the real curtain now covers (or there is none)
  return held;
}

// Same-tab links to the other page play the curtain before leaving.
export function initPageLinks(audio) {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    const path = url.pathname.replace(/index\.html$/, '');
    if (path === here()) return; // same page: in-page links are nav.js's
    if (!path.startsWith(import.meta.env.BASE_URL)) return;
    if (reduced()) return;
    const curtain = createCurtain();
    if (!curtain || curtain.busy) return;
    e.preventDefault();
    const label = a.dataset.curtain || a.dataset.text || a.textContent.trim();
    // To the privacy notice: rises from the bottom; back home: comes down from the top.
    const down = !document.documentElement.classList.contains('page-plain');
    audio?.play?.('whoosh');
    curtain.cover(label, { down }).then(() => {
      try { sessionStorage.setItem(KEY, JSON.stringify({ label, down, t: Date.now(), path })); } catch { /* no flag: the next page just appears */ }
      location.assign(url.href);
    });
  });
  // Back/forward restores this page from the cache still covered: uncover it at once.
  window.addEventListener('pageshow', (e) => { if (e.persisted) document.getElementById('curtain')?.wcCurtain?.reset(); });
}
