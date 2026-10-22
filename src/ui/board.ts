// The challenge board: the top fifty for tonight's or this week's shift, your row marked.
import { fmt } from '../game/state';
import { fetchScores, myScorerId } from '../net/scores';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function showBoard(kind: 'daily' | 'weekly', key: string, mine?: { team: number; personal: number; pass: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'screen'; wrap.style.zIndex = '82'; wrap.style.background = 'oklch(0 0 0 / .7)';
    wrap.innerHTML = `<div class="panel panel--wide board" role="dialog" aria-labelledby="board-title"><h2 id="board-title">${kind === 'daily' ? "Tonight's shift" : "This week's shift"} · ${esc(key)}</h2>
      ${mine ? `<p class="board__mine">Your shift: <b>${fmt(mine.team)}</b> team · <b>${fmt(mine.personal)}</b> yours · ${mine.pass ? 'quota met' : 'quota missed'}</p>` : '<p class="fine">Everyone who plays this shift gets the same callers, the same twist and the same targets. Best team total wins.</p>'}
      <div class="board__list"><p class="muted">Loading the board…</p></div>
      <div class="panel__actions"><button class="btn btn--amber" type="button" data-close>Close</button></div></div>`;
    document.body.appendChild(wrap);
    const list = wrap.querySelector<HTMLElement>('.board__list')!;
    void fetchScores(`${kind}:${key}`).then((scores) => {
      if (scores === null) { list.innerHTML = '<p class="muted">No room server configured, so no board. Set one in Play with friends → server.</p>'; return; }
      if (!scores.length) { list.innerHTML = '<p class="muted">Nobody yet. You could be first.</p>'; return; }
      const me = myScorerId();
      list.innerHTML = `<table class="hall__table"><thead><tr><th>#</th><th>Agent</th><th>Team</th><th>Yours</th><th>Quota</th></tr></thead><tbody>${scores.map((s, i) => `<tr class="${s.id === me ? 'me' : ''}"><td class="rank">#${i + 1}</td><td><b>${esc(s.name)}</b></td><td class="tabular">${fmt(s.team)}</td><td class="tabular">${fmt(s.personal)}</td><td>${s.pass ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table>`;
    });
    const close = () => { wrap.remove(); resolve(); };
    wrap.querySelector('[data-close]')!.addEventListener('click', close);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    wrap.querySelector<HTMLButtonElement>('[data-close]')!.focus();
  });
}
