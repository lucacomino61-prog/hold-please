// Tiny WebAudio synth for the few sounds the game needs. No files.
import { settings } from './state';

let ctx: AudioContext | null = null;
let sirenNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
let holdTimer: ReturnType<typeof setInterval> | undefined;
let radioTimer: ReturnType<typeof setInterval> | undefined;

function ac(): AudioContext | null {
  if (!settings.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, slide = 0): void {
  const c = ac(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + when);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + when + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + when);
  o.stop(c.currentTime + when + dur + 0.05);
}

export const sfx = {
  unlock(): void { ac(); },
  click(): void { tone(900, 0.03, 'square', 0.05); },
  ring(): void { for (let i = 0; i < 2; i++) { tone(880, 0.12, 'sine', 0.12, i * 0.18); tone(1120, 0.12, 'sine', 0.1, i * 0.18 + 0.06); } },
  answer(): void { tone(660, 0.08, 'sine', 0.15); tone(990, 0.1, 'sine', 0.12, 0.09); },
  hangup(): void { tone(440, 0.12, 'sine', 0.15); tone(330, 0.2, 'sine', 0.12, 0.13); },
  cash(): void { tone(1047, 0.08, 'triangle', 0.18); tone(1319, 0.08, 'triangle', 0.18, 0.08); tone(1568, 0.16, 'triangle', 0.2, 0.16); },
  bad(): void { tone(200, 0.25, 'sawtooth', 0.12, 0, -120); },
  alert(): void { tone(1200, 0.06, 'square', 0.08); tone(1200, 0.06, 'square', 0.08, 0.1); },
  boom(): void {
    const c = ac(); if (!c) return;
    const len = c.sampleRate * 1.2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = 0.5;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    s.connect(f).connect(g).connect(c.destination); s.start();
  },
  siren(on: boolean): void {
    const c = ac(); if (!c) return;
    if (!on) { if (sirenNode) { sirenNode.gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3); const n = sirenNode; setTimeout(() => { n.osc.stop(); n.lfo.stop(); }, 400); sirenNode = null; } return; }
    if (sirenNode) return;
    const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 700;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.9;
    const lg = c.createGain(); lg.gain.value = 250;
    lfo.connect(lg).connect(osc.frequency);
    const gain = c.createGain(); gain.gain.value = 0.08;
    osc.connect(gain).connect(c.destination);
    osc.start(); lfo.start();
    sirenNode = { osc, gain, lfo };
  },
  jackpot(): void { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.15, 'triangle', 0.18, i * 0.09)); },
  // the office radio: a slow lo-fi loop (four soft chords, a muffled kick, a brushed hat) for the break-room TV
  radio(on: boolean): void {
    if (!on) { clearInterval(radioTimer); radioTimer = undefined; return; }
    if (radioTimer) return;
    const chords = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 349.2]];
    let beat = 0;
    const step = () => {
      const c = ac(); if (!c) return;
      const bar = Math.floor(beat / 8) % 4;
      if (beat % 8 === 0) for (const f of chords[bar]) tone(f, 2.6, 'triangle', 0.028, 0.05 * Math.random());
      if (beat % 2 === 0) tone(55, 0.2, 'sine', 0.12, 0, -20);
      // the hat: a short burst of filtered noise
      const len = Math.floor(c.sampleRate * 0.03); const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * (beat % 2 ? 0.5 : 0.25);
      const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000; const g = c.createGain(); g.gain.value = 0.06;
      src.connect(f).connect(g).connect(c.destination); src.start();
      beat++;
    };
    step();
    radioTimer = setInterval(step, 415);
  },
  radioOn(): boolean { return !!radioTimer; },
  // the hold music: a tinny four-note loop while somebody waits on the other line
  hold(on: boolean): void {
    if (!on) { clearInterval(holdTimer); holdTimer = undefined; return; }
    if (holdTimer) return;
    let i = 0;
    const play = () => { const n = [392, 494, 587, 494][i++ % 4]; tone(n, 0.28, 'triangle', 0.05); tone(n / 2, 0.28, 'sine', 0.03); };
    play();
    holdTimer = setInterval(play, 420);
  },
  type(): void { tone(1800 + Math.random() * 400, 0.015, 'square', 0.03); },
  /** the lift: a soft tick per floor, a low hum while it climbs, the two-note chime at the door */
  liftTick(): void { tone(540, 0.03, 'sine', 0.04); },
  liftHum(ms: number): void { tone(98, ms / 1000, 'sine', 0.035); },
  ding(): void { tone(1319, 0.6, 'sine', 0.14); tone(1047, 0.9, 'sine', 0.12, 0.28); },
  slap(): void { tone(180, 0.08, 'square', 0.25, 0, -100); tone(90, 0.15, 'sawtooth', 0.2, 0.02); },
  throwIt(): void { tone(500, 0.12, 'sine', 0.08, 0, 300); },
  clink(): void { tone(2200, 0.06, 'triangle', 0.12); tone(1800, 0.1, 'triangle', 0.08, 0.05); },
  honk(): void { tone(620, 0.09, 'sawtooth', 0.18, 0, -80); tone(520, 0.14, 'square', 0.12, 0.08, -60); },
  fart(): void { for (let i = 0; i < 5; i++) tone(95 + Math.random() * 40, 0.1, 'sawtooth', 0.22, i * 0.09, -30); tone(70, 0.3, 'sawtooth', 0.18, 0.45, -40); },
  trickle(on: boolean): void {
    const c = ac(); if (!c) return;
    if (!on) { if (sirenNode) return; return; }
    const len = c.sampleRate * 0.4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.3 * Math.sin(i / 40);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0.25;
    s.connect(f).connect(g).connect(c.destination); s.start();
  },
};
