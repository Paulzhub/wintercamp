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
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function startAmbient() {
    if (!ensure() || ambient) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(ducked ? 0.008 : 0.03, t + 3);
    out.connect(master);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(out);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    // A soft, open chord: A, E, A, C#, B.
    const oscs = [110, 164.81, 220, 277.18, 246.94].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 2) * 4;
      const g = ctx.createGain();
      g.gain.value = i === 4 ? 0.12 : 0.3;
      o.connect(g).connect(filter);
      o.start();
      return o;
    });
    // Wind: filtered noise that breathes slowly.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.25;
    const wl = ctx.createOscillator();
    const wlg = ctx.createGain();
    wl.frequency.value = 0.08;
    wlg.gain.value = 0.2;
    wl.connect(wlg).connect(wg.gain);
    wind.connect(bp).connect(wg).connect(out);
    wind.start();
    wl.start();
    ambient = { out, nodes: [...oscs, lfo, wind, wl] };
  }

  function stopAmbient() {
    if (!ambient || !ctx) return;
    const a = ambient;
    ambient = null;
    const t = ctx.currentTime;
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setValueAtTime(a.out.gain.value, t);
    a.out.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => a.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 700);
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
    else if (enabled) ctx.resume();
  });

  render();
  return {
    play,
    enable: setEnabled,
    get enabled() { return enabled; },
    stored: () => prefs.get(KEY),
    duck(on) {
      ducked = on;
      if (!ambient || !ctx) return;
      const t = ctx.currentTime;
      ambient.out.gain.cancelScheduledValues(t);
      ambient.out.gain.setValueAtTime(ambient.out.gain.value, t);
      ambient.out.gain.linearRampToValueAtTime(on ? 0 : 0.03, t + 0.8);
    },
  };
}
