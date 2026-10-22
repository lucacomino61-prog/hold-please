// The one requestAnimationFrame owner. Everything that moves per frame hangs off this.
import { bus } from '../game/state';

type Renderer = (dt: number, t: number) => void;
let renderer: Renderer | null = null;
let last = 0;
let running = false;

function frame(t: number): void {
  if (!running) return;
  const dt = last ? Math.min(100, t - last) : 16;
  last = t;
  bus.emit('frame', dt);
  renderer?.(dt, t);
  requestAnimationFrame(frame);
}

export function startLoop(): void {
  if (running) return;
  running = true;
  last = 0;
  requestAnimationFrame(frame);
}

export function stopLoop(): void { running = false; }
export function setRenderer(fn: Renderer | null): void { renderer = fn; }
