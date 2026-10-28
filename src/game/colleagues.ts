// The people at the other desks. Solo, the three colleagues who count (state.colleagues) have a character each:
// how fast they close, what they say when they do, what they mutter into their headsets, what they tell you when you
// walk past, how they react to your sales. They speak with their own voice when no caller is on the line. In co-op the
// colleagues are real players and say nothing of this.
import { t } from '../i18n';
import { addMoney, bus, chance, fmt, pick, settings, state } from './state';
import { toast } from '../ui/toast';
import { speak, voiceFor } from './speech';
import { callActive } from './calls';
import { coop } from '../net/coop';
import { SCAMS } from './scams';
import type { Caller } from './brain/types';
import { familySafe, familySpoken } from './modes';

export interface ColleagueProfile {
  name: string;
  bio: string;
  voice: Caller['voice'];
  pace: number;                 // how often they close, against the baseline colleague
  sale: string[];               // when they close something
  yourSale: string[];           // when you do
  floor: string[];              // when you stop in front of them on the floor
  mutter: string[];             // overheard while they are on a call
  review: string[];             // in the meeting room
  closeRate?: number;           // how often a transferred call ends in a sale (0 = never offered)
  transfer?: { ok: string[]; fail: string[] };
}

export const PROFILES: ColleagueProfile[] = [
  { name: 'Teodora', bio: 'Top closer three months running. Sells the Moon before the caller has finished saying hello.', voice: { pitch: 1.05, rate: 1.15, prefer: 'female' }, pace: 1.35,
    sale: ['Closed. Next.', 'Sun Warranty, extended, with the add-on. They cried a little.', 'Two acres of Moon. I did not even sit down.', 'Another one. Write it on the board, I am busy.', 'Gravity Plan, annual. They asked if it works on stairs. I said especially on stairs.'],
    yourSale: ['Not bad. I did that twice while you typed.', 'Oh, a sale. Cute.', 'Finally. It was lonely at the top of the board.', 'Good. Now do it again, faster.'],
    floor: ['Walking around? The phones are over there.', 'If you are going to the kitchen, I am not.', 'Krull asked about you. I said you were a rumour.', 'Shh. Closing.', 'You have a desk. It has a phone. I am just saying.'],
    mutter: ['Hold please. Hold please. No. Hold.', 'Yes, the Moon has parking.', 'Say the crater, say the crater, there we go.', 'That is a lovely serial number, sir.'],
    review: ['I made quota by nine. I do not know what the rest of you do all night.'],
    closeRate: 0.65, transfer: { ok: ['Closed your {caller}. Took me forty seconds. Your cut is on the board.', 'Done. {caller} bought the lot. You are welcome.'], fail: ['{caller} hung up on me. On ME. What did you say to them?', 'Nothing. {caller} was ruined before I got them. Send me better ones.'] } },
  { name: 'Jun', bio: 'Second week. Writes every call down. Apologises to the callers, then to the phone.', voice: { pitch: 1.2, rate: 1.0, prefer: 'male' }, pace: 0.7,
    sale: ['I... I think that was a sale? They said yes? Is that a sale?', 'Sorry, sorry, I closed one. A small one. Sorry.', 'They bought the gravity thing. I do not understand the gravity thing.', 'A cloud! Monthly! I did it! Sorry.'],
    yourSale: ['How did you DO that? Can I listen next time?', 'That was so smooth. I wrote it down.', 'Nice. I got a goose. The goose hung up.', 'Wow. Okay. Wow.'],
    floor: ['Hi! Sorry. Hi. Do you know where the Playbook is? Never mind.', 'Is it normal that the fridge calls? It called me twice.', 'Do not tell Krull I was on Surf. It was research.', 'Oh! You are up. Is that allowed?', 'I brought biscuits. They are in the kitchen. Baxter found them.'],
    mutter: ['Hello, this is Jun, um, from, um, Sunrise.', 'Please do not hang up. Please.', 'What is a crater. Where is the crater.', 'Sorry. Sorry. Yes. The Sun. It has a number. Sorry.'],
    review: ['I think I am getting better? The goose disagrees.'],
    closeRate: 0.12, transfer: { ok: ['I... I think {caller} bought something? They said yes? Sorry. Thank you!', 'They BOUGHT it. {caller} bought it. I have to sit down. I am sitting.'], fail: ['I said hello to {caller} and then I apologised for eleven minutes. Sorry.', '{caller} asked me what I was selling and I said "sorry" and they left.', 'I put {caller} on hold to find the Playbook. They are still on hold. Somewhere.'] } },
  { name: 'Baxter', bio: 'Eleven years on the floor. Has never read the Playbook. Has never needed to.', voice: { pitch: 0.7, rate: 0.9, prefer: 'male' }, pace: 0.95,
    sale: ['Yeah. Sold them something. Sun, I think.', 'Another cloud. Monthly. They always go monthly.', 'Done. Lunch.', 'Moon. Two acres. Whatever.'],
    yourSale: ['Huh. Look at that.', 'You will burn out by Thursday. They all do.', 'Nice. Do not tell Teodora, she gets weird.', 'Mm. Beginner\'s luck. Keep it.'],
    floor: ['Kitchen is out of the good coffee. There was never good coffee.', 'Krull walks at ten past. Set a watch by it.', 'Sit down before he sees you. Or do not. I am not your supervisor.', 'Eleven years. Eleven. Years.', 'The vending machine owes me four dollars. It knows.'],
    mutter: ['Yeah. Yeah. No. Yeah.', 'Uh huh. The Moon. Yep.', 'You can send a cheque. We take cheques. Nobody takes cheques.', 'Sure. Put the ghost on.'],
    review: ['Same as every day. Nobody died. That is the bar.'],
    closeRate: 0.4, transfer: { ok: ['Yeah. {caller} bought something. Sun, I think. Your cut is whatever.', 'Sold {caller} a cloud. Monthly. They always go monthly.'], fail: ['{caller} wanted to talk. I do not do talk. Gone.', 'Lost {caller}. It happens. Eleven years, it happens.'] } },
  // the three at the back: fewer words, no sales of their own
  { name: 'Rita', bio: 'Night shift only. Wears the shades for the monitor glare. Says so.', voice: { pitch: 0.95, rate: 1.05, prefer: 'female' }, pace: 0,
    sale: [], yourSale: ['Mm.'], floor: ['Glare. That is why the shades.', 'Do not touch the thermostat. It is mine.', 'Hm? No. Busy.'], mutter: ['Mhm. Mhm. And the serial?', 'Say that again, slower.'], review: [] },
  { name: 'Drin', bio: 'Trains at lunch. Talks about training at every other time.', voice: { pitch: 0.75, rate: 1.1, prefer: 'male' }, pace: 0,
    sale: [], yourSale: ['Strong.'], floor: ['Leg day. Do not ask.', 'You want the chain? Earn the chain.', 'Protein is in the fridge. The fridge knows.'], mutter: ['Breathe out on the sale, in on the hold.', 'Yes sir. Yes sir. One more rep. I mean acre.'], review: [] },
  { name: 'Ela', bio: 'Reads during calls. Nobody has caught her yet.', voice: { pitch: 1.15, rate: 0.95, prefer: 'female' }, pace: 0,
    sale: [], yourSale: ['Good chapter?'], floor: ['Shh. Page two hundred.', 'If Krull asks, I was on the Playbook.', 'The Moon again? They always want the Moon.'], mutter: ['Mm. Yes. The crater. Of course.', 'Chapter nine. I mean, plan nine.'], review: [] },
];

