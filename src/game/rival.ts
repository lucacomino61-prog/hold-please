// Dusk Customer Care, across the street: three rival agents whose totals tick on their own board, a window on the
// east wall that shows their building, a poaching event that steals a ringing caller unless you are quick, and
// the market's air strike that actually lands on them (the window burns for the day).
import { bus, chance, fmt, state } from './state';
import { setRingTimeout } from './calls';
import { toast } from '../ui/toast';
import { sfx } from './sound';

export const RIVAL_NAME = 'Dusk Customer Care';
export interface RivalAgent { name: string; earned: number }
export const rival: { agents: RivalAgent[]; today: number } = { agents: [{ name: 'Marlow', earned: 0 }, { name: 'Pike', earned: 0 }, { name: 'Sable', earned: 0 }], today: 0 };

export function rivalTotal(): number { return rival.agents.reduce((a, r) => a + r.earned, 0); }
export function resetRival(): void { for (const a of rival.agents) a.earned = 0; rival.today = 0; state.rivalBurning = false; bus.emit('rival'); }

// they earn about as fast as your colleagues, a little less while their building burns
let tickOff: (() => void) | null = null;
export function startRival(): void {
  tickOff?.();
  tickOff = bus.on('tick', () => {
    if (state.phase !== 'shift') return;
    for (const a of rival.agents) {
      if (!chance(state.rivalBurning ? 1 / 400 : 1 / 80)) continue;
      const earn = Math.max(5, Math.round(state.quota * (0.01 + Math.random() * 0.02) / 5) * 5);
      a.earned += earn; rival.today += earn;
    }
    bus.emit('rival');
  });
}
export function stopRival(): void { tickOff?.(); tickOff = null; }

/** the market's "Air strike the rival office": their totals go to nothing and the window across the street burns */
export function strikeRival(): void {
  for (const a of rival.agents) a.earned = Math.round(a.earned * 0.1);
  state.rivalBurning = true;
  bus.emit('rival');
}

/** a poach: the next ring is short, and a missed one goes to Dusk (events.ts) */
export function poach(): void {
  setRingTimeout(5500);
  toast(`${RIVAL_NAME} is on the line too. Answer the next call within five seconds or they take the customer.`, 'danger', 5000);
  sfx.alert();
  const off = bus.on<{ name: string; budget: number }>('call:missed', (c) => {
    off(); setRingTimeout(16_000);
    const stolen = Math.max(60, Math.round((c.budget ?? 200) * 0.6 / 10) * 10);
    const a = rival.agents[Math.floor(Math.random() * rival.agents.length)];
    a.earned += stolen; rival.today += stolen; bus.emit('rival');
    toast(`Too slow. ${a.name} at Dusk took ${c.name} for ${fmt(stolen)}. Their board is laughing.`, 'danger', 5500);
    bus.emit('event:outcome', { kind: 'poach', ok: false });
  });
  const ok = bus.on('call:answered', () => { ok(); off(); setRingTimeout(16_000); toast('Got them first. Dusk hears a dial tone.', 'money', 3500); bus.emit('event:outcome', { kind: 'poach', ok: true }); });
}
