// Saves that follow the player: the three save slots, the hall of fame, the badges, the look and the colleagues,
// kept on the room server under a sync code (12 letters; there is no account, so whoever has the code has the
// saves). Each browser pushes a little after every save and pulls when the game opens; the newest copy wins.
// The data is gzipped in the browser first. Settings, keys and the caller pack never leave the browser.
import { bus, saveSettings, settings, state } from './state';
import { serverUrl } from '../net/room';

const SYNC_KEYS = ['hp.save', 'hp.save.2', 'hp.save.3', 'hp.hall', 'hp.achievements', 'hp.avatar', 'hp.colleagues', 'hp.played', 'hp.sold', 'hp.scorer'];
const AT_KEY = 'hp.sync-at';   // when the copy this browser holds was made (its last push or pull)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0 or 1 to misread

export function newSyncCode(): string { return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => ALPHABET[b % 32]).join(''); }
/** "ABCDEFGHJKLM" → "ABCD-EFGH-JKLM"; streamer mode hides it */
export function prettyCode(c: string, masked = settings.streamer): string { return masked ? '••••-••••-••••' : (c.match(/.{1,4}/g) ?? []).join('-'); }
/** what a player typed, as a code, or '' */
export function readCode(s: string): string { const c = s.toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length === 12 && [...c].every((x) => ALPHABET.includes(x)) ? c : ''; }
const localAt = (): number => { try { return Number(localStorage.getItem(AT_KEY)) || 0; } catch { return 0; } };
const setLocalAt = (n: number): void => { try { localStorage.setItem(AT_KEY, String(n)); } catch { /* ignore */ } };
export function lastSync(): number { return localAt(); }

async function gzip(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** this browser's saves → the server; false when there is no code, no server, or a newer copy is already there */
export async function pushSaves(): Promise<boolean> {
  const base = serverUrl();
  if (!settings.syncCode || !base) return false;
  const pick: Record<string, string> = {};
  try { for (const k of SYNC_KEYS) { const v = localStorage.getItem(k); if (v !== null) pick[k] = v; } } catch { return false; }
  const at = Date.now();
  try {
    const data = await gzip(JSON.stringify(pick));
    if (data.length > 100_000) return false;
    const r = await fetch(`${base}/saves/${settings.syncCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at, data }) });
    const j = await r.json() as { ok?: boolean };
    if (j.ok) { setLocalAt(at); bus.emit('sync:done', 'pushed'); }
    return !!j.ok;
  } catch { return false; }
}

export type PullResult = 'applied' | 'same' | 'missing' | 'error';
/** the server's copy → this browser, when it is newer than ours (or always, with force: a code just typed in) */
export async function pullSaves(code = settings.syncCode, force = false): Promise<PullResult> {
  const base = serverUrl();
  if (!code || !base) return 'error';
  try {
    const r = await fetch(`${base}/saves/${code}`, { cache: 'no-store' });
    if (r.status === 404) return 'missing';
    if (!r.ok) return 'error';
    const j = await r.json() as { at: number; data: string };
    if (!force && j.at <= localAt()) return 'same';
    const keys = JSON.parse(await gunzip(j.data)) as Record<string, string>;
    for (const k of SYNC_KEYS) { if (typeof keys[k] === 'string') localStorage.setItem(k, keys[k]); else localStorage.removeItem(k); }
    setLocalAt(j.at);
    bus.emit('sync:done', 'pulled');
    return 'applied';
  } catch { return 'error'; }
}

/** start syncing this browser's saves under a new code */
export async function startSync(): Promise<string> {
  settings.syncCode = newSyncCode();
  saveSettings();
  await pushSaves();
  return settings.syncCode;
}
/** take the saves from another browser's code: this browser's are replaced */
export async function useCode(code: string): Promise<PullResult> {
  const res = await pullSaves(code, true);
  if (res === 'applied') { settings.syncCode = code; saveSettings(); }
  return res;
}
export function stopSync(): void { settings.syncCode = ''; saveSettings(); }

// a push a couple of seconds after every save (a day's start, a promotion, the end of a run); never mid-co-op
let timer: ReturnType<typeof setTimeout> | undefined;
bus.on('save:written', () => {
  if (!settings.syncCode) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void pushSaves(); }, 2000);
});
// when the game opens: the newest copy comes down before the title lists the slots (main.ts redraws the title)
export async function pullOnOpen(): Promise<boolean> {
  if (!settings.syncCode || state.phase !== 'title') return false;
  return (await pullSaves()) === 'applied';
}
