// Reusable learning activities: exercise runner, spaced-repetition review, listening/shadowing,
// conversation studio and conversation feedback. Each takes a root element and an onDone callback,
// so it works both inside a planned session and on its own.
import { h, append, clear, fa, icon, btn, card, pill, toast, modal, bar } from './ui.js';
import { S, save, logActivity, recordAnswer, recordPattern, markDone, saveCustomVocab } from './store.js';
import { tts, stt, recorder, STT_ERRORS } from './speech.js';
import { grade, buildDrill, vocabExercise } from './engine/exercises.js';
import { review, newCard, dueCards, status } from './engine/srs.js';
import { createConversation, summarize, MODES } from './engine/conversation.js';
import { SKILLS } from './engine/packs.js';
import { analyze } from './engine/analysis.js';
import { shuffle } from './engine/text.js';

const elapsed = (t0, capMin = 30) => Math.min((Date.now() - t0) / 1000, capMin * 60);
export const say = (text, { slow = false, pitch = 1 } = {}) => tts.speak(text, { rate: (S.settings.rate || 1) * (slow ? 0.7 : 1), pitch });
export const faHelp = (text, cls = '') => (text && S.settings.persianHelp ? fa(text, cls) : null);

export function audioBtn(text, { label = 'Luister', slow = true, pitch = 1 } = {}) {
  return h('span', { class: 'audio' },
    h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick: () => say(text, { pitch }) }, icon('play', 18)),
    slow && h('button', { class: 'icon-btn', 'aria-label': 'Langzaam afspelen', title: 'Langzaam', onclick: () => say(text, { slow: true, pitch }) }, icon('slow', 18)));
}

/** Explicit, one-time consent before the microphone is used. */
export function ensureMic() {
  if (S.settings.micConsent) return Promise.resolve(true);
  return new Promise((res) => modal((close) => [
    h('h3', {}, 'Microfoon gebruiken?'),
    h('p', {}, 'Spraakherkenning wordt geleverd door je browser (bijv. Chrome). Je stem wordt daarvoor meestal naar de spraakdienst van de browsermaker gestuurd en omgezet in tekst. Deze app slaat alleen de tekst op, op dit toestel. Opnames voor shadowing blijven in het geheugen en worden nergens bewaard of verstuurd.'),
    fa('تشخیص گفتار را مرورگر شما (مثلاً Chrome) انجام می‌دهد و صدا معمولاً برای تبدیل به متن به سرویس گفتار سازنده‌ی مرورگر فرستاده می‌شود. این برنامه فقط متن را روی همین دستگاه نگه می‌دارد. همیشه می‌توانید به‌جای صحبت، تایپ کنید.', 'block muted'),
    h('div', { class: 'row end' },
      btn('Nee, ik typ liever', () => { close(); res(false); }, 'ghost'),
      btn('Toestaan', () => { S.settings.micConsent = true; save('settings'); close(); res(true); }, 'primary')),
  ]));
}

/** Answer box: large microphone button (speech-to-text) plus an always-available text field. */
export function answerInput({ onSubmit, placeholder = 'Spreek of typ je antwoord…', submitLabel = 'Verstuur' }) {
  let session = null;
  const area = h('textarea', { class: 'answer', rows: 3, placeholder, 'aria-label': 'Je antwoord', lang: 'nl' });
  const note = h('p', { class: 'muted small', role: 'status' });
  const mic = h('button', { class: 'mic', 'aria-label': 'Start of stop opname', 'aria-pressed': 'false' }, icon('speak', 34));
  const setRec = (on) => { mic.classList.toggle('on', on); mic.setAttribute('aria-pressed', String(on)); note.textContent = on ? 'Ik luister… tik nogmaals om te stoppen.' : note.textContent; };
  const stop = async () => { if (!session) return; const s = session; session = null; setRec(false); await s.stop(); note.textContent = 'Controleer de tekst en pas hem zo nodig aan. Herkenning is niet altijd precies.'; };
  mic.onclick = async () => {
    if (session) return stop();
    if (!stt.supported) { note.textContent = 'Spraakherkenning is in deze browser niet beschikbaar. Typ je antwoord (of gebruik Chrome).'; return; }
    if (!navigator.onLine) note.textContent = 'Je bent offline: spraakherkenning werkt dan alleen als je toestel Nederlands offline ondersteunt.';
    if (!(await ensureMic())) return;
    const before = area.value.trim();
    tts.stop();
    try {
      session = stt.listen({
        onText: (t) => { area.value = (before + ' ' + t).trim(); },
        onError: (e) => { session = null; setRec(false); note.textContent = STT_ERRORS[e] || `Spraakherkenning is gestopt (${e}). Je kunt typen.`; },
      });
      setRec(true);
    } catch { note.textContent = 'De microfoon kon niet worden gestart. Typ je antwoord.'; }
  };
  const send = async () => {
    await stop();
    const text = area.value.trim();
    if (!text) { note.textContent = 'Zeg of typ eerst iets.'; return; }
    area.value = ''; note.textContent = '';
    onSubmit(text);
  };
  return h('div', { class: 'answer-box' }, h('div', { class: 'mic-row' }, mic), area, note, h('div', { class: 'row end' }, btn(submitLabel, send, 'primary')));
}

