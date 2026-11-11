// Checks an uploaded payment screenshot by its content and shrinks it in the browser.
const SIGS = [
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
];

export function sniffImage(bytes) {
  for (const [type, sig] of SIGS) if (sig.every((b, i) => bytes[i] === b)) return type;
  const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function prepareScreenshot(file, max = 1600, quality = 0.85) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImage(head)) { const e = new Error('type'); e.code = 'shotType'; throw e; }
  let src;
  try { src = await decode(file); } catch { const e = new Error('read'); e.code = 'shotRead'; throw e; }
  const w0 = src.width; const h0 = src.height;
  if (!w0 || !h0) { const e = new Error('read'); e.code = 'shotRead'; throw e; }
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * scale); const h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  if (typeof src.close === 'function') src.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) { const e = new Error('read'); e.code = 'shotRead'; throw e; }
  return { blob, dataUrl: await toDataUrl(blob), type: 'image/jpeg', width: w, height: h };
}
