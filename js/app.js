// App shell: startup, navigation, Today screen, planned sessions, onboarding and diagnostic.
import { h, append, clear, fa, icon, btn, card, pill, toast, bar, mins, dateNL } from './ui.js';
import { S, init, save, logActivity, markDone } from './store.js';
import { route, routes, go, parse } from './router.js';
import { runExercises, runReview, runListening, runConversation, drillFor, faHelp, audioBtn, vocabExercise } from './activities.js';
import { buildSession, minutesSince, startOfWeek, startOfDay, daysSinceLast, weakSkills, LEVEL_LABEL, CEFR_NUM, levelFromResults, nextLevel, speakingLevel, stageFromLevels, STAGES } from './engine/learner.js';
import { dueCards, DAY } from './engine/srs.js';
import { expand, variantCount } from './engine/exercises.js';
import { SKILLS } from './engine/packs.js';
import { shuffle } from './engine/text.js';
import './screens.js';

const view = document.getElementById('view');
const NAV = [['today', 'Vandaag'], ['speak', 'Spreken'], ['listen', 'Luisteren'], ['vocab', 'Woorden'], ['progress', 'Voortgang'], ['more', 'Meer']];
const NAV_OF = { session: 'today', diagnostic: 'progress', onboarding: 'today', scenario: 'speak', dialogue: 'listen', grammar: 'more', lesson: 'more', missions: 'more', mission: 'more', plan: 'more', settings: 'more' };

export function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
function drawNav(active) {
  const nav = clear(document.getElementById('nav'));
  NAV.forEach(([id, label]) => nav.append(h('a', { href: `#/${id}`, class: id === active ? 'active' : '', 'aria-current': id === active ? 'page' : null }, icon(id), h('span', {}, label))));
}
function drawOnline() {
  const el = document.getElementById('net');
  el.textContent = navigator.onLine ? '' : 'Offline — lessen en herhaling werken gewoon';
  el.hidden = navigator.onLine;
}
function render() {
  const { name, arg, params } = parse();
  let target = routes[name] ? name : 'today';
  if (!S.profile.onboarded && !['onboarding', 'diagnostic', 'settings'].includes(target)) target = 'onboarding';
  speechSynthesis?.cancel();
  drawNav(NAV_OF[target] || target);
  document.body.classList.toggle('focus', ['session', 'diagnostic', 'onboarding', 'scenario'].includes(target));
  clear(view); window.scrollTo(0, 0);
  try { routes[target](view, arg, params); }
  catch (e) { console.error(e); append(view, card(h('h2', {}, 'Er ging iets mis'), h('p', {}, String(e.message || e)), btn('Terug naar Vandaag', () => go('today'), 'primary'))); }
}

/* ============================ Today ============================ */
let session = null;

