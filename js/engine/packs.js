// Lesson packs: schema validation, version handling, duplicate detection and merging.
// Used by the app (import) and by tools/validate-pack.mjs (authoring). See docs/CONTENT-AUTHORING.md.
import { allVariants } from './exercises.js';
import { normalize } from './text.js';

export const FORMAT = 'dutch-coach-pack';
export const FORMAT_VERSION = 1;
export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const SKILLS = {
  dehet: 'De of het', mainorder: 'Woordvolgorde hoofdzin', inversion: 'Inversie', subclause: 'Bijzin (werkwoord achteraan)',
  conjugation: 'Vervoeging', perfect: 'Voltooide tijd', past: 'Verleden tijd', separable: 'Scheidbare werkwoorden',
  modal: 'Modale werkwoorden', prepositions: 'Vaste voorzetsels', connectors: 'Verbindingswoorden', omte: 'Om … te',
  er: 'Er', relative: 'Betrekkelijke bijzin', passive: 'Passief', conditional: 'Zou / als', literal: 'Letterlijke vertaling',
  length: 'Langere antwoorden', vocab: 'Woordenschat', listening: 'Luisteren', speaking: 'Spreken',
};
const ITEM_FIELDS = {
  choice: ['q', 'options', 'a'], fill: ['q', 'a'], order: ['chunks'], invert: ['s', 'v', 'fronts'],
  sub: ['main', 's', 'v', 'conj'], perf: ['s', 'aux', 'pp', 'inf'], sep: ['s', 'v', 'prefix', 'inf'],
};

const isStr = (x) => typeof x === 'string' && x.trim().length > 0;
const isArr = (x) => Array.isArray(x);

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}

