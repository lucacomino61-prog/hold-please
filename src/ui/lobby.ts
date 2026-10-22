// Play with friends: host a room or join one by its four-letter code, see who is on the floor, start the day.
import { bus, fmt, saveSettings, settings } from '../game/state';
import { CODE_RE, ServerError, room, serverUrl, type PublicRoom, type RoomState } from '../net/room';
import { coop } from '../net/coop';
import { hideTitle } from './title';
import { sfx } from '../game/sound';

const SHIRTS = ['#2bb3a3', '#e9c84a', '#d94b4b', '#4a78d9', '#8e5ad6', '#f08a24', '#3fa34d', '#e26fb0'];

let wrap: HTMLElement | null = null;
let note = '';
let busy = false;
let unsub: (() => void)[] = [];

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function errorText(e: unknown, code?: string): string {
  if (e instanceof ServerError) {
    if (e.status === 0) return `Can't reach the room server at ${serverUrl() || '(none set)'}. Is it running?`;
    if (e.status === 404) return `No room with the code ${code ?? ''}. Check it with your friend.`;
    if (e.status === 409) return 'That room is full (eight is the limit).';
    if (e.status === 400) return 'The server refused that. A name is required.';
    return 'The room server did not answer properly. Try again in a moment.';
  }
  return 'Something went wrong. Try again.';
}

export function openLobby(): void {
  if (wrap) return;
  wrap = document.createElement('div');
  wrap.className = 'screen lobby-screen';
  wrap.style.zIndex = '80';
  wrap.style.background = 'oklch(0 0 0 / .6)';
  document.body.appendChild(wrap);
  note = '';
  render();
  unsub.push(bus.on<RoomState>('room:state', onState));
  unsub.push(bus.on('room:gone', () => { note = 'That room is gone. Host a new one.'; render(); }));
  unsub.push(bus.on('room:drop', () => { note = 'The connection dropped. Reconnecting…'; render(); }));
  unsub.push(bus.on('room:open', () => { note = ''; render(); }));
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
}

function closeLobby(): void {
  unsub.forEach((f) => f());
  unsub = [];
  clearInterval(listTimer); listTimer = undefined;
  wrap?.remove();
  wrap = null;
}

// the public rooms: fetched when the start panel shows and every six seconds after
let listTimer: ReturnType<typeof setInterval> | undefined;
let publicRooms: PublicRoom[] | null = null;
async function refreshPublic(): Promise<void> {
  if (!wrap || !serverUrl()) return;
  try { publicRooms = await room.listPublic(); } catch { publicRooms = null; }
  const ul = wrap.querySelector<HTMLElement>('.lobby__public ul');
  if (!ul) return;
  ul.innerHTML = publicRooms === null ? '<li class="fine">Could not reach the room server.</li>' : publicRooms.length ? publicRooms.map((r) => `<li><b>${esc(r.host)}</b>'s floor <span class="fine">· ${r.players}/8 · day ${r.day} · ${r.shiftMinutes} min · ${esc(r.status)}</span><button class="btn" type="button" data-joinpub="${esc(r.code)}" ${busy ? 'disabled' : ''}>Join</button></li>`).join('') : '<li class="fine">No public rooms right now. Host one and tick "List it publicly".</li>';
  ul.querySelectorAll<HTMLButtonElement>('[data-joinpub]').forEach((b) => b.addEventListener('click', () => { const { name, shirt } = readForm(); void act(() => room.join(b.dataset.joinpub!, name, shirt), b.dataset.joinpub); }));
}

/** Back from the panel: a room not yet started is left */
function back(): void {
  if (room.seat) room.leave(true);
  closeLobby();
}

function onState(s: RoomState): void {
  if (s.status !== 'lobby') {
    // the host started the day: everyone into the break room
    closeLobby();
    hideTitle();
    sfx.unlock();
    coop.begin();
    return;
  }
  render();
}

function readForm(): { name: string; shirt: string } {
  const f = wrap?.querySelector<HTMLFormElement>('form');
  if (f) {
    const d = new FormData(f);
    settings.playerName = String(d.get('name') || '').trim().slice(0, 24) || settings.playerName || 'Agent';
    settings.shirt = String(d.get('shirt') || settings.shirt);
    settings.roomServer = String(d.get('server') || '').trim();
    if (f.querySelector('[name="public"]')) settings.roomPublic = d.get('public') === 'on';
    saveSettings();
  }
  return { name: settings.playerName, shirt: settings.shirt };
}

async function act(fn: () => Promise<void>, code?: string): Promise<void> {
  if (busy) return;
  busy = true;
  note = '';
  render();
  try {
    await fn();
    note = '';
  } catch (e) {
    note = errorText(e, code);
  }
  busy = false;
  render();
}

function render(): void {
  if (!wrap) return;
  const s = room.state;
  if (room.seat && s && s.status === 'lobby') renderRoom(s);
  else renderStart();
}

