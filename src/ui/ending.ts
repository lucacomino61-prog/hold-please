// The ending: day ten's shift survived with the Bureau in the building. A proper last screen, the run's numbers,
// the credits, then the title. The hall keeps the run as escaped.
import { fmt, settings, state } from '../game/state';
import { badgeChips } from '../game/hall';
import { currentRank } from '../game/ranks';
import { sfx } from '../game/sound';

const CREDITS = [
  ['A game by', 'Luca, with Claude'],
  ['Engine', 'three.js · Vite · TypeScript'],
  ['Furniture and people', 'Kenney (CC0)'],
  ['Type', 'Bebas Neue · Inter'],
  ['The callers', 'everyone you made in the Character Creator'],
  ['Mr. Krull', 'is not based on anyone. He says so.'],
  ['No real scheme', 'was explained in the making of this game.'],
];

export function showEnding(extra: { badges: string[] }): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('section');
    el.className = 'ending';
    el.setAttribute('aria-label', 'The end');
    const calls = state.allCalls.length;
    el.innerHTML = `<div class="ending__inner">
      <div class="ending__eyebrow">Sunrise Customer Care · the morning after</div>
      <h2 class="ending__title">You made it out</h2>
      <p class="ending__text">Ten nights. The Bureau came for the floor and found the phones ringing and the desks clean. Mr. Krull signed the release form himself. He did not look up.</p>
      <div class="ending__stats"><div><b>${state.day}</b><span>days</span></div><div><b>${fmt(state.team)}</b><span>team total</span></div><div><b>${fmt(state.personal)}</b><span>yours</span></div><div><b>${calls}</b><span>calls</span></div><div><b>${currentRank().name}</b><span>rank</span></div></div>
      ${extra.badges.length ? `<div class="badges-row">${badgeChips(extra.badges)}</div>` : ''}
      <div class="ending__credits" aria-label="Credits">${CREDITS.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}<div><span>Agent</span><b>${settings.playerName || 'You'}</b></div></div>
      <div class="panel__actions"><button class="btn btn--amber" type="button" data-title>Back to the title</button></div>
    </div>`;
    document.body.appendChild(el);
    sfx.jackpot();
    el.querySelector('[data-title]')!.addEventListener('click', () => { el.remove(); resolve(); });
    el.querySelector<HTMLButtonElement>('[data-title]')!.focus();
  });
}
