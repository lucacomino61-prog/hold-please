// Doodle: a small paint app. Doodles are kept for the review ("you drew this during work hours").
import { addClip } from '../../game/clips';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';

const COLOURS = ['#1a1a1a', '#ffffff', '#d94b4b', '#f08a24', '#e9c84a', '#3fa34d', '#4a78d9', '#8e5ad6', '#e38b4a'];

registerApp({ id: 'paint', name: 'Doodle', color: '#8e5ad6', glyph: 'wallpapers', kind: 'side', open: () => {
  openWindow({ id: 'paint', title: 'Doodle', glyph: icon('wallpapers'), color: '#8e5ad6', w: 560, h: 480 }, (body) => {
    body.innerHTML = `<div class="paint"><div class="paint__tools">${COLOURS.map((c, i) => `<button type="button" class="paint__swatch" data-c="${c}" style="background:${c}" aria-label="Colour ${i + 1}" aria-pressed="${i === 0}"></button>`).join('')}
      <label class="paint__size">Size <input type="range" min="2" max="40" value="8" /></label><button type="button" class="btn btn--ghost" data-clear style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Clear</button><button type="button" class="btn" data-keep>Keep for the review</button></div>
      <canvas class="paint__canvas" width="640" height="420" aria-label="Drawing canvas"></canvas></div>`;
    const canvas = body.querySelector<HTMLCanvasElement>('canvas')!, g = canvas.getContext('2d')!;
    g.fillStyle = '#fffdf7'; g.fillRect(0, 0, 640, 420);
    let colour = COLOURS[0], size = 8, drawing = false, last: [number, number] | null = null;
    const pos = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (640 / r.width), (e.clientY - r.top) * (420 / r.height)]; };
    canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); g.fillStyle = colour; g.beginPath(); g.arc(last[0], last[1], size / 2, 0, Math.PI * 2); g.fill(); });
    canvas.addEventListener('pointermove', (e) => { if (!drawing || !last) return; const p = pos(e); g.strokeStyle = colour; g.lineWidth = size; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; });
    const stop = () => { drawing = false; last = null; };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
    body.querySelectorAll<HTMLButtonElement>('.paint__swatch').forEach((b) => b.addEventListener('click', () => { colour = b.dataset.c!; body.querySelectorAll('.paint__swatch').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); }));
    body.querySelector<HTMLInputElement>('input[type=range]')!.addEventListener('input', (e) => { size = Number((e.target as HTMLInputElement).value); });
    body.querySelector('[data-clear]')!.addEventListener('click', () => { g.fillStyle = '#fffdf7'; g.fillRect(0, 0, 640, 420); });
    body.querySelector('[data-keep]')!.addEventListener('click', () => { addClip({ kind: 'doodle', dataUrl: canvas.toDataURL('image/png'), caption: 'Drawn during work hours' }); toast('Kept. It will come up in the review. Everything comes up in the review.', 'info'); });
  });
} });