/* ====================== Exercise runner ====================== */
export function runExercises(root, exercises, { onDone, onAnswer, record = true, title = 'Oefenen' } = {}) {
  let i = 0, correct = 0;
  const t0 = Date.now(), results = [];
  const next = () => { i += 1; show(); };
  function show() {
    clear(root);
    if (i >= exercises.length) return onDone?.({ correct, total: exercises.length, sec: elapsed(t0), results });
    const ex = exercises[i];
    const fb = h('div', { class: 'feedback', role: 'status' });
    const body = h('div', { class: 'ex-body' });
    const done = (given) => {
      const g = grade(ex, given);
      const ok = g.ok || g.close;
      if (ok) correct += 1;
      results.push({ ex, ok });
      if (record) recordAnswer(ex, ok, typeof given === 'number' ? ex.options[given] : g.given, g.expected);
      onAnswer?.(ex, ok);
      body.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      const full = ex.kind === 'choice' && ex.prompt.includes('___') ? ex.prompt.replace(/_{3,}/, g.expected) : ex.kind !== 'choice' && ex.prompt.includes('___') ? ex.prompt.replace(/_{3,}/, g.expected).replace(/\s*\([^)]*\)\s*$/, '') : ex.optionsFa ? ex.sub : g.expected;
      append(clear(fb), h('div', { class: `result ${ok ? 'ok' : 'bad'}` },
        h('strong', {}, g.ok ? 'Goed!' : g.close ? 'Bijna goed — let op de spelling.' : 'Nog niet goed.'),
        !g.ok && h('p', {}, 'Goed antwoord: ', ex.optionsFa ? fa(g.expected) : h('b', { lang: 'nl' }, g.expected)),
        ex.why && h('p', { class: 'muted' }, ex.why),
        h('div', { class: 'row between' }, audioBtn(full, { slow: false }), btn(i + 1 < exercises.length ? 'Verder' : 'Klaar', next, 'primary'))));
      fb.querySelector('.btn.primary').focus();
    };
    if (ex.kind === 'choice') {
      ex.options.forEach((o, idx) => body.append(h('button', { class: 'option', onclick: (e) => { e.currentTarget.classList.add(idx === ex.answer ? 'right' : 'wrong'); if (idx !== ex.answer) body.children[ex.answer].classList.add('right'); done(idx); } }, ex.optionsFa ? fa(o) : o)));
    } else if (ex.kind === 'order') {
      const picked = [];
      const line = h('div', { class: 'build', 'aria-label': 'Jouw zin' }), bank = h('div', { class: 'bank' });
      const check = btn('Controleer', () => done(picked.map((p) => p.text)), 'primary');
      const draw = () => {
        clear(line); clear(bank);
        picked.forEach((p, k) => line.append(h('button', { class: 'chip on', onclick: () => { picked.splice(k, 1); draw(); } }, p.text)));
        ex.chunks.forEach((text, k) => { if (!picked.some((p) => p.k === k)) bank.append(h('button', { class: 'chip', onclick: () => { picked.push({ k, text }); draw(); } }, text)); });
        check.disabled = picked.length !== ex.chunks.length;
      };
      draw(); append(body, line, bank, h('div', { class: 'row end' }, check));
    } else {
      const input = h('input', { class: 'text', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'nl', 'aria-label': 'Je antwoord', placeholder: 'Typ je antwoord' });
      const go = () => { if (input.value.trim()) done(input.value); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      append(body, input, h('div', { class: 'row end' }, btn('Controleer', go, 'primary')));
      setTimeout(() => input.focus(), 50);
    }
    append(root,
      h('div', { class: 'row between' }, h('span', { class: 'muted small' }, `${title} · ${i + 1} / ${exercises.length}`), ex.skill && SKILLS[ex.skill] && pill(SKILLS[ex.skill])),
      bar(i, exercises.length, 'Voortgang'),
      h('h2', { class: 'prompt' }, ex.prompt),
      ex.sub && h('p', { class: 'sentence', lang: 'nl' }, ex.sub),
      ex.subFa && fa(ex.subFa, 'block big'),
      body, fb);
  }
  show();
}

