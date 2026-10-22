// Snapshots and doodles made during the shift (the Camera and Paint apps). Kept for the review.
import { bus } from './state';

export interface Clip { kind: 'snapshot' | 'doodle'; dataUrl: string; t: number; caption: string; auto?: boolean; line?: string }

export const clips: Clip[] = [];

export function addClip(c: Omit<Clip, 't'>): void {
  clips.push({ ...c, t: Date.now() });
  if (clips.length > 24) clips.shift();
  bus.emit('clip', { kind: c.kind });
}

export function clearClips(): void { clips.length = 0; }
