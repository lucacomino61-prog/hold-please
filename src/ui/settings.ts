// Settings panel: name, voices, brain, API key, shift length, motion, sound.
import { t } from '../i18n';
import { saveSettings, settings } from '../game/state';
import { canListen, elevenKey, setElevenKey } from '../game/speech';
import { HD_DOWNLOAD_MB, hdSpeed, loadHd, onHd, speakHd } from '../game/voices-hd';
import { lastSync, prettyCode, pushSaves, readCode, startSync, stopSync, useCode } from '../game/save-sync';
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
      <label class="check"><input type="checkbox" name="voiceIn" ${settings.voiceIn ? 'checked' : ''} ${listen ? '' : 'disabled'} /> ${t('Microphone (hold the mic button)')}${listen ? '' : ' — ' + t('this browser has no speech recognition and the AI one is not reachable')}</label>
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" name="sound" ${settings.sound ? 'checked' : ''} /> ${t('Sound effects')}</label>
      <label class="check"><input type="checkbox" name="motion" ${settings.motion === 'off' ? 'checked' : ''} /> ${t('Stop animations')}</label>
      <label class="check"><input type="checkbox" name="skipFloor" ${settings.skipFloor ? 'checked' : ''} /> ${t('Skip the office walk')}</label>
    </div>
    <label>${t('Language of the office (callers answer in whatever you write)')}<select name="lang"><option value="en" ${settings.lang === 'en' ? 'selected' : ''}>English</option><option value="sq" ${settings.lang === 'sq' ? 'selected' : ''}>Shqip</option><option value="it" ${settings.lang === 'it' ? 'selected' : ''}>Italiano</option></select></label>
    <label>${t('Shift length')}<select name="shiftMinutes">${[3, 5, 10, 15].map((m) => `<option value="${m}" ${settings.shiftMinutes === m ? 'selected' : ''}>${t('{m} minutes', { m })}</option>`).join('')}</select></label>
    <h3>${t('Modes')}</h3>
    <label class="check"><input type="checkbox" name="family" ${settings.family ? 'checked' : ''} /> ${t('Family mode: no swearing on screen or from the callers, no toilet jokes on the floor')}</label>
    <label class="check"><input type="checkbox" name="streamer" ${settings.streamer ? 'checked' : ''} /> ${t('Streamer mode: room and sync codes hidden, the other players’ screens blanked on the floor')}</label>
    <h3>${t('Who plays the callers')}</h3>
    <label>${t('Brain')}<select name="brain">
      <option value="scripted" ${settings.brain === 'scripted' ? 'selected' : ''}>${t('Built-in (offline and free; plays every caller with stock lines)')}</option>
      <option value="free" ${settings.brain === 'free' ? 'selected' : ''}>${t("Free AI (Cloudflare Workers AI through the game's proxy, no key)")}</option>
      <option value="claude" ${settings.brain === 'claude' ? 'selected' : ''}>${t("Claude (the proxy's key, or your own below)")}</option>
      <option value="chat" ${settings.brain === 'chat' ? 'selected' : ''}>${t("OpenRouter / another provider (the proxy's key)")}</option>
    </select></label>
    <label>${t('Anthropic API key (only for Claude)')}<input type="password" name="apiKey" value="${esc(settings.apiKey)}" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" /></label>
    <label>${t("Model (empty = the default: claude-opus-5-5, or the proxy's free model)")}<input type="text" name="model" value="${esc(settings.model)}" spellcheck="false" placeholder="claude-haiku-5-5 · @cf/qwen/qwen3-30b-a3b-fp8 · …" /></label>
    <label>${t('Brain proxy URL')}<input type="text" name="workerUrl" value="${esc(settings.workerUrl)}" spellcheck="false" placeholder="${PROXY_URL ? esc(PROXY_URL) : 'https://…workers.dev'}" /></label>
    <p class="fine">${t("A language model plays each caller live: it stays in character, grows suspicious when you push, and tests you. The free brain costs nothing (the proxy's daily Cloudflare allowance); Claude is the sharpest. Your own key stays in this browser's storage and is sent only to api.anthropic.com.")} ${PROXY_URL ? t('A brain proxy is configured ({url}), so the live brain plays the callers unless you choose Built-in.', { url: esc(PROXY_URL) }) : t('Without a proxy or a key the built-in brain plays every caller.')} ${t('The built-in brain speaks and understands English only. To play in Albanian or Italian, pick Free AI or Claude.')}</p>
    <h3>${t('Voices')}</h3>
    <label>${t('Caller voices')}<select name="voices">
      <option value="browser" ${settings.voices === 'browser' ? 'selected' : ''}>${t("The browser's voices (instant)")}</option>
      <option value="hd" ${settings.voices === 'hd' ? 'selected' : ''}>${t('HD voices: 25 neural voices that run on this computer (one-time {mb} MB download)', { mb: HD_DOWNLOAD_MB })}</option>
    </select></label>
    <div class="row"><span class="fine" data-hdstatus aria-live="polite"></span><button class="btn btn--ghost" type="button" data-hdtest>${t('Hear an HD voice')}</button></div>
    <label>${t('Who hears your voice')}<select name="ears">
      <option value="auto" ${settings.ears === 'auto' ? 'selected' : ''}>${t('Automatic: this browser where it can (Chrome, Edge), else the AI')}</option>
      <option value="browser" ${settings.ears === 'browser' ? 'selected' : ''}>${t("This browser's speech recognition (Chrome and Edge send it to their maker)")}</option>
      <option value="ai" ${settings.ears === 'ai' ? 'selected' : ''}>${t("The AI: Whisper through the game's proxy (any browser)")}</option>
    </select></label>
    <label>${t('ElevenLabs API key (optional)')}<input type="password" name="eleven" value="${esc(elevenKey())}" autocomplete="off" spellcheck="false" placeholder="${t('leave empty for the voices above')}" /></label>
    <p class="fine">${t('HD voices are Kokoro-82M (Apache-2.0): downloaded once from Hugging Face, kept by the browser, then free and offline. They speak English; in Albanian or Italian the browser’s voices take over. With an ElevenLabs key, callers use ElevenLabs instead (your account pays per character).')}</p>
    <h3>${t('Saves on other devices')}</h3>
    <div class="sync" data-sync></div>
    <div class="panel__actions"><button class="btn btn--ghost" type="button" data-reset>${t('Reset everything')}</button><button class="btn btn--amber" type="submit">${t('Save')}</button></div>
  </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector<HTMLFormElement>('form')!;
  // HD voices: picking them starts the download at once, and the line under the menu follows it
  const hdStatus = form.querySelector<HTMLElement>('[data-hdstatus]')!;
  const hdTest = form.querySelector<HTMLButtonElement>('[data-hdtest]')!;
  const offHd = onHd((s, pct) => {
    const slow = hdSpeed() > 1.5 ? ' ' + t('This computer makes them at {x}× their length, so a voice can trail its text by a moment.', { x: hdSpeed() }) : '';
    hdStatus.textContent = s === 'ready' ? t('HD voices are ready on this computer.') + slow : s === 'loading' ? t('Downloading the HD voices… {p}%', { p: pct }) : s === 'failed' ? t('The HD voices did not load (connection?). Pick them again to retry.') : t('Not downloaded yet ({mb} MB).', { mb: HD_DOWNLOAD_MB });
    hdTest.hidden = s !== 'ready';
  });
  form.querySelector<HTMLSelectElement>('select[name=voices]')!.addEventListener('change', (e) => { if ((e.target as HTMLSelectElement).value === 'hd') void loadHd(); });
  hdTest.addEventListener('click', () => {
    const t0 = performance.now();
    hdStatus.textContent = t('Making the line…');
    void speakHd('Good evening. This is Sunrise Customer Care. How can I help?', { pitch: 1, rate: 1, prefer: 'female' }, 'settings-test', () => undefined)
      .then((ok) => { hdStatus.textContent = ok ? t('HD voices are ready. That line took {s} s to make and say.', { s: ((performance.now() - t0) / 1000).toFixed(1) }) : t('The HD voice could not speak here.'); });
  });
  const close = () => { offHd(); wrap.remove(); };
  // saves that follow the player: a code, the last sync, and the ways in and out
  const syncBox = form.querySelector<HTMLElement>('[data-sync]')!;
  const drawSync = (note = ''): void => {
    const when = lastSync() ? ' · ' + t('last synced {time}', { time: new Date(lastSync()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }) : '';
    const foot = note ? `<p class="fine sync__note" aria-live="polite">${esc(note)}</p>` : '';
    syncBox.innerHTML = settings.syncCode
      ? `<p class="fine">${t("This browser's saves are kept in step under {code}{when}. Type the code into Settings on another browser to carry on there.", { code: `<b class="sync__code">${prettyCode(settings.syncCode)}</b>`, when })}</p>
         <div class="row"><button type="button" class="btn btn--ghost" data-sync-copy>${t('Copy the code')}</button><button type="button" class="btn btn--ghost" data-sync-now>${t('Sync now')}</button><button type="button" class="btn btn--ghost" data-sync-stop>${t('Stop syncing here')}</button></div>${foot}`
      : `<p class="fine">${t('Your save slots, hall of fame and badges live in this browser. Sync them to carry on in another browser or on another computer. There is no account: the code is the key, so keep it to yourself.')}</p>
         <div class="row"><button type="button" class="btn btn--ghost" data-sync-start>${t('Keep my saves in sync')}</button></div>
         <label>${t('A code from another browser')}<input type="text" name="synccode" placeholder="ABCD-EFGH-JKLM" autocomplete="off" spellcheck="false" ${settings.streamer ? 'class="is-secret"' : ''} /></label>
         <div class="row"><button type="button" class="btn btn--ghost" data-sync-use>${t('Use this code')}</button></div>${foot}`;
    syncBox.querySelector('[data-sync-start]')?.addEventListener('click', async () => { const ok = await startSync().then(() => lastSync() > 0); drawSync(ok ? t('Synced. The code above now carries your saves.') : t('The code is made, but the server could not be reached. It will sync after your next save.')); });
    syncBox.querySelector('[data-sync-copy]')?.addEventListener('click', () => { void navigator.clipboard?.writeText(prettyCode(settings.syncCode, false)).then(() => drawSync(t('Copied.')), () => drawSync(t('The code: {c}', { c: prettyCode(settings.syncCode, false) }))); });
    syncBox.querySelector('[data-sync-now]')?.addEventListener('click', async () => drawSync((await pushSaves()) ? t('Synced.') : t('Could not reach the server, or a newer copy is there. Open the game again to fetch it.')));
    syncBox.querySelector('[data-sync-stop]')?.addEventListener('click', () => { stopSync(); drawSync(t('This browser no longer syncs. The saves stay here and on the server.')); });
    const use = syncBox.querySelector<HTMLButtonElement>('[data-sync-use]');
    use?.addEventListener('click', async () => {
      const code = readCode(syncBox.querySelector<HTMLInputElement>('[name=synccode]')!.value);
      if (!code) { drawSync(t('A code has twelve letters and digits, like ABCD-EFGH-JKLM.')); return; }
      if (use.dataset.armed !== '1') { use.dataset.armed = '1'; use.textContent = t('Click again: this browser’s saves will be replaced'); use.classList.add('btn--danger'); return; }
      const res = await useCode(code);
      if (res === 'applied') { drawSync(t('Done. Reloading with those saves…')); setTimeout(() => location.reload(), 900); }
      else drawSync(res === 'missing' ? t('No saves under that code.') : t('Could not reach the server.'));
    });
  };
  drawSync();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    settings.playerName = String(f.get('playerName') || 'Agent').trim() || 'Agent';
    settings.voiceOut = f.get('voiceOut') === 'on';
    settings.voiceIn = f.get('voiceIn') === 'on';
    settings.sound = f.get('sound') === 'on';
    settings.motion = f.get('motion') === 'on' ? 'off' : 'on';
    settings.skipFloor = f.get('skipFloor') === 'on';
    settings.family = f.get('family') === 'on';
    settings.streamer = f.get('streamer') === 'on';
    settings.shiftMinutes = Number(f.get('shiftMinutes')) || 10;
    settings.voices = f.get('voices') === 'hd' ? 'hd' : 'browser';
    settings.ears = (['auto', 'ai', 'browser'].includes(String(f.get('ears'))) ? String(f.get('ears')) : 'auto') as typeof settings.ears;
    if (settings.voices === 'hd') void loadHd();
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
