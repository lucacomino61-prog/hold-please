// Real music for Hold FM: tracks listed in public/music/manifest.json (file, title, by, license), played in turn by
// an <audio> element. With an empty manifest the generated lo-fi loop in sound.ts plays instead, so the game works
// before any track lands. Every track in the manifest must be CC0 or public domain, and the manifest says so.
import { bus, saveSettings, settings } from './state';

export interface Track { file: string; title: string; by: string; license: string }
let tracks: Track[] = [];
let loaded: Promise<Track[]> | null = null;
let audio: HTMLAudioElement | null = null;
let index = 0;
let playing = false;

export function loadTracks(): Promise<Track[]> {
  loaded ??= fetch('/music/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((j: unknown) => { tracks = Array.isArray(j) ? (j as Track[]).filter((t) => t && t.file && t.title) : []; return tracks; }).catch(() => { tracks = []; return tracks; });
  return loaded;
}
export function trackList(): Track[] { return tracks; }
export function current(): Track | null { return playing ? tracks[index] ?? null : null; }
export function musicPlaying(): boolean { return playing; }

function el(): HTMLAudioElement {
  if (!audio) { audio = new Audio(); audio.preload = 'auto'; audio.addEventListener('ended', () => { if (playing) next(); }); }
  audio.volume = settings.musicVolume;
  return audio;
}
export function play(i = index): boolean {
  if (!tracks.length) return false;
  index = ((i % tracks.length) + tracks.length) % tracks.length;
  const a = el();
  a.src = '/music/' + tracks[index].file;
  playing = true;
  void a.play().catch(() => { playing = false; });
  bus.emit('music', tracks[index]);
  return true;
}
export function next(): void { play(index + 1); }
export function stop(): void { playing = false; audio?.pause(); bus.emit('music', null); }
export function setVolume(v: number): void { settings.musicVolume = Math.max(0, Math.min(1, v)); saveSettings(); if (audio) audio.volume = settings.musicVolume; }
