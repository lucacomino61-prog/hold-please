// The dialer and the live call: ringing, answering, lines, mood, payouts, hang-ups. Two lines: a live call can be
// put on hold (hold music, patience draining twice as fast) while you take another, and swapped back. A Floor Lead
// also gets a queue: a caller who rings while both hands are full waits for a free line.
import { addMoney, bus, settings, state, type CallRecord, type Line, type ScamId } from './state';
import { drawCaller } from './callers';
import type { Caller, CallCtx, GiveKind, Turn } from './brain/types';
import { getBrain } from './brain';
import { scriptedBrain } from './brain/scripted';
import { line } from './brain/lines';
import { makeValues, matches, spokenDigits } from './values';
import { scamForKind } from './scams';
import { sfx } from './sound';
import { speak, stopSpeaking, voiceFor } from './speech';
import { floatMoney, toast } from '../ui/toast';
import { startVirus } from './events';
import { priorBias, priorWith } from './memory';
import { stylize } from './brain/style';
import { perks } from './ranks';
import { moonSoldOut, mutatorBudget, mutatorFixed, mutatorMood, mutatorPatience } from './mutators';
import { nextVane } from './case';
import { coop } from '../net/coop';
import { addClip } from './clips';
import { snapshotSelf } from '../world/office';
import { cameraFrame } from '../os/apps/camera';

export interface ActiveCall {
  caller: Caller;
  ctx: CallCtx;
  record: CallRecord;
  status: 'ringing' | 'live' | 'ended';
  busy: boolean;
  paid: Set<ScamId>;
  patienceUntil: number;
  lastInput: number;
  opener?: string;     // a forced first line (the Moon's complaint, Inspector Vane's file)
  tag?: string;        // who forced it, for the listeners that care
  snapped?: boolean;   // the review already has a webcam still of your worst moment on this call
}

export interface Forced { caller: Caller; mood?: number; opener?: string; tag?: string }

let active: ActiveCall | null = null;
let held: ActiveCall | null = null;     // the call on hold (line 2)
let queued: Caller | null = null;       // a Floor Lead's waiting caller
let forced: Forced | null = null;       // the next ring is this caller
let dialerOn = false;
let nextTimer: ReturnType<typeof setTimeout> | undefined;
let ringTimer: ReturnType<typeof setInterval> | undefined;
let missTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;
let withdrawTimer: ReturnType<typeof setTimeout> | undefined;
let byeTimer: ReturnType<typeof setTimeout> | undefined;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let ringMs = 16_000;

export function currentCall(): ActiveCall | null { return active; }
export function heldCall(): ActiveCall | null { return held; }
export function onHold(): Caller | null { return queued; }
export function callActive(): boolean { return !!active && active.status === 'live'; }
// how long a call rings before it is missed: longer while the player is away from the desk
export function setRingTimeout(ms: number): void { ringMs = ms; }
/** the next ring is this caller (events: the Moon complaining; the case: Inspector Vane) */
export function forceNext(f: Forced): void { forced = f; if (dialerOn && !active) scheduleNext(1500); }

function setTag(): void { (window as unknown as { __hpActiveTag?: string }).__hpActiveTag = active?.tag ?? ''; }

export function startDialer(): void {
  dialerOn = true;
  scheduleNext(2500 + Math.random() * 3000);
}

export function stopDialer(): void {
  dialerOn = false;
  queued = null;
  forced = null;
  clearTimeout(nextTimer);
  clearTimeout(resumeTimer);
  sfx.hold(false);
}

function scheduleNext(ms: number): void {
  clearTimeout(nextTimer);
  if (!dialerOn) return;
  nextTimer = setTimeout(ring, ms);
}

