// Rule-based analysis of the learner's own Dutch (typed or transcribed speech).
// This is NOT an AI and not a full grammar checker: it recognises a limited set of
// well-known learner patterns. It can miss errors and can occasionally be wrong, so every
// finding is presented as "waarschijnlijk" (probable). Pronunciation is never judged here.
import { normalize, cap } from './text.js';

export const CONNECTORS = ['omdat', 'want', 'maar', 'dus', 'daarom', 'hoewel', 'terwijl', 'zodat', 'als', 'toen', 'wanneer', 'voordat', 'nadat', 'daarna', 'bovendien', 'toch', 'echter', 'daardoor', 'tenzij', 'ook al', 'aan de ene kant', 'aan de andere kant', 'ten eerste', 'ten tweede', 'ten slotte', 'bijvoorbeeld', 'namelijk', 'daarnaast', 'kortom', 'volgens mij', 'sinds', 'zodra', 'doordat', 'in plaats van', 'met andere woorden'];
const SUBORD = 'omdat|dat|als|wanneer|terwijl|hoewel|zodat|voordat|nadat|doordat|zodra|tenzij';
const PRON = 'ik|je|jij|hij|ze|zij|we|wij|jullie|u|het';
const FINITE = 'ben|bent|is|heb|hebt|heeft|ga|gaat|wil|wilt|moet|kan|kunt|mag|vind|vindt|was|had|ging|kon|wilde|moest';
const FRONTS = 'morgen|gisteren|vandaag|daarna|dan|daarom|soms|vaak|straks|misschien|eerst|later|vanavond|vanmiddag|vanochtend|volgende week|vorige week|in het weekend|vorig jaar|volgend jaar|elke dag|meestal|natuurlijk|eigenlijk|helaas|gelukkig';
const PREPS = ['in', 'op', 'bij', 'naar', 'met', 'van', 'voor', 'aan', 'uit', 'over', 'om', 'tot', 'door', 'na', 'tijdens', 'zonder', 'tegen', 'onder', 'tussen', 'sinds'];
// Common het-words: "de" + one of these is a reliable error ("de" is never a pronoun).
const HET = new Set(('huis boek kind werk probleem jaar land water weer geld idee antwoord gesprek leven ding moment nummer station ziekenhuis kantoor bedrijf gebouw examen feest eten ontbijt brood bier glas bord mes bed raam dak verhaal gevoel doel plan voorbeeld woord verschil begin einde resultaat product contract salaris team project programma systeem internet nieuws bericht formulier paspoort rijbewijs ticket restaurant café hotel museum theater park strand centrum dorp gebied artikel onderwerp onderzoek onderwijs gedrag advies besluit recht gevaar geluk gezin lichaam hoofd been oog oor hart gezicht haar seizoen weekend uur kwartier meisje jongetje beetje stukje kopje toetje cadeau pakket apparaat scherm toestel vliegtuig schip dier paard varken schaap vlees fruit ijs zout papier hout plastic licht geluid lawaai spel lied concert festival publiek standpunt argument nadeel voordeel belang klimaat milieu').split(' '));
const ZIJN_PP = 'gegaan|gekomen|geweest|gebleven|gebeurd|geworden|begonnen|gevallen|vertrokken|aangekomen|geboren|opgestaan|thuisgekomen';
// Literal translations (mostly from English) and fixed prepositions. [pattern, suggestion, skill, kind]
const PHRASES = [
  [/\bik ben (het )?(mee |er mee )?eens\b/, 'ik ben het ermee eens', 'literal'],
  [/\bik ben (niet )?akkoord\b/, 'ik ben het er (niet) mee eens', 'literal', 'style'],
  [/\b(ik|hij|ze|zij|we) (ben|is|zijn) (honger|dorst|haast|gelijk|pijn)\b/, 'hebben + honger / dorst / haast / gelijk / pijn (ik heb honger)', 'literal'],
  [/\bik ben (koud|warm)\b/, 'ik heb het koud / warm', 'literal'],
  [/\bhet maakt (geen )?zin\b/, 'dat is (niet) logisch / dat klinkt (niet) logisch', 'literal'],
  [/\bik denk zo\b/, 'ik denk het wel / ik denk van wel', 'literal'],
  [/\bin mijn opinie\b/, 'volgens mij / naar mijn mening', 'literal', 'style'],
  [/\b(wacht|wachten|wachtte|gewacht) voor\b/, 'wachten op', 'prepositions'],
  [/\b(zoek|zoekt|zoeken) voor\b/, 'zoeken naar (of zonder voorzetsel: ik zoek mijn sleutels)', 'prepositions'],
  [/\b(luister|luistert|luisteren) (muziek|radio|podcasts?)\b/, 'luisteren naar muziek', 'prepositions'],
  [/\bafhankelijk (op|aan)\b/, 'afhankelijk van', 'prepositions'],
  [/\b(geïnteresseerd|geinteresseerd) (over|aan|voor|op)\b/, 'geïnteresseerd in', 'prepositions'],
  [/\b(denk|denkt|denken) over\b/, 'denken aan (iemand/iets) · nadenken over (een vraag)', 'prepositions', 'style'],
  [/\bgetrouwd (aan|bij)\b/, 'getrouwd met', 'prepositions'],
  [/\b(trots|boos|jaloers) (van|over) (mijn|je|hem|haar|mij|jou)\b/, 'trots op · boos op · jaloers op', 'prepositions'],
  [/\bik (neem|nam) een (beslissing|besluit)\b/, 'ik neem een beslissing ✓ — maar: een foto maken, een fout maken', 'literal', 'skip'],
  [/\b(maak|maakt|maken) (een )?(huiswerk|sport)\b/, 'huiswerk doen · sporten / aan sport doen', 'literal'],
  [/\bveel van (mensen|vrienden|collega's)\b/, "veel mensen / veel vrienden (zonder ‘van’)", 'literal'],
  [/\bik heb (\d+|\w+tig|\w+tien) jaar oud\b/, 'ik ben … jaar (oud)', 'literal'],
  [/\bmeer beter\b/, 'beter', 'literal'],
  [/\bmeer (groot|klein|mooi|goedkoop|duur|makkelijk|moeilijk)\b/, 'groter, kleiner, mooier, goedkoper, duurder … (vergrotende trap met -er)', 'literal'],
];

const splitSentences = (text) => String(text || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/**
 * @returns {{words:number, sentences:number, connectors:string[], subclauses:number, past:number,
 *            issues:Array<{skill:string, kind:'error'|'style', found:string, msg:string, fix?:string}>}}
 */
export function analyze(text) {
  const issues = [];
  const add = (skill, kind, found, msg, fix) => { if (!issues.some((i) => i.found === found && i.skill === skill)) issues.push({ skill, kind, found, msg, fix }); };
  const norm = normalize(text);
  const sentences = splitSentences(text);

  for (const raw of sentences) {
    const s = normalize(raw);
    // 1. No inversion after a fronted adverbial.
    let m = s.match(new RegExp(`^(${FRONTS}) (${PRON}) (\\w+)`));
    if (m && !PREPS.includes(m[3])) {
      add('inversion', 'error', `${m[1]} ${m[2]} ${m[3]}`, `Na “${m[1]}” komt eerst het werkwoord en dan het onderwerp (inversie).`, `${cap(m[1])} ${m[3]} ${m[2]} …`);
    }
    // 2. Finite verb directly after the subject in a subordinate clause.
    const re = new RegExp(`\\b(${SUBORD}) (${PRON}) (${FINITE}) ([\\wé']+)((?: [\\wé']+)*)`, 'g');
    while ((m = re.exec(s))) {
      const [, conj, subj, verb, next, tail] = m;
      if (PREPS.includes(next) || /^(ge\w+|\w+en)$/.test(next)) continue;
      if (conj === 'dat' && m.index === 0) continue; // sentence-initial "Dat ik heb …" is too ambiguous
      const rest = (next + (tail || '')).split(/ (?:en|maar|want|dus) /)[0];
      add('subclause', 'error', `${conj} ${subj} ${verb} ${next}`, `In een bijzin (na “${conj}”) staat het werkwoord achteraan.`, `… ${conj} ${subj} ${rest} ${verb}`);
    }
    // 3. hebben with a verb that takes zijn.
    m = s.match(new RegExp(`\\b(heb|hebt|heeft|hebben)\\b[^,]*?\\b(${ZIJN_PP})\\b`));
    if (m) add('perfect', 'error', `${m[1]} … ${m[2]}`, `“${m[2]}” krijgt het hulpwerkwoord zijn, niet hebben.`, `${{ heb: 'ben', hebt: 'bent', heeft: 'is', hebben: 'zijn' }[m[1]]} … ${m[2]}`);
    // 4. de + het-word.
    const dh = /\bde (\w+)\b/g;
    while ((m = dh.exec(s))) if (HET.has(m[1])) add('dehet', 'error', `de ${m[1]}`, `“${m[1]}” is een het-woord.`, `het ${m[1]}`);
    // 5. Literal translations / fixed prepositions.
    for (const [pattern, suggestion, skill, kind] of PHRASES) {
      if (kind === 'skip') continue;
      const p = s.match(pattern);
      if (p) add(skill, kind === 'style' ? 'style' : 'error', p[0], skill === 'prepositions' ? 'Vast voorzetsel.' : 'Dit klinkt als een letterlijke vertaling.', suggestion);
    }
  }

  const wordList = norm ? norm.split(' ') : [];
  const connectors = CONNECTORS.filter((c) => new RegExp(`\\b${c}\\b`).test(norm));
  const subclauses = (norm.match(new RegExp(`\\b(${SUBORD}|die|waar|wat|omdat)\\b`, 'g')) || []).length;
  const past = (norm.match(/\b(ge\w{3,}[dt]|ge\w{3,}en|was|waren|had|hadden|ging|gingen|kwam|kwamen|vond|vonden|zag|zagen|deed|deden|kon|konden|moest|moesten|wilde|wilden|woonde|werkte|dacht|zei|kreeg|bleef|werd)\b/g) || []).length;

  // Style advice (optional improvements, never counted as errors).
  if (wordList.length >= 25 && connectors.length === 0) add('connectors', 'style', '', 'Je gebruikt geen verbindingswoorden. Probeer omdat, maar, daarom of hoewel om je ideeën te verbinden.');
  if (sentences.length >= 3 && wordList.length / sentences.length < 6) add('length', 'style', '', 'Je zinnen zijn kort. Probeer twee korte zinnen te combineren tot één langere zin.');

  return { words: wordList.length, sentences: sentences.length, connectors, subclauses, past, issues };
}

/** Keyword-group matching for branching role-plays: every group needs at least one hit. */
export function matchIntent(text, expectations) {
  const n = ` ${normalize(text)} `;
  for (const e of expectations || []) {
    const groups = e.any ? [e.any] : e.all || [];
    if (groups.length && groups.every((g) => g.some((k) => n.includes(k.includes(' ') || k.length > 4 ? normalize(k) : ` ${normalize(k)} `)))) return e;
  }
  return null;
}
