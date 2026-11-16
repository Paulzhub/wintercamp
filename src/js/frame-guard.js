// Round 12 (security review F-05): the site must not run inside another website's frame,
// where an attacker could cover it or swap the payment details around it. GitHub Pages cannot
// send X-Frame-Options and a <meta> CSP ignores frame-ancestors, so the page checks for itself.
// When framed it tries to take over the whole window; if the browser blocks that (most do
// without a tap, and sandboxed frames always do), it hides everything and shows only a link
// that opens the real site. Returns true when framed, so the page does not start.
export function guardFrame() {
  let framed;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (!framed) return false;
  const html = document.documentElement;
  html.classList.add('wc-framed');
  const note = document.getElementById('framed');
  if (note) note.hidden = false;
  try { window.top.location.replace(window.location.href); } catch { /* blocked: the link stays */ }
  return true;
}
