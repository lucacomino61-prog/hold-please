// Run state, settings and a tiny event bus. Everything else reads from here.

export type Phase = 'title' | 'break' | 'floor' | 'shift' | 'review' | 'unlock' | 'fired';

// The "scams" are impossible products sold to cartoon creatures: nothing here works on a person.
export type ScamId =
  | 'moon' | 'sun' | 'gravity' | 'clouds' | 'vowels' | 'haunt' | 'petwifi' | 'runes' | 'beancoin' | 'fridge'
  | 'volcano' | 'silence' | 'shadow' | 'tuesday' | 'echo' | 'dream' | 'rainbow'
  | 'weather' | 'shadowtax' | 'gravityrefund' | 'birthday' | 'nobel' | 'cavedive' | 'echolease' | 'subway' | 'ghostdentist' | 'timezone' | 'remote';

export const STARTER_SCAMS: ScamId[] = ['moon', 'sun', 'gravity'];

export interface Line { who: 'caller' | 'you' | 'note'; text: string; t: number; delta?: number }

export interface CallRecord {
  callerId: string;
  name: string;
  archetype: string;
  startedAt: number;
  endedAt?: number;
  trustEnd: number;
  trustMin: number;
  payouts: { scam: ScamId; amount: number }[];
  lines: Line[];
  hungUpBy: 'you' | 'caller' | 'shift' | 'transfer' | null;
  virus?: boolean;
  suspicionMax?: number;   // how suspicious the caller got (0–100)
  busted?: boolean;        // they hung up because they saw through you
}

export interface Settings {
  playerName: string;
  voiceIn: boolean;
  voiceOut: boolean;
  brain: 'scripted' | 'free' | 'claude' | 'chat';
  apiKey: string;
  model: string;
  workerUrl: string;
  shiftMinutes: number;
  motion: 'on' | 'off';
  sound: boolean;
  skipFloor: boolean;
  /** co-op: the shirt the others see, and the room server (empty = the build's default, see src/net/room.ts) */
  shirt: string;
  roomServer: string;
  /** co-op: list the rooms you host in the public lobby */
  roomPublic: boolean;
  /** who rings: 'people' = only the Character Creator's callers once there are any (the built-in creatures stay out), 'all' = everyone */
  callerPool: 'all' | 'people';
  lang: 'en' | 'sq' | 'it';   // the language of the office (i18n.ts); callers answer in whatever you write
  musicVolume: number;        // Hold FM's real tracks (music.ts), 0–1
}

const DEFAULT_SETTINGS: Settings = {
  playerName: 'Agent',
  voiceIn: false,
  voiceOut: true,
  brain: 'scripted',
  apiKey: '',
  model: 'claude-opus-5-5',
  workerUrl: '',
  shiftMinutes: 10,
  motion: 'on',
  sound: true,
  skipFloor: false,
  shirt: '#2bb3a3',
  roomServer: '',
  roomPublic: false,
  callerPool: 'people',
  lang: 'en',
  musicVolume: 0.5,
};

export const settings: Settings = loadSettings();

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('hp.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* private mode etc. */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(): void {
  try { localStorage.setItem('hp.settings', JSON.stringify(settings)); } catch { /* ignore */ }
  document.documentElement.dataset.motion = settings.motion;
}

export const QUOTAS = [600, 950, 1400, 1950, 2600, 3400, 4300, 5400];
/** the Bureau raids the building on this day; survive its shift and the run ends well */
export const FINALE_DAY = 10;

export function quotaFor(day: number): number {
  if (day <= QUOTAS.length) return QUOTAS[day - 1];
  let q = QUOTAS[QUOTAS.length - 1];
  for (let d = QUOTAS.length; d < day; d++) q = Math.round((q * 1.25) / 50) * 50;
  return q;
}

/** a colleague on the floor: one of the three scripted ones solo, a real player in co-op (then with an id) */
export interface Colleague { name: string; earned: number; shirt: string; seat: number; id?: string }

