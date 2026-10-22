// Hall of fame: the best runs on this browser and every badge, earned or not.
import { fmt } from '../game/state';
import { ACHIEVEMENTS, hall, history, unlocked } from '../game/hall';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

export function openHall(): void {
  const runs = hall();
  const got = unlocked();
  const n = Object.keys(got).length;
  const wrap = document.createElement('div');
  wrap.className = 'screen';
  wrap.style.zIndex = '80';
  wrap.style.background = 'oklch(0 0 0 / .6)';
  wrap.innerHTML = `<div class="panel panel--wide hall" role="dialog" aria-labelledby="hall-title">
    <h2 id="hall-title">Hall of fame</h2>
    <p class="fine">Best runs on this browser, by days survived. ${n} of ${ACHIEVEMENTS.length} badges earned.</p>
    ${runs.length ? `<table class="hall__table"><thead><tr><th>#</th><th>Agent</th><th>Days</th><th>Team</th><th>Yours</th><th>Rank</th><th>When</th></tr></thead><tbody>
      ${runs.map((r, i) => `<tr><td class="rank">#${i + 1}</td><td><b>${esc(r.name)}</b>${r.won ? '<span class="hall__live">escaped</span>' : r.fired ? '' : '<span class="hall__live">in progress</span>'}</td><td class="tabular">${r.days}</td><td class="tabular">${fmt(r.team)}</td><td class="tabular">${fmt(r.personal)}</td><td>${esc(r.rank)}</td><td class="hall__when">${new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">No runs yet. Dial in, survive a day, and your name goes up here.</p>'}
    <h3>Run history</h3>
    ${history().length ? `<table class="hall__table"><thead><tr><th>When</th><th>Agent</th><th>Days</th><th>Team</th><th>Yours</th><th>How it ended</th></tr></thead><tbody>${history().slice(0, 30).map((r) => `<tr><td class="hall__when">${new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td><b>${esc(r.name)}</b></td><td class="tabular">${r.days}</td><td class="tabular">${fmt(r.team)}</td><td class="tabular">${fmt(r.personal)}</td><td>${r.won ? 'Escaped' : r.fired ? 'Fired' : 'In progress'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing yet.</p>'}
    <h3>Badges</h3>
    <div class="badges">${ACHIEVEMENTS.map((a) => `<div class="badge-card ${got[a.id] ? 'badge-card--got' : ''}"><span class="badge-card__star" aria-hidden="true">${got[a.id] ? '★' : '☆'}</span><div><b>${esc(a.name)}</b><div class="fine">${esc(a.blurb)}</div></div></div>`).join('')}</div>
    <div class="panel__actions"><button class="btn btn--amber" type="button">Close</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.panel__actions button')!.addEventListener('click', close);
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wrap.querySelector<HTMLButtonElement>('.panel__actions button')!.focus();
}
