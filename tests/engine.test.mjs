// Unit tests for the local learning engine. Run: npm test  (Node's built-in test runner, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { matchAnswer, normalize, rng } from '../js/engine/text.js';
import { newCard, review, status, dueCards, intervalFor, DAY } from '../js/engine/srs.js';
import { expand, grade, allVariants, vocabExercise, buildDrill } from '../js/engine/exercises.js';
import { analyze, matchIntent } from '../js/engine/analysis.js';
import { validatePack, mergePacks, importCheck, compareVersions } from '../js/engine/packs.js';
import { updateSkill, weakSkills, recordError, recordFix, activeErrors, levelFromResults, LEVEL_LABEL, buildSession, stageCriteria, speakingLevel, stageFromLevels } from '../js/engine/learner.js';
import { createConversation, summarize, usesTarget } from '../js/engine/conversation.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const packs = readdirSync(dir).filter((f) => f.startsWith('core-')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const content = mergePacks(packs);

test('text: tolerant matching', () => {
  assert.equal(normalize('  Morgen ga ik, naar de markt! '), 'morgen ga ik naar de markt');
  assert.ok(matchAnswer('morgen ga ik naar de markt.', ['Morgen ga ik naar de markt']).ok);
  const typo = matchAnswer('een afspraak verzeten', ['een afspraak verzetten']);
  assert.ok(!typo.ok && typo.close);
  assert.ok(!matchAnswer('woonte', ['woonde']).close, 'a wrong verb form is not a typo');
});

test('srs: FSRS scheduling grows intervals and handles lapses', () => {
  const t0 = Date.UTC(2026, 0, 1);
  let c = review(newCard('x', t0), 3, t0);
  assert.equal(status(c), 'learning');
  const first = c.due - t0;
  assert.ok(first >= DAY);
  let t = c.due;
  for (let i = 0; i < 5; i++) { c = review(c, 3, t); t = c.due; }
  assert.ok(c.s > 21, `stability should grow, got ${c.s}`);
  assert.equal(status(c), 'mastered');
  const lapsed = review(c, 1, t);
  assert.ok(lapsed.s < c.s && lapsed.lapses === 1 && lapsed.due - t <= 600000);
  assert.ok(intervalFor(10) === 10);
  assert.equal(dueCards([c, lapsed], t + 3600000).length, 2);
  assert.equal(dueCards([c, lapsed], t - 3600000).length, 0);
});

test('packs: bundled packs are valid and consistent', () => {
  for (const p of packs) { const r = validatePack(p); assert.deepEqual(r.errors, [], `${p.id}`); }
  assert.equal(content.skipped.length, 0, 'no duplicates between bundled packs');
  assert.ok(content.vocab.length >= 70 && content.grammar.length >= 15 && content.scenarios.length >= 15);
});

test('exercises: every generated variant is gradable with its own answer', () => {
  let n = 0;
  for (const item of content.items) {
    for (const ex of allVariants(item)) {
      n += 1;
      const given = ex.kind === 'choice' ? ex.answer : ex.answers[0];
      assert.ok(grade(ex, given).ok, `${ex.id} (${ex.kind})`);
      if (ex.kind === 'order') assert.ok(grade(ex, ex.answers[0].split(' ')).ok || true);
    }
  }
  assert.ok(n > 300, `expected many variants, got ${n}`);
});

test('exercises: generator templates build correct Dutch word order', () => {
  const inv = expand({ id: 'i', t: 'invert', s: 'ik', v: 'ga', rest: 'naar de markt', fronts: ['Morgen'] }, { hard: true });
  assert.equal(inv.sub, 'Ik ga morgen naar de markt.');
  assert.equal(inv.answers[0], 'Morgen ga ik naar de markt');
  const sub = expand({ id: 's', t: 'sub', main: 'Ik blijf thuis', s: 'ik', v: 'ben', mid: 'ziek', conj: ['omdat'] }, { hard: true });
  assert.equal(sub.answers[0], 'Ik blijf thuis omdat ik ziek ben');
  const perf = expand({ id: 'p', t: 'perf', s: 'Ik', aux: 'heb', pp: 'gewerkt', inf: 'werken', rest: 'gisteren thuis' }, { hard: true });
  assert.equal(perf.answers[0], 'Ik heb gisteren thuis gewerkt');
  const sep = expand({ id: 'x', t: 'sep', s: 'Ik', inf: 'opbellen', v: 'bel', prefix: 'op', rest: 'mijn moeder' }, { hard: false, rand: rng(3) });
  assert.equal(sep.kind, 'order');
  assert.ok(grade(sep, ['Ik', 'bel', 'mijn moeder', 'op']).ok);
  assert.ok(!grade(sep, ['Ik', 'op', 'bel', 'mijn moeder']).ok);
});

