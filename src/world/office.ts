// The office in three.js: cubicle rows, detailed colleagues, a break room corner, night windows,
// a live quota board, the floor sandbox (walk, run, pick up and throw things, the gas, the puddle),
// sitting at any PC, colleagues' screens, the Clock-in dolly into the monitor and the review room.
// One renderer, one scene; the Floor Cam borrows the canvas. Static desk parts are merged per material.
import { t } from '../i18n';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { placeKit, placeMany, type Placement } from './kit';
import { rigAssets } from './rig';
import { bus, fmt, pick, settings, state } from '../game/state';
import { setRenderer } from './loop';
import { sfx } from '../game/sound';
import { Person } from './people';
import { toast } from '../ui/toast';
import type { Caller } from '../game/brain/types';
import { getAvatar } from '../game/avatar';
import { radioOn, toggleRadio } from '../os/apps/radio';
import { rival, RIVAL_NAME } from '../game/rival';
import { currentRank, RANKS } from '../game/ranks';
import { lookFor } from '../game/colleagues';
import { drawCarpet, drawCity, drawFloorSign, floorFor, floorTheme, FLOORS } from './floors';

type Desk = { index: number; pos: THREE.Vector3; seat: THREE.Vector3; screen: THREE.Vector3; facing: 1 | -1; hit: THREE.Mesh; person: Person | null; scr: THREE.Mesh; app: string };
type Prop = { mesh: THREE.Mesh; kind: string; vel: THREE.Vector3; r: number; flying: boolean; held: boolean };

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let cctv: THREE.PerspectiveCamera;
let container: HTMLElement | null = null;
let built = false;
let available: boolean | null = null;
let mode: 'off' | 'idle' | 'walk' | 'dolly' | 'cctv' | 'review' | 'krull' = 'off';
const desks: Desk[] = [];
const people: Person[] = [];
const remote = new Map<string, Person>();
const props: Prop[] = [];
let held: Prop | null = null;
const keys = new Set<string>();
const player = { pos: new THREE.Vector3(-8.5, 1.62, -2.5), yaw: -1.1, pitch: -0.05, seat: -1, bob: 0 };
let onSit: (() => void) | null = null;
let dolly: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t: number; dur: number } | null = null;
let hint: HTMLElement | null = null;
let look: HTMLElement | null = null;
let floorHud: HTMLElement | null = null;
let camHost: HTMLElement | null = null;
let whiteboardTex: THREE.CanvasTexture | null = null;
let boardTex: THREE.CanvasTexture | null = null;
let boardCanvas: HTMLCanvasElement | null = null;
const raycaster = new THREE.Raycaster();
const tmp = new THREE.Vector3();
const bounds = { minX: -11.2, maxX: 11.2, minZ: -8.2, maxZ: 8.2 };
const obstacles: THREE.Box3[] = [];
let t0 = 0;
const localListeners = new Set<(p: { seat: number; x: number; z: number; yaw: number }) => void>();
let lastLocalSend = 0;
let lastLook = 0;
let peeing = false;
let puddle: THREE.Mesh | null = null;
let puddleLife = 0;
let peeToast = false;
let dropTimer = 0;
const drops: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
const clouds: { sprite: THREE.Sprite; life: number }[] = [];
let cloudMat: THREE.SpriteMaterial | null = null;
let door: THREE.Mesh | null = null;
let ringingName: string | null = null;

// floors: every three days survived the team moves up a floor (the walls change colour)
export { floorFor } from './floors';
// the floor's own look (floors.ts): textures redrawn in place, the lights retinted, its furniture in one group
let carpetTex: THREE.CanvasTexture | null = null;
let cityTex: THREE.CanvasTexture | null = null;
let signTex: THREE.CanvasTexture | null = null;
let hemiLight: THREE.HemisphereLight | null = null;
let keyLight: THREE.DirectionalLight | null = null;
const ceilingLamps: THREE.PointLight[] = [];
const ceilingFans: THREE.Object3D[] = [];
const decorBoxes: THREE.Box3[] = [];
let decorGroup: THREE.Group | null = null;
let decorGen = 0;
let floorShown = -1;
const HEADLINES = [
  ['HARBOUR NEWS', 'Moon sold for the ninth time this week'],
  ['HARBOUR NEWS', 'Goose elected to the port authority'],
  ['BREAKING', 'Fridge achieves consciousness, asks for a raise'],
  ['WEATHER', 'A small cloud named Dennis is trying very hard'],
  ['SPORT', 'Bean Coin up 400% then down 400%'],
  ['SUNRISE CUSTOMER CARE', 'Employee of the month: nobody'],
];
let tvTex: THREE.CanvasTexture | null = null;
let tvCanvas: HTMLCanvasElement | null = null;
let tvIndex = 0;
let reviewGroup: THREE.Group | null = null;
let krull: Person | null = null;
// you, seen from the little camera on top of your monitor
let selfAvatar: Person | null = null;
let selfCam: THREE.PerspectiveCamera;
let camSel: 'floor' | 'self' = 'floor';
// the look: ambient occlusion in the corners and a soft bloom on the lights (hp.fx=0 turns both off)
let composer: EffectComposer | null = null;
let renderPass: RenderPass | null = null;
let gtao: GTAOPass | null = null;
const FX = (() => { try { return localStorage.getItem('hp.fx') !== '0'; } catch { return true; } })();
// furniture from the kit arrives async; the layout never waits for it
const kitQueue: Placement[] = [];
let kitReady: Promise<unknown> = Promise.resolve();
const SCREEN_LABEL: Record<string, string> = { os: 'Harbour OS', phone: 'on a call', casino: 'Jackpotato (losing)', clicker: 'Dumpling Clicker', surf: 'Surf — cat videos', paint: 'Doodle', idle: 'screensaver', saver2: 'screensaver', saver3: 'screensaver', boot: 'booting up' };
const SCREENS: Record<string, THREE.CanvasTexture> = {};
// the screensavers: three small canvases shared by every idle monitor, redrawn a few times a second
const SAVERS: { c: HTMLCanvasElement; tex: THREE.CanvasTexture; draw: (g: CanvasRenderingContext2D, t: number) => void }[] = [];
let saverClock = 0;
const fans: THREE.Group[] = [];
let leadCanvas: HTMLCanvasElement | null = null;
let leadTex: THREE.CanvasTexture | null = null;
function drawSwirl(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 11; i++) { g.strokeStyle = `hsl(${(t * 50 + i * 33) % 360} 90% 58%)`; g.lineWidth = 7; g.beginPath(); g.arc(128, 96, 12 + i * 8, t * 1.4 + i * 0.6, t * 1.4 + i * 0.6 + 2.4); g.stroke(); }
}
function drawBlobs(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = 'rgba(6,16,30,.55)'; g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 6; i++) { g.fillStyle = `hsl(${i * 58} 85% 60%)`; g.beginPath(); g.arc(128 + Math.sin(t * 0.7 + i) * 100, 96 + Math.cos(t * 0.9 + i * 1.3) * 68, 14 + i * 4, 0, Math.PI * 2); g.fill(); }
}
function drawWarp(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#dfe9ff'; g.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) { const a = i * 2.399963, l = (t * 120 + i * 37) % 150, r0 = 6 + l * 0.6; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 96 + Math.sin(a) * r0 * 0.75); g.lineTo(128 + Math.cos(a) * (r0 + l * 0.25), 96 + Math.sin(a) * (r0 + l * 0.25) * 0.75); g.stroke(); }
}
const REACTIONS = ['Who did that.', 'Oh no. Oh NO.', 'I can taste it.', 'HR. I am calling HR.', 'Is that the fridge again?', 'My eyes. My career.'];

export function officeAvailable(): boolean {
  if (available !== null) return available;
  try {
    const c = document.createElement('canvas');
    available = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { available = false; }
  return available;
}

export async function warmOffice(): Promise<boolean> {
  if (!officeAvailable()) return false;
  try {
    build();
    await Promise.all([loadEnvironment(), kitReady, rigAssets(), ...people.map((p) => p.ready)]);
    renderer!.compile(scene, camera);
    renderWith(camera);
    return true;
  } catch (e) { console.warn('office unavailable', e); available = false; return false; }
}

// ---------- materials and textures ----------
const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function textTexture(lines: string[], w = 512, h = 256, bg = '#fdfdfb', fg = '#1a1a1a', font = 'bold 40px Inter, Arial'): THREE.CanvasTexture {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lh = h / (lines.length + 1);
    lines.forEach((l, i) => g.fillText(l, w / 2, lh * (i + 1), w - 24));
  });
}

function makeScreens(): void {
  SCREENS.os = canvasTex(256, 192, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 192); sky.addColorStop(0, '#0f1a2b'); sky.addColorStop(1, '#2a3b5c');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#f2a93b'; g.beginPath(); g.arc(190, 80, 16, 0, Math.PI * 2); g.fill();
    const cols = ['#3fa34d', '#4a78d9', '#f08a24', '#8e5ad6', '#2bb3a3', '#d94b4b'];
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.fillRect(12 + (i % 2) * 36, 12 + Math.floor(i / 2) * 36, 24, 24); }
    g.fillStyle = '#1b2432'; g.fillRect(0, 172, 256, 20);
  });
  SCREENS.phone = canvasTex(256, 192, (g) => {
    g.fillStyle = '#1b2432'; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#141b27'; g.fillRect(0, 0, 256, 30); g.fillStyle = '#30c67c'; g.fillRect(10, 20, 150, 5);
    g.fillStyle = '#0f1520'; g.fillRect(12, 40, 56, 56); g.fillStyle = '#e38b4a'; g.beginPath(); g.arc(40, 68, 18, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#8a5a2a' : '#2c4a7a'; g.fillRect(i % 2 ? 90 : 12, 106 + i * 20, 150, 14); }
    g.fillStyle = '#e5484d'; g.fillRect(12, 170, 232, 16);
  });
  SCREENS.casino = canvasTex(256, 192, (g) => {
    g.fillStyle = '#10182a'; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#ffd166'; g.font = 'bold 26px Impact, Arial'; g.fillText('JACKPOTATO', 14, 36);
    g.strokeStyle = '#30c67c'; g.lineWidth = 4; g.beginPath(); g.moveTo(14, 170); for (let x = 14; x < 230; x += 8) g.lineTo(x, 170 - Math.pow((x - 14) / 60, 2.2) * 10); g.stroke();
    g.strokeStyle = '#e5484d'; g.beginPath(); g.moveTo(230, 60); g.lineTo(240, 170); g.stroke();
  });
  SCREENS.clicker = canvasTex(256, 192, (g) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#f0c987'; g.beginPath(); g.arc(80, 100, 56, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c98f4a'; g.beginPath(); g.arc(80, 100, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b2432'; g.font = 'bold 22px Arial'; g.fillText('77,946', 150, 70); g.font = '14px Arial'; g.fillText('dumplings', 150, 92);
  });
  SCREENS.surf = canvasTex(256, 192, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, 256, 28);
    g.fillStyle = '#1a4fd1'; g.font = 'bold 15px Arial'; ['Sir Fluffington knocks a glass off', 'a table (4 hrs)', 'Raccoon learns to use a phone', 'How to quit in 3 steps'].forEach((t, i) => g.fillText(t, 12, 60 + i * 28));
    g.fillStyle = '#ff8a8a'; g.fillRect(180, 40, 60, 40);
  });
  SCREENS.paint = canvasTex(256, 192, (g) => {
    g.fillStyle = '#fffdf7'; g.fillRect(0, 0, 256, 192);
    const cols = ['#d94b4b', '#4a78d9', '#3fa34d', '#f08a24', '#8e5ad6'];
    for (let i = 0; i < 12; i++) { g.strokeStyle = cols[i % 5]; g.lineWidth = 6; g.beginPath(); g.moveTo(Math.random() * 256, Math.random() * 192); g.bezierCurveTo(Math.random() * 256, Math.random() * 192, Math.random() * 256, Math.random() * 192, Math.random() * 256, Math.random() * 192); g.stroke(); }
  });
  for (const [key, draw] of [['idle', drawSwirl], ['saver2', drawBlobs], ['saver3', drawWarp]] as const) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 192;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    draw(c.getContext('2d')!, 0);
    SAVERS.push({ c, tex, draw });
    SCREENS[key] = tex;
  }
  // the boot screen the real monitors show: black, the company face, the OS name
  SCREENS.boot = canvasTex(256, 192, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#e5542a'; g.beginPath(); g.ellipse(128, 74, 34, 40, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1a0e08'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(104, 56); g.lineTo(122, 62); g.moveTo(152, 56); g.lineTo(134, 62); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(116, 70, 5, 0, Math.PI * 2); g.arc(140, 70, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a0e08'; g.beginPath(); g.arc(117, 71, 2.2, 0, Math.PI * 2); g.arc(141, 71, 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(128, 92, 16, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4dc'; g.font = 'bold 28px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.fillText('Harbour OS', 128, 150);
  });
}

let M: Record<string, THREE.MeshStandardMaterial>;
function makeMaterials(): void {
  // the carpet and the view belong to the floor (floors.ts): drawn for the first floor here, redrawn on promotion
  const carpet = canvasTex(256, 256, (g) => drawCarpet(g, FLOORS[0]), [12, 9]);
  carpetTex = carpet;
  const cork = canvasTex(128, 128, (g) => {
    g.fillStyle = '#c99a5b'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) { g.fillStyle = Math.random() < 0.5 ? '#b8894c' : '#d6a96a'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  }, [2, 1.4]);
  const ceiling = canvasTex(128, 128, (g) => {
    g.fillStyle = '#e8e2d4'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) { g.fillStyle = '#ddd6c6'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    g.strokeStyle = '#b9b2a2'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
  }, [12, 9]);
  const fabric = canvasTex(64, 64, (g) => {
    g.fillStyle = '#6b7786'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? '#74808f' : '#616c7b'; g.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5); }
  }, [3, 2]);
  const keyboard = canvasTex(256, 96, (g) => {
    g.fillStyle = '#e4e4e8'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#2b2c31';
    for (let y = 10; y < 80; y += 16) for (let x = 8; x < 248; x += 16) g.fillRect(x, y, 12, 12);
    g.fillRect(64, 74, 128, 12);
  });
  const city = canvasTex(1024, 256, (g) => drawCity(g, FLOORS[0]));
  cityTex = city;
  const note = canvasTex(64, 64, (g) => { g.fillStyle = '#ffe66d'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#8a7a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 22); g.lineTo(54, 22); g.moveTo(10, 34); g.lineTo(46, 34); g.moveTo(10, 46); g.lineTo(38, 46); g.stroke(); });
  M = {
    carpet: mat('#ffffff', { map: carpet }), wall: mat('#cfc4ad'), ceiling: mat('#ffffff', { map: ceiling }), tube: new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe9c4', emissiveIntensity: 1.6 }),
    doorIdle: mat('#6b4a2c', { roughness: 0.6 }), doorLit: new THREE.MeshStandardMaterial({ color: '#8a5a2c', emissive: '#ffb347', emissiveIntensity: 0.9, roughness: 0.5 }),
    desk: mat('#f1eee6', { roughness: 0.55 }), deskEdge: mat('#d6d2c8'), leg: mat('#6f6657'), drawer: mat('#c9bea6'), handle: mat('#8a8a90', { metalness: 0.6, roughness: 0.4 }),
    part: mat('#ffffff', { map: fabric }), partTop: mat('#9aa3b8'), crt: mat('#e9e4d8'), panel: mat('#1b1c20', { roughness: 0.5 }), pedestal: mat('#f4f2ec', { roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#dfe8ef', transparent: true, opacity: 0.38, roughness: 0.15, metalness: 0.05 }),
    key: mat('#ffffff', { map: keyboard }), mouse: mat('#e6e1d4'), paper: mat('#fdfdfb'), chair: mat('#2a2a2e', { roughness: 0.7 }), chrome: mat('#7a7a80', { metalness: 0.7, roughness: 0.35 }),
    plant: mat('#3f8f4a'), pot: mat('#8a5a3c'), note: mat('#ffffff', { map: note }), fridge: mat('#f1f1f1', { roughness: 0.5 }), counter: mat('#8a6a4a'), table: mat('#6b4a3a'), skirting: mat('#8a7f6c'),
    window: new THREE.MeshStandardMaterial({ map: city, emissive: '#ffffff', emissiveMap: city, emissiveIntensity: 0.55, roughness: 0.2 }), frame: mat('#3a3a40'), door: mat('#8a6a4a'), exit: new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1.2 }),
    bin: mat('#3a3f4a'), cooler: mat('#e8eef5', { roughness: 0.4 }), water: new THREE.MeshStandardMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.6, roughness: 0.1 }), printer: mat('#d8d4cc'), box: mat('#b8905a'), sofa: mat('#7a3f3f'), vending: mat('#2b3f73'), vendGlass: new THREE.MeshStandardMaterial({ color: '#dfe9ff', emissive: '#aac8ff', emissiveIntensity: 0.15, transparent: true, opacity: 0.22, roughness: 0.1 }),
    mugRed: mat('#d94b4b', { roughness: 0.5 }), mugBlue: mat('#4a78d9', { roughness: 0.5 }), mugWhite: mat('#f4f1ea', { roughness: 0.5 }), mugYellow: mat('#e9c84a', { roughness: 0.5 }), stapler: mat('#1a1a1a', { roughness: 0.5 }), duck: mat('#ffd166', { roughness: 0.6 }),
    puddle: new THREE.MeshStandardMaterial({ color: '#e8d44a', transparent: true, opacity: 0.75, roughness: 0.2 }), drop: mat('#f0dd55', { roughness: 0.2 }),
    black: mat('#17171a', { roughness: 0.7 }), plastic: mat('#2b2b31', { roughness: 0.7 }), lens: mat('#0d1116', { roughness: 0.15 }),
    led: new THREE.MeshStandardMaterial({ color: '#3fff7a', emissive: '#3fff7a', emissiveIntensity: 2.2 }), redLed: new THREE.MeshStandardMaterial({ color: '#ff4d4d', emissive: '#ff4d4d', emissiveIntensity: 2.2 }),
    fixture: mat('#f1ece2', { roughness: 0.6 }), wallLow: mat('#b9ad95'), rail: mat('#8a6a4a', { roughness: 0.7 }), blind: mat('#e8e2d4', { roughness: 0.8 }), cork: mat('#ffffff', { map: cork }), pin: mat('#d94b4b', { roughness: 0.5 }),
    ext: mat('#d12f2f', { roughness: 0.45 }), hose: mat('#1a1a1a', { roughness: 0.8 }), donut: mat('#f29ab8', { roughness: 0.6 }), pizza: mat('#e8b84a', { roughness: 0.8 }), folder: mat('#f2c94c', { roughness: 0.8 }),
    penRed: mat('#d94b4b', { roughness: 0.5 }), penBlue: mat('#2a3b8f', { roughness: 0.5 }), penBlack: mat('#1a1a1a', { roughness: 0.5 }), shelf: mat('#d9d9de', { roughness: 0.6 }), tile: mat('#e8e4dc', { roughness: 0.5 }), steel: mat('#9aa0a8', { metalness: 0.5, roughness: 0.35 }),
  };
}

