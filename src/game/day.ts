// The run: break room → shift → review → next day or fired. In co-op (src/net/coop.ts) the room decides when the
// day moves: the host clocks everyone in, the room's clock ends the shift, the host moves on from the review; this
// file does the same things, just when the room says so.
import { t } from '../i18n';
import { addMoney, between, bus, chance, FINALE_DAY, fmt, pick, quotaFor, resetRun, settings, state } from './state';
import { resetRival, startRival, stopRival } from './rival';
import { showEnding } from '../ui/ending';
import { finishChallenge } from './challenge';
import { seedCallers } from './callers';
import { resetGoose } from './goose';
import { unlock } from './hall';
import { VANE } from './case';
import { forceNext } from './calls';
import { snapshotSelf } from '../world/office';
import { cameraFrame } from '../os/apps/camera';
import { hangUp, setRingTimeout, startDialer, stopDialer } from './calls';
import { bootSplash, mountOS, osElement, refreshDesktop } from '../os/desktop';
import { closeAllWindows } from '../os/windows';
import { clearEvents, scheduleEvents } from './events';
import { showReview, startReviewRoast } from './review';
import { showFired, showPromotion } from '../ui/report';
import { showTitle } from '../ui/title';
import { toast } from '../ui/toast';
import { openPhone } from '../os/apps/phone';
import { portraitSVG, specFor } from '../os/portrait';
import { sfx } from './sound';
import { enterOffice, leaveOffice, officeAvailable, setWhiteboardLines, walkToReview } from '../world/office';
import { coop } from '../net/coop';
import { showCharacterSetup } from '../ui/character';
import { startFloorTutorial, startTutorial, stopTutorial } from '../ui/tutorial';
import { checkProxy, getBrain, modelLabel, providerLabel } from './brain/index';
import { armObjectives, disarmObjectives, objectives, planObjectives, resetObjectives } from './objectives';
import { applyCustomColleagues, profileFor, saleLine, sayAs } from './colleagues';
import { applySave, clearSave, loadSave, saveRun, setSlot } from './save';
import { bumpPlays } from '../net/plays';
import { badgesThisRun, dayDoneBadges, recordRun, resetRunBadges, startShiftBadges } from './hall';
import { currentRank, rankForDays } from './ranks';
import { mutatorBonus, todayMutator } from './mutators';
import { resetVane } from './case';
import { clickerReset } from '../os/apps/clicker';
import { floorTheme, promotedFrom } from '../world/floors';
import { elevatorRide } from '../ui/elevator';
import { shownCode } from './modes';

let frameOff: (() => void) | null = null;
let colleagueTimer: ReturnType<typeof setInterval> | undefined;
let lastSecond = -1;
let breakEl: HTMLElement | null = null;
let whiteboardOff: (() => void) | null = null;

export const KRULL_SPEC = specFor('krull', { hairStyle: 3, moustache: true, glasses: false, hat: 0, skin: '#e0ac69', hair: '#1a1a1a', shirt: '#1a1a1a', headShape: 1 });

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

export async function startRun(opts: { resume?: boolean; slot?: number; challenge?: { kind: 'daily' | 'weekly'; key: string; seed: number } } = {}): Promise<void> {
  resetRun();
  if (opts.challenge) { state.mode = opts.challenge.kind; state.modeKey = opts.challenge.key; state.seed = opts.challenge.seed; seedCallers(opts.challenge.seed); } else seedCallers(0);
  if (opts.slot) setSlot(opts.slot);
  void bumpPlays();
  resetObjectives();
  resetVane();
  resetRival();
  resetGoose();
  // a saved run picks up at that day's break room; a new run throws the old save away
  const saved = opts.resume ? loadSave() : null;
  if (saved) { applySave(saved); resetRunBadges(saved.badges); } else { clearSave(); resetRunBadges(); applyCustomColleagues(); clickerReset(); }
  // in co-op the day, the quota and the colleagues are the room's
  if (coop.on) coop.sync();
  const main = document.getElementById('main')!;
  const os = mountOS(main);
  os.hidden = true;
  refreshDesktop();
  // the clock-in desk: name, look, headset check (a resumed run keeps its name and look)
  if (!saved) await showCharacterSetup();
  beginDay();
}

const TARGETS = [
  ['Answer the phone', 'Be nice (it works)', 'Sell the Moon', 'Teamwork!!'],
  ['Use their name', 'Play along', 'Answer their question', 'Do not insult the Moon'],
  ['Pitch, then ask', 'Watch the mood bar', 'Buy new products', 'Hide the casino'],
  ['Inspectors call now', 'Never say yes to a file', 'Hit the number', 'Krull is watching'],
];