function ring(): void {
  if (!dialerOn || state.phase !== 'shift') return;
  if (active) {
    // on a call already: with the second line the next caller holds instead of being lost
    if (active.status === 'live' && perks().secondLine && !queued) { const next = forced?.caller ?? drawCaller(); forced = null; if (next) { queued = next; bus.emit('call:hold', queued); } }
    return;
  }
  const f = forced ?? nextVane();
  forced = null;
  const caller = f ? f.caller : queued ?? drawCaller();
  if (!f) queued = null;
  if (!caller) {
    // nobody to ring: the roster is people-only and no pack has been imported yet
    stopDialer();
    toast('No callers to ring. Import a caller pack in the Character Creator.', 'danger', 6000);
    return;
  }
  const ctx: CallCtx = {
    caller, mood: f?.mood ?? Math.max(5, Math.min(95, caller.mood0 + mutatorMood())), turn: 0, given: {}, asked: new Set(), pitched: new Set(), answered: false,
    lines: [], playerName: settings.playerName || 'Agent', owned: state.owned, values: makeValues(), baitAsks: 0, withdrawPending: false,
    topics: [], lastSaid: [], nudges: 0, yourLines: [],
    suspicion: 0, challenge: null, challengeTurns: 0, challengesUsed: 0, challengesFailed: 0, claims: {}, askStreak: 0,
  };
  if (state.inventory.includes('cactus')) ctx.mood = Math.min(100, ctx.mood + 5);
  // a caller who has rung before starts where the last call left them
  const prior = priorWith(caller.id);
  if (f?.mood === undefined) ctx.mood = Math.max(5, Math.min(95, ctx.mood + priorBias(prior)));
  if (prior?.busted) ctx.suspicion = 25;
  const record: CallRecord = {
    callerId: caller.id, name: caller.name, archetype: caller.archetype, startedAt: Date.now(), trustEnd: ctx.mood, trustMin: ctx.mood,
    payouts: [], lines: ctx.lines, hungUpBy: null, suspicionMax: 0,
  };
  active = { caller, ctx, record, status: 'ringing', busy: false, paid: new Set(), patienceUntil: 0, lastInput: Date.now(), opener: f?.opener, tag: f?.tag };
  setTag();
  sfx.ring();
  ringTimer = setInterval(() => sfx.ring(), 2400);
  bus.emit('call:ring', caller);
  missTimer = setTimeout(() => {
    if (active?.status === 'ringing') {
      clearInterval(ringTimer);
      bus.emit('call:missed', caller);
      active = null; setTag();
      if (held) resumeHeld(); else scheduleNext(3000 + Math.random() * 3000);
    }
  }, ringMs);
}

export function answerCall(): void {
  if (!active || active.status !== 'ringing') return;
  clearInterval(ringTimer);
  clearTimeout(missTimer);
  active.status = 'live';
  // higher ranks: callers wait longer; a Floor Lead's second line keeps the dialer going during the call
  const p = perks();
  active.patienceUntil = Date.now() + active.caller.patience * 1000 * p.patience * mutatorPatience();
  active.lastInput = Date.now();
  state.calls.push(active.record);
  state.allCalls.push(active.record);
  sfx.answer();
  bus.emit('call:answered', active);
  startTick();
  if (p.secondLine) scheduleNext(25_000 + Math.random() * 25_000);
  const a = active;
  if (a.opener) deliver({ say: a.opener, moodDelta: 0, mood: 'calm', intent: 'open' });
  else void getBrain().open(a.ctx).then((t) => { if (active === a) deliver(t); });
}

export function declineCall(): void {
  if (!active || active.status !== 'ringing') return;
  clearInterval(ringTimer);
  clearTimeout(missTimer);
  bus.emit('call:missed', active.caller);
  active = null; setTag();
  if (held) resumeHeld(); else scheduleNext(2500 + Math.random() * 2500);
}

// ---------- two lines ----------
/** park the live call: its caller waits to tinny music and loses patience twice as fast */
export function holdCall(): boolean {
  if (!active || active.status !== 'live' || held || active.busy) return false;
  held = active;
  active = null; setTag();
  stopSpeaking();
  clearTimeout(byeTimer);
  sfx.hold(true);
  bus.emit('call:held', held);
  // the dialer brings the next caller soon
  if (dialerOn) scheduleNext(2000 + Math.random() * 3000);
  return true;
}

/** take the held call back (and park the live one, if there is one) */
export function swapCall(): boolean {
  if (!held) return false;
  if (active && active.status === 'ringing') return false;   // answer or decline first
  if (active && active.busy) return false;
  const a = active;
  const h = held;
  held = a && a.status === 'live' ? a : null;
  active = h; setTag();
  clearTimeout(resumeTimer);
  stopSpeaking();
  if (!held) sfx.hold(false);
  bus.emit('call:swapped', { active: h, held });
  bus.emit('call:answered', h);   // the Phone redraws the transcript and the meter
  const back = stylize(h.caller, line(h.caller.archetype, 'greet'));
  deliver({ say: h.ctx.mood < 35 ? 'Finally. I was about to hang up.' : back, moodDelta: h.ctx.mood < 35 ? -2 : 0, mood: 'calm', intent: 'resume' });
  return true;
}

