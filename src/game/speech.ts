// Voices in and out, with the browser's own speech APIs. Typing always works without them.
import { settings } from './state';
import type { Caller } from './brain/types';
import { registerFor } from './brain/style';

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

export function stopSpeaking(): void { try { synth?.cancel(); audio?.pause(); } catch { /* ignore */ } }

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

export function canListen(): boolean { return !!RecognitionCtor() && window.isSecureContext; }

let rec: SpeechRecognition | null = null;

export function listenOnce(onInterim?: (text: string) => void): Promise<string> {
  const Ctor = RecognitionCtor();
  if (!Ctor) return Promise.reject(new Error('no speech recognition'));
  stopListening();
  return new Promise((resolve, reject) => {
    const r = new Ctor();
    rec = r;
    r.lang = 'en-US';
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

export function stopListening(): void { try { rec?.stop(); } catch { /* ignore */ } rec = null; }
export function isListening(): boolean { return !!rec; }
