// Jackpotato, the office casino, with the original's Rainbit table: crash, coin flip, dice, slots, mines, plinko,
// keno, roulette, blackjack, baccarat and video poker. Every game bets personal money (never the team's); the
// review notices what you did here (state.casinoToday).
import { bus, fmt, losePersonal, state } from '../../game/state';
import { sfx } from '../../game/sound';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';

function casinoWin(amount: number): void { state.personal += amount; state.casinoNet += amount; state.casinoToday += amount; bus.emit('money'); }
function casinoLose(amount: number): void { losePersonal(amount); state.casinoNet -= amount; state.casinoToday -= amount; }

const GAMES = ['crash', 'coin', 'dice', 'slots', 'mines', 'plinko', 'keno', 'roulette', 'blackjack', 'baccarat', 'poker'] as const;
type Game = typeof GAMES[number];

// cards
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
interface Card { r: number; s: number }
const deck = (): Card[] => { const d: Card[] = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };
const cardHtml = (c: Card, hidden = false, held = false) => `<span class="card ${c.s === 1 || c.s === 2 ? 'card--red' : ''} ${hidden ? 'card--hidden' : ''} ${held ? 'card--held' : ''}">${hidden ? '🂠' : RANKS[c.r] + SUITS[c.s]}</span>`;
const bjValue = (h: Card[]) => { let v = 0, aces = 0; for (const c of h) { if (c.r === 0) { aces++; v += 11; } else v += Math.min(10, c.r + 1); } while (v > 21 && aces) { v -= 10; aces--; } return v; };
const bacValue = (h: Card[]) => h.reduce((a, c) => a + (c.r >= 9 ? 0 : c.r + 1), 0) % 10;
function pokerRank(h: Card[]): [string, number] {
  const rs = h.map((c) => c.r).sort((a, b) => a - b), counts = new Map<number, number>();
  rs.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = h.every((c) => c.s === h[0].s);
  const straight = new Set(rs).size === 5 && (rs[4] - rs[0] === 4 || rs.join() === '0,9,10,11,12');
  if (straight && flush) return rs[0] === 0 && rs[1] === 9 ? ['Royal flush', 250] : ['Straight flush', 50];
  if (groups[0] === 4) return ['Four of a kind', 25];
  if (groups[0] === 3 && groups[1] === 2) return ['Full house', 9];
  if (flush) return ['Flush', 6];
  if (straight) return ['Straight', 4];
  if (groups[0] === 3) return ['Three of a kind', 3];
  if (groups[0] === 2 && groups[1] === 2) return ['Two pair', 2];
  if (groups[0] === 2) { const pair = [...counts.entries()].find(([, n]) => n === 2)![0]; return pair === 0 || pair >= 10 ? ['Jacks or better', 1] : ['A low pair', 0]; }
  return ['Nothing', 0];
}

