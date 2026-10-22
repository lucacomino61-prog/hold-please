# Deploying Hold Please to Cloudflare

Three pieces, in this order. Nothing here runs until Luca says "deploy".

| Piece | What | Where it lands |
| --- | --- | --- |
| Brain proxy | `brain/worker.ts`, Worker `hold-please-brain` | `https://hold-please-brain.<account>.workers.dev` |
| The game | `dist/` from `npm run build`, Pages project `hold-please` | `https://hold-please.pages.dev` |
| Co-op server | `server/`, Worker `hold-please-server` + Durable Object `Room` | `https://hold-please-server.<account>.workers.dev` |

`<account>` is the account's workers.dev subdomain (the Shah server lives on `lucacomino-old.workers.dev`; the
deploy output prints the real URL). The account is "Lucacomino61@gmail.com's Account" (ID `ec49d1d76852d91680932a39d6a351ab`,
`npx wrangler whoami`). The Pages name `hold-please` was free on 2026-10-19 (the host did not resolve).

Everything runs from the project root with `npx wrangler` (wrangler is not in `node_modules`; npx has 4.151.1
cached). All of it is Luca's account: the browser login is reused, nothing is pasted.

## 0. Preconditions

```bash
npm run build
```

must end with `✓ built` and exit 0 (2026-10-19: 51 modules, 767 kB JS, 50 kB CSS, 1.2 MB in `dist/`).
`npx wrangler whoami` must name the account. On this network the token refresh to
`dash.cloudflare.com` times out now and then; it is not a lost login, retry every ~30 s until it answers
(see the Shah notes: four timeouts, then through).

## 1. Brain proxy

```bash
npm run brain:deploy
```

(= `npx wrangler deploy -c brain/wrangler.jsonc`). The output prints the Worker URL. The Worker binds Workers AI
(`"ai": { "binding": "AI" }` in `brain/wrangler.jsonc`): the free brain works the moment it is deployed, no key,
on the account's 10,000 free Neurons a day. Claude is optional on top. If wanted, the key, typed by
Luca into the prompt, never printed or pasted into a file:

```bash
npx wrangler secret put ANTHROPIC_API_KEY -c brain/wrangler.jsonc
```

More free keys, one per provider, each as a secret of the name listed in `CHAT_PROVIDERS` (`brain/wrangler.jsonc`):

```bash
npx wrangler secret put GROQ_API_KEY -c brain/wrangler.jsonc
npx wrangler secret put GEMINI_API_KEY -c brain/wrangler.jsonc
npx wrangler secret put OPENROUTER_API_KEY -c brain/wrangler.jsonc
```

Check: `curl https://hold-please-brain.<account>.workers.dev/health` → `ok`, `ai`, and `providers[].key` true for every
secret that is set (names only, never values).

Lock the proxy to the game's origin once the Pages origin is known (`https://hold-please.pages.dev`): add to
`brain/wrangler.jsonc`

```jsonc
"vars": { "ALLOWED_ORIGIN": "https://hold-please.pages.dev" }
```

and run `npm run brain:deploy` again. Without the var the Worker answers any origin (`*`). Local `npm run brain`
keeps answering the dev origins if `brain/.dev.vars` carries an empty `ALLOWED_ORIGIN=` line (`.dev.vars`
overrides `vars` in dev; an empty value falls back to `*`). Preview deployments
(`https://<hash>.hold-please.pages.dev`) are not on the list, so Claude callers only work on the production URL.

## 2. The game on Pages

Put the Worker URL in `.env.production`:

```
VITE_BRAIN_URL=https://hold-please-brain.<account>.workers.dev/v1/messages
```

rebuild, create the project once, deploy `dist/`:

```bash
npm run build
npx wrangler pages project create hold-please --production-branch master
npx wrangler pages deploy dist --project-name hold-please --branch master --commit-dirty=true
```

Trap (Shah, wrangler 4.150): `pages project create` may hand the request to Workers and fail; the first create
then needs `--force` once, after which Pages commands work directly. `--branch master` makes it the production
deployment, so the alias `https://hold-please.pages.dev` points at it (the output also prints a
`https://<hash>.hold-please.pages.dev` URL for that exact upload).

## 3. Co-op server (only when `server/` is finished)

```bash
npx wrangler deploy -c server/wrangler.jsonc
```

creates the Worker and the `Room` SQLite Durable Object (migration `v1`). Then two edits and one more build:

- `server/wrangler.jsonc` → add `https://hold-please.pages.dev` to `vars.ORIGINS` (comma-separated; the server
  returns 403 to any other `Origin`), deploy again.
- `.env.production` → `VITE_HP_SERVER=https://hold-please-server.<account>.workers.dev` (no trailing slash),
  then step 2's build + Pages deploy again.

The lobby also has a server field, so a build without `VITE_HP_SERVER` can still join a room by hand.
Check: `curl https://hold-please-server.<account>.workers.dev/` → `{"app":"hold-please","ok":true}`.
Trap (Shah): the first request to a just-deployed Durable Object class can 500 once.

## 4. Smoke test on the live URL

`smoke-live.mjs` (session scratchpad, puppeteer-core from the awwwards-blueprints skill, SwiftShader) drives
the production build through its real buttons (no dev hooks exist in `dist/`): title → Dial in → Enter the
office → Clock in → answer the first call → a few lines → ask for the crater → type it into Moon Acres → the
power button → the review. Rehearsed on `npm run preview` (3731) before the deploy: PASS. Run one headless Chrome
at a time (two SwiftShader offices starve each other).
It runs once with the default brain (Claude through the proxy: proves the Worker, the secret and CORS) and once
with the built-in brain (a deterministic sale). Screenshots land beside it. By hand: open the URL, Dial in, Clock
in, answer, say hello using the caller's name, pitch "an acre of the Moon", ask "which crater would you like?",
type the crater into the Moon Acres app, then the power button → the review.

## Trap: `npx wrangler` and a newer release

npx has wrangler 4.151.1 cached. When npm sees a newer release (4.151.2 appeared on 2026-10-19) it tries to
replace the cached copy and fails with `EBUSY … miniflare` while any `wrangler dev` is running (the co-op
server on 8790 usually is). Either stop the dev servers first, or run the cached binary directly:

```bash
node C:/Users/User/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js deploy -c brain/wrangler.jsonc
```

## Redeploys later

Game: `npm run build` + the `pages deploy` line. Brain: `npm run brain:deploy` (the secret stays). Server:
`npx wrangler deploy -c server/wrangler.jsonc` (the Durable Object keeps its rooms). Only when Luca asks.
