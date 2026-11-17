// Learner model: skill tracking, error memory, stage criteria, diagnostic scoring and the
// daily session planner. Deterministic, transparent rules — no AI. Pure functions on plain data.
import { dueCards, status, DAY } from './srs.js';
import { SKILLS } from './packs.js';

/* ---------- Skill tracking (exponentially weighted accuracy) ---------- */
export function updateSkill(skills, skill, ok, now = Date.now()) {
  const s = skills[skill] || { score: 0.5, n: 0, last: 0 };
  skills[skill] = { score: s.score + 0.2 * ((ok ? 1 : 0) - s.score), n: s.n + 1, last: now };
  return skills;
}
/** Weakest skills first. Only skills with at least `minN` observations count. */
export function weakSkills(skills, minN = 3, threshold = 0.7) {
  return Object.entries(skills).filter(([k, s]) => SKILLS[k] && s.n >= minN && s.score < threshold)
    .sort((a, b) => a[1].score - b[1].score).map(([k]) => k);
}

/* ---------- Error memory ---------- */
export function recordError(errors, { skill, itemId, given, expected, source }, now = Date.now()) {
  const key = itemId ? `item:${itemId}` : `pattern:${skill}:${String(expected || given).toLowerCase().slice(0, 40)}`;
  const e = errors[key] || { key, skill, itemId, count: 0, streak: 0, examples: [] };
  e.count += 1; e.streak = 0; e.last = now; e.source = source;
  if (given || expected) e.examples = [{ given, expected }, ...e.examples.filter((x) => x.given !== given)].slice(0, 3);
  errors[key] = e;
  return errors;
}
/** A correct answer on a remembered item: after two in a row it leaves the active error list. */
export function recordFix(errors, itemId) {
  const e = errors[`item:${itemId}`];
  if (e) { e.streak += 1; if (e.streak >= 2) e.resolved = true; }
  return errors;
}
export const activeErrors = (errors) => Object.values(errors).filter((e) => !e.resolved).sort((a, b) => b.count - a.count || b.last - a.last);
export function errorsBySkill(errors) {
  const out = {};
  for (const e of activeErrors(errors)) out[e.skill] = (out[e.skill] || 0) + e.count;
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

/* ---------- Levels ---------- */
export const LEVEL_LABEL = (n) => n == null ? '–' : n < 1 ? 'onder A2' : n < 1.5 ? 'A2' : n < 2 ? 'A2–B1' : n < 2.5 ? 'B1' : n < 3 ? 'B1–B2' : 'B2';
export const CEFR_NUM = { A1: 0.5, A2: 1, B1: 2, B2: 3, C1: 3.5 };

/** results: [{level:1|2|3, ok}] → estimated level 0.5..3 in half steps. */
export function levelFromResults(results) {
  const acc = (l) => { const r = results.filter((x) => x.level === l); return r.length ? r.filter((x) => x.ok).length / r.length : null; };
  let level = 0.5;
  for (const l of [1, 2, 3]) {
    const a = acc(l);
    if (a == null) { if (l === 1) { level = 1; continue; } break; }
    if (a >= 0.65) level = l; else { if (a >= 0.4) level = Math.max(level, l - 0.5); break; }
  }
  return level;
}
export const nextLevel = (level, ok) => Math.min(3, Math.max(1, level + (ok ? 1 : -1)));

/** Speaking estimate from measurable text features only (length, linking, clause complexity, detected errors). */
export function speakingLevel(analyses, selfRating = 0) {
  const a = analyses.filter((x) => x.words > 0);
  if (!a.length) return null;
  const avg = a.reduce((s, x) => s + x.words, 0) / a.length;
  const conn = new Set(a.flatMap((x) => x.connectors)).size;
  const sub = a.reduce((s, x) => s + x.subclauses, 0);
  const errs = a.reduce((s, x) => s + x.issues.filter((i) => i.kind === 'error').length, 0);
  const total = a.reduce((s, x) => s + x.words, 0);
  let level = 0.5;
  if (avg >= 12) level = 1;
  if (avg >= 22 && conn >= 2) level = 1.5;
  if (avg >= 30 && conn >= 3 && sub >= 2) level = 2;
  if (avg >= 45 && conn >= 4 && sub >= 4 && errs / total <= 1 / 30) level = 2.5;
  if (avg >= 60 && conn >= 6 && sub >= 6 && errs / total <= 1 / 50 && selfRating >= 4) level = 3;
  return level;
}

export function stageFromLevels(levels) {
  const vals = ['grammar', 'vocab', 'listening', 'speaking'].map((k) => levels[k]).filter((v) => v != null);
  if (!vals.length) return 1;
  // Speaking and grammar weigh most: the lowest of those two limits the stage.
  const core = Math.min(levels.grammar ?? 1, levels.speaking ?? levels.grammar ?? 1);
  const avg = (vals.reduce((a, b) => a + b, 0) / vals.length + core) / 2;
  return avg < 1.4 ? 1 : avg < 1.9 ? 2 : avg < 2.4 ? 3 : avg < 2.8 ? 4 : 5;
}

/* ---------- Stages: observable performance criteria ---------- */
export const STAGES = [
  { n: 1, title: 'Fundament herstellen', fa: 'ترمیم پایه‌ها', goal: 'Basisfouten opsporen en repareren; bestaande kennis activeren.', skills: ['mainorder', 'inversion', 'conjugation', 'perfect'], conv: 3 },
  { n: 2, title: 'Zelfstandig in gesprekken', fa: 'استقلال در گفت‌وگو', goal: 'Dagelijkse situaties aankunnen en een spontaan gesprek gaande houden.', skills: ['subclause', 'modal', 'separable', 'prepositions'], conv: 6, listen: [0.7, 9] },
  { n: 3, title: 'Langer spreken', fa: 'صحبت طولانی‌تر', goal: 'Ervaringen uitleggen, beschrijven, verhalen vertellen en vergelijken.', skills: ['past', 'connectors', 'relative'], conv: 9, avgWords: 25, connectors: 4 },
  { n: 4, title: 'Argumenten en meningen', fa: 'استدلال و نظر', goal: 'Genuanceerde meningen geven, beleefd tegenspreken, argumenten verbinden.', skills: ['conditional', 'passive', 'omte'], discussions: 4, avgWords: 40, connectors: 6 },
  { n: 5, title: 'B2-simulatie', fa: 'شبیه‌سازی B2', goal: 'Complexe gesprekken, langere luistertaken en gestructureerde spreekopdrachten.', skills: [], discussions: 8, avgWords: 55, connectors: 8, listen: [0.7, 9, 'B2'] },
];

export function conversationStats(log) {
  const conv = log.filter((e) => e.kind === 'speak' && e.data?.completed);
  const recent = conv.slice(-5);
  const open = recent.filter((e) => e.data.openTurns > 0);
  return {
    completed: conv.length,
    discussions: conv.filter((e) => e.data.type === 'discussion').length,
    avgWords: open.length ? open.reduce((s, e) => s + e.data.avgWords, 0) / open.length : 0,
    connectors: new Set(recent.flatMap((e) => e.data.connectors || [])).size,
  };
}
export function listeningStats(log, cefr) {
  const l = log.filter((e) => e.kind === 'listen' && e.data?.total && (!cefr || e.data.cefr === cefr));
  const total = l.reduce((s, e) => s + e.data.total, 0), correct = l.reduce((s, e) => s + e.data.correct, 0);
  return { total, acc: total ? correct / total : 0 };
}

/** Checklist for leaving stage `n`. Advancement requires every criterion — never time spent. */
export function stageCriteria(n, { skills, log }) {
  const st = STAGES[n - 1], cs = conversationStats(log), out = [];
  for (const k of st.skills) {
    const s = skills[k] || { score: 0, n: 0 };
    out.push({ label: `${SKILLS[k]}: ≥ 75% goed over minstens 6 oefeningen`, done: s.n >= 6 && s.score >= 0.75, detail: s.n ? `${Math.round(s.score * 100)}% · ${s.n}×` : 'nog niet geoefend' });
  }
  if (st.conv) out.push({ label: `${st.conv} gesprekken afgerond`, done: cs.completed >= st.conv, detail: `${cs.completed}/${st.conv}` });
  if (st.discussions) out.push({ label: `${st.discussions} discussies afgerond`, done: cs.discussions >= st.discussions, detail: `${cs.discussions}/${st.discussions}` });
  if (st.avgWords) out.push({ label: `Gemiddeld ≥ ${st.avgWords} woorden per vrij antwoord (laatste 5 gesprekken)`, done: cs.avgWords >= st.avgWords, detail: `${Math.round(cs.avgWords)} woorden` });
  if (st.connectors) out.push({ label: `≥ ${st.connectors} verschillende verbindingswoorden gebruikt (laatste 5 gesprekken)`, done: cs.connectors >= st.connectors, detail: `${cs.connectors}` });
  if (st.listen) {
    const ls = listeningStats(log, st.listen[2]);
    out.push({ label: `Luistervragen${st.listen[2] ? ' op ' + st.listen[2] : ''}: ≥ ${st.listen[0] * 100}% goed over minstens ${st.listen[1]} vragen`, done: ls.total >= st.listen[1] && ls.acc >= st.listen[0], detail: ls.total ? `${Math.round(ls.acc * 100)}% · ${ls.total} vragen` : 'nog geen vragen' });
  }
  return out;
}

/* ---------- Time and activity statistics ---------- */
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function startOfWeek(t) { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
export function minutesSince(log, since, kind) {
  return log.filter((e) => e.ts >= since && (!kind || e.kind === kind)).reduce((s, e) => s + (e.sec || 0), 0) / 60;
}
export function daysSinceLast(log, now = Date.now()) {
  const last = log.length ? log[log.length - 1].ts : 0;
  return last ? Math.floor((startOfDay(now) - startOfDay(last)) / DAY) : null;
}
export function retention(log, days = 30, now = Date.now()) {
  const r = log.filter((e) => e.kind === 'vocab' && e.data?.grade && e.ts >= now - days * DAY && !e.data.first);
  return r.length ? { n: r.length, rate: r.filter((e) => e.data.grade > 1).length / r.length } : { n: 0, rate: null };
}
export function vocabCounts(vocab, cards) {
  const c = { new: 0, learning: 0, reviewing: 0, difficult: 0, mastered: 0 };
  for (const v of vocab) c[status(cards[v.id])] += 1;
  return c;
}

/* ---------- Daily session planner ---------- */
const recentlyDone = (done, id, days, now) => done[id] && now - done[id].last < days * DAY;

export function chooseScenario({ content, done, profile, skills, now = Date.now(), rand = Math.random, type }) {
  const weak = weakSkills(skills);
  const stage = profile.stage || 1;
  const pool = content.scenarios.filter((s) => !s.hidden && (!type || s.type === type) && (s.stage || 1) <= stage + 1);
  if (!pool.length) return null;
  const score = (s) => (done[s.id] ? 0 : 2) + (recentlyDone(done, s.id, 3, now) ? -3 : 0) + ((s.stage || 1) === stage ? 2 : (s.stage || 1) < stage ? 1 : 0)
    + ((s.tags || []).some((t) => weak.includes(t)) ? 1 : 0) + rand() * 0.5;
  const s = pool.map((x) => [score(x), x]).sort((a, b) => b[0] - a[0])[0][1];
  let mode = s.type;
  if (s.type === 'roleplay') mode = stage <= 1 || !done[s.id] && stage <= 2 ? 'guided' : done[s.id] && Object.values(s.nodes).some((n) => n.twist) ? 'challenge' : 'roleplay';
  return { scenario: s, mode };
}

export function chooseDialogue({ content, done, profile, now = Date.now() }) {
  const target = profile.levels?.listening ?? 1.5;
  const num = { A2: 1, B1: 2, B2: 3 };
  const pool = content.dialogues.map((d) => [Math.abs((num[d.cefr] || 2) - Math.min(3, target + 0.5)) + (done[d.id] ? 1 + (recentlyDone(done, d.id, 7, now) ? 3 : 0) : 0), d]);
  return pool.sort((a, b) => a[0] - b[0])[0]?.[1] || null;
}

export function chooseLesson({ content, done, profile, skills, errors }) {
  const stage = profile.stage || 1;
  const available = content.grammar.filter((g) => (g.stage || 1) <= stage + 1);
  const priority = [...errorsBySkill(errors).map(([k]) => k), ...weakSkills(skills)];
  for (const k of priority) { const g = available.find((x) => x.skill === k); if (g) return { lesson: g, why: `Je maakt hier nog fouten: ${SKILLS[k]}.` }; }
  const unseen = available.filter((g) => !done[g.id]).sort((a, b) => (a.stage || 1) - (b.stage || 1))[0];
  if (unseen) return { lesson: unseen, why: 'Nieuwe structuur voor jouw fase.' };
  const oldest = available.slice().sort((a, b) => (done[a.id]?.last || 0) - (done[b.id]?.last || 0))[0];
  return oldest ? { lesson: oldest, why: 'Opfrissen: lang niet geoefend.' } : null;
}

/**
 * Build a session that fits `minutes`. Base allocation: 40% speaking, 25% listening,
 * 20% vocabulary, 15% grammar — shifted by due reviews, recurring errors and this week's balance.
 */
export function buildSession({ minutes, content, cards, skills, errors, done, profile, log, settings = {}, now = Date.now(), rand = Math.random }) {
  const due = dueCards(Object.values(cards), now).length;
  const gap = daysSinceLast(log, now);
  const weakN = weakSkills(skills).length + (activeErrors(errors).length >= 3 ? 1 : 0);
  const share = { speak: 0.4, listen: 0.25, vocab: 0.2, grammar: 0.15 };
  if (weakN >= 2) { share.grammar += 0.07; share.listen -= 0.07; }
  if (due > 30) { share.vocab += 0.06; share.speak -= 0.06; }
  // Balance over the week: if a skill area fell far behind its share, give it a little extra.
  const week = startOfWeek(now), totalWeek = minutesSince(log, week);
  if (totalWeek > 30) for (const k of ['speak', 'listen']) {
    if (minutesSince(log, week, k) / totalWeek < share[k] - 0.15) { share[k] += 0.06; share.vocab -= 0.03; share.grammar -= 0.03; }
  }
  const notes = [];
  if (gap != null && gap >= 3) notes.push(`Welkom terug na ${gap} dagen. We beginnen rustig met herhaling — er is niets "verloren".`);
  if (due > 60) notes.push(`Er staan ${due} kaarten klaar. We doen vandaag alleen de belangrijkste; de rest komt vanzelf terug.`);

  const kinds = minutes <= 10 ? ['vocab', 'speak'] : minutes <= 15 ? ['vocab', weakN ? 'grammar' : 'listen', 'speak'] : ['vocab', 'grammar', 'listen', 'speak'];
  const sum = kinds.reduce((s, k) => s + share[k], 0);
  const wrap = minutes >= 20 ? Math.min(3, Math.round(minutes * 0.08)) : 1;
  const budget = Object.fromEntries(kinds.map((k) => [k, Math.max(2, Math.round((minutes - wrap) * share[k] / sum))]));
  const steps = [];

  // 1. Recall & review, then a few new chunks if there is room.
  const reviewN = Math.min(due, Math.round(budget.vocab * 5), gap >= 3 ? 25 : 60);
  const learnedToday = log.filter((e) => e.kind === 'vocab' && e.data?.first && e.ts >= startOfDay(now)).length;
  const roomMin = budget.vocab - reviewN / 5;
  const newN = Math.max(0, Math.min((settings.newPerDay ?? 6) - learnedToday, Math.floor(roomMin / 0.8), content.vocab.filter((v) => !cards[v.id]).length));
  if (reviewN || newN) steps.push({ kind: 'vocab', minutes: budget.vocab, title: 'Ophalen en herhalen', reviewN, newN, why: reviewN ? `${reviewN} kaarten zijn toe aan herhaling.` : 'Nieuwe uitdrukkingen in context.' });

  if (budget.grammar) {
    const g = chooseLesson({ content, done, profile, skills, errors });
    if (g) steps.push({ kind: 'grammar', minutes: budget.grammar, title: g.lesson.title, ref: g.lesson.id, n: Math.max(4, Math.round(budget.grammar * 2)), why: g.why });
  }
  if (budget.listen) {
    const d = chooseDialogue({ content, done, profile, now });
    if (d) steps.push({ kind: 'listen', minutes: budget.listen, title: `Luisteren: ${d.title}`, ref: d.id, shadow: budget.listen >= 5, why: `Niveau ${d.cefr}${done[d.id] ? ' · herhaling' : ''}.` });
  }
  const sc = chooseScenario({ content, done, profile, skills, now, rand });
  if (sc) steps.push({ kind: 'speak', minutes: budget.speak, title: `Gesprek: ${sc.scenario.title}`, ref: sc.scenario.id, mode: sc.mode, why: done[sc.scenario.id] ? 'Opnieuw, nu met minder hulp.' : 'Past bij je fase en je zwakke punten.' });
  steps.push({ kind: 'wrap', minutes: wrap, title: 'Terugblik', why: 'Wat ging goed, wat komt morgen terug.' });
  return { minutes, steps, notes, share };
}
