// Apps register here; the desktop and the taskbar read the list.
import type { ScamId } from '../game/state';

export interface AppDef {
  id: string;
  name: string;
  color: string;
  glyph: string; // icon name
  kind: 'core' | 'scam' | 'side';
  scam?: ScamId;
  pinned?: boolean;
  open(): void;
}

export const APPS = new Map<string, AppDef>();
const order: string[] = [];

export function registerApp(def: AppDef): void {
  if (!APPS.has(def.id)) order.push(def.id);
  APPS.set(def.id, def);
}

export function appList(): AppDef[] { return order.map((id) => APPS.get(id)!); }

export function openApp(id: string): void { APPS.get(id)?.open(); }
