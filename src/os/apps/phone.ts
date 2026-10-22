// The Phone: the caller card, the mood meter, the transcript, typing and the mic.
import { t } from '../../i18n';
import { bus, saveSettings, settings, state, type Line } from '../../game/state';
import { answerCall, currentCall, declineCall, hangUp, heldCall, holdCall, sendLine, swapCall, transferCall, type ActiveCall } from '../../game/calls';
import { coop } from '../../net/coop';
import type { Caller } from '../../game/brain/types';
import { canListen, isListening, listenOnce, stopListening } from '../../game/speech';
import { icon } from '../icons';
import { mutatorHideTrust } from '../../game/mutators';
import { portraitHTML } from '../portrait';
import type { Caller as CallerT } from '../../game/brain/types';
// goose mode (goose.ts): every portrait is a goose, photo or not
const face = (c: CallerT, mood: 'calm' | 'angry' | 'happy', size: number): string => portraitHTML(c.id, state.gooseMode ? { ...c.portrait, kind: 'goose', photo: undefined } : c.portrait, c.name, mood, size);
import { registerApp } from '../registry';
import { openWindow, type Win } from '../windows';
import { sfx } from '../../game/sound';

// the trust words the real game's meter uses
const MOODS: [number, string][] = [[20, 'ANGRY'], [40, 'WARY'], [60, 'NEUTRAL'], [80, 'WARMING'], [101, 'TRUSTING']];
function moodState(m: number): string { return t(MOODS.find(([max]) => m < max)![1]); }

let win: Win | null = null;
let ui: {
  state: HTMLElement; pct: HTMLElement; bar: HTMLElement; sus: HTMLElement; portrait: HTMLElement; name: HTMLElement; gimmick: HTMLElement;
  log: HTMLElement; status: HTMLElement; input: HTMLInputElement; mic: HTMLButtonElement; send: HTMLButtonElement; hang: HTMLButtonElement;
  ring: HTMLElement; ringName: HTMLElement; ringPortrait: HTMLElement; wave: HTMLElement; form: HTMLFormElement; listenBox: HTMLElement;
} | null = null;
let currentMood: 'calm' | 'angry' | 'happy' = 'calm';
let caller: Caller | null = null;
let handsFree = false;
let callerTalkingUntil = 0;
let looping = false;

async function listenLoop(): Promise<void> {
  if (looping) return;
  looping = true;
  try {
    while (handsFree && ui && !ui.listenBox.hidden !== undefined) {
      const c = currentCall();
      if (!c || c.status !== 'live') { await new Promise((r) => setTimeout(r, 400)); if (!handsFree) break; continue; }
      // wait while the caller is speaking or thinking, then listen once
      if (Date.now() < callerTalkingUntil || c.busy) { await new Promise((r) => setTimeout(r, 250)); continue; }
      ui.listenBox.hidden = false; ui.listenBox.textContent = 'Listening…';
      let text = '';
      try { text = await listenOnce((i) => { if (ui) ui.listenBox.textContent = i || 'Listening…'; }); }
      catch { await new Promise((r) => setTimeout(r, 1200)); }
      if (ui) { ui.listenBox.hidden = true; ui.listenBox.textContent = 'Listening…'; }
      if (text && handsFree) await sendLine(text);
    }
  } finally { looping = false; if (ui) ui.listenBox.hidden = true; }
}

