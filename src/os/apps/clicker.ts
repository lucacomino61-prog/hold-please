// Dumpling Clicker, with the depth of the original's Meteor Cookie: four tabs (Automation, Click Power, Boosts,
// Synergies), tiers on every unit, buy 1 / buy 10 / buy max, and a lifetime count. The dumplings are state.dumplings
// (saved with the run); the units live here for the run.
import { bus, state } from '../../game/state';
import { sfx } from '../../game/sound';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';

interface Unit { id: string; name: string; blurb: string; rate: number; cost: number; tab: 'automation' | 'power' | 'boosts' | 'synergies'; glyph: string; unlockAt: number; power?: number; boost?: number; synergy?: string }
const UNITS: Unit[] = [
  // automation: dumplings per second
  { id: 'steamer', name: 'Bamboo steamer', blurb: 'Steams on its own. Mostly.', rate: 1, cost: 50, tab: 'automation', glyph: '🎍', unlockAt: 0 },
  { id: 'grandma', name: 'A grandmother', blurb: 'Folds forty a minute, judges you the whole time.', rate: 6, cost: 400, tab: 'automation', glyph: '👵', unlockAt: 100 },
  { id: 'cart', name: 'Street cart', blurb: 'Sells them before they are cooked.', rate: 20, cost: 1800, tab: 'automation', glyph: '🛒', unlockAt: 800 },
  { id: 'factory', name: 'Dumpling factory', blurb: 'Three shifts, no windows.', rate: 60, cost: 6000, tab: 'automation', glyph: '🏭', unlockAt: 3000 },
  { id: 'fleet', name: 'Delivery fleet', blurb: 'Scooters. So many scooters.', rate: 240, cost: 25000, tab: 'automation', glyph: '🛵', unlockAt: 12000 },
  { id: 'moon', name: 'Dumplings on the Moon', blurb: 'Low gravity, high margins. You sold them the plot.', rate: 1000, cost: 120000, tab: 'automation', glyph: '🌙', unlockAt: 50000 },
  // click power: dumplings per click
  { id: 'chopsticks', name: 'Better chopsticks', blurb: '+1 per click.', rate: 0, cost: 120, tab: 'power', glyph: '🥢', unlockAt: 0, power: 1 },
  { id: 'rollingpin', name: 'Rolling pin', blurb: '+5 per click.', rate: 0, cost: 1500, tab: 'power', glyph: '🪵', unlockAt: 500, power: 5 },
  { id: 'twohands', name: 'Both hands', blurb: '+25 per click. The phone can wait.', rate: 0, cost: 12000, tab: 'power', glyph: '🙌', unlockAt: 5000, power: 25 },
  // boosts: multiply the per-second rate
  { id: 'soy', name: 'Soy sauce', blurb: 'Everything ×1.1.', rate: 0, cost: 900, tab: 'boosts', glyph: '🫙', unlockAt: 300, boost: 0.1 },
  { id: 'chilli', name: 'Chilli oil', blurb: 'Everything ×1.25.', rate: 0, cost: 8000, tab: 'boosts', glyph: '🌶️', unlockAt: 4000, boost: 0.25 },
  { id: 'vinegar', name: 'Black vinegar', blurb: 'Everything ×1.5. Krull hates the smell.', rate: 0, cost: 60000, tab: 'boosts', glyph: '🍶', unlockAt: 30000, boost: 0.5 },
  // synergies: one unit boosts another
  { id: 'grannysteam', name: 'Grandma trains the steamers', blurb: 'Each grandmother makes every steamer +1/s.', rate: 0, cost: 3000, tab: 'synergies', glyph: '🧧', unlockAt: 1500, synergy: 'grandma>steamer' },
  { id: 'cartfactory', name: 'Carts outside the factory', blurb: 'Each cart makes every factory +10/s.', rate: 0, cost: 30000, tab: 'synergies', glyph: '🏪', unlockAt: 15000, synergy: 'cart>factory' },
  { id: 'moonfleet', name: 'Moon deliveries', blurb: 'Each Moon kitchen makes every scooter +50/s.', rate: 0, cost: 300000, tab: 'synergies', glyph: '🚀', unlockAt: 150000, synergy: 'moon>fleet' },
];
const TABS: [Unit['tab'], string][] = [['automation', 'Automation'], ['power', 'Click Power'], ['boosts', 'Boosts'], ['synergies', 'Synergies']];
const owned: Record<string, number> = {};
let lifetime = 0;
let off: (() => void) | null = null;

