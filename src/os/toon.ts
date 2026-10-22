// Original cartoon portraits drawn from a caller's photo, in the browser. A photo is never shown as itself:
// the face is found by skin tone and cut tight, the picture is flattened into painted patches (Kuwahara),
// reduced to a twelve-colour palette, inked along the borders between colours, and the bust is set on a flat
// comic backdrop in the caller's own colour. The face stays recognisable; the picture is new.
// The Wikipedia thumbnails allow cross-origin reads (Access-Control-Allow-Origin: *), uploaded photos are
// data URLs, so the canvas stays readable. When a photo cannot be read the image is shown as it is.

const SIZE = 256;
const COLOURS = 12;       // the palette each cartoon is painted with
const KUWAHARA = 5;       // radius of the painterly smoothing
const RETRY_MS = 1500;    // one more try when the photo does not load

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
export const TOON_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('photo did not load'));
    img.src = src;
  });
}

/** the cartoon for a photo URL as a JPEG data URL (cached); '' when the browser cannot read the photo (the
 *  portrait then falls back to an initials tile: the photo itself is never shown) */
export function toonify(src: string): Promise<string> {
  const hit = cache.get(src);
  if (hit !== undefined) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const attempt = (): Promise<HTMLImageElement> => loadImage(src).catch(() => new Promise<HTMLImageElement>((res, rej) => setTimeout(() => loadImage(src).then(res, rej), RETRY_MS)));
  const p = attempt().then((img) => {
    let out = '';
    try { out = draw(img); } catch { /* a tainted canvas: no cross-origin read */ }
    cache.set(src, out);
    return out;
  }).catch(() => { cache.set(src, ''); return ''; }).finally(() => pending.delete(src));
  pending.set(src, p);
  return p;
}

export function toonCached(src: string): string | undefined { return cache.get(src) || undefined; }
// what replaces a portrait whose photo could not be read (portrait.ts registers the initials tile)
let fallback: ((img: HTMLImageElement) => void) | null = null;
export function onToonFail(fn: (img: HTMLImageElement) => void): void { fallback = fn; }

/** every portrait image waiting for its cartoon: fill them in as the cartoons arrive */
export function upgradePortraits(root: ParentNode = document): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img.portrait-photo[data-photo]')) {
    const src = img.dataset.photo!;
    const done = cache.get(src);
    if (done) { img.src = done; img.dataset.toon = 'done'; continue; }
    if (done === '') { fallback?.(img); continue; }
    if (img.dataset.toon === 'wait') continue;
    img.dataset.toon = 'wait';
    void toonify(src).then((url) => { if (img.dataset.photo !== src) return; if (url) { img.src = url; img.dataset.toon = 'done'; } else fallback?.(img); });
  }
}

// portraits are inserted with innerHTML all over the OS: one observer upgrades whatever appears
let observing = false;
export function watchPortraits(): void {
  if (observing || typeof MutationObserver === 'undefined') return;
  observing = true;
  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n instanceof Element) {
      if (n.matches('img.portrait-photo[data-photo]') || n.querySelector('img.portrait-photo[data-photo]')) upgradePortraits(n.parentNode ?? n);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  upgradePortraits();
}

/** draw the cartoons for a list of photos ahead of time, one after another, so the first ring has its face ready */
export function prewarm(srcs: string[]): void {
  const todo = srcs.filter((s) => s && !cache.has(s));
  let i = 0;
  const next = (): void => {
    if (i >= todo.length) return;
    const s = todo[i++];
    void toonify(s).then(() => { upgradePortraits(); setTimeout(next, 120); });
  };
  next();
}


// ---- the drawing ----

interface Box { cx: number; cy: number; side: number }   // a square around the face, in source pixels

/** where the face is: the spread of skin-coloured pixels (a crowd or a hand widens it a little, which only
 *  loosens the crop); null when the picture has hardly any skin in it */
