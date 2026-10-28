// The side apps: market, messenger, browser, playbook, wallpapers, antivirus, log, floor cam.
import { bus, fmt, spend, state } from '../../game/state';
import { SCAMS } from '../../game/scams';
import { airstrike, cureVirus, startVirus } from '../../game/events';
import { strikeRival } from '../../game/rival';
import { mutatorPrice } from '../../game/mutators';
import { sfx } from '../../game/sound';
import { attachFloorCam, floorEffect, followPlayer, officeAvailable } from '../../world/office';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { currentWallpaper, refreshDesktop, setWallpaper } from '../desktop';
import { WALLPAPERS } from '../wallpaper';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';
import { coop } from '../../net/coop';
import { room } from '../../net/room';
import { t } from '../../i18n';
import { familySafe } from '../../game/modes';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

// ---------------- Swindlr Market ----------------
interface Item { id: string; name: string; blurb: string; price: number; color: string; glyph: string; effect?: () => void; once?: boolean; cosmetic?: string }
const GOODS: Record<string, Item[]> = {
  business: [
    { id: 'synergy', name: 'Synergy Dashboard', blurb: 'Shows a number going up. The number is not yours.', price: 120, color: '#4a78d9', glyph: 'playbook' },
    { id: 'unsender', name: 'Email Unsender', blurb: 'Unsends emails. You have never sent an email.', price: 90, color: '#8e5ad6', glyph: 'pigeon' },
    { id: 'avoider', name: 'Meeting Avoider', blurb: 'Makes you invisible to Mr. Krull. Once.', price: 200, color: '#2bb3a3', glyph: 'krull', once: true },
    { id: 'cactus', name: 'Emotional Support Cactus', blurb: 'Callers start 5 points warmer. Do not hug.', price: 260, color: '#3fa34d', glyph: 'clouds', once: true },
  ],
  games: [
    { id: 'solitaire', name: 'Solitaire But Worse', blurb: 'Fifty-one cards. The missing one is the point.', price: 15, color: '#d94b4b', glyph: 'casino', effect: () => toast('You lost. The missing card was the ace. It is always the ace.') },
    { id: 'dumplings', name: 'Dumpling Clicker Pro', blurb: 'The same clicker. The icon is gold now.', price: 60, color: '#c8a44a', glyph: 'clicker', effect: () => toast('Your clicker is now Pro. Nothing has changed. That is the Pro experience.') },
  ],
  goods: [
    { id: 'horn', name: 'Motivational Airhorn', blurb: 'Delivers actionable feedback at 120 decibels.', price: 35, color: '#f08a24', glyph: 'warning', effect: () => { sfx.alert(); toast('HONK. The whole floor is motivated.'); } },
    { id: 'moat', name: 'Desk Moat', blurb: 'Blocks one police raid. Fill with water, not coffee.', price: 900, color: '#4ab3e0', glyph: 'fridge', once: true },
    { id: 'extinguisher', name: 'Fire Extinguisher', blurb: 'For the fires. There are no fires yet.', price: 80, color: '#d94b4b', glyph: 'shield', effect: () => toast('No fire found. The extinguisher is disappointed.') },
    { id: 'trebuchet', name: 'Trebuchet, Office Standard', blurb: 'Launches a 90 kg stapler over 300 metres.', price: 1200, color: '#8a7b5a', glyph: 'gravity', effect: () => toast('The stapler is gone. Nobody knows where. Teodora is quiet.') },
    { id: 'strike-rival', name: 'Air strike the rival office', blurb: 'Their quota becomes yours. Today\'s quota −10%.', price: 2500, color: '#1b2432', glyph: 'skull', effect: () => { state.quota = Math.round(state.quota * 0.9 / 10) * 10; bus.emit('money'); sfx.boom(); strikeRival(); floorEffect('fireworks', 9000); document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 700); toast('The rival office is quiet. Your quota dropped 10%. The floor is celebrating with the morale fireworks.', 'money', 5000); } },
    { id: 'strike-self', name: 'Air strike yourselves', blurb: 'Orders one full barrage on this building. Morale may vary.', price: 1500, color: '#d94b4b', glyph: 'skull', effect: () => airstrike(true) },
    // desk cosmetics: they appear at your desk in the office and follow you to any desk you sit at
    { id: 'cos:plant', name: 'Desk Plant', blurb: 'Alive, for now. The colleagues will have opinions.', price: 150, color: '#3f8f4a', glyph: 'clouds', cosmetic: 'plant' },
    { id: 'cos:trophy', name: 'Top Closer Trophy', blurb: 'Gold-coloured. For a contest that never happened.', price: 400, color: '#c9a227', glyph: 'star', cosmetic: 'trophy' },
    { id: 'cos:monitor', name: 'Second Monitor', blurb: 'One screen for calls, one for Surf. Krull knows.', price: 500, color: '#4a78d9', glyph: 'playbook', cosmetic: 'monitor' },
    { id: 'cos:chair', name: 'Executive Chair', blurb: 'Black leather, gold trim, squeaks with authority.', price: 600, color: '#1a1a1a', glyph: 'krull', cosmetic: 'chair' },
    { id: 'cos:bigplant', name: 'A Bigger Plant', blurb: 'Floor-standing. Blocks the aisle a little. Worth it.', price: 350, color: '#2f7a3a', glyph: 'clouds', cosmetic: 'bigplant' },
    { id: 'cos:fishtank', name: 'Fish Tank', blurb: 'One fish. It has seen things. It will see more.', price: 800, color: '#4ab3e0', glyph: 'fridge', cosmetic: 'fishtank' },
    { id: 'cos:sofa', name: 'Office Sofa', blurb: 'Behind your desk, for the colleagues who never leave.', price: 1100, color: '#8a5a3c', glyph: 'krull', cosmetic: 'sofa' },
    { id: 'cos:rug', name: 'A Round Rug', blurb: 'Under the chair. Ties the cubicle together.', price: 220, color: '#c0392b', glyph: 'rainbow', cosmetic: 'rug' },
    { id: 'cos:lamp', name: 'Floor Lamp', blurb: 'Warm light. Krull prefers the fluorescents.', price: 300, color: '#e9c84a', glyph: 'sun', cosmetic: 'lamp' },
  ],
};