export function beginDay(): void {
  state.phase = 'break';
  const main = document.getElementById('main')!;
  if (!breakEl) {
    breakEl = document.createElement('section');
    breakEl.className = 'screen break';
    breakEl.setAttribute('aria-label', 'Break room');
    main.appendChild(breakEl);
  }
  if (!objectives().length) planObjectives();
  if (state.mode === 'run') saveRun(badgesThisRun());
  // the morning after a promotion starts in the lift; its doors open onto the new floor (once per day)
  const from = promotedFrom();
  if (from && liftDay !== state.day) {
    liftDay = state.day;
    breakEl.hidden = true;
    const to = floorTheme();
    void elevatorRide(from.n, to.n, to.name, openDay);
    return;
  }
  openDay();
}

let liftDay = 0;
function openDay(): void {
  if (!breakEl) return;
  breakEl.hidden = false;
  // like the original: the day starts standing in the office. The whiteboard on the break-room wall has the day's
  // numbers; clocking in is walking to a free desk and pressing E (in co-op the host's seat clocks everyone in).
  // The dialog stays for a device without the 3-D office, or when "Skip the office walk" is on.
  if (officeAvailable() && !settings.skipFloor) {
    breakEl.hidden = true;
    whiteboardOff?.(); whiteboardOff = null;
    const m = todayMutator();
    setWhiteboardLines([...(state.day >= FINALE_DAY ? ['☠ THE BUREAU RAIDS TONIGHT. HOLD THE FLOOR.'] : []), t('Day {d} — quota {q}', { d: state.day, q: fmt(state.quota) }), ...objectives().map((o) => `☐ ${t(o.def.text)} +${fmt(o.def.reward)}`), m ? t('Tonight: {m}', { m: m.name }) : t('Clock in: any free desk, press E')]);
    enterOffice(() => { if (coop.on) coop.sat(); else void startShift(); });
    toast(t('Day {d}. Quota {q}. Walk to a free desk and press E to clock in.', { d: state.day, q: fmt(state.quota) }), 'info', 6500);
    if (state.day === 1 && !coop.on) startFloorTutorial();
    if (coop.on) whiteboardOff = bus.on('room:state', () => { /* the room clocks everyone in; nothing to redraw here */ });
    return;
  }
  renderWhiteboard();
  whiteboardOff?.();
  // co-op: the names on the board and the host's button follow the room
  whiteboardOff = coop.on ? bus.on('room:state', () => { if (state.phase === 'break' && breakEl && !breakEl.hidden) renderWhiteboard(); }) : null;
}

function renderWhiteboard(): void {
  const targets = TARGETS[Math.min(TARGETS.length - 1, state.day - 1)];
  const co = coop.on;
  const host = !co || coop.isHost();
  const names = state.colleagues.map((c) => c.name);
  breakEl!.innerHTML = `
    <div class="overlay">
      <div class="whiteboard" role="dialog" aria-labelledby="wb-title">
        <h2 id="wb-title">${t('Daily targets — Day {d}', { d: state.day })}</h2>
        ${co ? `<p class="whiteboard__room">Room ${esc(shownCode(coop.code()))} · ${names.length ? 'with ' + esc(names.join(', ')) : 'just you so far'}${coop.live ? '' : ' · reconnecting…'}</p>` : ''}
        <ol>${targets.map((x) => `<li>${t(x)}</li>`).join('')}<li class="mark">${t("{q} or everyone's fired ☺", { q: fmt(state.quota) })}</li></ol>
        ${todayMutator() ? `<p class="wb-mutator">${t('Tonight:')} <b>${esc(todayMutator()!.name)}</b> — ${esc(todayMutator()!.blurb)} <span class="wb-reward">bonus ×${todayMutator()!.bonus}</span></p>` : ''}
        ${objectives().length ? `<div class="wb-targets"><b>${t('Bonus targets (paid to you, not the team)')}</b><ul>${objectives().map((o) => `<li>${esc(t(o.def.text))} <span class="wb-reward">+${fmt(o.def.reward)}</span></li>`).join('')}</ul></div>` : ''}
        <div class="cluster" style="--cluster-space:.5rem">
          ${host ? `<button class="btn btn--big" data-clockin>${co ? t('Clock everyone in') : t('Clock in')}</button>` : `<button class="btn btn--big" data-clockin disabled>Waiting for ${esc(coop.hostName())} to clock everyone in…</button>`}
          ${officeAvailable() && !settings.skipFloor ? `<button class="btn btn--ghost" data-walk>${t('Walk the floor first')}</button>` : ''}
        </div>
      </div>
    </div>`;
  breakEl!.querySelector('[data-clockin]')!.addEventListener('click', (e) => {
    sfx.unlock();
    const b = e.currentTarget as HTMLButtonElement;
    if (coop.clockIn()) { b.disabled = true; b.textContent = 'Clocking everyone in…'; } else void startShift();
  });
  breakEl!.querySelector('[data-walk]')?.addEventListener('click', () => { sfx.unlock(); breakEl!.hidden = true; enterOffice(() => { if (coop.on) coop.sat(); else void startShift(); }); });
}