function findFace(img: HTMLImageElement): Box | null {
  const k = 320 / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, r = d[o], gg = d[o + 1], b = d[o + 2];
    // skin in RGB and in YCbCr, the usual rules
    if (r <= 95 || gg <= 40 || b <= 20 || r <= gg || r <= b || Math.abs(r - gg) <= 15 || Math.max(r, gg, b) - Math.min(r, gg, b) <= 15) continue;
    const cb = 128 - 0.1687 * r - 0.3313 * gg + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * gg - 0.0813 * b;
    if (cb < 77 || cb > 127 || cr < 133 || cr > 173) continue;
    xs.push(x); ys.push(y);
  }
  if (xs.length < w * h * 0.006) return null;
  // skin on a coarse grid; a face is a dense skin blob with little skin around it (hair, collar, background),
  // more likely large, high and central than a hand is: every square window is scored on those terms
  const G = 24, cw = w / G, ch = h / G, cell = cw * ch;
  const dens = new Float32Array(G * G);
  for (let i = 0; i < xs.length; i++) dens[Math.min(G - 1, Math.floor(ys[i] / ch)) * G + Math.min(G - 1, Math.floor(xs[i] / cw))] += 1 / cell;
  const W = G + 1, sat = new Float32Array(W * W);
  for (let y = 1; y <= G; y++) for (let x = 1; x <= G; x++) sat[y * W + x] = dens[(y - 1) * G + x - 1] + sat[(y - 1) * W + x] + sat[y * W + x - 1] - sat[(y - 1) * W + x - 1];
  const box = (x0: number, y0: number, x1: number, y1: number): number => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(G, x1); y1 = Math.min(G, y1); return x1 <= x0 || y1 <= y0 ? 0 : sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]; };
  let best = 0, bx = 0, by = 0, bs = 0;
  for (const s of [4, 5, 6, 7, 8, 10, 12, 14]) for (let gy = 0; gy + s <= G; gy++) for (let gx = 0; gx + s <= G; gx++) {
    const inner = box(gx, gy, gx + s, gy + s) / (s * s);
    if (inner < 0.3) continue;
    const outerArea = Math.min(G, gx + s + 2) - Math.max(0, gx - 2); const outerH = Math.min(G, gy + s + 2) - Math.max(0, gy - 2);
    const ring = (box(gx - 2, gy - 2, gx + s + 2, gy + s + 2) - inner * s * s) / Math.max(1, outerArea * outerH - s * s);
    const cxg = gx + s / 2, cyg = gy + s / 2;
    const score = inner * (1.1 - ring) * Math.sqrt(s) * (1 - 0.45 * cyg / G) * (1 - 0.5 * Math.abs(cxg - G / 2) / (G / 2));
    if (score > best) { best = score; bx = gx; by = gy; bs = s; }
  }
  if (!bs) return null;
  const fw = bs * cw, fh = bs * ch;
  // the skin blob fills about 45% of the square; the square never shrinks below a third of the picture's short side
  const side = Math.max(Math.max(fw, fh) * 2.2, Math.min(w, h) * 0.34);
  return { cx: (bx + bs / 2) * cw / k, cy: (by + bs / 2) * ch / k, side: side / k };
}

/** the square to cut: around the face when one is found, else the top of a tall picture / the middle of a wide one */
function cropBox(img: HTMLImageElement): { sx: number; sy: number; s: number } {
  const W = img.naturalWidth, H = img.naturalHeight, short = Math.min(W, H);
  const f = findFace(img);
  if (!f) {
    const s = short * 0.9;
    return { sx: (W - s) / 2, sy: H > W ? Math.min((H - s) / 2, s * 0.06) : (H - s) / 2, s };
  }
  const s = Math.min(short, f.side);
  // the eyes sit a little above the middle: the face centre lands at 44% of the square
  const sx = Math.max(0, Math.min(W - s, f.cx - s / 2));
  const sy = Math.max(0, Math.min(H - s, f.cy - s * 0.44));
  return { sx, sy, s };
}

/** painted patches: each pixel takes the mean colour of the least varied quadrant around it (Kuwahara) */
function kuwahara(src: Uint8ClampedArray, n: number, r: number): Float32Array {
  const W = n + 1;
  // summed-area tables for r, g, b, luminance and luminance squared
  const S = [0, 1, 2, 3, 4].map(() => new Float64Array(W * W));
  for (let y = 1; y <= n; y++) for (let x = 1; x <= n; x++) {
    const o = ((y - 1) * n + (x - 1)) * 4, rr = src[o], gg = src[o + 1], bb = src[o + 2];
    const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    const v = [rr, gg, bb, l, l * l];
    for (let t = 0; t < 5; t++) S[t][y * W + x] = v[t] + S[t][(y - 1) * W + x] + S[t][y * W + x - 1] - S[t][(y - 1) * W + x - 1];
  }
  const sum = (t: number, x0: number, y0: number, x1: number, y1: number): number => S[t][y1 * W + x1] - S[t][y0 * W + x1] - S[t][y1 * W + x0] + S[t][y0 * W + x0];
  const out = new Float32Array(n * n * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let best = Infinity, br = 0, bg = 0, bb = 0;
    // the four quadrants, clamped to the picture (x0,y0 inclusive; x1,y1 exclusive, in table coordinates)
    const qs = [[x - r, y - r, x + 1, y + 1], [x, y - r, x + r + 1, y + 1], [x - r, y, x + 1, y + r + 1], [x, y, x + r + 1, y + r + 1]];
    for (const [qx0, qy0, qx1, qy1] of qs) {
      const x0 = Math.max(0, qx0), y0 = Math.max(0, qy0), x1 = Math.min(n, qx1), y1 = Math.min(n, qy1);
      const cnt = (x1 - x0) * (y1 - y0);
      if (cnt <= 0) continue;
      const ml = sum(3, x0, y0, x1, y1) / cnt;
      const vr = sum(4, x0, y0, x1, y1) / cnt - ml * ml;
      if (vr < best) { best = vr; br = sum(0, x0, y0, x1, y1) / cnt; bg = sum(1, x0, y0, x1, y1) / cnt; bb = sum(2, x0, y0, x1, y1) / cnt; }
    }
    const o = (y * n + x) * 3; out[o] = br; out[o + 1] = bg; out[o + 2] = bb;
  }
  return out;
}