export function clickerReset(): void { for (const k of Object.keys(owned)) delete owned[k]; lifetime = 0; }
const costOf = (u: Unit, n: number) => Math.round(u.cost * Math.pow(u.power !== undefined ? 1.8 : u.boost !== undefined || u.synergy ? 4 : 1.35, n));
const costForMany = (u: Unit, from: number, count: number) => { let c = 0; for (let i = 0; i < count; i++) c += costOf(u, from + i); return c; };
const maxBuy = (u: Unit, from: number, budget: number) => { let n = 0, c = 0; while (n < 100) { const next = costOf(u, from + n); if (c + next > budget) break; c += next; n++; } return n; };
const tierOf = (n: number) => n >= 100 ? 4 : n >= 50 ? 3 : n >= 25 ? 2 : n >= 10 ? 1 : 0;
const TIER_NAMES = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'];
export function perSecond(): number {
  let base = UNITS.filter((u) => u.rate).reduce((a, u) => a + (owned[u.id] ?? 0) * u.rate * (1 + 0.1 * tierOf(owned[u.id] ?? 0)), 0);
  for (const s of UNITS.filter((u) => u.synergy && (owned[u.id] ?? 0) > 0)) { const [from, to] = s.synergy!.split('>'); const bonus = { grandma: 1, cart: 10, moon: 50 }[from] ?? 0; base += (owned[from] ?? 0) * (owned[to] ?? 0) * bonus; }
  const mult = UNITS.filter((u) => u.boost).reduce((m, u) => m * Math.pow(1 + u.boost!, owned[u.id] ?? 0), 1);
  return base * mult;
}
export function perClick(): number { return 1 + UNITS.filter((u) => u.power).reduce((a, u) => a + (owned[u.id] ?? 0) * u.power!, 0); }
const fmtN = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(2) + ' Billion' : n >= 1e6 ? (n / 1e6).toFixed(2) + ' Million' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' Thousand' : Math.floor(n).toLocaleString('en-US');

