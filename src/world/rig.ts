// The people's body: Kenney's "Animated Characters" rig (CC0, public/models/people), subdivided and smoothed in
// Blender and re-exported with the idle/run/jump clips. One body for everyone; the skins are repainted per
// person straight onto Kenney's atlas layout: orange skin, the hair recoloured (or shaved off, or shaved on top),
// an outfit painted over the torso, my own cartoon faces with a blink frame, brows or a unibrow, lashes and
// lipstick for the women, moustaches, goatees and beards for the men.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const RIG_SCALE = 0.52; // the body is 3.76 units tall; we want about 1.95 m
// the base skins give the painted hair (and freckles, a streak): three per body
// (the other two female skins have dark-red skin and a robot half-face, so the women share the two short-haired bases)
export const BASES = { man: ['criminalMaleA', 'skaterMaleA', 'survivorMaleB'], woman: ['skaterFemaleA', 'skaterMaleA', 'survivorMaleB'] } as const;
export const HAIR_NAMES = { man: ['Short', 'Big', 'Combed'], woman: ['Bob', 'Curly', 'Combed'] } as const;
export type Body = keyof typeof BASES;
export type Outfit = 'polo' | 'tee' | 'vneck' | 'open' | 'track' | 'hoodie' | 'suit';
export type Scalp = 'full' | 'bald' | 'half';
export const OUTFITS: Outfit[] = ['polo', 'tee', 'vneck', 'open', 'track', 'hoodie', 'suit'];
export const OUTFIT_NAMES: Record<Outfit, string> = { polo: 'Polo', tee: 'T-shirt', vneck: 'V-neck', open: 'Open shirt', track: 'Tracksuit', hoodie: 'Hoodie', suit: 'Suit & tie' };
export const SCALPS: Scalp[] = ['full', 'bald', 'half'];
export const SCALP_NAMES: Record<Scalp, string> = { full: 'Hair', bald: 'Bald', half: 'Half bald' };

export interface RigAssets { body: THREE.Group; clips: THREE.AnimationClip[] }
let assetsP: Promise<RigAssets> | null = null;
// body.glb holds the mesh, the armature and the clips, exported together from Blender so every track is in the
// same bone space. Root and scale tracks are dropped anyway: the FBX's 100× root scale once made everyone 190 m tall.
export function rigAssets(): Promise<RigAssets> {
  if (!assetsP) {
    assetsP = new GLTFLoader().loadAsync('/models/people/body.glb').then((g) => {
      const clips = g.animations.filter((c) => /^(idle|run|jump)$/.test(c.name));
      for (const c of clips) { c.tracks = c.tracks.filter((t) => !/^Root\./.test(t.name) && !t.name.endsWith('.scale')); c.resetDuration(); }
      return { body: g.scene, clips };
    });
  }
  return assetsP;
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function skinImage(name: string): Promise<HTMLImageElement> {
  let p = imgCache.get(name);
  if (!p) {
    p = new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('skin ' + name)); img.src = `/models/people/skins/${name}.png`; });
    imgCache.set(name, p);
  }
  return p;
}

export interface SkinSpec {
  body: Body;
  skin: string;
  shirt: string;      // the outfit's main colour (the tie, for a suit)
  trousers: string;
  hair: string;
  scalp: Scalp;
  outfit: Outfit;
  beard: 0 | 1 | 2 | 3;
  unibrow: boolean;
  seed: number;
  boss?: boolean;     // Mr. Krull: the scowl, the bags, the heavy brows, grey temples
}

// Kenney's atlas (1024²): head top-left (face around 325,230; ears at 190 and 460), the torso below it (back on
// top, front below, neck seam at y≈740, sleeves in the side columns), shoes and arms on the right, trousers
// bottom-right. The regions are the same on every 1024 skin of the packs.
const FACE = { cx: 325, eyeY: 216, dx: 27, browY: 197, mouthY: 252, mustY: 262, chinY: 292 };
function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
const baseCache = new Map<string, HTMLCanvasElement>();
function shade(c: string, k: number): string { return '#' + new THREE.Color(c).multiplyScalar(k).getHexString(); }
function mix(a: string, b: string, t: number): string { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }

