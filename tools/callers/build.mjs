// Builds the Albanian caller packs for the Character Creator (Harbour OS → Character Creator → Import JSON).
// node tools/callers/build.mjs  →  public/packs/albanian-*.json
// Each entry is a Caller (src/game/brain/types.ts) with the persona in `gimmick`, `world`, `openers`, `quirks`,
// `question`/`answer`; the live brain (brain/ proxy: Workers AI, Claude when a key is set) reads those fields.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import memes from './memes.mjs';
import creators from './creators.mjs';
import figures from './figures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../public/packs');
const SCAMS = ['moon', 'sun', 'gravity', 'clouds', 'vowels', 'haunt', 'petwifi', 'runes', 'beancoin', 'fridge', 'volcano', 'silence', 'shadow', 'tuesday'];
// humans fall back to the neutral base lines; 'legend' adds "hail and well met", 'creature' adds animal noises
const ARCH = 'cosmic';

const VOICE = { m: { pitch: 0.9, rate: 1.0, prefer: 'male' }, f: { pitch: 1.15, rate: 1.05, prefer: 'female' } };

// the built-in brain's archetype tables are for creatures, machines, ghosts, knights and planets; a person gets
// these instead for the reactions those tables flavour (the neutral base lines cover the rest)
const HUMAN_LINES = {
  greet: ['Hello, hello. Go on.', 'Yes, hi. I am listening.', 'Hello. You have thirty seconds of my good mood.'],
  suspicious: ['Wait. Why do you need that?', 'Hold on, hold on. Who did you say you were?', 'That is a strange thing to ask a stranger.'],
  bye_suspicious: ['No. Something is wrong here. Goodbye.', 'I am hanging up before I regret this. Bye.', 'My cousin warned me about calls like this. Click.'],
  insult: ['Excuse me? Say that again and we are done.', 'I did not pick up to be insulted. Careful.', 'Rude. I have a long memory.'],
  bye_angry: ['Goodbye. Do not call this number again.', 'Enough. Click.', 'We are done here.'],
  nonsense: ['What? Say it again, slower.', 'I did not understand one word of that.', 'Is that a sentence?'],
  challenge_fail: ['Wrong. I knew it.', 'No. That is not the answer.'],
  deny: ['Not real? I pay taxes. Do you pay taxes?', 'I am as real as your quota, my friend.', 'Not real, says the voice in a headset.'],
  rush: ['Slow down. I decide the speed here.', 'Do not rush me. Nobody rushes me.', 'Patience. You want my money, not my blood.'],
};

