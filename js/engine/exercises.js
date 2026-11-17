// Exercise templates. Structured content items are expanded into concrete exercises.
// Generator templates (invert, sub, perf, sep) only recombine parts that the content author
// marked as compatible, so every generated sentence stays grammatical.
import { cap, lowerFirst, matchAnswer, normalize, shuffle, pick } from './text.js';

const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/** Number of distinct variants an item can produce. */
export function variantCount(item) {
  if (item.t === 'invert') return item.fronts.length;
  if (item.t === 'sub') return item.conj.length;
  return 1;
}

/**
 * Expand a grammar item into a concrete exercise.
 * opts.hard: typed production instead of ordering blocks (used when the skill is already strong).
 */
export function expand(item, { variant = 0, hard = false, rand = Math.random } = {}) {
  const base = { id: `${item.id}#${variant}`, itemId: item.id, skill: item.skill, cefr: item.cefr, lessonId: item.lessonId, why: item.why };
  const build = (prompt, sub, chunks, answer) => hard
    ? { ...base, kind: 'type', prompt, sub, answers: [answer] }
    : { ...base, kind: 'order', prompt, sub, chunks: shuffleDifferent(chunks, rand), answers: [answer] };

  switch (item.t) {
    case 'choice':
      return { ...base, kind: 'choice', prompt: item.q, options: item.options, answer: item.a };
    case 'fill':
      return { ...base, kind: 'type', prompt: item.q, answers: item.a };
    case 'order': {
      const answers = [item.chunks, ...(item.alt || [])].map((c) => c.join(' '));
      return { ...base, kind: 'order', prompt: 'Zet de woorden in de goede volgorde. Begin met de hoofdletter.', chunks: shuffleDifferent(item.chunks, rand), answers };
    }
    case 'invert': {
      const front = item.fronts[variant % item.fronts.length];
      const sentence = join(cap(item.s), item.v, lowerFirst(front), item.rest) + '.';
      return build(`Begin de zin met “${front}”.`, sentence, [front, item.v, item.s, item.rest].filter(Boolean), join(front, item.v, item.s, item.rest));
    }
    case 'sub': {
      const conj = item.conj[variant % item.conj.length];
      const second = join(cap(item.s), item.v, item.mid) + '.';
      return build(`Verbind de zinnen met “${conj}”.`, `${item.main}. ${second}`, [item.main, conj, item.s, item.mid, item.v].filter(Boolean), join(item.main, conj, item.s, item.mid, item.v));
    }
    case 'perf':
      return build('Zet de zin in de voltooide tijd.', join(item.s, `(${item.inf})`, item.rest) + '.', [item.s, item.aux, item.rest, item.pp].filter(Boolean), join(item.s, item.aux, item.rest, item.pp));
    case 'sep':
      return build('Maak een zin in de tegenwoordige tijd.', `${lowerFirst(item.s)} / ${item.inf} / ${item.rest}`, [item.s, item.v, item.rest, item.prefix].filter(Boolean), join(item.s, item.v, item.rest, item.prefix));
    default:
      throw new Error(`Onbekend oefentype: ${item.t}`);
  }
}

function shuffleDifferent(chunks, rand) {
  if (chunks.length < 2) return chunks.slice();
  for (let i = 0; i < 6; i++) {
    const s = shuffle(chunks, rand);
    if (s.join('|') !== chunks.join('|')) return s;
  }
  return chunks.slice().reverse();
}

/** Vocabulary exercises built from the vocabulary pool. */
export function vocabExercise(v, pool, mode, rand = Math.random) {
  const base = { id: `${v.id}#${mode}`, itemId: v.id, skill: 'vocab', cefr: v.cefr, vocabId: v.id };
  const others = shuffle(pool.filter((o) => o.id !== v.id && o.en !== v.en && o.nl !== v.nl), rand).slice(0, 3);
  if (mode === 'recall' || others.length < 3) {
    return { ...base, kind: 'type', prompt: 'Hoe zeg je dit in het Nederlands?', subEn: v.en, answers: [v.nl, ...(v.alt || [])], why: v.ex };
  }
  if (mode === 'cloze' && v.ex && v.ex.toLowerCase().includes(v.nl.toLowerCase())) {
    const i = v.ex.toLowerCase().indexOf(v.nl.toLowerCase());
    const options = shuffle([v, ...others], rand);
    return { ...base, kind: 'choice', prompt: 'Welke uitdrukking past?', sub: v.ex.slice(0, i) + '_____' + v.ex.slice(i + v.nl.length), options: options.map((o) => o.nl), answer: options.indexOf(v) };
  }
  const options = shuffle([v, ...others], rand);
  return { ...base, kind: 'choice', prompt: 'Wat betekent dit?', sub: v.nl, optionsEn: true, options: options.map((o) => o.en), answer: options.indexOf(v), why: v.ex };
}

/** Grade an answer. `given` is an option index (choice), an array of chunks (order) or text (type). */
export function grade(ex, given) {
  if (ex.kind === 'choice') {
    return { ok: given === ex.answer, close: false, expected: ex.options[ex.answer] };
  }
  const text = Array.isArray(given) ? given.join(' ') : given;
  const m = matchAnswer(text, ex.answers);
  return { ok: m.ok, close: !m.ok && m.close, expected: m.answer, given: text };
}

/** Pick `n` exercises from grammar items, preferring previously failed items, then unseen variety. */
export function buildDrill(items, n, { hard = false, failedIds = [], rand = Math.random } = {}) {
  const failed = items.filter((i) => failedIds.includes(i.id));
  const rest = shuffle(items.filter((i) => !failedIds.includes(i.id)), rand);
  const chosen = [...failed, ...rest].slice(0, n);
  return chosen.map((item) => expand(item, { variant: Math.floor(rand() * variantCount(item)), hard, rand }));
}

/** Every variant of every item — used by the pack validator to prove answer consistency. */
export function allVariants(item) {
  const out = [];
  for (let v = 0; v < variantCount(item); v++) {
    out.push(expand(item, { variant: v, hard: true }), expand(item, { variant: v, hard: false }));
  }
  return out;
}

export { normalize, pick };
