// The elevator: the morning after a promotion starts inside it. The doors are shut, the floor number climbs, the
// chime goes, and the doors open onto the new floor (whatever `open` puts behind them: the 3-D office or the
// whiteboard). A click or any key skips it; with animations stopped it is a short card.
import { settings } from '../game/state';
import { sfx } from '../game/sound';
import { t } from '../i18n';

/** the ride on screen, if any: a new one ends it first (its doors open, its day begins), so two never stack */
let current: (() => void) | null = null;

export function elevatorRide(from: number, to: number, name: string, open: () => void): Promise<void> {
  current?.();
  return new Promise((resolve) => {
    const quick = settings.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.createElement('div');
    el.className = 'elevator';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', t('Lift'));
    el.innerHTML = `<div class="elevator__head">
        <div class="elevator__display"><span class="elevator__arrow" aria-hidden="true">▲</span><b class="elevator__n tabular">${quick ? to : from}</b></div>
        <div class="elevator__name" aria-live="polite">${quick ? esc(t('Floor {n}', { n: to }) + ' · ' + t(name)) : esc(t('Going up'))}</div>
      </div>
      <div class="elevator__doors" aria-hidden="true"><div class="elevator__door elevator__door--l"></div><div class="elevator__door elevator__door--r"></div></div>
      <button type="button" class="btn btn--ghost elevator__skip">${esc(t('Skip'))}</button>`;
    document.body.appendChild(el);
    const n = el.querySelector<HTMLElement>('.elevator__n')!, label = el.querySelector<HTMLElement>('.elevator__name')!;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, f: () => void) => { timers.push(setTimeout(f, ms)); };
    let opened = false, done = false;
    const reveal = () => { if (opened) return; opened = true; open(); };
    const finish = () => {
      if (done) return;
      done = true;
      if (current === finish) current = null;
      timers.forEach(clearTimeout);
      reveal();
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 260);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); finish(); };
    el.addEventListener('click', finish);
    window.addEventListener('keydown', onKey, true);
    current = finish;
    if (quick) { later(1100, finish); return; }
    // the climb: one tick per floor over 1.4 s, the hum underneath, then the chime and the doors
    const floors = Math.max(1, to - from), step = 1400 / floors;
    later(250, () => sfx.liftHum(1500));
    for (let i = 1; i <= floors; i++) later(250 + i * step, () => { n.textContent = String(from + i); sfx.liftTick(); });
    later(1800, () => { el.classList.add('is-ding'); sfx.ding(); label.textContent = t('Floor {n}', { n: to }) + ' · ' + t(name); });
    later(2050, reveal);
    later(2200, () => el.classList.add('is-open'));
    later(3000, finish);
  });
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