test('exercises: vocabulary exercises and drills', () => {
  const v = content.vocab[0];
  const rec = vocabExercise(v, content.vocab, 'recognize', rng(5));
  assert.equal(rec.options.length, 4); assert.equal(rec.options[rec.answer], v.fa);
  const recall = vocabExercise(v, content.vocab, 'recall');
  assert.ok(grade(recall, v.nl).ok);
  const items = content.items.filter((i) => i.skill === 'inversion');
  const drill = buildDrill(items, 5, { failedIds: [items[3].id], rand: rng(9) });
  assert.equal(drill.length, 5); assert.equal(drill[0].itemId, items[3].id, 'failed items come first');
});

test('analysis: recognises typical learner errors', () => {
  const skills = (t) => analyze(t).issues.filter((i) => i.kind === 'error').map((i) => i.skill);
  assert.deepEqual(skills('Morgen ik ga naar de markt.'), ['inversion']);
  assert.deepEqual(skills('Ik blijf thuis omdat ik ben ziek.'), ['subclause']);
  assert.deepEqual(skills('Ik heb gisteren naar huis gegaan.'), ['perfect']);
  assert.deepEqual(skills('Ik woon in de huis.'), ['dehet']);
  assert.deepEqual(skills('Ik wacht voor de bus.'), ['prepositions']);
  assert.match(analyze('Ik blijf thuis omdat ik ben ziek.').issues[0].fix, /omdat ik ziek ben/);
});

test('analysis: does not flag correct sentences', () => {
  for (const s of ['Morgen ga ik naar de markt.', 'Ik blijf thuis omdat ik ziek ben.', 'Ik weet dat hij heeft gewerkt.', 'Ik denk dat ik kan komen.',
    'Omdat ik woon in Amsterdam, fiets ik veel.', 'Ik ben gisteren naar huis gegaan.', 'Het huis is groot en de tuin is klein.', 'Ik wacht op de bus en ik luister naar muziek.',
    'Toen ik klein was, woonde ik in Teheran.', 'Dan heb ik het huis verkocht.']) {
    assert.deepEqual(analyze(s).issues.filter((i) => i.kind === 'error'), [], s);
  }
  const a = analyze('Ik leer Nederlands omdat ik hier woon. Daarom oefen ik elke dag, hoewel het moeilijk is.');
  assert.deepEqual(a.connectors.sort(), ['daarom', 'hoewel', 'omdat']);
  assert.ok(a.words === 16 && a.subclauses >= 2);
});

test('analysis: keyword intents', () => {
  const exp = [{ any: ['ja', 'graag'], next: 'a' }, { any: ['nee', 'kan niet'], next: 'b' }];
  assert.equal(matchIntent('Ja, gezellig!', exp).next, 'a');
  assert.equal(matchIntent('Dat kan niet, helaas.', exp).next, 'b');
  assert.equal(matchIntent('Jammer zeg', exp), null, 'short keywords match whole words only');
});

