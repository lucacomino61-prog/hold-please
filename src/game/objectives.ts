// Daily targets: three small objectives a day next to the quota, each worth a personal bonus the moment it is done.
// They are drawn from a pool by the day and the run's seed, shown on the break-room whiteboard, in the Targets window
// on the desktop, and ticked off in Mr. Krull's review.
import { bus, fmt, state, type ScamId } from './state';
import { currentCall } from './calls';
import { scamById } from './scams';
import { toast } from '../ui/toast';
import { sfx } from './sound';
import { coop } from '../net/coop';
import { room } from '../net/room';
import type { Caller } from './brain/types';
import type { CallRecord } from './state';

/** in co-op the room's code seeds the day's three, so the whole floor shares them */
function daySeed(): number {
  if (coop.on) { const code = coop.code(); let h = 2166136261; for (let i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) + state.day * 7919; }
  return state.seed + state.day * 7919;
}

export interface ObjectiveDef {
  id: string;
  text: string;
  reward: number;
  target: number;
  minDay?: number;
  needs?: ScamId;            // only when this product is owned
  event: string;             // the bus event that can move it
  count: (detail: unknown) => number;  // how much that event moves it (0 = not this time)
  family?: string;           // at most one of a family per day
}

export interface Objective { def: ObjectiveDef; progress: number; done: boolean }

const call = () => currentCall();
const arch = () => call()?.caller.archetype;
const onceByCall = new Set<number>();