registerApp({ id: 'shop', name: 'Swindlr Market', color: '#f08a24', glyph: 'shop', kind: 'core', pinned: true, open: () => {
  openWindow({ id: 'shop', title: 'Swindlr Market', glyph: icon('shop'), color: '#f08a24', w: 760, h: 640 }, (body) => {
    body.innerHTML = `<div class="shop"><div class="shop__head"><b>SWINDLR</b><span class="pill">MARKET</span><span class="bal">${t('Your money:')} <b class="tabular"></b></span></div>
      <div class="shop__tabs" role="tablist"><button class="shop__tab" role="tab" data-tab="scams" aria-selected="true">${t('Scams')}</button><button class="shop__tab" role="tab" data-tab="business">${t('Business apps')}</button><button class="shop__tab" role="tab" data-tab="games">${esc(t('Games & software'))}</button><button class="shop__tab" role="tab" data-tab="goods">${t('Physical goods')}</button></div>
      <div class="shop__grid" role="tabpanel"></div></div>`;
    const bal = body.querySelector<HTMLElement>('.bal b')!;
    const grid = body.querySelector<HTMLElement>('.shop__grid')!;
    let tab = 'scams';
    const money = () => { bal.textContent = fmt(state.personal); };
    const render = () => {
      money();
      grid.innerHTML = '';
      const items: (Item & { owned?: boolean; fromDay?: number })[] = (tab === 'scams'
        ? SCAMS.map((s) => ({ id: 'scam:' + s.id, name: s.name, blurb: s.tagline, price: s.price, color: s.color, glyph: s.glyph, owned: state.owned.has(s.id), fromDay: s.minDay && state.day < s.minDay ? s.minDay : 0 }))
        : GOODS[tab].map((g) => ({ ...g, owned: (!!g.once && state.inventory.includes(g.id)) || (!!g.cosmetic && state.cosmetics.includes(g.cosmetic)) }))).map((it) => ({ ...it, price: Math.round(it.price * mutatorPrice() / 10) * 10 }));
      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'item';
        const can = state.personal >= it.price && !it.fromDay;
        card.innerHTML = `<div class="item__art" style="background:${it.color}">${icon(it.glyph)}</div><h3>${esc(it.name)}</h3><p>${esc(it.blurb)}</p><div class="price">${it.price === 0 ? t('Included') : fmt(it.price)}</div>
          <button class="buy ${it.owned ? 'owned' : ''}" type="button" ${it.owned || it.fromDay || (!can && it.price > 0) ? 'disabled' : ''}>${it.owned ? t('Owned') : it.fromDay ? t('From day {d}', { d: it.fromDay }) : can || it.price === 0 ? t('Hold to buy') : t('Need {x}', { x: fmt(it.price - state.personal) })}</button>`;
        const btn = card.querySelector<HTMLButtonElement>('.buy')!;
        let hold: ReturnType<typeof setInterval> | undefined, p = 0;
        const stop = () => { clearInterval(hold); p = 0; btn.style.setProperty('--hold', '0%'); };
        const buy = () => {
          stop();
          if (it.price > 0 && !spend(it.price)) { toast(t('Not enough money.'), 'danger'); return; }
          sfx.cash();
          if (it.id.startsWith('scam:')) { state.owned.add(it.id.slice(5) as typeof SCAMS[number]['id']); bus.emit('unlock'); refreshDesktop(); toast(`${it.name} is on your desktop.`, 'money'); }
          else if ((it as Item).cosmetic) { state.cosmetics.push((it as Item).cosmetic!); bus.emit('cosmetic', (it as Item).cosmetic); toast(`${it.name} is on your desk. Stand up and have a look.`, 'money', 4000); }
          else { state.inventory.push(it.id); (it as Item).effect?.(); if (!(it as Item).effect) toast(`Bought ${it.name}.`, 'money'); }
          render();
        };
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (btn.disabled) return; p = 0; hold = setInterval(() => { p += 8; btn.style.setProperty('--hold', p + '%'); if (p >= 100) buy(); }, 60); });
        btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
        btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buy(); } });
        grid.appendChild(card);
      }
    };
    body.querySelectorAll<HTMLButtonElement>('.shop__tab').forEach((b) => b.addEventListener('click', () => { body.querySelectorAll('.shop__tab').forEach((x) => x.setAttribute('aria-selected', 'false')); b.setAttribute('aria-selected', 'true'); tab = b.dataset.tab!; render(); }));
    const off = bus.on('money', money);
    body.closest('.win')?.addEventListener('DOMNodeRemoved', () => off(), { once: true });
    render();
  });
} });