/** a small palette for the picture: farthest-point seeds, then a few rounds of k-means (deterministic) */
function palette(px: Float32Array, n: number, k: number): number[][] {
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const sample: number[][] = [];
  for (let i = 0; i < 2048; i++) { const p = Math.floor(rnd() * n) * 3; sample.push([px[p], px[p + 1], px[p + 2]]); }
  const dist = (a: number[], b: number[]): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cents: number[][] = [sample[0].slice()];
  while (cents.length < k) {
    let far = sample[0], fd = -1;
    for (const s of sample) { let d = Infinity; for (const c of cents) d = Math.min(d, dist(s, c)); if (d > fd) { fd = d; far = s; } }
    cents.push(far.slice());
  }
  for (let it = 0; it < 8; it++) {
    const acc = cents.map(() => [0, 0, 0, 0]);
    for (const s of sample) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < cents.length; i++) { const d = dist(s, cents[i]); if (d < bd) { bd = d; bi = i; } }
      acc[bi][0] += s[0]; acc[bi][1] += s[1]; acc[bi][2] += s[2]; acc[bi][3]++;
    }
    for (let i = 0; i < cents.length; i++) if (acc[i][3]) cents[i] = [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]];
  }
  return cents;
}

const lumOf = (c: number[]): number => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
function hsl(h: number, s: number, l: number): number[] {
  const f = (k: number): number => { const a = s * Math.min(l, 1 - l); const t = (k + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))); };
  return [f(0), f(8), f(4)];
}
const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function draw(img: HTMLImageElement): string {
  const n = SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const { sx, sy, s } = cropBox(img);
  // a little louder than life, so the patches come out bright
  g.filter = 'saturate(1.35) contrast(1.08)';
  g.drawImage(img, sx, sy, s, s, 0, 0, n, n);
  g.filter = 'none';
  const raw = g.getImageData(0, 0, n, n).data;
  const painted = kuwahara(raw, n, KUWAHARA);
  const pal = palette(painted, n * n, COLOURS);
  // every pixel takes its nearest palette colour
  const idx = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const o = i * 3; let bi = 0, bd = Infinity;
    for (let p = 0; p < pal.length; p++) { const d = (painted[o] - pal[p][0]) ** 2 + (painted[o + 1] - pal[p][1]) ** 2 + (painted[o + 2] - pal[p][2]) ** 2; if (d < bd) { bd = d; bi = p; } }
    idx[i] = bi;
  }
  // speckles go: twice, every pixel takes the colour most of its 3×3 neighbours wear
  for (let pass = 0; pass < 2; pass++) {
    const prev = idx.slice();
    const votes = new Uint8Array(pal.length);
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
      votes.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) votes[prev[(y + dy) * n + x + dx]]++;
      let bi = prev[y * n + x];
      for (let p = 0; p < pal.length; p++) if (votes[p] > votes[bi] || (votes[p] === votes[bi] && p === prev[y * n + x])) bi = p;
      idx[y * n + x] = bi;
    }
  }
  // the caller's own backdrop: a deep colour from the photo's address, with comic dots
  let hsh = 7; for (let i = 0; i < img.src.length; i++) hsh = (hsh * 31 + img.src.charCodeAt(i)) >>> 0;
  const hue = hsh % 360;
  const back = hsl(hue, 0.55, 0.3), dot = hsl(hue, 0.6, 0.38), ring = hsl(hue, 0.7, 0.72);
  // the bust sits inside an egg that opens downward, so the shoulders stay and the background goes
  const cx = n / 2, cy = n * 0.5, rx = n * 0.46, ry = n * 0.62;
  const out = g.createImageData(n, n);
  const d = out.data;
  const differs = (a: number, b: number): boolean => a !== b && Math.abs(lumOf(pal[a]) - lumOf(pal[b])) > 0.14;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, o = i * 4;
    const col = pal[idx[i]];
    let r = col[0], gg = col[1], b = col[2];
    // ink along the borders between colours that differ enough in tone; two pixels wide
    let ink = false;
    if (x + 1 < n && differs(idx[i], idx[i + 1])) ink = true;
    else if (y + 1 < n && differs(idx[i], idx[i + n])) ink = true;
    else if (x > 0 && differs(idx[i], idx[i - 1])) ink = true;
    else if (y > 0 && differs(idx[i], idx[i - n])) ink = true;
    if (ink) { r *= 0.18; gg *= 0.18; b *= 0.2; }
    // outside the egg: the flat backdrop with its dots and a light rim
    const dd = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const t = smooth(0.9, 1.0, dd);
    if (t > 0) {
      const dots = ((x % 8 < 3) && (y % 8 < 3)) ? dot : back;
      r = r * (1 - t) + dots[0] * t; gg = gg * (1 - t) + dots[1] * t; b = b * (1 - t) + dots[2] * t;
      if (dd > 0.985 && dd < 1.03) { r = ring[0]; gg = ring[1]; b = ring[2]; }
    }
    d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  g.strokeStyle = 'rgba(8,10,16,0.9)'; g.lineWidth = 6; g.strokeRect(0, 0, n, n);
  return c.toDataURL('image/jpeg', 0.88);
}
