# Testing

## Automated

```bash
npm test          # 16 tests, Node built-in runner
npm run validate  # all packs in content/
```

The tests cover the engine (`js/engine/`):

- tolerant answer matching (typos accepted, wrong verb forms not)
- FSRS scheduling: growing intervals, lapses, status, due ordering
- every bundled pack validates; no duplicates between packs
- all 144 grammar items × all variants (300+ exercises) grade correct with their own answer
- generator templates produce the expected Dutch word order
- error detection: finds the target errors, and does **not** flag a list of correct sentences
- every model answer, example sentence and dialogue line in the bundled content passes the error checker (guards against false positives)
- pack import: new / upgrade / same / invalid, duplicate detection, unreachable scenario endings rejected
- skill model, error memory resolution, level estimation, stage criteria
- planner: sessions fit 10–60 minutes, always contain speaking, follow recurring errors, greet a gap without penalty
- conversation engine: branching, fallback, challenge twists; every scenario completes in every mode, and model answers are understood by the scripted partner

## Tested in a browser (desktop Chromium, 375 px viewport)

| Journey | Result |
| --- | --- |
| First launch → onboarding → skip diagnostic → Today | works |
| Choose 30 min → plan → full session (6 new cards, 8 grammar items, listening questions, 4-turn conversation, feedback, wrap-up) | works |
| Feedback detects seeded errors ("omdat ik ben ziek", "Morgen ik heb") and stores them in the error memory | works |
| Reload → progress, cards, error memory still there | works |
| Full diagnostic (12 + 8 + 6 questions, interview, self-rating, report) | works |
| All 14 screens render without errors; no horizontal overflow at 375 px | works |
| Pack import logic: install, duplicate report, same-version detection, invalid pack rejected, removal | works (called directly; the file picker itself was not driven) |
| Service worker precaches all 27 files; with the server stopped the app reloads and shows saved data | works |
| Dutch voice detected, speech recognition and recorder APIs present | detected on Windows Chromium |

## Not tested — please check on your phone

- Installation on a real Android device and behaviour as an installed app.
- Speech recognition quality and the start/stop/restart logic on Android Chrome. This is the part most likely to need adjustment.
- Dutch voice quality and the hide-text-until-asked flow with real audio.
- Recording and playback in shadowing on Android.
- The file picker for pack import and backup restore on Android.
- Dark mode appearance (implemented, not visually reviewed).
- Long-term behaviour: weeks of scheduling, stage advancement over time.

## Manual test script (10 minutes, on the phone)

1. Open the URL, wait, install to home screen, open from the icon.
2. Complete onboarding; run the diagnostic or skip it.
3. Settings → **Test de stem**. No sound → install the Dutch voice.
4. Today → 15 min → Start. In the conversation, tap the microphone, speak, tap again, check the text, send.
5. Listen → a dialogue → play, answer, shadow one line with recording.
6. Turn on airplane mode. Reopen the app: Today, vocabulary review and grammar must work; the offline badge shows.
7. Settings → Export backup → file appears in Downloads.
