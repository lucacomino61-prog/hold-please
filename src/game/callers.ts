// The roster: creatures, machines, spirits, legends and cosmic bodies. All invented.
// Improv rules: use their name, play along with their world, answer their question. That is
// what warms a caller up. Insults, "you're not real" and hurrying them cool them down.
import type { Caller } from './brain/types';
import type { PortraitKind } from '../os/portrait';
import { bus, FINALE_DAY, settings, state } from './state';
import { EXTRA_ROSTER } from './roster';
import { inspectorMul, mutatorVip } from './mutators';

const C = (c: Caller): Caller => c;

// Emptied on 2026-10-20 at Luca's request: the invented callers (22 creatures, machines, spirits, legends, cosmic bodies
// and 3 inspectors) are gone; the floor rings only with the Character Creator's people (public/packs/albanian-*.json).
// The originals are kept in the side session's scratchpad backup (roster-backup-2026-10-20/callers.ts.before-empty).
export const ROSTER: Caller[] = [];
// the six invented celebrities went with the roster; custom callers with vip: true take their place
export const VIPS: Caller[] = [];
ROSTER.push(...VIPS);
// the big roster (src/game/roster/): 172 more, each with its own suspicions and verification question
ROSTER.push(...EXTRA_ROSTER);

// which drawing each caller gets (see os/portrait.ts)
const KINDS: Record<string, PortraitKind> = {
  gerald: 'raccoon', fluff: 'cat', goose: 'goose', barnaby: 'bear', fridge: 'robot', valentina: 'robot', atm: 'robot', toaster: 'toaster',
  wisteria: 'ghost', attic: 'ghost', mortimer: 'ghost', tallman: 'trenchcoat', zorp: 'alien', themoon: 'moon', dennis: 'cloud',
};
for (const c of ROSTER) {
  c.portrait.kind = KINDS[c.id] ?? c.portrait.kind ?? 'human';
  if (c.archetype === 'inspector') c.portrait.headset = true;
  if (c.id === 'reginald') c.portrait.hat = 4;
  if (c.id === 'saltbeard') c.portrait.hat = 5;
  if (c.id === 'attic') c.portrait.skin = '#5a3a8a';
}

// ---- custom callers from the Character Creator (this browser only) ----
const custom: Caller[] = [];
try {
  const raw = localStorage.getItem('hp.callers');
  if (raw) for (const c of JSON.parse(raw) as Caller[]) if (c && c.id && c.name) { custom.push(c); ROSTER.push(c); }
} catch { /* ignore */ }
function persist(): void { try { localStorage.setItem('hp.callers', JSON.stringify(custom)); } catch { /* ignore */ } }
// a pack imported earlier keeps its old portraits in this browser: the shipped pack's photos and credits are
// copied over the matching callers at start-up, so a portrait added to the pack reaches every player
if (custom.some((c) => c.id.startsWith('al-'))) {
  void fetch('/packs/albanian-callers.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((list: Caller[]) => {
    let changed = 0;
    for (const p of Array.isArray(list) ? list : []) {
      const c = custom.find((x) => x.id === p.id);
      if (!c || !p.portrait) continue;
      const next = { ...c.portrait, kind: p.portrait.kind, photo: p.portrait.photo, credit: p.portrait.credit };
      if (JSON.stringify(next) !== JSON.stringify(c.portrait)) { c.portrait = next; changed++; }
    }
    if (changed) { persist(); bus.emit('callers:synced', custom); }
  }).catch(() => { /* offline: the old portraits stay */ });
}
export function customCallers(): Caller[] { return custom.slice(); }
export function addCustomCaller(c: Caller): void {
  c.portrait = c.portrait ?? {};
  if (!c.portrait.kind) c.portrait.kind = 'human';
  custom.push(c); ROSTER.push(c); byId.set(c.id, c); persist();
}
export function removeCustomCaller(id: string): void {
  const i = custom.findIndex((c) => c.id === id); if (i >= 0) custom.splice(i, 1);
  const j = ROSTER.findIndex((c) => c.id === id); if (j >= 0) ROSTER.splice(j, 1);
  byId.delete(id); persist();
}

const byId = new Map(ROSTER.map((c) => [c.id, c]));
export function callerById(id: string): Caller | undefined { return byId.get(id); }

// ---- the default pack: a browser with no callers of its own gets the Albanian pack ----
// Since the invented roster was retired (20 Oct) the floor rings only Character Creator callers, so a first visit
// had nobody to ring. The pack is fetched once and kept like an import: the Creator can edit or remove its people.
const PACK_URL = '/packs/albanian-callers.json';
let packLoad: Promise<boolean> | null = null;
/** resolves true once there is somebody to ring: this browser's own callers, or the default pack */
export function ensureCallers(): Promise<boolean> {
  if (custom.length) return Promise.resolve(true);
  if (packLoad) return packLoad;
  packLoad = fetch(PACK_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) => {
      for (const c of Array.isArray(list) ? (list as Caller[]) : []) {
        if (c && c.id && c.name && !byId.has(c.id)) { custom.push(c); ROSTER.push(c); byId.set(c.id, c); }
      }
      if (custom.length) { persist(); bus.emit('callers:synced', custom); }
      return custom.length > 0;
    })
    .catch(() => false)
    .then((ok) => { if (!ok) packLoad = null; return ok; }); // a failed load is tried again on the next ask
  return packLoad;
}
if (!custom.length) void ensureCallers();

// Draw the next caller: no repeats until the pool is used up; inspectors only from day 2.
// one call in twenty is a celebrity (they may call again; fame is like that)
let vipChance = 0.05;
// a challenge draws callers from a seeded stream so everyone gets the same order; 0 = the ordinary random run
let drawRng: (() => number) | null = null;
export function seedCallers(seed: number): void { if (!seed) { drawRng = null; return; } let s = seed >>> 0 || 1; drawRng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const roll = (): number => (drawRng ? drawRng() : Math.random());
export function setVipChance(p: number): void { vipChance = Math.max(0, Math.min(1, p)); }

/** the next caller, or null when nobody is left to ring (no pack imported) */
export function drawCaller(): Caller | null {
  // Settings → "Only my Character Creator callers": once a pack of people is loaded, the built-in creatures stay out
  const onlyPeople = settings.callerPool === 'people' && custom.length > 0;
  // the built-in celebrities and any the Character Creator marked as one
  const vips = onlyPeople ? custom.filter((c) => c.vip) : [...VIPS, ...custom.filter((c) => c.vip)];
  if (vips.length && roll() < vipChance * mutatorVip()) return vips[Math.floor(roll() * vips.length)];
  const base = onlyPeople ? custom : ROSTER;
  const pool = base.filter((c) => !c.vip && !state.usedCallers.has(c.id) && (c.archetype !== 'inspector' || state.day >= 2));
  const source = pool.length ? pool : base.filter((c) => !c.vip && (c.archetype !== 'inspector' || state.day >= 2));
  if (!pool.length) state.usedCallers.clear();
  const inspectors = source.filter((c) => c.archetype === 'inspector');
  const others = source.filter((c) => c.archetype !== 'inspector');
  const wantInspector = state.day >= 2 && inspectors.length && roll() < (state.day >= FINALE_DAY ? 0.5 : 0.18) * inspectorMul();
  const list = wantInspector ? inspectors : (others.length ? others : source);
  if (!list.length) return null;
  const c = list[Math.floor(roll() * list.length)];
  state.usedCallers.add(c.id);
  return c;
}