// ---------- geometry helpers ----------
class Merger {
  private lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): void {
    // rounded boxes come non-indexed; a merge needs every part the same way
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)));
    let list = this.lists.get(m);
    if (!list) { list = []; this.lists.set(m, list); }
    list.push(geo);
  }
  flush(target: THREE.Scene, shadows = true): void {
    for (const [m, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      target.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.lists.clear();
  }
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const rboxCache = new Map<string, RoundedBoxGeometry>();
// an exact-size rounded box: the chunky, bevelled look the real game's furniture has
function rbox(w: number, h: number, d: number, r = 0.02): RoundedBoxGeometry {
  const rr = Math.min(r, w / 2, h / 2, d / 2);
  const k = `${w},${h},${d},${rr}`;
  let g = rboxCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, rr); rboxCache.set(k, g); }
  return g;
}
function moved(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const c = g.clone();
  c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return c;
}
function merged(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry { return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!; }
// a cable along a few points, and the coiled cord of a desk phone
function cable(pts: [number, number, number][], r = 0.008): THREE.BufferGeometry { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 14, r, 6, false); }
function helix(r: number, len: number, turns: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= turns * 8; i++) { const t = i / (turns * 8); pts.push(new THREE.Vector3(Math.cos(t * turns * Math.PI * 2) * r, Math.sin(t * turns * Math.PI * 2) * r * 0.5, t * len)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 8, 0.004, 5, false);
}
const mugGeo = merged(new THREE.CylinderGeometry(0.05, 0.044, 0.11, 14), moved(new THREE.TorusGeometry(0.03, 0.011, 6, 12, Math.PI), 0.046, 0, 0, 0, 0, -Math.PI / 2));
const paperGeo = new THREE.IcosahedronGeometry(0.06, 0);
const staplerGeo = merged(moved(rbox(0.14, 0.03, 0.06, 0.01), 0, -0.012, 0), moved(rbox(0.13, 0.026, 0.05, 0.01), 0.005, 0.016, 0, 0, 0, 0.12));
const duckGeo = merged(new THREE.SphereGeometry(0.07, 10, 8), moved(new THREE.SphereGeometry(0.045, 10, 8), 0.02, 0.065, 0.03), moved(new THREE.ConeGeometry(0.02, 0.04, 8), 0.02, 0.06, 0.075, Math.PI / 2, 0, 0));
const donutGeo = new THREE.TorusGeometry(0.05, 0.022, 8, 16); donutGeo.rotateX(Math.PI / 2);
const dropGeo = new THREE.SphereGeometry(0.018, 5, 4);

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true; b.receiveShadow = true;
  return b;
}

function addProp(geo: THREE.BufferGeometry, m: THREE.Material, kind: string, r: number, x: number, y: number, z: number): Prop {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.userData.prop = true;
  scene.add(mesh);
  const p: Prop = { mesh, kind, vel: new THREE.Vector3(), r, flying: false, held: false };
  mesh.userData.propRef = p;
  props.push(p);
  return p;
}

function makeDesk(merger: Merger, index: number, x: number, z: number, facing: 1 | -1, col = 0, cols = 1): Desk {
  const f = facing;
  const ry = f === 1 ? 0 : Math.PI;
  // like the original: one long bench per row, every PC in a line, nothing between you and the next desk. Each
  // position adds its 1.8 m of pale laminate top to the bench; a steel T-leg at its left edge (and one more at
  // the row's right end), a white pedestal under every other position, a cable tray and a low privacy screen
  // behind the monitors so the row reads as one piece of furniture
  merger.add(rbox(1.8, 0.035, 0.8, 0.004), M.desk, x, 0.745, z);
  merger.add(rbox(1.8, 0.012, 0.8, 0.002), M.deskEdge, x, 0.722, z);
  const legs = col === cols - 1 ? [x - 0.9, x + 0.9] : [x - 0.9];
  for (const px of legs) {
    merger.add(rbox(0.05, 0.69, 0.05, 0.01), M.steel, px, 0.355, z - 0.26 * f);
    merger.add(rbox(0.05, 0.69, 0.05, 0.01), M.steel, px, 0.355, z + 0.26 * f);
    merger.add(rbox(0.05, 0.03, 0.62, 0.008), M.steel, px, 0.705, z);
    merger.add(rbox(0.05, 0.025, 0.56, 0.008), M.steel, px, 0.0125, z);
  }
  merger.add(rbox(1.8, 0.035, 0.05, 0.006), M.steel, x, 0.705, z - 0.3 * f);
  if (col % 2 === 0) {
    merger.add(rbox(0.42, 0.56, 0.62, 0.012), M.pedestal, x + 0.52, 0.44, z);
    for (let i = 0; i < 2; i++) { merger.add(rbox(0.38, 0.22, 0.012, 0.006), M.deskEdge, x + 0.52, 0.3 + i * 0.26, z + 0.31 * f); merger.add(rbox(0.16, 0.012, 0.02, 0.004), M.steel, x + 0.52, 0.4 + i * 0.26, z + 0.322 * f); }
  }
  merger.add(rbox(1.8, 0.07, 0.09, 0.006), M.black, x, 0.66, z - 0.34 * f);
  merger.add(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12), M.black, x + 0.12, 0.766, z - 0.3 * f);
  // the privacy screen: a frosted glass strip along the back of the bench, 30 cm above the top, no posts
  merger.add(rbox(1.8, 0.3, 0.016, 0.004), M.glass, x, 0.92, z - 0.42 * f);
  merger.add(rbox(1.8, 0.02, 0.04, 0.004), M.steel, x, 0.775, z - 0.42 * f);
  // the monitor: a 27-inch panel on a slim neck and a flat base, with a webcam bar clipped on top
  const zs = z - 0.1 * f;
  merger.add(rbox(0.26, 0.012, 0.17, 0.004), M.steel, x, 0.769, zs - 0.07 * f);
  merger.add(rbox(0.05, 0.3, 0.02, 0.006), M.steel, x, 0.9, zs - 0.1 * f);
  merger.add(rbox(0.09, 0.08, 0.02, 0.006), M.steel, x, 1.03, zs - 0.03 * f);
  merger.add(rbox(0.6, 0.36, 0.022, 0.006), M.panel, x, 1.03, zs - 0.02 * f);
  merger.add(rbox(0.02, 0.008, 0.006, 0.002), M.led, x + 0.26, 0.86, zs - 0.004 * f);
  merger.add(rbox(0.1, 0.022, 0.028, 0.006), M.plastic, x, 1.224, zs - 0.014 * f);
  merger.add(new THREE.SphereGeometry(0.009, 10, 8), M.lens, x, 1.224, zs - 0.001 * f);
  merger.add(rbox(0.006, 0.006, 0.003, 0.001), M.redLed, x + 0.024, 1.232, zs - 0.001 * f);
  // the screen is its own mesh so each desk can show what its owner is doing
  const scrMat = new THREE.MeshStandardMaterial({ map: SCREENS.idle, emissive: '#ffffff', emissiveMap: SCREENS.idle, emissiveIntensity: 0.9, roughness: 0.4 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.315), scrMat);
  scr.position.set(x, 1.03, zs - 0.0085 * f);
  if (f === -1) scr.rotation.y = Math.PI;
  scene.add(scr);
  // a slim keyboard and mouse, a desk phone with a little display, pens, papers, a folder, notes, cables
  merger.add(rbox(0.42, 0.012, 0.14, 0.004), M.key, x - 0.1, 0.77, z + 0.2 * f, 1, 1, 1, ry);
  merger.add(rbox(0.06, 0.024, 0.1, 0.012), M.mouse, x + 0.26, 0.775, z + 0.2 * f);
  merger.add(rbox(0.17, 0.028, 0.15, 0.01), M.plastic, x + 0.6, 0.776, z - 0.16 * f, 1, 1, 1, ry + 0.3);
  merger.add(rbox(0.07, 0.004, 0.045, 0.002), M.cooler, x + 0.58, 0.792, z - 0.19 * f, 1, 1, 1, ry + 0.3);
  merger.add(rbox(0.05, 0.035, 0.14, 0.012), M.black, x + 0.665, 0.78, z - 0.14 * f, 1, 1, 1, ry + 0.3);
  merger.add(new THREE.CylinderGeometry(0.03, 0.028, 0.09, 10), M.plastic, x - 0.72, 0.81, z - 0.3 * f);
  for (const [k, m] of [[0, M.penRed], [1, M.penBlue], [2, M.penBlack]] as const) merger.add(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), m, x - 0.72 + (k - 1) * 0.012, 0.87, z - 0.3 * f + (k % 2) * 0.012 * f);
  merger.add(rbox(0.21, 0.004, 0.3, 0.002), M.paper, x + 0.05, 0.768, z - 0.28 * f, 1, 1, 1, ry + 0.18);
  merger.add(rbox(0.21, 0.004, 0.3, 0.002), M.paper, x + 0.09, 0.772, z - 0.26 * f, 1, 1, 1, ry - 0.12);
  if (index % 3 === 0) merger.add(rbox(0.24, 0.012, 0.32, 0.004), M.folder, x - 0.5, 0.772, z - 0.26 * f, 1, 1, 1, ry + 0.08);
  merger.add(unitPlane, M.note, x + 0.5, 0.95, z - 0.408 * f, 0.11, 0.11, 1, ry);
  merger.add(unitPlane, M.note, x - 0.6, 1.0, z - 0.408 * f, 0.1, 0.1, 1, ry);
  merger.add(unitPlane, M.note, x + 0.21, 1.12, zs + 0.001 * f, 0.07, 0.07, 1, ry);
  merger.add(cable([[x + 0.1, 0.86, zs - 0.36 * f], [x + 0.16, 0.74, z - 0.42 * f], [x + 0.14, 0.3, z - 0.44 * f], [x + 0.3, 0.015, z - 0.3 * f]]), M.black, 0, 0, 0);
  merger.add(cable([[x - 0.3, 0.78, z + 0.12 * f], [x - 0.34, 0.76, z - 0.25 * f], [x - 0.3, 0.74, z - 0.42 * f]]), M.black, 0, 0, 0);
  // the chair comes from the kit (chairs are where boxes hurt most); a plant on every fourth desk
  const cz = z + 0.78 * f;
  kitQueue.push({ name: 'chairDesk', x, z: cz, ry: f === 1 ? Math.PI : 0, h: 0.95, colors: { carpet: '#1d1e24', metalMedium: '#c9ccd2', metalDark: '#9aa0a8', metalLight: '#d8dbe0' }, rough: 0.55, tag: 'chair:' + index });
  if (index % 4 === 1) kitQueue.push({ name: index % 8 === 1 ? 'plantSmall1' : 'plantSmall2', x: x + 0.66, z: z - 0.28 * f, y: 0.765, h: 0.24, colors: { plant: '#3f8f4a', wood: '#8a5a3c', woodDark: '#6a4a2c' } });
  // loose things to pick up and throw
  addProp(mugGeo, [M.mugRed, M.mugBlue, M.mugWhite, M.mugYellow][index % 4], 'mug', 0.055, x - 0.55, 0.82, z + 0.1 * f);
  addProp(staplerGeo, M.stapler, 'stapler', 0.03, x + 0.3, 0.795, z - 0.12 * f);
  if (index % 2) addProp(paperGeo, M.paper, 'paper ball', 0.06, x - 0.3, 0.83, z + 0.26 * f);
  if (index % 5 === 2) addProp(donutGeo, M.donut, 'donut', 0.06, x + 0.35, 0.79, z + 0.26 * f);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.4, 1.7), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 0.7, z + 0.15 * f);
  scene.add(hit);
  const desk: Desk = { index, pos: new THREE.Vector3(x, 0, z), seat: new THREE.Vector3(x, 1.35, cz), screen: new THREE.Vector3(x, 0.995, zs), facing, hit, person: null, scr, app: 'idle' };
  hit.userData.desk = desk;
  scr.userData.desk = desk;
  setScreen(desk, pick(['idle', 'saver2', 'saver3']));
  obstacles.push(new THREE.Box3(new THREE.Vector3(x - 0.9, 0, z - 0.5), new THREE.Vector3(x + 0.95, 2, z + 0.5)));
  return desk;
}

function setScreen(d: Desk, app: string): void {
  d.app = app;
  const t = SCREENS[app] ?? SCREENS.idle;
  const m = d.scr.material as THREE.MeshStandardMaterial;
  m.map = t; m.emissiveMap = t; m.needsUpdate = true;
}

function seat(p: Person, d: Desk): void {
  if (d.person && d.person !== p) d.person.fall();
  (p as Person & { desk?: Desk }).desk = d;
  d.person = p;
  p.sitAt(d.seat, d.facing);
}

async function loadEnvironment(): Promise<void> {
  if (!renderer || scene.environment) return;
  try {
    const hdr = await new RGBELoader().loadAsync('/env/night.hdr');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    hdr.dispose(); pmrem.dispose();
  } catch (e) { console.warn('no environment map', e); }
}

