// How a caller talks. One spec per caller, read from who they are (name, gimmick, kind, tags) or set by hand, with
// three outputs: the built-in brain colours its generic lines with it (tics, word swaps, a register), the live brain
// is told about it in words, and the voice (speech.ts) reads the same spec for pace and pitch. One source, so the
// pirate who says "arr" in the transcript also sounds like one, whichever brain is on the line.
import type { Caller } from './types';
import { mutatorRegister } from '../mutators';

export type Register = 'normal' | 'whisper' | 'shout' | 'flat' | 'grand';

export interface Style {
  tics: string[];                 // short interjections put before or after a generic line now and then
  swaps: [RegExp, string][];      // word swaps applied to generic lines ("you" → "ye")
  register: Register;             // whisper = lowercase and soft; shout = one sentence in capitals; flat = no exclamation marks
  laugh?: string;                 // how they laugh, if they do
  describe: string;               // one sentence for the live brain
}

const R = (re: string) => new RegExp(`\\b(?:${re})\\b`, 'gi');
const W = (re: string, to: string): [RegExp, string] => [R(re), to];

interface Cue { re: RegExp; style: Partial<Style> & { tics: string[]; describe: string } }
// cues read from the name, the gimmick, the portrait kind and the tags; the first match wins, so the specific ones
// (a cat called Sir Fluffington is a cat, not a knight) come before the general ones
const CUES: Cue[] = [
  { re: /pirate|captain|buccaneer|plank|doubloon|first mate|\bship\b|sailor/i, style: { tics: ['Arr.', 'Ahoy.', 'Yarr.'], swaps: [W('you', 'ye'), W('your', 'yer'), W('yes', 'aye'), W('my', 'me'), W('hello', 'ahoy')], register: 'grand', laugh: 'Har har har.', describe: 'You talk like a pirate: "arr", "ye", "aye", "matey", the sea in every sentence.' } },
  { re: /\bcat\b|kitten|feline|purr/i, style: { tics: ['Mrrow.', 'Purr.', '(knocks something off a table)'], describe: 'You are a cat: bored, superior, purring when pleased, hissing when not.' } },
  { re: /\bdog\b|puppy|hound|terrier|retriever|spaniel|\bwoof/i, style: { tics: ['Woof.', '(tail wagging)', 'Good. Good good good.'], register: 'shout', describe: 'You are a dog: everything is the best thing that ever happened, you repeat words when excited.' } },
  { re: /knight|squire|lance|joust|armour|chivalr/i, style: { tics: ['Hark!', 'By my sword,', 'Verily,'], swaps: [W('you', 'thee'), W('your', 'thy'), W('yes', 'aye'), W('hello', 'well met')], register: 'grand', describe: 'You speak like a storybook knight: "thee", "thy", "hark", oaths and honour.' } },
  { re: /witch|cauldron|\bhex|coven|potion/i, style: { tics: ['Heh heh heh.', 'Cackle.', 'The cauldron agrees.'], laugh: 'Heh heh HEH.', describe: 'You cackle, you talk of brews and hexes, and you threaten to turn people into small things, fondly.' } },
  { re: /queen|\bking\b|royal|majesty|duchess|countess|princess|\bprince\b|empress|emperor|her highness|his highness/i, style: { tics: ['One is listening.', 'We are amused.', 'Indeed.'], swaps: [W('i am', 'one is'), W("i'm", 'one is'), [/\bI(?!')\b/g, 'one']], register: 'grand', describe: 'You speak like royalty: "one" instead of "I", "we are amused", decrees instead of requests.' } },
  { re: /wizard|sorcer|\bmage\b|oracle|prophe|astrolog|fortune|seer\b|psychic|horoscope/i, style: { tics: ['As foretold.', 'Hmmm. The signs.', 'It was written.'], register: 'grand', describe: 'You speak in prophecy: everything was foretold, the signs are everywhere, the pauses are heavy.' } },
  { re: /goose|\bduck\b|swan|pigeon|parrot|seagull|\bbird\b|\bhen\b|chicken|\bowl\b|\bcrow\b|raven|magpie|penguin|flamingo/i, style: { tics: ['Honk.', 'Coo.', '(flaps)'], describe: 'You are a bird: short sentences, sudden honks or coos, easily distracted by crumbs.' } },
  { re: /\bbear\b|hamster|raccoon|squirrel|badger|\bfox\b|rabbit|hedgehog|otter|\bmole\b|\brat\b|mouse|guinea pig|ferret|goat|sheep|\bcow\b|horse|donkey|\bpig\b/i, style: { tics: ['Sniff sniff.', 'Hm.', '(chews something)'], describe: 'You are an animal with food on its mind: sniffing, chewing, every topic comes back to snacks.' } },
  { re: /octopus|\bfish\b|shark|whale|\bcrab\b|lobster|squid|jellyfish|\beel\b|\bseal\b|turtle|dolphin|goldfish|underwater|reef/i, style: { tics: ['Blub.', '(bubbles)', 'Glub.'], describe: 'You live underwater: "blub", bubbles, everything is wet and that is normal.' } },
  { re: /snake|lizard|\bfrog\b|\btoad\b|\bnewt\b|gecko|iguana|chameleon|crocodile|serpent/i, style: { tics: ['Ssss.', 'Ribbit.', '(blinks slowly)'], swaps: [W('yes', 'yesss'), W('this', 'thisss')], describe: 'You hiss your esses and blink slowly between thoughts.' } },
  { re: /\bbee\b|\bbees\b|wasp|\bant\b|\bants\b|beetle|spider|\bmoth\b|\bfly\b|insect|\bbug\b|cricket|snail|slug|caterpillar|butterfly|ladybird/i, style: { tics: ['Bzzz.', '(antennae twitch)', 'Zzt.'], describe: 'You buzz and twitch; you count in sixes and think in hive terms.' } },
  { re: /fridge|toaster|kettle|vacuum|roomba|printer|router|microwave|dishwasher|washing machine|\batm\b|cash machine|elevator|\blift\b|vending|smoke alarm|thermostat|robot|android|computer|server|\bcamera\b|drone|satellite|calculator|photocopier|scanner|speaker|console/i, style: { tics: ['Beep.', 'Processing.', 'Noted.', 'Whirr.'], swaps: [W('yes', 'affirmative'), W('no', 'negative'), W('okay|ok', 'acknowledged')], register: 'flat', describe: 'You are a machine: flat, literal, "beep", "affirmative", status reports, feelings described as readings.' } },
  { re: /\bshy\b|whisper|attic|under the bed|closet|timid|nervous|mumbl/i, style: { tics: ['(whispering)', 'sorry.', 'um.'], register: 'whisper', describe: 'You whisper, apologise, trail off; you never raise your voice.' } },
  { re: /ghost|spirit|phantom|spectre|haunt|poltergeist|wraith|banshee|\bdead\b|deceased|afterlife|\bgrave\b|séance|seance/i, style: { tics: ['Oooooh.', '(a cold draught)', 'Woooo.'], describe: 'You are a ghost: drawn-out "oooh"s, draughts, candles, centuries of grievance.' } },
  { re: /\bcloud\b|\brain\b|storm|\bwind\b|\bfog\b|weather|breeze|thunder|drizzle|snowflake|hailstone/i, style: { tics: ['Pffff.', '(drifts)', 'Whoosh.'], describe: 'You are weather: drifting, soft, easily blown off topic.' } },
  { re: /alien|planet|galaxy|orbit|comet|asteroid|meteor|\bstar\b|nebula|\bmoon\b|\bmars\b|venus|saturn|jupiter|cosmic|\bvoid\b|black hole|the sun\b/i, style: { tics: ['From up here,', '(static)', 'Hmmmm.'], swaps: [W('people', 'small warm things'), W('humans', 'small warm things')], register: 'grand', describe: 'You are very far away and very old: slow, vast, you call humans "small warm things".' } },
  { re: /influencer|streamer|followers|content|vlog|podcast|subscribers/i, style: { tics: ['Chat, look at this.', 'Bro.', 'Okay okay okay.'], register: 'shout', describe: 'You talk like a streamer: "bro", "chat", everything is content, everything is live.' } },
  { re: /coach|referee|football|striker|halftime|cup final|manager of/i, style: { tics: ['Offside.', 'Clock is running.', 'Short passes.'], register: 'shout', describe: 'You talk like a football coach: short, barked, everything is tactics and halftime.' } },
  { re: /doctor|nurse|clinic|patient|diagnos|prescri|surgeon|dentist/i, style: { tics: ['Breathe.', 'Sit down.', 'Hm. A symptom.'], describe: 'You talk like a television doctor: calm, prescribing, every remark is a diagnosis.' } },
  { re: /accountant|\btax\b|audit|ledger|receipt|bureau|clerk|\bform\b|compliance|inspector|paperwork|notary|solicitor|lawyer/i, style: { tics: ['Noted.', 'For the record,', 'Standard procedure.'], register: 'flat', describe: 'You talk like a clerk: forms, references, "for the record", nothing is urgent except the paperwork.' } },
  { re: /grandma|grandmother|granny|\baunt\b|\bteta\b|nonna|\bnan\b|old lady|elderly|neighbour who|pensioner/i, style: { tics: ['Hajde,', 'My child,', 'Have you eaten?'], describe: 'You talk like an old neighbour: warm, nosy, everyone is "my child", everyone should eat something.' } },
  { re: /\bchild\b|\bkids?\b|children|\bboy\b|\bgirl\b|\bteen|schoolboy|schoolgirl|trenchcoat/i, style: { tics: ['Um.', 'Wait wait wait.', 'Cool.'], describe: 'You talk like a kid pretending to be an adult: big words slightly wrong, sudden excitement.' } },
  { re: /\bchef\b|\bcook\b|baker|bakery|kitchen|\bsoup\b|restaurant|caf[eé]\b|barista/i, style: { tics: ['Hold on, something is boiling.', 'Taste that.', 'Chef!'], register: 'shout', describe: 'You talk like a chef mid-service: short, loud, every metaphor is food.' } },
  { re: /pilot|driver|\bbus\b|\btrain\b|\btaxi\b|trucker|lorry|conductor|captain of the/i, style: { tics: ['Mind the doors.', 'Next stop,', '(indicator ticking)'], describe: 'You talk like someone driving: announcements, stops, mirror-signal-manoeuvre.' } },
  { re: /singer|opera|diva|choir|musician|band\b|violin|clarinet|wedding/i, style: { tics: ['La la laaa.', '(clears throat)', 'From the top.'], register: 'grand', describe: 'You talk like a performer: every sentence is an encore, you save your voice and then do not.' } },
  { re: /plant|cactus|\btree\b|flower|fern|moss|mushroom|fungus|vegetable|potato|tomato/i, style: { tics: ['(rustles)', 'Slowly now.', 'Photosynthesising.'], describe: 'You are a plant: slow, patient, sunlight and water are the only real subjects.' } },
];

const ARCH: Record<Caller['archetype'], Style> = {
  creature: { tics: ['Hm.', '(sniffs)', 'Oh!'], swaps: [], register: 'normal', describe: 'You are an animal with a phone: direct, physical, easily distracted.' },
  machine: { tics: ['Beep.', 'Processing.', 'Noted.'], swaps: [W('yes', 'affirmative'), W('no', 'negative')], register: 'flat', describe: 'You are a machine: flat, literal, status reports instead of feelings.' },
  spirit: { tics: ['Oooooh.', '(a cold draught)', 'Hmmm.'], swaps: [], register: 'normal', describe: 'You are a spirit: drawn-out vowels, old grievances, draughts.' },
  legend: { tics: ['Indeed.', 'Hear me.', 'Ha!'], swaps: [], register: 'grand', describe: 'You are larger than life: grand, theatrical, sure of your place in history.' },
  cosmic: { tics: ['Hmmmm.', '(static)', 'From up here,'], swaps: [], register: 'grand', describe: 'You are vast and far away: slow, old, amused by small warm things.' },
  inspector: { tics: ['Standard procedure.', 'Just a formality.', 'Quick one.'], swaps: [], register: 'flat', describe: 'You sound like an official on a routine call: bland, reassuring, always back to the file.' },
};

const cache = new Map<string, Style>();

/** the caller's own style first (Character Creator, roster), then what their name and gimmick say, then the archetype */
export function styleFor(c: Caller): Style {
  const hit = cache.get(c.id);
  if (hit) return hit;
  const text = `${c.name} ${c.gimmick} ${(c.tags ?? []).join(' ')} ${c.portrait?.kind ?? ''}`;
  const cue = CUES.find((k) => k.re.test(text));
  const base: Style = cue ? { ...ARCH[c.archetype], ...cue.style } : ARCH[c.archetype];
  const s: Style = { ...base, swaps: [...base.swaps] };
  if (c.style) {
    if (c.style.tics?.length) s.tics = c.style.tics;
    if (c.style.register) s.register = c.style.register;
    if (c.style.describe) s.describe = c.style.describe;
    if (c.style.laugh) s.laugh = c.style.laugh;
  }
  cache.set(c.id, s);
  return s;
}

/** today's register: a mutator day (every caller whispers, or shouts) overrides the character's own */
export function registerFor(c: Caller): Register { return mutatorRegister() ?? styleFor(c).register; }

function matchCase(from: string, to: string): string { return from[0] === from[0].toUpperCase() && from[0] !== from[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to; }

/** colour a generic line in the caller's voice: word swaps always, a tic now and then, the register. Placeholders in
 *  braces and anything in quotes are left alone, so values and quoted questions survive. */
export function stylize(c: Caller, text: string, strength = 1): string {
  const s = styleFor(c);
  const parts = text.split(/(\{[a-z]+\}|"[^"]*"|“[^”]*”)/);
  let t = parts.map((p, i) => {
    if (i % 2 === 1) return p;
    let q = p;
    for (const [re, to] of s.swaps) q = q.replace(re, (m) => matchCase(m, to));
    return q;
  }).join('');
  const r = Math.random();
  const tic = () => s.tics[Math.floor(Math.random() * s.tics.length)];
  if (s.tics.length && r < 0.28 * strength) t = tic() + ' ' + t;
  else if (s.tics.length && r < 0.46 * strength) t = t.replace(/\s*$/, '') + ' ' + tic();
  const reg = registerFor(c);
  if (reg === 'whisper') t = t.toLowerCase().replace(/!/g, '.');
  else if (reg === 'flat') t = t.replace(/!+/g, '.');
  else if (reg === 'shout' && Math.random() < (mutatorRegister() ? 0.6 : 0.3) * strength) {
    const bits = t.split(/(?<=[.!?])\s+/);
    const i = Math.floor(Math.random() * bits.length);
    if (bits[i].length < 60) bits[i] = bits[i].toUpperCase();
    t = bits.join(' ');
  }
  return t;
}

/** a paragraph for the live brain */
export function howTheyTalk(c: Caller): string {
  const s = styleFor(c);
  const r = registerFor(c);
  const reg = r === 'whisper' ? ' You write in lowercase and never shout.' : r === 'shout' ? ' You get loud: one sentence in capitals now and then.' : r === 'flat' ? ' No exclamation marks, ever.' : r === 'grand' ? ' Long words, big claims, a theatrical pause.' : '';
  return `${s.describe}${reg} Verbal tics you use once in a while (never twice in a row): ${s.tics.map((t) => `"${t}"`).join(', ')}.${s.laugh ? ` When you laugh it sounds like "${s.laugh}".` : ''}`;
}
