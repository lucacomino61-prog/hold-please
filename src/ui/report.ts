// The termination sheet and the promotion sheet. In co-op the rows are everyone in the room and the host moves the
// floor on (tomorrow, or day one again); the others wait for that, or leave the room and play on alone.
import { t } from '../i18n';
import { fmt, quotaFor, settings, state } from '../game/state';
import { SCAMS } from '../game/scams';
import { icon } from '../os/icons';
import { coop, type RankRow } from '../net/coop';
import { badgeChips } from '../game/hall';
import { currentRank, type Rank } from '../game/ranks';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

let pending: { el: HTMLElement; resolve: () => void } | null = null;

/** the room moved on: whichever sheet is up lets go */
export function dismissSheet(): void {
  if (!pending) return;
  const p = pending;
  pending = null;
  p.el.remove();
  p.resolve();
}

/** everyone on the floor, best first: the room's players in co-op, you and the three colleagues solo */
function rows(): RankRow[] {
  if (coop.on && coop.ranking().length) return coop.ranking();
  const me: RankRow = { id: 'me', name: settings.playerName || 'You', earned: state.personal, today: state.earnedToday, me: true, here: true };
  return [me, ...state.colleagues.map((c) => ({ id: c.id ?? c.name, name: c.name, earned: c.earned, today: 0, me: false, here: true }))].sort((a, b) => b.earned - a.earned);
}

// the original's report rows: #1 / the name / "TOP EARNER · +$200 AHEAD" or "$600 BEHIND THE LEADER" / the bar,
// then TOTAL EARNED · TIME / DAYS · AVG / DAY
function played(): string {
  const ms = Math.max(0, (state.day - 1) * state.shiftTotal + (state.shiftTotal - state.shiftLeft));
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function table(list: RankRow[], days: number, key: 'earned' | 'today'): string {
  const top = Math.max(1, ...list.map((r) => r[key]));
  const lead = list[0]?.[key] ?? 0, second = list[1]?.[key] ?? 0;
  const total = key === 'earned';
  return `<div class="rank-head"><span>${t('Rank')}</span><span>${total ? t('Former employee') : t('Employee')}</span></div><div class="rank-cards">
    ${list.map((r, i) => `<div class="rank-card${i === 0 ? ' rank-card--top' : ''}${r.me ? ' rank-card--me' : ''}">
      <div class="rank-card__rank">#${i + 1}</div>
      <div class="rank-card__who"><span class="rank-card__name">${esc(r.name)}${r.here ? '' : '<span class="away">away</span>'}</span>
        <span class="rank-card__gap">${i === 0 ? `${t('Top earner')}${list.length > 1 ? ` · ${t('+{x} ahead', { x: fmt(lead - second) })}` : ''}` : t('{x} behind the leader', { x: fmt(lead - r[key]) })}</span>
        <div class="bar"><i style="width:${Math.round((r[key] / top) * 100)}%"></i></div></div>
      <div class="rank-card__nums tabular"><div><span>${total ? t('Total earned') : t('Today')}</span><b class="is-money">${fmt(r[key])}</b></div>${total ? `<div><span>${t('Time / days')}</span><b>${played()} / ${days}D</b></div><div><span>${t('Avg / day')}</span><b>${fmt(r[key] / days)}</b></div>` : ''}</div>
    </div>`).join('')}
    </div>`;
}

/** the co-op buttons: the host moves on, the others wait; anyone can leave the room and play on alone */
function coopActions(el: HTMLElement, resolve: () => void, busyLabel: string): void {
  if (coop.movedOn()) { el.remove(); resolve(); return; }
  pending = { el, resolve };
  el.querySelector('[data-leave]')!.addEventListener('click', () => { pending = null; coop.leave(); el.remove(); resolve(); });
  el.querySelector<HTMLButtonElement>('[data-go]')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (coop.next()) { b.disabled = true; b.textContent = busyLabel; } else { pending = null; el.remove(); resolve(); }
  });
}

function coopButtons(label: string): string {
  return `<button class="btn" type="button" data-leave>Leave the room</button>${coop.isHost() ? `<button class="btn btn--amber" type="button" data-go>${label}</button>` : `<button class="btn btn--amber" type="button" disabled>Waiting for ${esc(coop.hostName())}…</button>`}`;
}