function build(): void {
  if (built) return;
  built = true;
  makeMaterials();
  makeScreens();
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(FX ? 1.25 : 1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor('#1b2432');
  container = document.createElement('div');
  container.className = 'world';
  container.hidden = true;
  container.appendChild(renderer.domElement);
  document.getElementById('main')!.appendChild(container);
  hint = document.createElement('div'); hint.className = 'hint'; hint.hidden = true; container.appendChild(hint);
  look = document.createElement('div'); look.className = 'look'; look.hidden = true; container.appendChild(look);
  buildTouchPad(container);
  floorHud = document.createElement('div');
  floorHud.className = 'floor-hud';
  floorHud.hidden = true;
  floorHud.innerHTML = `<div class="floor-hud__row"><span class="floor-hud__label">${t('Review in')}</span><b class="floor-hud__time tabular">10:00</b><span class="floor-hud__label">${t('Team')}</span><b class="floor-hud__money tabular">$0 / $600</b></div><div class="floor-hud__call" hidden></div>`;
  container.appendChild(floorHud);
  bus.on('tick', updateFloorHud); bus.on('money', updateFloorHud);
  bus.on<Caller>('call:ring', (c) => { ringingName = c.name; updateFloorHud(); });
  bus.on('call:answered', () => { ringingName = null; updateFloorHud(); });
  bus.on<Caller>('call:missed', (c) => { ringingName = null; updateFloorHud(); if (mode === 'walk' && state.phase === 'shift') toast(`Missed ${c.name}. Sit at a PC next time.`, 'danger'); });
  bus.on('call:ended', () => { ringingName = null; updateFloorHud(); });

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#1b2432', 16, 36);
  camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
  cctv = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  cctv.position.set(10.5, 3.0, 7.5);
  cctv.lookAt(0, 0.8, -1);
  selfCam = new THREE.PerspectiveCamera(60, 1, 0.05, 20);
  for (const c of [camera, cctv, selfCam]) c.layers.enable(1); // sprites
  // the head follows the mouse while you sit at the desktop
  document.addEventListener('mousemove', (e) => {
    if (!selfAvatar || !selfAvatar.group.visible) return;
    const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
    selfAvatar.lookTarget = { yaw: -nx * 1.3, pitch: ny * 0.7 };
  });
  // render → ambient occlusion → bloom → output; multisampled so the edges stay clean
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  if (FX) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.45, 0.92));
  }
  composer.addPass(new OutputPass());

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), M.carpet);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), M.ceiling);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.2;
  scene.add(ceil);
  const shell = new Merger();
  shell.add(unitBox, M.wall, 0, 1.6, -9.1, 24, 3.2, 0.2); shell.add(unitBox, M.wall, 0, 1.6, 9.1, 24, 3.2, 0.2);
  shell.add(unitBox, M.wall, -12.1, 1.6, 0, 0.2, 3.2, 18); shell.add(unitBox, M.wall, 12.1, 1.6, 0, 0.2, 3.2, 18);
  // a darker dado band with a wooden rail, and the skirting
  for (const [x, z, w, d] of [[0, -8.985, 24, 0.03], [0, 8.985, 24, 0.03], [-11.985, 0, 0.03, 18], [11.985, 0, 0.03, 18]] as const) {
    shell.add(unitBox, M.wallLow, x, 0.5, z, w, 1.0, d);
    shell.add(unitBox, M.rail, x, 1.02, z, w + 0.01, 0.05, d + 0.03);
    shell.add(unitBox, M.skirting, x, 0.08, z, w + 0.01, 0.16, d + 0.02);
  }
  // ceiling fixtures: a housing with a frosted panel
  for (let x = -8; x <= 8; x += 4) for (let z = -6; z <= 6; z += 6) { shell.add(rbox(1.9, 0.09, 0.5, 0.02), M.fixture, x, 3.17, z); shell.add(rbox(1.72, 0.025, 0.34, 0.006), M.tube, x, 3.122, z); }
  // windows with frames and a sill; blinds half-drawn on the middle one
  for (let i = 0; i < 3; i++) {
    const wx = -6 + i * 6;
    shell.add(unitPlane, M.window, wx, 1.9, -8.97, 4.6, 1.6);
    shell.add(unitBox, M.frame, wx, 1.9, -8.95, 4.7, 0.06, 0.06); shell.add(unitBox, M.frame, wx, 1.1, -8.95, 4.7, 0.06, 0.06); shell.add(unitBox, M.frame, wx, 2.7, -8.95, 4.7, 0.06, 0.06);
    shell.add(unitBox, M.frame, wx - 2.35, 1.9, -8.95, 0.06, 1.7, 0.06); shell.add(unitBox, M.frame, wx + 2.35, 1.9, -8.95, 0.06, 1.7, 0.06); shell.add(unitBox, M.frame, wx, 1.9, -8.95, 0.06, 1.7, 0.06);
    shell.add(rbox(4.8, 0.05, 0.16, 0.01), M.rail, wx, 1.08, -8.9);
    if (i === 1) { for (let b = 0; b < 9; b++) shell.add(rbox(4.5, 0.02, 0.08, 0.004), M.blind, wx, 2.66 - b * 0.07, -8.92); shell.add(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 5), M.black, wx + 2.1, 1.6, -8.92); }
  }
  shell.add(unitBox, M.door, 11.96, 1.05, 4, 0.06, 2.1, 1.0); shell.add(unitBox, M.handle, 11.9, 1.0, 3.65, 0.04, 0.04, 0.16);
  shell.add(rbox(0.06, 2.16, 1.08, 0.01), M.frame, 11.97, 1.08, 4);
  shell.add(unitBox, M.exit, 11.95, 2.35, 4, 0.04, 0.2, 0.6);
  shell.add(rbox(0.02, 0.12, 0.08, 0.005), M.paper, 11.95, 1.3, 3.3); // the light switch
  shell.flush(scene, false);

  // posters: a display word, a sub-line, one shape, a border — the kind a call centre prints itself
  const posterTex = (title: string[], sub: string, bg: string, accent: string, shape: 'sun' | 'eye' | 'phone' | 'smile' | 'frame' | 'chart', ink = '#1a1a1a') => canvasTex(512, 680, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 680);
    g.fillStyle = accent;
    if (shape === 'sun') { g.beginPath(); g.arc(256, 230, 140, 0, Math.PI * 2); g.fill(); }
    if (shape === 'eye') { g.beginPath(); g.ellipse(256, 230, 170, 95, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = bg; g.beginPath(); g.arc(256, 230, 58, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; g.beginPath(); g.arc(256, 230, 28, 0, Math.PI * 2); g.fill(); }
    if (shape === 'phone') { g.beginPath(); g.roundRect(166, 90, 180, 280, 40); g.fill(); g.fillStyle = bg; g.beginPath(); g.roundRect(196, 130, 120, 180, 14); g.fill(); }
    if (shape === 'smile') { g.strokeStyle = accent; g.lineWidth = 34; g.lineCap = 'round'; g.beginPath(); g.arc(256, 170, 150, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke(); }
    if (shape === 'frame') { g.strokeStyle = accent; g.lineWidth = 16; g.strokeRect(126, 70, 260, 300); g.fillStyle = '#e9e4d8'; g.fillRect(142, 86, 228, 268); }
    if (shape === 'chart') { g.strokeStyle = accent; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(80, 370); g.lineTo(190, 290); g.lineTo(260, 330); g.lineTo(430, 110); g.stroke(); g.beginPath(); g.moveTo(430, 86); g.lineTo(472, 140); g.lineTo(398, 140); g.closePath(); g.fill(); }
    g.fillStyle = ink; g.font = 'bold 92px Impact, "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const y0 = 520 - (title.length - 1) * 43;
    title.forEach((l, i) => g.fillText(l, 256, y0 + i * 86));
    g.font = '26px Inter, Arial'; g.globalAlpha = 0.8; g.fillText(sub, 256, 648); g.globalAlpha = 1;
    g.strokeStyle = ink; g.globalAlpha = 0.5; g.lineWidth = 6; g.strokeRect(14, 14, 484, 652); g.globalAlpha = 1;
  });
  const poster = (tex: THREE.CanvasTexture, x: number, y: number, z: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    p.position.set(x, y, z); p.rotation.y = ry; scene.add(p);
    const fr = new THREE.Mesh(rbox(0.96, 1.26, 0.03, 0.01), M.frame);
    fr.position.set(x - Math.sin(ry) * 0.028, y, z - Math.cos(ry) * 0.028); fr.rotation.y = ry; scene.add(fr); // fully behind the print
  };
  poster(posterTex(['THE QUOTA', "WON'T HIT", 'ITSELF'], 'Sunrise Customer Care · night shift', '#f2a93b', '#ffd166', 'sun'), 9.6, 1.95, -8.96, 0);
  poster(posterTex(['STAY', 'AWAKE'], 'every night. every single night.', '#ffe66d', '#1a1a1a', 'eye'), -9.6, 1.95, -8.96, 0);
  poster(posterTex(['HOLD', 'PLEASE'], 'every caller is a friend you have not met', '#f4f1ea', '#d94b4b', 'phone'), 11.96, 1.95, -2, -Math.PI / 2);
  poster(posterTex(['SMILE', 'THEY CAN', 'HEAR IT'], 'customer care starts with teeth', '#e3e3e3', '#2bb3a3', 'smile'), 11.96, 1.95, 0.5, -Math.PI / 2);
  poster(posterTex(['EMPLOYEE', 'OF THE MONTH'], 'nobody. again.', '#fdfdfb', '#8a6a4a', 'frame'), -4, 1.95, 8.96, Math.PI);
  poster(posterTex(['BEAN COIN', 'TO THE MOON'], 'not financial advice. not beans either.', '#1b2b4a', '#30c67c', 'chart', '#f4f1ea'), 6.5, 1.95, 8.96, Math.PI);
  poster(posterTex(['CALM', 'DOWN'], 'the fridge is not conscious', '#d94b4b', '#ffd166', 'sun', '#fdfdfb'), -11.96, 1.95, -2.2, Math.PI / 2);
  // the cork board, pinned full
  door = new THREE.Mesh(rbox(0.06, 2.1, 1.1, 0.01), M.doorIdle); door.position.set(11.96, 1.05, 0); scene.add(door);
  scene.add(box(0.05, 2.2, 1.22, M.frame, 11.985, 1.1, 0));
  const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.18), new THREE.MeshStandardMaterial({ map: textTexture(['MEETING ROOM'], 256, 48, '#1a1a1a', '#f4f1ea', 'bold 28px Inter, Arial'), roughness: 0.8 })); doorSign.position.set(11.92, 2.32, 0); doorSign.rotation.y = -Math.PI / 2; scene.add(doorSign);
  const corkBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), M.cork); corkBoard.position.set(-8, 1.9, 8.955); corkBoard.rotation.y = Math.PI; scene.add(corkBoard);
  const corkFrame = new THREE.Mesh(rbox(1.48, 1.08, 0.04, 0.01), M.rail); corkFrame.position.set(-8, 1.9, 8.975); scene.add(corkFrame);
  const notes = new Merger();
  for (let i = 0; i < 7; i++) {
    const nx = -8.55 + (i % 4) * 0.36 + (i > 3 ? 0.18 : 0), ny = 2.15 - Math.floor(i / 4) * 0.42;
    notes.add(unitPlane, [M.note, M.paper, M.folder][i % 3], nx, ny, 8.94, 0.22, 0.22 + (i % 2) * 0.06, 1, Math.PI);
    notes.add(new THREE.SphereGeometry(0.012, 8, 6), M.pin, nx, ny + 0.11, 8.93);
  }
  notes.flush(scene, false);
  // the fire extinguisher by the door, with its sign and bracket
  const ext = new Merger();
  ext.add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14), M.ext, 11.78, 0.95, 5.3);
  ext.add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), M.black, 11.78, 1.24, 5.3);
  ext.add(rbox(0.06, 0.1, 0.14, 0.01), M.black, 11.78, 1.3, 5.3);
  ext.add(cable([[11.76, 1.28, 5.36], [11.68, 1.1, 5.4], [11.72, 0.8, 5.42], [11.78, 0.72, 5.3]], 0.012), M.hose, 0, 0, 0);
  ext.add(rbox(0.04, 0.3, 0.3, 0.01), M.ext, 11.96, 1.6, 5.3);
  ext.add(rbox(0.3, 0.06, 0.08, 0.01), M.steel, 11.9, 0.68, 5.3);
  ext.flush(scene);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.stroke(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); } g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(92, 64); g.stroke(); }) }));
  clock.position.set(0, 2.6, -8.97); scene.add(clock);
  boardCanvas = document.createElement('canvas'); boardCanvas.width = 512; boardCanvas.height = 256;
  boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace;
  drawBoard();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: boardTex, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: 0.35 }));
  board.position.set(2, 2.0, 8.96); board.rotation.y = Math.PI; scene.add(board);
  bus.on('tick', drawBoard); bus.on('money', drawBoard);
  // the leaderboard next to it: 1st, 2nd, 3rd — keep pushing
  leadCanvas = document.createElement('canvas'); leadCanvas.width = 512; leadCanvas.height = 256;
  leadTex = new THREE.CanvasTexture(leadCanvas); leadTex.colorSpace = THREE.SRGBColorSpace;
  drawLead();
  const lead = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: leadTex, emissive: '#ffffff', emissiveMap: leadTex, emissiveIntensity: 0.3 }));
  lead.position.set(-2.2, 2.0, 8.96); lead.rotation.y = Math.PI; scene.add(lead);
  // Dusk Customer Care's board, beside yours, and the window on the east wall that looks at their building
  rivalCanvas = document.createElement('canvas'); rivalCanvas.width = 512; rivalCanvas.height = 256;
  rivalTex = new THREE.CanvasTexture(rivalCanvas); rivalTex.colorSpace = THREE.SRGBColorSpace;
  const rivalBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshStandardMaterial({ map: rivalTex, emissive: '#ffffff', emissiveMap: rivalTex, emissiveIntensity: 0.35, roughness: 0.6 }));
  rivalBoard.position.set(5.6, 2.0, 8.96); rivalBoard.rotation.y = Math.PI; scene.add(rivalBoard);
  scene.add(box(2.08, 1.08, 0.04, M.frame, 5.6, 2.0, 8.975));
  rivalWinCanvas = document.createElement('canvas'); rivalWinCanvas.width = 512; rivalWinCanvas.height = 320;
  rivalWinTex = new THREE.CanvasTexture(rivalWinCanvas); rivalWinTex.colorSpace = THREE.SRGBColorSpace;
  const rivalWin = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: rivalWinTex, emissive: '#ffffff', emissiveMap: rivalWinTex, emissiveIntensity: 0.55, roughness: 0.9 }));
  rivalWin.position.set(11.94, 1.9, -5); rivalWin.rotation.y = -Math.PI / 2; scene.add(rivalWin);
  scene.add(box(0.05, 1.6, 2.5, M.frame, 11.97, 1.9, -5));
  // the window by desk 7: the one a Floor Lead gets
  const northWin = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.3), new THREE.MeshStandardMaterial({ map: textTexture(['', '   ·   ·      ·', '  ·      ·  ·', '      ·   ·'], 512, 320, '#0b1424', '#f2a93b', 'bold 30px Arial'), emissive: '#16263c', emissiveIntensity: 0.6, roughness: 0.9 }));
  northWin.position.set(6.3, 2.0, -8.96); scene.add(northWin);
  scene.add(box(2.1, 1.4, 0.05, M.frame, 6.3, 2.0, -8.975));
  drawRival(); drawRivalWindow();
  bus.on('money', drawLead);
  // wall fans, the kind every call centre has, turning all shift
  for (const [x, z, ry] of [[-11.8, 2.0, Math.PI / 2], [11.8, -5.5, -Math.PI / 2]] as const) {
    const fan = new THREE.Group(); fan.position.set(x, 2.45, z); fan.rotation.y = ry; fan.userData.ry = ry;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), M.steel); bracket.position.set(0, -0.22, -0.04); fan.add(bracket);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 8, 32), M.steel); cage.position.z = 0.14; fan.add(cage);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12), M.plastic); hub.rotation.x = Math.PI / 2; fan.add(hub);
    const blades = new THREE.Group(); blades.position.z = 0.08;
    for (let b = 0; b < 3; b++) { const pivot = new THREE.Group(); pivot.rotation.z = (b / 3) * Math.PI * 2; const bl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.012), M.shelf); bl.position.y = 0.13; bl.castShadow = true; pivot.add(bl); blades.add(pivot); }
    fan.add(blades); scene.add(fan); fans.push(blades);
  }

  const merger = new Merger();
  // two long rows of eight, all facing the same way (chairs on +z), with a wide aisle between them
  const xs = [-6.3, -4.5, -2.7, -0.9, 0.9, 2.7, 4.5, 6.3];
  const rows: [number, 1 | -1][] = [[-4.4, 1], [1.4, 1]];
  let i = 0;
  for (const [z, f] of rows) xs.forEach((x, col) => desks.push(makeDesk(merger, i++, x, z, f, col, xs.length)));
  merger.flush(scene);

  const propsM = new Merger();
  // the water cooler, the printer station and the vending machine: rounded, with the small things people notice
  propsM.add(rbox(0.42, 1.0, 0.42, 0.04), M.cooler, 10.6, 0.5, -7.6);
  propsM.add(rbox(0.3, 0.1, 0.06, 0.01), M.plastic, 10.6, 0.78, -7.37);
  for (const sx of [-1, 1]) propsM.add(rbox(0.05, 0.05, 0.05, 0.01), sx === -1 ? M.vending : M.ext, 10.6 + sx * 0.08, 0.78, -7.34);
  propsM.add(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 16), M.water, 10.6, 1.26, -7.6);
  propsM.add(new THREE.CylinderGeometry(0.06, 0.1, 0.08, 12), M.water, 10.6, 1.55, -7.6);
  propsM.add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12), M.paper, 10.84, 0.98, -7.6);
  propsM.add(rbox(1.2, 0.05, 0.7, 0.02), M.desk, 9.6, 0.68, -7.8); propsM.add(rbox(1.1, 0.64, 0.6, 0.02), M.leg, 9.6, 0.34, -7.8);
  propsM.add(rbox(0.7, 0.28, 0.55, 0.04), M.printer, 9.6, 0.85, -7.8); propsM.add(rbox(0.5, 0.02, 0.3, 0.005), M.paper, 9.6, 1.0, -7.72); propsM.add(rbox(0.4, 0.03, 0.2, 0.01), M.plastic, 9.6, 1.0, -7.98); propsM.add(rbox(0.16, 0.016, 0.004, 0.002), M.led, 9.85, 0.93, -7.52);
  for (let i = 0; i < 3; i++) propsM.add(rbox(0.21, 0.004, 0.3, 0.002), M.paper, 9.95 + i * 0.02, 0.712 + i * 0.004, -7.85, 1, 1, 1, i * 0.2 - 0.2);
  // the vending machine is hollow where the window is, so the shelves really sit behind the glass
  propsM.add(rbox(0.9, 1.9, 0.4, 0.03), M.vending, -7.3, 0.95, -8.65);
  propsM.add(rbox(0.12, 1.9, 0.32, 0.02), M.vending, -7.69, 0.95, -8.29);
  propsM.add(rbox(0.24, 1.9, 0.32, 0.02), M.vending, -6.97, 0.95, -8.29);
  propsM.add(rbox(0.9, 0.3, 0.32, 0.02), M.vending, -7.3, 1.75, -8.29);
  propsM.add(rbox(0.9, 0.5, 0.32, 0.02), M.vending, -7.3, 0.25, -8.29);
  propsM.add(rbox(0.56, 1.1, 0.02, 0.005), M.vendGlass, -7.36, 1.05, -8.135);
  for (let s = 0; s < 4; s++) { propsM.add(rbox(0.52, 0.012, 0.28, 0.003), M.shelf, -7.36, 0.6 + s * 0.26, -8.3); for (let k = 0; k < 5; k++) propsM.add(rbox(0.07, 0.15, 0.06, 0.012), [M.mugRed, M.mugBlue, M.mugYellow, M.plant, M.sofa][(k + s) % 5], -7.56 + k * 0.1, 0.685 + s * 0.26, -8.28); }
  propsM.add(rbox(0.16, 0.5, 0.02, 0.01), M.plastic, -6.97, 1.3, -8.125); propsM.add(rbox(0.09, 0.03, 0.01, 0.004), M.black, -6.97, 1.45, -8.115); propsM.add(rbox(0.5, 0.16, 0.02, 0.01), M.black, -7.36, 0.3, -8.125);
  propsM.add(rbox(0.8, 0.04, 0.02, 0.005), M.tube, -7.3, 1.84, -8.125);
  // the restroom nook in the far corner: two half walls with a rail, a tiled floor
  propsM.add(rbox(1.9, 2.0, 0.08, 0.02), M.wallLow, 11.05, 1.0, 6.4);
  propsM.add(rbox(0.08, 2.0, 2.6, 0.02), M.wallLow, 9.3, 1.0, 7.7);
  propsM.add(rbox(1.96, 0.06, 0.14, 0.01), M.rail, 11.05, 2.03, 6.4); propsM.add(rbox(0.14, 0.06, 2.66, 0.01), M.rail, 9.3, 2.03, 7.7);
  propsM.add(rbox(2.6, 0.02, 2.5, 0.004), M.tile, 10.65, 0.01, 7.7);
  propsM.flush(scene);
  // the kitchen, the lounge, the bins, the boxes and the restroom come from the kit
  kitQueue.push(
    ...([[-8.3, -5.2], [1.7, 1.2], [8.4, 5.2], [-1.8, -1.2], [4.9, -3.2], [-4.9, 3.2]] as const).map(([x, z]) => ({ name: 'trashcan', x, z, h: 0.42, colors: { metal: '#ececec', metalDark: '#cfcfcf' } })),
    { name: 'kitchenFridgeLarge', x: -11.4, z: -8.4, h: 1.9, colors: { metalLight: '#f1f1f1', metalMedium: '#8a8a90', metalDark: '#55575e' } },
    { name: 'kitchenCabinet', x: -10.55, z: -8.5, h: 0.9, colors: { wood: '#8a6a4a', metal: '#d9cdb3', metalDark: '#6a6a70' } },
    { name: 'kitchenSink', x: -9.75, z: -8.5, h: 0.9, colors: { wood: '#8a6a4a', metal: '#d9cdb3', metalDark: '#6a6a70', metalLight: '#dfe3e8' } },
    { name: 'kitchenCabinetDrawer', x: -8.95, z: -8.5, h: 0.9, colors: { wood: '#8a6a4a', metal: '#d9cdb3', metalDark: '#6a6a70' } },
    { name: 'kitchenCabinet', x: -8.15, z: -8.5, h: 0.9, colors: { wood: '#8a6a4a', metal: '#d9cdb3', metalDark: '#6a6a70' } },
    { name: 'kitchenCabinetUpper', x: -10.55, z: -8.75, y: 1.5, h: 0.6, colors: { wood: '#8a6a4a', metalDark: '#6a6a70' } },
    { name: 'kitchenCabinetUpperDouble', x: -9.3, z: -8.75, y: 1.5, h: 0.6, colors: { wood: '#8a6a4a', metalDark: '#6a6a70' } },
    { name: 'kitchenCoffeeMachine', x: -10.6, z: -8.55, y: 0.9, h: 0.36, colors: { metalDark: '#2b2b31', metal: '#c9c9ce' } },
    { name: 'kitchenMicrowave', x: -8.1, z: -8.55, y: 0.9, h: 0.3, colors: { metalDark: '#2b2b31', metal: '#d9d9de' } },
    { name: 'toaster', x: -9.0, z: -8.55, y: 0.9, h: 0.18, colors: { metal: '#c9c9ce', metalDark: '#2b2b31' } },
    { name: 'radio', x: -9.5, z: -8.6, y: 0.9, h: 0.16 },
    { name: 'tableRound', x: -9.6, z: -5.6, h: 0.76, colors: { wood: '#6b4a3a' } },
    ...BREAK_SEATS.map((s) => ({ name: 'chair', x: s.pos.x, z: s.pos.z, ry: s.yaw, h: 0.9, colors: { wood: '#4a3b2a', carpet: '#2a2a30' } })),
    { name: 'laptop', x: -9.4, z: -5.5, y: 0.76, h: 0.2, colors: { metalDark: '#2b2b31', metal: '#9aa0a8', metalMedium: '#1b2432' } },
    { name: 'loungeSofa', x: -10.2, z: -2.2, ry: Math.PI / 2, h: 0.8, colors: { carpet: '#7a3f3f', wood: '#4a3b2a' } },
    { name: 'loungeChair', x: -10.4, z: -0.4, ry: Math.PI / 2, h: 0.8, colors: { carpet: '#7a3f3f', wood: '#4a3b2a' } },
    { name: 'tableCoffee', x: -8.9, z: -2.2, h: 0.4, colors: { wood: '#6b4a3a' } },
    { name: 'rugRectangle', x: -9.6, z: -2.4, w: 2.6, h: 0.02, colors: { carpet: '#8a3a3a', carpetWhite: '#d9cdb3' }, shadow: false },
    { name: 'pottedPlant', x: -10.8, z: -3.9, h: 1.1, colors: { plant: '#3f8f4a', wood: '#8a5a3c', woodDark: '#6a4a2c' } },
    { name: 'pottedPlant', x: 8.6, z: 8.4, h: 1.2, colors: { plant: '#3f8f4a', wood: '#8a5a3c', woodDark: '#6a4a2c' } },
    { name: 'bookcaseOpen', x: -6, z: 8.6, ry: Math.PI, h: 1.9, colors: { wood: '#8a6a4a' } },
    { name: 'books', x: -6, z: 8.6, y: 0.95, h: 0.22 },
    { name: 'cardboardBoxClosed', x: 11.2, z: -3.5, h: 0.5, colors: { wood: '#b8905a' } },
    { name: 'cardboardBoxOpen', x: 11.2, z: -3.5, y: 0.5, ry: 0.4, h: 0.44, colors: { wood: '#b8905a' } },
    { name: 'cardboardBoxClosed', x: 11.2, z: -2.75, ry: -0.3, h: 0.5, colors: { wood: '#b8905a' } },
    { name: 'coatRackStanding', x: 11.4, z: 6.0, h: 1.8, colors: { wood: '#4a3b2a' } },
    { name: 'toilet', x: 11.2, z: 8.45, ry: Math.PI, h: 0.78, colors: { carpetWhite: '#f4f4f4', metalLight: '#eeeeee', metalDark: '#6a6a70', _defaultMat: '#f4f4f4' } },
    { name: 'bathroomSink', x: 11.6, z: 7.2, ry: -Math.PI / 2, h: 0.85, colors: { carpetWhite: '#f4f4f4', metalLight: '#eeeeee', metalDark: '#6a6a70', wood: '#8a6a4a' } },
    { name: 'bathroomMirror', x: 11.92, z: 7.2, y: 1.35, ry: -Math.PI / 2, h: 0.6, colors: { wood: '#4a3b2a', metalLight: '#dfe9ff' } },
  );
  addProp(duckGeo, M.duck, 'rubber duck', 0.07, -9.0, 0.97, -8.4);
  addProp(mugGeo, M.mugWhite, 'mug', 0.055, -9.9, 0.815, -5.6);
  addProp(paperGeo, M.paper, 'paper ball', 0.06, -8.3, 0.49, -5.2);
  addProp(donutGeo, M.donut, 'donut', 0.06, -9.8, 0.785, -5.9);
  obstacles.push(new THREE.Box3(new THREE.Vector3(-12, 0, -9), new THREE.Vector3(-6.6, 2, -7.7)), new THREE.Box3(new THREE.Vector3(-10.5, 0, -6.6), new THREE.Vector3(-8.7, 2, -4.6)), new THREE.Box3(new THREE.Vector3(-11.4, 0, -2.8), new THREE.Vector3(-9, 2, -1.6)), new THREE.Box3(new THREE.Vector3(9, 0, -8.3), new THREE.Vector3(11.2, 2, -7.2)),
    new THREE.Box3(new THREE.Vector3(10.8, 0, -3.9), new THREE.Vector3(11.6, 2, -2.4)), new THREE.Box3(new THREE.Vector3(11.0, 0, 5.7), new THREE.Vector3(11.7, 2, 6.3)), new THREE.Box3(new THREE.Vector3(10.1, 0, 6.3), new THREE.Vector3(12, 2, 6.5)), new THREE.Box3(new THREE.Vector3(9.25, 0, 6.3), new THREE.Vector3(9.35, 2, 9)),
    new THREE.Box3(new THREE.Vector3(10.8, 0, 8), new THREE.Vector3(11.6, 2, 8.9)), new THREE.Box3(new THREE.Vector3(11.3, 0, 6.9), new THREE.Vector3(12, 2, 7.5)), new THREE.Box3(new THREE.Vector3(-11.2, 0, -1), new THREE.Vector3(-9.6, 2, 0.2)));

  tvCanvas = document.createElement('canvas'); tvCanvas.width = 512; tvCanvas.height = 288;
  tvTex = new THREE.CanvasTexture(tvCanvas); tvTex.colorSpace = THREE.SRGBColorSpace;
  drawTv();
  scene.add(box(1.7, 1.0, 0.08, M.frame, -9.8, 2.1, -8.95));
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.88), new THREE.MeshStandardMaterial({ map: tvTex, emissive: '#ffffff', emissiveMap: tvTex, emissiveIntensity: 0.8, roughness: 0.3 }));
  tv.position.set(-9.8, 2.1, -8.9); scene.add(tv);
  setInterval(() => { if (mode !== 'off') { tvIndex = (tvIndex + 1) % HEADLINES.length; drawTv(); } }, 6000);

  buildReviewRoom();
  watchReview();

  whiteboardTex = textTexture(['Daily targets', '1. Answer the phone', '2. Be nice', '3. Sell the Moon', '4. Teamwork!!'], 512, 384, '#fdfdfb', '#1a1a1a', 'bold 34px "Comic Sans MS", "Segoe Print", Arial');
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshStandardMaterial({ map: whiteboardTex }));
  wb.position.set(-11.95, 2.0, -5.6); wb.rotation.y = Math.PI / 2; scene.add(wb);
  scene.add(box(0.04, 1.72, 2.32, M.frame, -11.975, 2.0, -5.6));

  // warm key light with soft shadows, orange bounce from the carpet, the fixtures as point lights
  scene.add(new THREE.AmbientLight('#ffe6c4', 0.22));
  hemiLight = new THREE.HemisphereLight('#fff1d6', '#b8622a', 0.75);
  scene.add(hemiLight);
  const key = new THREE.DirectionalLight('#ffc48a', 1.35);
  keyLight = key;
  key.position.set(6, 9, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffd9b0', 0.18);
  fill.position.set(-8, 6, -6);
  scene.add(fill);
  for (const [x, z] of [[-6, -4], [-6, 4], [6, -4], [6, 4]]) { const l = new THREE.PointLight('#ffc890', 7, 12, 2); l.position.set(x, 2.95, z); scene.add(l); ceilingLamps.push(l); }
  // the floor's own furniture and its sign on the west wall, above the lounge (applyFloor fills them)
  decorGroup = new THREE.Group(); decorGroup.name = 'floor-decor'; scene.add(decorGroup);
  signTex = canvasTex(512, 160, (g) => drawFloorSign(g, FLOORS[0], t(FLOORS[0].name)));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.44), new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25, roughness: 0.6 }));
  sign.position.set(-11.95, 2.35, 4.4); sign.rotation.y = Math.PI / 2; scene.add(sign);
  const warm1 = new THREE.PointLight('#ffb070', 12, 9, 2); warm1.position.set(-9, 2.6, -6); scene.add(warm1);
  cloudMat = new THREE.SpriteMaterial({ color: '#7fd35a', transparent: true, opacity: 0.55, depthWrite: false });

  // the three colleagues who count (state.colleagues) and three background workers: six different looks
  const seats = [desks[1], desks[6], desks[10], desks[3], desks[12], desks[15]];
  const list = state.colleagues.length ? state.colleagues : [{ name: 'Teodora', shirt: '#2bb3a3' }, { name: 'Jun', shirt: '#e9c84a' }, { name: 'Baxter', shirt: '#d94b4b' }];
  const looks = LOOKS;
  const extras = [{ name: 'Rita', shirt: '#e3e3e3', body: 'woman', outfit: 'open', hairStyle: 2, hair: '#c7a26b', shades: true }, { name: 'Drin', shirt: '#4a78d9', body: 'man', outfit: 'track', scalp: 'bald', beard: 1, chain: true, hair: '#1a1a1a' }, { name: 'Ela', shirt: '#8e5ad6', body: 'woman', outfit: 'tee', hairStyle: 1, hair: '#1a1a1a', glasses: true }] as const;
  [...list.slice(0, 3).map((c, k) => ({ name: c.name, shirt: c.shirt, ...(lookFor(c.name) ?? looks[k]) })), ...extras].forEach((c, k) => {
    const p = new Person({ seed: 11 + k * 97, ...c });
    scene.add(p.group);
    seat(p, seats[k]);
    setScreen(seats[k], pick(['phone', 'phone', 'casino', 'clicker', 'surf']));
    people.push(p);
  });
  // colleagues change what they are doing now and then
  setInterval(() => { if (mode === 'off') return; for (const d of desks) if (d.person && !remote.has(d.person.name) && Math.random() < 0.35) setScreen(d, pick(['phone', 'phone', 'phone', 'casino', 'clicker', 'surf', 'paint'])); }, 15000);

  resize();
  window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== renderer!.domElement && mode === 'walk') showWalkHint(); });
  document.addEventListener('mousemove', onMouse);
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (mode !== 'walk') return;
    const k = e.key.toLowerCase();
    if (k === 'e') { if (held) dropHeld(); else trySit(); }
    if (k === 'q' && held) dropHeld();
    if (k === 'f') fart();
    if (k === 'p') peeing = true;
    if (k === 'r') toggleRadio();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); if (e.key.toLowerCase() === 'p') peeing = false; });
  const kitList = kitQueue.splice(0);
  kitReady = placeMany(scene, kitList).then((groups) => { groups.forEach((g, i) => { if (kitList[i].tag) kitTagged.set(kitList[i].tag!, g); }); void applyCosmetics(); return groups; }).catch((e) => { console.warn('furniture kit', e); return []; });
  bus.on('cosmetic', () => { void applyCosmetics(); });
  // paper on the carpet, everywhere nobody is sitting or walking into a wall
  const litter = new Merger();
  const probe = new THREE.Vector3();
  for (let i = 0, placed = 0; i < 500 && placed < 28; i++) {
    const x = -10.5 + Math.random() * 21, z = -7.4 + Math.random() * 14.8;
    probe.set(x, 0.5, z);
    if (obstacles.some((b) => b.containsPoint(probe))) continue;
    litter.add(rbox(0.21, 0.004, 0.3, 0.002), Math.random() < 0.8 ? M.paper : M.folder, x, 0.004, z, 1, 1, 1, Math.random() * Math.PI);
    placed++;
  }
  litter.flush(scene, false);
}

