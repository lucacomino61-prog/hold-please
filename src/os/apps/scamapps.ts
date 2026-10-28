// One window per product. Each asks the player to type what the caller handed over.
import { armWithdraw, claim, currentCall, payOut, roundLost } from '../../game/calls';
import { SCAMS, type ScamDef } from '../../game/scams';
import { bus, settings, state } from '../../game/state';
import { sfx } from '../../game/sound';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow, type Win } from '../windows';
import { MONTHS, NOBEL_FIELDS, SKIES, STATIONS, starOf } from '../../game/values';
import { CONSTELLATIONS, SKY } from '../../game/sky';
import { bookCrate, clearCustoms, cratesToday, customsCrate, CRATE_PAYOUT } from '../../game/courier';
import { t } from '../../i18n';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const LABELS: Record<ScamDef['needs'], string> = {
  crater: 'the crater they want',
  sunserial: 'the serial number on the Sun',
  gravitypin: 'the PIN they chose',
  cumulus: 'how many clouds (a number)',
  vowelname: 'their name without vowels',
  hauntref: 'the haunting reference',
  petplan: 'pet name and plan',
  rune: 'the rune code on the ticket',
  bean: 'the amount they put in',
  fridgecode: 'the six digits inside the door',
  lavaweek: 'the week they want on the volcano',
  quietword: 'the quiet word they whispered',
  shadows: 'how many shadows (a number)',
  tuesday: 'the Tuesday to remove (the date)',
  echoword: 'the word that keeps echoing',
  dreamcode: 'the four-digit claim number from the dream',
  colours: 'three colours, in order',
  sky: 'the sky they want tomorrow',
  shadowlength: 'how long their shadow is (metres)',
  fallcount: 'how many times they fell this year',
  birthmonth: 'the month of their birthday',
  nobelfield: 'the field they won the prize in',
  depth: 'how deep they want to dive (metres)',
  echocount: 'how many echoes they want',
  station: 'the station they board at',
  toothcount: 'how many teeth the ghost has left',
  zonehours: 'how many hours ahead (or behind)',
  viewcode: 'the six-digit FarView code on their screen',
  starclue: 'what their star looks like, and where',
  crateword: 'the password they want on the crate',
};

function head(s: ScamDef): string {
  return `<div class="sapp__head"><span class="tile" style="--tile:${s.color}">${icon(s.glyph)}</span><div><h2>${s.name}</h2><p>${s.tagline}</p></div></div>
    <p class="sapp__blurb">${t(s.blurb)}</p>
    <div class="sapp__ask"><b>${t('Ask the caller for')}</b>${t(LABELS[s.needs])}</div>`;
}

function genericForm(s: ScamDef, body: HTMLElement, onOk: (typed: string, amount: number) => void): void {
  body.innerHTML = `<div class="sapp">${head(s)}
    <form class="sapp__form">
      <label>${t(LABELS[s.needs])}<input type="text" name="v" autocomplete="off" spellcheck="false" placeholder="${t('Type it exactly as they said it…')}" /></label>
      <button class="btn" type="submit">${t('Submit')}</button>
    </form>
    <div class="sapp__status" aria-live="polite"></div></div>`;
  const form = body.querySelector<HTMLFormElement>('form')!;
  const status = body.querySelector<HTMLElement>('.sapp__status')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = (form.elements.namedItem('v') as HTMLInputElement).value;
    const r = claim(s.needs, typed);
    status.className = 'sapp__status ' + (r.ok ? 'sapp__status--ok' : 'sapp__status--bad');
    if (!r.ok) { status.textContent = t(r.reason ?? 'No.'); body.closest('.win')?.classList.add('win--shake'); setTimeout(() => body.closest('.win')?.classList.remove('win--shake'), 350); return; }
    if (r.amount) status.textContent = t('Done. {x} to the team.', { x: '$' + r.amount });
    onOk(typed, r.amount ?? 0);
  });
}

function registerScam(s: ScamDef, render: (body: HTMLElement, win: Win) => void): void {
  registerApp({ id: 'scam-' + s.id, name: s.name, color: s.color, glyph: s.glyph, kind: 'scam', scam: s.id, open: () => {
    // the sky chart and the courier's two forms need more room than a one-field product
    const size = s.id === 'stars' ? { w: 600, h: 640 } : s.id === 'courier' ? { w: 460, h: 600 } : { w: 420, h: 520 };
    openWindow({ id: 'scam-' + s.id, title: s.name, glyph: icon(s.glyph), color: s.color, ...size }, render);
  } });
}

for (const s of SCAMS) {
  if (s.id === 'runes') registerScam(s, renderRunes);
  else if (s.id === 'beancoin') registerScam(s, renderBean);
  else if (s.id === 'fridge') registerScam(s, renderFridge);
  else if (s.id === 'clouds') registerScam(s, (body) => genericForm(s, body, (typed) => {
    const n = parseInt(typed, 10) || 0;
    body.querySelector('.sapp__status')!.textContent = `${n} clouds stored. $${n * 60} to the team.`;
  }));
  else if (s.id === 'shadow') registerScam(s, (body) => genericForm(s, body, (typed) => {
    const n = parseInt(typed, 10) || 0;
    body.querySelector('.sapp__status')!.textContent = `${n} shadows in storage. $${n * 45} to the team.`;
  }));
  else if (s.id === 'echo') registerScam(s, renderEcho);
  else if (s.id === 'dream') registerScam(s, renderDream);
  else if (s.id === 'rainbow') registerScam(s, renderRainbow);
  else if (s.id === 'weather') registerScam(s, renderWeather);
  else if (s.id === 'shadowtax') registerScam(s, renderShadowTax);
  else if (s.id === 'gravityrefund') registerScam(s, renderFalls);
  else if (s.id === 'birthday') registerScam(s, renderBirthday);
  else if (s.id === 'nobel') registerScam(s, renderNobel);
  else if (s.id === 'cavedive') registerScam(s, renderDive);
  else if (s.id === 'echolease') registerScam(s, renderEchoLease);
  else if (s.id === 'subway') registerScam(s, renderSubway);
  else if (s.id === 'ghostdentist') registerScam(s, renderTeeth);
  else if (s.id === 'timezone') registerScam(s, renderZone);
  else if (s.id === 'remote') registerScam(s, renderRemote);
  else if (s.id === 'stars') registerScam(s, renderStars);
  else if (s.id === 'courier') registerScam(s, renderCourier);
  else registerScam(s, (body) => genericForm(s, body, () => { /* paid in claim() */ }));
}

