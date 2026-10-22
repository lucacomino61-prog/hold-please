// Workplace disasters: virus pop-ups, police raids, air strikes, power cuts, Mr. Krull on the
// floor, fires on the desktop, and a computer bomb to defuse.
import { t } from '../i18n';
import { bus, chance, FINALE_DAY, fmt, loseTeam, pick, settings, state } from './state';
import { poach } from './rival';
import { maybeGooseCall } from './goose';
import { unlock } from './hall';
import { anyVisible, closeAllWindows, openWindow } from '../os/windows';
import { toast } from '../ui/toast';
import { sfx } from './sound';
import { icon } from '../os/icons';
import { forceNext, hangUp } from './calls';
import { stripVowels } from './values';
import { setScene } from './scene';
import { krullSays } from './krull';
import { callerById } from './callers';
import { abduct, floorEffect } from '../world/office';
import { bootSplash, osElement } from '../os/desktop';
import { krullOffice } from './krull-office';
import { coop } from '../net/coop';
import { room } from '../net/room';
import type { Caller } from './brain/types';

const EVENT_KINDS: EventKind[] = ['virus', 'raid', 'airstrike', 'powercut', 'krull', 'fire', 'bomb', 'tsunami', 'ufo', 'mooncall', 'poop', 'fireworks', 'lightning', 'pandemic', 'nuke', 'hurricane', 'bombthreat', 'radioactive', 'poach'];
// the host's event, relayed by the room: the same thing happens at every desk
bus.on<string>('room:event', (kind) => { if (EVENT_KINDS.includes(kind as EventKind)) triggerEvent(kind as EventKind, true); });

const timers: ReturnType<typeof setTimeout>[] = [];
let popupTimer: ReturnType<typeof setInterval> | undefined;
let popupN = 0;

export type EventKind = 'virus' | 'raid' | 'airstrike' | 'powercut' | 'krull' | 'fire' | 'bomb' | 'tsunami' | 'ufo' | 'mooncall' | 'poop' | 'fireworks' | 'lightning' | 'pandemic' | 'nuke' | 'hurricane' | 'bombthreat' | 'radioactive' | 'poach';

export function scheduleEvents(): void {
  clearEvents();
  maybeGooseCall();
  if (state.day < 2) return;
  if (coop.live && !coop.isHost()) return;   // on a shared floor the host's events reach everyone
  const n = state.day >= FINALE_DAY ? 6 : Math.min(3, state.day - 1 + (chance(0.5) ? 1 : 0));
  const kinds: EventKind[] = ['virus', 'raid', 'airstrike', 'powercut', 'krull', 'raid', 'krull', 'fire', 'mooncall', 'poach'];
  // the finale: the Bureau raids the floor again and again
  if (state.day >= FINALE_DAY) kinds.push('raid', 'raid', 'raid', 'krull');
  if (state.day >= 3) kinds.push('fire', 'bomb', 'tsunami', 'ufo', 'poop', 'fireworks', 'lightning', 'pandemic');
  if (state.day >= 4) kinds.push('nuke', 'hurricane', 'bombthreat', 'radioactive');
  for (let i = 0; i < n; i++) {
    const at = 45_000 + Math.random() * Math.max(30_000, state.shiftTotal - 110_000);
    timers.push(setTimeout(() => triggerEvent(pick(kinds)), at));
  }
}

export function clearEvents(): void {
  timers.splice(0).forEach(clearTimeout);
  if (state.virus) cureVirus(true);
  document.querySelectorAll('.raid, .blackout, .krull-walk, .fire-ev, .wave-ev, .ev, .flash-ev, .nuke-ev, .geiger-ev').forEach((e) => e.remove());
  moonPending = false;
  document.body.classList.remove('windy', 'ducking');
  sfx.siren(false);
  setScene('');
}

export function triggerEvent(kind: EventKind, fromRoom = false): void {
  if (state.phase !== 'shift') return;
  if (!fromRoom && coop.live && coop.isHost()) room.send({ t: 'note', sub: 'event', text: kind });
  if (kind === 'virus') startVirus('random');
  else if (kind === 'raid') raid();
  else if (kind === 'airstrike') airstrike();
  else if (kind === 'powercut') powercut();
  else if (kind === 'fire') fire();
  else if (kind === 'bomb') bomb();
  else if (kind === 'tsunami') tsunami();
  else if (kind === 'ufo') ufo();
  else if (kind === 'mooncall') moonCall();
  else if (kind === 'poop') poop();
  else if (kind === 'fireworks') fireworks();
  else if (kind === 'lightning') lightning();
  else if (kind === 'pandemic') pandemic();
  else if (kind === 'nuke') nuke();
  else if (kind === 'hurricane') hurricane();
  else if (kind === 'bombthreat') bombThreat();
  else if (kind === 'radioactive') radioactive();
  else if (kind === 'poach') poach();
  else krullWalk();
}

