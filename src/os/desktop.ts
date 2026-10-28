// Harbour OS: wallpaper, icon grid, window layer, taskbar with the HUD.
import { t } from '../i18n';
import { bus, fmt, settings, state } from '../game/state';
import { toast } from '../ui/toast';
import { icon } from './icons';
import { appList, openApp } from './registry';
import { paintWallpaper, type WallpaperId } from './wallpaper';
import { allWindows, setWindowLayer } from './windows';
import { coop } from '../net/coop';
import { currentRank } from '../game/ranks';
import { voice } from '../net/voice';
import { shownCode } from '../game/modes';

let os: HTMLElement | null = null;
let wall: HTMLCanvasElement | null = null;
let wallpaperId: WallpaperId = 'alps';
let unsub: (() => void)[] = [];

export function mountOS(parent: HTMLElement): HTMLElement {
  if (os) return os;
  os = document.createElement('div');
  os.id = 'os';
  os.className = 'os';
  os.setAttribute('aria-label', 'Harbour OS desktop');
  os.innerHTML = `
    <canvas class="os__wall" aria-hidden="true"></canvas>
    <div class="os__icons" role="list" aria-label="Apps"></div>
    <div class="os__windows" id="windows"></div>
    <nav class="os__bar" aria-label="Taskbar">
      <div class="os__bar-left">
        <button class="bar-btn bar-btn--power" data-power aria-label="${t('Clock out')}">${icon('power')}</button>
        <button class="bar-btn bar-btn--stand" data-stand aria-label="Stand up and walk the floor (Esc)" title="${t('Stand up (Esc)')}">${icon('krull')}</button>
        <div class="os__pinned"></div>
        <div class="os__tasks"></div>
      </div>
      <div class="os__hud" aria-live="off">
        <div class="hud__group hud__group--room" hidden>
          <span class="hud__label">${t('Room')}</span>
          <b class="hud__room tabular">—</b>
          <button type="button" class="hud__mic" data-mic aria-pressed="false" title="${t('Voice chat: talk to the room')}">🎙</button>
        </div>
        <div class="hud__group hud__group--rank">
          <span class="hud__label">${t('Rank')}</span>
          <b class="hud__rank">Trainee</b>
        </div>
        <div class="hud__block tabular">
          <div class="hud__row hud__row--personal"><span class="hud__k hud__k--personal">${t('Personal')}</span> <b class="hud__personal">$0</b></div>
          <div class="hud__row hud__row--team"><span class="hud__k hud__k--team">${t('Team')}</span> <b class="hud__team">$0</b> <span class="hud__slash">/</span> <span class="hud__k hud__k--quota">${t('Quota')}</span> <b class="hud__quota">$600</b></div>
          <div class="hud__row hud__row--review"><span class="hud__k hud__k--review">${t('Performance review')}</span> <b class="hud__review">10:00</b></div>
        </div>
        <div class="hud__group hud__group--clock">
          <b class="hud__time tabular">11:00 PM</b>
          <span class="hud__date">Wed, Aug 26, 2026</span>
        </div>
      </div>
    </nav>`;
  parent.appendChild(os);
  wall = os.querySelector<HTMLCanvasElement>('.os__wall');
  setWindowLayer(os.querySelector<HTMLElement>('#windows')!);
  refreshDesktop();
  resizeWall();
  window.addEventListener('resize', resizeWall);

  os.querySelector('[data-power]')!.addEventListener('click', () => bus.emit('power'));
  os.querySelector('[data-stand]')!.addEventListener('click', () => bus.emit('standup'));
  // the voice chat mic, shown with the room group in co-op
  const mic = os.querySelector<HTMLButtonElement>('[data-mic]')!;
  mic.addEventListener('click', () => { void voice.toggle(); });
  const micState = () => { mic.setAttribute('aria-pressed', String(voice.on)); mic.title = voice.on ? 'Mic on · ' + voice.connected() + ' connected' : t('Voice chat: talk to the room'); mic.hidden = !voice.supported(); };
  unsub.push(bus.on('voice:state', micState)); micState();
  // Esc on the desktop (not inside a text field) = stand up and walk the floor
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !os || os.hidden || state.phase !== 'shift') return;
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) { a.blur(); return; }
    bus.emit('standup');
  });

  unsub.push(bus.on('money', updateHud));
  unsub.push(bus.on('tick', updateHud));
  unsub.push(bus.on('windows', renderTasks));
  unsub.push(bus.on('unlock', refreshDesktop));
  updateHud();
  return os;
}