// ---- the round-16 puzzles ----
const byId = (id: ScamDef['id']) => SCAMS.find((x) => x.id === id)!;
function fileBtn(label: string, extra = ''): string { return `<div class="cluster"><button class="btn btn--money" type="button" data-file>${label}</button>${extra}</div><div class="sapp__status" aria-live="polite"></div>`; }
function claimAndTell(body: HTMLElement, kind: ScamDef['needs'], typed: string, okText: string): boolean {
  const r = claim(kind, typed);
  statusOf(body, r.ok, r.ok ? `${okText} ${r.amount ? '$' + r.amount + ' to the team.' : ''}` : t(r.reason ?? 'No.'));
  return r.ok;
}
// Weather Subscription: click tomorrow's sky in the forecast strip
function renderWeather(body: HTMLElement): void {
  const s = byId('weather');
  const ART: Record<string, string> = { sunny: '☀️', drizzle: '🌦️', fog: '🌫️', hail: '🌨️', 'double rainbow': '🌈', aurora: '🌌', bees: '🐝', snow: '❄️' };
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Click the sky the caller wants tomorrow. One click, one sky; the forecast does not do mixtures.</p>
    <div class="skies">${SKIES.map((k) => `<button type="button" class="sky" data-sky="${k}" aria-pressed="false"><span>${ART[k]}</span><b>${k}</b></button>`).join('')}</div>${fileBtn('Book tomorrow')}</div>`;
  let picked = '';
  body.querySelectorAll<HTMLButtonElement>('.sky').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.sky!; body.querySelectorAll('.sky').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sfx.click(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'sky', picked, `Tomorrow: ${picked}. Delivered by six.`));
}
// Shadow Tax: drag the ruler to the shadow's length
function renderShadowTax(body: HTMLElement): void {
  const s = byId('shadowtax');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Set the tax ruler to the length of their afternoon shadow. Long shadows pay more; the ruler does not round.</p>
    <div class="ruler"><div class="ruler__shadow"></div><input type="range" min="1" max="10" step="1" value="1" aria-label="Shadow length in metres" /><div class="ruler__read tabular"><b>1</b> m</div></div>${fileBtn('Tax the shadow')}</div>`;
  const range = body.querySelector<HTMLInputElement>('input')!, read = body.querySelector<HTMLElement>('.ruler__read b')!, sh = body.querySelector<HTMLElement>('.ruler__shadow')!;
  const draw = () => { read.textContent = range.value; sh.style.width = `${8 + Number(range.value) * 9}%`; };
  range.addEventListener('input', () => { draw(); sfx.type(); });
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'shadowlength', range.value + ' metres', `${range.value} m of shadow, taxed.`));
  draw();
}
// Gravity Refund: count the falls on the claim counter
function renderFalls(body: HTMLElement): void {
  const s = byId('gravityrefund');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Click the counter once per fall. Gravity audits every claim; do not round up.</p>
    <div class="counter"><button type="button" class="counter__btn" data-d="-1" aria-label="One fewer">−</button><div class="counter__n tabular">0</div><button type="button" class="counter__btn" data-d="1" aria-label="One more">+</button></div>
    <div class="counter__falls" aria-hidden="true"></div>${fileBtn('Claim the refund')}</div>`;
  let n = 0;
  const num = body.querySelector<HTMLElement>('.counter__n')!, falls = body.querySelector<HTMLElement>('.counter__falls')!;
  const draw = () => { num.textContent = String(n); falls.textContent = '🙃'.repeat(Math.min(n, 12)); };
  body.querySelectorAll<HTMLButtonElement>('.counter__btn').forEach((b) => b.addEventListener('click', () => { n = Math.max(0, Math.min(20, n + Number(b.dataset.d))); sfx.click(); draw(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'fallcount', String(n), `${n} fall${n === 1 ? '' : 's'} refunded.`));
}
// Birthday Insurance: pin the month on the calendar
function renderBirthday(body: HTMLElement): void {
  const s = byId('birthday');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Pin the month of their birthday before the cancellation goes through.</p>
    <div class="months">${MONTHS.map((m) => `<button type="button" class="month" data-m="${m}" aria-pressed="false">${m.slice(0, 3)}</button>`).join('')}</div>${fileBtn('Insure the birthday')}</div>`;
  let picked = '';
  body.querySelectorAll<HTMLButtonElement>('.month').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.m!; body.querySelectorAll('.month').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sfx.click(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'birthmonth', picked, `${picked} is insured. Cake guaranteed.`));
}
// Nobel Prize Delivery: pick the field and engrave the medal
function renderNobel(body: HTMLElement): void {
  const s = byId('nobel');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Choose the field they won in, then engrave it. The medal is final; so is the spelling.</p>
    <div class="medal"><div class="medal__disc"><span class="medal__text">—</span></div></div>
    <div class="fields">${NOBEL_FIELDS.map((f) => `<button type="button" class="field" data-f="${f}" aria-pressed="false">${f}</button>`).join('')}</div>${fileBtn('Engrave and deliver')}</div>`;
  let picked = '';
  const text = body.querySelector<HTMLElement>('.medal__text')!;
  body.querySelectorAll<HTMLButtonElement>('.field').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.f!; text.textContent = picked.toUpperCase(); body.querySelectorAll('.field').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sfx.clink(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'nobelfield', picked, `Nobel Prize in ${picked}, engraved and posted.`));
}
// Cave Diving Lessons: hold the button to descend, let go at the right depth
function renderDive(body: HTMLElement): void {
  const s = byId('cavedive');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Hold Dive to go down, let go at exactly the depth they asked for. A metre either way and the lesson is refunded.</p>
    <div class="dive"><div class="dive__water"><div class="dive__diver">🤿</div></div><div class="dive__read tabular"><b>0</b> m</div><button type="button" class="btn btn--money dive__btn">Hold to dive</button></div>${fileBtn('Log the dive')}</div>`;
  let depth = 0, iv: ReturnType<typeof setInterval> | undefined;
  const read = body.querySelector<HTMLElement>('.dive__read b')!, diver = body.querySelector<HTMLElement>('.dive__diver')!, btn = body.querySelector<HTMLButtonElement>('.dive__btn')!;
  const draw = () => { read.textContent = depth.toFixed(0); diver.style.top = `${4 + Math.min(20, depth) * 4.4}%`; };
  const start = () => { clearInterval(iv); depth = 0; iv = setInterval(() => { depth = Math.min(20, depth + 0.5); draw(); if (Math.round(depth * 2) % 2 === 0) sfx.type(); }, 150); };
  const stop = () => { clearInterval(iv); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); start(); });
  btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
  btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  body.querySelector('[data-file]')!.addEventListener('click', () => { stop(); claimAndTell(body, 'depth', `${Math.round(depth)} metres`, `${Math.round(depth)} m. Lesson complete, still dry.`); });
  draw();
}
// Echo Lease: set the chamber to the number of echoes and hear the word come back
function renderEchoLease(body: HTMLElement): void {
  const s = byId('echolease');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Set the chamber to how many echoes they want, then test it with a word.</p>
    <div class="chamber"><div class="counter"><button type="button" class="counter__btn" data-d="-1" aria-label="One fewer">−</button><div class="counter__n tabular">1</div><button type="button" class="counter__btn" data-d="1" aria-label="One more">+</button></div>
    <div class="row"><input type="text" class="chamber__word" placeholder="hello" maxlength="16" aria-label="A word to test the echo" /><button type="button" class="btn" data-shout>Shout</button></div><div class="chamber__out" aria-live="polite"></div></div>${fileBtn('Lease the echoes')}</div>`;
  let n = 1;
  const num = body.querySelector<HTMLElement>('.counter__n')!, out = body.querySelector<HTMLElement>('.chamber__out')!, word = body.querySelector<HTMLInputElement>('.chamber__word')!;
  body.querySelectorAll<HTMLButtonElement>('.counter__btn').forEach((b) => b.addEventListener('click', () => { n = Math.max(1, Math.min(8, n + Number(b.dataset.d))); num.textContent = String(n); sfx.click(); }));
  body.querySelector('[data-shout]')!.addEventListener('click', () => { const w = (word.value.trim() || 'hello'); out.innerHTML = ''; for (let i = 0; i <= n; i++) setTimeout(() => { out.insertAdjacentHTML('beforeend', `<span style="opacity:${1 - i / (n + 1.5)}">${esc(w)}${i ? '…' : '!'}</span> `); }, i * 260); });
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'echocount', String(n), `${n} echoes leased. Hallway. Hallway.`));
}
// Subway to the Moon: buy the ticket from the station on the line
function renderSubway(body: HTMLElement): void {
  const s = byId('subway');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Click the station they board at. The line goes one way: up.</p>
    <div class="tube"><div class="tube__line"></div>${STATIONS.map((st, i) => `<button type="button" class="stop" style="--i:${i}" data-st="${st}" aria-pressed="false"><i></i><span>${st}</span></button>`).join('')}<div class="tube__moon">🌕</div></div>${fileBtn('Issue the ticket')}</div>`;
  let picked = '';
  body.querySelectorAll<HTMLButtonElement>('.stop').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.st!; body.querySelectorAll('.stop').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sfx.click(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'station', picked, `Ticket from ${picked} to the Moon. Mind the gap; it is large.`));
}
// Dentist for Ghosts: pull teeth until the right number is left
function renderTeeth(body: HTMLElement): void {
  const s = byId('ghostdentist');
  const TOTAL = 12;
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">The ghost opens wide. Click a tooth to pull it; stop when the number they said is left. Pulled teeth do not go back.</p>
    <div class="mouth"><div class="mouth__row">${Array.from({ length: TOTAL }, (_, i) => `<button type="button" class="tooth" data-i="${i}" aria-label="Pull tooth ${i + 1}"></button>`).join('')}</div><div class="mouth__read tabular"><b>${TOTAL}</b> teeth left</div></div>${fileBtn('Send the bill')}</div>`;
  let left = TOTAL;
  const read = body.querySelector<HTMLElement>('.mouth__read b')!;
  body.querySelectorAll<HTMLButtonElement>('.tooth').forEach((b) => b.addEventListener('click', () => { if (b.classList.contains('tooth--gone')) return; b.classList.add('tooth--gone'); left--; read.textContent = String(left); sfx.clink(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'toothcount', String(left), `${left} teeth left, all of them clean. Bill sent to the afterlife.`));
}
// Time Zone Transfer: turn the clock to the offset
function renderZone(body: HTMLElement): void {
  const s = byId('timezone');
  body.innerHTML = `<div class="sapp">${head(s)}<p class="sapp__blurb">Turn the transfer clock to how many hours ahead (or behind) they want to live. Furniture moves with the house.</p>
    <div class="zone"><div class="zone__clock"><div class="zone__hand"></div></div><div class="counter"><button type="button" class="counter__btn" data-d="-1" aria-label="One hour back">−</button><div class="counter__n tabular">+0</div><button type="button" class="counter__btn" data-d="1" aria-label="One hour ahead">+</button></div></div>${fileBtn('Transfer the house')}</div>`;
  let h = 0;
  const num = body.querySelector<HTMLElement>('.counter__n')!, hand = body.querySelector<HTMLElement>('.zone__hand')!;
  const draw = () => { num.textContent = (h >= 0 ? '+' : '') + h; hand.style.transform = `rotate(${h * 30}deg)`; };
  body.querySelectorAll<HTMLButtonElement>('.counter__btn').forEach((b) => b.addEventListener('click', () => { h = Math.max(-12, Math.min(12, h + Number(b.dataset.d))); sfx.click(); draw(); }));
  body.querySelector('[data-file]')!.addEventListener('click', () => claimAndTell(body, 'zonehours', `${h >= 0 ? '+' : ''}${h} hours`, `House moved ${h >= 0 ? '+' : ''}${h} hours. The cat is confused.`));
  draw();
}
// FarView Remote Support: the original's AnyViewer, code in, Connect, the caller's desktop appears
function renderRemote(body: HTMLElement): void {
  const s = byId('remote');
  body.innerHTML = `<div class="sapp sapp--remote">${head(s)}
    <div class="remote"><div class="remote__main"><h3>Enter caller's connection code</h3><p>Enter the one-time code exactly as the caller reads it.</p>
      <label class="remote__label">Caller connection code<input type="text" class="remote__code" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="000-000" maxlength="7" /></label>
      <button type="button" class="remote__connect" data-file>Connect</button><div class="sapp__status" aria-live="polite"></div>
      <div class="remote__screen" hidden><div class="remote__bar">● Connected — the caller's desktop</div><div class="remote__desk"><span>🗂️ Recipes</span><span>🐟 fish.jpg</span><span>📁 Taxes 1998</span><span>💾 definitely_not_a_virus.exe</span><span>🌙 moon_deed.pdf</span></div><button type="button" class="btn btn--money" data-clean>Run the clean</button></div></div>
      <aside class="remote__side"><b>Remote support</b><h4>Connect safely</h4><ol><li>Ask the caller for their one-time FarView code.</li><li>Enter the code exactly as they read it.</li><li>Keep the call open while the desktop connects.</li></ol></aside></div></div>`;
  const code = body.querySelector<HTMLInputElement>('.remote__code')!, screen = body.querySelector<HTMLElement>('.remote__screen')!;
  code.addEventListener('input', () => { const d = code.value.replace(/\D/g, '').slice(0, 6); code.value = d.length > 3 ? d.slice(0, 3) + '-' + d.slice(3) : d; });
  body.querySelector('[data-file]')!.addEventListener('click', () => {
    const r = claim('viewcode', code.value);
    statusOf(body, r.ok, r.ok ? `Connected. ${r.amount ? '$' + r.amount + ' for the clean.' : ''}` : t(r.reason ?? 'No.'));
    if (r.ok) { screen.hidden = false; (body.querySelector('[data-file]') as HTMLButtonElement).disabled = true; }
  });
  body.querySelector('[data-clean]')!.addEventListener('click', () => { const d = body.querySelector<HTMLElement>('.remote__desk')!; d.innerHTML = '<span>✨ Clean.</span><span>🌙 moon_deed.pdf</span>'; sfx.cash(); });
}

// ---- Star Registry: find the caller's star on the chart; every reply they give buys one reading (the original's
// IP Geolocation, traced on a globe while the caller stays convinced, here on a cartoon sky) ----
const STAR_COL: Record<string, string> = { white: '#f4f6ff', blue: '#9cc4ff', orange: '#ffb36b', red: '#ff8a7a', yellow: '#ffe28a' };
const READ_R = [92, 54, 28];   // each reading's circle, smaller each time (px on the 560 × 320 chart)
function renderStars(body: HTMLElement): void {
  const s = byId('stars');
  body.innerHTML = `<div class="sapp sapp--stars">${head(s)}
    <canvas class="stars__sky" width="560" height="320" aria-label="Sky chart. Click where the caller's star is."></canvas>
    <div class="cluster"><button type="button" class="btn" data-reading>Take a reading (0/3)</button><button type="button" class="btn btn--money" data-file disabled>Register this star</button><span class="muted stars__hint" aria-live="polite"></span></div>
    <div class="sapp__status" aria-live="polite"></div></div>`;
  const cv = body.querySelector<HTMLCanvasElement>('canvas')!;
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const readBtn = body.querySelector<HTMLButtonElement>('[data-reading]')!;
  const regBtn = body.querySelector<HTMLButtonElement>('[data-file]')!;
  const hint = body.querySelector<HTMLElement>('.stars__hint')!;
  let readings: { x: number; y: number; r: number }[] = [];
  let lastReplies = -1, callKey = 0, reveal = false;
  let pin: { x: number; y: number } | null = null;
  const target = (): number | undefined => { const c = currentCall(); return c ? starOf.get(c.ctx.values) : undefined; };
  const replies = (): number => currentCall()?.ctx.lines.filter((l) => l.who !== 'you').length ?? 0;
  const draw = (): void => {
    const c = currentCall();
    const key = c?.record.startedAt ?? 0;
    if (key !== callKey) { callKey = key; readings = []; pin = null; lastReplies = -1; reveal = false; }
    g.fillStyle = '#0b1230'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(140,170,255,.07)'; g.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 40; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (const con of CONSTELLATIONS) {
      const pts = con.stars.map(([dx, dy]) => [(con.x + dx) * W, (con.y + dy) * H] as const);
      g.strokeStyle = 'rgba(170,190,255,.45)'; g.lineWidth = 1.2; g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.fillStyle = '#dfe6ff';
      for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(200,214,255,.85)'; g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(con.name.replace(/^the /, '').toUpperCase(), con.x * W, con.y * H + 0.13 * H);
    }
    for (const st of SKY) { g.fillStyle = STAR_COL[st.colour]; g.beginPath(); g.arc(st.x * W, st.y * H, st.size * 1.7, 0, Math.PI * 2); g.fill(); }
    readings.forEach((r, i) => { g.strokeStyle = `rgba(255,209,102,${0.4 + 0.25 * i})`; g.setLineDash([6, 4]); g.lineWidth = 1.6; g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke(); });
    g.setLineDash([]);
    const t = target();
    if (reveal && t !== undefined) { const st = SKY[t]; g.strokeStyle = '#3fd36f'; g.lineWidth = 2; g.beginPath(); g.arc(st.x * W, st.y * H, 9, 0, Math.PI * 2); g.stroke(); }
    if (pin) { g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.moveTo(pin.x - 7, pin.y); g.lineTo(pin.x + 7, pin.y); g.moveTo(pin.x, pin.y - 7); g.lineTo(pin.x, pin.y + 7); g.stroke(); }
    const given = !!c?.ctx.given.starclue;
    const done = !!c?.paid.has('stars');
    const n = replies();
    readBtn.disabled = !given || done || readings.length >= 3 || n <= lastReplies || c?.status !== 'live';
    readBtn.textContent = `Take a reading (${readings.length}/3)`;
    regBtn.disabled = !pin || !given || done;
    hint.textContent = !c ? 'No caller on the line.' : done ? '' : !given ? 'Ask the caller what their star looks like.' : readings.length >= 3 ? 'Three readings. Click the star, then Register.' : n <= lastReplies ? 'Keep them talking for the next reading.' : 'A reading is ready.';
  };
  readBtn.addEventListener('click', () => {
    const t = target();
    if (t === undefined || readBtn.disabled) return;
    const st = SKY[t];
    const r = READ_R[readings.length];
    const a = Math.random() * Math.PI * 2, off = Math.random() * r * 0.6;
    readings.push({ x: st.x * W + Math.cos(a) * off, y: st.y * H + Math.sin(a) * off, r });
    lastReplies = replies();
    sfx.click();
    draw();
  });
  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    pin = { x: ((e.clientX - rect.left) * W) / rect.width, y: ((e.clientY - rect.top) * H) / rect.height };
    draw();
  });
  regBtn.addEventListener('click', () => {
    const idx = target(), c = currentCall();
    if (idx === undefined || !c || !pin) return;
    const r = claim('starclue', c.ctx.given.starclue ?? '');
    if (!r.ok) { statusOf(body, false, t(r.reason ?? 'No.')); return; }
    const st = SKY[idx];
    const d = Math.hypot(pin.x - st.x * W, pin.y - st.y * H);
    const prize = d < 9 ? 800 : Math.max(0, Math.round((800 * (1 - d / 120)) / 10) * 10);
    if (prize > 0) payOut('stars', prize);
    statusOf(body, prize > 0, prize >= 800 ? 'Direct hit. The star is registered in their name. $800 to the team.' : prize > 0 ? `Close enough for the paperwork. $${prize} to the team.` : 'That is not their star. Nobody pays for the wrong star.');
    reveal = true;
    draw();
  });
  draw();
  // new replies unlock readings: redraw while the window is open
  const iv = setInterval(() => { if (!body.isConnected) { clearInterval(iv); return; } draw(); }, 600);
}

// ---- Penguin Courier: book the crate with the caller's password; clear it when Customs rings (the original's
// two-call Money Mule, here with penguins) ----
function renderCourier(body: HTMLElement): void {
  const s = byId('courier');
  body.innerHTML = `<div class="sapp sapp--courier">${head(s)}
    <form class="sapp__form" data-book><label>Password for the crate<input type="text" name="v" autocomplete="off" spellcheck="false" placeholder="${t('Type it exactly as they said it…')}" /></label><button class="btn" type="submit">Book the crate</button></form>
    <div class="courier__customs" hidden><h3>Port Fortune Customs is on the line</h3><p class="courier__crate"></p>
      <form class="sapp__form" data-clear><label>Password on the crate<input type="text" name="w" autocomplete="off" spellcheck="false" /></label><button class="btn btn--money" type="submit">Clear customs</button></form></div>
    <h3 class="courier__h">Today's crates</h3><ul class="courier__list"></ul>
    <div class="sapp__status" aria-live="polite"></div></div>`;
  const book = body.querySelector<HTMLFormElement>('[data-book]')!, clearF = body.querySelector<HTMLFormElement>('[data-clear]')!;
  const customs = body.querySelector<HTMLElement>('.courier__customs')!, list = body.querySelector<HTMLElement>('.courier__list')!, crateP = body.querySelector<HTMLElement>('.courier__crate')!;
  const WHERE: Record<string, string> = { shipped: 'on its way to the dock · Customs will call', 'at-customs': 'at Customs', cleared: `cleared · $${CRATE_PAYOUT}`, seized: 'seized' };
  const draw = (): void => {
    const at = customsCrate();
    customs.hidden = !at;
    book.hidden = !!at;
    if (at) crateP.textContent = `Crate #${at.id} for ${at.owner}. It is honking. Officer Brine wants the password.`;
    const all = cratesToday();
    list.innerHTML = all.length ? all.map((c) => `<li class="courier__item courier__item--${c.status}">Crate #${c.id} · ${esc(c.owner)} · ${WHERE[c.status]}</li>`).join('') : '<li class="muted">No crates today.</li>';
  };
  book.addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = (book.elements.namedItem('v') as HTMLInputElement).value;
    const c = currentCall();
    const r = claim('crateword', typed);
    if (!r.ok || !c) { statusOf(body, false, t(r.reason ?? 'No.')); return; }
    bookCrate(c.caller.name, c.ctx.given.crateword ?? typed);
    statusOf(body, true, 'Crate booked and shipped. Port Fortune Customs will call about it this shift. Keep this window handy.');
    draw();
  });
  clearF.addEventListener('submit', (e) => {
    e.preventDefault();
    const out = clearCustoms((clearF.elements.namedItem('w') as HTMLInputElement).value);
    statusOf(body, out.ok, out.text);
    draw();
  });
  draw();
  const iv = setInterval(() => { if (!body.isConnected) { clearInterval(iv); return; } draw(); }, 700);
}