// ---------------- Pigeon messenger ----------------
const CHATS: Record<string, string[]> = {
  Teodora: ['did you see the goose on line 4', 'i sold the moon twice today. same crater.', 'krull is in a mood. a worse one.'],
  Jun: ['does anyone know how to turn off the fridge. it keeps calling', 'bean coin is up. bean coin is down. bean coin is a lie.', 'lunch?'],
  Baxter: ['WHO took my stapler', 'the trebuchet was a mistake', 'i miss the stapler'],
  'Mr. Krull': ['WHERE ARE MY NUMBERS', 'THE QUOTA IS NOT A SUGGESTION', 'I CAN SEE YOUR SCREEN. I CAN ALWAYS SEE YOUR SCREEN.'],
};
const REPLIES = ['lol', 'same', 'don\'t let krull see that', 'back to the phones', 'who is this', '🥟', 'HONK'];

registerApp({ id: 'pigeon', name: 'Pigeon', color: '#5a3a8a', glyph: 'pigeon', kind: 'side', open: () => {
  openWindow({ id: 'pigeon', title: 'Pigeon — the world\'s most secure messenger', glyph: icon('pigeon'), color: '#5a3a8a', w: 520, h: 440 }, (body) => {
    // laid out like the original's Disscord: the purple header, contacts with their status, the gift card in the
    // chat, a PREMIUM button beside the composer that sends you the same gift
    body.innerHTML = `<div class="pigeon"><div class="pigeon__head">${icon('pigeon')}<div><b>Pigeon</b><span>The world's most secure messaging app.</span></div></div>
      <div class="pigeon__side"><b>Contacts</b><input type="search" class="pigeon__search" placeholder="Search contacts" aria-label="Search contacts" />${[...(coop.on ? ['Room'] : []), ...Object.keys(CHATS)].map((n, i) => `<button class="pigeon__contact" type="button" aria-selected="${i === 0}"><i>${n === 'Room' ? '#' : n.charAt(0)}</i><span><b>${n}</b><small>${n === 'Room' ? `${coop.online()} online` : n === 'Mr. Krull' ? 'Do not disturb' : 'Online'}</small></span></button>`).join('')}</div>
      <div class="pigeon__chat"><div class="pigeon__who"><i>${coop.on ? '#' : 'T'}</i><span><b>${coop.on ? 'Room' : 'Teodora'}</b><small>Online now</small></span></div><div class="pigeon__msgs"></div><form class="pigeon__form"><button type="button" class="pigeon__nitro" data-nitro>🎁 PREMIUM</button><input type="text" placeholder="Type a message" aria-label="Message" maxlength="140" /><button class="btn" type="submit" aria-label="Send">${icon('send')}</button></form></div></div>`;
    const msgs = body.querySelector<HTMLElement>('.pigeon__msgs')!;
    const whoEl = body.querySelector<HTMLElement>('.pigeon__who')!;
    let who = coop.on ? 'Room' : 'Teodora';
    const roomLog: string[] = [];
    const offChat = bus.on<{ name: string; text: string; me: boolean }>('room:chat', (m) => { roomLog.push(`<b>${esc(m.name)}</b> ${esc(m.text)}`); if (who === 'Room') render(); });
    body.closest('.win')?.addEventListener('DOMNodeRemoved', () => offChat(), { once: true });
    const gift = () => `<div class="msg msg--gift"><small>YOU RECEIVED A PIGEON PREMIUM GIFT</small><div class="msg__card"><b>PIGEON PREMIUM</b><span class="msg__free">1 MONTH • FREE</span><em>Exclusive gift • CLICK TO CLAIM</em><button class="btn" type="button" data-claim>Claim</button></div></div>`;
    const render = () => {
      msgs.innerHTML = who === 'Room' ? (roomLog.length ? roomLog.map((m) => `<div class="msg">${m}</div>`).join('') : '<div class="msg">The room is quiet. Say something; everyone in it reads this.</div>') : CHATS[who].map((m) => `<div class="msg">${esc(m)}</div>`).join('');
      whoEl.innerHTML = `<i>${who.charAt(0)}</i><span><b>${who}</b><small>${who === 'Mr. Krull' ? 'Do not disturb' : 'Online now'}</small></span>`;
      if (who === 'Teodora' && !state.inventory.includes('pigeon-gift-claimed')) msgs.insertAdjacentHTML('beforeend', gift());
      msgs.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => { if (!state.inventory.includes('pigeon-gift-claimed')) state.inventory.push('pigeon-gift-claimed'); startVirus('pigeon'); render(); }));
      msgs.scrollTop = msgs.scrollHeight;
    };
    body.querySelector('[data-nitro]')!.addEventListener('click', () => { msgs.insertAdjacentHTML('beforeend', gift()); msgs.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => { startVirus('pigeon'); render(); })); msgs.scrollTop = msgs.scrollHeight; sfx.click(); });
    body.querySelectorAll<HTMLButtonElement>('.pigeon__contact').forEach((b) => b.addEventListener('click', () => { body.querySelectorAll('.pigeon__contact').forEach((x) => x.setAttribute('aria-selected', 'false')); b.setAttribute('aria-selected', 'true'); who = b.querySelector('b')!.textContent!; render(); }));
    body.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const input = body.querySelector<HTMLInputElement>('.pigeon__form input')!; const t = input.value.trim(); if (!t) return; input.value = ''; if (who === 'Room') { room.send({ t: 'note', sub: 'chat', text: t.slice(0, 120) }); roomLog.push(`<b>You</b> ${esc(familySafe(t))}`); render(); return; } msgs.insertAdjacentHTML('beforeend', `<div class="msg msg--me">${esc(familySafe(t))}</div>`); setTimeout(() => { msgs.insertAdjacentHTML('beforeend', `<div class="msg">${who === 'Mr. Krull' ? 'BACK TO WORK.' : REPLIES[Math.floor(Math.random() * REPLIES.length)]}</div>`); msgs.scrollTop = msgs.scrollHeight; }, 900); msgs.scrollTop = msgs.scrollHeight; });
    render();
  });
} });

