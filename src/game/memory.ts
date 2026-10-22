// What a caller remembers about you. The pool of callers resets every day and the VIPs ring whenever they like, so
// the same character can call again: they start where the last call left them (sold = warm, hung up on = cold,
// saw through you = wary), say so, and the live brain is told the history in words.
import { state, type CallRecord } from './state';
import type { Caller } from './brain/types';
import { stylize } from './brain/style';

export interface Prior {
  times: number;          // earlier calls with this caller
  sold: number;           // money they handed over, all time
  lastMood: number;       // trust at the end of the last call
  busted: boolean;        // they once hung up because they saw through you
  hungUpOnYou: boolean;   // the last call ended with them hanging up, with nothing sold
  youHungUp: boolean;     // the last call ended with you hanging up
}

export function priorWith(callerId: string, exclude?: CallRecord): Prior | null {
  const past = state.allCalls.filter((r) => r.callerId === callerId && r !== exclude && r.endedAt);
  if (!past.length) return null;
  const last = past[past.length - 1];
  return {
    times: past.length,
    sold: past.reduce((s, r) => s + r.payouts.reduce((a, p) => a + p.amount, 0), 0),
    lastMood: last.trustEnd,
    busted: past.some((r) => r.busted),
    hungUpOnYou: last.hungUpBy === 'caller' && !last.payouts.length,
    youHungUp: last.hungUpBy === 'you',
  };
}

/** how the last call colours the starting mood: −20 … +15 */
export function priorBias(p: Prior | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.sold > 0) b += 8;
  if (p.lastMood >= 70) b += 6;
  if (p.lastMood < 30) b -= 10;
  if (p.busted) b -= 12;
  if (p.youHungUp) b -= 4;
  return Math.max(-20, Math.min(15, b));
}

/** a line for the live brain's facts */
export function priorText(p: Prior | null, you: string): string {
  if (!p) return '';
  const bits = [`You have spoken to this agent (${you}) ${p.times === 1 ? 'once' : p.times + ' times'} before.`];
  if (p.busted) bits.push('Once you hung up because you saw through them: you remember, and you are warier than usual.');
  else if (p.sold > 0) bits.push(`Last time you ended up buying from them (${'$' + p.sold} all together) and were ${p.lastMood >= 70 ? 'delighted' : 'fairly happy'}; you remember them fondly, but you are not a fool twice.`);
  else if (p.hungUpOnYou) bits.push('Last time you hung up on them without buying anything; you remember being annoyed.');
  else if (p.youHungUp) bits.push('Last time THEY hung up on YOU, mid-sentence. Rude. Mention it.');
  else bits.push(`Last time nothing was sold and the call ended ${p.lastMood >= 60 ? 'on good terms' : 'flatly'}.`);
  bits.push('Open the call by recognising their voice, in character.');
  return bits.join(' ');
}

const AGAIN = {
  sold: ['{name} here. Wait. I know that voice. You sold me things. Hello again, {you}.', 'You again! The one with the good deals. {name}. I have been thinking about what we bought.', 'Oh, it is you. {name} speaking. Last time cost me money and I did not mind. Go on.'],
  busted: ['{name}. I know you. You tried something last time. I am listening very carefully now.', 'You. Again. {name} remembers what you did. Speak, and speak straight this time.', 'Hm. That voice. {name} here, and I have not forgotten. Careful.'],
  cold: ['{name} speaking. Oh. It is you. That went badly last time, as I recall.', 'You again. {name}. I was rude to you last time, or you were rude to me. One of those. Hello.', 'Not you again. Fine. {name}. Make it better than last time.'],
  rude: ['{name}. You hung up on me last time. Mid-sentence. I have questions.', 'Oh, it is the one who hangs up. {name} here. I am still annoyed, a little. Speak.'],
  flat: ['{name} here. We have spoken before, I think. Nothing came of it. Hello again.', 'Is this you again? {name}. Second time lucky, maybe. Go on.'],
};

/** the built-in brain's opener for someone who has rung before */
export function priorOpener(c: Caller, p: Prior, you: string): string {
  const list = p.busted ? AGAIN.busted : p.sold > 0 ? AGAIN.sold : p.youHungUp ? AGAIN.rude : p.lastMood < 30 ? AGAIN.cold : AGAIN.flat;
  const line = list[Math.floor(Math.random() * list.length)].replace(/\{name\}/g, c.name).replace(/\{you\}/g, you);
  return stylize(c, line, 0.6);
}
