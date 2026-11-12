// Renders public/og-image.jpg (1200x630, the link preview image) in headless Chrome.
// Run after changing the theme or dates: node scripts/make-og-image.mjs
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fonts are inlined because a page set with setContent cannot read local files.
const font = (p) => `data:font/woff2;base64,${readFileSync(path.join(root, 'node_modules/@fontsource', p)).toString('base64')}`;
const html = `<!doctype html><html><head><style>
@font-face { font-family: Anton; src: url(${font('anton/files/anton-latin-400-normal.woff2')}); }
@font-face { font-family: Poppins; font-weight: 500; src: url(${font('poppins/files/poppins-latin-500-normal.woff2')}); }
@font-face { font-family: Poppins; font-weight: 600; src: url(${font('poppins/files/poppins-latin-600-normal.woff2')}); }
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#180E55;color:#F5F5F5;font-family:Poppins}
.bg{position:absolute;inset:0;background:radial-gradient(50% 60% at 50% 92%,rgba(255,246,255,.42),rgba(230,30,123,.2) 45%,transparent 72%),repeating-conic-gradient(from 270deg at 50% 92%,rgba(230,30,123,.16) 0deg 3deg,transparent 3deg 9deg,rgba(248,156,56,.14) 9deg 12deg,transparent 12deg 18deg,rgba(252,241,40,.12) 18deg 21deg,transparent 21deg 27deg,rgba(145,234,67,.12) 27deg 30deg,transparent 30deg 36deg,rgba(12,170,228,.14) 36deg 39deg,transparent 39deg 45deg,rgba(131,25,209,.16) 45deg 48deg,transparent 48deg 54deg)}
svg{position:absolute;left:0;bottom:0}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding-bottom:40px}
.l{font-weight:600;letter-spacing:.24em;font-size:22px;border:1px solid rgba(245,245,245,.3);border-radius:999px;padding:8px 24px}
h1{margin:0;font-family:Anton;font-weight:400;font-size:176px;line-height:.95;text-shadow:0 0 48px rgba(255,244,228,.35)}
h1 b{color:#E61E7B;font-weight:400}
.s{font-weight:500;font-size:40px}
.d{font-weight:500;font-size:24px;color:rgba(245,245,245,.85)}
</style></head><body><div class="bg"></div>
<svg width="1200" height="260" viewBox="0 0 1200 260"><path d="M0 120 L120 80 L230 112 L340 50 L450 100 L560 30 L640 76 L760 20 L880 90 L980 56 L1100 104 L1200 70 V260 H0Z" fill="#2A1A78"/><path d="M0 190 L140 150 L260 186 L380 136 L520 180 L640 140 L780 190 L920 146 L1060 188 L1200 156 V260 H0Z" fill="#180E55"/></svg>
<div class="c"><div class="l">WINTER CAMP 2027</div><h1><b>I</b>LLUMINATE</h1><div class="s">Light of the World</div>
<div class="d">Youth 4 to 6 Jan · Kids 11 to 13 Jan · McLeodganj · Kid's Happy Club</div></div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot();
await browser.close();
await writeFile(path.join(root, 'public/og-image.jpg'), await sharp(png).jpeg({ quality: 82 }).toBuffer());
console.log('public/og-image.jpg written');