/** Validate a pack object. Returns { ok, errors[], warnings[], counts }. */
export function validatePack(pack) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m);
  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['Geen geldig JSON-object.'], warnings, counts: {} };
  if (pack.format !== FORMAT) err(`"format" moet "${FORMAT}" zijn.`);
  if (pack.formatVersion !== FORMAT_VERSION) err(`"formatVersion" moet ${FORMAT_VERSION} zijn.`);
  if (!isStr(pack.id) || !/^[a-z0-9-]+$/.test(pack.id || '')) err('"id" ontbreekt of bevat andere tekens dan a-z, 0-9 en -.');
  if (!/^\d+\.\d+\.\d+$/.test(pack.version || '')) err('"version" moet de vorm 1.0.0 hebben.');
  if (!isStr(pack.title)) err('"title" ontbreekt.');

  const seen = new Set();
  const checkId = (kind, o, i) => {
    if (!isStr(o?.id)) { err(`${kind}[${i}]: "id" ontbreekt.`); return false; }
    if (seen.has(o.id)) err(`${kind}[${i}]: dubbele id "${o.id}" in dit pakket.`);
    seen.add(o.id);
    return true;
  };
  const checkLevel = (kind, o) => {
    if (!CEFR.includes(o.cefr)) err(`${kind} "${o.id}": "cefr" moet een van ${CEFR.join(', ')} zijn.`);
    if (o.stage != null && !(o.stage >= 1 && o.stage <= 5)) err(`${kind} "${o.id}": "stage" moet 1–5 zijn.`);
  };
  const need = (kind, o, fields) => fields.forEach((f) => { if (!isStr(o[f])) err(`${kind} "${o.id}": veld "${f}" ontbreekt.`); });

  (pack.vocab || []).forEach((v, i) => {
    if (!checkId('vocab', v, i)) return;
    need('vocab', v, ['nl', 'fa', 'ex']); checkLevel('vocab', v);
    if (!v.en) warnings.push(`vocab "${v.id}": geen Engelse uitleg.`);
  });

  (pack.grammar || []).forEach((g, i) => {
    if (!checkId('grammar', g, i)) return;
    need('grammar', g, ['title', 'skill', 'example', 'explain']); checkLevel('grammar', g);
    if (g.skill && !SKILLS[g.skill]) err(`grammar "${g.id}": onbekende skill "${g.skill}".`);
    if (!isArr(g.items) || g.items.length < 3) err(`grammar "${g.id}": minstens 3 oefenitems nodig.`);
    (g.items || []).forEach((it, j) => {
      const label = `grammar "${g.id}" item ${j}`;
      const fields = ITEM_FIELDS[it.t];
      if (!fields) return err(`${label}: onbekend type "${it.t}".`);
      for (const f of fields) if (it[f] == null || it[f] === '') return err(`${label}: veld "${f}" ontbreekt.`);
      if (it.t === 'choice' && (!isArr(it.options) || it.options.length < 2 || !(it.a >= 0 && it.a < it.options.length))) return err(`${label}: "a" moet een geldige index in "options" zijn.`);
      if (it.t === 'choice' && new Set(it.options).size !== it.options.length) return err(`${label}: dubbele opties.`);
      if (it.t === 'fill' && (!isArr(it.a) || !it.a.every(isStr))) return err(`${label}: "a" moet een lijst met antwoorden zijn.`);
      if (it.t === 'fill' && !it.q.includes('___')) warnings.push(`${label}: geen ___ in de vraag.`);
      if (['invert'].includes(it.t) && (!isArr(it.fronts) || !it.fronts.length)) return err(`${label}: "fronts" is leeg.`);
      if (it.t === 'sub' && (!isArr(it.conj) || !it.conj.length)) return err(`${label}: "conj" is leeg.`);
      if (it.t === 'order' && (!isArr(it.chunks) || it.chunks.length < 3)) return err(`${label}: minstens 3 "chunks".`);
      try {
        // Answer consistency: every generated variant must have a non-empty, self-consistent answer.
        for (const ex of allVariants({ ...it, id: `${g.id}-${j}`, skill: g.skill })) {
          if (ex.kind !== 'choice' && !ex.answers.every((a) => normalize(a).length > 0)) err(`${label}: leeg antwoord.`);
          const sorted = (s) => normalize(s).split(' ').sort().join(' ');
          if (ex.kind === 'order' && sorted(ex.chunks.join(' ')) !== sorted(ex.answers[0])) err(`${label}: blokken en antwoord komen niet overeen.`);
        }
      } catch (e) { err(`${label}: ${e.message}`); }
    });
  });

  (pack.dialogues || []).forEach((d, i) => {
    if (!checkId('dialogues', d, i)) return;
    need('dialogues', d, ['title']); checkLevel('dialogues', d);
    if (!isArr(d.lines) || d.lines.length < 2 || !d.lines.every((l) => isStr(l.nl) && isStr(l.sp))) err(`dialogue "${d.id}": "lines" met {sp, nl} nodig.`);
    (d.questions || []).forEach((q, j) => { if (!isStr(q.q) || !isArr(q.options) || !(q.a >= 0 && q.a < q.options.length)) err(`dialogue "${d.id}" vraag ${j}: ongeldig.`); });
  });

  (pack.scenarios || []).forEach((s, i) => {
    if (!checkId('scenarios', s, i)) return;
    need('scenarios', s, ['title', 'setting', 'start']); checkLevel('scenarios', s);
    const nodes = s.nodes || {};
    if (!nodes[s.start]) return err(`scenario "${s.id}": startnode "${s.start}" bestaat niet.`);
    const ref = (n, from) => { if (n && !nodes[n]) err(`scenario "${s.id}": node "${from}" verwijst naar onbekende node "${n}".`); };
    let hasEnd = false;
    for (const [key, n] of Object.entries(nodes)) {
      if (!isStr(n.say)) err(`scenario "${s.id}" node "${key}": "say" ontbreekt.`);
      if (n.end) { hasEnd = true; continue; }
      if (!n.next && !(n.expect || []).length) err(`scenario "${s.id}" node "${key}": geen "next" en geen "expect".`);
      ref(n.next, key); ref(n.twist?.next, key);
      (n.expect || []).forEach((e) => { ref(e.next, key); if (!e.any && !e.all) err(`scenario "${s.id}" node "${key}": expect zonder "any"/"all".`); });
      if ((n.expect || []).length && !n.next) err(`scenario "${s.id}" node "${key}": "next" nodig als terugvaloptie.`);
    }
    if (!hasEnd) err(`scenario "${s.id}": geen eindnode (end: true).`);
    // Every node must be able to reach an end node (no dead loops).
    const reach = (k, seenN = new Set()) => {
      if (!nodes[k] || seenN.has(k)) return false;
      if (nodes[k].end) return true;
      seenN.add(k);
      return [nodes[k].next, ...(nodes[k].expect || []).map((e) => e.next)].filter(Boolean).some((n) => reach(n, new Set(seenN)));
    };
    if (!reach(s.start)) err(`scenario "${s.id}": het einde is niet bereikbaar vanaf de start.`);
  });

  (pack.missions || []).forEach((m, i) => {
    if (!checkId('missions', m, i)) return;
    need('missions', m, ['title', 'goal']); checkLevel('missions', m);
    if (!isArr(m.phrases) || !m.phrases.length) err(`mission "${m.id}": "phrases" ontbreekt.`);
  });

  const counts = Object.fromEntries(['vocab', 'grammar', 'dialogues', 'scenarios', 'missions'].map((k) => [k, (pack[k] || []).length]));
  if (!Object.values(counts).some(Boolean)) err('Het pakket bevat geen inhoud.');
  return { ok: errors.length === 0, errors, warnings, counts };
}

