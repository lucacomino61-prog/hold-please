// The room client: one WebSocket to a Room on the server (server/src/room.ts), kept alive with pings and brought
// back by itself when it drops. The room's state is mirrored here and announced on the bus; the game logic that
// acts on it lives in coop.ts. Nothing in the game needs this file to run solo.
import { bus, settings } from '../game/state';

export type RoomStatus = 'lobby' | 'break' | 'shift' | 'review';
export interface RoomPlayer { id: string; name: string; shirt: string; seat: number; earned: number; earnedToday: number; here: boolean }
export interface RoomState {
  you: string; code: string; host: string; status: RoomStatus; day: number; quota: number; team: number; earnedToday: number;
  shiftMinutes: number; shiftStartedAt: number | null; shiftEndsAt: number | null; pass: boolean | null; players: RoomPlayer[]; now: number;
}
export interface RoomEvent { kind: 'pay' | 'loss' | 'join' | 'leave' | 'host' | 'note'; id: string; name: string; amount?: number; scam?: string; reason?: string; sub?: string; text?: string }
export interface PublicRoom { code: string; host: string; players: number; status: string; day: number; shiftMinutes: number; at: number }
export interface Pose { id: string; x: number; z: number; yaw: number }
export interface Seat { server: string; code: string; token: string; id: string }
export interface RoomInfo { code: string; status: RoomStatus; day: number; quota: number; players: number; host: string; full: boolean }

const SEAT_KEY = 'hp.room';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
const DEV_SERVER = 'http://127.0.0.1:8790';
/** this long without a socket and the game falls back to local totals */
const DROP_MS = 6000;

/** where the room server lives: the lobby's field, else the build's VITE_HP_SERVER, else the dev server beside Vite */
export function serverUrl(): string {
  const env = (import.meta.env.VITE_HP_SERVER as string | undefined) ?? '';
  const s = settings.roomServer.trim() || env || (import.meta.env.DEV ? DEV_SERVER : '');
  return s.replace(/\/$/, '');
}

export class ServerError extends Error {
  constructor(public status: number, public data: Record<string, unknown> | null) { super(`server ${status}`); }
}

/** a JSON request; an answer outside 2xx throws ServerError (status 0: no connection) */
async function api<T>(base: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ServerError(0, null);
  }
  let data: Record<string, unknown> | null = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new ServerError(res.status, data);
  return data as T;
}

let seat: Seat | null = null;
let ws: WebSocket | null = null;
let current: RoomState | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let dropTimer: ReturnType<typeof setTimeout> | undefined;
/** the server's clock minus ours, from the last state */
let offset = 0;
let live = false;
let dropped = false;

function readSeat(): Seat | null {
  try {
    const s = JSON.parse(localStorage.getItem(SEAT_KEY) || 'null') as Seat | null;
    return s && CODE_RE.test(s.code) && typeof s.token === 'string' && typeof s.server === 'string' ? s : null;
  } catch { return null; }
}
function writeSeat(s: Seat | null): void {
  seat = s;
  try {
    if (s) localStorage.setItem(SEAT_KEY, JSON.stringify(s));
    else localStorage.removeItem(SEAT_KEY);
  } catch { /* the seat lasts for this page */ }
}

function setLive(on: boolean): void {
  if (live === on) return;
  live = on;
  bus.emit('money');
}

/** after a refused connection: does the seat still exist? */
async function seatAlive(s: Seat): Promise<boolean> {
  try {
    await api(s.server, `/room/${s.code}/join`, { token: s.token });
    return true;
  } catch (e) {
    return !(e instanceof ServerError && (e.status === 404 || e.status === 409));
  }
}

