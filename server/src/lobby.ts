// The public room list: one singleton object that rooms marked "public" report to on every change, and that the
// game asks for the list. Entries fade out after two hours of silence; full or finished rooms are not listed.

import { DurableObject } from 'cloudflare:workers';

export interface PublicRoom { code: string; host: string; players: number; status: string; day: number; shiftMinutes: number; at: number }

const STALE = 2 * 3600 * 1000;
const MAX = 40;

export class Lobby extends DurableObject<Env> {
  private rooms: Map<string, PublicRoom> | undefined;

  private async load(): Promise<Map<string, PublicRoom>> {
    if (!this.rooms) this.rooms = new Map(Object.entries((await this.ctx.storage.get<Record<string, PublicRoom>>('rooms')) ?? {}));
    return this.rooms;
  }
  private async save(): Promise<void> {
    const now = Date.now();
    for (const [k, r] of this.rooms!) if (now - r.at > STALE) this.rooms!.delete(k);
    await this.ctx.storage.put('rooms', Object.fromEntries(this.rooms!));
  }

  async upsert(r: PublicRoom): Promise<void> {
    const rooms = await this.load();
    rooms.set(r.code, { ...r, at: Date.now() });
    await this.save();
  }

  async remove(code: string): Promise<void> {
    const rooms = await this.load();
    rooms.delete(code);
    await this.save();
  }

  /** how many runs have been started, everywhere, ever (the title screen shows it) */
  async plays(): Promise<number> { return (await this.ctx.storage.get<number>('plays')) ?? 0; }
  async bump(): Promise<number> { const n = ((await this.ctx.storage.get<number>('plays')) ?? 0) + 1; await this.ctx.storage.put('plays', n); return n; }

  /** a challenge board: one row per browser (its best), the top fifty kept */
  async postScore(key: string, e: { id: string; name: string; team: number; personal: number; pass: boolean }): Promise<void> {
    const k = 'scores:' + key.slice(0, 32);
    const list = (await this.ctx.storage.get<(typeof e & { at: number })[]>(k)) ?? [];
    const i = list.findIndex((x) => x.id === e.id);
    const row = { ...e, name: e.name.slice(0, 24), at: Date.now() };
    if (i >= 0) { if (list[i].team >= row.team) return; list[i] = row; } else list.push(row);
    list.sort((a, b) => b.team - a.team || b.personal - a.personal);
    await this.ctx.storage.put(k, list.slice(0, 50));
  }
  async scores(key: string): Promise<unknown[]> { return (await this.ctx.storage.get<unknown[]>('scores:' + key.slice(0, 32))) ?? []; }

  /** saves that follow a player (save-sync.ts): one blob per sync code; an older write never replaces a newer one */
  async putSave(code: string, at: number, data: string): Promise<{ ok: boolean; at: number }> {
    const k = 'save:' + code;
    const cur = await this.ctx.storage.get<{ at: number; data: string; seen: number }>(k);
    if (cur && cur.at > at) return { ok: false, at: cur.at };
    await this.ctx.storage.put(k, { at, data, seen: Date.now() });
    return { ok: true, at };
  }
  async getSave(code: string): Promise<{ at: number; data: string } | null> {
    const s = await this.ctx.storage.get<{ at: number; data: string; seen: number }>('save:' + code);
    return s ? { at: s.at, data: s.data } : null;
  }

  /** open rooms with a seat free, newest first */
  async list(): Promise<PublicRoom[]> {
    const rooms = await this.load();
    const now = Date.now();
    return [...rooms.values()].filter((r) => now - r.at <= STALE && r.players < 8).sort((a, b) => b.at - a.at).slice(0, MAX);
  }
}