// ---- a timed click-them-all overlay, the shape most of the original's disasters take: a card with a bar, N things to
// click before it runs out; the floor shows the 3-D version of the same mess (world/office.ts floorEffect) ----
function clickAll(o: { cls: string; title: string; text: string; ms: number; count: number; glyph: string; label: string; scene: Parameters<typeof setScene>[0]; fx: Parameters<typeof floorEffect>[0]; moving?: boolean; win: string; lose: (lost: number) => string; lossShare: number; kind: EventKind; hangup?: boolean; on?: () => void; off?: () => void }): void {
  const el = document.createElement('div');
  el.className = 'ev ' + o.cls;
  el.innerHTML = `<div class="ev__tide"></div><div class="fire-ev__card"><b>${t(o.title)}</b><span>${t(o.text)}</span><div class="raid__bar"><i></i></div></div>`;
  document.body.appendChild(el);
  sfx.alert();
  setScene(o.scene, o.ms + 4000);
  floorEffect(o.fx, o.ms + 2000);
  o.on?.();
  const bar = el.querySelector<HTMLElement>('.raid__bar i')!, tide = el.querySelector<HTMLElement>('.ev__tide')!;
  if (settings.motion !== 'off') { bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: o.ms, easing: 'linear', fill: 'forwards' }); tide.animate([{ height: '0%' }, { height: '45%' }], { duration: o.ms, easing: 'ease-in', fill: 'forwards' }); }
  else tide.style.height = '25%';
  let left = o.count, done = false;
  const finish = (ok: boolean) => {
    if (done) return; done = true;
    el.remove(); setScene(''); o.off?.();
    if (ok) toast(o.win, 'money', 4500);
    else { const lost = Math.round(state.earnedToday * o.lossShare); loseTeam(lost, o.kind); toast(o.lose(lost), 'danger', 5000); sfx.bad(); if (o.hangup) hangUp('caller'); }
    bus.emit('event:outcome', { kind: o.kind, ok });
  };
  for (let i = 0; i < o.count; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ev__btn'; b.textContent = o.glyph; b.setAttribute('aria-label', o.label);
    b.style.left = 40 + Math.random() * (window.innerWidth - 120) + 'px';
    b.style.top = 90 + Math.random() * (window.innerHeight - 260) + 'px';
    if (o.moving && settings.motion !== 'off') b.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(Math.random() - 0.5) * 300}px, ${(Math.random() - 0.5) * 200}px)` }], { duration: 1800 + Math.random() * 1200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    b.addEventListener('click', () => { b.remove(); sfx.click(); if (--left <= 0) finish(true); });
    el.appendChild(b);
  }
  el.querySelector<HTMLButtonElement>('.ev__btn')?.focus();
  timers.push(setTimeout(() => finish(left <= 0), o.ms));
}

// the plumbing gives up: plunge every toilet before the tide reaches the desks
function poop(): void {
  clickAll({ cls: 'ev--poop', kind: 'poop', title: 'THE PLUMBING', text: 'Every toilet on the floor let go at once. Click every plunger before it reaches the desks.', ms: 16_000, count: 6, glyph: '🪠', label: 'Plunge', scene: 'poop', fx: 'poop',
    win: 'Plunged. The carpet is condemned, the money is fine.', lose: (lost) => `It reached the desks. ${fmt(lost)} of today's money is unrecoverable, in every sense.`, lossShare: 0.12, hangup: true });
}
// someone lit the morale fireworks indoors: catch the rockets before they go off
function fireworks(): void {
  clickAll({ cls: 'ev--fireworks', kind: 'fireworks', title: 'FIREWORKS. INDOORS.', text: 'Someone opened the morale budget. Click every rocket before it goes off under a desk.', ms: 14_000, count: 5, glyph: '🎆', label: 'Catch the rocket', scene: 'fireworks', fx: 'fireworks', moving: true,
    win: 'Caught them all. The ceiling tiles will never know.', lose: (lost) => `Bang. Three monitors, one plant and ${fmt(lost)} of today's money, gone up in sparkles.`, lossShare: 0.12, hangup: true });
}
// a cough on the floor: put a mask on everyone before it spreads
function pandemic(): void {
  clickAll({ cls: 'ev--pandemic', kind: 'pandemic', title: 'A COUGH ON THE FLOOR', text: 'It started in the kitchen. Click every mask onto a colleague before the whole floor has it.', ms: 15_000, count: 6, glyph: '😷', label: 'Mask a colleague', scene: 'pandemic', fx: 'pandemic', moving: true,
    win: 'Everyone masked. Teodora says the kitchen is cursed.', lose: (lost) => `The whole floor is coughing. ${fmt(lost)} of today's calls were coughed through and refunded.`, lossShare: 0.1 });
}
// the nuclear drill: ten seconds, then the flash; hold "Get under the desk" when it hits zero
function nuke(): void {
  const el = document.createElement('div');
  el.className = 'nuke-ev';
  el.innerHTML = `<div class="nuke-ev__card"><b>${t('NUCLEAR DRILL')}</b><span>${t('This is not a drill. Hold the button and stay under the desk when the count hits zero.')}</span><div class="nuke-ev__count tabular">10</div><button type="button" class="nuke-ev__duck">${t('Hold to get under the desk')}</button></div>`;
  document.body.appendChild(el);
  sfx.siren(true);
  setScene('nuke', 16_000);
  let n = 10, ducking = false, done = false;
  const btn = el.querySelector<HTMLButtonElement>('.nuke-ev__duck')!, count = el.querySelector<HTMLElement>('.nuke-ev__count')!;
  const duck = (on: boolean) => { ducking = on; btn.classList.toggle('is-down', on); document.body.classList.toggle('ducking', on); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); duck(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => duck(false));
  btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); duck(true); } });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') duck(false); });
  btn.focus();
  const iv = setInterval(() => {
    n--; count.textContent = String(n); if (n <= 3) sfx.alert();
    if (n > 0) return;
    clearInterval(iv); if (done) return; done = true;
    sfx.siren(false); sfx.boom();
    const ok = ducking;
    const flash = document.createElement('div'); flash.className = 'flash-ev'; document.body.appendChild(flash); setTimeout(() => flash.remove(), 900);
    floorEffect('lightning', 3000);
    document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 700);
    el.remove(); duck(false); setScene('');
    if (ok) toast('The desk held. The desk always holds. Carry on.', 'money', 4500);
    else { const lost = Math.round(state.earnedToday * 0.25); loseTeam(lost, 'nuclear drill'); hangUp('caller'); toast(`You were not under the desk. ${fmt(lost)} of today's money is now glowing.`, 'danger', 5500); sfx.bad(); }
    bus.emit('event:outcome', { kind: 'nuke', ok });
  }, 1000);
  timers.push(iv as unknown as ReturnType<typeof setTimeout>);
}
// the hurricane: the windows blow about; bolt every frame before the bar runs out
function hurricane(): void {
  clickAll({ cls: 'ev--wind', kind: 'hurricane', title: 'HURRICANE', text: 'The windows are coming off. Click every loose frame to bolt it down before the desks go.', ms: 14_000, count: 6, glyph: '🪟', label: 'Bolt the window', scene: 'wind', fx: 'lightning', moving: true,
    on: () => document.body.classList.add('windy'), off: () => document.body.classList.remove('windy'),
    win: 'Bolted. The wind went to bother the next building.', lose: (lost) => `The windows went, and the papers with them. ${fmt(lost)} of today's money is somewhere over the harbour.`, lossShare: 0.12, hangup: true });
}
// a muffled voice says there is a bomb unless you keep talking: the call is the disaster
const BOMB_VOICE: Caller = {
  id: 'bombvoice', name: 'A Muffled Voice', archetype: 'spirit',
  gimmick: 'Someone with a towel over the phone who says there is a bomb in the building and will not say where.',
  world: ['bomb', 'building', 'towel', 'wire', 'ticking', 'demand', 'ransom', 'basement'],
  openers: ['Listen carefully. There is a bomb in your building. Keep me on the line and be nice to me and nothing happens. Be rude and... tick, tick.'],
  quirks: ['The towel is for the voice. The bomb is for the building.', 'I have demands. I have not decided them yet.', 'Do not trace this call. I am calling from the kitchen. Not your kitchen. A kitchen.'],
  question: 'What would you give me to make this stop?', answer: ['anything', 'everything', 'the moon', 'money', 'a hug', 'whatever you want'],
  voice: { pitch: 0.6, rate: 0.85, prefer: 'male' }, mood0: 28, patience: 150, likes: ['moon'],
  portrait: { kind: 'trenchcoat', hairStyle: 0, glasses: false, hat: 1, skin: '#d9b382', hair: '#1a1a1a', shirt: '#2b2b2b', headset: false },
  budget: 0,
  style: { tics: ['Tick.', 'Tock.'], register: 'whisper', describe: 'You whisper through a towel. You are not very good at this. You want to be talked out of it.' },
  lines: {
    greet: ['Yes. Hello. The bomb says hello too.', 'Good. You answered. The bomb was worried.'],
    who: ['A concerned citizen. With a towel. And a bomb.', 'Nobody. A voice. A muffled one.'],
    why: ['Because somebody sold my grandmother a cloud. This is about the cloud.', 'I had a bad week. The bomb had a worse one.'],
    yesand: ['...you are being nice. That is confusing. The bomb is confused.', 'Hm. Go on. The ticking is slowing.'],
    insult: ['THAT. That is what the bomb needed to hear.', 'Rude. The bomb has feelings and a timer.'],
    idle: ['Tick.', 'Still ticking. Say something.'],
    bye_angry: ['Enough. Goodbye. Listen for it.', 'You had one job: be nice. Tick.'],
    bye_polite: ['It... it was a kettle. I am sorry. It was a kettle. Goodbye.', 'Fine. There is no bomb. There was never a bomb. Thank you for listening.'],
  },
};
let bombPending = false;
function bombThreat(): void {
  if (bombPending) { raid(); return; }
  bombPending = true;
  forceNext({ caller: BOMB_VOICE, mood: 28, tag: 'bombthreat' });
  toast('A muffled voice is calling about a bomb. Keep them on the line and be kind.', 'danger', 5000);
  sfx.alert();
  const off = bus.on<{ caller: Caller; mood: number; by: string }>('call:ended', ({ caller, mood, by }) => {
    if (caller.id !== 'bombvoice') return;
    off(); bombPending = false;
    const ok = mood >= 30 && by !== 'you';
    if (ok) { toast('They calmed down. It was a kettle. It was always a kettle.', 'money', 5000); unlock('kettle'); }
    else { sfx.boom(); document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 700); const lost = Math.round(state.earnedToday * 0.15); loseTeam(lost, 'bomb threat'); setScene('boom', 10_000); floorEffect('lightning', 2500); toast(`It was not a kettle. The east wing lost a wall and ${fmt(lost)} of today's money.`, 'danger', 5500); sfx.bad(); }
    bus.emit('event:outcome', { kind: 'bombthreat', ok });
  });
}
// a radioactive leak under the desks: the Geiger meter climbs while you sit; stand up (Esc) and walk it off
function radioactive(): void {
  const el = document.createElement('div');
  el.className = 'geiger-ev';
  el.innerHTML = `<div class="geiger-ev__card"><b>${t('RADIOACTIVE LEAK')}</b><span>${t('Something is leaking under the desks. The meter climbs while you sit. Stand up (Esc) and stay off the floor until it drops.')}</span><div class="geiger-ev__meter"><i></i></div><div class="geiger-ev__read tabular">0%</div></div>`;
  document.body.appendChild(el);
  sfx.alert();
  setScene('geiger', 24_000);
  const bar = el.querySelector<HTMLElement>('.geiger-ev__meter i')!, read = el.querySelector<HTMLElement>('.geiger-ev__read')!;
  let level = 20, done = false, ticks = 0;
  const finish = (ok: boolean) => {
    if (done) return; done = true; clearInterval(iv); el.remove(); setScene('');
    if (ok) toast('The meter is quiet. The carpet is slightly warm. Back to the phones.', 'money', 4500);
    else { const lost = Math.round(state.earnedToday * 0.12); loseTeam(lost, 'radioactive leak'); hangUp('caller'); toast(`The meter maxed out at your desk. ${fmt(lost)} of today's money is now a different colour.`, 'danger', 5500); sfx.bad(); }
    bus.emit('event:outcome', { kind: 'radioactive', ok });
  };
  const iv = setInterval(() => {
    const seated = !!osElement() && !osElement()!.hidden;
    level = Math.max(0, Math.min(100, level + (seated ? 1.6 : -4)));   // ~10 s from the start to the top while seated
    bar.style.transform = `scaleX(${level / 100})`; read.textContent = Math.round(level) + '%'; bar.parentElement!.dataset.hot = level > 70 ? 'true' : 'false';
    if (seated && ticks % 4 === 0) sfx.type();
    if (level >= 100) finish(false);
    else if (++ticks >= 100) finish(level < 60);
  }, 200);
  timers.push(iv as unknown as ReturnType<typeof setTimeout>);
}
// lightning hits the building: a white crack, every PC reboots, the caller is gone
function lightning(): void {
  const el = document.createElement('div');
  el.className = 'flash-ev';
  document.body.appendChild(el);
  sfx.boom();
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 700);
  setScene('lightning', 12_000);
  floorEffect('lightning', 4000);
  hangUp('caller');
  const lost = Math.round(state.earnedToday * 0.08);
  loseTeam(lost, 'lightning');
  timers.push(setTimeout(() => { el.remove(); bootSplash(1600); toast(lost ? `Lightning hit the roof. Every PC rebooted; the surge ate ${fmt(lost)} of today's money.` : 'Lightning hit the roof. Every PC rebooted. The caller did not wait.', 'danger', 5500); bus.emit('event:outcome', { kind: 'lightning', ok: false }); }, 700));
}

