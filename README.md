# Hold Please

A browser game in the shape of *Scam With Your Friends* (Steam, Oct 2026): you work a night
shift at a call centre, talk callers into buying things, hit the quota before the review,
survive the boss. The research on the original is in `docs/RESEARCH.md`; the design is in
`DESIGN.md`; the build plan in `PLAN.md`.

One deliberate difference: the products are impossible (acres of the Moon, a warranty on the Sun,
a gravity subscription), and nothing in the game explains a real scheme. The loop is the same.
The callers are real public figures from the Albanian packs in `public/packs/` (a browser with no callers
loads `albanian-callers.json` on its first visit), each drawn as a cartoon from the free photo on their
Wikipedia article, or shown as initials where there is none. The invented creatures, machines and ghosts
were removed on 20 October at Luca's request; the Character Creator still makes new callers.

Live at **https://hold-please.pages.dev** (Cloudflare Pages); source at
**https://github.com/lucacomino61-prog/hold-please** (public). The co-op server and the brain proxy are
Workers on the same account (`docs/DEPLOY.md`).

## Run it

```bash
npm install
npm run dev        # the game: http://127.0.0.1:3730
npm run build      # type-check + dist/
npm run preview    # the built game: http://127.0.0.1:3731
```

### Live AI callers (through the brain proxy; every key stays server-side)

```bash
npm run brain        # the proxy: http://127.0.0.1:8788  (health: /health). Needs the Cloudflare login, no key.
```

The proxy (`brain/worker.ts`, a Cloudflare Worker) gives the game three live brains that all speak the
same one-line JSON, so the apps never know which is talking:

- **Free AI** (the default when the proxy is up): Cloudflare Workers AI through the Worker's `AI`
  binding, model `@cf/openai/gpt-oss-20b` (var `CF_MODEL`): on the game's own prompt it scored best of the
  eight models the proxy allows (in character, tests the pusher, hands over only what was earned, valid JSON
  every turn, about 3 s). No key. The account's free allowance is 10,000 Neurons a day, about 450 caller
  turns on that model; above it, $0.011 per 1,000 Neurons (about $0.25 per 1,000 turns).
- **More free keys, more models**: `CHAT_PROVIDERS` in `brain/wrangler.jsonc` lists OpenAI-compatible providers
  with free tiers, each with its own models: Groq (`GROQ_API_KEY`, from console.groq.com), Gemini's OpenAI endpoint
  (`GEMINI_API_KEY`, from aistudio.google.com; the original game ran on Gemini 2.5 Flash Lite) and OpenRouter
  (`OPENROUTER_API_KEY`, from openrouter.ai; its free models allow 50 requests a day, 1,000 after a one-time $10
  top-up). Each key is a Worker secret of that name (`npx wrangler secret put GROQ_API_KEY -c brain/wrangler.jsonc`)
  or a line in `brain/.dev.vars`; a provider without its key is skipped. Every free model is in: 26 on Workers AI
  (5 preferred that callers are spread over, 21 fallbacks), plus 9 at Groq, 6 at Gemini and 12 at OpenRouter once
  their keys are set (53 in all; `/health` counts them). A provider that answers "too many requests" or runs out of
  credit rests for a while, a model that errors or says nothing rests an hour, and the next one takes over. The game sends the caller's id as a seed, so each caller
  keeps one model for the whole call and the calls spread across all the models and keys. One key per provider,
  from your own account: several accounts at the same provider break its rules.
- **Claude**: secret `ANTHROPIC_API_KEY` (`claude-opus-5-5` by default; Sonnet and Haiku allowed), last in the
  chain, or on its own from Settings, or the player's own key straight from the browser.

With the proxy running, `npm run dev` uses the free brain for every caller (`.env.development` points
`VITE_BRAIN_URL` at it); Settings picks Claude or OpenRouter, or "Built-in" for the offline engine. Any
failure falls back to the built-in brain mid-call. Whichever model talks, the game keeps the rules: a pushy line
never earns a hand-over, the caller's own verification question is asked at suspicion 40 and judged by the
game, and at 85 they hang up (`src/game/brain/claude.ts`). Caps: 400 tokens a turn, 40 requests a minute and 600
a day per IP. Local secrets go in `brain/.dev.vars` (see `.dev.vars.example`; none is required).

To deploy the proxy: `npm run brain:deploy` (the AI binding needs nothing else), optionally
`npx wrangler secret put ANTHROPIC_API_KEY -c brain/wrangler.jsonc`, then put the Worker URL into
`.env.production` as `VITE_BRAIN_URL` before `npm run build`. The whole recipe is in `docs/DEPLOY.md`.

### Neural voices (optional)

Title → Settings → ElevenLabs API key. Callers then speak with ElevenLabs voices (charged to your
account per character); without it the browser's own voices are used.

### Play with friends (co-op, one room server)

Public rooms: tick "List it publicly" when hosting and the room appears in the lobby's Public
rooms list for anyone on that server to join (`GET /rooms`, kept by the `Lobby` Durable Object;
entries fade after two hours). On a shared floor the day's three targets are the same for
everyone (seeded by the room code), a finished target is announced to the floor, and the host's
events (raids, fires, the Moon…) happen at every desk at once; guests schedule none of their own.
Transfers are solo only (the colleagues are real people in a room).

