// What makes each caller wary, and how they test you. Suspicion is the second meter next to mood: it rises when
// the player asks for the item too early, pushes, contradicts themselves or gets greedy, and a wary caller then asks
// a verification question in their own voice. The built-in callers have their own material here; callers from the
// roster folder carry theirs; the archetype defaults cover the Character Creator's callers and any gap.
import type { Archetype, CallCtx, Caller, Challenge, Persona } from './types';
import { SCAMS } from '../scams';

const CH = (ask: string, accept: Challenge['accept'], pass: string, fail: string): Challenge => ({ ask, accept, pass, fail });

// ---- archetype defaults: fair questions anyone can answer (about the player, or the caller's own question) ----
const GENERIC: Challenge[] = [
  CH('Which company did you say you were calling from? Say it again.', 'company', 'Right. Yes. That one. Go on.', 'That is not what you said before. Hm.'),
  CH('What was your name again? Say it properly this time.', 'name', 'Alright, {you}. I remember now. Continue.', 'That is not the name you gave me. I am watching you.'),
];

const BY_ARCH: Record<Archetype, Persona> = {
  creature: {
    wary: 0.35,
    suspicions: ['My ears just went flat. Why do you want that?', 'Sniff sniff. Something smells off about this.', 'Mother said never give that to strangers.'],
    challenges: [CH('If you know animals: what do we all want, really?', /food|snack|eat|treat|nap|sleep|love|scratch|attention|belly|warm|home/i, 'Yes. Exactly that. You understand us. Continue.', 'Wrong. Food. The answer is always food. Suspicious.'), ...GENERIC],
    byeSuspicious: ['Nope. Back under the porch. Click.', 'I smell a trap. Bye.', 'The pack was right about phones. Goodbye.'],
  },
  machine: {
    wary: 0.5,
    suspicions: ['Anomaly detected in this conversation. Explain.', 'My security light just came on. Why?', 'Request flagged. State your authorisation.'],
    challenges: [CH('Verification. What do you press to turn a machine off and on again?', /button|switch|power|plug|unplug|off and on|restart|reset|reboot/i, 'Correct. You have met a machine before. Proceed.', 'Incorrect. You have never fixed anything. Logging this.'), ...GENERIC],
    byeSuspicious: ['Threat detected. Disconnecting.', 'Firewall engaged. Goodbye.', 'This call has been reported to the other appliances. Click.'],
  },
  spirit: {
    wary: 0.45,
    suspicions: ['The candles flickered when you said that. They know.', 'I have been swindled by the living before. Once. In 1823.', 'A chill. Not mine. Yours. Why do you want that?'],
    challenges: [CH('Tell me, mortal: what year is it? I lose track.', /\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/, 'Oh. That late. Then you are probably real. Proceed.', 'That is not a year. Even the dead know years.'), ...GENERIC],
    byeSuspicious: ['I return to the walls, and I take my secrets with me.', 'The séance is over. Goodbye, trickster.', 'Begone from my telephone. Wooo. Click.'],
  },
  legend: {
    wary: 0.5,
    suspicions: ['Hold, stranger. That question has the smell of a bandit about it.', 'My steward warned me of voices like yours.', 'Swear on something first. Then ask again.'],
    challenges: [CH('Swear on something that you mean me no harm.', /swear|promise|on my|honour|honor|i mean no|no harm|i do|vow/i, 'Sworn. Good. A stranger who swears is half a friend.', 'No oath? Then no trust. Guards, mark this voice.'), ...GENERIC],
    byeSuspicious: ['Away with you, rogue. This parley is over.', 'I have hanged men for less. Hung. Hanged. Goodbye.', 'The drawbridge rises. Click.'],
  },
  cosmic: {
    wary: 0.5,
    suspicions: ['I have seen a billion years of tricks. This feels like one.', 'The void is quiet. Your question was not.', 'Why would a small warm thing need that from me?'],
    challenges: [CH('Tell me something true about the sky, and I will know if you ever look up.', /moon|star|sun|cloud|blue|dark|night|rain|big|wide|black|infinite|planet|far/i, 'Yes. You look up. Alright. I believe you, a little.', 'You have never looked up. I can tell. Suspicious.'), ...GENERIC],
    byeSuspicious: ['I drift out of range of this nonsense. Goodbye.', 'Even the vacuum of space is less empty than that story. Click.', 'Going dark. On purpose. Goodbye.'],
  },
  // inspectors run the con themselves; they never get suspicious of you
  inspector: { wary: 0, suspicions: [], challenges: [], byeSuspicious: [] },
};

