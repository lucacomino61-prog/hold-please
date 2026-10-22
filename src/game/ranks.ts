// Ranks: days survived earn a title and a perk that changes the game, not only the badge. The rank is read from
// the day (days survived = day − 1), so a resumed run and a co-op room both get it right without extra state.
import { state } from './state';

export interface Rank { id: string; name: string; after: number; perk: string }

export const RANKS: Rank[] = [
  { id: 'trainee', name: 'Trainee', after: 0, perk: 'A desk, a phone, a quota. Good luck.' },
  { id: 'agent', name: 'Agent', after: 2, perk: 'Callers wait a quarter longer before they get bored.' },
  { id: 'senior', name: 'Senior Agent', after: 4, perk: 'VIPs pay double: six times the price on fixed products, twice their budget on the Moon.' },
  { id: 'lead', name: 'Floor Lead', after: 6, perk: 'A second line: a caller who rings while you are on a call waits on hold instead of hanging up.' },
];

export function rankForDays(survived: number): Rank {
  let r = RANKS[0];
  for (const x of RANKS) if (survived >= x.after) r = x;
  return r;
}
export function currentRank(): Rank { return rankForDays(state.day - 1); }
export function nextRank(): Rank | null { return RANKS[RANKS.indexOf(currentRank()) + 1] ?? null; }

export interface Perks { patience: number; vipFixed: number; vipBudget: number; secondLine: boolean }
/** what the current rank changes in calls.ts */
export function perks(): Perks {
  const i = RANKS.indexOf(currentRank());
  return { patience: i >= 1 ? 1.25 : 1, vipFixed: i >= 2 ? 6 : 3, vipBudget: i >= 2 ? 2 : 1, secondLine: i >= 3 };
}
