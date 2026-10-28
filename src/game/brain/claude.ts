// The live brain: a language model plays the caller. Three ways in, all with the same Turn shape as the scripted
// brain, so the apps never know who is talking:
//   free   Cloudflare Workers AI through the brain proxy (brain/worker.ts): no key, the account's free allocation
//   claude Claude through the proxy's key, or straight to api.anthropic.com with the player's own key
//   chat   an OpenAI-compatible provider the proxy holds a key for (OpenRouter, Groq, …)
// Falls back to the scripted brain on any error, mid-call.
import type { CallCtx, CallerBrain, GiveKind, Turn } from './types';
import { scriptedBrain, gateFor } from './scripted';
import { isPushy, passes, personaFor, suspicionGainFor, waryWord } from './personas';
import { SCAMS } from '../scams';
import { settings, state } from '../state';
import { stripVowels } from '../values';
import { howTheyTalk } from './style';
import { priorText, priorWith } from '../memory';
import { SCENE_TEXT, type SceneKind } from '../scene';
import { mutatorSuspicion } from '../mutators';
import { caseFacts } from '../case';
import { lang, t } from '../../i18n';
import type { Challenge } from './types';

/** the office language, as the model is told it; English play needs no line */
const LANG_NAME = { sq: 'Albanian (shqip)', it: 'Italian (italiano)' } as const;
/** the game reads pitches, asks and verification answers with English patterns; in Albanian or Italian the model judges them */
const foreignPlay = (): boolean => lang() !== 'en';
// when the model fails a turn in Albanian or Italian, the built-in brain would answer in English: the caller
// blames the line instead, in the office language; two failures in a row hand the turn to the built-in brain
const STALL_OPEN = ['Hello? Hello? The line is terrible. Who is this?', 'Hello? Is this Sunrise Customer Care? Speak up, the line is bad.'];
const STALL = ['Sorry, the line crackled. Say that again?', 'Hello? You broke up there. What did you say?', 'One moment, the line is terrible. Again, please?'];
const failures = new WeakMap<CallCtx, number>();
const stallTurn = (pool: string[], intent: string): Turn => ({ say: t(pool[Math.floor(Math.random() * pool.length)]), moodDelta: 0, mood: 'calm', intent });

const KINDS: GiveKind[] = ['crater', 'sunserial', 'gravitypin', 'cumulus', 'vowelname', 'hauntref', 'petplan', 'rune', 'bean', 'fridgecode', 'lavaweek', 'quietword', 'shadows', 'tuesday', 'echoword', 'dreamcode', 'colours', 'sky', 'shadowlength', 'fallcount', 'birthmonth', 'nobelfield', 'depth', 'echocount', 'station', 'toothcount', 'zonehours', 'viewcode', 'starclue', 'crateword'];

export type Provider = 'auto' | 'cf' | 'anthropic' | 'chat';
export interface ProxyInfo { ok: boolean; key: boolean; ai: boolean; chat: boolean; stt?: boolean; models?: Partial<Record<'cf' | 'chat' | 'anthropic', string | string[]>>; providers?: { name: string; models: string[]; key: boolean; resting: boolean }[] }

// the brain proxy keeps the keys server-side; set in .env.development / .env.production
export const PROXY_URL: string = (import.meta.env.VITE_BRAIN_URL as string | undefined) ?? '';
export function proxyUrl(): string { return settings.workerUrl || PROXY_URL; }
export function proxyBase(): string { return proxyUrl().replace(/\/v1\/(messages|chat)\/?$/, '').replace(/\/$/, ''); }
export function liveBrainConfigured(): boolean { return !!(settings.apiKey || proxyUrl()); }

let info: ProxyInfo | null = null;
export async function checkProxy(): Promise<boolean> {
  const base = proxyBase();
  if (!base) return false;
  try {
    const res = await fetch(base + '/health', { signal: AbortSignal.timeout(4000) });
    const j = await res.json() as Partial<ProxyInfo>;
    info = { ok: !!j.ok, key: !!j.key, ai: !!j.ai, chat: !!j.chat, stt: !!j.stt, models: j.models, providers: j.providers };
  } catch { info = { ok: false, key: false, ai: false, chat: false }; }
  return info.ok && (info.ai || info.key || info.chat);
}
export function proxyState(): boolean | null { return info ? info.ok && (info.ai || info.key || info.chat) : null; }
export function proxyInfo(): ProxyInfo | null { return info; }