// the recoloured atlas without the face and outfit details (cached per colour set)
function recolour(img: HTMLImageElement, s: SkinSpec): HTMLCanvasElement {
  const key = [img.src, s.skin, s.shirt, s.trousers, s.hair, s.scalp, s.outfit].join('|');
  const hit = baseCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 1024, 1024);
  const id = g.getImageData(0, 0, 1024, 1024), d = id.data;
  const sk = new THREE.Color(s.skin), tr = new THREE.Color(s.trousers), hr = new THREE.Color(s.hair);
  const jacket = s.outfit === 'suit';
  const top = new THREE.Color(jacket ? '#262a3a' : s.shirt);
  const shoe = 0.16;
  const isSkinPx = (h: number, sat: number, l: number) => h >= 5 && h <= 34 && sat > 0.3 && l > 0.42 && l < 0.86;
  const isHairPx = (h: number, sat: number, l: number) => l < 0.5 || (h >= 140 && h <= 200 && sat > 0.3); // dark, brown, or the skater's teal streak
  // the base skins' hair goes from near-black to brown: the chosen colour lands on the median shade
  const lums: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % 1024, py = Math.floor(i / 4 / 1024);
    if (px >= 640 || py >= 490) continue;
    const [h, sat, l] = hsl(d[i], d[i + 1], d[i + 2]);
    const inFace = ((px - 325) / 86) ** 2 + ((py - 236) / 66) ** 2 < 1;
    if (!inFace && !isSkinPx(h, sat, l) && isHairPx(h, sat, l)) lums.push(l);
  }
  lums.sort((a, b) => a - b);
  const lRef = Math.max(0.05, lums[Math.floor(lums.length / 2)] ?? 0.15);
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % 1024, py = Math.floor(i / 4 / 1024);
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const [h, sat, l] = hsl(r, gg, b);
    const isSkin = isSkinPx(h, sat, l);
    if (px < 640 && py < 490) { // the head: skin, hair, or the face (repainted later)
      const inFace = ((px - 325) / 86) ** 2 + ((py - 236) / 66) ** 2 < 1;
      if (isSkin || inFace) { const k = l / 0.68; d[i] = Math.min(255, sk.r * 255 * k); d[i + 1] = Math.min(255, sk.g * 255 * k); d[i + 2] = Math.min(255, sk.b * 255 * k); continue; }
      if (isHairPx(h, sat, l)) {
        const crown = ((px - 325) / 215) ** 2 + ((py - 40) / 125) ** 2 < 1;
        const shaved = s.scalp === 'bald' || (s.scalp === 'half' && crown);
        if (shaved) { const k = 0.9 + l * 0.2; d[i] = Math.min(255, sk.r * 255 * k); d[i + 1] = Math.min(255, sk.g * 255 * k); d[i + 2] = Math.min(255, sk.b * 255 * k); }
        else { const k = Math.max(0.55, Math.min(1.5, l / lRef)); d[i] = Math.min(255, hr.r * 255 * k); d[i + 1] = Math.min(255, hr.g * 255 * k); d[i + 2] = Math.min(255, hr.b * 255 * k); }
      }
      continue;
    }
    if (isSkin) { const k = l / 0.68; d[i] = Math.min(255, sk.r * 255 * k); d[i + 1] = Math.min(255, sk.g * 255 * k); d[i + 2] = Math.min(255, sk.b * 255 * k); continue; }
    if (px < 640 && py >= 490) { d[i] = top.r * 255; d[i + 1] = top.g * 255; d[i + 2] = top.b * 255; continue; }  // the torso: flat, the outfit is painted on top
    if (px >= 610 && py >= 760) { d[i] = r * tr.r; d[i + 1] = gg * tr.g; d[i + 2] = b * tr.b; continue; }           // trousers
    if (px >= 640 && px < 825 && py >= 130 && py < 520) { d[i] = r * shoe; d[i + 1] = gg * shoe; d[i + 2] = b * shoe; } // shoes
  }
  g.putImageData(id, 0, 0);
  baseCache.set(key, c);
  return c;
}

