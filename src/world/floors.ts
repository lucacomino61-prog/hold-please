// The floors of Sunrise Customer Care. Each rank works one floor higher, and each floor has its own look: walls,
// carpet, the light, the view out of the window and a little furniture, around the same sixteen desks, seats and
// walk lanes (office.ts never moves those). A promotion is a ride up in the lift (ui/elevator.ts). The furniture
// only stands against the walls, outside every route the colleagues, the goose and the review walk take.
import type { Placement } from './kit';
import { RANKS, rankForDays } from '../game/ranks';
import { state } from '../game/state';

export interface FloorTheme {
  /** the number on the lift and the board */
  n: number;
  /** what the floor is called, on the wall sign and in the lift */
  name: string;
  wall: string; wallLow: string; rail: string;
  carpet: { base: string; alt: string; fleck: [string, string]; line: string; stains: number };
  tube: string; ceiling: string;
  /** the window: sky top and bottom, how tall the skyline stands (1 = the street floor's view), stars, a cloud bank */
  sky: [string, string]; skyline: number; stars: boolean; clouds: boolean; moon: string;
  hemi: [string, string]; key: string; lamp: string;
  decor: Placement[];
  /** x, z, half width, half depth: what the player walks around */
  boxes: [number, number, number, number][];
  /** ceiling fans (x, z), turning all shift */
  fans: [number, number][];
}

// the free spots against the walls: between the north windows, under the boards, along the west wall
const PLANT_N = (x: number, h = 1.2): Placement => ({ name: 'pottedPlant', x, z: -8.5, h, colors: { plant: '#3f8f4a', wood: '#8a5a3c', woodDark: '#6a4a2c' } });
const SILL = (x: number, k: 1 | 2 | 3): Placement => ({ name: `plantSmall${k}`, x, z: -8.88, y: 1.1, h: 0.28, colors: { plant: '#4f9f5a', wood: '#c9a27a' } });
const LAMP = (x: number, z: number, wood = '#2b2b31'): Placement => ({ name: 'lampRoundFloor', x, z, h: 1.7, colors: { wood, metal: '#d9d9de', metalDark: '#2b2b31', carpetWhite: '#fff4dc' } });
const RUG = (color: string, w = 2.4): Placement => ({ name: 'rugRound', x: -9.0, z: 5.0, w, h: 0.02, colors: { carpet: color, carpetWhite: '#d9cdb3' }, shadow: false });
const SHELF = (wood: string): Placement[] => [
  { name: 'bookcaseOpen', x: -11.55, z: 6.4, ry: Math.PI / 2, h: 1.9, colors: { wood } },
  { name: 'books', x: -11.55, z: 6.4, y: 0.95, ry: Math.PI / 2, h: 0.22 },
];
const BOX_PLANT_N = (x: number): [number, number, number, number] => [x, -8.5, 0.32, 0.32];
const BOX_LAMP = (x: number, z: number): [number, number, number, number] => [x, z, 0.26, 0.26];
const BOX_SHELF: [number, number, number, number] = [-11.55, 6.4, 0.25, 0.55];
const BOX_PLANT_W: [number, number, number, number] = [-11.45, 4.6, 0.32, 0.32];