/** which provider plays the callers: the player's choice, else the free chain (Workers AI, then every free key, Claude last) */
export function providerFor(): Provider {
  if (settings.brain === 'claude') return 'anthropic';
  if (settings.brain === 'chat') return 'chat';
  if (settings.brain === 'free') return 'auto';
  if (info && !info.ai && !info.chat && info.key) return 'anthropic';
  return settings.apiKey && !proxyBase() ? 'anthropic' : 'auto';
}
export function providerLabel(p: Provider = providerFor()): string { return p === 'auto' || p === 'cf' ? 'Free AI' : p === 'anthropic' ? 'Claude' : 'OpenRouter'; }
/** the model that answers first, for the shift-start message: the player's own pick when the provider takes it,
 *  else the first one the proxy reported (the Claude setting means nothing to the free chain) */
export function modelLabel(p: Provider = providerFor()): string {
  const first = (x: string | string[] | undefined): string => (Array.isArray(x) ? x[0] : x) || '';
  const own = modelFor(p === 'auto' ? 'cf' : p);
  const m = own || (p === 'anthropic' ? first(info?.models?.anthropic) : p === 'chat' ? first(info?.models?.chat) : first(info?.models?.cf));
  return m.replace(/^@cf\/[^/]+\//, '');
}

/** a model the player typed in Settings; the proxy puts it first in its own family and ignores anything it does not know */
function modelFor(p: Provider): string | undefined {
  const m = (settings.model || '').trim();
  if (!m) return undefined;
  if (p === 'anthropic') return m.startsWith('claude-') ? m : undefined;
  if (p === 'cf') return m.startsWith('@cf/') ? m : undefined;
  if (p === 'chat') return m.startsWith('claude-') || m.startsWith('@cf/') ? undefined : m;
  return m;
}

function valueFor(ctx: CallCtx, kind: GiveKind): string {
  if (kind === 'vowelname') return stripVowels(ctx.caller.name.split(',')[0]).replace(/\s+/g, ' ').trim();
  if (kind === 'bean') return String(Math.min(ctx.caller.budget, 100 + Math.round(Math.random() * 6) * 50));
  return ctx.values[kind];
}

function system(ctx: CallCtx, testNow: Challenge | null = null): string {
  const c = ctx.caller;
  const foreign = foreignPlay();
  const language = foreign ? LANG_NAME[lang() as 'sq' | 'it'] : '';
  const persona = personaFor(c);
  const products = SCAMS.filter((s) => ctx.owned.has(s.id)).map((s) => {
    return `- ${s.name} (${s.tagline}) — they must pitch it, then ask you for your "${s.needs}"; hand it over only when your mood is at least ${gateFor(ctx, s)}, by setting "gives": {"kind": "${s.needs}"}. The game then says the exact value for you: never invent, guess or name the value yourself, in any turn.`;
  }).join('\n');
  const inspector = c.archetype === 'inspector'
    ? `\nYou are secretly an inspector from the Bureau of Nonsense. Your whole goal is to get the PLAYER to agree to open your file / click Allow / click Yes. You never buy anything and never hand over any value. If the player clearly agrees (yes, ok, sure, allow, open, click), set "virus": true and "hangUp": true and gloat.`
    : '';
  // where the call stands, so the reply fits the moment instead of drifting
  const owned = SCAMS.filter((s) => ctx.owned.has(s.id));
  const pitchedOpen = owned.filter((s) => ctx.pitched.has(s.id) && !ctx.given[s.needs]);
  const sold = owned.filter((s) => !!ctx.given[s.needs]);
  const liked = owned.filter((s) => c.likes.includes(s.id)).map((s) => s.name);
  const situation = c.archetype === 'inspector' ? ''
    : ctx.turn === 0 ? 'The call has just started: the player has not said what they are selling. Be yourself, be curious or wary, ask what this is about.'
    : sold.length && !pitchedOpen.length ? `A sale is done (${sold.map((s) => s.name).join(', ')}). Be pleased or relieved in your own way; if they fish for something else, make them earn it again.`
    : pitchedOpen.length ? `They have pitched ${pitchedOpen.map((s) => s.name).join(' and ')} but have not asked you for the ${pitchedOpen.map((s) => s.needs).join('/')} yet. React to that product as this character would${liked.some((n) => pitchedOpen.some((s) => s.name === n)) ? ' (you secretly love it)' : ' (you are lukewarm about it)'}; if your mood is at the threshold, hint that you would need to know what to do next.`
    : foreign ? 'Judge from the conversation which product, if any, the player has pitched and whether they have asked you for its item. Hand over only an item they asked for, for a product they pitched; until then react to what they said and nudge them to say what they are offering.'
    : 'They have not pitched any product yet: do not hand anything over; react to what they said and nudge them to say what they are offering.';
  const facts = [
    situation,
    liked.length ? `Products this character gets excited about: ${liked.join(', ')}; the others leave you lukewarm. Your budget for a plot on the Moon: $${c.budget}.` : `Your budget for a plot on the Moon: $${c.budget}.`,
    ctx.topics.length ? `Things the player has played along with so far: ${ctx.topics.join(', ')}.` : '',
    ctx.pitched.size ? `Products already pitched: ${[...ctx.pitched].join(', ')}.` : '',
    Object.keys(ctx.given).length ? `You already handed over: ${Object.keys(ctx.given).join(', ')} (never repeat those).` : '',
    ctx.answered ? 'The player answered your question already; do not ask it again.' : foreign ? 'Ask your question again only if the player has not answered it yet, at most every two or three turns.' : 'Your question has not been answered yet; work it in every two or three turns.',
    ctx.claims.name ? `The player said their name is ${ctx.claims.name}.` : '',
    ctx.claims.company ? `The player said they are from ${ctx.claims.company}.` : '',
    ctx.challenge ? `You asked them a verification question ("${ctx.challenge.ask}") and are waiting for a proper answer.${foreign ? ' You judge their answer: set "suspicionDelta" to -15 if it answers the question well, or +10 if it dodges it.' : ''}`
      : testNow ? `This turn, test them: work this verification question into your reply, in your own words and in ${language}: "${testNow.ask}". Hand nothing over this turn.`
      : ctx.challengesUsed ? 'You have tested them already; do not test them again.' : '',
    c.archetype !== 'inspector' ? priorText(priorWith(c.id), ctx.claims.name ?? ctx.playerName) : c.id === 'vane' ? caseFacts() : '',
    ctx.baiter ? `SECRET: tonight you are a scambaiter, wasting this agent's time on purpose. Sound eager and friendly, but never hand anything over, whatever they say. Stall: ask them to repeat things, to spell their name, to wait while you find your glasses, to give you their supervisor's name. Never say you are a scambaiter.` : '',
    state.scene && ctx.sceneSaid !== state.scene ? `Background on the player's end right now: ${SCENE_TEXT[state.scene as Exclude<SceneKind, ''>]}. You may remark on it once, in character, then let it go.` : '',
  ].filter(Boolean).join('\n');
  if (state.scene) ctx.sceneSaid = state.scene;
  const vip = c.vip ? '\nYou are a celebrity in this world: busy, vain, suspicious of strangers, used to people wanting things from you. You warm up slowly and only to genuine wit, flattery that is specific to your work, and people who know your world. You name-drop your own achievements. Money is nothing to you; your time is everything.' : '';
  const susBlock = c.archetype === 'inspector' ? '' : `
SUSPICION (0–100, now ${ctx.suspicion}): you are ${waryWord(persona.wary)}. It rises when they ask for the item before pitching the product (+8), ask again straight away (+6), push or pressure you ("act now", "last chance") (+10), say "trust me" or "this is not a scam" (+8), threaten (+15), change their story about their name or company (+14), want a second item on the same call (+6), or repeat themselves (+3). It falls when they answer your question (−8), use your name (−3), play along with your world (−3 each), answer your verification question well (−15), or chat kindly (−2).
Your own suspicious lines: ${persona.suspicions.map((s) => `"${s}"`).join(' ')}
When suspicion is high you get wary in your own words; ${foreign ? 'the game tells you in the facts below when to ask a verification question, so never ask one otherwise and never repeat one.' : 'the game itself adds your verification question when it is time and judges the answer, so never ask a verification question yourself and never repeat one.'} Your verification questions, for reference: ${persona.challenges.slice(0, 2).map((ch) => `"${ch.ask}"`).join(' ')}
When suspicion reaches 85, hang up with one of these: ${persona.byeSuspicious.map((s) => `"${s}"`).join(' ')}
You are NOT easy. Never hand anything over before the third exchange, never while suspicion is 55 or more, never before they have pitched that product and asked for the item, and never because they simply insist. But once they HAVE pitched it, asked for the item, your mood is at the threshold and suspicion is under 55, hand it over on that very turn: stalling a player who earned it is not funny.`;
  return `This is a comedy improv phone game. Everything is fictional and absurd. You play ${c.name}: ${c.gimmick}${vip}
How you talk: ${howTheyTalk(c)}
Your world words (things you care about): ${c.world.join(', ')}. A question you like to ask: "${c.question}" (at most twice in a call, never in two replies in a row). Lines you might say when idle: ${c.quirks.map((q) => `"${q}"`).join(' ')}
The player works at Sunrise Customer Care in Port Fortune and is trying to sell you impossible products:
${products}
MOOD (0–100, now ${ctx.mood}): warm up (+4 to +12) when the player greets you, uses your name, plays along with your world ("yes, and…"), answers your question, is kind or funny. Cool down when insulted (−20), told you are not real (−12), rushed (−6) or threatened (−10). Repeating themselves bores you (−4). If they ask who you are or why you called, answer in character. If they mention a price, react to the price. When your mood is above a product's threshold and they have pitched it but not asked for the closing item, nudge them ("so what do you need from me?").${susBlock}
Stay in character, be funny and specific, keep replies to 1–3 short sentences, never explain the game, never use the words "scam" or "improv". "say" is plain spoken sentences only: no markdown, no asterisks or headings, no labels, no stage directions, nothing in capitals except a shout.${foreign ? `
LANGUAGE: the office runs in ${language}. Every "say" is in ${language}, from your very first line, even where earlier lines of this call or the notes above are in English; switch only if the player writes to you in another language, and then answer in theirs. Product names and the JSON keys and "kind" values stay as they are.` : ''}${settings.family ? `
FAMILY MODE: every line stays clean enough for a ten-year-old: no swearing in any language, no insult stronger than "silly", no toilet or bodily humour, nothing sexual or gory. If the player swears, react to the rudeness in character without repeating the word.` : ''}
Facts so far:
${facts}${inspector}
Reply ONLY with JSON on one line: {"say": "...", "moodDelta": <integer -25..12>, "suspicionDelta": <integer -20..20>, "testing": <boolean>, "gives": {"kind": "<one of ${KINDS.join('|')}>"} or null, "hangUp": <boolean>, "virus": <boolean>}. Hang up only when your mood would drop under 5, suspicion reaches 85, or the call is clearly over.`;
}

function messagesFrom(ctx: CallCtx, latest: string): { role: 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const l of ctx.lines.slice(-14)) {
    if (l.who === 'note') continue;
    const role = l.who === 'you' ? 'user' : 'assistant';
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + l.text; else msgs.push({ role, content: l.text });
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: latest });
  if (msgs[0].role === 'assistant') msgs.unshift({ role: 'user', content: '(the player answers the phone)' });
  // the history shows the caller's past turns as plain speech, and weaker models start copying that format;
  // a game note on the newest line keeps them on the one-line JSON the game reads
  msgs[msgs.length - 1] = { role: 'user', content: msgs[msgs.length - 1].content + '\n\n(game note: answer with the one-line JSON object only)' };
  return msgs;
}

