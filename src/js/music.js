// Calm background music, composed in code and rendered once with an
// OfflineAudioContext (no audio files to download).
//
// The piece is 8 bars of slow chords with a soft bell melody and reverb. It is
// rendered with a few extra seconds of tail; that tail is then added back onto
// the start of the buffer, so when the buffer loops, the notes still ringing at
// the end carry over into the beginning and there is no seam or click.

const BPM = 60;
const BEAT = 60 / BPM;
const BARS = 8;
const LOOP = BARS * 4 * BEAT; // 32 s
const TAIL = 6;

// Seeded random, so the melody is the same every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// D major, gentle: Dmaj7, Bm7, Gmaj7, A(sus4), each for 2 bars.
const CHORDS = [
  { root: 38, notes: [62, 66, 69, 73] },
  { root: 35, notes: [59, 62, 66, 69] },
  { root: 31, notes: [59, 62, 66, 67] },
  { root: 33, notes: [57, 62, 64, 69] },
];
// D major pentatonic, upper octave, for the bell melody.
const MELODY = [74, 76, 78, 81, 83, 86, 88];

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const r = rng(11 + c);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function pad(ctx, dest, freq, t0, dur, level, pan) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(level, t0 + 2.4);
  g.gain.setValueAtTime(level, t0 + dur - 0.4);
  g.gain.linearRampToValueAtTime(0, t0 + dur + 3.2);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(dest);
  [[-5, 'sine'], [5, 'triangle']].forEach(([detune, type]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const og = ctx.createGain();
    og.gain.value = type === 'sine' ? 0.6 : 0.25;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 3.4);
  });
}

function bell(ctx, dest, freq, t0, level, pan) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(level, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(dest);
  [[1, 1], [2, 0.18], [3.01, 0.05]].forEach(([mult, amp]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + 3.4);
  });
}

export async function renderMusicLoop(sampleRate = 32000) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return null;
  const total = Math.ceil((LOOP + TAIL) * sampleRate);
  const ctx = new OAC(2, total, sampleRate);

  const master = ctx.createGain();
  master.gain.value = 1;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  tone.connect(master).connect(ctx.destination);

  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  dry.connect(tone);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.5, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  verb.connect(wet).connect(tone);
  const bus = ctx.createGain();
  bus.connect(dry);
  bus.connect(verb);

  const r = rng(2027);
  const chordLen = 2 * 4 * BEAT;
  for (let i = 0; i < BARS / 2; i++) {
    const c = CHORDS[i % CHORDS.length];
    const t0 = i * chordLen;
    pad(ctx, bus, hz(c.root), t0, chordLen, 0.16, 0);
    c.notes.forEach((n, k) => pad(ctx, bus, hz(n), t0, chordLen, 0.07, (k - 1.5) * 0.3));
  }
  // Sparse melody: a note on roughly half the beats, moving by small steps.
  let idx = 2;
  for (let beat = 0; beat < BARS * 4; beat++) {
    if (beat % 8 === 7) continue; // breathe at the end of each chord
    if (r() < 0.45) continue;
    idx = Math.max(0, Math.min(MELODY.length - 1, idx + Math.round((r() - 0.5) * 3)));
    const t = beat * BEAT + (r() < 0.3 ? BEAT / 2 : 0);
    bell(ctx, bus, hz(MELODY[idx]), t, 0.05 + r() * 0.03, (r() - 0.5) * 0.6);
  }

  const rendered = await ctx.startRendering();

  // Fold the tail onto the start, then normalise.
  const len = Math.round(LOOP * sampleRate);
  const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate });
  let peak = 0;
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, len));
    for (let i = len; i < src.length; i++) dst[i - len] += src[i];
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(dst[i]));
  }
  if (peak > 0) {
    const k = 0.9 / peak;
    for (let c = 0; c < 2; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] *= k;
    }
  }
  return out;
}
