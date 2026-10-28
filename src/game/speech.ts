// Voices in and out. Out: the HD voices that run in the browser (voices-hd.ts) once downloaded, else the browser's own
// speech synthesis (or ElevenLabs with the player's key). In: the browser's speech recognition where it has one
// (Chrome, Edge), else the microphone recorded in the page and transcribed by Whisper through the brain proxy, so
// Firefox and Safari can talk too. Typing always works without any of it.
import { settings } from './state';
import type { Caller } from './brain/types';
import { registerFor } from './brain/style';
import { hdState, speakHd, stopHd } from './voices-hd';
import { lang, t } from '../i18n';
import { proxyBase, proxyInfo } from './brain/claude';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// a male or female voice when the character says which, by title or by the drawing; otherwise the id's hash decides
const FEMALE_CUES = /\b(lady|mrs|miss|ms|queen|princess|duchess|countess|empress|madame|madam|aunt|auntie|grandma|grandmother|granny|nonna|teta|mother|mum|sister|daughter|girl|woman|witch|nun|actress|waitress|she|her|hers)\b/i;
const MALE_CUES = /\b(sir|mr|lord|king|prince|duke|count|emperor|uncle|grandpa|grandfather|father|dad|brother|son|boy|man|captain|knight|wizard|monk|actor|waiter|he|his|him)\b/i;
export function inferPrefer(c: Caller): 'male' | 'female' | undefined {
  const t = `${c.name} ${c.gimmick}`;
  if (c.portrait?.earrings || FEMALE_CUES.test(t)) return 'female';
  if (MALE_CUES.test(t)) return 'male';
  return undefined;
}

/** the voice this character speaks with right now: their own settings, shaped by how they talk and by their mood */
export function voiceFor(c: Caller, mood?: number): Caller['voice'] {
  const reg = registerFor(c);
  let pitch = c.voice.pitch, rate = c.voice.rate;
  const prefer = c.voice.prefer ?? inferPrefer(c);
  if (reg === 'flat') { pitch = Math.min(pitch, 0.95); rate = 1.0; }
  else if (reg === 'whisper') rate = Math.min(rate, 0.9);
  else if (reg === 'grand') rate = Math.min(rate, 1.0);
  else if (reg === 'shout') rate = Math.max(rate, 1.05);
  if (mood !== undefined) {
    const k = (mood - 50) / 50;            // −1 … 1
    pitch += k * 0.08;                     // pleased = a touch higher
    rate += mood < 30 ? 0.08 : mood >= 70 ? 0.03 : 0;  // cross = quicker
  }
  return { pitch: clamp(pitch, 0.3, 2), rate: clamp(rate, 0.6, 1.5), ...(prefer ? { prefer } : {}) };
}

const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voices: SpeechSynthesisVoice[] = [];

function loadVoices(): void {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

function hash(s: string): number { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

const FEMALE = /female|woman|zira|susan|hazel|samantha|karen|moira|tessa|fiona|victoria|aria|jenny|sonia|libby|emma|ava|allison|sara|google uk english female|google us english/i;
const MALE = /male|man|david|mark|george|daniel|alex|fred|tom|guy|ryan|james|arthur|google uk english male/i;

function pickVoice(voice: Caller['voice'], id: string): SpeechSynthesisVoice | undefined {
  if (!voices.length) loadVoices();
  if (!voices.length) return undefined;
  let pool = voices;
  if (voice.prefer === 'female') { const f = voices.filter((v) => FEMALE.test(v.name) && !/male\b/i.test(v.name.replace(/female/i, ''))); if (f.length) pool = f; }
  if (voice.prefer === 'male') { const m = voices.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name)); if (m.length) pool = m; }
  return pool[hash(id) % pool.length];
}

// Optional neural voices through ElevenLabs (your own key, stored in this browser only).
const ELEVEN_VOICES = { female: ['21m00Tcm4TlvDq8ikWAM', 'EXAVITQu4vr4xnSDxMaL', 'MF3mGyEYCl7XYWbV9V6O', 'AZnzlk1XvdvUeBnXmlld'], male: ['pNInz6obpgDQGcFmaJgB', 'ErXwobaYiN019PkySvjV', 'TxGEqnHWrfWFTfGW9XjX', 'VR6AewLTigWdFqS9kCoR'] };
let audio: HTMLAudioElement | null = null;
export function elevenKey(): string { try { return localStorage.getItem('hp.eleven') ?? ''; } catch { return ''; } }
export function setElevenKey(k: string): void { try { if (k) localStorage.setItem('hp.eleven', k); else localStorage.removeItem('hp.eleven'); } catch { /* ignore */ } }

