// Validate lesson packs before importing them into the app.
// Usage: node tools/validate-pack.mjs [file.json ...]   (default: every pack in content/)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack, mergePacks } from '../js/engine/packs.js';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(contentDir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => join(contentDir, f));
let failed = false; const packs = [];
for (const f of files) {
  let pack;
  try { pack = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.error(`✗ ${f}: ongeldige JSON — ${e.message}`); failed = true; continue; }
  const r = validatePack(pack);
  console.log(`${r.ok ? '✓' : '✗'} ${pack.id || f} v${pack.version || '?'} — ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  r.errors.forEach((e) => console.error('   FOUT: ' + e));
  r.warnings.forEach((w) => console.warn('   let op: ' + w));
  if (!r.ok) failed = true; else packs.push(pack);
}
const merged = mergePacks(packs);
if (merged.skipped.length) { console.warn(`Dubbele items tussen pakketten (worden overgeslagen):`); merged.skipped.forEach((s) => console.warn(`   ${s.pack}: ${s.kind} ${s.id}`)); }
console.log(`Totaal: ${merged.vocab.length} uitdrukkingen, ${merged.grammar.length} grammaticalessen (${merged.items.length} oefenitems), ${merged.dialogues.length} dialogen, ${merged.scenarios.length} scenario's, ${merged.missions.length} missies.`);
process.exit(failed ? 1 : 0);