export const FLOORS: FloorTheme[] = [
  {
    n: 7, name: 'The Pit',
    wall: '#ece9e2', wallLow: '#c2bfb9', rail: '#8a6a4a',
    carpet: { base: '#4a5162', alt: '#444b5b', fleck: ['#515869', '#3f4656'], line: '#3a4150', stains: 3 },
    tube: '#ffe9c4', ceiling: '#ffffff',
    sky: ['#09101d', '#1b2b4a'], skyline: 1, stars: false, clouds: false, moon: '#f2a93b',
    hemi: ['#fff1d6', '#b8622a'], key: '#ffc48a', lamp: '#ffc890',
    decor: [], boxes: [], fans: [],
  },
  {
    n: 12, name: 'Agents',
    wall: '#d8e4da', wallLow: '#9db3a3', rail: '#6b5a3a',
    carpet: { base: '#3f5550', alt: '#3a4f4a', fleck: ['#47605a', '#34463f'], line: '#2f403b', stains: 2 },
    tube: '#f6f1df', ceiling: '#f6f8f2',
    sky: ['#0b1426', '#22365a'], skyline: 0.72, stars: false, clouds: false, moon: '#f2c46b',
    hemi: ['#f4f6e8', '#6f8a5a'], key: '#ffd2a0', lamp: '#ffd8a8',
    decor: [PLANT_N(-3.0), PLANT_N(3.0), SILL(-4.6, 1), SILL(1.4, 2), SILL(4.4, 3), { name: 'pottedPlant', x: -11.45, z: 4.6, h: 1.3, colors: { plant: '#3f8f4a', wood: '#c9a27a', woodDark: '#8a6a4a' } }, RUG('#5a7a5a')],
    boxes: [BOX_PLANT_N(-3.0), BOX_PLANT_N(3.0), BOX_PLANT_W], fans: [],
  },
  {
    n: 23, name: 'Senior Agents',
    wall: '#dfe3ea', wallLow: '#7d8799', rail: '#3a3f4a',
    carpet: { base: '#2c3446', alt: '#283041', fleck: ['#323b4f', '#242b3a'], line: '#20283a', stains: 1 },
    tube: '#eef4ff', ceiling: '#f4f6fa',
    sky: ['#14102a', '#7a4a5e'], skyline: 0.45, stars: false, clouds: false, moon: '#ffb36b',
    hemi: ['#eef2ff', '#4a5a7a'], key: '#ffdcb8', lamp: '#e8eeff',
    decor: [PLANT_N(-3.0, 1.4), PLANT_N(3.0, 1.4), LAMP(-3.7, 8.6), LAMP(7.4, 8.6), RUG('#3a4f7a', 2.6), ...SHELF('#3a3f4a')],
    boxes: [BOX_PLANT_N(-3.0), BOX_PLANT_N(3.0), BOX_LAMP(-3.7, 8.6), BOX_LAMP(7.4, 8.6), BOX_SHELF], fans: [[-4, -1.5], [4, -1.5]],
  },
  {
    n: 31, name: 'Floor Leads',
    wall: '#efe6d6', wallLow: '#6b4a3a', rail: '#c9a227',
    carpet: { base: '#5a2a33', alt: '#52262e', fleck: ['#63303a', '#4a2229'], line: '#3d1c22', stains: 0 },
    tube: '#fff0d0', ceiling: '#fbf6ec',
    sky: ['#03060f', '#16244a'], skyline: 0.22, stars: true, clouds: true, moon: '#f4f1ea',
    hemi: ['#fff0d8', '#7a3a2a'], key: '#ffc890', lamp: '#ffcf8a',
    decor: [PLANT_N(-3.0, 1.4), PLANT_N(3.0, 1.4), SILL(-4.6, 2), SILL(1.4, 1), SILL(4.4, 3), LAMP(-3.7, 8.6, '#6b4a3a'), LAMP(7.4, 8.6, '#6b4a3a'), RUG('#8a6a2a', 2.8), ...SHELF('#6b4a3a'),
      { name: 'pottedPlant', x: -11.45, z: 4.6, h: 1.4, colors: { plant: '#3f8f4a', wood: '#c9a227', woodDark: '#8a6a2a' } }],
    boxes: [BOX_PLANT_N(-3.0), BOX_PLANT_N(3.0), BOX_LAMP(-3.7, 8.6), BOX_LAMP(7.4, 8.6), BOX_SHELF, BOX_PLANT_W], fans: [[-4, -1.5], [4, -1.5]],
  },
];

/** the floor a day is worked on: the rank's (a rank is read from the days survived, see ranks.ts) */
export function floorTheme(day = state.day): FloorTheme {
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, RANKS.indexOf(rankForDays(Math.max(0, day - 1)))))];
}
export function floorFor(day: number): number { return floorTheme(day).n; }
/** the floor the run was on the day before, when this day started with a promotion; null otherwise */
export function promotedFrom(day = state.day): FloorTheme | null {
  if (day <= 1) return null;
  const before = floorTheme(day - 1), now = floorTheme(day);
  return before.n !== now.n ? before : null;
}

/** the carpet tile: the base, a checker, flecks, a faint weave, a few stains on the lower floors, the seam */
export function drawCarpet(g: CanvasRenderingContext2D, th: FloorTheme): void {
  const c = th.carpet;
  g.fillStyle = c.base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = c.alt; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? c.fleck[0] : c.fleck[1]; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); }
  for (let y = 0; y < 256; y += 16) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(0, y, 256, 2); }
  for (let i = 0; i < c.stains; i++) { g.fillStyle = 'rgba(20,16,10,.09)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 22, 6 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = c.line; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
}

/** the view: a sky, the moon, the skyline (lower the higher you work), stars and a cloud bank from the top floor */
export function drawCity(g: CanvasRenderingContext2D, th: FloorTheme): void {
  const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, 1024, 256);
  if (th.stars) for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.55})`; g.fillRect(Math.random() * 1024, Math.random() * 170, Math.random() < 0.15 ? 2 : 1, Math.random() < 0.15 ? 2 : 1); }
  g.fillStyle = th.moon; g.globalAlpha = 0.85; g.beginPath(); g.arc(760, 70, 26, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  let x = 0;
  while (x < 1024) {
    const w = 30 + Math.random() * 70, h = (60 + Math.random() * 150) * th.skyline;
    g.fillStyle = '#0d1527'; g.fillRect(x, 256 - h, w, h);
    for (let wy = 256 - h + 8; wy < 248; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 11) if (Math.random() > 0.5) { g.fillStyle = Math.random() > 0.3 ? '#f2d58a' : '#8fd3ff'; g.fillRect(wx, wy, 5, 6); }
    x += w + 6;
  }
  if (th.clouds) {
    g.fillStyle = 'rgba(200,210,235,.22)';
    for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(Math.random() * 1024, 236 + Math.random() * 18, 50 + Math.random() * 90, 10 + Math.random() * 10, 0, 0, Math.PI * 2); g.fill(); }
  }
}

/** the wall sign by the lounge: the floor's number and name */
export function drawFloorSign(g: CanvasRenderingContext2D, th: FloorTheme, label: string): void {
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = th.rail; g.fillRect(0, 0, 512, 8); g.fillRect(0, 152, 512, 8);
  g.fillStyle = '#f2a93b'; g.font = 'bold 112px Impact, "Arial Black", Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(String(th.n), 24, 86, 140);
  g.fillStyle = '#f4f1ea'; g.font = 'bold 48px Inter, Arial';
  g.fillText(label.toUpperCase(), 176, 86, 316);
}
