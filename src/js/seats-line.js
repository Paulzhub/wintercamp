// A short live seat line under the hero's Register button and in the phone menu:
// "Kids: 12 of 30 seats left · Youth: Seats are full". Filled once after the page
// is ready, and again whenever the registration view checks the seats (wc:seats).
import { T, $, $$, fill } from './i18n.js';
import { fetchSeats } from './api.js';

export function initSeatLine() {
  const hero = $('#hero-live');
  const others = $$('[data-seat-line]');
  if (!hero && !others.length) return;
  const L = T.live;
  const name = { kids: T.reg.kids, youth: T.reg.youth };
  let last = 0;

  function render(seats) {
    if (!seats?.kids || !seats?.youth) return;
    last = Date.now();
    const full = (c) => seats[c].left <= 0;
    const part = (c) => {
      if (!full(c)) return fill(L.line, { group: name[c], n: seats[c].left, total: seats[c].total });
      return seats[c].held > 0 ? fill(L.held, { group: name[c] }) : fill(L.full, { group: name[c] });
    };
    const allTaken = ['kids', 'youth'].every((c) => full(c) && !(seats[c].held > 0));
    const text = allTaken ? L.allFull : `${part('youth')} · ${part('kids')}`;
    if (hero) {
      $('.hero__live-text', hero).textContent = text;
      $('.hero__live-call', hero).hidden = !allTaken;
      hero.classList.toggle('is-full', allTaken);
      hero.hidden = false;
    }
    others.forEach((el) => { el.textContent = text; el.hidden = false; });
  }

  async function load() {
    if (!T.api) return;
    try { render(await fetchSeats()); } catch { /* the line stays hidden or keeps its last value */ }
  }

  document.addEventListener('wc:seats', (e) => render(e.detail));
  const start = () => (window.requestIdleCallback ? requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 600));
  document.addEventListener('wc:ready', start, { once: true });
  // Coming back to the tab after a while: check again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && last && Date.now() - last > 60000) load(); });
}
