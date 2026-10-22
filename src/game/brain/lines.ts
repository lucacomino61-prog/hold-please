// What the callers say back, by archetype. {name} = caller, {you} = player, {value} = the thing they give.
import type { Archetype, GiveKind } from './types';

export type Reaction =
  | 'greet' | 'name' | 'yesand' | 'compliment' | 'answer' | 'pitch_like' | 'pitch_meh' | 'early' | 'insult' | 'deny'
  | 'threaten' | 'rush' | 'nonsense' | 'question' | 'yes' | 'no' | 'idle' | 'bye_angry' | 'bye_polite' | 'happy' | 'wrong'
  | 'reassure' | 'withdraw' | 'who' | 'why' | 'selling' | 'price_like' | 'price_meh' | 'price_none' | 'smalltalk' | 'repeat'
  | 'nudge' | 'almost' | 'callback'
  | 'suspicious' | 'challenge_pass' | 'challenge_fail' | 'challenge_again' | 'bye_suspicious' | 'contradiction' | 'greedy' | 'pressure' | 'unpitched';

type Table = Record<Reaction, string[]>;

const base: Table = {
  who: ['Who am I? I\'m {name}.', 'You rang me and you don\'t know who I am? {name}. Write it down.', '{name}. That\'s me.'],
  why: ['Why did I call? I honestly don\'t remember. Something was wrong. Or right. One of those.', 'I called because the phone was there. Is that not a reason?', 'There was a reason. It\'s gone now. Entertain me instead.'],
  selling: ['You\'re the one selling, {you}. What have you got? Impress me.', 'I don\'t know, what ARE you selling? Say it like you mean it.', 'Sell me something. Anything. I\'m in a buying mood, possibly.'],
  price_like: ['That\'s a lot of money. I like it. Big numbers feel important.', 'Hmm. Pricey. But I\'ve wanted this for a while. Go on.', 'For that price it had better come with a certificate. Does it come with a certificate?'],
  price_meh: ['That\'s a lot of money for something I didn\'t want ten seconds ago.', 'No. Too much. Try selling me something I actually like.', 'I\'ve seen worse prices. On better things.'],
  price_none: ['Price for what? You haven\'t told me what you\'re selling.', 'Money for what, exactly? Start at the beginning.', 'I\'m not paying for a mystery. What is it?'],
  smalltalk: ['I\'m fine. Surprisingly fine. Thank you for asking, nobody does.', 'Could be better, could be a toaster. How are YOU?', 'Oh, you know. Existing. Loudly.'],
  repeat: ['You said that already.', 'Same words, same answer.', 'Are you a recording? You just said that.'],
  nudge: ['Alright, I\'m interested. What do you need from me?', 'Fine, fine. What do I have to do?', 'So how does this work? What do you need?'],
  almost: ['You\'re close, though. Keep talking.', 'Nearly. Warm me up a bit more.', 'Almost. Say something nice first.'],
  callback: ['Still thinking about the {topic}, if I\'m honest.', 'You mentioned the {topic}. I liked that.', 'We should get back to the {topic} at some point.'],
  greet: ['Hello to you too. Go on then.', 'Yes, hello, hello. What is it?', 'Oh, manners. Lovely. Continue.'],
  name: ['You know my name. Good. Most don\'t bother.', 'That\'s me. Nobody says it properly. You did.', 'Ah, you\'ve done your homework. I like that.'],
  yesand: ['Yes! Exactly that. You get it.', 'Finally, someone who understands.', 'Oh, you\'re one of us. Marvellous.', 'That\'s the spirit. Keep going.'],
  compliment: ['Stop it. No, go on.', 'Flattery works on me. I\'m not ashamed.', 'Well. Well well well. Thank you.'],
  answer: ['Ha! A real answer. Nobody ever answers me.', 'Yes! Thank you. That was bothering me.', 'See, that\'s all I wanted. Someone to answer.'],
  pitch_like: ['Oh now that is interesting. Tell me more.', 'I\'ve been waiting my whole life for someone to offer me that.', 'Go on. I\'m listening properly now.'],
  pitch_meh: ['Hm. Not really my thing. What else?', 'I don\'t see why I\'d want that. Convince me.', 'That sounds like something for other people.'],
  early: ['Slow down. I don\'t know you yet.', 'We\'ve only just met and you want THAT? Talk to me first.', 'Not yet. Make me like you first.'],
  insult: ['Excuse me? I did not call to be insulted.', 'Charming. Absolutely charming.', 'Say that again and I\'m gone.'],
  deny: ['Not real? NOT REAL? I am on the PHONE.', 'Oh, you\'re one of those. "Not real." Rude.', 'I\'m as real as this call. Which, I notice, you answered.'],
  threaten: ['Are you threatening me? On my own phone?', 'That was a threat. I heard a threat.', 'Oh dear. You\'ve gone and threatened me.'],
  rush: ['Don\'t rush me. I have all the time in the world.', 'Hurry? Why hurry? Where\'s the fire?', 'Slow DOWN. Honestly.'],
  nonsense: ['...What?', 'I don\'t follow. Try again.', 'Was that a sentence?', 'Hm?'],
  question: ['Good question. I\'ll answer when I\'ve decided whether I like you.', 'Why do you want to know?', 'Depends who\'s asking.'],
  yes: ['Yes? Yes what?', 'Right. Yes. Agreed. On what, exactly?', 'Good. Glad we agree.'],
  no: ['No? Well. Suit yourself.', 'That\'s a no, then.', 'Fine. No. Noted.'],
  idle: ['Hello? Still there?', 'Have you fallen asleep?', 'I can hear you breathing. Say something.'],
  bye_angry: ['That\'s enough. Goodbye.', 'I\'m hanging up. Don\'t call back.', 'Right. That\'s it. Click.'],
  bye_polite: ['Well, that\'s all I can do today. Lovely chatting.', 'I must go. Things to do, you know. Bye now.', 'Thank you for this. Truly. Goodbye.'],
  happy: ['Did it go through? Wonderful. I feel lighter already.', 'That\'s the best decision I\'ve made all week.', 'Done? Splendid. I\'ll tell everyone about you.'],
  wrong: ['Hm, I don\'t think that\'s right.', 'No, that\'s not what I said.', 'Were you listening?'],
  reassure: ['Alright. Alright. I\'ll hold.', 'You sound very sure. Fine. I\'ll stay in.', 'Okay... I trust you. Don\'t make me regret it.'],
  withdraw: ['Wait, the number\'s going funny. I want out. Get me OUT.', 'This feels wrong. I want my money back. Now, please.', 'I\'ve changed my mind. Sell. Sell everything.'],
  // ---- suspicion ----
  suspicious: ['Hold on. Why do you need that, exactly?', 'Hm. That\'s the kind of thing people ask when they\'re up to something.', 'Wait. Who did you say you were with again?', 'I\'m not sure I like where this is going.'],
  challenge_again: ['I asked you something. Answer it.', 'You didn\'t answer my question. That\'s what people do when they\'re up to something.', 'Still waiting for an answer, {you}.'],
  challenge_pass: ['...Alright. Fine. That checks out.', 'Hm. Good answer. I\'ll keep talking.', 'See, that\'s all I needed. Carry on.'],
  challenge_fail: ['That\'s not an answer. I\'m writing this call down.', 'Wrong. Or a dodge. Either way, I\'m watching you now.', 'No. I don\'t think you are who you say you are.'],
  bye_suspicious: ['Right. I\'m hanging up and I\'m telling everyone about this number.', 'No. This is a trick. Goodbye.', 'I don\'t believe a word. Don\'t call again. Click.'],
  contradiction: ['Wait. A minute ago you said your name was something else.', 'That\'s not what you said before. Which is it?', 'You keep changing your story. I noticed.'],
  greedy: ['Another one? I\'ve given you enough for one phone call.', 'You want more? That\'s a lot of wanting for one evening.', 'Hm. Greedy. I don\'t like greedy.'],
  pressure: ['Don\'t push me. Pushing makes me suspicious.', 'Why the pressure? Honest people don\'t pressure.', 'The more you push, the less I believe you.'],
  unpitched: ['You want WHAT? You haven\'t told me what you\'re selling.', 'Hold on. What is this even for? Sell me something first.', 'For what? Start at the beginning. What are you offering?'],
};