function connect(): void {
  if (!seat) return;
  clearTimeout(retryTimer);
  ws?.close();
  const s = seat;
  const socket = new WebSocket(`${s.server.replace(/^http/, 'ws')}/room/${s.code}/ws?token=${s.token}`);
  ws = socket;
  let opened = false;
  socket.onopen = () => {
    opened = true;
    retry = 0;
    clearTimeout(dropTimer);
    dropTimer = undefined;
    setLive(true);
    clearInterval(pingTimer);
    pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('{"t":"ping"}'), 25_000);
    if (dropped) { dropped = false; bus.emit('room:open'); }
  };
  socket.onmessage = (e) => {
    let m: { t?: string };
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (m.t === 'state') {
      const st = m as unknown as RoomState;
      offset = st.now - Date.now();
      current = st;
      bus.emit('room:state', st);
    } else if (m.t === 'ev') bus.emit('room:ev', m as unknown as RoomEvent);
    else if (m.t === 'pos') bus.emit('room:pos', m as unknown as Pose);
    else if (m.t === 'rtc') bus.emit('room:rtc', m as unknown as { from: string; data: unknown });
  };
  socket.onclose = async () => {
    if (ws !== socket) return;
    ws = null;
    clearInterval(pingTimer);
    setLive(false);
    if (!seat) return;
    if (!opened && !(await seatAlive(s))) {
      // refused at the door: the room has gone (a day after it went quiet, or everyone left)
      writeSeat(null);
      current = null;
      bus.emit('room:gone');
      return;
    }
    if (!seat || seat.token !== s.token) return;
    if (!dropped && !dropTimer) dropTimer = setTimeout(() => { dropTimer = undefined; if (!live && seat) { dropped = true; bus.emit('room:drop'); } }, DROP_MS);
    retryTimer = setTimeout(connect, Math.min(10_000, 800 * 2 ** retry++));
  };
}

document.addEventListener('visibilitychange', () => {
  // back on the page with the connection gone: reconnect at once
  if (document.visibilityState === 'visible' && seat && !ws) connect();
});

export const room = {
  get state(): RoomState | null { return current; },
  get seat(): Seat | null { return seat; },
  /** the socket is open: the room's numbers are the truth */
  get live(): boolean { return live; },
  savedSeat(): Seat | null { return readSeat(); },

  async info(code: string): Promise<RoomInfo> {
    return api<RoomInfo>(serverUrl(), `/room/${code}`);
  },

  /** opens a new room and takes the host's seat (public = listed for anyone to join) */
  async host(name: string, shirt: string, shiftMinutes: number, isPublic = false): Promise<void> {
    const server = serverUrl();
    this.leave(false);
    const out = await api<{ code: string; token: string; id: string }>(server, '/room', { name, shirt, shiftMinutes, public: isPublic });
    writeSeat({ server, ...out });
    connect();
  },

  /** the rooms listed publicly on this server */
  async listPublic(): Promise<PublicRoom[]> {
    const out = await api<{ rooms: PublicRoom[] }>(serverUrl(), '/rooms');
    return out.rooms ?? [];
  },

  /** joins a friend's room by its code */
  async join(code: string, name: string, shirt: string): Promise<void> {
    const server = serverUrl();
    this.leave(false);
    const out = await api<{ code: string; token: string; id: string }>(server, `/room/${code}/join`, { name, shirt });
    writeSeat({ server, ...out });
    connect();
  },

  /** comes back to a room this browser was in (the token keeps the seat) */
  async rejoin(s: Seat, name: string, shirt: string): Promise<void> {
    this.leave(false);
    const out = await api<{ code: string; token: string; id: string }>(s.server, `/room/${s.code}/join`, { token: s.token, name, shirt });
    writeSeat({ server: s.server, ...out });
    connect();
  },

  /** leaves the room for good on this browser (tell = also take the name off the floor) */
  leave(tell = true): void {
    if (tell && ws?.readyState === WebSocket.OPEN) { try { ws.send('{"t":"leave"}'); } catch { /* going anyway */ } }
    writeSeat(null);
    bus.emit('room:left');
    const old = ws;
    ws = null;
    old?.close();
    clearTimeout(retryTimer);
    clearTimeout(dropTimer);
    dropTimer = undefined;
    clearInterval(pingTimer);
    current = null;
    dropped = false;
    setLive(false);
  },

  send(m: Record<string, unknown>): boolean {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
  },

  me(): RoomPlayer | null { return current?.players.find((p) => p.id === current!.you) ?? null; },
  others(): RoomPlayer[] { return current ? current.players.filter((p) => p.id !== current!.you) : []; },
  isHost(): boolean { return !!current && current.host === current.you; },
  hostName(): string { return current?.players.find((p) => p.id === current!.host)?.name ?? 'the host'; },
  online(): number { return current ? current.players.filter((p) => p.here).length : 0; },
  /** the server's idea of now */
  now(): number { return Date.now() + offset; },
  /** milliseconds left on the room's shift clock, null when no shift runs */
  shiftLeft(): number | null {
    if (!current || current.status !== 'shift' || !current.shiftEndsAt) return null;
    return Math.max(0, current.shiftEndsAt - this.now());
  },
  /** for the probes: drop the socket as if the network went */
  debugDrop(): void { ws?.close(); },
};
