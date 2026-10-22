// The case: Inspector Vane of the Bureau of Nonsense calls once a day from day 2, remembers every call, and keeps a
// file. Three slips (you said yes to an inspector's file, a caller saw through you, you insulted Vane) and the run
// ends in a courtroom review, quota or no quota. Slips are saved with the run.
import { bus, state, type CallRecord } from './state';
import type { Caller } from './brain/types';

export type SlipKind = 'file' | 'busted' | 'insult';
export interface Slip { day: number; kind: SlipKind; text: string }

export const VANE: Caller = {
  id: 'vane', name: 'Inspector Vane', archetype: 'inspector',
  gimmick: 'The Bureau of Nonsense\'s senior inspector, building a file on you one call at a time.',
  world: ['bureau', 'file', 'case', 'evidence', 'form', 'inspection', 'statement', 'record'],
  openers: ['Inspector Vane, Bureau of Nonsense. We have spoken before. We will speak again. The file is open.'],
  quirks: ['Everything you say is in the file. Even the pauses.', 'The Bureau never closes a file. It only grows.', 'My colleague Honk sends his regards. He is not senior. I am.'],
  question: 'Will you open the file today?', answer: [],
  voice: { pitch: 0.8, rate: 0.95, prefer: 'female' }, mood0: 50, patience: 220, likes: [],
  portrait: { kind: 'trenchcoat', hairStyle: 2, glasses: true, hat: 1, skin: '#e0ac69', hair: '#1a1a1a', shirt: '#2b2b33', earrings: true, headset: true },
  budget: 0,
  style: { tics: ['For the file.', 'Noted.', 'The Bureau sees.'], register: 'flat', describe: 'You are a senior inspector: calm, flat, patient, every sentence goes in the file.' },
  lines: {
    greet: ['Yes. Hello. The file is on my desk. It has your name on it.', 'Good evening. Shall we add to the file?'],
    who: ['Inspector Vane. Senior. The one with the file.', 'You know who. The Bureau. The file. Me.'],
    why: ['The file does not close itself. Open the attachment and we are done.', 'Routine. Everything is routine until the hearing.'],
    yesand: ['Mm. Noted. The attachment, please.', 'For the file. And now the attachment.'],
    early: ['I am not buying. I am filing. Open the attachment.', 'The Bureau does not purchase. The Bureau inspects. The file, please.'],
    no: ['No is also in the file.', 'A refusal. Page four. Next to the others.'],
    insult: ['That goes on page one. In capitals.', 'Rudeness to an inspector. A slip. You have made a slip.'],
    idle: ['Still there? The file is.', 'Silence is also evidence.'],
    bye_angry: ['We will speak tomorrow. The file comes with me.', 'Enough for today. The Bureau is patient.'],
    bye_polite: ['Noted. Tomorrow, then. The file keeps.', 'That will do for today. The case continues.'],
  },
};

export function slips(): Slip[] { return state.caseSlips; }
export function caseOver(): boolean { return state.caseSlips.length >= 3; }

export function addSlip(kind: SlipKind, text: string): void {
  if (state.caseSlips.some((s) => s.day === state.day && s.kind === kind)) return; // one of a kind per day
  state.caseSlips.push({ day: state.day, kind, text });
  bus.emit('case:slip', { count: state.caseSlips.length, kind, text });
}

const INSULT = /\b(idiot|stupid|dumb|shut up|moron|fool|loser|ugly|pathetic|worthless|hate you|f+u+c+k|screw you|piss off|suck|dumbass|trash)\b/i;

/** what Vane says when she rings, given the file so far */
export function vaneOpener(): string {
  const n = state.caseSlips.length;
  const last = state.caseSlips[n - 1];
  if (n === 0) return 'Inspector Vane, Bureau of Nonsense. Senior. I have opened a file on you. It is empty. Let us keep it that way, or not. The attachment, please.';
  if (n === 1) return `Inspector Vane. The file has one entry: ${last.text}. One. Two more and we go to the hearing. Now, the attachment.`;
  return `Inspector Vane. Two entries in the file: the last one, ${last.text}. One more slip and I see you in court. The attachment, please.`;
}

/** facts for the live brain when it plays Vane */
export function caseFacts(): string {
  const n = state.caseSlips.length;
  return `You are building a case. The file has ${n} slip${n === 1 ? '' : 's'} so far${n ? ': ' + state.caseSlips.map((s) => s.text).join('; ') : ''}. Three slips and the player goes to a hearing. Mention the count once, coldly. You remember every earlier call.`;
}

// Vane rings once a day from day 2, after the second call of the day, at a 45% chance per ended call
let vaneDay = 0;
export function nextVane(): { caller: Caller; opener: string; tag: string; mood?: number } | null {
  if (state.day < 2 || vaneDay === state.day || caseOver() || state.calls.length < 2) return null;
  if (Math.random() > 0.45) return null;
  vaneDay = state.day;
  return { caller: VANE, opener: vaneOpener(), tag: 'vane' };
}
export function resetVane(): void { vaneDay = 0; }

// ---- what counts as a slip ----
bus.on<{ caller: Caller; record: CallRecord }>('call:ended', ({ caller, record }) => {
  if (record.virus) addSlip('file', `said yes to ${caller.name.split(',')[0]}'s file`);
  else if (record.busted) addSlip('busted', `${caller.name.split(',')[0]} saw through you`);
});
bus.on<{ who: string; text: string }>('call:line', (l) => {
  if (l.who !== 'you' || !INSULT.test(l.text)) return;
  // only Vane's own calls: calls.ts tags the active call
  const tag = (window as unknown as { __hpActiveTag?: string }).__hpActiveTag;
  if (tag === 'vane') addSlip('insult', 'insulted Inspector Vane');
});

/** the courtroom slides, when the file is full */
export function caseSlides(you: string): { title: string; body: string; krull: string }[] {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return [
    { title: `Bureau of Nonsense v. ${you}`, body: `<div>Inspector Vane's file, read into the record:</div><div class="quotes">${state.caseSlips.map((s) => `<div class="quote">Day ${s.day}: ${esc(s.text)}</div>`).join('')}</div><div class="big">GUILTY OF NONSENSE</div>`, krull: 'THE BUREAU IS HERE. I HAVE NEVER MET THIS PERSON. I DO NOT KNOW THIS DESK.' },
  ];
}
