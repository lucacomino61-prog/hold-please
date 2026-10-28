// HD caller voices: Kokoro-82M (Apache-2.0) running in the player's browser through kokoro-js and Transformers.js.
// 25 English voices, nothing to pay per line, offline once downloaded, the way the original runs its voices on the
// player's PC. The model (88 MB, q8) comes from Hugging Face once and stays in the browser's cache; each voice is a
// 0.5 MB file fetched the first time somebody speaks with it. Until the model is ready, and for any line it fails on,
// the browser's own voices speak instead (speech.ts decides).
import type { Caller } from './brain/types';

interface RawAudio { audio: Float32Array; sampling_rate: number }
interface Tts { generate(text: string, o: { voice: string; speed?: number }): Promise<RawAudio> }

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const HD_DOWNLOAD_MB = 88;
// the usable voices (grade C or better on the model card, plus a few lower ones for variety)
const FEMALE = ['af_heart', 'af_bella', 'af_nicole', 'af_aoede', 'af_kore', 'af_sarah', 'af_nova', 'af_alloy', 'af_sky', 'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily'];
const MALE = ['am_fenrir', 'am_michael', 'am_puck', 'am_echo', 'am_eric', 'am_liam', 'am_onyx', 'bm_fable', 'bm_george', 'bm_lewis', 'bm_daniel', 'am_adam'];
// the regulars keep one voice: Mr. Krull and Inspector Vane (you, in the review's replay, get one by your body)
const FIXED: Record<string, string> = { krull: 'bm_george', vane: 'bm_lewis' };

export type HdState = 'off' | 'loading' | 'ready' | 'failed';
let state: HdState = 'off';
let progress = 0;
let speedFactor = 0;   // seconds of work per second of speech, measured once the model is up (0 = not yet)
/** seconds of work per second of speech on this computer; above ~1.5 the voice trails the text a little */
export function hdSpeed(): number { return speedFactor; }
let tts: Tts | null = null;
let loading: Promise<boolean> | null = null;
const listeners = new Set<(s: HdState, pct: number) => void>();
const emit = (): void => { for (const f of listeners) f(state, progress); };
export function hdState(): HdState { return state; }
export function hdProgress(): number { return progress; }
/** follow the download; returns the unsubscribe */
export function onHd(fn: (s: HdState, pct: number) => void): () => void { listeners.add(fn); fn(state, progress); return () => listeners.delete(fn); }

/** fetch and start the model once; resolves true when HD voices can speak */
export function loadHd(): Promise<boolean> {
  if (tts) return Promise.resolve(true);
  if (loading) return loading;
  state = 'loading'; progress = 0; emit();
  loading = (async () => {
    try {
      const [{ KokoroTTS }, tf] = await Promise.all([import('kokoro-js'), import('@huggingface/transformers')]);
      // every core when the page is cross-origin isolated (vite.config.ts / public/_headers); one thread otherwise
      const wasm = tf.env.backends.onnx.wasm;
      if (wasm && globalThis.crossOriginIsolated) wasm.numThreads = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
      const files = new Map<string, { loaded: number; total: number }>();
      const model = await KokoroTTS.from_pretrained(MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p: unknown) => {
          const e = p as { status?: string; file?: string; loaded?: number; total?: number };
          if (e.status !== 'progress' || !e.file || !e.total) return;
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
          const all = [...files.values()];
          progress = Math.min(99, Math.round((100 * all.reduce((s, f) => s + f.loaded, 0)) / Math.max(1, all.reduce((s, f) => s + f.total, 0))));
          emit();
        },
      });
      tts = model as unknown as Tts;
      // how long a short line takes to make here, as a multiple of its length (1 = as fast as it plays)
      try { const b = await hdBench('Hello, who is this?'); if (b) speedFactor = +(b.ms / 1000 / Math.max(0.3, b.seconds)).toFixed(2); } catch { /* measured on first use */ }
      state = 'ready'; progress = 100; emit();
      for (const v of Object.values(FIXED)) warmVoice(v);   // Mr. Krull and Inspector Vane speak in every run
      return true;
    } catch (e) {
      console.warn('HD voices did not load', e);
      state = 'failed'; emit();
      loading = null;
      return false;
    }
  })();
  return loading;
}

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** the HD voice a character speaks with: fixed for the regulars, else by their gender and their id */
export function hdVoiceFor(voice: Caller['voice'], id: string): string {
  if (FIXED[id]) return FIXED[id];
  const pool = voice.prefer === 'male' ? MALE : voice.prefer === 'female' ? FEMALE : [...FEMALE, ...MALE];
  return pool[hash(id) % pool.length];
}

