// Procedural cartoon busts, one per caller kind: humans, a cat, a raccoon, a goose, a bear, machines,
// ghosts, an alien, the Moon, a cloud and three kids in a trenchcoat. Bold outlines, flat fills, and since
// round 18 a second pass of definition: irises and catchlights, lids and lashes, a real nose, skin shading
// clipped to the head, hair strands and a highlight, collars and ties, fur, panels, craters.

export type PortraitKind = 'human' | 'cat' | 'raccoon' | 'goose' | 'bear' | 'robot' | 'ghost' | 'alien' | 'moon' | 'cloud' | 'trenchcoat' | 'toaster' | 'initials';
export type Mood = 'calm' | 'angry' | 'happy';

export interface PortraitSpec {
  seed: number;
  kind: PortraitKind;
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3 | 4 | 5;
  shirt: string;
  glasses: boolean;
  hat: 0 | 1 | 2 | 3 | 4 | 5;   // 0 none, 1 beanie, 2 cap, 3 pointed hat, 4 helmet, 5 pirate hat
  moustache: boolean;
  earrings: boolean;
  headShape: 0 | 1 | 2;
  age: 'young' | 'adult' | 'old';
  freckles: boolean;
  headset: boolean;
  photo?: string;     // a real portrait: a URL (the packs point at Wikipedia lead images) or a data URL (the Creator's upload)
  credit?: string;    // who took it and under what licence, shown in the codex
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a86b3c', '#6b4a2b', '#f7d7c4'];
const HAIRS = ['#2b1b10', '#4a2f1a', '#1a1a1a', '#c7a26b', '#8a8a8a', '#e6e6e6', '#b5462e', '#5a3a8a'];
const SHIRTS = ['#2bb3a3', '#e9c84a', '#d94b4b', '#4a78d9', '#8e5ad6', '#3fa34d', '#f08a24', '#e3e3e3'];
const IRISES = ['#4a2f1a', '#2e5a8a', '#3a6a3a', '#6a4a2a', '#5a4a8a', '#2b2b2b', '#7a5a1a', '#3a7a8a'];

export function specFor(id: string, overrides: Partial<PortraitSpec> = {}): PortraitSpec {
  const h = hash(id);
  const p = (n: number) => (h >>> (n * 3)) & 7;
  const spec: PortraitSpec = {
    seed: h, kind: 'human',
    skin: SKINS[p(0)], hair: HAIRS[p(1)], hairStyle: (p(2) % 6) as PortraitSpec['hairStyle'], shirt: SHIRTS[p(3)],
    glasses: p(4) < 3, hat: (p(5) % 4) as PortraitSpec['hat'], moustache: p(6) < 2, earrings: p(7) < 2,
    headShape: (p(8) % 3) as PortraitSpec['headShape'], age: 'adult', freckles: p(9) < 2, headset: false,
  };
  return { ...spec, ...overrides };
}

const L = '#1b1b1b';
const sw = (w = 3) => `stroke="${L}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const shade = (hex: string, k: number): string => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
const pick = <T,>(seed: number, n: number, list: T[]): T => list[((seed >>> (n * 4)) & 15) % list.length];

// ---- shared face parts (centred on 80,80) ----
function eyes(mood: Mood, kind: PortraitKind, seed = 0, lids = false): string {
  const cat = kind === 'cat';
  const iris = pick(seed, 1, IRISES);
  const pupil = (cx: number) => cat
    ? `<ellipse cx="${cx}" cy="80" rx="5" ry="6.5" fill="${iris}"/><ellipse cx="${cx}" cy="80" rx="2" ry="6" fill="${L}"/><circle cx="${cx + 2}" cy="77" r="1.2" fill="#fff"/>`
    : `<circle cx="${cx + 1}" cy="80.5" r="5" fill="${iris}"/><circle cx="${cx + 1}" cy="80.5" r="3.2" fill="${L}"/><circle cx="${cx + 2.6}" cy="78.4" r="1.4" fill="#fff"/><circle cx="${cx - 0.6}" cy="82.4" r=".7" fill="#fff"/>`;
  if (kind === 'robot' || kind === 'toaster') {
    const glow = mood === 'angry' ? '#ff4a4a' : mood === 'happy' ? '#6cf0a6' : '#7fd8ff';
    const shape = mood === 'angry' ? 'M56 76l16 6v6H56zM104 76l-16 6v6h16z' : mood === 'happy' ? 'M56 84a8 8 0 0 1 16 0zM88 84a8 8 0 0 1 16 0z' : 'M56 74h16v12H56zM88 74h16v12H88z';
    return `<path d="${shape}" fill="${glow}" ${sw(2)}/><path d="${shape}" fill="none" stroke="#fff" stroke-width="1" opacity=".5" transform="translate(1 1) scale(.9)" transform-origin="80 80"/>`;
  }
  if (kind === 'ghost') {
    return mood === 'happy' ? `<path d="M60 82c3-6 9-6 12 0M88 82c3-6 9-6 12 0" fill="none" ${sw(4)}/>` : `<ellipse cx="66" cy="82" rx="6" ry="${mood === 'angry' ? 5 : 8}" fill="${L}"/><ellipse cx="94" cy="82" rx="6" ry="${mood === 'angry' ? 5 : 8}" fill="${L}"/><circle cx="68" cy="78" r="1.6" fill="#fff" opacity=".8"/><circle cx="96" cy="78" r="1.6" fill="#fff" opacity=".8"/>`;
  }
  if (mood === 'happy') return `<path d="M58 80c4-7 12-7 16 0M86 80c4-7 12-7 16 0" fill="none" ${sw(4)}/><path d="M57 69c5-4 12-4 17 0M86 69c5-4 12-4 17 0" fill="none" ${sw(3)}/>`;
  const white = (cx: number) => `<ellipse cx="${cx}" cy="80" rx="8" ry="${mood === 'angry' ? 5.5 : 7.5}" fill="#fff" ${sw(2.5)}/>`;
  const lid = (cx: number) => lids || mood === 'angry' ? `<path d="M${cx - 8} 76c3-4 13-4 16 0" fill="none" ${sw(2.5)}/>` : `<path d="M${cx - 7} 74.5c3-3 11-3 14 0" fill="none" stroke="${L}" stroke-width="1.6" opacity=".55"/>`;
  const brows = mood === 'angry'
    ? `<path d="M56 68l18 7M104 68l-18 7" fill="none" ${sw(4.5)}/>`
    : `<path d="M56 70c5-5 13-5 18-1M86 69c5-4 13-4 18 1" fill="none" ${sw(3.5)}/>`;
  return white(66) + white(94) + pupil(66) + pupil(94) + lid(66) + lid(94) + brows;
}

function mouth(mood: Mood, kind: PortraitKind): string {
  if (kind === 'goose') return `<path d="M64 96c6-6 26-6 32 0l-4 12H68z" fill="#f08a24" ${sw()}/><path d="M66 100h28" fill="none" ${sw(2)}/><path d="M70 106h20" fill="none" stroke="#c96a12" stroke-width="2"/>`;
  if (kind === 'robot' || kind === 'toaster') {
    return mood === 'angry' ? `<path d="M62 106l6-4 6 4 6-4 6 4 6-4 6 4" fill="none" stroke="#ff4a4a" stroke-width="3"/>` : mood === 'happy' ? `<path d="M62 102h36v6H62z" fill="#6cf0a6" ${sw(2)}/>` : `<rect x="66" y="102" width="28" height="4" fill="#7fd8ff" ${sw(2)}/><path d="M72 102v4M80 102v4M88 102v4" stroke="${L}" stroke-width="1.5"/>`;
  }
  if (mood === 'angry') return `<path d="M64 110c8-9 24-9 32 0" fill="none" ${sw(4)}/><path d="M68 108c6-4 18-4 24 0" fill="#fff" stroke="none"/><path d="M72 106v3M80 105v4M88 106v3" stroke="${L}" stroke-width="1.5"/>`;
  if (mood === 'happy') return `<path d="M60 100c6 16 34 16 40 0z" fill="#8b1e1e" ${sw()}/><path d="M66 101h28v4H66z" fill="#fff"/><ellipse cx="80" cy="111" rx="9" ry="4" fill="#d14a5a"/>`;
  return `<path d="M66 104c7 6 21 6 28 0" fill="none" ${sw(4)}/><path d="M70 107c5 3 15 3 20 0" fill="none" stroke="#fff" stroke-width="1.5" opacity=".35"/>`;
}

function nose(kind: PortraitKind): string {
  if (kind === 'cat') return `<path d="M76 90l4 4 4-4z" fill="#e58ea3" ${sw(2)}/><path d="M80 94v4M74 99c3 2 9 2 12 0" fill="none" ${sw(2)}/>`;
  if (kind === 'raccoon' || kind === 'bear') return `<ellipse cx="80" cy="94" rx="7" ry="5" fill="${L}"/><ellipse cx="77" cy="92" rx="2" ry="1.3" fill="#fff" opacity=".8"/>`;
  if (kind === 'human' || kind === 'trenchcoat' || kind === 'alien') return `<path d="M80 82c-3 7-5 10 0 12" fill="none" ${sw(2.5)}/><path d="M76 94c2 1 6 1 8 0" fill="none" stroke="${L}" stroke-width="2" opacity=".7"/><ellipse cx="84" cy="93" rx="1.6" ry="1" fill="${L}" opacity=".5"/><ellipse cx="76" cy="93" rx="1.6" ry="1" fill="${L}" opacity=".5"/>`;
  return '';
}

function cheeks(mood: Mood): string {
  if (mood === 'angry') return '';
  return `<ellipse cx="58" cy="92" rx="5" ry="3" fill="#ff8a8a" opacity=".45"/><ellipse cx="102" cy="92" rx="5" ry="3" fill="#ff8a8a" opacity=".45"/>`;
}

/** a shadow down one side and a highlight on the forehead, clipped to the head shape (depth without a gradient) */
function shading(clipId: string): string {
  return `<g clip-path="url(#${clipId})"><ellipse cx="112" cy="92" rx="28" ry="50" fill="#000" opacity=".10"/><ellipse cx="70" cy="56" rx="18" ry="9" fill="#fff" opacity=".16"/><ellipse cx="80" cy="128" rx="40" ry="10" fill="#000" opacity=".12"/></g>`;
}

// ---- heads per kind ----
function humanHead(s: PortraitSpec, mood: Mood): string {
  const head = s.headShape === 0 ? '<ellipse cx="80" cy="80" rx="37" ry="44"/>' : s.headShape === 1 ? '<rect x="43" y="37" width="74" height="86" rx="26"/>' : '<path d="M45 62c0-22 16-30 35-30s35 8 35 30v26c0 22-16 36-35 36S45 110 45 88z"/>';
  const hairCol = s.age === 'old' ? '#e6e6e6' : s.hair;
  const hairDark = shade(hairCol, 0.72), hairLight = shade(hairCol, 1.35);
  const hairs = ['',
    '<path d="M43 72c-2-30 18-44 37-44s39 14 37 44c-10-14-22-18-37-18S53 58 43 72z"/>',
    '<path d="M41 66c0-34 22-46 39-46s39 12 39 46l-8 4c-4-16-16-24-31-24S52 54 49 70z"/><rect x="39" y="62" width="12" height="38" rx="6"/><rect x="109" y="62" width="12" height="38" rx="6"/>',
    '<path d="M45 58c6-26 22-34 35-34s29 8 35 34c-8-6-20-8-35-8s-27 2-35 8z"/>',
    '<circle cx="56" cy="42" r="12"/><circle cx="80" cy="32" r="14"/><circle cx="104" cy="42" r="12"/><circle cx="118" cy="64" r="10"/><circle cx="42" cy="64" r="10"/>',
    '<path d="M47 64c0-26 14-38 33-38s33 12 33 38c-6 0-10-6-14-10-8 6-30 6-38 0-4 4-8 10-14 10z"/>'];
  // strands and a highlight on the hair, matched to the style
  const strands = ['', `<path d="M60 44c6-6 14-8 20-8M92 40c6 2 12 6 16 12" fill="none" stroke="${hairDark}" stroke-width="2"/><path d="M58 50c8-8 20-10 30-8" fill="none" stroke="${hairLight}" stroke-width="2.5" opacity=".6"/>`,
    `<path d="M56 46c8-10 20-14 30-12M98 40c6 4 10 10 12 18M44 70v26M116 70v26" fill="none" stroke="${hairDark}" stroke-width="2"/><path d="M62 42c8-8 18-10 26-8" fill="none" stroke="${hairLight}" stroke-width="2.5" opacity=".55"/>`,
    `<path d="M58 44c8-8 16-12 22-12M100 44c-4-6-10-10-16-12" fill="none" stroke="${hairDark}" stroke-width="2"/><path d="M62 40c6-6 12-8 18-8" fill="none" stroke="${hairLight}" stroke-width="2.5" opacity=".6"/>`,
    `<circle cx="52" cy="38" r="4" fill="${hairLight}" opacity=".5"/><circle cx="76" cy="26" r="5" fill="${hairLight}" opacity=".5"/><circle cx="106" cy="38" r="4" fill="${hairLight}" opacity=".5"/>`,
    `<path d="M60 46c6-10 14-14 20-14M100 46c-6-10-14-14-20-14" fill="none" stroke="${hairDark}" stroke-width="2"/><path d="M80 30c-4 6-6 14-4 22" fill="none" stroke="${hairLight}" stroke-width="2.5" opacity=".55"/>`];
  const hats = ['',
    `<path d="M41 58h78v10H41z M54 58V38a26 26 0 0 1 52 0v20z" fill="#2c2c2c" ${sw()}/><path d="M58 50c6-10 16-14 22-14" fill="none" stroke="#5a5a5a" stroke-width="2"/>`,
    `<path d="M36 62c10-6 78-6 88 0l-6 8c-14-6-62-6-76 0z M54 60V42c0-10 12-16 26-16s26 6 26 16v18z" fill="#c8102e" ${sw()}/><circle cx="80" cy="26" r="3.5" fill="#8a0a1e"/><path d="M60 50c4-8 12-12 20-12" fill="none" stroke="#e85a6a" stroke-width="2" opacity=".6"/>`,
    `<path d="M46 62l34-48 34 48z" fill="#6c4fd6" ${sw()}/><path d="M60 58l20-30 20 30" fill="none" stroke="#8d74ee" stroke-width="2" opacity=".6"/><circle cx="80" cy="14" r="6" fill="#ffd166" ${sw()}/><path d="M38 62h84v8H38z" fill="#6c4fd6" ${sw()}/>`,
    `<path d="M44 70V52a36 36 0 0 1 72 0v18z" fill="#9aa3b8" ${sw()}/><path d="M44 70h72v8H44z" fill="#7a8396" ${sw()}/><path d="M60 54h40" fill="none" ${sw(2)}/><circle cx="52" cy="62" r="2.5" fill="#5a6374"/><circle cx="108" cy="62" r="2.5" fill="#5a6374"/>`,
    `<path d="M34 60c12-12 80-12 92 0l-10 10c-14-8-58-8-72 0z" fill="#1a1a1a" ${sw()}/><path d="M52 60V44c0-8 12-14 28-14s28 6 28 14v16z" fill="#1a1a1a" ${sw()}/><circle cx="80" cy="46" r="6" fill="#fff"/><path d="M74 52h12" fill="none" stroke="#fff" stroke-width="2"/><path d="M40 62c10-4 70-4 80 0" fill="none" stroke="#c9a227" stroke-width="2"/>`];
  const ears = `<ellipse cx="43" cy="86" rx="7" ry="10" fill="${s.skin}" ${sw()}/><ellipse cx="117" cy="86" rx="7" ry="10" fill="${s.skin}" ${sw()}/><path d="M43 82c2 2 2 6 0 8M117 82c-2 2-2 6 0 8" fill="none" ${sw(2)}/>`;
  const wrinkles = s.age === 'old' ? `<path d="M52 96c4 2 6 6 6 10M108 96c-4 2-6 6-6 10M70 60c4-2 8-2 12 0M60 62c2 0 4 0 6 1" fill="none" ${sw(2)} opacity=".55"/>` : '';
  const freckles = s.freckles && s.age !== 'old' ? `<g fill="${L}" opacity=".35"><circle cx="60" cy="92" r="1.2"/><circle cx="66" cy="95" r="1.2"/><circle cx="56" cy="97" r="1.2"/><circle cx="100" cy="92" r="1.2"/><circle cx="94" cy="95" r="1.2"/><circle cx="104" cy="97" r="1.2"/></g>` : '';
  const stache = s.moustache ? `<path d="M62 97c8-8 14-4 18 0 4-4 10-8 18 0-6 4-12 6-18 2-6 4-12 2-18-2z" fill="${hairCol}" ${sw(2)}/><path d="M68 97c4-2 8-2 10 0M82 97c2-2 6-2 10 0" fill="none" stroke="${hairLight}" stroke-width="1.2" opacity=".5"/>` : '';
  const clip = `c${s.seed % 9973}`;
  const lids = s.age === 'old';
  return `<defs><clipPath id="${clip}">${head}</clipPath></defs>` + ears + `<g fill="${s.skin}" ${sw()}>${head}</g>` + shading(clip) + `<g fill="${hairCol}" ${sw()}>${hairs[s.hairStyle]}</g>` + strands[s.hairStyle] + hats[s.hat] + eyes(mood, 'human', s.seed, lids) + nose('human') + cheeks(mood) + mouth(mood, 'human') + stache + wrinkles + freckles;
}

function catHead(s: PortraitSpec, mood: Mood): string {
  const fur = s.skin, dark = '#1b1b1b', furDark = shade(fur, 0.75);
  const stripes = (s.seed & 1) ? `<path d="M62 50c4 4 6 10 6 16M98 50c-4 4-6 10-6 16M72 46l-2 12M88 46l2 12" fill="none" stroke="${furDark}" stroke-width="3" stroke-linecap="round" opacity=".7"/>` : `<path d="M54 70c4-2 8-2 12 0M94 70c4-2 8-2 12 0" fill="none" stroke="${furDark}" stroke-width="2" opacity=".5"/>`;
  return `<path d="M46 70L40 30l24 18zM114 70l6-40-24 18z" fill="${fur}" ${sw()}/><path d="M50 60l-4-18 14 12zM110 60l4-18-14 12z" fill="#f3b5c8"/>` +
    `<path d="M42 84c0-26 17-40 38-40s38 14 38 40c0 24-17 38-38 38S42 108 42 84z" fill="${fur}" ${sw()}/>` +
    `<ellipse cx="80" cy="104" rx="20" ry="14" fill="${shade(fur, 1.25)}" opacity=".8"/>` + stripes +
    `<path d="M62 46c6 4 8 10 8 16M98 46c-6 4-8 10-8 16" fill="none" stroke="${dark}" stroke-width="2" opacity=".4"/>` +
    `<path d="M48 110c6 4 10 10 10 16M112 110c-6 4-10 10-10 16" fill="none" stroke="${furDark}" stroke-width="2" opacity=".5"/>` +
    eyes(mood, 'cat', s.seed) + nose('cat') + `<path d="M40 92h24M40 100l24-4M120 92H96M120 100l-24-4" fill="none" ${sw(2)}/><g fill="${dark}" opacity=".45"><circle cx="70" cy="98" r="1"/><circle cx="66" cy="102" r="1"/><circle cx="90" cy="98" r="1"/><circle cx="94" cy="102" r="1"/></g>` + (mood === 'happy' ? `<path d="M70 104c4 6 16 6 20 0" fill="none" ${sw(3)}/>` : '');
}

function raccoonHead(s: PortraitSpec, mood: Mood): string {
  return `<path d="M48 64l-8-30 26 14zM112 64l8-30-26 14z" fill="#8a8a8a" ${sw()}/><path d="M50 56l-4-14 12 8zM110 56l4-14-12 8z" fill="#5a5a5a"/>` +
    `<ellipse cx="80" cy="84" rx="40" ry="40" fill="#9a9a9a" ${sw()}/>` +
    `<path d="M44 78c6-10 20-14 36-14s30 4 36 14c-4 12-14 18-36 18S48 90 44 78z" fill="#2b2b2b"/><path d="M50 76c6-6 16-10 30-10M110 76c-6-6-16-10-30-10" fill="none" stroke="#4a4a4a" stroke-width="2"/>` +
    `<ellipse cx="80" cy="100" rx="22" ry="16" fill="#e6e6e6"/><path d="M62 104c6 6 30 6 36 0" fill="none" stroke="#cfcfcf" stroke-width="2"/>` +
    `<path d="M48 60c4-4 8-6 12-6M112 60c-4-4-8-6-12-6M46 100c-2 4-2 8 0 12M114 100c2 4 2 8 0 12" fill="none" stroke="#6a6a6a" stroke-width="2" opacity=".7"/>` +
    eyes(mood, 'raccoon', s.seed) + nose('raccoon') + mouth(mood, 'raccoon') + `<path d="M56 60c4-8 10-12 24-12s20 4 24 12" fill="none" ${sw(2)} opacity=".4"/>`;
}

function gooseHead(s: PortraitSpec, mood: Mood): string {
  return `<path d="M62 150c0-40 6-70 18-90" fill="none" stroke="#f4f4f4" stroke-width="26" stroke-linecap="round"/><path d="M62 150c0-40 6-70 18-90" fill="none" ${sw(3)}/><path d="M70 140c0-30 4-54 12-72" fill="none" stroke="#dcdcdc" stroke-width="4" opacity=".7"/>` +
    `<ellipse cx="80" cy="60" rx="30" ry="26" fill="#f6f6f6" ${sw()}/><ellipse cx="70" cy="48" rx="10" ry="6" fill="#fff" opacity=".8"/>` +
    (mood === 'angry' ? `<path d="M60 46l14 8M100 46l-14 8" fill="none" ${sw(4)}/>` : '') +
    `<circle cx="66" cy="56" r="4.5" fill="${L}"/><circle cx="94" cy="56" r="4.5" fill="${L}"/><circle cx="67.5" cy="54.5" r="1.3" fill="#fff"/><circle cx="95.5" cy="54.5" r="1.3" fill="#fff"/>` +
    `<path d="M58 66c8-4 36-4 44 0l-6 14H64z" fill="#f08a24" ${sw()}/><path d="M60 70h40" fill="none" ${sw(2)}/><ellipse cx="72" cy="68" rx="2" ry="1.2" fill="#b04a10"/><ellipse cx="88" cy="68" rx="2" ry="1.2" fill="#b04a10"/>` +
    (mood === 'happy' ? `<path d="M70 84c4 4 16 4 20 0" fill="none" ${sw(2)}/>` : '');
  void s;
}

function bearHead(s: PortraitSpec, mood: Mood): string {
  const fur = s.skin, furDark = shade(fur, 0.78);
  return `<circle cx="48" cy="46" r="14" fill="${fur}" ${sw()}/><circle cx="112" cy="46" r="14" fill="${fur}" ${sw()}/><circle cx="48" cy="46" r="7" fill="#d9a06b"/><circle cx="112" cy="46" r="7" fill="#d9a06b"/>` +
    `<path d="M40 86c0-28 18-44 40-44s40 16 40 44c0 26-18 40-40 40S40 112 40 86z" fill="${fur}" ${sw()}/>` +
    `<path d="M52 66c6-10 16-16 28-16M108 66c-6-10-16-16-28-16M46 100c2 8 6 14 12 18M114 100c-2 8-6 14-12 18" fill="none" stroke="${furDark}" stroke-width="2.5" opacity=".6"/>` +
    `<ellipse cx="80" cy="102" rx="20" ry="14" fill="#d9a06b"/><ellipse cx="76" cy="98" rx="8" ry="4" fill="#e8b98a" opacity=".8"/>` + eyes(mood, 'bear', s.seed) + nose('bear') + mouth(mood, 'bear');
}

function robotHead(s: PortraitSpec, mood: Mood): string {
  const body = s.skin, bodyDark = shade(body, 0.7);
  return `<rect x="76" y="24" width="8" height="18" fill="#7a7a80" ${sw()}/><circle cx="80" cy="22" r="7" fill="${mood === 'angry' ? '#ff4a4a' : '#ffd166'}" ${sw()}/><circle cx="78" cy="20" r="2" fill="#fff" opacity=".7"/>` +
    `<rect x="40" y="40" width="80" height="80" rx="10" fill="${body}" ${sw()}/><path d="M44 44h72M44 116h72" stroke="${bodyDark}" stroke-width="2"/><rect x="48" y="62" width="64" height="52" rx="6" fill="#101827" ${sw(2)}/><path d="M50 64h60" stroke="#2a3a5a" stroke-width="1.5"/>` +
    `<g fill="${bodyDark}"><circle cx="46" cy="46" r="2"/><circle cx="114" cy="46" r="2"/><circle cx="46" cy="114" r="2"/><circle cx="114" cy="114" r="2"/></g>` +
    `<rect x="30" y="76" width="10" height="20" rx="3" fill="#7a7a80" ${sw()}/><rect x="120" y="76" width="10" height="20" rx="3" fill="#7a7a80" ${sw()}/><path d="M32 80h6M32 86h6M32 92h6M122 80h6M122 86h6M122 92h6" stroke="#4a4a50" stroke-width="1.5"/>` +
    eyes(mood, 'robot') + mouth(mood, 'robot') + `<circle cx="52" cy="52" r="3" fill="#6cf0a6"/><circle cx="62" cy="52" r="3" fill="#ffd166"/><circle cx="72" cy="52" r="3" fill="#ff4a4a"/><rect x="88" y="49" width="22" height="6" rx="2" fill="#2a2a30"/><rect x="90" y="51" width="${mood === 'angry' ? 18 : mood === 'happy' ? 10 : 14}" height="2" fill="#6cf0a6"/>`;
}

function toasterHead(s: PortraitSpec, mood: Mood): string {
  const chrome = shade(s.skin, 1.3);
  return `<path d="M42 60c0-14 10-22 38-22s38 8 38 22v56H42z" fill="${s.skin}" ${sw()}/><path d="M46 62c0-10 8-18 34-18" fill="none" stroke="${chrome}" stroke-width="4" opacity=".7"/><rect x="52" y="44" width="22" height="7" rx="3" fill="#1b1b1b"/><rect x="86" y="44" width="22" height="7" rx="3" fill="#1b1b1b"/>` +
    `<rect x="120" y="70" width="8" height="26" rx="3" fill="#1b1b1b"/><circle cx="54" cy="104" r="5" fill="#1b1b1b"/><circle cx="54" cy="104" r="2" fill="#5a5a5a"/><path d="M60 100h8M60 104h8M60 108h8" stroke="#1b1b1b" stroke-width="1.5"/>` +
    `<rect x="50" y="62" width="60" height="44" rx="6" fill="#101827" ${sw(2)}/>` + eyes(mood, 'toaster') + mouth(mood, 'toaster') +
    `<path d="M60 36l-2-8M80 34l0-9M100 36l2-8" fill="none" stroke="#c7c7c7" stroke-width="3" stroke-linecap="round"/><path d="M44 112h72" stroke="${chrome}" stroke-width="2" opacity=".6"/>`;
}

function ghostHead(s: PortraitSpec, mood: Mood): string {
  return `<path d="M42 78c0-30 16-46 38-46s38 16 38 46v60l-10-8-9 8-9-8-10 8-9-8-9 8-10-8-10 8z" fill="#eef3f8" ${sw()}/><path d="M50 78c0-24 12-36 30-36" fill="none" stroke="#fff" stroke-width="4" opacity=".9"/><path d="M48 120c6-4 14-4 20 0M92 120c6-4 14-4 20 0" fill="none" stroke="#c8d2de" stroke-width="2"/>` +
    (s.hairStyle % 2 ? `<path d="M50 44c8-14 20-20 30-20s22 6 30 20c-10-6-20-8-30-8s-20 2-30 8z" fill="${s.hair}" ${sw()}/>` : '') +
    eyes(mood, 'ghost') + (mood === 'angry' ? `<path d="M68 104c6-6 18-6 24 0" fill="none" ${sw(4)}/>` : `<ellipse cx="80" cy="104" rx="${mood === 'happy' ? 10 : 6}" ry="${mood === 'happy' ? 8 : 9}" fill="${L}"/>`) +
    `<path d="M52 66c4-2 8-2 12 0M96 66c4-2 8-2 12 0" fill="none" ${sw(2)} opacity=".3"/><ellipse cx="60" cy="96" rx="5" ry="3" fill="#b8c6ff" opacity=".45"/><ellipse cx="100" cy="96" rx="5" ry="3" fill="#b8c6ff" opacity=".45"/>`;
}

function alienHead(s: PortraitSpec, mood: Mood): string {
  const skin = s.skin, dark = shade(skin, 0.7);
  return `<path d="M62 40c-10-12-14-24-6-30M98 40c10-12 14-24 6-30" fill="none" ${sw(3)}/><circle cx="56" cy="10" r="6" fill="#ffd166" ${sw()}/><circle cx="104" cy="10" r="6" fill="#ffd166" ${sw()}/><circle cx="54" cy="8" r="2" fill="#fff" opacity=".8"/><circle cx="102" cy="8" r="2" fill="#fff" opacity=".8"/>` +
    `<path d="M40 70c0-24 18-36 40-36s40 12 40 36c0 30-20 52-40 52S40 100 40 70z" fill="${skin}" ${sw()}/><path d="M48 70c0-18 14-28 32-28" fill="none" stroke="#fff" stroke-width="3" opacity=".3"/><path d="M50 96c6 10 16 18 30 20" fill="none" stroke="${dark}" stroke-width="3" opacity=".4"/>` +
    `<ellipse cx="64" cy="78" rx="12" ry="${mood === 'angry' ? 9 : 16}" fill="${L}"/><ellipse cx="96" cy="78" rx="12" ry="${mood === 'angry' ? 9 : 16}" fill="${L}"/><ellipse cx="64" cy="80" rx="8" ry="${mood === 'angry' ? 6 : 12}" fill="#1a2a3a"/><ellipse cx="96" cy="80" rx="8" ry="${mood === 'angry' ? 6 : 12}" fill="#1a2a3a"/><circle cx="68" cy="72" r="3" fill="#fff"/><circle cx="100" cy="72" r="3" fill="#fff"/><circle cx="60" cy="86" r="1.5" fill="#fff" opacity=".6"/><circle cx="92" cy="86" r="1.5" fill="#fff" opacity=".6"/>` +
    (mood === 'happy' ? `<path d="M68 104c6 8 18 8 24 0" fill="none" ${sw(3)}/>` : mood === 'angry' ? `<path d="M70 108c6-5 14-5 20 0" fill="none" ${sw(3)}/>` : `<path d="M72 106h16" fill="none" ${sw(3)}/>`);
}

function moonHead(s: PortraitSpec, mood: Mood): string {
  return `<circle cx="80" cy="80" r="46" fill="#e9e4d8" ${sw()}/><path d="M44 90a46 46 0 0 0 72 26" fill="none" stroke="#cfc8b8" stroke-width="10" opacity=".55"/>` +
    `<g fill="#cfc8b8"><circle cx="58" cy="60" r="7"/><circle cx="104" cy="54" r="5"/><circle cx="106" cy="104" r="9"/><circle cx="52" cy="106" r="5"/><circle cx="90" cy="118" r="3"/></g><g fill="#b8b0a0" opacity=".7"><circle cx="60" cy="62" r="4"/><circle cx="108" cy="106" r="5"/><circle cx="105" cy="55" r="2.5"/></g><g fill="#fff" opacity=".35"><circle cx="56" cy="58" r="2"/><circle cx="103" cy="101" r="3"/></g>` +
    eyes(mood, 'human', s.seed) + nose('human') + mouth(mood, 'human');
}

function cloudHead(s: PortraitSpec, mood: Mood): string {
  return `<path d="M40 96a18 18 0 0 1 10-32 24 24 0 0 1 46-10 20 20 0 0 1 26 22 16 16 0 0 1-4 30H46a14 14 0 0 1-6-10z" fill="#f4f6fa" ${sw()}/><path d="M50 64a24 24 0 0 1 46-10" fill="none" stroke="#fff" stroke-width="5" opacity=".9"/><path d="M48 100h66" stroke="#c8d2de" stroke-width="3" opacity=".6"/>` +
    eyes(mood, 'human', s.seed) + cheeks(mood) + mouth(mood, 'human');
}

function trenchcoatHead(s: PortraitSpec, mood: Mood): string {
  const kid = (cx: number, cy: number, r: number, hair: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.skin}" ${sw()}/><path d="M${cx - r} ${cy - r * 0.2}c0-${r}  ${r * 0.6}-${r * 1.3} ${r}-${r * 1.3}s${r} ${r * 0.3} ${r} ${r * 1.1}c-${r * 0.3}-${r * 0.5}-${r * 0.6}-${r * 0.6}-${r}-${r * 0.6}s-${r * 0.7} ${r * 0.1}-${r} ${r * 0.6}z" fill="${hair}" ${sw(2)}/><circle cx="${cx - r * 0.35}" cy="${cy}" r="${r * 0.12}" fill="${L}"/><circle cx="${cx + r * 0.35}" cy="${cy}" r="${r * 0.12}" fill="${L}"/><path d="M${cx - r * 0.3} ${cy + r * 0.45}c${r * 0.15} ${r * 0.2} ${r * 0.45} ${r * 0.2} ${r * 0.6} 0" fill="none" ${sw(1.5)}/>`;
  return `<path d="M40 150V90c0-10 10-16 20-16h40c10 0 20 6 20 16v60z" fill="#6b5a3a" ${sw()}/><path d="M80 76v74M62 110h12M86 110h12" fill="none" ${sw(2)}/><path d="M44 92c6 4 12 6 18 6M116 92c-6 4-12 6-18 6" fill="none" stroke="#4a3d26" stroke-width="2"/><g fill="#3a2d18"><circle cx="86" cy="96" r="2"/><circle cx="86" cy="118" r="2"/><circle cx="86" cy="140" r="2"/></g>` +
    kid(80, 56, 20, s.hair) + `<path d="M58 60h44v8H58z" fill="#2c2c2c" ${sw()}/><path d="M64 60V48a16 16 0 0 1 32 0v12z" fill="#2c2c2c" ${sw()}/><path d="M66 50c4-6 10-8 14-8" fill="none" stroke="#5a5a5a" stroke-width="2"/>` +
    kid(60, 104, 12, '#4a2f1a') + kid(100, 108, 12, '#c7a26b') + (mood === 'angry' ? `<path d="M70 70l8 4M90 70l-8 4" fill="none" ${sw(3)}/>` : '') +
    `<path d="M48 118h64" fill="none" stroke="#6b5a3a" stroke-width="10"/><path d="M48 118h64" fill="none" stroke="#4a3d26" stroke-width="2" stroke-dasharray="3 5"/>`;
}

