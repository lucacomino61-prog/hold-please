// Settings panel: name, voices, brain, API key, shift length, motion, sound.
import { t } from '../i18n';
import { saveSettings, settings } from '../game/state';
import { canListen, elevenKey, setElevenKey } from '../game/speech';
import { PROXY_URL } from '../game/brain/claude';

export function openSettings(): void {
  const wrap = document.createElement('div');
  wrap.className = 'screen';
  wrap.style.zIndex = '80';
  wrap.style.background = 'oklch(0 0 0 / .6)';
  const listen = canListen();
  wrap.innerHTML = `<form class="panel" role="dialog" aria-labelledby="set-title">
    <h2 id="set-title">${t('Settings')}</h2>
    <label>${t('Your name on the floor')}<input type="text" name="playerName" maxlength="24" value="${esc(settings.playerName)}" autocomplete="nickname" /></label>
    <div class="row">
      <label class="check"><input type="checkbox" name="voiceOut" ${settings.voiceOut ? 'checked' : ''} /> ${t('Callers speak out loud')}</label>
      <label class="check"><input type="checkbox" name="voiceIn" ${settings.voiceIn ? 'checked' : ''} ${listen ? '' : 'disabled'} /> Microphone (hold the mic button)${listen ? '' : ' — needs Chrome or Edge'}</label>
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" name="sound" ${settings.sound ? 'checked' : ''} /> ${t('Sound effects')}</label>
      <label class="check"><input type="checkbox" name="motion" ${settings.motion === 'off' ? 'checked' : ''} /> ${t('Stop animations')}</label>
      <label class="check"><input type="checkbox" name="skipFloor" ${settings.skipFloor ? 'checked' : ''} /> ${t('Skip the office walk')}</label>
      <label class="check"><input type="checkbox" name="callerPool" ${settings.callerPool === 'people' ? 'checked' : ''} /> Only my Character Creator callers (the built-in creatures stay out)</label>
    </div>
    <label>${t('Language of the office (callers answer in whatever you write)')}<select name="lang"><option value="en" ${settings.lang === 'en' ? 'selected' : ''}>English</option><option value="sq" ${settings.lang === 'sq' ? 'selected' : ''}>Shqip</option><option value="it" ${settings.lang === 'it' ? 'selected' : ''}>Italiano</option></select></label>
    <label>${t('Shift length')}<select name="shiftMinutes">${[3, 5, 10, 15].map((m) => `<option value="${m}" ${settings.shiftMinutes === m ? 'selected' : ''}>${t('{m} minutes', { m })}</option>`).join('')}</select></label>
    <h3>Who plays the callers</h3>
    <label>Brain<select name="brain">
      <option value="scripted" ${settings.brain === 'scripted' ? 'selected' : ''}>Built-in (offline, free, 200 characters with their own lines)</option>
      <option value="free" ${settings.brain === 'free' ? 'selected' : ''}>Free AI (Cloudflare Workers AI through the game's proxy, no key)</option>
      <option value="claude" ${settings.brain === 'claude' ? 'selected' : ''}>Claude (the proxy's key, or your own below)</option>
      <option value="chat" ${settings.brain === 'chat' ? 'selected' : ''}>OpenRouter / another provider (the proxy's key)</option>
    </select></label>
    <label>Anthropic API key (only for Claude)<input type="password" name="apiKey" value="${esc(settings.apiKey)}" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" /></label>
    <label>Model (empty = the default: claude-opus-5-5, or the proxy's free model)<input type="text" name="model" value="${esc(settings.model)}" spellcheck="false" placeholder="claude-haiku-5-5 · @cf/qwen/qwen3-30b-a3b-fp8 · …" /></label>
    <label>Brain proxy URL<input type="text" name="workerUrl" value="${esc(settings.workerUrl)}" spellcheck="false" placeholder="${PROXY_URL ? esc(PROXY_URL) : 'https://…workers.dev'}" /></label>
    <p class="fine">A language model plays each caller live: it stays in character, grows suspicious when you push, and tests you. The free brain costs nothing (the proxy's daily Cloudflare allowance); Claude is the sharpest. Your own key stays in this browser's storage and is sent only to api.anthropic.com.${PROXY_URL ? ` A brain proxy is configured (${esc(PROXY_URL)}), so the live brain plays the callers unless you choose Built-in.` : ' Without a proxy or a key the built-in brain plays every caller.'}</p>
    <h3>Neural voices (optional)</h3>
    <label>ElevenLabs API key<input type="password" name="eleven" value="${esc(elevenKey())}" autocomplete="off" spellcheck="false" placeholder="leave empty for the browser's voices" /></label>
    <p class="fine">With a key, callers speak with ElevenLabs voices (your account is charged per character). Without it, the browser's own voices are used.</p>
    <div class="panel__actions"><button class="btn btn--ghost" type="button" data-reset>${t('Reset everything')}</button><button class="btn btn--amber" type="submit">${t('Save')}</button></div>
  </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector<HTMLFormElement>('form')!;
  const close = () => wrap.remove();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    settings.playerName = String(f.get('playerName') || 'Agent').trim() || 'Agent';
    settings.voiceOut = f.get('voiceOut') === 'on';
    settings.voiceIn = f.get('voiceIn') === 'on';
    settings.sound = f.get('sound') === 'on';
    settings.motion = f.get('motion') === 'on' ? 'off' : 'on';
    settings.skipFloor = f.get('skipFloor') === 'on';
    settings.callerPool = f.get('callerPool') === 'on' ? 'people' : 'all';
    settings.shiftMinutes = Number(f.get('shiftMinutes')) || 10;
    const lang = String(f.get('lang') || 'en') as typeof settings.lang;
    const langChanged = lang !== settings.lang;
    settings.lang = lang;
    const brain = (f.get('brain') as typeof settings.brain) || 'scripted';
    if (brain !== settings.brain) { try { localStorage.setItem('hp.brain-manual', '1'); } catch { /* ignore */ } }
    settings.brain = brain;
    setElevenKey(String(f.get('eleven') || '').trim());
    settings.apiKey = String(f.get('apiKey') || '').trim();
    settings.model = String(f.get('model') || '').trim();
    settings.workerUrl = String(f.get('workerUrl') || '').trim();
    saveSettings();
    close();
    if (langChanged) { document.documentElement.lang = lang; location.reload(); }
  });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // reset: every hp.* key in this browser (saves, hall, callers, colleagues, settings), then a fresh start
  form.querySelector('[data-reset]')!.addEventListener('click', () => {
    const b = form.querySelector<HTMLButtonElement>('[data-reset]')!;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = t('Click again to wipe saves, callers, badges and settings'); b.classList.add('btn--danger'); return; }
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('hp.')) localStorage.removeItem(k); } catch { /* ignore */ }
    location.reload();
  });
  form.querySelector<HTMLInputElement>('input')!.focus();
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
