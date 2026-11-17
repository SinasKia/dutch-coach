// Screens: Speak, Listen, Vocabulary, Progress, More (Grammar, Missions, Learning plan, Settings).
import { h, append, clear, en, btn, card, pill, toast, modal, confirmBox, bar, mins, dateNL } from './ui.js';
import { S, save, logActivity, markDone, recordPattern, syncHosted, installPack, removePack, checkImport, exportData, importData, wipe } from './store.js';
import { route, go } from './router.js';
import { runExercises, runReview, runListening, runConversation, runProduction, drillFor, enHelp, audioBtn, vocabCardView, vocabExercise, say, answerInput } from './activities.js';
import { tts, stt, recorder } from './speech.js';
import { MODES } from './engine/conversation.js';
import { SKILLS } from './engine/packs.js';
import { analyze } from './engine/analysis.js';
import { dueCards, status, DAY } from './engine/srs.js';
import { shuffle } from './engine/text.js';
import { listProviders } from './ext/ai.js';
import { chooseScenario, STAGES, stageCriteria, LEVEL_LABEL, minutesSince, startOfWeek, retention, vocabCounts, errorsBySkill, activeErrors, weakSkills, conversationStats, listeningStats } from './engine/learner.js';

const back = (to, label = 'Terug') => h('a', { class: 'back', href: `#/${to}` }, `‹ ${label}`);
const doneMark = (id) => S.done[id] && pill(`${S.done[id].n}× gedaan`, 'ok');
const listItem = (href, title, sub, ...right) => h('a', { class: 'item', href }, h('div', {}, h('b', {}, title), sub && h('p', { class: 'muted small' }, sub)), h('div', { class: 'row' }, right));

/* ============================ Speak ============================ */
let speakTab = 'guided';
route('speak', (root) => {
  const tabs = ['guided', 'roleplay', 'challenge', 'free', 'discussion'];
  const info = {
    guided: 'Rollenspel met handige zinnen in beeld. De tekst van je gesprekspartner is zichtbaar.',
    roleplay: 'Zonder hulp: je hoort je gesprekspartner en reageert. Tekst en hints alleen als je erom vraagt.',
    challenge: 'Zelfde situaties, maar er gaat iets mis of je krijgt een onverwachte vraag.',
    free: 'Langere, vrije antwoorden op open vragen. Niemand onderbreekt je.',
    discussion: 'Standpunt innemen, argumenten geven, reageren op een tegenargument en afsluiten.',
  };
  const type = ['free', 'discussion'].includes(speakTab) ? speakTab : 'roleplay';
  const list = S.content.scenarios.filter((s) => !s.hidden && s.type === type && (speakTab !== 'challenge' || Object.values(s.nodes).some((n) => n.twist))).sort((a, b) => (a.stage || 1) - (b.stage || 1));
  const rec = chooseScenario({ content: S.content, done: S.done, profile: S.profile, skills: S.skills, type });
  append(root, h('h1', {}, 'Gespreksstudio'),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map((t) => h('button', { role: 'tab', 'aria-selected': String(t === speakTab), class: t === speakTab ? 'on' : '', onclick: () => { speakTab = t; go('speak'); } }, MODES[t].label))),
    h('p', { class: 'muted' }, info[speakTab]),
    rec && card(h('p', { class: 'muted small' }, 'Aanbevolen voor jou'), h('h3', {}, rec.scenario.title), h('p', { class: 'muted small' }, rec.scenario.setting), btn('Start', () => go(`scenario/${rec.scenario.id}?mode=${speakTab}`), 'primary')),
    h('div', { class: 'list' }, list.map((s) => listItem(`#/scenario/${s.id}?mode=${speakTab}`, s.title, s.setting, pill(s.cefr), (s.stage || 1) > S.profile.stage + 1 && pill('boven je fase'), doneMark(s.id)))),
    h('details', { class: 'card' }, h('summary', {}, 'Hoe werkt dit — en wat kan het niet?'),
      h('p', {}, 'Je gesprekspartner is gescript: de app herkent trefwoorden in je antwoord en kiest daarmee het vervolg van het gesprek, of accepteert een open antwoord als het lang genoeg is. Er draait geen AI-model, dus de partner begrijpt de inhoud van je antwoord niet echt en kan geen volledig vrij gesprek voeren.'),
      h('p', {}, 'Spraakherkenning komt van je browser (Chrome op Android); die heeft meestal internet nodig. Typen kan altijd. De herkende tekst kun je aanpassen voordat je hem verstuurt.'),
      h('p', {}, 'Je uitspraak wordt niet beoordeeld: uit een transcript valt dat niet betrouwbaar af te leiden. Gebruik shadowing (Luisteren) om je eigen opname met het voorbeeld te vergelijken.'),
      enHelp('The conversation partner is scripted: the app looks for keywords in your answer and picks the next line. No AI model is involved, and your pronunciation is not scored.', 'block muted')));
});
route('scenario', (root, id, params) => {
  const s = S.content.byId[id];
  if (!s) return go('speak');
  const mode = s.type !== 'roleplay' ? s.type : ['guided', 'roleplay', 'challenge'].includes(params.mode) ? params.mode : 'guided';
  append(root, back(params.from || 'speak'));
  const body = h('div', {}); root.append(body);
  runConversation(body, s, mode, { onDone: () => go(params.from || 'speak') });
});