/** Grammar drill for one lesson or skill, adapting difficulty to the learner's skill score. */
export function drillFor(skill, n = 6, lessonId) {
  const items = S.content.items.filter((it) => (lessonId ? it.lessonId === lessonId : it.skill === skill));
  const failed = Object.values(S.errors).filter((e) => !e.resolved && e.itemId).map((e) => e.itemId);
  const sc = S.skills[skill];
  const hard = !!sc && sc.n >= 4 && sc.score >= 0.7 - (S.settings.load || 0) * 0.1;
  return buildDrill(items, n, { hard, failedIds: failed });
}

/* ====================== Vocabulary review (FSRS) ====================== */
export function vocabCardView(v, { showFa = true } = {}) {
  return h('div', { class: 'vcard' },
    h('div', { class: 'row between' }, h('h2', { lang: 'nl' }, v.nl), audioBtn(v.nl)),
    showFa && fa(v.fa, 'block big'),
    v.en && h('p', { class: 'muted' }, v.en),
    h('p', { class: 'sentence', lang: 'nl' }, v.ex, ' ', audioBtn(v.ex, { slow: false })),
    v.ctx && h('p', { class: 'small' }, h('b', {}, 'Gebruik: '), v.ctx),
    (v.col || []).length > 0 && h('p', { class: 'small' }, h('b', {}, 'Combinaties: '), v.col.join(' · ')),
    (v.rel || []).length > 0 && h('p', { class: 'small' }, h('b', {}, 'Verwant: '), v.rel.join(' · ')),
    h('div', { class: 'row' }, v.cefr && pill(v.cefr), v.reg && pill(v.reg), v.topic && pill(v.topic)));
}

