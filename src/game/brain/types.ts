import type { Line, ScamId } from '../state';
import type { PortraitSpec } from '../../os/portrait';
import type { Style } from './style';

// Every caller is a creature or an absurd being; the products are impossible.
export type Archetype = 'creature' | 'machine' | 'spirit' | 'legend' | 'cosmic' | 'inspector';

export type GiveKind =
  | 'crater' | 'sunserial' | 'gravitypin' | 'cumulus' | 'vowelname' | 'hauntref' | 'petplan' | 'rune' | 'bean' | 'fridgecode'
  | 'lavaweek' | 'quietword' | 'shadows' | 'tuesday' | 'echoword' | 'dreamcode' | 'colours'
  | 'sky' | 'shadowlength' | 'fallcount' | 'birthmonth' | 'nobelfield' | 'depth' | 'echocount' | 'station' | 'toothcount' | 'zonehours' | 'viewcode';

/** a verification question the caller asks when they start doubting you; `accept` is what passes it:
 *  a RegExp on the answer, or 'name' (the player's own name), 'company' (Sunrise Customer Care),
 *  'answer' (the caller's own answer words) or 'world' (any of the caller's world words) */
export interface Challenge { ask: string; accept: RegExp | 'name' | 'company' | 'answer' | 'world'; pass: string; fail: string }

export interface Caller {
  id: string;
  name: string;
  archetype: Archetype;
  gimmick: string;          // one sentence, used by the LLM and the log
  world: string[];          // words that mean "you are playing along" (improv: yes, and…)
  openers: string[];        // first line when answered
  quirks: string[];         // flavour lines
  question: string;         // something they keep asking; answering it warms them up
  answer: string[];         // words that count as an answer
  voice: { pitch: number; rate: number; prefer?: 'male' | 'female' };
  mood0: number;
  patience: number;         // seconds
  likes: ScamId[];          // products this character finds exciting (comedy, not profiling)
  portrait: Partial<PortraitSpec>;
  budget: number;           // what they will agree to pay for an acre of moon or a cloud
  vip?: boolean;            // a celebrity: rare, rich, and very hard to please
  lines?: Partial<Record<string, string[]>>; // the caller's own replies by reaction (greet, who, why, early, ...); the archetype's lines fill the gaps
  // ---- suspicion: how wary this caller is and how they test you (brain/personas.ts fills the gaps) ----
  wary?: number;            // 0 (believes anything) … 1 (paranoid); how fast suspicion grows
  suspicions?: string[];    // their own "hold on a minute" lines
  challenges?: Challenge[]; // their own verification questions
  byeSuspicious?: string[]; // how they hang up on someone they have decided is up to something
  tags?: string[];          // free words for the Character Creator / the LLM ("pet", "sea", "office")
  style?: Partial<Pick<Style, 'tics' | 'register' | 'describe' | 'laugh'>>; // how they talk (brain/style.ts reads the rest from who they are)
}

export interface Persona { wary: number; suspicions: string[]; challenges: Challenge[]; byeSuspicious: string[] }

export interface CallCtx {
  caller: Caller;
  mood: number;
  turn: number;
  given: Partial<Record<GiveKind, string>>;
  asked: Set<GiveKind>;
  pitched: Set<ScamId>;
  answered: boolean;
  lines: Line[];
  playerName: string;
  owned: Set<ScamId>;
  values: Record<GiveKind, string>;
  baitAsks: number;
  withdrawPending: boolean;
  // memory the scripted brain keeps across the call
  topics: string[];
  lastSaid: string[];
  nudges: number;
  yourLines: string[];
  claimedName?: string;
  // suspicion (0–100): asking too early, pressure, contradictions and greed raise it; rapport lowers it
  suspicion: number;
  challenge: Challenge | null;  // the open verification question, if any
  challengeTurns: number;       // turns the player has had to answer it
  challengesUsed: number;
  challengesFailed: number;     // after a failed test the caller watches you: suspicion climbs faster
  claims: { name?: string; company?: string };  // what the player said about themselves (contradictions are noticed)
  askStreak: number;            // asks for the item in a row
  sceneSaid?: string;           // the background event this caller has already remarked on (scene.ts)
}

export interface Turn {
  say: string;
  moodDelta: number;
  mood: 'calm' | 'angry' | 'happy';
  gives?: { kind: GiveKind; value: string };
  hangUp?: boolean;
  virus?: boolean;
  withdraw?: boolean;
  intent?: string;
  suspicionDelta?: number;
  challenge?: boolean;          // this turn the caller is testing the player
}

export interface CallerBrain {
  name: string;
  open(ctx: CallCtx): Promise<Turn>;
  respond(ctx: CallCtx, text: string): Promise<Turn>;
}
