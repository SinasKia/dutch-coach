# Dutch Coach

A personal, offline-first Dutch learning app (PWA) that takes a learner from A2/B1 towards conversational B2. Everything runs on the device: **no account, no backend, no API keys, no paid services, no AI inference.**

## Quick start

```bash
node tools/serve.mjs
```

Open <http://localhost:5180>. There is nothing to install and no build step. To use it on your phone, host the folder on any free static host (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) and install it from Chrome ([docs/ANDROID-INSTALL.md](docs/ANDROID-INSTALL.md)).

| Command | What it does |
| --- | --- |
| `npm start` | Local server on port 5180 |
| `npm test` | 16 unit tests for the learning engine |
| `npm run validate` | Validate every lesson pack in `content/` (or pass file paths) |
| `npm run icons` | Regenerate the PNG app icons |

Requires Node 20+ for the tools only. The app itself is plain HTML, CSS and ES modules.

## What it does

- **Today** — asks how much time you have (10–60 min or custom) and builds a session: recall, grammar, listening, a conversation, and a wrap-up. Base split 40% speaking, 25% listening, 20% vocabulary, 15% grammar, shifted by due reviews, recurring errors and the week's balance. Gaps are met with a gentler session, never a penalty.
- **Speak** — turn-based voice conversations in five modes: guided, role-play, challenge (unexpected twists), free speaking, B2 discussion. 15 scenarios. Feedback after each: what worked, main errors, corrections, a natural model answer, one focused exercise.
- **Listen** — 8 original dialogues (A2–B2): listen without text, answer questions, read along (English side-by-side at A2), then shadow line by line and record yourself.
- **Vocabulary** — 79 chunks and expressions with English meaning, example, context, register and collocations. Scheduled with FSRS-4.5. Save your own from dialogues and feedback.
- **Grammar** — 16 short lessons: example → explanation → typical mistakes → practice → produce → use in a conversation.
- **Missions** — real-world tasks with phrases, rehearsal, and a follow-up after you confirm you did it.
- **Progress** — estimated level per skill (from the diagnostic only), weekly time, retention, error patterns, stage checklist, four-week checkpoints with comparison.
- **Diagnostic** — adaptive placement: 12 grammar, 8 vocabulary, 2 listening dialogues, a 3-question spoken interview and a self-assessment.

## Honest limitations

- **The conversation partner is scripted.** It matches keywords to choose the next branch, or accepts an open answer of sufficient length. It does not understand meaning. Truly open-ended conversation needs a language model, which this app deliberately does not use.
- **Feedback is rule-based.** It recognises a fixed set of learner errors (inversion, verb-final in subordinate clauses, hebben/zijn, de + het-word, fixed prepositions, some literal translations). It misses other errors and can occasionally be wrong; findings are labelled accordingly.
- **Pronunciation is never scored.** A transcript cannot measure it. Shadowing lets you compare your recording with the model by ear.
- **Levels are estimates** from a short test, not a CEFR certificate. The speaking estimate uses measurable text features plus self-rating.
- **Speech depends on the device** (below).
- **Audio is synthesised** by the phone's Dutch voice: clear, but one voice and not real conversational speed or accents. Supplement with real Dutch (radio, podcasts, people).

## Speech: what works where

| Capability | Technology | Android Chrome | Offline |
| --- | --- | --- | --- |
| Hearing Dutch | `speechSynthesis`, device voice | Yes, after installing the Dutch voice data | Yes |
| Speaking (speech → text) | Browser `SpeechRecognition` | Yes | Usually no: audio goes to the browser vendor's service |
| Recording yourself | `MediaRecorder`, in memory | Yes | Yes |

Typing is always available. Firefox has no speech recognition. Microphone use requires a one-time consent inside the app; the app itself never stores or sends audio.

## Costs

**€0.** No APIs, no subscriptions, no credit card. Free static hosting (GitHub Pages, Cloudflare Pages, Netlify) covers deployment. The only "cost" is mobile data for speech recognition and for the one-time download (well under 1 MB).

## Architecture

```
index.html, sw.js, manifest.webmanifest   app shell + offline cache
css/app.css                               light/dark, mobile-first
js/app.js, screens.js, activities.js      UI: routing, screens, activities
js/store.js                               IndexedDB + in-memory state, backup/restore
js/speech.js                              TTS, STT, recorder wrappers
js/engine/                                pure logic, unit-tested, no DOM
  srs.js           FSRS-4.5 scheduler
  exercises.js     exercise templates and grading
  analysis.js      rule-based error detection, keyword intents
  conversation.js  scenario engine and summary
  learner.js       skill model, error memory, stages, diagnostic scoring, planner
  packs.js         pack schema validation, versions, duplicates, merging
js/ext/ai.js                              optional AI seam — disabled, no provider shipped
content/*.json                            lesson packs (separate from code)
tools/                                    dev server, pack validator, icon generator
tests/                                    engine tests
```

### Local database (IndexedDB `dutch-coach`, version 1)

| Store | Key | Contents |
| --- | --- | --- |
| `kv` | string | `settings`, `profile` (stage, levels, diagnostics, confidence), `skills` (score, n per skill), `errors` (error memory), `done` (completed items), `cards` (FSRS state per vocabulary id), `hostedOrder` |
| `log` | auto-increment | activity events `{ts, kind, sec, ref, data}` — the source for all statistics |
| `packs` | pack `id` | installed lesson packs with `source` (`hosted`, `imported`, `personal`) |

Schema changes go in `onupgradeneeded` in `js/store.js` with a bumped `VERSION`. There is no server, so there is nothing to synchronise; use **Settings → Export backup** to move data between devices.

### Three update mechanisms

1. **App code** — served from the host; the service worker caches it and picks up changes on the next launch. Bump `VERSION` in `sw.js` when you change files.
2. **Hosted core packs** — `content/index.json` lists pack versions; the app downloads a pack only when its version is higher.
3. **Imported packs** — JSON files you import in Settings; stored on the device, validated, de-duplicated and used by the planner immediately.

## Adding lessons

See [docs/CONTENT-AUTHORING.md](docs/CONTENT-AUTHORING.md) for the pack format, the workflow, and a ready-made prompt for generating new packs with Claude Code. The everyday app never needs Claude Code.

## Documentation

- [docs/ANDROID-INSTALL.md](docs/ANDROID-INSTALL.md) — installing on Android, Dutch voice setup
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — free static hosting, updates, optional AI configuration
- [docs/CONTENT-AUTHORING.md](docs/CONTENT-AUTHORING.md) — lesson pack format and authoring workflow
- [docs/TESTING.md](docs/TESTING.md) — what was tested, what was not, manual test script
- [docs/ROADMAP.md](docs/ROADMAP.md) — unfinished items and the optional native Android path