// ---- tsunami: a wave comes through the east wing; stack the sandbags before the water reaches the desks ----
function tsunami(): void {
  const el = document.createElement('div');
  el.className = 'wave-ev';
  el.innerHTML = `<div class="wave-ev__water"></div><div class="wave-ev__card"><b>${t('TSUNAMI')}</b><span>${t('A wave is coming through the east wing. Click every sandbag to stack it.')}</span><div class="raid__bar"><i></i></div></div>`;
  document.body.appendChild(el);
  sfx.alert(); setTimeout(() => sfx.alert(), 300);
  const ms = 15_000;
  setScene('wave', ms + 4000);
  const bar = el.querySelector<HTMLElement>('.raid__bar i')!;
  const water = el.querySelector<HTMLElement>('.wave-ev__water')!;
  if (settings.motion !== 'off') { bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' }); water.animate([{ height: '0%' }, { height: '70%' }], { duration: ms, easing: 'ease-in', fill: 'forwards' }); }
  else water.style.height = '40%';
  let left = 5;
  let done = false;
  const finish = (ok: boolean) => {
    if (done) return; done = true;
    el.remove(); setScene('');
    if (ok) toast('Sandbags held. The carpet squelches, the money is dry.', 'money', 4500);
    else { const lost = Math.round(state.earnedToday * 0.15); loseTeam(lost, 'tsunami'); toast(`The wave took the east wing and ${fmt(lost)} with it.`, 'danger', 5000); sfx.bad(); hangUp('caller'); }
    bus.emit('event:outcome', { kind: 'tsunami', ok });
  };
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sandbag'; b.textContent = '🧱'; b.setAttribute('aria-label', 'Stack the sandbag');
    b.style.left = 40 + Math.random() * (window.innerWidth - 120) + 'px';
    b.style.top = 90 + Math.random() * (window.innerHeight - 260) + 'px';
    b.addEventListener('click', () => { b.remove(); sfx.click(); if (--left <= 0) finish(true); });
    el.appendChild(b);
  }
  el.querySelector<HTMLButtonElement>('.sandbag')?.focus();
  timers.push(setTimeout(() => finish(left <= 0), ms));
}

