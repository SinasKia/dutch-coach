// Text helpers: normalisation and tolerant answer matching. Pure functions.

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?;:"“”()…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const words = (s) => { const n = normalize(s); return n ? n.split(' ') : []; };
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** 0..1 similarity on normalised strings. */
export function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * Compare a learner answer with accepted answers.
 * ok: exact after normalisation. close: small typo (spelling), reported separately so
 * the UI can say "bijna goed" instead of silently accepting it.
 */
export function matchAnswer(given, answers) {
  const g = normalize(given);
  let best = 0, bestAnswer = answers[0];
  for (const a of answers) {
    const n = normalize(a);
    if (g === n) return { ok: true, close: false, answer: a };
    const s = similarity(g, n);
    if (s > best) { best = s; bestAnswer = a; }
  }
  const len = normalize(bestAnswer).length;
  const close = len >= 6 && best >= (len > 20 ? 0.93 : 0.86);
  return { ok: false, close, answer: bestAnswer, score: best };
}

/** Share of the words of `target` that occur in `given` (used for shadowing/STT comparison). */
export function wordOverlap(given, target) {
  const g = new Set(words(given)), t = words(target);
  if (!t.length) return 0;
  return t.filter((w) => g.has(w)).length / t.length;
}

/** Small seeded RNG so generated exercises are reproducible in tests. */
export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
