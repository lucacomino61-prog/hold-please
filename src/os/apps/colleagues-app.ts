// Colleague Creator: make your own colleagues the way you make callers. Each one takes the seat of Teodora, Jun or
// Baxter from the next run: name, look, voice, pace, how often a transferred call closes, and every line they say.
import { customColleagues, saveCustomColleagues, type CustomColleague } from '../../game/colleagues';
import { OUTFIT_NAMES, OUTFITS, SCALP_NAMES, SCALPS, BEARDS } from '../../game/avatar';
import { speak } from '../../game/speech';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
const lines = (s: string) => s.split(/\n/).map((w) => w.trim()).filter(Boolean);

registerApp({ id: 'colleagues', name: 'Colleague Creator', color: '#2bb3a3', glyph: 'krull', kind: 'side', open: () => {
  openWindow({ id: 'colleagues', title: 'Colleague Creator — the next desk', glyph: icon('krull'), color: '#2bb3a3', w: 780, h: 640 }, (body) => {
    const render = () => {
      const list = customColleagues();
      body.innerHTML = `<div class="creator">
        <form class="creator__form colleague__form">
          <div class="creator__cols">
            <div class="creator__col">
              <label>Takes the desk of<select name="replaces">${['Teodora', 'Jun', 'Baxter'].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
              <label>Name<input name="name" type="text" required maxlength="24" placeholder="Marta" /></label>
              <label>One line about them<input name="bio" type="text" maxlength="160" placeholder="Closes everything. Has never once said hello." /></label>
              <div class="creator__row"><label>Body<select name="body"><option value="man">Man</option><option value="woman">Woman</option></select></label><label>Outfit<select name="outfit">${OUTFITS.map((o) => `<option value="${o}">${OUTFIT_NAMES[o]}</option>`).join('')}</select></label><label>Hair style<select name="hairStyle"><option value="0">Style 1</option><option value="1">Style 2</option><option value="2">Style 3</option></select></label></div>
              <div class="creator__row"><label>Scalp<select name="scalp">${SCALPS.map((s) => `<option value="${s}">${SCALP_NAMES[s]}</option>`).join('')}</select></label><label>Face<select name="beard">${BEARDS.map((b, i) => `<option value="${i}">${b}</option>`).join('')}</select></label><label>Shirt<input name="shirt" type="color" value="#2bb3a3" /></label><label>Hair<input name="hair" type="color" value="#4a2f1a" /></label></div>
              <div class="creator__row"><label class="check"><input type="checkbox" name="unibrow" /> Unibrow</label><label class="check"><input type="checkbox" name="glasses" /> Glasses</label><label class="check"><input type="checkbox" name="shades" /> Shades</label><label class="check"><input type="checkbox" name="chain" /> Gold chain</label></div>
              <div class="creator__row"><label>Voice pitch<input name="pitch" type="range" min="0.5" max="1.8" step="0.05" value="1" /></label><label>Speed<input name="rate" type="range" min="0.7" max="1.4" step="0.05" value="1" /></label><label>Prefers<select name="prefer"><option value="">any voice</option><option value="female">female</option><option value="male">male</option></select></label></div>
              <div class="creator__row"><label>Pace (sales per shift, 1 = normal)<input name="pace" type="number" min="0.2" max="2" step="0.05" value="1" /></label><label>Closes a transferred call<input name="closeRate" type="number" min="0" max="0.9" step="0.05" value="0.4" /></label></div>
            </div>
            <div class="creator__col">
              <label>When they close a sale (one per line)<textarea name="sale" rows="2" placeholder="Closed. Next.&#10;Another one for the board."></textarea></label>
              <label>When you close one<textarea name="yourSale" rows="2" placeholder="Not bad. I did that twice."></textarea></label>
              <label>When you stop in front of them<textarea name="floor" rows="2" placeholder="The phones are over there."></textarea></label>
              <label>Muttered into the headset<textarea name="mutter" rows="2" placeholder="Hold please. No. Hold."></textarea></label>
              <label>After a transfer, when they closed it<textarea name="ok" rows="2" placeholder="Closed your {caller}. Your cut is on the board."></textarea></label>
              <label>After a transfer, when they lost it<textarea name="fail" rows="2" placeholder="{caller} hung up on me. What did you say to them?"></textarea></label>
            </div>
          </div>
          <div class="creator__preview"><div><b>They sit down at the next run.</b><div class="muted">The look uses the same rig as yours; the voice is the browser's.</div><div class="row"><button type="button" class="btn" data-hear>Hear the voice</button><button type="submit" class="btn btn--money">Save colleague</button></div></div></div>
        </form>
        <div class="creator__list"><h3>Your colleagues (${list.length})</h3>${list.length ? list.map((c, i) => `<div class="creator__item"><b>${esc(c.name)}</b><span class="muted">takes ${esc(c.replaces)}'s desk · ${esc(c.profile.bio)}</span><button type="button" class="btn btn--ghost" data-del="${i}" style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Remove</button></div>`).join('') : '<p class="muted">None yet. Teodora, Jun and Baxter keep their desks.</p>'}</div></div>`;
      const form = body.querySelector<HTMLFormElement>('form')!;
      const read = (): CustomColleague => {
        const f = new FormData(form);
        const s = (k: string) => String(f.get(k) || '');
        return {
          name: s('name').trim() || 'Colleague', replaces: s('replaces') || 'Teodora', shirt: s('shirt'),
          look: { body: s('body'), outfit: s('outfit'), hairStyle: Number(s('hairStyle')), scalp: s('scalp'), beard: Number(s('beard')), hair: s('hair'), unibrow: f.get('unibrow') === 'on', glasses: f.get('glasses') === 'on', shades: f.get('shades') === 'on', chain: f.get('chain') === 'on' },
          profile: {
            bio: s('bio') || 'A colleague. Sits there.', voice: { pitch: Number(s('pitch')) || 1, rate: Number(s('rate')) || 1, ...(s('prefer') ? { prefer: s('prefer') as 'male' | 'female' } : {}) },
            pace: Number(s('pace')) || 1, closeRate: Number(s('closeRate')) || 0,
            sale: lines(s('sale')), yourSale: lines(s('yourSale')), floor: lines(s('floor')), mutter: lines(s('mutter')), review: [],
            transfer: { ok: lines(s('ok')), fail: lines(s('fail')) },
          },
        };
      };
      body.querySelector('[data-hear]')!.addEventListener('click', () => { const c = read(); speak(c.profile.floor[0] || c.profile.sale[0] || `Hi, I am ${c.name}. I sit next to you.`, c.profile.voice, 'colleague-' + c.name); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const c = read();
        if (!c.profile.sale.length && !c.profile.floor.length) { toast('Give them at least one thing to say.', 'danger'); return; }
        const list = customColleagues().filter((x) => x.replaces !== c.replaces && x.name !== c.name);
        list.push(c);
        saveCustomColleagues(list);
        toast(`${c.name} takes ${c.replaces}'s desk from the next run.`, 'money', 4000);
        render();
      });
      body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', () => { const list = customColleagues(); list.splice(Number(b.dataset.del), 1); saveCustomColleagues(list); render(); }));
    };
    render();
  });
} });