export const DEFS: ObjectiveDef[] = [
  { id: 'answer5', text: 'Answer five calls', reward: 60, target: 5, event: 'call:answered', count: () => 1 },
  { id: 'trusting', text: 'Get a caller to TRUSTING', reward: 90, target: 1, event: 'call:mood', count: (d) => { const m = (d as { mood: number }).mood; const c = call(); if (m < 80 || !c || onceByCall.has(c.record.startedAt)) return 0; onceByCall.add(c.record.startedAt); return 1; } },
  { id: 'double', text: 'Two sales on one call', reward: 120, target: 1, event: 'call:paid', count: () => ((call()?.paid.size ?? 0) >= 2 ? 1 : 0) },
  { id: 'moon2', text: 'Sell Moon Acres twice', reward: 100, target: 2, event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'moon' ? 1 : 0), family: 'product' },
  { id: 'sun', text: 'Sell a Sun Warranty', reward: 70, target: 1, event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'sun' ? 1 : 0), family: 'product' },
  { id: 'gravity', text: 'Sign someone up for gravity', reward: 70, target: 1, event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'gravity' ? 1 : 0), family: 'product' },
  { id: 'clouds', text: 'Store somebody\'s clouds', reward: 90, target: 1, needs: 'clouds', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'clouds' ? 1 : 0), family: 'product' },
  { id: 'haunt', text: 'Sell a haunting policy', reward: 90, target: 1, needs: 'haunt', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'haunt' ? 1 : 0), family: 'product' },
  { id: 'runes', text: 'Scratch a winning rune', reward: 110, target: 1, needs: 'runes', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'runes' ? 1 : 0), family: 'product' },
  { id: 'beancoin', text: 'Cash out a Bean Coin round', reward: 110, target: 1, needs: 'beancoin', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'beancoin' ? 1 : 0), family: 'product' },
  { id: 'machine', text: 'Close a sale with a machine', reward: 100, target: 1, event: 'call:paid', count: () => (arch() === 'machine' ? 1 : 0), family: 'kind' },
  { id: 'spirit', text: 'Close a sale with a ghost', reward: 100, target: 1, event: 'call:paid', count: () => (arch() === 'spirit' ? 1 : 0), family: 'kind' },
  { id: 'creature', text: 'Close a sale with an animal', reward: 90, target: 1, event: 'call:paid', count: () => (arch() === 'creature' ? 1 : 0), family: 'kind' },
  { id: 'legend', text: 'Close a sale with a legend', reward: 100, target: 1, event: 'call:paid', count: () => (arch() === 'legend' ? 1 : 0), family: 'kind' },
  { id: 'cosmic', text: 'Close a sale with something from space', reward: 100, target: 1, event: 'call:paid', count: () => (arch() === 'cosmic' ? 1 : 0), family: 'kind' },
  { id: 'vip', text: 'Close a VIP', reward: 200, target: 1, event: 'call:paid', count: () => (call()?.caller.vip ? 1 : 0), family: 'kind' },
  { id: 'test', text: 'Pass a caller\'s verification question', reward: 110, target: 1, event: 'call:suspicion', count: (d) => ((d as { intent?: string }).intent === 'challenge_pass' ? 1 : 0) },
  { id: 'world3', text: 'Play along with three of a caller\'s world words', reward: 70, target: 1, event: 'call:mood', count: (d) => { const c = call(); if ((d as { intent?: string }).intent !== 'yesand' || !c || c.ctx.topics.length < 3 || onceByCall.has(c.record.startedAt + 1)) return 0; onceByCall.add(c.record.startedAt + 1); return 1; } },
  { id: 'inspector', text: 'Get rid of an inspector without saying yes', reward: 100, target: 1, minDay: 2, event: 'call:ended', count: (d) => { const e = d as { caller: Caller; record: CallRecord }; return e.caller.archetype === 'inspector' && !e.record.virus ? 1 : 0; } },
  { id: 'half', text: 'Bring in half the quota yourself', reward: 150, target: 1, event: 'earn', count: () => (state.personal >= state.quota / 2 ? 1 : 0) },
  { id: 'raid', text: 'Survive a raid with clean desks', reward: 120, target: 1, minDay: 2, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'raid' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'fire', text: 'Put out a fire', reward: 120, target: 1, minDay: 3, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'fire' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'bomb', text: 'Defuse a computer bomb', reward: 150, target: 1, minDay: 3, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'bomb' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'snapshot', text: 'Take a snapshot in the Camera', reward: 40, target: 1, event: 'clip', count: (d) => ((d as { kind: string }).kind === 'snapshot' ? 1 : 0) },
  { id: 'floor', text: 'Take a call at a different desk', reward: 60, target: 1, event: 'floor:sat', count: (d) => ((d as { moved: boolean }).moved ? 1 : 0) },
  { id: 'answer8', text: 'Answer eight calls', reward: 110, target: 8, minDay: 2, event: 'call:answered', count: () => 1 },
  { id: 'trusting2', text: 'Get two callers to TRUSTING', reward: 160, target: 2, minDay: 2, event: 'call:mood', count: (d) => { const m = (d as { mood: number }).mood; const c = call(); if (m < 80 || !c || onceByCall.has(c.record.startedAt)) return 0; onceByCall.add(c.record.startedAt); return 1; } },
  { id: 'hold', text: 'Put a caller on hold and come back to them', reward: 90, target: 1, event: 'call:swapped', count: () => 1 },
  { id: 'transfer', text: 'Transfer a caller to a colleague', reward: 80, target: 1, event: 'call:transfer', count: () => 1 },
  { id: 'weather', text: 'Sell a Weather Subscription', reward: 90, target: 1, needs: 'weather', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'weather' ? 1 : 0), family: 'product' },
  { id: 'subway', text: 'Sell a ticket on the Subway to the Moon', reward: 110, target: 1, needs: 'subway', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'subway' ? 1 : 0), family: 'product' },
  { id: 'remote', text: 'Connect through FarView and charge for the clean', reward: 120, target: 1, needs: 'remote', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'remote' ? 1 : 0), family: 'product' },
  { id: 'nobel', text: 'Deliver a Nobel Prize', reward: 130, target: 1, needs: 'nobel', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'nobel' ? 1 : 0), family: 'product' },
  { id: 'cavedive', text: 'Teach a cave dive by phone', reward: 110, target: 1, needs: 'cavedive', event: 'call:paid', count: (d) => ((d as { scam: string }).scam === 'cavedive' ? 1 : 0), family: 'product' },
  { id: 'nuke', text: 'Get under the desk in time', reward: 140, target: 1, minDay: 4, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'nuke' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'hurricane', text: 'Bolt every window in the hurricane', reward: 130, target: 1, minDay: 4, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'hurricane' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'kettle', text: 'Talk a bomb threat down', reward: 150, target: 1, minDay: 4, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'bombthreat' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'plumbing', text: 'Plunge every toilet', reward: 110, target: 1, minDay: 3, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'poop' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'poach', text: 'Beat Dusk to a caller', reward: 100, target: 1, minDay: 2, event: 'event:outcome', count: (d) => { const e = d as { kind: string; ok: boolean }; return e.kind === 'poach' && e.ok ? 1 : 0; }, family: 'event' },
  { id: 'doodle', text: 'Draw something in Doodle', reward: 40, target: 1, event: 'clip', count: (d) => ((d as { kind: string }).kind === 'doodle' ? 1 : 0) },
  { id: 'radio', text: 'Put Hold FM on', reward: 30, target: 1, event: 'radio', count: (d) => (d ? 1 : 0) },
  { id: 'gas', text: 'Clear the room, your way (F on the floor)', reward: 50, target: 1, event: 'fart', count: () => 1 },
];

