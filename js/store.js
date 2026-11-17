// Local-first persistence (IndexedDB) and in-memory app state. No account, no server.
import { mergePacks, validatePack, importCheck, compareVersions } from './engine/packs.js';
import { updateSkill, recordError, recordFix } from './engine/learner.js';

const DB = 'dutch-coach', VERSION = 1;
let dbPromise;
const open = () => dbPromise ||= new Promise((res, rej) => {
  const r = indexedDB.open(DB, VERSION);
  r.onupgradeneeded = () => {
    const d = r.result;
    d.createObjectStore('kv');
    d.createObjectStore('log', { autoIncrement: true });
    d.createObjectStore('packs', { keyPath: 'id' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
const idb = {
  get: (s, k) => tx(s, 'readonly', (o) => o.get(k)),
  all: (s) => tx(s, 'readonly', (o) => o.getAll()),
  put: (s, v, k) => tx(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k))),
  add: (s, v) => tx(s, 'readwrite', (o) => o.add(v)),
  del: (s, k) => tx(s, 'readwrite', (o) => o.delete(k)),
  clear: (s) => tx(s, 'readwrite', (o) => o.clear()),
};

const DEFAULTS = {
  settings: { theme: 'auto', weeklyHours: 6, restDays: [0], rate: 1, persianHelp: true, micConsent: false, newPerDay: 6, load: 0, ai: { enabled: false, provider: 'none' } },
  profile: { onboarded: false, stage: 1, levels: {}, diagnostics: [], confidence: [] },
  skills: {}, errors: {}, done: {}, cards: {},
};
const KEYS = Object.keys(DEFAULTS);

export const S = { log: [], packs: [], content: mergePacks([]), contentStatus: '', hostedOrder: [] };

export async function init() {
  for (const k of KEYS) S[k] = { ...structuredClone(DEFAULTS[k]), ...((await idb.get('kv', k)) || {}) };
  S.log = await idb.all('log');
  S.packs = await idb.all('packs');
  S.hostedOrder = (await idb.get('kv', 'hostedOrder')) || [];
  navigator.storage?.persist?.().catch(() => {});
  rebuild();
  // First run needs the bundled packs; later runs refresh in the background (never blocks startup).
  if (!S.packs.length) await syncHosted(); else syncHosted().catch(() => {});
}

function rebuild() {
  const order = (p) => { const i = S.hostedOrder.indexOf(p.id); return i < 0 ? 1000 : i; };
  S.content = mergePacks(S.packs.slice().sort((a, b) => order(a) - order(b)));
}

/** Hosted core packs: compare versions from content/index.json and download only what changed. */
export async function syncHosted() {
  try {
    const index = await (await fetch('content/index.json', { cache: 'no-cache' })).json();
    let changed = 0;
    for (const entry of index.packs) {
      const cur = S.packs.find((p) => p.id === entry.id);
      if (cur && compareVersions(entry.version, cur.version) <= 0) continue;
      const pack = await (await fetch(`content/${entry.file}`, { cache: 'no-cache' })).json();
      if (!validatePack(pack).ok) continue;
      await installPack(pack, 'hosted', false); changed += 1;
    }
    S.hostedOrder = index.packs.map((p) => p.id);
    await idb.put('kv', S.hostedOrder, 'hostedOrder');
    rebuild();
    S.contentStatus = changed ? `${changed} pakket(ten) bijgewerkt` : 'Inhoud is actueel';
    return { ok: true, changed };
  } catch (e) {
    S.contentStatus = 'Offline: opgeslagen inhoud wordt gebruikt';
    return { ok: false, changed: 0 };
  }
}

export async function installPack(pack, source = 'imported', doRebuild = true) {
  const rec = { ...pack, source, installedAt: Date.now() };
  await idb.put('packs', rec);
  S.packs = [...S.packs.filter((p) => p.id !== pack.id), rec];
  if (doRebuild) rebuild();
}
export async function removePack(id) {
  await idb.del('packs', id);
  S.packs = S.packs.filter((p) => p.id !== id);
  rebuild();
}
export const checkImport = (pack) => importCheck(pack, S.packs);

/** Save an expression from a conversation or transcript into the personal pack. */
export async function saveCustomVocab(nl, faText, ex) {
  const personal = S.packs.find((p) => p.id === 'personal') || { format: 'dutch-coach-pack', formatVersion: 1, id: 'personal', version: '1.0.0', title: 'Mijn eigen woorden', vocab: [] };
  if (personal.vocab.some((v) => v.nl.toLowerCase() === nl.toLowerCase()) || S.content.vocabKeys.has(nl.toLowerCase())) return false;
  personal.vocab.push({ id: `p-${Date.now()}`, nl, fa: faText || '—', cefr: 'B1', topic: 'eigen woorden', reg: 'neutraal', ex: ex || nl, ctx: 'Zelf bewaard.' });
  await installPack(personal, 'personal');
  return true;
}

export const save = (key) => idb.put('kv', S[key], key);

export function logActivity(kind, sec, ref, data = {}) {
  const e = { ts: Date.now(), kind, sec: Math.max(0, Math.round(sec)), ref, data };
  S.log.push(e);
  idb.add('log', e);
  return e;
}

/** Record an exercise result: skill model + error memory. */
export function recordAnswer(ex, ok, given, expected) {
  updateSkill(S.skills, ex.skill, ok);
  if (ok) recordFix(S.errors, ex.itemId);
  else recordError(S.errors, { skill: ex.skill, itemId: ex.itemId, given, expected, source: 'oefening' });
  save('skills'); save('errors');
}
/** Record a pattern found in free production (conversation, writing). */
export function recordPattern(issue, source) {
  updateSkill(S.skills, issue.skill, false);
  recordError(S.errors, { skill: issue.skill, given: issue.found, expected: issue.fix || issue.msg, source });
  save('skills'); save('errors');
}
export function markDone(id, extra = {}) {
  S.done[id] = { ...(S.done[id] || {}), n: (S.done[id]?.n || 0) + 1, last: Date.now(), ...extra };
  save('done');
}

/* ---------- Backup, restore, delete ---------- */
export function exportData() {
  const data = { app: 'dutch-coach', exported: new Date().toISOString(), log: S.log, packs: S.packs.filter((p) => p.source !== 'hosted') };
  for (const k of KEYS) data[k] = S[k];
  return JSON.stringify(data, null, 1);
}
export async function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== 'dutch-coach') throw new Error('Dit is geen back-up van Dutch Coach.');
  for (const k of KEYS) if (data[k]) { S[k] = data[k]; await save(k); }
  await idb.clear('log');
  S.log = data.log || [];
  for (const e of S.log) await idb.add('log', e);
  for (const p of data.packs || []) if (validatePack(p).ok) await installPack(p, p.source || 'imported', false);
  rebuild();
}
export async function wipe() {
  for (const s of ['kv', 'log', 'packs']) await idb.clear(s);
  location.hash = ''; location.reload();
}