function resumeHeld(): void {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { if (!active && held && state.phase === 'shift') swapCall(); }, 1200);
}

/** hand the live call to a colleague (colleagues.ts decides what they make of it) */
export function transferCall(to: string): boolean {
  if (!active || active.status !== 'live' || active.busy || coop.live) return false;
  const a = active;
  stopSpeaking();
  const mood = a.ctx.mood;
  finish(a, 'transfer');
  bus.emit('call:transfer', { to, caller: a.caller, mood, record: a.record });
  return true;
}

function startTick(): void { clearInterval(tickTimer); tickTimer = setInterval(patienceTick, 1000); }

/** something outside the conversation moved the caller (a shared screen, a bomb threat kept talking): mood and
 *  suspicion shift, the caller says a line about it */
export function nudge(moodDelta: number, suspicionDelta: number, say?: string): void {
  if (!active || active.status !== 'live') return;
  const a = active;
  if (say) push('caller', say);
  if (moodDelta) { a.ctx.mood = Math.max(0, Math.min(100, a.ctx.mood + moodDelta)); a.record.trustEnd = a.ctx.mood; a.record.trustMin = Math.min(a.record.trustMin, a.ctx.mood); bus.emit('call:mood', { mood: a.ctx.mood, delta: moodDelta }); }
  if (suspicionDelta) { a.ctx.suspicion = Math.max(0, Math.min(100, a.ctx.suspicion + suspicionDelta)); bus.emit('call:suspicion', { suspicion: a.ctx.suspicion, delta: suspicionDelta }); }
  if (a.ctx.mood <= 4) hangUp('caller');
}

function push(who: Line['who'], text: string, delta?: number): Line {
  const l: Line = { who, text, t: Date.now() };
  if (delta !== undefined) (l as Line & { delta: number }).delta = delta;
  active?.ctx.lines.push(l);
  bus.emit('call:line', l);
  return l;
}

function deliver(turn: Turn): void {
  if (!active || active.status !== 'live') return;
  const a = active;
  const text = turn.say;
  push('caller', text);
  if (turn.moodDelta) {
    a.ctx.mood = Math.max(0, Math.min(100, a.ctx.mood + turn.moodDelta));
    a.record.trustEnd = a.ctx.mood;
    a.record.trustMin = Math.min(a.record.trustMin, a.ctx.mood);
    bus.emit('call:mood', { mood: a.ctx.mood, delta: turn.moodDelta, intent: turn.intent });
    if (turn.moodDelta > 0) a.patienceUntil += 10_000;
    // the original snaps your webcam at the worst line and shows it in the review: your real webcam when the
    // Camera app has it on, else your character from the clip-on camera
    if (turn.moodDelta <= -8 && !a.snapped) {
      const mine = a.ctx.lines.filter((l) => l.who === 'you').pop();
      const url = cameraFrame() ?? snapshotSelf();
      if (url && mine) { a.snapped = true; addClip({ kind: 'snapshot', dataUrl: url, caption: 'Caught on camera at the worst moment', auto: true, line: mine.text }); }
    }
  }
  if (turn.suspicionDelta) {
    a.ctx.suspicion = Math.max(0, Math.min(100, a.ctx.suspicion + turn.suspicionDelta));
    a.record.suspicionMax = Math.max(a.record.suspicionMax ?? 0, a.ctx.suspicion);
  }
  if (turn.suspicionDelta || turn.challenge || turn.intent === 'busted') bus.emit('call:suspicion', { suspicion: a.ctx.suspicion, delta: turn.suspicionDelta ?? 0, intent: turn.intent });
  if (turn.intent === 'busted') a.record.busted = true;
  if (turn.gives) {
    a.ctx.given[turn.gives.kind] = turn.gives.value;
    bus.emit('call:gives', turn.gives);
  }
  // the voice reads codes slowly
  let spoken = text;
  if (turn.gives) spoken = text.split(turn.gives.value).join(spokenDigits(turn.gives.value));
  const estimate = Math.min(7000, Math.max(1200, spoken.length * 55));
  bus.emit('call:speaking', { ms: estimate });
  speak(spoken, voiceFor(a.caller, a.ctx.mood), a.caller.id);
  if (turn.virus) {
    a.record.virus = true;
    setTimeout(() => startVirus('inspector'), 800);
  }
  if (turn.hangUp) {
    clearTimeout(byeTimer);
    byeTimer = setTimeout(() => hangUp('caller'), Math.min(estimate, 4500));
  }
}