/** Compare an incoming pack with installed packs: same version, upgrade, downgrade or new. */
export function importCheck(pack, installed) {
  const v = validatePack(pack);
  if (!v.ok) return { ...v, action: 'reject' };
  const cur = installed.find((p) => p.id === pack.id);
  let action = 'install';
  if (cur) { const c = compareVersions(pack.version, cur.version); action = c > 0 ? 'upgrade' : c === 0 ? 'same' : 'downgrade'; }
  const others = mergePacks(installed.filter((p) => p.id !== pack.id));
  const dupes = [];
  for (const kind of ['vocab', 'grammar', 'dialogues', 'scenarios', 'missions']) {
    for (const o of pack[kind] || []) {
      if (others.ids.has(o.id) || (kind === 'vocab' && others.vocabKeys.has(normalize(o.nl)))) dupes.push(`${kind}: ${o.id}`);
    }
  }
  return { ...v, action, current: cur?.version, duplicates: dupes };
}

/** Merge packs into one content index. Earlier packs win; duplicates in later packs are skipped. */
export function mergePacks(packs) {
  const c = { vocab: [], grammar: [], dialogues: [], scenarios: [], missions: [], items: [], ids: new Set(), vocabKeys: new Set(), skipped: [], byId: {} };
  for (const p of packs) {
    for (const kind of ['vocab', 'grammar', 'dialogues', 'scenarios', 'missions']) {
      for (const o of p[kind] || []) {
        const key = kind === 'vocab' ? normalize(o.nl) : null;
        if (c.ids.has(o.id) || (key && c.vocabKeys.has(key))) { c.skipped.push({ pack: p.id, kind, id: o.id }); continue; }
        c.ids.add(o.id); if (key) c.vocabKeys.add(key);
        const entry = { ...o, pack: p.id };
        c[kind].push(entry); c.byId[o.id] = entry;
        if (kind === 'grammar') {
          (o.items || []).forEach((it, j) => c.items.push({ ...it, id: it.id || `${o.id}-${j}`, lessonId: o.id, skill: it.skill || o.skill, cefr: it.cefr || o.cefr }));
        }
      }
    }
  }
  return c;
}
