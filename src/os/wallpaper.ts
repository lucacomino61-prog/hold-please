// Wallpapers for Harbour OS, painted on a canvas: the photo-style landscapes the real desktop uses (snowy
// mountains, a desert canyon at dusk, a coast), plus the house ones. No photos, no files.

export type WallpaperId = 'alps' | 'canyon' | 'coast' | 'harbour' | 'dusk' | 'neon' | 'paper' | 'void';

export const WALLPAPERS: { id: WallpaperId; name: string }[] = [
  { id: 'alps', name: 'Snow mountains' },
  { id: 'canyon', name: 'Canyon at dusk' },
  { id: 'coast', name: 'Coast road' },
  { id: 'harbour', name: 'Port Fortune at night' },
  { id: 'dusk', name: 'Dusk over the cranes' },
  { id: 'neon', name: 'Neon rain' },
  { id: 'paper', name: 'Company beige' },
  { id: 'void', name: 'Nothing, thanks' },
];

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;
// a ridge line: a few sines on top of each other, deterministic per seed
function ridge(c: Ctx, w: number, h: number, y0: number, amp: number, seed: number, fill: string, snow?: { line: number; color: string }): void {
  const r = mulberry(seed);
  const f1 = 0.004 + r() * 0.003, f2 = 0.011 + r() * 0.006, f3 = 0.03 + r() * 0.02, p1 = r() * 9, p2 = r() * 9, p3 = r() * 9;
  const pts: [number, number][] = [];
  for (let x = -20; x <= w + 20; x += 6) pts.push([x, y0 + Math.sin(x * f1 + p1) * amp + Math.sin(x * f2 + p2) * amp * 0.45 + Math.abs(Math.sin(x * f3 + p3)) * amp * 0.25]);
  c.fillStyle = fill; c.beginPath(); c.moveTo(-20, h + 20);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(w + 20, h + 20); c.closePath(); c.fill();
  if (snow) {
    c.save(); c.beginPath(); c.rect(0, 0, w, snow.line); c.clip();
    c.fillStyle = snow.color; c.beginPath(); c.moveTo(-20, h + 20);
    for (const [x, y] of pts) c.lineTo(x, y);
    c.lineTo(w + 20, h + 20); c.closePath(); c.fill();
    c.restore();
  }
}
function clouds(c: Ctx, w: number, h: number, seed: number, n: number, yMax: number, alpha = 0.85): void {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = h * 0.06 + r() * yMax, s = 40 + r() * 90;
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let k = 0; k < 6; k++) { c.beginPath(); c.ellipse(cx + (r() - 0.5) * s * 1.6, cy + (r() - 0.5) * s * 0.4, s * (0.4 + r() * 0.5), s * (0.22 + r() * 0.25), 0, 0, Math.PI * 2); c.fill(); }
  }
}
function grain(c: Ctx, canvas: HTMLCanvasElement, amount = 14): void {
  const img = c.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data; const g = mulberry(99);
  for (let i = 0; i < d.length; i += 4 * 7) { const n = (g() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
}

function paintAlps(c: Ctx, w: number, h: number): void {
  const sky = c.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, '#4f8fd0'); sky.addColorStop(0.55, '#9ec7ec'); sky.addColorStop(1, '#e4f0fb');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  const sun = c.createRadialGradient(w * 0.78, h * 0.18, 0, w * 0.78, h * 0.18, w * 0.25); sun.addColorStop(0, 'rgba(255,250,230,.9)'); sun.addColorStop(1, 'rgba(255,250,230,0)');
  c.fillStyle = sun; c.fillRect(0, 0, w, h);
  clouds(c, w, h, 3, 7, h * 0.28);
  ridge(c, w, h, h * 0.42, h * 0.11, 11, '#a9bfd6', { line: h * 0.47, color: '#f4f8fc' });
  ridge(c, w, h, h * 0.5, h * 0.13, 21, '#7c93ad', { line: h * 0.55, color: '#eaf1f7' });
  ridge(c, w, h, h * 0.6, h * 0.1, 31, '#4f6a82', { line: h * 0.62, color: '#dde7ef' });
  ridge(c, w, h, h * 0.72, h * 0.06, 41, '#2f4b3c');
  // pines on the near slope
  const r = mulberry(5);
  for (let i = 0; i < 140; i++) { const x = r() * w, y = h * 0.74 + r() * h * 0.3, s = 6 + r() * 14; c.fillStyle = r() < 0.5 ? '#1f3a2c' : '#27493a'; c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s, y); c.lineTo(x - s, y); c.closePath(); c.fill(); }
  const mist = c.createLinearGradient(0, h * 0.6, 0, h); mist.addColorStop(0, 'rgba(230,240,250,0)'); mist.addColorStop(1, 'rgba(200,220,235,.35)');
  c.fillStyle = mist; c.fillRect(0, 0, w, h);
}

