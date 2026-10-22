// Character Creator: make your own callers (saved in this browser, JSON import/export).
import { addCustomCaller, customCallers, removeCustomCaller } from '../../game/callers';
import type { Caller } from '../../game/brain/types';
import { SCAMS } from '../../game/scams';
import { portraitHTML, type PortraitKind } from '../portrait';
import { icon } from '../icons';
import { registerApp } from '../registry';
import { openWindow } from '../windows';
import { toast } from '../../ui/toast';
import { speak, voiceFor } from '../../game/speech';

const KINDS: PortraitKind[] = ['human', 'initials', 'cat', 'raccoon', 'goose', 'bear', 'robot', 'toaster', 'ghost', 'alien', 'moon', 'cloud', 'trenchcoat'];
const ARCHES = ['creature', 'machine', 'spirit', 'legend', 'cosmic'] as const;
// bundled packs in public/packs offered on the Starter packs row (none at the moment: the VIP genres pack was
// removed on 2026-10-20 at Luca's request; the row only renders when this list has something in it)
const PACKS: { file: string; name: string; blurb: string }[] = [];

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
const words = (s: string) => s.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
const lines = (s: string) => s.split(/\n/).map((w) => w.trim()).filter(Boolean);

registerApp({ id: 'creator', name: 'Character Creator', color: '#e9c84a', glyph: 'krull', kind: 'side', open: () => {
  openWindow({ id: 'creator', title: 'Character Creator — make a caller', glyph: icon('krull'), color: '#e9c84a', w: 760, h: 620 }, (body) => {
    const render = () => {
      body.innerHTML = `<div class="creator">
        <form class="creator__form">
          <div class="creator__cols">
            <div class="creator__col">
              <label>Name<input name="name" type="text" required maxlength="40" placeholder="Captain Soup" /></label>
              <label>Who they are (one sentence)<input name="gimmick" type="text" required maxlength="160" placeholder="A retired sea captain who only speaks in soup metaphors." /></label>
              <label>Kind<select name="archetype">${ARCHES.map((a) => `<option value="${a}">${a}</option>`).join('')}</select></label>
              <label>Drawing (when there is no photo)<select name="kind">${KINDS.map((k) => `<option value="${k}">${k}</option>`).join('')}</select></label>
              <label>Photo: a URL<input name="photo" type="url" placeholder="https://…/portrait.jpg" /></label>
              <label class="creator__file">…or pick a photo from this computer (kept in this browser, 256 px)<input type="file" accept="image/*" data-photo /></label>
              <div class="creator__row"><label>Skin<input name="skin" type="color" value="#f1c27d" /></label><label>Hair<input name="hair" type="color" value="#4a2f1a" /></label><label>Shirt<input name="shirt" type="color" value="#2bb3a3" /></label></div>
              <label>World words (comma separated — saying these warms them up)<input name="world" type="text" required placeholder="soup, ladle, broth, harbour, storm, crouton" /></label>
              <label>Their question<input name="question" type="text" required placeholder="Have you ever tasted a storm?" /></label>
              <label>Words that count as an answer<input name="answer" type="text" required placeholder="yes, storm, tasted, salty" /></label>
            </div>
            <div class="creator__col">
              <label>Opening lines (one per line)<textarea name="openers" rows="3" required placeholder="Soup's on. Who's this?&#10;Captain Soup speaking, the broth is thickening."></textarea></label>
              <label>Quirks (one per line)<textarea name="quirks" rows="3" placeholder="Hold on, the ladle's gone overboard.&#10;Every problem is a soup problem."></textarea></label>
              <div class="creator__row"><label>Verbal tics (comma separated, optional)<input name="tics" type="text" placeholder="Arr., Ahoy., (ladle clatters)" /></label><label>How they talk (optional)<input name="talk" type="text" maxlength="160" placeholder="Barks like a sea captain, every metaphor is soup." /></label></div>
              <div class="creator__row"><label>Voice pitch<input name="pitch" type="range" min="0.5" max="1.8" step="0.05" value="1" /></label><label>Speed<input name="rate" type="range" min="0.7" max="1.4" step="0.05" value="1" /></label><label>Prefers<select name="prefer"><option value="">any voice</option><option value="female">female</option><option value="male">male</option></select></label></div>
              <div class="creator__row"><label>Starting mood<input name="mood0" type="number" min="10" max="80" value="48" /></label><label>Patience (s)<input name="patience" type="number" min="60" max="300" value="150" /></label><label>Budget $<input name="budget" type="number" min="100" max="2000" step="50" value="400" /></label></div>
              <fieldset class="creator__likes"><legend>Products they get excited about</legend>${SCAMS.map((s) => `<label class="check"><input type="checkbox" name="likes" value="${s.id}" /> ${s.name}</label>`).join('')}</fieldset>
            </div>
          </div>
          <div class="creator__preview"><div class="creator__portrait"></div><div><b class="creator__pname">Preview</b><div class="muted">Changes update the drawing. Hear the voice to tune it.</div><div class="row"><button type="button" class="btn" data-hear>Hear the voice</button><button type="submit" class="btn btn--money">Save caller</button></div></div></div>
        </form>
        <div class="creator__list"><h3>Your callers (${customCallers().length})</h3>${customCallers().length ? customCallers().map((c) => `<div class="creator__item"><span>${portraitHTML(c.id, c.portrait, c.name, 'calm', 40)}</span><b>${esc(c.name)}</b><span class="muted">${esc(c.gimmick)}</span><button type="button" class="btn btn--ghost" data-del="${c.id}" style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Remove</button></div>`).join('') : '<p class="muted">None yet. They join the call pool as soon as you save one.</p>'}
          <div class="row"><button type="button" class="btn btn--ghost" data-export style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Export JSON</button><label class="btn btn--ghost" style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Import JSON<input type="file" accept="application/json" data-import hidden /></label></div>
          ${PACKS.length ? `<h3>Starter packs</h3>
          <div class="creator__packs">${PACKS.map((p) => `<div class="creator__item"><b>${esc(p.name)}</b><span class="muted">${esc(p.blurb)}</span><button type="button" class="btn" data-pack="${p.file}">Load</button></div>`).join('')}</div>` : ''}
        </div></div>`;
      const form = body.querySelector<HTMLFormElement>('form')!;
      const preview = body.querySelector<HTMLElement>('.creator__portrait')!;
      // an uploaded photo is resized to 256 px and kept as a data URL with the caller
      let photoData = '';
      body.querySelector<HTMLInputElement>('[data-photo]')!.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; const s = Math.min(img.width, img.height); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256); photoData = c.toDataURL('image/jpeg', 0.82); URL.revokeObjectURL(url); draw(); };
        img.src = url;
      });
      const pname = body.querySelector<HTMLElement>('.creator__pname')!;
      const read = (): Caller => {
        const f = new FormData(form);
        const name = String(f.get('name') || 'Nameless');
        return {
          id: 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6),
          name, archetype: (f.get('archetype') as Caller['archetype']) || 'creature', gimmick: String(f.get('gimmick') || ''),
          world: words(String(f.get('world') || '')), openers: lines(String(f.get('openers') || '')), quirks: lines(String(f.get('quirks') || '')),
          question: String(f.get('question') || ''), answer: words(String(f.get('answer') || '')),
          voice: { pitch: Number(f.get('pitch')) || 1, rate: Number(f.get('rate')) || 1, prefer: (f.get('prefer') as 'male' | 'female') || undefined },
          mood0: Number(f.get('mood0')) || 48, patience: Number(f.get('patience')) || 150, likes: f.getAll('likes') as Caller['likes'],
          portrait: { kind: f.get('kind') as PortraitKind, skin: String(f.get('skin')), hair: String(f.get('hair')), shirt: String(f.get('shirt')), ...(photoData || String(f.get('photo') || '').trim() ? { photo: photoData || String(f.get('photo')).trim() } : {}) },
          budget: Number(f.get('budget')) || 400,
          ...(() => {
            const tics = String(f.get('tics') || '').split(',').map((t) => t.trim()).filter(Boolean);
            const talk = String(f.get('talk') || '').trim();
            return tics.length || talk ? { style: { ...(tics.length ? { tics } : {}), ...(talk ? { describe: talk } : {}) } } : {};
          })(),
        };
      };
      const draw = () => { const c = read(); preview.innerHTML = portraitHTML(c.id.replace(/-[a-z0-9]{4}$/, ''), c.portrait, c.name, 'calm', 120); pname.textContent = c.name; };
      form.addEventListener('input', draw);
      body.querySelector('[data-hear]')!.addEventListener('click', () => { const c = read(); speak(c.openers[0] || `Hello, this is ${c.name}.`, voiceFor(c), c.id); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const c = read();
        if (!c.openers.length) { toast('Give them at least one opening line.', 'danger'); return; }
        if (c.world.length < 3) { toast('Give them at least three world words.', 'danger'); return; }
        addCustomCaller(c);
        toast(`${c.name} joined the caller pool.`, 'money');
        render();
      });
      body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', () => { removeCustomCaller(b.dataset.del!); render(); }));
      body.querySelector('[data-export]')!.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(customCallers(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hold-please-callers.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      body.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Loading…';
        try {
          const res = await fetch('/packs/' + b.dataset.pack);
          const arr = JSON.parse(await res.text()) as Caller[];
          const have = new Set(customCallers().map((c) => c.id));
          let n = 0; for (const c of Array.isArray(arr) ? arr : []) if (c && c.id && c.name && c.openers?.length && !have.has(c.id)) { addCustomCaller(c); n++; }
          toast(n ? `${n} caller${n === 1 ? '' : 's'} joined the pool.` : 'That pack is already loaded.', 'money'); render();
        } catch { toast('Could not load that pack.', 'danger'); b.disabled = false; b.textContent = 'Load'; }
      }));
      body.querySelector<HTMLInputElement>('[data-import]')!.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        try {
          const arr = JSON.parse(await file.text()) as Caller[];
          let n = 0; for (const c of Array.isArray(arr) ? arr : []) if (c && c.name && c.openers?.length) { addCustomCaller({ ...c, id: c.id || 'custom-' + Math.random().toString(36).slice(2, 8) }); n++; }
          toast(`Imported ${n} caller${n === 1 ? '' : 's'}.`, 'money'); render();
        } catch { toast('That file is not a caller JSON.', 'danger'); }
      });
      draw();
    };
    render();
  });
} });
