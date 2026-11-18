// Round 17: a page opened by the curtain from the other page (home <-> privacy notice)
// starts covered, before its first paint; the page's own script then uncovers it.
// Plain script (not a module) so it runs before anything is drawn. If anything is
// off (framed page, reduced motion, old or foreign flag), it does nothing.
(function () {
  try {
    if (window.top !== window.self) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var v = JSON.parse(window.sessionStorage.getItem('wc-arrive') || 'null');
    var here = window.location.pathname.replace(/index\.html$/, '');
    if (v && Date.now() - v.t < 8000 && v.path === here) document.documentElement.classList.add('wc-arrive');
  } catch (e) { /* storage blocked: no cover */ }
})();
