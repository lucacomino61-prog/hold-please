// The performance review: Mr. Krull's slides, built from what happened today.
import { t } from '../i18n';
import { fmt, quotaFor, settings, state } from './state';
import { portraitSVG } from '../os/portrait';
import { KRULL_SPEC } from './day';
import { scamById } from './scams';
import { sfx } from './sound';
import { coop } from '../net/coop';
import { clips, clearClips } from './clips';
import { callerById } from './callers';
import { speak, stopSpeaking, voiceFor } from './speech';
import { krullSays } from './krull';
import { objectiveSummary, objectives } from './objectives';
import { caseOver, caseSlides } from './case';
import { todayMutator } from './mutators';
import { setReviewDoom } from '../world/office';
import { writeKrullLines } from './review-ai';
import { getAvatar } from './avatar';

interface Slide { title: string; body: string; krull: string; replay?: { callerId: string; you: string; reply: string; before?: string } }

// ---- the AI roast: asked for when the shift ends, used if it is back by the time the review opens ----
let roast: Promise<string[] | null> | null = null;
/** what happened today, in plain lines, for the brain that writes Mr. Krull's review */
function dayFacts(pass: boolean): string {
  const calls = state.calls;
  const total = calls.reduce((n, c) => n + c.payouts.reduce((a, p) => a + p.amount, 0), 0);
  const lines: string[] = [
    `Agent: ${settings.playerName || 'Agent'}. Day ${state.day}. Quota ${fmt(state.quota)}, team total ${fmt(state.team)}, this agent's sales ${fmt(total)}. Verdict: ${pass ? 'kept' : 'FIRED'}. Strikes ${state.strikes} of 3.`,
  ];
  const targets = objectives();
  if (targets.length) lines.push(`Targets: ${targets.map((o) => `${o.def.text} (${o.done ? 'done' : 'missed'})`).join('; ')}.`);
  if (state.casinoToday) lines.push(`Casino: ${state.casinoToday > 0 ? 'won' : 'lost'} ${fmt(Math.abs(state.casinoToday))} during the shift.`);
  lines.push(`Calls (${calls.length}):`);
  let budget = 2600;
  for (const c of calls.slice(-8)) {
    const sold = c.payouts.map((p) => `${scamById.get(p.scam)?.name ?? p.scam} for ${fmt(p.amount)}`).join(', ') || 'nothing';
    const said = c.lines.filter((l) => l.text.trim()).slice(-6).map((l) => `${l.who === 'you' ? 'AGENT' : 'CALLER'}: "${l.text.slice(0, 140)}"`).join(' / ');
    const entry = `- ${c.name}: sold ${sold}; ${c.hungUpBy === 'caller' ? 'the caller hung up' : c.hungUpBy === 'you' ? 'the agent hung up' : 'ended at the bell'}; mood at the end ${Math.round(c.trustEnd)}. ${said}`;
    if (entry.length > budget) break;
    budget -= entry.length;
    lines.push(entry);
  }
  return lines.join('\n');
}
/** the end of the shift: start writing tonight's review while everyone walks to the room */
export function startReviewRoast(): void {
  const { slides, pass } = buildSlides();
  // what each slide shows, as plain text (its numbers, names and quotes), so every line is about its own slide
  const plain = (html: string): string => html
    .replace(/<div class="tape"[\s\S]*?<div class="tape__sub"[^>]*><\/div><\/div><\/div>/, '')   // the tape's screen furniture (REC, CAM, NO WEBCAM)
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 420);
  roast = writeKrullLines(slides.map((s) => ({ title: s.title, shows: plain(s.body) })), dayFacts(pass));
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function buildSlides(): { slides: Slide[]; pass: boolean } {
  const calls = state.calls;
  const sales = calls.flatMap((c) => c.payouts.map((p) => ({ ...p, name: c.name })));
  const total = sales.reduce((a, s) => a + s.amount, 0);
  const best = sales.sort((a, b) => b.amount - a.amount)[0];
  const hungUpOnYou = calls.filter((c) => c.hungUpBy === 'caller' && c.payouts.length === 0).length;
  // in co-op the verdict is the room's (the shared total against the shared quota); solo, three strikes also fire you
  const roomPass = coop.pass();
  // three slips in Inspector Vane's file: the review is a hearing, and the hearing has one outcome
  const court = !coop.live && caseOver();
  const pass = !court && !state.firedByKrull && (coop.live && roomPass !== null ? roomPass : state.team >= state.quota && state.strikes < 3);
  const slides: Slide[] = [];
  if (court) slides.push(...caseSlides(settings.playerName || 'the agent'));

  // the tape: the three things you said that moved a caller the most, numbered like the real analysis
  const said = calls.flatMap((c) => c.lines.filter((l) => l.who === 'you' && l.text.trim()).map((l) => ({ text: l.text, delta: l.delta ?? 0, name: c.name })));
  const picks = said.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  const quotes = picks.length ? `<div class="quotes">${picks.map((q) => `<div class="quote">“${esc(q.text.slice(0, 110))}”<small>to ${esc(q.name)}${q.delta ? ` · mood ${q.delta > 0 ? '+' : ''}${q.delta}` : ''}</small></div>`).join('')}</div>` : '';

  slides.push({
    title: t('Day {d} — call analysis', { d: state.day }),
    body: `<div class="stats"><div><b class="big">${calls.length}</b><span>${calls.length === 1 ? t('call answered') : t('calls answered')}</span></div><div><b class="big">${sales.length}</b><span>${sales.length === 1 ? t('sale closed') : t('sales closed')}</span></div><div><b class="big">${fmt(total)}</b><span>${t('brought in')}</span></div></div>` +
      (best ? `<div>${t('Best call:')} <b>${esc(best.name)}</b> — ${scamById.get(best.scam)?.name} for ${fmt(best.amount)}</div>` : `<div>${t('Best call:')} <b>${t('none')}</b>. ${t('Not one.')}</div>`) +
      `<div>${t('Callers who hung up on you with nothing:')} <b>${hungUpOnYou}</b></div>` + quotes,
    krull: calls.length === 0 ? t('ZERO CALLS. DID YOU SIT AT THE WRONG DESK. DID YOU SIT AT A DESK.') :
      sales.length === 0 ? t('{n} CALLS AND NOT ONE SALE. THE PHONE WAS NOT THE PROBLEM.', { n: calls.length }) :
      total >= state.quota * 0.6 ? t('{n} CALLS, {s} SALES. I HAVE SEEN WORSE. THAT PERSON NO LONGER WORKS HERE.', { n: calls.length, s: sales.length }) :
      t('{s} SALES. MY NEPHEW CLOSES MORE AND HE IS A GOOSE.', { s: sales.length }),
  });

  let worst: { text: string; delta: number; reply: string; before: string; name: string; callerId: string } | null = null;
  for (const c of calls) {
    for (let i = 0; i < c.lines.length; i++) {
      const l = c.lines[i];
      if (l.who !== 'you' || l.delta === undefined) continue;
      const prev = c.lines.slice(0, i).reverse().find((x) => x.who !== 'you');
      if (!worst || l.delta < worst.delta) worst = { text: l.text, delta: l.delta, reply: c.lines[i + 1]?.text ?? '', before: prev?.text ?? '', name: c.name, callerId: c.callerId };
    }
  }
  if (worst && worst.delta <= -8) {
    // the webcam still the game took at that exact line (calls.ts), like the original's review, on a tape with the
    // time stamp; Play runs the three lines around it with their voices and subtitles
    const still = clips.find((c) => c.auto && c.line === worst!.text) ?? clips.find((c) => c.auto);
    const stamp = new Date(Date.now() - 1000 * 60 * (3 + (state.day % 7))).toTimeString().slice(0, 8);
    slides.push({
      title: t('Worst moment of the day'),
      body: `<div class="worst"><div class="tape" data-tape><div class="tape__screen">${still ? `<img class="tape__still" src="${still.dataUrl}" alt="Your face at that moment" width="320" height="240" />` : `<div class="tape__nosignal">${t('NO WEBCAM')}</div>`}<span class="tape__rec">● REC ${stamp}</span><span class="tape__cam">CAM 07 · ${esc(worst.name).toUpperCase()}</span><div class="tape__sub" aria-live="polite"></div></div></div><div class="worst__text"><div class="quote">“${esc(worst.text)}”</div><div>${t('— you, to {name}, mood {d}', { name: `<b>${esc(worst.name)}</b>`, d: worst.delta })}</div>` + (worst.reply ? `<div class="quote">“${esc(worst.reply)}”</div>` : '') + `<div><button type="button" class="btn btn--danger" data-replay>${t('▶ Play the tape')}</button></div></div></div>`,
      krull: still ? t('YOU SAID THIS. OUT LOUD. AND THAT IS YOUR FACE WHILE YOU SAID IT. I HAVE PRINTED IT.') : t('YOU SAID THIS. OUT LOUD. TO A CUSTOMER. I HAVE IT ON TAPE. I HAVE PLAYED IT TO MY MOTHER.'),
      replay: { callerId: worst.callerId, you: worst.text, reply: worst.reply, before: worst.before },
    });
  } else {
    slides.push({ title: t('Worst moment of the day'), body: `<div class="big">${t('NONE')}</div><div>${t('No recorded disasters.')}</div>`, krull: t('NO DISASTERS. SUSPICIOUS. I WILL FIND ONE TOMORROW.') });
  }

  // the day's three targets, ticked or not
  const targets = objectives();
  if (targets.length) {
    const sum = objectiveSummary();
    slides.push({
      title: t('Daily targets'),
      body: `<ul class="targets targets--review">${targets.map((o) => `<li class="target ${o.done ? 'target--done' : 'target--missed'}"><span class="target__tick" aria-hidden="true">${o.done ? '✓' : '✗'}</span><div class="target__body"><b>${esc(t(o.def.text))}</b></div><span class="target__reward tabular">${o.done ? '+' + fmt(o.def.reward) : o.def.target > 1 ? t('{a} of {b}', { a: o.progress, b: o.def.target }) : t('missed')}</span></li>`).join('')}</ul><div>${t('{a} of {b} done — {x} in bonuses, yours to keep.', { a: sum.done, b: sum.total, x: fmt(sum.earned) })}</div>`,
      krull: sum.done === sum.total ? t('ALL OF THEM. SUSPICIOUS. NOBODY DOES ALL OF THEM.') : sum.done === 0 ? t('ZERO TARGETS. THEY WERE ON THE WHITEBOARD. THE WHITEBOARD IS ON THE WALL.') : t('{a} OF {b}. A NUMBER. NOT A GOOD NUMBER.', { a: sum.done, b: sum.total }),
    });
  }

  if (state.history.length) {
    const counts = new Map<string, number>();
    state.history.forEach((h) => counts.set(h, (counts.get(h) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    slides.push({
      title: t('Office browser history'),
      body: top.slice(0, 5).map(([h, n]) => `<div><b>${esc(h)}</b> — ${n} visit${n > 1 ? 's' : ''}</div>`).join(''),
      krull: t('YOU VISITED {site} {n} TIMES. DURING WORK HOURS. ALL HOURS ARE WORK HOURS.', { site: top[0][0].toUpperCase(), n: top[0][1] }),
    });
  }

  const snaps = clips.filter((c) => c.kind === 'snapshot');
  if (snaps.length) {
    slides.push({
      title: t('Camera roll'),
      body: `<div class="roll">${snaps.slice(-4).map((c) => `<img src="${c.dataUrl}" alt="A snapshot taken during the shift" width="160" height="120" />`).join('')}</div><div>${snaps.length} snapshot${snaps.length > 1 ? 's' : ''} taken during the shift.</div>`,
      krull: snaps.length > 2 ? t('{n} PHOTOS OF YOURSELF. ZERO PHOTOS OF THE QUOTA.', { n: snaps.length }) : t('YOU TOOK A PHOTO AT WORK. THE PHOTO IS NOW COMPANY PROPERTY.'),
    });
  }
  const doodles = clips.filter((c) => c.kind === 'doodle');
  if (doodles.length) {
    slides.push({
      title: t('Art department'),
      body: `<div class="roll">${doodles.slice(-2).map((c) => `<img src="${c.dataUrl}" alt="A doodle drawn during the shift" width="213" height="140" />`).join('')}</div><div>Drawn during work hours.</div>`,
      krull: t('THIS IS WHAT YOU DREW. ON A COMPUTER I PAY FOR. IT IS NOT EVEN GOOD.'),
    });
  }

  if (state.casinoToday !== 0) {
    const won = state.casinoToday > 0;
    slides.push({
      title: t('Jackpotato activity'),
      body: `<div class="big">${won ? '+' : '−'}${fmt(Math.abs(state.casinoToday))}</div><div>${won ? 'Won' : 'Lost'} at the office casino during the shift.</div>`,
      krull: won ? t('YOU WON AT THE CASINO. THE CASINO IS MINE. SO THAT IS MY MONEY.') : t('THE CASINO IS FOR AFTER WORK. THERE IS NO AFTER WORK.'),
    });
  }

  if (state.strikes > 0) {
    slides.push({ title: t('Strikes'), body: `<div class="big">${state.strikes} / 3</div><div>Times I walked past and saw something that was not a customer.</div>`, krull: state.strikes >= 3 ? t('THREE STRIKES. I DO NOT NEED THE NEXT SLIDE.') : t('{n} STRIKES. I COUNT. I ALWAYS COUNT.', { n: state.strikes }) });
  }

  const diff = state.quota - state.team;
  const m = todayMutator();
  // the original's last slide: QUOTA MISSED BY $1,000 / YOU'RE FIRED! / $1,600 OF $2,600
  const of = t('{a} OF {b}', { a: fmt(state.team), b: fmt(state.quota) });
  const verdict = court ? `<div class="verdict"><span class="verdict__sub">${t("THE BUREAU'S FILE IS FULL")}</span><span class="verdict__big verdict__big--bad">${t('CASE CLOSED')}</span><span class="verdict__sub">${of}</span></div>`
    : pass ? `<div class="verdict"><span class="verdict__sub">${state.team > state.quota ? t('QUOTA MET BY {x}', { x: fmt(state.team - state.quota) }) : t('QUOTA MET')}</span><span class="verdict__big verdict__big--good">${t('YOU LIVE!')}</span><span class="verdict__sub">${of}</span></div>`
    : `<div class="verdict"><span class="verdict__sub">${state.strikes >= 3 && !coop.live ? t('THREE STRIKES') : t('QUOTA MISSED BY {x}', { x: fmt(diff) })}</span><span class="verdict__big verdict__big--bad">${t("YOU'RE FIRED!")}</span><span class="verdict__sub">${of}</span></div>`;
  slides.push({
    title: t('Verdict'),
    body: `${m ? `<div class="verdict__twist">${t("Tonight's twist:")} <b>${esc(m.name)}</b> — ${t('bonus ×{b}', { b: m.bonus })}</div>` : ''}${verdict}`,
    krull: court ? t('THE BUREAU HAS SPOKEN. EVERYONE OUT. ESPECIALLY YOU.') : pass ? t('QUOTA MET. DO NOT GET COMFORTABLE. TOMORROW IS {q}.', { q: fmt(quotaFor(state.day + 1)) }) : state.strikes >= 3 && !coop.live ? t('THREE STRIKES. EVERYONE. OUT.') : t('MISSED BY {x}. EVERYONE. OUT. YES, EVERYONE. {name} TOO.', { x: fmt(diff), name: (state.colleagues[0]?.name ?? 'Teodora').toUpperCase() }),
  });
  return { slides, pass };
}

export function showReview(): Promise<boolean> {
  const { slides, pass } = buildSlides();
  const pendingRoast = roast;
  roast = null;
  return new Promise((resolve) => {
    const el = document.createElement('section');
    el.className = 'review';
    el.setAttribute('aria-label', 'Performance review');
    el.innerHTML = `<div class="review__stage"><div class="review__slide" role="region" aria-live="polite"><h2></h2><div class="body"></div></div></div>
      <div class="review__krull"><div class="review__face" aria-hidden="true">${portraitSVG(KRULL_SPEC, 'angry', 56)}</div><div class="review__line"><b>Mr. Krull:</b> <span></span></div><button class="btn" type="button">${t('Next')}</button></div>
      <button class="review__door" type="button" title="Slip out of the review. The verdict stands; tomorrow starts on strike one."><span class="review__door-frame"><i></i></span><b>${t('Slip out')}</b><small>${t('skip the review · 1 strike tomorrow')}</small></button>`;
    document.body.appendChild(el);
    // the original's review-skip door: out you go, the verdict stands, Krull remembers
    el.querySelector('.review__door')!.addEventListener('click', () => {
      stopSpeaking(); clearClips(); state.carryStrike = true; sfx.click();
      krullSays(t('I SAW THAT. THE DOOR COUNTS. TOMORROW YOU START ON ONE.'), { evenOnCall: true });
      el.remove(); resolve(pass);
    });
    const h = el.querySelector<HTMLElement>('h2')!, body = el.querySelector<HTMLElement>('.body')!, line = el.querySelector<HTMLElement>('.review__line span')!, btn = el.querySelector<HTMLButtonElement>('.btn')!;
    let i = 0;
    const show = () => {
      const s = slides[i];
      stopSpeaking();
      h.textContent = s.title; body.innerHTML = s.body; line.textContent = s.krull;
      krullSays(s.krull, { evenOnCall: true });
      // the last slide of a failed review: red fog and fire fill the room, like the original's firing
      if (i === slides.length - 1 && !pass) { el.classList.add('review--doom'); setReviewDoom(true); sfx.boom(); }
      btn.textContent = i === slides.length - 1 ? (pass ? t('Clock out') : t('Pack your things')) : t('Next');
      if (settings.motion !== 'off') el.querySelector('.review__slide')!.animate([{ opacity: 0, transform: 'translate(-50%, -50%)' }, { opacity: 1, transform: 'translate(-50%, -52%)' }], { duration: 220, easing: 'ease-out' });
      sfx.click();
      const rp = s.replay;
      body.querySelector('[data-replay]')?.addEventListener('click', () => {
        if (!rp) return;
        const c = callerById(rp.callerId);
        const b = body.querySelector<HTMLButtonElement>('[data-replay]')!;
        const tape = body.querySelector<HTMLElement>('[data-tape]');
        const sub = body.querySelector<HTMLElement>('.tape__sub');
        b.disabled = true; b.textContent = t('▶ Playing…');
        tape?.classList.add('tape--playing');
        // the tape: what the caller said, what you said, what they said back, each in its own voice with subtitles
        const you = { pitch: 0.9, rate: 1.05, prefer: getAvatar().body === 'woman' ? 'female' as const : 'male' as const };
        const seq = [
          ...(rp.before && c ? [{ who: c.name, text: rp.before, voice: voiceFor(c, 50), id: c.id }] : []),
          { who: settings.playerName || t('You'), text: rp.you, voice: you, id: 'you' },
          ...(rp.reply && c ? [{ who: c.name, text: rp.reply, voice: voiceFor(c, 20), id: c.id }] : []),
        ];
        let k = 0;
        const next = (): void => {
          if (!body.isConnected || k >= seq.length) {
            tape?.classList.remove('tape--playing');
            if (sub) sub.textContent = '';
            b.disabled = false; b.textContent = t('▶ Play it again');
            return;
          }
          const ln = seq[k++];
          if (sub) sub.innerHTML = `<b>${esc(ln.who)}:</b> ${esc(ln.text)}`;
          // a line moves on when its voice ends, or after the time it takes to read it (voices off, or a voice that never ends)
          let moved = false;
          const go = (): void => { if (!moved) { moved = true; next(); } };
          const readMs = Math.min(9000, 1400 + ln.text.length * 55);
          if (settings.voiceOut) { speak(ln.text, ln.voice, ln.id, go); setTimeout(go, readMs + 6000); } else setTimeout(go, readMs);
        };
        next();
      });
    };
    btn.addEventListener('click', () => { if (i < slides.length - 1) { i++; show(); } else { stopSpeaking(); clearClips(); el.remove(); resolve(pass); } });
    const start = (): void => { if (!el.isConnected) return; show(); btn.focus(); };
    // tonight's lines from the live brain: wait at most 4 s once the room is up; lines that come later still reach
    // the slides nobody has seen yet
    if (pendingRoast) {
      h.textContent = slides[0].title;
      line.textContent = t('…reading tonight’s transcripts…');
      btn.disabled = true;
      let started = false;
      const begin = (): void => { if (started) return; started = true; btn.disabled = false; start(); };
      void pendingRoast.then((lines) => { if (lines) lines.forEach((l, k) => { if (l && slides[k] && (!started || k > i)) slides[k].krull = l; }); begin(); });
      setTimeout(begin, 4000);
    } else start();
  });
}
