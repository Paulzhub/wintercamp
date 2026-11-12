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
      await page.click('#reg-next');
      await page.waitForTimeout(400);
      check('Missing signature blocks "Next"', (await page.textContent('#err-signature')).includes('type your name') && await page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((x) => !x.hidden)) === 2);
      await page.click('#sign-mode');
      check('"Type your name instead" shows a name field and hides the drawing box', await page.isVisible('#f-sign-typed') && await page.isHidden('#sign-wrap'));
      await page.fill('#f-sign-typed', 'Dolma Tsering');
      await page.screenshot({ path: path.join(out, 'reg-typed-signature-1280.png') });
      await page.click('#reg-next');
      await page.waitForSelector('#pay-panel:not([hidden])');
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

      // Moving between items: both move together, out and in the same direction, fading.
      await page.tap('.car__item.is-active .car__btn');
      await page.waitForTimeout(900);
      const cap0 = await page.textContent('#lightbox-cap');
      await page.tap('#lightbox-next');
      await page.waitForTimeout(300);
      const both = await page.evaluate(() => [...document.querySelectorAll('#lightbox-stage .lightbox__item')].map((el) => ({ leaving: el.classList.contains('is-leaving'), x: Math.round(new DOMMatrix(getComputedStyle(el).transform).m41), o: Number(getComputedStyle(el).opacity) })));
      const out1 = both.find((b) => b.leaving);
      const in1 = both.find((b) => !b.leaving);
      check('Next: the current item slides left and fades out while the next slides in from the right and fades in, together', both.length === 2 && out1.x < 0 && in1.x > 0 && out1.o > 0.05 && out1.o < 0.95 && in1.o > 0.05 && in1.o < 0.95, JSON.stringify(both));
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
        check(`${width} ${kind}, open with view transition: size and position change over the 0.7 s`, samples.length >= 4 && new Set(ws).size >= 3 && ms.size >= 3, ws.join(','));
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
      const red = (c) => c.r > 180 && c.g < 90 && c.b < 90;
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
      check('Cursor: red over a light section', red(onLight) && onLight.tone === 'light', JSON.stringify(onLight));
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
      check('Cursor: visible inside the registration view, under the mouse, and red', inReg.parent === 'register' && red(inReg) && Math.abs(inReg.at[0] - 310) < 6 && Math.abs(inReg.at[1] - 410) < 6, JSON.stringify(inReg));
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