/* ============================ Listen ============================ */
route('listen', (root) => {
  const last = (id) => S.log.filter((e) => e.kind === 'listen' && e.ref === id).at(-1);
  append(root, h('h1', {}, 'Luisteren en shadowing'),
    h('p', { class: 'muted' }, 'Eerst luisteren zonder tekst, dan vragen, dan meelezen en naspreken. De audio wordt op je toestel gemaakt met de Nederlandse stem van je telefoon; daardoor werkt het ook offline.'),
    !tts.voice() && h('p', { class: 'warn' }, tts.supported ? 'Geen Nederlandse stem gevonden op dit toestel. Kijk bij Instellingen → Spraak hoe je die installeert.' : 'Dit toestel ondersteunt geen spraaksynthese.'),
    ['A2', 'B1', 'B2'].map((lvl) => { const ds = S.content.dialogues.filter((d) => d.cefr === lvl); return ds.length ? [h('h3', {}, lvl), h('div', { class: 'list' }, ds.map((d) => { const l = last(d.id); return listItem(`#/dialogue/${d.id}`, d.title, `${d.lines.length} zinnen · ${d.topic || ''}`, l && pill(`${l.data.correct}/${l.data.total}`, l.data.correct === l.data.total ? 'ok' : ''), doneMark(d.id)); }))] : null; }));
});
route('dialogue', (root, id) => {
  const d = S.content.byId[id];
  if (!d) return go('listen');
  append(root, back('listen'));
  const body = h('div', {}); root.append(body);
  runListening(body, d, { onDone: () => go('listen') });
});

/* ============================ Vocabulary ============================ */
let vocabFilter = 'all', vocabQuery = '';
route('vocab', (root) => {
  const counts = vocabCounts(S.content.vocab, S.cards);
  const due = dueCards(Object.values(S.cards)).filter((c) => S.content.byId[c.id]).length;
  const names = { new: 'Nieuw', learning: 'Aan het leren', reviewing: 'Herhalen', difficult: 'Moeilijk', mastered: 'Beheerst' };
  const body = h('div', {});
  const start = (opts) => { clear(root); const box = h('div', {}); append(root, back('vocab'), box); runReview(box, { ...opts, onDone: (r) => { if (r.sec > 5) logActivity('vocab', r.sec, 'review', {}); if (!r.empty) toast(`${r.reviewed} herhaald · ${r.learned} nieuw`); go('vocab'); } }); };
  const quiz = () => {
    const known = S.content.vocab.filter((v) => S.cards[v.id]);
    const pool = shuffle(known.length >= 6 ? known : S.content.vocab).slice(0, 8);
    clear(root); const box = h('div', {}); append(root, back('vocab'), box);
    runExercises(box, pool.map((v, i) => vocabExercise(v, S.content.vocab, ['recognize', 'cloze', 'recall'][i % 3])), { title: 'Woordquiz', onDone: (r) => { logActivity('vocab', r.sec, 'quiz', { correct: r.correct, total: r.total }); toast(`${r.correct} van ${r.total} goed`); go('vocab'); } });
  };
  const drawList = () => {
    const q = vocabQuery.toLowerCase();
    const items = S.content.vocab.filter((v) => (vocabFilter === 'all' || status(S.cards[v.id]) === vocabFilter) && (!q || v.nl.toLowerCase().includes(q) || (v.en || '').toLowerCase().includes(q)));
    append(clear(body), h('p', { class: 'muted small' }, `${items.length} uitdrukkingen`), h('div', { class: 'list' }, items.slice(0, 150).map((v) => h('button', { class: 'item', onclick: () => modal((close) => [vocabCardView(v), h('div', { class: 'row end' }, btn('Sluiten', close, 'primary'))]) },
      h('div', {}, h('b', { lang: 'nl' }, v.nl), h('p', { class: 'small muted' }, en(v.en))), h('div', { class: 'row' }, pill(v.cefr), pill(names[status(S.cards[v.id])], status(S.cards[v.id]) === 'mastered' ? 'ok' : status(S.cards[v.id]) === 'difficult' ? 'bad' : ''))))));
  };
  append(root, h('h1', {}, 'Woorden en uitdrukkingen'),
    card(h('div', { class: 'stats' }, Object.keys(names).map((k) => h('div', { class: 'stat' }, h('b', {}, counts[k]), h('span', {}, names[k])))),
      h('div', { class: 'row wrap' }, btn(`Herhaal nu (${due})`, () => start({ reviewN: 40, newN: 0 }), due ? 'primary' : 'ghost'), btn('Leer 5 nieuwe', () => start({ reviewN: 0, newN: 5 }), due ? 'ghost' : 'primary'), btn('Snelle quiz', quiz, 'ghost')),
      h('p', { class: 'muted small' }, '“Beheerst” betekent: je hebt het over langere tijd steeds goed opgehaald (FSRS-planning), niet: je hebt de kaart vaak gezien.')),
    h('input', { class: 'text', type: 'search', placeholder: 'Zoek in het Nederlands of Engels', 'aria-label': 'Zoeken', value: vocabQuery, oninput: (e) => { vocabQuery = e.target.value; drawList(); } }),
    h('div', { class: 'row wrap' }, [['all', 'Alles'], ...Object.entries(names)].map(([k, l]) => h('button', { class: `chip ${vocabFilter === k ? 'on' : ''}`, onclick: () => { vocabFilter = k; go('vocab'); } }, l))),
    body);
  drawList();
});