// the AO pass renders normals with an override material, which turns sprites (name tags, gas) into dark
// quads; so it looks through a twin camera that cannot see layer 1, where every sprite lives
const gtaoCam = new THREE.PerspectiveCamera();
function renderWith(cam: THREE.Camera): void {
  if (!renderer) return;
  if (composer && renderPass) {
    renderPass.camera = cam;
    if (gtao) { gtaoCam.copy(cam as THREE.PerspectiveCamera, false); gtaoCam.layers.set(0); gtao.camera = gtaoCam; }
    composer.render();
  } else renderer.render(scene, cam);
}

function drawTv(): void {
  if (!tvCanvas || !tvTex) return;
  const g = tvCanvas.getContext('2d')!;
  const [tag, text] = HEADLINES[tvIndex];
  g.fillStyle = '#0b1120'; g.fillRect(0, 0, 512, 288);
  g.fillStyle = '#1b2b4a'; g.fillRect(0, 0, 512, 190);
  g.fillStyle = '#f2a93b'; g.beginPath(); g.arc(400, 70, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d12f2f'; g.fillRect(0, 190, 512, 44);
  g.fillStyle = '#fff'; g.font = 'bold 26px Inter, Arial'; g.textAlign = 'left'; g.fillText(tag, 16, 222);
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 234, 512, 54);
  g.fillStyle = '#1a1a1a'; g.font = '22px Inter, Arial'; g.fillText(text, 16, 268);
  if (radioOn()) { g.fillStyle = '#d12f2f'; g.fillRect(16, 16, 150, 36); g.fillStyle = '#fff'; g.font = 'bold 20px Inter, Arial'; g.fillText('● ON AIR · Hold FM', 24, 42); }
  tvTex.needsUpdate = true;
}
bus.on('radio', () => drawTv());
bus.on('rival', () => { rivalDirty = true; });
let rivalCanvas: HTMLCanvasElement | null = null, rivalTex: THREE.CanvasTexture | null = null, rivalWinCanvas: HTMLCanvasElement | null = null, rivalWinTex: THREE.CanvasTexture | null = null;
let rivalDirty = false, rivalClock = 0, rivalBurnWas = false;
function drawRival(): void {
  if (!rivalCanvas || !rivalTex) return;
  const g = rivalCanvas.getContext('2d')!;
  g.fillStyle = '#1a1020'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ff7ad9'; g.font = 'bold 24px Inter, Arial'; g.textAlign = 'left'; g.fillText(RIVAL_NAME.toUpperCase(), 24, 40);
  g.fillStyle = '#9a8aa8'; g.font = 'bold 15px Inter, Arial'; g.textAlign = 'right'; g.fillText('ACROSS THE STREET', 488, 40);
  const rows = [...rival.agents].sort((a, b) => b.earned - a.earned);
  const top = Math.max(1, rows[0]?.earned ?? 1, state.team);
  rows.forEach((r, i) => {
    const y = 84 + i * 44;
    g.fillStyle = state.rivalBurning ? '#5a2a2a' : '#f4f1ea'; g.font = 'bold 20px Inter, Arial'; g.textAlign = 'left'; g.fillText(r.name, 24, y + 1);
    g.fillStyle = '#2b2238'; g.fillRect(140, y - 10, 250, 8);
    g.fillStyle = state.rivalBurning ? '#d12f2f' : '#ff7ad9'; g.fillRect(140, y - 10, 250 * (r.earned / top), 8);
    g.fillStyle = '#ff7ad9'; g.font = 'bold 20px Inter, Arial'; g.textAlign = 'right'; g.fillText(fmt(r.earned), 488, y + 1);
  });
  g.fillStyle = '#2b2238'; g.fillRect(24, 212, 464, 2);
  g.fillStyle = '#30c67c'; g.font = 'bold 20px Inter, Arial'; g.textAlign = 'left'; g.fillText('YOUR FLOOR', 24, 244); g.textAlign = 'right'; g.fillText(fmt(state.team), 488, 244);
  if (state.rivalBurning) { g.fillStyle = '#ff4a4a'; g.font = 'bold 18px Inter, Arial'; g.textAlign = 'center'; g.fillText('🔥 CLOSED FOR THE NIGHT 🔥', 256, 196); }
  rivalTex.needsUpdate = true;
}
function drawRivalWindow(): void {
  if (!rivalWinCanvas || !rivalWinTex) return;
  const g = rivalWinCanvas.getContext('2d')!;
  const W = 512, H = 320;
  g.fillStyle = '#0b1424'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2a93b'; for (let i = 0; i < 18; i++) { g.globalAlpha = 0.5 + ((i * 37) % 10) / 20; g.fillRect(20 + ((i * 131) % 470), 10 + ((i * 53) % 80), 2, 2); } g.globalAlpha = 1;
  // their building: a dark block with lit windows and the neon sign
  g.fillStyle = '#1e1a2e'; g.fillRect(90, 90, 330, 230);
  g.fillStyle = '#2a2440'; g.fillRect(70, 110, 20, 210); g.fillRect(420, 130, 22, 190);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) { const lit = ((r * 7 + c * 3) % 5) !== 0; g.fillStyle = state.rivalBurning ? (lit ? '#3a1a10' : '#120a08') : (lit ? '#ffd27a' : '#2a2440'); g.fillRect(104 + c * 40, 112 + r * 40, 26, 24); }
  g.fillStyle = state.rivalBurning ? '#5a2a3a' : '#ff7ad9'; g.font = 'bold 44px Impact, Arial Black, Arial'; g.textAlign = 'center'; g.fillText('DUSK', 255, 78);
  g.fillStyle = state.rivalBurning ? '#4a2a2a' : '#ff7ad9'; g.font = 'bold 14px Inter, Arial'; g.fillText('CUSTOMER CARE', 255, 96);
  if (state.rivalBurning) {
    const ts = performance.now() / 1000;
    for (let i = 0; i < 9; i++) { const x = 110 + i * 36 + Math.sin(ts * 7 + i) * 6, h = 70 + Math.sin(ts * 9 + i * 1.7) * 30; const grad = g.createLinearGradient(0, 320 - h - 90, 0, 320 - 90); grad.addColorStop(0, 'rgba(255,230,120,0)'); grad.addColorStop(0.4, 'rgba(255,140,30,.85)'); grad.addColorStop(1, 'rgba(220,40,10,.9)'); g.fillStyle = grad; g.beginPath(); g.moveTo(x - 16, 230); g.quadraticCurveTo(x, 230 - h, x + 16, 230); g.fill(); }
    g.fillStyle = 'rgba(60,50,50,.55)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(140 + i * 50 + Math.sin(ts * 2 + i) * 10, 60 - ((ts * 20 + i * 30) % 60), 22 + i * 2, 0, 7); g.fill(); }
  }
  rivalWinTex.needsUpdate = true;
}
function updateRival(dt: number): void {
  rivalClock += dt;
  if (rivalDirty && rivalClock > 900) { rivalClock = 0; rivalDirty = false; drawRival(); if (state.rivalBurning !== rivalBurnWas) { rivalBurnWas = state.rivalBurning; drawRivalWindow(); } }
  if (state.rivalBurning && rivalClock > 140) { rivalClock = 0; drawRivalWindow(); }
}
// what a rank puts in the office: the Floor Lead's name plate at the window desk, the Senior Agent's photo on the wall
const perkObjs: THREE.Object3D[] = [];
function applyRankPerks(): void {
  for (const o of perkObjs.splice(0)) scene.remove(o);
  const rank = RANKS.indexOf(currentRank());
  if (rank >= 3) {
    const d = desks[7] ?? desks[desks.length - 1];
    const plate = new THREE.Mesh(rbox(0.26, 0.06, 0.03, 0.006), new THREE.MeshStandardMaterial({ map: textTexture([(settings.playerName || 'You').toUpperCase(), 'FLOOR LEAD'], 256, 64, '#1a1a1a', '#c9a227', 'bold 22px Inter, Arial'), roughness: 0.4, metalness: 0.3 }));
    plate.position.set(d.pos.x + 0.6, 0.79, d.pos.z + 0.3 * d.facing); plate.rotation.x = -0.25 * d.facing; if (d.facing === -1) plate.rotation.y = Math.PI;
    scene.add(plate); perkObjs.push(plate);
  }
  if (rank >= 2) {
    let url: string | null = null; try { url = localStorage.getItem('hp.eotm'); } catch { /* ignore */ }
    const frame = box(0.56, 0.72, 0.04, M.frame, -5.2, 2.0, 8.975); scene.add(frame); perkObjs.push(frame);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), new THREE.MeshStandardMaterial({ map: textTexture(['EMPLOYEE OF THE MONTH'], 256, 40, '#c9a227', '#1a1a1a', 'bold 20px Inter, Arial') })); title.position.set(-5.2, 2.28, 8.95); title.rotation.y = Math.PI; scene.add(title); perkObjs.push(title);
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.42), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }));
    photo.position.set(-5.2, 1.92, 8.95); photo.rotation.y = Math.PI; scene.add(photo); perkObjs.push(photo);
    if (url) new THREE.TextureLoader().load(url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; const m = photo.material as THREE.MeshStandardMaterial; m.map = tex; m.needsUpdate = true; });
  }
}

