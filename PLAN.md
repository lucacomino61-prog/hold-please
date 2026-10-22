# Hold Please — build plan

Single-player first; online co-op is a later phase (a Cloudflare Worker room like Shah's).
Stack: Vite + TypeScript, DOM for Harbour OS, three.js for the office, no framework.
Dev port 3730, preview 3731.

## Loop

Title → **Dial in** → break room (whiteboard: the day's quota) → office floor (optional walk)
→ sit at a PC → **Clock in** (signature dolly) → Harbour OS boot → calls until the shift timer
ends (10 min by default) → review (Mr. Krull's slides from the day's highlights) → quota met:
*Day n survived* sheet → next day; quota missed: fire, red fog, *Everyone's fired* sheet.

Quota by day: 600, 950, 1,400, 1,950, 2,600, 3,400, 4,300, 5,400, then ×1.25.
Money: every closed sale adds to PERSONAL and to TEAM (TEAM is what the quota measures).
Three colleagues bring in roughly a third of the quota by themselves. The shop and the casino
spend/earn PERSONAL only; they never move the quota.

## Callers

22 characters in `src/game/callers.ts`: creatures (raccoon, cat, goose, bear), machines
(fridge, robot vacuum, ATM, toaster), spirits (Lady Wisteria, the thing in the attic, a dead
accountant), legends (a knight, a pirate, a witch, three kids in a trenchcoat), cosmic beings
(an alien, the Moon, a small cloud, the Sun's publicist) and three **inspectors** who call to
make *you* say yes to their file (a virus). Each has a world (words that mean you are playing
along), a question they keep asking, quirks, a voice, a starting mood, patience and a budget.

Brain = `CallerBrain.respond(ctx) → Turn { say, moodDelta, gives?, hangUp?, virus? }`:
- `scripted` (default, offline): improv rules — name, world words, answering their question,
  compliments warm them up; insults, "you're not real", rushing and threats cool them down.
  Mood 0–100 with states FURIOUS < 15, COLD < 40, LUKEWARM < 60, WARM < 85, DELIGHTED.
  Each product has a mood gate (−10 if the character likes it, +12 if not); when the player
  asks for the closing item above the gate, the caller says it and the app accepts it.
- `claude` (optional): Anthropic API, `claude-opus-5-5` by default, JSON turns, same shape.

Voice: Web Speech API (press-to-talk) in, `speechSynthesis` per caller out; the transcript is
always on screen and typing always works.

## Products (all impossible)

| Product | App asks for | Gate | Payout |
|---|---|---|---|
| Moon Acres | the crater they want | 50 | the caller's budget ($150–$1,000) |
| Sun Warranty | the serial number on the Sun | 45 | $250 |
| Gravity Plan | the PIN they chose | 40 | $180 |
| Cloud Storage | how many clouds | 50 | $60 per cloud |
| Vowel Tax Refund | their name without vowels | 55 | $300 |
| Haunt Insurance | the haunting reference | 55 | $350 |
| Wi-Fi for Pets | pet name + plan | 45 | $220 |
| Lottery of the Ancients | the rune code → scratch three | 50 | $0/200/500/1,000, 5% jackpot |
| Bean Coin | the amount → live round, cash out before the crash | 50 | ≤ $700 |
| Remote Fridge Repair | the six digits inside the door → connect → repair | 50 | $400 |

Day 1 owns the first three; the rest are bought in **Swindlr Market → Products to sell**.

Side apps: Swindlr Market (business apps, games, physical goods with effects), Jackpotato
(crash, coin, dice, slots), Dumpling Clicker, Pigeon (the "free Premium gift" is a virus), Surf
(six fake sites; history feeds the roast), Playbook (the exact question per product),
Wallpapers, ShieldBuddy (Remove virus $100 or a 25-s free scan), ClipLog, Floor Cam (the 3-D
office through a CCTV camera).

Events from day 2 (1–3 per shift): virus pop-ups, police raid (12 s to minimise everything or
lose 20% of today's money), air strike (−15%), power cut (the caller drops), Krull walking the
floor (casino/clicker/browser open = a strike; three strikes = called in).

## Status (2026-10-19)

Built and verified on localhost: title, break room, 3-D floor walk, clock-in dolly, Harbour OS,
Phone with the scripted brain, all ten product apps, market, casino, clicker, pigeon, surf,
playbook, wallpapers, antivirus, log, floor cam, all five events, review, promotion and
termination sheets. `npm run check` clean; craft audit 0 FAIL on the title.

Co-op (2026-10-19, afternoon): `server/` is a Cloudflare Worker with one Durable Object per room
(four-letter code, 1–8 players). The room owns TEAM, quota, day and the shift clock; each browser
runs its own calls and reports every payout (`pay`) and desk loss (`loss`); the room broadcasts the
state and the host drives the day (`start`, `clockin`, `next`). The client is `src/net/`
(room.ts socket, coop.ts glue, floor.ts avatars) plus the lobby in `src/ui/lobby.ts`. Verified with
two headless Chromes in one room: same TEAM/QUOTA/REVIEW, a payout across in under a second, both
sheets ranked, a raid's loss shared, fired → host restarts → both on day 1, drop → local totals →
rejoin. Not deployed.

Later: a 3-D review room with the projector, character creator, a second floor, achievements.