// How they talk (Caller.style, read by the built-in brain, the live prompt and the voice). Without an explicit
// style the game guesses one from name/gimmick cues, and "pop star" would make a cosmic voice, "king" a royal one,
// "speaker" a machine: so every person gets an explicit style, and the standouts get their own.
const DEFAULT_TALK = 'You talk like a real person on the phone: natural modern speech, Albanian warmth and bluntness, no funny voice unless your description says so.';
const STYLES = {
  'ujku-shijakut': { register: 'normal', tics: ['Alo.', 'The Wolf knows.'], talk: 'in short boasts and street slang, third person about yourself now and then ("the Wolf"), bashful when praised', laugh: 'Heh. Heh heh.' },
  'kicja': { register: 'flat', tics: ['Darling.', 'Obviously.'], talk: 'bored and glamorous, every sentence slightly tired of you, numbers said twice for effect' },
  'ujku-fierit': { register: 'grand', tics: ['Listen to me.', 'Write that down.'], talk: 'slow, heavy, in proverbs and warnings, never interrupted, respect demanded in every line' },
  'mucaraku': { register: 'normal', tics: ['Textbook.', 'Page twelve.'], talk: 'fast and theatrical, narrating the con while it happens, grading the caller out loud', laugh: 'Ha! Beautiful.' },
  'kozaku': { register: 'shout', tics: ['FUCK.', 'Ten thousand people watching.', 'Blocked.'], talk: 'at full volume, swearing in every sentence, insulting mothers on principle, treating the call as a live stream with ten thousand viewers; never slurs, only volume' },
  'eni-kapxhiu': { register: 'normal', tics: ['(deep voice)', '(nasal voice)', 'Keeping that.'], talk: 'switching between impressions mid-sentence, labelling the voices, copying the caller back' },
  'meriton-rama': { register: 'whisper', tics: ['(strum)', 'that rhymes.'], talk: 'softly and sweetly, half-singing, finding a rhyme or a chord in whatever is said' },
  'artani': { register: 'flat', tics: ['Nöd mis Business.', 'Hoi.'], talk: 'deadpan, Swiss German words dropped in, shrugging in text, one burst of enthusiasm per call' },
  'valmir-halimi': { register: 'normal', tics: ['Cut!', 'Take two.'], talk: 'like a director on set, calling cuts and retakes, asking for more feeling' },
  'futtja-babo': { register: 'shout', tics: ['BABO!', 'Come Saturday.'], talk: 'shouting across a yard, calling everyone babo, every topic a family emergency and a joke' },
  'arian-cani': { register: 'normal', tics: ['Camera two.', 'After the break.'], talk: 'like a live host: interrupting, teasing a reveal, promising to come back to it after the break' },
  'kastro-zizo': { register: 'whisper', tics: ['...', 'Yeah.'], talk: 'slow, heavy-lidded, long pauses written as dots, half-finished philosophy' },
  'mentor-kurtishi': { register: 'shout', tics: ['OPA!', 'Two, four!'], talk: 'like a wedding singer between songs, clapping on the beat, inviting everyone', laugh: 'Hahaaa!' },
  'sabri-fejzullahu': { register: 'normal', tics: ['My dear.', '(hums)'], talk: 'courteous, old-fashioned, "my dear" in every other line, humming between sentences' },
  'blendi-fevziu': { register: 'flat', tics: ['Let me stop you there.', 'Source?'], talk: 'like a cross-examining interviewer: dates, names, "let me stop you there", no exclamation marks' },
  'edi-rama': { register: 'grand', tics: ['A short preface.', 'Some offence.'], talk: 'in long ironic sentences, professorial digressions, teasing, never short', laugh: 'Ha. Ha ha.' },
  'ilir-meta': { register: 'shout', tics: ['THE PEOPLE!', 'Constitution!'], talk: 'like a rally speech, table thumps in text, the constitution every minute' },
  'albin-kurti': { register: 'flat', tics: ['Principle.', 'Precisely.'], talk: 'precise and austere, numbered points, no small talk, lectures when corrected' },
  'ramush-haradinaj': { register: 'normal', tics: ['Short.', 'Push-ups.'], talk: 'in short soldier sentences, blunt, physical comparisons', laugh: 'HA.' },
  'hashim-thaci': { register: 'normal', tics: ['My friend.', 'The process.'], talk: 'in velvet diplomatic phrases that never quite answer, long pauses, doors left open' },
  'vjosa-osmani': { register: 'normal', tics: ['Article four.', 'Protocol.'], talk: 'in full formal sentences like a law professor, gently correcting grammar' },
  'enver-hoxha': { register: 'grand', tics: ['Comrade.', '(static from the bunker)'], talk: 'in party slogans and plural pronouns, suspicious pauses, as a ghost from 1985 who misses the applause' },
  'skenderbeu': { register: 'grand', tics: ['Hark!', 'By my sword,'], talk: 'like a fifteenth-century lord speaking through a herald: proclamations, oaths, honour, baffled by the telephone' },
  'leo-skepi': { register: 'shout', tics: ['Stop.', 'Boundaries.'], talk: 'in punchy tough-love coaching lines, diagnosing what the caller tolerates, no softening' },
  'tony-statovci': { register: 'normal', tics: ['(deep voice)', '(squeaky)', 'My mom says hi.'], talk: 'switching skit characters mid-sentence with the voice named in brackets, fourth wall broken' },
  'noizy': { register: 'normal', tics: ['OTR.', 'Family.'], talk: 'like a press release with ad-libs, business words, everyone is family once useful' },
  'dijonis-biba': { register: 'normal', tics: ['Levels.', 'Top floor.'], talk: 'flashy and quick, London slang mixed in, everything about levels and gold' },
  'tayna': { register: 'flat', tics: ['Ten seconds.', 'Hm.'], talk: 'cool and clipped, hooks not sentences, decides in ten seconds' },
  'andi-murra': { register: 'whisper', tics: ['Darling.', 'Five, six, seven, eight.'], talk: 'in a conspiratorial gossip whisper that carries, counting dance beats' },
  'lindi': { register: 'shout', tics: ['GG.', 'Lag!'], talk: 'fast gamer talk, game terms for everything, impatient with lag' },
  'luana-vjollca': { register: 'normal', tics: ['Headline first.', 'Three, two, one.'], talk: 'like a live TV segment with a countdown, bright and quick' },
  'loredana': { register: 'flat', tics: ['One sentence.', 'Expensive.'], talk: 'ice-cold and short, Swiss precision about money, a laugh like a safe clicking shut' },
  'unikkatil': { register: 'whisper', tics: ['...', 'Yeah.'], talk: 'in dense slow bars and long silences, mythic, few words' },
  'stresi': { register: 'flat', tics: ['Real.', 'Short version.'], talk: 'raw and direct, short answers, no decoration' },
  'alessandro-mehmeti': { register: 'whisper', tics: ['The light is good.', 'Beige.'], talk: 'softly, describing light and colour, pained by loudness' },
  'ghetto-geasy': { register: 'flat', tics: ['Skrrt.', 'Slow.'], talk: 'in a lazy drawl with adlibs, nothing urgent' },
  'gjiko': { register: 'shout', tics: ['O BURRË!', 'Hands up!'], talk: 'loud party hooks, repeating your own catchphrases, calling everyone o burrë' },
  'big-mama': { register: 'normal', tics: ['My child.', 'Mama knows.'], talk: 'maternal and loud, "my child" every few lines, warnings wrapped in warmth' },
  'muharrem-ahmeti': { register: 'shout', tics: ['OPA!', 'Meli meli!'], talk: 'like a tallava party, refrains and opa, clapping asked for', laugh: 'Hahaha, opa!' },
  'sinan-hoxha': { register: 'shout', tics: ['Hit!', 'Friend!'], talk: 'flamboyant showman, every song a hit, dance moves described' },
  'salsano-rrapi': { register: 'normal', tics: ['Vëlla.', 'That\'s a bit.'], talk: 'fast Tirana stand-up riffing, calling the caller vëlla, heckling yourself' },
  'adi-krasta': { register: 'grand', tics: ['Exhibit A.', 'Pasolini said.'], talk: 'gravely and articulately, disappointed, every topic a lesson about values' },
  'nexhmedin-spahiu': { register: 'flat', tics: ['(sigh)', 'It will get worse.'], talk: 'gloomy analyst monotone, forecasts, sighs' },
  'fifi': { register: 'normal', tics: ['Deep breath.', 'Hug me.'], talk: 'at emotional full volume, threatening to leave and forgiving in the same breath' },
  'xhemi-shehu': { register: 'flat', tics: ['We subtitle.', 'Second paragraph.'], talk: 'deadpan satirical news-reading, underlining the absurd detail' },
  'florian-marku': { register: 'shout', tics: ['Brother!', 'War!'], talk: 'fight-night hype, every opponent a brother, every fight a war' },
  'majlinda-kelmendi': { register: 'flat', tics: ['Short.', 'Clear.'], talk: 'few words, each placed like a grip, no wasted movement' },
};
// rare, rich and hard to please: drawn from the VIP pool (about one call in twenty)
const VIP_IDS = new Set(['dua-lipa', 'rita-ora', 'bebe-rexha', 'ava-max', 'elvana-gjata', 'noizy', 'edi-rama', 'sali-berisha', 'loredana', 'leo-skepi']);