registerApp({ id: 'casino', name: 'Jackpotato', color: '#c8a44a', glyph: 'casino', kind: 'side', open: () => {
  openWindow({ id: 'casino', title: 'Jackpotato — the original office casino', glyph: icon('casino'), color: '#c8a44a', w: 600, h: 620 }, (body) => {
    body.innerHTML = `<div class="casino"><div class="casino__head"><b>JACKPOTATO</b><span class="bal tabular"></span></div>
      <div class="casino__tabs" role="tablist">${GAMES.map((g, i) => `<button class="casino__tab" role="tab" data-g="${g}" aria-selected="${i === 0}">${g.toUpperCase()}</button>`).join('')}</div>
      <div class="casino__game" role="tabpanel"></div></div>`;
    const bal = body.querySelector<HTMLElement>('.bal')!;
    const game = body.querySelector<HTMLElement>('.casino__game')!;
    let bet = 50, g: Game = 'crash';
    const money = () => { bal.textContent = 'Balance ' + fmt(state.personal); };
    const bets = () => `<div class="bets">${[10, 50, 100, 500].map((b) => `<button class="bet" type="button" data-bet="${b}" aria-pressed="${b === bet}">$${b}</button>`).join('')}</div>`;
    const wireBets = () => game.querySelectorAll<HTMLButtonElement>('.bet').forEach((b) => b.addEventListener('click', () => { bet = Number(b.dataset.bet); game.querySelectorAll('.bet').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); }));
    const take = (): boolean => { if (state.personal < bet) { toast('Not enough money for that bet.', 'danger'); return false; } casinoLose(bet); money(); return true; };
    const result = (win: boolean, text: string) => { const res = game.querySelector<HTMLElement>('.casino__result')!; res.className = 'casino__result ' + (win ? 'win' : 'lose'); res.textContent = text; win ? sfx.cash() : sfx.bad(); money(); };
    let frameOff: (() => void) | null = null;
    const render = () => {
      frameOff?.(); frameOff = null;
      money();
      if (g === 'crash') {
        game.innerHTML = `${bets()}<div class="crash__mult tabular">1.00×</div><canvas class="crash__chart" width="480" height="110"></canvas><div class="casino__result"></div><button class="btn btn--money" type="button" data-go>Place bet</button>`;
        wireBets();
        const mult = game.querySelector<HTMLElement>('.crash__mult')!, btn = game.querySelector<HTMLButtonElement>('[data-go]')!;
        const canvas = game.querySelector<HTMLCanvasElement>('canvas')!, c = canvas.getContext('2d')!;
        let running = false, m = 1, crashAt = 1, start = 0, pts: number[] = [];
        btn.addEventListener('click', () => {
          if (!running) {
            if (!take()) return;
            running = true; m = 1; pts = []; start = performance.now();
            crashAt = Math.max(1, Math.pow(Math.random(), -0.55) * 0.9);
            btn.textContent = 'Cash out'; mult.classList.remove('is-crashed');
            frameOff = bus.on('frame', () => {
              if (!running) return;
              m = 1 + ((performance.now() - start) / 1000) * 0.35;
              mult.textContent = m.toFixed(2) + '×';
              pts.push(m); if (pts.length > 200) pts.shift();
              c.fillStyle = '#0b1120'; c.fillRect(0, 0, canvas.width, canvas.height); c.strokeStyle = '#30c67c'; c.lineWidth = 3; c.beginPath();
              pts.forEach((p, i) => { const x = (i / 199) * canvas.width, y = canvas.height - ((p - 1) / Math.max(1.5, crashAt + 0.5)) * (canvas.height - 10) - 5; i ? c.lineTo(x, y) : c.moveTo(x, y); });
              c.stroke();
              if (m >= crashAt) { running = false; frameOff?.(); mult.textContent = crashAt.toFixed(2) + '× CRASH'; mult.classList.add('is-crashed'); result(false, `Crashed. −${fmt(bet)}.`); btn.textContent = 'Place bet'; }
            });
          } else { running = false; frameOff?.(); const win = Math.round(bet * m); casinoWin(win); result(true, `Cashed out at ${m.toFixed(2)}× for ${fmt(win)}.`); btn.textContent = 'Place bet'; }
        });
      } else if (g === 'coin') {
        game.innerHTML = `${bets()}<div class="coin">?</div><div class="casino__result"></div><div class="bets"><button class="btn btn--money" type="button" data-pick="H">Heads</button><button class="btn btn--money" type="button" data-pick="T">Tails</button></div>`;
        wireBets();
        const coin = game.querySelector<HTMLElement>('.coin')!;
        game.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => {
          if (!take()) return;
          coin.classList.remove('flip'); void coin.offsetWidth; coin.classList.add('flip');
          setTimeout(() => { const r = Math.random() < 0.5 ? 'H' : 'T'; coin.textContent = r; if (r === b.dataset.pick) { casinoWin(bet * 2); result(true, `+${fmt(bet)}`); } else result(false, `−${fmt(bet)}`); }, 1000);
        }));
      } else if (g === 'dice') {
        game.innerHTML = `${bets()}<div class="dice">—</div><div class="casino__result"></div><div class="bets"><button class="btn btn--money" type="button" data-side="under">Under 50 (×1.9)</button><button class="btn btn--money" type="button" data-side="over">Over 50 (×1.9)</button><button class="btn btn--money" type="button" data-side="exact">Exactly 50 (×50)</button></div>`;
        wireBets();
        const dice = game.querySelector<HTMLElement>('.dice')!;
        game.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((b) => b.addEventListener('click', () => {
          if (!take()) return;
          const roll = 1 + Math.floor(Math.random() * 100); dice.textContent = String(roll);
          const side = b.dataset.side; const win = side === 'under' ? roll < 50 : side === 'over' ? roll > 50 : roll === 50;
          if (win) { const amount = Math.round(bet * (side === 'exact' ? 50 : 1.9)); casinoWin(amount); result(true, `+${fmt(amount - bet)}`); } else result(false, `−${fmt(bet)}`);
        }));
      } else if (g === 'slots') {
        const SYM = ['🥔', '🌙', '☀️', '🫘', '👻', '🪙'];
        game.innerHTML = `${bets()}<div class="reels"><div class="reel">🥔</div><div class="reel">🌙</div><div class="reel">☀️</div></div><div class="casino__result"></div><button class="btn btn--money" type="button" data-spin>Spin</button><p class="casino__fine">Three potatoes ×20 · any three ×8 · two potatoes ×2</p>`;
        wireBets();
        const reels = [...game.querySelectorAll<HTMLElement>('.reel')], btn = game.querySelector<HTMLButtonElement>('[data-spin]')!;
        btn.addEventListener('click', () => {
          if (!take()) return;
          btn.disabled = true; reels.forEach((r) => r.classList.add('spin'));
          const out: string[] = [];
          reels.forEach((r, i) => setTimeout(() => { r.classList.remove('spin'); const s = SYM[Math.floor(Math.random() * SYM.length)]; r.textContent = s; out.push(s); sfx.click();
            if (i === 2) { const potatoes = out.filter((x) => x === '🥔').length; let m = 0; if (out[0] === out[1] && out[1] === out[2]) m = out[0] === '🥔' ? 20 : 8; else if (potatoes === 2) m = 2;
              if (m) { casinoWin(bet * m); result(true, `+${fmt(bet * m - bet)}`); if (m === 20) sfx.jackpot(); } else result(false, `−${fmt(bet)}`); btn.disabled = false; } }, 500 + i * 400));
        });
      } else if (g === 'mines') {
        // 5×5, five potatoes buried; every safe tile raises the multiplier; cash out before you dig one up
        game.innerHTML = `${bets()}<div class="mines__top"><span class="mines__mult tabular">1.00×</span><button class="btn btn--money" type="button" data-start>Start (5 potatoes buried)</button></div><div class="mines" aria-label="Minefield"></div><div class="casino__result"></div>`;
        wireBets();
        const grid = game.querySelector<HTMLElement>('.mines')!, multEl = game.querySelector<HTMLElement>('.mines__mult')!, btn = game.querySelector<HTMLButtonElement>('[data-start]')!;
        let mines = new Set<number>(), safe = 0, live = false;
        const mult = () => +Math.pow(1.22, safe).toFixed(2);
        const drawGrid = (reveal = false) => { grid.innerHTML = Array.from({ length: 25 }, (_, i) => `<button type="button" class="mine ${reveal && mines.has(i) ? 'mine--boom' : ''}" data-i="${i}" ${!live ? 'disabled' : ''}>${reveal && mines.has(i) ? '🥔' : ''}</button>`).join('');
          grid.querySelectorAll<HTMLButtonElement>('.mine').forEach((b) => b.addEventListener('click', () => {
            if (!live || b.classList.contains('mine--open')) return;
            const i = Number(b.dataset.i);
            if (mines.has(i)) { live = false; drawGrid(true); result(false, `A potato. −${fmt(bet)}.`); btn.textContent = 'Start (5 potatoes buried)'; return; }
            b.classList.add('mine--open'); b.textContent = '💎'; safe++; multEl.textContent = mult().toFixed(2) + '×'; sfx.click();
            if (safe === 20) { live = false; const win = Math.round(bet * mult()); casinoWin(win); result(true, `Cleared the field for ${fmt(win)}.`); btn.textContent = 'Start (5 potatoes buried)'; }
          })); };
        btn.addEventListener('click', () => {
          if (live) { live = false; const win = Math.round(bet * mult()); casinoWin(win); result(true, `Cashed out at ${mult().toFixed(2)}× for ${fmt(win)}.`); btn.textContent = 'Start (5 potatoes buried)'; drawGrid(true); return; }
          if (!take()) return;
          mines = new Set(); while (mines.size < 5) mines.add(Math.floor(Math.random() * 25)); safe = 0; live = true; multEl.textContent = '1.00×'; btn.textContent = 'Cash out'; drawGrid();
        });
        drawGrid();
      } else if (g === 'plinko') {
        // a potato bounces down twelve rows of pegs into a multiplier slot
        const SLOTS = [16, 5, 2, 1, 0.5, 0.3, 0.2, 0.3, 0.5, 1, 2, 5, 16];
        game.innerHTML = `${bets()}<canvas class="plinko" width="480" height="260"></canvas><div class="plinko__slots">${SLOTS.map((m) => `<span class="${m >= 5 ? 'hot' : m < 1 ? 'cold' : ''}">${m}×</span>`).join('')}</div><div class="casino__result"></div><button class="btn btn--money" type="button" data-drop>Drop a potato</button>`;
        wireBets();
        const canvas = game.querySelector<HTMLCanvasElement>('canvas')!, c = canvas.getContext('2d')!, btn = game.querySelector<HTMLButtonElement>('[data-drop]')!;
        const ROWS = 12, W = canvas.width, H = canvas.height, dx = W / (ROWS + 2), dy = (H - 30) / ROWS;
        const pegs = () => { c.fillStyle = '#0b1120'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffd166'; for (let r = 0; r < ROWS; r++) for (let i = 0; i <= r; i++) { c.beginPath(); c.arc(W / 2 + (i - r / 2) * dx, 20 + r * dy, 3, 0, 7); c.fill(); } };
        pegs();
        btn.addEventListener('click', () => {
          if (!take()) return;
          btn.disabled = true;
          let pos = 0, row = 0;
          const path: number[] = [];
          for (let r = 0; r < ROWS; r++) { pos += Math.random() < 0.5 ? -0.5 : 0.5; path.push(pos); }
          const slot = Math.round(pos + ROWS / 2);
          const iv = setInterval(() => {
            pegs(); const p = path[Math.min(row, ROWS - 1)]; c.fillStyle = '#c8a44a'; c.beginPath(); c.arc(W / 2 + p * dx, 20 + Math.min(row, ROWS) * dy, 8, 0, 7); c.fill(); sfx.type();
            if (++row > ROWS) { clearInterval(iv); const m = SLOTS[Math.max(0, Math.min(SLOTS.length - 1, slot))]; const win = Math.round(bet * m); if (win > 0) casinoWin(win); result(m >= 1, `${m}× · ${win >= bet ? '+' + fmt(win - bet) : '−' + fmt(bet - win)}`); if (m >= 16) sfx.jackpot(); btn.disabled = false; }
          }, 110);
        });
      } else if (g === 'keno') {
        // pick up to five of forty; ten are drawn; the more hits, the bigger the pay
        const PAY: Record<number, number[]> = { 1: [0, 3], 2: [0, 1, 6], 3: [0, 0, 2, 20], 4: [0, 0, 1, 5, 60], 5: [0, 0, 0, 3, 15, 200] };
        game.innerHTML = `${bets()}<div class="keno">${Array.from({ length: 40 }, (_, i) => `<button type="button" class="keno__n" data-n="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('')}</div><div class="casino__result"></div><div class="bets"><button class="btn btn--money" type="button" data-draw>Draw ten</button><button class="btn" type="button" data-clear>Clear</button></div><p class="casino__fine">Pick 1–5 numbers. Five picks: 3 hits ×3 · 4 hits ×15 · 5 hits ×200.</p>`;
        wireBets();
        const picks = new Set<number>();
        const cells = [...game.querySelectorAll<HTMLButtonElement>('.keno__n')];
        cells.forEach((b) => b.addEventListener('click', () => { const n = Number(b.dataset.n); if (picks.has(n)) picks.delete(n); else if (picks.size < 5) picks.add(n); else return; b.setAttribute('aria-pressed', String(picks.has(n))); sfx.click(); }));
        game.querySelector('[data-clear]')!.addEventListener('click', () => { picks.clear(); cells.forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.classList.remove('keno__n--hit', 'keno__n--drawn'); }); });
        game.querySelector('[data-draw]')!.addEventListener('click', () => {
          if (!picks.size) { toast('Pick at least one number.', 'info'); return; }
          if (!take()) return;
          cells.forEach((b) => b.classList.remove('keno__n--hit', 'keno__n--drawn'));
          const drawn = new Set<number>(); while (drawn.size < 10) drawn.add(1 + Math.floor(Math.random() * 40));
          let hits = 0; cells.forEach((b) => { const n = Number(b.dataset.n); if (drawn.has(n)) { b.classList.add(picks.has(n) ? 'keno__n--hit' : 'keno__n--drawn'); if (picks.has(n)) hits++; } });
          const m = PAY[picks.size][hits] ?? 0; const win = bet * m; if (win) casinoWin(win);
          result(m > 0, `${hits} hit${hits === 1 ? '' : 's'} · ${win ? '+' + fmt(win - bet) : '−' + fmt(bet)}`); if (m >= 60) sfx.jackpot();
        });
      } else if (g === 'roulette') {
        const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
        game.innerHTML = `${bets()}<div class="wheel"><div class="wheel__ball tabular">—</div></div><div class="casino__result"></div><div class="bets"><button class="btn" type="button" data-r="red" style="--btn-bg:#d12f2f;--btn-ink:#fff">Red ×2</button><button class="btn" type="button" data-r="black" style="--btn-bg:#1a1a1a;--btn-ink:#fff">Black ×2</button><button class="btn" type="button" data-r="green" style="--btn-bg:#1d8a3e;--btn-ink:#fff">Zero ×36</button><label class="roulette__num">Number <input type="number" min="0" max="36" value="17" /> <button class="btn btn--money" type="button" data-r="num">×36</button></label></div>`;
        wireBets();
        const ball = game.querySelector<HTMLElement>('.wheel__ball')!, num = game.querySelector<HTMLInputElement>('input')!;
        game.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => b.addEventListener('click', () => {
          if (!take()) return;
          const n = Math.floor(Math.random() * 37);
          const colour = n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';
          let t = 0; const iv = setInterval(() => { ball.textContent = String(Math.floor(Math.random() * 37)); if (++t > 12) { clearInterval(iv); ball.textContent = String(n); ball.dataset.colour = colour;
            const kind = b.dataset.r; const win = kind === 'num' ? Number(num.value) === n : kind === colour;
            const m = kind === 'red' || kind === 'black' ? 2 : 36; if (win) casinoWin(bet * m);
            result(win, `${n} ${colour}. ${win ? '+' + fmt(bet * m - bet) : '−' + fmt(bet)}`); if (win && m === 36) sfx.jackpot(); } }, 80);
        }));
      } else if (g === 'blackjack') {
        game.innerHTML = `${bets()}<div class="table"><div class="hand"><span class="hand__label">Dealer <b class="tabular"></b></span><div class="cards" data-dealer></div></div><div class="hand"><span class="hand__label">You <b class="tabular"></b></span><div class="cards" data-you></div></div></div><div class="casino__result"></div><div class="bets"><button class="btn btn--money" type="button" data-deal>Deal</button><button class="btn" type="button" data-hit disabled>Hit</button><button class="btn" type="button" data-stand disabled>Stand</button></div>`;
        wireBets();
        const dEl = game.querySelector<HTMLElement>('[data-dealer]')!, yEl = game.querySelector<HTMLElement>('[data-you]')!, dV = game.querySelectorAll<HTMLElement>('.hand__label b')[0], yV = game.querySelectorAll<HTMLElement>('.hand__label b')[1];
        const deal = game.querySelector<HTMLButtonElement>('[data-deal]')!, hit = game.querySelector<HTMLButtonElement>('[data-hit]')!, stand = game.querySelector<HTMLButtonElement>('[data-stand]')!;
        let d: Card[] = [], you: Card[] = [], dealer: Card[] = [], live = false;
        const show = (hole: boolean) => { dEl.innerHTML = dealer.map((c, i) => cardHtml(c, hole && i === 1)).join(''); yEl.innerHTML = you.map((c) => cardHtml(c)).join(''); dV.textContent = hole ? String(bjValue([dealer[0]])) : String(bjValue(dealer)); yV.textContent = String(bjValue(you)); };
        const end = (text: string, win: boolean, mult = 2) => { live = false; hit.disabled = stand.disabled = true; deal.disabled = false; show(false); if (win) casinoWin(Math.round(bet * mult)); result(win, text); };
        deal.addEventListener('click', () => {
          if (!take()) return;
          d = deck(); you = [d.pop()!, d.pop()!]; dealer = [d.pop()!, d.pop()!]; live = true; deal.disabled = true; hit.disabled = stand.disabled = false; show(true);
          if (bjValue(you) === 21) end(`Blackjack. +${fmt(Math.round(bet * 1.5))}`, true, 2.5);
        });
        hit.addEventListener('click', () => { if (!live) return; you.push(d.pop()!); show(true); sfx.click(); if (bjValue(you) > 21) end(`Bust. −${fmt(bet)}`, false); });
        stand.addEventListener('click', () => { if (!live) return; while (bjValue(dealer) < 17) dealer.push(d.pop()!); const dv = bjValue(dealer), yv = bjValue(you); if (dv > 21 || yv > dv) end(`You win. +${fmt(bet)}`, true); else if (yv === dv) { casinoWin(bet); end('Push. Your bet is back.', false); } else end(`Dealer has ${dv}. −${fmt(bet)}`, false); });
        show(false);
      } else if (g === 'baccarat') {
        game.innerHTML = `${bets()}<div class="table"><div class="hand"><span class="hand__label">Player <b class="tabular"></b></span><div class="cards" data-p></div></div><div class="hand"><span class="hand__label">Banker <b class="tabular"></b></span><div class="cards" data-b></div></div></div><div class="casino__result"></div><div class="bets"><button class="btn btn--money" type="button" data-on="player">Player ×2</button><button class="btn btn--money" type="button" data-on="banker">Banker ×1.95</button><button class="btn btn--money" type="button" data-on="tie">Tie ×9</button></div>`;
        wireBets();
        const pEl = game.querySelector<HTMLElement>('[data-p]')!, bEl = game.querySelector<HTMLElement>('[data-b]')!, pV = game.querySelectorAll<HTMLElement>('.hand__label b')[0], bV = game.querySelectorAll<HTMLElement>('.hand__label b')[1];
        game.querySelectorAll<HTMLButtonElement>('[data-on]').forEach((b) => b.addEventListener('click', () => {
          if (!take()) return;
          const d = deck(); const p = [d.pop()!, d.pop()!], bk = [d.pop()!, d.pop()!];
          if (bacValue(p) < 8 && bacValue(bk) < 8) { if (bacValue(p) <= 5) p.push(d.pop()!); if (bacValue(bk) <= 5) bk.push(d.pop()!); }
          pEl.innerHTML = p.map((c) => cardHtml(c)).join(''); bEl.innerHTML = bk.map((c) => cardHtml(c)).join(''); pV.textContent = String(bacValue(p)); bV.textContent = String(bacValue(bk));
          const pv = bacValue(p), bv = bacValue(bk); const outcome = pv === bv ? 'tie' : pv > bv ? 'player' : 'banker';
          const on = b.dataset.on!; const win = on === outcome; const m = on === 'tie' ? 9 : on === 'banker' ? 1.95 : 2;
          if (win) casinoWin(Math.round(bet * m)); else if (outcome === 'tie' && on !== 'tie') casinoWin(bet);
          result(win, `${outcome === 'tie' ? 'A tie' : outcome.charAt(0).toUpperCase() + outcome.slice(1) + ' wins'} ${pv}–${bv}. ${win ? '+' + fmt(Math.round(bet * m) - bet) : outcome === 'tie' ? 'Your bet is back.' : '−' + fmt(bet)}`);
        }));
      } else {
        // video poker, Jacks or better: deal five, hold what you like, draw
        game.innerHTML = `${bets()}<div class="cards cards--poker" data-hand></div><div class="casino__result"></div><div class="bets"><button class="btn btn--money" type="button" data-deal>Deal</button><button class="btn" type="button" data-draw disabled>Draw</button></div><p class="casino__fine">Jacks or better ×1 · two pair ×2 · three ×3 · straight ×4 · flush ×6 · full house ×9 · four ×25 · straight flush ×50 · royal ×250</p>`;
        wireBets();
        const handEl = game.querySelector<HTMLElement>('[data-hand]')!, deal = game.querySelector<HTMLButtonElement>('[data-deal]')!, draw = game.querySelector<HTMLButtonElement>('[data-draw]')!;
        let d: Card[] = [], hand: Card[] = [], held = new Set<number>(), live = false;
        const show = () => { handEl.innerHTML = hand.map((c, i) => `<button type="button" class="card__btn" data-i="${i}" ${live ? '' : 'disabled'}>${cardHtml(c, false, held.has(i))}<small>${held.has(i) ? 'HELD' : 'hold'}</small></button>`).join('');
          handEl.querySelectorAll<HTMLButtonElement>('.card__btn').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.i); if (held.has(i)) held.delete(i); else held.add(i); sfx.click(); show(); })); };
        deal.addEventListener('click', () => { if (!take()) return; d = deck(); hand = [d.pop()!, d.pop()!, d.pop()!, d.pop()!, d.pop()!]; held = new Set(); live = true; deal.disabled = true; draw.disabled = false; show(); });
        draw.addEventListener('click', () => { if (!live) return; hand = hand.map((c, i) => held.has(i) ? c : d.pop()!); live = false; show(); const [name, m] = pokerRank(hand); if (m) casinoWin(bet * (m + 1)); result(m > 0, `${name}. ${m ? '+' + fmt(bet * m) : '−' + fmt(bet)}`); if (m >= 50) sfx.jackpot(); deal.disabled = false; draw.disabled = true; });
      }
    };
    body.querySelectorAll<HTMLButtonElement>('.casino__tab').forEach((b) => b.addEventListener('click', () => { body.querySelectorAll('.casino__tab').forEach((x) => x.setAttribute('aria-selected', 'false')); b.setAttribute('aria-selected', 'true'); g = b.dataset.g as Game; render(); }));
    render();
  });
} });
