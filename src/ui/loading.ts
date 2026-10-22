// The loading screen: the first thing on the page while the office warms up (rig, furniture kit, environment).
// A real bar (eases while the assets load, fills when they are in), a rotating tip, the logo, a Skip after a moment.
import { settings } from '../game/state';
import { icon } from '../os/icons';
import { t } from '../i18n';

const TIPS = [
  'Use the caller\'s name. It is the cheapest thing you can give them.',
  'Pitch first, ask second. Asking first makes them suspicious.',
  'The trust bar is the whole game. Watch the word next to it.',
  'Every product has one closing question. The Script lists them.',
  'Never say yes to an inspector\'s file. Never.',
  'Krull walks the floor at ten past. Close the casino.',
  'Stand up (Esc) and take a call at any free PC.',
  'The Moon is sold out some nights. Sell them the Sun.',
  'Hold a caller and take the next one once you are a Floor Lead.',
  'Press R on the floor: Hold FM, for the night shift.',
];

let el: HTMLElement | null = null;

/** shows the screen until `ready` settles (or the person skips); resolves with what `ready` resolved to */
export function showLoading<T>(ready: Promise<T>): Promise<T> {
  if (el) el.remove();
  el = document.createElement('div');
  el.className = 'loading';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Loading');
  el.innerHTML = `<div class="loading__inner"><div class="loading__logo">${icon('phone')}</div><div class="loading__eyebrow">${t('Sunrise Customer Care · night shift · Port Fortune')}</div><div class="loading__word">Hold <em>please</em></div>
    <div class="loading__bar"><i></i></div><div class="loading__pct tabular">0%</div><div class="loading__tip"></div><button type="button" class="btn btn--ghost loading__skip" hidden>Skip</button></div>`;
  document.body.appendChild(el);
  const bar = el.querySelector<HTMLElement>('.loading__bar i')!, pct = el.querySelector<HTMLElement>('.loading__pct')!, tip = el.querySelector<HTMLElement>('.loading__tip')!, skip = el.querySelector<HTMLButtonElement>('.loading__skip')!;
  let p = 0, done = false, tipI = Math.floor(Math.random() * TIPS.length);
  tip.textContent = TIPS[tipI];
  const tipTimer = setInterval(() => { tipI = (tipI + 1) % TIPS.length; tip.classList.remove('loading__tip--in'); void tip.offsetWidth; tip.textContent = TIPS[tipI]; tip.classList.add('loading__tip--in'); }, 2600);
  const start = performance.now();
  const tick = setInterval(() => {
    if (done) return;
    const s = (performance.now() - start) / 1000;
    p = Math.min(92, 100 * (1 - Math.exp(-s / 2.2)));   // fast at first, creeping toward 92 until the office answers
    bar.style.transform = `scaleX(${p / 100})`; pct.textContent = Math.round(p) + '%';
  }, 80);
  const skipTimer = setTimeout(() => { skip.hidden = false; }, 3500);
  return new Promise<T>((resolve) => {
    let value: T;
    const finish = () => {
      if (done) return; done = true;
      clearInterval(tick); clearInterval(tipTimer); clearTimeout(skipTimer);
      bar.style.transform = 'scaleX(1)'; pct.textContent = '100%';
      const gone = () => { el?.remove(); el = null; resolve(value); };
      if (settings.motion === 'off') gone(); else { el!.classList.add('loading--out'); setTimeout(gone, 420); }
    };
    skip.addEventListener('click', () => { value = undefined as T; finish(); });
    ready.then((v) => { value = v; setTimeout(finish, 250); }, () => { value = undefined as T; finish(); });
  });
}