export function openPhone(): Win {
  if (win && !win.closed) { win.restore(); win.focus(); return win; }
  win = openWindow({ id: 'phone', title: 'Phone', glyph: icon('phone'), color: '#3fa34d', w: 380, h: 720, x: Math.max(8, window.innerWidth - 400), y: 24, onClose: () => { win = null; ui = null; } }, (body) => {
    // the real Phone, top to bottom: CALLER TRUST + the word + the bar + the percent; the caller's name over
    // the portrait on its grid; the status line (MESSAGE SENT – WAITING); the waveform; the bubbles; the box;
    // then the wide red Hang Up with the green speaker and mic beside it. Hold, Transfer, Hands-free sit under.
    body.innerHTML = `
      <div class="phone">
        <div class="phone__meter">
          <span class="phone__meter-label">${t('Caller trust')}</span>
          <span class="phone__state">—</span>
          <div class="phone__bar"><i></i></div>
          <span class="phone__pct tabular">–</span>
          <span class="phone__sus" hidden><span>${t('Suspicion')}</span> <b class="tabular">0%</b></span>
          <span class="phone__hold" hidden></span>
        </div>
        <div class="phone__held" hidden><span class="phone__held-label">${t('On hold')}</span><b class="phone__held-name"></b><div class="phone__held-bar"><i></i></div><button type="button" class="btn phone__swap">Swap ↔</button></div>
        <div class="phone__caller">
          <b class="phone__name">${t('Nobody on the line')}</b>
          <div class="phone__portrait" aria-hidden="true"></div>
          <span class="phone__gimmick">${t('Calls come in while the shift runs.')}</span>
        </div>
        <div class="phone__status" aria-live="polite"></div>
        <div class="phone__wave" aria-hidden="true">${'<i></i>'.repeat(28)}</div>
        <div class="phone__log" role="log" aria-live="polite" aria-label="Transcript"></div>
        <div class="phone__listen" hidden>Listening…</div>
        <form class="phone__form">
          <label class="visually-hidden" for="phone-input">Say something to the caller</label>
          <input id="phone-input" type="text" autocomplete="off" spellcheck="false" placeholder="${t('Type your reply…')}" maxlength="300" />
          <button type="submit" class="phone__send" aria-label="Send">${icon('send')}</button>
        </form>
        <div class="phone__actions">
          <button type="button" class="phone__hang">${t('Hang Up')}</button>
          <button type="button" class="phone__speaker" aria-label="Caller's voice on or off" aria-pressed="${settings.voiceOut ? 'true' : 'false'}" title="Speaker: hear the caller">${icon('speaker')}</button>
          <button type="button" class="phone__mic" aria-label="Hold to talk" aria-pressed="false" title="Hold to talk">${icon('mic')}</button>
        </div>
        <div class="phone__more">
          <button type="button" class="phone__free" aria-pressed="false" title="Keep the microphone open: whatever you say is sent when you pause">${icon('mic')} ${t('Hands-free')}</button>
          <button type="button" class="btn phone__holdbtn" title="Park this caller on hold music and take the next call">${t('Hold')}</button>
          <button type="button" class="btn phone__xfer" title="Hand this caller to a colleague for a cut">${t('Transfer')}</button>
        </div>
        <div class="phone__transfer" hidden><span>${t('Hand them to')}</span>${(state.colleagues.length ? state.colleagues.map((c) => c.name) : ['Teodora', 'Jun', 'Baxter']).map((n) => `<button type="button" class="btn" data-to="${n}">${n}</button>`).join('')}</div>
        <div class="phone__ring" hidden>
          <div class="phone__ring-portrait" aria-hidden="true"></div>
          <b class="phone__ring-name"></b>
          <span class="phone__ring-sub">${t('Incoming call…')}</span>
          <div class="phone__ring-actions">
            <button type="button" class="btn btn--danger phone__decline" aria-label="Decline">${icon('close')}</button>
            <button type="button" class="btn btn--money phone__answer" aria-label="Answer">${icon('phone')}</button>
          </div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(s: string) => body.querySelector<T>(s)!;
    ui = {
      state: q('.phone__state'), pct: q('.phone__pct'), bar: q('.phone__bar i'), sus: q('.phone__sus'), portrait: q('.phone__portrait'), name: q('.phone__name'), gimmick: q('.phone__gimmick'),
      log: q('.phone__log'), status: q('.phone__status'), input: q<HTMLInputElement>('#phone-input'), mic: q<HTMLButtonElement>('.phone__mic'), send: q<HTMLButtonElement>('.phone__send'),
      hang: q<HTMLButtonElement>('.phone__hang'), ring: q('.phone__ring'), ringName: q('.phone__ring-name'), ringPortrait: q('.phone__ring-portrait'), wave: q('.phone__wave'), form: q<HTMLFormElement>('.phone__form'), listenBox: q('.phone__listen'),
    };
    ui.form.addEventListener('submit', (e) => { e.preventDefault(); const t = ui!.input.value; ui!.input.value = ''; void sendLine(t); });
    ui.hang.addEventListener('click', () => hangUp('you'));
    // the green speaker: the caller's voice on or off
    const speaker = q<HTMLButtonElement>('.phone__speaker');
    speaker.addEventListener('click', () => { settings.voiceOut = !settings.voiceOut; saveSettings(); speaker.setAttribute('aria-pressed', String(settings.voiceOut)); sfx.click(); bus.emit('settings'); });
    // two lines: hold, swap, and a transfer to one of the three colleagues (solo only: in co-op they are real)
    q('.phone__holdbtn').addEventListener('click', () => { if (!holdCall()) { if (heldCall()) swapCall(); } });
    q('.phone__swap').addEventListener('click', () => swapCall());
    const xferMenu = q('.phone__transfer');
    const xfer = q<HTMLButtonElement>('.phone__xfer');
    if (coop.live) { xfer.hidden = true; }
    xfer.addEventListener('click', () => { xferMenu.hidden = !xferMenu.hidden || !currentCall() || currentCall()!.status !== 'live'; });
    xferMenu.querySelectorAll<HTMLButtonElement>('[data-to]').forEach((b) => b.addEventListener('click', () => { xferMenu.hidden = true; transferCall(b.dataset.to!); }));
    q('.phone__answer').addEventListener('click', () => answerCall());
    q('.phone__decline').addEventListener('click', () => declineCall());
    ui.input.addEventListener('input', () => sfx.type());

    // press-to-talk
    const mic = ui.mic;
    if (!canListen()) { mic.disabled = true; mic.title = 'Voice input needs Chrome or Edge'; }
    const start = async () => {
      if (!canListen() || isListening()) return;
      if (!settings.voiceIn) { settings.voiceIn = true; }
      mic.setAttribute('aria-pressed', 'true');
      ui!.listenBox.hidden = false;
      try {
        const text = await listenOnce((interim) => { ui!.listenBox.textContent = interim || 'Listening…'; });
        if (text) { ui!.input.value = ''; await sendLine(text); }
      } catch { ui!.status.textContent = 'The microphone did not work. Typing still does.'; }
      ui!.listenBox.hidden = true;
      ui!.listenBox.textContent = 'Listening…';
      mic.setAttribute('aria-pressed', 'false');
    };
    mic.addEventListener('pointerdown', (e) => { e.preventDefault(); void start(); });
    mic.addEventListener('pointerup', () => stopListening());
    mic.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void start(); } });
    mic.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stopListening(); });

    // hands-free: the mic stays open while a call is live; each pause sends what was heard
    const free = q<HTMLButtonElement>('.phone__free');
    if (!canListen()) { free.disabled = true; free.title = 'Voice input needs Chrome or Edge'; }
    free.addEventListener('click', () => { handsFree = !handsFree; free.setAttribute('aria-pressed', String(handsFree)); if (handsFree) { settings.voiceIn = true; void listenLoop(); } else stopListening(); });

    syncFromCall();
  });
  return win;
}

function setMood(m: number): void {
  if (!ui) return;
  // Fog night: the bar shows nothing; the words in the transcript are all you get
  if (mutatorHideTrust()) { ui.state.textContent = '???'; ui.pct.textContent = '??%'; ui.bar.style.transform = 'scaleX(0.5)'; ui.state.dataset.mood = 'mid'; ui.bar.parentElement!.dataset.mood = 'mid'; return; }
  ui.state.textContent = moodState(m);
  ui.pct.textContent = Math.round(m) + '%';
  ui.bar.style.transform = `scaleX(${Math.max(0.02, m / 100)})`;
  ui.state.dataset.mood = m < 40 ? 'bad' : m >= 60 ? 'good' : 'mid';
  ui.bar.parentElement!.dataset.mood = ui.state.dataset.mood;
  const mood = m < 30 ? 'angry' : m >= 70 ? 'happy' : 'calm';
  if (mood !== currentMood && caller) { currentMood = mood; ui.portrait.innerHTML = face(caller, mood, 120); }
}

function addLine(l: Line): void {
  if (!ui) return;
  const el = document.createElement('div');
  el.className = 'line line--' + l.who;
  const who = l.who === 'you' ? (settings.playerName || 'You') : caller?.name.split(',')[0] ?? 'Caller';
  el.innerHTML = `<span class="line__who"></span><span class="line__text"></span>`;
  el.querySelector('.line__who')!.textContent = who;
  el.querySelector('.line__text')!.textContent = l.text;
  ui.log.appendChild(el);
  ui.log.scrollTop = ui.log.scrollHeight;
}

function syncFromCall(): void {
  const c = currentCall();
  if (!ui) return;
  if (!c) { showIdle(); return; }
  caller = c.caller;
  if (c.status === 'ringing') showRing(c.caller);
  else {
    ui.ring.hidden = true;
    ui.name.textContent = (c.caller.vip ? '⭐ ' : '') + c.caller.name;
    ui.gimmick.textContent = (c.caller.vip ? 'VIP — rich, famous, hard to please. ' : '') + c.caller.gimmick;
    currentMood = 'calm';
    ui.portrait.innerHTML = face(c.caller, 'calm', 120);
    setMood(c.ctx.mood);
    setSuspicion(c.ctx.suspicion ?? 0);
    ui.log.innerHTML = '';
    c.ctx.lines.forEach(addLine);
    ui.status.textContent = t('On the line');
  }
}

function showIdle(): void {
  if (!ui) return;
  caller = null;
  ui.ring.hidden = true;
  ui.name.textContent = t('Nobody on the line');
  ui.gimmick.textContent = t('Calls come in while the shift runs.');
  ui.portrait.innerHTML = '';
  ui.state.textContent = '—';
  ui.pct.textContent = '–';
  ui.bar.style.transform = 'scaleX(0.02)';
  delete ui.state.dataset.mood; delete ui.bar.parentElement!.dataset.mood;
  ui.status.textContent = '';
  ui.wave.classList.remove('is-live');
  ui.listenBox.hidden = true;
}

function showRing(c: Caller): void {
  if (!ui) return;
  ui.ring.hidden = false;
  ui.ringName.textContent = c.name;
  ui.ringPortrait.innerHTML = face(c, 'calm', 96);
}

bus.on<Caller>('call:ring', (c) => { openPhone(); caller = c; showRing(c); const h = win?.el.querySelector<HTMLElement>('.phone__hold'); if (h) h.hidden = true; });
// the second line: somebody is holding while you finish this call
bus.on<Caller>('call:hold', (c) => { const h = win?.el.querySelector<HTMLElement>('.phone__hold'); if (!h) return; h.hidden = false; h.textContent = `☎ ${c.name} is holding on line 2`; });
// a call on hold: the strip under the meter, its patience draining
function drawHeld(): void {
  const el = win?.el.querySelector<HTMLElement>('.phone__held'); if (!el) return;
  const h = heldCall();
  el.hidden = !h;
  if (!h) return;
  el.querySelector('.phone__held-name')!.textContent = h.caller.name;
  const left = Math.max(0, h.patienceUntil - Date.now()) / (h.caller.patience * 1000);
  el.querySelector<HTMLElement>('.phone__held-bar i')!.style.transform = `scaleX(${Math.min(1, left)})`;
  el.querySelector<HTMLElement>('.phone__transfer')?.setAttribute('hidden', '');
}
bus.on('call:held', () => { drawHeld(); showIdle(); if (ui) ui.status.textContent = 'On hold. The dialer brings the next caller.'; });
bus.on('call:swapped', () => { drawHeld(); });
bus.on('tick', drawHeld);
bus.on<{ caller: Caller }>('call:held-ended', ({ caller: c }) => { drawHeld(); if (ui) ui.status.textContent = `${c.name.split(',')[0]} hung up while on hold.`; });
bus.on<ActiveCall>('call:answered', () => { const m = win?.el.querySelector<HTMLElement>('.phone__transfer'); if (m) m.hidden = true; });
bus.on<Caller>('call:missed', (c) => { showIdle(); if (ui) { ui.ring.hidden = true; ui.status.textContent = t('Missed: {name}. They will not call back.', { name: c.name }); } });
bus.on<{ scam: string; amount: number }>('call:paid', ({ amount }) => {
  if (!ui) return;
  const stamp = document.createElement('div');
  stamp.className = 'phone__stamp';
  stamp.textContent = `SALE +$${amount}`;
  ui.portrait.parentElement!.appendChild(stamp);
  setTimeout(() => stamp.remove(), 1600);
});
bus.on('call:answered', () => { syncFromCall(); if (ui) { ui.ring.hidden = true; ui.input.focus(); ui.wave.classList.add('is-live'); } });
bus.on<Line>('call:line', (l) => addLine(l));
bus.on<{ mood: number; delta: number }>('call:mood', ({ mood, delta }) => {
  setMood(mood);
  if (!ui) return;
  ui.status.textContent = delta ? t('Mood {d}', { d: (delta > 0 ? '+' : '') + delta }) : '';
});
// the original's status line while the caller composes a reply
bus.on<boolean>('call:thinking', (on) => { if (ui) { ui.status.textContent = on ? t('Message sent – waiting') : t('On the line'); ui.send.disabled = on; } });
bus.on<{ kind: string; value: string }>('call:gives', ({ value }) => { if (ui) ui.status.innerHTML = t('They gave you something: {v}. Type it into the app.', { v: `<b>${value}</b>` }); });

// the second meter: how much the caller doubts you (shown once it is worth knowing)
function setSuspicion(s: number): void {
  if (!ui) return;
  ui.sus.hidden = s < 15;
  ui.sus.querySelector('b')!.textContent = Math.round(s) + '%';
  ui.sus.dataset.level = s >= 55 ? 'high' : s >= 35 ? 'mid' : 'low';
}
bus.on<{ suspicion: number; delta: number; intent?: string }>('call:suspicion', ({ suspicion, intent }) => {
  setSuspicion(suspicion);
  if (!ui) return;
  if (intent === 'challenge') ui.status.textContent = 'They are testing you. Answer the question properly.';
  else if (intent === 'challenge_pass') ui.status.textContent = 'Passed. They trust you a little more.';
  else if (intent === 'challenge_fail') ui.status.textContent = 'Failed. They are watching you now.';
  else if (intent === 'busted') ui.status.textContent = 'They saw through you.';
});
bus.on<{ ms: number }>('call:speaking', ({ ms }) => { callerTalkingUntil = Date.now() + ms + 300; if (ui) { ui.wave.classList.add('is-talking'); if (!ui.status.textContent || [t('Message sent – waiting'), t('On the line')].includes(ui.status.textContent)) ui.status.textContent = t('Caller speaking'); setTimeout(() => { ui?.wave.classList.remove('is-talking'); if (ui && ui.status.textContent === t('Caller speaking')) ui.status.textContent = t('On the line'); }, ms); } });
bus.on('settings', () => { const b = win?.el.querySelector<HTMLButtonElement>('.phone__speaker'); if (b) b.setAttribute('aria-pressed', String(settings.voiceOut)); });
bus.on('call:answered', () => { if (handsFree) void listenLoop(); });
let endTimer: ReturnType<typeof setInterval> | undefined;
bus.on<{ by: string; nextIn: number; earned: number; duration: number; mood: number; caller: Caller }>('call:ended', ({ by, nextIn, earned, duration, mood, caller: c }) => {
  if (!ui) return;
  showIdle();
  ui.status.textContent = by === 'caller' ? t('They hung up.') : by === 'you' ? t('You hung up.') : by === 'transfer' ? t('Transferred. Your colleague takes it from here.') : t('Shift over.');
  drawHeld();
  clearInterval(endTimer);
  const mm = Math.floor(duration / 60000), ss = Math.floor((duration % 60000) / 1000);
  const card = document.createElement('div');
  card.className = 'phone__card';
  card.innerHTML = `<div class="phone__card-head">${t('Call ended')} <span>· ${by === 'caller' ? t('they hung up') : by === 'you' ? t('you hung up') : by === 'transfer' ? t('transferred') : t('end of shift')}</span></div>
    <div class="phone__card-name">${c.name}</div>
    <div class="phone__card-stats"><div><b>${mm}:${String(ss).padStart(2, '0')}</b><span>${t('length')}</span></div><div><b class="${earned ? 'is-money' : ''}">${earned}</b><span>${t('earned')}</span></div><div><b>${Math.round(mood)}%</b><span>${t('mood at the end')}</span></div></div>
    <div class="phone__card-next"></div>`;
  ui.log.appendChild(card);
  ui.log.scrollTop = ui.log.scrollHeight;
  const next = card.querySelector<HTMLElement>('.phone__card-next')!;
  if (nextIn > 0) {
    const until = Date.now() + nextIn;
    const tick = () => { const s = Math.max(0, Math.ceil((until - Date.now()) / 1000)); next.textContent = s > 0 ? t('Next call in {s} s…', { s }) : t('Ringing any moment.'); if (s <= 0) clearInterval(endTimer); };
    tick(); endTimer = setInterval(tick, 250);
  } else next.textContent = t('The review is next.');
});
bus.on('call:ring', () => { clearInterval(endTimer); });

registerApp({ id: 'phone', name: 'Phone', color: '#3fa34d', glyph: 'phone', kind: 'core', pinned: true, open: () => { openPhone(); } });