function buildReviewRoom(): void {
  const g = new THREE.Group();
  g.position.set(40, 0, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), mat('#2a2d36'));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), mat('#3a3a40'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.2; g.add(ceil);
  const wallM = mat('#5a5048');
  g.add(box(10, 3.2, 0.2, wallM, 0, 1.6, -4.5), box(10, 3.2, 0.2, wallM, 0, 1.6, 4.5), box(0.2, 3.2, 9, wallM, -5, 1.6, 0), box(0.2, 3.2, 9, wallM, 5, 1.6, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.0), new THREE.MeshStandardMaterial({ color: '#f5d76e', emissive: '#f5d76e', emissiveIntensity: 0.55, roughness: 0.9 }));
  screen.position.set(0, 1.85, -4.38); g.add(screen);
  g.add(box(5.4, 3.2, 0.06, mat('#1a1a1a'), 0, 1.85, -4.41));
  g.add(box(4.6, 0.08, 1.4, mat('#4a3328', { roughness: 0.5 }), 0, 0.76, 0));
  g.add(box(0.1, 0.72, 1.0, mat('#2a2a2e'), -2.1, 0.38, 0), box(0.1, 0.72, 1.0, mat('#2a2a2e'), 2.1, 0.38, 0));
  for (const x of [-1.6, -0.5, 0.6, 1.7]) for (const z of [-1.0, 1.0]) { g.add(box(0.46, 0.06, 0.46, M.chair, x, 0.48, z)); g.add(box(0.46, 0.5, 0.06, M.chair, x, 0.78, z + (z > 0 ? 0.22 : -0.22))); }
  g.add(box(0.5, 0.2, 0.5, mat('#d8d4cc'), 0, 2.95, 1.6));
  const beam = new THREE.SpotLight('#fff1c4', 40, 12, 0.5, 0.6, 1.2);
  beam.position.set(0, 2.9, 1.6); beam.target.position.set(0, 1.85, -4.4); g.add(beam, beam.target);
  g.add(new THREE.PointLight('#ffb070', 6, 8, 2).translateY(2.4).translateZ(2));
  krull = new Person({ name: 'Mr. Krull', shirt: '#d94b4b', seed: 777, body: 'man', outfit: 'suit', hairStyle: 0, scalp: 'half', skin: '#c94e26', hair: '#1a1a1a', trousers: '#1a1a1a', beard: 1, chain: true, shades: false, boss: true });
  krull.sitAt(new THREE.Vector3(40 - 3.1, 0, 0.2), 1);
  krull.group.rotation.y = -Math.PI / 2;
  scene.add(krull.group);
  scene.add(g);
  reviewGroup = g;
  buildKrullOffice();
}

// Mr. Krull's office: a small room beside the review room, its own Krull behind the desk (game/krull-office.ts)
let krullOfficeGroup: THREE.Group | null = null;
let krullBoss: Person | null = null;
function buildKrullOffice(): void {
  const g = new THREE.Group();
  g.position.set(40, 0, 20);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat('#3a2a22')); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat('#2a2a30')); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3; g.add(ceil);
  const wallM = mat('#4a3f38');
  g.add(box(7, 3, 0.2, wallM, 0, 1.5, -3.5), box(7, 3, 0.2, wallM, 0, 1.5, 3.5), box(0.2, 3, 7, wallM, -3.5, 1.5, 0), box(0.2, 3, 7, wallM, 3.5, 1.5, 0));
  // the window behind him: the harbour at night
  const night = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshStandardMaterial({ map: textTexture(['', '  ·     ·  ·', '    ·  ·', ' ·      ·    ·'], 512, 288, '#0b1424', '#f2a93b', 'bold 36px Arial'), emissive: '#1a2a44', emissiveIntensity: 0.6, roughness: 0.9 })); night.position.set(0, 1.75, -3.38); g.add(night);
  g.add(box(2.8, 1.7, 0.06, mat('#2a2a2e'), 0, 1.75, -3.41));
  // the desk, the lamp, the cabinet, the plaque, the chair you are told to sit in
  g.add(box(2.4, 0.08, 1.1, mat('#3a2418', { roughness: 0.4 }), 0, 0.78, -0.6));
  g.add(box(0.1, 0.74, 1.0, mat('#2a1a10'), -1.1, 0.37, -0.6), box(0.1, 0.74, 1.0, mat('#2a1a10'), 1.1, 0.37, -0.6));
  g.add(box(0.5, 0.06, 0.3, mat('#1a1a1a'), 0.3, 0.85, -0.5));
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), new THREE.MeshStandardMaterial({ map: textTexture(['MR. KRULL · MANAGER'], 256, 48, '#c9a227', '#1a1a1a', 'bold 22px Inter, Arial') })); plaque.position.set(-0.4, 0.88, -0.12); plaque.rotation.x = -0.35; g.add(plaque);
  g.add(box(0.8, 1.4, 0.5, mat('#5a5a60', { metalness: 0.4, roughness: 0.5 }), 2.8, 0.7, -2.9));
  g.add(box(0.03, 0.5, 0.03, mat('#1a1a1a'), -0.9, 1.08, -0.9));
  const lamp = new THREE.PointLight('#ffd9a0', 6, 6, 2); lamp.position.set(-0.9, 1.4, -0.8); g.add(lamp);
  g.add(new THREE.PointLight('#ffb070', 3, 7, 2).translateY(2.6).translateZ(1.5));
  g.add(box(0.5, 0.06, 0.5, M.chair, 0.6, 0.48, 1.2), box(0.5, 0.5, 0.06, M.chair, 0.6, 0.78, 1.45));
  krullBoss = new Person({ name: 'Mr. Krull', shirt: '#d94b4b', seed: 777, body: 'man', outfit: 'suit', hairStyle: 0, scalp: 'half', skin: '#c94e26', hair: '#1a1a1a', trousers: '#1a1a1a', beard: 1, chain: true, shades: false, boss: true });
  krullBoss.sitAt(new THREE.Vector3(40, 0, 20 - 1.3), -1);
  krullBoss.group.rotation.y = 0;
  scene.add(krullBoss.group);
  scene.add(g);
  krullOfficeGroup = g;
}
/** three strikes: the camera sits in the chair across Krull's desk */
export function enterKrullOffice(): void {
  if (!officeAvailable() || !krullOfficeGroup) return;
  build();
  if (camHost) { container!.appendChild(renderer!.domElement); camHost = null; }
  container!.hidden = false;
  mode = 'krull';
  hint && (hint.hidden = true); look && (look.hidden = true); floorHud && (floorHud.hidden = true);
  resize();
  t0 = performance.now();
  setRenderer(frame);
}
export function leaveKrullOffice(): void {
  if (mode !== 'krull') return;
  mode = 'off';
  container!.hidden = true;
  setRenderer(null);
}

// ---------- the original's disasters on the floor, and the firing ----------
// a soft flame for sprites (additive): the review-room fire and the indoor fireworks
let flameMat: THREE.SpriteMaterial | null = null;
function flameMaterial(): THREE.SpriteMaterial {
  if (flameMat) return flameMat;
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 60, 4, 32, 56, 34);
  grad.addColorStop(0, 'rgba(255,245,180,1)'); grad.addColorStop(0.35, 'rgba(255,150,40,.9)'); grad.addColorStop(0.7, 'rgba(230,50,10,.45)'); grad.addColorStop(1, 'rgba(120,10,0,0)');
  g.fillStyle = grad; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(58, 34, 62, 70, 32, 94); g.bezierCurveTo(2, 70, 6, 34, 32, 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  flameMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  return flameMat;
}
const BASE_FOG = { color: '#1b2432', near: 16, far: 36 };
let doom: { sprites: THREE.Sprite[]; light: THREE.PointLight } | null = null;
/** the last slide of a failed review: the review room fills with red fog and small fires (review.ts) */
export function setReviewDoom(on: boolean): void {
  if (!built || !reviewGroup) return;
  if (!on) {
    if (!doom) return;
    for (const s of doom.sprites) reviewGroup.remove(s);
    reviewGroup.remove(doom.light);
    doom = null;
    scene.fog = new THREE.Fog(BASE_FOG.color, BASE_FOG.near, BASE_FOG.far);
    return;
  }
  if (doom) return;
  const mat = flameMaterial();
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(mat);
    s.layers.set(1);
    s.position.set((Math.random() - 0.5) * 9, 0.3, -3.6 + Math.random() * 7.5);
    s.userData.phase = Math.random() * 10; s.userData.size = 0.5 + Math.random() * 0.5;
    s.scale.set(s.userData.size, s.userData.size * 1.6, 1);
    reviewGroup.add(s); sprites.push(s);
  }
  const light = new THREE.PointLight('#ff5a1a', 22, 14, 1.4); light.position.set(0, 1.2, 0); reviewGroup.add(light);
  scene.fog = new THREE.Fog('#5a1208', 3, 15);
  doom = { sprites, light };
}

// short-lived effects on the office floor, stepped from frame(): a brown flood, fireworks, a lightning strike, a cough cloud
interface Fx { update(dt: number, t: number): boolean }
const fx: Fx[] = [];
export type FloorFx = 'poop' | 'fireworks' | 'lightning' | 'pandemic';
export function floorEffect(kind: FloorFx, ms = 20_000): void {
  if (!built) return;
  const end = performance.now() + ms;
  if (kind === 'poop') {
    // brown blobs tumble across the aisles and pile up; they sink away when it is over
    const geo = new THREE.IcosahedronGeometry(0.22, 0);
    const m = new THREE.MeshStandardMaterial({ color: '#6b3a1e', roughness: 0.55, flatShading: true });
    const blobs: { mesh: THREE.Mesh; vx: number; vz: number; spin: number }[] = [];
    for (let i = 0; i < 70; i++) {
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true;
      const s = 0.5 + Math.random() * 1.5; mesh.scale.set(s, s * 0.75, s);
      mesh.position.set(-11 + Math.random() * 22, 0.12 * s, -8 + Math.random() * 16);
      scene.add(mesh); blobs.push({ mesh, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, spin: (Math.random() - 0.5) * 3 });
    }
    fx.push({ update(dt) {
      const s = dt / 1000, left = end - performance.now();
      for (const b of blobs) { b.mesh.position.x += b.vx * s; b.mesh.position.z += b.vz * s; b.mesh.rotation.x += b.spin * s; b.mesh.rotation.z += b.spin * 0.6 * s; if (left < 1500) b.mesh.position.y -= s * 0.5; }
      if (left > 0) return true;
      for (const b of blobs) scene.remove(b.mesh);
      geo.dispose(); m.dispose(); return false;
    } });
  } else if (kind === 'fireworks') {
    // rockets whistle up from the floor and burst into sparks, a new one every second
    const mat = flameMaterial();
    const sparkMats = ['#ff4a4a', '#ffd166', '#6fd1ff', '#3fe86a', '#ff7ad9'].map((c) => new THREE.SpriteMaterial({ color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const parts: { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; rocket: boolean }[] = [];
    const light = new THREE.PointLight('#ffd166', 0, 14, 1.5); light.position.set(0, 2.2, 0); scene.add(light);
    let next = 0;
    const launch = () => {
      const s = new THREE.Sprite(mat); s.layers.set(1); s.scale.set(0.25, 0.5, 1);
      s.position.set(-9 + Math.random() * 18, 0.2, -7 + Math.random() * 14);
      scene.add(s); parts.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 3.2 + Math.random(), (Math.random() - 0.5) * 0.6), life: 0, max: 0.8 + Math.random() * 0.3, rocket: true });
    };
    fx.push({ update(dt) {
      const sec = dt / 1000, now = performance.now();
      if (now < end && now > next) { launch(); next = now + 700 + Math.random() * 600; }
      light.intensity = Math.max(0, light.intensity - sec * 40);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life += sec; p.s.position.addScaledVector(p.v, sec);
        if (p.rocket) {
          if (p.life >= p.max) {
            scene.remove(p.s); parts.splice(i, 1); light.position.copy(p.s.position); light.intensity = 30; light.color.set(pick(['#ffd166', '#ff4a4a', '#6fd1ff']));
            for (let k = 0; k < 16; k++) { const sp = new THREE.Sprite(pick(sparkMats)); sp.layers.set(1); sp.scale.setScalar(0.12); sp.position.copy(p.s.position); const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI; scene.add(sp); parts.push({ s: sp, v: new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)).multiplyScalar(1.6 + Math.random()), life: 0, max: 1.1, rocket: false }); }
          }
        } else { p.v.y -= 2.5 * sec; (p.s.material as THREE.SpriteMaterial).opacity = 1 - p.life / p.max; if (p.life >= p.max) { scene.remove(p.s); (p.s.material as THREE.SpriteMaterial).dispose(); parts.splice(i, 1); } }
      }
      if (now < end || parts.length) return true;
      scene.remove(light); return false;
    } });
  } else if (kind === 'lightning') {
    // two white flashes, then the lights brown out for a few seconds
    const flash = new THREE.AmbientLight('#ffffff', 0); scene.add(flash);
    const start = performance.now();
    fx.push({ update() {
      const k = (performance.now() - start) / 1000;
      flash.intensity = (k < 0.12 || (k > 0.3 && k < 0.42)) ? 9 : 0;
      scene.fog = k < 0.42 ? new THREE.Fog('#ffffff', 2, 20) : (k < 3.5 ? new THREE.Fog('#0b0d12', 4, 18) : new THREE.Fog(BASE_FOG.color, BASE_FOG.near, BASE_FOG.far));
      if (k < 3.6) return true;
      scene.remove(flash); return false;
    } });
  } else {
    // everyone coughs; green clouds hang over every desk
    let cough = 0;
    fx.push({ update(dt) {
      cough -= dt;
      if (cough <= 0 && cloudMat) {
        cough = 900;
        const who = people[Math.floor(Math.random() * people.length)];
        if (who) { who.cough(); for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(cloudMat.clone()); s.layers.set(1); s.position.copy(who.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5)); s.scale.setScalar(0.3); scene.add(s); clouds.push({ sprite: s, life: 0 }); } }
      }
      return performance.now() < end;
    } });
  }
}
function updateFx(dt: number, t: number): void {
  for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].update(dt, t)) fx.splice(i, 1);
  if (doom) { const ts = t / 1000; for (const s of doom.sprites) { const w = 0.85 + Math.sin(ts * 9 + s.userData.phase) * 0.15 + Math.sin(ts * 23 + s.userData.phase * 2) * 0.06; s.scale.set(s.userData.size * w, s.userData.size * 1.6 * (2 - w), 1); } doom.light.intensity = 20 + Math.sin(ts * 11) * 4; }
  updateWalks(dt);
  updateRival(dt);
  updateGoose(dt);
  if (ringMesh) { ringMesh.rotation.z += dt * 0.002; const k = 1 + Math.sin(t / 240) * 0.08; ringMesh.scale.set(k, k, 1); }
}