```bash
npm run server          # the room server: a Cloudflare Worker + Durable Object, http://127.0.0.1:8790
npm run server:check    # regenerate server/worker-configuration.d.ts and type-check server/
```

Title → **Play with friends** → host a room (a four-letter code) or join one. Up to eight on one
floor: everyone takes their own calls in their own browser; every sale goes to the room, which
owns the **TEAM** total, the quota, the day number and the shift clock, so every HUD shows the
same numbers and the review comes at the same second for all. The host starts the day, clocks
everyone in from the break room (or by sitting down on the floor) and moves on from the review;
the sheets rank everyone by what they brought in. The friends are drawn on the floor in place of
the scripted colleagues (their names, shirts and desks; the Floor Cam shows them). Raids and air
strikes at your desk take from what *you* brought in today. If the room drops, the game carries on
with local totals and rejoins by itself; "Leave the room" keeps playing solo.

In development the lobby talks to `http://127.0.0.1:8790`; a production build uses
`VITE_HP_SERVER`, or the address pasted into the lobby's "Room server" field. Deploying (Luca
only): `npx wrangler deploy -c server/wrangler.jsonc`, then add the site's origin to `ORIGINS` in
`server/wrangler.jsonc`. `server/.dev.vars` sets `TEST_SHORT=1` so the probes can run shifts of a
few seconds; the deployed Worker only accepts 3/5/10/15 minutes.

Works offline once loaded (the fonts come from Google Fonts; the game falls back to Impact /
Arial Narrow without them).

## How it plays

0. **Title** → Dial in → the **clock-in desk**: your name, man or woman, outfit (polo, T-shirt,
   V-neck, open shirt, tracksuit, hoodie, suit & tie), its colour, shade of orange, hair colour
   and style (short / big / combed, or bob / curly / combed; full, bald or half bald), facial
   hair (moustache, goatee, beard), unibrow, glasses or shades, the gold chain, a headset check
   (hold to test the microphone, hear a caller) → Enter the office.
1. Every day starts **standing in the office**, like the original. The whiteboard on the
   break-room wall has the day: quota, the three bonus targets, tonight's twist.
2. **Clock in by walking to a free desk** (WASD, mouse) and pressing E next to it, or click the
   desk; click a colleague to slap them off theirs. (With "Skip the office walk" on, or on a
   device without the 3-D office, a dialog offers Clock in instead.) Sitting down dollies the camera
   into the monitor — that is the signature moment — the CRT shows the Harbour OS logo and
   the desktop boots: a mountain wallpaper, a wall of icons with **every** product on it (the
   ones you do not own yet are greyed with a lock and open the market), the Phone, the apps.
   Mid-shift you can **stand up** (the taskbar button, or Esc) and explore: Shift to run,
   click to pick up a mug / stapler / donut / paper ball and click again to throw it (Q puts it
   down), F for gas (colleagues cough), hold P for the puddle, look at a colleague's monitor to
   see what they are doing, and press E at **any** free PC to take a ringing call there. Calls
   ring longer while you are away from a desk; a banner on the floor HUD names the caller.
3. **Calls** ring on the Phone. Use the caller's name, play along with their world, answer the
   question they keep asking, be kind. The Phone is laid out like the original's: **CALLER
   TRUST** with the word (angry, wary, neutral, warming, trusting) and the percent, the caller's
   name over the portrait on its grid, a status line (**MESSAGE SENT – WAITING** while they think,
   CALLER SPEAKING, ON THE LINE), the waveform, the bubbles with a name chip (blue for them,
   orange for you), then the wide red **Hang Up** with the green speaker (their voice on or off)
   and the green mic (hold to talk). Hold, Transfer and Hands-free sit under those. (The suspicion
   chip appears in the trust block once it matters — see the brain.)
4. **Pitch a product, then ask for the one thing that closes it** (the Playbook lists the
   exact question for every product). When the caller says it, type it into that product's
   app. The money lands in the team total.
   Each sale stamps SALE +$ on the caller and floats a big green **+$250** over the whole desktop
   (red and falling on a loss); the taskbar block (PERSONAL / TEAM / QUOTA / PERFORMANCE REVIEW,
   the clock and the full date, like the original's) counts up and flashes; when a call ends
   the phone shows a card (length, earned, mood at the end) and counts down to the next ring.
   On day 1 a seven-step guide follows your first call. At 0:00 a SHIFT OVER bell rings and the
   desktop shrinks back into the monitor.
5. **Review** at the end of the shift: Mr. Krull's slides, built from what you did (the call
   analysis with the three things you said that moved a caller most, numbered; the worst line;
   browser history; casino losses; strikes). Quota met → bonus, bigger quota, new products in
   Swindlr Market. Missed → the last slide reads QUOTA MISSED BY $… / **YOU'RE FIRED!** /
   $… OF $… while red fog and small fires fill the review room, then the termination report
   ranks everyone card by card (TOP EARNER · +$… AHEAD, $… BEHIND THE LEADER, total earned,
   time / days, avg / day; days worked and the team haul at the side).