export async function sendLine(text: string): Promise<void> {
  if (!active || active.status !== 'live' || active.busy) return;
  const t = text.trim();
  if (!t) return;
  const a = active;
  a.busy = true;
  a.lastInput = Date.now();
  const before = a.ctx.mood;
  const mine = push('you', t);
  bus.emit('call:thinking', true);
  let turn: Turn;
  try {
    turn = await getBrain().respond(a.ctx, t);
  } catch (e) {
    console.warn('brain failed, using the scripted one', e);
    turn = await scriptedBrain.respond(a.ctx, t);
  }
  a.busy = false;
  if (active !== a || a.status !== 'live') return;
  a.ctx.turn++;
  bus.emit('call:thinking', false);
  deliver(turn);
  (mine as Line & { delta: number }).delta = a.ctx.mood - before;
}

function patienceTick(): void {
  const now = Date.now();
  // the caller on hold loses patience twice as fast, then hangs up on the music
  if (held && held.status === 'live') {
    held.patienceUntil -= 1000;
    if (now > held.patienceUntil) {
      const h = held;
      finish(h, 'caller');
      toast(`${h.caller.name.split(',')[0]} got tired of the hold music and hung up.`, 'danger', 4000);
    }
  }
  if (!active || active.status !== 'live') { if (!held) clearInterval(tickTimer); return; }
  const a = active;
  if (now - a.lastInput > 28_000 && !a.busy) {
    a.lastInput = now;
    a.patienceUntil -= 15_000;
    deliver({ say: own(a, 'idle'), moodDelta: -2, mood: 'calm', intent: 'idle' });
    return;
  }
  if (now > a.patienceUntil && !a.busy) {
    deliver({ say: own(a, 'bye_polite'), moodDelta: 0, mood: 'calm', hangUp: true, intent: 'patience' });
  }
}

/** a stock line in this caller's voice: their own table first, else the archetype's, coloured by how they talk */
function own(a: ActiveCall, r: 'idle' | 'bye_polite' | 'happy' | 'withdraw'): string {
  const mine = a.caller.lines?.[r];
  if (mine && mine.length) return mine[Math.floor(Math.random() * mine.length)].replace(/\{name\}/g, a.caller.name).replace(/\{you\}/g, a.ctx.claimedName ?? a.ctx.playerName);
  return stylize(a.caller, line(a.caller.archetype, r).replace(/\{name\}/g, a.caller.name).replace(/\{you\}/g, a.ctx.claimedName ?? a.ctx.playerName));
}

/** the common end of a call, live or held */
function finish(a: ActiveCall, by: NonNullable<CallRecord['hungUpBy']>): void {
  const wasActive = a === active;
  const wasHeld = a === held;
  if (wasActive) { clearTimeout(withdrawTimer); clearTimeout(byeTimer); stopSpeaking(); active = null; setTag(); }
  if (wasHeld) { held = null; sfx.hold(false); }
  a.status = 'ended';
  a.record.endedAt = Date.now();
  a.record.hungUpBy = by;
  a.record.trustEnd = a.ctx.mood;
  sfx.hangup();
  const earned = a.record.payouts.reduce((s, p) => s + p.amount, 0);
  const nextIn = by === 'shift' ? 0 : held || queued ? 1500 : 5000 + Math.random() * 5000;
  bus.emit(wasHeld ? 'call:held-ended' : 'call:ended', { by, record: a.record, nextIn, earned, duration: a.record.endedAt - a.record.startedAt, mood: a.ctx.mood, caller: a.caller, held: wasHeld });
  if (wasActive && by !== 'shift') { if (held) resumeHeld(); else scheduleNext(nextIn); }
}