route('today', (root) => {
  const now = Date.now(), hr = new Date().getHours();
  const greet = hr < 12 ? 'Goedemorgen' : hr < 18 ? 'Goedemiddag' : 'Goedenavond';
  const week = minutesSince(S.log, startOfWeek(now)), goal = (S.settings.weeklyHours || 6) * 60;
  const due = dueCards(Object.values(S.cards), now).length;
  const lastDiag = S.profile.diagnostics.at(-1);
  const rest = (S.settings.restDays || []).includes(new Date().getDay());
  const gap = daysSinceLast(S.log, now);
  const planBox = h('div', {});
  const pick = (m) => {
    if (!m || m < 5) return toast('Kies minstens 5 minuten.');
    const plan = buildSession({ minutes: m, content: S.content, cards: S.cards, skills: S.skills, errors: S.errors, done: S.done, profile: S.profile, log: S.log, settings: { ...S.settings, newPerDay: Math.max(2, (S.settings.newPerDay || 6) + (S.settings.load || 0) * 2) } });
    append(clear(planBox), card(h('h3', {}, `Jouw sessie van ${m} minuten`),
      plan.notes.map((n) => h('p', { class: 'note' }, n)),
      h('ol', { class: 'plan' }, plan.steps.map((s) => h('li', {}, h('div', { class: 'row between' }, h('b', {}, s.title), h('span', { class: 'muted' }, `${s.minutes} min`)), h('p', { class: 'muted small' }, s.why)))),
      h('div', { class: 'row end' }, btn('Start sessie', () => { session = { plan, i: 0, t0: Date.now(), results: [], before: structuredClone(S.skills) }; go('session'); }, 'primary'))));
    planBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const custom = h('input', { class: 'text narrow', type: 'number', min: 5, max: 180, inputmode: 'numeric', placeholder: 'min', 'aria-label': 'Eigen aantal minuten' });
  append(root,
    h('h1', {}, `${greet}! Klaar om Nederlands te oefenen?`),
    h('p', { class: 'muted' }, new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })),
    session && session.i < session.plan.steps.length && card(h('p', {}, 'Je hebt een sessie openstaan.'), btn('Ga verder', () => go('session'), 'primary')),
    gap != null && gap >= 3 && h('p', { class: 'note' }, `Fijn dat je er weer bent. Je laatste sessie was ${gap} dagen geleden — we pakken het rustig op.`),
    rest && h('p', { class: 'note' }, 'Vandaag is een rustdag in jouw planning. Oefenen mag, maar het hoeft niet.'),
    (!lastDiag || now - lastDiag.ts > 28 * DAY) && card(h('h3', {}, lastDiag ? 'Tijd voor je vierwekelijkse meting' : 'Nog geen niveaubepaling'),
      h('p', { class: 'muted' }, lastDiag ? `Je laatste meting was op ${dateNL(lastDiag.ts)}.` : 'Zonder meting begint de app op A2–B1. Met een meting (± 15 min) wordt het plan persoonlijker.'),
      btn(lastDiag ? 'Start meting' : 'Doe de niveaubepaling', () => go('diagnostic'), 'ghost')),
    card(h('h2', {}, 'Hoeveel tijd heb je vandaag?'),
      h('div', { class: 'row wrap' }, [10, 15, 20, 30, 45, 60].map((m) => h('button', { class: 'chip big', onclick: () => pick(m) }, `${m} min`)),
        h('span', { class: 'row' }, custom, btn('OK', () => pick(Number(custom.value)), 'ghost')))),
    planBox,
    card(h('div', { class: 'row between' }, h('h3', {}, 'Deze week'), h('span', { class: 'muted' }, `${mins(week)} van ${mins(goal)}`)), bar(week, goal, 'Weekdoel'),
      h('div', { class: 'stats' },
        stat(due, 'kaarten te herhalen', 'vocab'), stat(Math.round(minutesSince(S.log, startOfWeek(now), 'speak')), 'min gesproken', 'speak'),
        stat(`Fase ${S.profile.stage}`, STAGES[S.profile.stage - 1].title, 'plan'))),
    weakSkills(S.skills).length > 0 && card(h('h3', {}, 'Aandachtspunten'), h('div', { class: 'row wrap' }, weakSkills(S.skills).slice(0, 4).map((k) => pill(SKILLS[k], 'bad'))),
      h('p', { class: 'muted small' }, 'Deze onderwerpen komen vanzelf terug in je sessies.')));
});
const stat = (value, label, link) => h('a', { class: 'stat', href: `#/${link}` }, h('b', {}, value), h('span', {}, label));

/* ============================ Planned session ============================ */
route('session', (root) => {
  if (!session) return go('today');
  const { plan } = session, step = plan.steps[session.i];
  if (!step) { session = null; return go('today'); }
  const body = h('div', {});
  const next = (result = {}) => { session.results.push({ step, ...result }); session.i += 1; go('session'); };
  append(root,
    h('div', { class: 'row between' }, h('span', { class: 'muted small' }, `Stap ${session.i + 1} van ${plan.steps.length} · ± ${step.minutes} min`), step.kind !== 'wrap' && btn('Sla over', () => next({ skipped: true }), 'link')),
    bar(session.i, plan.steps.length, 'Sessievoortgang'), body);
  if (step.kind === 'vocab') runReview(body, { reviewN: step.reviewN, newN: step.newN, onDone: (r) => { if (r.sec > 5) logActivity('vocab', r.sec, 'review', {}); next(r); } });
  else if (step.kind === 'grammar') {
    const g = S.content.byId[step.ref];
    append(body, card(h('h2', {}, g.title), h('p', { class: 'sentence', lang: 'nl' }, g.example, ' ', audioBtn(g.example)), h('p', {}, g.explain), faHelp(g.explainFa, 'block muted'),
      h('div', { class: 'row end' }, btn('Oefenen', () => runExercises(body, drillFor(g.skill, step.n, g.id), { title: g.title, onDone: (r) => { logActivity('grammar', r.sec, g.id, { correct: r.correct, total: r.total }); markDone(g.id); next(r); } }), 'primary'))));
  } else if (step.kind === 'listen') runListening(body, S.content.byId[step.ref], { shadow: step.shadow, onDone: next });
  else if (step.kind === 'speak') runConversation(body, S.content.byId[step.ref], step.mode, { onDone: next });
  else wrapUp(body);
});