/* ============================ Progress ============================ */
function spark(values, max = 5) {
  if (values.length < 2) return null;
  const w = 240, hgt = 48, step = w / (values.length - 1);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('class', 'spark'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Verloop: ${values.join(', ')}`);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  p.setAttribute('points', values.map((v, i) => `${(i * step).toFixed(1)},${(hgt - 4 - (v / max) * (hgt - 8)).toFixed(1)}`).join(' '));
  p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2');
  svg.append(p); return svg;
}
function maybeAdvance() {
  const st = S.profile.stage;
  if (st >= 5) return;
  const crit = stageCriteria(st, { skills: S.skills, log: S.log });
  if (crit.length && crit.every((c) => c.done)) { S.profile.stage = st + 1; save('profile'); toast(`Je hebt alle criteria gehaald: je gaat naar fase ${st + 1}.`, 5000); }
}
route('progress', (root) => {
  maybeAdvance();
  const now = Date.now(), wk = startOfWeek(now);
  const diags = S.profile.diagnostics, last = diags.at(-1), prev = diags.at(-2);
  const labels = { grammar: 'Grammatica', vocab: 'Woordenschat', listening: 'Luisteren', speaking: 'Spreken' };
  const weeks = [3, 2, 1, 0].map((i) => minutesSince(S.log, wk - i * 7 * DAY) - minutesSince(S.log, wk - (i - 1) * 7 * DAY));
  const ret = retention(S.log), cs = conversationStats(S.log), ls = listeningStats(S.log);
  const conf = (S.profile.confidence || []).slice(-12).map((c) => c.value);
  const topics = ['scenarios', 'dialogues', 'grammar', 'missions'].map((k) => [k, S.content[k].filter((x) => !x.hidden && S.done[x.id] && (k !== 'missions' || S.done[x.id].completed)).length, S.content[k].filter((x) => !x.hidden).length]);
  const tName = { scenarios: 'Gesprekken', dialogues: 'Luisterdialogen', grammar: 'Grammaticalessen', missions: 'Missies (bevestigd)' };
  const errs = errorsBySkill(S.errors), weak = weakSkills(S.skills);
  const prios = [...new Set([...errs.map(([k]) => k), ...weak])].filter((k) => SKILLS[k]).slice(0, 3);
  const crit = stageCriteria(S.profile.stage, { skills: S.skills, log: S.log });
  append(root, h('h1', {}, 'Voortgang'),
    card(h('h3', {}, 'Geschat niveau per vaardigheid'),
      h('table', { class: 'table' }, h('tbody', {}, Object.keys(labels).map((k) => h('tr', {}, h('th', { scope: 'row' }, labels[k]), h('td', {}, h('b', {}, LEVEL_LABEL(S.profile.levels[k]))), prev && h('td', { class: 'muted small' }, `vorige meting: ${LEVEL_LABEL(prev.levels[k])}`))))),
      h('p', { class: 'muted small' }, last ? `Gemeten op ${dateNL(last.ts)}. Een schatting uit een korte test, geen officieel certificaat. Het niveau verandert alleen door een nieuwe meting — niet door punten of reeksen.` : 'Nog niet gemeten: dit is de aanname waarmee de app begint (A2–B1).'),
      btn(last && now - last.ts < 28 * DAY ? `Nieuwe meting (aanbevolen vanaf ${dateNL(last.ts + 28 * DAY)})` : 'Start meting', () => go('diagnostic'), last && now - last.ts < 28 * DAY ? 'ghost' : 'primary')),
    card(h('div', { class: 'row between' }, h('h3', {}, 'Deze week'), h('span', { class: 'muted' }, `${mins(weeks[3])} van ${mins(S.settings.weeklyHours * 60)}`)), bar(weeks[3], S.settings.weeklyHours * 60, 'Weekdoel'),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, Math.round(minutesSince(S.log, wk, 'speak'))), h('span', {}, 'min spreken')), h('div', { class: 'stat' }, h('b', {}, Math.round(minutesSince(S.log, wk, 'listen'))), h('span', {}, 'min luisteren')), h('div', { class: 'stat' }, h('b', {}, ret.rate == null ? '–' : `${Math.round(ret.rate * 100)}%`), h('span', {}, 'woordretentie (30 d)'))),
      h('p', { class: 'muted small' }, `Laatste vier weken: ${weeks.map((w) => mins(w)).join(' · ')}`)),
    card(h('h3', {}, `Fase ${S.profile.stage}: ${STAGES[S.profile.stage - 1].title}`), h('p', { class: 'muted' }, 'Je gaat naar de volgende fase als je alle criteria haalt — niet door tijd of aantal lessen.'),
      h('ul', { class: 'checklist' }, crit.map((c) => h('li', { class: c.done ? 'done' : '' }, h('span', {}, c.done ? '✓' : '○'), h('div', {}, c.label, h('p', { class: 'muted small' }, c.detail))))), btn('Leerplan', () => go('plan'), 'link')),
    card(h('h3', {}, 'Spreken'), h('ul', {}, h('li', {}, `${cs.completed} ${cs.completed === 1 ? 'gesprek' : 'gesprekken'} afgerond, waarvan ${cs.discussions} ${cs.discussions === 1 ? 'discussie' : 'discussies'}.`), h('li', {}, `Gemiddeld ${Math.round(cs.avgWords)} woorden per vrij antwoord (laatste 5).`), h('li', {}, `${cs.connectors} verschillende verbindingswoorden (laatste 5).`), ls.total > 0 && h('li', {}, `Luistervragen: ${Math.round(ls.acc * 100)}% goed over ${ls.total} vragen.`)),
      h('h4', {}, 'Zelfvertrouwen bij spreken (eigen inschatting)'), conf.length >= 2 ? spark(conf) : h('p', { class: 'muted small' }, 'Na twee gesprekken zie je hier het verloop.')),
    card(h('h3', {}, 'Foutpatronen'), errs.length ? errs.slice(0, 6).map(([k, n]) => { const ex = activeErrors(S.errors).find((e) => e.skill === k)?.examples[0]; return h('div', { class: 'issue' }, h('div', { class: 'row between' }, h('b', {}, SKILLS[k] || k), h('span', { class: 'muted' }, `${n}×`)), ex && (ex.given || ex.expected) && h('p', { class: 'small' }, ex.given && h('s', { lang: 'nl' }, ex.given), ex.given && ' → ', h('span', { lang: 'nl' }, ex.expected || ''))); }) : h('p', { class: 'muted' }, 'Nog geen terugkerende fouten vastgelegd.')),
    card(h('h3', {}, 'Volgende prioriteiten'), prios.length ? h('ol', {}, prios.map((k) => { const g = S.content.grammar.find((x) => x.skill === k); return h('li', {}, g ? h('a', { href: `#/lesson/${g.id}` }, SKILLS[k]) : SKILLS[k]); })) : h('p', { class: 'muted' }, 'Ga door met je dagelijkse sessies; prioriteiten verschijnen zodra er genoeg gegevens zijn.')),
    card(h('h3', {}, 'Afgeronde onderdelen'), h('table', { class: 'table' }, h('tbody', {}, topics.map(([k, n, t]) => h('tr', {}, h('th', { scope: 'row' }, tName[k]), h('td', {}, `${n} / ${t}`)))))),
    diags.length >= 2 && card(h('h3', {}, 'Metingen vergelijken'), h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Datum'), Object.values(labels).map((l) => h('th', {}, l)))), h('tbody', {}, diags.slice(-4).map((d) => h('tr', {}, h('td', {}, new Date(d.ts).toLocaleDateString('nl-NL')), Object.keys(labels).map((k) => h('td', {}, LEVEL_LABEL(d.levels[k]))))))),
      h('p', { class: 'small' }, h('b', {}, 'Advies voor de komende maand: '), `werk aan ${(last.weak || []).slice(0, 3).map((k) => SKILLS[k]).join(', ') || 'langere, samenhangende antwoorden'} en houd spreken op minstens 40% van je tijd.`)));
});