function outfitDetails(g: CanvasRenderingContext2D, s: SkinSpec): void {
  const cx = 320, neck = 742;
  const light = mix(s.shirt, '#ffffff', 0.35), dark = shade(s.shirt, 0.72);
  if (s.outfit === 'polo') {
    g.fillStyle = light; g.beginPath(); g.moveTo(cx - 52, neck); g.lineTo(cx, neck); g.lineTo(cx - 18, neck + 46); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + 52, neck); g.lineTo(cx, neck); g.lineTo(cx + 18, neck + 46); g.closePath(); g.fill();
    g.fillStyle = dark; g.fillRect(cx - 2, neck, 4, 80);
    g.fillStyle = '#1a1a1a'; for (const y of [neck + 30, neck + 58]) { g.beginPath(); g.arc(cx, y, 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = dark; g.lineWidth = 2; g.strokeRect(cx + 34, neck + 70, 34, 38); g.fillStyle = '#1a3a8a'; g.fillRect(cx + 56, neck + 60, 5, 26); g.fillStyle = '#c9c9ce'; g.fillRect(cx + 56, neck + 58, 5, 5);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.5; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(cx - 100, neck + 4); g.lineTo(cx - 60, neck + 2); g.moveTo(cx + 60, neck + 2); g.lineTo(cx + 100, neck + 4); g.stroke(); g.setLineDash([]);
  }
  if (s.outfit === 'vneck') {
    g.fillStyle = s.skin; g.beginPath(); g.moveTo(cx - 52, neck); g.lineTo(cx + 52, neck); g.lineTo(cx, neck + 118); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, neck + 70); g.lineTo(cx, neck + 112); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.07)'; g.beginPath(); g.ellipse(cx - 16, neck + 84, 15, 22, 0.3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx + 16, neck + 84, 15, 22, -0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = dark; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 52, neck); g.lineTo(cx, neck + 118); g.lineTo(cx + 52, neck); g.stroke();
  }
  if (s.outfit === 'open') {
    g.fillStyle = s.skin; g.beginPath(); g.moveTo(cx - 40, neck); g.lineTo(cx + 40, neck); g.lineTo(cx, neck + 70); g.closePath(); g.fill();
    g.fillStyle = light; g.beginPath(); g.moveTo(cx - 60, neck); g.lineTo(cx - 20, neck + 4); g.lineTo(cx - 36, neck + 60); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + 60, neck); g.lineTo(cx + 20, neck + 4); g.lineTo(cx + 36, neck + 60); g.closePath(); g.fill();
    g.fillStyle = dark; g.fillRect(cx - 2, neck + 70, 4, 170);
  }
  if (s.outfit === 'track') {
    g.fillStyle = '#f4f1ea';
    for (const x of [cx - 110, cx + 96]) { g.fillRect(x, neck + 2, 14, 280); g.fillRect(x, 492, 14, 246); }
    g.fillStyle = '#1f1f24'; g.fillRect(cx - 2, neck, 4, 280);
    g.fillStyle = '#c9c9ce'; g.fillRect(cx - 7, neck + 2, 14, 10);
  }
  if (s.outfit === 'hoodie') {
    g.strokeStyle = dark; g.lineWidth = 28; g.beginPath(); g.ellipse(cx, neck, 96, 42, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = '#f4f1ea'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 16, neck + 36); g.lineTo(cx - 20, neck + 96); g.moveTo(cx + 16, neck + 36); g.lineTo(cx + 20, neck + 96); g.stroke();
    g.fillStyle = dark; g.beginPath(); g.roundRect(cx - 88, neck + 190, 176, 68, 10); g.fill();
  }
  if (s.outfit === 'suit') {
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(cx - 58, neck); g.lineTo(cx + 58, neck); g.lineTo(cx, neck + 165); g.closePath(); g.fill();
    g.fillStyle = '#34394d';
    g.beginPath(); g.moveTo(cx - 58, neck); g.lineTo(cx - 24, neck + 6); g.lineTo(cx - 6, neck + 170); g.lineTo(cx - 40, neck + 170); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + 58, neck); g.lineTo(cx + 24, neck + 6); g.lineTo(cx + 6, neck + 170); g.lineTo(cx + 40, neck + 170); g.closePath(); g.fill();
    g.fillStyle = s.shirt; g.beginPath(); g.roundRect(cx - 11, neck + 4, 22, 16, 4); g.fill(); g.beginPath(); g.moveTo(cx - 8, neck + 18); g.lineTo(cx + 8, neck + 18); g.lineTo(cx + 10, neck + 150); g.lineTo(cx, neck + 164); g.lineTo(cx - 10, neck + 150); g.closePath(); g.fill();
    g.fillStyle = '#1a1a1a'; for (const y of [neck + 200, neck + 230]) { g.beginPath(); g.arc(cx + 2, y, 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = s.boss ? '#c9a227' : '#f4f1ea'; g.beginPath(); g.moveTo(cx - 70, neck + 120); g.lineTo(cx - 44, neck + 112); g.lineTo(cx - 46, neck + 130); g.closePath(); g.fill(); // the pocket square
    g.fillStyle = '#e0b43a'; g.beginPath(); g.arc(cx + 1, neck + 90, 3.5, 0, Math.PI * 2); g.fill(); // the tie pin
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 24, neck + 6); g.lineTo(cx - 6, neck + 170); g.moveTo(cx + 24, neck + 6); g.lineTo(cx + 6, neck + 170); g.stroke(); // lapel edges
  }
  if (s.outfit === 'tee') {
    g.strokeStyle = dark; g.lineWidth = 5; g.beginPath(); g.ellipse(cx, neck, 58, 18, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.ellipse(cx, neck + 2, 58, 18, 0, 0, Math.PI); g.stroke(); g.setLineDash([]);
    g.fillStyle = light; g.beginPath(); g.roundRect(cx - 34, neck + 90, 68, 50, 8); g.fill();
    g.fillStyle = dark; g.font = 'bold 30px Impact, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOLD', cx, neck + 115);
  }
}

