// Penguin Courier: the two-call product, like the original's late-game Money Mule. A caller agrees to a crate of
// penguins and picks a password for it (call one). Later in the same shift Port Fortune Customs rings about the
// crate (call two): the password typed into the Courier app clears it for $900, a wrong one gets it seized.
import type { Caller } from './brain/types';
import { bus, state } from './state';
import { currentCall, forceNext, hangUp, payOut } from './calls';
import { toast } from '../ui/toast';

export interface Crate { id: number; owner: string; word: string; bookedAt: number; status: 'shipped' | 'at-customs' | 'cleared' | 'seized' }
const crates: Crate[] = [];
let nextId = 1;
export function cratesToday(): Crate[] { return crates.slice(); }
bus.on('day:new', () => { crates.length = 0; });
export const CRATE_PAYOUT = 900;

function customsCaller(c: Crate): Caller {
  return {
    id: 'customs-brine', name: 'Officer Brine, Port Fortune Customs', archetype: 'legend',
    gimmick: `A customs officer who loves forms and hates surprises. Crate #${c.id}, addressed to ${c.owner}, is on the dock, stamped Sunrise Customer Care, and it is honking. You want the password on the crate before you stamp anything.`,
    world: ['customs', 'crate', 'dock', 'form', 'stamp', 'penguin', 'penguins', 'honking', 'harbour', 'password'],
    openers: [`Port Fortune Customs, Officer Brine. I have crate number ${c.id} here for ${c.owner}. It says Sunrise Customer Care on the side, and it is honking. What is the password on this crate?`],
    quirks: ['I have a stamp. I am not afraid to use it.', 'Forms first. Feelings later.', 'The crate is still honking. That is not on the form.'],
    question: 'What is in the crate?', answer: ['penguin', 'penguins', 'birds', 'bird'],
    voice: { pitch: 0.85, rate: 0.95, prefer: 'male' }, mood0: 55, patience: 150, likes: [],
    portrait: { kind: 'human', hairStyle: 1, glasses: true, hat: 3, skin: '#d9a066', hair: '#3a2a1a', shirt: '#1f3b5a', headset: false },
    budget: 0,
    style: { tics: ['Hm.', 'Stamp.'], register: 'flat', describe: 'You are a tired, exact customs officer on a dock at night. You ask for the crate\'s password and you wait for it.' },
    lines: {
      greet: ['Customs. State your business with the crate.'],
      who: ['Officer Brine. Customs. The crate is my business now.'],
      why: ['Because a crate is honking on my dock and it has your company on it.'],
      early: ['The password. On the crate. Today, please.'],
    },
  };
}

/** call one: the crate ships, and Customs will ring about it this shift (in 50–90 s, or after the call you are on) */
export function bookCrate(owner: string, word: string): Crate {
  const crate: Crate = { id: nextId++, owner, word, bookedAt: Date.now(), status: 'shipped' };
  crates.push(crate);
  setTimeout(() => {
    if (state.phase !== 'shift' || crate.status !== 'shipped') return;
    crate.status = 'at-customs';
    forceNext({ caller: customsCaller(crate), mood: 55, tag: `customs:${crate.id}` });
  }, 50_000 + Math.random() * 40_000);
  bus.emit('crate:booked', crate);
  return crate;
}

/** the crate whose Customs call is live right now, if any */
export function customsCrate(): Crate | null {
  const c = currentCall();
  if (!c || c.status !== 'live' || !c.tag?.startsWith('customs:')) return null;
  const id = Number(c.tag.slice('customs:'.length));
  return crates.find((x) => x.id === id && x.status === 'at-customs') ?? null;
}

const norm = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** call two: the password typed for Customs; right pays, wrong gets the crate seized; Officer Brine then hangs up */
export function clearCustoms(typed: string): { ok: boolean; text: string } {
  const crate = customsCrate();
  if (!crate) return { ok: false, text: 'Customs is not on the line.' };
  const ok = norm(typed) !== '' && norm(typed) === norm(crate.word);
  crate.status = ok ? 'cleared' : 'seized';
  if (ok) payOut('courier', CRATE_PAYOUT);
  toast(ok ? `Customs stamped crate #${crate.id}. The penguins are on their way to ${crate.owner}. +$${CRATE_PAYOUT}.` : `Wrong password. Customs seized crate #${crate.id}. The penguins are fine. The money is not.`, ok ? 'money' : 'danger', 5500);
  bus.emit('crate:customs', { crate, ok });
  setTimeout(() => { if (currentCall()?.tag === `customs:${crate.id}`) hangUp('caller'); }, 2500);
  return { ok, text: ok ? `Cleared. $${CRATE_PAYOUT} to the team.` : 'Seized. That was not the password on the crate.' };
}
