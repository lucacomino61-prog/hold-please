// The title screen: poster type, Dial in, Stop animations, Settings, How it works.
import { t } from '../i18n';
import '../styles/coop.css';
import { fmt, saveSettings, settings, state } from '../game/state';
import { startRun } from '../game/day';
import { openSettings } from './settings';
import { openLobby } from './lobby';
import { openHall } from './hall';
import { sfx } from '../game/sound';
import { warmOffice } from '../world/office';
import { freeSlot, listSaves, SLOTS } from '../game/save';
import { rankForDays } from '../game/ranks';
import { FEEDBACK_URL } from '../config';
import { plays } from '../net/plays';
import { showLoading } from './loading';
import { startChallenge } from '../game/challenge';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

let el: HTMLElement | null = null;

export function showTitle(): void {
  state.phase = 'title';
  const main = document.getElementById('main')!;
  if (!el) {
    el = document.createElement('section');
    el.className = 'screen title';
    el.setAttribute('aria-label', 'Title');
    el.innerHTML = `
      <canvas class="title__grain" aria-hidden="true"></canvas>
      <div class="title__inner">
        <div class="title__eyebrow">${t('Sunrise Customer Care · night shift · Port Fortune')}</div>
        <h1 class="title__word">Hold <em>please</em></h1>
        <p class="title__tag">${t('A scam call centre comedy. Sell the Moon to a raccoon, hit the quota, survive Mr. Krull.')}</p>
        <div class="title__actions">
          <button class="btn btn--big title__continue" type="button" data-continue hidden></button>
          <button class="btn btn--big" type="button" data-dial>${t('Dial in')}</button>
          <button class="btn btn--ghost" type="button" data-daily title="One seeded shift everyone plays today, scored on the board">${t("Tonight's shift")}</button>
          <button class="btn btn--ghost" type="button" data-weekly title="One seeded shift for the whole week">${t("This week's shift")}</button>
          <button class="btn btn--ghost" type="button" data-friends>${t('Play with friends')}</button>
          <button class="btn btn--ghost" type="button" data-hall>${t('Hall of fame')}</button>
          <button class="btn btn--ghost" type="button" data-how>${t('How it works')}</button>
          <button class="btn btn--ghost" type="button" data-settings>${t('Settings')}</button>
        </div>
        <div class="title__ready" aria-live="polite"></div>
      </div>
      <div class="title__foot">
        <span>${t('Everything here is invented. Every caller is a cartoon. No real scheme is explained.')}</span>
        <span class="title__plays" aria-live="polite"></span>
        ${FEEDBACK_URL ? `<a class="title__feedback" href="${esc(FEEDBACK_URL)}" target="_blank" rel="noopener">${t('Feedback')}</a>` : ''}
        <label><input type="checkbox" data-motion /> ${t('Stop animations')}</label>
      </div>`;
    main.appendChild(el);
    const motion = el.querySelector<HTMLInputElement>('[data-motion]')!;
    motion.checked = settings.motion === 'off';
    motion.addEventListener('change', () => { settings.motion = motion.checked ? 'off' : 'on'; saveSettings(); });
    el.querySelector('[data-dial]')!.addEventListener('click', () => { sfx.unlock(); newRun(); });
    el.querySelector('[data-continue]')!.addEventListener('click', () => { sfx.unlock(); hideTitle(); void startRun({ resume: true }); });
    el.querySelector('[data-hall]')!.addEventListener('click', () => openHall());
    el.querySelector('[data-daily]')!.addEventListener('click', () => { sfx.unlock(); hideTitle(); startChallenge('daily'); });
    el.querySelector('[data-weekly]')!.addEventListener('click', () => { sfx.unlock(); hideTitle(); startChallenge('weekly'); });
    el.querySelector('[data-settings]')!.addEventListener('click', () => openSettings());
    el.querySelector('[data-friends]')!.addEventListener('click', () => { sfx.unlock(); openLobby(); });
    el.querySelector('[data-how]')!.addEventListener('click', () => howItWorks());
    grain(el.querySelector('canvas')!);
    const ready = el.querySelector<HTMLElement>('.title__ready')!;
    ready.textContent = t('Warming up the office…');
    showLoading(warmOffice()).then((ok) => { ready.textContent = ok ? t('The office is ready. Headset on.') : ok === undefined ? '' : t('Running without the 3-D office on this device.'); }).catch(() => { ready.textContent = 'Running without the 3-D office on this device.'; });
  }
  el.hidden = false;
  // saved runs: one Continue per slot leads, Dial in becomes a new run (in the first free slot, or one you pick)
  const saves = listSaves();
  const any = saves.some(Boolean);
  const cont = el.querySelector<HTMLButtonElement>('[data-continue]')!;
  cont.hidden = true;
  el.querySelectorAll('.title__slot').forEach((b) => b.remove());
  saves.forEach((saved, i) => {
    if (!saved) return;
    const b = document.createElement('button');
    b.className = 'btn btn--big title__continue title__slot'; b.type = 'button'; b.dataset.slot = String(i + 1);
    b.innerHTML = `<small>${t('Continue')}${SLOTS > 1 ? ` · ${t('slot')} ${i + 1}` : ''}${saved.name && saved.name !== 'Agent' ? ' · ' + esc(saved.name) : ''}</small>${t('Day {d}', { d: saved.day })} · ${fmt(saved.personal)} · ${rankForDays(saved.day - 1).name}`;
    b.addEventListener('click', () => { sfx.unlock(); hideTitle(); void startRun({ resume: true, slot: i + 1 }); });
    cont.before(b);
  });
  el.querySelector('[data-dial]')!.textContent = any ? t('New run') : t('Dial in');
  // the play counter from the room server, when there is one
  const playsEl = el.querySelector<HTMLElement>('.title__plays')!;
  void plays().then((n) => { playsEl.textContent = n === null ? '' : t('{n} shifts started so far', { n: n.toLocaleString('en-US') }); });
  // the skip link stays the first Tab stop on arrival; after a run the focus returns to the main button
  if (returning) (el.querySelector<HTMLButtonElement>('.title__slot') ?? el.querySelector<HTMLButtonElement>('[data-dial]')!).focus();
  returning = true;
}
let returning = false;

