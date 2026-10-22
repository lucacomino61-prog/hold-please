// Mutator days: from day 2, some days come with a twist announced on the whiteboard (every caller whispers, the
// Moon is sold out, suspicion doubles…) and a bigger promotion bonus for surviving it. Seeded by the run and the day,
// so a resumed run sees the same twist.
import { state } from './state';
import type { Register } from './brain/style';

export interface Mutator {
  id: string; name: string; blurb: string;
  bonus: number;            // multiplier on the promotion bonus
  patience?: number;        // caller patience multiplier
  suspicion?: number;       // suspicion gain multiplier
  budget?: number;          // caller budget multiplier
  register?: Register;      // every caller talks like this today
  noMoon?: boolean;         // Moon Acres cannot be sold today
  inspectors?: number;      // inspector chance multiplier
  vip?: number;             // VIP chance multiplier
  mood0?: number;           // every caller starts this much warmer or colder
  price?: number;           // market prices multiplier
  hideTrust?: boolean;      // the trust bar shows nothing
  fixed?: number;           // fixed payouts multiplier
}

export const MUTATORS: Mutator[] = [
  { id: 'whisper', name: 'Library night', blurb: 'Every caller whispers. Lean in.', bonus: 1.5, register: 'whisper' },
  { id: 'loud', name: 'Megaphone night', blurb: 'Every caller shouts. Every single one.', bonus: 1.5, register: 'shout' },
  { id: 'moonout', name: 'The Moon is sold out', blurb: 'No Moon Acres today. Sell them something else.', bonus: 1.6, noMoon: true },
  { id: 'paranoid', name: 'Paranoid night', blurb: 'Suspicion climbs twice as fast. Pitch before you ask.', bonus: 1.8, suspicion: 2 },
  { id: 'shortfuse', name: 'Short fuse', blurb: 'Callers have half the patience. Get to the point.', bonus: 1.6, patience: 0.55 },
  { id: 'payday', name: 'Payday somewhere', blurb: 'Budgets are half as big again. So is the hunger.', bonus: 1.2, budget: 1.5 },
  { id: 'bureau', name: 'Bureau sweep', blurb: 'Three times the inspectors. Never say yes.', bonus: 1.7, inspectors: 3 },
  { id: 'vipnight', name: 'Red carpet night', blurb: 'One caller in four is a celebrity. Dress accordingly.', bonus: 1.4, vip: 5 },
  { id: 'hangover', name: 'Hangover', blurb: 'Every caller starts fifteen points colder. Be nice first.', bonus: 1.6, mood0: -15 },
  { id: 'nightmarket', name: 'Night market', blurb: 'Everything in Swindlr Market is half price. Tonight only.', bonus: 1.1, price: 0.5 },
  { id: 'fog', name: 'Fog night', blurb: 'The trust bar shows nothing. Read the words.', bonus: 1.9, hideTrust: true },
  { id: 'goldrush', name: 'Gold rush', blurb: 'Fixed-price products pay half as much again.', bonus: 1.0, fixed: 1.5 },
  { id: 'quiet', name: 'Quiet night', blurb: 'Patient callers, thin wallets.', bonus: 1.1, patience: 1.6, budget: 0.7 },
  { id: 'rush', name: 'Rush hour', blurb: 'Everyone is in a hurry and nobody trusts you.', bonus: 1.7, patience: 0.8, suspicion: 1.5 },
  { id: 'sirens', name: 'Siren night', blurb: 'Twice the inspectors, and they are impatient.', bonus: 1.5, inspectors: 2, patience: 0.9 },
  { id: 'generous', name: 'Generous night', blurb: 'More celebrities, bigger fixed payouts. Easy money, small bonus.', bonus: 0.9, vip: 2, fixed: 1.3 },
];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

let cacheKey = '';
let cached: Mutator | null = null;
let override: Mutator | null | undefined;   // the probes pin one

export function todayMutator(): Mutator | null {
  if (override !== undefined) return override;
  const key = state.seed + ':' + state.day;
  if (key === cacheKey) return cached;
  cacheKey = key;
  if (state.day < 2) { cached = null; return cached; }
  const r = rng(state.seed + state.day * 31);
  cached = r() < 0.55 ? MUTATORS[Math.floor(r() * MUTATORS.length)] : null;
  return cached;
}
export function setMutator(id: string | null | undefined): void { override = id === undefined ? undefined : id === null ? null : MUTATORS.find((m) => m.id === id) ?? null; }

export const mutatorPatience = (): number => todayMutator()?.patience ?? 1;
export const mutatorSuspicion = (): number => todayMutator()?.suspicion ?? 1;
export const mutatorBudget = (): number => todayMutator()?.budget ?? 1;
export const mutatorRegister = (): Register | null => todayMutator()?.register ?? null;
export const moonSoldOut = (): boolean => !!todayMutator()?.noMoon;
export const inspectorMul = (): number => todayMutator()?.inspectors ?? 1;
export const mutatorBonus = (): number => todayMutator()?.bonus ?? 1;
export const mutatorVip = (): number => todayMutator()?.vip ?? 1;
export const mutatorMood = (): number => todayMutator()?.mood0 ?? 0;
export const mutatorPrice = (): number => todayMutator()?.price ?? 1;
export const mutatorHideTrust = (): boolean => !!todayMutator()?.hideTrust;
export const mutatorFixed = (): number => todayMutator()?.fixed ?? 1;
