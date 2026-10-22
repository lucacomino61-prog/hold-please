// The hall of fame (best runs on this browser) and the badges (achievements). Runs are written at every promotion
// and at the firing, keyed by the run's seed, so a run that is simply abandoned still counts for what it reached.
import { bus, settings, state, type CallRecord } from './state';
import { toast } from '../ui/toast';
import { sfx } from './sound';
import { currentRank, rankForDays } from './ranks';
import { currentCall } from './calls';
import { objectiveSummary } from './objectives';
import { SCAMS } from './scams';
import type { Caller } from './brain/types';

const HALL_KEY = 'hp.hall';
const ACH_KEY = 'hp.achievements';
const SOLD_KEY = 'hp.sold';

function read<T>(k: string, fallback: T): T { try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } }
function write(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

export interface RunEntry { key: number; at: number; name: string; days: number; team: number; personal: number; rank: string; fired: boolean; won?: boolean }

/** best runs first: days survived, then the team total */
export function hall(): RunEntry[] {
  return read<RunEntry[]>(HALL_KEY, []).sort((a, b) => b.days - a.days || b.team - a.team).slice(0, 10);
}

/** write or update this run's line (survived = days completed) */
/** every run this browser has seen, newest first (the history page) */
export function history(): RunEntry[] { return read<RunEntry[]>(HALL_KEY, []).sort((a, b) => b.at - a.at); }

export function recordRun(fired: boolean, won = false): void {
  const list = read<RunEntry[]>(HALL_KEY, []);
  // called after a survived day has moved state.day on, or on the day that failed: survived = day − 1 either way
  const e: RunEntry = { key: state.seed, at: Date.now(), name: settings.playerName || 'Agent', days: Math.max(0, state.day - 1), team: state.team, personal: state.personal, rank: currentRank().name, fired, won };
  const i = list.findIndex((x) => x.key === e.key);
  if (i >= 0) list[i] = e; else list.push(e);
  write(HALL_KEY, list.sort((a, b) => b.days - a.days || b.team - a.team).slice(0, 30));
}

export interface Achievement { id: string; name: string; blurb: string }
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-sale', name: 'First blood', blurb: 'Close your first sale.' },
  { id: 'double', name: 'Double dip', blurb: 'Two sales on one call.' },
  { id: 'vip', name: 'Star treatment', blurb: 'Close a VIP.' },
  { id: 'verified', name: 'Checks out', blurb: 'Pass a caller\'s verification question.' },
  { id: 'best-friends', name: 'Best friends', blurb: 'Get a caller to 95% trust.' },
  { id: 'grand', name: 'The grand', blurb: 'Bring in $1,000 yourself in one shift.' },
  { id: 'hat-trick', name: 'Hat-trick', blurb: 'All three daily targets in one day.' },
  { id: 'clean-desk', name: 'Clean desk policy', blurb: 'Survive a raid with every window hidden.' },
  { id: 'firefighter', name: 'Volunteer firefighter', blurb: 'Put out every flame.' },
  { id: 'bomb-squad', name: 'Bomb squad', blurb: 'Defuse the computer bomb.' },
  { id: 'bureau', name: 'Not today, Bureau', blurb: 'See off five inspectors without saying yes.' },
  { id: 'teamwork', name: 'Teamwork', blurb: 'Slap a colleague off a chair.' },
  { id: 'selfie', name: 'Company property', blurb: 'Take a snapshot at work.' },
  { id: 'week', name: 'Survivor', blurb: 'Survive five days.' },
  { id: 'lead', name: 'Floor Lead', blurb: 'Reach the top rank.' },
  { id: 'catalogue', name: 'Full catalogue', blurb: 'Sell every product at least once, across all your runs.' },
  { id: 'escape', name: 'Made it out', blurb: 'Survive the Bureau\'s raid on day ten.' },
  { id: 'honk', name: 'HONK', blurb: 'Catch the goose.' },
  { id: 'kettle', name: 'It was a kettle', blurb: 'Talk a bomb threat down.' },
  { id: 'kept-job', name: 'One more chance', blurb: 'Walk out of Mr. Krull\'s office with a job.' },
  { id: 'goosesale', name: 'Honk means yes', blurb: 'Sell the goose something.' },
];
export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function unlocked(): Record<string, number> { return read<Record<string, number>>(ACH_KEY, {}); }

let runBadges: string[] = [];
export function badgesThisRun(): string[] { return runBadges.slice(); }
export function resetRunBadges(list: string[] = []): void { runBadges = list.slice(); inspectorsSeenOff = 0; myShift = 0; }

export function unlock(id: string): boolean {
  const u = unlocked();
  if (u[id]) return false;
  const a = achievementById.get(id);
  if (!a) return false;
  u[id] = Date.now();
  write(ACH_KEY, u);
  runBadges.push(id);
  sfx.jackpot();
  toast(`Badge earned: ${a.name} — ${a.blurb}`, 'money', 5200);
  bus.emit('achievement', id);
  return true;
}

// ---- what earns them ----
let inspectorsSeenOff = 0;
let myShift = 0;   // your own sales this shift
export function startShiftBadges(): void { myShift = 0; }

bus.on<{ scam: string }>('call:paid', ({ scam }) => {
  unlock('first-sale');
  const c = currentCall();
  if (c?.caller.vip) unlock('vip');
  if ((c?.paid.size ?? 0) >= 2) unlock('double');
  const sold = read<string[]>(SOLD_KEY, []);
  if (!sold.includes(scam)) { sold.push(scam); write(SOLD_KEY, sold); }
  if (SCAMS.every((s) => sold.includes(s.id))) unlock('catalogue');
});
bus.on<{ amount: number }>('earn', ({ amount }) => { myShift += amount; if (myShift >= 1000) unlock('grand'); });
bus.on<{ intent?: string }>('call:suspicion', ({ intent }) => { if (intent === 'challenge_pass') unlock('verified'); });
bus.on<{ mood: number }>('call:mood', ({ mood }) => { if (mood >= 95) unlock('best-friends'); });
bus.on<{ done?: boolean } | undefined>('objective', (o) => { if (o?.done) { const s = objectiveSummary(); if (s.total === 3 && s.done === 3) unlock('hat-trick'); } });
bus.on<{ kind: string; ok: boolean }>('event:outcome', ({ kind, ok }) => { if (!ok) return; if (kind === 'raid') unlock('clean-desk'); if (kind === 'fire') unlock('firefighter'); if (kind === 'bomb') unlock('bomb-squad'); });
bus.on('slap', () => unlock('teamwork'));
bus.on('goose:caught', () => unlock('honk'));
bus.on<{ kind: string }>('clip', ({ kind }) => { if (kind === 'snapshot') unlock('selfie'); });
bus.on<{ caller: Caller; record: CallRecord }>('call:ended', ({ caller, record }) => { if (caller.archetype === 'inspector' && !record.virus && ++inspectorsSeenOff >= 5) unlock('bureau'); });

/** a day was survived: `survived` is how many in a row */
export function dayDoneBadges(survived: number): void {
  if (survived >= 5) unlock('week');
  if (rankForDays(survived).id === 'lead') unlock('lead');
}

export function badgeChips(ids: string[]): string {
  return ids.map((id) => achievementById.get(id)).filter((a): a is Achievement => !!a).map((a) => `<span class="badge" title="${a.blurb.replace(/"/g, '&quot;')}">★ ${a.name}</span>`).join('');
}
