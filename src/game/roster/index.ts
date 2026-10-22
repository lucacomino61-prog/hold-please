// The big roster is gone: on 2026-10-20 Luca asked for the 172 invented callers (creatures, machines, spirits,
// legends, cosmic, inspectors) to be deleted so that only real people ring (public/packs/albanian-*.json through the
// Character Creator). The family files were removed; `expand` stays so a seed file can be brought back by importing
// it here and spreading it into SEEDS. callers.ts still appends EXTRA_ROSTER (now empty) to its own 28.
import type { Archetype, Caller } from '../brain/types';
import type { PortraitKind } from '../../os/portrait';
import type { Seed } from './seed';

const DEFAULT_KIND: Record<Archetype, PortraitKind> = { creature: 'bear', machine: 'robot', spirit: 'ghost', legend: 'human', cosmic: 'alien', inspector: 'trenchcoat' };

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function expand(s: Seed): Caller {
  const h = hash(s.id);
  const pick = (n: number) => (h >>> (n * 4)) & 15;
  const pitch = s.voice?.pitch ?? Number((0.7 + (pick(0) / 15) * 0.9).toFixed(2));   // 0.7 … 1.6
  const rate = s.voice?.rate ?? Number((0.85 + (pick(1) / 15) * 0.4).toFixed(2));    // 0.85 … 1.25
  return {
    id: s.id,
    name: s.name,
    archetype: s.arch,
    gimmick: s.gimmick,
    world: s.world,
    openers: s.openers,
    quirks: s.quirks,
    question: s.question,
    answer: s.answer,
    voice: { pitch, rate, ...(s.voice?.prefer ? { prefer: s.voice.prefer } : {}) },
    mood0: s.mood ?? 45,
    patience: s.patience ?? (s.arch === 'inspector' ? 200 : 140),
    likes: s.likes,
    portrait: { kind: s.kind ?? DEFAULT_KIND[s.arch], ...(s.look ?? {}) },
    budget: s.budget ?? 300,
    wary: s.wary,
    suspicions: s.sus,
    challenges: s.test ? [{ ask: s.test[0], accept: s.test[1], pass: s.test[2], fail: s.test[3] }] : undefined,
    byeSuspicious: s.bye,
    tags: s.tags,
  };
}

export const SEEDS: Seed[] = [];
export const EXTRA_ROSTER: Caller[] = SEEDS.map(expand);
