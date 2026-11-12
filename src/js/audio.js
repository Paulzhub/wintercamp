// Opt-in sound, generated with the Web Audio API (no audio files to download).
import { prefs } from './prefs.js';
import { $$ } from './i18n.js';

const KEY = 'wc-sound';

export function initAudio() {
  let ctx = null;
  let master = null;
  let ambient = null;
  let enabled = prefs.get(KEY) === 'on';
  let ducked = false;
  let noiseBuf = null;
  const toggles = $$('[data-sound-toggle]');

  const typing = () => {
    const a = document.activeElement;
    return a && (a.matches('input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea, select') || a.isContentEditable);
  };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      ctx.addEventListener('statechange', () => {
        if (enabled && !document.hidden && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
      });
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // Background music: a calm piece rendered once, then looped seamlessly.
  const MUSIC_LEVEL = 0.22;
  let musicBuf = null;
  let musicLoading = null;
  const loadMusic = () => {
    if (!musicLoading) {
      musicLoading = import('./music.js')
        .then((m) => m.renderMusicLoop())
        .then((buf) => { musicBuf = buf; return buf; })
        .catch((err) => { console.warn('Music could not be prepared', err); musicLoading = null; return null; });
    }
    return musicLoading;
  };

  // Scroll position (0 at the top, 1 at the bottom) to filter cutoff: a gentle,
  // muffled start that opens to the full sound by the end of the page.
  let scrollP = 0;
  const cutoff = (p) => 700 * Math.pow(12000 / 700, p);

  async function startAmbient() {
    if (!ensure() || ambient) return;
    const token = {};
    ambient = { token, out: null, src: null };
    const buf = musicBuf || await loadMusic();
    if (!buf || ambient?.token !== token || !enabled) { if (ambient?.token === token) ambient = null; return; }
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(ducked ? 0 : MUSIC_LEVEL, t + 3);
    out.connect(master);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // The music opens up as the page scrolls: a low-pass filter follows the scroll.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(cutoff(scrollP), t);
    src.connect(lp).connect(out);
    ambient.lp = lp;
    src.start(t);
    ambient.out = out;
    ambient.src = src;
  }

  function stopAmbient() {
    if (!ambient) return;
    const a = ambient;
    ambient = null;
    if (!a.out || !ctx) return;
    const t = ctx.currentTime;
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setValueAtTime(a.out.gain.value, t);
    a.out.gain.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(() => { try { a.src.stop(); } catch { /* already stopped */ } a.out.disconnect(); }, 900);
  }

  function tone({ f = 440, to = null, type = 'sine', dur = 0.12, gain = 0.05, at = 0 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise({ from = 400, to = 2400, dur = 0.36, gain = 0.05 }) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  let lastTick = 0;

  function play(name, arg) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    if (typing() && name !== 'chime') return;
    switch (name) {
      case 'tick': {
        const now = performance.now();
        if (now - lastTick < 60) return;
        lastTick = now;
        tone({ f: 1800, type: 'sine', dur: 0.04, gain: 0.018 });
        break;
      }
      case 'click': tone({ f: 620, to: 320, type: 'triangle', dur: 0.09, gain: 0.05 }); break;
      case 'expand': tone({ f: 320, to: 720, type: 'sine', dur: 0.26, gain: 0.04 }); break;
      case 'whoosh': noise({}); break;
      case 'letter': tone({ f: PENTA[arg % PENTA.length], type: 'sine', dur: 0.3, gain: 0.03 }); break;
      case 'rise': PENTA.forEach((f, i) => tone({ f, type: 'sine', dur: 0.36, gain: 0.025, at: i * 0.06 })); break;
      case 'copy': tone({ f: 1200, dur: 0.06, gain: 0.03 }); tone({ f: 1600, dur: 0.08, gain: 0.03, at: 0.07 }); break;
      case 'chime': [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.9, gain: 0.05, at: i * 0.09 })); break;
      case 'low': tone({ f: 330, to: 220, type: 'triangle', dur: 0.5, gain: 0.05 }); break;
      case 'glow': [587.33, 739.99, 880, 1174.66].forEach((f) => tone({ f, type: 'sine', dur: 1.6, gain: 0.03 })); break;
      default: break;
    }
  }

  function render() {
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(enabled)));
  }

  function setEnabled(on, { save = true } = {}) {
    enabled = on;
    if (save) prefs.set(KEY, on ? 'on' : 'off');
    render();
    if (on) {
      if (ensure()) startAmbient();
    } else {
      stopAmbient();
    }
  }

  toggles.forEach((b) =>
    b.addEventListener('click', () => {
      setEnabled(!enabled);
      if (enabled) setTimeout(() => play('click'), 30);
    }),
  );

  // Browsers block sound until the visitor interacts, so a saved "on" starts on the first gesture.
  if (enabled) {
    const kick = () => {
      if (enabled && ensure()) startAmbient();
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('keydown', kick, true);
    };
    window.addEventListener('pointerdown', kick, true);
    window.addEventListener('keydown', kick, true);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) {
      ctx.resume().catch(() => {});
      if (!ambient) startAmbient();
    }
  });

  render();
  return {
    play,
    enable: setEnabled,
    get enabled() { return enabled; },
    stored: () => prefs.get(KEY),
    setScroll(p) {
      scrollP = Math.max(0, Math.min(1, p));
      if (!ambient?.lp || !ctx) return;
      // Glides to the new value (about 0.3 s) rather than jumping.
      ambient.lp.frequency.setTargetAtTime(cutoff(scrollP), ctx.currentTime, 0.1);
    },
    get musicCutoff() { return ambient?.lp ? ambient.lp.frequency.value : null; },
    duck(on) {
      ducked = on;
      if (!ambient?.out || !ctx) return;
      const t = ctx.currentTime;
      ambient.out.gain.cancelScheduledValues(t);
      ambient.out.gain.setValueAtTime(ambient.out.gain.value, t);
      ambient.out.gain.linearRampToValueAtTime(on ? 0 : MUSIC_LEVEL, t + 0.8);
    },
  };
}