function statusOf(body: HTMLElement, ok: boolean, text: string): void {
  const st = body.querySelector<HTMLElement>('.sapp__status')!;
  st.className = 'sapp__status ' + (ok ? 'sapp__status--ok' : 'sapp__status--bad');
  st.textContent = text;
  if (!ok) { sfx.bad(); body.closest('.win')?.classList.add('win--shake'); setTimeout(() => body.closest('.win')?.classList.remove('win--shake'), 350); }
}

// ---- Echo Removal: type the echoing word BACKWARDS, letter boxes filling as you go ----
function renderEcho(body: HTMLElement): void {
  const s = SCAMS.find((x) => x.id === 'echo')!;
  body.innerHTML = `<div class="sapp">${head(s)}
    <p class="sapp__blurb">The echo comes back the wrong way round. Type their word <b>backwards</b> to cancel it.</p>
    <form class="sapp__form echo"><div class="echo__boxes" aria-hidden="true"></div><label>Their word, backwards<input type="text" name="v" autocomplete="off" spellcheck="false" placeholder="e.g. noollab for balloon" /></label><button class="btn" type="submit">Cancel the echo</button></form>
    <div class="sapp__status" aria-live="polite"></div></div>`;
  const form = body.querySelector<HTMLFormElement>('form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const boxes = form.querySelector<HTMLElement>('.echo__boxes')!;
  const draw = () => { const word = currentCall()?.ctx.given.echoword ?? ''; const typed = input.value.toUpperCase(); boxes.innerHTML = [...(word || '?????')].map((_, i) => `<span class="echo__box ${typed[i] ? 'echo__box--on' : ''}">${typed[i] ?? ''}</span>`).join(''); };
  input.addEventListener('input', draw);
  draw();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = claim('echoword', input.value);
    statusOf(body, r.ok, r.ok ? `Echo cancelled. ${r.amount ? '$' + r.amount + ' to the team.' : ''}` : t(r.reason ?? 'No.'));
    if (r.ok) form.querySelector('button')!.disabled = true;
  });
}