// ---- a UFO takes a colleague mid-call; their desk is empty until tomorrow ----
function ufo(): void {
  if (coop.live) { raid(); return; }   // in co-op the colleagues are real people: a raid instead
  const names = state.colleagues.map((c) => c.name).filter((n) => !state.abducted.includes(n));
  if (!names.length) { raid(); return; }
  const who = pick(names);
  state.abducted.push(who);
  abduct(who);
  sfx.alert();
  setScene('ufo', 12_000);
  toast(`A beam of light through the ceiling. ${who} is gone, chair and all. Their calls are yours now.`, 'danger', 6000);
  bus.emit('event:outcome', { kind: 'ufo', ok: true, who });
}

// ---- the Moon itself calls to complain about its acres ----
let moonPending = false;
function moonCall(): void {
  const moon = callerById('themoon');
  if (!moon || moonPending) { krullWalk(); return; }
  const sold = state.calls.flatMap((c) => c.payouts).filter((p) => p.scam === 'moon').reduce((s, p) => s + p.amount, 0);
  moonPending = true;
  forceNext({ caller: moon, mood: sold ? 18 : 38, tag: 'mooncall', opener: sold
    ? `This is the Moon. THE Moon. You sold ${fmt(sold)} of my acres tonight and I did not see a cent. Explain yourself, and be nice about it.`
    : 'This is the Moon. I hear you sell my acres. Nobody asked me. Explain, and be nice about it.' });
  toast('The Moon is calling. It sounds upset.', 'danger', 4000);
  const off = bus.on<{ caller: Caller; mood: number }>('call:ended', ({ caller, mood }) => {
    if (caller.id !== 'themoon') return;
    off(); moonPending = false;
    const ok = mood >= 30;
    if (!ok && sold) { const lost = Math.round(sold * 0.5); loseTeam(lost, 'the Moon'); toast(`The Moon took back ${fmt(lost)} of its acres. Tides will be strange tonight.`, 'danger', 5000); sfx.bad(); }
    else toast(ok ? 'The Moon is appeased. For now. It is watching you.' : 'The Moon hung up. It had nothing to take.', ok ? 'money' : 'info', 4000);
    bus.emit('event:outcome', { kind: 'mooncall', ok });
  });
}

