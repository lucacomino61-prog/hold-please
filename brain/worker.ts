// Hold Please — caller brain proxy. A Cloudflare Worker that keeps every API key server-side and gives the game a
// chain of live brains, many models behind many keys, tried in order until one answers:
//   cf          Workers AI (no key, the account's 10,000 free Neurons a day, then $0.011 per 1,000). Models CF_MODELS.
//   <providers> any number of OpenAI-compatible APIs with free tiers — Groq, OpenRouter, Gemini's OpenAI endpoint… —
//               listed in the CHAT_PROVIDERS var (name, url, models, and the NAME of the secret that holds the key).
//               A provider whose secret is missing is skipped; one that answers 429/401/402/403 rests for a while,
//               a model that answers 400/404/5xx rests on its own.
//   anthropic   Claude through the Messages API (secret ANTHROPIC_API_KEY), last in the chain and on its own on request.
// A request may carry a "seed" (the game sends the caller's id): the chain then starts at a model chosen by that
// seed, so every caller keeps one voice for the whole call and the calls spread over all the free models and keys.
// Routes: GET /health · POST /v1/chat {provider: auto|cf|chat|anthropic, model?, seed?, system, messages, max_tokens?}
//         → {text, provider, model, tried} · POST /v1/messages = the raw Anthropic passthrough kept for the older client
//         · POST /v1/stt {audio: base64 WAV/MP3/WebM, lang?: en|sq|it} → {text}: the player's voice through Whisper
//           large-v3-turbo on Workers AI ($0.000513 an audio minute), for browsers without speech recognition.
//   dev:    npm run brain          (brain/.dev.vars holds the secrets; the AI binding runs remotely, logged in)
//   deploy: npm run brain:deploy   then  npx wrangler secret put <SECRET_NAME> -c brain/wrangler.jsonc  per key

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

export interface Env {
  ANTHROPIC_API_KEY?: string;
  CHAT_PROVIDERS?: string;   // JSON: [{"name":"groq","url":"…/chat/completions","models":["…"],"secret":"GROQ_API_KEY"}, …]
  CHAT_API_KEY?: string;     // the older single-provider form, still honoured
  CHAT_API_URL?: string;
  CHAT_MODEL?: string;
  CF_MODELS?: string;        // comma-separated Workers AI models callers are spread over (the good ones)
  CF_MORE?: string;          // comma-separated Workers AI models used only when every preferred one failed or rests
  CF_MODEL?: string;         // the older single-model form, still honoured (goes first)
  ALLOWED_ORIGIN?: string;
  AI?: AiBinding;
}

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };
type Want = 'auto' | 'cf' | 'chat' | 'anthropic';
interface ChatProvider { name: string; url: string; models: string[]; more: string[]; secret: string }

const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
// measured 2026-10-19 on the game's own prompt (scratchpad compare-models.mjs): gpt-oss-20b 13/13, valid JSON every
// turn, ~2.8 s, ~$0.25 per 1,000 turns; Llama 3.3 70B 10/13 at twice the price; the 3B/8B Llamas break the JSON now and then
const DEFAULT_CF_MODELS = ['@cf/openai/gpt-oss-20b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fp8-fast'];
const DEFAULT_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_CHAT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const MAX_TOKENS = 400;
const PER_MINUTE = 40;
const PER_DAY = 600; // per IP, per isolate: a soft cap so one browser cannot eat the whole free allocation
const REST_RATE_LIMIT = 10 * 60_000;  // a provider that said 429 is left alone this long
const REST_BROKEN = 60 * 60_000;      // out of credit, bad key, or a model that errors

const minute = new Map<string, { n: number; t: number }>();
const day = new Map<string, { n: number; t: number }>();
const resting = new Map<string, number>(); // "provider" or "provider:model" → timestamp until which it is skipped