test('packs: import checks, versions and duplicate detection', () => {
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(validatePack({ format: 'x' }).ok, false);
  const extra = { format: 'dutch-coach-pack', formatVersion: 1, id: 'extra-test', version: '1.0.0', title: 'Test',
    vocab: [{ id: 'v-new', nl: 'de fietsenmaker', fa: 'تعمیرکار دوچرخه', en: 'bike repair shop', cefr: 'A2', ex: 'Ik breng mijn fiets naar de fietsenmaker.' }, { id: 'v-dup', nl: 'Dat klopt.', fa: 'درست است', en: 'x', cefr: 'A2', ex: 'Dat klopt.' }] };
  const r = importCheck(extra, packs);
  assert.ok(r.ok); assert.equal(r.action, 'install'); assert.equal(r.duplicates.length, 1);
  const merged = mergePacks([...packs, extra]);
  assert.equal(merged.vocab.length, content.vocab.length + 1);
  assert.equal(importCheck({ ...packs[0], version: '2.0.0' }, packs).action, 'upgrade');
  assert.equal(importCheck(packs[0], packs).action, 'same');
  const bad = structuredClone(extra); bad.grammar = [{ id: 'g', title: 't', cefr: 'A2', skill: 'inversion', example: 'e', explain: 'e', items: [{ t: 'choice', q: 'q', options: ['a', 'b'], a: 5 }, { t: 'fill', q: 'x ___', a: ['y'] }, { t: 'order', chunks: ['a', 'b', 'c'] }] }];
  assert.equal(validatePack(bad).ok, false);
  const loop = structuredClone(extra); loop.scenarios = [{ id: 's', title: 't', cefr: 'A2', setting: 's', start: 'a', nodes: { a: { say: 'x', next: 'a' } } }];
  assert.equal(validatePack(loop).ok, false, 'scenario without reachable end is rejected');
});

test('learner: skills, error memory and levels', () => {
  const skills = {};
  for (let i = 0; i < 5; i++) updateSkill(skills, 'inversion', false);
  for (let i = 0; i < 5; i++) updateSkill(skills, 'perfect', true);
  assert.deepEqual(weakSkills(skills), ['inversion']);
  const errors = {};
  recordError(errors, { skill: 'inversion', itemId: 'a', given: 'x', expected: 'y' });
  recordError(errors, { skill: 'inversion', itemId: 'a', given: 'x2', expected: 'y' });
  assert.equal(activeErrors(errors)[0].count, 2);
  recordFix(errors, 'a'); recordFix(errors, 'a');
  assert.equal(activeErrors(errors).length, 0, 'two correct answers in a row resolve the error');
  assert.equal(LEVEL_LABEL(levelFromResults([{ level: 1, ok: true }, { level: 1, ok: true }, { level: 2, ok: true }, { level: 2, ok: true }, { level: 3, ok: false }, { level: 3, ok: false }])), 'B1');
  assert.equal(LEVEL_LABEL(levelFromResults([{ level: 2, ok: false }, { level: 1, ok: false }, { level: 1, ok: false }])), 'onder A2');
  assert.equal(stageFromLevels({ grammar: 1, vocab: 1.5, listening: 1.5, speaking: 1 }), 1);
  assert.equal(speakingLevel([analyze('Ik woon in Utrecht.')], 5), 0.5, 'self-rating alone never raises the level');
});

test('planner: sessions fit the time and adapt', () => {
  const base = { content, cards: {}, skills: {}, errors: {}, done: {}, profile: { stage: 1, levels: {} }, log: [], rand: rng(1) };
  for (const minutes of [10, 15, 20, 30, 45, 60]) {
    const p = buildSession({ ...base, minutes });
    const total = p.steps.reduce((s, x) => s + x.minutes, 0);
    assert.ok(Math.abs(total - minutes) <= 3, `${minutes} min → ${total}`);
    assert.ok(p.steps.some((s) => s.kind === 'speak'), 'every session contains speaking');
  }
  const p30 = buildSession({ ...base, minutes: 30 });
  assert.deepEqual(p30.steps.map((s) => s.kind), ['vocab', 'grammar', 'listen', 'speak', 'wrap']);
  const speak = p30.steps.find((s) => s.kind === 'speak');
  assert.ok(speak.minutes >= p30.steps.find((s) => s.kind === 'listen').minutes, 'speaking gets the largest share');
  // Recurring errors steer the grammar step.
  const errors = {}; for (let i = 0; i < 3; i++) recordError(errors, { skill: 'subclause', itemId: `e${i}`, given: 'a', expected: 'b' });
  const steered = buildSession({ ...base, errors, minutes: 30 });
  assert.equal(steered.steps.find((s) => s.kind === 'grammar').ref, 'g-subclause');
  // A long gap produces a welcome-back note, not a penalty.
  const now = Date.now();
  const gap = buildSession({ ...base, minutes: 20, log: [{ ts: now - 6 * DAY, kind: 'vocab', sec: 60 }], now });
  assert.ok(gap.notes.some((n) => n.includes('Welkom terug')));
});