// ---- virus ----
const POPUPS = [
  ['YOUR PC HAS 1 (ONE) VIRUS', 'It is this one. You are looking at it.'],
  ['CONGRATULATIONS', 'You are the 1,000,000th visitor. Claim your free fridge.'],
  ['WARRANTY EXPIRED', 'Your warranty on the Sun has lapsed. Renew for $0.'],
  ['DOWNLOAD MORE RAM', 'Your computer is thinking too slowly. Fix it with a click.'],
  ['HOT SINGLES', 'Hot singles in Port Fortune want to sell you gravity.'],
  ['CLICK HERE', 'Click here to not click here.'],
  ['BEAN COIN IS MOONING', 'Buy now. Or don\'t. We already have your beans.'],
  ['SYSTEM MESSAGE', 'A goose has accessed your files. The goose has no regrets.'],
];

export function startVirus(source: string): void {
  if (state.virus) return;
  state.virus = true;
  bus.emit('money');
  sfx.alert();
  toast(source === 'inspector' ? 'You said yes to the inspector\'s file. That was a virus.' : source === 'pigeon' ? 'The "free gift" was a virus. Of course it was.' : source === 'mail' ? 'You opened the attachment. The attachment opened you.' : 'A virus got in. Pop-ups incoming.', 'danger', 4500);
  popupN = 0;
  spawnPopup();
  popupTimer = setInterval(() => { if (state.virus) spawnPopup(); }, 1800);
  setScene('popups', 20_000);
}