// ---------- the colleagues walk the floor; the walk to the meeting room ----------
// a walk is a list of waypoints: out of the chair into the aisle behind it, along a lane, to a spot (the kitchen,
// the cork board, the TV, the whiteboard), a dwell, and the same way back into the chair
interface Walk { p: Person; desk: Desk | null; path: THREE.Vector3[]; i: number; dwell: number; speed: number; back: boolean; vanish: boolean }
const walks: Walk[] = [];
let wanderAt = 18_000;
const SPOTS = [new THREE.Vector3(-8.2, 0, -5.4), new THREE.Vector3(-8, 0, 7.6), new THREE.Vector3(-9.6, 0, -7.1), new THREE.Vector3(2, 0, 7.9), new THREE.Vector3(9.4, 0, 6.6), new THREE.Vector3(-11.2, 0, -5.6)];
const DOOR = new THREE.Vector3(11.3, 0, 0);
function routeFrom(d: Desk, to: THREE.Vector3): THREE.Vector3[] {
  const f = d.facing;
  const aisle = new THREE.Vector3(d.seat.x, 0, d.seat.z + 1.15 * f);
  const lane = to.x < d.seat.x - 1 ? -7.7 : to.x > d.seat.x + 1 ? 8.5 : (to.x < 0 ? -7.7 : 8.5);
  return [aisle, new THREE.Vector3(lane, 0, aisle.z), new THREE.Vector3(lane, 0, to.z), to.clone()];
}
function startWalk(p: Person, to: THREE.Vector3, opts: { vanish?: boolean; dwell?: number } = {}): void {
  const d = (p as Person & { desk?: Desk }).desk ?? null;
  if (!d || walks.some((w) => w.p === p)) return;
  setScreen(d, 'idle');
  const path = routeFrom(d, to);
  walks.push({ p, desk: d, path, i: 0, dwell: opts.dwell ?? 6000 + Math.random() * 8000, speed: 1.15 + Math.random() * 0.3, back: false, vanish: !!opts.vanish });
  p.stand(d.seat.x, d.seat.z, p.group.rotation.y);
}
function updateWalks(dt: number): void {
  const s = dt / 1000;
  for (let k = walks.length - 1; k >= 0; k--) {
    const w = walks[k];
    const target = w.path[w.i];
    if (!target) {
      // at the end of the path: dwell, then walk back; home again: sit
      if (!w.back) { w.dwell -= dt; if (w.dwell <= 0) { if (w.vanish) { w.p.group.visible = false; walks.splice(k, 1); continue; } w.path = [...w.path].reverse().slice(1); w.path.push(new THREE.Vector3(w.desk!.seat.x, 0, w.desk!.seat.z)); w.i = 0; w.back = true; } else w.p.stand(w.p.group.position.x, w.p.group.position.z, w.p.group.rotation.y + Math.sin(performance.now() / 900) * 0.004); continue; }
      walks.splice(k, 1);
      if (w.desk) { seat(w.p, w.desk); setScreen(w.desk, 'phone'); }
      continue;
    }
    const pos = w.p.group.position;
    const dx = target.x - pos.x, dz = target.z - pos.z, dist = Math.hypot(dx, dz);
    const step = w.speed * s;
    if (dist <= step) { w.p.stand(target.x, target.z, w.p.group.rotation.y); w.i++; continue; }
    w.p.stand(pos.x + (dx / dist) * step, pos.z + (dz / dist) * step, Math.atan2(dx, dz));
  }
  // now and then a seated colleague gets up (not in co-op's remote people, not during a review, at most two at once)
  wanderAt -= dt;
  if (wanderAt > 0 || mode === 'review' || mode === 'off' || reviewWalk) return;
  wanderAt = 14_000 + Math.random() * 22_000;
  const seated = people.filter((p) => p !== selfAvatar && p !== krull && !remote.has(p.name) && p.seated && p.fallen <= 0 && (p as Person & { desk?: Desk }).desk && !walks.some((w) => w.p === p) && !state.abducted.includes(p.name));
  if (!goose && state.day >= 2 && Math.random() < 0.08) { spawnGoose(); return; }
  if (walks.length >= 2 || !seated.length || Math.random() < 0.35) return;
  startWalk(pick(seated), pick(SPOTS));
}
// the goose: a white bird that crosses the floor, honking; click it and it flees (a badge for the catch)
let goose: THREE.Group | null = null;
let goosePath: THREE.Vector3[] = [], gooseI = 0, gooseSpeed = 0.9, gooseHonk = 0, gooseCaught = false;
export function spawnGoose(): void {
  if (goose || !built) return;
  const g = new THREE.Group();
  const white = mat('#f4f1ea', { roughness: 0.7 }), orange = mat('#f08a24');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), white); body.scale.set(1, 0.8, 1.4); body.position.y = 0.32; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 10), white); neck.position.set(0, 0.6, 0.22); neck.rotation.x = 0.35; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), white); head.position.set(0, 0.82, 0.32); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), orange); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.8, 0.45); g.add(beak);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), M.black); eye.position.set(sx * 0.06, 0.85, 0.36); g.add(eye); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.12), orange); foot.position.set(sx * 0.08, 0.01, 0); g.add(foot); }
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.5; hit.userData.goose = true; g.add(hit);
  g.name = 'goose';
  const fromWest = Math.random() < 0.5;
  goosePath = fromWest ? [new THREE.Vector3(-11, 0, 3.4), new THREE.Vector3(-7.7, 0, 3.4), new THREE.Vector3(-7.7, 0, -2.6), new THREE.Vector3(8.5, 0, -2.6), new THREE.Vector3(8.5, 0, 6.6), new THREE.Vector3(11.4, 0, 6.6)] : [new THREE.Vector3(11.4, 0, -2.6), new THREE.Vector3(8.5, 0, -2.6), new THREE.Vector3(8.5, 0, 3.4), new THREE.Vector3(-7.7, 0, 3.4), new THREE.Vector3(-7.7, 0, 7.6), new THREE.Vector3(-11, 0, 7.6)];
  g.position.copy(goosePath[0]); gooseI = 1; gooseSpeed = 0.9; gooseHonk = 1500; gooseCaught = false;
  scene.add(g); goose = g;
  toast('A goose is on the floor. Nobody let a goose in.', 'info', 3500);
}
function updateGoose(dt: number): void {
  if (!goose) return;
  const target = goosePath[gooseI];
  if (!target) { scene.remove(goose); goose = null; return; }
  const pos = goose.position, dx = target.x - pos.x, dz = target.z - pos.z, dist = Math.hypot(dx, dz), step = gooseSpeed * dt / 1000;
  if (dist <= step) { pos.copy(target); gooseI++; } else { pos.x += (dx / dist) * step; pos.z += (dz / dist) * step; goose.rotation.y = Math.atan2(dx, dz); }
  goose.position.y = Math.abs(Math.sin(performance.now() / 110)) * 0.03;
  gooseHonk -= dt;
  if (gooseHonk <= 0) { gooseHonk = 2500 + Math.random() * 4000; sfx.honk(); }
}
function catchGoose(): void {
  if (!goose || gooseCaught) return;
  gooseCaught = true; gooseSpeed = 3.2; sfx.honk(); sfx.honk();
  toast('HONK. The goose has been caught. The goose is not pleased.', 'money', 4000);
  bus.emit('goose:caught');
}
// the glowing ring at a free desk (the first-day tutorial)
let ringMesh: THREE.Mesh | null = null;
export function markFreeDesk(on: boolean): void {
  if (!built) return;
  if (ringMesh) { scene.remove(ringMesh); ringMesh = null; }
  if (!on) return;
  const d = desks.find((x) => !x.person) ?? desks[0];
  ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.set(d.seat.x, 0.02, d.seat.z + 0.1 * d.facing);
  scene.add(ringMesh);
}
// the walk to the review: the colleagues file out through the east door, you follow; at the door the slides begin
let reviewWalk: (() => void) | null = null;
export function walkToReview(): Promise<void> {
  if (!officeAvailable()) return Promise.resolve();
  return new Promise((resolve) => {
    enterOffice(() => { /* sitting is not an option on the way out */ }, { standFrom: true });
    reviewWalk = () => { reviewWalk = null; if (door) door.material = M.doorIdle; leaveOffice(); resolve(); };
    if (door) door.material = M.doorLit;
    for (const p of people) if (p !== selfAvatar && p !== krull && !remote.has(p.name) && (p as Person & { desk?: Desk }).desk && p.seated) startWalk(p, DOOR, { vanish: true, dwell: 400 });
    showHint(`${t('Shift over')}. ${t('Walk to the meeting room: the lit door on the east wall.')} <button type="button" class="btn hint__btn" data-skipwalk>${t('Skip the walk')}</button>`);
    hint?.querySelector('[data-skipwalk]')?.addEventListener('click', () => reviewWalk?.());
    if (floorHud) floorHud.hidden = true;
  });
}

function watchReview(): void {
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => { if (n instanceof HTMLElement && n.classList.contains('review')) enterReviewRoom(n); });
      m.removedNodes.forEach((n) => { if (n instanceof HTMLElement && n.classList.contains('review') && mode === 'review') { mode = 'off'; setReviewDoom(false); leaveOffice(); } });
    }
  });
  mo.observe(document.body, { childList: true });
}

function enterReviewRoom(el: HTMLElement): void {
  if (!officeAvailable() || !reviewGroup) return;
  container!.hidden = false;
  el.classList.add('review--3d');
  mode = 'review';
  hint && (hint.hidden = true); look && (look.hidden = true); floorHud && (floorHud.hidden = true);
  resize();
  t0 = performance.now();
  setRenderer(frame);
}

function drawLead(): void {
  if (!leadCanvas || !leadTex) return;
  const g = leadCanvas.getContext('2d')!;
  const rows = [{ name: settings.playerName || 'You', earned: state.personal, me: true }, ...state.colleagues.map((c) => ({ name: c.name, earned: c.earned, me: false }))].sort((a, b) => b.earned - a.earned).slice(0, 4);
  const top = Math.max(1, rows[0]?.earned ?? 1);
  g.fillStyle = '#1b1510'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ffd166'; g.font = 'bold 26px Inter, Arial'; g.textAlign = 'left'; g.fillText('TOP EARNERS', 24, 42);
  g.fillStyle = '#9a8a6a'; g.font = 'bold 16px Inter, Arial'; g.textAlign = 'right'; g.fillText('KEEP PUSHING', 488, 42);
  const tags = ['1st', '2nd', '3rd', '4th'];
  rows.forEach((r, i) => {
    const y = 78 + i * 44;
    g.fillStyle = i === 0 ? '#ffd166' : '#6a5a3a'; g.beginPath(); g.roundRect(24, y - 20, 54, 30, 6); g.fill();
    g.fillStyle = i === 0 ? '#1b1510' : '#f4f1ea'; g.font = 'bold 16px Inter, Arial'; g.textAlign = 'center'; g.fillText(tags[i], 51, y + 1);
    g.fillStyle = r.me ? '#ffd166' : '#f4f1ea'; g.font = 'bold 20px Inter, Arial'; g.textAlign = 'left'; g.fillText(r.name.slice(0, 14), 92, y + 1);
    g.fillStyle = '#2b2218'; g.fillRect(92, y + 8, 300, 6);
    g.fillStyle = r.earned >= top ? '#30c67c' : '#e8a040'; g.fillRect(92, y + 8, 300 * (r.earned / top), 6);
    g.fillStyle = '#30c67c'; g.font = 'bold 20px Inter, Arial'; g.textAlign = 'right'; g.fillText(fmt(r.earned), 488, y + 1);
  });
  leadTex.needsUpdate = true;
}

function drawBoard(): void {
  if (!boardCanvas || !boardTex) return;
  const g = boardCanvas.getContext('2d')!;
  g.fillStyle = '#101827'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#f2a93b'; g.font = 'bold 28px Inter, Arial'; g.textAlign = 'left'; g.fillText(`SUNRISE CUSTOMER CARE — FLOOR ${floorFor(state.day)}`, 24, 48, 464);
  g.fillStyle = '#9aa3b8'; g.font = '20px Inter, Arial'; g.fillText('TEAM', 24, 100); g.fillText('QUOTA', 24, 150); g.fillText('DAY', 24, 200);
  g.font = 'bold 40px Inter, Arial'; g.textAlign = 'right';
  g.fillStyle = state.team >= state.quota ? '#30c67c' : '#ffd166'; g.fillText(fmt(state.team), 488, 108);
  g.fillStyle = '#f4f1ea'; g.fillText(fmt(state.quota), 488, 158); g.fillText(String(state.day), 488, 208);
  boardTex.needsUpdate = true;
}

function updateFloorHud(): void {
  if (!floorHud) return;
  const s = Math.max(0, Math.ceil(state.shiftLeft / 1000));
  floorHud.querySelector('.floor-hud__time')!.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  floorHud.querySelector('.floor-hud__money')!.textContent = `${fmt(state.team)} / ${fmt(state.quota)}`;
  const call = floorHud.querySelector<HTMLElement>('.floor-hud__call')!;
  call.hidden = !ringingName;
  if (ringingName) call.textContent = t('📞 {name} is calling — sit at any PC (walk up, press E)', { name: ringingName });
}

function resize(): void {
  if (!renderer || !container) return;
  const host = camHost ?? container;
  const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  camera.aspect = w / h; camera.updateProjectionMatrix();
  cctv.aspect = w / h; cctv.updateProjectionMatrix();
  selfCam.aspect = w / h; selfCam.updateProjectionMatrix();
  composer?.setSize(w, h);
}

function showHint(html: string): void { if (!hint) return; hint.innerHTML = html; hint.hidden = false; }
function showWalkHint(): void {
  if (touch) { showHint(state.phase === 'shift' ? t('Left stick: walk · drag the right side: look · SIT at a free PC') : t('Left stick: walk · drag the right side: look · SIT at a free desk to clock in')); return; }
  // the keys are markup, so the words around them are translated as one line with {placeholders}
  const k = (s: string) => `<kbd>${s}</kbd>`;
  const kb = { wasd: k('W A S D'), ijkl: k('I J K L'), shift: k('Shift'), e: k('E'), f: k('F'), p: k('P') };
  showHint(state.phase === 'shift'
    ? t('Click to look · {wasd} walk ({ijkl} look) · {shift} run · click: pick up / throw · {e} sit at a free PC', kb) + (settings.family ? '' : ' · ' + t('{f} and hold {p}… you know', kb))
    : t('Click to look around · {wasd} walk · {ijkl} look · click a free desk (or press {e} near one) to sit · click a colleague to slap', kb));
}

// ---------- touch, gamepad and keyboard-only control of the walk ----------
// a phone or tablet: a left thumb-stick walks, a drag on the right half looks, three buttons for E, run and stand
const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
const touchDir = { x: 0, y: 0 };
let touchRun = false;
let pad: HTMLElement | null = null;
function buildTouchPad(host: HTMLElement): void {
  if (!touch) return;
  pad = document.createElement('div');
  pad.className = 'touchpad';
  pad.hidden = true;
  pad.innerHTML = `<div class="touchpad__stick" aria-label="Walk"><i></i></div><div class="touchpad__look" aria-label="Look"></div><div class="touchpad__btns"><button type="button" class="touchpad__btn" data-act="sit">SIT</button><button type="button" class="touchpad__btn" data-act="run">RUN</button><button type="button" class="touchpad__btn" data-act="pick">PICK</button></div>`;
  host.appendChild(pad);
  const stick = pad.querySelector<HTMLElement>('.touchpad__stick')!, knob = stick.querySelector<HTMLElement>('i')!, lookArea = pad.querySelector<HTMLElement>('.touchpad__look')!;
  let stickId = -1, lookId = -1, lx = 0, ly = 0;
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const r = stick.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1, k = Math.min(1, len);
    touchDir.x = (dx / len) * k; touchDir.y = (dy / len) * k;
    knob.style.transform = `translate(${touchDir.x * 28}px, ${touchDir.y * 28}px)`;
  });
  const stickUp = (e: PointerEvent) => { if (e.pointerId !== stickId) return; stickId = -1; touchDir.x = touchDir.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', stickUp); stick.addEventListener('pointercancel', stickUp);
  lookArea.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; lookArea.setPointerCapture(e.pointerId); });
  lookArea.addEventListener('pointermove', (e) => { if (e.pointerId !== lookId || mode !== 'walk') return; player.yaw -= (e.clientX - lx) * 0.006; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY; });
  const lookUp = (e: PointerEvent) => { if (e.pointerId === lookId) lookId = -1; };
  lookArea.addEventListener('pointerup', lookUp); lookArea.addEventListener('pointercancel', lookUp);
  pad.querySelector('[data-act="sit"]')!.addEventListener('click', () => { if (mode !== 'walk') return; if (held) dropHeld(); else trySit(); });
  pad.querySelector('[data-act="pick"]')!.addEventListener('click', () => { if (mode === 'walk') onClick(); });
  const run = pad.querySelector<HTMLButtonElement>('[data-act="run"]')!;
  run.addEventListener('pointerdown', () => { touchRun = true; run.classList.add('is-down'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) run.addEventListener(ev, () => { touchRun = false; run.classList.remove('is-down'); });
}
// a gamepad: left stick walks, right stick looks, A sits / picks up, B stands, X the gas, Y the radio, a trigger runs
const padDir = { x: 0, y: 0 };
let padRun = false;
const padWas: boolean[] = [];
function pollGamepad(dt: number): void {
  const gp = navigator.getGamepads?.()[0];
  if (!gp) { padDir.x = padDir.y = 0; padRun = false; return; }
  const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
  padDir.x = dz(gp.axes[0] ?? 0); padDir.y = dz(gp.axes[1] ?? 0);
  if (mode === 'walk') { player.yaw -= dz(gp.axes[2] ?? 0) * dt * 0.0028; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dz(gp.axes[3] ?? 0) * dt * 0.0022)); }
  padRun = (gp.buttons[7]?.value ?? 0) > 0.4 || !!gp.buttons[10]?.pressed;
  const pressed = (i: number) => { const now = !!gp.buttons[i]?.pressed, was = padWas[i] ?? false; padWas[i] = now; return now && !was; };
  if (pressed(0) && mode === 'walk') { if (held) dropHeld(); else trySit(); }
  if (pressed(1)) { if (mode === 'walk') { if (held) dropHeld(); } else if (state.phase === 'shift' && mode === 'off') bus.emit('standup'); }
  if (pressed(2) && mode === 'walk') fart();
  if (pressed(3) && mode === 'walk') toggleRadio();
  for (let i = 4; i < 8; i++) if (i !== 7) pressed(i);
}
// keyboard-only: I J K L turn the head (the arrows walk, with W A S D)
function keyboardLook(dt: number): void {
  if (mode !== 'walk') return;
  const s = dt * 0.0022;
  if (keys.has('j')) player.yaw += s; if (keys.has('l')) player.yaw -= s;
  if (keys.has('i')) player.pitch = Math.min(1.2, player.pitch + s); if (keys.has('k')) player.pitch = Math.max(-1.2, player.pitch - s);
}

// ---------- modes ----------
// what the break-room whiteboard says today (day.ts writes it: quota, targets, the twist)
let boardLines: string[] | null = null;
export function setWhiteboardLines(lines: string[] | null): void { boardLines = lines; }

/** dress the room for today's floor: walls, carpet, the view, the light, the sign, the floor's own furniture */
function applyFloor(): void {
  const th = floorTheme();
  if (th.n === floorShown) return;
  floorShown = th.n;
  M.wall.color.set(th.wall); M.wallLow.color.set(th.wallLow); M.rail.color.set(th.rail);
  M.ceiling.color.set(th.ceiling); M.tube.color.set(th.tube); M.tube.emissive.set(th.tube);
  const redraw = (tex: THREE.CanvasTexture | null, draw: (g: CanvasRenderingContext2D) => void) => { if (!tex) return; draw((tex.image as HTMLCanvasElement).getContext('2d')!); tex.needsUpdate = true; };
  redraw(carpetTex, (g) => drawCarpet(g, th));
  redraw(cityTex, (g) => drawCity(g, th));
  redraw(signTex, (g) => drawFloorSign(g, th, t(th.name)));
  if (hemiLight) { hemiLight.color.set(th.hemi[0]); hemiLight.groundColor.set(th.hemi[1]); }
  keyLight?.color.set(th.key);
  for (const l of ceilingLamps) l.color.set(th.lamp);
  // the furniture: the old floor's goes (its cloned materials with it; the kit's geometry stays cached), the new
  // floor's comes in once the kit has loaded it, unless the floor changed again meanwhile
  const gen = ++decorGen;
  for (const b of decorBoxes.splice(0)) { const i = obstacles.indexOf(b); if (i >= 0) obstacles.splice(i, 1); }
  ceilingFans.length = 0;
  if (decorGroup) {
    for (const child of [...decorGroup.children]) {
      decorGroup.remove(child);
      child.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); });
    }
  }
  for (const [x, z, hw, hd] of th.boxes) { const b = new THREE.Box3(new THREE.Vector3(x - hw, 0, z - hd), new THREE.Vector3(x + hw, 2, z + hd)); decorBoxes.push(b); obstacles.push(b); }
  // a fan hangs from a pivot over its own centre, so it turns in place
  const next = new THREE.Group();
  const pivots = th.fans.map(([x, z]) => { const p = new THREE.Group(); p.position.set(x, 2.62, z); next.add(p); return p; });
  void Promise.all([
    placeMany(next, th.decor),
    ...pivots.map((p) => placeKit(p, { name: 'ceilingFan', x: 0, z: 0, y: 0, h: 0.56, colors: { metal: '#d9d9de', metalDark: '#2b2b31', wood: th.rail } })),
  ]).then(() => {
    if (gen !== decorGen || !decorGroup) return;
    ceilingFans.push(...pivots);
    for (const child of [...next.children]) decorGroup.add(child);
  }).catch((e) => console.warn('floor furniture', e));
}