/** the collar and tie under a human or alien head: crew, polo, lapels with a tie, or hoodie strings, by the seed */
function collar(s: PortraitSpec, k: PortraitKind): string {
  const dark = shade(s.shirt, 0.72), light = shade(s.shirt, 1.3);
  const c = (s.seed >>> 20) & 3;
  if (k !== 'human' && k !== 'alien') return `<path d="M60 126c8 6 32 6 40 0" fill="none" stroke="${dark}" stroke-width="2.5" opacity=".6"/>`;
  if (c === 0) return `<path d="M60 126c6 8 34 8 40 0" fill="none" stroke="${dark}" stroke-width="4"/><path d="M62 130c6 6 30 6 36 0" fill="none" stroke="${light}" stroke-width="1.5" stroke-dasharray="3 3" opacity=".7"/>`;
  if (c === 1) return `<path d="M62 122l18 18 18-18-8-2-10 10-10-10z" fill="${light}" ${sw(2)}/><circle cx="80" cy="148" r="2" fill="${L}"/>`;
  if (c === 2) return `<path d="M56 122l24 30 24-30-10-4-14 14-14-14z" fill="#f4f1ea" ${sw(2)}/><path d="M74 124h12l-2 8 4 20-8 6-8-6 4-20z" fill="${dark}" ${sw(2)}/><path d="M48 160c4-18 12-30 20-36M112 160c-4-18-12-30-20-36" fill="none" ${sw(2)}/>`;
  return `<path d="M58 124c8 10 36 10 44 0" fill="none" stroke="${dark}" stroke-width="7"/><path d="M74 134v18M86 134v18" fill="none" stroke="#f4f1ea" stroke-width="2.5"/><circle cx="74" cy="152" r="2" fill="#f4f1ea"/><circle cx="86" cy="152" r="2" fill="#f4f1ea"/>`;
}

