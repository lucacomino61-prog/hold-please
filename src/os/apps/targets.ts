// Targets: today's three objectives and how far along each one is. Pinned to the taskbar like the real HUD list.
import { bus, fmt } from '../../game/state';
import { objectives } from '../../game/objectives';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

export function targetsHTML(): string {
  const list = objectives();
  if (!list.length) return '<p class="muted">No targets yet. They are set when the shift starts.</p>';
  return `<ul class="targets">${list.map((o) => `<li class="target ${o.done ? 'target--done' : ''}">
      <span class="target__tick" aria-hidden="true">${o.done ? '✓' : ''}</span>
      <div class="target__body"><b>${esc(o.def.text)}</b><div class="target__bar"><i style="width:${Math.round((o.progress / o.def.target) * 100)}%"></i></div></div>
      <span class="target__reward tabular">${o.def.target > 1 ? `${o.progress}/${o.def.target} · ` : ''}+${fmt(o.def.reward)}</span>
    </li>`).join('')}</ul>`;
}

registerApp({ id: 'targets', name: 'Targets', color: '#ffd21f', glyph: 'star', kind: 'core', pinned: true, open: () => {
  openWindow({ id: 'targets', title: 'Daily targets', glyph: icon('star'), color: '#ffd21f', w: 360, h: 300, x: 24, y: Math.max(24, window.innerHeight - 380) }, (body) => {
    const render = () => { body.innerHTML = `<div class="targets__wrap"><p class="targets__intro">Three extras next to the quota. Each one pays you the moment it is done.</p>${targetsHTML()}</div>`; };
    render();
    const off = bus.on('objective', render);
    const offWin = bus.on('windows', () => { if (!body.isConnected) { off(); offWin(); } });
  });
} });
