// Camera: you, from the little webcam on your monitor — your character blinks, scratches, and turns
// its head wherever your mouse goes. A toggle shows your real webcam instead. Snapshots go to the review.
import { addClip, clips } from '../../game/clips';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';
import { sfx } from '../../game/sound';
import { attachFloorCam, officeAvailable, snapshotSelf } from '../../world/office';

let stream: MediaStream | null = null;
let liveVideo: HTMLVideoElement | null = null;
/** a frame from your real webcam when the Camera app is showing it, else null (the review's automatic snaps) */
export function cameraFrame(): string | null {
  if (!stream || !liveVideo || liveVideo.hidden || liveVideo.readyState < 2) return null;
  try { const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d')!.drawImage(liveVideo, 0, 0, 320, 240); return c.toDataURL('image/jpeg', 0.7); } catch { return null; }
}

registerApp({ id: 'camera', name: 'Camera', color: '#2a2a2e', glyph: 'floorcam', kind: 'core', open: () => {
  let detach: (() => void) | null = null;
  openWindow({ id: 'camera', title: 'Camera', glyph: icon('floorcam'), color: '#2a2a2e', w: 480, h: 420, onClose: () => { detach?.(); stream?.getTracks().forEach((t) => t.stop()); stream = null; } }, (body) => {
    // the original's Camera is the picture and a "▲ Show" bar; the controls live under that bar
    body.innerHTML = `<div class="camera"><div class="camera__view"><div class="camera__self"></div><video playsinline muted autoplay hidden></video><div class="camera__off" hidden>Camera is off.</div><div class="floorcam__tag">● LIVE · YOU</div></div>
      <button type="button" class="camera__show" aria-expanded="false">▲ Show</button>
      <div class="row camera__drawer" hidden><button class="btn btn--money" type="button" data-snap>Snapshot</button><button class="btn btn--ghost" type="button" data-real style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Use my real webcam</button><span class="muted camera__count"></span></div></div>`;
    const show = body.querySelector<HTMLButtonElement>('.camera__show')!, drawer = body.querySelector<HTMLElement>('.camera__drawer')!;
    show.addEventListener('click', () => { const open = drawer.hidden; drawer.hidden = !open; show.setAttribute('aria-expanded', String(open)); show.textContent = open ? '▼ Hide' : '▲ Show'; sfx.click(); });
    const self = body.querySelector<HTMLElement>('.camera__self')!, video = body.querySelector<HTMLVideoElement>('video')!, off = body.querySelector<HTMLElement>('.camera__off')!;
    liveVideo = video;
    const snap = body.querySelector<HTMLButtonElement>('[data-snap]')!, real = body.querySelector<HTMLButtonElement>('[data-real]')!, count = body.querySelector<HTMLElement>('.camera__count')!;
    const update = () => { count.textContent = `${clips.filter((c) => c.kind === 'snapshot').length} snapshot(s) this shift`; };
    let mode: 'self' | 'real' = 'self';
    const showSelf = () => {
      mode = 'self';
      stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; video.hidden = true; off.hidden = true;
      if (officeAvailable()) { self.hidden = false; detach = attachFloorCam(self, 'self'); } else { off.hidden = false; off.textContent = 'No 3-D on this device. Try the real webcam.'; }
      real.textContent = 'Use my real webcam';
    };
    showSelf();
    real.addEventListener('click', async () => {
      if (mode === 'real') { showSelf(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        detach?.(); detach = null; self.hidden = true;
        video.srcObject = stream; video.hidden = false; mode = 'real'; real.textContent = 'Back to my character';
      } catch { toast('No camera, or permission refused. Your character will stand in.', 'danger'); }
    });
    snap.addEventListener('click', () => {
      let url: string | null = null;
      if (mode === 'real') { const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d')!.drawImage(video, 0, 0, 320, 240); url = c.toDataURL('image/jpeg', 0.7); }
      else url = snapshotSelf();
      if (!url) { toast('Nothing to snap yet.', 'danger'); return; }
      addClip({ kind: 'snapshot', dataUrl: url, caption: 'Snapshot during the shift' });
      sfx.click(); update(); toast('Snapshot saved for the review. Mr. Krull will see it.', 'info');
    });
    update();
  });
} });