// ---- your own colleagues (the Colleague Creator): each replaces one of the three by name, from the next run ----
export interface CustomColleague { name: string; replaces: string; shirt: string; look: Record<string, unknown>; profile: Omit<ColleagueProfile, 'name'> }
const CUSTOM_KEY = 'hp.colleagues';
export function customColleagues(): CustomColleague[] { try { const raw = localStorage.getItem(CUSTOM_KEY); return raw ? (JSON.parse(raw) as CustomColleague[]).filter((c) => c && c.name && c.profile) : []; } catch { return []; } }
export function saveCustomColleagues(list: CustomColleague[]): void { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
/** at the start of a solo run: the custom colleagues take the seats of the ones they replace */
export function applyCustomColleagues(): void {
  for (const c of customColleagues()) {
    const slot = state.colleagues.find((x) => x.name === c.replaces) ?? state.colleagues.find((x) => x.name === c.name);
    if (slot) { slot.name = c.name; slot.shirt = c.shirt || slot.shirt; }
  }
}
/** the look the office gives a custom colleague (null = the built-in look for that seat) */
export function lookFor(name: string): Record<string, unknown> | null { return customColleagues().find((c) => c.name === name)?.look ?? null; }

export function profileFor(name: string): ColleagueProfile | null {
  const c = customColleagues().find((x) => x.name === name);
  if (c) return { name: c.name, ...c.profile };
  return PROFILES.find((p) => p.name === name) ?? null;
}

function asCaller(p: ColleagueProfile): Caller {
  return { id: 'colleague-' + p.name.toLowerCase(), name: p.name, archetype: 'legend', gimmick: p.bio, world: [], openers: [], quirks: [], question: '', answer: [], voice: p.voice, mood0: 50, patience: 100, likes: [], portrait: {}, budget: 0 };
}

/** a colleague says something: a toast with their name, and their voice when nobody is on the line */
export function sayAs(name: string, text: string, opts: { voice?: boolean; spoken?: string } = {}): void {
  const p = profileFor(name);
  // a colleague from the Character Creator says what its maker wrote: family mode masks it like a caller line
  const shown = familySafe(text);
  toast(`${familySafe(name)}: ${shown}`, 'info', 3800);
  if (!p || !settings.voiceOut || opts.voice === false || callActive()) return;
  speak(familySpoken(opts.spoken ? familySafe(opts.spoken) : shown), voiceFor(asCaller(p)), 'colleague-' + name);
}

/** what they say when they close one (day.ts calls this from the colleague tick) */
export function saleLine(name: string): string | null {
  const p = profileFor(name);
  return p && p.sale.length ? t(pick(p.sale)) : null;
}

// your sale: somebody at the next desk has an opinion (text only: a caller is on the line)
const lastReact = { at: 0 };
bus.on('call:paid', () => {
  if (coop.live || state.phase !== 'shift') return;
  if (Date.now() - lastReact.at < 25_000 || !chance(0.45)) return;
  lastReact.at = Date.now();
  const who = pick(state.colleagues.map((c) => c.name).filter((n) => profileFor(n)?.yourSale.length));
  if (!who) return;
  setTimeout(() => sayAs(who, t(pick(profileFor(who)!.yourSale)), { voice: false }), 1400);
});

// a transferred call: the colleague works it for a while, then reports; a sale pays you a 40% cut
bus.on<{ to: string; caller: Caller; mood: number }>('call:transfer', ({ to, caller, mood }) => {
  const p = profileFor(to);
  if (!p || !p.transfer || !p.closeRate) return;
  const rate = p.closeRate;
  const col = state.colleagues.find((c) => c.name === to);
  const first = caller.name.split(',')[0];
  toast(`${to} takes ${first}. "Give me a minute."`, 'info', 3000);
  setTimeout(() => {
    if (state.phase !== 'shift') return;
    const ok = Math.random() < rate * Math.min(1.3, 0.45 + mood / 100);
    if (!ok) { sayAs(to, pick(p.transfer!.fail).replace(/\{caller\}/g, first)); return; }
    const fixed = SCAMS.filter((s) => s.payout === 'fixed' && state.owned.has(s.id));
    const scam = fixed.length ? pick(fixed) : null;
    const amount = scam?.fixed ?? 200;
    const cut = Math.round(amount * 0.4 / 5) * 5;
    addMoney(cut, scam?.id ?? 'sun');
    if (col) col.earned += amount - cut;
    addMoney(amount - cut, 'colleague', { quiet: true });
    sayAs(to, pick(p.transfer!.ok).replace(/\{caller\}/g, first) + ` (${fmt(cut)} for you)`, { spoken: pick(p.transfer!.ok).replace(/\{caller\}/g, first) });
    bus.emit('call:transferred', { to, amount, cut, caller });
  }, 7000 + Math.random() * 6000);
});

// a new thing on your desk: the next desk notices
const COSMETIC_LINES: Record<string, Record<string, string>> = {
  plant: { Teodora: 'A plant. Bold. It will be dead by Thursday.', Jun: 'Oh! Can I water it? I will water it. Sorry.', Baxter: 'I had a plant once. Krull ate it. Not a joke.' },
  trophy: { Teodora: 'A trophy. For what, exactly?', Jun: 'Wow. Did you win that? What did you win?', Baxter: 'Eleven years and nobody gave me a trophy. Fine.' },
  chair: { Teodora: 'Executive chair. Krull is going to have questions.', Jun: 'That chair is nicer than my flat.', Baxter: 'Leather. On this floor. Brave.' },
  monitor: { Teodora: 'Two screens. One for calls, one for Surf. I know what you are doing.', Jun: 'Two monitors! Do you get two phones too?', Baxter: 'A second screen. The first one was not enough nonsense?' },
};
bus.on<string>('cosmetic', (id) => {
  if (coop.live) return;
  const names = state.colleagues.map((c) => c.name).filter((n) => COSMETIC_LINES[id]?.[n]);
  if (!names.length) return;
  const who = pick(names);
  setTimeout(() => sayAs(who, COSMETIC_LINES[id][who]), 1600);
});

// on the floor: you stop in front of someone (office.ts says who, and what their screen shows)
const lastNear = new Map<string, number>();
let lastAny = 0;
bus.on<{ name: string; app: string }>('colleague:near', ({ name, app }) => {
  if (coop.live && state.colleagues.some((c) => c.id && c.name === name)) return; // a real player: they talk for themselves
  const p = profileFor(name);
  if (!p) return;
  const now = Date.now();
  if (now - lastAny < 7000 || now - (lastNear.get(name) ?? 0) < 40_000) return;
  lastAny = now; lastNear.set(name, now);
  const list = app === 'phone' && p.mutter.length ? p.mutter : p.floor;
  if (list.length) sayAs(name, t(pick(list)));
});
