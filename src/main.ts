import './styles/base.css';
import * as portraitMod from './os/portrait';
import * as rivalMod from './game/rival';
import { krullOffice } from './game/krull-office';
import * as mutatorsMod from './game/mutators';
import { DEFS } from './game/objectives';
import * as challengeMod from './game/challenge';
import * as musicMod from './game/music';
import * as hdMod from './game/voices-hd';
import * as speechMod from './game/speech';
import { starOf } from './game/values';
import { SKY } from './game/sky';
import { listSaves, setSlot } from './game/save';
import { voice } from './net/voice';
import { t } from './i18n';
import './styles/app.css';
import './styles/os.css';
import './styles/apps.css';
import './styles/targets.css';
import './styles/progress.css';
import './styles/content.css';

// apps register themselves on import
import './os/apps/phone';
import './os/apps/scamapps';
import './os/apps/sideapps';
import './os/apps/casino';
import './os/apps/clicker';
import './os/apps/zoomy';
import './os/apps/mailbox';
import './os/apps/codex';
import './os/apps/camera';
import './os/apps/paint';
import './os/apps/creator';
import './os/apps/targets';
import './os/apps/radio';
import './os/apps/colleagues-app';
// the people at the other desks have things to say; the badges listen for what earns them
import './game/colleagues';
import './game/hall';

import { saveSettings, settings, state } from './game/state';
import { startLoop } from './world/loop';
import { showTitle } from './ui/title';
import { pullOnOpen } from './game/save-sync';
import { answerCall, currentCall, hangUp, sendLine } from './game/calls';
import { beginDay, endShift, startRun, startShift } from './game/day';
import * as floorsMod from './world/floors';
import * as modesMod from './game/modes';
import { triggerEvent } from './game/events';
import { claim } from './game/calls';
import { officeDebug, setRemotePlayers, setRemoteScreens } from './world/office';
import { standUp } from './game/day';
import { openApp } from './os/registry';
import { setVipChance } from './game/callers';
import { bootSplash } from './os/desktop';
import { objectives, planObjectives } from './game/objectives';
import { styleFor, stylize } from './game/brain/style';
import { voiceFor } from './game/speech';
import { callerById, customCallers } from './game/callers';
import { clearSave, loadSave, saveRun } from './game/save';
import { hall, unlock, unlocked } from './game/hall';
import { currentRank, perks } from './game/ranks';
import { forceNext, heldCall, holdCall, onHold, setBaiterChance, swapCall, transferCall } from './game/calls';
import { watchPortraits, prewarm as prewarmToons } from './os/toon';
import { bus as hpBus } from './game/state';
// every photo portrait becomes a cartoon as soon as it is on the page; the pack's faces are drawn ahead of the first ring
watchPortraits();
// HD voices chosen earlier: start them in the background (the model comes from the browser's cache after the first time)
if (settings.voices === 'hd') void hdMod.loadHd();
const warmFaces = (): void => prewarmToons(customCallers().map((c) => c.portrait?.photo ?? '').filter(Boolean));
warmFaces();
hpBus.on('callers:synced', warmFaces);
import { setMutator, todayMutator } from './game/mutators';
import { addSlip, slips } from './game/case';

// dev hooks for the browser probes (tools/ and the pane)
if (import.meta.env.DEV) {
  (window as unknown as { __hp: unknown }).__hp = { state, settings, answerCall, currentCall, hangUp, sendLine, startRun, startShift, endShift, triggerEvent, claim, setRemotePlayers, setRemoteScreens, standUp, openApp, setVipChance, bootSplash, objectives, planObjectives, styleFor, stylize, voiceFor, callerById, saveRun, loadSave, clearSave, hall, unlock, unlocked, currentRank, perks, onHold, holdCall, swapCall, heldCall, transferCall, forceNext, setMutator, todayMutator, addSlip, slips, office: officeDebug, listSaves, setSlot, voice, t, rival: rivalMod, krullOffice, mutators: mutatorsMod, objectiveCount: () => DEFS.length, challenge: challengeMod, music: musicMod, portrait: portraitMod, hd: hdMod, speech: speechMod, setBaiterChance, sky: { starOf, SKY }, beginDay, floors: floorsMod, modes: modesMod };
}

document.documentElement.dataset.motion = settings.motion;
document.documentElement.lang = settings.lang === 'sq' || settings.lang === 'it' ? settings.lang : 'en';
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && settings.motion === 'on') {
  settings.motion = 'off';
  saveSettings();
}

startLoop();
showTitle();
// saves synced from another browser: the newest copy comes down, and the title lists its slots
void pullOnOpen().then((applied) => { if (applied && state.phase === 'title') showTitle(); });
