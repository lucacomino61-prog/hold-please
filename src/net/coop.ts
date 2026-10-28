// Co-op: the glue between the room client and the run. While a room is joined the room's TEAM, quota, day and shift
// clock are the truth: this file mirrors them into the game state, reports what this player earns and loses, moves
// the local run along with the room's days (the host starts, clocks in and moves on; everyone follows), and falls
// back to local totals when the room drops. Solo play never comes through here.
import { addMoney, bus, fmt, resetRun, state } from '../game/state';
import { room, type RoomEvent, type RoomState } from './room';
import { bindFloor, floorWired, unbindFloor } from './floor';
import { toast } from '../ui/toast';
import { abortShift, beginDay, endShift, hideBreak, startRun, startShift } from '../game/day';
import { dismissSheet } from '../ui/report';
import { scamById } from '../game/scams';
import { familySafe } from '../game/modes';

export interface RankRow { id: string; name: string; earned: number; today: number; me: boolean; here: boolean }

let on = false;

/** the room's shared numbers into the local state (the phase is handled separately) */
function mirror(s: RoomState): void {
  const me = s.players.find((p) => p.id === s.you);
  state.team = s.team;
  state.quota = s.quota;
  if (me) state.earnedToday = me.earnedToday;
  state.colleagues = s.players.filter((p) => p.id !== s.you).map((p) => ({ id: p.id, name: p.name, earned: p.earned, shirt: p.shirt, seat: p.seat }));
  bus.emit('money');
}

/** a new day on this browser, on the room's numbers: day one again after a firing resets the whole run */
function newDay(s: RoomState): void {
  abortShift();
  hideBreak();
  dismissSheet();
  if (s.day === 1 && (state.day > 1 || state.phase === 'fired')) resetRun();
  state.day = s.day;
  state.quota = s.quota;
  state.shiftTotal = Math.round(s.shiftMinutes * 60_000);
  state.shiftLeft = state.shiftTotal;
  state.calls = [];
  state.history = [];
  state.virus = false;
  state.strikes = 0;
  state.usedCallers.clear();
  mirror(s);
  beginDay();
}

/** brings the local run to where the room is; the screens the player reads at their own pace call it when done */
function catchUp(): void {
  const s = room.state;
  if (!on || !s || !room.live) return;
  switch (s.status) {
    case 'break':
      if (state.phase !== 'break' || state.day !== s.day) newDay(s);
      break;
    case 'shift':
      if (state.phase === 'shift') break;
      if (state.phase !== 'break' || state.day !== s.day) newDay(s);
      void startShift();
      break;
    case 'review':
      if (state.phase === 'shift') void endShift();
      else if (state.phase === 'break') {
        // never clocked in (joined late): straight to the review with nothing
        hideBreak();
        state.phase = 'shift';
        void endShift();
      }
      break;
    case 'lobby':
      break;
  }
}

/** startRun() is under way (it shows the clock-in desk first); the room is caught up with when it is done */
let starting = false;

function onState(s: RoomState): void {
  mirror(s);
  if (!on) return;
  if (state.phase === 'title') {
    if (starting) return;
    starting = true;
    void startRun().finally(() => { starting = false; catchUp(); });
    return;
  }
  // the review slides and the sheets are read at the player's own pace: a sheet lets go when the room moves on
  if (state.phase === 'review') return;
  if (state.phase === 'unlock' || state.phase === 'fired') {
    if (s.status !== 'review') dismissSheet();
    return;
  }
  catchUp();
}

function onEvent(ev: RoomEvent): void {
  if (!on) return;
  switch (ev.kind) {
    case 'pay': {
      const name = ev.scam ? scamById.get(ev.scam as never)?.name : undefined;
      toast(`${ev.name} closed ${fmt(ev.amount ?? 0)}${name ? ' — ' + name : ''}.`, 'money', 2600);
      break;
    }
    case 'loss':
      toast(`${ev.reason ? ev.reason[0].toUpperCase() + ev.reason.slice(1) : 'Trouble'} at ${ev.name}'s desk: ${fmt(ev.amount ?? 0)} off the team total.`, 'danger', 4000);
      break;
    case 'join':
      toast(`${ev.name} joined the floor.`);
      break;
    case 'leave':
      toast(`${ev.name} left the floor.`);
      break;
    case 'host':
      toast(ev.id === room.state?.you ? 'The host left. You are the host now.' : `${ev.name} is the host now.`);
      break;
    case 'note':
      // a friend finished a shared target, or the host's event reaches the whole floor
      if (ev.sub === 'target') toast(`${ev.name} finished a target: ${ev.text}`, 'money', 3600);
      else if (ev.sub === 'event' && ev.text && ev.id !== room.state?.you) bus.emit('room:event', ev.text);
      else if (ev.sub === 'chat' && ev.text) {
        // family mode masks a friend's swearing here, once, for the Pigeon window and the toast alike
        const name = familySafe(ev.name ?? ''), text = familySafe(ev.text);
        bus.emit('room:chat', { id: ev.id, name, text, me: ev.id === room.state?.you });
        if (ev.id !== room.state?.you && !document.querySelector('.pigeon')) toast(`${name}: ${text}`, 'info', 4000);
      }
      break;
  }
}

