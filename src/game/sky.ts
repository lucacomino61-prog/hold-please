// The night sky over Port Fortune, for the Star Registry: five constellations and the loose stars around them.
// Fixed for everyone (a seeded layout), so a caller's clue ("an orange one, just left of the Kettle") points at one
// star the player then has to find on the chart. Coordinates are 0–1 across the chart.
export interface Constellation { name: string; x: number; y: number; stars: [number, number][] }
export interface SkyStar { x: number; y: number; colour: 'white' | 'blue' | 'orange' | 'red' | 'yellow'; size: number; near: number; where: string }

export const CONSTELLATIONS: Constellation[] = [
  { name: 'the Ladle', x: 0.17, y: 0.3, stars: [[-0.07, -0.05], [-0.03, -0.03], [0.01, -0.02], [0.05, 0.01], [0.05, 0.07], [0.1, 0.07], [0.1, 0.01]] },
  { name: 'the Kettle', x: 0.46, y: 0.22, stars: [[-0.05, 0.05], [0.05, 0.05], [0.06, -0.02], [-0.06, -0.02], [0, -0.07], [0.1, -0.06]] },
  { name: 'the Goose', x: 0.79, y: 0.28, stars: [[-0.08, 0.06], [-0.03, 0.02], [0.01, -0.01], [0.04, -0.06], [0.08, -0.09], [0.03, 0.06]] },
  { name: 'the Crown', x: 0.27, y: 0.74, stars: [[-0.08, 0], [-0.04, -0.06], [0, -0.01], [0.04, -0.06], [0.08, 0]] },
  { name: 'the Tuba', x: 0.68, y: 0.72, stars: [[-0.06, -0.06], [-0.02, -0.03], [0.01, 0.01], [0.06, 0.02], [0.08, 0.07], [0.03, 0.08]] },
];

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** the loose stars a caller can own: each sits near one constellation, in one direction from it */
export const SKY: SkyStar[] = (() => {
  const r = rng(20261028);
  const colours: SkyStar['colour'][] = ['white', 'blue', 'orange', 'red', 'yellow'];
  const out: SkyStar[] = [];
  let guard = 0;
  while (out.length < 64 && guard++ < 4000) {
    const x = 0.04 + r() * 0.92, y = 0.06 + r() * 0.88;
    // keep clear of the constellations' own stars and of each other
    if (CONSTELLATIONS.some((c) => c.stars.some(([dx, dy]) => Math.hypot(c.x + dx - x, c.y + dy - y) < 0.035))) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.y - y) < 0.045)) continue;
    let near = 0, best = 9;
    CONSTELLATIONS.forEach((c, i) => { const d = Math.hypot(c.x - x, c.y - y); if (d < best) { best = d; near = i; } });
    const c = CONSTELLATIONS[near];
    const dx = x - c.x, dy = y - c.y;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left of' : 'right of') : (dy < 0 ? 'above' : 'below');
    const where = `${best > 0.17 ? 'well' : 'just'} ${dir} ${c.name}`;
    out.push({ x, y, colour: colours[Math.floor(r() * colours.length)], size: 0.6 + r() * 1.1, near, where });
  }
  return out;
})();

/** what the caller says about their star */
export function clueFor(i: number): string {
  const s = SKY[i];
  return `the ${s.colour} one, ${s.where}`;
}
