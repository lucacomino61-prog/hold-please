// A caller in short form. The roster files hold a few hundred of these; roster/index.ts turns each into a full Caller
// (voice, portrait and patience filled in from the id's hash when the seed leaves them out).
import type { Archetype, Challenge } from '../brain/types';
import type { ScamId } from '../state';
import type { PortraitKind, PortraitSpec } from '../../os/portrait';

export interface Seed {
  id: string;
  name: string;
  arch: Archetype;
  kind?: PortraitKind;       // the drawing (see os/portrait.ts); defaults by archetype
  gimmick: string;           // one sentence: who they are and what the joke is
  world: string[];           // words that mean "you are playing along"
  openers: string[];         // first line when answered
  quirks: string[];          // idle flavour
  question: string;          // what they keep asking; answering it warms them up
  answer: string[];          // words that count as an answer
  likes: ScamId[];           // products they find exciting
  mood?: number;             // starting mood (default 45)
  patience?: number;         // seconds (default 140)
  budget?: number;           // what they will pay for an acre of the Moon (default 300)
  wary?: number;             // 0 believes anything … 1 paranoid (default by archetype)
  voice?: { pitch?: number; rate?: number; prefer?: 'male' | 'female' };
  sus?: string[];            // their own "hold on a minute" lines
  test?: [ask: string, accept: Challenge['accept'], pass: string, fail: string]; // their own verification question
  bye?: string[];            // how they hang up on someone they have seen through
  look?: Partial<PortraitSpec>;
  tags?: string[];
}