export function runReview(root, { reviewN = 20, newN = 0, onDone } = {}) {
  const now = Date.now();
  const due = dueCards(Object.values(S.cards), now).filter((c) => S.content.byId[c.id]).slice(0, reviewN);
  const stage = S.profile.stage || 1;
  const fresh = S.content.vocab.filter((v) => !S.cards[v.id]).sort((a, b) => Math.abs((a.stage || 1) - stage) - Math.abs((b.stage || 1) - stage)).slice(0, newN);
  const queue = [...due.map((c) => ({ id: c.id })), ...fresh.map((v) => ({ id: v.id, intro: true }))];
  const t0 = Date.now(); let reviewed = 0, learned = 0, again = 0;
  const total = queue.length;
  function show() {
    clear(root);
    if (!queue.length) {
      const sec = elapsed(t0, 20);
      if (!total) append(root, card(h('h2', {}, 'Niets te herhalen'), h('p', { class: 'muted' }, 'Er staan nu geen kaarten klaar. Kom later terug of leer nieuwe uitdrukkingen.')));
      return onDone?.({ reviewed, learned, again, sec, empty: !total });
    }
    const q = queue[0], v = S.content.byId[q.id];
    const head = h('div', { class: 'row between' }, h('span', { class: 'muted small' }, `Nog ${queue.length}`), pill(q.intro ? 'Nieuw' : q.first ? 'Net geleerd' : 'Herhaling'));
    if (q.intro) {
      say(v.nl);
      return append(root, head, card(vocabCardView(v)), h('div', { class: 'row end' },
        btn('Ken ik al', () => { applyGrade(q, v, 4, true); }, 'ghost'),
        btn('Leren', () => { queue.shift(); queue.push({ id: q.id, first: true }); show(); }, 'primary')));
    }
    const back = h('div', {});
    const reveal = () => {
      say(v.nl);
      append(clear(back), vocabCardView(v, { showFa: false }),
        h('p', { class: 'muted small' }, 'Hoe goed wist je het? Wees eerlijk — dit bepaalt wanneer de kaart terugkomt.'),
        h('div', { class: 'grades' },
          btn('Opnieuw', () => applyGrade(q, v, 1), 'g1'), btn('Moeilijk', () => applyGrade(q, v, 2), 'g2'),
          btn('Goed', () => applyGrade(q, v, 3), 'g3'), btn('Makkelijk', () => applyGrade(q, v, 4), 'g4')));
    };
    append(root, head, card(
      h('p', { class: 'muted small' }, 'Zeg het hardop in het Nederlands. Tik daarna op “Toon antwoord”.'),
      fa(v.fa, 'block big'), v.en && h('p', { class: 'muted' }, v.en), v.ctx && h('p', { class: 'small muted' }, v.ctx),
      back), h('div', { class: 'row end' }, btn('Toon antwoord', (e) => { e.currentTarget.remove(); reveal(); }, 'primary')));
  }
  function applyGrade(q, v, g, known = false) {
    const first = !S.cards[v.id];
    S.cards[v.id] = review(S.cards[v.id] || newCard(v.id), g);
    save('cards');
    logActivity('vocab', 0, v.id, { grade: g, first, known });
    queue.shift();
    if (first) learned += 1; else reviewed += 1;
    if (g === 1) { again += 1; queue.push({ id: q.id }); }
    show();
  }
  show();
}