From day 2: inspectors who want you to open their file (say yes and you get a virus), police
raids (minimise every window), air strikes, power cuts, Mr. Krull walking past while the
casino is open (three strikes and you are called in). From day 3: fires (click every flame), a
computer bomb (type the last caller's name without its vowels), the tsunami (stack the
sandbags), a UFO taking a colleague, the Moon itself calling, **the plumbing** (brown blobs
tumble across the floor; click every plunger), **fireworks indoors** (catch the rockets while
they whistle up and burst on the floor), **a cough on the floor** (mask every colleague before
the whole floor has it; everyone coughs, green clouds hang over the desks) and **lightning**
(a white crack, every PC reboots, the caller is gone). Every three days survived the team
moves up a floor.

Also on the desktop: **Character Creator** (your own callers — name, world words, question,
voice, drawing; saved in this browser, JSON import/export), **Camera** (you, live, from the
clip-on webcam on your monitor: your own character blinks, scratches, and turns its head to
follow your mouse; mirrored like every self-view; the ▲ Show bar reveals the controls, a button switches to your real webcam;
snapshots go to the review), **Floor Cam** (the whole office from the corner camera), **Doodle**
(a paint app; drawings go to the review), the break-room TV, a live quota board and a Top
Earners leaderboard on the back wall, and the review happens in a 3-D meeting room with
Mr. Krull — the worst moment of the day can be played back with the caller's voice. On the
floor the empty PCs run screensavers (swirl, blobs, warp) and boot with the Harbour OS logo
when someone sits down; two wall fans sweep the room; papers litter the carpet.

**Products with their own puzzles.** Besides the typed products: Echo Removal (type the
echoing word backwards, letter boxes filling as you go), Dream Insurance (dial the four-digit
claim number in order on a pad that falls asleep after ten seconds and wakes up angry on a
wrong digit), Rainbow Lease (click the three colours in the order the caller wants them).

**Callers come from packs now.** On 20 Oct Luca had every built-in caller removed; the pool is
whatever the Character Creator holds: callers you make there, or a pack imported with its
Import JSON button (the packs under `public/packs/` are JSON of Character Creator callers).
The invented VIP genres pack was removed on 20 Oct; the Starter packs row only shows when
`src/os/apps/creator.ts` lists a pack.

**Colleague Creator** (desktop app): make your own colleagues the way you make callers: name,
look (the same rig options as yours), voice, pace, how often a transferred call closes, and
every line they say (sales, reactions to yours, floor talk, headset mutters, transfer reports).
Each takes the desk of Teodora, Jun or Baxter from the next run.

**Hold FM** (desktop app, or R on the floor): a lo-fi loop from the break-room TV, which shows
ON AIR; callers hear it in the background.

**VIP callers.** One call in twenty is a celebrity (⭐ in the Phone): rich (fixed payouts ×3),
busy, vain, and hard to please (every product needs 25 more mood). They are invented
archetypes — a TV astrologer, a folk singer, a Tirana influencer, a football coach, the
neighbour who sees everything from her balcony, a television doctor — each with its own
replies even in the built-in brain. No real person is used.

**One character, one voice, both brains.** Every caller has a *way of talking*
(`src/game/brain/style.ts`): verbal tics, word swaps and a register (whisper, shout, flat,
grand), read from who they are — a pirate says "arr" and "ye", a cat purrs, a fridge speaks
flat without exclamation marks, the thing in the attic whispers in lowercase, a queen says
"one" — or set by hand in the Character Creator (tics and a "how they talk" sentence). The
built-in brain colours its stock lines with it, the live brain is told it in words, and the
voice reads the same spec: a flat machine is pitched low at a steady pace, a grand legend slows
down, a whisperer is soft, and the pitch and pace follow the caller's mood on every line (cross
= quicker, pleased = a touch higher). Male or female voices follow the character (title,
drawing), not chance.

**They remember you.** A caller who has rung before starts where the last call left off: sold
to = warmer and "you again, the one with the good deals"; hung up on = colder; saw through you
= wary from the first word. Both brains know the history. **They hear your office.** During a
raid, a fire, an air strike, a power cut or Mr. Krull's walk, the caller hears it and says so,
once ("Is that a siren? Are you being arrested?").

**The other desks.** Teodora (top closer, three months running), Jun (second week, apologises
to the phone) and Baxter (eleven years, never read the Playbook) close at their own pace, say
so in their own words and voices, comment on your sales, mutter into their headsets when you
walk past, and chat if you stop in front of them on the floor. Rita, Drin and Ela at the back
have a line or two as well. Mr. Krull reads every review slide out loud in his own voice and
shouts on the floor when he walks it.

**Save and resume.** The run is saved in this browser at every break room and after every
promotion. The title screen shows **Continue** (day, money, rank); Dial in becomes New run. A
shift that was cut off restarts from that day's break room. Co-op runs belong to the room and
are not saved.

**Ranks and perks** (`src/game/ranks.ts`, by days survived): Trainee → Agent (day 3: callers
wait a quarter longer) → Senior Agent (day 5: VIPs pay double) → Floor Lead (day 7: a second
line, so a caller who rings while you are on a call waits on hold instead of hanging up; the
Phone shows who is holding). The rank is in the taskbar HUD and the promotion sheet announces
the new one with its perk.

**Desk cosmetics** in Swindlr Market → Physical goods: a desk plant, a Top Closer trophy, a
second monitor and an executive chair. They appear at your desk in the 3-D office, follow you
to any desk you sit at, and the colleagues have opinions.

