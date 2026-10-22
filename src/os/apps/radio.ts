// Hold FM: the office radio. Real tracks from public/music (music.ts, CC0 only) when the manifest has any, else the
// generated lo-fi loop from sound.ts. Callers hear it in the background. R on the floor toggles it.
import { bus, settings, state } from '../../game/state';
import { sfx } from '../../game/sound';
import { setScene } from '../../game/scene';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';
import { current, loadTracks, musicPlaying, next, play, setVolume, stop, trackList } from '../../game/music';

const STATIONS = ['Hold FM — lo-fi for the night shift', 'Hold FM — beats to sell the Moon to', 'Hold FM — chillhop, allegedly'];
let station = 0;
void loadTracks();

export function radioOn(): boolean { return sfx.radioOn() || musicPlaying(); }
export function toggleRadio(on = !radioOn()): void {
  if (on) { if (!play()) sfx.radio(true); setScene('music', 10 * 60_000); toast(`${current() ? current()!.title + ' — ' + current()!.by : STATIONS[station]} — playing on the break-room TV.`, 'info', 3000); }
  else { sfx.radio(false); stop(); if (state.scene === 'music') setScene(''); }
  bus.emit('radio', on);
}
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

registerApp({ id: 'radio', name: 'Hold FM', color: '#2bb3a3', glyph: 'radio', kind: 'side', open: () => {
  openWindow({ id: 'radio', title: 'Hold FM', glyph: icon('radio'), color: '#2bb3a3', w: 380, h: 320 }, (body) => {
    const render = () => {
      const on = radioOn();
      const tracks = trackList();
      const now = current();
      body.innerHTML = `<div class="radio"><div class="radio__dial"><span class="radio__led ${on ? 'radio__led--on' : ''}"></span><b>${now ? esc(now.title) + ' — ' + esc(now.by) : STATIONS[station]}</b></div>
        <p class="fine">${tracks.length ? `${tracks.length} track${tracks.length === 1 ? '' : 's'} on the shelf, all ${esc(tracks[0].license)}.` : 'No tracks on the shelf yet (public/music): the house loop plays.'} Plays from the break-room TV. Callers can hear it. Press R on the floor.</p>
        <label class="radio__vol">Volume <input type="range" min="0" max="1" step="0.05" value="${settings.musicVolume}" aria-label="Music volume" /></label>
        <div class="cluster"><button class="btn ${on ? 'btn--danger' : 'btn--money'}" type="button" data-toggle>${on ? 'Stop' : 'Play'}</button><button class="btn btn--ghost" type="button" data-next style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Next</button></div>
        ${tracks.length ? `<ol class="radio__list">${tracks.map((t, i) => `<li class="${now === t ? 'is-on' : ''}"><button type="button" data-play="${i}">${esc(t.title)}</button> <small>${esc(t.by)} · ${esc(t.license)}</small></li>`).join('')}</ol>` : ''}</div>`;
      body.querySelector('[data-toggle]')!.addEventListener('click', () => { toggleRadio(); render(); });
      body.querySelector('[data-next]')!.addEventListener('click', () => { if (tracks.length) { if (!musicPlaying()) toggleRadio(true); else next(); } else { station = (station + 1) % STATIONS.length; if (sfx.radioOn()) { sfx.radio(false); sfx.radio(true); } } render(); });
      body.querySelector<HTMLInputElement>('.radio__vol input')!.addEventListener('input', (e) => setVolume(Number((e.target as HTMLInputElement).value)));
      body.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => b.addEventListener('click', () => { sfx.radio(false); play(Number(b.dataset.play)); setScene('music', 10 * 60_000); bus.emit('radio', true); render(); }));
    };
    render();
    const off = bus.on('radio', render), offM = bus.on('music', render);
    const offWin = bus.on('windows', () => { if (!body.isConnected) { off(); offM(); offWin(); } });
  });
} });