// ---------------- Surf (a fake browser) ----------------
const SITES: Record<string, { title: string; html: string }> = {
  'harbour-news.pf': { title: 'Harbour News', html: '<h3>Local Moon sold for the ninth time</h3><p>The Moon has confirmed it did not consent. Sunrise Customer Care declined to comment, then commented at length.</p><p>In other news: a goose has been elected to the port authority.</p>' },
  'cat-videos.pf': { title: 'Cat Videos', html: '<h3>Sir Fluffington knocks a glass off a table (4 hrs)</h3><p>▶ Buffering… 3%… 3%… 3%.</p><p>Related: a raccoon learns to use a phone.</p>' },
  'jobs.pf': { title: 'Jobs in Port Fortune', html: '<h3>Looking for a new job?</h3><p>Lighthouse keeper (no lighthouse). Fridge whisperer. Cloud storage technician (physical). Anything but this.</p>' },
  'how-to-quit.pf': { title: 'How to quit', html: '<h3>How to quit your job in 3 steps</h3><p>1. Stand up. 2. Walk to the door. 3. Remember the quota. Sit down.</p>' },
  'lottery-results.pf': { title: 'Lottery of the Ancients', html: '<h3>Tonight\'s runes</h3><p>ᚠ ᚠ ᚠ — jackpot unclaimed since the Bronze Age.</p>' },
  'krull-fanclub.pf': { title: 'Mr. Krull Fan Club', html: '<h3>Members: 1</h3><p>Posted by admin (Krull): "I AM THE MEMBER."</p>' },
};