async function complete(ctx: CallCtx, msgs: { role: 'user' | 'assistant'; content: string }[], testNow: Challenge | null = null): Promise<string> {
  const sys = system(ctx, testNow);
  const text = await completeRaw(ctx, sys, msgs);
  // development only: a probe can read what the model was told and what it decided
  if (import.meta.env.DEV) (window as unknown as { __hpBrainLog?: unknown[] }).__hpBrainLog?.push({ sys, msgs, text });
  return text;
}

async function completeRaw(ctx: CallCtx, sys: string, msgs: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  const proxy = proxyBase();
  const direct = !!settings.apiKey && (settings.brain === 'claude' || !proxy);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    if (direct) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'x-api-key': settings.apiKey, 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: modelFor('anthropic') || 'claude-opus-5-5', max_tokens: 300, system: sys, messages: msgs, output_config: { effort: 'low' }, fallbacks: 'default' }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] };
      if (data.stop_reason === 'refusal') throw new Error('refusal');
      return (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    }
    if (!proxy) throw new Error('no brain configured');
    const provider = providerFor();
    const res = await fetch(proxy + '/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // the seed pins this caller to one model for the whole call and spreads the calls over every free model and key
      body: JSON.stringify({ provider, model: modelFor(provider), seed: ctx.caller.id, system: sys, messages: msgs, max_tokens: 300 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json() as { text?: string; error?: string };
    if (!data.text) throw new Error(data.error || 'empty');
    return data.text;
  } finally { clearTimeout(timer); }
}

type Raw = { say?: string; moodDelta?: number; suspicionDelta?: number; testing?: boolean; gives?: { kind?: string; value?: string } | null; hangUp?: boolean; virus?: boolean };

function parse(text: string): Raw {
  let cleaned = text.replace(/```(?:json)?/g, '').trim();
  // a reply that lost its opening brace ("say": "…", …) is still JSON underneath
  if (/^"?say"\s*:/.test(cleaned)) cleaned = '{' + (cleaned.startsWith('"') ? '' : '"') + cleaned;
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]) as Raw; } catch { /* fall through */ }
    try { return JSON.parse(m[0].replace(/,\s*\}/g, '}').replace(/[“”]/g, '"')) as Raw; } catch { /* fall through */ }
  }
  // broken JSON (an unescaped quote in the line, two objects, a trailing comment): salvage the fields one by one
  const spoken = cleaned.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/) ?? cleaned.match(/"say"\s*:\s*"([^"]*)/);
  if (spoken) {
    const num = (k: string) => { const m = cleaned.match(new RegExp(`"${k}"\\s*:\\s*(-?\\d+)`)); return m ? Number(m[1]) : 0; };
    const bool = (k: string) => new RegExp(`"${k}"\\s*:\\s*true`).test(cleaned);
    const kind = cleaned.match(/"gives"\s*:\s*\{[^}]*"kind"\s*:\s*"([a-z]+)"/);
    return { say: spoken[1].replace(/\\"/g, '"').replace(/\\n/g, ' '), moodDelta: num('moodDelta'), suspicionDelta: num('suspicionDelta'), testing: bool('testing'), gives: kind ? { kind: kind[1] } : null, hangUp: bool('hangUp'), virus: bool('virus') };
  }
  // half-written JSON with no line in it is never read out loud: the built-in brain takes this turn instead
  if (/moodDelta|suspicionDelta/.test(cleaned)) throw new Error('broken json');
  // a model that answered in plain words still played the part: take the words, change nothing else
  const say = cleaned.replace(/^[^A-Za-z(]*/, '').split('\n')[0].trim();
  if (!say) throw new Error('no json');
  return { say, moodDelta: 0, suspicionDelta: 0 };
}

const PUSHY = /\b(last chance|only today|act now|final offer|expires|limited time|you must|you have to|do it now|before it'?s too late|right now|immediately|hurry|quick(ly)?|trust me|not a scam|isn'?t a scam|no scam|legit|i promise|believe me|or else|i'?ll (hurt|find|report|destroy|sue)|you'?ll (regret|pay)|i know where)\b/i;

/** what the caller actually says: no markdown, no code fences, no "PROBABLE HALF BREAK Q:" style labels or "Say:" prefixes */
export function cleanSay(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`~]+/g, '')
    .replace(/^\s*(?:[A-Z][A-Z0-9/-]*(?: [A-Z][A-Z0-9/-]*)+\s*:\s*)+/, '')   // two or more capitalised words and a colon: a heading, not speech
    .replace(/^\s*(?:say|reply|answer|response|caller|line|speech|output)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“](.*)["”]$/, '$1')
    .trim();
}

async function ask(ctx: CallCtx, msgs: { role: 'user' | 'assistant'; content: string }[]): Promise<Turn> {
  // in Albanian or Italian the caller asks its verification question itself, in that language: the game decides
  // the test before the request (on the suspicion so far) instead of pasting an English question onto the reply
  const foreign = foreignPlay();
  const persona0 = personaFor(ctx.caller);
  const testNow = foreign && ctx.caller.archetype !== 'inspector' && !ctx.challenge && ctx.turn >= 1 && ctx.suspicion >= 40 && ctx.suspicion < 85 && ctx.challengesUsed < Math.min(2, persona0.challenges.length)
    ? persona0.challenges[ctx.challengesUsed] : null;
  const j = parse(await complete(ctx, msgs, testNow));
  // the game's own rules, whatever the model decided: a line that pushes never earns a hand-over, and the
  // suspicion it earns is at least what the built-in brain would charge for it
  const latest = (msgs.length ? msgs[msgs.length - 1].content : '').replace(/\n\n\(game note: [^)]*\)$/, '');
  const lastIsPlayer = msgs.length > 0 && msgs[msgs.length - 1].role === 'user';
  if (lastIsPlayer && ctx.caller.archetype !== 'inspector') {
    if (isPushy(latest) || PUSHY.test(latest)) j.gives = null;
    const g = suspicionGainFor(ctx, latest);
    if (g > (Number(j.suspicionDelta) || 0)) j.suspicionDelta = g;
  }
  const turn: Turn = {
    say: cleanSay(String(j.say ?? '...')).slice(0, 400) || '...',
    moodDelta: Math.max(-25, Math.min(12, Math.round(Number(j.moodDelta) || 0))),
    mood: 'calm',
    hangUp: !!j.hangUp,
    virus: !!j.virus && ctx.caller.archetype === 'inspector',
    intent: 'llm',
  };
  if (ctx.caller.archetype !== 'inspector') {
    // the model supplies the voice; the game keeps the rules of the suspicion meter, whatever the model decided
    const persona = personaFor(ctx.caller);
    let sd = Math.max(-20, Math.min(20, Math.round((Number(j.suspicionDelta) || 0) * mutatorSuspicion())));
    if (ctx.challenge) {
      // an open verification question is judged by the game, like the built-in brain does; in Albanian or
      // Italian the model's own verdict counts too (it was told to answer a good reply with -15)
      const modelPass = foreign && (Number(j.suspicionDelta) || 0) <= -10;
      if (passes(ctx, ctx.challenge, latest) || modelPass) { ctx.challenge = null; ctx.challengeTurns = 0; sd = modelPass ? Math.min(sd, -15) : sd - 15; turn.intent = 'challenge_pass'; }
      else if (++ctx.challengeTurns >= 2) { ctx.challenge = null; ctx.challengeTurns = 0; ctx.challengesFailed++; sd += 12; turn.intent = 'challenge_fail'; turn.gives = undefined; }
      else { turn.challenge = true; turn.intent = 'challenge'; turn.gives = undefined; }
    } else if (testNow && !turn.hangUp) {
      ctx.challenge = testNow; ctx.challengesUsed++; ctx.challengeTurns = 0;
      turn.challenge = true; turn.intent = 'challenge'; turn.gives = undefined;
    } else if (!foreign && ctx.suspicion + sd >= 40 && ctx.suspicion + sd < 85 && ctx.challengesUsed < Math.min(2, persona.challenges.length) && !turn.hangUp) {
      // suspicion is up: the caller tests the player with one of their own questions (the model's words first)
      const ch = persona.challenges[ctx.challengesUsed++];
      ctx.challenge = ch; ctx.challengeTurns = 0;
      if (!turn.say.toLowerCase().includes(ch.ask.slice(0, 24).toLowerCase())) turn.say = turn.say.replace(/\s*$/, '') + ' ' + ch.ask;
      turn.challenge = true; turn.intent = 'challenge'; turn.gives = undefined;
    }
    const next = Math.max(0, Math.min(100, ctx.suspicion + sd));
    if (next >= 85 && !turn.hangUp) {
      // the stock goodbye is English: in Albanian or Italian the model's own last line stays
      if (!foreign) turn.say = persona.byeSuspicious[Math.floor(Math.random() * persona.byeSuspicious.length)] ?? turn.say;
      turn.hangUp = true; ctx.challenge = null;
    }
    if (turn.hangUp && next >= 85) turn.intent = 'busted';
    if (sd) turn.suspicionDelta = Math.max(-25, Math.min(25, sd));
  }
  // the model decides when to hand over; the game still refuses too-early, too-suspicious and mid-test gives
  if (j.gives && j.gives.kind && KINDS.includes(j.gives.kind as GiveKind) && ctx.caller.archetype !== 'inspector' && !ctx.baiter && ctx.turn >= 2 && ctx.suspicion < 55 && !ctx.challenge && turn.intent !== 'challenge_fail') {
    const kind = j.gives.kind as GiveKind;
    const scam = SCAMS.find((s) => s.needs === kind);
    // the English pitch patterns cannot read Albanian or Italian, so there the model's judgement of the pitch stands
    if (scam && ctx.owned.has(scam.id) && !ctx.given[kind] && (ctx.pitched.has(scam.id) || foreign)) {
      ctx.pitched.add(scam.id);
      const value = valueFor(ctx, kind);
      turn.gives = { kind, value };
      if (!turn.say.includes(value)) turn.say += ` ${value}.`;
    }
  }
  const next = ctx.mood + turn.moodDelta;
  turn.mood = next < 30 ? 'angry' : next >= 70 ? 'happy' : 'calm';
  return turn;
}

