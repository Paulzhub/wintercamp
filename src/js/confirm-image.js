// Draws the registration confirmation as a PNG (1080 x 1350, a phone-friendly
// portrait card) for the Save and Share buttons. Drawn in the browser; nothing is
// uploaded or stored.

const W = 1080;
const H = 1350;

function wrap(ctx, text, maxWidth) {
  // Tibetan has no spaces between words: break after the tsheg (་) or shad (།).
  const parts = /[ༀ-࿿]/.test(text) ? text.match(/[^་།\s]+[་།]*\s*|\s+/g) || [text] : text.split(/(\s+)/);
  const lines = [];
  let line = '';
  parts.forEach((p) => {
    const next = line + p;
    if (ctx.measureText(next.trim()).width > maxWidth && line.trim()) {
      lines.push(line.trim());
      line = p.trimStart();
    } else line = next;
  });
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawConfirmation({ lang, labels, rows, ref, issued }) {
  const bo = lang === 'bo';
  const body = bo ? "'Jomolhari', 'Poppins', sans-serif" : "'Poppins', sans-serif";
  const bold = bo ? '400' : '600';
  if (document.fonts) {
    await Promise.all([
      document.fonts.load("400 40px 'Anton'"),
      document.fonts.load(`${bold} 32px ${bo ? "'Jomolhari'" : "'Poppins'"}`),
      document.fonts.load("500 28px 'Poppins'"),
    ]).catch(() => {});
  }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // Dark background with light rising behind a ridge, as on the site.
  ctx.fillStyle = '#1C1C1C';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 420, 20, W / 2, 420, 620);
  glow.addColorStop(0, 'rgba(255,236,214,0.42)');
  glow.addColorStop(0.45, 'rgba(227,23,26,0.12)');
  glow.addColorStop(1, 'rgba(28,28,28,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2c2c2c';
  ctx.beginPath();
  const ridge = [[0, 400], [120, 360], [230, 392], [340, 330], [450, 380], [560, 310], [640, 356], [760, 300], [880, 370], [980, 336], [1080, 380]];
  ctx.moveTo(0, H);
  ridge.forEach(([x, y]) => ctx.lineTo(x, y + 60));
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.fillStyle = '#1C1C1C';
  ctx.fillRect(0, 520, W, H - 520);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Label pill
  ctx.font = "600 28px 'Poppins', sans-serif";
  const label = 'WINTER CAMP 2027';
  ctx.save();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  const lw = ctx.measureText(label).width + 64;
  roundRect(ctx, (W - lw) / 2, 88, lw, 64, 32);
  ctx.strokeStyle = 'rgba(245,245,245,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#F5F5F5';
  ctx.fillText(label, W / 2, 132);
  ctx.restore();

  // ILLUMINATE with a red first letter
  ctx.font = "400 168px 'Anton', Impact, sans-serif";
  const word = 'LLUMINATE';
  const wI = ctx.measureText('I').width;
  const wRest = ctx.measureText(word).width;
  const x0 = (W - wI - wRest) / 2;
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(255,244,228,0.35)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#E3171A';
  ctx.fillText('I', x0, 340);
  ctx.fillStyle = '#F5F5F5';
  ctx.fillText(word, x0 + wI, 340);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.font = "500 40px 'Poppins', sans-serif";
  ctx.fillText('Light of the World', W / 2, 410);

  // Card
  const cx = 72;
  const cw = W - 144;
  const cy = 480;
  const ch = 700;
  roundRect(ctx, cx, cy, cw, ch, 40);
  ctx.fillStyle = '#F5F5F5';
  ctx.fill();

  // Check badge and title
  ctx.fillStyle = '#E3171A';
  ctx.beginPath();
  ctx.arc(cx + 88, cy + 96, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 70, cy + 98);
  ctx.lineTo(cx + 84, cy + 112);
  ctx.lineTo(cx + 108, cy + 82);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111111';
  ctx.font = bo ? `400 44px ${body}` : "400 60px 'Anton', Impact, sans-serif";
  ctx.fillText(bo ? labels.title : labels.title.toUpperCase(), cx + 152, cy + 118);

  // Rows
  let y = cy + 200;
  const keyX = cx + 48;
  const valX = cx + 300;
  const valW = cw - 300 - 48;
  rows.forEach(([k, v], i) => {
    ctx.font = `400 28px ${body}`;
    ctx.fillStyle = '#4a4d50';
    ctx.fillText(k, keyX, y);
    ctx.font = `${bold} 32px ${body}`;
    ctx.fillStyle = '#111111';
    const lines = wrap(ctx, v, valW).slice(0, 3);
    lines.forEach((l, j) => ctx.fillText(l, valX, y + j * (bo ? 50 : 42)));
    y += Math.max(1, lines.length) * (bo ? 50 : 42) + 30;
    if (i < rows.length - 1) {
      ctx.fillStyle = 'rgba(17,17,17,0.12)';
      ctx.fillRect(keyX, y - 54 + 16, cw - 96, 2);
    }
  });

  // Seat note
  ctx.font = `400 26px ${body}`;
  ctx.fillStyle = '#3a3d40';
  const noteLines = wrap(ctx, labels.seat, cw - 96);
  const noteY = cy + ch - 48 - (noteLines.length - 1) * 38;
  noteLines.forEach((l, j) => ctx.fillText(l, keyX, noteY + j * 38));

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#F5F5F5';
  ctx.font = `500 30px ${body}`;
  ctx.fillText(labels.contact, W / 2, 1240);
  ctx.fillStyle = 'rgba(245,245,245,0.75)';
  ctx.font = "500 24px 'Poppins', sans-serif";
  ctx.fillText(`${labels.ref}: ${ref} · ${issued} · Kid's Happy Club`, W / 2, 1290);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}