/* ============================ More ============================ */
route('more', (root) => append(root, h('h1', {}, 'Meer'), h('div', { class: 'list' },
  listItem('#/grammar', 'Grammatica', 'Korte lessen in context'), listItem('#/missions', 'Nederlands in de echte wereld', 'Missies voor buiten de app'),
  listItem('#/plan', 'Leerplan', 'Vijf fasen van A2/B1 naar B2'), listItem('#/settings', 'Instellingen', 'Planning, spraak, lespakketten, gegevens'))));

route('grammar', (root) => append(root, back('more'), h('h1', {}, 'Grammatica in context'),
  STAGES.map((st) => { const gs = S.content.grammar.filter((g) => (g.stage || 1) === st.n); return gs.length ? [h('h3', {}, `Fase ${st.n} · ${st.title}`), h('div', { class: 'list' }, gs.map((g) => { const s = S.skills[g.skill]; return listItem(`#/lesson/${g.id}`, g.title, g.example, pill(g.cefr), s && s.n >= 3 && pill(`${Math.round(s.score * 100)}%`, s.score >= 0.75 ? 'ok' : s.score < 0.6 ? 'bad' : '')); }))] : null; })));

route('lesson', (root, id) => {
  const g = S.content.byId[id];
  if (!g) return go('grammar');
  const body = h('div', {});
  const sc = S.content.scenarios.find((s) => !s.hidden && (s.tags || []).includes(g.skill));
  const practice = () => runExercises(body, drillFor(g.skill, 8, g.id), { title: g.title, onDone: (r) => { logActivity('grammar', r.sec, g.id, { correct: r.correct, total: r.total }); markDone(g.id); toast(`${r.correct} van ${r.total} goed`); intro(true); } });
  const intro = (after) => append(clear(body),
    card(h('p', { class: 'muted small' }, '1 · Voorbeeld'), h('p', { class: 'sentence big', lang: 'nl' }, g.example, ' ', audioBtn(g.example))),
    card(h('p', { class: 'muted small' }, '2 · Uitleg'), h('p', {}, g.explain), enHelp(g.explainEn, 'block muted')),
    (g.mistakes || []).length > 0 && card(h('p', { class: 'muted small' }, '3 · Typische fouten'), g.mistakes.map((m) => h('div', { class: 'issue' }, h('p', {}, h('s', { lang: 'nl' }, m.wrong)), h('p', {}, h('b', { lang: 'nl' }, m.right)), h('p', { class: 'muted small' }, m.why)))),
    card(h('p', { class: 'muted small' }, '4 · Oefenen'), h('p', {}, `${g.items.length} oefenzinnen; de app kiest er acht en begint met zinnen die je eerder fout had.`), btn(after ? 'Nog een ronde' : 'Start oefening', practice, after ? 'ghost' : 'primary')),
    (g.produce || []).length > 0 && card(h('p', { class: 'muted small' }, '5 · Zelf zinnen maken'), h('p', {}, g.produce[0].prompt), btn('Proberen', () => runProduction(body, g.produce[0], { onDone: () => intro(true) }), 'ghost')),
    sc && card(h('p', { class: 'muted small' }, '6 · Gebruiken in een gesprek'), h('p', {}, sc.title), btn('Naar het gesprek', () => go(`scenario/${sc.id}?mode=guided&from=lesson/${g.id}`), 'ghost')));
  append(root, back('grammar'), h('div', { class: 'row between' }, h('h1', {}, g.title), pill(g.cefr)), body);
  intro(false);
});