// ---- Dream Insurance: dial the four digits in order before the pad dozes off ----
function renderDream(body: HTMLElement): void {
  const s = SCAMS.find((x) => x.id === 'dream')!;
  body.innerHTML = `<div class="sapp">${head(s)}
    <p class="sapp__blurb">Dial the claim number in order. The pad falls asleep after ten seconds; a wrong digit wakes it up angry.</p>
    <div class="dream"><div class="dream__display tabular">____</div><div class="dream__timer"><i></i></div>
    <div class="dream__pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button type="button" class="dream__key" data-n="${n}">${n}</button>`).join('')}<button type="button" class="dream__key dream__key--clear" data-clear>C</button></div>
    <button class="btn btn--money" type="button" data-file>File the claim</button></div>
    <div class="sapp__status" aria-live="polite"></div></div>`;
  const display = body.querySelector<HTMLElement>('.dream__display')!;
  const timer = body.querySelector<HTMLElement>('.dream__timer i')!;
  let typed = '';
  let deadline = 0, ticking: ReturnType<typeof setInterval> | undefined;
  const show = () => { display.textContent = (typed + '____').slice(0, 4); };
  const wake = () => { clearInterval(ticking); deadline = Date.now() + 10_000; ticking = setInterval(() => { const left = Math.max(0, deadline - Date.now()) / 10_000; timer.style.transform = `scaleX(${left})`; if (left <= 0) { clearInterval(ticking); typed = ''; show(); statusOf(body, false, 'The pad fell asleep. Start again.'); } }, 100); };
  body.querySelectorAll<HTMLButtonElement>('.dream__key').forEach((k) => k.addEventListener('click', () => {
    if (k.dataset.clear !== undefined) { typed = ''; show(); return; }
    if (!typed) wake();
    if (typed.length >= 4) return;
    const given = currentCall()?.ctx.given.dreamcode ?? '';
    const n = k.dataset.n!;
    if (given && given[typed.length] !== n) { typed = ''; show(); statusOf(body, false, 'Wrong digit. The pad woke up angry. From the top.'); clearInterval(ticking); return; }
    typed += n; sfx.click(); show();
  }));
  body.querySelector('[data-file]')!.addEventListener('click', () => {
    clearInterval(ticking);
    const r = claim('dreamcode', typed);
    statusOf(body, r.ok, r.ok ? `Claim filed. ${r.amount ? '$' + r.amount + ' to the team.' : ''} Sweet dreams.` : t(r.reason ?? 'No.'));
    typed = ''; show();   // the pad is ready for the next dream either way
  });
  show();
}

// ---- Rainbow Lease: click the three colours in the order they said ----
function renderRainbow(body: HTMLElement): void {
  const s = SCAMS.find((x) => x.id === 'rainbow')!;
  const COLS: Record<string, string> = { red: '#d94b4b', blue: '#4a78d9', green: '#3fa34d', yellow: '#e9c84a', purple: '#8e5ad6', orange: '#f08a24' };
  body.innerHTML = `<div class="sapp">${head(s)}
    <p class="sapp__blurb">Click the colours in the order the caller wants them, top to bottom.</p>
    <div class="rainbow"><div class="rainbow__arc"></div><div class="rainbow__tiles">${Object.entries(COLS).map(([n, c]) => `<button type="button" class="rainbow__tile" data-c="${n}" style="--c:${c}" aria-label="${n}"></button>`).join('')}</div>
    <div class="rainbow__picked">Picked: <b>—</b></div><div class="cluster"><button class="btn btn--money" type="button" data-lease>Lease it</button><button class="btn btn--ghost" type="button" data-reset style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Start over</button></div></div>
    <div class="sapp__status" aria-live="polite"></div></div>`;
  const picked: string[] = [];
  const arc = body.querySelector<HTMLElement>('.rainbow__arc')!;
  const pickedEl = body.querySelector<HTMLElement>('.rainbow__picked b')!;
  const draw = () => { pickedEl.textContent = picked.join(' ') || '—'; arc.style.background = picked.length ? `repeating-linear-gradient(to bottom, ${picked.map((c, i) => `${COLS[c]} ${i * 12}px ${(i + 1) * 12}px`).join(', ')})` : 'oklch(0 0 0 / .06)'; };
  body.querySelectorAll<HTMLButtonElement>('.rainbow__tile').forEach((t) => t.addEventListener('click', () => { if (picked.length >= 3 || picked.includes(t.dataset.c!)) return; picked.push(t.dataset.c!); sfx.click(); draw(); }));
  body.querySelector('[data-reset]')!.addEventListener('click', () => { picked.length = 0; draw(); });
  body.querySelector('[data-lease]')!.addEventListener('click', () => {
    const r = claim('colours', picked.join(' '));
    statusOf(body, r.ok, r.ok ? `Rainbow leased. ${r.amount ? '$' + r.amount + ' to the team.' : ''} Visible from their garden.` : t(r.reason ?? 'No.'));
    if (!r.ok) { picked.length = 0; draw(); }
  });
  draw();
}

// ---- Lottery of the Ancients: code, then scratch three runes ----
function renderRunes(body: HTMLElement): void {
  const s = SCAMS.find((x) => x.id === 'runes')!;
  genericForm(s, body, () => {
    const form = body.querySelector('form')!;
    form.remove();
    const prize = pickPrize();
    const glyphs = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ'];
    const win = prize > 0;
    const faces = win ? [glyphs[prize % 8], glyphs[prize % 8], glyphs[prize % 8]] : [glyphs[0], glyphs[3], glyphs[6]];
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p class="sapp__blurb">Code accepted. Scratch all three runes.</p><div class="runes">${faces.map((f, i) => `<button type="button" class="rune" data-i="${i}" aria-label="Scratch rune ${i + 1}">${f}</button>`).join('')}</div><div class="sapp__status"></div>`;
    body.querySelector('.sapp')!.appendChild(wrap);
    let revealed = 0;
    wrap.querySelectorAll<HTMLButtonElement>('.rune').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.revealed) return;
      b.dataset.revealed = 'true';
      sfx.click();
      if (win) b.classList.add('rune--win');
      if (++revealed === 3) {
        const st = wrap.querySelector<HTMLElement>('.sapp__status')!;
        if (win) { payOut('runes', prize); st.className = 'sapp__status sapp__status--ok'; st.textContent = prize >= 1000 ? `JACKPOT. $${prize}.` : `Three of a kind. $${prize}.`; if (prize >= 1000) sfx.jackpot(); }
        else { st.className = 'sapp__status sapp__status--bad'; st.textContent = 'Nothing. The Ancients are not kind tonight.'; sfx.bad(); }
      }
    }));
  });
}
function pickPrize(): number { const r = Math.random(); return r < 0.05 ? 1000 : r < 0.25 ? 500 : r < 0.6 ? 200 : 0; }

