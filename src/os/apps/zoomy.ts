// Zoomy: the video call. The caller's portrait fills the stage and pulses while they speak, you are in the
// little tile from the webcam, and Share screen shows them whatever is open on your desktop, which they judge.
import { bus, settings, state } from '../../game/state';
import { currentCall, hangUp, nudge } from '../../game/calls';
import type { Caller } from '../../game/brain/types';
import { sfx } from '../../game/sound';
import { icon } from '../icons';
import { portraitHTML } from '../portrait';
import { registerApp } from '../registry';
import { allWindows, openWindow } from '../windows';
import { attachFloorCam, officeAvailable } from '../../world/office';
import { toast } from '../../ui/toast';

let stage: HTMLElement | null = null;
let name: HTMLElement | null = null;
let detach: (() => void) | null = null;
let lastShare = 0;

function draw(): void {
  if (!stage || !name) return;
  const c = currentCall();
  if (!c || c.status !== 'live') { stage.innerHTML = '<div class="zoomy__empty"><b>Nobody in the meeting</b><span>Callers join on their own when you answer the Phone.</span></div>'; stage.dataset.live = 'false'; name.textContent = 'Waiting room'; return; }
  const m = c.ctx.mood;
  stage.innerHTML = portraitHTML(c.caller.id, c.caller.portrait, c.caller.name, m < 30 ? 'angry' : m >= 70 ? 'happy' : 'calm', 260);
  stage.dataset.live = 'true';
  name.textContent = c.caller.name;
}

registerApp({ id: 'zoomy', name: 'Zoomy', color: '#2d8cff', glyph: 'zoomy', kind: 'core', open: () => {
  openWindow({ id: 'zoomy', title: 'Zoomy', glyph: icon('zoomy'), color: '#2d8cff', w: 640, h: 480, onClose: () => { detach?.(); detach = null; stage = null; name = null; } }, (body) => {
    body.innerHTML = `<div class="zoomy"><div class="zoomy__stage" data-live="false"></div><div class="zoomy__self"><div class="zoomy__selfcam"></div><span>${settings.playerName || 'You'}</span></div>
      <div class="zoomy__name"></div>
      <div class="zoomy__bar"><button type="button" class="zoomy__btn" data-mute aria-pressed="${!settings.voiceOut}">${icon('speaker')}<span>${settings.voiceOut ? 'Mute' : 'Unmute'}</span></button><button type="button" class="zoomy__btn" data-share>${icon('max')}<span>Share screen</span></button><button type="button" class="zoomy__btn zoomy__btn--leave" data-leave>${icon('hangup')}<span>Leave</span></button></div></div>`;
    stage = body.querySelector<HTMLElement>('.zoomy__stage'); name = body.querySelector<HTMLElement>('.zoomy__name');
    const selfcam = body.querySelector<HTMLElement>('.zoomy__selfcam')!;
    if (officeAvailable()) detach = attachFloorCam(selfcam, 'self'); else selfcam.textContent = '🙂';
    const mute = body.querySelector<HTMLButtonElement>('[data-mute]')!;
    mute.addEventListener('click', () => { settings.voiceOut = !settings.voiceOut; mute.setAttribute('aria-pressed', String(!settings.voiceOut)); mute.querySelector('span')!.textContent = settings.voiceOut ? 'Mute' : 'Unmute'; bus.emit('settings'); sfx.click(); });
    body.querySelector('[data-leave]')!.addEventListener('click', () => { hangUp('you'); draw(); });
    // sharing: the caller sees your open windows; fun apps cost you, the Script earns a little trust
    body.querySelector('[data-share]')!.addEventListener('click', () => {
      const c = currentCall();
      if (!c || c.status !== 'live') { toast('Nobody is in the meeting to share with.', 'info'); return; }
      if (Date.now() - lastShare < 8000) { toast('They are still looking at the last one.', 'info'); return; }
      lastShare = Date.now();
      const open = allWindows().filter((w) => !w.minimised && w.opts.id !== 'zoomy').map((w) => w.opts.id);
      const fun = open.find((id) => ['casino', 'clicker', 'surf', 'paint', 'radio'].includes(id));
      const script = open.includes('playbook');
      sfx.click();
      const overlay = document.createElement('div'); overlay.className = 'zoomy__share'; overlay.textContent = `Sharing: ${open.length ? open.join(', ') : 'an empty desktop'}`; body.querySelector('.zoomy')!.appendChild(overlay); setTimeout(() => overlay.remove(), 3000);
      if (fun) nudge(-9, 12, fun === 'casino' ? 'Is that... a casino? On your screen? While we talk about my money?' : fun === 'clicker' ? 'Are you clicking a dumpling? Right now? With me on the line?' : 'What is that on your screen? That is not my file.');
      else if (script) nudge(4, -6, 'Oh, you have it all written down. That is reassuring, somehow.');
      else nudge(1, -2, 'A tidy desktop. Fine. Go on.');
    });
    draw();
  });
} });
const caller = (c: Caller | null) => c;
bus.on('call:answered', () => draw());
bus.on('call:ended', () => draw());
bus.on('call:mood', () => draw());
bus.on<{ ms: number }>('call:speaking', ({ ms }) => { if (!stage) return; stage.classList.add('is-talking'); setTimeout(() => stage?.classList.remove('is-talking'), ms); });
void caller; void state;