function renderStart(): void {
  const saved = room.savedSeat();
  const dflt = serverUrl();
  wrap!.innerHTML = `<form class="panel panel--lobby" role="dialog" aria-labelledby="lobby-title">
    <h2 id="lobby-title">Play with friends</h2>
    <p>One floor, one quota, up to eight of you. Everyone takes their own calls; the money lands in one team total and Mr. Krull reviews you all together.</p>
    <div class="lobby__you">
      <label>Your name on the floor<input type="text" name="name" maxlength="24" value="${esc(settings.playerName)}" autocomplete="nickname" required /></label>
      <div class="lobby__shirts"><span class="lobby__shirts-label">Your shirt</span><div class="shirts" role="radiogroup" aria-label="Shirt colour">${SHIRTS.map((c) => `<label class="shirt" style="--shirt:${c}"><input type="radio" name="shirt" value="${c}" ${c === settings.shirt ? 'checked' : ''} aria-label="Shirt ${c}" /><span></span></label>`).join('')}</div></div>
    </div>
    ${saved ? `<button class="btn btn--amber" type="button" data-rejoin ${busy ? 'disabled' : ''}>Rejoin room ${saved.code}</button>` : ''}
    <div class="lobby__ways">
      <div class="lobby__way"><h3>Host a room</h3><p class="fine">You get a four-letter code to send around. Shift length ${settings.shiftMinutes} min (change it in Settings).</p><label class="check"><input type="checkbox" name="public" ${settings.roomPublic ? 'checked' : ''} /> List it publicly, so anyone can join</label><button class="btn btn--amber" type="button" data-host ${busy ? 'disabled' : ''}>Host a room</button></div>
      <div class="lobby__way"><h3>Join a friend</h3><label>Room code<input type="text" name="code" maxlength="4" placeholder="K7QF" autocapitalize="characters" autocomplete="off" spellcheck="false" /></label><button class="btn" type="button" data-join ${busy ? 'disabled' : ''}>Join</button></div>
    </div>
    <div class="lobby__public"><h3>Public rooms</h3><ul class="lobby__players"><li class="fine">Looking…</li></ul></div>
    <details class="lobby__server"><summary>Room server</summary><label>Address<input type="text" name="server" value="${esc(settings.roomServer)}" placeholder="${esc(dflt || 'https://…')}" spellcheck="false" /></label><p class="fine">${dflt ? `Empty means ${esc(dflt)}.` : 'This build has no server set: paste the address of one.'} Locally: <code>npm run server</code>.</p></details>
    <p class="lobby__note" aria-live="polite">${esc(note)}</p>
    <div class="panel__actions"><button class="btn btn--ghost" type="button" data-close>Back</button></div>
  </form>`;
  const form = wrap!.querySelector<HTMLFormElement>('form')!;
  form.addEventListener('submit', (e) => e.preventDefault());
  wrap!.querySelector('[data-close]')!.addEventListener('click', back);
  wrap!.querySelector('[data-host]')!.addEventListener('click', () => {
    const { name, shirt } = readForm();
    void act(() => room.host(name, shirt, settings.shiftMinutes, settings.roomPublic));
  });
  clearInterval(listTimer);
  void refreshPublic();
  listTimer = setInterval(() => { if (wrap && !room.seat) void refreshPublic(); }, 6000);
  wrap!.querySelector('[data-join]')!.addEventListener('click', () => {
    const { name, shirt } = readForm();
    const code = (form.querySelector<HTMLInputElement>('[name="code"]')!.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!CODE_RE.test(code)) { note = 'A room code has four letters or digits, like K7QF.'; render(); return; }
    void act(() => room.join(code, name, shirt), code);
  });
  wrap!.querySelector('[data-rejoin]')?.addEventListener('click', () => {
    const { name, shirt } = readForm();
    if (saved) void act(() => room.rejoin(saved, name, shirt), saved.code);
  });
  if (!busy) form.querySelector<HTMLInputElement>('input')!.focus();
}

function renderRoom(s: RoomState): void {
  const host = s.host === s.you;
  const hostName = s.players.find((p) => p.id === s.host)?.name ?? 'the host';
  wrap!.innerHTML = `<div class="panel panel--lobby" role="dialog" aria-labelledby="lobby-code-label">
    <div class="sheet__eyebrow" id="lobby-code-label">Room code</div>
    <div class="lobby__code" aria-label="Room code ${s.code.split('').join(' ')}">${s.code}</div>
    <div class="cluster" style="--cluster-space:.6rem"><button class="btn" type="button" data-copy>Copy the code</button><span class="fine">Friends: Play with friends → Join → this code.</span></div>
    <h3>On the floor (${s.players.length} / 8)</h3>
    <ul class="lobby__players">${s.players.map((p) => `<li><span class="lobby__dot" style="--shirt:${p.shirt}"></span><b>${esc(p.name)}</b>${p.id === s.host ? '<span class="lobby__tag">host</span>' : ''}${p.id === s.you ? '<span class="lobby__tag lobby__tag--you">you</span>' : ''}${p.here ? '' : '<span class="fine">away</span>'}</li>`).join('')}</ul>
    <p class="fine">Shift ${s.shiftMinutes} min · the first quota is ${fmt(s.quota)} · ${host ? 'you clock everyone in from the break room.' : `${esc(hostName)} starts the day and clocks everyone in.`}</p>
    <p class="lobby__note" aria-live="polite">${esc(note)}</p>
    <div class="panel__actions"><button class="btn btn--ghost" type="button" data-leave>Leave</button>${host ? '<button class="btn btn--amber" type="button" data-start>Start the day</button>' : `<button class="btn btn--amber" type="button" disabled>Waiting for ${esc(hostName)} to start…</button>`}</div>
  </div>`;
  wrap!.querySelector('[data-copy]')!.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(s.code); note = `Code ${s.code} copied.`; } catch { note = `The code is ${s.code}.`; }
    render();
  });
  wrap!.querySelector('[data-leave]')!.addEventListener('click', back);
  wrap!.querySelector('[data-start]')?.addEventListener('click', () => { if (!room.send({ t: 'start' })) { note = 'Not connected. Wait a moment and try again.'; render(); } });
  (wrap!.querySelector<HTMLButtonElement>('[data-start]') ?? wrap!.querySelector<HTMLButtonElement>('[data-copy]'))!.focus();
}
