// Save and resume: the run is written to this browser at every break room (the start of a day) and after every
// promotion. Resuming puts you back in that day's break room; a shift that was cut off restarts. Co-op runs belong
// to the room and are never saved here. Three slots: slot 1 is the old single save (same key), 2 and 3 beside it.
import { bus, settings, state, type CallRecord, type Colleague, type ScamId } from './state';
import { coop } from '../net/coop';

export const SLOTS = 3;
const keyOf = (n: number) => (n === 1 ? 'hp.save' : `hp.save.${n}`);
let slot = 1;

export interface SaveData {
  v: 1; at: number;
  day: number; quota: number; personal: number; team: number;
  owned: ScamId[]; inventory: string[]; cosmetics: string[];
  colleagues: Colleague[];
  casinoNet: number; dumplings: number; seed: number; date: number;
  allCalls: CallRecord[];
  name: string;
  badges: string[];   // badges earned this run (hall.ts)
  caseSlips?: { day: number; kind: 'file' | 'busted' | 'insult'; text: string }[];   // Inspector Vane's file (case.ts)
  carryStrike?: boolean;  // slipped out of the review through the door
}

/** the slot the current run writes to */
export function activeSlot(): number { return slot; }
export function setSlot(n: number): void { slot = Math.max(1, Math.min(SLOTS, Math.round(n))); }
/** every slot, saved or empty */
export function listSaves(): (SaveData | null)[] { return Array.from({ length: SLOTS }, (_, i) => loadSave(i + 1)); }
/** the first empty slot, or 0 when all three hold a run */
export function freeSlot(): number { const l = listSaves(); const i = l.findIndex((s) => !s); return i < 0 ? 0 : i + 1; }

export function saveRun(badges: string[] = [], n = slot): void {
  if (coop.on) return;
  const data: SaveData = {
    v: 1, at: Date.now(),
    day: state.day, quota: state.quota, personal: state.personal, team: state.team,
    owned: [...state.owned], inventory: [...state.inventory], cosmetics: [...state.cosmetics],
    colleagues: state.colleagues.map((c) => ({ ...c })),
    casinoNet: state.casinoNet, dumplings: state.dumplings, seed: state.seed, date: state.date.getTime(),
    // what callers remember of you: the last forty calls, each with its last few lines
    allCalls: state.allCalls.slice(-40).map((r) => ({ ...r, lines: r.lines.slice(-6) })),
    name: settings.playerName,
    badges,
    caseSlips: state.caseSlips.map((s) => ({ ...s })),
    carryStrike: state.carryStrike,
  };
  try { localStorage.setItem(keyOf(n), JSON.stringify(data)); } catch { /* private mode etc. */ }
}

export function loadSave(n = slot): SaveData | null {
  try {
    const raw = localStorage.getItem(keyOf(n));
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.v === 1 && d.day >= 1 ? d : null;
  } catch { return null; }
}

export function clearSave(n = slot): void { try { localStorage.removeItem(keyOf(n)); } catch { /* ignore */ } }

/** put a saved run back into the state (after resetRun) */
export function applySave(d: SaveData): void {
  state.day = d.day; state.quota = d.quota; state.personal = d.personal; state.team = d.team;
  state.owned = new Set<ScamId>(d.owned);
  state.inventory = [...d.inventory];
  state.cosmetics = [...(d.cosmetics ?? [])];
  state.colleagues = d.colleagues.map((c) => ({ ...c }));
  state.casinoNet = d.casinoNet; state.dumplings = d.dumplings; state.seed = d.seed;
  state.date = new Date(d.date);
  state.allCalls = d.allCalls ?? [];
  state.caseSlips = (d.caseSlips ?? []).map((s) => ({ ...s }));
  state.carryStrike = !!d.carryStrike;
  state.calls = []; state.earnedToday = 0;
  state.shiftLeft = state.shiftTotal;
  if (d.name) settings.playerName = d.name;
  bus.emit('money');
}