function wrapUp(root) {
  const total = (Date.now() - session.t0) / 60000;
  const lines = session.results.filter((r) => !r.skipped).map((r) => {
    const s = r.step;
    if (s.kind === 'vocab') return r.empty ? null : `Woorden: ${r.reviewed} herhaald, ${r.learned} nieuw geleerd.`;
    if (s.kind === 'grammar') return `${s.title}: ${r.correct} van ${r.total} goed.`;
    if (s.kind === 'listen') return `${s.title}: ${r.correct} van ${r.total} vragen goed.`;
    if (s.kind === 'speak') return `${s.title}: ${r.sum?.words || 0} woorden gesproken${r.sum?.completed ? ', gesprek afgerond' : ''}.`;
    return null;
  }).filter(Boolean);
  const improved = Object.keys(S.skills).filter((k) => SKILLS[k] && (S.skills[k].score - (session.before[k]?.score ?? 0.5)) > 0.03).map((k) => SKILLS[k]);
  const tomorrow = dueCards(Object.values(S.cards), Date.now() + DAY).length, weak = weakSkills(S.skills)[0];
  const effort = (v) => { S.settings.load = Math.max(-2, Math.min(2, (S.settings.load || 0) + v)); save('settings'); session = null; go('today'); };
  append(root, h('h2', {}, 'Terugblik'),
    card(h('p', {}, `Je hebt ${mins(Math.max(1, total))} geoefend.`), lines.length ? h('ul', {}, lines.map((l) => h('li', {}, l))) : h('p', { class: 'muted' }, 'Je hebt alle onderdelen overgeslagen.'),
      improved.length > 0 && h('p', {}, h('b', {}, 'Vooruitgegaan: '), improved.join(', '), '.')),
    card(h('h3', {}, 'Morgen'), h('ul', {}, h('li', {}, `${tomorrow} kaarten staan dan klaar voor herhaling.`), weak && h('li', {}, `Extra aandacht voor: ${SKILLS[weak]}.`))),
    card(h('h3', {}, 'Hoe voelde deze sessie?'), h('p', { class: 'muted small' }, 'Hiermee past de app de moeilijkheid en het aantal nieuwe woorden aan.'),
      h('div', { class: 'row wrap' }, btn('Te makkelijk', () => effort(1), 'ghost'), btn('Precies goed', () => effort(0), 'primary'), btn('Te zwaar', () => effort(-1), 'ghost'))));
}

