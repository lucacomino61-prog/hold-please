// Mr. Krull's review lines written by the live brain from the day's own transcripts, the way the original's boss
// roasts each recorded call. Asked for when the shift ends (the team is still walking to the review room); the
// slides keep their written lines when the brain is off, slow, or answers with something unusable.
import { settings } from './state';
import { getBrain } from './brain';
import { proxyBase } from './brain/claude';
import { lang } from '../i18n';

const LANGUAGE: Record<string, string> = { en: 'English', sq: 'Albanian', it: 'Italian' };
// his own written lines, as the model's examples of how he talks
const EXAMPLES = [
  '3 CALLS AND NOT ONE SALE. THE PHONE WAS NOT THE PROBLEM.',
  'YOU SAID THIS. OUT LOUD. TO A CUSTOMER. I HAVE PLAYED IT TO MY MOTHER.',
  '2 SALES. MY NEPHEW CLOSES MORE AND HE IS A GOOSE.',
  'YOU SOLD THE MOON FOR $40. THE MOON IS WORTH MORE THAN $40. I CHECKED.',
];

export interface SlideNote { title: string; shows: string }

/** one line per slide, in order, or null; never throws */
export async function writeKrullLines(slides: SlideNote[], facts: string, ms = 10_000): Promise<string[] | null> {
  if (!slides.length || getBrain().name !== 'live' || !proxyBase()) return null;
  const system = [
    'You are Mr. Krull, the floor manager of Sunrise Customer Care, a cartoon call centre in Port Fortune that sells impossible products (acres of the Moon, a warranty on the Sun, a gravity subscription).',
    "Tonight you review one agent's shift on a projector, slide by slide, in front of the whole floor.",
    `For each of the ${slides.length} slides, write what you say while it is on screen.`,
    'Rules: ALL CAPITALS. One to three short sentences, plain everyday words, at most 25 words in all. Every line must make sense on its own and be about what that slide shows: use its numbers, names and the agent\'s own words.',
    'Do not name the slide or number it. Deadpan and savage, never confused or poetic. Mock the agent, never the callers. No advice about real scams, no slurs' + (settings.family ? ', no swearing, nothing rude' : '') + '.',
    `How you talk: ${EXAMPLES.join(' | ')}`,
    `Write in ${LANGUAGE[lang()] ?? 'English'}.`,
    `Answer with JSON only: {"lines": [${slides.map((_, i) => `"line for slide ${i + 1}"`).join(', ')}]}`,
  ].join('\n');
  const user = [`SLIDES:`, ...slides.map((s, i) => `${i + 1}. ${s.title} — on screen: ${s.shows}`), '', 'TONIGHT:', facts].join('\n').slice(0, 7000);
  try {
    const res = await fetch(proxyBase() + '/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Llama 3.3 70B wrote the cleanest deadpan of the free models on this prompt (2026-10-28: gpt-oss-120b misspelt,
      // gpt-oss-20b read out numbers); one review a shift costs next to nothing
      body: JSON.stringify({ provider: 'auto', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', seed: 'krull-review', system, messages: [{ role: 'user', content: user }], max_tokens: 400 }),
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    const j = await res.json() as { text?: string };
    const m = String(j.text ?? '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const lines = (JSON.parse(m[0]) as { lines?: unknown }).lines;
    if (!Array.isArray(lines) || !lines.length) return null;
    // fewer lines than slides: the first slides get them, the rest keep their written lines
    return slides.map((_, i) => lines[i]).map((l) => {
      const s = String(l ?? '').replace(/^["'“”\s]+|["'“”\s]+$/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
        // "SLIDE 2:", "FIRST SLIDE —": the model naming the slide out loud
        .replace(/^(?:(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|LAST|NEXT|FINAL)\s+SLIDE|SLIDE\s*\d+)\s*[:.,—–-]\s*/, '');
      // too long, empty, or a placeholder echoed back: that slide keeps its written line
      const words = s.split(' ').length;
      return s.length < 8 || words > 34 || /LINE FOR SLIDE/.test(s) ? '' : s.slice(0, 220);
    });
  } catch {
    return null;
  }
}