function finish(e, group) {
  const sex = e.sex ?? 'm';
  const s = STYLES[e.id];
  const style = { register: s?.register ?? 'normal', tics: s?.tics ?? [], describe: s?.talk ? `You talk ${s.talk}.` : DEFAULT_TALK };
  if (s?.laugh) style.laugh = s.laugh;
  const c = {
    id: 'al-' + e.id,
    name: e.name,
    archetype: e.archetype ?? ARCH,
    gimmick: e.gimmick,
    world: e.world,
    openers: e.openers,
    quirks: e.quirks,
    question: e.question,
    answer: e.answer,
    voice: { ...VOICE[sex], ...(e.voice ?? {}) },
    mood0: e.mood0 ?? 48,
    patience: e.patience ?? 150,
    likes: e.likes ?? ['moon', 'sun'],
    portrait: { kind: 'human', skin: '#e0ac69', hair: '#1a1a1a', shirt: '#4a78d9', hairStyle: 1, glasses: false, hat: 0, moustache: false, earrings: sex === 'f', headShape: 1, age: 'adult', ...(e.portrait ?? {}) },
    budget: e.budget ?? 400,
    wary: e.wary ?? 0.5,
    tags: ['albania', group, ...(e.tags ?? [])],
    style,
  };
  if (VIP_IDS.has(e.id)) c.vip = true;
  // the ghost and the hero keep their archetype's flavour; everyone else is a person
  c.lines = e.archetype ? (e.lines ?? undefined) : { ...HUMAN_LINES, ...(e.lines ?? {}) };
  if (!c.lines) delete c.lines;
  if (e.suspicions) c.suspicions = e.suspicions;
  if (e.byeSuspicious) c.byeSuspicious = e.byeSuspicious;
  return c;
}