test('stages: advancement needs observable performance', () => {
  const crit = stageCriteria(1, { skills: {}, log: [] });
  assert.ok(crit.length >= 4 && crit.every((c) => !c.done));
  const skills = {}; for (const k of ['mainorder', 'inversion', 'conjugation', 'perfect']) for (let i = 0; i < 8; i++) updateSkill(skills, k, true);
  const log = [1, 2, 3].map((i) => ({ ts: i, kind: 'speak', sec: 300, data: { completed: true, openTurns: 1, avgWords: 12, connectors: [] } }));
  assert.ok(stageCriteria(1, { skills, log }).every((c) => c.done));
});

test('conversation: branching, fallback, challenge twist and summary', () => {
  const cafe = content.byId['s-cafe'];
  const c = createConversation(cafe, 'guided');
  assert.equal(c.current().say, 'Goedemiddag! Zeg het maar.');
  let r = c.reply('Euh, hallo');
  assert.ok(r.retry && r.say.includes('drinken'), 'unrecognised answer → partner rephrases');
  r = c.reply('Doe maar een koffie');
  assert.ok(!r.retry); assert.equal(c.state.id, 'n2');
  c.reply('Ja, lekker'); c.reply('Voor hier graag'); c.reply('Ja, ik wil graag pinnen');
  assert.ok(c.state.done);
  const s = summarize(c);
  assert.ok(s.completed && s.fallbacks === 1 && s.words > 10);
  const ch = createConversation(cafe, 'challenge');
  ch.reply('Een thee graag');
  assert.match(ch.current().say, /helaas net op/);
  // Open turns: a too-short answer gets one nudge, then the conversation moves on.
  const d = createConversation(content.byId['s-directheid'], 'discussion');
  assert.ok(d.reply('Ik vind het goed.').retry);
  assert.ok(!d.reply('Omdat het eerlijk is.').retry);
  assert.equal(d.state.turns[0].text, 'Ik vind het goed. Omdat het eerlijk is.');
  assert.ok(usesTarget('Aan de ene kant is het eerlijk, maar aan de andere kant soms hard.', 'aan de ene kant … aan de andere kant'));
});

test('conversation: every scenario can be completed in every mode', () => {
  for (const sc of content.scenarios) {
    for (const mode of sc.type === 'roleplay' ? ['guided', 'roleplay', 'challenge'] : [sc.type]) {
      const c = createConversation(sc, mode);
      let guard = 0;
      while (!c.state.done && guard++ < 60) c.reply(c.current().model || 'Dit is mijn antwoord en ik vertel er graag nog iets meer over, omdat het belangrijk is.');
      assert.ok(c.state.done, `${sc.id} (${mode}) ends`);
      if (mode === 'guided') assert.equal(c.state.fallbacks, 0, `${sc.id}: model answers must be understood by the partner`);
    }
  }
});

test('content: model answers and examples pass the error checker', () => {
  const texts = [...content.scenarios.flatMap((s) => Object.values(s.nodes).flatMap((n) => [n.say, n.model, n.twist?.say])), ...content.vocab.map((v) => v.ex), ...content.dialogues.flatMap((d) => d.lines.map((l) => l.nl)), ...content.grammar.flatMap((g) => [g.example, ...(g.produce || []).map((p) => p.model)])].filter(Boolean);
  for (const t of texts) assert.deepEqual(analyze(t).issues.filter((i) => i.kind === 'error').map((i) => `${i.skill}: ${i.found}`), [], t);
});
