# Research: *Scam With Your Friends* (Steam, 2026)

Written 2026-10-19 from the Steam store page and its JSON APIs, 62 Steam reviews, the five
official patch notes (Hotfix 2, Hotfix 3, 0.1.73, 0.1.78, 0.1.82), the publisher's site, and
three fan wikis. Everything marked **(fan)** comes from an unofficial guide and is unverified;
everything marked **(seen)** was read off an official screenshot. The game is Early Access, so
numbers drift between patches.

## 1. Identity

| | |
|---|---|
| Title | Scam With Your Friends (Steam app 4954910) |
| Developers / publisher | JakeHub, Metater / Jatater Worldwide |
| Release | Early Access 15 Oct 2026, full release targeted mid-Dec 2026 |
| Price | $9.99 (10% launch discount to $8.99 until 29 Oct) |
| Platform | Windows only (Mac/Linux/Proton "unsupported"); Unity, first person (fan) |
| Players | 1–8 per lobby (Hotfix 2); solo, friends co-op, public lobbies with filters |
| Steam tags | Artificial Intelligence, Online Co-Op, Job Simulator, Voice Control, Dark Comedy, Funny, Simulation, Crime, Dialogue Heavy, Party Game, Hacking, Co-op Campaign, Time Management, Villain Protagonist, Perma Death, Procedural Generation, Moddable |
| Features | Steam Workshop, full controller support, family sharing, 23 languages with full audio, "Connects to 3rd-party service for AI content generation: OpenRouter" |
| Age ratings | 16 in Brazil/Germany (drugs, crime, language), 18 in Indonesia (gambling simulation) |
| Reception | Very Positive, 82% of 1,525 English reviews (2,287 total = Mostly Positive); peak 28,983 concurrent players on launch day; 600,000 wishlists |

Official pitch: "Run a scam call center with your friends. Use increasingly ridiculous schemes
to trick AI callers out of their life savings. Hit your daily quota, cause chaos around the
office, and survive a brutal performance review from your rageaholic boss." Setting: a scam call
centre in Kolkata, India (the in-game OS is literally called "Kolkata OS").

Key features list (store): online co-op or public lobbies; single player; real-time AI
conversations; ridiculous scam scenarios; run-based progression with increasingly chaotic
workdays; remote access to victim computers; in-game paint app, screen recorder and camera;
survive computer viruses, police raids, air strikes and other workplace disasters; heavily
moddable (JSON personalities + WAV voice cloning).

## 2. The run, start to finish

1. **Main menu** → character creation, mic test, EULA/privacy notice. Settings have a Speech
   tab (language, Whisper/Moonshine/Deepgram recognition, Qwen3 TTS, auto mic levelling,
   caller filler words), Family Friendly mode, Streamer mode, Disable Call Saving.
2. **Lobby**: solo, host, join by code / Steam invite, or public lobbies ("My version first"
   sorting, player-count and country filters). Prestige counts show above player names.
3. **Break room** (seen): fridge, microwave, a table, a TV that promotes community videos, and
   a whiteboard reading *Daily Targets — 1. Scam 2. Scam alot 3. Redeem IT! 4. Teamwork ☺*.
4. **Office floor** (seen): rows of cubicles with navy partitions, grey carpet, warm orange
   light, sticky notes ("STAY AWAKE"), monitors with webcams. Players walk in first person,
   sit at any free PC, or slap/tackle a colleague off theirs (Knockdown Protection setting).
   Props can be picked up and thrown; fires are put out with an extinguisher; NPC colleagues
   wander the floors; promotions move the team to a higher floor (fan: "reach the top floor").