function limited(ip: string): string | null {
  const now = Date.now();
  const m = minute.get(ip) ?? { n: 0, t: now };
  if (now - m.t > 60_000) { m.n = 0; m.t = now; }
  m.n++; minute.set(ip, m);
  if (m.n > PER_MINUTE) return 'rate limited';
  const d = day.get(ip) ?? { n: 0, t: now };
  if (now - d.t > 86_400_000) { d.n = 0; d.t = now; }
  d.n++; day.set(ip, d);
  if (d.n > PER_DAY) return 'daily limit';
  return null;
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

function fail(message: string, status: number): Error & { status: number } { return Object.assign(new Error(message), { status }); }
const rest = (name: string, ms: number) => resting.set(name, Date.now() + ms);
const isResting = (name: string) => (resting.get(name) ?? 0) > Date.now();
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const csv = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
/** preferred Workers AI models (callers are spread over these) and the rest (fallbacks only) */
function cfModels(env: Env): { preferred: string[]; more: string[] } {
  const listed = csv(env.CF_MODELS);
  const preferred = [...new Set([...(env.CF_MODEL ? [env.CF_MODEL] : []), ...(listed.length ? listed : DEFAULT_CF_MODELS)])];
  const more = [...new Set(csv(env.CF_MORE))].filter((m) => !preferred.includes(m));
  return { preferred, more };
}

function providers(env: Env): ChatProvider[] {
  let list: ChatProvider[] = [];
  if (env.CHAT_PROVIDERS) {
    try {
      const raw = JSON.parse(env.CHAT_PROVIDERS) as (Partial<ChatProvider> & { model?: string })[];
      const strs = (a: unknown): string[] => (Array.isArray(a) ? a : []).filter((m): m is string => typeof m === 'string' && !!m);
      list = raw
        .filter((p) => !!p && typeof p.name === 'string' && typeof p.url === 'string' && typeof p.secret === 'string')
        .map((p) => { const models = [...strs(p.models), ...(typeof p.model === 'string' ? [p.model] : [])]; return { name: p.name!, url: p.url!, secret: p.secret!, models, more: strs(p.more).filter((m) => !models.includes(m)) }; })
        .filter((p) => p.models.length > 0);
    } catch { list = []; }
  }
  if (!list.length && env.CHAT_API_KEY) list = [{ name: 'chat', url: env.CHAT_API_URL || DEFAULT_CHAT_URL, models: [env.CHAT_MODEL || DEFAULT_CHAT_MODEL], more: [], secret: 'CHAT_API_KEY' }];
  return list;
}
const secretOf = (env: Env, p: ChatProvider): string => String((env as unknown as Record<string, unknown>)[p.secret] ?? '');

function textOf(r: unknown): string {
  if (typeof r === 'string') return r;
  const o = (r ?? {}) as Record<string, unknown>;
  if (typeof o.response === 'string') return o.response;
  if (typeof o.output_text === 'string') return o.output_text;
  // the Responses-API shape (gpt-oss): output[] → message → content[] → text
  if (Array.isArray(o.output)) {
    for (const item of o.output as Record<string, unknown>[]) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        const t = (item.content as Record<string, unknown>[]).map((c) => (typeof c.text === 'string' ? c.text : '')).join('');
        if (t) return t;
      }
    }
  }
  const choices = o.choices as { message?: { content?: string } }[] | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  const content = o.content as { type: string; text?: string }[] | undefined;
  if (Array.isArray(content)) return content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  return '';
}

// thinking models wrap their reasoning in <think>…</think>; the caller never says that part out loud
const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^<think>[\s\S]*$/g, '').trim();

async function runCf(env: Env, m: string, system: string, messages: Msg[], maxTokens: number): Promise<string> {
  if (!env.AI) throw fail('no Workers AI binding', 503);
  if (isResting('cf') || isResting('cf:' + m)) throw fail('resting', 503);
  const all: Msg[] = [{ role: 'system', content: system }, ...messages];
  // gpt-oss reasons before it answers and the reasoning counts against the output budget: give it room, or the
  // long game prompt leaves nothing for the spoken line
  const input: Record<string, unknown> = m.includes('gpt-oss')
    ? { input: all, reasoning: { effort: 'low' }, max_output_tokens: maxTokens + 600 }
    : { messages: all, max_tokens: maxTokens, temperature: 0.9 };
  try {
    return stripThinking(textOf(await env.AI.run(m, input)));
  } catch (e) {
    // out of Neurons for the day: every Workers AI model rests; otherwise just this model is down for a bit
    const msg = String((e as Error)?.message ?? e);
    if (/quota|limit|exceed|neuron|429/i.test(msg)) rest('cf', REST_RATE_LIMIT); else rest('cf:' + m, 5 * 60_000);
    throw fail(msg.slice(0, 120), 502);
  }
}

async function runProvider(env: Env, p: ChatProvider, m: string, system: string, messages: Msg[], maxTokens: number): Promise<string> {
  const key = secretOf(env, p);
  if (!key) throw fail('no key', 503);
  if (isResting(p.name) || isResting(`${p.name}:${m}`)) throw fail('resting', 503);
  const r = await fetch(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-title': 'Hold Please', 'http-referer': env.ALLOWED_ORIGIN || 'https://hold-please.pages.dev' },
    body: JSON.stringify({ model: m, messages: [{ role: 'system', content: system }, ...messages], max_tokens: maxTokens, temperature: 0.9 }),
  });
  if (!r.ok) {
    if (r.status === 429) rest(p.name, REST_RATE_LIMIT);                                  // the whole key is throttled
    else if (r.status === 401 || r.status === 402 || r.status === 403) rest(p.name, REST_BROKEN); // bad key or no credit
    else rest(`${p.name}:${m}`, REST_BROKEN);                                              // this model only
    throw fail('HTTP ' + r.status, 502);
  }
  return stripThinking(textOf(await r.json()));
}