export const state = {
  phase: 'title' as Phase,
  day: 1,
  quota: quotaFor(1),
  personal: 0,
  team: 0,
  earnedToday: 0,
  shiftTotal: 10 * 60_000,
  shiftLeft: 10 * 60_000,
  owned: new Set<ScamId>(STARTER_SCAMS),
  calls: [] as CallRecord[],
  allCalls: [] as CallRecord[],
  history: [] as string[],
  casinoNet: 0,
  casinoToday: 0,
  dumplings: 0,
  virus: false,
  strikes: 0,
  inventory: [] as string[],
  cosmetics: [] as string[],   // desk cosmetics bought in the market (plant, trophy, chair, monitor)
  colleagues: [] as Colleague[],
  date: new Date(2026, 7, 26, 23, 0, 0),
  seed: Math.floor(Math.random() * 1e9),
  usedCallers: new Set<string>(),
  runId: 0,
  scene: '' as string,          // what a caller could hear on your end right now (scene.ts)
  caseSlips: [] as { day: number; kind: 'file' | 'busted' | 'insult'; text: string }[],  // Inspector Vane's file (case.ts)
  abducted: [] as string[],     // colleagues taken by the UFO today (events.ts); back tomorrow
  carryStrike: false,           // slipped out of the review through the door: tomorrow starts on strike one
  firedByKrull: false,          // Krull's office went badly: the review fails whatever the quota says
  mode: 'run' as 'run' | 'daily' | 'weekly',   // a seeded one-shift challenge (title.ts) or the ordinary run
  modeKey: '',                  // the day or the week the challenge belongs to
  rivalBurning: false,          // the market's air strike landed across the street today
  gooseMode: false,             // the Konami code: every portrait is a goose (goose.ts)
};

export function resetRun(): void {
  state.phase = 'title';
  state.carryStrike = false;
  state.firedByKrull = false;
  state.mode = 'run'; state.modeKey = '';
  state.rivalBurning = false;
  state.gooseMode = false;
  state.day = 1;
  state.quota = quotaFor(1);
  state.personal = 0;
  state.team = 0;
  state.earnedToday = 0;
  state.shiftTotal = settings.shiftMinutes * 60_000;
  state.shiftLeft = state.shiftTotal;
  state.owned = new Set<ScamId>(STARTER_SCAMS);
  state.calls = [];
  state.allCalls = [];
  state.history = [];
  state.casinoNet = 0;
  state.casinoToday = 0;
  state.dumplings = 0;
  state.virus = false;
  state.strikes = 0;
  state.inventory = [];
  state.cosmetics = [];
  state.colleagues = [
    { name: 'Teodora', earned: 0, shirt: '#2bb3a3', seat: 1 },
    { name: 'Jun', earned: 0, shirt: '#e9c84a', seat: 2 },
    { name: 'Baxter', earned: 0, shirt: '#d94b4b', seat: 3 },
  ];
  state.date = new Date(2026, 7, 26, 23, 0, 0);
  state.seed = Math.floor(Math.random() * 1e9);
  state.usedCallers = new Set();
  state.runId++;
  state.scene = '';
  state.caseSlips = [];
  state.abducted = [];
}

// ----- bus -----
type Handler = (detail: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

export const bus = {
  on<T = unknown>(type: string, fn: (detail: T) => void): () => void {
    let set = handlers.get(type);
    if (!set) { set = new Set(); handlers.set(type, set); }
    set.add(fn as Handler);
    return () => set!.delete(fn as Handler);
  },
  emit(type: string, detail?: unknown): void {
    handlers.get(type)?.forEach((fn) => { try { fn(detail); } catch (e) { console.error(e); } });
  },
};

// ----- money -----
// In co-op the TEAM total belongs to the room: a sale is added here at once (so the HUD ticks) and reported through
// the 'earn' event; the room's next state overwrites `team` with the truth. `earnedToday` is then this player's own
// sales today, which is what a raid or an air strike at this desk can take.
export function addMoney(amount: number, source: ScamId | 'colleague' | 'bonus', opts: { quiet?: boolean } = {}): void {
  amount = Math.round(amount);
  if (amount <= 0) return;
  if (source !== 'colleague') { state.personal += amount; }
  state.team += amount;
  state.earnedToday += amount;
  bus.emit('money');
  if (source !== 'colleague' && source !== 'bonus') bus.emit('earn', { amount, source });
  if (!opts.quiet) bus.emit('payout', { amount, source });
}

export function losePersonal(amount: number): void {
  amount = Math.round(amount);
  state.personal = Math.max(0, state.personal - amount);
  bus.emit('money');
}

export function loseTeam(amount: number, reason: string): void {
  amount = Math.min(Math.round(amount), state.earnedToday);
  if (amount <= 0) return;
  state.team = Math.max(0, state.team - amount);
  state.earnedToday = Math.max(0, state.earnedToday - amount);
  bus.emit('money');
  bus.emit('loss', { amount, reason });
}

export function spend(amount: number): boolean {
  if (state.personal < amount) return false;
  state.personal -= amount;
  bus.emit('money');
  return true;
}

export function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// deterministic-ish random helpers
export function rand(): number { return Math.random(); }
export function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
export function between(a: number, b: number): number { return a + Math.random() * (b - a); }
export function chance(p: number): boolean { return Math.random() < p; }
