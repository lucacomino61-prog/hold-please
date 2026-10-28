// Mailbox: Mr. Krull's offers, the callers' sale confirmations, and bait with an attachment that is a virus.
import { bus, fmt, state } from '../../game/state';
import { startVirus } from '../../game/events';
import { SCAMS } from '../../game/scams';
import { sfx } from '../../game/sound';
import { icon } from '../icons';
import { openApp, registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';

interface Mail { id: number; from: string; subject: string; body: string; at: number; read: boolean; kind: 'krull' | 'bait' | 'sale' | 'note'; attach?: string; fromCall?: boolean; action?: { label: string; run: () => void } }
const mails: Mail[] = [];
let nextId = 1;
let lastSeed = 0;
let redraw: (() => void) | null = null;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function add(m: Omit<Mail, 'id' | 'at' | 'read'>, quiet = false): void {
  mails.unshift({ ...m, id: nextId++, at: Date.now(), read: false });
  if (mails.length > 30) mails.pop();
  if (!quiet) toast(`New mail from ${m.from}: ${m.subject}`, 'info', 3500);
  bus.emit('mail', unread());
  redraw?.();
}
export function unread(): number { return mails.filter((m) => !m.read).length; }

const KRULL = [
  { subject: 'RE: RE: RE: THE QUOTA', body: 'The quota is on the whiteboard. The whiteboard is on the wall. The wall is in the building. Find the building.' },
  { subject: 'A product you do not own yet', body: 'The market has things you have not bought. Buy them. Sell them. Repeat. This is the whole job.', action: 'market' },
  { subject: 'Your desk', body: 'I walked past your desk. There was a mug. The mug had a face. The face was smiling. Why.' },
  { subject: 'Mandatory fun', body: 'Friday is mandatory fun day. Fun has been cancelled. The mandatory part stays.' },
];
const BAIT = [
  { from: 'Sunrise IT (real)', subject: 'Your password expires in 1 (one) minute', body: 'Open the attachment to keep your password. Do not think about it.', attach: 'keep_password.exe' },
  { from: 'The Moon', subject: 'Invoice for my acres', body: 'You have been selling my acres. Attached: the invoice. Open it to dispute it.', attach: 'invoice_moon.pdf.exe' },
  { from: 'A Prince', subject: 'URGENT: a goose has your inheritance', body: 'The goose is willing to negotiate. Open the attachment for its terms.', attach: 'goose_terms.exe' },
  { from: 'Jackpotato', subject: 'You have won a free spin', body: 'Claim it by opening the attached spin.', attach: 'free_spin.exe' },
];
function seed(): void {
  if (state.phase !== 'shift' || Date.now() - lastSeed < 75_000) return;
  lastSeed = Date.now();
  if (Math.random() < 0.5) { const k = KRULL[Math.floor(Math.random() * KRULL.length)]; add({ from: 'Mr. Krull', subject: k.subject, body: k.body, kind: 'krull', action: k.action === 'market' ? { label: 'Open Swindlr Market', run: () => openApp('shop') } : undefined }); }
  else { const b = BAIT[Math.floor(Math.random() * BAIT.length)]; add({ from: b.from, subject: b.subject, body: b.body, kind: 'bait', attach: b.attach }); }
}
bus.on('tick', seed);
// a scambaiter on the phone mails their 'photo': opening it is the virus, and the call remembers it
const BAIT_FILES = ['crater_photo.jpg.exe', 'my_details.pdf.exe', 'receipt_scan.png.exe', 'proof.docx.exe'];
bus.on<{ from: string }>('baiter:mail', ({ from }) => {
  add({ from, subject: 'The photo I mentioned on the phone', body: 'Here it is, like I said. Open it, it explains everything. Do not ask questions, just open it.', kind: 'bait', attach: BAIT_FILES[Math.floor(Math.random() * BAIT_FILES.length)], fromCall: true });
});
bus.on<{ scam: string; amount: number }>('call:paid', ({ scam, amount }) => {
  const s = SCAMS.find((x) => x.id === scam);
  const who = state.calls[state.calls.length - 1]?.name ?? 'A customer';
  add({ from: who, subject: `Confirmation: ${s?.name ?? scam}`, body: `This is to confirm I bought ${s?.name ?? 'something'} for ${fmt(amount)}. I have questions already but they can wait. Thank you for your time and, I suppose, the ${(s?.name ?? 'thing').toLowerCase()}.`, kind: 'sale' }, true);
});
bus.on('day:new', () => { mails.length = 0; lastSeed = 0; });

registerApp({ id: 'mailbox', name: 'Mailbox', color: '#3a8fd9', glyph: 'mail', kind: 'core', open: () => {
  openWindow({ id: 'mailbox', title: 'Mailbox', glyph: icon('mail'), color: '#3a8fd9', w: 620, h: 460, onClose: () => { redraw = null; } }, (body) => {
    body.innerHTML = `<div class="mail"><div class="mail__list"></div><div class="mail__read"><div class="mail__empty">Pick a message.</div></div></div>`;
    const list = body.querySelector<HTMLElement>('.mail__list')!, read = body.querySelector<HTMLElement>('.mail__read')!;
    let openId = 0;
    const show = (m: Mail) => {
      m.read = true; openId = m.id; bus.emit('mail', unread());
      read.innerHTML = `<div class="mail__head"><b>${esc(m.subject)}</b><span>From ${esc(m.from)} · ${new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></div><p>${esc(m.body)}</p>${m.attach ? `<button type="button" class="mail__attach" data-attach>📎 ${esc(m.attach)}</button>` : ''}${m.action ? `<button type="button" class="btn" data-action>${esc(m.action.label)}</button>` : ''}`;
      read.querySelector('[data-attach]')?.addEventListener('click', () => { sfx.bad(); if (m.fromCall) bus.emit('baiter:opened', { from: m.from }); startVirus('mail'); });
      read.querySelector('[data-action]')?.addEventListener('click', () => m.action?.run());
      draw();
    };
    const draw = () => {
      list.innerHTML = mails.length ? mails.map((m) => `<button type="button" class="mail__item ${m.read ? '' : 'mail__item--unread'} ${m.id === openId ? 'mail__item--open' : ''}" data-id="${m.id}"><b>${esc(m.from)}</b><span>${esc(m.subject)}</span></button>`).join('') : '<div class="mail__empty">No mail yet. It arrives during the shift.</div>';
      list.querySelectorAll<HTMLButtonElement>('.mail__item').forEach((b) => b.addEventListener('click', () => { const m = mails.find((x) => x.id === Number(b.dataset.id)); if (m) show(m); }));
    };
    redraw = draw;
    draw();
  });
} });
