// Draws the full registration as an A4 PDF in the browser, so Tibetan text is
// shaped by the browser with the site's own fonts. Each page is drawn on a canvas
// and stored in the PDF as a JPEG image (no PDF library needed). The same file is
// downloaded or shared by the family and sent to the organisers' private Drive.
import '@fontsource/jomolhari/tibetan-400.css';

const DPI = 150;
const W = 1240; // A4 at 150 dpi
const H = 1754;
const M = 96; // page margin
const FOOT = 120; // space kept for the footer
const PT = 72 / DPI; // canvas px -> PDF points

const C = { dark: '#1C1C1C', light: '#E9ECEF', red: '#E3171A', text: '#111111', muted: '#4A4A4A', line: '#D4D8DC', onDark: '#F5F5F5' };
const hasBo = (s) => /[ༀ-࿿]/.test(s);

// Tibetan has no spaces between words: break after the tsheg (་) or shad (།).
function wrap(ctx, text, maxWidth) {
  const out = [];
  String(text).split('\n').forEach((para) => {
    const parts = hasBo(para) ? para.match(/[^་།\s]+[་།]*\s*|\s+/g) || [para] : para.split(/(\s+)/);
    let line = '';
    parts.forEach((p) => {
      const next = line + p;
      if (ctx.measureText(next.trim()).width > maxWidth && line.trim()) {
        out.push(line.trim());
        line = p.trimStart();
        // A single word longer than the line: cut it by characters.
        while (ctx.measureText(line).width > maxWidth && line.length > 1) {
          let n = line.length - 1;
          while (n > 1 && ctx.measureText(line.slice(0, n)).width > maxWidth) n -= 1;
          out.push(line.slice(0, n));
          line = line.slice(n);
        }
      } else line = next;
    });
    out.push(line.trim());
  });
  return out;
}

async function loadImage(src) {
  if (!src) return null;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try { await img.decode(); return img; } catch { return null; }
}

/**
 * data: { lang, ref, submittedAt, sections: [{ title, rows: [[label, value]], signature?, typed? }],
 *         payment: { rows: [[label, value]], screenshot: dataUrl }, labels: { title, page, contact, screenshot, signature } }
 * Returns a Blob of type application/pdf.
 */
