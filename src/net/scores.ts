// The challenge boards on the room server: a score per browser per key (the best one stays), the top fifty back.
import { settings } from '../game/state';
import { serverUrl } from './room';

export interface Score { name: string; team: number; personal: number; pass: boolean; at: number; id?: string }

const ID_KEY = 'hp.scorer';
function scorerId(): string {
  try { let id = localStorage.getItem(ID_KEY); if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(ID_KEY, id); } return id; } catch { return 'anon'; }
}

export async function postScore(key: string, s: { team: number; personal: number; pass: boolean }): Promise<boolean> {
  const base = serverUrl();
  if (!base) return false;
  try {
    const r = await fetch(`${base}/scores/${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, name: (settings.playerName || 'Agent').slice(0, 24), id: scorerId() }), cache: 'no-store' });
    return r.ok;
  } catch { return false; }
}

export async function fetchScores(key: string): Promise<Score[] | null> {
  const base = serverUrl();
  if (!base) return null;
  try { const r = await fetch(`${base}/scores/${encodeURIComponent(key)}`, { cache: 'no-store' }); const j = await r.json() as { scores?: Score[] }; return j.scores ?? []; } catch { return null; }
}
export const myScorerId = scorerId;