export function portraitSVG(spec: PortraitSpec, mood: Mood = 'calm', size = 160): string {
  const k = spec.kind;
  const bg = mood === 'angry' ? '#3a1d1d' : mood === 'happy' ? '#1f3a2a' : '#1f2a3a';
  const body = k === 'ghost' || k === 'cloud' || k === 'moon' || k === 'goose' || k === 'trenchcoat' ? '' :
    k === 'robot' ? `<rect x="36" y="118" width="88" height="50" rx="8" fill="${spec.shirt}" ${sw()}/><path d="M44 126h72M44 134h72" stroke="${shade(spec.shirt, 0.72)}" stroke-width="2"/><circle cx="80" cy="146" r="6" fill="#101827" ${sw(2)}/>` :
    `<path d="M28 160c0-26 22-40 52-40s52 14 52 40z" fill="${spec.shirt}" ${sw()}/><path d="M34 160c2-14 8-24 16-30M126 160c-2-14-8-24-16-30" fill="none" stroke="${shade(spec.shirt, 0.72)}" stroke-width="2" opacity=".7"/>` +
    (k === 'human' || k === 'alien' ? `<rect x="68" y="108" width="24" height="18" fill="${spec.skin}" ${sw()}/><rect x="70" y="108" width="20" height="6" fill="#000" opacity=".12"/>` : '') + collar(spec, k);
  const head =
    k === 'cat' ? catHead(spec, mood) : k === 'raccoon' ? raccoonHead(spec, mood) : k === 'goose' ? gooseHead(spec, mood) : k === 'bear' ? bearHead(spec, mood)
    : k === 'robot' ? robotHead(spec, mood) : k === 'toaster' ? toasterHead(spec, mood) : k === 'ghost' ? ghostHead(spec, mood) : k === 'alien' ? alienHead(spec, mood)
    : k === 'moon' ? moonHead(spec, mood) : k === 'cloud' ? cloudHead(spec, mood) : k === 'trenchcoat' ? trenchcoatHead(spec, mood) : humanHead(spec, mood);
  const glasses = spec.glasses && (k === 'human' || k === 'moon' || k === 'bear' || k === 'alien')
    ? `<g fill="none" ${sw(3)}><rect x="52" y="70" width="26" height="20" rx="7"/><rect x="82" y="70" width="26" height="20" rx="7"/><path d="M78 80h4M44 76l8-2M116 76l-8-2"/></g><path d="M56 74c4-2 10-2 14 0" fill="none" stroke="#fff" stroke-width="2" opacity=".35"/>`
    : '';
  const earrings = spec.earrings && k === 'human' ? `<circle cx="43" cy="98" r="4" fill="#ffd166" ${sw(2)}/><circle cx="117" cy="98" r="4" fill="#ffd166" ${sw(2)}/><circle cx="42" cy="97" r="1.2" fill="#fff" opacity=".8"/><circle cx="116" cy="97" r="1.2" fill="#fff" opacity=".8"/>` : '';
  const headset = spec.headset ? `<path d="M40 80c0-30 18-46 40-46s40 16 40 46" fill="none" ${sw(5)}/><rect x="34" y="76" width="12" height="20" rx="4" fill="#1b1b1b"/><rect x="114" y="76" width="12" height="20" rx="4" fill="#1b1b1b"/><path d="M46 96c4 10 12 14 24 12" fill="none" ${sw(3)}/><circle cx="72" cy="110" r="4" fill="#1b1b1b"/><path d="M44 80c4-20 16-30 36-30" fill="none" stroke="#5a5a5a" stroke-width="1.5"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="${size}" height="${size}" role="img" aria-label="Caller portrait">
  <defs><radialGradient id="g${spec.seed % 977}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>
  <rect width="160" height="160" rx="16" fill="${bg}"/><rect width="160" height="160" rx="16" fill="url(#g${spec.seed % 977})"/>
  <g opacity=".08" fill="#fff"><circle cx="24" cy="24" r="1.5"/><circle cx="136" cy="30" r="1.5"/><circle cx="140" cy="140" r="1.5"/><circle cx="20" cy="132" r="1.5"/><circle cx="80" cy="12" r="1"/></g>
  ${body}${head}${glasses}${earrings}${headset}
</svg>`;
}

