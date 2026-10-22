// Validates the big roster (src/game/roster/) without a browser: bundles it with esbuild, then checks every
// caller for the fields the brains rely on, unique ids and names, valid product ids, working challenge patterns.
//   node tools/check-roster.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_IDS = ['gerald', 'fluff', 'goose', 'barnaby', 'fridge', 'valentina', 'atm', 'toaster', 'wisteria', 'attic', 'mortimer', 'reginald', 'saltbeard', 'grizelda', 'tallman', 'zorp', 'themoon', 'dennis', 'priscilla', 'honk', 'marbles', 'drquiz', 'gezi', 'drita', 'besnik', 'agron', 'nexha', 'luan'];
const SCAMS = ['moon', 'sun', 'gravity', 'clouds', 'vowels', 'haunt', 'petwifi', 'runes', 'beancoin', 'fridge', 'volcano', 'silence', 'shadow', 'tuesday'];
const ARCHES = ['creature', 'machine', 'spirit', 'legend', 'cosmic', 'inspector'];
const KINDS = ['human', 'cat', 'raccoon', 'goose', 'bear', 'robot', 'ghost', 'alien', 'moon', 'cloud', 'trenchcoat', 'toaster'];
// 2026-10-20: Luca had every built-in caller deleted (the roster families and the 28 in callers.ts); the pool is
// whatever the Character Creator holds, so the count check is off. Set it back to 200 if the roster returns.
const TARGET = 0;

const out = await build({ entryPoints: ['src/game/roster/index.ts'], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
const dir = mkdtempSync(join(tmpdir(), 'hp-roster-'));
const file = join(dir, 'roster.mjs');
writeFileSync(file, out.outputFiles[0].text);
const { EXTRA_ROSTER, SEEDS } = await import(pathToFileURL(file).href);

const problems = [];
const ids = new Set(BASE_IDS), names = new Set(), openers = new Set();
const byArch = {};
for (const c of EXTRA_ROSTER) {
  const p = (msg) => problems.push(`${c.id}: ${msg}`);
  if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) p('bad id');
  if (ids.has(c.id)) p('duplicate id'); ids.add(c.id);
  if (!c.name) p('no name'); if (names.has(c.name.toLowerCase())) p('duplicate name'); names.add(c.name.toLowerCase());
  if (!ARCHES.includes(c.archetype)) p('bad archetype ' + c.archetype);
  byArch[c.archetype] = (byArch[c.archetype] || 0) + 1;
  if (!c.gimmick || c.gimmick.length < 20) p('gimmick too short');
  if (!Array.isArray(c.world) || c.world.length < 6) p('world words < 6');
  if (!Array.isArray(c.openers) || c.openers.length < 2) p('openers < 2');
  for (const o of c.openers) { if (openers.has(o)) p('duplicate opener'); openers.add(o); }
  if (!Array.isArray(c.quirks) || c.quirks.length < 2) p('quirks < 2');
  if (!c.question) p('no question');
  if (!Array.isArray(c.answer) || c.answer.length < (c.archetype === 'inspector' ? 1 : 4)) p('answer words too few');
  if (!Array.isArray(c.likes)) p('no likes'); else for (const l of c.likes) if (!SCAMS.includes(l)) p('unknown product ' + l);
  if (c.archetype !== 'inspector' && c.likes.length < 2) p('likes < 2');
  if (typeof c.mood0 !== 'number' || c.mood0 < 0 || c.mood0 > 100) p('bad mood0');
  if (!c.voice || typeof c.voice.pitch !== 'number' || typeof c.voice.rate !== 'number') p('bad voice');
  if (!c.portrait || !KINDS.includes(c.portrait.kind)) p('bad portrait kind ' + (c.portrait && c.portrait.kind));
  if (typeof c.budget !== 'number' || c.budget <= 0) p('bad budget');
  if (c.archetype !== 'inspector') {
    if (typeof c.wary !== 'number' || c.wary < 0 || c.wary > 1) p('wary missing or out of range');
    if (!c.suspicions || c.suspicions.length < 1) p('no suspicion lines');
    if (!c.byeSuspicious || c.byeSuspicious.length < 1) p('no suspicious goodbye');
    if (!c.challenges || c.challenges.length < 1) p('no challenge');
    else for (const ch of c.challenges) {
      if (!ch.ask || !ch.pass || !ch.fail) p('challenge missing text');
      const a = ch.accept;
      if (!(a instanceof RegExp) && !['name', 'company', 'answer', 'world'].includes(a)) p('challenge accept is neither a RegExp nor a keyword');
      if (a instanceof RegExp && a.test('')) p('challenge regex matches the empty string');
    }
  }
  const all = [c.gimmick, ...c.openers, ...c.quirks, c.question, ...(c.suspicions || []), ...(c.byeSuspicious || []), ...(c.challenges || []).flatMap((ch) => [ch.ask, ch.pass, ch.fail])].join(' ');
  if (/\bscam\b/i.test(all) && c.archetype !== 'inspector') p('says "scam" out loud');
  if (/\{(name|you|value|topic)\}/.test(all)) p('uses a {placeholder} the roster does not fill');
}
const total = BASE_IDS.length + EXTRA_ROSTER.length;
console.log(`roster: ${EXTRA_ROSTER.length} new + ${BASE_IDS.length} built-in = ${total} callers`);
console.log('by family:', JSON.stringify(byArch));
console.log('seeds with their own voice:', SEEDS.filter((s) => s.voice).length, '· with a drawing kind:', SEEDS.filter((s) => s.kind).length);
if (total < TARGET) problems.push(`only ${total} callers, wanted ${TARGET}`);
if (problems.length) { console.log('\nPROBLEMS:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('ROSTER OK');
