# Authoring lesson packs

New lessons are JSON "packs". Adding one never requires changing app code.

## Workflow

1. Write (or generate) `my-pack.json`.
2. `node tools/validate-pack.mjs my-pack.json` — must print `✓` with no `FOUT` lines.
3. Either
   - **import on the phone**: copy the file to the phone → app → **Meer → Instellingen → Importeer lespakket**, or
   - **ship with the app**: put it in `content/`, add it to `content/index.json`, upload.
4. To update a pack, raise its `version`. Same version = "already installed"; lower = warned downgrade.

The validator and the in-app importer share the same code (`js/engine/packs.js`). They check required fields, CEFR and stage values, unique ids, answer indexes, that every generated exercise variant has a consistent answer, and that every scenario can reach an end. Items whose id (or, for vocabulary, whose Dutch text) already exists in another pack are skipped and reported.

**The validator cannot check that the Dutch is correct.** Review generated content before relying on it, especially generator items (`invert`, `sub`, `perf`, `sep`).

## Pack format

```json
{
  "format": "dutch-coach-pack", "formatVersion": 1,
  "id": "werk-b1", "version": "1.0.0", "title": "Werk en overleg (B1)", "description": "optional",
  "vocab": [], "grammar": [], "dialogues": [], "scenarios": [], "missions": []
}
```

Every section is optional, but a pack needs at least one item. `cefr` is `A1`–`C1`; `stage` is 1–5 (see the learning plan). Ids must be unique across all packs — prefix them (`v-`, `g-`, `d-`, `s-`, `m-`).

### vocab

```json
{"id":"v-de-deadline","nl":"de deadline halen","fa":"به ضرب‌الاجل رسیدن","en":"to meet the deadline",
 "cefr":"B1","stage":3,"topic":"werk","reg":"neutraal",
 "ex":"We halen de deadline alleen als iedereen meehelpt.",
 "ctx":"Op het werk.","col":["de deadline missen"],"rel":["op tijd af zijn"],"alt":["deadline halen"]}
```
Required: `id`, `nl`, `fa`, `ex`, `cefr`. `alt` lists other accepted answers for typed recall. Teach chunks, not isolated words.

### grammar

```json
{"id":"g-x","title":"…","cefr":"B1","stage":2,"skill":"subclause",
 "example":"…","explain":"short Dutch explanation","explainFa":"optional Persian",
 "mistakes":[{"wrong":"…","right":"…","why":"…"}],
 "items":[ … at least 3 … ],
 "produce":[{"prompt":"…","model":"…"}]}
```
`skill` must be one of: `dehet, mainorder, inversion, subclause, conjugation, perfect, past, separable, modal, prepositions, connectors, omte, er, relative, passive, conditional`. The skill links the lesson to the error memory and the planner.

Item types:

| `t` | Fields | Result |
| --- | --- | --- |
| `choice` | `q`, `options[]`, `a` (index), `why?` | multiple choice |
| `fill` | `q` with `___`, `a[]` (accepted answers) | typed gap |
| `order` | `chunks[]` in correct order, `alt?[][]` other valid orders | build the sentence |
| `invert` | `s`, `v`, `rest`, `fronts[]` | "Begin met Morgen": *Ik ga morgen naar de markt* → *Morgen ga ik naar de markt* |
| `sub` | `main`, `s`, `v`, `mid`, `conj[]` | join two sentences: *… omdat ik ziek ben* |
| `perf` | `s`, `aux`, `pp`, `inf`, `rest` | perfect tense: *Ik heb gisteren thuis gewerkt* |
| `sep` | `s`, `v`, `prefix`, `inf`, `rest` | separable verb: *Ik bel mijn moeder op* |

Rules that keep generated sentences grammatical:
- `invert`: list only `fronts` that fit the tense and meaning of that sentence. Do not use `jij/je` as subject (the -t drops under inversion).
- `sub`: list only subordinating conjunctions that make sense. Use a single finite verb in `v` (no modal + infinitive), because the template places `v` last.
- `order`: the first chunk starts with a capital so the start is unambiguous; add `alt` for other correct orders.

### dialogues

```json
{"id":"d-x","title":"…","cefr":"B1","stage":2,"topic":"…",
 "lines":[{"sp":"Anna","nl":"…","fa":"optional"}],
 "questions":[{"q":"…","options":["…","…","…"],"a":0}]}
```
Write original text. Do not copy news articles, podcasts or media transcripts.

### scenarios

```json
{"id":"s-x","title":"…","type":"roleplay","cefr":"B1","stage":2,"tags":["subclause"],
 "setting":"…","settingFa":"optional","start":"start",
 "nodes":{
   "start":{"say":"partner line","hints":["…"],"model":"a natural answer",
            "expect":[{"any":["ja","graag"],"next":"n2"},{"any":["nee"],"next":"n3"}],
            "fallback":"simpler rephrasing","next":"n2"},
   "n2":{"say":"open question","open":true,"minWords":10,"targets":["Volgens mij …"],"model":"…","next":"n3",
         "twist":{"say":"unexpected version used in challenge mode"}},
   "n3":{"say":"closing line","end":true}}}
```
- `type`: `roleplay` (guided / role-play / challenge), `free`, or `discussion`.
- `expect`: keyword groups. `any` = one keyword is enough; `all` = a list of groups that must each match. Keywords of four letters or fewer match whole words only. Always give `next` as the fallback route.
- The `model` answer of a keyword node must itself contain a keyword (the tests check this for bundled packs).
- `open` nodes accept any answer; below 60% of `minWords` the partner asks once for more.
- `tags` are skills; they connect the scenario to grammar lessons and weak points.

### missions

```json
{"id":"m-x","title":"…","cefr":"B1","stage":2,"scenario":"s-x",
 "goal":"…","goalFa":"optional","phrases":[{"nl":"…","fa":"…"}],"responses":["what you may hear back"]}
```

## Generating a pack with Claude Code

Open this folder in Claude Code and use a prompt like:

> Read `docs/CONTENT-AUTHORING.md` and two existing packs in `content/` for style. Create `content-drafts/<id>.json`: a dutch-coach-pack about **<topic>** at **<CEFR level>**, stage **<n>**, with **<e.g. 20 vocab chunks, 1 grammar lesson on <skill>, 2 dialogues, 2 scenarios, 1 mission>**. Netherlands Dutch, natural spoken register, original text only. Persian (`fa`) for vocabulary and A2 lines. Do not reuse ids or expressions that already exist in `content/`. Run `node tools/validate-pack.mjs` on the file and fix every error. Then list the items you are least sure about linguistically so I can review them.

Then review, and import the file in the app.

## Writing by hand

Copy a small pack, change the ids, edit, validate. A pack with only `vocab` is the quickest way to add your own expressions; inside the app, the save icon next to a dialogue line or model answer does the same for a single expression.