export async function buildRegistrationPdf(data) {
  const bo = data.lang === 'bo';
  const body = bo ? "'Jomolhari', 'Poppins', sans-serif" : "'Poppins', 'Jomolhari', sans-serif";
  const lh = bo ? 1.8 : 1.5;
  // Jomolhari looks much smaller than Poppins at the same size, so Tibetan pages use larger text.
  const k = bo ? 1.2 : 1;
  const px = (n) => Math.round(n * k);
  if (document.fonts) {
    await Promise.all([
      document.fonts.load("400 40px 'Anton'"),
      document.fonts.load("400 28px 'Poppins'"),
      document.fonts.load("600 28px 'Poppins'"),
      document.fonts.load("400 28px 'Jomolhari'", 'ཀ'),
    ]).catch(() => {});
  }
  const [sig, shot] = await Promise.all([loadImage(data.signature), loadImage(data.payment.screenshot)]);

  const pages = [];
  let ctx;
  let y;
  const contentW = W - 2 * M;

  function newPage() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    // Dark band with the ILLUMINATE wordmark, as on the site.
    const band = pages.length ? 112 : 232;
    ctx.fillStyle = C.dark;
    ctx.fillRect(0, 0, W, band);
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 ${pages.length ? 44 : 72}px 'Anton', sans-serif`;
    const word = 'ILLUMINATE';
    const base = pages.length ? 76 : 116;
    ctx.fillStyle = C.red;
    ctx.fillText(word[0], M, base);
    ctx.fillStyle = C.onDark;
    ctx.fillText(word.slice(1), M + ctx.measureText(word[0]).width + 2, base);
    ctx.font = "500 24px 'Poppins', sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText('Winter Camp 2027', W - M, base - (pages.length ? 6 : 36));
    ctx.textAlign = 'left';
    if (!pages.length) {
      ctx.font = `400 34px ${body}`;
      ctx.fillStyle = C.onDark;
      ctx.fillText(data.labels.title, M, 190);
      ctx.font = `400 24px ${body}`;
      ctx.textAlign = 'right';
      ctx.fillText(data.ref, W - M, 190);
      ctx.textAlign = 'left';
    }
    pages.push(c);
    y = band + 56;
  }
  const room = (h) => { if (y + h > H - FOOT) newPage(); };

  // Height of a label/value row, so a heading is never left alone at a page end.
  function rowHeight(label, value) {
    ctx.font = `400 ${px(22)}px ${body}`;
    const a = wrap(ctx, label, contentW).length * px(22) * lh;
    ctx.font = `400 ${px(28)}px ${body}`;
    return a + Math.min(3, wrap(ctx, value, contentW).length) * px(28) * lh + 24;
  }
  function heading(text, first) {
    room(120 + (first ? rowHeight(first[0], first[1]) : 0));
    y += 16;
    ctx.fillStyle = C.red;
    ctx.fillRect(M, y - 26, 8, 32);
    ctx.font = `${bo ? 400 : 600} ${px(30)}px ${body}`;
    ctx.fillStyle = C.text;
    ctx.fillText(text, M + 24, y);
    y += 24;
    ctx.fillStyle = C.line;
    ctx.fillRect(M, y, contentW, 2);
    y += 40;
  }

  function row(label, value) {
    ctx.font = `400 ${px(22)}px ${body}`;
    const labelLines = wrap(ctx, label, contentW);
    ctx.font = `400 ${px(28)}px ${body}`;
    const valueLines = wrap(ctx, value, contentW);
    const lh1 = px(22) * lh;
    const lh2 = px(28) * lh;
    room(labelLines.length * lh1 + Math.min(3, valueLines.length) * lh2 + 24);
    ctx.fillStyle = C.muted;
    ctx.font = `400 ${px(22)}px ${body}`;
    labelLines.forEach((l) => { ctx.fillText(l, M, y); y += lh1; });
    ctx.fillStyle = C.text;
    ctx.font = `400 ${px(28)}px ${body}`;
    y += 4;
    valueLines.forEach((l) => { room(lh2); ctx.fillText(l, M, y); y += lh2; });
    y += 20;
  }

  function image(img, maxW, maxH, label) {
    if (!img) return;
    const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 2);
    const w = Math.round(img.naturalWidth * s);
    const h = Math.round(img.naturalHeight * s);
    ctx.font = `400 ${px(22)}px ${body}`;
    room(h + px(22) * lh + 40);
    ctx.fillStyle = C.muted;
    ctx.fillText(label, M, y);
    y += px(22) * lh - 12;
    ctx.fillStyle = C.light;
    ctx.fillRect(M, y, w + 32, h + 32);
    ctx.drawImage(img, M + 16, y + 16, w, h);
    y += h + 32 + 32;
  }

  newPage();
  data.sections.forEach((s) => {
    heading(s.title, s.rows[0]);
    s.rows.forEach(([l, v]) => row(l, v));
    if (s.signature) {
      if (sig) image(sig, 640, 220, data.labels.signature);
      else if (s.typed) row(data.labels.signatureTyped, s.typed);
    }
  });

  // Payment on its own page, so the screenshot has room.
  newPage();
  heading(data.payment.title, data.payment.rows[0]);
  data.payment.rows.forEach(([l, v]) => row(l, v));
  if (shot) image(shot, contentW - 32, H - FOOT - y - 120, data.labels.screenshot);

  // Footers, now that the page count is known.
  pages.forEach((c, i) => {
    const g = c.getContext('2d');
    g.fillStyle = C.line;
    g.fillRect(M, H - FOOT + 24, contentW, 2);
    g.fillStyle = C.muted;
    g.font = `400 20px ${body}`;
    g.fillText(data.labels.contact, M, H - 56);
    g.textAlign = 'right';
    g.fillText(data.labels.page.replace('{n}', String(i + 1)).replace('{total}', String(pages.length)), W - M, H - 56);
    g.textAlign = 'left';
  });

  const jpegs = await Promise.all(pages.map((c) => new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.86);
  })));
  return new Blob([writePdf(jpegs, data.labels.title)], { type: 'application/pdf' });
}

// A minimal PDF 1.4 file: one full-page JPEG image per page.
export function writePdf(jpegs, title = '') {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => { const b = typeof part === 'string' ? enc.encode(part) : part; chunks.push(b); length += b.length; };
  const obj = (n, parts) => { offsets[n] = length; push(`${n} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); };

  const pw = (W * PT).toFixed(2);
  const ph = (H * PT).toFixed(2);
  const n = jpegs.length;
  // 1 catalog, 2 pages, 3 info, then for page i: page 4+3i, content 5+3i, image 6+3i.
  const kids = jpegs.map((_, i) => `${4 + 3 * i} 0 R`).join(' ');
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`]);
  // Title as UTF-16BE hex so Tibetan titles survive.
  const hex = ['FEFF', ...[...title].flatMap((ch) => {
    const cp = ch.codePointAt(0);
    if (cp < 0x10000) return [cp.toString(16).padStart(4, '0')];
    const v = cp - 0x10000;
    return [(0xd800 + (v >> 10)).toString(16), (0xdc00 + (v & 0x3ff)).toString(16)];
  })].join('').toUpperCase();
  obj(3, [`<< /Title <${hex}> /Producer (Winter Camp 2027 website) >>`]);
  jpegs.forEach((jpg, i) => {
    const p = 4 + 3 * i;
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(p, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`]);
    obj(p + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(p + 2, [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  });
  const total = 4 + 3 * n;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let o = 0;
  chunks.forEach((c) => { out.set(c, o); o += c.length; });
  return out;
}
