// The play counter: a run started anywhere adds one on the room server (no analytics, no cookies, nothing about
// who); the title screen shows the total. One count per browser per calendar day, so a restart is not a new play.
import { serverUrl } from './room';

const KEY = 'hp.played';

export async function bumpPlays(): Promise<void> {
  const base = serverUrl();
  if (!base) return;
  const today = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem(KEY) === today) return; } catch { /* ignore */ }
  try { await fetch(base + '/plays', { method: 'POST', cache: 'no-store' }); try { localStorage.setItem(KEY, today); } catch { /* ignore */ } } catch { /* offline */ }
}

export async function plays(): Promise<number | null> {
  const base = serverUrl();
  if (!base) return null;
  try { const r = await fetch(base + '/plays', { cache: 'no-store' }); const j = await r.json() as { plays?: number }; return typeof j.plays === 'number' ? j.plays : null; } catch { return null; }
}
