// Spaced repetition: FSRS-4.5 (open algorithm, default parameters). Pure functions.
// Grades: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81;
export const DAY = 86400000;
const clampD = (d) => Math.min(10, Math.max(1, d));

export const retrievability = (elapsedDays, s) => Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
export const intervalFor = (s, retention = 0.9) => Math.max(1, Math.round((s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)));

export function newCard(id, now = Date.now()) {
  return { id, s: 0, d: 0, reps: 0, lapses: 0, due: now, last: 0, added: now, lastGrade: 0 };
}

/** Returns an updated copy of the card after a review. */
export function review(card, grade, now = Date.now(), retention = 0.9) {
  const c = { ...card };
  if (!c.reps) {
    c.s = W[grade - 1];
    c.d = clampD(W[4] - (grade - 3) * W[5]);
  } else {
    const elapsed = Math.max(0, (now - c.last) / DAY);
    const r = retrievability(elapsed, c.s);
    c.d = clampD(W[7] * W[4] + (1 - W[7]) * (c.d - W[6] * (grade - 3)));
    if (grade === 1) {
      c.s = Math.min(c.s, W[11] * Math.pow(c.d, -W[12]) * (Math.pow(c.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
    } else {
      const bonus = grade === 2 ? W[15] : grade === 4 ? W[16] : 1;
      c.s = c.s * (1 + Math.exp(W[8]) * (11 - c.d) * Math.pow(c.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * bonus);
    }
  }
  c.s = Math.max(0.1, c.s);
  c.reps += 1;
  if (grade === 1) c.lapses += 1;
  c.last = now;
  c.lastGrade = grade;
  // Again: come back within this session (10 minutes); otherwise schedule in whole days.
  c.due = grade === 1 ? now + 10 * 60000 : now + intervalFor(c.s, retention) * DAY;
  return c;
}

/** Status derived from retrieval performance only (not from time spent). */
export function status(card) {
  if (!card || !card.reps) return 'new';
  if (card.lapses >= 3 && card.s < 14) return 'difficult';
  if (card.s >= 21 && card.lastGrade >= 3) return 'mastered';
  if (card.s < 4) return 'learning';
  return 'reviewing';
}

export const isDue = (card, now = Date.now()) => card.reps > 0 && card.due <= now;

/** Due cards, most overdue (lowest retrievability) first. */
export function dueCards(cards, now = Date.now()) {
  return cards.filter((c) => isDue(c, now))
    .sort((a, b) => retrievability((now - a.last) / DAY, a.s) - retrievability((now - b.last) / DAY, b.s));
}
