// End-to-end checks in headless Chrome against the built site and the mock backend
// (which runs the real apps-script/Code.gs).
//   WC_APPS_SCRIPT_URL=http://127.0.0.1:8787/exec npm run build && npm run test:e2e
// Screenshots go to test-results/. Set CHROME_PATH if Chrome is elsewhere.
import http from 'node:http';
import { readFile, mkdir, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { startMockBackend } from '../scripts/mock-backend.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'test-results');
const BASE = '/wintercamp/';
const PORT = 4321;
const SITE = `http://127.0.0.1:${PORT}${BASE}`;
const API = 'http://127.0.0.1:8787';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json' };
function staticServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
      p = path.join(dist, p.slice(BASE.length));
      try { if ((await stat(p)).isDirectory()) p = path.join(p, 'index.html'); } catch { /* 404 below */ }
      try {
        const body = await readFile(p);
        const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
        if (range) {
          const s = Number(range[1]); const e = range[2] ? Number(range[2]) : body.length - 1;
          res.writeHead(206, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Content-Range': `bytes ${s}-${e}/${body.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
          res.end(body.subarray(s, e + 1));
          return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// Reads a PDF made by the site: page count, and the JPEG of each page (to look at).
function readPdf(buf) {
  const text = buf.toString('latin1');
  const pages = (text.match(/\/Type \/Page /g) || []).length;
  const jpegs = [];
  let i = 0;
  while ((i = text.indexOf('/Filter /DCTDecode', i)) >= 0) {
    const start = text.indexOf('stream\n', i) + 7;
    const end = text.indexOf('\nendstream', start);
    jpegs.push(buf.subarray(start, end));
    i = end;
  }
  return { ok: text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF') && /startxref\n\d+/.test(text), pages, jpegs };
}
// Waits until no view transition is running (they take 0.7 s, longer on a busy machine).
const settled = (page) => page.waitForFunction(() => !document.getAnimations().some((a) => /view-transition/.test(a.effect?.pseudoElement || '')), null, { timeout: 5000 });
const waitFor = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t > ms) return v; await new Promise((r) => setTimeout(r, 250)); } };

// Round 10: pauses the gallery's view transition at several points and checks that the
// pixels just inside each corner of the moving box are not the image (the corners are
// rounded). Each frame is compared with the same paused frame with the moving item hidden.
async function cornerFrames(page, start, label, fractions = [0.1, 0.25, 0.5, 0.75]) {
  // The page's CSP blocks <style> tags, so add rules through the CSSOM instead.
  const addRule = (css) => page.evaluate((css) => { const sh = new CSSStyleSheet(); sh.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh]; return document.adoptedStyleSheets.length - 1; }, css);
  const dropRule = (i) => page.evaluate((i) => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((_, k) => k !== i); }, i);
  const noCanvas = await addRule('canvas { visibility: hidden !important; }'); // particles move between shots
  await start();
  const ok = await waitFor(() => page.evaluate(() => document.getAnimations().some((a) => /view-transition-group\(wc-media\)/.test(a.effect?.pseudoElement || ''))), 2000);
  if (!ok) { await dropRule(noCanvas); return { ran: false, frames: [] }; }
  const frames = [];
  for (const f of fractions) {
    await page.evaluate((f) => {
      document.getAnimations().filter((a) => /view-transition/.test(a.effect?.pseudoElement || '')).forEach((a) => { a.pause(); a.currentTime = 700 * f; });
      document.querySelectorAll('video').forEach((v) => v.pause()); // live snapshots: keep both shots the same
    }, f);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const rect = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement, '::view-transition-group(wc-media)');
      const m = new DOMMatrix(cs.transform);
      return { m: m.is2D ? 'flat' : cs.transform.slice(0, 60), x: m.e, y: m.f, w: parseFloat(cs.width), h: parseFloat(cs.height), r: parseFloat(cs.borderTopLeftRadius), dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight };
    });
    await page.waitForTimeout(120);
    const shot = await page.screenshot();
    const hide = await addRule('::view-transition-group(wc-media) { visibility: hidden !important; }');
    await page.waitForFunction(() => getComputedStyle(document.documentElement, '::view-transition-group(wc-media)').visibility === 'hidden');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(200);
    const bare = await page.screenshot();
    await dropRule(hide);
    const [a, b] = await Promise.all([shot, bare].map((buf) => sharp(buf).raw().toBuffer({ resolveWithObject: true })));
    const px = (img, x, y) => { const i = (Math.round(y * rect.dpr) * img.info.width + Math.round(x * rect.dpr)) * img.info.channels; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
    const diff = (x, y) => px(a, x, y).reduce((t, v, k) => t + Math.abs(v - px(b, x, y)[k]), 0);
    const corners = [];
    for (const [cx, cy, sx, sy] of [[rect.x, rect.y, 1, 1], [rect.x + rect.w, rect.y, -1, 1], [rect.x, rect.y + rect.h, 1, -1], [rect.x + rect.w, rect.y + rect.h, -1, -1]]) {
      const ix = cx + sx * 2;
      const iy = cy + sy * 2;
      const deep = [cx + sx * 40, cy + sy * 40];
      if (ix < 6 || iy < 6 || ix > rect.vw - 7 || iy > rect.vh - 7 || deep[1] < 1 || deep[1] > rect.vh - 2) continue; // off screen
      // Nothing of the item just inside the corner: the pixel there matches the shot with the
      // item hidden, or the background just outside the corner (whichever is closer).
      const near = (p, q) => p.reduce((t, v, k) => t + Math.abs(v - q[k]), 0);
      const bg = near(px(a, ix, iy), px(a, cx - sx * 4, cy - sy * 4));
      corners.push({ corner: Math.min(diff(ix, iy), bg), inside: diff(...deep) });
    }
    frames.push({ f, r: Math.round(rect.r * 10) / 10, m: rect.m, corners });
    if (corners.some((c) => c.corner > 60)) await sharp(shot).toFile(path.join(out, `r10-corners-FAIL-${label}-${f}.png`));
    if (f === 0.25) await page.screenshot({ path: path.join(out, `r10-corners-${label}.png`) });
  }
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await settled(page).catch(() => {});
  await dropRule(noCanvas);
  await page.waitForTimeout(300);
  return { ran: true, frames };
}
// Rounded: nothing of the item is drawn just inside a corner, while it is drawn further in.
// (Up to 60 of 765 allows for the blurred background re-rendering slightly between shots;
// the image against the indigo background differs by well over 100.)
const roundedOk = (res) => res.ran && res.frames.length > 0 && res.frames.every((fr) => fr.corners.length > 0 && fr.corners.every((c) => c.corner <= 60) && fr.corners.some((c) => c.inside > 60));
const lbItems = (page) => page.evaluate(() => [...document.querySelectorAll('#lightbox-stage .lightbox__item')].map((el) => ({ side: el.classList.contains('is-side'), leaving: el.classList.contains('is-leaving'), x: Math.round(new DOMMatrix(getComputedStyle(el).transform).m41), o: Math.round(Number(getComputedStyle(el).opacity) * 1000) / 1000 })));
async function toGalleryItem(page, type) {
  const idx = await page.evaluate((t) => [...document.querySelectorAll('.car__item')].findIndex((el) => el.dataset.type === t), type);
  const now = await page.evaluate(() => [...document.querySelectorAll('.car__item')].findIndex((el) => el.classList.contains('is-active')));
  await page.focus('#carousel');
  for (let k = now; k < idx; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); }
  await page.waitForTimeout(1000);
  return idx;
}

const api = async (p, body) => (await fetch(API + p, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined })).json();

function watch(page, label, { ignore = null } = {}) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !(ignore && ignore.test(m.text()))) problems.push(`console: ${m.text()}`); });
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(u)) problems.push(`external request: ${u}`);
  });
  return () => { check(`${label}: no script errors, CSP violations or third-party requests`, problems.length === 0, problems.slice(0, 4).join(' | ')); };
}

// Through the loading screen: language first (the page's own), then sound.
// Remembered choices skip those steps, so each is only answered when shown.
async function enter(page, button = '#enter-silent', tap = false) {
  await page.waitForSelector('.loader.is-ready', { timeout: 8000 });
  const press = (sel) => (tap ? page.tap(sel) : page.click(sel));
  await page.waitForTimeout(100);
  const which = await Promise.race([
    page.waitForSelector('#loader', { state: 'detached', timeout: 6000 }).then(() => 'gone'),
    page.waitForSelector(`${button}:visible`, { timeout: 6000 }).then(() => 'button'),
  ]);
  if (which === 'button') await press(button);
  await page.waitForSelector('#loader', { state: 'detached', timeout: 5000 });
}