export function enterOffice(sit: (() => void) | null, opts: { standFrom?: boolean } = {}): void {
  if (!officeAvailable()) { sit?.(); return; }
  build();
  void loadEnvironment();
  // a Floor Cam or Camera window may still hold the canvas; the floor needs it back
  if (camHost) { container!.appendChild(renderer!.domElement); camHost = null; }
  container!.hidden = false;
  onSit = sit;
  dolly = null;
  resize();
  applyFloor();
  if (whiteboardTex) {
    const lines = boardLines ?? [`Floor ${floorFor(state.day)} — day ${state.day}`, '1. Answer the phone', '2. Be nice', '3. Sell the Moon', `4. ${fmt(state.quota)} or else`];
    const t = textTexture(lines, 512, 384, '#fdfdfb', '#1a1a1a', `bold ${lines.length > 5 ? 26 : 34}px "Comic Sans MS", "Segoe Print", Arial`);
    whiteboardTex.image = t.image; whiteboardTex.needsUpdate = true;
  }
  drawBoard();
  drawRival(); drawRivalWindow();
  applyRankPerks();
  syncColleagues();
  const free = () => desks.filter((d) => !d.person);
  for (const p of people) if (p.fallen > 0 && !remote.has(p.name)) { const d = free()[0]; if (d) seat(p, d); }
  if (selfAvatar) selfAvatar.group.visible = false; // you are the camera now, not the puppet
  if (sit) {
    mode = 'walk';
    const d = opts.standFrom && player.seat >= 0 ? desks[player.seat] : null;
    if (d) {
      // stand up behind the chair, looking at the desk
      player.pos.set(d.seat.x, 1.62, d.seat.z + 0.9 * d.facing);
      player.yaw = d.facing === 1 ? 0 : Math.PI; player.pitch = -0.15;
      if (d.person === null) setScreen(d, 'idle');
      player.seat = -1;
      emitLocal(true);
    } else { player.pos.set(-8.5, 1.62, -2.5); player.yaw = -1.1; player.pitch = -0.05; player.seat = -1; }
    showWalkHint();
    if (floorHud) { floorHud.hidden = state.phase !== 'shift'; updateFloorHud(); }
  } else {
    mode = 'idle';
    hint!.hidden = true;
    if (floorHud) floorHud.hidden = true;
  }
  t0 = performance.now();
  setRenderer(frame);
}

export function leaveOffice(): void {
  if (!built || !container) return;
  if (mode === 'cctv' || mode === 'review') return;
  if (held) dropHeld();
  peeing = false;
  mode = 'off';
  container.hidden = true;
  hint && (hint.hidden = true); look && (look.hidden = true); floorHud && (floorHud.hidden = true);
  if (document.pointerLockElement === renderer!.domElement) document.exitPointerLock();
  setRenderer(null);
}

// spectating: the Floor Cam looks over a friend's shoulder at their desk (null = the wide shot)
let followId: string | null = null;
export function followPlayer(id: string | null): void { followId = id; if (!id) { cctv.position.set(10.5, 3.0, 7.5); cctv.lookAt(0, 0.8, -1); } }
function updateFollow(): void {
  if (!followId) return;
  const p = remote.get(followId); const d = p ? (p as Person & { desk?: Desk }).desk : undefined;
  if (!p) return;
  if (d) { cctv.position.set(d.seat.x - 0.5 * d.facing * 0.2, 1.75, d.seat.z + 1.25 * d.facing); cctv.lookAt(d.screen.x, d.screen.y, d.screen.z); }
  else { cctv.position.set(p.group.position.x + 1.2, 1.9, p.group.position.z + 1.6); cctv.lookAt(p.group.position.x, 1.2, p.group.position.z); }
}
export function attachFloorCam(host: HTMLElement, which: 'floor' | 'self' = 'floor'): () => void {
  if (!officeAvailable()) return () => {};
  build();
  if (camHost && camHost !== host) { container!.appendChild(renderer!.domElement); }
  camHost = host;
  camSel = which;
  host.appendChild(renderer!.domElement);
  mode = 'cctv';
  if (which === 'self') placeSelf();
  resize();
  setRenderer(frame);
  return () => {
    if (camHost !== host) return;
    camHost = null;
    container!.appendChild(renderer!.domElement);
    mode = 'off';
    setRenderer(null);
    resize();
  };
}

// your avatar sits at your desk whenever you do (the Floor Cam and the webcam both see it)
function placeSelf(): void {
  const d = player.seat >= 0 ? desks[player.seat] : desks[0];
  if (!selfAvatar) {
    const a = getAvatar();
    selfAvatar = new Person({ name: settings.playerName || 'You', shirt: a.shirt, body: a.body, skin: a.skin, hair: a.hair, hairStyle: a.hairStyle, scalp: a.scalp, outfit: a.outfit, unibrow: a.unibrow, glasses: a.glasses, shades: a.shades, beard: a.beard, chain: a.chain, seed: 4242 });
    scene.add(selfAvatar.group);
    people.push(selfAvatar);
  }
  selfAvatar.group.visible = true;
  selfAvatar.sitAt(d.seat, d.facing);
  // the webcam bar on top of the monitor, looking back at the chair
  const f = d.facing;
  selfCam.position.set(d.pos.x, 1.24, d.pos.z - 0.1 * f);
  selfCam.lookAt(d.seat.x, 1.36, d.seat.z + 0.02 * f);
}

// ---------- the three colleagues who count: their looks, and a re-seat when a run renames them ----------
const LOOKS: Partial<ConstructorParameters<typeof Person>[0]>[] = [
  { body: 'woman', outfit: 'vneck', hairStyle: 0, hair: '#b5462e', scalp: 'full' },
  { body: 'man', outfit: 'hoodie', hairStyle: 1, beard: 2, glasses: true, hair: '#4a2f1a' },
  { body: 'man', outfit: 'suit', hairStyle: 0, scalp: 'half', beard: 3, unibrow: true, hair: '#1a1a1a' },
];
/** the office is built at the title screen; a run that brings custom colleagues (or a co-op room) renames the three
 *  seats afterwards, so each of them is rebuilt with the right name and look when it differs */
function syncColleagues(): void {
  if (!built || !state.colleagues.length) return;
  for (let k = 0; k < Math.min(3, state.colleagues.length, people.length); k++) {
    const c = state.colleagues[k];
    const old = people[k];
    if (!old || old === selfAvatar || old.name === c.name || remote.has(old.name)) continue;
    const d = (old as Person & { desk?: Desk }).desk;
    scene.remove(old.group);
    abductedPeople.delete(old);
    const p = new Person({ seed: 11 + k * 97, name: c.name, shirt: c.shirt, ...(lookFor(c.name) ?? LOOKS[k]) });
    scene.add(p.group);
    people[k] = p;
    if (d) { d.person = null; seat(p, d); }
  }
}

// ---------- the UFO event: a colleague vanishes, chair and all, until tomorrow ----------
const abductedPeople = new Set<Person>();
export function abduct(name: string): void {
  const p = people.find((x) => x.name === name);
  if (!p || abductedPeople.has(p)) return;
  abductedPeople.add(p);
  const d = (p as Person & { desk?: Desk }).desk;
  if (d && d.person === p) { d.person = null; setScreen(d, pick(['idle', 'saver2', 'saver3'])); }
  // lifted straight up, then gone
  const start = performance.now();
  const y0 = p.group.position.y;
  const lift = () => { const k = Math.min(1, (performance.now() - start) / 1400); p.group.position.y = y0 + k * k * 4; if (k < 1) requestAnimationFrame(lift); else { p.group.visible = false; p.group.position.y = y0; } };
  if (settings.motion === 'off') p.group.visible = false; else lift();
}
/** everyone is back at their desk (the next day) */
function returnAbducted(): void {
  for (const p of abductedPeople) { if (state.abducted.includes(p.name)) continue; p.group.visible = true; abductedPeople.delete(p); const free = desks.find((d) => !d.person); if (free) { seat(p, free); setScreen(free, 'phone'); } }
}
bus.on('money', () => { if (abductedPeople.size && built) returnAbducted(); });

// ---------- desk cosmetics (Swindlr Market → state.cosmetics): on your desk, and they follow you to any desk ----------
const kitTagged = new Map<string, THREE.Group>();
const cosmeticObjs: THREE.Object3D[] = [];
let cosmeticChairHidden: THREE.Group | null = null;
let cosmeticsRun = 0;
let goldMat: THREE.MeshStandardMaterial | null = null;

async function applyCosmetics(): Promise<void> {
  if (!built || !desks.length) return;
  const run = ++cosmeticsRun;
  for (const o of cosmeticObjs.splice(0)) scene.remove(o);
  if (cosmeticChairHidden) { cosmeticChairHidden.visible = true; cosmeticChairHidden = null; }
  const d = desks[player.seat >= 0 ? player.seat : 0];
  const { x, z } = d.pos; const f = d.facing; const zs = d.screen.z;
  const keep = (o: THREE.Object3D) => { if (run !== cosmeticsRun) { scene.remove(o); return; } cosmeticObjs.push(o); };
  for (const id of state.cosmetics) {
    if (id === 'plant') {
      const g = await placeKit(scene, { name: 'plantSmall3', x: x - 0.36, z: z - 0.31 * f, y: 0.765, h: 0.26, colors: { plant: '#3f8f4a', wood: '#8a5a3c', woodDark: '#6a4a2c' } });
      keep(g);
    } else if (id === 'trophy') {
      goldMat ??= new THREE.MeshStandardMaterial({ color: '#e0b43a', metalness: 0.75, roughness: 0.28 });
      const g = new THREE.Group();
      const base = new THREE.Mesh(rbox(0.1, 0.025, 0.1, 0.008), M.black); base.position.y = 0.012; g.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 12), goldMat); stem.position.y = 0.055; g.add(stem);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.026, 0.085, 18, 1, true), goldMat); cup.position.y = 0.125; g.add(cup);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, 8, 24), goldMat); lip.rotation.x = Math.PI / 2; lip.position.y = 0.167; g.add(lip);
      for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 8, 16, Math.PI), goldMat); h.position.set(s * 0.05, 0.125, 0); h.rotation.z = s === 1 ? -Math.PI / 2 : Math.PI / 2; g.add(h); }
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
      g.position.set(x + 0.4, 0.768, z - 0.31 * f);
      scene.add(g); keep(g);
    } else if (id === 'monitor') {
      const g = new THREE.Group();
      const stand = new THREE.Mesh(rbox(0.14, 0.02, 0.1, 0.006), M.black); stand.position.y = 0.01; g.add(stand);
      const neck = new THREE.Mesh(rbox(0.03, 0.13, 0.03, 0.006), M.black); neck.position.set(0, 0.08, -0.02); g.add(neck);
      const panel = new THREE.Mesh(rbox(0.4, 0.28, 0.026, 0.008), M.black); panel.position.set(0, 0.26, 0); g.add(panel);
      const tex = SCREENS.saver3 ?? SCREENS.idle;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.4 }));
      scr.position.set(0, 0.26, 0.014); g.add(scr);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      g.position.set(x - 0.52, 0.768, zs - 0.02 * f);
      g.rotation.y = (f === 1 ? 0 : Math.PI) + 0.3 * f;
      scene.add(g); keep(g);
    } else if (id === 'bigplant') {
      const g = await placeKit(scene, { name: 'pottedPlant', x: x + 1.05, z: z + 0.2 * f, y: 0, h: 1.1, colors: { plant: '#3f8f4a', wood: '#7a4a2c', woodDark: '#5a3a1c' } });
      keep(g);
    } else if (id === 'sofa') {
      const g = await placeKit(scene, { name: 'loungeSofa', x, z: z + 1.9 * f, y: 0, ry: f === 1 ? 0 : Math.PI, h: 0.8, colors: { carpet: '#8a5a3c', wood: '#3a2a1c' } });
      keep(g);
    } else if (id === 'rug') {
      const g = await placeKit(scene, { name: 'rugRound', x, z: d.seat.z, y: 0.006, w: 1.4, h: 0.02, colors: { carpet: '#c0392b', carpetWhite: '#f4e8d0' } });
      keep(g);
    } else if (id === 'lamp') {
      const g = await placeKit(scene, { name: 'lampRoundFloor', x: x - 1.05, z: z + 0.2 * f, y: 0, h: 1.5, colors: { metalDark: '#2a2a2e', _defaultMat: '#ffe8b0' } });
      const l = new THREE.PointLight('#ffd9a0', 4, 5, 2); l.position.set(x - 1.05, 1.45, z + 0.2 * f); scene.add(l); keep(l);
      keep(g);
    } else if (id === 'fishtank') {
      // a glass box of water on the desk, one orange fish that paces it (updateFx moves it)
      const g = new THREE.Group();
      const tank = new THREE.Mesh(rbox(0.34, 0.22, 0.18, 0.004), M.glass); tank.position.y = 0.11; g.add(tank);
      const water = new THREE.Mesh(rbox(0.32, 0.18, 0.16, 0.004), new THREE.MeshStandardMaterial({ color: '#4ab3e0', transparent: true, opacity: 0.45, roughness: 0.3 })); water.position.y = 0.1; g.add(water);
      const gravel = new THREE.Mesh(rbox(0.32, 0.02, 0.16, 0.004), mat('#c9b48a')); gravel.position.y = 0.012; g.add(gravel);
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), mat('#f08a24')); fish.rotation.z = -Math.PI / 2; fish.position.set(0, 0.1, 0); fish.name = 'fish'; g.add(fish);
      g.position.set(x + 0.55, 0.768, z - 0.3 * f);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      scene.add(g); keep(g);
      fx.push({ update(_dt, t) { if (!cosmeticObjs.includes(g)) return false; const k = (t / 1000) % 6; const dir = k < 3 ? 1 : -1; fish.position.x = (k < 3 ? -0.12 + k * 0.08 : 0.12 - (k - 3) * 0.08); fish.rotation.z = -Math.PI / 2 * dir; fish.position.y = 0.09 + Math.sin(t / 400) * 0.015; return true; } });
    } else if (id === 'chair') {
      const old = kitTagged.get('chair:' + d.index);
      if (old) { old.visible = false; cosmeticChairHidden = old; }
      const g = await placeKit(scene, { name: 'chairDesk', x, z: d.seat.z, ry: f === 1 ? Math.PI : 0, h: 1.08, colors: { carpet: '#15151a', metalMedium: '#c9a227', metalDark: '#c9a227', metalLight: '#c9a227' }, rough: 0.45 });
      keep(g);
    }
  }
}

// a still of you from the webcam (the Camera app's snapshot)
export function snapshotSelf(): string | null {
  if (!renderer || !selfAvatar) return null;
  renderWith(selfCam);
  try { return renderer.domElement.toDataURL('image/jpeg', 0.7); } catch { return null; }
}

// ---------- co-op hooks ----------
export interface RemotePlayer { id: string; name: string; shirt: string; seat: number; x?: number; z?: number; yaw?: number; app?: string }

const BREAK_SEATS = [0, 1, 2, 3].map((a) => { const ang = (a * Math.PI) / 2; return { pos: new THREE.Vector3(-9.6 + Math.cos(ang) * 1.1, 0, -5.6 + Math.sin(ang) * 1.1), yaw: -ang - Math.PI / 2 }; });

export function setRemotePlayers(list: RemotePlayer[]): void {
  if (!officeAvailable()) return;
  build();
  const seen = new Set<string>();
  let waiting = 0;
  list.forEach((r, k) => {
    seen.add(r.id);
    let p = remote.get(r.id);
    if (!p) {
      p = new Person({ name: r.name, shirt: r.shirt, seed: 500 + k * 131 });
      scene.add(p.group);
      remote.set(r.id, p);
      people.push(p);
    }
    const pd = p as Person & { desk?: Desk };
    if (r.seat < 0) {
      if (pd.desk && pd.desk.person === p) { setScreen(pd.desk, 'idle'); pd.desk.person = null; }
      pd.desk = undefined;
      p.group.visible = true;
      if (r.x !== undefined && r.z !== undefined) { p.stand(r.x, r.z, r.yaw ?? 0); return; }
      const bs = BREAK_SEATS[waiting++];
      p.group.visible = !!bs;
      if (bs) p.sitAt(bs.pos, 1, bs.yaw);
      return;
    }
    p.group.visible = true;
    const d = desks[Math.max(0, Math.min(desks.length - 1, r.seat | 0))];
    // streamer mode: a friend's desk always shows the screensaver
    const app = settings.streamer ? 'idle' : r.app;
    if (pd.desk !== d) { seat(p, d); setScreen(d, app ?? 'phone'); }
    else if (app && d.app !== app) setScreen(d, app);
  });
  for (const [id, p] of remote) if (!seen.has(id)) {
    scene.remove(p.group);
    const d = (p as Person & { desk?: Desk }).desk; if (d && d.person === p) { d.person = null; setScreen(d, 'idle'); }
    remote.delete(id);
    people.splice(people.indexOf(p), 1);
  }
}

// what each friend has on screen, by player id (app ids: os, phone, casino, clicker, surf, paint, idle)
export function setRemoteScreens(map: Record<string, string>): void {
  for (const [id, app] of Object.entries(map)) {
    const p = remote.get(id); const d = p && (p as Person & { desk?: Desk }).desk;
    // streamer mode: a friend's screen shows the screensaver, never what they have open
    if (d) setScreen(d, settings.streamer ? 'idle' : app);
  }
}

export function onLocalPlayer(cb: (p: { seat: number; x: number; z: number; yaw: number }) => void): () => void {
  localListeners.add(cb);
  return () => localListeners.delete(cb);
}

function emitLocal(force = false): void {
  if (!localListeners.size) return;
  const now = performance.now();
  if (!force && now - lastLocalSend < 200) return;
  lastLocalSend = now;
  const p = { seat: player.seat, x: player.pos.x, z: player.pos.z, yaw: player.yaw };
  localListeners.forEach((cb) => cb(p));
}

// everyone on the floor except your own puppet (you cannot slap yourself, however tempting)
function others(): Person[] { return selfAvatar ? people.filter((p) => p !== selfAvatar) : people; }

// ---------- input ----------
function onMouse(e: MouseEvent): void {
  if (mode !== 'walk' || document.pointerLockElement !== renderer!.domElement) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - e.movementY * 0.0022));
}

function onClick(): void {
  if (mode !== 'walk') return;
  if (document.pointerLockElement !== renderer!.domElement) { renderer!.domElement.requestPointerLock(); hint!.hidden = true; return; }
  if (held) { throwHeld(); return; }
  if (goose) { raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); const hitG = raycaster.intersectObject(goose, true); if (hitG.length && hitG[0].distance < 3.2) { catchGoose(); return; } }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const propHit = raycaster.intersectObjects(props.filter((p) => !p.held).map((p) => p.mesh), false).find((h) => h.distance < 2.6);
  if (propHit) { pickUp(propHit.object.userData.propRef as Prop); return; }
  const hits = raycaster.intersectObjects([...desks.map((d) => d.hit), ...others().map((n) => n.hit)], false);
  const h = hits.find((x) => x.distance < 3.2);
  if (!h) return;
  const person = h.object.userData.person as Person | undefined;
  const desk = h.object.userData.desk as Desk | undefined;
  if (person && person.fallen <= 0) { slap(person); return; }
  if (desk) sitAt(desk);
}

function pickUp(p: Prop): void {
  held = p; p.held = true; p.flying = false; p.vel.set(0, 0, 0);
  sfx.click();
  showHint(`Holding a ${p.kind}. Click to throw · <kbd>Q</kbd> to put it down`);
}

function dropHeld(): void {
  if (!held) return;
  const p = held; held = null; p.held = false; p.flying = true;
  p.vel.set(0, -0.5, 0);
  showWalkHint();
}

function throwHeld(): void {
  if (!held) return;
  const p = held; held = null; p.held = false; p.flying = true;
  const f = forward();
  p.vel.copy(f).multiplyScalar(keys.has('shift') ? 11 : 8.5).add(new THREE.Vector3(0, 2.4, 0));
  sfx.throwIt();
  bus.emit('throw', p.kind);
  showWalkHint();
}

