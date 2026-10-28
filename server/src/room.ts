// One floor of Sunrise Customer Care shared by up to eight friends, found by a four-letter code. The room owns what
// the whole team sees — the TEAM total, the quota, the day number and the shift clock — and the host moves the day
// along (start, clock in, next day). Every browser still runs its own calls: a sale is reported here and the new
// total goes back to everyone. Sockets hibernate between messages; positions on the floor are relayed, not stored.

import { DurableObject } from 'cloudflare:workers';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

const DAY = 24 * 3600 * 1000;
const MAX_PLAYERS = 8;
/** desk indices are the office's own (0-based); the floor decides how many there are */
const DESKS = 64;
/** the order free desks are handed out in (the office's 16 desks, 4 rows of 4): the middle rows first, where the
 * Floor Cam looks; 1, 6 and 10 last, because the scripted colleagues sit there and a player knocks them off */
const DESK_ORDER = [5, 9, 2, 13, 14, 4, 8, 0, 3, 7, 11, 12, 15, 1, 6, 10];
const SHIFTS = [3, 5, 10, 15];
/** a single payout can never be more than this (the richest caller has $1,000) */
const MAX_PAY = 5000;
const QUOTAS = [600, 950, 1400, 1950, 2600, 3400, 4300, 5400];
export function quotaFor(day: number): number {
  if (day <= QUOTAS.length) return QUOTAS[day - 1];
  let q = QUOTAS[QUOTAS.length - 1];
  for (let d = QUOTAS.length; d < day; d++) q = Math.round((q * 1.25) / 50) * 50;
  return q;
}

type Status = 'lobby' | 'break' | 'shift' | 'review';

interface Player {
  id: string;
  token: string;
  name: string;
  shirt: string;
  /** desk index on the floor, -1 while standing around */
  seat: number;
  earned: number;
  earnedToday: number;
  joinedAt: number;
  /** when the last connection closed, null while connected */
  left: number | null;
}

interface Game {
  code: string;
  host: string;
  status: Status;
  day: number;
  quota: number;
  team: number;
  earnedToday: number;
  shiftMinutes: number;
  shiftStartedAt: number | null;
  shiftEndsAt: number | null;
  /** the verdict of the last shift, set when the clock runs out */
  pass: boolean | null;
  players: Player[];
  touched: number;
  /** listed in the public lobby (the host's choice when hosting) */
  public?: boolean;
}

export type Joined = { code: string; token: string; id: string } | { error: 'missing' | 'full' | 'taken' | 'bad' };

interface Msg {
  t?: string;
  to?: unknown;
  data?: unknown;
  amount?: unknown;
  scam?: unknown;
  reason?: unknown;
  seat?: unknown;
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
  sub?: unknown;
  text?: unknown;
}

