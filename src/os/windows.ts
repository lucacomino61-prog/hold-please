// Harbour OS window manager: one layer, draggable windows, focus order, minimise, close.
import { bus, settings } from '../game/state';
import { icon } from './icons';

export interface WinOpts {
  id: string;
  title: string;
  glyph: string;
  color?: string;
  w: number;
  h: number;
  x?: number;
  y?: number;
  className?: string;
  onClose?: () => void;
  single?: boolean;
}

export interface Win {
  id: string;
  opts: WinOpts;
  el: HTMLElement;
  body: HTMLElement;
  closed: boolean;
  minimised: boolean;
  close(): void;
  focus(): void;
  minimise(): void;
  restore(): void;
  setTitle(t: string): void;
  shake(): void;
}

const wins = new Map<string, Win>();
let z = 10;
let layer: HTMLElement | null = null;
let cascade = 0;

export function setWindowLayer(el: HTMLElement): void { layer = el; }
export function allWindows(): Win[] { return [...wins.values()]; }
export function getWindow(id: string): Win | undefined { return wins.get(id); }

export function openWindow(opts: WinOpts, render: (body: HTMLElement, win: Win) => void): Win {
  if (!layer) throw new Error('window layer not mounted');
  const existing = wins.get(opts.id);
  if (existing && opts.single !== false) { existing.restore(); existing.focus(); return existing; }

  const vw = layer.clientWidth || window.innerWidth;
  const vh = layer.clientHeight || window.innerHeight;
  const narrow = vw < 720;
  const w = Math.min(opts.w, vw - (narrow ? 8 : 24));
  const h = Math.min(opts.h, vh - (narrow ? 8 : 24));
  cascade = (cascade + 1) % 8;
  const x = opts.x ?? Math.max(4, Math.min(vw - w - 4, Math.round(vw * 0.18 + cascade * 28)));
  const y = opts.y ?? Math.max(4, Math.min(vh - h - 4, Math.round(vh * 0.08 + cascade * 24)));

  const el = document.createElement('section');
  el.className = 'win' + (opts.className ? ' ' + opts.className : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', opts.title);
  el.tabIndex = -1;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.setProperty('--app', opts.color ?? 'var(--ink-3)');
  el.innerHTML = `
    <header class="win__bar">
      <span class="win__glyph" aria-hidden="true">${opts.glyph}</span>
      <span class="win__title"></span>
      <span class="win__controls">
        <button class="win__btn" data-act="min" aria-label="Minimise ${opts.title}">${icon('min')}</button>
        <button class="win__btn" data-act="max" aria-label="Fit ${opts.title} to the screen">${icon('max')}</button>
        <button class="win__btn win__btn--close" data-act="close" aria-label="Close ${opts.title}">${icon('close')}</button>
      </span>
    </header>
    <div class="win__body"></div>`;
  const body = el.querySelector<HTMLElement>('.win__body')!;
  const titleEl = el.querySelector<HTMLElement>('.win__title')!;
  titleEl.textContent = opts.title;

  const win: Win = {
    id: opts.id, opts, el, body, closed: false, minimised: false,
    close() {
      if (win.closed) return;
      win.closed = true;
      wins.delete(opts.id);
      opts.onClose?.();
      if (settings.motion === 'off') { el.remove(); }
      else {
        el.classList.add('win--out');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 200);
      }
      bus.emit('windows');
    },
    focus() {
      el.style.zIndex = String(++z);
      layer!.querySelectorAll('.win--active').forEach((n) => n.classList.remove('win--active'));
      el.classList.add('win--active');
      bus.emit('windows');
    },
    minimise() { win.minimised = true; el.classList.add('win--min'); bus.emit('windows'); },
    restore() { win.minimised = false; el.classList.remove('win--min'); bus.emit('windows'); },
    setTitle(t) { titleEl.textContent = t; },
    shake() {
      el.classList.remove('win--shake');
      void el.offsetWidth;
      el.classList.add('win--shake');
    },
  };

  el.addEventListener('pointerdown', () => win.focus());
  el.querySelector('[data-act="close"]')!.addEventListener('click', (e) => { e.stopPropagation(); win.close(); });
  el.querySelector('[data-act="min"]')!.addEventListener('click', (e) => { e.stopPropagation(); win.minimise(); });
  el.querySelector('[data-act="max"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    const big = el.classList.toggle('win--max');
    if (!big) { el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = x + 'px'; el.style.top = y + 'px'; }
  });

  // drag by the bar
  const bar = el.querySelector<HTMLElement>('.win__bar')!;
  let drag: { dx: number; dy: number; id: number } | null = null;
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (el.classList.contains('win--max')) return;
    drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop, id: e.pointerId };
    bar.setPointerCapture(e.pointerId);
    el.classList.add('win--drag');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const lw = layer!.clientWidth, lh = layer!.clientHeight;
    const nx = Math.max(-el.offsetWidth + 80, Math.min(lw - 80, e.clientX - drag.dx));
    const ny = Math.max(0, Math.min(lh - 40, e.clientY - drag.dy));
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove('win--drag');
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  layer.appendChild(el);
  wins.set(opts.id, win);
  render(body, win);
  win.focus();
  bus.emit('windows');
  return win;
}

export function closeAllWindows(except: string[] = []): void {
  for (const w of [...wins.values()]) if (!except.includes(w.id)) w.close();
}
export function minimiseAll(): void { for (const w of wins.values()) w.minimise(); }
export function anyVisible(ids?: string[]): boolean {
  for (const w of wins.values()) if (!w.minimised && (!ids || ids.includes(w.id))) return true;
  return false;
}
