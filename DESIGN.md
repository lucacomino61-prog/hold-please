# Hold Please — design

A browser remake of the *Scam With Your Friends* loop (see `docs/RESEARCH.md`): same kind of
game, own name, own world, own art, own words. Nothing is copied from the original: no names,
no portraits, no icons, no copy.

## World

**Sunrise Customer Care Ltd.**, 7th floor of a half-empty tower in **Port Fortune**, an
invented free-port city. Night shift. Floor manager **Mr. Krull**, who speaks in capitals.
Dark comedy: the player is the villain, the callers are cartoons, every number is fake. The
game never explains a real scam in enough detail to work; the dialogue stays at cartoon logic
("your card didn't go through, do you have a gift card?").

## Vocabulary (awwwards-blueprints)

- **Poster type**: *Bebas Neue* for titles and the fired sheet (150–480 px on the title
  screen, fluid), *Inter* for everything else. Loaded from Google Fonts with `font-display:
  swap` and a size-adjusted Impact/Arial Narrow fallback so the giant title does not shift.
- **Two colours**: **amber** `--amber: oklch(0.80 0.16 70)` and **ink** `--ink: oklch(0.22
  0.04 250)`. Semantic only: `--danger` (hang up, angry, fired), `--money` (payouts, trust).
- **Signature moment — "Clock in"**: on the office floor the camera dollies into the CRT until
  the glass is the whole view; the boot screen plays on the monitor texture; the DOM desktop
  takes over in the same framing. At the end of the shift the desktop shrinks back into the
  monitor and the review room lights up. Everything else is quiet craft.
- **One requestAnimationFrame owner**: `src/world/loop.ts` (three.js render loop). It also
  ticks the shift clock. UI motion is CSS/WAAPI. No second engine.
- **Stop animations**: `html[data-motion="off"]` from the title screen and Settings;
  `prefers-reduced-motion` honoured; the 3-D office falls back to a still frame.
- **Loader with skip**: the title screen warms the office scene and the voices behind the
  *Dial in* button, which is enabled as soon as the core is ready.
- **List views**: shop, caller log and the report are plain lists/tables.

## Harbour OS (the fake desktop)

- **Wallpaper**: procedural canvas — dusk over a harbour, two-colour gradient, grain. No photos.
- **Icons**: 64 px tiles, 14 px radius, flat colour per app, white inline-SVG glyph (own
  glyphs), 12 px label with a 1 px shadow. Grid 96 × 104 px, column-first like a desktop.
- **Windows**: light chrome `#F4F1EA`, 1 px `--line`, 10 px radius, 32 px title bar with the
  app glyph, title 13/600, controls – □ × (× turns `--danger` on hover). Shadow
  `0 24px 48px -24px oklch(0 0 0 / .5)`. Drag by the title bar, click to focus (z-order),
  min 320 × 220, kept inside the viewport. Open: 180 ms, `scale(.96)→1` + fade. Close: 120 ms.
- **Taskbar**: 48 px, `--ink`. Left: power, pinned apps, open windows. Right HUD in tabular
  figures: `PERSONAL $0` · `TEAM $0 / QUOTA $600` · `REVIEW 9:58` · clock. Money in
  `--money`, review countdown turns `--danger` under 60 s with a 1 Hz pulse.
- **Phone window** (360 × 620): trust meter (label, state word, %, 6 px bar, 300 ms ease-out),
  caller name, portrait panel (dark), transcript (caller bubbles ink-blue, player bubbles
  amber-brown, 14 px), status line, text field + Send, **Hang up** (`--danger`), mic
  (`--money`, press-to-talk, pulses while listening).
- **Payout**: `+$250` floats 40 px up over 700 ms in `--money` and the HUD ticks.
- **Fired**: red fog + fire overlay 2.5 s, then the termination sheet (paper `#FFF8E7`, red
  rule, table).

## Portraits

Procedural cartoon busts in SVG: head shape, skin tone, hair, brows, eyes, mouth, accessory
(glasses, hat, headset, moustache, earrings), seeded by the caller id; calm and angry
expressions swapped with the mood. Bold 3 px outline, flat fills, no gradients.

## The office (three.js)

Low-poly, flat colours, `MeshStandardMaterial`, warm amber key light, cool fill, light fog.
Cubicle grid (instanced partitions), beige desks, CRT monitors with emissive screens, chairs,
blocky colleagues (box torso, round head, headset ring, bright shirts) with idle typing, name
tags as sprites. Break room: counter, fridge, table, whiteboard with the day's targets. Review
room: long table, projector screen (CanvasTexture slides), Mr. Krull as a silhouette.
First person: WASD + mouse look (pointer lock), E to sit, click a colleague to slap them off
their chair (spring tumble). Budget: < 300 draw calls, < 1.5 MB, no textures except canvases.

## Copy voice

Deadpan corporate ("Sunrise Customer Care values your loyalty"), Mr. Krull in capitals, callers
each with one gimmick. No slurs, no real-world ethnic framing, no real company names.