// ---- Bean Coin: a live round that crashes at a random time ----
function renderBean(body: HTMLElement, win: Win): void {
  const s = SCAMS.find((x) => x.id === 'beancoin')!;
  let disarm: (() => void) | null = null;
  win.opts.onClose = () => disarm?.();
  genericForm(s, body, (typed) => {
    const stake = parseInt(typed.replace(/[^0-9]/g, ''), 10) || 100;
    body.querySelector('form')!.remove();
    const wrap = document.createElement('div');
    wrap.className = 'bean';
    wrap.innerHTML = `<div class="bean__row"><span>Position: <b class="tabular">$${stake}</b></span><span class="bean__warn" hidden>They want out. Reassure them on the phone.</span></div>
      <div class="bean__value tabular">$${stake}</div><canvas class="bean__chart" width="400" height="120"></canvas>
      <div class="bean__row"><span class="sapp__status">Market open. Cash out before the crash. Max $700.</span><button class="btn btn--money" type="button">Cash out</button></div>`;
    body.querySelector('.sapp')!.appendChild(wrap);
    const valueEl = wrap.querySelector<HTMLElement>('.bean__value')!;
    const warn = wrap.querySelector<HTMLElement>('.bean__warn')!;
    const btn = wrap.querySelector<HTMLButtonElement>('.btn')!;
    const canvas = wrap.querySelector<HTMLCanvasElement>('canvas')!;
    const c = canvas.getContext('2d')!;
    const crashAt = 6000 + Math.random() * 16000;
    const start = performance.now();
    let mult = 1, crashed = false, done = false;
    const points: number[] = [];
    const draw = () => {
      c.fillStyle = '#0f1520'; c.fillRect(0, 0, canvas.width, canvas.height);
      c.strokeStyle = crashed ? '#e5484d' : '#30c67c'; c.lineWidth = 3; c.beginPath();
      const max = Math.max(2.4, ...points);
      points.forEach((p, i) => { const x = (i / Math.max(1, points.length - 1)) * canvas.width; const y = canvas.height - (p / max) * (canvas.height - 10) - 5; i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    };
    let off: () => void = () => {};
    const finish = (amount: number, msg: string, ok: boolean) => {
      if (done) return; done = true; disarm?.();
      off();
      btn.disabled = true;
      const st = wrap.querySelector<HTMLElement>('.sapp__status')!;
      st.className = 'sapp__status ' + (ok ? 'sapp__status--ok' : 'sapp__status--bad'); st.textContent = msg;
      if (amount > 0) payOut('beancoin', amount); else roundLost(msg);
    };
    const tick = () => {
      if (done) return;
      const t = performance.now() - start;
      if (!crashed && t >= crashAt) { crashed = true; valueEl.classList.add('is-crash'); sfx.bad(); }
      if (!crashed) mult = 1 + (t / 1000) * 0.11 + Math.sin(t / 700) * 0.04;
      else mult = Math.max(0.05, mult * 0.93);
      const value = Math.min(700, Math.round(stake * mult));
      valueEl.textContent = '$' + value;
      points.push(mult); if (points.length > 160) points.shift();
      draw();
      if (crashed && stake * mult < stake * 0.08) finish(0, 'Crashed to nothing. The caller is not happy.', false);
      const call = currentCall();
      if (!call || call.status !== 'live') finish(0, 'The caller is gone. Round void.', false);
    };
    off = bus.on('frame', tick);
    btn.addEventListener('click', () => { const v = Math.min(700, Math.round(stake * mult)); finish(v, `Cashed out at ${mult.toFixed(2)}× for $${v}.`, true); });
    disarm = armWithdraw(() => finish(0, 'They pulled out. You lost the round.', false));
    const offW = bus.on('call:withdraw', () => { warn.hidden = false; });
    const offR = bus.on<{ intent?: string }>('call:mood', ({ intent }) => { if (intent === 'reassure') warn.hidden = true; });
    const prev = win.opts.onClose;
    win.opts.onClose = () => { prev?.(); offW(); offR(); finish(0, 'Window closed. Round void.', false); };
  });
}

// ---- Remote Fridge Repair: code, connect, repair ----
function renderFridge(body: HTMLElement): void {
  const s = SCAMS.find((x) => x.id === 'fridge')!;
  body.innerHTML = `<div class="sapp">${head(s)}
    <form class="sapp__form"><label>Six-digit code<input type="text" name="v" inputmode="numeric" autocomplete="off" placeholder="123-456" /></label><button class="btn" type="submit">Connect</button></form>
    <div class="fridge__screen" hidden></div><div class="sapp__status" aria-live="polite"></div></div>`;
  const form = body.querySelector<HTMLFormElement>('form')!;
  const screen = body.querySelector<HTMLElement>('.fridge__screen')!;
  const status = body.querySelector<HTMLElement>('.sapp__status')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = (form.elements.namedItem('v') as HTMLInputElement).value;
    const call = currentCall();
    const given = call?.ctx.given.fridgecode;
    if (!call || call.status !== 'live') { status.className = 'sapp__status sapp__status--bad'; status.textContent = 'No caller on the line.'; return; }
    if (!given) { status.className = 'sapp__status sapp__status--bad'; status.textContent = 'Ask the caller to read the code inside the door first.'; return; }
    if (typed.replace(/\D/g, '') !== given.replace(/\D/g, '')) { status.className = 'sapp__status sapp__status--bad'; status.textContent = 'Wrong code.'; sfx.bad(); return; }
    form.querySelector('button')!.disabled = true;
    screen.hidden = false;
    const lines = ['> connecting to ' + call.caller.name.toUpperCase() + ' at ' + given + ' …', '> handshake: cold', '> remote desktop: granted', '> you are in.'];
    let i = 0;
    const iv = setInterval(() => {
      screen.textContent += (i ? '\n' : '') + lines[i++];
      if (i === lines.length) {
        clearInterval(iv);
        setTimeout(() => { screen.hidden = true; remoteDesktop(body, call.caller.name, given, status); }, 500);
      }
    }, 420);
  });
}