/* ====================== Listening and shadowing ====================== */
export function runListening(root, d, { onDone, shadow = true, test = false } = {}) {
  const t0 = Date.now();
  const speakers = [...new Set(d.lines.map((l) => l.sp))];
  const pitchOf = (sp) => [1, 0.75, 1.25][speakers.indexOf(sp) % 3];
  let playing = false, step = 'listen', answers = [], showText = false, showFa = false, plays = 0;
  const playAll = async (slow) => {
    if (playing) { playing = false; tts.stop(); return render(); }
    playing = true; plays += 1; render();
    for (const l of d.lines) { if (!playing) break; await say(l.nl, { slow, pitch: pitchOf(l.sp) }); }
    playing = false; render();
  };
  const transcript = () => h('div', { class: 'transcript' }, d.lines.map((l) => h('div', { class: 'line' },
    h('div', { class: 'row between' }, h('span', { class: 'speaker' }, l.sp), h('span', { class: 'row' }, audioBtn(l.nl, { pitch: pitchOf(l.sp) }),
      h('button', { class: 'icon-btn', title: 'Bewaar als woordkaart', 'aria-label': 'Bewaar als woordkaart', onclick: () => saveFrom(l.nl) }, icon('save', 18)))),
    showText ? h('p', { lang: 'nl' }, l.nl) : h('p', { class: 'muted' }, '•••'),
    showText && showFa && l.fa && fa(l.fa, 'block muted'))));
  function finish() {
    tts.stop();
    const correct = answers.filter((a, i) => a === d.questions[i].a).length;
    const sec = elapsed(t0, 25);
    if (!test) { logActivity('listen', sec, d.id, { correct, total: d.questions.length, cefr: d.cefr, plays }); markDone(d.id); }
    onDone?.({ correct, total: d.questions.length, sec });
  }
  function render() {
    clear(root);
    append(root, h('div', { class: 'row between' }, h('h2', {}, d.title), pill(d.cefr)));
    if (!tts.supported) append(root, h('p', { class: 'warn' }, 'Dit toestel heeft geen spraaksynthese. Je kunt de tekst lezen, maar niet beluisteren.'));
    else if (!tts.voice()) append(root, h('p', { class: 'warn' }, 'Er is geen Nederlandse stem gevonden. Installeer Nederlands bij de spraakinstellingen van je toestel (zie Instellingen).'));
    if (step === 'listen') {
      append(root, card(
        h('p', {}, 'Luister eerst zonder tekst. Beantwoord daarna de vragen.'),
        h('div', { class: 'row' }, btn(playing ? 'Stop' : 'Speel af', () => playAll(false), 'primary'), btn('Langzaam', () => playAll(true), 'ghost')),
        !test && h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: showText, onchange: (e) => { showText = e.target.checked; render(); } }), ' Toon tekst'),
        !test && transcript()),
        h('div', { class: 'row end' }, btn('Naar de vragen', () => { playing = false; tts.stop(); step = 'questions'; render(); }, 'primary')));
    } else if (step === 'questions') {
      const qi = answers.length;
      if (qi >= d.questions.length) { if (test) return finish(); step = 'review'; showText = true; return render(); }
      const q = d.questions[qi];
      append(root, h('p', { class: 'muted small' }, `Vraag ${qi + 1} / ${d.questions.length}`), h('h3', { class: 'prompt' }, q.q),
        q.options.map((o, i) => h('button', { class: 'option', onclick: (e) => {
          const ok = i === q.a; e.currentTarget.classList.add(ok ? 'right' : 'wrong');
          recordAnswer({ skill: 'listening', itemId: `${d.id}-q${qi}` }, ok, o, q.options[q.a]);
          root.querySelectorAll('.option').forEach((b, k) => { b.disabled = true; if (k === q.a) b.classList.add('right'); });
          root.append(h('div', { class: 'row end' }, btn('Verder', () => { answers.push(i); render(); }, 'primary')));
        } }, o)));
    } else if (step === 'review') {
      const correct = answers.filter((a, i) => a === d.questions[i].a).length;
      const hasFa = d.lines.some((l) => l.fa);
      append(root, card(h('h3', {}, `${correct} van de ${d.questions.length} vragen goed`),
        h('p', { class: 'muted' }, 'Lees en luister nu mee met de tekst. Bewaar uitdrukkingen die je wilt onthouden.'),
        hasFa && S.settings.persianHelp && h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: showFa, onchange: (e) => { showFa = e.target.checked; render(); } }), ' Perzische vertaling ernaast'),
        transcript()),
        h('div', { class: 'row end' }, btn('Klaar', finish, 'ghost'), shadow && btn('Shadowing oefenen', () => { step = 'shadow'; render(); }, 'primary')));
    } else {
      shadowView(root, d.lines.filter((l) => l.nl.split(' ').length >= 4).slice(0, 6), pitchOf, finish);
    }
  }
  render();
}
async function saveFrom(nl) {
  const meaning = window.prompt(`Bewaar als woordkaart:
“${nl}”

Wat betekent het? (Perzisch of Engels)`, "");
  if (meaning === null) return;
  toast((await saveCustomVocab(nl, meaning, nl)) ? 'Bewaard in “Mijn eigen woorden”.' : 'Deze uitdrukking staat al in je lijst.');
}

