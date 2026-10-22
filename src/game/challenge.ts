// Tonight's shift and this week's shift: one seeded shift everyone plays the same way (same callers in the same
// order, same twist, same targets), scored on the room server's board. No save slot is touched.
import { fmt, state } from './state';
import { startRun } from './day';
import { postScore } from '../net/scores';
import { showBoard } from '../ui/board';
import { coop } from '../net/coop';

export type ChallengeKind = 'daily' | 'weekly';

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** the key everyone shares: the UTC date, or the ISO week */
export function challengeKey(kind: ChallengeKind, d = new Date()): string {
  if (kind === 'daily') return d.toISOString().slice(0, 10);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export function challengeSeed(kind: ChallengeKind, key: string): number { return fnv(kind + ':' + key) || 1; }

export function startChallenge(kind: ChallengeKind): void {
  if (coop.on) coop.leave();
  const key = challengeKey(kind);
  void startRun({ challenge: { kind, key, seed: challengeSeed(kind, key) } });
}

/** after the one shift: the score goes up, the board comes down, then the title */
export async function finishChallenge(pass: boolean): Promise<void> {
  const kind = state.mode as ChallengeKind, key = state.modeKey;
  const mine = { team: state.team, personal: state.personal, pass };
  await postScore(`${kind}:${key}`, mine);
  await showBoard(kind, key, mine);
}

export function challengeLabel(): string { return state.mode === 'daily' ? `Tonight's shift · ${state.modeKey}` : state.mode === 'weekly' ? `This week's shift · ${state.modeKey}` : ''; }
export function challengeSummary(): string { return `${fmt(state.team)} team · ${fmt(state.personal)} yours`; }