// Their computer, on your screen: a tiny desktop with their files. One of them is the repair
// ticket (the $400), one is a stash worth a bonus, the rest are the caller's life.
const REMOTE_FILES: [string, string][] = [
  ['tax_returns_moon.txt', 'Year 1: owed 3 craters. Year 2: owed 4 craters. Year 3: moved to the Moon.'],
  ['passwords.txt', 'bank: hunter2\nfridge: hunter3\nmoon plot: hunter4\n(do not share)'],
  ['photos', '📷 14 photos of a sandwich from different angles.'],
  ['diary.doc', 'Dear diary. Today a stranger called about gravity. I said yes. I regret nothing.'],
  ['receipts', '🧾 One receipt. For a cloud. Monthly.'],
  ['todo.txt', '1. call back the nice voice\n2. find the ladle\n3. stop answering unknown numbers (ignore)'],
  ['music', '🎵 One song. It is the hold music. On repeat.'],
  ['UNPAID_INVOICE.pdf', 'Sunrise Customer Care — remote repair — $400 — status: WAITING FOR YOUR CLICK'],
  ['stash', '💰 A folder of small notes. Nobody will miss $120 of it.'],
];

function remoteDesktop(body: HTMLElement, who: string, given: string, status: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'remote';
  const files = [...REMOTE_FILES].sort(() => Math.random() - 0.5);
  wrap.innerHTML = `<div class="remote__bar"><span>● ${who}'s computer</span><button type="button" class="remote__dc">Disconnect</button></div>
    <div class="remote__desk">${files.map(([n]) => `<button type="button" class="remote__file" data-f="${n}"><span class="remote__icon">${n.includes('.') ? '📄' : '📁'}</span><span>${n}</span></button>`).join('')}</div>
    <div class="remote__view" hidden></div>`;
  body.querySelector('.sapp')!.appendChild(wrap);
  const view = wrap.querySelector<HTMLElement>('.remote__view')!;
  let stash = false;
  wrap.querySelectorAll<HTMLButtonElement>('.remote__file').forEach((b) => b.addEventListener('click', () => {
    const name = b.dataset.f!;
    const [, text] = REMOTE_FILES.find(([n]) => n === name)!;
    view.hidden = false;
    sfx.click();
    if (name === 'UNPAID_INVOICE.pdf') {
      view.innerHTML = `<b>${name}</b><pre>${text}</pre><button type="button" class="btn btn--money" data-pay>Mark as paid — $400</button>`;
      view.querySelector('[data-pay]')!.addEventListener('click', () => {
        const r = claim('fridgecode', given);
        if (r.ok) { status.className = 'sapp__status sapp__status--ok'; status.textContent = 'Repair billed. The hum is now in C major. $400 to the team.'; view.innerHTML = '<b>Paid.</b> Disconnect when you are done snooping.'; }
        else { status.className = 'sapp__status sapp__status--bad'; status.textContent = t(r.reason ?? 'No.'); }
      });
    } else if (name === 'stash') {
      if (stash) { view.innerHTML = `<b>stash</b><pre>Already emptied. You have no shame.</pre>`; return; }
      view.innerHTML = `<b>stash</b><pre>${text}</pre><button type="button" class="btn" data-take>Take $120</button>`;
      view.querySelector('[data-take]')!.addEventListener('click', () => { stash = true; payOut('fridge', 120); view.innerHTML = '<b>stash</b><pre>Emptied. They will never know. They will know.</pre>'; });
    } else view.innerHTML = `<b>${name}</b><pre>${text}</pre>`;
  }));
  wrap.querySelector('.remote__dc')!.addEventListener('click', () => { wrap.remove(); status.textContent = 'Disconnected. Their files stay the same forever.'; });
}

void settings; void state;