/* ============================ Missions ============================ */
route('missions', (root) => append(root, back('more'), h('h1', {}, 'Nederlands in de echte wereld'),
  h('p', { class: 'muted' }, 'Opdrachten voor buiten de app. Bereid je voor, doe het echt, en vertel daarna hoe het ging. Een missie telt pas als jij bevestigt dat je hem hebt gedaan.'),
  h('div', { class: 'list' }, S.content.missions.map((m) => listItem(`#/mission/${m.id}`, m.title, m.goal, pill(m.cefr), S.done[m.id]?.completed ? pill('gedaan', 'ok') : S.done[m.id] ? pill('voorbereid') : null)))));

route('mission', (root, id) => {
  const m = S.content.byId[id];
  if (!m) return go('missions');
  const body = h('div', {});
  const report = () => {
    const out = h('div', {});
    let ease = 3;
    append(clear(body), card(h('h3', {}, 'Hoe ging het?'), h('p', { class: 'muted' }, 'Beschrijf in het Nederlands wat er gebeurde en wat je moeilijk vond. Een paar zinnen is genoeg.'),
      h('p', { class: 'small' }, 'Hoe makkelijk ging het? (1 = heel moeilijk, 5 = makkelijk)'),
      h('div', { class: 'row' }, [1, 2, 3, 4, 5].map((n) => h('button', { class: `chip ${n === 3 ? 'on' : ''}`, onclick: (e) => { ease = n; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } }, String(n)))),
      answerInput({ submitLabel: 'Missie bevestigen', placeholder: 'Wat gebeurde er? Wat was lastig?', onSubmit: (text) => {
        const a = analyze(text);
        a.issues.filter((i) => i.kind === 'error').forEach((i) => recordPattern(i, `missie: ${m.title}`));
        markDone(m.id, { completed: true, ease, report: text });
        logActivity('mission', 0, m.id, { ease, words: a.words });
        append(clear(out), h('p', { class: 'result ok' }, 'Goed gedaan — je hebt het echt gedaan. Dat telt zwaarder dan elke oefening.'),
          a.issues.length > 0 && h('div', {}, h('p', {}, h('b', {}, 'In je verslag viel op:')), a.issues.map((i) => h('p', { class: 'issue' }, pill(SKILLS[i.skill] || i.skill, i.kind === 'error' ? 'bad' : ''), ' ', i.msg, i.fix ? ` → ${i.fix}` : ''))),
          h('h4', {}, 'Vervolgoefening'),
          h('p', {}, ease <= 2 ? 'Het was lastig. Oefen dezelfde situatie nog een keer rustig, met hulpzinnen.' : ease >= 4 ? 'Dat ging goed. Probeer dezelfde situatie nu met een onverwachte wending.' : 'Oefen de situatie nog één keer zonder hulpzinnen.'),
          m.scenario && btn('Start vervolgoefening', () => go(`scenario/${m.scenario}?mode=${ease <= 2 ? 'guided' : ease >= 4 ? 'challenge' : 'roleplay'}&from=missions`), 'primary'));
      } }), out));
  };
  const prev = S.done[m.id];
  append(root, back('missions'), h('div', { class: 'row between' }, h('h1', {}, m.title), pill(m.cefr)),
    h('p', {}, m.goal), enHelp(m.goalEn, 'block muted'),
    prev?.completed && h('p', { class: 'note' }, `Bevestigd op ${dateNL(prev.last)}. Je kunt de missie zo vaak herhalen als je wilt.`),
    card(h('h3', {}, '1 · Handige zinnen'), m.phrases.map((p) => h('div', { class: 'line' }, h('div', { class: 'row between' }, h('span', { lang: 'nl' }, p.nl), audioBtn(p.nl)), enHelp(p.en, 'block muted small')))),
    (m.responses || []).length > 0 && card(h('h3', {}, '2 · Wat je kunt terughoren'), m.responses.map((r) => h('div', { class: 'row between line' }, h('span', { lang: 'nl' }, r), audioBtn(r)))),
    m.scenario && S.content.byId[m.scenario] && card(h('h3', {}, '3 · Eerst oefenen'), h('p', { class: 'muted' }, `Rollenspel: ${S.content.byId[m.scenario].title}`), btn('Oefen het gesprek', () => { if (!S.done[m.id]) markDone(m.id, { completed: false }); go(`scenario/${m.scenario}?mode=guided&from=mission/${m.id}`); }, 'ghost')),
    card(h('h3', {}, '4 · Doe het echt'), h('p', { class: 'muted' }, 'Ga het doen in het echte leven. Kom daarna terug en vertel hoe het ging.'), btn('Ik heb het gedaan', report, 'primary')), body);
});