function spawnPopup(): void {
  if (document.querySelectorAll('.popup-virus').length >= 14) return;
  const [title, text] = pick(POPUPS);
  const id = 'popup-' + (++popupN);
  const vw = window.innerWidth, vh = window.innerHeight;
  openWindow({ id, title, glyph: icon('warning'), color: '#ff3b3b', w: 300, h: 170, x: Math.random() * (vw - 320), y: Math.random() * (vh - 240), className: 'popup-virus', single: false }, (body, win) => {
    body.innerHTML = `<div class="popup"><b>${title}</b><p>${text}</p><button class="btn" type="button">Close</button></div>`;
    body.querySelector('button')!.addEventListener('click', () => { win.close(); if (state.virus) { spawnPopup(); spawnPopup(); } });
  });
}

export function cureVirus(silent = false): void {
  state.virus = false;
  clearInterval(popupTimer);
  document.querySelectorAll<HTMLElement>('.popup-virus').forEach((el) => el.remove());
  bus.emit('windows');
  bus.emit('money');
  if (!silent) toast('Virus removed. The pop-ups are gone.', 'money');
}

// ---- police raid: hide every window before the bar runs out ----
function raid(): void {
  if (state.inventory.includes('moat')) { state.inventory.splice(state.inventory.indexOf('moat'), 1); toast('Police at the door. The Desk Moat held. They left confused.', 'money', 4000); return; }
  sfx.siren(true);
  const el = document.createElement('div');
  el.className = 'raid';
  el.innerHTML = `<div class="raid__card"><b>${t('POLICE')}</b><span>${t('Hide everything. Minimise every window.')}</span><div class="raid__bar"><i></i></div></div>`;
  document.body.appendChild(el);
  const bar = el.querySelector<HTMLElement>('.raid__bar i')!;
  const ms = 12_000;
  setScene('siren', ms + 4000);
  if (settings.motion !== 'off') bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
  timers.push(setTimeout(() => {
    el.remove();
    sfx.siren(false);
    const ok = !anyVisible();
    if (!ok) {
      const lost = Math.round(state.earnedToday * 0.2);
      loseTeam(lost, 'police raid');
      toast(`They saw the windows. Evidence seized: ${fmt(lost)} off the team total.`, 'danger', 5000);
      sfx.bad();
    } else toast('Clean desks. They apologised for the intrusion.', 'money', 4000);
    bus.emit('event:outcome', { kind: 'raid', ok });
  }, ms));
}