registerApp({ id: 'surf', name: 'Surf', color: '#4ab3e0', glyph: 'surf', kind: 'core', pinned: true, open: () => {
  openWindow({ id: 'surf', title: 'Surf', glyph: icon('surf'), color: '#4ab3e0', w: 640, h: 480 }, (body) => {
    body.innerHTML = `<div class="surf"><form class="surf__bar"><input type="text" aria-label="Address" value="home" spellcheck="false" /><button class="btn" type="submit">Go</button></form><div class="surf__page"></div></div>`;
    const page = body.querySelector<HTMLElement>('.surf__page')!, input = body.querySelector<HTMLInputElement>('input')!;
    const home = () => { page.innerHTML = `<h3>Surf</h3><p class="muted">Company browser. Everything you visit here goes in the review. Everything.</p><div class="surf__links">${Object.entries(SITES).map(([k, s]) => `<button class="surf__link" type="button" data-site="${k}"><b>${s.title}</b>${k}</button>`).join('')}</div>`; page.querySelectorAll<HTMLButtonElement>('[data-site]').forEach((b) => b.addEventListener('click', () => go(b.dataset.site!))); };
    const go = (k: string) => { const s = SITES[k]; if (!s) { page.innerHTML = `<h3>Can't reach ${esc(k)}</h3><p>Port Fortune has six websites. This is not one of them.</p><button class="btn" type="button" data-home>Home</button>`; page.querySelector('[data-home]')!.addEventListener('click', home); return; } state.history.push(k); input.value = k; page.innerHTML = s.html + '<p><button class="btn" type="button" data-home>Home</button></p>'; page.querySelector('[data-home]')!.addEventListener('click', home); };
    body.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim().toLowerCase().replace(/^https?:\/\//, ''); if (!v || v === 'home') home(); else go(v); });
    home();
  });
} });

// ---------------- Playbook ----------------
const ASK_HINTS: Record<string, string> = {
  stars: '<p>Pitch the registry, then ask <i>“What does your star look like?”</i> Keep them talking: each reply buys one reading. Click the star, then Register.</p>',
  courier: '<p>Pitch the crate of penguins, then ask <i>“What password do you want on the crate?”</i> Book it in the Courier app. When Customs calls, give them that password there.</p>',
  moon: '"Which crater would you like?" — then type the crater into Moon Acres.',
  sun: '"Can you read me the serial number on the Sun?" — type it into Sun Warranty.',
  gravity: '"Choose a PIN for your gravity account." — type their word into Gravity Plan.',
  clouds: '"How many clouds shall we store?" — type the number into Cloud Storage.',
  vowels: '"Spell your name without the vowels." — type it into Vowel Tax Refund.',
  haunt: '"What\'s your haunting reference number?" — type it into Haunt Insurance.',
  petwifi: '"What\'s your pet called, and which plan?" — type both into Wi-Fi for Pets.',
  runes: '"You\'ve won! Read me the rune code on the ticket." — enter it, then scratch three runes.',
  beancoin: '"How much do you want to put into Bean Coin?" — enter the amount, cash out before the crash.',
  fridge: '"Read me the six digits inside the fridge door." — connect, then run the repair.',
  volcano: '"Which week of the year would you like on the volcano?" — type the week into Volcano Timeshare.',
  silence: '"Whisper me your quiet word." — type it into Premium Silence.',
  shadow: '"How many shadows do you own?" — type the number into Shadow Storage.',
  tuesday: '"Which Tuesday shall we remove?" — type the date into Tuesday Removal.',
};
registerApp({ id: 'playbook', name: 'Script', color: '#4a78d9', glyph: 'playbook', kind: 'core', pinned: true, open: () => {
  openWindow({ id: 'playbook', title: 'Script — the Playbook, how to close a call', glyph: icon('playbook'), color: '#4a78d9', w: 460, h: 540 }, (body) => {
    body.innerHTML = `<div class="playbook"><h2>The Sunrise method</h2><ol><li><b>Say hello and use their name.</b> It is on the phone.</li><li><b>Play along.</b> If the caller is a fridge, talk about the cold. If it is a knight, give them a quest. "Yes, and…"</li><li><b>Answer their question.</b> Every caller keeps asking one. Answering it is worth a lot.</li><li><b>Pitch a product, then ask for the one thing that closes it.</b> Watch the mood bar: ask too early and they stall.</li><li><b>Type what they said into the product's app.</b> Exactly. The money lands in the team total.</li><li><b>Never insult them, rush them, or say they are not real.</b> Never say yes to an inspector's file.</li></ol>
      <h2>Your products</h2>${SCAMS.filter((s) => state.owned.has(s.id)).map((s) => `<div class="product" style="--c:${s.color}"><b>${s.name}</b>${ASK_HINTS[s.id]}</div>`).join('')}<p class="muted">More products in Swindlr Market.</p></div>`;
  });
} });

// ---------------- Wallpapers ----------------
registerApp({ id: 'wallpapers', name: 'Wallpapers', color: '#8e5ad6', glyph: 'wallpapers', kind: 'side', open: () => {
  openWindow({ id: 'wallpapers', title: 'Wallpapers', glyph: icon('wallpapers'), color: '#8e5ad6', w: 360, h: 340 }, (body) => {
    const render = () => { body.innerHTML = `<div class="app"><h2>Wallpapers</h2><div class="list">${WALLPAPERS.map((w) => `<button class="btn ${w.id === currentWallpaper() ? '' : 'btn--ghost'}" type="button" data-w="${w.id}" style="${w.id === currentWallpaper() ? '' : '--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)'}">${w.name}</button>`).join('')}</div></div>`; body.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.addEventListener('click', () => { setWallpaper(b.dataset.w as typeof WALLPAPERS[number]['id']); render(); })); };
    render();
  });
} });

