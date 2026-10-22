// First-call coach marks: one small card that follows the first call step by step. Skippable, once.
import { bus } from '../game/state';
import type { Caller } from '../game/brain/types';
import type { ActiveCall } from '../game/calls';
import { SCAMS } from '../game/scams';
import { markFreeDesk } from '../world/office';

let card: HTMLElement | null = null;
let offs: (() => void)[] = [];
let step = 0;
let caller: Caller | null = null;
let yourLines = 0;

function done(): boolean { try { return localStorage.getItem('hp.tutorial-done') === '1'; } catch { return false; } }
function markDone(): void { try { localStorage.setItem('hp.tutorial-done', '1'); } catch { /* ignore */ } }

function show(n: number, html: string, last = false): void {
  step = n;
  if (!card) {
    card = document.createElement('aside');
    card.className = 'tutor';
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-label', 'First call guide');
    document.body.appendChild(card);
  }
  card.innerHTML = `<div class="tutor__step">Step ${Math.min(7, n)} of 7</div><div class="tutor__text">${html}</div><div class="tutor__actions"><button type="button" class="btn btn--ghost" data-skip>${last ? 'Close' : 'Skip the guide'}</button></div>`;
  card.querySelector('[data-skip]')!.addEventListener('click', stopTutorial);
  card.classList.remove('tutor--pop'); void card.offsetWidth; card.classList.add('tutor--pop');
}

export function stopTutorial(): void {
  markDone();
  markFreeDesk(false);
  offs.forEach((f) => f()); offs = [];
  card?.remove(); card = null;
}

/** the first minute on the floor, before the first call: find the desk with the ring, sit, meet the desktop.
 *  day.ts calls it when a brand-new player starts standing in the office; the call guide takes over at the ring */
export function startFloorTutorial(): void {
  if (done() || card) return;
  markFreeDesk(true);
  show(0, 'Welcome to <b>Sunrise Customer Care</b>. This is the floor. Walk with <b>W A S D</b> (mouse to look) to the desk with the <b>glowing ring</b> and press <b>E</b> to clock in. Click a colleague on the way, if you like.');
  card!.querySelector('.tutor__step')!.textContent = 'Before the shift';
  offs.push(bus.on('floor:sat', () => {
    markFreeDesk(false);
    show(0, 'This is <b>Harbour OS</b>, your desktop. The <b>Phone</b> rings on its own. The <b>Script</b> lists every product and the one question that closes it. <b>Swindlr Market</b> sells more. Hit the quota before the review.');
    card!.querySelector('.tutor__step')!.textContent = 'Your desk';
  }));
}

export function startTutorial(): void {
  if (done()) return;
  // the floor part may still be up: the call guide replaces it
  card?.remove(); card = null; offs.forEach((f) => f()); offs = [];
  markFreeDesk(false);
  yourLines = 0;
  const moon = SCAMS[0];
  show(1, 'Calls come in on their own. When the phone rings, press the <b>green button</b>. Decline the ones you don\'t like.');
  offs.push(bus.on<Caller>('call:ring', (c) => { caller = c; if (step <= 1) show(2, `Here comes <b>${c.name}</b>. Press the green button to answer.`); }));
  offs.push(bus.on<ActiveCall>('call:answered', (a) => { caller = a.caller; const first = a.caller.name.split(/[ ,]/)[0]; show(3, `Say hello and use their name — type <b>“Hello ${first}!”</b> in the box and press Enter. Their <b>mood</b> is the bar at the top.`); }));
  offs.push(bus.on<{ who: string }>('call:line', (l) => {
    if (l.who !== 'you' || !caller) return;
    yourLines++;
    if (step === 3 && yourLines >= 1) show(4, `Play along with their world. ${caller.name.split(/[ ,]/)[0]} cares about <b>${caller.world.slice(0, 3).join(', ')}</b> — use those words, be kind, and answer the question they keep asking. Watch the mood bar climb.`);
    else if (step === 4 && yourLines >= 3) show(5, `Warm enough. Now pitch something you own: <b>“Would you like to buy an acre of the Moon?”</b>`);
  }));
  offs.push(bus.on<{ mood: number; intent?: string }>('call:mood', ({ mood, intent }) => {
    if (step === 4 && mood >= 55) show(5, `They like you. Now pitch something you own: <b>“Would you like to buy an acre of the Moon?”</b>`);
    if (step === 5 && intent && intent.startsWith('pitch:')) show(6, `Now ask for the one thing that closes it: <b>“Which crater would you like?”</b> If they stall, warm them up a bit more and ask again.`);
    if (step === 6 && intent && intent.startsWith('ask:') && mood < 50) show(6, `Too early — they said so. Say something nice, use a world word, then ask again: <b>“Which crater would you like?”</b>`);
  }));
  offs.push(bus.on<{ kind: string; value: string }>('call:gives', ({ kind, value }) => { const app = SCAMS.find((s) => s.needs === kind) ?? moon; show(7, `They said <b>${value}</b>. Open <b>${app.name}</b> on the desktop and type it exactly. Then press Submit.`); }));
  offs.push(bus.on('call:paid', () => { show(7, 'Money in the team total. That is the whole job: be liked, pitch, ask, type. Keep going until the review — and never say yes to an inspector\'s file.', true); setTimeout(() => { if (step === 7) stopTutorial(); }, 9000); }));
  offs.push(bus.on<{ by: string }>('call:ended', ({ by }) => { if (step >= 3 && step < 7) show(Math.max(2, step), `${by === 'caller' ? 'They hung up.' : 'Call over.'} No harm done — the next one rings in a few seconds. Start again from hello.`); }));
}