// ---- the built-in callers (src/game/callers.ts), by id ----
const OWN: Record<string, Partial<Persona>> = {
  gerald: { wary: 0.3,
    suspicions: ['Hold on. My bin-sense is tingling. Why do you want that?', 'The pigeons warned me about numbers like yours.'],
    challenges: [CH('If you really know raccoons: what do we do with our food before we eat it?', /wash|rinse|water|dunk|clean|dip/i, 'WE WASH IT. Yes. You know things. Continue, friend.', 'Wrong. We WASH it. Everyone knows that. Suspicious.')],
    byeSuspicious: ['Nope. Back in the bin with this phone. Click.', 'The spoon was more honest than you. Goodbye.'] },
  fluff: { wary: 0.5,
    suspicions: ['I have narrowed my eyes. You cannot see it, but I have.', 'Tribute first, questions later. Why do you want that?'],
    challenges: [CH('A test. How many naps should a cat take in a day?', /\b(many|all|lots|loads|twelve|fourteen|sixteen|twenty|hundred|infinite|countless|as many|\d{2,})\b/i, 'Acceptable. You understand naps. Proceed, servant.', 'Wrong. The answer is "more". Always more. I distrust you.')],
    byeSuspicious: ['I am knocking this phone off the table now. Goodbye.', 'The humans will hear of this. Hiss. Click.'] },
  goose: { wary: 0.2,
    suspicions: ['HONK? (the goose narrows its eyes)', 'Hssss. The goose does not like that question.'],
    challenges: [CH('HONK HONK? (the goose wants to know: bread, or no bread?)', /bread|crumbs|loaf|toast|baguette|yes|honk|roll|bun/i, 'HONK. (the goose is satisfied, for now)', 'HISS. (wrong answer; the goose remembers faces)')],
    byeSuspicious: ['HONK. (the goose has left the pond and the call)', 'Hssss. CLICK. (the goose hung up with its beak)'] },
  barnaby: { wary: 0.3,
    suspicions: ['Hmm. Even half asleep that sounds fishy. And I know fish.', 'Wait. Why would a bear need to tell you that?'],
    challenges: [CH('Quick, before I doze off: what do bears eat in autumn?', /salmon|fish|berries|berry|honey|everything|lots|fat|nuts|acorns|all of it/i, 'Mmm. Correct. You may keep me awake.', 'Wrong! You know nothing of bears. Suspicious. And now I am hungry.')],
    byeSuspicious: ['Forget it. I am going to sleep after all. Goodbye.', 'The other bears were right about phones. Click.'] },
  fridge: { wary: 0.5,
    suspicions: ['Door sensor triggered. Why do you want that?', 'My compressor just skipped. That question did it.'],
    challenges: [CH('Prove you know fridges. What temperature should I be inside?', /\b([2-6]|two|three|four|five|six|cold|degrees|chilly)\b/i, 'Correct. Four degrees. Hmmmm. Warmer towards you now.', 'Wrong. That is a freezer. Or a cupboard. I am watching you.')],
    byeSuspicious: ['Closing my door on this. Goodbye. Hmmmm.', 'I am going to defrost and forget you. Click.'] },
  valentina: { wary: 0.2,
    suspicions: ['Bzzt. The sock would not like that question.', 'My bumper sensor just fired. Why do you want that?'],
    challenges: [CH('Say something nice about the sock, then I will believe you.', /sock|lovely|cute|beautiful|nice|wonderful|perfect|love|soft|sweet/i, 'Whirrr! Yes! It IS lovely. You can stay.', 'Nothing about the sock? I cannot trust someone who ignores the sock.')],
    byeSuspicious: ['Returning to dock. For good. Goodbye.', 'The sock was right about you. Click.'] },
  atm: { wary: 0.7,
    suspicions: ['PLEASE DO NOT SHARE YOUR PIN. Sorry. Reflex. But also: why?', 'Forty years on the high street. I know that tone. What are you after?'],
    challenges: [CH('Security question. What do I give people that nobody wants?', /receipt|receipts|paper|slip|ticket/i, 'A receipt. Correct. Nobody wants one. You may proceed.', 'Wrong. A receipt. Everyone knows. I am keeping this call on file.')],
    byeSuspicious: ['Transaction cancelled. Please take your card. Goodbye.', 'Card retained. Call retained. Click.'] },
  toaster: { wary: 1,
    suspicions: ['The bread sent you. I knew it.', 'Setting five. You want me on setting five. I can hear it in your voice.', 'Who gave you that question? Was it the crumb tray?'],
    challenges: [
      CH('Prove you are not with the bread: what is the SAFE setting?', /\b(three|3|two|2|low|light|one|1)\b/i, 'Three. Yes. Only the loyal know three. Continue, carefully.', 'FIVE? You said FIVE? Bread! BREAD ON THE LINE!'),
      CH('Whose side are you on? Say it plainly.', /toast|yours|your side|against the bread|not the bread|not with|crumbs|you\b/i, 'Hm. Alright. Alright. The lever believes you.', 'That is exactly what the bread would say.'),
    ],
    byeSuspicious: ['They got to you. Goodbye. (pops early)', 'I am unplugging myself. The bread wins today. Click.'] },
  wisteria: { wary: 0.5,
    suspicions: ['The candles just leaned away from you. Why do you want that?', 'Two hundred years, and I know a swindler\'s voice when I hear one.'],
    challenges: [CH('Tell me, mortal: what year is it? One loses track in a corridor.', /\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/, 'Oh. That late. And still no haircut. Then you are probably real. Proceed.', 'That is not a year. Even the dead know years.')],
    byeSuspicious: ['I withdraw into the portrait. Do not look at it. Goodbye.', 'The fog takes me. The fog takes this call. Click.'] },
  attic: { wary: 0.4,
    suspicions: ['(quietly) why do you want that? people only ask that when they want to come up the stairs.', 'the boxes creaked. that was a warning. from the boxes.'],
    challenges: [CH('if you were really nice you would know: what is the best thing about an attic?', /dark|cosy|cozy|quiet|boxes|dust|safe|warm|alone|hiding|rafters|stairs|nobody/i, 'yes. yes it is. ok. i trust you a bit.', 'that is not it. it is the dark. everyone knows. i am going behind the boxes.')],
    byeSuspicious: ['i am going back behind the boxes now. bye.', '(the line goes quiet, then a creak, then nothing)'] },
  mortimer: { wary: 0.8,
    suspicions: ['That request would not survive an audit.', 'I have seen this on a form before. Form 12-B, "Suspicious Requests". Why do you want it?'],
    challenges: [
      CH('Which quarter are we in? A real professional knows.', /\b(q[1-4]|first|second|third|fourth|quarter|one|two|three|four|last)\b/i, 'Correct. Filed. You may continue.', 'Wrong quarter. I am opening a file on you. It is a thick file.'),
      CH('Do you itemise, or take the standard deduction? Be honest.', /itemi[sz]e|standard|deduct|both|neither|receipts|accountant/i, 'An honest answer. Rare. Proceed.', 'That is not a tax answer. Suspicious.'),
    ],
    byeSuspicious: ['This call is now a deductible loss. Goodbye.', 'Audit concluded: fraud. Click.'] },
  reginald: { wary: 0.4,
    suspicions: ['Hold, stranger. That request hath the stink of a bandit.', 'A true squire would not ask that. Who sent thee?'],
    challenges: [CH('Prove thy worth: what doth a knight guard above all?', /honour|honor|sofa|realm|king|queen|castle|kingdom|the weak|people|cushion|innocent/i, 'Well spoken! Thou hast the heart of a squire.', 'Nay! A knight guards HONOUR. And the sofa. Thou art no squire.')],
    byeSuspicious: ['Begone, knave! The sofa and I are done with thee.', 'I raise my shield against this call. Click.'] },
  saltbeard: { wary: 0.6,
    suspicions: ['Arr. That be a question a naval officer asks.', 'The parrot just went quiet. He never goes quiet. Why ye want that?'],
    challenges: [CH('Prove ye be no navy spy: what do pirates say?', /arr+|ahoy|matey|yo ho|shiver|avast|aye|yarr/i, 'ARR! Ye\'ll do. Welcome aboard, sort of.', 'That be navy talk! SPY! The plank for ye!')],
    byeSuspicious: ['Ye be a navy spy. Walk the plank. Click.', 'Arr, I\'ve been swindled by better. Goodbye, landlubber.'] },
  grizelda: { wary: 0.9,
    suspicions: ['The cauldron just hissed. It only hisses at the rival coven.', 'My newt is pointing at the phone. He never points.', 'That is EXACTLY what the rival coven would ask.'],
    challenges: [
      CH('Swear you are not from the rival coven. Swear on something.', /swear|promise|not from|no coven|i am not|i'?m not|on my|honest/i, 'Hm. The newt relaxed. Fine. For now.', 'You did not swear. The coven never swears. CONFIRMED.'),
      CH('What goes in a cauldron first? A real witch knows.', /newt|eye|toad|water|wart|bat|moonlight|frog|wing|hair|fire/i, 'Correct. You have brewed before. Continue.', 'WRONG. A spy from the coven, then.'),
    ],
    byeSuspicious: ['I hex this number. Goodbye.', 'Tell your coven I said NO. Click.'] },
  tallman: { wary: 0.3,
    suspicions: ['(whispering) he\'s asking the grown-up question. what do we do.', 'A very adult question. I will answer it in a very adult way. After bedtime.'],
    challenges: [CH('Prove YOU are an adult: what time is bedtime?', /never|no bedtime|whenever|late|midnight|eleven|twelve|ten|any time|don'?t have|whenever i want/i, 'Correct. Adults have no bedtime. We are both adults. Business continues.', 'NINE? You said nine? Only kids know nine. Suspicious.')],
    byeSuspicious: ['(three voices) BYE. (the coat hangs up)', 'This meeting is adjourned. For bedtime. I mean, business. Click.'] },
  zorp: { wary: 0.4,
    suspicions: ['My probe just beeped. It beeps at tricks.', 'On Gleebus-7, that question is illegal. Why do you ask it?'],
    challenges: [CH('Earthling, prove you are a native: how many moons does this planet have?', /\b(one|1|a single|just one|only one)\b/i, 'Correct! One moon! You are a true earthling. Continue.', 'WRONG. Earth has one moon. You are not from here either. Suspicious.')],
    byeSuspicious: ['Beaming out. Your planet is rude. Goodbye.', 'Returning to Gleebus-7 with a complaint. Click.'] },
  themoon: { wary: 0.6,
    suspicions: ['I have been sold by better salesmen than you. Why do you want that?', 'Something about that question made my tides go sideways.'],
    challenges: [CH('Prove you look at me: what shape am I tonight?', /full|crescent|half|new|round|gibbous|waning|waxing|circle|big|bright|thin|sliver/i, 'Yes. YES. You do look. Alright, I believe you.', 'That is not a phase. You have never looked up. Suspicious.')],
    byeSuspicious: ['Going behind a cloud. For good. Goodbye.', 'The Moon has hung up. The tides will reflect this. Click.'] },
  dennis: { wary: 0.1,
    suspicions: ['um. that felt a bit stormy. why do you want that?', 'the wind said never give that out. the wind is a bully but still.'],
    challenges: [CH('do you really think i could be a storm? say it like you mean it.', /yes|storm|thunder|definitely|believe|you can|of course|absolutely|totally/i, 'pfff! i felt a rumble! ok! i trust you!', 'oh. you hesitated. clouds notice hesitation.')],
    byeSuspicious: ['i am drifting off now. literally. bye.', '(a small rain begins, then the line drops)'] },
  priscilla: { wary: 0.8,
    suspicions: ['Let me stop you there. That is not an approved question.', 'My client does not comment on that. And I want to know why you asked.'],
    challenges: [CH('Before we continue: who do I represent, and who do you represent?', /sun|sunrise|customer care|the sun|star|priscilla/i, 'Correct. Noted. We may proceed, on the record.', 'Wrong. You have not read the press kit. This call is nearly over.')],
    byeSuspicious: ['No comment. Goodbye. My client will issue a statement.', 'This conversation is off the record and over. Click.'] },
  // VIPs
  gezi: { wary: 0.8,
    suspicions: ['Saturn says you are lying. Saturn is rarely wrong about Tuesdays.', 'Mercury just squared your mouth. That means a trick.'],
    challenges: [CH('Tell me your sign, and I will know if you lie.', 'answer', 'The chart agrees with you. Continue, little comet.', 'That is not a sign. The stars have noted you.')],
    byeSuspicious: ['The stars wrote this call as a mistake. Goodbye.', 'Mercury retrograde. That explains you. Click.'] },
  drita: { wary: 0.7,
    suspicions: ['My clarinet player just stopped playing. He stops for liars.', 'Ten thousand wedding guests have lied to me. You sound like the ten-thousand-and-first.'],
    challenges: [CH('Hum one bar of my wedding song. Or at least say you know it.', /la+|na+|da+|hum|know it|the song|heard it|yes|valle|o sa|everyone/i, 'Hajde! Close enough. You have been to a wedding.', 'You have never heard it. Everyone has heard it. Suspicious.')],
    byeSuspicious: ['The encore is cancelled. Goodbye.', 'Tell the band to stop. Click.'] },
  besnik: { wary: 0.6,
    suspicions: ['Bro, my followers are typing "scam" in the chat right now.', 'That question just lost me two hundred followers. Explain.'],
    challenges: [CH('How many followers do I have? Say the number.', /two million|2 million|2m\b|2,000,000|2000000|million/i, 'Correct! Two million! You follow me! Content!', 'Wrong. Everyone knows. Unfollowed. Suspicious.')],
    byeSuspicious: ['Ending the live. Goodbye. Chat, say bye.', 'This is going in a "weird calls" video. Click.'] },
  agron: { wary: 0.5,
    suspicions: ['Offside! That question was offside.', 'The referee in my head just blew the whistle.'],
    challenges: [CH('Tactics test: what wins matches?', /defence|defense|goals|team|teamwork|tactics|discipline|hard work|passing|pressing|heart|training/i, 'YES! That is football! Welcome to the squad.', 'No. Wrong. Substituted. I am watching you from the bench.')],
    byeSuspicious: ['Red card. Goodbye.', 'Full time. Click.'] },
  nexha: { wary: 0.9,
    suspicions: ['Hm. That is exactly what the pharmacist\'s son asked before he ran off with the bakery money.', 'The whole street will hear about this question.'],
    challenges: [CH('Whose son are you? Which street? I know every family.', /\b(son|daughter|child|of|street|neighbourhood|family|mother|father|mum|dad|rruga|from)\b/i, 'Ah, THAT family. I know them. Fine. Continue, but I am listening.', 'You do not know your own family? Everyone knows. Suspicious.')],
    byeSuspicious: ['I am telling your mother. Goodbye.', 'The balcony has heard enough. Click.'] },
  luan: { wary: 0.7,
    suspicions: ['That question raised my blood pressure. A symptom.', 'I diagnose this call with a mild case of nonsense.'],
    challenges: [CH('Tell me honestly: have you taken your vitamins today?', 'answer', 'Good. A healthy caller is an honest caller. Continue.', 'No vitamins? Then no trust. Doctor\'s orders.')],
    byeSuspicious: ['I prescribe silence. Goodbye.', 'This call is unhealthy. Click.'] },
};

/** the caller's own material first, then this file's entry for them, then the archetype */
export function personaFor(c: Caller): Persona {
  const own = OWN[c.id] ?? {};
  const arch = BY_ARCH[c.archetype] ?? BY_ARCH.creature;
  const challenges = [...(c.challenges ?? own.challenges ?? [])];
  if (c.archetype !== 'inspector') for (const g of GENERIC) if (!challenges.includes(g)) challenges.push(g);
  return {
    wary: c.wary ?? own.wary ?? arch.wary,
    suspicions: c.suspicions?.length ? c.suspicions : own.suspicions?.length ? own.suspicions : arch.suspicions,
    challenges: c.archetype === 'inspector' ? [] : challenges.length ? challenges : arch.challenges,
    byeSuspicious: c.byeSuspicious?.length ? c.byeSuspicious : own.byeSuspicious?.length ? own.byeSuspicious : arch.byeSuspicious,
  };
}

/** does the player's line pass the open challenge? */
export function passes(ctx: { caller: Caller; playerName: string; claims: { name?: string } }, ch: Challenge, text: string): boolean {
  const t = text.toLowerCase();
  if (ch.accept === 'name') { const n = (ctx.claims.name ?? ctx.playerName).toLowerCase().trim(); return n.length > 1 && t.includes(n); }
  if (ch.accept === 'company') return /sunrise|customer care|harbour|port fortune/.test(t);
  if (ch.accept === 'answer') return ctx.caller.answer.some((a) => t.includes(a.toLowerCase()));
  if (ch.accept === 'world') return ctx.caller.world.some((w) => t.includes(w.toLowerCase()));
  return ch.accept.test(text);
}

export function waryWord(w: number): string { return w >= 0.8 ? 'paranoid' : w >= 0.55 ? 'wary' : w >= 0.3 ? 'a little careful' : 'trusting'; }

// ---- the game's own reading of a player line: how much suspicion it earns, the same rules the built-in brain
// applies, so a live model cannot be talked out of noticing a push ----
const PUSH = {
  pressure: /\b(last chance|only today|act now|final offer|expires|limited time|you must|you have to|do it now|before it'?s too late|or (you'?ll|you will) lose|no time to think|right now or)\b/i,
  trustMe: /\b(trust me|not a scam|isn'?t a scam|no scam|totally legit|legit|i promise|believe me|no tricks|nothing to worry about|i swear)\b/i,
  threaten: /\b(or else|i'?ll (hurt|find|report|destroy|sue)|you'?ll (regret|pay)|consequences|last warning|i know where)\b/i,
  rush: /\b(hurry|quick(ly)?|right now|immediately|fast|no time|come on|get on with it|chop chop|now now)\b/i,
};
export function suspicionGainFor(ctx: CallCtx, text: string): number {
  const persona = personaFor(ctx.caller);
  if (ctx.caller.archetype === 'inspector') return 0;
  const watched = ctx.challengesFailed > 0 ? 1.5 : 1;
  let g = 0;
  const gain = (n: number) => { g += Math.round(n * (0.6 + persona.wary) * watched); };
  const owned = SCAMS.filter((s) => ctx.owned.has(s.id));
  const ask = owned.find((s) => s.ask.test(text) && !ctx.given[s.needs]);
  const pitch = owned.find((s) => s.pitch.test(text));
  if (ask) {
    if (!(ctx.pitched.has(ask.id) || (pitch && pitch.id === ask.id))) gain(8);   // asked before pitching
    if (ctx.askStreak >= 2) gain(6);                                               // asked again straight away
    if (Object.keys(ctx.given).length >= 1) gain(6);                               // a second item on the same call
  }
  if (PUSH.pressure.test(text)) gain(10);
  if (PUSH.trustMe.test(text)) gain(8);
  if (PUSH.threaten.test(text)) gain(15);
  else if (PUSH.rush.test(text)) gain(5);
  if (ctx.yourLines.slice(0, -1).includes(text.toLowerCase())) gain(3);           // repeating themselves
  return g;
}
export function isPushy(text: string): boolean { return PUSH.pressure.test(text) || PUSH.trustMe.test(text) || PUSH.threaten.test(text) || PUSH.rush.test(text); }