5. **Kolkata OS** boots on the monitor (seen: a boot screen with the boss's angry face) and
   the desktop fills the screen. The whole scam game happens inside this fake desktop.
6. **Calls** arrive one after another until the shift timer runs out (taskbar: *PERFORMANCE
   REVIEW 8:54* counting down; reviews mention roughly 10–20 minute shifts, one says "11 mins").
7. **Performance review** (seen): a dark conference room with a projector. Slides titled
   *Call Analysis* show transcript highlights and the players' recorded webcam moments; the
   boss narrates an AI-generated roast (it also reads the in-game browser history). Players
   can hold a "review-skip door" to clock out.
8. **Pass** → next day, higher quota, new unlocks (fan: a "Day Unlocks" screen). **Fail** →
   the screen reads *YOU'RE FIRED! Quota missed by $1,000*, the room fills with fire and red
   fog, and a *KOLKATA TERMINATION REPORT — EVERYONE'S FIRED* sheet ranks every player by
   total earned, time worked and average per day (seen: "1 DAY · $4,400 team total",
   #1 Ahmed $1,600 … #4 Metater $400). The run is over (Perma Death tag).

Quotas (seen in the taskbar): Day 1 solo **$600**; other screenshots show QUOTA $1,400 and
$1,750 with TEAM totals of $14,000–$26,000. A fan guide claims $960 for two players on day 1.
In-game dates run Wed 26 Aug 2026 → Sat 29 Aug 2026 across the screenshots, so one day per
shift. Solo runs use a lower quota (fan).

Taskbar HUD, right side (seen): `PERSONAL $3,049` · `TEAM $14,000 / QUOTA $1,750` ·
`PERFORMANCE REVIEW 0:11` · clock and date. Left side: power button and pinned apps
(Script, Phone, Camera, Browser, Scamazon, + open windows).

## 3. The Phone and the callers

- Window titled **Phone**. Top: *CALLER TRUST* with a state word and percentage on a bar —
  **TRUSTING 75%** (green), **ANGRY 0% / 5% / 50%** (red). Then the caller's full name, a
  cartoon portrait (2-D illustration, big expressive face), an audio waveform, the transcript
  (caller bubbles blue, player bubbles brown with the player's name), a status line
  (*MESSAGE SENT – WAITING*), a text field (you can type instead of speaking), and buttons
  **Hang Up** (red), speaker and mic (green). Mic sensitivity 50–200% on hover.
- Incoming call pop-up (seen): round portrait, name, *Incoming Call…*, red decline / green
  answer.
- Callers seen: Dorothy Mayfield (grandmother), Franklin D. Hyper (crypto bro: "I'm launching a
  new token, idiot. It's going to the moon while you're still begging"), Brittany "Lexi"
  Summers, Commander Miles "Orbit" Vega (astronaut who reads his AnyViewer code "029-527 …
  by the book, Commander"), Eleanor "Granny" Grimshaw (witch: "My Social Security number! Oh
  dear, they said it's been compromised. That's a bad omen. 822-92-9373"), Damien Holloway,
  Shanice "Dee" Bishop. Reviews mention a vampire disputing a $5,500 garlic charge and a
  cereal-obsessed rabbit with Bitcoin. Fan sites say ~1,000 characters.
- Personalities: friendly/elderly, suspicious/tech-savvy, eccentric, and **scambaiters** who
  waste your time and try to get *you* hacked (a computer virus). Trust rises with a
  believable role and patience, falls with insults or rushing; several reviews say the AI is
  too sycophantic ("you win every call in 20–40 seconds"). Each player works through the
  caller pool before repeats (0.1.73). Hosts can add community/Workshop callers to the Daily
  Callers queue; a Character Creator lets you draw a portrait (mirror drawing) and import a
  WAV/MP3 voice.
- Tech: caller "brain" = an LLM through OpenRouter (official backend, or the host's own
  OpenRouter key; Gemini 2.5 Flash Lite during the playtest; reviews mention DeepSeek/Qwen).
  Speech-to-text runs locally (Whisper, Moonshine for 6 languages) or via your own Deepgram
  key; voices are local (Qwen3 TTS on a capable GPU, otherwise a lighter "MOSS" voice).
  Typing is always available. The game needs a broadband connection.

## 4. The scams (how money is made)

Every scam = talk the caller into cooperating, then **complete a task in the matching app**,
then the money lands in the taskbar counter with a floating *+$250*. Confirmed scams:

| Scam | App / step | Payout |
|---|---|---|
| Social Security Stealer | **Identity**: "Validate a caller's taxpayer record and Social Security number" → type the SSN (XXX-XX-XXXX) → Verify → *Scam complete — $250 earned* (seen) | $250 |
| Credit card | **Credit Card** app: number, then security code, then expiry | varies |
| Gift cards | **Gift Cards** app: the classic "your card didn't work, do you have a gift card?" — read the code (the most used scam per reviews) | varies |
| Remote access | **AnyViewer**: "Enter caller's connection code — enter the one-time code exactly as the caller reads it" (e.g. 029-527) → Connect → you are on the caller's desktop (PrivateMail with private photos, files, recovery details) | enables others |
| Password Recovery | use AnyViewer to obtain the recovery details (favourite colour etc.) | – |
| Bitcoin / Meme Coin | live investment round: pitch the coin, caller invests, value rises toward a randomly timed crash, **you choose when to cash out (max $700)**; reassuring the caller delays their withdrawal but can't stop the crash; cashing out during the crash keeps what's left; losing the caller or waiting too long forfeits it | ≤ $700 |
| Lottery Prize | caller emails you their ticket → enter the confirmation code → scratch three numbers | $0 / $200 / $500 / $1,000 (5% jackpot) |
| Police Impersonation | collect the caller's fine-payment confirmation number | fixed |
| Investment / Business Investment | enter the caller's invoice number; payout = the amount agreed on the call | agreed |
| Romance, Utility Billing | objective = clear agreement to the proposed plan/amount (0.1.82) | – |
| Fake bank alert / unrecognised charge, prize redemption, charity, tech-support virus, IRS fine | opening hooks and (fan) variants | – |

Scams are bought in the **Scamazon Market → Scams** tab; the desktop fills with one icon per
owned scam (seen on a late-game desktop: Healthcare, Gym Membership, CCTV, Lung Cancer, Child
Care, Charity, Dentist, Nobel Prize, Pandemic, Cookie Consent, Mailbox, School, Garlic Phone,
Coin Futures, Retirement Fund, Airplane, Biohazard, Cave Diving, Medical Visit, Hurricane,
Wi-Fi Support, Video Game, Radioactive, Ethereum Wallet, Nuke, Lightning, Dating, Bomb Threat,
Birthday, Cardiac Care, Subway, Wheelchair). A fan guide says Gift Cards is free on day 1 and
Credit Card costs $200.

## 5. The desktop apps

Starter desktop (seen): Script, Browser, Phone, Meteor Cookie, Gift Cards, Scamazon (with a
notification badge), Credit Card, Zoomy, Camera, Backgrounds, Disscord. Later: Banditcam,
JW Paint, Malwarebits, Identity, AnyViewer, Mailbox.

- **Script** — the scam script you are supposed to follow.
- **Browser** — a real embedded browser (the source of the privacy backlash: it showed
  players' real IP location; history feeds the boss roast; now behind a privacy confirmation
  and blocked in Family Friendly mode).
- **Camera** — live view of the office from your webcam, with a *Show* toggle; other
  players appear in it.
- **Banditcam** — auto-records calls to `Documents\…\Videos` ("background recording has
  started" joke pop-up). Review footage comes from it. Now optional (Disable Call Saving).
- **Scamazon Market** (seen) — tabs *Scams · Business apps · Games & software · Physical
  goods*; cards with icon, name, one-line joke, price and a **HOLD TO BUY** button (or
  *NEED $35* when you can't afford it). Physical goods: Bear Mace $35, Remote-Work Sniper
  $1,800, Conflict Resolution Shotgun $650, Customer Support Riot Shield $120, Motivational
  Taser $350, Batton (Definitely Spelled Right), Traq Gun, AK-47 Office Standard, FGM-148
  Javelin, *Airstrike the Rival Scammers* $9,000, *Airstrike Yourselves* $6,000 ("Team morale
  may vary").
- **Rainbit** (seen) — "the original office casino": crash, mines, plinko, dice, slots,
  coinflip, keno, roulette, baccarat, poker; bets come from your personal balance.
- **Meteor Cookie** (seen) — cookie clicker with Automation / Click Power / Boosts / Synergies
  tabs ("Automation unit: Security Screener", "Lifetime cookie mass 77.9 thousand").
- **Disscord** (seen) — fake messenger with contacts; "You received a Disscord Nitro gift,
  1 month free, click to claim" (a bait).
- **Malwarebits** — antivirus with a *Remove virus* button; viruses come from scambaiters
  and spawn pop-ups (disabled on laptops for performance).
- **Zoomy**, **Mailbox/PrivateMail**, **JW Paint**, **Backgrounds** (wallpapers), **Gift
  Cards**, **Credit Card**, **Identity**, **AnyViewer**.

## 6. Disasters and office chaos

Computer viruses and computer bombs (from scambaiters or bad clicks), police raids, air strikes
(purchasable against rivals or yourselves), fires (extinguisher), bomb threats, nukes, lightning,
hurricanes, pandemics (icon names seen), thrown props, tackles and knockdowns, poop to clean up,
fart clouds (green gas seen in two screenshots), fireworks/confetti.

## 7. Reception, in the players' words

Praised: the absurd conversations, co-op chaos, "seeing at the end of each round what your
friends have been up to", the concept.

Criticised (mostly negative reviews): privacy (recordings saved to disk without a clear
notice; the browser leaking location; "the game stays running after quit"); AI outages ("AI
service temporarily unavailable") and the devs asking for donations on day one because cloud
AI costs more than the $10 price covers; speech recognition failing on accents; performance
degrading over long sessions; the loop getting repetitive after 1–3 hours ("every day is the
same", "no real interplay between players"); the AI folding too easily; the Kolkata setting
read as racist by some.

## 8. Visual style (from 20 store screenshots + 10 site screenshots)

- **3-D world**: Unity, stylised low-poly, warm amber lighting with heavy orange bounce;
  characters are blocky with oversized heads, orange skin, cartoon beards/moustaches, headsets,
  bright shirts (teal, red, yellow, green) and floating name tags. Office: navy cubicle
  partitions, beige desks, grey carpet, CRT-style monitors with clip-on webcams, sticky notes,
  posters, fluorescent tube lights. Break room: cream walls, kitchen counter, whiteboard,
  potted plant, fire extinguisher. Review room: dark, projector beam, yellow slides.
- **Kolkata OS**: a Windows-like desktop with a photographic wallpaper (snowy mountains,
  a desert canyon at dusk), a grid of flat, brightly coloured square app icons with white
  glyphs and small labels, dark taskbar with a red/green/white HUD, and windows with a
  light title bar (icon, title, minimise/maximise/close in red). App UIs are flat web-style:
  red and green primary buttons, cards, tabs.
- **Portraits**: hand-drawn cartoon busts on a dark panel, strong outlines, exaggerated
  expressions (one per caller; the Character Creator draws them the same way).
- **Type**: condensed bold display (the site uses Anton/Impact) for titles like EVERYONE'S
  FIRED; a plain sans for the OS.
- **Colour**: amber/orange world, navy partitions, red = danger (angry, fired, hang up),
  green = money/trust, yellow accents (slides, name tags, HOLD TO BUY).

## 9. Why people buy it (what the remake must keep)

1. Talking to a character who talks back, and the comedy of improvising a lie.
2. A visible trust meter that reacts to what you say.
3. The two-part scam: words first, then a small desktop task that pays.
4. A ticking shift and a quota the whole room shares.
5. Chaos valves: the casino, the clicker, the shop of absurd goods, slapping colleagues.
6. The end-of-day review that replays everyone's dumbest moment, and the brutal firing.

## Sources

- Store page and JSON: store.steampowered.com/app/4954910 (+ /api/appdetails, /appreviews)
- Patch notes: steamcommunity.com/games/4954910/announcements (Hotfix 2/3, 0.1.73, 0.1.78, 0.1.82)
- Publisher: jataterworldwide.com/scam-with-your-friends
- Fan wikis: scam-with-your-friends.wiki (/guide/scams, /guide/how-to-play, /guide),
  scam-with-your-friends.github.io, dq7reimagined.com, scamwithyourfriends.net,
  crimenetgazette.com (launch and 0.1.73 coverage), opengame.app, xmodhub.com
