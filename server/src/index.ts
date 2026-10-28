// The front door: CORS for the game's own origins, then each request handed to the Room that owns the code.

import { CODE_RE, Room, newCode } from './room';
import { Lobby } from './lobby';

export { Room, Lobby };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function originAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  return env.ORIGINS.split(',').map((o) => o.trim()).includes(origin);
}

function withCors(res: Response, origin: string | null): Response {
  if (!origin) return res;
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', origin);
  out.headers.set('Vary', 'Origin');
  return out;
}

async function body<T>(req: Request, max = 4096): Promise<T | null> {
  const text = await req.text();
  if (text.length > max) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

type JoinBody = { name?: unknown; shirt?: unknown; shiftMinutes?: unknown; token?: unknown; public?: unknown };

async function route(req: Request, url: URL, env: Env): Promise<Response> {
  const parts = url.pathname.split('/').filter(Boolean);

  // the public room list
  if (parts[0] === 'rooms' && parts.length === 1 && req.method === 'GET') {
    const list = await env.LOBBY.get(env.LOBBY.idFromName('lobby')).list();
    return json({ rooms: list });
  }

  if (parts[0] === 'room') {
    if (parts.length === 1 && req.method === 'POST') {
      const b = await body<JoinBody>(req);
      if (!b) return json({ error: 'bad' }, 400);
      // a fresh code: one already in use is drawn again
      for (let i = 0; i < 6; i++) {
        const code = newCode();
        const out = await env.ROOMS.get(env.ROOMS.idFromName(code)).create(code, b.name, b.shirt, b.shiftMinutes, b.public === true);
        if ('error' in out && out.error === 'taken') continue;
        return json(out, 'error' in out ? 400 : 200);
      }
      return json({ error: 'busy' }, 503);
    }
    const code = (parts[1] ?? '').toUpperCase();
    if (!CODE_RE.test(code)) return json({ error: 'missing' }, 404);
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (parts.length === 2 && req.method === 'GET') {
      const info = await room.info();
      return json(info ?? { error: 'missing' }, info ? 200 : 404);
    }
    if (parts[2] === 'join' && req.method === 'POST') {
      const b = await body<JoinBody>(req);
      if (!b) return json({ error: 'bad' }, 400);
      const out = await room.join(b.name, b.shirt, b.token);
      return json(out, 'error' in out ? (out.error === 'missing' ? 404 : out.error === 'full' ? 409 : 400) : 200);
    }
    if (parts[2] === 'ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket' }, 426);
      return room.fetch(req);
    }
    return json({ error: 'missing' }, 404);
  }

  // the play counter: a run started anywhere adds one; the title screen reads the total
  // the challenge boards: POST a score for a key (daily:YYYY-MM-DD, weekly:YYYY-Www), GET the top fifty
  const sc = url.pathname.match(/^\/scores\/([a-z]+:[0-9A-Za-z-]+)$/);
  if (sc) {
    const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
    if (req.method === 'POST') {
      const b = await body<{ id?: unknown; name?: unknown; team?: unknown; personal?: unknown; pass?: unknown }>(req);
      if (!b || typeof b.id !== 'string' || typeof b.name !== 'string' || typeof b.team !== 'number' || typeof b.personal !== 'number') return json({ error: 'bad' }, 400);
      if (b.team < 0 || b.team > 1_000_000 || b.personal < 0 || b.personal > 1_000_000) return json({ error: 'bad' }, 400);
      await lobby.postScore(sc[1], { id: b.id.slice(0, 40), name: b.name, team: Math.round(b.team), personal: Math.round(b.personal), pass: !!b.pass });
      return json({ ok: true });
    }
    return json({ scores: await lobby.scores(sc[1]) });
  }
  // saves that follow a player: one blob per sync code (no account: whoever has the code has the saves).
  // POST {at, data} writes (the newest write wins), GET reads. data is the browser's gzip of its save keys, base64.
  const sv = url.pathname.match(/^\/saves\/([A-HJ-NP-Z2-9]{12})$/);
  if (sv) {
    const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
    if (req.method === 'POST') {
      const b = await body<{ at?: unknown; data?: unknown }>(req, 110_000);
      if (!b || typeof b.data !== 'string' || typeof b.at !== 'number' || !b.data || b.data.length > 100_000) return json({ error: 'bad' }, 400);
      return json(await lobby.putSave(sv[1], Math.round(b.at), b.data));
    }
    const s = await lobby.getSave(sv[1]);
    return json(s ?? { error: 'missing' }, s ? 200 : 404);
  }
  if (url.pathname === '/plays') {
    const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
    return json({ plays: req.method === 'POST' ? await lobby.bump() : await lobby.plays() });
  }
  if (url.pathname === '/') return json({ app: 'hold-please', ok: true });
  return json({ error: 'missing' }, 404);
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const allowed = originAllowed(origin, env);
    if (req.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin!,
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    // only the game's own pages may talk to it (a browser always sends Origin on these requests)
    if (origin && !allowed) return json({ error: 'origin' }, 403);
    let res: Response;
    try {
      res = await route(req, url, env);
    } catch (e) {
      console.error(e);
      res = json({ error: 'server' }, 500);
    }
    if (res.webSocket) return res;
    return withCors(res, allowed ? origin : null);
  },
} satisfies ExportedHandler<Env>;