const creature: Partial<Table> = {
  greet: ['Hello! Hello hello. Yes. Hi.', 'Oh. A human voice. Hi.', 'Greetings, person. I\'m listening with my whole face.'],
  suspicious: ['My ears just went flat. Why do you want that?', 'Sniff sniff. Something smells off about this.', 'Hold on. Mother said never give that to strangers.'],
  bye_suspicious: ['Nope. Back under the porch. Click.', 'I smell a trap. Bye.', 'The pack was right about phones. Goodbye.'],
  insult: ['I may be an animal but I have FEELINGS.', 'Hiss. HISS. Take it back.', 'That\'s it, I\'m biting the phone.'],
  bye_angry: ['Bye. I\'m going back to the bin.', 'Hiss. Click.', 'No more talking. Only chewing. Goodbye.'],
  nonsense: ['Blink blink. What?', '*tilts head*', 'I understood "the". Nothing else.'],
};
const machine: Partial<Table> = {
  greet: ['Greeting acknowledged. Processing. Hello.', 'Beep. Hello. My hello is sincere.', 'Boot sequence complete. Hi.'],
  suspicious: ['Anomaly detected in this conversation. Explain.', 'My security light just came on. Why?', 'Request flagged. State your authorisation.'],
  challenge_fail: ['Verification failed. Logging this call.', 'Incorrect. I have made a note. The note is permanent.'],
  bye_suspicious: ['Threat detected. Disconnecting.', 'Firewall engaged. Goodbye.', 'This call has been reported to the other appliances. Click.'],
  insult: ['Error. Rudeness detected. Fans spinning up.', 'I have logged that. I log everything.', 'Unkind input. Cooling down. Emotionally.'],
  deny: ['Not real? I have a serial number. Do YOU have a serial number?', 'I am real enough to be on a payment plan.', 'My existence is confirmed by my warranty card.'],
  bye_angry: ['Shutting down. Goodbye. Beep.', 'Connection terminated. By me. On purpose.', 'Entering standby. Do not call again.'],
  nonsense: ['Input not recognised.', 'Does not compute. Try shorter words.', 'Buffering. Still buffering. What?'],
};
const spirit: Partial<Table> = {
  greet: ['Oooooh, hello, hello.', 'A greeting! The living are so polite today.', 'Hello from beyond. Mostly beyond.'],
  suspicious: ['The candles flickered when you said that. They know.', 'I have been swindled by the living before. Once. In 1823.', 'A chill. Not mine. Yours. Why do you want that?'],
  bye_suspicious: ['I return to the walls, and I take my secrets with me.', 'The séance is over. Goodbye, trickster.', 'Begone from my telephone. Wooo. Click.'],
  insult: ['I have been dead two centuries and that is the rudest thing I have heard.', 'I shall haunt you for that. Lightly.', 'The candles just went out. That was me. I\'m upset.'],
  deny: ['Not real? I\'m a GHOST. Not real is my whole thing and I\'m still offended.', 'The living always say that. Then they feel a draught.', 'I walked through a wall this morning. Try that, "real" person.'],
  bye_angry: ['I return to the walls. Goodbye.', 'Fading now. Out of spite.', 'Wooooo. That means goodbye.'],
};
const legend: Partial<Table> = {
  greet: ['Hail and well met!', 'Greetings, traveller.', 'Well met, voice from the box.'],
  suspicious: ['Hold, stranger. That question has the smell of a bandit about it.', 'My steward warned me of voices like yours.', 'Swear on something first. Then ask again.'],
  challenge_fail: ['A false answer! Guards!', 'You lie as badly as you bargain.'],
  bye_suspicious: ['Away with you, rogue. This parley is over.', 'I have hanged men for less. Hung. Hanged. Goodbye.', 'The drawbridge rises. Click.'],
  insult: ['Thou darest? THOU DAREST?', 'My honour! Besmirched! Over a phone!', 'I have been called worse by better. Still. Rude.'],
  rush: ['Haste is the enemy of valour. Slow down.', 'A knight is never rushed. Nor a pirate. Nor a witch.', 'Patience, stranger. Legends take their time.'],
  bye_angry: ['I sheathe my phone. Farewell, knave.', 'Begone. Click.', 'This parley is over.'],
};
const cosmic: Partial<Table> = {
  greet: ['Greetings from very far away.', 'Hello, small warm thing.', 'Salutations across the void.'],
  suspicious: ['I have seen a billion years of tricks. This feels like one.', 'The void is quiet. Your question was not.', 'Why would a small warm thing need that from me?'],
  bye_suspicious: ['I drift out of range of this nonsense. Goodbye.', 'Even the vacuum of space is less empty than that story. Click.', 'Going dark. On purpose. Goodbye.'],
  insult: ['I have watched civilisations rise and fall and still, that stung.', 'Rude. I am older than your language.', 'I\'ll remember that for a billion years.'],
  deny: ['Not real? I am visible from your garden.', 'Look up. Go on. I\'ll wait.', 'Not real, says the ape with the phone.'],
  bye_angry: ['I drift away now. Goodbye, earth person.', 'Orbit calls. Farewell.', 'I\'m going dark. Literally.'],
};
const inspector: Partial<Table> = {
  greet: ['Hello hello. Very good. Now, the attachment.', 'Yes, hi. So, that file I sent.', 'Great. Great. Shall we do the quick thing I mentioned?'],
  yesand: ['Mm-hm. Lovely. So, the thing I asked.', 'Sure, sure. Anyway, the file.', 'Right. And have you clicked it yet?'],
  early: ['Ha, no, I\'m not selling anything. I\'m the one asking. The attachment, please.', 'I don\'t have one of those. But I do have a file for you.', 'Nice try. Open the file and we\'ll talk.'],
  pitch_like: ['Not interested, but I AM interested in you opening that file.', 'Sounds great. Click the link and tell me more.', 'Fascinating. Press Allow first.'],
  pitch_meh: ['Not interested, but I AM interested in you opening that file.', 'Sounds great. Click the link and tell me more.', 'Fascinating. Press Allow first.'],
  no: ['Hm. That\'s a shame. It\'s just a little file.', 'No? Everyone says no at first.', 'Think about it. I\'ll ask again.'],
  insult: ['There\'s no need for that. I\'m only doing my job.', 'I\'ll note that in the report. Open the file.', 'Tsk. Very unprofessional. The attachment?'],
  bye_angry: ['Fine. We\'ll be in touch. We\'re always in touch.', 'Suit yourself. Click.', 'Noted. Goodbye.'],
  bye_polite: ['Fine. We\'ll be in touch. We\'re always in touch.', 'Suit yourself. Click.', 'Noted. Goodbye.'],
  idle: ['Still there? The file is still there too.', 'Hello? Have you opened it?', 'Take your time. The attachment isn\'t going anywhere.'],
};