/** Shadowing: listen, repeat immediately, record yourself and compare by ear. No automatic scoring. */
function shadowView(root, lines, pitchOf, onDone) {
  let i = 0, rec = null, url = null;
  const draw = () => {
    clear(root);
    if (i >= lines.length) return onDone();
    const l = lines[i];
    const status = h('p', { class: 'muted small', role: 'status' });
    const mine = h('div', {});
    const recBtn = btn('Neem jezelf op', async () => {
      if (rec) { url = await rec.stop(); rec = null; recBtn.textContent = 'Opnieuw opnemen'; status.textContent = 'Luister naar jezelf en vergelijk met het voorbeeld.'; append(clear(mine), h('audio', { controls: true, src: url })); return; }
      if (!recorder.supported) { status.textContent = 'Opnemen wordt op dit toestel niet ondersteund. Zeg de zin gewoon hardop na.'; return; }
      if (!(await ensureMic())) return;
      try { tts.stop(); rec = await recorder.start(); recBtn.textContent = 'Stop opname'; status.textContent = 'Opname loopt…'; }
      catch { status.textContent = 'Geen toegang tot de microfoon.'; }
    }, 'ghost');
    append(root, h('p', { class: 'muted small' }, `Shadowing · zin ${i + 1} / ${lines.length}`),
      card(h('p', { class: 'small muted' }, 'Luister, en zeg de zin direct na — zelfde tempo, zelfde melodie. Neem jezelf op en vergelijk op het gehoor. De app beoordeelt je uitspraak niet.'),
        h('p', { class: 'sentence big', lang: 'nl' }, l.nl), l.fa && faHelp(l.fa, 'block muted'),
        h('div', { class: 'row' }, btn('Voorbeeld', () => say(l.nl, { pitch: pitchOf(l.sp) }), 'primary'), btn('Langzaam', () => say(l.nl, { slow: true, pitch: pitchOf(l.sp) }), 'ghost'), recBtn),
        status, mine),
      h('div', { class: 'row end' }, btn('Stoppen', () => { i = lines.length; draw(); }, 'ghost'), btn(i + 1 < lines.length ? 'Volgende zin' : 'Klaar', () => { if (url) URL.revokeObjectURL(url); url = null; i += 1; draw(); }, 'primary')));
    say(l.nl, { pitch: pitchOf(l.sp) });
  };
  draw();
}

/* ====================== Conversation studio ====================== */
export function runConversation(root, scenario, mode, { onDone } = {}) {
  const conv = createConversation(scenario, mode), M = MODES[mode];
  const t0 = Date.now();
  let hintLevel = 0;
  const chat = h('div', { class: 'chat', 'aria-live': 'polite' });
  const dock = h('div', { class: 'dock' });
  const bubble = (who, text, hidden) => {
    const p = h('p', { lang: 'nl' }, hidden ? '•••' : text);
    const b = h('div', { class: `bubble ${who}` }, p,
      who === 'partner' && h('div', { class: 'row' }, audioBtn(text, { label: 'Opnieuw afspelen' }), hidden && btn('Toon tekst', (e) => { p.textContent = text; e.currentTarget.remove(); }, 'link')));
    chat.append(b); b.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };
  const partner = (text) => { bubble('partner', text, !M.text && tts.supported && !!tts.voice()); say(text); };
  function drawDock() {
    clear(dock);
    if (conv.state.done) {
      return append(dock, h('div', { class: 'row end' }, btn(mode === 'diagnostic' ? 'Verder' : 'Bekijk feedback', finish, 'primary')));
    }
    const n = conv.current();
    const help = h('div', { class: 'hints' });
    const showHints = () => {
      clear(help);
      if (hintLevel >= 1 && (n.hints || n.targets)) append(help, h('p', { class: 'small muted' }, n.targets ? 'Probeer te gebruiken:' : 'Handige zinnen:'), h('div', { class: 'row wrap' }, [...(n.hints || []), ...(n.targets || [])].map((x) => h('button', { class: 'chip', onclick: () => say(x.replace(/…/g, '')) }, x))));
      if (hintLevel >= 2 && n.model) append(help, h('p', { class: 'small' }, h('b', {}, 'Voorbeeld: '), h('span', { lang: 'nl' }, n.model)));
    };
    if (M.hints && mode !== 'diagnostic') hintLevel = Math.max(hintLevel, 1);
    showHints();
    append(dock, help,
      answerInput({ onSubmit: (text) => {
        bubble('me', text);
        const r = conv.reply(text);
        hintLevel = 0;
        if (r.retry) { partner(r.say); hintLevel = 1; }
        else {
          if (r.missed) chat.append(h('p', { class: 'note' }, 'De gesprekspartner herkende je antwoord niet. Het gesprek gaat verder — in de feedback zie je een voorbeeldantwoord.'));
          partner(conv.current().say);
        }
        drawDock();
      } }),
      mode !== 'diagnostic' && h('div', { class: 'row between' },
        btn(hintLevel === 0 ? 'Hint' : 'Toon voorbeeld', () => { hintLevel = Math.min(2, hintLevel + 1); conv.state.hints = (conv.state.hints || 0) + 1; showHints(); }, 'link'),
        btn('Gesprek stoppen', finish, 'link')));
  }
  function finish() {
    tts.stop();
    const sec = elapsed(t0, 40), sum = summarize(conv);
    if (mode === 'diagnostic') return onDone?.({ conv, sum, sec });
    const entry = logActivity('speak', sec, scenario.id, { mode, type: scenario.type, completed: sum.completed, words: sum.words, openTurns: sum.openTurns, avgWords: sum.avgWords, connectors: sum.connectors, fallbacks: sum.fallbacks, hints: conv.state.hints || 0 });
    if (sum.completed) markDone(scenario.id, { mode });
    sum.errors.forEach((e) => recordPattern(e, scenario.title));
    conversationFeedback(root, conv, sum, entry, onDone);
  }
  clear(root);
  append(root, h('div', { class: 'row between' }, h('h2', {}, scenario.title), pill(M.label)),
    h('p', { class: 'setting' }, scenario.setting), faHelp(scenario.settingFa, 'block muted small'),
    mode === 'challenge' && h('p', { class: 'note' }, 'Uitdaging: er gebeurt iets onverwachts. Blijf in het Nederlands en los het op.'),
    !stt.supported && h('p', { class: 'warn' }, 'Spraakherkenning werkt niet in deze browser. Zeg je antwoord hardop en typ het daarna in. In Chrome op Android kun je wel inspreken.'),
    chat, dock);
  partner(conv.current().say);
  drawDock();
}

