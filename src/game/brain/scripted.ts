// The offline caller brain: improv rules with a memory and a suspicion meter. Play along with the caller's
// world, use their name, answer their question, and they warm up. Insult them and they cool down. Ask for the
// item before you have pitched, push, contradict yourself or get greedy, and they grow suspicious: a wary caller
// then tests you with a question of their own, and hangs up on a trick. It remembers what you said, answers your
// questions in character, nudges you toward the close, and never repeats itself twice in a row.
import { GIVE, line, type Reaction } from './lines';
import { passes, personaFor } from './personas';
import type { CallCtx, CallerBrain, GiveKind, Turn } from './types';
import { SCAMS, type ScamDef } from '../scams';
import { stripVowels } from '../values';
import { settings, state } from '../state';
import { stylize } from './style';
import { priorOpener, priorWith } from '../memory';
import { sceneLine } from '../scene';
import { mutatorSuspicion } from '../mutators';

const RX = {
  insult: /\b(idiot|stupid|dumb|shut up|moron|fool|loser|ugly|pathetic|worthless|hate you|f+u+c+k|screw you|piss off|suck|dumbass|trash)\b/i,
  deny: /\b(not real|aren'?t real|don'?t exist|you'?re fake|made up|imaginary|can'?t talk|cannot talk|just a (fridge|goose|cat|cloud|raccoon|toaster))\b/i,
  threaten: /\b(or else|i'?ll (hurt|find|report|destroy|sue)|you'?ll (regret|pay)|consequences|last warning|i know where)\b/i,
  rush: /\b(hurry|quick(ly)?|right now|immediately|fast|no time|come on|get on with it|chop chop|now now)\b/i,
  pressure: /\b(last chance|only today|act now|final offer|expires|limited time|you must|you have to|do it now|before it'?s too late|or (you'?ll|you will) lose|no time to think|right now or)\b/i,
  trustMe: /\b(trust me|not a scam|isn'?t a scam|no scam|totally legit|legit|i promise|believe me|no tricks|nothing to worry about|i swear)\b/i,
  compliment: /\b(lovely|wonderful|brilliant|great|amazing|beautiful|clever|smart|impressive|best|love (your|that|it)|nice (voice|name)|handsome|magnificent|majestic|gorgeous|fantastic|delightful|charming)\b/i,
  greet: /\b(hi|hello|hey|good (morning|evening|afternoon|night)|greetings|howdy|hiya|yo)\b/i,
  question: /\?\s*$/,
  yes: /^\s*(yes|yeah|yep|sure|ok(ay)?|alright|fine|of course|absolutely|definitely|allow|accept|open(ed)?|click(ed)?|done|go ahead|certainly|i will|will do|deal)\b/i,
  no: /^\s*(no|nope|never|nah|i won'?t|not (a chance|happening)|refuse|absolutely not)\b/i,
  reassure: /\b(hold|don'?t (sell|panic|worry)|relax|calm|trust me|diamond hands|it'?ll (go|come) back|dip|buy the dip|stay in|patience|hang on|wait it out|it'?s fine|normal|keep it in)\b/i,
  whoAreYou: /\b(who (are|r) (you|u)|who is this|who'?s this|what are you|what'?s your name|your name)\b/i,
  whyCall: /\b(why (did|do) you call|why are you calling|what do you want|what can i do for you|how can i help|what'?s the problem|what seems to be)\b/i,
  whatSelling: /\b(what (are you|do you|am i) (selling|offering|buying)|what'?s on offer|what have you got|what do you sell)\b/i,
  howMuch: /\b(how much|what does it cost|what'?s the price|price|cost)\b/i,
  money: /\$\s?\d[\d,]*|\b\d[\d,]*\s?(dollars|bucks|usd)\b/i,
  myName: /\b(my name is|this is|i'?m|i am|call me)\s+([A-Z][a-z]+)/,
  company: /\b(?:calling|i'?m|i am|this is|we are|we'?re|speaking|here|it'?s) from (?:the )?([A-Z][\w&'-]*(?: [A-Z][\w&'-]*){0,3})/,
  notAName: /^\s+(customer|care|support|inc\b|ltd\b|co\b|company|services|calling|speaking|from)/i,
  smalltalk: /\b(how are you|how'?s it going|how do you do|you (ok|alright|good)|nice (day|night|weather)|weather)\b/i,
};

const ARCH_MOD: Record<string, number> = { creature: 0, machine: 0, spirit: 0, legend: 0, cosmic: 5, inspector: 100 };
const SUS_CHALLENGE = 40;  // a wary caller tests you from here
const SUS_NO_GIVE = 55;    // nothing is handed over above this
const SUS_BYE = 85;        // they hang up

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function fill(s: string, ctx: CallCtx, value = ''): string {
  return s.replace(/\{name\}/g, ctx.caller.name).replace(/\{you\}/g, ctx.claimedName ?? ctx.playerName).replace(/\{value\}/g, value).replace(/\{topic\}/g, ctx.topics[ctx.topics.length - 1] ?? 'that');
}

function mention(ctx: CallCtx, text: string): boolean {
  const first = ctx.caller.name.split(/[ ,]/)[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  return first.length > 2 && text.toLowerCase().includes(first);
}

function worldHits(ctx: CallCtx, text: string): string[] {
  const t = text.toLowerCase();
  return ctx.caller.world.filter((w) => t.includes(w));
}

function answersQuestion(ctx: CallCtx, text: string): boolean {
  const t = text.toLowerCase();
  return ctx.caller.answer.some((a) => t.includes(a));
}

function findAsk(ctx: CallCtx, text: string): ScamDef | null {
  const owned = SCAMS.filter((s) => ctx.owned.has(s.id));
  const hits = owned.filter((s) => s.ask.test(text));
  if (!hits.length) return null;
  return hits.find((s) => ctx.pitched.has(s.id)) ?? hits[0];
}

function findPitch(ctx: CallCtx, text: string): ScamDef | null {
  const owned = SCAMS.filter((s) => ctx.owned.has(s.id));
  // several products may hear their pitch in one line ("Subway to the Moon" is also the Moon): the one whose closing
  // question is in the same breath wins, then the first
  const hits = owned.filter((s) => s.pitch.test(text));
  return hits.find((s) => s.ask.test(text)) ?? hits[0] ?? null;
}

function valueFor(ctx: CallCtx, kind: GiveKind): string {
  if (kind === 'vowelname') return stripVowels(ctx.caller.name.split(',')[0]).replace(/\s+/g, ' ').trim();
  if (kind === 'bean') return String(Math.min(ctx.caller.budget, 100 + Math.round(Math.random() * 6) * 50));
  return ctx.values[kind];
}

export function gateFor(ctx: CallCtx, s: ScamDef): number {
  const c = ctx.caller;
  return s.gate - (c.likes.includes(s.id) ? 10 : 0) + (c.likes.includes(s.id) ? 0 : 12) + ARCH_MOD[c.archetype] + (c.vip ? 25 : 0);
}

function moodWord(m: number): Turn['mood'] { return m < 30 ? 'angry' : m >= 70 ? 'happy' : 'calm'; }

// pick a line that was not one of the last three; a caller's own lines come before the archetype's, and a line
// from the archetype's table is coloured in the caller's own way of talking (brain/style.ts)
function fresh(ctx: CallCtx, r: Reaction): string {
  const persona = personaFor(ctx.caller);
  const own = ctx.caller.lines?.[r] ?? (r === 'suspicious' ? persona.suspicions : r === 'bye_suspicious' ? persona.byeSuspicious : undefined);
  const mine = !!(own && own.length);
  const draw = () => (mine ? own![Math.floor(Math.random() * own!.length)] : line(ctx.caller.archetype, r));
  let s = draw();
  for (let i = 0; i < 4 && ctx.lastSaid.includes(s); i++) s = draw();
  return mine ? s : stylize(ctx.caller, s);
}

function remember(ctx: CallCtx, said: string): void {
  ctx.lastSaid.push(said);
  if (ctx.lastSaid.length > 3) ctx.lastSaid.shift();
}

export const scriptedBrain: CallerBrain = {
  name: 'scripted',
  async open(ctx) {
    const c = ctx.caller;
    // someone who has rung before picks up where the last call left off
    const prior = c.archetype === 'inspector' ? null : priorWith(c.id);
    const say = prior ? priorOpener(c, prior, ctx.playerName) : fill(c.openers[Math.floor(Math.random() * c.openers.length)], ctx);
    remember(ctx, say);
    return { say, moodDelta: 0, mood: moodWord(ctx.mood), intent: 'open' };
  },
  async respond(ctx, raw) {
    const text = raw.trim();
    const c = ctx.caller;
    const arch = c.archetype;
    const persona = personaFor(c);
    let r: Reaction | null = null;
    let delta = 0;
    let gives: Turn['gives'];
    let hangUp = false;
    let virus = false;
    let intent = 'nonsense';
    let quirk = Math.random() < (c.vip ? 0.5 : 0.25); // celebrities talk about themselves more
    let extra = '';
    // suspicion for this turn: gains scale up with how wary the caller is, relief scales down
    let sus = 0;
    const watched = ctx.challengesFailed > 0 ? 1.5 : 1; // a failed test means every push counts half as much again
    const gain = (n: number) => { sus += Math.round(n * (0.6 + persona.wary) * watched * mutatorSuspicion()); };
    const ease = (n: number) => { sus -= Math.round(n * (1.2 - persona.wary * 0.6)); };
    const susNow = () => clamp(ctx.suspicion + sus, 0, 100);
    const done = (say: string, moodDelta: number, more: Partial<Turn> = {}): Turn => {
      say = fill(say, ctx);
      remember(ctx, say);
      return { say, moodDelta, mood: moodWord(ctx.mood + moodDelta), suspicionDelta: clamp(sus, -25, 25) || undefined, intent, ...more };
    };

    // memory: what they say about themselves, and whether it changes
    let contradiction = false;
    const nm = text.match(RX.myName);
    if (nm && nm.index !== undefined && !RX.notAName.test(text.slice(nm.index + nm[0].length)) && !/^(sunrise|harbour|sir|mr|mrs|ms|dr)$/i.test(nm[2])) {
      const n = nm[2];
      if (n.toLowerCase() !== c.name.split(' ')[0].toLowerCase()) {
        if (ctx.claims.name && ctx.claims.name.toLowerCase() !== n.toLowerCase()) contradiction = true;
        ctx.claims.name = n;
        ctx.claimedName = n;
      }
    }
    const co = text.match(RX.company);
    if (co) {
      const n = co[1].trim();
      if (ctx.claims.company && ctx.claims.company.toLowerCase() !== n.toLowerCase()) contradiction = true;
      ctx.claims.company = n;
    }
    const hits = worldHits(ctx, text);
    for (const h of hits) if (!ctx.topics.includes(h)) ctx.topics.push(h);
    const repeated = ctx.yourLines.includes(text.toLowerCase());
    ctx.yourLines.push(text.toLowerCase());

    // ---- inspectors: they want YOU to say yes; they are never suspicious of you ----
    if (arch === 'inspector') {
      if (RX.yes.test(text)) {
        return { say: fill('Perfect. Opening now... and we\'re in. Thank you for your cooperation. GOTCHA. (click)', ctx), moodDelta: 0, mood: 'happy', hangUp: true, virus: true, intent: 'bait_yes' };
      }
      if (RX.insult.test(text)) { r = 'insult'; delta = -15; intent = 'insult'; }
      else if (RX.no.test(text)) { r = 'no'; delta = -8; intent = 'no'; }
      else if (RX.whoAreYou.test(text)) { r = 'who'; intent = 'who'; }
      else if (RX.greet.test(text) && ctx.turn <= 1) { r = 'greet'; intent = 'greet'; }
      else if (findAsk(ctx, text) || findPitch(ctx, text)) { r = Math.random() < 0.5 ? 'early' : 'pitch_meh'; intent = 'ask'; delta = -3; }
      else { r = 'yesand'; intent = 'other'; delta = -2; }
      ctx.baitAsks++;
      let say = fresh(ctx, r);
      if (ctx.baitAsks % 2 === 0) say += ' ' + c.question;
      if (ctx.mood + delta <= 5 || ctx.baitAsks > 8) { say = fresh(ctx, 'bye_angry'); hangUp = true; }
      say = fill(say, ctx);
      remember(ctx, say);
      return { say, moodDelta: delta, mood: moodWord(ctx.mood + delta), hangUp, intent };
    }

    // ---- an open verification question comes first ----
    if (ctx.challenge) {
      const ch = ctx.challenge;
      if (passes(ctx, ch, text)) {
        ctx.challenge = null; ctx.challengeTurns = 0;
        ease(18);
        intent = 'challenge_pass';
        return done(ch.pass || fresh(ctx, 'challenge_pass'), 5);
      }
      ctx.challengeTurns++;
      if (ctx.challengeTurns >= 2 || RX.insult.test(text) || RX.threaten.test(text)) {
        ctx.challenge = null; ctx.challengeTurns = 0; ctx.challengesFailed++;
        gain(15);
        intent = 'challenge_fail';
        if (susNow() >= SUS_BYE) { intent = 'busted'; return done(fresh(ctx, 'bye_suspicious'), -8, { hangUp: true }); }
        return done(ch.fail || fresh(ctx, 'challenge_fail'), -8);
      }
      gain(4);
      intent = 'challenge';
      return done(fresh(ctx, 'challenge_again') + ' ' + ch.ask, -2, { challenge: true });
    }

    // ---- everyone else: improv ----
    const ask = findAsk(ctx, text);
    const pitch = findPitch(ctx, text);
    if (ask && !ctx.given[ask.needs]) ctx.askStreak++; else ctx.askStreak = 0;
    if (RX.trustMe.test(text)) gain(8);
    // asking for the item is judged on its own, whatever else the line does
    const pitchedForAsk = !!ask && (ctx.pitched.has(ask.id) || (!!pitch && pitch.id === ask.id));
    if (ask && !ctx.given[ask.needs]) {
      if (!pitchedForAsk) gain(8);                            // asked before pitching
      if (ctx.askStreak >= 2) gain(6);                        // asked again straight away
      if (ctx.mood < gateFor(ctx, ask) - 12) gain(4);         // pushing while cold
      if (Object.keys(ctx.given).length >= 1) gain(6);        // a second item on the same call
    }

    if (RX.insult.test(text)) { r = 'insult'; delta = -22; intent = 'insult'; quirk = false; gain(2); }
    else if (contradiction) { r = 'contradiction'; delta = -6; intent = 'contradiction'; quirk = false; gain(14); }
    else if (RX.deny.test(text)) { r = 'deny'; delta = -12; intent = 'deny'; }
    else if (RX.threaten.test(text)) { r = 'threaten'; delta = -10; intent = 'threaten'; gain(15); }
    else if (RX.pressure.test(text)) { r = 'pressure'; delta = -5; intent = 'pressure'; quirk = false; gain(10); }
    else if (ctx.withdrawPending && RX.reassure.test(text)) { r = 'reassure'; delta = 3; intent = 'reassure'; ctx.withdrawPending = false; }
    else if (repeated && ctx.turn > 0) { r = 'repeat'; delta = -4; intent = 'repeat'; quirk = false; gain(3); }
    else if (ask && !ctx.given[ask.needs]) {
      intent = 'ask:' + ask.id;
      ctx.asked.add(ask.needs);
      if (pitch && pitch.id === ask.id) ctx.pitched.add(ask.id); // pitched and asked in one breath
      const gate = gateFor(ctx, ask);
      // nobody hands anything over on the first exchange, for a product they have not been sold, or to a line
      // that pushes ("act now", "trust me", a threat, a rush, a changed story): insisting never works
      const pushy = RX.pressure.test(text) || RX.trustMe.test(text) || RX.threaten.test(text) || RX.rush.test(text) || contradiction;
      const ready = ctx.pitched.has(ask.id) && ctx.turn >= 1 && !pushy;
      if (ready && ctx.mood >= gate && susNow() < SUS_NO_GIVE) {
        const value = valueFor(ctx, ask.needs);
        ctx.given[ask.needs] = value;
        gives = { kind: ask.needs, value };
        delta = 3;
        return done(GIVE[ask.needs][Math.floor(Math.random() * GIVE[ask.needs].length)].replace(/\{value\}/g, value), delta, { gives });
      }
      if (susNow() >= SUS_NO_GIVE) { r = Object.keys(ctx.given).length >= 1 ? 'greedy' : 'suspicious'; delta = -4; }
      else if (!ctx.pitched.has(ask.id)) { r = 'unpitched'; delta = -3; }
      else { r = 'early'; delta = -3; if (ctx.mood >= gate - 12) extra = ' ' + fresh(ctx, 'almost'); }
    }
    else if (ask && ctx.given[ask.needs]) { r = 'wrong'; delta = 0; intent = 'ask_again'; }
    else if (RX.rush.test(text)) { r = 'rush'; delta = -6; intent = 'rush'; gain(5); }
    else if (!ctx.answered && answersQuestion(ctx, text)) { r = 'answer'; delta = 9; intent = 'answer'; ctx.answered = true; ease(8); }
    else if (RX.whoAreYou.test(text)) { r = 'who'; delta = 1; intent = 'who'; extra = ' ' + c.gimmick.replace(/^(A|An|The)\s/i, (m) => m.toLowerCase()); }
    else if (RX.whatSelling.test(text)) { r = 'selling'; delta = 1; intent = 'selling'; }
    else if (RX.whyCall.test(text)) { r = 'why'; delta = 2; intent = 'why'; }
    else if (RX.howMuch.test(text) || RX.money.test(text)) {
      intent = 'price';
      const p = pitch ?? SCAMS.find((s) => ctx.pitched.has(s.id)) ?? null;
      if (p) { r = c.likes.includes(p.id) ? 'price_like' : 'price_meh'; delta = c.likes.includes(p.id) ? 3 : -1; }
      else { r = 'price_none'; delta = 0; }
    }
    else if (pitch) {
      intent = 'pitch:' + pitch.id;
      const liked = c.likes.includes(pitch.id);
      const first = !ctx.pitched.has(pitch.id);
      ctx.pitched.add(pitch.id);
      r = liked ? 'pitch_like' : 'pitch_meh';
      delta = first ? (liked ? 6 : -1) : (liked ? 2 : -2);
    }
    else if (hits.length) { r = 'yesand'; delta = Math.min(12, 5 + hits.length * 3); intent = 'yesand'; ease(Math.min(6, 3 * hits.length)); if (ctx.topics.length > 2 && Math.random() < 0.4) extra = ' ' + fresh(ctx, 'callback'); }
    else if (RX.compliment.test(text)) { r = 'compliment'; delta = 6; intent = 'compliment'; ease(2); }
    else if (RX.smalltalk.test(text)) { r = 'smalltalk'; delta = 3; intent = 'smalltalk'; ease(2); }
    else if (mention(ctx, text) && ctx.turn <= 3) { r = 'name'; delta = 6; intent = 'name'; ease(3); }
    else if (RX.greet.test(text) && ctx.turn <= 2) { r = 'greet'; delta = 4; intent = 'greet'; }
    else if (RX.yes.test(text)) { r = 'yes'; delta = 1; intent = 'yes'; }
    else if (RX.no.test(text)) { r = 'no'; delta = -2; intent = 'no'; }
    else if (RX.question.test(text)) { r = 'question'; delta = 1; intent = 'question'; }
    else if (text.length < 4) { r = 'nonsense'; delta = -3; intent = 'nonsense'; gain(1); }
    else { r = 'nonsense'; delta = -1; intent = 'nonsense'; quirk = true; }
    if (mention(ctx, text) && r !== 'name') ease(1);
    if (sus === 0 && delta >= 0) ease(1); // a calm, friendly turn lets suspicion fade

    let say = fresh(ctx, r) + extra;
    const keepClean = r === 'early' || r === 'insult' || r === 'deny' || r === 'threaten' || r === 'rush' || r === 'wrong' || r === 'repeat'
      || r === 'suspicious' || r === 'greedy' || r === 'pressure' || r === 'contradiction' || r === 'unpitched';
    if (quirk && c.quirks.length && !keepClean) say += ' ' + c.quirks[Math.floor(Math.random() * c.quirks.length)];
    // the caller keeps asking their question until it is answered
    if (!ctx.answered && ctx.turn % 3 === 2 && !keepClean) say += ' ' + c.question;
    // warm callers nudge you toward the close when you have pitched but not asked
    const pitchedOpen = [...ctx.pitched].map((id) => SCAMS.find((s) => s.id === id)!).find((s) => !ctx.given[s.needs]);
    if (pitchedOpen && !keepClean && !ask && ctx.mood + delta >= gateFor(ctx, pitchedOpen) && susNow() < SUS_CHALLENGE && ctx.nudges < 2 && ctx.turn % 2 === 1) { say += ' ' + fresh(ctx, 'nudge'); ctx.nudges++; }
    // something is going on at your end (a raid, a fire, the boss): they hear it, once
    if (state.scene && ctx.sceneSaid !== state.scene && !keepClean && Math.random() < 0.65) {
      const remark = sceneLine(c);
      if (remark) { say += ' ' + remark; ctx.sceneSaid = state.scene; }
    }

    // a wary caller tests you once suspicion is up (twice at most per call)
    let challenge = false;
    if (susNow() >= SUS_CHALLENGE && susNow() < SUS_BYE && !ctx.challenge && ctx.challengesUsed < Math.min(2, persona.challenges.length) && r !== 'insult' && r !== 'threaten') {
      const ch = persona.challenges[ctx.challengesUsed++];
      ctx.challenge = ch; ctx.challengeTurns = 0;
      say = fresh(ctx, 'suspicious') + ' ' + ch.ask;
      intent = 'challenge';
      challenge = true;
    }

    const next = ctx.mood + delta;
    if (next <= 4) { say = fresh(ctx, 'bye_angry'); hangUp = true; challenge = false; ctx.challenge = null; }
    else if (susNow() >= SUS_BYE) { say = fresh(ctx, 'bye_suspicious'); hangUp = true; intent = 'busted'; challenge = false; ctx.challenge = null; }
    say = fill(say, ctx);
    remember(ctx, say);
    return { say, moodDelta: delta, mood: moodWord(next), gives, hangUp, virus, intent, suspicionDelta: clamp(sus, -25, 25) || undefined, challenge: challenge || undefined };
  },
};

export function brainName(): string { return settings.brain; }