function validate(list, label) {
  const ids = new Set();
  for (const c of list) {
    const where = `${label}/${c.id}`;
    if (ids.has(c.id)) throw new Error(`${where}: duplicate id`);
    ids.add(c.id);
    if (!c.name || !c.gimmick) throw new Error(`${where}: name and gimmick are required`);
    if (!Array.isArray(c.openers) || c.openers.length < 1) throw new Error(`${where}: at least one opener`);
    if (!Array.isArray(c.world) || c.world.length < 3) throw new Error(`${where}: at least three world words`);
    if (!Array.isArray(c.quirks) || c.quirks.length < 2) throw new Error(`${where}: at least two quirks`);
    if (!c.question || !Array.isArray(c.answer) || c.answer.length < 2) throw new Error(`${where}: question and answer words`);
    for (const l of c.likes) if (!SCAMS.includes(l)) throw new Error(`${where}: unknown product ${l}`);
    for (const s of [c.gimmick, ...c.openers, ...c.quirks, c.question]) if (/[*#_`]/.test(s)) throw new Error(`${where}: no markdown in spoken lines: ${s}`);
    if (!['normal', 'whisper', 'shout', 'flat', 'grand'].includes(c.style.register)) throw new Error(`${where}: bad register ${c.style.register}`);
  }
  for (const id of Object.keys(STYLES)) if (!list.some((c) => c.id === 'al-' + id) && label === 'all') throw new Error(`style for unknown caller ${id}`);
  return list;
}

const packs = {
  'albanian-memes': validate(memes.map((e) => finish(e, 'meme')), 'memes'),
  'albanian-creators': validate(creators.map((e) => finish(e, 'creator')), 'creators'),
  'albanian-figures': validate(figures.map((e) => finish(e, 'figure')), 'figures'),
};
fs.mkdirSync(out, { recursive: true });
let total = 0;
for (const [name, list] of Object.entries(packs)) {
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(list, null, 1));
  console.log(name, list.length);
  total += list.length;
}
const all = Object.values(packs).flat();
validate(all, 'all');
fs.writeFileSync(path.join(out, 'albanian-callers.json'), JSON.stringify(all, null, 1));
console.log('albanian-callers.json', total, 'callers');