let today: Objective[] = [];
let offs: (() => void)[] = [];
let armed = false;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** three for today, from the run's seed and the day: the same three until the day moves on (ids pin a set, for the probes) */
export function planObjectives(ids?: string[]): Objective[] {
  const r = rng(daySeed());
  const pool = DEFS.filter((d) => (d.minDay ?? 1) <= state.day && (!d.needs || state.owned.has(d.needs)));
  const shuffled = pool.map((d) => ({ d, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.d);
  const picked: ObjectiveDef[] = ids ? ids.map((id) => DEFS.find((d) => d.id === id)).filter((d): d is ObjectiveDef => !!d) : [];
  const families = new Set<string>();
  for (const d of shuffled) {
    if (picked.length >= 3) break;
    if (picked.includes(d) || (d.family && families.has(d.family))) continue;
    picked.push(d);
    if (d.family) families.add(d.family);
  }
  today = picked.map((def) => ({ def, progress: 0, done: false }));
  onceByCall.clear();
  if (armed) armObjectives();
  bus.emit('objective');
  return today;
}

export function objectives(): Objective[] { return today; }

function complete(o: Objective): void {
  o.done = true;
  state.personal += o.def.reward;   // a personal bonus: it never moves the team total
  bus.emit('money');
  sfx.cash();
  toast(`Target done: ${o.def.text} — +${fmt(o.def.reward)}`, 'money', 4800);
  bus.emit('objective', o);
  if (coop.live) room.send({ t: 'note', sub: 'target', text: o.def.text });
}

/** listen for the day's events (startShift) */
export function armObjectives(): void {
  disarmObjectives();
  armed = true;
  if (!today.length) planObjectives();
  const byEvent = new Map<string, Objective[]>();
  for (const o of today) { const l = byEvent.get(o.def.event) ?? []; l.push(o); byEvent.set(o.def.event, l); }
  for (const [ev, list] of byEvent) {
    offs.push(bus.on(ev, (d) => {
      for (const o of list) {
        if (o.done) continue;
        const n = o.def.count(d);
        if (!n) continue;
        o.progress = Math.min(o.def.target, o.progress + n);
        if (o.progress >= o.def.target) complete(o); else bus.emit('objective', o);
      }
    }));
  }
}

export function disarmObjectives(): void { offs.splice(0).forEach((f) => f()); armed = false; }

/** tomorrow: new targets */
export function resetObjectives(): void { disarmObjectives(); today = []; onceByCall.clear(); }

export function objectiveSummary(): { done: number; total: number; earned: number } {
  return { done: today.filter((o) => o.done).length, total: today.length, earned: today.filter((o) => o.done).reduce((s, o) => s + o.def.reward, 0) };
}