async function speakEleven(text: string, voice: Caller['voice'], id: string, onEnd?: () => void): Promise<boolean> {
  const key = elevenKey();
  if (!key) return false;
  const pool = voice.prefer === 'male' ? ELEVEN_VOICES.male : voice.prefer === 'female' ? ELEVEN_VOICES.female : [...ELEVEN_VOICES.female, ...ELEVEN_VOICES.male];
  const vid = pool[hash(id) % pool.length];
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_22050_32`, {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.35, similarity_boost: 0.7, style: 0.4 } }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    audio?.pause();
    audio = new Audio(URL.createObjectURL(blob));
    audio.playbackRate = Math.max(0.8, Math.min(1.3, voice.rate));
    audio.onended = () => { onEnd?.(); };
    await audio.play();
    return true;
  } catch { return false; }
}

export function speak(text: string, voice: Caller['voice'], id: string, onEnd?: () => void): void {
  if (!settings.voiceOut) { onEnd?.(); return; }
  if (elevenKey()) { void speakEleven(text, voice, id, onEnd).then((ok) => { if (!ok) speakLocal(text, voice, id, onEnd); }); return; }
  // the HD voices are English voices: in Albanian or Italian the browser's own voices read better
  if (settings.voices === 'hd' && hdState() === 'ready' && lang() === 'en') {
    try { synth?.cancel(); } catch { /* ignore */ }
    void speakHd(text, voice, id, onEnd).then((ok) => { if (!ok) speakLocal(text, voice, id, onEnd); });
    return;
  }
  speakLocal(text, voice, id, onEnd);
}

function speakLocal(text: string, voice: Caller['voice'], id: string, onEnd?: () => void): void {
  if (!synth) { onEnd?.(); return; }
  try {
    synth.cancel();
    const clean = text.replace(/\([^)]*\)/g, '').replace(/\*[^*]*\*/g, '').trim() || text;
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice(voice, id);
    if (v) u.voice = v;
    u.pitch = Math.max(0.1, Math.min(2, voice.pitch));
    u.rate = Math.max(0.5, Math.min(1.6, voice.rate));
    u.volume = 1;
    if (onEnd) u.onend = onEnd;
    synth.speak(u);
  } catch { onEnd?.(); }
}

export function stopSpeaking(): void { try { synth?.cancel(); audio?.pause(); } catch { /* ignore */ } stopHd(); }

// Minimal typings: lib.dom does not ship the Web Speech recognition interfaces.
interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionResult { isFinal: boolean; readonly length: number; [i: number]: SpeechRecognitionAlternative }
interface SpeechRecognitionEvent extends Event { resultIndex: number; results: { readonly length: number; [i: number]: SpeechRecognitionResult } }
interface SpeechRecognition extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}

function RecognitionCtor(): (new () => SpeechRecognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** the AI ears need the proxy (with its Whisper route), a microphone API and a secure page */
export function aiEarsAvailable(): boolean {
  return !!proxyBase() && proxyInfo()?.stt !== false && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}
function useAiEars(): boolean { return settings.ears === 'ai' || (settings.ears === 'auto' && !RecognitionCtor()); }
export function canListen(): boolean { return useAiEars() ? aiEarsAvailable() : !!RecognitionCtor() && window.isSecureContext; }
/** which ears are listening, for the setup desk and Settings */
export function earsLabel(): string { return useAiEars() ? t('AI (Whisper)') : t('this browser'); }

let rec: SpeechRecognition | null = null;
const recLang = (): string => (lang() === 'sq' ? 'sq-AL' : lang() === 'it' ? 'it-IT' : 'en-US');

export function listenOnce(onInterim?: (text: string) => void): Promise<string> {
  if (useAiEars()) return listenAi(onInterim);
  const Ctor = RecognitionCtor();
  if (!Ctor) return Promise.reject(new Error('no speech recognition'));
  stopListening();
  return new Promise((resolve, reject) => {
    const r = new Ctor();
    rec = r;
    r.lang = recLang();
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
      }
      onInterim?.(final || interim);
    };
    r.onerror = (e: Event & { error?: string }) => { rec = null; reject(new Error(e.error ?? 'speech error')); };
    r.onend = () => { rec = null; resolve(final.trim()); };
    try { r.start(); } catch (e) { rec = null; reject(e as Error); }
  });
}

export function stopListening(): void { try { rec?.stop(); } catch { /* ignore */ } rec = null; aiStop?.(); }
export function isListening(): boolean { return !!rec || !!aiStop; }

// ---- the AI ears: record in the page, cut at the pause, send 16 kHz WAV to Whisper on the proxy ----
let aiStop: (() => void) | null = null;
const SPEECH_RMS = 0.02;    // louder than this counts as talking
const PAUSE_MS = 1400;      // this much quiet after talking ends the line (people pause ~1 s between sentences)
const WAIT_MS = 8000;       // nobody spoke: give up quietly
const MAX_MS = 15000;       // a very long line is sent anyway

function listenAi(onInterim?: (text: string) => void): Promise<string> {
  stopListening();
  if (!aiEarsAvailable()) return Promise.reject(new ListenError('no AI speech recognition', 'service'));
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).catch((e) => { throw new ListenError(String((e as Error)?.message ?? e), 'mic'); }).then((stream) => new Promise<string>((resolve, reject) => {
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(4096, 1, 1);
    const rate = ac.sampleRate;
    let chunks: Float32Array[] = [];
    let talking = false, quiet = 0, total = 0, done = false;
    const finish = (send: boolean): void => {
      if (done) return;
      done = true;
      aiStop = null;
      try { proc.disconnect(); src.disconnect(); } catch { /* ignore */ }
      stream.getTracks().forEach((t) => t.stop());
      void ac.close().catch(() => undefined);
      if (!send || !talking) { resolve(''); return; }
      onInterim?.('…');
      transcribe(chunks, rate).then(resolve, reject);
    };
    aiStop = () => finish(true);   // push-to-talk released: send what there is
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const loud = Math.sqrt(sum / d.length) > SPEECH_RMS;
      const ms = (d.length / rate) * 1000;
      total += ms;
      chunks.push(new Float32Array(d));
      if (!talking && !loud) { if (chunks.length > 3) chunks = chunks.slice(-3); }   // keep a little lead-in only
      if (loud) { if (!talking) onInterim?.(''); talking = true; quiet = 0; } else if (talking) quiet += ms;
      if (talking && quiet > PAUSE_MS) finish(true);
      else if (!talking && total > WAIT_MS) finish(false);
      else if (total > MAX_MS) finish(true);
    };
    src.connect(proc);
    proc.connect(ac.destination);   // the processor only runs when connected; its output stays silent
  }));
}

/** float samples at the context's rate → 16 kHz mono 16-bit WAV, as base64 */
function wav16k(chunks: Float32Array[], rate: number): string {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const step = rate / 16000;
  const n = Math.floor(len / step);
  const pcm = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (at: number, s: string): void => { for (let i = 0; i < s.length; i++) pcm.setUint8(at + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); pcm.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true); pcm.setUint32(24, 16000, true);
  pcm.setUint32(28, 32000, true); pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); str(36, 'data'); pcm.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    // average the source samples that fall into this output sample (a cheap low-pass before dropping the rate)
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let s = 0;
    for (let j = a; j < b && j < len; j++) s += all[j];
    const v = Math.max(-1, Math.min(1, s / (b - a)));
    pcm.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** a listening failure says whose fault it was: the microphone (permission, no device) or the speech service */
export class ListenError extends Error { constructor(message: string, readonly kind: 'mic' | 'service') { super(message); } }
export function listenFailureText(e: unknown): string {
  return e instanceof ListenError && e.kind === 'service'
    ? t('The speech service did not answer in time. Try again, or type.')
    : t('The microphone did not start (permission?). Typing works just as well.');
}

async function transcribe(chunks: Float32Array[], rate: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(proxyBase() + '/v1/stt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: wav16k(chunks, rate), lang: lang() }),
      signal: AbortSignal.timeout(14000),
    });
  } catch (e) { throw new ListenError('speech service unreachable: ' + String((e as Error)?.message ?? e), 'service'); }
  if (!res.ok) throw new ListenError('speech recognition ' + res.status, 'service');
  const j = await res.json() as { text?: string };
  return (j.text ?? '').trim();
}