function trySit(): void {
  if (reviewWalk) return;   // on the way to the meeting room nobody sits
  let best: Desk | null = null, bd = 2.6;
  for (const d of desks) { const dist = d.seat.distanceTo(player.pos); if (dist < bd) { bd = dist; best = d; } }
  if (best) sitAt(best);
}

function slap(p: Person): void {
  sfx.slap();
  p.fall();
  const d = (p as Person & { desk?: Desk }).desk;
  if (d && d.person === p) { d.person = null; setScreen(d, 'idle'); }
  showHint(`You slapped ${p.name} off the chair. The desk is free. Teamwork!`);
  bus.emit('slap', p.name);
}

function sitAt(desk: Desk): void {
  if (desk.person && desk.person.fallen <= 0) { showHint(`${desk.person.name} is sitting there. Slap them or find a free desk.`); return; }
  if (held) dropHeld();
  mode = 'dolly';
  peeing = false;
  if (document.pointerLockElement === renderer!.domElement) document.exitPointerLock();
  hint!.hidden = true; look && (look.hidden = true); floorHud && (floorHud.hidden = true);
  const moved = player.seat >= 0 && player.seat !== desk.index;
  player.seat = desk.index;
  setScreen(desk, 'boot');
  setTimeout(() => { if (desk.app === 'boot') setScreen(desk, 'os'); }, 2200);
  emitLocal(true);
  bus.emit('floor:sat', { moved, desk: desk.index });
  if (moved) void applyCosmetics();
  placeSelf();
  if (selfAvatar) selfAvatar.group.visible = false; // hidden until the dolly has landed in the chair
  const f = desk.facing;
  const seatCam = desk.seat.clone().add(new THREE.Vector3(0, 0.1, 0.1 * f));
  const to = desk.screen.clone().add(new THREE.Vector3(0, 0, 0.14 * f));
  camera.position.copy(seatCam);
  dolly = { from: seatCam, to, lookFrom: desk.screen.clone().add(new THREE.Vector3(0, 0.25, 0)), lookTo: desk.screen.clone(), t: 0, dur: settings.motion === 'off' ? 1 : 1700 };
  sfx.click();
}

function fart(): void {
  if (!cloudMat || settings.family) return;   // family mode: no gas on the floor
  sfx.fart();
  const back = forward().multiplyScalar(-0.5);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(cloudMat.clone());
    s.layers.set(1);
    s.position.copy(player.pos).add(back).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.9 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4));
    s.scale.setScalar(0.3);
    scene.add(s);
    clouds.push({ sprite: s, life: 0 });
  }
  bus.emit('fart');
  let nearest: Person | null = null, nd = 2.8;
  for (const n of people) { const d = Math.hypot(n.group.position.x - player.pos.x, n.group.position.z - player.pos.z); if (d < nd) { nd = d; nearest = n; } }
  if (nearest) { nearest.cough(); toast(`${nearest.name}: “${pick(REACTIONS)}”`, 'info', 3000); }
}

function forward(): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
}

function move(dt: number): boolean {
  const running = keys.has('shift') || touchRun || padRun;
  const speed = (running ? 5.8 : 3.2) * (dt / 1000);
  const dir = new THREE.Vector3();
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const r = new THREE.Vector3(f.z, 0, -f.x);
  if (keys.has('w') || keys.has('arrowup')) dir.add(f);
  if (keys.has('s') || keys.has('arrowdown')) dir.sub(f);
  if (keys.has('a') || keys.has('arrowleft')) dir.sub(r);
  if (keys.has('d') || keys.has('arrowright')) dir.add(r);
  // the thumb-stick and the gamepad stick: analogue, so a gentle push is a stroll
  const sx = touchDir.x + padDir.x, sy = touchDir.y + padDir.y;
  if (sx || sy) { dir.addScaledVector(f, -sy).addScaledVector(r, sx); }
  if (dir.lengthSq() === 0) return false;
  const k = Math.min(1, dir.length());
  dir.normalize().multiplyScalar(speed * (sx || sy ? k : 1));
  const next = player.pos.clone().add(dir);
  next.x = Math.max(bounds.minX, Math.min(bounds.maxX, next.x));
  next.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, next.z));
  for (const b of obstacles) {
    if (next.x > b.min.x - 0.3 && next.x < b.max.x + 0.3 && next.z > b.min.z - 0.3 && next.z < b.max.z + 0.3) {
      const dxl = next.x - (b.min.x - 0.3), dxr = (b.max.x + 0.3) - next.x, dzl = next.z - (b.min.z - 0.3), dzr = (b.max.z + 0.3) - next.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) next.x = b.min.x - 0.3; else if (m === dxr) next.x = b.max.x + 0.3; else if (m === dzl) next.z = b.min.z - 0.3; else next.z = b.max.z + 0.3;
    }
  }
  player.pos.x = next.x; player.pos.z = next.z;
  player.bob += dt / 1000 * (running ? 14 : 9);
  emitLocal();
  return true;
}

function updateProps(dt: number): void {
  const s = dt / 1000;
  for (const p of props) {
    if (p.held) {
      const f = forward(), r = new THREE.Vector3(f.z, 0, -f.x);
      p.mesh.position.copy(camera.position).add(f.multiplyScalar(0.55)).add(r.multiplyScalar(0.28)).add(new THREE.Vector3(0, -0.22, 0));
      p.mesh.rotation.set(0, player.yaw, 0);
      continue;
    }
    if (!p.flying) continue;
    p.vel.y -= 9.8 * s;
    p.mesh.position.addScaledVector(p.vel, s);
    p.mesh.rotation.x += p.vel.length() * s * 2;
    if (p.mesh.position.y < p.r) {
      p.mesh.position.y = p.r;
      if (Math.abs(p.vel.y) > 1 && p.kind === 'mug') sfx.clink();
      p.vel.y = Math.abs(p.vel.y) > 0.8 ? -p.vel.y * 0.35 : 0;
      p.vel.x *= 0.6; p.vel.z *= 0.6;
    }
    if (p.mesh.position.x < bounds.minX || p.mesh.position.x > bounds.maxX) { p.mesh.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, p.mesh.position.x)); p.vel.x *= -0.5; }
    if (p.mesh.position.z < bounds.minZ || p.mesh.position.z > bounds.maxZ) { p.mesh.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.mesh.position.z)); p.vel.z *= -0.5; }
    if (p.vel.length() > 3) for (const n of people) {
      if (n.fallen > 0) continue;
      if (Math.hypot(n.group.position.x - p.mesh.position.x, n.group.position.z - p.mesh.position.z) < 0.5 && p.mesh.position.y < 2.1) {
        n.fall(); p.vel.multiplyScalar(0.3); sfx.slap();
        const d = (n as Person & { desk?: Desk }).desk; if (d && d.person === n) { d.person = null; setScreen(d, 'idle'); }
        toast(`${n.name} took a ${p.kind} to the head. The desk is free.`, 'info', 3500);
        bus.emit('hit', n.name);
      }
    }
    if (p.vel.lengthSq() < 0.04 && p.mesh.position.y <= p.r + 0.001) { p.flying = false; p.vel.set(0, 0, 0); }
  }
}

function updateGags(dt: number): void {
  const s = dt / 1000;
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.life += s;
    const k = c.life / 2.6;
    c.sprite.scale.setScalar(0.3 + k * 1.4);
    c.sprite.position.y += s * 0.25;
    (c.sprite.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - k);
    if (k >= 1) { scene.remove(c.sprite); (c.sprite.material as THREE.SpriteMaterial).dispose(); clouds.splice(i, 1); }
  }
  if (peeing && mode === 'walk' && !settings.family) {
    dropTimer += dt;
    if (dropTimer > 45) {
      dropTimer = 0;
      const f = forward();
      const m = new THREE.Mesh(dropGeo, M.drop);
      m.position.copy(camera.position).add(f.clone().multiplyScalar(0.25)).add(new THREE.Vector3(0, -0.4, 0));
      scene.add(m);
      drops.push({ mesh: m, vel: new THREE.Vector3(f.x * 2.4 + (Math.random() - 0.5) * 0.3, -0.6, f.z * 2.4 + (Math.random() - 0.5) * 0.3) });
      if (Math.random() < 0.08) sfx.trickle(true);
      if (!peeToast) { peeToast = true; toast('The carpet will remember this.', 'info', 3000); bus.emit('pee'); }
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vel.y -= 9.8 * s;
    d.mesh.position.addScaledVector(d.vel, s);
    if (d.mesh.position.y <= 0.02) {
      if (!puddle) { puddle = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), M.puddle); puddle.rotation.x = -Math.PI / 2; scene.add(puddle); puddle.scale.setScalar(0.2); }
      puddle.position.set(d.mesh.position.x, 0.012, d.mesh.position.z);
      puddle.scale.setScalar(Math.min(1.8, puddle.scale.x + 0.012));
      puddleLife = 0;
      (puddle.material as THREE.MeshStandardMaterial).opacity = 0.75;
      scene.remove(d.mesh); drops.splice(i, 1);
    }
  }
  if (puddle) {
    puddleLife += s;
    if (puddleLife > 45) (puddle.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.75 - (puddleLife - 45) * 0.1);
    if (puddleLife > 55) { scene.remove(puddle); puddle = null; }
  }
}

// you are looking at someone at their desk: colleagues.ts decides whether they have something to say
let lastNearEmit = 0;
function nearColleague(name: string, app: string): void {
  const now = performance.now();
  if (now - lastNearEmit < 1500) return;
  lastNearEmit = now;
  bus.emit('colleague:near', { name, app });
}

function updateLook(): void {
  if (!look || mode !== 'walk') return;
  const now = performance.now();
  if (now - lastLook < 120) return;
  lastLook = now;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects([...desks.map((d) => d.scr), ...others().map((n) => n.hit), ...props.filter((p) => !p.held).map((p) => p.mesh)], false);
  const h = hits.find((x) => x.distance < 3.6);
  if (!h) { look.hidden = true; return; }
  const person = h.object.userData.person as Person | undefined;
  const desk = h.object.userData.desk as Desk | undefined;
  const prop = h.object.userData.propRef as Prop | undefined;
  let text = '';
  if (person) {
    const d = (person as Person & { desk?: Desk }).desk;
    text = d ? `${person.name} — ${SCREEN_LABEL[d.app] ?? d.app}` : person.name;
    if (d && person !== selfAvatar) nearColleague(person.name, d.app);
  }
  else if (desk) text = desk.person ? `${desk.person.name}'s screen — ${SCREEN_LABEL[desk.app] ?? desk.app}` : desk.app === 'os' ? 'your desk' : 'free PC — press E to sit';
  else if (prop) text = `${prop.kind} — click to pick up`;
  look.textContent = text;
  look.hidden = !text;
}

// ---------- probes ----------
export const officeDebug = {
  teleport(x: number, z: number, yaw: number, pitch = 0): void { player.pos.set(x, 1.62, z); player.yaw = yaw; player.pitch = pitch; },
  floorFx(kind: FloorFx, ms?: number): void { floorEffect(kind, ms); },
  wanderNow(): boolean { const seated = people.filter((p) => p !== selfAvatar && p !== krull && !remote.has(p.name) && p.seated && (p as Person & { desk?: Desk }).desk && !walks.some((w) => w.p === p)); if (!seated.length) return false; startWalk(seated[0], SPOTS[0]); return true; },
  walks(): number { return walks.length; },
  goose(): void { spawnGoose(); },
  gooseOn(): boolean { return !!goose; },
  cctvLook(x: number, y: number, z: number, lx: number, ly: number, lz: number): void { followPlayer(null); cctv.position.set(x, y, z); cctv.lookAt(lx, ly, lz); },
  rankPerks(): void { applyRankPerks(); },
  perkCount(): number { return perkObjs.length; },
  // the floor the room is dressed as, and what its furniture added
  floor(): { n: number; wall: string; carpetTop: string; decor: number; fans: number; boxes: number; obstacles: number } {
    const c = carpetTex?.image as HTMLCanvasElement | undefined;
    const px = c?.getContext('2d')?.getImageData(130, 2, 1, 1).data;
    return { n: floorShown, wall: '#' + M.wall.color.getHexString(), carpetTop: px ? `rgb(${px[0]},${px[1]},${px[2]})` : '', decor: decorGroup?.children.length ?? 0, fans: ceilingFans.length, boxes: decorBoxes.length, obstacles: obstacles.length };
  },
  /** which app every desk shows (a friend's desk in streamer mode should say idle) */
  screens(): string[] { return desks.map((d) => d.app); },
  remoteDesk(id: string): number { const p = remote.get(id); const d = p && (p as Person & { desk?: Desk }).desk; return d ? desks.indexOf(d) : -1; },
  fxCount(): number { return fx.length; },
  doom(on: boolean): void { setReviewDoom(on); },
  doomOn(): boolean { return !!doom; },
  pick(): boolean { raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); const h = raycaster.intersectObjects(props.filter((p) => !p.held).map((p) => p.mesh), false).find((x) => x.distance < 2.6); if (!h) return false; pickUp(h.object.userData.propRef as Prop); return true; },
  throw(): void { throwHeld(); },
  fart(): void { fart(); },
  pee(on: boolean): void { peeing = on; },
  sit(): void { trySit(); },
  nearestDesk(): number { let best = -1, bd = 99; for (const d of desks) { const dist = d.seat.distanceTo(player.pos); if (dist < bd) { bd = dist; best = d.index; } } return best; },
  state(): { mode: string; held: string | null; props: number; flying: number; clouds: number; puddle: boolean; seat: number } { return { mode, held: held?.kind ?? null, props: props.length, flying: props.filter((p) => p.flying).length, clouds: clouds.length, puddle: !!puddle, seat: player.seat }; },
  desk(i: number): { x: number; z: number; facing: number } { const d = desks[i]; return { x: d.seat.x, z: d.seat.z, facing: d.facing }; },
  // force what a CRT shows (boot / os / a screensaver) and say where it is, for the look probes
  screen(i: number, app: string): { x: number; y: number; z: number } { const d = desks[i]; setScreen(d, app); return { x: d.screen.x, y: d.screen.y, z: d.screen.z }; },
  lookAt(x: number, y: number, z: number): void { const d = new THREE.Vector3(x, y, z).sub(player.pos).normalize(); player.pitch = Math.asin(Math.max(-1, Math.min(1, d.y))); player.yaw = Math.atan2(-d.x, -d.z); },
  props(): { kind: string; x: number; y: number; z: number; held: boolean }[] { return props.map((p) => ({ kind: p.kind, x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z, held: p.held })); },
  // the puppet the webcam looks at
  self(): ReturnType<Person['debugState']> | null { return selfAvatar ? selfAvatar.debugState() : null; },
  selfBlink(): void { selfAvatar?.blinkNow(); },
  selfScratch(): void { selfAvatar?.scratch(); },
  people(): unknown[] {
    return people.map((p) => {
      const box = new THREE.Box3().setFromObject(p.group);
      let skinned = 0, bad = 0, verts = 0;
      p.group.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) { skinned++; verts += m.geometry.attributes.position.count; } if ((o as THREE.Bone).isBone && [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].some((v) => Number.isNaN(v))) bad++; });
      return { name: p.name, ...p.debugState(), pos: p.group.position.toArray().map((v) => +v.toFixed(2)), min: box.min.toArray().map((v) => +v.toFixed(2)), max: box.max.toArray().map((v) => +v.toFixed(2)), skinned, verts, nanBones: bad, children: p.group.children.length };
    });
  },
  info(): unknown { return renderer ? { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls } : null; },
  cosmetics(): { x: number; y: number; z: number; kids: number }[] { return cosmeticObjs.map((o) => ({ x: +o.position.x.toFixed(2), y: +o.position.y.toFixed(2), z: +o.position.z.toFixed(2), kids: o.children.length })); },
  skinPreview(name: string): string | null { return people.find((p) => p.name === name)?.skinDataUrl() ?? null; },
  // ms per frame of the full pass (render + AO + bloom), GPU included
  bench(n = 10): number { if (!renderer) return -1; const gl = renderer.getContext(); const t = performance.now(); for (let i = 0; i < n; i++) { renderWith(camera); gl.finish(); } return +((performance.now() - t) / n).toFixed(1); },
  fx: FX,
};

function frame(dt: number, t: number): void {
  if (!renderer) return;
  const time = (t - t0) / 1000;
  pollGamepad(dt);
  keyboardLook(dt);
  if (pad) pad.hidden = mode !== 'walk';
  for (const p of people) p.update(dt, t);
  // blades spin; the head sweeps the room like every wall fan does
  for (const b of fans) { b.rotation.z += dt * 0.012; const f = b.parent!; f.rotation.y = (f.userData.ry as number) + Math.sin(t * 0.0004 + f.position.x) * 0.6; }
  for (const f of ceilingFans) f.rotation.y += dt * 0.0035;
  saverClock += dt;
  if (saverClock > 110) { saverClock = 0; const ts = t / 1000; for (const s of SAVERS) { s.draw(s.c.getContext('2d')!, ts); s.tex.needsUpdate = true; } }
  updateProps(dt);
  updateGags(dt);
  updateFx(dt, t);
  if (mode === 'krull') {
    krullBoss?.update(dt, t);
    camera.position.set(40 + 0.6 + Math.sin(time * 0.4) * 0.02, 1.32, 20 + 1.0);
    camera.lookAt(40, 1.25, 20 - 1.3);
  } else if (mode === 'review') {
    krull?.update(dt, t);
    camera.position.set(40 + 0.9 + Math.sin(time * 0.3) * 0.05, 1.45, 2.9);
    camera.lookAt(40 - 0.3, 1.5, -4.4);
  } else if (mode === 'idle') {
    camera.position.set(-8.6 + Math.sin(time * 0.15) * 0.15, 2.1, 7.6);
    camera.lookAt(1.5 + Math.sin(time * 0.1) * 0.6, 0.7, -3);
  } else if (mode === 'walk') {
    const moving = move(dt);
    if (reviewWalk && player.pos.x > 10.4 && Math.abs(player.pos.z) < 1.4) { reviewWalk(); return; }
    const bob = moving ? Math.sin(player.bob) * 0.035 : 0;
    camera.position.set(player.pos.x, 1.62 + bob, player.pos.z);
    camera.lookAt(tmp.copy(camera.position).add(forward()));
    updateLook();
  } else if (mode === 'dolly' && dolly) {
    dolly.t = Math.min(1, dolly.t + dt / dolly.dur);
    const e = 1 - Math.pow(1 - dolly.t, 3);
    camera.position.lerpVectors(dolly.from, dolly.to, e);
    camera.lookAt(tmp.lerpVectors(dolly.lookFrom, dolly.lookTo, e));
    if (dolly.t >= 1) { mode = 'off'; if (selfAvatar && player.seat >= 0) selfAvatar.group.visible = true; const cb = onSit; onSit = null; dolly = null; cb?.(); }
  }
  if (mode === 'cctv' && camSel === 'floor') updateFollow();
  renderWith(mode === 'cctv' ? (camSel === 'self' ? selfCam : cctv) : camera);
}