import { TOON_PLACEHOLDER, onToonFail, toonCached } from './toon';
const escA = (v: string): string => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function initialsHTML(id: string, name: string, mood: Mood, size: number): string {
  const ini = name.split(/\s+/).filter((w) => /[A-Za-zÀ-ž]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return `<div class="portrait-initials" data-mood="${mood}" style="--h:${hash(id) % 360};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${escA(ini)}</div>`;
}
// a photo the browser cannot read becomes an initials tile: the photo itself is never shown
onToonFail((img) => { img.outerHTML = initialsHTML(img.dataset.id ?? '', img.dataset.name ?? '?', (img.dataset.mood as Mood) || 'calm', Number(img.getAttribute('width')) || 160); });
/** the portrait as HTML: the cartoon drawn from the caller's photo when they have one, an initials tile for a real
 *  person without a free photo, else the drawing. Every place that shows a caller goes through here. */
export function portraitHTML(id: string, p: Partial<PortraitSpec> | undefined, name: string, mood: Mood = 'calm', size = 160): string {
  // a photo is never shown as itself: the cartoon drawn from it (os/toon.ts) goes in, the moment it is ready
  if (p?.photo) { const done = toonCached(p.photo); return `<img class="portrait-photo" src="${escA(done ?? TOON_PLACEHOLDER)}" data-photo="${escA(p.photo)}" data-id="${escA(id)}" data-name="${escA(name)}" data-toon="${done ? 'done' : ''}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer" title="${escA(p.credit ? 'Drawn from a photo: ' + p.credit : '')}" data-mood="${mood}" />`; }
  if (p?.kind === 'initials') return initialsHTML(id, name, mood, size);
  return portraitSVG(specFor(id, p), mood, size);
}