/** a display name: printable, trimmed, at most 24 characters */
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = '';
  for (const ch of v) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c !== 127) s += ch;
  }
  s = s.trim().slice(0, 24);
  return s || null;
}
const SHIRT_RE = /^#[0-9a-fA-F]{6}$/;
const cleanShirt = (v: unknown): string => (typeof v === 'string' && SHIRT_RE.test(v) ? v.toLowerCase() : '#2bb3a3');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class Room extends DurableObject<Env> {
  private game: Game | null | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // a ping is answered without waking the room
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private shiftAllowed(minutes: number): boolean {
    // the local dev server (TEST_SHORT in .dev.vars) lets the probes run shifts of a few seconds
    if (this.env.TEST_SHORT === '1') return minutes >= 0.1 && minutes <= 15;
    return SHIFTS.includes(minutes);
  }

  private async load(): Promise<Game | null> {
    if (this.game === undefined) this.game = (await this.ctx.storage.get<Game>('game')) ?? null;
    return this.game;
  }

  private async store(g: Game) {
    g.touched = Date.now();
    this.game = g;
    await this.ctx.storage.put('game', g);
    await this.schedule(g);
    if (g.public) void this.publish(g);
  }

  /** the public lobby's line for this room (never awaited on the hot path; a lost update is corrected by the next) */
  private async publish(g: Game): Promise<void> {
    try {
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
      const here = g.players.filter((p) => p.left === null).length;
      if (g.status === 'review' && !g.pass) await lobby.remove(g.code);
      else await lobby.upsert({ code: g.code, host: g.players.find((p) => p.id === g.host)?.name ?? '', players: g.players.length, status: g.status, day: g.day, shiftMinutes: g.shiftMinutes, at: Date.now(), ...(here ? {} : {}) });
    } catch (e) {
      console.warn('lobby', e);
    }
  }

  private async unpublish(code: string): Promise<void> {
    try { await this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')).remove(code); } catch { /* the lobby ages it out */ }
  }

  private async schedule(g: Game) {
    // the next thing the room must do by itself: end the shift, or close a day after it went quiet
    const times = [g.touched + DAY];
    if (g.status === 'shift' && g.shiftEndsAt) times.push(g.shiftEndsAt + 20);
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  private byToken = (g: Game, token: unknown): Player | null => (typeof token !== 'string' || !token ? null : g.players.find((p) => p.token === token) ?? null);
  private tokenOf = (ws: WebSocket): string | undefined => (ws.deserializeAttachment() as { token?: string } | null)?.token;

  async create(code: string, name: unknown, shirt: unknown, shiftMinutes: unknown, isPublic?: unknown): Promise<Joined> {
    const g = await this.load();
    if (g && Date.now() - g.touched < DAY) return { error: 'taken' };
    const n = cleanName(name);
    const minutes = num(shiftMinutes) ?? 10;
    if (!n || !this.shiftAllowed(minutes)) return { error: 'bad' };
    const me: Player = { id: hex(4), token: hex(16), name: n, shirt: cleanShirt(shirt), seat: -1, earned: 0, earnedToday: 0, joinedAt: Date.now(), left: null };
    await this.store({
      code,
      host: me.id,
      status: 'lobby',
      day: 1,
      quota: quotaFor(1),
      team: 0,
      earnedToday: 0,
      shiftMinutes: minutes,
      shiftStartedAt: null,
      shiftEndsAt: null,
      pass: null,
      players: [me],
      touched: 0,
      public: isPublic === true,
    });
    return { code, token: me.token, id: me.id };
  }

  /** what a friend sees before joining */
  async info() {
    const g = await this.load();
    if (!g) return null;
    const host = g.players.find((p) => p.id === g.host);
    return { code: g.code, status: g.status, day: g.day, quota: g.quota, players: g.players.length, host: host?.name ?? '', full: g.players.length >= MAX_PLAYERS };
  }

  /** joins the floor, or comes back to it (the token keeps the seat); friends may join on any day */
  async join(name: unknown, shirt: unknown, token: unknown): Promise<Joined> {
    const g = await this.load();
    if (!g) return { error: 'missing' };
    const mine = this.byToken(g, token);
    if (mine) {
      const n = cleanName(name);
      if (n) mine.name = n;
      if (typeof shirt === 'string' && SHIRT_RE.test(shirt)) mine.shirt = shirt.toLowerCase();
      if (g.status === 'shift' && mine.seat < 0) mine.seat = this.freeDesk(g, mine);
      await this.store(g);
      this.broadcast(g);
      return { code: g.code, token: mine.token, id: mine.id };
    }
    if (g.players.length >= MAX_PLAYERS) return { error: 'full' };
    const n = cleanName(name);
    if (!n) return { error: 'bad' };
    const p: Player = { id: hex(4), token: hex(16), name: n, shirt: cleanShirt(shirt), seat: -1, earned: 0, earnedToday: 0, joinedAt: Date.now(), left: Date.now() };
    // someone arriving in the middle of a shift goes straight to a desk
    if (g.status === 'shift') p.seat = this.freeDesk(g, p);
    g.players.push(p);
    await this.store(g);
    this.event(g, { kind: 'join', id: p.id, name: p.name });
    this.broadcast(g);
    return { code: g.code, token: p.token, id: p.id };
  }

  async fetch(req: Request): Promise<Response> {
    const g = await this.load();
    const token = new URL(req.url).searchParams.get('token');
    const me = g && this.byToken(g, token);
    if (!g || !me) return new Response('no seat', { status: 403 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ token });
    me.left = null;
    await this.store(g);
    this.broadcast(g);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private present(g: Game, id: string, except?: WebSocket): boolean {
    return this.ctx.getWebSockets().some((ws) => ws !== except && ws.readyState === 1 && this.byToken(g, this.tokenOf(ws))?.id === id);
  }

  private view(g: Game, you: string, except?: WebSocket) {
    return {
      t: 'state',
      you,
      code: g.code,
      host: g.host,
      status: g.status,
      day: g.day,
      quota: g.quota,
      team: g.team,
      earnedToday: g.earnedToday,
      shiftMinutes: g.shiftMinutes,
      shiftStartedAt: g.shiftStartedAt,
      shiftEndsAt: g.shiftEndsAt,
      pass: g.pass,
      players: g.players.map((p) => ({ id: p.id, name: p.name, shirt: p.shirt, seat: p.seat, earned: p.earned, earnedToday: p.earnedToday, here: this.present(g, p.id, except) })),
      now: Date.now(),
    };
  }

  private sendTo(ws: WebSocket, data: unknown) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* a socket on its way out */
    }
  }

  private broadcast(g: Game, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const p = this.byToken(g, this.tokenOf(ws));
      if (p) this.sendTo(ws, this.view(g, p.id, except));
    }
  }

  /** something that happened, for the toasts; the state follows */
  private event(g: Game, ev: Record<string, unknown>, except?: WebSocket) {
    const data = { t: 'ev', ...ev };
    for (const ws of this.ctx.getWebSockets()) if (ws !== except && this.byToken(g, this.tokenOf(ws))) this.sendTo(ws, data);
  }

  private freeDesk(g: Game, except: Player): number {
    const taken = new Set(g.players.filter((p) => p !== except && p.seat >= 0).map((p) => p.seat));
    const free = DESK_ORDER.find((d) => !taken.has(d));
    if (free !== undefined) return free;
    for (let d = 0; d < DESKS; d++) if (!taken.has(d)) return d;
    return -1;
  }

  private startShift(g: Game, now: number) {
    g.status = 'shift';
    g.shiftStartedAt = now;
    g.shiftEndsAt = now + Math.round(g.shiftMinutes * 60_000);
    g.pass = null;
    // whoever clocked in from the break room gets a desk so the floor cam shows them
    for (const p of g.players) if (p.seat < 0) p.seat = this.freeDesk(g, p);
  }

  private endShift(g: Game) {
    g.status = 'review';
    g.pass = g.team >= g.quota;
    g.shiftEndsAt = null;
  }

  /** the host moves on: the next day after a pass, day one again after a firing */
  private nextDay(g: Game) {
    if (g.pass) {
      g.day++;
      g.quota = quotaFor(g.day);
    } else {
      g.day = 1;
      g.quota = quotaFor(1);
      g.team = 0;
      for (const p of g.players) p.earned = 0;
    }
    g.earnedToday = 0;
    g.pass = null;
    g.shiftStartedAt = null;
    g.shiftEndsAt = null;
    for (const p of g.players) {
      p.earnedToday = 0;
      p.seat = -1;
    }
    g.status = 'break';
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    // game messages are small (400 characters); voice signalling carries a WebRTC offer or answer of a few
    // thousand, so 'rtc' alone may be longer (its own case below caps the relayed data at 20,000)
    if (typeof raw !== 'string' || raw.length > 24_000) return;
    let msg: Msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (raw.length > 400 && msg?.t !== 'rtc') return;
    const g = await this.load();
    if (!g) return ws.close(4004, 'gone');
    const me = this.byToken(g, this.tokenOf(ws));
    if (!me) return ws.close(4003, 'no seat');
    const now = Date.now();
    const host = g.host === me.id;

    switch (msg.t) {
      case 'pos': {
        // where this player stands on the floor: relayed to the others, never stored
        const x = num(msg.x), z = num(msg.z), yaw = num(msg.yaw);
        if (x === null || z === null || yaw === null) return;
        const data = JSON.stringify({ t: 'pos', id: me.id, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 1000) / 1000 });
        for (const other of this.ctx.getWebSockets()) {
          if (other === ws) continue;
          try {
            other.send(data);
          } catch {
            /* leaving */
          }
        }
        return;
      }
      case 'state':
        return this.sendTo(ws, this.view(g, me.id));
      case 'start':
        if (!host || g.status !== 'lobby') return this.sendTo(ws, this.view(g, me.id));
        g.status = 'break';
        break;
      case 'clockin':
        if (!host || g.status !== 'break') return this.sendTo(ws, this.view(g, me.id));
        this.startShift(g, now);
        break;
      case 'seat': {
        const s = num(msg.seat);
        if (s === null) return;
        const want = Math.trunc(s);
        if (want < 0) me.seat = -1;
        else if (want < DESKS) me.seat = g.players.some((p) => p !== me && p.seat === want && p.left === null) ? this.freeDesk(g, me) : want;
        else return;
        break;
      }
      case 'pay': {
        const amount = Math.round(num(msg.amount) ?? 0);
        if (g.status !== 'shift' || amount <= 0 || amount > MAX_PAY) return this.sendTo(ws, this.view(g, me.id));
        g.team += amount;
        g.earnedToday += amount;
        me.earned += amount;
        me.earnedToday += amount;
        this.event(g, { kind: 'pay', id: me.id, name: me.name, amount, scam: typeof msg.scam === 'string' ? msg.scam.slice(0, 16) : '' }, ws);
        break;
      }
      case 'loss': {
        // a raid or an air strike at this player's desk takes from what they brought in today
        const amount = Math.min(Math.round(num(msg.amount) ?? 0), me.earnedToday, g.earnedToday);
        if (g.status !== 'shift' || amount <= 0) return this.sendTo(ws, this.view(g, me.id));
        g.team = Math.max(0, g.team - amount);
        g.earnedToday -= amount;
        me.earned = Math.max(0, me.earned - amount);
        me.earnedToday -= amount;
        this.event(g, { kind: 'loss', id: me.id, name: me.name, amount, reason: typeof msg.reason === 'string' ? msg.reason.slice(0, 40) : '' }, ws);
        break;
      }
      case 'next':
        if (!host || g.status !== 'review') return this.sendTo(ws, this.view(g, me.id));
        this.nextDay(g);
        break;
      case 'note': {
        // a short note for the others, never stored: a target completed, an event the host wants everyone to get
        const sub = typeof msg.sub === 'string' ? msg.sub.slice(0, 16) : '';
        const text = typeof msg.text === 'string' ? msg.text.slice(0, 120) : '';
        if (!sub || !text) return;
        if (sub === 'event' && !host) return;   // only the host's events reach the floor
        this.event(g, { kind: 'note', id: me.id, name: me.name, sub, text }, ws);
        return;
      }
      case 'rtc': {
        // WebRTC signalling for the voice chat: an offer, answer or ICE candidate for one other player, relayed as is
        // (never stored). Each side holds its own microphone; the room only passes notes.
        const to = typeof msg.to === 'string' ? msg.to : '';
        if (!to || to === me.id || msg.data === undefined) return;
        const raw = JSON.stringify(msg.data);
        if (raw.length > 20_000) return;
        const data = JSON.stringify({ t: 'rtc', from: me.id, data: msg.data });
        for (const other of this.ctx.getWebSockets()) {
          if (other === ws || this.byToken(g, this.tokenOf(other))?.id !== to) continue;
          try { other.send(data); } catch { /* leaving */ }
        }
        return;
      }
      case 'leave': {
        g.players = g.players.filter((p) => p !== me);
        if (!g.players.length) {
          if (g.public) await this.unpublish(g.code);
          await this.ctx.storage.deleteAll();
          this.game = null;
          ws.close(1000, 'bye');
          return;
        }
        if (g.host === me.id) g.host = this.pickHost(g);
        this.event(g, { kind: 'leave', id: me.id, name: me.name }, ws);
        await this.store(g);
        this.broadcast(g, ws);
        ws.close(1000, 'bye');
        return;
      }
      default:
        return;
    }
    await this.store(g);
    this.broadcast(g);
  }

  /** the longest-present player takes over when the host goes */
  private pickHost(g: Game): string {
    const here = g.players.filter((p) => p.left === null).sort((a, b) => a.joinedAt - b.joinedAt);
    return (here[0] ?? g.players[0]).id;
  }

  async webSocketClose(ws: WebSocket, code: number) {
    const g = await this.load();
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
    if (!g) return;
    const me = this.byToken(g, this.tokenOf(ws));
    if (!me || this.present(g, me.id, ws)) return;
    me.left = Date.now();
    if (g.host === me.id && g.players.some((p) => p !== me && p.left === null)) {
      g.host = this.pickHost(g);
      const h = g.players.find((p) => p.id === g.host);
      this.event(g, { kind: 'host', id: g.host, name: h?.name ?? '' }, ws);
    }
    await this.store(g);
    this.broadcast(g, ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011);
  }

  async alarm() {
    const g = await this.load();
    if (!g) return;
    const now = Date.now();
    if (g.status === 'shift' && g.shiftEndsAt && now >= g.shiftEndsAt) {
      this.endShift(g);
      await this.store(g);
      this.broadcast(g);
      return;
    }
    if (now - g.touched >= DAY && !this.ctx.getWebSockets().length) {
      if (g.public) await this.unpublish(g.code);
      await this.ctx.storage.deleteAll();
      this.game = null;
      return;
    }
    await this.schedule(g);
  }
}