function conversationFeedback(root, conv, sum, entry, onDone) {
  const sc = conv.scenario;
  const good = [];
  if (sum.completed) good.push('Je hebt het gesprek helemaal afgerond.');
  if (sum.keywordTurns) good.push(`${sum.understood} van de ${sum.keywordTurns} gerichte vragen werden meteen begrepen.`);
  if (sum.words) good.push(`Je hebt ${sum.words} woorden gesproken in ${sum.turns} beurten${sum.openTurns ? ` (gemiddeld ${Math.round(sum.avgWords)} per vrij antwoord)` : ''}.`);
  if (sum.connectors.length) good.push(`Verbindingswoorden gebruikt: ${sum.connectors.join(', ')}.`);
  if (sum.targetsUsed.length) good.push(`Doeluitdrukkingen gebruikt: ${sum.targetsUsed.join(' · ')}.`);
  const focus = sum.errors[0]?.skill || sum.style[0]?.skill || (sc.tags || [])[0];
  const hasDrill = focus && S.content.items.some((i) => i.skill === focus);
  const withModel = conv.state.turns.filter((t) => t.model).slice(0, 4);
  const rate = h('div', { class: 'row wrap' }, [1, 2, 3, 4, 5].map((n) => h('button', { class: 'chip', onclick: (e) => {
    rate.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on');
    S.profile.confidence = [...(S.profile.confidence || []).filter((c) => c.ts !== entry.ts), { ts: entry.ts, value: n, ref: sc.id }]; save('profile');
  } }, String(n))));
  clear(root);
  append(root, h('h2', {}, 'Feedback'),
    card(h('h3', {}, '1 · Wat goed ging'), good.length ? h('ul', {}, good.map((g) => h('li', {}, g))) : h('p', { class: 'muted' }, 'Het gesprek was te kort om iets te kunnen zeggen.')),
    card(h('h3', {}, '2 · Belangrijkste fouten'),
      sum.errors.length ? sum.errors.map((e) => h('div', { class: 'issue' },
        h('p', {}, pill(SKILLS[e.skill] || e.skill, 'bad'), ' ', e.found && h('s', { lang: 'nl' }, e.found)),
        h('p', {}, e.msg), e.fix && h('p', {}, h('b', {}, '3 · Beter: '), h('span', { lang: 'nl' }, e.fix))))
        : h('p', {}, 'De automatische controle heeft geen bekende fouttypen gevonden.'),
      h('p', { class: 'muted small' }, 'Let op: dit is een regelgebaseerde controle van een beperkt aantal bekende fouten (woordvolgorde, de/het, hebben/zijn, vaste voorzetsels, letterlijke vertalingen). Ze kan fouten missen en zegt niets over je uitspraak. Vergelijk daarom ook altijd met de voorbeeldantwoorden hieronder.')),
    card(h('h3', {}, '4 · Zo klinkt het natuurlijk'),
      withModel.length ? withModel.map((t) => h('div', { class: 'compare' },
        h('p', { class: 'muted small' }, t.partner),
        h('p', {}, h('b', {}, 'Jij: '), h('span', { lang: 'nl' }, t.text)),
        h('p', {}, h('b', {}, 'Voorbeeld: '), h('span', { lang: 'nl' }, t.model), ' ', audioBtn(t.model, { slow: false }),
          h('button', { class: 'icon-btn', title: 'Bewaar als woordkaart', 'aria-label': 'Bewaar als woordkaart', onclick: () => saveFrom(t.model) }, icon('save', 18)))))
        : h('p', { class: 'muted' }, 'Geen voorbeeldantwoorden voor dit gesprek.'),
      sum.style.length > 0 && h('div', {}, h('p', { class: 'small' }, h('b', {}, 'Optioneel (stijl, geen fout):')), h('ul', { class: 'small' }, sum.style.map((s) => h('li', {}, s.found ? `“${s.found}” → ${s.fix}` : s.msg)))),
      sum.targetsMissed.length > 0 && h('p', { class: 'small' }, h('b', {}, 'Volgende keer proberen: '), sum.targetsMissed.slice(0, 3).join(' · '))),
    card(h('h3', {}, '5 · Eén gerichte oefening'),
      hasDrill ? [h('p', {}, `Korte oefening over: ${SKILLS[focus]}.`), btn('Start oefening', () => runExercises(root, drillFor(focus, 5), { title: SKILLS[focus], onDone: (r) => { logActivity('grammar', r.sec, focus, { correct: r.correct, total: r.total }); onDone?.({ sum }); } }), 'primary')]
        : h('p', {}, sum.shortTurns ? 'Doe dit gesprek nog een keer en maak elk antwoord één zin langer met omdat, maar of daarom.' : 'Doe dit gesprek nog een keer in een moeilijkere modus, zonder hints.')),
    card(h('h3', {}, 'Hoe zeker voelde je je?'), h('p', { class: 'muted small' }, '1 = heel onzeker · 5 = heel zeker. Dit is je eigen inschatting en telt niet mee voor je niveau.'), rate),
    h('div', { class: 'row end' }, btn('Klaar', () => onDone?.({ sum }), 'primary')));
  root.scrollIntoView?.({ block: 'start' });
}

