import { settings } from '../state';
import { liveBrain, PROXY_URL, proxyUrl, providerLabel } from './claude';
import { scriptedBrain } from './scripted';
import type { CallerBrain } from './types';

export { PROXY_URL, checkProxy, proxyState, proxyInfo, proxyUrl, proxyBase, liveBrainConfigured, providerFor, providerLabel } from './claude';

// A language model plays the callers when the player chose one, or by default when a brain proxy is
// configured and the player never chose otherwise (the free Workers AI brain first, then Claude, then any
// other provider the proxy has a key for). The scripted brain is always the fallback.
export function getBrain(): CallerBrain {
  if (settings.brain !== 'scripted') return liveBrain;
  let manual = false;
  try { manual = localStorage.getItem('hp.brain-manual') === '1'; } catch { /* ignore */ }
  if (!manual && (proxyUrl() || settings.apiKey)) return liveBrain;
  return scriptedBrain;
}

export function brainLabel(): string {
  return getBrain() === liveBrain ? providerLabel() : 'built-in';
}