// ---- air strike ----
export function airstrike(selfInflicted = false): void {
  toast(selfInflicted ? 'You ordered an air strike on yourselves. Incoming.' : 'INCOMING. Something is whistling.', 'danger', 3000);
  sfx.alert();
  timers.push(setTimeout(() => {
    sfx.boom();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 700);
    const lost = Math.round(state.earnedToday * 0.15);
    loseTeam(lost, 'air strike');
    toast(`Direct hit on the east wing. ${fmt(lost)} of today's money is on fire.`, 'danger', 5000);
    hangUp('caller');
    setScene('boom', 12_000);
    bus.emit('event:outcome', { kind: 'airstrike', ok: false });
  }, 3000));
}

// ---- power cut ----
function powercut(): void {
  const el = document.createElement('div');
  el.className = 'blackout';
  el.textContent = t('POWER CUT — BACKUP GENERATOR IN {s} S', { s: 8 });
  document.body.appendChild(el);
  hangUp('caller');
  setScene('dark', 14_000);
  let s = 8;
  const iv = setInterval(() => { s--; el.textContent = t('POWER CUT — BACKUP GENERATOR IN {s} S', { s }); if (s <= 0) { clearInterval(iv); el.remove(); toast('Power is back. The caller is not.', 'info'); } }, 1000);
  timers.push(iv as unknown as ReturnType<typeof setTimeout>);
}

// ---- Mr. Krull walks the floor: close the fun apps ----
function krullWalk(): void {
  if (state.inventory.includes('avoider')) { state.inventory.splice(state.inventory.indexOf('avoider'), 1); toast('Mr. Krull walked past. The Meeting Avoider made you invisible once.', 'money', 4000); return; }
  const el = document.createElement('div');
  el.className = 'krull-walk';
  el.textContent = t('MR. KRULL IS WALKING THE FLOOR — CLOSE THE FUN');
  document.body.appendChild(el);
  setScene('boss', 9000);
  krullSays(t(pick(['I am walking the floor. Close the fun. I can see the fun from here.', 'Walking. Looking. Counting. Close it.', 'If I see a potato on a screen, that screen is a strike.'])), { evenOnCall: true });
  timers.push(setTimeout(() => {
    el.remove();
    const caught = anyVisible(['casino', 'clicker', 'surf', 'paint']);
    if (caught) {
      state.strikes++;
      sfx.bad();
      toast(`Krull saw your screen. Strike ${state.strikes} of 3.`, 'danger', 5000);
      krullSays(state.strikes >= 3 ? t('Three. My office. Now.') : t('Strike {n}. I count. I always count.', { n: state.strikes }), { evenOnCall: true });
      if (state.strikes >= 3) { toast('THREE STRIKES. Krull is calling you in.', 'danger', 4000); setTimeout(() => { void krullOffice(); }, 1200); }
    } else toast('Krull walked past. He saw nothing. He always sees nothing.', 'info', 3500);
    bus.emit('event:outcome', { kind: 'krull', ok: !caught });
  }, 6000));
}