export function hideBreak(): void {
  if (breakEl) breakEl.hidden = true;
  whiteboardOff?.();
  whiteboardOff = null;
}

function boot(): Promise<void> {
  return new Promise((resolve) => {
    const b = document.createElement('div');
    b.className = 'boot';
    b.innerHTML = `<div><div class="boot__face">${portraitSVG(KRULL_SPEC, 'angry', 96)}</div><div class="boot__logo">HARBOUR OS</div><div class="boot__sub">Sunrise Customer Care · night shift · do not touch the settings</div><div class="boot__lines" aria-hidden="true"></div><div class="boot__bar"><i></i></div></div>`;
    document.body.appendChild(b);
    // the BIOS lines, one every beat, and a bar that fills with them
    const quick = settings.motion === 'off';
    const lines = ['HARBOUR BIOS 4.2 · 640K is enough', 'Headset ........ OK', 'Phone line ...... OK', `Script .......... ${state.owned.size} products`, `Strikes ......... ${state.strikes}`, `Quota ........... ${fmt(state.quota)}`, 'Mr. Krull ....... watching'];
    const list = b.querySelector<HTMLElement>('.boot__lines')!, bar = b.querySelector<HTMLElement>('.boot__bar i')!;
    if (!quick) lines.forEach((l, i) => setTimeout(() => { list.insertAdjacentHTML('beforeend', `<div>${l}</div>`); bar.style.transform = `scaleX(${(i + 1) / lines.length})`; sfx.type(); }, 120 + i * 190));
    setTimeout(() => { b.remove(); resolve(); }, quick ? 300 : 2000);
  });
}

