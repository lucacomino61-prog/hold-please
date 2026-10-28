// The clock-in desk: name, look, a microphone test and a sample caller voice, then into the office.
import { saveSettings, settings } from '../game/state';
import { BEARDS, getAvatar, HAIR_NAMES, HAIRS, OUTFIT_NAMES, OUTFITS, SCALP_NAMES, SCALPS, setAvatar, SHIRTS, SKINS, type Avatar } from '../game/avatar';
import { canListen, earsLabel, listenFailureText, listenOnce, speak, stopSpeaking } from '../game/speech';
import { HD_DOWNLOAD_MB, hdSpeed, loadHd, onHd, warmHdVoice } from '../game/voices-hd';
import type { Caller } from '../game/brain/types';
import { ensureCallers, ROSTER } from '../game/callers';
import { portraitSVG, specFor } from '../os/portrait';
import { sfx } from '../game/sound';
import { t } from '../i18n';

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

export function showCharacterSetup(): Promise<void> {
  return new Promise((resolve) => {
    const a: Avatar = getAvatar();
    const wrap = document.createElement('div');
    wrap.className = 'screen character';
    wrap.setAttribute('aria-label', t('Clock-in desk'));
    const swatches = (name: string, list: string[], current: string) => list.map((c) => `<button type="button" class="swatch" data-${name}="${c}" style="--c:${c}" aria-label="${name} ${c}" aria-pressed="${c === current}"></button>`).join('');
    wrap.innerHTML = `<div class="panel panel--wide" role="dialog" aria-labelledby="ch-title">
      <div class="character__cols">
        <div class="character__preview"><div class="character__portrait"></div><div class="fine">${t('This is you on the floor. The headset is mandatory.')}</div></div>
        <div class="character__form">
          <h2 id="ch-title">${t('Clock-in desk')}</h2>
          <p>${t('Sunrise Customer Care needs a name for the badge and a face for the floor.')}</p>
          <label>${t('Name on the badge')}<input type="text" name="name" maxlength="24" value="${esc(settings.playerName === 'Agent' ? '' : settings.playerName)}" placeholder="Agent" autocomplete="nickname" /></label>
          <div class="character__row"><span class="character__label">${t('Body')}</span><div class="cluster" style="--cluster-space:.3rem">${(['man', 'woman'] as const).map((b) => `<button type="button" class="chip" data-body="${b}" aria-pressed="${b === a.body}">${b === 'man' ? t('Man') : t('Woman')}</button>`).join('')}</div></div>
          <div class="character__row"><span class="character__label">${t('Outfit')}</span><div class="cluster" style="--cluster-space:.3rem">${OUTFITS.map((o) => `<button type="button" class="chip" data-outfit="${o}" aria-pressed="${o === a.outfit}">${t(OUTFIT_NAMES[o])}</button>`).join('')}</div></div>
          <div class="character__row"><span class="character__label">${t('Colour')}</span><div class="swatches">${swatches('shirt', SHIRTS, a.shirt)}</div></div>
          <div class="character__row"><span class="character__label">${t('Skin')}</span><div class="swatches">${swatches('skin', SKINS, a.skin)}</div></div>
          <div class="character__row"><span class="character__label">${t('Hair')}</span><div class="swatches">${swatches('hair', HAIRS, a.hair)}</div></div>
          <div class="character__row"><span class="character__label">${t('Style')}</span><div class="cluster" style="--cluster-space:.3rem">${[0, 1, 2].map((i) => `<button type="button" class="chip" data-style="${i}" aria-pressed="${i === a.hairStyle}">${t(HAIR_NAMES[a.body][i])}</button>`).join('')}${SCALPS.map((s) => `<button type="button" class="chip" data-scalp="${s}" aria-pressed="${s === a.scalp}">${t(SCALP_NAMES[s])}</button>`).join('')}</div></div>
          <div class="character__row"><span class="character__label">${t('Face')}</span><div class="cluster" style="--cluster-space:.3rem">${BEARDS.map((s, i) => `<button type="button" class="chip" data-beard="${i}" aria-pressed="${i === a.beard}">${t(s)}</button>`).join('')}</div></div>
          <div class="cluster" style="--cluster-space:1rem">
            <label class="check"><input type="checkbox" name="unibrow" ${a.unibrow ? 'checked' : ''} /> ${t('Unibrow')}</label>
            <label class="check"><input type="checkbox" name="glasses" ${a.glasses ? 'checked' : ''} /> ${t('Glasses')}</label>
            <label class="check"><input type="checkbox" name="shades" ${a.shades ? 'checked' : ''} /> ${t('Shades')}</label>
            <label class="check"><input type="checkbox" name="chain" ${a.chain ? 'checked' : ''} /> ${t('Gold chain')}</label>
          </div>
          <h3>${t('Headset check')}</h3>
          <div class="character__mic">
            <button type="button" class="btn" data-mic ${canListen() ? '' : 'disabled'}>${canListen() ? t('Hold to test the microphone') : t('No microphone in this browser')}</button>
            <button type="button" class="btn btn--ghost" data-hear style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)">${t('Hear a caller')}</button>
            <button type="button" class="btn btn--ghost" data-hd style="--btn-ink:var(--ink);--btn-bg:oklch(0 0 0/.06)" title="${t('25 neural voices that run on this computer. Downloaded once ({mb} MB) and kept by the browser.', { mb: HD_DOWNLOAD_MB })}">${t('Get HD voices ({mb} MB)', { mb: HD_DOWNLOAD_MB })}</button>
            <div class="character__heard fine" aria-live="polite">${t('Typing always works; the mic is optional. Your voice is heard by {who}.', { who: earsLabel() })}</div>
          </div>
          <div class="panel__actions"><button type="button" class="btn btn--amber btn--big" data-go>${t('Enter the office')}</button></div>
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
      wrap.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((x) => { x.textContent = t(HAIR_NAMES[a.body][Number(x.dataset.style)]); });
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
      heard.textContent = t('Listening… say anything.');
      try { const said = await listenOnce((i) => { heard.textContent = i ? t('Hearing: “{i}”', { i }) : t('Listening…'); }); heard.textContent = said ? t('Heard: “{t}”. The headset works.', { t: said }) : t('Heard nothing. Try again, closer to the mic.'); settings.voiceIn = !!said; }
      catch (e) { heard.textContent = listenFailureText(e); }
    };
    mic.addEventListener('pointerdown', (e) => { e.preventDefault(); void test(); });
    mic.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void test(); } });
    // the sample caller is picked ahead, so with HD voices on, its voice file is already here when the button is pressed
    let sample: Caller | null = null;
    const nextSample = (): void => {
      sample = ROSTER.length ? ROSTER[Math.floor(Math.random() * ROSTER.length)] : null;
      if (sample && settings.voices === 'hd') warmHdVoice(sample.voice, sample.id);
    };
    wrap.querySelector('[data-hear]')!.addEventListener('click', async () => {
      if (!ROSTER.length) { heard.textContent = t('Loading the callers…'); await ensureCallers(); }
      const c = sample ?? ROSTER[Math.floor(Math.random() * ROSTER.length)];
      if (!c) { heard.textContent = t('The callers did not load. Check the connection, or import a caller pack in the Character Creator.'); return; }
      heard.textContent = `${c.name}: “${c.openers[0]}”`;
      speak(c.openers[0], c.voice, c.id);
      nextSample();
    });
    // HD voices: one click downloads them (the browser keeps them); the button follows the download
    const hdBtn = wrap.querySelector<HTMLButtonElement>('[data-hd]')!;
    const offHd = onHd((s, pct) => {
      if (s === 'ready' && settings.voices === 'hd') { hdBtn.textContent = t('HD voices on'); hdBtn.disabled = true; if (!sample) nextSample(); }
      else if (s === 'loading') { hdBtn.textContent = t('Downloading HD voices… {p}%', { p: pct }); hdBtn.disabled = true; }
      else if (s === 'failed') { hdBtn.textContent = t('HD voices did not load. Try again'); hdBtn.disabled = false; }
    });
    hdBtn.addEventListener('click', () => {
      settings.voices = 'hd'; saveSettings();
      void loadHd().then((ok) => {
        if (!ok) return;
        heard.textContent = hdSpeed() > 1.5 ? t("HD voices are ready. This computer is slow at them ({x}× the line's length), so a voice can trail its text. Press Hear a caller.", { x: hdSpeed() }) : t('HD voices are ready. Press Hear a caller.');
      });
    });
    const go = () => {
      offHd();
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