/** Short written/spoken production with rule-based feedback and a model answer. */
export function runProduction(root, task, { onDone } = {}) {
  const out = h('div', {});
  clear(root);
  append(root, card(h('h3', {}, 'Zelf een zin maken'), h('p', { class: 'prompt' }, task.prompt),
    answerInput({ submitLabel: 'Controleer', onSubmit: (text) => {
      const a = analyze(text);
      a.issues.filter((i) => i.kind === 'error').forEach((i) => recordPattern(i, 'zinsproductie'));
      append(clear(out), h('p', {}, h('b', {}, 'Jij: '), h('span', { lang: 'nl' }, text)),
        a.issues.length ? a.issues.map((i) => h('p', { class: 'issue' }, pill(SKILLS[i.skill] || i.skill, i.kind === 'error' ? 'bad' : ''), ' ', i.msg, i.fix ? ` → ${i.fix}` : '')) : h('p', { class: 'muted small' }, 'Geen bekende fouttypen gevonden (beperkte automatische controle).'),
        h('p', {}, h('b', {}, 'Voorbeeld: '), h('span', { lang: 'nl' }, task.model), ' ', audioBtn(task.model)),
        h('div', { class: 'row end' }, btn('Verder', () => onDone?.(), 'primary')));
    } }), out));
}

export { shuffle, vocabExercise, status };