function paintCanyon(c: Ctx, w: number, h: number): void {
  const sky = c.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#2b1d3f'); sky.addColorStop(0.5, '#b14a3a'); sky.addColorStop(1, '#f6b35e');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fbe08a'; c.globalAlpha = 0.95; c.beginPath(); c.arc(w * 0.6, h * 0.5, h * 0.07, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  clouds(c, w, h, 7, 4, h * 0.2, 0.25);
  ridge(c, w, h, h * 0.5, h * 0.05, 12, '#6e2d2c');
  // mesas with strata
  const r = mulberry(8);
  for (let i = 0; i < 5; i++) {
    const x = r() * w, mw = w * (0.12 + r() * 0.2), top = h * (0.45 + r() * 0.1), base = h * 0.78;
    const strata = ['#8d3a2b', '#c1573a', '#d97a45', '#a3452e', '#e0975a'];
    for (let k = 0; k < 8; k++) { c.fillStyle = strata[k % strata.length]; const y = top + ((base - top) * k) / 8; c.fillRect(x - mw / 2 - k * 4, y, mw + k * 8, (base - top) / 8 + 1); }
    c.fillStyle = '#7a2e22'; c.fillRect(x - mw / 2 - 2, top - 4, mw + 4, 6);
  }
  c.fillStyle = '#c86a3f'; c.fillRect(0, h * 0.78, w, h * 0.22);
  // the river
  c.strokeStyle = '#3f6f8a'; c.lineWidth = h * 0.05; c.lineCap = 'round'; c.beginPath(); c.moveTo(-10, h * 0.9);
  for (let x = 0; x <= w; x += w / 8) c.quadraticCurveTo(x + w / 16, h * (0.86 + (x / w) * 0.1 + Math.sin(x / 90) * 0.02), x + w / 8, h * (0.9 + Math.sin(x / 120) * 0.03));
  c.stroke();
  const dark = c.createLinearGradient(0, h * 0.75, 0, h); dark.addColorStop(0, 'rgba(40,10,10,0)'); dark.addColorStop(1, 'rgba(40,10,10,.35)');
  c.fillStyle = dark; c.fillRect(0, 0, w, h);
}

