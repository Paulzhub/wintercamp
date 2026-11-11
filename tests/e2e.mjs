// End-to-end checks in headless Chrome against the built site and the mock backend
// (which runs the real apps-script/Code.gs).
//   WC_APPS_SCRIPT_URL=http://127.0.0.1:8787/exec npm run build && npm run test:e2e
// Screenshots go to test-results/. Set CHROME_PATH if Chrome is elsewhere.
import http from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
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

const api = async (p, body) => (await fetch(API + p, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined })).json();

function watch(page, label) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(u)) problems.push(`external request: ${u}`);
  });
  return () => { check(`${label}: no script errors, CSP violations or third-party requests`, problems.length === 0, problems.slice(0, 4).join(' | ')); };
}

async function enter(page, button = '#enter-silent', tap = false) {
  await page.waitForSelector('.loader.is-ready', { timeout: 8000 });
  if (tap) await page.tap(button); else await page.click(button);
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
      check('canonical + hreflang en/bo/x-default + CSP meta', Boolean(facts.canonical) && ['en', 'bo', 'x-default'].every((h) => facts.hreflang.includes(h)) && facts.csp);
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
      await page.screenshot({ path: path.join(out, 'reg-pay-390.png'), fullPage: false });
      await axe(page, 'Registration: payment step', '#register');
      await page.fill('#f-ref', '412345678901');
      await page.waitForTimeout(5200); // a person takes longer than the 5 s anti-bot minimum
      await page.click('#reg-submit');
      check('Loading state while sending', await page.locator('#reg-submit.is-loading').count() === 1);
      await page.waitForSelector('#reg-done:not([hidden])', { timeout: 10000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, 'reg-done-390.png') });
      check('Confirmation shows name, category, dates', (await page.textContent('#reg-done')).includes('Tenzin Norbu') && (await page.textContent('#done-dates')).includes('11 to 13 January 2027'));
      let st = await api('/__state');
      check('Backend: one row, signature and screenshot saved in Kids folders', st.main.length === 1 && st.files.length === 2 && st.files.every((f) => f.folder.startsWith('Winter Camp 2027/Kids/')), JSON.stringify(st.files.map((f) => [f.folder, f.mime, f.size])));
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
      check('Last-seat message shown exactly, with tap-to-call', lastText === 'Oh No Someone booked the last seat just before you! Kindly contact +91-8219012669' && await page.isVisible('#reg-last a[href="tel:+918219012669"]'), lastText);
      st = await api('/__state');
      check('Backend: late submission saved in "Paid, no seat" with its screenshot', st.overflow.length === 1 && /drive\.google\.com/.test(JSON.stringify(st.overflow[0])));
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
      await page.click('label.choice:has(input[name="consent"][value="no"])');
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
      check('Keyboard: focus starts on "Enter with sound"', await page.evaluate(() => document.activeElement?.id === 'enter-sound'));
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

    // 7. Tibetan page.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const done = watch(page, 'Tibetan /bo/');
      await page.goto(`${SITE}bo/`);
      await enter(page);
      await page.waitForTimeout(1000);
      const bo = await page.evaluate(async () => {
        await document.fonts.ready;
        return { lang: document.documentElement.lang, font: getComputedStyle(document.querySelector('.title')).fontFamily, loaded: [...document.fonts].some((f) => f.family.includes('Jomolhari') && f.status === 'loaded'), lh: getComputedStyle(document.querySelector('.lead')).lineHeight, fs: getComputedStyle(document.querySelector('.lead')).fontSize };
      });
      check('Tibetan: lang="bo", Jomolhari loaded and used, line height about 1.8', bo.lang === 'bo' && bo.font.includes('Jomolhari') && bo.loaded && Math.abs(parseFloat(bo.lh) / parseFloat(bo.fs) - 1.8) < 0.05, JSON.stringify(bo));
      for (let y = 0; y < 10; y++) { await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(150); }
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, 'bo-full-390.png'), fullPage: true });
      await axe(page, 'Tibetan page');
      await page.click('.hero__cta [data-open-register]');
      await page.waitForSelector('.cat [data-seats]:not(:has(.skeleton))');
      await page.screenshot({ path: path.join(out, 'bo-reg-390.png') });
      done();
      await ctx.close();
    }

    // 8. Language toggle remembers the choice.
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(SITE);
      await enter(page);
      await page.click('#nav a[data-lang="bo"]');
      await page.waitForURL(/\/bo\/$/);
      await page.goto(SITE);
      await page.waitForURL(/\/bo\/$/);
      check('Language choice is remembered', page.url().endsWith('/bo/'));
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