export function showFired(extra: { badges: string[] } = { badges: [] }): Promise<void> {
  return new Promise((resolve) => {
    const co = coop.live;
    const list = rows();
    const days = state.day;
    const el = document.createElement('section');
    el.className = 'sheet-wrap sheet-wrap--fired';
    el.setAttribute('aria-label', 'Termination report');
    el.innerHTML = `<div class="sheet">
      <div class="sheet__head"><div>
        <div class="sheet__eyebrow">${t('Sunrise Customer Care termination report')}</div>
        <h2 class="sheet__title">${t("Everyone's fired")}</h2>
        <p>${co ? `Everyone in room ${esc(coop.code())}, ranked by what they brought in.` : t('Your complete employment record, ranked against the rest of the call floor.')}</p>
      </div><div class="sheet__side tabular"><div><b>${days} ${days > 1 ? t('days') : t('day')}</b><span>${t('days worked')}</span></div><div><b class="is-money">${fmt(state.team)}</b><span>${t('team haul')}</span></div><div><b>${fmt(state.quota)}</b><span>${t('final quota')}</span></div></div></div>
      <div class="rank-line">${t('Final rank:')} <b>${esc(currentRank().name)}</b>${extra.badges.length ? ` · ${extra.badges.length} badge${extra.badges.length > 1 ? 's' : ''} earned this run` : ''}</div>
      ${extra.badges.length ? `<div class="badges-row">${badgeChips(extra.badges)}</div>` : ''}
      ${table(list, days, 'earned')}
      <div class="panel__actions">${co ? coopButtons('Start again, same floor') : `<button class="btn btn--amber" type="button" data-again>${t('Start again')}</button>`}</div>
    </div>`;
    document.body.appendChild(el);
    if (co) coopActions(el, resolve, 'Opening the floor…');
    else el.querySelector('[data-again]')!.addEventListener('click', () => { el.remove(); resolve(); });
    (el.querySelector<HTMLButtonElement>('[data-again], [data-go]') ?? el.querySelector<HTMLButtonElement>('button'))?.focus();
  });
}

export function showPromotion(bonus: number, extra: { promoted: Rank | null; badges: string[] } = { promoted: null, badges: [] }): Promise<void> {
  return new Promise((resolve) => {
    const co = coop.live;
    const next = state.day + 1;
    const fresh = SCAMS.filter((s) => !state.owned.has(s.id)).slice(0, 3);
    const today = co ? [...rows()].sort((a, b) => b.today - a.today) : [];
    const el = document.createElement('section');
    el.className = 'sheet-wrap sheet-wrap--promo';
    el.setAttribute('aria-label', 'Day complete');
    el.innerHTML = `<div class="sheet">
      <div class="sheet__eyebrow">${t('Sunrise Customer Care · performance notice')}</div>
      <h2 class="sheet__title">${t('Day {d} survived', { d: state.day })}</h2>
      <p>${t('Quota met. Mr. Krull has approved a bonus of {b} to your personal account and a larger number for tomorrow.', { b: `<b>${fmt(bonus)}</b>` })}</p>
      <div class="sheet__stats"><div><b>${fmt(quotaFor(next))}</b><span>${t("tomorrow's quota")}</span></div><div><b>${fmt(state.personal)}</b><span>${t('your money')}</span></div><div><b>${state.calls.length}</b><span>${t('calls today')}</span></div></div>
      ${extra.promoted ? `<div class="rank-line">${t('Promoted to')} <b>${esc(extra.promoted.name)}</b>. ${esc(extra.promoted.perk)}</div>` : ''}
      ${extra.badges.length ? `<h3>${t('Badges this run')}</h3><div class="badges-row">${badgeChips(extra.badges)}</div>` : ''}
      ${co ? `<h3>${t('Today on the floor')}</h3>${table(today, state.day, 'today')}` : ''}
      ${fresh.length ? `<h3>${t('New in Swindlr Market')}</h3><div class="unlocks">${fresh.map((s) => `<div class="unlock"><span class="tile" style="--tile:${s.color}">${icon(s.glyph)}</span><div><b>${s.name}</b><div class="fine">${s.tagline} · ${fmt(s.price)}</div></div></div>`).join('')}</div>` : ''}
      ${next >= 2 ? '<p class="fine">From day 2, inspectors from the Bureau of Nonsense will call. Never say yes to their file.</p>' : ''}
      <div class="panel__actions">${co ? coopButtons('Clock in tomorrow') : `<button class="btn btn--amber" type="button" data-next>${t('Clock in tomorrow')}</button>`}</div>
    </div>`;
    document.body.appendChild(el);
    if (co) coopActions(el, resolve, 'Opening tomorrow…');
    else el.querySelector('[data-next]')!.addEventListener('click', () => { el.remove(); resolve(); });
    (el.querySelector<HTMLButtonElement>('[data-next], [data-go]') ?? el.querySelector<HTMLButtonElement>('button'))?.focus();
  });
}