// ---- fire: put out every flame on the screen before the bar runs out ----
function fire(): void {
  const el = document.createElement('div');
  el.className = 'fire-ev';
  el.innerHTML = `<div class="fire-ev__card"><b>${t('FIRE')}</b><span>${t('Click every flame. The extinguisher is the mouse.')}</span><div class="raid__bar"><i></i></div></div>`;
  document.body.appendChild(el);
  sfx.alert();
  const ms = 18_000;
  setScene('fire', ms);
  const bar = el.querySelector<HTMLElement>('.raid__bar i')!;
  if (settings.motion !== 'off') bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
  let alive = 0;
  const spawn = () => {
    const f = document.createElement('button');
    f.type = 'button'; f.className = 'flame'; f.textContent = '🔥'; f.setAttribute('aria-label', 'Put out the flame');
    f.style.left = 40 + Math.random() * (window.innerWidth - 120) + 'px';
    f.style.top = 80 + Math.random() * (window.innerHeight - 220) + 'px';
    f.addEventListener('click', () => { f.remove(); alive--; sfx.click(); if (alive <= 0 && done) finish(true); });
    el.appendChild(f); alive++;
  };
  let done = false;
  for (let i = 0; i < 6; i++) spawn();
  el.querySelector<HTMLButtonElement>('.flame')?.focus();
  const spawner = setInterval(() => { if (alive < 9) spawn(); }, 2200);
  const finish = (ok: boolean) => {
    clearInterval(spawner); el.remove();
    if (ok) toast('Fire out. The carpet is a different colour now.', 'money', 4000);
    else { const lost = Math.round(state.earnedToday * 0.1); loseTeam(lost, 'fire'); toast(`The east wing burned for a while. ${fmt(lost)} gone.`, 'danger', 5000); sfx.bad(); }
    setScene('');
    bus.emit('event:outcome', { kind: 'fire', ok });
  };
  timers.push(setTimeout(() => { done = true; clearInterval(spawner); if (alive <= 0) finish(true); else finish(false); }, ms));
  timers.push(spawner as unknown as ReturnType<typeof setTimeout>);
}

// ---- computer bomb: type the code before the countdown ends. The code is the last caller's
// name without its vowels, which the ClipLog knows. ----
function bomb(): void {
  const last = state.calls[state.calls.length - 1];
  const code = (last ? stripVowels(last.name.split(',')[0]).replace(/[^A-Za-z]/g, '') : 'KRLL').toUpperCase().slice(0, 8) || 'KRLL';
  let s = 40;
  openWindow({ id: 'bomb', title: 'A COMPUTER BOMB', glyph: icon('skull'), color: '#d94b4b', w: 380, h: 300 }, (body, win) => {
    body.innerHTML = `<div class="bomb"><div class="bomb__count">${s}</div><p>Someone planted a bomb in the shared drive. Defuse it: type ${last ? `the name of your last caller <b>without its vowels</b>` : '<b>KRLL</b>'} (capitals, no spaces).</p><form><input type="text" autocomplete="off" spellcheck="false" placeholder="CODE" /></form><div class="sapp__status"></div></div>`;
    const count = body.querySelector<HTMLElement>('.bomb__count')!, status = body.querySelector<HTMLElement>('.sapp__status')!, form = body.querySelector<HTMLFormElement>('form')!;
    const iv = setInterval(() => { s--; count.textContent = String(s); if (s % 10 === 0) sfx.alert(); if (s <= 0) { clearInterval(iv); win.close(); sfx.boom(); document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 700); const lost = Math.round(state.earnedToday * 0.25); loseTeam(lost, 'computer bomb'); toast(`BOOM. The shared drive is gone and so is ${fmt(lost)}.`, 'danger', 6000); setScene('boom', 12_000); bus.emit('event:outcome', { kind: 'bomb', ok: false }); } }, 1000);
    timers.push(iv as unknown as ReturnType<typeof setTimeout>);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const typed = form.querySelector('input')!.value.toUpperCase().replace(/[^A-Z]/g, '');
      if (typed === code) { clearInterval(iv); win.close(); sfx.cash(); toast('Defused. The shared drive lives. Nobody will thank you.', 'money', 5000); bus.emit('event:outcome', { kind: 'bomb', ok: true }); }
      else { status.className = 'sapp__status sapp__status--bad'; status.textContent = 'Wrong code. Check the ClipLog for the last caller.'; sfx.bad(); s = Math.max(1, s - 5); }
    });
    const prev = win.opts.onClose; win.opts.onClose = () => { prev?.(); clearInterval(iv); };
    body.querySelector('input')!.focus();
  });
}
