// The player's look: picked at the clock-in desk, kept in this browser. Used on the floor (co-op), the
// webcam and the sheets. Everyone on this floor is some shade of orange; the chain is the uniform.
import type { Body, Outfit, Scalp } from '../world/rig';
export { OUTFITS, OUTFIT_NAMES, SCALPS, SCALP_NAMES, HAIR_NAMES } from '../world/rig';

export interface Avatar {
  body: Body;
  shirt: string;
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2;
  scalp: Scalp;
  outfit: Outfit;
  unibrow: boolean;
  glasses: boolean;
  shades: boolean;
  beard: 0 | 1 | 2 | 3;
  chain: boolean;
}

export const SHIRTS = ['#2bb3a3', '#3fa34d', '#e9c84a', '#d94b4b', '#f08a24', '#4a78d9', '#8e5ad6', '#e3e3e3', '#1b2432'];
export const SKINS = ['#f0883a', '#e06a2a', '#f29a4a', '#d9582a', '#ff9a3c', '#c94e26'];
export const HAIRS = ['#1a1a1a', '#2b1b10', '#4a2f1a', '#8a5a2a', '#c7a26b', '#b5462e', '#7a7a7a', '#e6e6e6'];
export const BEARDS = ['Clean', 'Moustache', 'Goatee', 'Beard'];

const DEFAULT: Avatar = { body: 'man', shirt: '#2bb3a3', skin: '#f0883a', hair: '#1a1a1a', hairStyle: 0, scalp: 'full', outfit: 'polo', unibrow: false, glasses: false, shades: false, beard: 1, chain: true };

export function getAvatar(): Avatar {
  try {
    const raw = localStorage.getItem('hp.avatar');
    if (raw) { const a = { ...DEFAULT, ...JSON.parse(raw) } as Avatar; a.hairStyle = ((a.hairStyle ?? 0) % 3) as 0 | 1 | 2; return a; }
  } catch { /* ignore */ }
  return { ...DEFAULT };
}

export function setAvatar(a: Avatar): void {
  try { localStorage.setItem('hp.avatar', JSON.stringify(a)); } catch { /* ignore */ }
}
