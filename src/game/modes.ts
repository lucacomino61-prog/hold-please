// Family mode and Streamer mode (both in Settings).
// Family: no swearing on screen, whoever typed it (callers, you, the room chat, custom colleagues), the live brain
// told to keep it clean, and no toilet humour on the floor (the plumbing disaster, the gas, the puddle and their
// targets stay out). The mask is the safety net under the brain's instruction, in English, Albanian and Italian.
// Streamer: room and sync codes shown as dots, the other players' screens blanked on the floor.
import { settings } from './state';

const L = '\\p{L}*';
const WORDS = [
  // English
  // (open-ended stems only where no ordinary word starts the same way: "shit" lists its forms, so "shitake" stays)
  `(?:mother)?fuck${L}`, 'shit(?:s|ty|tier|tiest|ting|ted|head|heads|hole|holes|face|show|load)?', 'bullshit', `bitch${L}`, `bastard${L}`, `a(?:ss|rse)hole${L}`, `dickhead${L}`, 'dicks?', 'cocks?', `cunt${L}`,
  `wank${L}`, 'bollocks', `piss${L}`, `slut${L}`, `whore${L}`, `twat${L}`, `(?:god)?damn${L}`, `crap${L}`, 'hell', // ("hello", "shell" stay)
  // Albanian ("qift", a kite, and "qira", rent, stay)
  `qij${L}`, `qifsh${L}`, `kurv${L}`, `pidh${L}`, 'kari', 'karin', 'mut', 'mutin', `byth${L}`,
  // Italian
  `cazz${L}`, `merd${L}`, `stronz${L}`, '(?:vaf)?fanculo', 'culo', `puttan${L}`, 'troia', 'minchia', `coglion${L}`, 'porco ?dio',
];
const BAD = new RegExp(`(?<!\\p{L})(?:${WORDS.join('|')})(?!\\p{L})`, 'giu');

/** the line as it may be shown: a swear keeps its first letter, the rest are dots (family mode only) */
export function familySafe(s: string): string {
  if (!settings.family || !s) return s;
  return s.replace(BAD, (w) => { const ch = [...w]; return ch[0] + '•'.repeat(Math.max(2, ch.length - 1)); });
}

/** the line as it may be spoken: a masked word is left out, so the voice does not read the dots */
export function familySpoken(s: string): string {
  return settings.family ? s.replace(/\p{L}•+/gu, '').replace(/\s{2,}/g, ' ').trim() : s;
}

/** a room code as it may be shown (streamer mode: dots) */
export function shownCode(code: string): string {
  return settings.streamer ? '•'.repeat(Math.max(4, code.length)) : code;
}