// a voice file comes from Hugging Face the first time it speaks, which made a new caller start seconds late; the
// file is fetched ahead instead (while the phone rings, and the regulars' once the model is up) into the cache
// kokoro-js reads itself: Cache Storage "kokoro-voices", keyed by the file's URL
const voiceUrl = (v: string): string => `https://huggingface.co/${MODEL}/resolve/main/voices/${v}.bin`;
const warmed = new Set<string>();
function warmVoice(v: string): void {
  if (warmed.has(v) || typeof caches === 'undefined') return;
  warmed.add(v);
  void (async () => {
    try {
      const store = await caches.open('kokoro-voices');
      const url = voiceUrl(v);
      if (await store.match(url)) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await store.put(url, new Response(await res.arrayBuffer(), { headers: res.headers }));
    } catch { warmed.delete(v); }   // the line fetches it itself, as before
  })();
}
/** fetch the HD voice a caller will speak with, before their first line (calls.ts, when the phone rings) */
export function warmHdVoice(voice: Caller['voice'], id: string): void { warmVoice(hdVoiceFor(voice, id)); }
/** whether that voice's file is already in the browser (probes) */
export async function hdVoiceCached(voice: Caller['voice'], id: string): Promise<boolean> {
  try { return !!(await (await caches.open('kokoro-voices')).match(voiceUrl(hdVoiceFor(voice, id)))); } catch { return false; }
}

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
let token = 0;
const cache = new Map<string, RawAudio>();   // the last few lines, so a replay or a repeated opener is instant

/** stop whatever an HD voice is saying, and drop the lines still being made */
export function stopHd(): void { token++; try { current?.stop(); } catch { /* already over */ } current = null; }

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
/** say the line in the character's HD voice; resolves false when it could not (the caller then uses the browser voice) */
export async function speakHd(text: string, voice: Caller['voice'], id: string, onEnd?: () => void): Promise<boolean> {
  if (!tts) return false;
  const my = ++token;
  try { current?.stop(); } catch { /* already over */ }
  const clean = text.replace(/\([^)]*\)/g, '').replace(/\*[^*]*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) { onEnd?.(); return true; }
  const v = hdVoiceFor(voice, id);
  const speed = clamp(voice.rate, 0.8, 1.25);
  // pitch: a few semitones either way on top of the voice itself, so two callers on one voice still differ
  const rate = clamp(Math.pow(2, ((voice.pitch - 1) * 2.4) / 12), 0.9, 1.1);
  // lines are made a phrase at a time and each phrase plays while the next is made. The first phrase is as short as
  // it can be (the first sentence or clause when it is short, else the first six words), so the voice starts soon;
  // the rest go in phrases of up to ~90 characters, cut at sentences, then at commas.
  const shortHead = clean.match(/^.{1,40}?[.!?…,;:](?=\s|$)/)?.[0];
  const head = (shortHead ?? clean.split(' ').slice(0, 6).join(' ')).trim();
  const rest = clean.slice(head.length).trim();
  const sentences = rest ? (rest.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) ?? [rest]) : [];
  const parts = [head, ...sentences.flatMap((s) => (s.length <= 90 ? [s] : (s.match(/[^,;:]+[,;:]?\s*/g) ?? [s])))
    .reduce<string[]>((acc, s) => { const last = acc[acc.length - 1]; if (last && last.length + s.length < 90) acc[acc.length - 1] = last + s; else acc.push(s); return acc; }, [])]
    .map((s) => s.trim()).filter(Boolean);
  if (!parts.length) parts.push(clean);
  const make = async (s: string): Promise<RawAudio> => {
    const key = `${v}|${speed}|${s}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const a = await tts!.generate(s, { voice: v, speed });
    cache.set(key, a);
    if (cache.size > 40) cache.delete(cache.keys().next().value as string);
    return a;
  };
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    let next: Promise<RawAudio> = make(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      const a = await next;
      if (my !== token) return true;              // hung up or a newer line: say nothing more
      if (i + 1 < parts.length) next = make(parts[i + 1]);
      const buf = ctx.createBuffer(1, a.audio.length, a.sampling_rate);
      buf.copyToChannel(a.audio as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(ctx.destination);
      current = src;
      await new Promise<void>((res) => { src.onended = () => res(); src.start(); });
      if (my !== token) return true;
    }
    current = null;
    onEnd?.();
    return true;
  } catch (e) {
    console.warn('HD voice failed on a line', e);
    return false;
  }
}

/** how long the first sentence takes to make, for Settings and the probes */
export async function hdBench(text = 'Good evening, this is Sunrise Customer Care. How can I help?'): Promise<{ ms: number; seconds: number } | null> {
  if (!tts) return null;
  const t0 = performance.now();
  const a = await tts.generate(text, { voice: 'af_heart' });
  return { ms: Math.round(performance.now() - t0), seconds: +(a.audio.length / a.sampling_rate).toFixed(2) };
}
