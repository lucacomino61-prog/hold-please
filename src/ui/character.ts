// The clock-in desk: name, look, a microphone test and a sample caller voice, then into the office.
import { saveSettings, settings } from '../game/state';
import { BEARDS, getAvatar, HAIR_NAMES, HAIRS, OUTFIT_NAMES, OUTFITS, SCALP_NAMES, SCALPS, setAvatar, SHIRTS, SKINS, type Avatar } from '../game/avatar';
import { canListen, listenOnce, speak, stopSpeaking } from '../game/speech';
import { ROSTER } from '../game/callers';
import { portraitSVG, specFor } from '../os/portrait';
import { sfx } from '../game/sound';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

export function showCharacterSetup(): Promise<void> {
  return new Promise((resolve) => {
    const a: Avatar = getAvatar();
    const wrap = document.createElement('div');
    wrap.className = 'screen character';
    wrap.setAttribute('aria-label', 'Clock-in desk');
    const swatches = (name: string, list: string[], current: string) => list.map((c) => `<button type="button" class="swatch" data-${name}="${c}" style="--c:${c}" aria-label="${name} ${c}" aria-pressed="${c === current}"></button>`).join('');
    wrap.innerHTML = `<div class="panel panel--wide" role="dialog" aria-labelledby="ch-title">
      <div class="character__cols">
        <div class="character__preview"><div class="character__portrait"></div><div class="fine">This is you on the floor. The headset is mandatory.</div></div>
        <div class="character__form">
          <h2 id="ch-title">Clock-in desk</h2>
          <p>Sunrise Customer Care needs a name for the badge and a face for the floor.</p>
          <label>Name on the badge<input type="text" name="name" maxlength="24" value="${esc(settings.playerName === 'Agent' ? '' : settings.playerName)}" placeholder="Agent" autocomplete="nickname" /></label>
          <div class="character__row"><span class="character__label">Body</span><div class="cluster" style="--cluster-space:.3rem">${(['man', 'woman'] as const).map((b) => `<button type="button" class="chip" data-body="${b}" aria-pressed="${b === a.body}">${b === 'man' ? 'Man' : 'Woman'}</button>`).join('')}</div></div>
          <div class="character__row"><span class="character__label">Outfit</span><div class="cluster" style="--cluster-space:.3rem">${OUTFITS.map((o) => `<button type="button" class="chip" data-outfit="${o}" aria-pressed="${o === a.outfit}">${OUTFIT_NAMES[o]}</button>`).join('')}</div></div>
          <div class="character__row"><span class="character__label">Colour</span><div class="swatches">${swatches('shirt', SHIRTS, a.shirt)}</div></div>
          <div class="character__row"><span class="character__label">Skin</span><div class="swatches">${swatches('skin', SKINS, a.skin)}</div></div>
          <div class="character__row"><span class="character__label">Hair</span><div class="swatches">${swatches('hair', HAIRS, a.hair)}</div></div>
          <div class="character__row"><span class="character__label">Style</span><div class="cluster" style="--cluster-space:.3rem">${[0, 1, 2].map((i) => `<button type="button" class="chip" data-style="${i}" aria-pressed="${i === a.hairStyle}">${HAIR_NAMES[a.body][i]}</button>`).join('')}${SCALPS.map((s) => `<button type="button" class="chip" data-scalp="${s}" aria-pressed="${s === a.scalp}">${SCALP_NAMES[s]}</button>`).join('')}</div></div>
          <div class="character__row"><span class="character__label">Face</span><div class="cluster" style="--cluster-space:.3rem">${BEARDS.map((s, i) => `<button type="button" class="chip" data-beard="${i}" aria-pressed="${i === a.beard}">${s}</button>`).join('')}</div></div>
          <div class="cluster" style="--cluster-space:1rem">
            <label class="check"><input type="checkbox" name="unibrow" ${a.unibrow ? 'checked' : ''} /> Unibrow</label>
            <label class="check"><input type="checkbox" name="glasses" ${a.glasses ? 'checked' : ''} /> Glasses</label>
            <label class="check"><input type="checkbox" name="shades" ${a.shades ? 'checked' : ''} /> Shades</label>
            <label class="check"><input type="checkbox" name="chain" ${a.chain ? 'checked' : ''} /> Gold chain</label>
          </div>
          <h3>Headset check</h3>
          <div class="character__mic">
            <button type="button" class="btn" data-mic ${canListen() ? '' : 'disabled'}>${canListen() ? 'Hold to test the microphone' : 'Microphone needs Chrome or Edge'}</button>
            <button type="button" class="btn btn--ghost" data-hear style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">Hear a caller</button>
            <div class="character__heard fine" aria-live="polite">Typing always works; the mic is optional.</div>
          </div>
          <div class="panel__actions"><button type="button" class="btn btn--amber btn--big" data-go>Enter the office</button></div>
        </div>
      </div></div>`;
    document.body.appendChild(wrap);
    const portrait = wrap.querySelector<HTMLElement>('.character__portrait')!;
    const nameInput = wrap.querySelector<HTMLInputElement>('input[name=name]')!;
    const glasses = wrap.querySelector<HTMLInputElement>('input[name=glasses]')!;
    const shades = wrap.querySelector<HTMLInputElement>('input[name=shades]')!;
    const chain = wrap.querySelector<HTMLInputElement>('input[name=chain]')!;
    const draw = () => { portrait.innerHTML = portraitSVG(specFor('you', { kind: 'human', skin: a.skin, hair: a.hair, shirt: a.shirt, hairStyle: (a.scalp === 'bald' ? 0 : a.hairStyle + 1) as 0 | 1 | 2 | 3, glasses: a.glasses || a.shades, hat: 0, moustache: a.body === 'man' && a.beard > 0, headset: true, age: 'adult', freckles: false, earrings: a.body === 'woman' }), 'calm', 150); };
    const press = (sel: string, on: (b: HTMLButtonElement) => boolean) => wrap.querySelectorAll<HTMLButtonElement>(sel).forEach((x) => x.setAttribute('aria-pressed', String(on(x))));
    wrap.querySelectorAll<HTMLButtonElement>('[data-body]').forEach((b) => b.addEventListener('click', () => {
      a.body = b.dataset.body as Avatar['body'];
      press('[data-body]', (x) => x.dataset.body === a.body);
      wrap.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((x) => { x.textContent = HAIR_NAMES[a.body][Number(x.dataset.style)]; });
      sfx.click(); draw();
    }));
    wrap.querySelectorAll<HTMLButtonElement>('[data-outfit]').forEach((b) => b.addEventListener('click', () => { a.outfit = b.dataset.outfit as Avatar['outfit']; press('[data-outfit]', (x) => x.dataset.outfit === a.outfit); sfx.click(); draw(); }));
    wrap.querySelectorAll<HTMLButtonElement>('[data-scalp]').forEach((b) => b.addEventListener('click', () => { a.scalp = b.dataset.scalp as Avatar['scalp']; press('[data-scalp]', (x) => x.dataset.scalp === a.scalp); sfx.click(); draw(); }));
    const unibrow = wrap.querySelector<HTMLInputElement>('input[name=unibrow]')!;
    unibrow.addEventListener('change', () => { a.unibrow = unibrow.checked; draw(); });
    wrap.querySelectorAll<HTMLButtonElement>('[data-beard]').forEach((b) => b.addEventListener('click', () => {
      a.beard = Number(b.dataset.beard) as Avatar['beard'];
      wrap.querySelectorAll('[data-beard]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      sfx.click(); draw();
    }));
    shades.addEventListener('change', () => { a.shades = shades.checked; draw(); });
    chain.addEventListener('change', () => { a.chain = chain.checked; draw(); });
    wrap.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.addEventListener('click', () => {
      const key = (['shirt', 'skin', 'hair'] as const).find((k) => b.dataset[k])!;
      a[key] = b.dataset[key]!;
      b.parentElement!.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      sfx.click(); draw();
    }));
    wrap.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.addEventListener('click', () => {
      a.hairStyle = Number(b.dataset.style) as Avatar['hairStyle'];
      wrap.querySelectorAll('[data-style]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      sfx.click(); draw();
    }));
    glasses.addEventListener('change', () => { a.glasses = glasses.checked; draw(); });
    const heard = wrap.querySelector<HTMLElement>('.character__heard')!;
    const mic = wrap.querySelector<HTMLButtonElement>('[data-mic]')!;
    const test = async () => {
      heard.textContent = 'Listening… say anything.';
      try { const t = await listenOnce((i) => { heard.textContent = i ? `Hearing: “${i}”` : 'Listening…'; }); heard.textContent = t ? `Heard: “${t}”. The headset works.` : 'Heard nothing. Try again, closer to the mic.'; settings.voiceIn = !!t; }
      catch { heard.textContent = 'The microphone did not start (permission?). Typing works just as well.'; }
    };
    mic.addEventListener('pointerdown', (e) => { e.preventDefault(); void test(); });
    mic.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void test(); } });
    wrap.querySelector('[data-hear]')!.addEventListener('click', () => {
      const c = ROSTER[Math.floor(Math.random() * ROSTER.length)];
      if (!c) { heard.textContent = 'No callers loaded yet. Import a caller pack in the Character Creator.'; return; }
      heard.textContent = `${c.name}: “${c.openers[0]}”`;
      speak(c.openers[0], c.voice, c.id);
    });
    const go = () => {
      stopSpeaking();
      settings.playerName = nameInput.value.trim() || 'Agent';
      saveSettings();
      setAvatar(a);
      wrap.remove();
      resolve();
    };
    wrap.querySelector('[data-go]')!.addEventListener('click', go);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === nameInput) { e.preventDefault(); go(); } });
    draw();
    nameInput.focus();
  });
}