export function paintSkin(img: HTMLImageElement, s: SkinSpec, closed: boolean): THREE.CanvasTexture {
  const base = recolour(img, s);
  const c = document.createElement('canvas'); c.width = c.height = 2048;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(base, 0, 0, 2048, 2048);
  g.scale(2, 2);
  const r = (n: number) => ((s.seed * 9301 + 49297 * n) % 233280) / 233280;
  const { cx, eyeY, dx, browY, mouthY, mustY, chinY } = FACE;
  const ink = '#161616';
  const woman = s.body === 'woman';
  outfitDetails(g, s);
  // a clean face: cover Kenney's features with skin, keep the hairline and ears; then shade it so it reads as a face
  g.fillStyle = s.skin; g.beginPath(); g.ellipse(cx, 236, 84, 64, 0, 0, Math.PI * 2); g.fill();
  const boss = !!s.boss;
  const irisCol = ['#4a2f1a', '#2e5a8a', '#3a6a3a', '#5a3a1a', '#6a5a8a', '#2b2b2b'][Math.floor(r(11) * 6)];
  // skin shading: a cooler shadow under the brow and along the jaw, a warm highlight on the forehead and cheekbones
  g.save(); g.beginPath(); g.ellipse(cx, 236, 84, 64, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = 'rgba(60,20,0,.14)'; g.beginPath(); g.ellipse(cx, chinY + 10, 70, 26, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(60,20,0,.10)'; g.beginPath(); g.ellipse(cx, browY - 4, 60, 10, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,240,200,.16)'; g.beginPath(); g.ellipse(cx, browY - 26, 40, 14, 0, 0, Math.PI * 2); g.fill();
  for (const sx of [-1, 1]) { g.fillStyle = 'rgba(255,235,200,.12)'; g.beginPath(); g.ellipse(cx + sx * 46, eyeY + 24, 16, 10, sx * 0.3, 0, Math.PI * 2); g.fill(); }
  if (!boss && !woman && r(12) < 0.35) { g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(cx, chinY + 8, 40, 14, 0, 0, Math.PI * 2); g.fill(); } // five o'clock shadow
  if (boss) { for (const sx of [-1, 1]) { g.fillStyle = 'rgba(40,10,30,.22)'; g.beginPath(); g.ellipse(cx + sx * dx, eyeY + 13, 13, 5, 0, 0, Math.PI * 2); g.fill(); } } // the bags under his eyes
  g.restore();
  if (!woman && s.beard === 3) { g.fillStyle = s.hair; g.beginPath(); g.moveTo(cx - 70, eyeY + 12); g.quadraticCurveTo(cx - 76, chinY + 22, cx, chinY + 26); g.quadraticCurveTo(cx + 76, chinY + 22, cx + 70, eyeY + 12); g.quadraticCurveTo(cx + 40, eyeY + 46, cx, eyeY + 50); g.quadraticCurveTo(cx - 40, eyeY + 46, cx - 70, eyeY + 12); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(cx - 40 + i * 10, chinY - 6 + (i % 2) * 6); g.lineTo(cx - 44 + i * 10, chinY + 16); g.stroke(); } }
  if (!woman && s.beard === 2) { g.fillStyle = s.hair; g.beginPath(); g.ellipse(cx, chinY + 2, 17, 15, 0, 0, Math.PI * 2); g.fill(); }
  // sideburns for the men with any beard, grey ones for the boss
  if (!woman && (s.beard > 0 || boss)) { g.fillStyle = boss ? '#9a9a9a' : s.hair; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * 78, eyeY - 16); g.lineTo(cx + sx * 66, eyeY + 14); g.lineTo(cx + sx * 76, eyeY + 18); g.lineTo(cx + sx * 84, eyeY - 10); g.closePath(); g.fill(); } }
  for (const sx of [-1, 1]) {
    const ex = cx + sx * dx;
    if (closed) { g.strokeStyle = ink; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - 10, eyeY + 1); g.quadraticCurveTo(ex, eyeY + 7, ex + 10, eyeY + 1); g.stroke(); if (woman) { g.lineWidth = 2; g.beginPath(); g.moveTo(ex + sx * 9, eyeY + 2); g.lineTo(ex + sx * 13, eyeY + 6); g.stroke(); } }
    else {
      // the eye: white, iris ring, pupil, two catchlights, the upper lid line and a lower lid
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, eyeY, 11, boss ? 8 : 9.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = irisCol; g.beginPath(); g.arc(ex - sx * 1, eyeY + 1, 5.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = ink; g.beginPath(); g.arc(ex - sx * 1, eyeY + 1, 3.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(ex - sx * 0.3, eyeY - 1.5, 1.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(ex + sx * 2.4, eyeY + 2.6, 0.8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ink; g.lineWidth = boss ? 3.2 : 2.4; g.lineCap = 'round'; g.beginPath(); g.ellipse(ex, eyeY, 11, boss ? 8 : 9.5, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(ex, eyeY, 11, boss ? 8 : 9.5, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
      if (boss) { g.fillStyle = s.skin; g.beginPath(); g.moveTo(ex - 12, eyeY - 10); g.lineTo(ex + 12, eyeY - 10); g.lineTo(ex + sx * 12, eyeY - 2); g.closePath(); g.fill(); } // a heavy lid
      if (woman) {
        g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.ellipse(ex, eyeY, 11, 9.5, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        g.lineWidth = 2; g.beginPath(); g.moveTo(ex + sx * 9, eyeY - 7); g.lineTo(ex + sx * 14, eyeY - 12); g.moveTo(ex + sx * 5, eyeY - 9); g.lineTo(ex + sx * 8, eyeY - 15); g.moveTo(ex + sx * 11, eyeY - 3); g.lineTo(ex + sx * 16, eyeY - 6); g.stroke();
        g.fillStyle = 'rgba(120,60,140,.18)'; g.beginPath(); g.ellipse(ex, eyeY - 7, 12, 4, 0, 0, Math.PI * 2); g.fill(); // eyeshadow
      }
    }
    if (!s.unibrow) {
      // the brow: an arch for the women, a heavier bar for the men, a scowl for the boss
      const tilt = boss ? 9 : woman ? -2 - r(3) * 4 : 3 + r(3) * 7;
      g.strokeStyle = boss ? '#2a2a2a' : s.hair; g.lineWidth = boss ? 9 : woman ? 4 : 6.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - sx * 17, browY + (boss ? -4 : 0)); g.quadraticCurveTo(ex, browY - (woman ? 6 : 2), ex + sx * 15, browY + tilt); g.stroke();
    }
  }
  if (s.unibrow) { g.strokeStyle = s.hair; g.lineWidth = 7.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - dx - 17, browY - 2); g.quadraticCurveTo(cx, browY + 8, cx + dx + 17, browY - 2); g.stroke(); }
  // the nose: a bridge line, the tip, two nostrils, a shadow on one side
  const noseW = 7 + r(13) * 4;
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 2, eyeY + 6); g.quadraticCurveTo(cx - 4, eyeY + 18, cx - noseW, eyeY + 24); g.quadraticCurveTo(cx - 3, eyeY + 30, cx + noseW - 2, eyeY + 25); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.30)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * (noseW - 2), eyeY + 25, 2.6, 1.7, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.07)'; g.beginPath(); g.ellipse(cx - 5, eyeY + 17, 4, 9, 0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(cx + 1, eyeY + 20, 3, 3, 0, 0, Math.PI * 2); g.fill();
  // cheeks: a touch of colour (more for the women)
  for (const sx of [-1, 1]) { g.fillStyle = woman ? 'rgba(255,90,110,.18)' : 'rgba(255,90,60,.08)'; g.beginPath(); g.ellipse(cx + sx * 44, mouthY - 12, 14, 8, 0, 0, Math.PI * 2); g.fill(); }
  // mouth: grin with teeth, open shout, or smirk; red lips for the women; a flat frown for the boss
  const m = boss ? 3 : Math.floor(r(4) * 3);
  const lip = woman ? '#c8323a' : '#2a1414';
  if (m === 0) {
    g.fillStyle = lip; g.beginPath(); g.moveTo(cx - 34, mouthY - 2); g.quadraticCurveTo(cx, mouthY + 22, cx + 34, mouthY - 2); g.quadraticCurveTo(cx, mouthY + 5, cx - 34, mouthY - 2); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx - 27, mouthY); g.quadraticCurveTo(cx, mouthY + 10, cx + 27, mouthY); g.quadraticCurveTo(cx, mouthY + 4, cx - 27, mouthY); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (const x of [-14, -5, 5, 14]) { g.beginPath(); g.moveTo(cx + x, mouthY + 1); g.lineTo(cx + x, mouthY + 5); g.stroke(); }
    g.strokeStyle = woman ? lip : ink; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 34, mouthY - 2); g.quadraticCurveTo(cx, mouthY + 22, cx + 34, mouthY - 2); g.stroke();
  } else if (m === 1) {
    g.fillStyle = lip; g.beginPath(); g.ellipse(cx, mouthY + 6, 17, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1414'; g.beginPath(); g.ellipse(cx, mouthY + 6, 12, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c23b4a'; g.beginPath(); g.ellipse(cx, mouthY + 12, 7, 4, 0, 0, Math.PI * 2); g.fill(); // the tongue
    g.fillStyle = '#fff'; g.fillRect(cx - 10, mouthY - 2, 20, 4);
  } else if (m === 2) {
    g.strokeStyle = woman ? lip : ink; g.lineWidth = woman ? 5 : 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 24, mouthY + 3); g.quadraticCurveTo(cx + 6, mouthY + 16, cx + 30, mouthY - 4); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx + 6, mouthY + 8); g.lineTo(cx + 26, mouthY); g.lineTo(cx + 23, mouthY + 6); g.closePath(); g.fill();
    if (woman) { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(cx - 4, mouthY + 6, 8, 2, 0.15, 0, Math.PI * 2); g.fill(); } // lip gloss
  } else {
    g.strokeStyle = ink; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 26, mouthY + 10); g.quadraticCurveTo(cx, mouthY - 2, cx + 26, mouthY + 10); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * 30, mouthY + 6); g.lineTo(cx + sx * 36, mouthY + 20); g.stroke(); } // the lines of a man who frowns for a living
  }
  if (!woman && (boss || s.beard === 1 || s.beard === 2 || (s.beard === 3 && r(8) > 0.3))) {
    g.fillStyle = boss ? '#2a2a2a' : s.hair;
    const w = boss ? 1.25 : 1;
    g.beginPath(); g.moveTo(cx, mustY - 10); g.quadraticCurveTo(cx - 24 * w, mustY - 26, cx - 46 * w, mustY - 6); g.quadraticCurveTo(cx - 30 * w, mustY + 2, cx - 15, mustY - 5); g.quadraticCurveTo(cx - 5, mustY - 1, cx, mustY - 1);
    g.quadraticCurveTo(cx + 5, mustY - 1, cx + 15, mustY - 5); g.quadraticCurveTo(cx + 30 * w, mustY + 2, cx + 46 * w, mustY - 6); g.quadraticCurveTo(cx + 24 * w, mustY - 26, cx, mustY - 10); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 10, mustY - 12); g.lineTo(cx + i * 13, mustY - 4); g.stroke(); }
  }
  // the hair gets a highlight across the crown and a few strands; grey temples for the boss
  if (s.scalp !== 'bald') {
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,230,180,.10)'; g.beginPath(); g.ellipse(cx - 40, 60, 90, 22, -0.25, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(cx - 120 + i * 40, 30 + (i % 3) * 8); g.quadraticCurveTo(cx - 100 + i * 40, 70, cx - 110 + i * 40, 120); g.stroke(); }
  }
  if (boss) { g.fillStyle = 'rgba(200,200,200,.55)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * 110, 150, 18, 40, sx * 0.2, 0, Math.PI * 2); g.fill(); } }
  if (woman && r(9) < 0.4) { g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(cx + 22, mouthY - 8, 2.2, 0, Math.PI * 2); g.fill(); } // a beauty mark
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // glTF UVs
  t.anisotropy = 4;
  return t;
}