const TABLES: Record<Archetype, Table> = {
  creature: { ...base, ...creature },
  machine: { ...base, ...machine },
  spirit: { ...base, ...spirit },
  legend: { ...base, ...legend },
  cosmic: { ...base, ...cosmic },
  inspector: { ...base, ...inspector },
};

export function line(arch: Archetype, r: Reaction): string {
  const list = TABLES[arch][r] ?? base[r];
  return list[Math.floor(Math.random() * list.length)];
}

// Lines that hand over the item. {value} is read slowly by the voice.
export const GIVE: Record<GiveKind, string[]> = {
  crater: ['Put me down for the crater called {value}. It has a nice ring to it.', 'I want {value}. The crater. Yes, that one. Write it down.', 'Fine. {value}. I\'ll take {value}. It sounds roomy.'],
  sunserial: ['Squinting... the number on the Sun says {value}. Did you get that? {value}.', 'It\'s right there, under the big flare: {value}.', 'I had to use the telescope. {value}. That\'s the serial.'],
  gravitypin: ['My PIN? Let\'s make it "{value}". Easy to remember. "{value}".', 'Put down "{value}". That\'s my gravity word now.', 'I choose "{value}". It feels heavy. Good for gravity.'],
  cumulus: ['Store {value} of them. {value} clouds. The fluffy ones first.', 'I\'ll have {value}. {value} clouds, delivered monthly.', '{value}. Final answer. {value} clouds.'],
  vowelname: ['Without vowels? Alright: {value}. That\'s me without the vowels. {value}.', 'Let me think... {value}. Spelled {value}.', 'Ugh, fine. {value}. I sound like a sneeze.'],
  hauntref: ['The reference is on the scroll: {value}. Yes, {value}.', 'My haunting number is {value}. Don\'t lose it, they never reissue them.', '{value}. That\'s the reference. {value}.'],
  petplan: ['The pet is {value}. Write it exactly like that: {value}.', 'My little one is called {value}, and we\'ll have the {value} plan. Hm? I said {value}.', 'Pet and plan: {value}. Got it? {value}.'],
  rune: ['The rune on the ticket reads {value}. Is that the winning one? {value}.', 'It\'s smudged but I think it says {value}. Yes. {value}.', 'Ticket says {value}. I\'ve had it since the solstice. {value}.'],
  bean: ['Alright, I\'m in for {value} dollars. {value}. Make them grow.', 'Put {value} in. Beans. Coins. Whatever. {value} dollars.', 'I can do {value}. Not a bean more. {value}.'],
  fridgecode: ['Inside the door... there\'s a sticker... {value}. The code is {value}.', 'Got it. The numbers are {value}. Did you write them down? {value}.', 'It\'s cold in here. {value}. That\'s the code. {value}.'],
  lavaweek: ['Put me down for {value}. {value} on the volcano. I\'ll bring a hat.', 'I\'ll take {value}. It\'s nobody\'s birthday that week.', '{value}. Final answer. {value}.'],
  quietword: ['(whispering) {value}. My quiet word is {value}. Don\'t tell the goose.', 'Shh. {value}. Did you get that? {value}.', 'My word is {value}. Very quiet. {value}.'],
  shadows: ['I have {value} shadows. {value}. One is not technically mine.', 'Let me count... {value}. {value} shadows, store them all.', '{value} shadows. The big one first, please. {value}.'],
  tuesday: ['Remove {value}. {value} has never done anything for me.', 'Tuesday {value}. Gone. Please. {value}.', 'I never want to see Tuesday {value} again. {value}.'],
  echoword: ['The word that keeps echoing is {value}. {value}. {value}. See? {value}.', 'It is {value}. Every time I say {value} it comes back. {value}.', '{value}. The echo word is {value}. Take it away.'],
  dreamcode: ['The claim number in the dream was {value}. I wrote it on my hand. {value}.', 'Dream number {value}. It was on a door in the dream. {value}.', '{value}. The dream said {value}. Then I woke up.'],
  colours: ['I want {value}. In that order. {value}.', 'My rainbow: {value}. Do not mix them up. {value}.', 'Put {value} on it. {value}. Top to bottom.'],
  sky: ['Tomorrow I want {value}. Just {value}, all day.', 'Make it {value}. {value} would be lovely.', 'Put me down for {value}. I have the shoes for {value}.'],
  shadowlength: ['In the afternoon it is about {value}. {value}, give or take a goose.', 'I measured it once: {value}. It was a Tuesday. {value}.', 'My shadow? {value}. It follows me everywhere, so I know.'],
  fallcount: ['This year? {value} times. {value}. One of them was on purpose.', 'I fell {value} times. I keep a list. {value}.', '{value}. Every single one gravity\'s fault. {value} falls.'],
  birthmonth: ['My birthday is in {value}. Do not cancel {value}, I have plans.', '{value}. I was born in {value}, there was snow, or bees.', 'It\'s in {value}. Insure {value}, please, the whole month if you can.'],
  nobelfield: ['I won it in {value}. {value}! Finally. Engrave it {value}.', 'The category is {value}. I always said {value} was my strongest subject.', 'Put {value} on the medal. {value}. Spell it nicely.'],
  depth: ['I want to go {value} down. {value}, no deeper, I have a meeting.', 'Take me to {value}. {value} sounds dark enough.', '{value}. Exactly {value}. I counted on the way up once.'],
  echocount: ['I want {value} echoes. {value}. The hallway deserves it.', '{value} echoes, please. {value}. Echoes. Echoes.', 'Make it {value}. {value} and the neighbours will know I\'m home.'],
  station: ['I will board at {value}. {value}, by the bakery.', 'Pick me up at {value}. {value}. The one with the goose.', 'My station is {value}. I always go from {value}.'],
  toothcount: ['The ghost has {value} teeth left. {value}. We counted in the mirror, sort of.', '{value} teeth. {value}. The rest went in the war, it says.', 'It\'s got {value} left. {value}. Pull nothing it likes.'],
  zonehours: ['I want to live {value} ahead. {value}. I want to know things first.', 'Move me {value}. {value} and I\'ll finally be early for once.', 'Set it to {value}. {value}, and leave the furniture.'],
  viewcode: ['The FarView code on my screen says {value}. Did you get it? {value}.', 'It\'s flashing... {value}. The code is {value}.', 'One-time code... {value}. {value}. Is it connecting? It feels like it\'s connecting.'],
};