/* ============================ Learning plan ============================ */
route('plan', (root) => append(root, back('more'), h('h1', {}, 'Leerplan: van A2/B1 naar B2'),
  h('p', { class: 'muted' }, 'Geen methode garandeert snelle vloeiendheid. Dit plan is gebaseerd op veel spreken, begrijpelijke input, actief ophalen en gespreide herhaling — en op wat jij in de praktijk laat zien.'),
  card(h('h3', {}, 'Verdeling van je tijd'), h('ul', {}, h('li', {}, '40% spreken (gesprekken, discussies)'), h('li', {}, '25% luisteren en shadowing'), h('li', {}, '20% woorden en uitdrukkingen'), h('li', {}, '15% grammatica in context')),
    h('p', { class: 'muted small' }, `De verdeling verschuift automatisch bij veel openstaande herhalingen of terugkerende fouten. Weekdoel: ${S.settings.weeklyHours} uur.`)),
  STAGES.map((st) => { const cur = st.n === S.profile.stage; const crit = stageCriteria(st.n, { skills: S.skills, log: S.log });
    return h('details', { class: `card ${cur ? 'current' : ''}`, open: cur || null }, h('summary', {}, h('b', {}, `Fase ${st.n} · ${st.title} `), st.n < S.profile.stage ? pill('afgerond', 'ok') : cur ? pill('nu') : null),
      h('p', {}, st.goal), h('p', { class: 'small' }, h('b', {}, 'Criteria om door te gaan:')),
      h('ul', { class: 'checklist' }, crit.map((c) => h('li', { class: c.done ? 'done' : '' }, h('span', {}, c.done ? '✓' : '○'), h('div', {}, c.label, cur && h('p', { class: 'muted small' }, c.detail)))))); })));