/* ============================ Onboarding ============================ */
route('onboarding', (root) => {
  const hours = h('input', { class: 'text narrow', type: 'number', min: 1, max: 30, value: S.settings.weeklyHours, 'aria-label': 'Uren per week' });
  const finish = (to) => { S.settings.weeklyHours = Math.max(1, Number(hours.value) || 6); S.profile.onboarded = true; if (!S.profile.levels.grammar) { S.profile.levels = { grammar: 1.5, vocab: 1.5, listening: 1.5, speaking: 1.5 }; S.profile.assumed = true; } save('settings'); save('profile'); go(to); };
  append(root, h('h1', {}, 'Welkom bij je Nederlandse taalcoach'),
    card(fa('خوش آمدید! این برنامه یک مربی شخصی زبان هلندی است که شما را از سطح A2/B1 به‌سوی مکالمه‌ی روان در سطح B2 همراهی می‌کند.', 'block'),
      fa('همه‌چیز روی دستگاه خودتان اجرا می‌شود: بدون حساب کاربری، بدون هزینه و بدون هوش مصنوعیِ ابری. برنامه‌ی روزانه بر اساس زمان شما، اشتباه‌های پرتکرار و واژه‌هایی که باید مرور شوند ساخته می‌شود.', 'block muted'),
      fa('تمرین‌ها بیشتر به هلندی هستند؛ توضیح فارسی هر جا لازم باشد نمایش داده می‌شود و می‌توانید آن را در تنظیمات خاموش کنید.', 'block muted')),
    card(h('h3', {}, 'Zo werkt het'), h('ul', {},
      h('li', {}, 'Elke dag kies je hoeveel tijd je hebt. De app stelt een sessie samen: herhalen, luisteren, grammatica en vooral spreken.'),
      h('li', {}, 'Alles draait op je eigen toestel. Geen account, geen kosten, geen AI-dienst.'),
      h('li', {}, 'Gesprekken zijn beurt-om-beurt rollenspellen met een gescripte gesprekspartner. De feedback is regelgebaseerd en dus beperkt — dat staat er steeds eerlijk bij.'))),
    card(h('h3', {}, 'Hoeveel uur per week wil je oefenen?'), h('div', { class: 'row' }, hours, h('span', { class: 'muted' }, 'uur per week (later aan te passen)'))),
    card(h('h3', {}, 'Niveaubepaling'), h('p', {}, 'Een adaptieve test van ongeveer 15 minuten: grammatica, woordenschat, luisteren en een kort gesproken interview.'),
      h('div', { class: 'row wrap' }, btn('Start de niveaubepaling', () => finish('diagnostic'), 'primary'), btn('Later — begin op A2–B1', () => finish('today'), 'ghost'))));
});