export function osElement(): HTMLElement | null { return os; }

function resizeWall(): void {
  if (!os || !wall) return;
  paintWallpaper(wall, wallpaperId, os.clientWidth, os.clientHeight);
}

export function setWallpaper(id: WallpaperId): void {
  wallpaperId = id;
  try { localStorage.setItem('hp.wall', id); } catch { /* ignore */ }
  resizeWall();
}

export function currentWallpaper(): WallpaperId { return wallpaperId; }

// the boot splash the real desktop shows on the monitor: black, the logo face, the name, a bar; then the desktop
export function bootSplash(ms = 1100): void {
  if (!os || settings.motion === 'off') return;
  const el = document.createElement('div');
  el.className = 'os__boot';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="os__boot-logo">${icon('krull')}</div><div class="os__boot-name">Harbour OS</div><div class="os__boot-bar"><i></i></div>`;
  os.appendChild(el);
  el.querySelector<HTMLElement>('.os__boot-bar i')!.style.animationDuration = ms * 0.8 + 'ms';
  setTimeout(() => { el.classList.add('os__boot--out'); setTimeout(() => el.remove(), 320); }, ms);
}

export function refreshDesktop(): void {
  if (!os) return;
  try { const saved = localStorage.getItem('hp.wall') as WallpaperId | null; if (saved) wallpaperId = saved; } catch { /* ignore */ }
  const grid = os.querySelector<HTMLElement>('.os__icons')!;
  grid.innerHTML = '';
  for (const app of appList()) {
    // every product shows on the desktop like the real one does; the ones you have not bought are greyed and locked
    const locked = app.kind === 'scam' && !!app.scam && !state.owned.has(app.scam);
    const b = document.createElement('button');
    b.className = 'app-icon' + (locked ? ' app-icon--locked' : '');
    b.setAttribute('role', 'listitem');
    b.dataset.app = app.id;
    if (locked) b.title = `${app.name} — buy it in Swindlr Market`;
    b.innerHTML = `<span class="tile" style="--tile:${app.color}">${icon(app.glyph)}${locked ? '<span class="tile__lock" aria-hidden="true">🔒</span>' : ''}</span><span class="app-icon__label">${app.name}</span>`;
    b.addEventListener('click', () => { if (locked) { toast(`${app.name} is in Swindlr Market.`, 'info'); openApp('shop'); } else openApp(app.id); });
    grid.appendChild(b);
  }
  const pinned = os.querySelector<HTMLElement>('.os__pinned')!;
  pinned.innerHTML = '';
  for (const app of appList()) {
    if (!app.pinned) continue;
    const b = document.createElement('button');
    b.className = 'bar-btn bar-btn--pinned';
    b.dataset.app = app.id;
    b.setAttribute('aria-label', 'Open ' + app.name);
    b.title = app.name;
    b.style.setProperty('--tile', app.color);
    b.innerHTML = `<span class="bar-btn__tile">${icon(app.glyph)}</span>`;
    b.addEventListener('click', () => openApp(app.id));
    pinned.appendChild(b);
  }
}

function renderTasks(): void {
  if (!os) return;
  // the pinned icons underline themselves while their window is open, like the real taskbar
  const open = new Set(allWindows().map((w) => w.opts.id));
  os.querySelectorAll<HTMLElement>('.bar-btn--pinned').forEach((b) => b.classList.toggle('bar-btn--open', open.has(b.dataset.app!)));
  const tasks = os.querySelector<HTMLElement>('.os__tasks')!;
  tasks.innerHTML = '';
  for (const w of allWindows()) {
    const b = document.createElement('button');
    b.className = 'task' + (w.minimised ? ' task--min' : '') + (w.el.classList.contains('win--active') ? ' task--active' : '');
    b.innerHTML = `<span class="task__glyph" aria-hidden="true">${w.opts.glyph}</span><span class="task__title">${w.opts.title}</span>`;
    b.setAttribute('aria-label', (w.minimised ? 'Restore ' : 'Focus ') + w.opts.title);
    b.addEventListener('click', () => { if (w.minimised) { w.restore(); w.focus(); } else if (w.el.classList.contains('win--active')) w.minimise(); else w.focus(); });
    tasks.appendChild(b);
  }
}

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }

// money counts up over half a second instead of jumping (wall-clock, so it runs even when the tab is not painting)
const shown = new WeakMap<HTMLElement, { value: number; timer?: ReturnType<typeof setInterval> }>();
function tween(el: HTMLElement, target: number): void {
  let s = shown.get(el);
  if (!s) { s = { value: target }; shown.set(el, s); el.textContent = fmt(target); return; }
  if (s.value === target) return;
  if (settings.motion === 'off') { s.value = target; el.textContent = fmt(target); return; }
  clearInterval(s.timer);
  const from = s.value, start = Date.now(), dur = 550;
  s.timer = setInterval(() => {
    const k = Math.min(1, (Date.now() - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    s!.value = Math.round(from + (target - from) * e);
    el.textContent = fmt(s!.value);
    if (k >= 1) clearInterval(s!.timer);
  }, 30);
}

bus.on<{ amount: number; source: string }>('payout', ({ amount, source }) => {
  os?.querySelectorAll<HTMLElement>('.hud__row--personal, .hud__row--team').forEach((g) => { g.classList.remove('hud__group--flash'); void g.offsetWidth; g.classList.add('hud__group--flash'); });
  if (source !== 'colleague') moneyPop(amount);
});
bus.on<{ amount: number }>('loss', ({ amount }) => {
  const g = os?.querySelector<HTMLElement>('.hud__row--team');
  if (g) { g.classList.remove('hud__group--loss'); void g.offsetWidth; g.classList.add('hud__group--loss'); }
  moneyPop(-amount);
});

// the original's big green "+$250" floating over the whole desktop on every sale (red and falling on a loss)
export function moneyPop(amount: number): void {
  if (!os || os.hidden || !amount) return;
  const el = document.createElement('div');
  el.className = 'money-pop' + (amount < 0 ? ' money-pop--loss' : '');
  el.setAttribute('aria-hidden', 'true');
  el.textContent = (amount < 0 ? '−' : '+') + fmt(Math.abs(amount));
  const w = os.clientWidth, h = os.clientHeight;
  el.style.left = Math.round(w * (0.3 + Math.random() * 0.4)) + 'px';
  el.style.top = Math.round(h * (0.3 + Math.random() * 0.3)) + 'px';
  el.style.setProperty('--tilt', (Math.random() * 10 - 5).toFixed(1) + 'deg');
  os.appendChild(el);
  const ms = settings.motion === 'off' ? 900 : 1500;
  setTimeout(() => el.remove(), ms);
}

export function clockLabel(): { time: string; date: string } {
  const d = new Date(state.date.getTime() + (state.shiftTotal - state.shiftLeft) * 6); // a 10-minute shift = a 1-hour night
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const time = `${h}:${pad(d.getMinutes())} ${ampm}`;
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return { time, date };
}

function updateHud(): void {
  if (!os) return;
  // in co-op TEAM is the room's total (mirrored into state.team by src/net/coop.ts); the Room group says which room
  const roomGroup = os.querySelector<HTMLElement>('.hud__group--room')!;
  roomGroup.hidden = !coop.on;
  if (coop.on) {
    os.querySelector('.hud__room')!.textContent = coop.live ? `${shownCode(coop.code())} · ${coop.online()} online` : `${shownCode(coop.code())} · reconnecting`;
    roomGroup.classList.toggle('hud__group--off', !coop.live);
    roomGroup.title = coop.live ? 'The team total is shared with everyone in the room' : 'The room is unreachable: totals are local until it is back';
  }
  os.querySelector('.hud__rank')!.textContent = currentRank().name;
  tween(os.querySelector<HTMLElement>('.hud__personal')!, state.personal);
  tween(os.querySelector<HTMLElement>('.hud__team')!, state.team);
  os.querySelector('.hud__quota')!.textContent = fmt(state.quota);
  const review = os.querySelector<HTMLElement>('.hud__review')!;
  const s = Math.max(0, Math.ceil(state.shiftLeft / 1000));
  review.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
  review.classList.toggle('hud__review--late', s <= 60 && state.phase === 'shift');
  os.querySelector('.hud__team')!.classList.toggle('hud__team--met', state.team >= state.quota);
  const { time, date } = clockLabel();
  os.querySelector('.hud__time')!.textContent = time;
  os.querySelector('.hud__date')!.textContent = date;
  os.classList.toggle('os--virus', state.virus);
  if (settings.playerName) os.dataset.player = settings.playerName;
}