registerApp({ id: 'clicker', name: 'Dumpling Clicker', color: '#e9c84a', glyph: 'clicker', kind: 'side', open: () => {
  openWindow({ id: 'clicker', title: 'Dumpling Clicker', glyph: icon('clicker'), color: '#e9c84a', w: 600, h: 560, onClose: () => { off?.(); off = null; } }, (body) => {
    body.innerHTML = `<div class="clicker clicker--deep"><div class="clicker__top"><button class="dumpling" type="button" aria-label="Make a dumpling">🥟</button><div class="clicker__stats"><div class="clicker__count tabular">0</div><div class="clicker__rate"></div><div class="clicker__bar"><i></i></div></div></div>
      <div class="clicker__tabs" role="tablist">${TABS.map(([id, name], i) => `<button class="clicker__tab" role="tab" data-tab="${id}" aria-selected="${i === 0}">${name}</button>`).join('')}</div>
      <div class="clicker__list" role="tabpanel"></div>
      <div class="clicker__life"><span>Lifetime dumpling mass</span><b class="tabular">0</b><small class="tabular">0</small></div></div>`;
    const count = body.querySelector<HTMLElement>('.clicker__count')!, rate = body.querySelector<HTMLElement>('.clicker__rate')!, list = body.querySelector<HTMLElement>('.clicker__list')!, bar = body.querySelector<HTMLElement>('.clicker__bar i')!;
    const lifeB = body.querySelector<HTMLElement>('.clicker__life b')!, lifeS = body.querySelector<HTMLElement>('.clicker__life small')!;
    let tab: Unit['tab'] = 'automation';
    const renderList = () => {
      list.innerHTML = UNITS.filter((u) => u.tab === tab).map((u) => {
        const n = owned[u.id] ?? 0;
        const locked = lifetime < u.unlockAt && n === 0;
        if (locked) return `<div class="unit unit--locked"><span class="unit__glyph">🔒</span><div class="unit__who"><span class="unit__kind">${TABS.find(([t]) => t === tab)![1].toUpperCase()} UNIT</span><b>LOCKED</b><span class="muted">Unlocks at ${fmtN(u.unlockAt)} lifetime dumplings</span></div></div>`;
        const c1 = costOf(u, n), c10 = costForMany(u, n, 10), mx = maxBuy(u, n, state.dumplings), cmx = costForMany(u, n, mx);
        return `<div class="unit"><span class="unit__glyph">${u.glyph}</span><div class="unit__who"><span class="unit__kind">${TABS.find(([t]) => t === tab)![1].toUpperCase()} UNIT</span><b>${u.name}</b><span class="muted">Owned ${n} · ${TIER_NAMES[tierOf(n)]} · ${u.blurb}</span></div>
          <div class="unit__buys"><button type="button" class="unit__buy" data-id="${u.id}" data-n="1" ${state.dumplings < c1 ? 'disabled' : ''}><span>BUY 1</span><b>${fmtN(c1)}</b></button><button type="button" class="unit__buy" data-id="${u.id}" data-n="10" ${state.dumplings < c10 ? 'disabled' : ''}><span>BUY 10</span><b>${fmtN(c10)}</b></button><button type="button" class="unit__buy" data-id="${u.id}" data-n="${mx}" ${mx < 1 ? 'disabled' : ''}><span>MAX ${mx}</span><b>${fmtN(cmx)}</b></button></div></div>`;
      }).join('');
      list.querySelectorAll<HTMLButtonElement>('.unit__buy').forEach((b) => b.addEventListener('click', () => {
        const u = UNITS.find((x) => x.id === b.dataset.id)!; const n = Number(b.dataset.n); const from = owned[u.id] ?? 0; const cost = costForMany(u, from, n);
        if (n < 1 || state.dumplings < cost) return;
        state.dumplings -= cost; owned[u.id] = from + n; sfx.cash(); renderList(); draw();
      }));
    };
    const draw = () => {
      count.textContent = fmtN(state.dumplings) + ' 🥟'; rate.textContent = `${fmtN(perSecond())} per second · ${perClick()} per click`;
      lifeB.textContent = fmtN(lifetime); lifeS.textContent = Math.floor(lifetime).toLocaleString('en-US');
      const next = UNITS.find((u) => u.unlockAt > lifetime); bar.style.transform = `scaleX(${next ? Math.min(1, lifetime / next.unlockAt) : 1})`;
    };
    body.querySelector('.dumpling')!.addEventListener('click', () => { const c = perClick(); state.dumplings += c; lifetime += c; sfx.type(); draw(); });
    body.querySelectorAll<HTMLButtonElement>('.clicker__tab').forEach((b) => b.addEventListener('click', () => { body.querySelectorAll('.clicker__tab').forEach((x) => x.setAttribute('aria-selected', 'false')); b.setAttribute('aria-selected', 'true'); tab = b.dataset.tab as Unit['tab']; renderList(); }));
    let acc = 0, accList = 0;
    off = bus.on<number>('frame', (dt) => { const add = perSecond() * (dt / 1000); state.dumplings += add; lifetime += add; acc += dt; accList += dt; if (acc > 250) { acc = 0; draw(); } if (accList > 2000) { accList = 0; renderList(); } });
    draw(); renderList();
  });
} });