// ---------------- ShieldBuddy ----------------
registerApp({ id: 'shield', name: 'ShieldBuddy', color: '#3fa34d', glyph: 'shield', kind: 'core', open: () => {
  openWindow({ id: 'shield', title: 'ShieldBuddy antivirus (free trial, forever)', glyph: icon('shield'), color: '#3fa34d', w: 380, h: 320 }, (body) => {
    const render = () => {
      body.innerHTML = `<div class="shield"><div class="shield__state ${state.virus ? 'bad' : 'ok'}">${state.virus ? '1 VIRUS' : 'ALL CLEAR'}</div><p class="muted">${state.virus ? 'Pop-ups are multiplying. Remove it now, or run the free scan and wait.' : 'No viruses. Do not open files from inspectors. Do not claim gifts from pigeons.'}</p>
        ${state.virus ? `<button class="btn btn--money" type="button" data-pay>Remove virus — $100</button><button class="btn btn--ghost" type="button" data-scan style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Free scan (25 s)</button><div class="shield__scan" hidden><i></i></div>` : ''}</div>`;
      body.querySelector('[data-pay]')?.addEventListener('click', () => { if (spend(100)) { cureVirus(); render(); } else toast('Not enough money. Try the free scan.', 'danger'); });
      body.querySelector('[data-scan]')?.addEventListener('click', () => { const bar = body.querySelector<HTMLElement>('.shield__scan')!; bar.hidden = false; const i = bar.querySelector<HTMLElement>('i')!; let p = 0; const iv = setInterval(() => { p += 4; i.style.width = p + '%'; if (p >= 100) { clearInterval(iv); cureVirus(); render(); } }, 1000); });
    };
    render();
    const off = bus.on('money', render);
    body.closest('.win')?.addEventListener('DOMNodeRemoved', () => off(), { once: true });
  });
} });