/* ============================ Diagnostic ============================ */
route('diagnostic', (root) => {
  const t0 = Date.now(), res = { grammar: [], vocab: [], listening: [] }, used = new Set();
  const num = (c) => Math.round(Math.min(3, Math.max(1, CEFR_NUM[c] || 2)));
  const head = (t, i, n) => `${t} · ${i} / ${n}`;
  const body = h('div', {});
  let typed = false;

  function grammar(i = 0, level = 2) {
    const N = 12;
    if (i >= N) return vocab();
    const seen = new Set(res.grammar.map((r) => r.skill));
    const pool = S.content.items.filter((it) => !used.has(it.id));
    const at = (l) => pool.filter((it) => num(it.cefr) === l);
    const cands = at(level).length ? at(level) : pool;
    const item = shuffle(cands).sort((a, b) => seen.has(a.skill) - seen.has(b.skill))[0];
    used.add(item.id);
    const ex = expand(item, { variant: Math.floor(Math.random() * variantCount(item)), hard: false });
    runExercises(body, [ex], { title: head('Grammatica', i + 1, N), onAnswer: (_, ok) => { res.grammar.push({ level: num(item.cefr), ok, skill: item.skill }); }, onDone: () => grammar(i + 1, nextLevel(level, res.grammar.at(-1).ok)) });
  }
  function vocab(i = 0, level = 2) {
    const N = 8;
    if (i >= N) return listening();
    const pool = S.content.vocab.filter((v) => !used.has(v.id) && v.pack !== 'personal');
    const at = pool.filter((v) => num(v.cefr) === level);
    const v = shuffle(at.length ? at : pool)[0];
    used.add(v.id);
    const ex = vocabExercise(v, S.content.vocab, i % 2 ? 'recall' : 'recognize');
    runExercises(body, [ex], { title: head('Woordenschat', i + 1, N), onAnswer: (_, ok) => res.vocab.push({ level: num(v.cefr), ok }), onDone: () => vocab(i + 1, nextLevel(level, res.vocab.at(-1).ok)) });
  }
  function listening(round = 0, level = 2) {
    if (round >= 2) return interview();
    const d = S.content.dialogues.find((x) => num(x.cefr) === level && !used.has(x.id)) || S.content.dialogues.find((x) => !used.has(x.id));
    if (!d) return interview();
    used.add(d.id);
    clear(body);
    append(body, h('p', { class: 'note' }, `Luisteren · deel ${round + 1} van 2. Luister zonder tekst en beantwoord de vragen.`));
    const inner = h('div', {}); body.append(inner);
    runListening(inner, d, { test: true, onDone: (r) => { for (let k = 0; k < r.total; k++) res.listening.push({ level: num(d.cefr), ok: k < r.correct }); listening(round + 1, nextLevel(level, r.correct / r.total >= 0.67)); } });
  }
  function interview() {
    clear(body);
    append(body, h('p', { class: 'note' }, 'Tot slot een kort interview van drie vragen. Spreek je antwoorden in (of typ ze als inspreken niet kan). Praat zo lang en zo vrij als je kunt.'));
    const inner = h('div', {}); body.append(inner);
    runConversation(inner, S.content.byId['s-diagnostic'], 'diagnostic', { onDone: ({ conv }) => selfRate(conv.state.turns.map((t) => t.analysis)) });
  }
  function selfRate(analyses) {
    typed = !S.settings.micConsent;
    const cando = ['Ik kan in een winkel, bij de dokter of aan de telefoon regelen wat ik nodig heb.', 'Ik kan uitgebreid vertellen over iets wat ik heb meegemaakt.', 'Ik kan in een discussie mijn mening geven, verdedigen en op tegenargumenten reageren.'];
    const vals = [3, 3, 3];
    clear(body);
    append(body, card(h('h3', {}, 'Je eigen inschatting'), h('p', { class: 'muted small' }, '1 = lukt nog niet · 5 = lukt makkelijk'),
      cando.map((c, i) => h('div', { class: 'rate' }, h('p', {}, c), h('div', { class: 'row' }, [1, 2, 3, 4, 5].map((n) => h('button', { class: `chip ${n === 3 ? 'on' : ''}`, onclick: (e) => { vals[i] = n; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } }, String(n)))))),
      h('div', { class: 'row end' }, btn('Bekijk resultaat', () => report(analyses, vals.reduce((a, b) => a + b, 0) / 3), 'primary'))));
  }
  function report(analyses, self) {
    const levels = { grammar: levelFromResults(res.grammar), vocab: levelFromResults(res.vocab), listening: levelFromResults(res.listening), speaking: speakingLevel(analyses, self) ?? 1 };
    const bySkill = {};
    res.grammar.forEach((r) => { (bySkill[r.skill] ||= []).push(r.ok); });
    const stageOf = (k) => S.content.grammar.find((g) => g.skill === k)?.stage || 9;
    const weak = Object.keys(bySkill).filter((k) => bySkill[k].some((x) => !x)).sort((a, b) => stageOf(a) - stageOf(b)), strong = Object.keys(bySkill).filter((k) => bySkill[k].every((x) => x));
    const first = !S.profile.diagnostics.length;
    const prev = S.profile.diagnostics.at(-1);
    const d = { ts: Date.now(), levels, weak, strong, self, typed, words: analyses.reduce((s, a) => s + a.words, 0) };
    S.profile.diagnostics.push(d); S.profile.levels = levels; S.profile.assumed = false;
    if (first) S.profile.stage = stageFromLevels(levels);
    save('profile');
    logActivity('diagnostic', Math.min((Date.now() - t0) / 1000, 2400), 'diagnostic', { levels });
    const labels = { grammar: 'Grammatica', vocab: 'Woordenschat', listening: 'Luisteren', speaking: 'Spreken' };
    const lowest = Object.keys(levels).sort((a, b) => levels[a] - levels[b])[0];
    clear(body);
    append(body, h('h2', {}, 'Jouw profiel'),
      card(h('table', { class: 'table' }, h('tbody', {}, Object.keys(labels).map((k) => h('tr', {}, h('th', { scope: 'row' }, labels[k]), h('td', {}, h('b', {}, LEVEL_LABEL(levels[k]))), prev && h('td', { class: 'muted' }, `was ${LEVEL_LABEL(prev.levels[k])}`))))),
        h('p', { class: 'muted small' }, 'Betrouwbaarheid: laag tot gemiddeld. Dit is een schatting op basis van een korte test — geen officieel ERK/CEFR-certificaat. Grammatica, woordenschat en luisteren zijn gemeten met ', String(res.grammar.length + res.vocab.length + res.listening.length), ' vragen. Spreken is geschat uit meetbare kenmerken van je antwoorden (lengte, verbindingswoorden, bijzinnen, herkende fouten) en je eigen inschatting; uitspraak en vloeiendheid zijn niet gemeten.', typed ? ' Je antwoorden waren (deels) getypt, dus de spreekschatting is extra onzeker.' : '')),
      card(h('h3', {}, 'Sterke punten'), strong.length ? h('div', { class: 'row wrap' }, strong.map((k) => pill(SKILLS[k], 'ok'))) : h('p', { class: 'muted' }, 'Nog geen onderdeel zonder fouten.')),
      card(h('h3', {}, 'Zwakke punten'), weak.length ? h('div', { class: 'row wrap' }, weak.map((k) => pill(SKILLS[k], 'bad'))) : h('p', { class: 'muted' }, 'Geen fouten in de geteste structuren.')),
      card(h('h3', {}, 'Prioriteiten'), h('ol', {},
        h('li', {}, `Laagste vaardigheid: ${labels[lowest]} (${LEVEL_LABEL(levels[lowest])}). Die krijgt extra tijd in je sessies.`),
        weak.slice(0, 3).map((k) => h('li', {}, `Herstellen: ${SKILLS[k]}.`)),
        h('li', {}, 'Elke sessie een gesprek: spreken blijft het grootste deel van je tijd.'))),
      card(h('h3', {}, 'Je leerplan'), h('p', {}, `Je ${first ? 'begint' : 'zit'} in fase ${S.profile.stage}: ${STAGES[S.profile.stage - 1].title}.`), h('p', { class: 'muted' }, STAGES[S.profile.stage - 1].goal),
        h('p', { class: 'muted small' }, 'Over vier weken kun je de meting herhalen en de resultaten vergelijken.')),
      h('div', { class: 'row end' }, btn('Leerplan bekijken', () => go('plan'), 'ghost'), btn('Naar Vandaag', () => go('today'), 'primary')));
  }
  const introCard = card(h('p', {}, 'Vier onderdelen: grammatica (12 vragen), woordenschat (8), luisteren (2 korte dialogen) en een gesproken interview (3 vragen). De vragen passen zich aan je antwoorden aan.'),
      faHelp('چهار بخش: دستور زبان، واژگان، شنیداری و یک مصاحبه‌ی کوتاه گفتاری. سؤال‌ها بر اساس پاسخ‌های شما آسان‌تر یا سخت‌تر می‌شوند. نتیجه فقط یک برآورد است، نه مدرک رسمی.', 'block muted'),
      h('div', { class: 'row end' }, btn('Annuleren', () => go('today'), 'ghost'), btn('Begin', () => { introCard.remove(); grammar(); }, 'primary')));
  append(root, h('h1', {}, 'Niveaubepaling'), introCard, body);
});

/* ============================ Startup ============================ */
async function start() {
  try { await init(); }
  catch (e) { append(clear(view), card(h('h2', {}, 'Opslag niet beschikbaar'), h('p', {}, 'De app kan de lokale database niet openen. Gebruik geen privévenster en controleer of opslag is toegestaan.'), h('p', { class: 'muted small' }, String(e)))); return; }
  applyTheme();
  if (!S.content.vocab.length) { append(clear(view), card(h('h2', {}, 'Eerste keer: internet nodig'), h('p', {}, 'De lespakketten zijn nog niet gedownload. Maak één keer verbinding met internet en open de app opnieuw. Daarna werkt alles offline.'), btn('Opnieuw proberen', () => location.reload(), 'primary'))); return; }
  window.addEventListener('hashchange', render);
  window.addEventListener('online', drawOnline); window.addEventListener('offline', drawOnline);
  drawOnline(); render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', (e) => { if (e.target.state === 'installed' && navigator.serviceWorker.controller) toast('Nieuwe versie van de app staat klaar. Sluit en open de app om bij te werken.', 6000); }));
    }).catch(() => {});
  }
}
start();