**Hall of fame and badges** (`src/game/hall.ts`, title → Hall of fame): the best runs on this
browser (days survived, team total, rank; a run in progress counts) and 16 badges (first sale,
a VIP closed, a verification question passed, 95% trust, $1,000 in a shift, all three targets,
a clean raid, a fire out, a bomb defused, five inspectors seen off, a slap, a snapshot, five
days, Floor Lead, every product sold at least once, two sales on one call). Badges earned in a
run are on the promotion and termination sheets.

**Two lines.** Hold parks the live caller on tinny hold music (their patience drains twice as
fast) while the dialer brings the next one; Swap takes them back and parks the other. A caller
left holding too long hangs up. A hung-up line brings the held caller back by itself. Floor
Leads also get a queue: a caller who rings while both lines are busy waits for a free one.

**Transfer.** Hand a hopeless caller to Teodora (closes most), Baxter (some) or Jun (for a
laugh). They work it for a few seconds and report back; a close pays you a 40% cut. Solo only.

**The case.** From day 2, Inspector Vane of the Bureau of Nonsense calls once a day, remembers
every call and keeps a file. Three slips (you said yes to an inspector's file, a caller saw
through you, you insulted Vane) and the review is a hearing: "Bureau of Nonsense v. you", the
three slips read into the record, guilty, everyone out, quota or no quota.

**Mutator days** (`src/game/mutators.ts`). From day 2 some nights come with a twist on the
whiteboard: Library night (every caller whispers), Megaphone night (every caller shouts), The
Moon is sold out, Paranoid night (suspicion ×2), Short fuse (half the patience), Payday
somewhere (budgets ×1.5), Bureau sweep (three times the inspectors). The promotion bonus is
bigger on those nights. The twist is seeded by the run and the day, so a resumed run keeps it.

