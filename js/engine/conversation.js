// Turn-based conversation engine for branching role-plays, free speaking and B2 discussions.
// The "partner" is scripted: it recognises keywords (role-play) or simply accepts a sufficiently
// long answer (open turns). It does not understand meaning — that would require an AI model.
import { analyze, matchIntent } from './analysis.js';
import { normalize } from './text.js';

export const MODES = {
  guided: { label: 'Begeleid gesprek', hints: true, text: true },
  roleplay: { label: 'Rollenspel', hints: false, text: false },
  challenge: { label: 'Uitdaging', hints: false, text: false },
  free: { label: 'Vrij spreken', hints: true, text: true },
  discussion: { label: 'B2-discussie', hints: true, text: true },
  diagnostic: { label: 'Interview', hints: false, text: true },
};

export function createConversation(scenario, mode) {
  const st = { id: scenario.start, fails: 0, nudged: false, pending: '', turns: [], fallbacks: 0, done: false };
  const view = (id) => {
    const n = scenario.nodes[id];
    if (mode === 'challenge' && n.twist) return { ...n, ...n.twist, expect: n.twist.expect, twisted: true };
    return n;
  };
  const go = (next) => { st.id = next; st.fails = 0; st.nudged = false; st.pending = ''; if (view(next).end) st.done = true; };

  return {
    scenario, mode, state: st,
    current: () => view(st.id),
    /** Process a learner reply. Returns { retry, say } when the partner asks again, else { retry:false }. */
    reply(text) {
      const n = view(st.id);
      const full = (st.pending + ' ' + text).trim();
      const turn = { node: st.id, partner: n.say, text: full, analysis: analyze(full), model: n.model, open: !n.expect, targets: n.targets || [] };
      if (n.expect && n.expect.length) {
        const m = matchIntent(full, n.expect);
        if (m) { st.turns.push({ ...turn, understood: true }); go(m.next); return { retry: false }; }
        if (st.fails === 0) {
          st.fails = 1; st.fallbacks += 1; st.pending = full;
          return { retry: true, say: n.fallback || `Sorry, dat begrijp ik niet helemaal. ${n.say}` };
        }
        st.turns.push({ ...turn, understood: false }); go(n.next); return { retry: false, missed: true };
      }
      const min = n.minWords || 1;
      if (mode !== 'diagnostic' && min >= 6 && turn.analysis.words < min * 0.6 && !st.nudged) {
        st.nudged = true; st.pending = full;
        return { retry: true, say: 'Kun je daar iets meer over vertellen?' };
      }
      st.turns.push({ ...turn, understood: true, short: turn.analysis.words < min });
      go(n.next);
      return { retry: false };
    },
  };
}

/** Did the learner use a target expression such as "Aan de ene kant …, aan de andere kant …"? */
export function usesTarget(text, target) {
  const n = normalize(text);
  const parts = target.split('…').map((p) => normalize(p)).filter((p) => p.length > 2);
  return parts.length > 0 && parts.every((p) => n.includes(p));
}

/** Summary used for feedback, logging and stage criteria. */
export function summarize(conv) {
  const turns = conv.state.turns;
  const open = turns.filter((t) => t.open);
  const all = turns.flatMap((t) => t.analysis.issues.map((i) => ({ ...i, turn: t })));
  const uniq = (list) => list.filter((x, i) => list.findIndex((y) => y.found === x.found && y.skill === x.skill) === i);
  const targets = [...new Set(turns.flatMap((t) => t.targets))];
  return {
    completed: conv.state.done,
    type: conv.scenario.type,
    turns: turns.length,
    words: turns.reduce((s, t) => s + t.analysis.words, 0),
    openTurns: open.length,
    avgWords: open.length ? open.reduce((s, t) => s + t.analysis.words, 0) / open.length : 0,
    connectors: [...new Set(turns.flatMap((t) => t.analysis.connectors))],
    understood: turns.filter((t) => !t.open && t.understood).length,
    keywordTurns: turns.filter((t) => !t.open).length,
    fallbacks: conv.state.fallbacks,
    errors: uniq(all.filter((i) => i.kind === 'error')).slice(0, 4), // never overwhelm: at most four
    style: uniq(all.filter((i) => i.kind === 'style')).slice(0, 2),
    targetsUsed: targets.filter((t) => turns.some((x) => usesTarget(x.text, t))),
    targetsMissed: targets.filter((t) => !turns.some((x) => usesTarget(x.text, t))),
    shortTurns: turns.filter((t) => t.short).length,
  };
}