async function runAnthropic(env: Env, m: string, system: string, messages: Msg[], maxTokens: number, beta: string | null): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw fail('no Anthropic key', 503);
  if (isResting('anthropic')) throw fail('resting', 503);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': beta || 'server-side-fallback-2026-07-01' },
    body: JSON.stringify({ model: m, max_tokens: maxTokens, system, messages: messages.filter((x) => x.role !== 'system'), output_config: { effort: 'low' }, fallbacks: 'default' }),
  });
  if (!r.ok) {
    if (r.status === 429) rest('anthropic', REST_RATE_LIMIT);
    else if (r.status === 401 || r.status === 402 || r.status === 403 || r.status >= 500) rest('anthropic', REST_BROKEN);
    throw fail('HTTP ' + r.status, 502);
  }
  const data = await r.json() as { stop_reason?: string };
  if (data.stop_reason === 'refusal') throw fail('refusal', 502);
  return textOf(data);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors: Record<string, string> = {
      'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
      'access-control-allow-headers': 'content-type,anthropic-version,anthropic-beta',
      'access-control-allow-methods': 'POST,GET,OPTIONS',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const list = providers(env);
    const cfs = cfModels(env);
    if (url.pathname === '/health') {
      const restingModels = [...resting.entries()].filter(([, t]) => t > Date.now()).map(([k]) => k);
      return json({
        ok: true, key: !!env.ANTHROPIC_API_KEY, ai: !!env.AI, chat: list.some((p) => !!secretOf(env, p)), stt: !!env.AI,
        models: { cf: cfs.preferred, cfMore: cfs.more, chat: list.filter((p) => !!secretOf(env, p)).flatMap((p) => p.models.map((m) => `${p.name}:${m}`)), anthropic: ANTHROPIC_MODELS },
        // names only, never values: which keyed providers are configured, whether their secret is set, and who is resting
        providers: list.map((p) => ({ name: p.name, models: p.models, more: p.more, key: !!secretOf(env, p), resting: isResting(p.name) })),
        count: { free: cfs.preferred.length + cfs.more.length + list.filter((p) => !!secretOf(env, p)).reduce((n, p) => n + p.models.length + p.more.length, 0), configured: cfs.preferred.length + cfs.more.length + list.reduce((n, p) => n + p.models.length + p.more.length, 0) },
        resting: restingModels,
      }, 200, cors);
    }
    // the player's voice → text, for browsers without their own speech recognition (Firefox, Safari)
    if (req.method === 'POST' && url.pathname === '/v1/stt') {
      const lim = limited(req.headers.get('cf-connecting-ip') || 'local');
      if (lim) return json({ error: lim }, 429, cors);
      if (!env.AI) return json({ error: 'no Workers AI binding' }, 503, cors);
      let sb: { audio?: unknown; lang?: unknown };
      try { sb = await req.json() as typeof sb; } catch { return json({ error: 'bad json' }, 400, cors); }
      const audio = typeof sb.audio === 'string' ? sb.audio : '';
      if (!audio) return json({ error: 'no audio' }, 400, cors);
      if (audio.length > 1_600_000) return json({ error: 'too long' }, 413, cors); // about 36 s of 16 kHz speech
      const language = ['en', 'sq', 'it'].includes(String(sb.lang)) ? String(sb.lang) : undefined;
      try {
        // Whisper now and then hangs for most of a minute: give up after 12 s so the player can simply try again
        const r = await Promise.race([
          env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, vad_filter: true, ...(language ? { language } : {}) }),
          new Promise<never>((_, rej) => setTimeout(() => rej(fail('speech recognition timed out', 504)), 12_000)),
        ]) as { text?: unknown };
        return json({ text: String(r?.text ?? '').trim() }, 200, cors);
      } catch (e) {
        const err = e as { message?: string; status?: number };
        return json({ error: String(err?.message ?? e).slice(0, 160) }, err?.status === 504 ? 504 : 502, cors);
      }
    }
    if (req.method !== 'POST' || (url.pathname !== '/v1/chat' && url.pathname !== '/v1/messages')) return new Response('Not found', { status: 404, headers: cors });

    const ip = req.headers.get('cf-connecting-ip') || 'local';
    const lim = limited(ip);
    if (lim) return json({ error: lim }, 429, cors);

    let body: Record<string, unknown>;
    try { body = await req.json() as Record<string, unknown>; } catch { return json({ error: 'bad json' }, 400, cors); }
    if (JSON.stringify(body).length > 80_000) return json({ error: 'too large' }, 413, cors);
    const maxTokens = Math.min(MAX_TOKENS, Number(body.max_tokens) || 300);

    // the old route: the Anthropic body goes straight through
    if (url.pathname === '/v1/messages') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'no key configured' }, 503, cors);
      if (!ANTHROPIC_MODELS.includes(String(body.model))) body.model = 'claude-opus-5-5';
      body.max_tokens = maxTokens;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': req.headers.get('anthropic-beta') || 'server-side-fallback-2026-07-01' },
        body: JSON.stringify(body),
      });
      return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
    }

    // the new route: one shape for every provider, and a chain of models for "auto"
    const system = String(body.system ?? '').slice(0, 12_000);
    const messages = (Array.isArray(body.messages) ? body.messages : []).filter((m): m is Msg => !!m && typeof m === 'object' && typeof (m as Msg).content === 'string' && ((m as Msg).role === 'user' || (m as Msg).role === 'assistant')).slice(-24);
    if (!messages.length) return json({ error: 'no messages' }, 400, cors);
    const want = (['auto', 'cf', 'chat', 'anthropic'].includes(String(body.provider)) ? String(body.provider) : 'auto') as Want;
    const asked = typeof body.model === 'string' ? body.model.trim() : '';
    const seed = typeof body.seed === 'string' ? body.seed : '';
    const beta = req.headers.get('anthropic-beta');

    type Step = { name: string; model: string; run: () => Promise<string> };
    const cfStep = (m: string): Step => ({ name: 'cf', model: m, run: () => runCf(env, m, system, messages, maxTokens) });
    const keyedStep = (p: ChatProvider, m: string): Step => ({ name: p.name, model: m, run: () => runProvider(env, p, m, system, messages, maxTokens) });
    const known = (m: string) => cfs.preferred.includes(m) || cfs.more.includes(m);
    // a model the player asked for by name goes first in its own family (only names the config knows)
    const cfPreferred = asked.startsWith('@cf/') && known(asked) ? [asked, ...cfs.preferred.filter((m) => m !== asked)] : cfs.preferred;
    const cfMore = cfs.more.filter((m) => m !== asked);
    const withKey = list.filter((p) => !!secretOf(env, p));
    const keyedPreferred = (ps: ChatProvider[]): Step[] => ps.flatMap((p) => {
      const ms = asked && !asked.startsWith('@cf/') && !asked.startsWith('claude-') ? [asked, ...p.models.filter((m) => m !== asked)] : p.models;
      return ms.map((m) => keyedStep(p, m));
    });
    const keyedMore = (ps: ChatProvider[]): Step[] => ps.flatMap((p) => p.more.filter((m) => m !== asked).map((m) => keyedStep(p, m)));
    const claudeModel = ANTHROPIC_MODELS.includes(asked) ? asked : 'claude-opus-5-5';
    const claudeStep: Step = { name: 'anthropic', model: claudeModel, run: () => runAnthropic(env, claudeModel, system, messages, maxTokens, beta) };
    const awake = (s: Step) => !isResting(s.name) && !isResting(`${s.name}:${s.model}`);

    let order: Step[];
    if (want === 'cf') order = [...cfPreferred.map(cfStep), ...cfMore.map(cfStep)];
    else if (want === 'chat') order = [...keyedPreferred(list), ...keyedMore(list)];
    else if (want === 'anthropic') order = [claudeStep];
    else {
      // auto: the preferred free models and keys, spread by the seed so each caller keeps one voice; then every other
      // free model as a fallback; Claude only as the last resort
      const preferred = [...cfPreferred.map(cfStep), ...keyedPreferred(withKey)].filter(awake);
      const more = [...cfMore.map(cfStep), ...keyedMore(withKey)].filter(awake);
      const start = preferred.length && seed ? hash(seed) % preferred.length : 0;
      order = [...preferred.slice(start), ...preferred.slice(0, start), ...more, claudeStep];
    }
    if (!order.length) return json({ error: 'no provider configured for ' + want }, 503, cors);

    const tried: string[] = [];
    let last: { message: string; status?: number } = { message: 'no provider' };
    for (const step of order) {
      try {
        const text = await step.run();
        if (!text) { rest(`${step.name}:${step.model}`, 5 * 60_000); throw fail('empty answer', 502); } // a model that says nothing rests a little
        return json({ text, provider: step.name, model: step.model, tried }, 200, cors);
      } catch (e) {
        last = e as { message: string; status?: number };
        tried.push(`${step.name}:${step.model}: ${last.message}`);
        if (tried.length >= 8) break; // enough: the caller is waiting
      }
    }
    return json({ error: last.message, tried }, last.status ?? 502, cors);
  },
};