function shiftLabel(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`;
}

export async function startShift(): Promise<void> {
  if (state.phase === 'shift') return;
  hideBreak();
  leaveOffice();
  state.phase = 'shift';
  if (!coop.live) state.shiftTotal = settings.shiftMinutes * 60_000;
  state.shiftLeft = coop.shiftLeft() ?? state.shiftTotal;
  state.casinoToday = 0;
  state.strikes = 0;
  await boot();
  if (state.phase !== 'shift') return; // the room moved on during the boot screen
  const os = osElement()!;
  os.classList.remove('os--out');
  os.hidden = false;
  os.classList.add('os--in');
  setTimeout(() => os.classList.remove('os--in'), 400);
  bootSplash();
  refreshDesktop();
  bus.emit('money');
  openPhone();
  startDialer();
  scheduleEvents();
  armObjectives();
  startShiftBadges();
  startRival();
  if (state.day >= FINALE_DAY && !coop.live) { forceNext({ caller: VANE, mood: 40, opener: 'Inspector Vane. The Bureau is in the building. Every line tonight is ours. The file is open, and it is thick.' }); toast('THE BUREAU IS IN THE BUILDING. Inspectors on every other line, raids all night. Survive the shift and you are out.', 'danger', 8000); }
  if (state.day === 1) startTutorial();
  // say out loud who is playing the callers, and whether the proxy is actually reachable
  void (async () => {
    if (getBrain().name !== 'live') { toast('Callers: built-in brain. Run `npm run brain` for live AI callers.', 'info', 6000); return; }
    if (settings.apiKey && settings.brain === 'claude') { toast('Callers: Claude, with your own key.', 'money', 4000); return; }
    const ok = await checkProxy();
    const model = ok ? modelLabel() : '';
    toast(ok ? `Callers: ${providerLabel()} via the proxy${model ? ` (${model})` : ''}.` : 'Brain proxy not reachable — is `npm run brain` running? Using the built-in brain until it is.', ok ? 'money' : 'danger', 7000);
  })();
  lastSecond = -1;
  frameOff?.();
  // wall-clock, not requestAnimationFrame: the shift keeps time even when the tab is not painting. In co-op the
  // deadline is the room's; if the room goes quiet, the clock runs on from the last deadline it gave.
  let deadline = Date.now() + (coop.shiftLeft() ?? state.shiftTotal);
  const clock = setInterval(() => {
    if (state.phase !== 'shift') { clearInterval(clock); return; }
    const left = coop.shiftLeft();
    if (left !== null) deadline = Date.now() + left;
    state.shiftLeft = Math.max(0, deadline - Date.now());
    const s = Math.ceil(state.shiftLeft / 1000);
    if (s !== lastSecond) { lastSecond = s; bus.emit('tick'); if (s === 60) toast(t('One minute to the review.'), 'danger'); }
    // the room ends its own shift; this browser only steps in when the room is gone or late
    if (state.shiftLeft <= 0 && (!coop.live || Date.now() - deadline > 5000)) { clearInterval(clock); void endShift(); }
  }, 200);
  frameOff = () => clearInterval(clock);
  clearInterval(colleagueTimer);
  colleagueTimer = setInterval(colleagueTick, 1000);
  toast(t('Shift started. Quota {q}. Review in {t}.', { q: fmt(state.quota), t: shiftLabel(state.shiftLeft) }));
  const m = todayMutator();
  if (m) setTimeout(() => toast(t("Tonight's twist: {m} — {b}", { m: m.name, b: m.blurb }), 'danger', 6000), 1200);
}

function colleagueTick(): void {
  if (state.phase !== 'shift' || coop.live) return; // in co-op the colleagues are real and report their own sales
  // three colleagues bring in roughly a third of the quota over a shift; the rest is yours. Each closes at their
  // own pace (colleagues.ts) and says so in their own words
  for (const c of state.colleagues) {
    if (state.abducted.includes(c.name)) continue;   // taken by the UFO: no sales until tomorrow
    const p = profileFor(c.name);
    if (!chance((1 / 90) * (p?.pace ?? 1))) continue;
    const earn = Math.max(5, Math.round(state.quota * between(0.01, 0.025) / 5) * 5);
    c.earned += earn;
    addMoney(earn, 'colleague', { quiet: true });
    if (!chance(0.4)) continue;
    const l = saleLine(c.name);
    if (l) sayAs(c.name, `${l} (${fmt(earn)})`, { spoken: l, voice: chance(0.5) });
    else toast(`${c.name} closed ${fmt(earn)} — ${pick(['a Sun Warranty', 'two acres of Moon', 'a gravity top-up', 'a cloud, monthly', 'a haunting policy'])}.`, 'money', 2600);
  }
}

/** stops a running shift without a review (co-op: the room went on to another day while this browser was away) */
export function abortShift(): void {
  if (state.phase !== 'shift') return;
  state.phase = 'break';
  frameOff?.(); frameOff = null;
  clearInterval(colleagueTimer);
  stopDialer();
  hangUp('shift');
  clearEvents();
  disarmObjectives();
  closeAllWindows();
  const os = osElement();
  if (os) os.hidden = true;
}

// the shift is over: a bell, the desktop shrinks back into the monitor, then the meeting room
function shiftOver(): Promise<void> {
  return new Promise((resolve) => {
    const os = osElement();
    const splash = document.createElement('div');
    splash.className = 'shift-over';
    splash.innerHTML = `<div class="shift-over__word">${t('Shift over')}</div><div class="shift-over__sub">${t('Mr. Krull is waiting in the meeting room.')}</div>`;
    document.body.appendChild(splash);
    sfx.alert(); setTimeout(() => sfx.alert(), 350);
    const quick = settings.motion === 'off';
    if (os) os.classList.add('os--out');
    setTimeout(() => {
      closeAllWindows();
      if (os) { os.hidden = true; os.classList.remove('os--out'); }
      splash.remove();
      resolve();
    }, quick ? 250 : 1800);
  });
}

export async function endShift(): Promise<void> {
  if (state.phase !== 'shift') return;
  state.phase = 'review';
  frameOff?.(); frameOff = null;
  clearInterval(colleagueTimer);
  stopDialer();
  hangUp('shift');
  clearEvents();
  disarmObjectives();
  stopTutorial();
  stopRival();
  // Mr. Krull starts writing tonight's review from the transcripts while everyone walks to the room
  startReviewRoast();
  await shiftOver();
  // like the original: walk to the meeting room with the colleagues (a cut in co-op, or with the walk skipped)
  if (officeAvailable() && !settings.skipFloor && !coop.live) await walkToReview();
  const pass = await showReview();
  if (state.mode !== 'run') { await finishChallenge(pass); leaveOffice(); resetRun(); showTitle(); return; }
  if (pass) { if (state.day >= FINALE_DAY && !coop.live) await escape(); else await promote(); } else await fireEveryone();
}

// day ten survived: the ending, the run kept as escaped, the title
async function escape(): Promise<void> {
  state.phase = 'unlock';
  dayDoneBadges(state.day);
  unlock('escape');
  recordRun(false, true);
  clearSave();
  await showEnding({ badges: badgesThisRun() });
  leaveOffice();
  resetRun();
  showTitle();
}

async function promote(): Promise<void> {
  state.phase = 'unlock';
  const bonus = Math.round((100 + 25 * state.day) * mutatorBonus());   // a mutator day pays more
  // the bonus is personal only: it never moves the team total
  state.personal += bonus;
  bus.emit('money');
  // the day just survived may bring a new rank (and its perk) and a badge or two
  const was = currentRank();
  const next = rankForDays(state.day);
  // the Senior Agent's photo goes on the wall: your webcam if the Camera shows it, else your character
  if (next !== was && next.id === 'senior') { const url = cameraFrame() ?? snapshotSelf(); if (url) { try { localStorage.setItem('hp.eotm', url); } catch { /* ignore */ } } }
  dayDoneBadges(state.day);
  await showPromotion(bonus, { promoted: next !== was ? next : null, badges: badgesThisRun() });
  if (coop.live) { coop.catchUp(); return; } // the room is on tomorrow already
  nextDay();
  recordRun(false);
  beginDay();
}

function nextDay(): void {
  state.day++;
  bus.emit('day:new', state.day);
  state.quota = quotaFor(state.day);
  state.earnedToday = 0;
  state.calls = [];
  state.history = [];
  state.virus = false;
  state.strikes = state.carryStrike ? 1 : 0;   // the review door: one strike follows you in
  state.firedByKrull = false; state.rivalBurning = false;
  resetRival();
  state.carryStrike = false;
  state.date = new Date(state.date.getTime() + 24 * 3600 * 1000);
  state.shiftLeft = state.shiftTotal;
  state.usedCallers.clear();
  state.abducted = [];
  resetObjectives();
}

async function fireEveryone(): Promise<void> {
  state.phase = 'fired';
  recordRun(true);
  clearSave();
  const fire = document.createElement('div');
  fire.className = 'fire';
  document.body.appendChild(fire);
  sfx.boom();
  await new Promise((r) => setTimeout(r, settings.motion === 'off' ? 200 : 2200));
  await showFired({ badges: badgesThisRun() });
  fire.remove();
  if (coop.live) { coop.catchUp(); return; } // the host opened the floor again: day one
  if (coop.on) coop.leave();
  leaveOffice();
  resetRun();
  showTitle();
}

// leave the PC mid-shift: the desktop shrinks back into the monitor and you are on the floor; calls keep
// ringing (longer, since you have to walk back) and any free PC will do to pick one up
export function standUp(): void {
  if (state.phase !== 'shift' || !officeAvailable()) return;
  const os = osElement();
  if (!os || os.hidden) return;
  setRingTimeout(40_000);
  os.classList.add('os--out');
  stopTutorial();
  setTimeout(() => {
    if (state.phase !== 'shift') return;
    os.hidden = true; os.classList.remove('os--out');
    enterOffice(() => returnToDesk(), { standFrom: true });
  }, settings.motion === 'off' ? 50 : 650);
}

function returnToDesk(): void {
  if (state.phase !== 'shift') return;
  setRingTimeout(16_000);
  leaveOffice();
  const os = osElement()!;
  os.classList.remove('os--out');
  os.hidden = false;
  os.classList.add('os--in');
  setTimeout(() => os.classList.remove('os--in'), 400);
  bootSplash();
  openPhone();
  bus.emit('money');
}

bus.on('standup', standUp);

export function clockOut(): void {
  if (state.phase !== 'shift') return;
  if (coop.live) {
    // the floor's review is everyone's: this desk just goes quiet until then
    stopDialer();
    hangUp('you');
    toast('Clocked out early. Your phone is off until the review.', 'danger');
    return;
  }
  toast('Clocking out early. The review happens with what you have.', 'danger');
  setTimeout(() => void endShift(), 800);
}

bus.on('power', clockOut);