// a new run when every slot is taken: pick the one to replace
function newRun(): void {
  const free = freeSlot();
  if (free) { hideTitle(); void startRun({ slot: free }); return; }
  const saves = listSaves();
  const wrap = document.createElement('div');
  wrap.className = 'screen'; wrap.style.zIndex = '80'; wrap.style.background = 'oklch(0 0 0 / .6)';
  wrap.innerHTML = `<div class="panel" role="dialog" aria-labelledby="slot-title"><h2 id="slot-title">${t('Every slot holds a run')}</h2><p>${t('Pick the one this new run replaces.')}</p>
    <div class="slots">${saves.map((s, i) => `<button class="btn" type="button" data-slot="${i + 1}"><small>${t('Slot {n}', { n: i + 1 })}${s?.name && s.name !== 'Agent' ? ' · ' + esc(s.name) : ''}</small>${t('Day {d}', { d: s?.day ?? 0 })} · ${fmt(s?.personal ?? 0)}</button>`).join('')}</div>
    <div class="panel__actions"><button class="btn btn--ghost" type="button" data-cancel>${t('Keep them all')}</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) => b.addEventListener('click', () => { wrap.remove(); hideTitle(); void startRun({ slot: Number(b.dataset.slot) }); }));
  wrap.querySelector('[data-cancel]')!.addEventListener('click', () => wrap.remove());
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.remove(); });
  wrap.querySelector<HTMLButtonElement>('[data-slot]')!.focus();
}

export function hideTitle(): void { if (el) el.hidden = true; }

function grain(c: HTMLCanvasElement): void {
  const w = (c.width = 256), h = (c.height = 256);
  const ctx = c.getContext('2d'); if (!ctx) return;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  c.style.backgroundImage = `url(${c.toDataURL()})`;
}

function howItWorks(): void {
  const wrap = document.createElement('div');
  wrap.className = 'screen';
  wrap.style.zIndex = '80';
  wrap.style.background = 'oklch(0 0 0 / .6)';
  wrap.innerHTML = `<div class="panel" role="dialog" aria-labelledby="how-title">
    <h2 id="how-title">${t('How it works')}</h2>
    <div class="demo" aria-hidden="true"><div class="demo__phone"><div class="demo__ring">📞 Fennimore the Fox</div><div class="demo__trust"><i></i></div><div class="demo__bubble demo__bubble--them">Tell me about the Moon.</div><div class="demo__bubble demo__bubble--you">Pick a crater, dear.</div></div><div class="demo__pop">+$250</div><div class="demo__krull">Mr. Krull: QUOTA MET. DO NOT GET COMFORTABLE.</div></div>
    <h3>${t('1. Answer the phone')}</h3><p>${t('Callers are creatures, machines and ghosts. Each has a world. Use their name, play along, answer their question. The mood bar tells you how you are doing.')}</p>
    <h3>${t('2. Sell something impossible')}</h3><p>Pitch a product, then ask for the one thing that closes it: a crater, a serial number on the Sun, a PIN for gravity. When they say it, type it into that product's app. Money lands in the team total.</p>
    <h3>${t('3. Hit the quota before the review')}</h3><p>The shift is ${settings.shiftMinutes} minutes. Mr. Krull reviews the day with slides. Miss the number and everyone is fired. Make it and tomorrow's number is bigger, with new products in Swindlr Market.</p>
    <h3>${t('4. Survive the office')}</h3><p>From day 2: inspectors who want you to open their file, police raids, air strikes, power cuts, and Krull walking past while the casino is open.</p>
    <p class="fine">Typing always works. Chrome and Edge can also listen to your microphone (hold the mic button) and read the callers out loud.</p>
    <div class="panel__actions"><button class="btn btn--amber" type="button">${t('Got it')}</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('button')!.addEventListener('click', close);
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wrap.querySelector<HTMLButtonElement>('button')!.focus();
}
