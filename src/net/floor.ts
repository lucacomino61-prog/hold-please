// The floor bridge: the other players' names, shirts, desks and positions go to the office (src/world/office.ts,
// which draws them in place of the scripted colleagues), and this player's own desk and steps go to the room at
// about 5 Hz. The office exposes setRemotePlayers() and onLocalPlayer(); until it does, this file does nothing.
import * as officeModule from '../world/office';
import { bus } from '../game/state';
import { room, type Pose, type RoomState } from './room';

export interface RemotePlayer { id: string; name: string; shirt: string; seat: number; x?: number; z?: number; yaw?: number }
export interface LocalPose { seat: number; x: number; z: number; yaw: number }
type OfficeApi = {
  setRemotePlayers?: (players: RemotePlayer[]) => void;
  onLocalPlayer?: (cb: (p: LocalPose) => void) => () => void;
};
const office = officeModule as unknown as OfficeApi;

/** the last step each friend sent */
const poses = new Map<string, Pose>();
let offLocal: (() => void) | null = null;
let unsub: (() => void)[] = [];
let flush: ReturnType<typeof setTimeout> | undefined;
let lastSent = 0;
let lastSeat = -2;
let last = { x: NaN, z: NaN, yaw: NaN };
const SEND_MS = 200;

function push(): void {
  if (!office.setRemotePlayers) return;
  office.setRemotePlayers(
    room.others().map((p) => {
      const q = p.seat < 0 ? poses.get(p.id) : undefined;
      return { id: p.id, name: p.name, shirt: p.shirt, seat: p.seat, ...(q ? { x: q.x, z: q.z, yaw: q.yaw } : {}) };
    }),
  );
}

function schedule(): void {
  if (flush) return;
  flush = setTimeout(() => { flush = undefined; push(); }, 40);
}

function onLocal(p: LocalPose): void {
  if (!room.live) return;
  if (p.seat !== lastSeat) {
    lastSeat = p.seat;
    room.send({ t: 'seat', seat: p.seat });
  }
  if (p.seat >= 0) return; // seated: the desk says where they are
  const now = performance.now();
  if (now - lastSent < SEND_MS) return;
  if (Math.abs(p.x - last.x) < 0.01 && Math.abs(p.z - last.z) < 0.01 && Math.abs(p.yaw - last.yaw) < 0.01) return;
  lastSent = now;
  last = { x: p.x, z: p.z, yaw: p.yaw };
  room.send({ t: 'pos', x: p.x, z: p.z, yaw: p.yaw });
}

export function bindFloor(): void {
  unbindFloor();
  unsub.push(bus.on<RoomState>('room:state', (s) => {
    for (const id of [...poses.keys()]) if (!s.players.some((p) => p.id === id)) poses.delete(id);
    // the room may have moved this player (a desk taken, a new day): the next local report must differ to be sent again
    const me = s.players.find((p) => p.id === s.you);
    if (me) lastSeat = me.seat;
    schedule();
  }));
  unsub.push(bus.on<Pose>('room:pos', (p) => { poses.set(p.id, p); schedule(); }));
  if (office.onLocalPlayer) offLocal = office.onLocalPlayer(onLocal);
  schedule();
}

export function unbindFloor(): void {
  unsub.forEach((f) => f());
  unsub = [];
  offLocal?.();
  offLocal = null;
  poses.clear();
  lastSeat = -2;
  clearTimeout(flush);
  flush = undefined;
  office.setRemotePlayers?.([]);
}

/** whether the office has the avatar hooks yet (for the probes) */
export function floorWired(): boolean { return !!office.setRemotePlayers && !!office.onLocalPlayer; }
