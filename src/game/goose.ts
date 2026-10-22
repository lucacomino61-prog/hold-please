// The goose. Mentioned forty times, never seen, until now: it walks the floor some nights (honk), it calls once
// a run and only honks, and the Konami code on the desktop turns every caller into a goose for the shift.
import { bus, state } from './state';
import type { Caller } from './brain/types';
import { forceNext } from './calls';
import { unlock } from './hall';
import { toast } from '../ui/toast';
import { sfx } from './sound';

export const THE_GOOSE: Caller = {
  id: 'thegoose', name: 'The Goose', archetype: 'creature',
  gimmick: 'A goose. It has a phone. Nobody gave it a phone.',
  world: ['honk', 'bread', 'pond', 'park', 'stapler', 'hiss', 'wings', 'feathers'],
  openers: ['HONK.'], quirks: ['Honk.', 'HONK HONK.', 'hnnk.'],
  question: 'HONK?', answer: ['honk', 'HONK', 'hnk'],
  voice: { pitch: 1.5, rate: 1.2 }, mood0: 55, patience: 180, likes: ['moon', 'clouds'],
  portrait: { kind: 'goose', skin: '#f4f1ea' }, budget: 400,
  style: { tics: ['Honk.'], register: 'shout', describe: 'You are a goose. You only say honk, in different sizes. You still understand everything.' },
  lines: { greet: ['HONK.', 'honk?'], who: ['HONK. (a goose)'], why: ['HONK HONK.'], yesand: ['honk! honk honk.'], early: ['hnnk. (no)'], no: ['HONK.'], insult: ['HISSSSSS.'], idle: ['...honk?'], bye_angry: ['HONK. *flap flap*'], bye_polite: ['honk. honk. (bye)'] },
};

let rangThisRun = false;
export function resetGoose(): void { rangThisRun = false; state.gooseMode = false; }
/** once a run from day two: the goose rings (events.ts asks at the start of a shift) */
export function maybeGooseCall(): void {
  if (rangThisRun || state.day < 2 || Math.random() > 0.15) return;
  rangThisRun = true;
  setTimeout(() => { forceNext({ caller: THE_GOOSE, mood: 55, tag: 'goose' }); toast('Line 3 is... honking.', 'info', 3000); }, 30_000 + Math.random() * 60_000);
}
bus.on<{ scam: string }>('call:paid', () => { if ((window as unknown as { __hpActiveTag?: string }).__hpActiveTag === 'goose') { unlock('goosesale'); toast('You sold a goose something. It paid in honks and, somehow, money.', 'money', 4500); } });

// the Konami code on the desktop: every caller is a goose for the rest of the shift
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
let at = 0;
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  at = k === KONAMI[at] ? at + 1 : k === KONAMI[0] ? 1 : 0;
  if (at < KONAMI.length) return;
  at = 0;
  if (state.phase !== 'shift') return;
  state.gooseMode = !state.gooseMode;
  sfx.alert();
  toast(state.gooseMode ? 'HONK. Every caller is a goose now. You did this.' : 'The geese have gone. For now.', 'info', 4500);
  bus.emit('goose', state.gooseMode);
});