export function hangUp(by: 'you' | 'caller' | 'shift'): void {
  if (by === 'shift') {
    clearInterval(ringTimer); clearTimeout(missTimer); clearInterval(tickTimer); clearTimeout(resumeTimer);
    if (held) finish(held, 'shift');
  }
  if (!active) return;
  const a = active;
  clearInterval(ringTimer);
  clearTimeout(missTimer);
  if (!held || by === 'shift') clearInterval(tickTimer);
  stopSpeaking();
  // hanging up on a ringing phone is a decline: the dialer must keep going
  if (a.status === 'ringing') { active = null; setTag(); bus.emit('call:missed', a.caller); if (by !== 'shift') { if (held) resumeHeld(); else scheduleNext(2500 + Math.random() * 2500); } return; }
  finish(a, by);
}

export interface ClaimResult { ok: boolean; reason?: string; amount?: number; scam?: ScamId }

// An app hands in what the player typed. Pays fixed/budget/unit products at once; rounds and
// scratch cards pay through payOut() when their own mini-game ends.
export function claim(kind: GiveKind, typed: string): ClaimResult {
  if (!active || active.status !== 'live') return { ok: false, reason: 'No caller on the line.' };
  const a = active;
  const scam = scamForKind(kind);
  if (scam.id === 'moon' && moonSoldOut()) return { ok: false, reason: 'The Moon is sold out today. It is on the whiteboard.' };
  if (a.paid.has(scam.id)) return { ok: false, reason: 'Already done on this call.' };
  const given = a.ctx.given[kind];
  if (!given) return { ok: false, reason: 'Ask the caller for it first. Check the Playbook if unsure.' };
  if (!matches(kind, typed, given)) { sfx.bad(); return { ok: false, reason: 'That is not what they said. Read the transcript again.' };
  }
  let amount = 0;
  const p = perks();
  if (scam.payout === 'fixed') amount = Math.round((scam.fixed ?? 0) * mutatorFixed());
  else if (scam.payout === 'budget') amount = Math.round(a.caller.budget * (a.caller.vip ? p.vipBudget : 1) * mutatorBudget());
  else if (scam.payout === 'units') amount = parseInt(given, 10) * (scam.id === 'shadow' ? 45 : 60);
  if (a.caller.vip && scam.payout === 'fixed') amount *= p.vipFixed; // a celebrity pays celebrity prices (more so for a Senior Agent)
  if (amount > 0) payOut(scam.id, amount);
  else a.paid.add(scam.id);
  return { ok: true, amount, scam: scam.id };
}

export function payOut(scam: ScamId, amount: number): void {
  const a = active;
  addMoney(amount, scam);
  sfx.cash();
  floatMoney(amount);
  if (!a || a.status !== 'live') return;
  a.paid.add(scam);
  a.record.payouts.push({ scam, amount });
  bus.emit('call:paid', { scam, amount });
  setTimeout(() => {
    if (active !== a || a.status !== 'live') return;
    if (a.paid.size >= 2) deliver({ say: own(a, 'happy') + ' ' + own(a, 'bye_polite'), moodDelta: 4, mood: 'happy', hangUp: true, intent: 'done' });
    else deliver({ say: own(a, 'happy'), moodDelta: 4, mood: 'happy', intent: 'happy' });
  }, 700);
}

export function roundLost(reason: string): void {
  toast(reason, 'danger');
  sfx.bad();
}

// Bean Coin: the caller gets nervous during the round. Reassure them within 8 s or they pull out.
export function armWithdraw(onPull: () => void): () => void {
  clearTimeout(withdrawTimer);
  const a = active;
  withdrawTimer = setTimeout(() => {
    if (!a || active !== a || a.status !== 'live') return;
    a.ctx.withdrawPending = true;
    deliver({ say: own(a, 'withdraw'), moodDelta: -3, mood: 'angry', intent: 'withdraw' });
    bus.emit('call:withdraw');
    const check = setTimeout(() => { if (active === a && a.ctx.withdrawPending) { a.ctx.withdrawPending = false; onPull(); } }, 8000);
    withdrawTimer = check;
  }, 8000 + Math.random() * 8000);
  return () => clearTimeout(withdrawTimer);
}
