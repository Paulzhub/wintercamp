// Hand-drawn signature pad: finger, stylus or mouse. Strokes are kept as points
// (0..1) so the drawing survives resizing; the export is a fixed-size PNG.
export function initSignature(canvas, wrap, { onChange } = {}) {
  const ctx = canvas.getContext('2d');
  let strokes = [];
  let current = null;
  let dpr = 1;

  const pointCount = () => strokes.reduce((n, s) => n + s.length, 0);
  const hasInk = () => pointCount() >= 4;

  function drawStroke(c, s, w, h, width) {
    if (!s.length) return;
    c.beginPath();
    c.moveTo(s[0].x * w, s[0].y * h);
    if (s.length === 1) {
      c.arc(s[0].x * w, s[0].y * h, width / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    for (let i = 1; i < s.length - 1; i++) {
      const mx = ((s[i].x + s[i + 1].x) / 2) * w;
      const my = ((s[i].y + s[i + 1].y) / 2) * h;
      c.quadraticCurveTo(s[i].x * w, s[i].y * h, mx, my);
    }
    const last = s[s.length - 1];
    c.lineTo(last.x * w, last.y * h);
    c.stroke();
  }

  function paint(c, w, h, width) {
    c.clearRect(0, 0, w, h);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#180E55';
    c.fillStyle = '#180E55';
    c.lineWidth = width;
    strokes.forEach((s) => drawStroke(c, s, w, h, width));
  }

  const redraw = () => paint(ctx, canvas.width, canvas.height, 2.8 * dpr);

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    redraw();
  }

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const changed = () => {
    wrap.classList.toggle('has-ink', hasInk());
    onChange?.(hasInk());
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = [pt(e)];
    strokes.push(current);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    (events.length ? events : [e]).forEach((ev) => current.push(pt(ev)));
    redraw();
  });
  const end = () => {
    if (!current) return;
    current = null;
    changed();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  canvas.tabIndex = -1;

  return {
    resize,
    hasInk,
    clear() {
      strokes = [];
      current = null;
      redraw();
      changed();
    },
    toDataURL() {
      const out = document.createElement('canvas');
      out.width = 900;
      out.height = 300;
      const c = out.getContext('2d');
      paint(c, out.width, out.height, 4);
      // White paper behind the ink.
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  };
}