bus.on<RoomState>('room:state', onState);
bus.on<RoomEvent>('room:ev', onEvent);
bus.on<{ amount: number; source: string }>('earn', ({ amount, source }) => { if (on && room.live) room.send({ t: 'pay', amount, scam: source }); });
bus.on<{ amount: number; reason: string }>('loss', ({ amount, reason }) => { if (on && room.live) room.send({ t: 'loss', amount, reason }); });
bus.on('room:drop', () => { if (on) toast('Lost the room. Playing on with local totals until it is back.', 'danger', 5000); });
bus.on('room:open', () => { if (on) { toast(`Back in room ${room.state?.code ?? ''}.`, 'money'); catchUp(); } });
bus.on('room:gone', () => {
  if (!on) return;
  on = false;
  unbindFloor();
  toast('The room is gone. Playing on solo.', 'danger', 5000);
  bus.emit('money');
});

export const coop = {
  /** a co-op run is in progress (even while the socket is down) */
  get on(): boolean { return on; },
  /** the socket is open: the room's numbers are the truth */
  get live(): boolean { return on && room.live; },
  code(): string { return room.state?.code ?? room.seat?.code ?? ''; },
  isHost(): boolean { return room.isHost(); },
  hostName(): string { return room.hostName(); },
  online(): number { return room.online(); },
  /** the room's verdict for the last shift, once the clock ran out */
  pass(): boolean | null { return room.state?.pass ?? null; },
  /** the room has gone past the review this browser is still showing */
  movedOn(): boolean { const s = room.state; return on && room.live && !!s && s.status !== 'review'; },
  shiftLeft(): number | null { return on && room.live ? room.shiftLeft() : null; },
  floorWired,

  /** after a reset: the room's day, quota, shift length and colleagues back into the state */
  sync(): void {
    const s = room.state;
    if (!s) return;
    state.day = s.day;
    state.quota = s.quota;
    state.shiftTotal = Math.round(s.shiftMinutes * 60_000);
    state.shiftLeft = state.shiftTotal;
    mirror(s);
  },

  /** the lobby's "Start the day" went through: this browser follows the room from here */
  begin(): void {
    if (on) return;
    on = true;
    bindFloor();
    const s = room.state;
    if (s) onState(s);
  },

  /** the host clocks everyone in; without the room, this browser alone */
  clockIn(): boolean {
    if (on && room.live && room.isHost()) return room.send({ t: 'clockin' });
    return false;
  },

  /** sat down at a desk on the floor: the host starts the shift, the others wait for it */
  sat(): void {
    if (!on || !room.live) { void startShift(); return; }
    if (room.isHost()) { if (!room.send({ t: 'clockin' })) void startShift(); }
    else toast(`Seated. Waiting for ${room.hostName()} to clock everyone in.`);
  },

  /** the host moves on from a review: tomorrow after a pass, day one again after a firing */
  next(): boolean {
    return on && room.live && room.isHost() ? room.send({ t: 'next' }) : false;
  },

  /** off the floor for good on this browser; the game goes on solo with the friends as colleagues */
  leave(): void {
    room.leave(true);
    on = false;
    unbindFloor();
    bus.emit('money');
  },

  /** everyone on the floor, best first */
  ranking(): RankRow[] {
    const s = room.state;
    if (!s) return [];
    return s.players.map((p) => ({ id: p.id, name: p.name, earned: p.earned, today: p.earnedToday, me: p.id === s.you, here: p.here })).sort((a, b) => b.earned - a.earned);
  },

  catchUp,
};

// dev hooks for the probes, on the window.__hp that main.ts creates
if (import.meta.env.DEV) {
  setTimeout(() => {
    const w = window as unknown as { __hp?: Record<string, unknown> };
    if (w.__hp) Object.assign(w.__hp, { coop, room, addMoney, bus });
  }, 0);
}