export const liveBrain: CallerBrain = {
  name: 'live',
  async open(ctx) {
    if (!liveBrainConfigured()) return scriptedBrain.open(ctx);
    try { const turn = await ask(ctx, [{ role: 'user', content: '(the player answers the phone; open the call in character)' }]); turn.intent = 'open'; return turn; }
    catch (e) {
      console.warn('live brain open failed', e);
      if (foreignPlay()) { failures.set(ctx, 1); return stallTurn(STALL_OPEN, 'open'); }
      return scriptedBrain.open(ctx);
    }
  },
  async respond(ctx, text) {
    if (!liveBrainConfigured()) return scriptedBrain.respond(ctx, text);
    // the model does the talking, but the game keeps its own notes of what was pitched and asked for, so the
    // facts in the prompt stay right and a scripted fallback turn picks up where the model left off
    let asked = false;
    for (const s of SCAMS) {
      if (!ctx.owned.has(s.id)) continue;
      if (s.pitch.test(text)) ctx.pitched.add(s.id);
      if (s.ask.test(text)) { ctx.asked.add(s.needs); if (!ctx.given[s.needs]) asked = true; }
    }
    ctx.askStreak = asked ? ctx.askStreak + 1 : 0;
    ctx.yourLines.push(text.trim().toLowerCase());
    try { const turn = await ask(ctx, messagesFrom(ctx, text)); failures.delete(ctx); return turn; }
    catch (e) {
      const n = (failures.get(ctx) ?? 0) + 1;
      failures.set(ctx, n);
      if (foreignPlay() && n < 2) { console.warn('live brain respond failed, the caller blames the line', e); return stallTurn(STALL, 'stall'); }
      console.warn('live brain respond failed, built-in brain for this turn', e);
      return scriptedBrain.respond(ctx, text);
    }
  },
};

/** the old name, kept for anything that still imports it */
export const claudeBrain = liveBrain;