/* ============================ Settings ============================ */
function applyTheme() { const t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
const download = (name, text) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove(); };
const pickFile = () => new Promise((res) => { const i = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => res(i.files[0] ? await i.files[0].text() : null) }); i.click(); });

async function importPackFlow() {
  const text = await pickFile();
  if (!text) return;
  let pack; try { pack = JSON.parse(text); } catch { return toast('Dit bestand is geen geldige JSON.'); }
  const r = checkImport(pack);
  const actions = { install: 'Nieuw pakket', upgrade: `Update van versie ${r.current}`, same: 'Deze versie is al geïnstalleerd', downgrade: `Ouder dan de geïnstalleerde versie ${r.current}`, reject: 'Ongeldig pakket' };
  modal((close) => [h('h3', {}, pack.title || 'Lespakket'), h('p', {}, h('b', {}, actions[r.action]), pack.version ? ` · v${pack.version}` : ''),
    r.ok && h('p', {}, Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ')),
    r.errors.length > 0 && h('div', {}, h('p', { class: 'warn' }, 'Het pakket is afgekeurd:'), h('ul', { class: 'small' }, r.errors.slice(0, 12).map((e) => h('li', {}, e)))),
    r.ok && r.duplicates.length > 0 && h('p', { class: 'small muted' }, `${r.duplicates.length} items bestaan al en worden overgeslagen (${r.duplicates.slice(0, 4).join(', ')}…).`),
    r.ok && r.warnings.length > 0 && h('p', { class: 'small muted' }, `${r.warnings.length} waarschuwing(en), bijv.: ${r.warnings[0]}`),
    h('div', { class: 'row end' }, btn('Sluiten', close, 'ghost'), r.ok && r.action !== 'same' && btn(r.action === 'downgrade' ? 'Toch installeren' : 'Installeren', async () => { await installPack(pack, 'imported'); close(); toast('Pakket geïnstalleerd. De nieuwe inhoud doet direct mee in je planning.'); go('settings'); }, 'primary'))]);
}

route('settings', (root) => {
  const set = (k, v, redraw) => { S.settings[k] = v; save('settings'); if (k === 'theme') applyTheme(); if (redraw) go('settings'); };
  const days = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const nlVoices = tts.dutchVoices();
  const sel = (k, opts) => h('select', { class: 'text', onchange: (e) => set(k, isNaN(e.target.value) ? e.target.value : Number(e.target.value)) }, opts.map(([v, l]) => h('option', { value: v, selected: String(S.settings[k]) === String(v) }, l)));
  append(root, back('more'), h('h1', {}, 'Instellingen'),
    card(h('h3', {}, 'Planning'),
      h('label', { class: 'field' }, 'Weekdoel (uren)', h('input', { class: 'text narrow', type: 'number', min: 1, max: 40, value: S.settings.weeklyHours, onchange: (e) => set('weeklyHours', Math.max(1, Number(e.target.value) || 6)) })),
      h('p', { class: 'small' }, 'Rustdagen'), h('div', { class: 'row wrap' }, days.map((d, i) => h('button', { class: `chip ${S.settings.restDays.includes(i) ? 'on' : ''}`, 'aria-pressed': String(S.settings.restDays.includes(i)), onclick: () => set('restDays', S.settings.restDays.includes(i) ? S.settings.restDays.filter((x) => x !== i) : [...S.settings.restDays, i], true) }, d))),
      h('label', { class: 'field' }, 'Nieuwe uitdrukkingen per dag', sel('newPerDay', [[3, '3'], [6, '6'], [10, '10'], [15, '15']]))),
    card(h('h3', {}, 'Weergave en taal'),
      h('label', { class: 'field' }, 'Thema', sel('theme', [['auto', 'Volg toestel'], ['light', 'Licht'], ['dark', 'Donker']])),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.settings.englishHelp !== false, onchange: (e) => set('englishHelp', e.target.checked) }), ' Engelse hulp tonen'),
      h('p', { class: 'muted small' }, 'Zet dit uit zodra je de uitleg in het Nederlands kunt volgen. Woordbetekenissen blijven in het Engels.')),
    card(h('h3', {}, 'Spraak'),
      h('label', { class: 'field' }, 'Spreeksnelheid', sel('rate', [[0.8, 'Langzaam'], [0.9, 'Rustig'], [1, 'Normaal'], [1.1, 'Vlot'], [1.2, 'Snel']])),
      h('ul', { class: 'small' },
        h('li', {}, 'Voorlezen (tekst → spraak): ', h('b', {}, !tts.supported ? 'niet ondersteund' : nlVoices.length ? `${nlVoices.length} Nederlandse stem(men): ${nlVoices.slice(0, 2).map((v) => v.name).join(', ')}` : 'geen Nederlandse stem gevonden')),
        h('li', {}, 'Inspreken (spraak → tekst): ', h('b', {}, stt.supported ? 'beschikbaar via de browser' : 'niet beschikbaar in deze browser — typen kan altijd')),
        h('li', {}, 'Jezelf opnemen (shadowing): ', h('b', {}, recorder.supported ? 'beschikbaar' : 'niet beschikbaar'))),
      h('div', { class: 'row wrap' }, btn('Test de stem', () => say('Goedemorgen! Klaar om Nederlands te oefenen?'), 'ghost')),
      h('p', { class: 'muted small' }, 'Geen Nederlandse stem? Android: Instellingen → Toegankelijkheid/Systeem → Tekst-naar-spraak → Spraakservices van Google → Stemgegevens installeren → Nederlands (Nederland). Daarna werkt voorlezen ook offline.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.settings.micConsent, onchange: (e) => set('micConsent', e.target.checked) }), ' Microfoon toegestaan voor inspreken en opnemen'),
      h('p', { class: 'muted small' }, 'Inspreken gebruikt de spraakherkenning van je browser; die stuurt audio meestal naar de dienst van de browsermaker. De app zelf verstuurt of bewaart geen audio.')),
    card(h('h3', {}, 'Lespakketten'), h('p', { class: 'muted small' }, S.contentStatus),
      S.packs.map((p) => h('div', { class: 'row between line' }, h('div', {}, h('b', {}, p.title), h('p', { class: 'muted small' }, `${p.id} · v${p.version} · ${{ hosted: 'meegeleverd', imported: 'geïmporteerd', personal: 'eigen woorden' }[p.source] || p.source}`)),
        p.source !== 'hosted' && btn('Verwijder', async () => { if (await confirmBox('Pakket verwijderen?', `“${p.title}” wordt verwijderd. Je voortgang op deze items blijft bewaard.`, 'Verwijder')) { await removePack(p.id); go('settings'); } }, 'link'))),
      h('div', { class: 'row wrap' }, btn('Importeer lespakket (.json)', importPackFlow, 'primary'), btn('Zoek naar updates', async () => { const r = await syncHosted(); toast(r.ok ? (r.changed ? `${r.changed} pakket(ten) bijgewerkt` : 'Alles is actueel') : 'Geen verbinding'); go('settings'); }, 'ghost')),
      h('p', { class: 'muted small' }, 'Drie soorten updates: (1) de app zelf wordt bijgewerkt via de website wanneer je online bent; (2) meegeleverde pakketten worden op versie vergeleken; (3) eigen pakketten importeer je hier als bestand. Zie docs/CONTENT-AUTHORING.md.')),
    card(h('h3', {}, 'Jouw gegevens'), h('p', { class: 'muted small' }, 'Alles staat alleen op dit toestel. Maak af en toe een back-up: als je de browsergegevens wist, is je voortgang weg.'),
      h('div', { class: 'row wrap' }, btn('Exporteer back-up', () => download(`dutch-coach-backup-${new Date().toISOString().slice(0, 10)}.json`, exportData()), 'ghost'),
        btn('Herstel back-up', async () => { const t = await pickFile(); if (!t) return; try { await importData(t); toast('Back-up hersteld.'); go('today'); } catch (e) { toast(e.message || 'Herstellen mislukt.'); } }, 'ghost'),
        btn('Wis alles', async () => { if (await confirmBox('Alles wissen?', 'Je voortgang, woordkaarten, foutgeheugen en geïmporteerde pakketten worden definitief verwijderd. Dit kan niet ongedaan worden gemaakt.', 'Definitief wissen')) wipe(); }, 'danger'))),
    card(h('h3', {}, 'AI-uitbreidingen'), h('p', {}, h('b', {}, 'Uitgeschakeld.'), ' De app gebruikt geen AI-diensten en vraagt nergens om een API-sleutel.'),
      h('p', { class: 'muted small' }, `Er is een afgeschermde uitbreidingslaag (js/ext/ai.js) voor een eventueel lokaal of zelf gehost model in de toekomst. Geregistreerde aanbieders: ${listProviders().length || 'geen'}. Zonder aanbieder kan dit niet worden ingeschakeld en er worden nooit kosten gemaakt.`)),
    card(h('h3', {}, 'Offline'), h('ul', { class: 'small' }, h('li', {}, 'Werkt offline: dagplanning, woordherhaling, grammatica, lezen van dialogen, rollenspellen met typen, voortgang, import van pakketten.'), h('li', {}, 'Offline alleen met geïnstalleerde Nederlandse stem: voorlezen en luisteroefeningen.'), h('li', {}, 'Meestal internet nodig: inspreken (spraakherkenning) en updates van app en pakketten.'))),
    h('p', { class: 'muted small center' }, 'Dutch Coach 1.0 · alles lokaal · geen kosten'));
});
