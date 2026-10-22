// Mr. Krull's office: three strikes and you are called in. A desk, Krull across it, three rounds of talk with
// choices that move his temper. Enough temper left and you walk out with one strike; not enough and the day ends
// the way the review would have.
import { bus, fmt, state } from './state';
import { portraitSVG } from '../os/portrait';
import { KRULL_SPEC } from './day';
import { krullSays } from './krull';
import { sfx } from './sound';
import { osElement } from '../os/desktop';
import { hangUp, startDialer, stopDialer } from './calls';
import { enterKrullOffice, leaveKrullOffice } from '../world/office';
import { toast } from '../ui/toast';
import { closeAllWindows } from '../os/windows';
import { unlock } from './hall';

interface Choice { text: string; temper: number | (() => number); reply: string }
interface Round { krull: string; choices: Choice[] }

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

const ROUNDS: Round[] = [
  { krull: 'THREE. THREE STRIKES. SIT. NO, NOT THAT CHAIR. THAT ONE.', choices: [
    { text: 'I am sorry, Mr. Krull. It will not happen again.', temper: 2, reply: 'IT WILL. IT ALWAYS DOES. BUT YOU SAID IT, SO.' },
    { text: 'Baxter made me do it.', temper: -1, reply: 'BAXTER HAS BEEN HERE ELEVEN YEARS. BAXTER DOES NOT MAKE PEOPLE DO THINGS. BAXTER BARELY DOES THINGS.' },
    { text: 'Technically the casino is your casino.', temper: () => (state.casinoToday < 0 ? 1 : -1), reply: 'IT IS. AND THE MONEY YOU LOST IN IT IS MINE. SO THANK YOU. SIT.' },
  ] },
  { krull: 'WHAT DO YOU DO HERE. EXACTLY. IN ONE SENTENCE.', choices: [
    { text: 'I sell the Moon to people who want the Moon.', temper: 2, reply: 'THAT IS THE JOB. THAT IS THE WHOLE JOB. WHY WAS A POTATO ON YOUR SCREEN THEN.' },
    { text: 'I answer the phone when it rings.', temper: 0, reply: 'SO DOES THE FRIDGE. THE FRIDGE DOES NOT GET THREE STRIKES.' },
    { text: 'I am still in training.', temper: () => (state.day <= 2 ? 1 : -2), reply: state.day <= 2 ? 'TRAINING. FINE. TRAINING ENDS TONIGHT.' : 'TRAINING. ON DAY ' + state.day + '. MY NEPHEW TRAINED IN ONE. HE IS A GOOSE.' },
  ] },
  { krull: 'GIVE ME ONE REASON NOT TO WALK YOU TO THE DOOR.', choices: [
    { text: 'I will make the quota by the end of the shift.', temper: () => (state.team >= state.quota * 0.5 ? 2 : -1), reply: state.team >= state.quota * 0.5 ? 'YOU ARE HALFWAY. FINE. HALFWAY IS A REASON. A SMALL ONE.' : 'YOU ARE NOWHERE NEAR. THAT IS NOT A REASON. THAT IS A WISH.' },
    { text: 'I brought you a dumpling.', temper: () => (state.dumplings >= 100 ? 3 : -2), reply: state.dumplings >= 100 ? '...IS THIS FROM THE CLICKER. IT IS WARM. SIT DOWN. ONE MORE STRIKE AND YOU ARE A MEMORY.' : 'YOU HAVE NO DUMPLING. YOU HAVE A HAND. THE HAND IS EMPTY. LIKE YOUR QUOTA.' },
    { text: 'I will see myself out.', temper: -10, reply: 'YES. YOU WILL.' },
  ] },
];

/** resolves true when Krull lets you back on the floor (strikes reset to one), false when he does not */
export function krullOffice(): Promise<boolean> {
  stopDialer();
  hangUp('caller');
  closeAllWindows();
  const os = osElement();
  if (os) os.hidden = true;
  return new Promise((resolve) => {
    const el = document.createElement('section');
    el.className = 'krull-office';
    el.setAttribute('aria-label', "Mr. Krull's office");
    el.innerHTML = `<div class="krull-office__stage"></div><div class="krull-office__panel"><div class="review__face" aria-hidden="true">${portraitSVG(KRULL_SPEC, 'angry', 56)}</div><div class="krull-office__talk"><div class="krull-office__temper" aria-label="Krull's temper"><i></i></div><div class="krull-office__line"><b>Mr. Krull:</b> <span></span></div><div class="krull-office__choices"></div></div></div>`;
    document.body.appendChild(el);
    enterKrullOffice();
    const line = el.querySelector<HTMLElement>('.krull-office__line span')!, choices = el.querySelector<HTMLElement>('.krull-office__choices')!, temperEl = el.querySelector<HTMLElement>('.krull-office__temper i')!;
    let temper = 3, round = 0;
    const drawTemper = () => { temperEl.style.transform = `scaleX(${Math.max(0, Math.min(1, temper / 8))})`; temperEl.parentElement!.dataset.level = temper <= 1 ? 'bad' : temper >= 5 ? 'good' : 'mid'; };
    const finish = (saved: boolean) => {
      leaveKrullOffice();
      el.remove();
      if (os) os.hidden = false;
      if (saved) { state.strikes = 1; bus.emit('money'); startDialer(); unlock('kept-job'); toast('Back on the floor. One strike. He counts.', 'danger', 5000); }
      else { state.firedByKrull = true; bus.emit('power'); }
      resolve(saved);
    };
    const say = (text: string, next: () => void) => {
      line.textContent = text; krullSays(text, { evenOnCall: true });
      choices.innerHTML = `<button type="button" class="btn" data-next>…</button>`;
      choices.querySelector('[data-next]')!.addEventListener('click', next);
    };
    const ask = () => {
      drawTemper();
      if (round >= ROUNDS.length) {
        const saved = temper >= 4;
        say(saved ? `FINE. ONE STRIKE. YOU ARE ON ONE. TEAM TOTAL ${fmt(state.team)} OF ${fmt(state.quota)}. GO.` : 'NO. PACK YOUR THINGS. THE DOOR IS WHERE IT ALWAYS WAS.', () => finish(saved));
        return;
      }
      const r = ROUNDS[round];
      line.textContent = r.krull; krullSays(r.krull, { evenOnCall: true });
      choices.innerHTML = r.choices.map((c, i) => `<button type="button" class="btn" data-i="${i}">${esc(c.text)}</button>`).join('');
      choices.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => {
        const c = r.choices[Number(b.dataset.i)];
        const d = typeof c.temper === 'function' ? c.temper() : c.temper;
        temper += d; sfx.click();
        bus.emit('krull:choice', { round, choice: c.text, temper });
        if (d <= -10) { round = ROUNDS.length; temper = 0; drawTemper(); say(c.reply, () => finish(false)); return; }
        round++;
        say(c.reply, ask);
      }));
      (choices.querySelector('button') as HTMLButtonElement | null)?.focus();
    };
    ask();
  });
}
