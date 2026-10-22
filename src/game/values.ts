// The nonsense the callers "give": crater names, sun serial numbers, rune tickets. Nothing real.
import type { GiveKind } from './brain/types';

const d = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const l = (n: number) => Array.from({ length: n }, () => L[Math.floor(Math.random() * L.length)]).join('');
const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const CRATERS = ['Mildred', 'Big Pudding', 'Crater Dave', 'The Dent', 'Lesser Wobble', 'Soup Bowl', 'Old Gregory', 'Hole Seven'];
const PINS = ['wobble', 'downwards', 'heavy', 'plummet', 'thud', 'splat', 'anchor', 'boulder'];
const PETS = ['Biscuit', 'Admiral', 'Pudding', 'Noodle', 'Gizmo', 'Pepper', 'Sir Fluff', 'Steve'];
const PLANS = ['Basic Bark', 'Purr Premium', 'Ultra Fetch', 'Goldfish Lite'];

export function makeValues(): Record<GiveKind, string> {
  return {
    crater: pickOne(CRATERS),
    sunserial: `SUN-${d(4)}`,
    gravitypin: pickOne(PINS),
    cumulus: String(3 + Math.floor(Math.random() * 9)),
    vowelname: '',
    hauntref: `BOO-${d(3)}-${l(2)}`,
    petplan: `${pickOne(PETS)} / ${pickOne(PLANS)}`,
    rune: `RUNE-${d(5)}`,
    bean: '',
    fridgecode: `${d(3)}-${d(3)}`,
    lavaweek: `week ${1 + Math.floor(Math.random() * 52)}`,
    quietword: pickOne(['hush', 'velvet', 'moss', 'pillow', 'snowfall', 'whisper', 'feather', 'lullaby']),
    shadows: String(2 + Math.floor(Math.random() * 8)),
    tuesday: `the ${pickOne(['3rd', '10th', '17th', '24th', '31st', '7th', '14th', '21st', '28th'])}`,
    echoword: pickOne(['balloon', 'pudding', 'tomato', 'lantern', 'marble', 'thunder', 'pickle', 'walrus']),
    dreamcode: d(4),
    colours: (() => { const c = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']; const out: string[] = []; while (out.length < 3) { const x = pickOne(c); if (!out.includes(x)) out.push(x); } return out.join(' '); })(),
    sky: pickOne(SKIES),
    shadowlength: `${2 + Math.floor(Math.random() * 8)} metres`,
    fallcount: String(1 + Math.floor(Math.random() * 11)),
    birthmonth: pickOne(MONTHS),
    nobelfield: pickOne(NOBEL_FIELDS),
    depth: `${4 + Math.floor(Math.random() * 15)} metres`,
    echocount: String(2 + Math.floor(Math.random() * 5)),
    station: pickOne(STATIONS),
    toothcount: String(1 + Math.floor(Math.random() * 10)),
    zonehours: `${pickOne(['+', '-'])}${1 + Math.floor(Math.random() * 11)} hours`,
    viewcode: `${d(3)}-${d(3)}`,
  };
}

export const SKIES = ['sunny', 'drizzle', 'fog', 'hail', 'double rainbow', 'aurora', 'bees', 'snow'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const NOBEL_FIELDS = ['Physics', 'Chemistry', 'Peace', 'Literature', 'Soup', 'Napping', 'Hats', 'Staring'] as const;
export const STATIONS = ['Pudding Lane', 'Crater Dave Junction', 'Lower Wobble', 'Goose Street', 'Old Gregory', 'Soup Bowl Parkway', 'Fridge End', 'Moonrise Terminal'] as const;
export const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
/** the digits in a value ("4 metres" → "4", "+3 hours" → "+3") */
export function digitsOf(s: string): string { const m = s.match(/[+-]?\d+/); return m ? String(parseInt(m[0], 10)) : ''; }
export function reversed(s: string): string { return [...s].reverse().join(''); }

export function normalise(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function stripVowels(s: string): string {
  return s.replace(/[aeiouAEIOU]/g, '');
}

export function matches(kind: GiveKind, typed: string, given: string | undefined): boolean {
  if (!given) return false;
  if (kind === 'petplan') {
    const [pet, plan] = given.split('/').map((x) => x.trim().toUpperCase());
    const t = typed.toUpperCase();
    return t.includes(pet) && t.includes(plan.split(' ')[0]);
  }
  if (kind === 'vowelname') return normalise(typed) === normalise(given);
  if (kind === 'echoword') return normalise(typed) === reversed(normalise(given));   // the echo removed: the word backwards
  // the number puzzles: "4 metres", "+3 hours" and plain counts compare by their number
  if (kind === 'shadowlength' || kind === 'fallcount' || kind === 'depth' || kind === 'echocount' || kind === 'toothcount' || kind === 'zonehours') return digitsOf(typed) !== '' && digitsOf(typed) === digitsOf(given);
  return normalise(typed) === normalise(given);
}

export function spokenDigits(s: string): string {
  // "482-913" -> "4 8 2, 9 1 3" so the voice reads it slowly
  return s.replace(/[0-9]/g, (c) => c + ' ').replace(/[-/]/g, ', ').replace(/\s+/g, ' ').trim();
}