function paintCoast(c: Ctx, w: number, h: number): void {
  const sky = c.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, '#6aa5d8'); sky.addColorStop(1, '#d7e9f6');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  clouds(c, w, h, 4, 6, h * 0.22);
  const sea = c.createLinearGradient(0, h * 0.5, 0, h); sea.addColorStop(0, '#2d7fb0'); sea.addColorStop(1, '#164f78');
  c.fillStyle = sea; c.fillRect(0, h * 0.5, w, h * 0.5);
  const r = mulberry(13);
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) { const y = h * 0.52 + r() * h * 0.45, x = r() * w, l = 20 + r() * 80; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y); c.stroke(); }
  // the cliff on the right, the beach below
  c.fillStyle = '#8c7a5c'; c.beginPath(); c.moveTo(w * 0.62, h); c.lineTo(w * 0.64, h * 0.3); c.lineTo(w * 0.78, h * 0.26); c.lineTo(w * 0.9, h * 0.34); c.lineTo(w, h * 0.3); c.lineTo(w, h); c.closePath(); c.fill();
  c.fillStyle = '#5f8a4a'; c.beginPath(); c.moveTo(w * 0.64, h * 0.3); c.lineTo(w * 0.78, h * 0.26); c.lineTo(w * 0.9, h * 0.34); c.lineTo(w, h * 0.3); c.lineTo(w, h * 0.36); c.lineTo(w * 0.66, h * 0.4); c.closePath(); c.fill();
  c.fillStyle = '#e8d9b3'; c.beginPath(); c.moveTo(w * 0.55, h); c.quadraticCurveTo(w * 0.62, h * 0.85, w * 0.7, h); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(w * 0.56, h); c.quadraticCurveTo(w * 0.6, h * 0.9, w * 0.66, h); c.closePath(); c.fill();
}

function paintCity(c: Ctx, w: number, h: number, id: 'harbour' | 'dusk' | 'neon' | 'paper' | 'void'): void {
  const r = mulberry(7);
  const palettes = {
    harbour: ['#0f1a2b', '#2a3b5c', '#f2a93b', '#13233a'],
    dusk: ['#2d1b3d', '#c0533d', '#f6c667', '#1a1226'],
    neon: ['#0a0f1f', '#1b2a66', '#ff5fa2', '#0d1430'],
    paper: ['#d9cdb3', '#efe6d2', '#8b7b5a', '#cbbfa3'],
    void: ['#0d0f12', '#171a1f', '#2a2f38', '#0b0c0f'],
  } as const;
  const [top, mid, accent, water] = palettes[id];
  const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, top); sky.addColorStop(0.65, mid); sky.addColorStop(1, water);
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  if (id === 'void' || id === 'paper') return;
  c.fillStyle = accent; c.globalAlpha = 0.9; c.beginPath(); c.arc(w * 0.72, h * 0.42, Math.min(w, h) * 0.08, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  const base = h * 0.66;
  let x = 0;
  while (x < w) {
    const bw = 30 + r() * 90, bh = 20 + r() * h * 0.18;
    c.fillStyle = water; c.fillRect(x, base - bh, bw, bh + 4);
    c.fillStyle = accent; c.globalAlpha = 0.35;
    for (let wy = base - bh + 8; wy < base - 6; wy += 12) for (let wx = x + 6; wx < x + bw - 6; wx += 12) if (r() > 0.55) c.fillRect(wx, wy, 5, 6);
    c.globalAlpha = 1;
    x += bw + 6 + r() * 20;
  }
  c.strokeStyle = water; c.lineWidth = 4;
  for (let i = 0; i < 3; i++) { const cx = w * (0.1 + i * 0.3) + r() * 60, ch = h * 0.3; c.beginPath(); c.moveTo(cx, base); c.lineTo(cx, base - ch); c.lineTo(cx + 120, base - ch + 10); c.moveTo(cx, base - ch); c.lineTo(cx - 40, base - ch + 30); c.stroke(); }
  c.globalAlpha = 0.25;
  for (let y = base; y < h; y += 6) { c.fillStyle = accent; const rw = r() * w * 0.25; c.fillRect(w * 0.72 - rw / 2 + (r() - 0.5) * 60, y, rw, 2); }
  c.globalAlpha = 1;
}

export function paintWallpaper(canvas: HTMLCanvasElement, id: WallpaperId, w: number, h: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (id === 'alps') paintAlps(c, w, h);
  else if (id === 'canyon') paintCanyon(c, w, h);
  else if (id === 'coast') paintCoast(c, w, h);
  else paintCity(c, w, h, id);
  grain(c, canvas, id === 'alps' || id === 'coast' ? 8 : 14);
}