// ---------------- ClipLog ----------------
registerApp({ id: 'cliplog', name: 'ClipLog', color: '#d94b4b', glyph: 'cliplog', kind: 'side', open: () => {
  openWindow({ id: 'cliplog', title: 'ClipLog — today\'s calls', glyph: icon('cliplog'), color: '#d94b4b', w: 460, h: 460 }, (body) => {
    const calls = state.calls;
    body.innerHTML = `<div class="cliplog">${calls.length ? calls.map((c) => `<details class="clip"><summary><span>${esc(c.name)}</span><span class="tabular">${c.payouts.length ? fmt(c.payouts.reduce((a, p) => a + p.amount, 0)) : '—'} · ${c.hungUpBy === 'caller' ? 'they hung up' : c.hungUpBy === 'you' ? 'you hung up' : c.endedAt ? 'ended' : 'live'}</span></summary><div class="lines">${c.lines.map((l) => `<div><b>${l.who === 'you' ? 'You' : esc(c.name.split(',')[0])}:</b> ${esc(l.text)}</div>`).join('')}</div></details>`).join('') : '<p class="muted">No calls yet today.</p>'}</div>`;
  });
} });

// ---------------- Floor Cam ----------------
registerApp({ id: 'floorcam', name: 'Floor Cam', color: '#1b2432', glyph: 'floorcam', kind: 'core', pinned: true, open: () => {
  let detach: (() => void) | null = null;
  openWindow({ id: 'floorcam', title: 'Floor Cam 7', glyph: icon('floorcam'), color: '#1b2432', w: 520, h: 360, onClose: () => detach?.() }, (body) => {
    const players = coop.on ? (room.state?.players ?? []).filter((p) => p.here && p.id !== room.state?.you) : [];
    body.innerHTML = `<div class="floorcam"><span>${officeAvailable() ? '' : 'Camera offline on this device.'}</span><div class="floorcam__tag">● REC · CAM 7 · FLOOR</div>${players.length ? `<select class="floorcam__follow" aria-label="Watch a player"><option value="">The floor</option>${players.map((p) => `<option value="${esc(p.id)}">Watch ${esc(p.name)}</option>`).join('')}</select>` : ''}</div>`;
    const host = body.querySelector<HTMLElement>('.floorcam')!;
    if (officeAvailable()) detach = attachFloorCam(host);
    body.querySelector<HTMLSelectElement>('.floorcam__follow')?.addEventListener('change', (e) => { const id = (e.target as HTMLSelectElement).value; followPlayer(id || null); body.querySelector('.floorcam__tag')!.textContent = id ? `● REC · CAM 7 · ${players.find((p) => p.id === id)?.name ?? ''}'S DESK` : '● REC · CAM 7 · FLOOR'; });
  });
} });

void sfx;
