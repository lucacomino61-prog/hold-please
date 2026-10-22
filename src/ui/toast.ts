// Toasts and the floating "+$250".
import { fmt } from '../game/state';

let box: HTMLElement | null = null;

function ensure(): HTMLElement {
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  return box;
}

export function toast(message: string, kind: 'info' | 'danger' | 'money' = 'info', ms = 3200): void {
  const b = ensure();
  const t = document.createElement('div');
  t.className = 'toast toast--' + kind;
  t.textContent = message;
  b.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 200ms'; setTimeout(() => t.remove(), 220); }, ms);
}

export function floatMoney(amount: number, x?: number, y?: number): void {
  const f = document.createElement('div');
  f.className = 'float-money';
  f.textContent = (amount >= 0 ? '+' : '−') + fmt(Math.abs(amount));
  f.style.left = (x ?? window.innerWidth * 0.5) + 'px';
  f.style.top = (y ?? window.innerHeight * 0.45) + 'px';
  if (amount < 0) f.style.color = 'var(--danger)';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 900);
}