**More events** from day 3: a tsunami through the east wing (click five sandbags before the
water reaches the desks), a UFO that takes a colleague for the rest of the day (their desk goes
quiet; back tomorrow), and the Moon itself calling to complain about its acres (calm it down or
it takes half of today's Moon money back). Callers hear all of it.

**Daily targets.** Three bonus objectives a day next to the quota, picked from a pool by the
day and the run (answer five calls, get a caller to TRUSTING, close a ghost, pass a
verification question, survive a raid with clean desks, put out a fire, defuse the bomb, take
a snapshot, take a call at another desk, bring in half the quota yourself, …). They are on the
break-room whiteboard, in the **Targets** window on the desktop (pinned to the taskbar), paid
to your personal account the moment one is done, and ticked off on a review slide.

## Settings

Title → Settings. Your name, callers speaking out loud, microphone input (hold the mic button;
typing always works), sound, Stop animations, skip the office walk, the office language (English,
Albanian, Italian), shift length (3/5/10/15 min), **Family mode** (swearing masked on screen and kept
out of the voices, the live brain told to keep it clean, no plumbing disaster, gas or puddle on the
floor), **Streamer mode** (room and sync codes shown as dots, a friend's desk shows the screensaver),
the caller **voices** (the browser's, or the HD voices: Kokoro-82M running in the browser after one
88 MB download), **who hears you** (the browser's speech recognition, or Whisper through the proxy for
any browser), an optional ElevenLabs key, **saves on other devices** (a sync code), and who plays the callers:

- **Built-in**: an offline improv engine that plays every caller with stock lines, their own
  suspicions and verification questions (`src/game/brain/`). Free, works offline, English only.
- **Free AI**: Cloudflare Workers AI plays each character live through the game's proxy. Free up to
  the proxy's daily allowance. Chosen by default whenever a proxy is configured.
- **Claude**: the Anthropic API plays each character live. Needs your API key (stored in this
  browser only, sent straight to `api.anthropic.com`) or a proxy URL that adds the key. Model
  defaults to `claude-opus-5-5`; `claude-haiku-5-5` is far cheaper if you want volume.
  Any failure falls back to the built-in brain mid-call (in Albanian or Italian the caller first
  blames the line once, in that language, because the built-in brain speaks English only).

## Code map

```
src/main.ts               boot, dev hooks (window.__hp in dev)
src/game/state.ts         run state, settings, quotas, money, event bus
src/game/day.ts           break room → shift → review → next day / fired
src/game/calls.ts         dialer, live call, mood, payouts, claim()
src/game/callers.ts       the callers this browser has (the Albanian pack on a first visit), VIPs, the draw
src/game/scams.ts         the 14 products and what closes them
src/game/brain/           scripted.ts (improv rules), claude.ts (live model), lines.ts (dialogue), personas.ts (suspicion), style.ts (how each caller talks)
src/game/memory.ts        what a caller remembers of earlier calls (mood bias, "you again" openers, facts for the model)
src/game/scene.ts         what a caller can hear on your end during an event, and the one remark they make
src/game/events.ts        virus, raid, air strike, power cut, Krull, fire, bomb (each sets the scene and reports its outcome)
src/game/objectives.ts    the daily targets pool, the day's three, progress by bus event, the bonus
src/game/save.ts          save and resume (localStorage hp.save): written at the break room, cleared when fired
src/game/ranks.ts         ranks by days survived and their perks (patience, VIP pay, the second line)
src/game/hall.ts          best runs (hp.hall) and badges (hp.achievements), what earns them; ui/hall.ts shows them
src/game/mutators.ts      the day's twist (seeded), and what it multiplies
src/game/case.ts          Inspector Vane, the slips, the courtroom slides
src/os/apps/radio.ts      Hold FM; apps/colleagues-app.ts the Colleague Creator; public/packs/*.json the starter packs
server/src/lobby.ts       the public room list (a singleton Durable Object rooms report to)
src/game/colleagues.ts    Teodora, Jun, Baxter (+ Rita, Drin, Ela): bios, voices, lines, reactions
src/game/krull.ts         Mr. Krull's voice
src/game/review.ts        the slides and Krull's lines (spoken)
src/game/speech.ts        Web Speech in/out, Whisper ears through the proxy; voiceFor() shapes a voice from the style and the mood
src/game/voices-hd.ts     the HD voices: Kokoro-82M (kokoro-js, WASM, threads when cross-origin isolated), chunked and pipelined
src/game/review-ai.ts     Mr. Krull's roast written by Llama 3.3 70B through the proxy from the day's slides
src/game/save-sync.ts     saves that follow the player: a sync code, gzip, the room server's /saves route, newest wins
src/game/modes.ts         Family mode (the swear mask, three languages) and Streamer mode (codes as dots)
src/game/sky.ts, courier.ts  the Star Registry's sky and the Penguin Courier's crates and Customs call
src/world/floors.ts       one floor per rank: walls, carpet, light, the view, furniture against the walls, the sign
src/ui/elevator.ts        the lift ride on the morning after a promotion
src/os/toon.ts            the cartoon drawn from a caller's photo
src/i18n.ts               t(): the English text is the key; the Albanian and Italian tables
src/os/                   Harbour OS: windows.ts, desktop.ts, apps/*
src/world/office.ts       the three.js office, the floor sandbox, clock-in dolly, Floor Cam, webcam
src/world/people.ts       the scammers on the rig: sit/type/walk poses, head look, blink, scratch, tumble; headset, chain, badge
src/world/rig.ts          the body (Kenney Animated Characters, CC0, subdivided in Blender) + skin repainting (orange, faces, beards)
src/world/kit.ts          Kenney Furniture Kit loader (CC0, public/models/kit): recolour, scale, place
src/net/room.ts           co-op: the WebSocket to one room (reconnects by itself)
src/net/coop.ts           co-op: mirrors the room into the state, follows its days, fallback
src/net/floor.ts          co-op: friends' positions ↔ the office's avatars
src/ui/lobby.ts           Play with friends: host / join / who is on the floor
server/                   the room server (Worker + Durable Object "Room"), wrangler.jsonc
src/styles/               base.css (craft rules), app.css, os.css, apps.css, coop.css
```

One `requestAnimationFrame` owner (`src/world/loop.ts`); the shift clock is wall-clock so it
keeps time when the tab is not painting.

**The look.** The people are Kenney's "Animated Characters" body (CC0, `public/models/people/LICENSE.txt`),
subdivided and smoothed in Blender and re-exported with its idle/run/jump clips; every person gets a
repainted skin — orange, their shirt and trouser colours, my own cartoon face with a blink frame,
moustache, goatee or beard — on Kenney's atlas layout, plus a headset, gold chain, badge and glasses on
the bones. Chairs, kitchen, lounge, plants, bins, boxes, the coat rack and the restroom are
Kenney Furniture Kit models (CC0, `public/models/kit/LICENSE.txt`), recoloured to the office
palette. Everything else is built in code from rounded, bevelled boxes: 27-inch flat monitors
on slim necks with a webcam bar clipped on top, two long benches of eight PCs in a line like the
original (no cubicles: pale laminate tops on steel T-legs, a white pedestal under every other
position, a cable tray, a low frosted-glass privacy strip behind the monitors), slim keyboards,
desk phones with a little display, posters, the vending machine, the light fixtures, light
modern walls. Each floor has its own walls, carpet, light, view and a little furniture
(`src/world/floors.ts`). Rendering goes through an EffectComposer — ambient occlusion (GTAO) and a soft
bloom on the lights. On a weak machine set `localStorage.setItem('hp.fx', '0')` to turn both
off (reload).

## Checks

- `npm run check` — TypeScript.
- `node tools/check-roster.mjs` — the built-in roster (empty since 20 Oct; the packs carry the callers): unique ids and names, every field the brains
  need, valid product ids, working challenge patterns (last run: ROSTER OK).
- Round 20 (28 Oct), all on localhost with `npm run brain` and `npm run server` running; the probes live in
  the session scratchpad (`cmp/`, `regress.mjs` runs them one after another): first visit 11/11, saves sync
  5/5, Star Registry and Courier 9/9, scambaiters 7/7, AI review 4/4, voice chat 6/6, voices 9/9 (Whisper ears,
  HD voices: the first words 2.6 s after a ring and 2.8 s from the setup desk on a 2013 quad-core; a voice with
  nothing fetched ahead takes about 4.4 s), Albanian and Italian 13/13, the lift 7/7, Family mode with the live
  brain 4/4, floors and both modes 18/18, the voice fetched during a ring 2/2; the HD speed and local tour runs
  measure only (no page errors). `npm run check`, `npm run server:check` and `npm run build` are clean.
- `node ~/.claude/skills/awwwards-blueprints/scripts/audit.mjs http://127.0.0.1:3730/` — the
  craft audit (last run: 0 fail).
- A headless walkthrough that screenshots every screen lives in the session scratchpad
  (`shots.mjs`); it drives the game through `window.__hp`. Later probes there: `floor.mjs`
  (stand up, pick, throw, gas, puddle, sit elsewhere), `cam.mjs` (the webcam puppet and a VIP
  call), `look.mjs` / `look2.mjs` (viewpoints of the office), `look3.mjs` (boot splash,
  desktop, trust words, market, the two wall boards, screensavers, a fan, a booting CRT, the
  review — every wait runs inside the page, because under SwiftShader a screenshot can take
  10 s and calls were missed in between), `market.mjs` (the market with money), `integ.mjs`
  (24 checks: styles and swaps, voices by character and mood, a caller who remembers you, the
  siren remark during a raid, targets counting and paying, colleagues' lines and voices, the
  targets slide, Krull speaking — `speechSynthesis.speak` is spied), `floorlook.mjs` (stand in
  front of Baxter: his line, his voice), `progress.mjs` (17 checks: save at the break room,
  ranks and the second line, a market purchase and four cosmetics on the desk, badges, reload →
  Continue → resume on day 3, the promotion sheet with the new rank, the hall entry, the
  termination sheet clearing the save), `depth.mjs` (18: hold/swap/drain, transfer, mutators, the
  case and the courtroom, tsunami, UFO, the Moon's call; brings its own invented test pack),
  `content.mjs` (14: the three new apps, the VIP pack, the Colleague Creator and a re-seated run,
  Hold FM), `coop2.mjs` (8, two browser contexts against `npm run server`: public list, join
  through it, shared targets, a relayed raid, a target note). `__hp.office` has `teleport`, `lookAt`, `pick`,
  `throw`, `fart`, `pee`, `sit`, `props`, `self`, `screen(i, app)` (force a CRT to boot / os /
  a saver), `bench` (ms per frame); `__hp.bootSplash(ms)` holds the boot screen;
  `__hp.styleFor / stylize / voiceFor / callerById / objectives / planObjectives(ids)` for the
  character checks.

## Round 16 (20 Oct): the rest of the original, and what a shipped game needs

- **Ten more products**, each with its own puzzle (`src/os/apps/scamapps.ts`): Weather Subscription
  (click tomorrow's sky), Shadow Tax (a ruler), Gravity Refund (count the falls), Birthday Insurance
  (pin the month), Nobel Prize Delivery (engrave the field), Cave Diving Lessons by Phone (hold to
  descend, let go at the depth), Echo Lease (an echo chamber), Subway to the Moon (a station on the
  line), Dentist for Ghosts (pull teeth down to the count), Time Zone Transfer (turn the clock), and
  **FarView Remote Support**, laid out like the original's AnyViewer (a six-digit code, Connect, the
  caller's desktop appears). When a line pitches two products at once ("Subway to the Moon" is also
  the Moon), the built-in brain now takes the one whose closing question is in the same breath.
- **Jackpotato** has the original's whole table (`src/os/apps/casino.ts`): crash, coin, dice, slots,
  mines, plinko, keno, roulette, blackjack, baccarat and video poker.
- **Dumpling Clicker** has Meteor Cookie's depth (`src/os/apps/clicker.ts`): Automation, Click Power,
  Boosts and Synergies tabs, tiers, buy 1 / 10 / max, a lifetime count that unlocks units.
- **Zoomy** (a video call: the caller fills the stage, you are in the little tile, Share screen shows
  them your desktop and they judge it), **Mailbox** (Krull's offers, bait attachments that are a
  virus, the callers' sale confirmations), and **Pigeon** restyled like the original's Disscord with
  the PREMIUM gift bait.
- Physical goods with floor effects: the rival air strike sets off the morale fireworks; a bigger
  plant, a fish tank (the fish swims), a sofa, a rug and a floor lamp at your desk.
- The review-skip **door**: slip out of the review, the verdict stands, tomorrow starts on strike one.
  The game **snaps your webcam at the worst line** (your real one when the Camera app shows it, else
  your character) and the worst-moment slide shows it.
- Four more disasters from day 4: the **nuclear drill** (hold the button through zero), the
  **hurricane** (the windows wobble, bolt six frames), the **bomb threat** (a muffled voice calls; keep
  them talking and be kind, it was a kettle) and the **radioactive leak** (a Geiger meter climbs while
  you sit; stand up and walk it off).
- **Co-op voice chat**: the 🎙 in the HUD's room group; WebRTC between the players, signalled through
  the room (`src/net/voice.ts`, server case `rtc`). STUN only, so the strictest networks may not
  connect and the game says so. Not tested with two real microphones yet.
- **Touch, gamepad, keyboard**: a thumb-stick and SIT / RUN / PICK buttons over the office on phones
  and tablets, windows fill a phone screen, bigger targets; a gamepad walks (left stick), looks (right
  stick), A sits / picks up, B stands, X the gas, Y the radio, a trigger runs; I J K L look for
  keyboard-only players and every disaster focuses its first target.
- **Albanian and Italian** (`src/i18n.ts`, Settings → Language): the title, the HUD, the Phone, the
  break room, the review and Mr. Krull, the sheets, the disasters and the three colleagues. Callers
  answer in whatever you write. The Albanian wants a native read.
- **Three save slots** (Continue per slot on the title, a chooser when all are full), a **run
  history** in the Hall of fame, **Reset everything** in Settings, a looping **demo strip** in How it
  works.
- A **play counter** on the room server (`/plays`, one per browser per day) shown on the title; a
  Feedback link once `src/config.ts` has a URL; share image (`public/og.png`), icon set, web manifest
  and a `404.html` for Pages.

## Round 17 (20 Oct): the office comes alive

- A **loading screen** (`src/ui/loading.ts`): the logo, a real bar that fills when the rig, the
  furniture and the environment are in, rotating tips, Skip after a moment. The desktop boot has
  BIOS lines and a bar.
- A **first-day tutorial on the floor**: a glowing ring at a free desk, a card that walks a new
  player to it, then the desktop card, then the call guide as before.
- **Colleagues walk the floor**: every so often one gets up, walks the aisles to the kitchen, the
  cork board, the TV or the whiteboard, stands there a while and comes back to their chair; their
  monitor idles meanwhile. The **goose** crosses the floor some nights (click it for the HONK badge),
  calls once a run from day two and only honks, and the Konami code on the desktop turns every
  portrait into a goose for the shift.
- The **walk to the review**: when the shift ends you are on the floor, the meeting-room door on
  the east wall lights up, the colleagues file out ahead of you, and the slides start when you
  reach it (Skip the walk, or "Skip the office walk" in Settings, keeps the cut).
- **Mr. Krull's office** (`src/game/krull-office.ts`): three strikes puts you in the chair across
  his desk, a real room beside the meeting room. Three rounds of choices move his temper; enough
  of it left and you are back on the floor on one strike, not enough and the day ends as a firing.
- **The finale**: on day ten the Bureau raids the building. Inspector Vane opens the shift,
  inspectors are on every other line, raids come all night; survive it and the run ends with the
  ending screen, the credits and an "escaped" mark in the hall (`src/ui/ending.ts`).
- **Dusk Customer Care across the street** (`src/game/rival.ts`): three rival agents with a board
  beside yours, a window on the east wall showing their building, a **poach** event that gives a
  ringing caller to them unless you answer in five seconds, and the market's air strike that leaves
  their window burning for the night with a tenth of their money.
- The **Callers** app, a codex of everyone you have spoken to: portrait, calls, what they bought,
  how the last call ended, what they remember of you.
- **Promotions in the office**: a Senior Agent's photo (your webcam, or your character) hangs on
  the wall as employee of the month; a Floor Lead gets a name plate on the desk by the window.
- **Tonight's shift and This week's shift** on the title: one seeded shift everyone plays the same
  way (same callers in the same order, same twist, same targets), scored on the room server's
  board (`/scores`), saved slots untouched.
- Sixteen mutators (red carpet night, hangover, night market, fog night, gold rush, quiet night,
  rush hour, siren night, generous night) and forty-two daily targets.
- Co-op **text chat** in Pigeon (a Room contact) and **spectating** in the Floor Cam (watch a
  friend's desk).
- **Hold FM plays real tracks** when `public/music/manifest.json` lists any (CC0 only), with a
  volume slider; without tracks the house loop plays.

## Round 18 (20 Oct): more defined characters

- **The people on the rig** (`src/world/rig.ts`): every face is painted with an iris colour, a pupil
  and two catchlights, upper and lower lid lines, lashes and eyeshadow for the women, arched or
  heavy brows, a real nose with a bridge, nostrils and a shadow, cheek colour, skin shading (a
  shadow under the jaw and the brow, a highlight on the forehead and the cheekbones), five o'clock
  shadow on some men, sideburns with any beard, hair strands and a crown highlight, beard hairs and
  moustache strands, teeth lines, a tongue in the shout, lip gloss on the smirk. Outfits got
  stitching on the tee's neck, a chest pocket with a pen on the polo, lapel edges, a pocket square
  and a tie pin on the suit.
- **Mr. Krull** has his own face (`boss` flag): bags under the eyes, heavy lids, a scowl of a brow,
  a flat frown with the lines of a man who frowns for a living, a wider moustache, grey temples
  and sideburns, a gold pocket square.
- **Caller portraits** (`src/os/portrait.ts`): irises and catchlights, lids, shaped brows, a nose
  with nostrils, shading clipped to the head shape, hair strands and highlights per style, hat
  details, teeth and a tongue, collars by seed (crew, polo, lapels with a tie, hoodie strings),
  shirt seams; fur stripes and whisker dots on the cat, mask highlights on the raccoon, a muzzle
  highlight on the bear, feather lines on the goose, panel lines, screws and a readout on the robot,
  chrome on the toaster, a glow on the ghost, reflections on the alien, crater shading and a terminator
  on the Moon, a lit edge on the cloud, buttons and a belt on the trenchcoat.

## Round 19 (20 Oct): cartoons drawn from real photos for the Albanian callers

- A caller's portrait can come from a **photo** (`portrait.photo`, a URL or a data URL) with a
  **credit** (`portrait.credit`), or be an **initials tile** (`portrait.kind: 'initials'`); the
  drawn busts stay only for invented callers. One helper renders all three everywhere (`portraitHTML`
  in `src/os/portrait.ts`): the Phone, the ring card, Zoomy, the codex, the Creator.
- **The photo is never shown as itself.** `src/os/toon.ts` draws an original cartoon from it in the
  browser. The face is found by skin tone (every square window on a 24×24 skin-density grid is scored:
  dense inside, little skin around, large, high and central win) and cut tight; the picture is flattened
  into painted patches (a Kuwahara filter on summed-area tables), reduced to a twelve-colour palette
  (farthest-point seeds, k-means), de-speckled with two majority passes, inked along the borders between
  colours that differ in tone, and the bust is set inside an egg on a flat backdrop in the caller's own
  hue with comic dots and a light rim. The face stays recognisable; the picture is new. Cartoons are cached for the
  session, drawn ahead of the first ring for every caller with a photo, and swapped into any portrait
  the moment they are ready (a MutationObserver watches the OS). A photo the browser cannot read, even
  after one retry, becomes an initials tile. The credit reads "Cartoon drawn from a photo: …".
- The Albanian packs carry the **lead photo of each person's Wikipedia article** (sq, then en) where
  the Commons file is public domain or Creative Commons, with the photographer, the licence and the
  file page as the credit (shown in the codex and on the image). The others have no free photo and
  show initials, not a cartoon. The game loads the thumbnails from Wikimedia at run time; nothing
  is copied into the repo. `scratchpad/photos.mjs` did the lookup; rerun it to refresh.
- A pack imported into a browser earlier gets the pack's photos and credits copied over its
  callers at start-up (`src/game/callers.ts`), so nobody has to re-import.
- The **Character Creator** takes a photo: a URL, or a file from the computer (cropped square,
  256 px, kept in this browser with the caller).

## Round 20 (28 Oct): the comparison with the original, fixed in order

The comparison of 28 October ranked eleven gaps; all eleven are built, plus Family and Streamer mode.

1. **The phone rings on a first visit.** A browser with no callers loads the Albanian pack at start-up
   (`ensureCallers` in `src/game/callers.ts`); the dialer waits for it and retries every 10 s if the
   network drops it, with one toast instead of silence.
2. **Two small bugs.** `[hidden]` now always hides (the On hold strip showed on every call), and the
   start-of-shift toast names the model the proxy really runs (`modelLabel()`), not the Claude setting.
3. **Real voices.** HD voices: Kokoro-82M (Apache-2.0) runs in the browser after one 88 MB download,
   25 voices matched to each caller, phrase by phrase so the first words come quickly
   (`src/game/voices-hd.ts`). Cross-origin isolation (`public/_headers`, `vite.config.ts`) lets it use
   threads. Each voice file is fetched ahead: while the phone rings, when the setup desk opens, and the
   regulars' as soon as the model is up. English only; Albanian and Italian keep the browser's voices.
4. **Talk in any browser.** Whisper on Workers AI through the proxy (`POST /v1/stt`, 12 s limit):
   the page records until a 1.4 s pause and sends 16 kHz WAV. Automatic mode keeps the browser's own
   recognition where it exists. A slow service and a refused microphone get different messages.
5. **A review worth watching.** Llama 3.3 70B writes Mr. Krull's line for each slide from the day's
   facts (`src/game/review-ai.ts`, written while the floor walk plays); the worst call replays as a
   tape with the webcam still, REC, captions and both voices.
6. **Scambaiters** (from day 2, 12% of calls): callers who stall, never hand anything over, and mail
   a "photo". Hanging up before opening it pays $60, a daily target and the "Not today" badge.
7. **The original's new content, in our world.** Star Registry (day 4): the caller describes their
   star, each reply buys one reading on the chart, a direct hit pays $800. Penguin Courier (day 7):
   book a crate with the caller's password; Port Fortune Customs rings later and that password clears it for $900.
8. **Voice chat** between two browsers (fake microphones, the local room server): it never connected,
   because the room server dropped every message over 400 characters, so the WebRTC offer never
   arrived. `rtc` messages now pass up to 24,000. A test between two real people is still to do.
9. **Saves that follow the player.** Settings → Saves on other devices makes a 12-character code; the
   save slots, hall of fame, badges, look and colleagues go up gzipped to the room server
   (`/saves/:code`, newest wins) two seconds after every save and come down when the game opens.
10. **The translations, finished.** Every screen on the main path is in Albanian and Italian (about
    570 lines each): the clock-in desk, the market, all 30 product instructions and request labels, the
    43 daily targets, Settings, the lift, the stock lines a live call still uses. A live caller speaks the
    office language from its first line; in Albanian or Italian the model judges pitches and
    verification answers itself (the game's patterns are English), and a failed model turn becomes "the
    line crackled" in that language. Product names stay English.
11. **Floors.** Each rank works one floor higher: 7 The Pit, 12 Agents, 23 Senior Agents, 31 Floor
    Leads (`src/world/floors.ts`), each with its own walls, carpet, light, view (the skyline sinks and the
    top floor looks over the clouds), furniture against the walls and a wall sign. The sixteen desks,
    seats and walk lanes never move. The morning after a promotion starts in the lift (`src/ui/elevator.ts`):
    the number climbs, the chime, the doors open onto the new floor; a click or any key skips it.
- **Family mode** and **Streamer mode** in Settings (`src/game/modes.ts`), described under Settings.

## Not built yet

The CC0 music for Hold FM is found but not downloaded (it waits for Luca's yes). Voice chat between
two real people is untested. The Albanian lines want a native speaker's read. The Feedback link has no
address yet (`FEEDBACK_URL`). The gamepad drives the office walk, not the desktop. See `PLAN.md`.
