// The caller codex: everyone you have ever spoken to on this run, their portrait, what they bought, how the last
// call ended, and what they remember of you (game/memory.ts stores it; this is the first place that shows it).
import { fmt, settings, state, type CallRecord } from '../../game/state';
import { callerById } from '../../game/callers';
import { priorText, priorWith } from '../../game/memory';
import { scamById } from '../../game/scams';
import { icon } from '../icons';
import { portraitHTML } from '../portrait';
import { registerApp } from '../registry';
import { openWindow } from '../windows';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface Entry { id: string; name: string; archetype: string; calls: CallRecord[]; bought: number; products: Set<string>; last: CallRecord }
function entries(): Entry[] {
  const map = new Map<string, Entry>();
  for (const r of [...state.allCalls, ...state.calls]) {
    if (!r.callerId || !r.endedAt || map.get(r.callerId)?.calls.includes(r)) continue;   // a call still ringing is not a memory yet
    const e = map.get(r.callerId) ?? { id: r.callerId, name: r.name, archetype: r.archetype, calls: [], bought: 0, products: new Set<string>(), last: r };
    e.calls.push(r); e.last = r;
    for (const p of r.payouts) { e.bought += p.amount; e.products.add(p.scam); }
    map.set(r.callerId, e);
  }
  return [...map.values()].sort((a, b) => b.last.startedAt - a.last.startedAt);
}

registerApp({ id: 'codex', name: 'Callers', color: '#5a3a8a', glyph: 'codex', kind: 'core', open: () => {
  openWindow({ id: 'codex', title: 'Callers — everyone you have spoken to', glyph: icon('codex'), color: '#5a3a8a', w: 680, h: 520 }, (body) => {
    const list = entries();
    body.innerHTML = `<div class="codex"><div class="codex__list">${list.length ? list.map((e, i) => `<button type="button" class="codex__item ${i === 0 ? 'codex__item--open' : ''}" data-id="${esc(e.id)}"><span class="codex__face">${(() => { const c = callerById(e.id); return c ? portraitHTML(c.id, c.portrait, c.name, 'calm', 40) : '<i>?</i>'; })()}</span><span><b>${esc(e.name)}</b><small>${e.calls.length} call${e.calls.length === 1 ? '' : 's'} · ${fmt(e.bought)}</small></span></button>`).join('') : '<div class="mail__empty">Nobody yet. Answer the phone.</div>'}</div><div class="codex__read"><div class="mail__empty">Pick a caller.</div></div></div>`;
    const read = body.querySelector<HTMLElement>('.codex__read')!;
    const show = (e: Entry) => {
      const c = callerById(e.id);
      const prior = priorWith(e.id);
      const mood = e.last.trustEnd;
      const ended = e.last.hungUpBy === 'caller' ? (e.last.busted ? 'They saw through you and hung up.' : 'They hung up.') : e.last.hungUpBy === 'you' ? 'You hung up.' : e.last.hungUpBy === 'transfer' ? 'You passed them to a colleague.' : 'The shift ended.';
      const lastLine = [...e.last.lines].reverse().find((l) => l.who === 'caller')?.text ?? '';
      read.innerHTML = `<div class="codex__head"><div class="codex__portrait">${c ? portraitHTML(c.id, c.portrait, c.name, mood < 30 ? 'angry' : mood >= 70 ? 'happy' : 'calm', 120) : '<i>?</i>'}</div><div><h3>${esc(e.name)}</h3><p class="muted">${esc(c?.gimmick ?? e.archetype)}</p>${c?.vip ? '<span class="codex__vip">⭐ VIP</span>' : ''}${c?.portrait?.credit ? `<div class="codex__credit">Cartoon drawn from a photo: ${esc(c.portrait.credit)}</div>` : ''}</div></div>
        <div class="codex__stats"><div><b>${e.calls.length}</b><span>call${e.calls.length === 1 ? '' : 's'}</span></div><div><b>${fmt(e.bought)}</b><span>bought</span></div><div><b>${Math.round(mood)}%</b><span>trust at the end</span></div></div>
        ${e.products.size ? `<div class="codex__products">${[...e.products].map((p) => { const s = scamById.get(p as never); return s ? `<span class="tile" style="--tile:${s.color}" title="${esc(s.name)}">${icon(s.glyph)}</span>` : ''; }).join('')}</div>` : ''}
        <h4>Last call</h4><p>${esc(ended)}${lastLine ? ` Their last words: <em>“${esc(lastLine.slice(0, 140))}”</em>` : ''}</p>
        <h4>What they remember</h4><p>${prior ? esc(priorText(prior, settings.playerName || 'Agent')) : 'Nothing yet: the next call is the first one they will remember.'}</p>`;
      body.querySelectorAll('.codex__item').forEach((b) => b.classList.toggle('codex__item--open', (b as HTMLElement).dataset.id === e.id));
    };
    body.querySelectorAll<HTMLButtonElement>('.codex__item').forEach((b) => b.addEventListener('click', () => { const e = list.find((x) => x.id === b.dataset.id); if (e) show(e); }));
    if (list.length) show(list[0]);
  });
} });
