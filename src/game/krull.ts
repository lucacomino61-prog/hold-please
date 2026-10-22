// Mr. Krull's voice: low, slow, never pleased. He talks over nobody: when a caller is on the line he keeps it to text.
import { t } from '../i18n';
import { settings } from './state';
import { speak } from './speech';
import { callActive } from './calls';
import type { Caller } from './brain/types';

export const KRULL_VOICE: Caller['voice'] = { pitch: 0.55, rate: 0.88, prefer: 'male' };

export function krullSays(text: string, opts: { evenOnCall?: boolean } = {}): void {
  if (!settings.voiceOut) return;
  if (callActive() && !opts.evenOnCall) return;
  speak(t(text), KRULL_VOICE, 'krull');
}