const axeSource = await readFile(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
async function axe(page, label, context) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async (ctx) => {
    const r = await window.axe.run(ctx || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}`);
  }, context);
  check(`${label}: axe WCAG 2.2 AA`, res.length === 0, res.join(' | '));
  return res;
}

async function drawSignature(page) {
  await page.locator('#f-sign').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await page.locator('#f-sign').boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) await page.mouse.move(box.x + 40 + i * 12, box.y + box.height * (0.6 + Math.sin(i / 3) * 0.15));
  await page.mouse.up();
}

async function fillToPayment(page, { cat, dob }) {
  await page.waitForSelector(`.cat[data-cat="${cat}"] [data-choose]:not([disabled])`, { timeout: 8000 });
  await page.click(`.cat[data-cat="${cat}"] [data-choose]`);
  await page.fill('#f-name', cat === 'kids' ? 'Tenzin Norbu' : 'Pema Dolkar');
  const [y, m, d] = dob.split('-').map(Number);
  await page.selectOption('#f-dob-d', String(d));
  await page.selectOption('#f-dob-m', String(m));
  await page.selectOption('#f-dob-y', String(y));
  await page.click('#reg-next');
  await page.fill('#f-parent', 'Dolma Tsering');
  await page.fill('#f-address', 'Jogiwara Road, McLeodganj, Dharamshala');
  await page.fill('#f-phone-1', '98765 43210');
  await page.click('#reg-next');
  await page.click('label.choice:has(input[name="consent"][value="yes"])');
  await page.click('label.choice:has(#f-agree)');
  await drawSignature(page);
  await page.click('#reg-next');
  try {
    await page.waitForSelector('#pay-panel:not([hidden]), #pay-full:not([hidden])', { timeout: 8000 });
    if (await page.isVisible('#pay-panel')) await page.click('label.choice:has(#f-refund)');
  } catch (err) {
    await page.screenshot({ path: path.join(out, `debug-${cat}.png`) });
    console.log('DEBUG', await page.evaluate(() => ({ step: [...document.querySelectorAll('.step')].findIndex((s) => !s.hidden), summary: document.getElementById('form-summary').innerText, send: document.getElementById('send-error').innerText, checking: !document.getElementById('pay-checking').hidden, name: document.getElementById('f-name').value })));
    throw err;
  }
}

async function main() {
  await mkdir(out, { recursive: true });
  const shotPng = path.join(out, 'payment-screenshot.png');
  await sharp({ create: { width: 720, height: 1280, channels: 3, background: '#e8f5e9' } })
    .composite([{ input: Buffer.from('<svg width="720" height="1280"><text x="60" y="600" font-size="64">Paid 500</text></svg>'), top: 0, left: 0 }])
    .png().toFile(shotPng);

  const site = await staticServer();
  const backend = await startMockBackend({ port: 8787, delay: 300 });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  try {
    // 1. Load, loader, structure, accessibility at 1440.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Home 1440');
      await page.goto(SITE);
      await page.waitForSelector('.loader.is-ready', { timeout: 8000 });
      await page.screenshot({ path: path.join(out, 'loader-1440.png') });
      const loaderMs = await page.evaluate(() => performance.now());
      check('Loader ready within about 2.5 s of navigation', loaderMs < 4000, `${Math.round(loaderMs)} ms incl. headless start`);
      await enter(page);
      await page.waitForTimeout(1800);
      check('Hero: WebGL scene running', await page.evaluate(() => document.documentElement.classList.contains('has-webgl')));
      check('Focus moves to the hero heading after the loader', await page.evaluate(() => document.activeElement?.classList.contains('hero__h1')));
      await page.screenshot({ path: path.join(out, 'hero-1440.png') });
      const facts = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)['@graph'].map((g) => g['@type'])).flat(),
        landmarks: ['header', 'nav', 'main', 'footer'].every((t) => document.querySelector(t)),
        canonical: document.querySelector('link[rel=canonical]')?.href,
        hreflang: [...document.querySelectorAll('link[hreflang]')].map((l) => l.hreflang),
        csp: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')),
      }));
      check('One h1 and all landmarks', facts.h1 === 1 && facts.landmarks);
      check('JSON-LD: Organization, two Events, FAQPage', ['Organization', 'FAQPage'].every((t) => facts.ld.includes(t)) && facts.ld.filter((t) => t === 'Event').length === 2, facts.ld.join(','));
      check('canonical, no other-language alternates, CSP meta', Boolean(facts.canonical) && facts.hreflang.length === 0 && facts.csp);
      // Scroll through everything so reveals fire, then check the page.
      for (let y = 0; y < 12; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
      await page.waitForTimeout(800);
      check('Menu bar turns translucent on scroll', await page.evaluate(() => document.getElementById('nav').classList.contains('is-stuck')));
      check('Menu wordmark appears after the hero', await page.evaluate(() => document.querySelector('#nav .nav__wordmark').classList.contains('is-shown')));
      await page.screenshot({ path: path.join(out, 'full-1440.png'), fullPage: true });
      await axe(page, 'Home 1440');
      // Gallery: keyboard and buttons.
      await page.focus('#carousel');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(800);
      check('Carousel: arrow keys move it and the position is announced', (await page.textContent('#car-pos')).startsWith('Item 3 of'));
      await page.click('#car-next');
      await page.waitForTimeout(800);
      await page.click('.car__item.is-active .car__btn');
      await page.waitForSelector('#lightbox[open]');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, 'lightbox-1440.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      check('Lightbox closes and returns focus to the gallery item', await page.evaluate(() => Boolean(document.activeElement?.closest('.car__item'))));
      done();
      await ctx.close();
    }

    // 2. Responsive widths, no sideways scrolling.
    for (const width of [360, 768, 1024]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 780 : 900 }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: width < 768 ? 2 : 1 });
      const page = await ctx.newPage();
      const done = watch(page, `Home ${width}`);
      await page.goto(SITE);
      await enter(page, '#enter-silent', width < 768);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, `hero-${width}.png`) });
      for (let y = 0; y < 14; y++) { await page.evaluate(() => window.scrollBy(0, 600)); await page.waitForTimeout(150); }
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${width}px: no horizontal overflow`, overflow <= 0, `${overflow}px`);
      const stray = await page.evaluate(() => ({ tip: Boolean(document.querySelector('.tip.is-shown')), active: document.activeElement?.className || document.activeElement?.tagName }));
      check(`${width}px: no stray tooltip after scrolling`, !stray.tip, JSON.stringify(stray));
      const small = await page.evaluate(() => [...document.querySelectorAll('button, a.btn, .icon-btn, .lang__opt, input[type=range]')]
        .filter((el) => el.offsetParent && !el.closest('dialog, .loader, .hp'))
        .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width && (r.width < 47.5 || r.height < 39.5))
        .map(([el, r]) => `${el.className || el.id} ${Math.round(r.width)}x${Math.round(r.height)}`));
      check(`${width}px: touch targets at least 48px (language pills 40px tall in a 48px group)`, small.length === 0, small.slice(0, 5).join(', '));
      await page.screenshot({ path: path.join(out, `full-${width}.png`), fullPage: true });
      check(`${width}px: sound button visible`, await page.isVisible('#nav [data-sound-toggle]'));
      if (width === 360) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.click('#menu-open');
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(out, 'menu-360.png') });
        await axe(page, 'Phone menu 360', '#menu');
        await page.click('.menu__link[href="#faq"]');
        await page.waitForTimeout(2400);
        check('Phone menu link closes the menu and goes to the section', await page.evaluate(() => !document.getElementById('menu').open && Math.abs(document.getElementById('faq').getBoundingClientRect().top) < 200));
      }
      done();
      await ctx.close();
    }

    // 3. Full registration on a phone-sized screen, then seats-full and last-seat cases.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const done = watch(page, 'Registration');
      await page.goto(SITE);
      await enter(page);
      await page.route('**/exec?action=seats*', async (route) => { await new Promise((r) => setTimeout(r, 1500)); route.continue().catch(() => {}); });
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('#register[open]');
      check('Category cards show a skeleton while seats load', await page.locator('.cat .skeleton').count() > 0);
      await page.waitForSelector('.cat[data-cat="kids"] [data-seats]:not(:has(.skeleton))');
      await page.unroute('**/exec?action=seats*');
      await page.waitForSelector('.cat[data-cat="kids"] [data-seats]:not(:has(.skeleton))');
      check('Seats left are shown', (await page.textContent('.cat[data-cat="kids"] [data-seats]')).includes('30 of 30'));
      check('Form is hidden until a category is chosen', await page.locator('#reg-form').isHidden());
      await page.screenshot({ path: path.join(out, 'reg-pick-390.png') });
      await axe(page, 'Registration: choose category', '#register');
      await page.click('.cat[data-cat="kids"] [data-choose]');
      await page.click('#reg-next');
      check('Inline errors and an error summary on an empty step', await page.isVisible('#form-summary') && await page.isVisible('#err-name'));
      check('Errors are linked to fields', (await page.getAttribute('#f-name', 'aria-invalid')) === 'true' && (await page.getAttribute('#f-name', 'aria-describedby')).includes('err-name'));
      await page.screenshot({ path: path.join(out, 'reg-errors-390.png'), fullPage: false });
      // Date of birth outside the Kids range.
      await page.fill('#f-name', 'Tenzin Norbu');
      await page.selectOption('#f-dob-d', '1'); await page.selectOption('#f-dob-m', '1'); await page.selectOption('#f-dob-y', '2015');
      check('Date of birth is checked against the category', (await page.textContent('#err-dob')).includes('please choose Youth'));
      await page.click('.cat[data-cat="kids"] [data-change]');
      await page.waitForTimeout(300);
      await page.reload();
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'kids', dob: '2019-03-15' });
      check('Payment step shows QR, payee name and UPI ID', await page.isVisible('.pay__qr img') && (await page.textContent('#pay-panel')).includes('Achui Sareo') && (await page.textContent('#upi-id')).trim() === 'achuisr1985.27-1@okhdfcbank');
      check('Submit stays disabled until a screenshot is attached', await page.isDisabled('#reg-submit'));
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      check('Screenshot preview shown, submit enabled', await page.isEnabled('#reg-submit'));
      check('Fee: "non-refundable" is shown on the payment step before paying', (await page.textContent('#help-refund')).includes('non-refundable') && await page.isVisible('#help-refund'));
      await page.click('label.choice:has(#f-refund)'); // untick
      await page.click('#reg-submit');
      await page.waitForTimeout(400);
      check('Fee: the non-refundable tick box is required before sending', await page.isVisible('#err-refund') && await page.isHidden('#reg-done'));
      await page.click('label.choice:has(#f-refund)');
      await page.screenshot({ path: path.join(out, 'reg-pay-390.png'), fullPage: false });
      await axe(page, 'Registration: payment step', '#register');
      await page.fill('#f-ref', '412345678901');
      await page.waitForTimeout(5200); // a person takes longer than the 5 s anti-bot minimum
      await page.click('#reg-submit');
      check('Loading state while sending', await page.locator('#reg-submit.is-loading').count() === 1);
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 10000 });
      const burstOn = await page.evaluate(() => { const c = document.querySelector('#register > canvas.burst'); return Boolean(c) && getComputedStyle(c).position === 'fixed'; });
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(out, 'reg-done-burst-390.png') });
      check('Success: a burst of light over the confirmation', burstOn);
      await page.waitForTimeout(750);
      await page.screenshot({ path: path.join(out, 'reg-done-390.png') });
      await page.waitForTimeout(600);
      check('Success: the burst is removed when it ends', await page.evaluate(() => !document.querySelector('canvas.burst')));
      check('Confirmation shows name, category, dates', (await page.textContent('#reg-done')).includes('Tenzin Norbu') && (await page.textContent('#done-dates')).includes('11 to 13 January 2027'));
      check('Success screen: "Download registration details" button and a privacy note', (await page.textContent('#done-save')).includes('Download registration details') && (await page.textContent('#reg-done')).includes('health details'));
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#done-save')]);
      const pdfPath = path.join(out, 'registration.pdf');
      await download.saveAs(pdfPath);
      const pdfBuf = await readFile(pdfPath);
      const pdfInfo = readPdf(pdfBuf);
      check('"Download registration details" downloads a valid PDF with at least 2 pages', pdfInfo.ok && pdfInfo.pages >= 2 && pdfInfo.jpegs.length === pdfInfo.pages && download.suggestedFilename() === 'Winter-Camp-2027-Tenzin-Norbu-registration.pdf', `${pdfInfo.pages} pages, ${download.suggestedFilename()}`);
      for (const [n, jpg] of pdfInfo.jpegs.entries()) await sharp(jpg).resize(620).toFile(path.join(out, `registration-pdf-en-p${n + 1}.png`));
      const pageMeta = await sharp(pdfInfo.jpegs[0]).metadata();
      check('PDF pages are A4 at 150 dpi (1240 x 1754)', pageMeta.width === 1240 && pageMeta.height === 1754, `${pageMeta.width}x${pageMeta.height}`);
      let st = await waitFor(async () => { const x = await api('/__state'); return x.files.some((f) => f.mime === 'application/pdf') && x; });
      check('Backend: row stored in the Kids tab, not the Youth tab', st.kids.length === 1 && st.youth.length === 0);
      check('Backend: signature, screenshot and registration PDF saved in Kids folders', st.main.length === 1 && st.files.length === 3 && st.files.every((f) => f.folder.startsWith('Winter Camp 2027/Kids/')), JSON.stringify(st.files.map((f) => [f.folder, f.mime, f.size])));
      const drivePdf = st.files.find((f) => f.mime === 'application/pdf');
      check('Backend: the Drive PDF is the same file that was downloaded, in "Registration PDFs"', drivePdf?.folder === 'Winter Camp 2027/Kids/Registration PDFs' && drivePdf.size === pdfBuf.length, `${drivePdf?.size} vs ${pdfBuf.length}`);
      check('Backend: the row links the PDF in the "Registration PDF" column', /^https?:\/\/drive\.google\.com(?:[/?#]|$)/.test(st.kids[0][st.headers.indexOf('Registration PDF')] || ''));
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      check('Nothing personal left in browser storage', !/Tenzin|Dolma|98765/.test(stored), stored);

      // Seats full.
      await page.click('#reg-done [data-close-register]');
      await page.waitForTimeout(800);
      await api('/__seed', { category: 'kids', count: 29 });
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('.cat[data-cat="kids"].is-full', { timeout: 8000 });
      const fullText = (await page.textContent('.cat[data-cat="kids"] [data-full] span')).trim();
      check('Full category shows the exact message and cannot be chosen', fullText === 'Seats are full. Kindly contact +91-8219012669.' && await page.isHidden('.cat[data-cat="kids"] [data-choose]'), fullText);
      await page.screenshot({ path: path.join(out, 'reg-full-390.png') });

      // Last seat taken between payment and submission.
      await api('/__seed', { category: 'youth', count: 29 });
      await page.click('[data-close-register]');
      await page.waitForTimeout(800);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'youth', dob: '2012-06-01' });
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await api('/__seed', { category: 'youth', count: 1 });
      await page.waitForTimeout(5200); // a person takes longer than the 5 s anti-bot minimum
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-last:not([hidden])', { timeout: 10000 });
      const lastText = (await page.textContent('#last-title')).trim();
      check('Last seat: "Contact the organisers for a refund." is shown (the fee exception)', (await page.textContent('#reg-last')).includes('Contact the organisers for a refund.'));
      check('Last-seat message shown exactly, with tap-to-call', lastText === 'Oh No Someone booked the last seat just before you! Kindly contact +91-8219012669' && await page.isVisible('#reg-last a[href="tel:+918219012669"]'), lastText);
      st = await api('/__state');
      check('Backend: late submission saved in "Paid, no seat" with its screenshot', st.overflow.length === 1 && /https?:\/\/(?:[^/\s"]+\.)?drive\.google\.com(?:[/:?"#]|$)/.test(JSON.stringify(st.overflow[0])));
      st = await waitFor(async () => { const x = await api('/__state'); return x.overflow[0]?.[x.headers.indexOf('Registration PDF')] && x; });
      check('Backend: the "Paid, no seat" row gets its registration PDF too', Boolean(st) && st.files.some((f) => f.folder === 'Winter Camp 2027/Youth/Registration PDFs'));
      await page.screenshot({ path: path.join(out, 'reg-last-390.png') });

      // Payment step when the category fills before paying.
      await api('/__reset', {});
      await api('/__seed', { category: 'kids', count: 29 });
      await page.click('#reg-last ~ * [data-close-register], .reg__bar [data-close-register]');
      await page.waitForTimeout(800);
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('.cat[data-cat="kids"] [data-choose]:not([disabled])');
      await page.click('.cat[data-cat="kids"] [data-choose]');
      await page.fill('#f-name', 'Late Child');
      await page.selectOption('#f-dob-d', '2'); await page.selectOption('#f-dob-m', '2'); await page.selectOption('#f-dob-y', '2020');
      await page.click('#reg-next');
      await page.fill('#f-parent', 'Parent'); await page.fill('#f-address', 'Address'); await page.fill('#f-phone-1', '9876543210');
      await page.click('#reg-next');
      await page.click('label.choice:has(input[name="consent"][value="yes"])');
      await page.click('label.choice:has(#f-agree)');
      await drawSignature(page);
      await api('/__seed', { category: 'kids', count: 1 });
      await page.click('#reg-next');
      await page.waitForSelector('#pay-full:not([hidden])', { timeout: 8000 });
      check('Seats re-checked before payment: full message instead of payment details', await page.isHidden('#pay-panel'));
      done();
      await ctx.close();
    }

    // 4. Network failure keeps the data and offers retry.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'kids', dob: '2018-08-08' });
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await page.route('**/exec', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
      await page.waitForTimeout(5200); // a person takes longer than the 5 s anti-bot minimum
      await page.click('#reg-submit');
      await page.waitForSelector('#send-error:not([hidden])');
      check('Failed send: message, retry button, data and screenshot kept', await page.isVisible('#send-error button') && await page.isVisible('#shot-preview') && (await page.inputValue('#f-ref')) === '' && await page.isEnabled('#reg-submit'));
      await page.unroute('**/exec');
      await page.click('#send-error button');
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 10000 });
      check('Retry succeeds', true);
      await ctx.close();
    }

    // 5. Keyboard only.
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await page.waitForSelector('.loader.is-ready');
      await page.waitForTimeout(400);
      check('Keyboard: focus starts on "Enter with sound" (no language step)', await page.evaluate(() => document.activeElement?.id === 'enter-sound' && !document.getElementById('loader-lang')));
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#loader', { state: 'detached' });
      await page.keyboard.press('Shift+Tab');
      const back = [];
      for (let i = 0; i < 12; i++) { back.push(await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName)); await page.keyboard.press('Shift+Tab'); }
      check('Keyboard: skip link is reachable', back.some((c) => String(c).includes('skip')), back.join(' > '));
      await page.focus('.hero__cta [data-open-register]');
      const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      check('Keyboard: visible focus ring', ring !== 'none', ring);
      await page.keyboard.press('Enter');
      await page.waitForSelector('#register[open]');
      check('Keyboard: focus moves into the registration view', await page.evaluate(() => Boolean(document.activeElement?.closest('#register'))));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);
      check('Keyboard: Escape closes and focus returns to the button', await page.evaluate(() => !document.getElementById('register').open && document.activeElement?.matches('.hero__cta [data-open-register]')));
      await ctx.close();
    }

    // 6. Reduced motion.
    {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const done = watch(page, 'Reduced motion');
      await page.goto(SITE);
      await enter(page);
      await page.waitForTimeout(600);
      const s = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), trail: document.querySelectorAll('.cursor__trail').length, op: getComputedStyle(document.querySelector('.ltr')).opacity }));
      check('Reduced motion: no smooth scroll, no trail, content visible', !s.lenis && s.trail === 0 && s.op === '1', JSON.stringify(s));
      await page.screenshot({ path: path.join(out, 'reduced-1024.png') });
      done();
      await ctx.close();
    }

    // 7. Old Tibetan links go to the English page, keeping the #section.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(`${SITE}bo/#faq`);
      await page.waitForURL((u) => !u.pathname.includes('/bo/'), { timeout: 5000 }).catch(() => {});
      const u = new URL(page.url());
      check('Old /bo/#faq link opens the English page at #faq', u.pathname === new URL(SITE).pathname && u.hash === '#faq', page.url());
      await page.goto(`${SITE}bo/privacy/`);
      await page.waitForURL((x) => !x.pathname.includes('/bo/'), { timeout: 5000 }).catch(() => {});
      check('Old /bo/privacy/ link opens the English privacy page', new URL(page.url()).pathname.endsWith('/privacy/') && !page.url().includes('/bo/'), page.url());
      check('No Tibetan left on the English page', await page.evaluate(async () => { const r = await fetch(new URL('../', location.href)); const html = await r.text(); return !/[\u0F00-\u0FFF]/.test(html) && !html.includes('hreflang="bo"'); }));
      await ctx.close();
    }

    // 9. No JavaScript: content and phone number still there.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(SITE);
      const s = await page.evaluate(() => ({
        loader: getComputedStyle(document.getElementById('loader')).display,
        faq: getComputedStyle(document.querySelector('#faq .qa')).opacity,
        phone: document.body.innerText.includes('+91-8219012669'),
      }));
      check('No JavaScript: loader hidden, content and phone visible', s.loader === 'none' && s.faq === '1' && s.phone, JSON.stringify(s));
      await page.screenshot({ path: path.join(out, 'nojs-390.png'), fullPage: true });
      await ctx.close();
    }

    // 10. Privacy page.
    {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Privacy page');
      await page.goto(`${SITE}privacy/`);
      await axe(page, 'Privacy page');
      done();
      await ctx.close();
    }

    // 11. Round 2: menu on sub-pages, deep links, hero text, footer, phones, blocking, typed signature, cancel, music.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 2');
      await page.goto(`${SITE}privacy/`);
      const sub = await page.evaluate(() => ({
        links: [...document.querySelectorAll('#nav .nav__link')].map((a) => a.getAttribute('href')),
        reg: document.querySelector('#nav .nav__register')?.getAttribute('href'),
        sound: Boolean(document.querySelector('#nav [data-sound-toggle]')),
        menu: Boolean(document.getElementById('menu')),
      }));
      check('Privacy page scrolls smoothly too (Lenis active)', await page.evaluate(() => document.documentElement.classList.contains('lenis')));
      check('Privacy page has the same menu bar (links, Register, sound, phone menu)', sub.links.length === 5 && sub.links[2] === '/wintercamp/#gallery' && sub.reg === '/wintercamp/#register' && sub.sound && sub.menu, JSON.stringify(sub));
      await page.click('#nav .nav__link[href$="#gallery"]');
      await enter(page);
      await page.waitForTimeout(1200);
      const g = await page.evaluate(() => Math.round(document.getElementById('gallery').getBoundingClientRect().top));
      check('Menu link from a sub-page opens the home page at that section', g >= 0 && g <= 112, `gallery top ${g}`);
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(300); }
      await page.waitForTimeout(900);
      const hashBefore = await page.evaluate(() => location.hash);
      await page.reload();
      await enter(page);
      await page.waitForTimeout(1200);
      const after = await page.evaluate((h) => { const r = document.querySelector(h).getBoundingClientRect(); return { hash: location.hash, top: Math.round(r.top), inView: r.top < innerHeight * 0.6 && r.bottom > 0 }; }, hashBefore || '#gallery');
      check('Reloading keeps the section in view (address follows the section)', hashBefore !== '' && after.hash === hashBefore && after.inView, `${hashBefore} -> ${JSON.stringify(after)}`);

      // Swipe: a short swipe moves one item, both in the carousel and full-screen view.
      await page.locator('#carousel').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const box = await page.locator('.car__item.is-active').boundingBox();
      const swipe = async (from, to, y) => { await page.mouse.move(from, y); await page.mouse.down(); for (let k = 1; k <= 6; k++) await page.mouse.move(from + ((to - from) * k) / 6, y); await page.mouse.up(); };
      const pos0 = await page.textContent('#car-pos');
      await swipe(box.x + box.width / 2 + 30, box.x + box.width / 2 - 30, box.y + box.height / 2);
      await page.waitForTimeout(900);
      const pos1 = await page.textContent('#car-pos');
      await swipe(box.x + box.width / 2 - 30, box.x + box.width / 2 + 30, box.y + box.height / 2);
      await page.waitForTimeout(900);
      const pos2 = await page.textContent('#car-pos');
      check('Carousel: a short 60 px swipe moves to the next item and back', pos0.startsWith('Item 1 ') && pos1.startsWith('Item 2 ') && pos2.startsWith('Item 1 '), `${pos0} -> ${pos1} -> ${pos2}`);
      await page.click('.car__item.is-active .car__btn');
      await page.waitForSelector('#lightbox[open]');
      await page.waitForTimeout(900);
      await settled(page);
      const sb = await page.locator('#lightbox-stage').boundingBox();
      const cap0 = await page.textContent('#lightbox-cap');
      await swipe(sb.x + sb.width / 2 + 40, sb.x + sb.width / 2 - 40, sb.y + sb.height / 2);
      await page.waitForTimeout(1000);
      const cap1 = await page.textContent('#lightbox-cap');
      check('Full-screen view: swiping moves to the next item', /1 of/.test(cap0) && /2 of/.test(cap1), `${cap0} -> ${cap1}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      // Round 3 checks.
      await page.waitForTimeout(1000); // let any carousel move finish
      const r3 = await page.evaluate(() => {
        const active = document.querySelector('.car__item.is-active');
        const next = active?.nextElementSibling;
        return { activeOp: active && getComputedStyle(active).opacity, nextOp: next && Number(getComputedStyle(next).opacity) };
      });
      check('Carousel cross-fade: centre item fully visible, neighbours faded', r3.activeOp === '1' && r3.nextOp > 0.2 && r3.nextOp < 0.6, JSON.stringify(r3));
      const fields = await page.evaluate(() => [...document.querySelectorAll('[data-particles]')].map((h) => [h.id || h.className.split(' ')[0], h.dataset.particles, Boolean(h.querySelector(':scope > canvas.particles'))]));
      check('Particles: red on light sections, light grey on dark sections', fields.length >= 5 && fields.every(([, , c]) => c) && fields.filter(([id]) => ['activities', 'faq'].includes(id)).every(([, k]) => k === 'accent') && fields.filter(([id]) => ['gallery', 'contact'].includes(id)).every(([, k]) => k === 'secondary'), JSON.stringify(fields));
      await page.locator('#faq').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const px = async () => page.evaluate(() => { const c = document.querySelector('#faq > canvas.particles'); return c.toDataURL().length + ':' + c.getContext('2d').getImageData(0, 0, c.width, Math.min(c.height, 600)).data.reduce((a, v, i) => (i % 4 === 3 ? a + v : a), 0); });
      const p1 = await px();
      await page.waitForTimeout(500);
      const p2 = await px();
      check('Particles are drawn and falling (canvas changes over time)', p1 !== p2 && !p1.endsWith(':0'), `${p1} vs ${p2}`);
      await page.screenshot({ path: path.join(out, 'faq-particles-1280.png') });

      // Hero text stays after scrolling away and back.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.goto(SITE);
      await enter(page);
      await page.waitForTimeout(1600);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(200); }
      for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(200); }
      await page.waitForTimeout(1200);
      const hero = await page.evaluate(() => [...document.querySelectorAll('.hero__facts, .hero__venue, .hero__cta, .hero__seats')].map((e) => getComputedStyle(e).opacity));
      check('Hero dates, venue and buttons are still visible after scrolling down and back up', hero.every((o) => o === '1'), hero.join(','));
      await page.screenshot({ path: path.join(out, 'hero-after-scroll-1280.png') });

      // Footer wordmark fully visible.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1600);
      const mark = await page.evaluate(() => {
        const span = document.querySelector('.footer__mark span');
        const r = span.getBoundingClientRect();
        const p = span.parentElement.getBoundingClientRect();
        return { clip: getComputedStyle(span).clipPath, inside: r.top >= p.top - 1 && r.bottom <= p.bottom + 1 };
      });
      check('Footer "Kid\'s Happy Club" is not cut off', /inset\(-/.test(mark.clip) && mark.inside, JSON.stringify(mark));
      await page.locator('.footer__mark').screenshot({ path: path.join(out, 'footer-mark-1280.png') });

      // Phones, blocking and typed signature.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('.cat[data-cat="youth"] [data-choose]:not([disabled])');
      await page.click('.cat[data-cat="youth"] [data-choose]');
      await page.click('#reg-next');
      await page.waitForTimeout(500);
      const block1 = await page.evaluate(() => ({ blocked: !document.getElementById('step-blocked').hidden, focus: document.activeElement?.id, step: [...document.querySelectorAll('.step')].findIndex((x) => !x.hidden) }));
      check('Empty required fields block "Next": warning shown, stays on step 1, focus on the first field', block1.blocked && block1.step === 0 && block1.focus === 'f-name', JSON.stringify(block1));
      await page.fill('#f-name', 'Pema Dolkar');
      await page.click('#reg-next');
      await page.waitForTimeout(400);
      check('Still blocked until the date of birth is filled', await page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((x) => !x.hidden)) === 0 && await page.isVisible('#err-dob'));
      await page.selectOption('#f-dob-d', '1'); await page.selectOption('#f-dob-m', '6'); await page.selectOption('#f-dob-y', '2012');
      await page.click('#reg-next');
      await page.fill('#f-parent', 'Dolma');
      await page.fill('#f-address', 'McLeodganj');
      await page.focus('#f-phone-1');
      await page.keyboard.type('98a76-54');
      const ph1 = await page.evaluate(() => ({ v: document.getElementById('f-phone-1').value, warn: document.getElementById('warn-phones').textContent }));
      check('Phone field accepts digits only and warns about other characters', ph1.v === '987654' && /Only numbers/.test(ph1.warn), JSON.stringify(ph1));
      await page.keyboard.type('321099');
      const ph2 = await page.evaluate(() => ({ v: document.getElementById('f-phone-1').value, warn: document.getElementById('warn-phones').textContent }));
      check('Phone field stops at 10 digits and warns', ph2.v === '9876543210' && /10 digits/.test(ph2.warn), JSON.stringify(ph2));
      await page.click('#phone-add');
      await page.fill('#f-phone-2', '12345');
      await page.click('#reg-next');
      await page.waitForTimeout(400);
      check('A 5-digit phone number blocks "Next" with a clear message', (await page.textContent('#err-phones')).includes('up to 10 digits') && await page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((x) => !x.hidden)) === 1);
      await page.fill('#f-phone-2', '');
      await page.click('#reg-next');
      await page.click('label.choice:has(input[name="consent"][value="yes"])');
      await page.click('label.choice:has(#f-agree)');
      await page.waitForTimeout(400);
      check('Missing signature blocks "Next" (round 9: Next is disabled, the note says to sign)', await page.isDisabled('#reg-next') && (await page.textContent('#step-gate')).includes('sign in the box or type your name') && await page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((x) => !x.hidden)) === 2);
      await page.click('#sign-mode');
      check('"Type your name instead" shows a name field and hides the drawing box', await page.isVisible('#f-sign-typed') && await page.isHidden('#sign-wrap'));
      await page.fill('#f-sign-typed', 'Dolma Tsering');
      await page.screenshot({ path: path.join(out, 'reg-typed-signature-1280.png') });
      await page.click('#reg-next');
      await page.waitForSelector('#pay-panel:not([hidden])');
      if (!(await page.isChecked('#f-refund'))) await page.click('label.choice:has(#f-refund)');
      // A dismissed file picker fires a bubbling "cancel" in Chrome: it must not close the view.
      await page.evaluate(() => document.getElementById('f-shot').dispatchEvent(new Event('cancel', { bubbles: true })));
      await page.waitForTimeout(900);
      check('Dismissing the photo picker does not close or shrink the registration view', await page.evaluate(() => document.getElementById('register').open && !document.getElementById('register').style.clipPath));
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await page.waitForTimeout(600);
      const lay = await page.evaluate(() => { const r = document.getElementById('register').getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
      check('After uploading the screenshot the view still fills the screen', lay.w === lay.vw && lay.h === lay.vh, JSON.stringify(lay));
      await page.waitForTimeout(5200);
      // Pretend this phone can share files, and catch what is shared.
      await page.evaluate(() => {
        navigator.canShare = (d) => Boolean(d?.files?.length);
        navigator.share = async (d) => { window.__shared = d.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); };
      });
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 10000 });
      check('Share button shown where the phone can share files', await page.isVisible('#done-share'));
      await page.click('#done-share');
      const shared = await waitFor(() => page.evaluate(() => window.__shared), 8000);
      check('"Share" shares the registration PDF', shared?.length === 1 && shared[0].type === 'application/pdf' && shared[0].name.endsWith('-registration.pdf') && shared[0].size > 20000, JSON.stringify(shared));
      const st = await waitFor(async () => { const x = await api('/__state'); return x.files.some((f) => f.mime === 'application/pdf') && x; });
      const row = st.youth[0] || [];
      check('Typed signature stored in the Youth tab, with no signature image', row[st.headers.indexOf('Typed signature')] === 'Dolma Tsering' && row[st.headers.indexOf('Signature')] === '' && st.files.filter((f) => f.mime !== 'application/pdf').length === 1, JSON.stringify(row.slice(0, 4)));
      check('Phones stored as 10 digits', row[st.headers.indexOf('Emergency contact number(s)')] === '9876543210');

      // Music: renders, and loops without a seam (the end flows into the start).
      const musicFile = (await readdir(path.join(dist, 'assets'))).find((n) => /^music-.*\.js$/.test(n));
      const music = await page.evaluate(async (url) => {
        const m = await import(url);
        const buf = await m.renderMusicLoop();
        const d = buf.getChannelData(0);
        let step = 0;
        for (let i = 1; i < d.length; i++) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
        let rms = 0;
        for (let i = 0; i < d.length; i += 64) rms += d[i] * d[i];
        return { seconds: buf.duration, seam: Math.abs(d[0] - d[d.length - 1]), maxStep: step, rms: Math.sqrt(rms / (d.length / 64)) };
      }, `${SITE}assets/${musicFile}`);
      check('Background music renders (32 s) and the loop point is seamless', musicFile && music.seconds > 30 && music.rms > 0.02 && music.seam <= music.maxStep * 1.01, JSON.stringify(music));
      done();
      await ctx.close();
    }

    // 12. Loader: straight to the sound choice; a deep link still lands on its section.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const done = watch(page, 'Loader: sound choice');
      await page.goto(`${SITE}#faq`);
      await page.waitForSelector('.loader.is-ready');
      await page.waitForTimeout(500);
      const first = await page.evaluate(() => ({ lang: Boolean(document.getElementById('loader-lang')), sound: !document.getElementById('loader-sound').hidden, focus: document.activeElement?.id }));
      check('First visit: only the sound choice is asked, "Enter with sound" focused', !first.lang && first.sound && first.focus === 'enter-sound', JSON.stringify(first));
      await page.screenshot({ path: path.join(out, 'loader-sound-390.png') });
      await page.click('#enter-silent');
      await page.waitForSelector('#loader', { state: 'detached' });
      await page.waitForTimeout(1200);
      const faqTop = await page.evaluate(() => Math.round(document.getElementById('faq').getBoundingClientRect().top));
      check('The deep link lands on its section', faqTop >= 0 && faqTop <= 112, `faq top ${faqTop}`);
      await page.goto(SITE);
      let asked = false;
      for (let k = 0; k < 40 && await page.locator('#loader').count(); k++) {
        asked ||= await page.evaluate(() => Boolean(document.querySelector('.loader__step:not([hidden])')));
        await page.waitForTimeout(150);
      }
      check('Return visit with the sound choice remembered: no question, straight in', !asked && await page.locator('#loader').count() === 0);
      done();
      await ctx.close();
    }

    // 13. Round 4: the menu bar on small screens (wordmark, sound, Register, menu).
    for (const lang of ['']) {
      for (const width of [320, 340, 360, 375, 390, 414]) {
        const ctx = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        await page.goto(`${SITE}${lang}privacy/`);
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => {
          const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, h: b.height }; };
          const word = r(document.querySelector('#nav .nav__wordmark'));
          const btns = [...document.querySelectorAll('#nav .nav__actions > *')].filter((el) => el.offsetParent && getComputedStyle(el).display !== 'none').map((el) => ({ c: el.className, ...r(el) }));
          return { word, btns, sound: btns.some((b) => b.c.includes('sound')) };
        });
        const overlap = m.btns.filter((b) => b.l < m.word.r);
        const small = m.btns.filter((b) => b.w < 48 || b.h < 48);
        check(`Menu bar ${lang || 'en/'} ${width}px: wordmark clear of the buttons, buttons at least 48 px`, overlap.length === 0 && small.length === 0, `word ends ${Math.round(m.word.r)}, first button ${Math.round(m.btns[0]?.l)}${small.length ? `, small: ${small.map((b) => b.c).join()}` : ''}`);
        if (width < 360) {
          await page.click('#menu-open');
          await page.waitForSelector('#menu[open]');
          await page.waitForTimeout(500);
          const vis = await page.isVisible('#menu .menu__sound');
          const before = await page.getAttribute('#menu .menu__sound', 'aria-pressed');
          await page.click('#menu .menu__sound');
          const after = await page.getAttribute('#menu .menu__sound', 'aria-pressed');
          check(`Menu bar ${lang || 'en/'} ${width}px: sound moves into the phone menu and still toggles`, !m.sound && vis && before !== after, `${before} -> ${after}`);
          if (width === 320) await page.screenshot({ path: path.join(out, `menu-sound-${lang ? 'bo' : 'en'}-320.png`) });
        } else {
          check(`Menu bar ${lang || 'en/'} ${width}px: sound button stays in the menu bar`, m.sound);
        }
        if (width === 320 || width === 360) await page.screenshot({ path: path.join(out, `nav-${lang ? 'bo' : 'en'}-${width}.png`), clip: { x: 0, y: 0, width, height: 88 } });
        await ctx.close();
      }
    }

    // 14. Round 4: the gallery full-screen view on a phone.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const done = watch(page, 'Full-screen view');
      await page.goto(`${SITE}#gallery`);
      await enter(page, '#enter-silent', true);
      await page.waitForTimeout(1200);
      await page.locator('#carousel').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      const vtDur = async () => page.evaluate(() => document.getAnimations().filter((a) => /view-transition-group\(wc-media\)/.test(a.effect?.pseudoElement || '')).map((a) => a.effect.getTiming().duration));
      // Open and close with the view transition (Chrome supports it).
      await page.tap('.car__item.is-active .car__btn');
      let d = [];
      for (let k = 0; k < 20 && !d.length; k++) { d = await vtDur(); if (!d.length) await page.waitForTimeout(25); }
      check('Open: view transition of 0.7 s', d.length > 0 && d.every((x) => x === 700), JSON.stringify(d));
      await page.waitForTimeout(900);
      await settled(page);
      await page.screenshot({ path: path.join(out, 'lightbox-390.png') });
      await page.keyboard.press('Escape');
      d = [];
      for (let k = 0; k < 20 && !d.length; k++) { d = await vtDur(); if (!d.length) await page.waitForTimeout(25); }
      check('Close: view transition of 0.7 s back to the carousel', d.length > 0 && d.every((x) => x === 700), JSON.stringify(d));
      await page.waitForTimeout(900);
      await settled(page);
      check('Closed after the transition', await page.evaluate(() => !document.getElementById('lightbox').open));

      // Browsers without view transitions: the same 0.7 s motion with GSAP.
      await page.evaluate(() => { document.startViewTransition = undefined; });
      await page.tap('.car__item.is-active .car__btn');
      await page.waitForTimeout(330);
      const mid = await page.evaluate(() => { const m = document.querySelector('#lightbox-stage .lightbox__item > *'); return { t: getComputedStyle(m).transform, bg: getComputedStyle(document.getElementById('lightbox')).backgroundColor }; });
      await page.waitForTimeout(600);
      const end = await page.evaluate(() => getComputedStyle(document.querySelector('#lightbox-stage .lightbox__item > *')).transform);
      check('Open without view transitions: animates from the thumbnail (mid-way moving, done by 0.7 s)', mid.t !== 'none' && end === 'none', `${mid.t} ${mid.bg} -> ${end}`);
      await page.tap('#lightbox-close');
      await page.waitForTimeout(330);
      const stillOpen = await page.evaluate(() => document.getElementById('lightbox').open);
      await page.waitForTimeout(600);
      check('Close without view transitions: animates for 0.7 s, then closes', stillOpen && await page.evaluate(() => !document.getElementById('lightbox').open));

      // Moving between items: both slide together, side by side (round 10: fading as they go).
      await page.tap('.car__item.is-active .car__btn');
      await page.waitForTimeout(900);
      const cap0 = await page.textContent('#lightbox-cap');
      await page.tap('#lightbox-next');
      await page.waitForTimeout(300);
      const both = await page.evaluate(() => [...document.querySelectorAll('#lightbox-stage .lightbox__item')].map((el) => ({ leaving: el.classList.contains('is-leaving'), x: Math.round(new DOMMatrix(getComputedStyle(el).transform).m41), o: Number(getComputedStyle(el).opacity) })));
      const out1 = both.find((b) => b.leaving);
      const in1 = both.find((b) => !b.leaving);
      check('Next: the current item slides left while the next slides in from the right, together, side by side', both.length === 2 && out1.x < 0 && in1.x > 0 && out1.o < 1 && in1.o < 1 && in1.x - out1.x > 200, JSON.stringify(both));
      await page.waitForTimeout(600);
      const cap1 = await page.textContent('#lightbox-cap');
      check('The move takes 0.7 s and leaves one item', await page.locator('#lightbox-stage .lightbox__item').count() === 1 && cap0 !== cap1, `${cap0} -> ${cap1}`);

      // Swipe anywhere: on the caption and on the empty dark area.
      const cdp = await ctx.newCDPSession(page);
      const touchSwipe = async (x1, x2, y) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y, id: 1 }] });
        for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * k) / 6, y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const capBox = await page.locator('#lightbox-cap').boundingBox();
      await touchSwipe(300, 120, capBox.y + capBox.height / 2);
      await page.waitForTimeout(900);
      const cap2 = await page.textContent('#lightbox-cap');
      check('Swipe on the caption moves to the next item', cap2 !== cap1, `${cap1} -> ${cap2}`);
      await touchSwipe(100, 300, 90);
      await page.waitForTimeout(900);
      const cap3 = await page.textContent('#lightbox-cap');
      check('Swipe on the empty dark area moves back, and does not close the view', cap3 === cap1 && await page.evaluate(() => document.getElementById('lightbox').open), `${cap2} -> ${cap3}`);

      // Pinch to zoom, then ease back on release; no move while pinching.
      const mb = await page.locator('#lightbox-stage .lightbox__item > *').boundingBox();
      const cx = mb.x + mb.width / 2;
      const cy = mb.y + mb.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
      for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - k * 10, y: cy, id: 1 }, { x: cx + 30 + k * 10, y: cy, id: 2 }] });
      const zoomedScale = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#lightbox-stage .lightbox__item > *')).transform).a);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(330);
      const easing = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#lightbox-stage .lightbox__item > *')).transform).a);
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => getComputedStyle(document.querySelector('#lightbox-stage .lightbox__item > *')).transform);
      check('Pinch zooms in (about 2.3x), eases back over 0.7 s on release', zoomedScale > 2 && easing > 1.02 && easing < zoomedScale && after === 'none', `${zoomedScale.toFixed(2)} -> ${easing.toFixed(2)} -> ${after}`);
      check('Pinching does not change the item', (await page.textContent('#lightbox-cap')) === cap3);

      // Videos: the controls area is left to the video; swiping there does not move.
      const hasVideo = await page.evaluate(() => document.querySelectorAll('.car__item[data-type="video"]').length);
      if (hasVideo) {
        const vi = await page.evaluate(() => [...document.querySelectorAll('.car__item')].findIndex((x) => x.dataset.type === 'video'));
        for (let k = 0; k < 40; k++) {
          const n = Number((await page.textContent('#lightbox-cap')).match(/(\d+) of/)?.[1]) - 1;
          if (n === vi) break;
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(760);
        }
        const vb = await page.locator('#lightbox-stage video').boundingBox();
        const capV = await page.textContent('#lightbox-cap');
        const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [vb.x + vb.width / 2, vb.y + vb.height - 20]);
        await touchSwipe(vb.x + vb.width - 20, vb.x + 20, vb.y + vb.height - 20);
        await page.waitForTimeout(900);
        check('Video: controls are reachable and a swipe on the seek bar does not move', top === 'VIDEO' && (await page.textContent('#lightbox-cap')) === capV && await page.evaluate(() => document.querySelector('#lightbox-stage video').controls), `${top}`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vb.x + vb.width / 2 - 20, y: vb.y + vb.height / 2, id: 1 }, { x: vb.x + vb.width / 2 + 20, y: vb.y + vb.height / 2, id: 2 }] });
        for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vb.x + vb.width / 2 - 20 - k * 10, y: vb.y + vb.height / 2, id: 1 }, { x: vb.x + vb.width / 2 + 20 + k * 10, y: vb.y + vb.height / 2, id: 2 }] });
        const vScale = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#lightbox-stage video')).transform).a);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        check('Video: pinch zooms the video too', vScale > 1.5, vScale.toFixed(2));
      } else {
        check('Video checks skipped: no video in the gallery', true);
      }
      await page.waitForTimeout(900);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);

      // Particles answer touch: a tap pushes nearby particles away.
      await page.evaluate(() => { const el = document.getElementById('activities'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 40); });
      await page.waitForTimeout(1200);
      // Touch 30 px beside a particle that is on screen.
      const ab = await page.evaluate(() => {
        const f = document.getElementById('activities').wcParticles;
        const r = f.host.getBoundingClientRect();
        const p = f.parts.map((q) => ({ x: r.left + q.x, y: r.top + q.y })).find((q) => q.y > 120 && q.y < innerHeight - 120 && q.x > 60 && q.x < innerWidth - 60);
        return p ? { x: p.x - 30, y: p.y } : { x: innerWidth / 2, y: innerHeight / 2 };
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ab.x, y: ab.y, id: 1 }] });
      for (let k = 1; k <= 5; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ab.x + k * 8, y: ab.y, id: 1 }] }); await page.waitForTimeout(40); }
      await page.waitForTimeout(120);
      const pushed = await page.evaluate(() => (document.getElementById('activities').wcParticles?.parts || []).filter((p) => Math.hypot(p.dx, p.dy) > 3).length);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(2500);
      const rest = await page.evaluate(() => Math.max(...(document.getElementById('activities').wcParticles?.parts || [{ dx: 99, dy: 99 }]).map((p) => Math.hypot(p.dx, p.dy))));
      check('Particles: touching a section pushes nearby particles aside, and they settle back', pushed > 0 && rest < 1, `${pushed} pushed, max offset after ${rest.toFixed(2)} px`);
      done();
      await ctx.close();
    }

    // 16. Round 5: opening the full-screen view moves the media on desktop widths too,
    // with the large file slow to arrive, with and without view transitions.
    for (const width of [1280, 1440, 1920]) {
      const ctx = await browser.newContext({ viewport: { width, height: width >= 1920 ? 1080 : 860 } });
      await ctx.route(/gallery\/.*(-\d{3,4}\.webp|\.mp4)$/, async (rt) => {
        if (/-480\.webp$/.test(rt.request().url()) || /poster/.test(rt.request().url())) return rt.continue();
        await new Promise((r) => setTimeout(r, 400));
        return rt.continue();
      });
      const page = await ctx.newPage();
      const done = watch(page, `Open transition ${width}`);
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      for (const kind of ['photo', 'video']) {
        const idx = await page.evaluate((k) => [...document.querySelectorAll('.car__item')].findIndex((i) => i.dataset.type === k), kind);
        if (idx < 0) { check(`${width}: gallery has a ${kind}`, false); continue; }
        await page.evaluate(() => { document.getElementById('car-range').value = '0'; });
        await page.focus('#carousel');
        await page.keyboard.press('Home');
        for (let k = 0; k < idx; k++) await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(900);
        await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
        await page.waitForTimeout(700);
        // With view transitions: sample the shared element's box during the 0.7 s.
        await page.click('.car__item.is-active .car__btn');
        const samples = [];
        const t0 = Date.now();
        while (Date.now() - t0 < 900) {
          const v = await page.evaluate(() => {
            const a = document.getAnimations().find((x) => /view-transition-group\(wc-media\)/.test(x.effect?.pseudoElement || ''));
            if (!a) return null;
            const cs = getComputedStyle(document.documentElement, '::view-transition-group(wc-media)');
            const k = a.effect.getKeyframes();
            return { w: parseFloat(cs.width), m: cs.transform, endW: parseFloat(k.at(-1).width), endH: parseFloat(k.at(-1).height) };
          });
          if (v) samples.push(v);
          await page.waitForTimeout(60);
        }
        await settled(page);
        const box = await page.locator('#lightbox-stage .lightbox__item > *').boundingBox();
        const end = samples[0];
        check(`${width} ${kind}, open with view transition: moves into a real box (not 0×0)`, Boolean(end) && end.endW > 200 && end.endH > 200 && Math.abs(end.endW - box.width) < 4, end ? `${end.endW}×${end.endH} vs ${Math.round(box.width)}×${Math.round(box.height)}` : 'no wc-media animation');
        const ws = samples.map((x) => Math.round(x.w));
        const ms = new Set(samples.map((x) => x.m));
        check(`${width} ${kind}, open with view transition: size and position change over the 0.7 s`, samples.length >= 4 && new Set(ws).size >= 2 && ms.size >= 2, ws.join(',')); // sampling is coarse on a busy machine; the 0×0 bug is caught by the check above
        if (kind === 'photo') {
          const swapped = await waitFor(() => page.evaluate(() => { const m = document.querySelector('#lightbox-stage img'); return m && m.currentSrc.endsWith(m.dataset.fullSrc.split('/').pop()) && m.naturalWidth > 480; }), 4000);
          check(`${width}: the large photo replaces the thumbnail once it has loaded`, Boolean(swapped));
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);
        await settled(page);
        // Without view transitions: the GSAP fallback flies from the thumbnail.
        await page.evaluate(() => { window.__vt = document.startViewTransition; document.startViewTransition = undefined; });
        const thumb = await page.locator('.car__item.is-active .car__media img').boundingBox();
        await page.click('.car__item.is-active .car__btn');
        const rects = [];
        for (let k = 0; k < 12; k++) {
          rects.push(await page.evaluate(() => { const r = document.querySelector('#lightbox-stage .lightbox__item > *')?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }));
          await page.waitForTimeout(60);
        }
        await page.waitForTimeout(500);
        const fin = await page.evaluate(() => { const r = document.querySelector('#lightbox-stage .lightbox__item > *').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; });
        const first = rects.find(Boolean);
        const near = first && Math.hypot(first.x - (thumb.x + thumb.width / 2), first.y - (thumb.y + thumb.height / 2)) < 80 && Math.abs(first.w - thumb.width) < 0.25 * fin.w + 40;
        const widths = new Set(rects.filter(Boolean).map((r) => Math.round(r.w)));
        check(`${width} ${kind}, open without view transitions: starts over the thumbnail and grows into place`, Boolean(near) && widths.size >= 3 && Math.abs(fin.x - width / 2) < 40, first ? `start ${Math.round(first.w)}px at ${Math.round(first.x)},${Math.round(first.y)}; thumb ${Math.round(thumb.width)}px; end ${Math.round(fin.w)}px` : 'no media');
        if (width === 1440) await page.screenshot({ path: path.join(out, `lightbox-open-${kind}-1440.png`) });
        await page.click('#lightbox-close');
        await page.waitForTimeout(900);
        await page.evaluate(() => { document.startViewTransition = window.__vt; });
      }
      done();
      await ctx.close();
    }
    // 17. Round 5: the cursor orb is red over light surfaces and white over dark ones.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Cursor tone');
      await page.goto(`${SITE}#activities`);
      await enter(page);
      await page.waitForTimeout(1200);
      const orb = () => page.evaluate(() => {
        const d = document.querySelector('.cursor__dot');
        const [r, g, b] = getComputedStyle(d).backgroundColor.match(/[\d.]+/g).map(Number);
        const box = d.getBoundingClientRect();
      return { r, g, b, tone: d.parentElement.dataset.tone, parent: d.parentElement.parentElement.id || d.parentElement.parentElement.tagName, at: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] };
      });
      // The accent is the poster's pink (round 6), so "red" here means that pink.
      const red = (c) => c.r > 180 && c.g < 90 && c.b > 90 && c.b < 170;
      const white = (c) => c.r > 220 && c.g > 220 && c.b > 200;
      const pointIn = (sel) => page.evaluate((q) => {
        const r = document.querySelector(q).getBoundingClientRect();
        const y = Math.min(window.innerHeight - 40, Math.max(120, r.top + 60));
        return { x: 60, y };
      }, sel);
      let pt = await pointIn('#activities');
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.move(pt.x + 4, pt.y + 4);
      await page.waitForTimeout(700);
      const onLight = await orb();
      check('Cursor: pink over a light section', red(onLight) && onLight.tone === 'light', JSON.stringify(onLight));
      await page.locator('#gallery').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      pt = await pointIn('#gallery');
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(700);
      const onDark = await orb();
      check('Cursor: white over a dark section', white(onDark) && onDark.tone === 'dark', JSON.stringify(onDark));
      // Still mouse, page scrolls from the gallery (dark) into the FAQ (light).
      await page.mouse.move(60, 450);
      await page.waitForTimeout(500);
      const before = (await orb()).tone;
      const faqTop = await page.evaluate(() => document.getElementById('faq').getBoundingClientRect().top);
      for (let k = 0; k < 10 && (await page.evaluate(() => document.getElementById('faq').getBoundingClientRect().top)) > 300; k++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(250); }
      await page.waitForTimeout(900);
      const afterScroll = await orb();
      check('Cursor: changes while the page scrolls under a still mouse', before === 'dark' && afterScroll.tone === 'light' && red(afterScroll), `${before} -> ${afterScroll.tone} (faq top was ${Math.round(faqTop)})`);
      // Menu bar is dark; the change from red eases over 0.4 s.
      await page.mouse.move(700, 30);
      await page.waitForTimeout(200);
      const mid = await orb();
      await page.waitForTimeout(700);
      check('Cursor: the colour eases (in between part-way)', mid.g > 35 && mid.g < 220, JSON.stringify(mid));
      check('Cursor: white over the frosted menu bar', (await orb()).tone === 'dark');
      // Full-screen gallery view: inside the dialog, white.
      await page.locator('#gallery').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await page.click('.car__item.is-active .car__btn');
      await page.waitForSelector('#lightbox[open]');
      await page.waitForTimeout(900);
      await page.mouse.move(80, 300);
      await page.waitForTimeout(700);
      const inLb = await orb();
      check('Cursor: visible inside the full-screen view, under the mouse, and white', inLb.parent === 'lightbox' && white(inLb) && Math.abs(inLb.at[0] - 80) < 6 && Math.abs(inLb.at[1] - 300) < 6, JSON.stringify(inLb));
      await page.screenshot({ path: path.join(out, 'cursor-lightbox-1440.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      check('Cursor: back on the page after closing', (await orb()).parent === 'BODY');
      // Registration view: inside the dialog, red.
      await page.evaluate(() => document.querySelector('[data-open-register]').click());
      await page.waitForSelector('#register[open]');
      await page.waitForTimeout(1200);
      await page.mouse.move(300, 400);
      await page.mouse.move(310, 410);
      await page.waitForTimeout(700);
      const inReg = await orb();
      check('Cursor: visible inside the registration view, under the mouse, and pink', inReg.parent === 'register' && red(inReg) && Math.abs(inReg.at[0] - 310) < 6 && Math.abs(inReg.at[1] - 410) < 6, JSON.stringify(inReg));
      await page.screenshot({ path: path.join(out, 'cursor-register-1440.png') });
      done();
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await enter(page);
      const d = await page.evaluate(() => getComputedStyle(document.querySelector('.cursor__dot')).transitionDuration);
      check('Cursor, reduced motion: the colour switches at once', d.split(',').every((x) => parseFloat(x) === 0), d);
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await enter(page, '#enter-silent', true);
      check('Cursor: none on touch devices', await page.evaluate(() => !document.querySelector('.cursor')));
      await ctx.close();
    }
    // 18. Round 5 effects.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(2026, 10, 12, 10, 0) });
      const done = watch(page, 'Effects 1440');
      await page.goto(SITE);
      await enter(page);
      await page.waitForTimeout(2600);
      // B. Countdown (clock fixed at 12 Nov 2026: 53 days to 4 Jan 2027).
      const count = await page.evaluate(() => ({ vis: !document.getElementById('hero-count').hidden, n: document.querySelector('.hero__count-n').textContent, sr: document.querySelector('.hero__count-sr').textContent }));
      check('B. Countdown: "53 days to camp", rolled up to the number', count.vis && count.n === '53' && count.sr === '53 days to camp', JSON.stringify(count));
      // F. Hold the hero word.
      const w = await page.locator('#hero-word').boundingBox();
      await page.mouse.move(w.x + w.width / 2, w.y + w.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(500);
      const part = await page.evaluate(() => document.getElementById('home').wcBoost);
      await page.waitForTimeout(1000);
      const full = await page.evaluate(() => ({ b: document.getElementById('home').wcBoost, scene: document.getElementById('home').wcScene(), lit: document.getElementById('hero-word').classList.contains('is-lit') }));
      await page.screenshot({ path: path.join(out, 'hero-illuminate-1440.png') });
      await page.mouse.up();
      await page.waitForTimeout(1100);
      const back = await page.evaluate(() => document.getElementById('home').wcBoost);
      check('F. Holding the word brightens the scene (eases up, then lit)', part > 0.05 && part < 0.95 && full.b === 1 && full.lit && (!full.scene || full.scene.boost === 1), `${part} -> ${JSON.stringify(full)}`);
      check('F. Releasing eases it back', back < 0.02, String(back));
      // I. Snow settles as the page scrolls.
      const s0 = await page.evaluate(() => document.getElementById('home').wcScene()?.settle ?? null);
      await page.mouse.move(60, 600);
      for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(200); }
      await page.waitForTimeout(2500);
      const s1 = await page.evaluate(() => document.getElementById('home').wcScene()?.settle ?? null);
      check('I. Snow settles on the ridges as the page scrolls', s0 !== null && s0 < 0.05 && s1 > 0.4, `${s0} -> ${s1}`);
      await page.screenshot({ path: path.join(out, 'hero-settled-1440.png') });
      // H. Sections open from a rounded inset as they come in.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      const clip = async () => page.evaluate(() => getComputedStyle(document.getElementById('faq')).clipPath);
      await page.evaluate(() => { const f = document.getElementById('faq'); window.scrollTo(0, f.offsetTop - window.innerHeight + 120); });
      await page.waitForTimeout(1200);
      const cMid = await clip();
      await page.evaluate(() => { const f = document.getElementById('faq'); window.scrollTo(0, f.offsetTop - 100); });
      await page.waitForTimeout(1200);
      const cEnd = await clip();
      check('H. A section opens from a rounded inset as it scrolls in', /inset\(.*round/.test(cMid) && !/round 0px\)$|^none$/.test(cMid) && /inset\(0(px|%)?\)?/.test(cEnd), `${cMid} -> ${cEnd}`);
      // A. Spotlight on a card.
      await page.locator('.card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const c = await page.locator('.card__in').first().boundingBox();
      await page.mouse.move(c.x + 40, c.y + 40);
      await page.mouse.move(c.x + 60, c.y + 50);
      await page.waitForTimeout(600);
      const spot = await page.evaluate(() => { const el = document.querySelector('.card__in'); return { o: getComputedStyle(el, '::after').opacity, mx: el.style.getPropertyValue('--mx') }; });
      check('A. Spotlight follows the mouse on a card', Number(spot.o) > 0.9 && parseInt(spot.mx, 10) > 40, JSON.stringify(spot));
      // E. Slow pan on the centre gallery photo.
      await page.focus('#carousel');
      await page.keyboard.press('Home');
      await page.waitForTimeout(900);
      const kb = await page.evaluate(() => { const i = [...document.querySelectorAll('.car__item')].find((x) => x.dataset.type === 'photo' && x.classList.contains('is-active'))?.querySelector('.car__media img'); const o = document.querySelector('.car__item:not(.is-active) .car__media img'); return { on: i && getComputedStyle(i).animationName, off: o && getComputedStyle(o).animationName }; });
      check('E. The centre gallery photo pans slowly; the others do not', kb.on === 'ken-burns' && kb.off === 'none', JSON.stringify(kb));
      // D. Seat count sweeps when it appears.
      await page.evaluate(() => document.querySelector('[data-open-register]').click());
      await page.waitForSelector('#register[open]');
      await page.waitForFunction(() => /\d/.test(document.querySelector('[data-seats]').textContent), null, { timeout: 8000 });
      const sw = await page.evaluate(() => [...document.querySelectorAll('[data-seats]')].map((s) => s.classList.contains('is-swept') && getComputedStyle(s, '::after').animationName));
      check('D. Seat counts get a light sweep when they appear', sw.every((x) => x === 'seat-sweep'), JSON.stringify(sw));
      done();
      await ctx.close();
    }
    {
      // B. During camp.
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(2027, 0, 5, 9, 0) });
      await page.goto(SITE);
      await enter(page, '#enter-silent', true);
      check('B. Countdown during camp: "Camp is on now"', (await page.textContent('.hero__count-sr')) === 'Camp is on now' && await page.isHidden('.hero__count-n'));
      check('A. No spotlight on touch devices', await page.evaluate(() => !document.querySelector('.has-spot')));
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(2027, 0, 1, 9, 0) });
      const done = watch(page, 'Effects, reduced motion');
      await page.goto(SITE);
      await enter(page);
      await page.waitForTimeout(600);
      const c = await page.evaluate(() => ({ n: document.querySelector('.hero__count-n').textContent, sr: document.querySelector('.hero__count-sr').textContent }));
      check('B. Countdown, reduced motion: the number at once', c.n === '3' && c.sr === '3 days to camp', JSON.stringify(c));
      check('Reduced motion: no spotlight, no wipe, no gallery pan', await page.evaluate(() => !document.querySelector('.has-spot, .has-wipe') && [...document.querySelectorAll('.car__media img')].every((i) => getComputedStyle(i).animationName === 'none')));
      const w = await page.locator('#hero-word').boundingBox();
      await page.mouse.move(w.x + 20, w.y + 20);
      await page.mouse.down();
      await page.waitForTimeout(100);
      check('F. Reduced motion: holding lights the word at once', await page.evaluate(() => document.getElementById('home').wcBoost === 1));
      await page.mouse.up();
      done();
      await ctx.close();
    }
    {
      // G. With sound on, the music's filter opens as the page scrolls.
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await page.waitForSelector('.loader.is-ready', { timeout: 8000 });
      await page.waitForTimeout(100);
      await page.click('#enter-sound');
      await page.waitForSelector('#loader', { state: 'detached', timeout: 5000 });
      const top = await waitFor(() => page.evaluate(() => document.documentElement.wcAudio?.musicCutoff ?? null), 20000);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1500);
      const bottom = await page.evaluate(() => document.documentElement.wcAudio?.musicCutoff ?? null);
      check('G. Music opens up as the page scrolls (low-pass follows scroll)', top !== null && bottom !== null && top < 1200 && bottom > 8000, `${top} Hz -> ${bottom} Hz`);
      await ctx.close();
    }

    // 19. Round 7: seat hold, consent gate, payment safeguards, draft, resend.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date() }); // time flows; fastForward() jumps to the hold's end
      const done = watch(page, 'Round 7');
      await page.goto(SITE);
      await enter(page);
      const line = await waitFor(() => page.evaluate(() => { const el = document.getElementById('hero-live'); return !el.hidden && el.querySelector('.hero__live-text').textContent.trim(); }));
      check('Hero: a live seat line under the Register button', line === 'Youth: 30 of 30 seats left · Kids: 30 of 30 seats left', String(line));
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('#register[open]');
      check('Registration start says the seat is held for 5 minutes at payment', (await page.textContent('#reg-hold-note')).trim() === 'When you reach payment, your seat is held for 5 minutes.');
      // Consent gate.
      await page.waitForSelector('.cat[data-cat="kids"] [data-choose]:not([disabled])');
      await page.click('.cat[data-cat="kids"] [data-choose]');
      await page.fill('#f-name', 'Sonam Wangmo');
      await page.selectOption('#f-dob-d', '3'); await page.selectOption('#f-dob-m', '4'); await page.selectOption('#f-dob-y', '2018');
      await page.click('#reg-next');
      await page.fill('#f-parent', 'Lhamo Tsering'); await page.fill('#f-address', 'Bhagsu Road, McLeodganj'); await page.fill('#f-phone-1', '9876501234');
      await page.click('#reg-next');
      await page.waitForTimeout(300);
      check('Consent step: Next is disabled until YES and the agreement are chosen', await page.isDisabled('#reg-next') && await page.isVisible('#step-gate'));
      await page.click('label.choice:has(input[name="consent"][value="no"])');
      await page.click('label.choice:has(#f-agree)');
      check('Consent NO keeps Next disabled, with a clear message', await page.isDisabled('#reg-next') && (await page.textContent('#err-consent')).includes('must be YES'));
      await page.screenshot({ path: path.join(out, 'r7-consent-no-390.png') });
      await page.click('label.choice:has(input[name="consent"][value="yes"])');
      check('YES and the ticked agreement leave only the signature missing (round 9)', await page.isDisabled('#reg-next') && (await page.textContent('#step-gate')).trim() === 'To continue, sign in the box or type your name instead.' && await page.isHidden('#err-consent'));
      await drawSignature(page);
      check('YES, the agreement and a signature enable Next', await page.isEnabled('#reg-next') && await page.isHidden('#step-gate'));
      await page.click('label.choice:has(#f-agree)'); // untick
      check('Unticking the agreement disables Next again', await page.isDisabled('#reg-next'));
      await page.click('label.choice:has(#f-agree)');
      await page.click('#reg-next');
      await page.waitForSelector('#pay-panel:not([hidden])', { timeout: 8000 });
      // Hold and countdown.
      await page.waitForSelector('#hold:not([hidden])');
      const holdText = await page.textContent('#hold-text');
      check('Payment step: countdown of the 5-minute hold', /^Your seat is held for [45]:\d\d$/.test(holdText.trim()), holdText);
      let st = await api('/__state');
      const myId = Object.keys(st.holds.kids)[0];
      check('Backend: one hold for this submission', Object.keys(st.holds.kids).length === 1 && Boolean(myId));
      const code = (await page.textContent('#pay-code')).trim();
      check('Payment step: registration code shown and put in the UPI note', /^[0-9A-F]{8}$/.test(code) && code === myId.replace(/-/g, '').slice(0, 8).toUpperCase() && (await page.getAttribute('#upi-open', 'data-upi')).includes(`tn=Winter%20Camp%202027%20${code}`), code);
      const warn = await page.evaluate(() => { const w = document.getElementById('pay-warn'); const b = document.getElementById('upi-open'); return { t: w.textContent.trim(), c: getComputedStyle(w).color, before: Boolean(w.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), vis: w.offsetParent !== null }; });
      check('Red capital warning "CHECK AND PAY ₹ 500/- ONLY" right before the UPI button', warn.t === 'CHECK AND PAY ₹ 500/- ONLY' && warn.c === 'rgb(179, 0, 27)' && warn.before && warn.vis, JSON.stringify(warn));
      const helpLine = await page.evaluate(() => { const h = document.getElementById('pay-help'); return { t: h.textContent.trim(), before: Boolean(h.compareDocumentPosition(document.querySelector('.pay__qr')) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
      check('"If anything goes wrong after you pay, call ..." shown before the QR code', helpLine.t === 'If anything goes wrong after you pay, call +91-8219012669 with your payment screenshot.' && helpLine.before, JSON.stringify(helpLine));
      await page.fill('#f-ref', 'UPI123');
      await page.locator('#f-ref').blur();
      check('UPI transaction ID must have 12 digits when given', (await page.textContent('#err-ref')).includes('12 digits'));
      await page.fill('#f-ref', '4123 4567 8901');
      await page.locator('#f-ref').blur();
      check('A 12-digit UTR with spaces is accepted', await page.isHidden('#err-ref'));
      await page.locator('#hold').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, 'r7-hold-390.png') });
      await page.locator('#pay-warn').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, 'r7-pay-warn-390.png') });
      await axe(page, 'Round 7: payment step with hold', '#register');

      // The tab reloads (as when the phone switches to the UPI app): the draft brings the form back.
      await page.waitForTimeout(400);
      await page.reload();
      await enter(page);
      await page.waitForSelector('#register[open] #pay-panel:not([hidden])', { timeout: 10000 });
      const restored = await page.evaluate(() => ({ name: document.getElementById('f-name').value, phone: document.getElementById('f-phone-1').value, consent: document.querySelector('input[name="consent"]:checked')?.value, note: document.getElementById('draft-note').textContent, code: document.getElementById('pay-code').textContent }));
      check('Draft: after a reload the form reopens at payment with the details kept', restored.name === 'Sonam Wangmo' && restored.phone === '9876501234' && restored.consent === 'yes' && restored.code === code && /attach your payment screenshot again/.test(restored.note), JSON.stringify(restored));
      st = await api('/__state');
      check('Draft: the same submission holds the seat again (one hold, same ID)', Object.keys(st.holds.kids).length === 1 && Object.keys(st.holds.kids)[0] === myId);
      const storedDraft = await page.evaluate(() => sessionStorage.getItem('wc-reg-draft') || '');
      check('Draft: kept in sessionStorage only, without the screenshot', storedDraft.includes('Sonam Wangmo') && !/data:image\/(jpeg|png|webp)/.test(storedDraft) && await page.evaluate(() => !JSON.stringify({ ...localStorage }).includes('Sonam')));

      // A second family while this family holds the last seat.
      await api('/__seed', { category: 'kids', count: 29 });
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const p2 = await ctx2.newPage();
      await p2.goto(SITE);
      await enter(p2);
      const line2 = await waitFor(() => p2.evaluate(() => { const el = document.getElementById('hero-live'); return !el.hidden && el.querySelector('.hero__live-text').textContent.trim(); }));
      check('Hero: a group whose last seat is held says so', String(line2).includes('Kids: all seats held, check again soon'), String(line2));
      await p2.click('.hero__cta [data-open-register]');
      await p2.waitForSelector('.cat[data-cat="kids"].is-full', { timeout: 8000 });
      check('Second family: Kids card shows "Seats are full..." and that seats are held for now', (await p2.textContent('.cat[data-cat="kids"] [data-full] span')).trim() === 'Seats are full. Kindly contact +91-8219012669.' && await p2.isVisible('.cat[data-cat="kids"] [data-held]') && await p2.isDisabled('.cat[data-cat="kids"] [data-choose]'));
      await p2.screenshot({ path: path.join(out, 'r7-held-full-1280.png') });

      // The hold runs out (server clock and page clock both move 5 minutes on).
      await api('/__clock', { advanceMs: 5 * 60000 + 2000 });
      await page.clock.fastForward('05:02');
      await page.waitForSelector('#hold-ended:not([hidden])', { timeout: 5000 });
      check('Hold expiry: message and "Hold my seat again"', (await page.textContent('#hold-ended-text')).includes('Your 5 minutes are up') && (await page.textContent('#hold-again')).includes('Hold my seat again') && await page.isVisible('#pay-panel'));
      await page.locator('#hold').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(out, 'r7-hold-ended-390.png') });
      await p2.click('.cat[data-cat="kids"] [data-recheck]');
      await p2.waitForSelector('.cat[data-cat="kids"] [data-choose]:not([disabled])', { timeout: 8000 });
      check('After the hold expires the seat opens for the next family', true);
      await fillToPayment(p2, { cat: 'kids', dob: '2017-05-05' });
      check('Second family now holds the last seat', await p2.isVisible('#pay-panel') && await p2.isVisible('#hold'));
      await page.click('#hold-again');
      await page.waitForFunction(() => /Seats are now full/.test(document.getElementById('hold-ended-text').textContent), null, { timeout: 8000 });
      check('First family: "Hold again" now says seats are full, do not pay; payment panel stays', await page.isVisible('#pay-panel') && (await page.textContent('#hold-ended-text')).includes('If you have already paid, send the form anyway'));
      if (!(await page.isChecked('#f-refund'))) await page.click('label.choice:has(#f-refund)');
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      check('First family can still send the form after paying', await page.isEnabled('#reg-submit'));
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-last:not([hidden])', { timeout: 10000 });
      check('Paid after the hold expired and the seat went: last-seat view with the refund message', (await page.textContent('#reg-last')).includes('Contact the organisers for a refund.'));
      st = await api('/__state');
      const H = (n) => st.headers.indexOf(n);
      check('Backend: that payment is in "Paid, no seat" with its registration code', st.overflow.length === 1 && st.overflow[0][H('Registration code')] === code && st.overflow[0][H('UPI transaction reference')] === '412345678901');
      check('Draft: deleted once the registration is sent', await page.evaluate(() => sessionStorage.getItem('wc-reg-draft') === null));
      // The second family sends: the group is now truly full.
      await p2.setInputFiles('#f-shot', shotPng);
      await p2.waitForSelector('#shot-preview:not([hidden])');
      await p2.waitForTimeout(5200);
      await p2.click('#reg-submit');
      await p2.waitForSelector('#reg-done:not([hidden])', { timeout: 10000 });
      st = await api('/__state');
      check('Backend: hold released on submit; Kids has 30 seats taken; the row says "Not checked"', Object.keys(st.holds.kids).length === 0 && st.kids.length === 30 && st.kids[29][H('Payment check')] === 'Not checked');
      check('Backend: the same screenshot used by two families is flagged on the later row', /^Same screenshot as Paid, no seat row 2/.test(st.kids[29][H('Possible duplicate payment')] || ''), st.kids[29][H('Possible duplicate payment')]);
      await p2.click('#reg-done [data-close-register]');
      await p2.waitForTimeout(900);
      const line3 = await waitFor(() => p2.evaluate(() => { const t = document.getElementById('hero-live').textContent; return t.includes('Kids: Seats are full') && t; }));
      check('Hero: a full group says "Seats are full"', Boolean(line3), String(line3));
      await api('/__seed', { category: 'youth', count: 30 });
      await p2.click('.hero__cta [data-open-register]');
      await p2.waitForSelector('.cat[data-cat="youth"].is-full', { timeout: 8000 });
      check('Truly full: no "held" note on the card', await p2.isHidden('.cat[data-cat="youth"] [data-held]'));
      await p2.click('.reg__bar [data-close-register]');
      await p2.waitForTimeout(900);
      const line4 = await waitFor(() => p2.evaluate(() => { const el = document.getElementById('hero-live'); return el.classList.contains('is-full') && el.textContent.trim(); }));
      check('Hero: both groups full shows "Seats are full. Kindly contact +91-8219012669." with tap-to-call', String(line4).startsWith('Seats are full. Kindly contact +91-8219012669.') && await p2.isVisible('#hero-live a[href="tel:+918219012669"]'), String(line4));
      await p2.locator('.hero__cta').screenshot({ path: path.join(out, 'r7-hero-full-1280.png') }).catch(() => {});
      await p2.locator('#hero-live').screenshot({ path: path.join(out, 'r7-hero-line-1280.png') });
      done();
      await ctx2.close();
      await ctx.close();
    }
    {
      // Duplicates: before paying, and after paying.
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await enter(page);
      const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
      const direct = (name, dob) => api('/exec', { action: 'register', submissionId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`, category: 'kids', name, dob, parent: 'P', address: 'A', phones: ['9876543210'], consent: 'yes', agree: true, refundAck: true, signatureTyped: 'Parent Name', signDate: '2026-11-11', screenshot: { data: jpeg }, paymentRef: '', lang: 'en', website: '', elapsedMs: 60000 });
      await direct('Tenzin Norbu', '2019-03-15');
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('.cat[data-cat="kids"] [data-choose]:not([disabled])');
      await page.click('.cat[data-cat="kids"] [data-choose]');
      await page.fill('#f-name', 'Tenzin Norbu');
      await page.selectOption('#f-dob-d', '15'); await page.selectOption('#f-dob-m', '3'); await page.selectOption('#f-dob-y', '2019');
      await page.click('#reg-next');
      await page.fill('#f-parent', 'Dolma'); await page.fill('#f-address', 'McLeodganj'); await page.fill('#f-phone-1', '9876543210');
      await page.click('#reg-next');
      await page.click('label.choice:has(input[name="consent"][value="yes"])');
      await page.click('label.choice:has(#f-agree)');
      await drawSignature(page);
      await page.click('#reg-next');
      await page.waitForSelector('#pay-dup:not([hidden])', { timeout: 8000 });
      check('Duplicate before paying: told there is no need to pay; no payment details shown', (await page.textContent('#pay-dup')).includes('no need to pay') && await page.isHidden('#pay-panel'));
      await page.screenshot({ path: path.join(out, 'r7-dup-before-390.png') });
      // After paying: the same child is registered by someone else while this family pays.
      await page.click('#reg-back');
      await page.click('#reg-back');
      await page.click('#reg-back');
      await page.fill('#f-name', 'Karma Yangchen');
      await page.click('#reg-next'); await page.click('#reg-next'); await page.click('#reg-next');
      await page.waitForSelector('#pay-panel:not([hidden])', { timeout: 8000 });
      if (!(await page.isChecked('#f-refund'))) await page.click('label.choice:has(#f-refund)');
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await direct('Karma Yangchen', '2019-03-15');
      await page.waitForTimeout(5200);
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-dup:not([hidden])', { timeout: 10000 });
      check('Duplicate after paying: clear message to call the organisers with the screenshot', (await page.textContent('#reg-dup')).includes('already registered') && (await page.textContent('#reg-dup')).includes('call +91-8219012669 with your payment screenshot'));
      await page.screenshot({ path: path.join(out, 'r7-dup-after-390.png') });
      const st = await waitFor(async () => { const x = await api('/__state'); return x.overflow[0]?.[x.headers.indexOf('Registration PDF')] && x; });
      const H = (n) => st.headers.indexOf(n);
      check('Backend: the paid duplicate is saved in "Paid, no seat" as "Paid, duplicate", with screenshot and PDF', Boolean(st) && st.overflow.length === 1 && st.overflow[0][H('Status')] === 'Paid, duplicate' && /^https?:\/\/(?:[^/]+\.)?drive\.google\.com(?:\/|$)/.test(st.overflow[0][H('Payment screenshot')]));
      await ctx.close();
    }
    {
      // Offline after paying: the form is sent again by itself when the connection returns.
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'youth', dob: '2011-02-02' });
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await page.route('**/exec', (route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue()));
      await page.waitForTimeout(5200);
      await page.click('#reg-submit');
      await page.waitForSelector('#send-error:not([hidden])');
      check('Offline after paying: says it will be sent automatically when back online', (await page.textContent('#send-error')).includes('sent automatically when your connection returns'));
      await page.unroute('**/exec');
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 10000 });
      check('Back online: the registration is sent without pressing anything', true);
      await ctx.close();
    }

    // 20. Round 8.
    // 20a. Desktop with real (classic) scrollbars, as on Windows: headless Chrome hides
    // scrollbars by default, which is why round 5's checks passed while Paul saw no motion.
    {
      const b2 = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], ignoreDefaultArgs: ['--hide-scrollbars'] });
      const ctx = await b2.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 8 desktop');
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      const bar = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
      check('1440 with real scrollbars: the page has a classic scrollbar', bar > 0, `${bar}px`);
      const openWatched = async () => {
        await page.evaluate(() => {
          window.__vt = [];
          const o = document.startViewTransition.bind(document);
          document.startViewTransition = (cb) => { const vt = o(cb); vt.ready.then(() => window.__vt.push('ran'), (e) => window.__vt.push(String(e.message))); return vt; };
        });
        await page.click('.car__item.is-active .car__btn');
        const dur = await waitFor(() => page.evaluate(() => document.getAnimations().filter((a) => /view-transition-group\(wc-media\)/.test(a.effect?.pseudoElement || '')).map((a) => a.effect.getTiming().duration)[0]), 1500);
        await page.waitForTimeout(900);
        await settled(page).catch(() => {});
        return { dur, log: await page.evaluate(() => window.__vt) };
      };
      // Without the fix (scrollbar space not kept) Chrome cancels the transition.
      await page.evaluate(() => document.documentElement.style.setProperty('scrollbar-gutter', 'auto'));
      const broken = await openWatched();
      check('Cause reproduced: without scrollbar-gutter the transition is cancelled ("Viewport size changed")', /Viewport size changed/.test(broken.log.join(' ')), broken.log.join(' '));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await page.evaluate(() => document.documentElement.style.removeProperty('scrollbar-gutter'));
      const fixed = await openWatched();
      check('Fixed: with real scrollbars the 0.7 s opening transition runs', fixed.log.includes('ran') && fixed.dur === 700, `${fixed.log.join(' ')} ${fixed.dur}`);
      const bg = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('lightbox')); return { bg: cs.backgroundColor, f: cs.backdropFilter }; });
      check('Full-screen view: translucent indigo background with a soft blur', bg.bg === 'rgba(24, 14, 85, 0.7)' && /blur\(16px\)/.test(bg.f), JSON.stringify(bg));
      await page.screenshot({ path: path.join(out, 'r8-lightbox-1440.png') });
      // Mouse drag: the item follows the mouse and the next slides in alongside it.
      const cap0 = await page.textContent('#lightbox-cap');
      const mb = await page.locator('#lightbox-stage .lightbox__item > *').boundingBox();
      const y = mb.y + mb.height / 2;
      const x0 = mb.x + mb.width / 2;
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let k = 1; k <= 10; k++) { await page.mouse.move(x0 - k * 5, y); await page.waitForTimeout(30); }
      const mid = await page.evaluate(() => [...document.querySelectorAll('#lightbox-stage .lightbox__item')].map((el) => ({ side: el.classList.contains('is-side'), x: Math.round(new DOMMatrix(getComputedStyle(el).transform).m41) })));
      const cur = mid.find((m) => !m.side);
      const side = mid.find((m) => m.side);
      const noScroll = await page.evaluate(() => { const b = document.getElementById('lightbox'); return getComputedStyle(b).overflowX === 'clip' && b.offsetHeight - b.clientHeight === 0; });
      check('Drag: the neighbour beyond the screen edge does not make the view scroll sideways', noScroll);
      check('Drag: the current item follows the mouse and the next one sits alongside it', mid.length === 2 && cur && Math.abs(cur.x + 50) <= 2 && side && side.x > 200, JSON.stringify(mid));
      await page.screenshot({ path: path.join(out, 'r8-drag-1440.png') });
      await page.mouse.up();
      await page.waitForTimeout(800);
      check('Short slow drag: springs back to the same item, one item left', (await page.textContent('#lightbox-cap')) === cap0 && await page.locator('#lightbox-stage .lightbox__item').count() === 1);
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let k = 1; k <= 20; k++) { await page.mouse.move(x0 - k * 25, y); await page.waitForTimeout(16); }
      await page.waitForTimeout(200); // stop moving, so this is a drag, not a flick
      await page.mouse.up();
      await page.waitForTimeout(150);
      const finishing = await page.locator('#lightbox-stage .lightbox__item').count();
      await page.waitForTimeout(800);
      const cap1 = await page.textContent('#lightbox-cap');
      check('Long drag: finishes the move to the next item, easing, then one item left', cap1 !== cap0 && finishing === 2 && await page.locator('#lightbox-stage .lightbox__item').count() === 1 && await page.evaluate(() => getComputedStyle(document.querySelector('#lightbox-stage .lightbox__item')).transform === 'none'), `${cap0} -> ${cap1}`);
      await page.mouse.move(x0, y);
      await page.mouse.down();
      await page.mouse.move(x0 + 40, y);
      await page.mouse.move(x0 + 90, y); // about 1 px/ms or faster, like a real flick
      await page.mouse.up();
      await page.waitForTimeout(900);
      check('Quick flick right: moves back to the previous item', (await page.textContent('#lightbox-cap')) === cap0);
      check('Dragging did not close the view', await page.evaluate(() => document.getElementById('lightbox').open));
      await page.evaluate(() => { window.__vt = []; });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      const closed = await page.evaluate(() => ({ log: window.__vt, gutter: document.documentElement.classList.contains('wc-gutter'), open: document.getElementById('lightbox').open }));
      check('Fixed: with real scrollbars the closing transition runs too, and the scrollbar space is released after it', closed.log.includes('ran') && !closed.gutter && !closed.open, JSON.stringify(closed));
      await page.click('.hero__cta [data-open-register], [data-open-register]');
      await page.waitForSelector('#register[open]');
      await page.waitForTimeout(800);
      const reg = await page.evaluate(() => ({ w: document.getElementById('register').getBoundingClientRect().width, vw: innerWidth }));
      check('Registration view still fills the screen with real scrollbars', reg.w === reg.vw, JSON.stringify(reg));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      // Hero: capitals and a prominent countdown.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(800);
      const hero = await page.evaluate(() => {
        const fs = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
        const count = document.getElementById('hero-count');
        return { tt: getComputedStyle(document.querySelector('.hero__sub')).textTransform, n: fs('.hero__count-n'), words: fs('#hero-count'), venue: fs('.hero__venue'), live: fs('.hero__live'), fact: fs('.hero__fact dd'), shown: !count.hidden };
      });
      check('Hero: "Light of the World" in capitals', hero.tt === 'uppercase');
      check('Hero: the days-left countdown is larger than the facts, venue and seat line', hero.shown && hero.n >= 56 && hero.words > Math.max(hero.venue, hero.live, hero.fact), JSON.stringify(hero));
      await page.locator('.hero').screenshot({ path: path.join(out, 'r8-hero-1440.png') });
      // Day 3 picnic card: gallery item 20 behind the text.
      await page.locator('.card--wide').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const pic = await page.evaluate(() => {
        const img = document.querySelector('.card--wide .card__photo');
        const items = [...document.querySelectorAll('.car__item .car__media img')].map((i) => i.getAttribute('src').replace(/-\d+\.webp$/, ''));
        return img && { loaded: img.complete && img.naturalWidth > 0, same: img.getAttribute('src').replace(/-\d+\.webp$/, '') === items[19], alt: img.alt, z: getComputedStyle(img).zIndex };
      });
      check('Activities: the Day 3 picnic card shows gallery item 20 behind its text', Boolean(pic) && pic.loaded && pic.same && pic.alt.length > 10, JSON.stringify(pic));
      await page.locator('.card--wide').screenshot({ path: path.join(out, 'r8-picnic-1440.png') });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      // Pink buttons stay pink on hover.
      await page.hover('.hero__cta [data-open-register]');
      await page.waitForTimeout(500);
      const hov = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.hero__cta [data-open-register]')); return { bg: cs.backgroundColor, c: cs.color }; });
      check('Pink button hover: deeper pink #B8105F, white label (6.4:1)', hov.bg === 'rgb(184, 16, 95)' && hov.c === 'rgb(255, 255, 255)', JSON.stringify(hov));
      done();
      await ctx.close();
      await b2.close();
    }
    // 20b. Phone: drag follows the finger.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 8 phone drag');
      await page.goto(`${SITE}#gallery`);
      await enter(page, '#enter-silent', true);
      await page.waitForTimeout(1200);
      await page.locator('#carousel').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.tap('.car__item.is-active .car__btn');
      await page.waitForTimeout(1000);
      await settled(page).catch(() => {});
      const cdp = await ctx.newCDPSession(page);
      const cap0 = await page.textContent('#lightbox-cap');
      const y = 420;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y, id: 1 }] });
      for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - k * 10, y, id: 1 }] });
      await page.waitForTimeout(80); // moves are delivered on the next frame
      const mid = await page.evaluate(() => [...document.querySelectorAll('#lightbox-stage .lightbox__item')].map((el) => ({ side: el.classList.contains('is-side'), x: Math.round(new DOMMatrix(getComputedStyle(el).transform).m41) })));
      check('Phone: the item follows the finger and the next slides in beside it', mid.length === 2 && Math.abs(mid.find((m) => !m.side).x + 80) <= 2 && mid.find((m) => m.side).x > 0, JSON.stringify(mid));
      await page.screenshot({ path: path.join(out, 'r8-drag-390.png') });
      for (let k = 9; k <= 22; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - k * 10, y, id: 1 }] }); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(900);
      check('Phone: a long swipe finishes the move to the next item', (await page.textContent('#lightbox-cap')) !== cap0 && await page.locator('#lightbox-stage .lightbox__item').count() === 1);
      done();
      await ctx.close();
    }
    // 20c. "Pay ₹500 with UPI" opens a list of UPI apps (Android and iPhone).
    for (const [os, ua] of [['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'], ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1']]) {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
      const page = await ctx.newPage();
      const done = watch(page, `Round 8 UPI apps ${os}`);
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'kids', dob: '2018-05-05' });
      const code = (await page.textContent('#pay-code')).trim();
      check(`${os}: "Pay ₹500 with UPI" shown, list closed`, await page.isVisible('#upi-open') && await page.isHidden('#upi-apps') && (await page.getAttribute('#upi-open', 'aria-expanded')) === 'false');
      await page.click('#upi-open');
      await page.waitForTimeout(400);
      const links = await page.$$eval('#upi-apps .pay__app', (as) => as.map((a) => ({ t: a.textContent, h: a.getAttribute('href') })));
      const names = links.map((l) => l.t).join(', ');
      check(`${os}: tapping it opens a list of UPI apps`, await page.isVisible('#upi-apps') && (await page.getAttribute('#upi-open', 'aria-expanded')) === 'true' && names === 'Google Pay, PhonePe, Paytm, BHIM, CRED, Other UPI app', names);
      const gp = links[0].h;
      const ok = os === 'Android'
        ? gp.startsWith('intent://pay?pa=') && gp.endsWith('#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end')
        : gp.startsWith('gpay://upi/pay?pa=');
      check(`${os}: each app link opens that app with the payee and the registration code, and no amount (round 9: typed by the family)`, ok && links.every((l) => !/[?&]am=/.test(l.h) && l.h.includes('pa=achuisr1985.27-1%40okhdfcbank') && l.h.includes(`tn=Winter%20Camp%202027%20${code}`)) && links.at(-1).h.startsWith('upi://pay?'), gp);
      await page.locator('#upi-apps').screenshot({ path: path.join(out, `r8-upi-apps-${os.toLowerCase()}.png`) });
      await axe(page, `UPI app list ${os}`, '#register');
      done();
      await ctx.close();
    }
    // 20d. Privacy notice: how long we keep it.
    {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(`${SITE}privacy/`);
      const txt = await page.textContent('main');
      check('Privacy: data kept after the camp with no set end date, confidential, deleted on request', txt.includes('with no set end date') && txt.includes('never give them to anyone else') && txt.includes('ask us to delete') && !txt.includes('90 days'));
      check('Privacy: looking back on camps and planning future ones is listed as a use', txt.includes('plan future ones'));
      await ctx.close();
    }

    // ---------- 21. Round 9 ----------
    // 21a. A signature is needed before Next: empty, drawn, cleared, typed, typed then emptied, restored draft.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 9 signature gate');
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('.cat[data-cat="youth"] [data-choose]:not([disabled])');
      await page.click('.cat[data-cat="youth"] [data-choose]');
      await page.fill('#f-name', 'Karma Yangzom');
      await page.selectOption('#f-dob-d', '9'); await page.selectOption('#f-dob-m', '9'); await page.selectOption('#f-dob-y', '2012');
      await page.click('#reg-next');
      await page.fill('#f-parent', 'Pasang Lhamo'); await page.fill('#f-address', 'Temple Road, McLeodganj'); await page.fill('#f-phone-1', '9876512345');
      await page.click('#reg-next');
      await page.waitForTimeout(300);
      const gate = async () => ((await page.isHidden('#step-gate')) ? '' : (await page.textContent('#step-gate')).trim());
      check('Signature gate: with nothing done, the note lists all three things', await page.isDisabled('#reg-next') && (await gate()) === 'To continue, choose YES for medical emergency consent, tick the box to agree and sign in the box or type your name instead.', await gate());
      await page.click('label.choice:has(input[name="consent"][value="yes"])');
      await page.click('label.choice:has(#f-agree)');
      check('Signature gate: an empty pad keeps Next disabled and says what is missing', await page.isDisabled('#reg-next') && (await gate()) === 'To continue, sign in the box or type your name instead.', await gate());
      await page.screenshot({ path: path.join(out, 'r9-sign-gate-empty-1280.png') });
      const box = await page.locator('#f-sign').boundingBox();
      await page.mouse.click(box.x + 60, box.y + 60);
      check('Signature gate: a single tap (a dot) is not a signature', await page.isDisabled('#reg-next'));
      await drawSignature(page);
      check('Signature gate: a drawn signature enables Next', await page.isEnabled('#reg-next') && (await gate()) === '');
      await page.click('#f-sign-clear');
      check('Signature gate: Clear disables Next again', await page.isDisabled('#reg-next') && (await gate()).includes('sign in the box'));
      await page.click('#sign-mode');
      check('Signature gate: switching to typing with no name keeps Next disabled', await page.isDisabled('#reg-next'));
      await page.fill('#f-sign-typed', 'D');
      check('Signature gate: one letter is not a typed signature', await page.isDisabled('#reg-next'));
      await page.fill('#f-sign-typed', 'Pasang Lhamo');
      check('Signature gate: a typed full name enables Next', await page.isEnabled('#reg-next') && (await gate()) === '');
      await page.fill('#f-sign-typed', '');
      check('Signature gate: emptying the typed name disables Next again', await page.isDisabled('#reg-next'));
      await page.fill('#f-sign-typed', 'Pasang Lhamo');
      await page.click('#sign-mode');
      check('Signature gate: switching back to drawing (empty pad) disables Next, though a name was typed', await page.isDisabled('#reg-next'));
      await drawSignature(page);
      check('Signature gate: drawing then enables Next', await page.isEnabled('#reg-next'));
      // The draft keeps the strokes: after a reload the gate is open again by itself.
      await page.waitForTimeout(400);
      await page.reload();
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('#draft-note:not([hidden])', { timeout: 8000 });
      await page.waitForTimeout(400);
      const restored = await page.evaluate(() => ({ step: [...document.querySelectorAll('.step')].findIndex((s) => !s.hidden), ink: document.getElementById('sign-wrap').classList.contains('has-ink') }));
      check('Signature gate: a restored draft keeps the signature and Next is enabled', restored.step === 2 && restored.ink && await page.isEnabled('#reg-next'), JSON.stringify(restored));
      await page.click('#f-sign-clear');
      check('Signature gate: clearing the restored signature disables Next', await page.isDisabled('#reg-next'));
      // The server refuses an empty pad too (pages that skip the form's check).
      const res = await (await fetch(API.replace(/\/$/, '') + '/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'register', signaturePoints: 1 }) })).json().catch(() => null);
      check('Server answers a malformed registration with an error, not a crash', res && res.ok === false, JSON.stringify(res));
      await axe(page, 'Signature gate', '#register');
      done();
      await ctx.close();
    }

    // 21b. Registration PDF: saved to Drive with "PDF status: Saved"; if the upload fails it is kept and sent on the next visit.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      // The uploads blocked on purpose show as failed requests in the console.
      const done = watch(page, 'Round 9 PDF', { ignore: /ERR_INTERNET_DISCONNECTED/ });
      // Block every PDF upload (as if the family had no signal after registering).
      let blocked = 0;
      const block = async (route) => {
        if ((route.request().postData() || '').includes('"action":"pdf"')) { blocked++; return route.abort('internetdisconnected'); }
        return route.continue();
      };
      await page.route(`${API.replace(/\/$/, '')}/exec**`, block);
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'kids', dob: '2017-07-07' });
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 15000 });
      const saving = (await page.textContent('#done-copy')).trim();
      check('PDF: the success screen says a copy is being saved for the organisers', saving.startsWith('Saving a copy of these details for the organisers'), saving);
      await page.screenshot({ path: path.join(out, 'r9-pdf-saving-390.png') });
      const later = await waitFor(async () => { const t = (await page.textContent('#done-copy')).trim(); return t.includes('next time you open this website') && t; }, 40000);
      check('PDF: after the retries fail, it says the copy will be sent next time', Boolean(later) && blocked >= 4, `${blocked} blocked; ${later}`);
      let st = await api('/__state');
      const H = (h) => st.headers.indexOf(h);
      check('Backend: the row says "Waiting for PDF", with no PDF yet; the Registration PDFs folder exists', st.kids.length === 1 && st.kids[0][H('PDF status')] === 'Waiting for PDF' && !st.kids[0][H('Registration PDF')] && !st.files.some((f) => f.mime === 'application/pdf'), st.kids[0]?.[H('PDF status')]);
      check('Backend: the timestamp is stored as a date (as on the live Sheet)', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(st.kids[0][H('Timestamp')]), st.kids[0][H('Timestamp')]);
      const kept = await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.open('wc-outbox', 1); r.onsuccess = () => { const q = r.result.transaction('pdfs').objectStore('pdfs').getAll(); q.onsuccess = () => resolve(q.result.map((x) => ({ id: x.id, n: x.dataUrl.length }))); }; r.onerror = () => resolve(null); }));
      check('PDF: the unsent copy is kept in this browser (IndexedDB)', kept?.length === 1 && kept[0].n > 20000, JSON.stringify(kept));
      // Next visit, with signal again.
      await page.unroute(`${API.replace(/\/$/, '')}/exec**`, block);
      await page.goto(SITE);
      await enter(page);
      st = await waitFor(async () => { const x = await api('/__state'); return x.files.some((f) => f.mime === 'application/pdf') && x; }, 20000);
      check('PDF: on the next visit it is sent by itself and saved in Kids/Registration PDFs', Boolean(st) && st.files.some((f) => f.mime === 'application/pdf' && f.folder === 'Winter Camp 2027/Kids/Registration PDFs'));
      check('Backend: "PDF status" becomes "Saved" and the row links the PDF', st && st.kids[0][st.headers.indexOf('PDF status')] === 'Saved' && /^https:\/\/drive\.google\.com\//.test(st.kids[0][st.headers.indexOf('Registration PDF')]));
      await page.waitForTimeout(500);
      const left = await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.open('wc-outbox', 1); r.onsuccess = () => { const q = r.result.transaction('pdfs').objectStore('pdfs').getAll(); q.onsuccess = () => resolve(q.result.length); }; }));
      check('PDF: the copy in the browser is deleted once saved', left === 0, String(left));
      done();
      await ctx.close();
    }
    // 21c. Normal case: "A copy ... has been saved".
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 9 PDF saved');
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'youth', dob: '2013-02-02' });
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 15000 });
      const saved = await waitFor(async () => { const t = (await page.textContent('#done-copy')).trim(); return t.startsWith('A copy of these details has been saved') && t; }, 20000);
      check('PDF: the success screen confirms the organisers\' copy was saved', Boolean(saved), String(saved));
      const st = await api('/__state');
      check('Backend: Youth row "PDF status: Saved", PDF in Youth/Registration PDFs', st.youth[0]?.[st.headers.indexOf('PDF status')] === 'Saved' && st.files.some((f) => f.mime === 'application/pdf' && f.folder === 'Winter Camp 2027/Youth/Registration PDFs'));
      await page.screenshot({ path: path.join(out, 'r9-pdf-saved-390.png'), fullPage: false });
      done();
      await ctx.close();
    }

    // 21d. UPI: the family types the amount; tapping an app copies the UPI ID and keeps the hold through pagehide.
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 9 UPI');
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'kids', dob: '2018-08-08' });
      await page.click('#upi-open');
      await page.waitForTimeout(400);
      const txt = await page.textContent('#upi-apps');
      check('UPI: the list says to type ₹500 and what to do if the app shows a limit error', txt.includes('Type the amount yourself: ₹500') && txt.includes('no money has been taken'));
      await page.locator('#upi-apps').screenshot({ path: path.join(out, 'r9-upi-apps-iphone.png') });
      // Tap Google Pay without leaving the page (the app can't open here).
      await page.evaluate(() => { const a = document.querySelector('#upi-apps .pay__app'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
      await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      check('UPI: tapping an app copies the UPI ID', clip === 'achuisr1985.27-1@okhdfcbank', clip);
      // iPhone may fire pagehide when Safari goes to the background: the hold must stay.
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
      await page.waitForTimeout(600);
      const st = await api('/__state');
      check('UPI: the seat stays held through pagehide after tapping an app (the family is paying)', Object.keys(st.holds.kids || {}).length === 1, JSON.stringify(st.holds));
      done();
      await ctx.close();
    }

    // 21e. Sub-pages: an indigo title band under a see-through menu bar, frosted once scrolled.
    for (const width of [320, 390, 768, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, ...(width < 768 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
      const page = await ctx.newPage();
      const done = watch(page, `Round 9 privacy band ${width}`);
      await page.goto(`${SITE}privacy/`);
      await page.waitForTimeout(800);
      const top = await page.evaluate(() => {
        const nav = document.getElementById('nav');
        const band = document.querySelector('.page-hero');
        const b = band.getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        const link = nav.querySelector('.nav__wordmark');
        return { stuck: nav.classList.contains('is-stuck'), navBg: getComputedStyle(nav).backgroundColor, bandBg: getComputedStyle(band).backgroundColor, bandTop: b.top, bandBottom: b.bottom, navBottom: n.bottom, h1: band.querySelector('h1')?.textContent, word: getComputedStyle(link).color, wordShown: getComputedStyle(link).opacity };
      });
      check(`Privacy ${width}px: an indigo title band sits under the menu bar, which is see-through at the top`, !top.stuck && top.navBg === 'rgba(0, 0, 0, 0)' && top.bandBg === 'rgb(24, 14, 85)' && top.bandTop === 0 && top.bandBottom > top.navBottom + 120 && top.h1 === 'Privacy notice' && top.word === 'rgb(245, 245, 245)' && top.wordShown === '1', JSON.stringify(top));
      await page.screenshot({ path: path.join(out, `r9-privacy-top-${width}.png`) });
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1200);
      check(`Privacy ${width}px: once scrolled, the menu bar is frosted indigo`, await page.evaluate(() => document.getElementById('nav').classList.contains('is-stuck')));
      await page.screenshot({ path: path.join(out, `r9-privacy-scrolled-${width}.png`) });
      if (width < 768) {
        await page.click('#menu-open');
        await page.waitForSelector('#menu[open]');
        await page.waitForTimeout(1500);
        check(`Privacy ${width}px: the phone menu still opens`, await page.isVisible('#menu .menu__links'));
        await page.screenshot({ path: path.join(out, `r9-privacy-menu-${width}.png`) });
      }
      if (width === 1280) await axe(page, 'Privacy page with title band');
      done();
      await ctx.close();
    }

    // 22. Round 10.
    // 22a. Gallery: the corners stay rounded through the opening and closing transitions.
    const cornerCase = async (page, label, tap = false) => {
      const press = (sel) => (tap ? page.tap(sel) : page.click(sel));
      const opened = await cornerFrames(page, () => press('.car__item.is-active .car__btn'), `${label}-open`);
      check(`Corners ${label}: rounded throughout the opening transition (10, 25, 50, 75%)`, roundedOk(opened), JSON.stringify(opened.frames));
      const radii = opened.frames.map((fr) => fr.r);
      check(`Corners ${label}: the radius eases from the thumbnail's 32 px to the view's 24 px`, radii[0] > 30 && radii.at(-1) < 26 && radii.every((r, k) => k === 0 || r <= radii[k - 1] + 0.01), radii.join(' '));
      const closed = await cornerFrames(page, () => page.keyboard.press('Escape'), `${label}-close`);
      check(`Corners ${label}: rounded throughout the closing transition`, roundedOk(closed), JSON.stringify(closed.frames));
      await page.waitForTimeout(400);
    };
    for (const width of [1280, 1440, 1920]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 1920 ? 1080 : 900 } });
      const page = await ctx.newPage();
      const done = watch(page, `Round 10 corners ${width}`);
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await cornerCase(page, `photo-${width}`);
      if (width === 1440) {
        await toGalleryItem(page, 'video');
        await cornerCase(page, 'video-1440');
      }
      done();
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 corners phone');
      await page.goto(`${SITE}#gallery`);
      await enter(page, '#enter-silent', true);
      await page.waitForTimeout(1200);
      await page.locator('#carousel').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await cornerCase(page, 'photo-390', true);
      done();
      await ctx.close();
    }
    {
      // Windows-style classic scrollbars (see 20a).
      const b2 = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], ignoreDefaultArgs: ['--hide-scrollbars'] });
      const ctx = await b2.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 corners, real scrollbars');
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await cornerCase(page, 'scrollbars-1440');
      done();
      await ctx.close();
      await b2.close();
    }
    {
      // Browsers without view transitions: the GSAP fallback keeps the thumbnail's corners too.
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => { delete Document.prototype.startViewTransition; });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 corners, GSAP fallback');
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await page.click('.car__item.is-active .car__btn');
      const seen = [];
      for (let k = 0; k < 6; k++) {
        await page.waitForTimeout(90);
        seen.push(await page.evaluate(() => { const el = document.querySelector('#lightbox-stage .lightbox__item > *'); const cs = getComputedStyle(el); return Math.round(parseFloat(cs.borderTopLeftRadius) * new DOMMatrix(cs.transform).a * 10) / 10; }));
      }
      check('Corners, GSAP fallback: the moving item looks rounded (24 to 32 px) all the way', seen.every((r) => r >= 23 && r <= 33), seen.join(' '));
      await page.waitForTimeout(800);
      check('Corners, GSAP fallback: ends at the view\'s 24 px', await page.evaluate(() => getComputedStyle(document.querySelector('#lightbox-stage .lightbox__item > *')).borderTopLeftRadius) === '24px');
      await page.keyboard.press('Escape');
      const back = [];
      for (let k = 0; k < 5; k++) {
        await page.waitForTimeout(110);
        back.push(await page.evaluate(() => { const el = document.querySelector('#lightbox-stage .lightbox__item > *'); if (!el) return null; const cs = getComputedStyle(el); return Math.round(parseFloat(cs.borderTopLeftRadius) * new DOMMatrix(cs.transform).a * 10) / 10; }));
      }
      check('Corners, GSAP fallback: rounded all the way back to the thumbnail', back.filter((r) => r !== null).every((r) => r >= 23 && r <= 33), back.join(' '));
      done();
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 reduced motion');
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.click('.car__item.is-active .car__btn');
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => ({ open: document.getElementById('lightbox').open, vt: document.getAnimations().some((a) => /view-transition/.test(a.effect?.pseudoElement || '')) }));
      check('Reduced motion: the view opens at once, without a transition', r.open && !r.vt, JSON.stringify(r));
      const cap0 = await page.textContent('#lightbox-cap');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(80);
      const items = await lbItems(page);
      check('Reduced motion: arrow keys change the item at once (no slide, no fade)', items.length === 1 && items[0].o === 1 && items[0].x === 0 && (await page.textContent('#lightbox-cap')) !== cap0, JSON.stringify(items));
      done();
      await ctx.close();
    }

    // 22b. Gallery: the item moving out fades out and the one moving in fades in.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 fade');
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await page.click('.car__item.is-active .car__btn');
      await page.waitForTimeout(900);
      await settled(page).catch(() => {});
      const cap0 = await page.textContent('#lightbox-cap');
      const mb = await page.locator('#lightbox-stage .lightbox__item > *').boundingBox();
      const y = mb.y + mb.height / 2;
      const x0 = mb.x + mb.width / 2;
      // Mid-drag: opacity follows the distance.
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let k = 1; k <= 10; k++) { await page.mouse.move(x0 - k * 5, y); await page.waitForTimeout(30); }
      let it = await lbItems(page);
      let cur = it.find((m) => !m.side);
      let side = it.find((m) => m.side);
      const d = side ? side.x - cur.x : 0; // span between the two
      const want = 1 - 50 / d;
      check('Fade, mid-drag: the current item is fading out and the next fading in, by the distance moved', it.length === 2 && Math.abs(cur.o - want) < 0.02 && Math.abs(side.o - (1 - want)) < 0.02, `${JSON.stringify(it)} want ${want.toFixed(3)}`);
      await page.screenshot({ path: path.join(out, 'r10-fade-drag-1440.png') });
      // Short drag: springs back, opacity restored.
      await page.mouse.up();
      await page.waitForTimeout(120);
      const back = await lbItems(page);
      const backCur = back.find((m) => !m.side);
      check('Fade, spring-back: the item comes back to full opacity as it moves back', backCur && backCur.o > cur.o, JSON.stringify(back));
      await page.waitForTimeout(800);
      it = await lbItems(page);
      check('Fade, spring-back: one item left, fully opaque, same item', it.length === 1 && it[0].o === 1 && (await page.textContent('#lightbox-cap')) === cap0, JSON.stringify(it));
      // Long drag: commits; the outgoing fades to 0, the incoming to 1.
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let k = 1; k <= 20; k++) { await page.mouse.move(x0 - k * 25, y); await page.waitForTimeout(16); }
      await page.waitForTimeout(200);
      const before = await lbItems(page);
      await page.mouse.up();
      await page.waitForTimeout(150);
      const fin = await lbItems(page);
      const out1 = fin.find((m) => m.leaving);
      const in1 = fin.find((m) => !m.leaving);
      check('Fade, finishing a drag: the outgoing item keeps fading out and the incoming keeps fading in', fin.length === 2 && out1 && in1 && out1.o < before.find((m) => !m.side).o && in1.o > before.find((m) => m.side).o, `${JSON.stringify(before)} -> ${JSON.stringify(fin)}`);
      await page.waitForTimeout(800);
      it = await lbItems(page);
      const cap1 = await page.textContent('#lightbox-cap');
      check('Fade, after the drag: one item, fully opaque, the next item', it.length === 1 && it[0].o === 1 && it[0].x === 0 && cap1 !== cap0, JSON.stringify(it));
      // Arrow key and buttons: both fade together during the full-width slide.
      for (const [how, act] of [['arrow key', () => page.keyboard.press('ArrowRight')], ['next button', () => page.click('#lightbox-next')], ['previous button', () => page.click('#lightbox-prev')]]) {
        await act();
        await page.waitForTimeout(330);
        const mid = await lbItems(page);
        const o = mid.find((m) => m.leaving);
        const n = mid.find((m) => !m.leaving);
        check(`Fade, ${how}: half-way, the outgoing item is fading out while the incoming fades in`, mid.length === 2 && o && n && o.o > 0.05 && o.o < 0.95 && n.o > 0.05 && n.o < 0.95, JSON.stringify(mid));
        if (how === 'arrow key') await page.screenshot({ path: path.join(out, 'r10-fade-key-1440.png') });
        await page.waitForTimeout(700);
        const end = await lbItems(page);
        check(`Fade, ${how}: ends with one fully opaque item`, end.length === 1 && end[0].o === 1, JSON.stringify(end));
      }
      done();
      await ctx.close();
    }
    {
      // A video: dragging (fading) doesn't pause it; finishing the move pauses it, as before.
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 fade video');
      await page.goto(`${SITE}#gallery`);
      await enter(page);
      await page.waitForTimeout(900);
      await page.locator('.car__item.is-active .car__btn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await toGalleryItem(page, 'video');
      await page.click('.car__item.is-active .car__btn');
      await page.waitForTimeout(1000);
      await settled(page).catch(() => {});
      await page.evaluate(() => { const v = document.querySelector('#lightbox-stage video'); v.muted = true; return v.play().catch(() => {}); });
      await page.waitForTimeout(400);
      const mb = await page.locator('#lightbox-stage video').boundingBox();
      const y = mb.y + mb.height / 3;
      const x0 = mb.x + mb.width / 2;
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let k = 1; k <= 10; k++) { await page.mouse.move(x0 - k * 8, y); await page.waitForTimeout(30); }
      const v1 = await page.evaluate(() => { const v = document.querySelector('#lightbox-stage .lightbox__item:not(.is-side) video'); return { paused: v.paused, o: Number(getComputedStyle(v.parentElement).opacity) }; });
      check('Fade, video: while dragged (and fading) it keeps playing', !v1.paused && v1.o < 1, JSON.stringify(v1));
      for (let k = 11; k <= 30; k++) { await page.mouse.move(x0 - k * 20, y); await page.waitForTimeout(16); }
      await page.waitForTimeout(200);
      await page.mouse.up();
      await page.waitForTimeout(100);
      const v2 = await page.evaluate(() => { const v = document.querySelector('#lightbox-stage .lightbox__item.is-leaving video'); return v ? v.paused : null; });
      check('Fade, video: once the move is finished the outgoing video is paused', v2 === true, String(v2));
      await page.waitForTimeout(900);
      done();
      await ctx.close();
    }

    // 22c. A PDF the server refuses for good (e.g. "too late") is not promised "next time".
    {
      await api('/__reset', {});
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const done = watch(page, 'Round 10 PDF refused', { ignore: /registration PDF refused/ });
      await page.route(`${API}/**`, async (route) => {
        const body = route.request().postData() || '';
        if (route.request().method() === 'POST' && body.includes('"action":"pdf"')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'too_late' }) });
        return route.fallback();
      });
      await page.goto(SITE);
      await enter(page);
      await page.click('.hero__cta [data-open-register]');
      await fillToPayment(page, { cat: 'youth', dob: '2013-02-02' });
      await page.setInputFiles('#f-shot', shotPng);
      await page.waitForSelector('#shot-preview:not([hidden])');
      await page.click('#reg-submit');
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 15000 });
      const note = await waitFor(() => page.evaluate(() => { const el = document.getElementById('done-copy'); return !el.classList.contains('is-saving') && { hidden: el.hidden, text: el.textContent.trim() }; }), 20000);
      check('PDF refused by the server: the success screen does not say it will be sent next time', note && note.hidden && !/next time/.test(note.text), JSON.stringify(note));
      done();
      await ctx.close();
    }
  } finally {
    await browser.close();
    site.close();
    backend.server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
