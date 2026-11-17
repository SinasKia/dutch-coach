# Status and roadmap

## Done

Everything listed in the README is implemented and wired to real logic and stored data; there are no mock screens.

## Known gaps

- **Content volume.** 79 expressions, 16 grammar lessons, 8 dialogues and 15 scenarios are a solid start, not a full A2→B2 course. Stages 4–5 are the thinnest (two discussions, two B2 dialogues). Plan on adding packs regularly — see `CONTENT-AUTHORING.md`.
- **Linguistic review.** The content was written carefully and passes the automated checks, but it has not been reviewed by a Dutch teacher. Report anything that sounds off and fix it in the pack.
- **Real-device speech testing** — see `TESTING.md`.
- **Conversation depth.** Scripted branching cannot react to what you actually say. This is a deliberate consequence of the no-AI requirement.
- **Error detection coverage** is narrow by design to avoid false alarms.
- **Audio variety.** One synthetic voice; no real recordings at natural speed.
- **Saving words** uses a simple prompt dialog and stores the whole sentence.
- **Content status after a failed update check** can read "actueel" when the pack index came from the offline cache.
- **No cross-device sync.** Use export/import.

## Next steps worth doing

1. More packs for stages 3–5: discussions, longer dialogues, work and study topics.
2. Listening packs with real, self-recorded or licensed audio files (the dialogue format would gain an optional `audio` URL per line; the service worker already caches same-origin files).
3. More error patterns as your own recurring mistakes become visible in the error memory.
4. Timed speaking tasks (60–120 s monologues with a countdown) for stage 5.
5. Reminder notifications on study days.

## Optional native Android path

Only worth it if the PWA limits become a real problem.

| Step | Gain | Cost |
| --- | --- | --- |
| **Trusted Web Activity** (Bubblewrap) | A real APK wrapping the same hosted PWA; sideload it or publish it | Needs the hosted HTTPS site plus a Digital Asset Links file; Play Store publishing has a one-time developer fee |
| **Capacitor wrapper** | Access to native plugins while keeping this codebase | Android Studio build, plugin maintenance |
| Native `SpeechRecognizer` with on-device Dutch (`EXTRA_PREFER_OFFLINE`) | Offline speech recognition where the phone supports it, better control over pauses | Device-dependent; not guaranteed for Dutch |
| Native TTS voice selection | Choose between installed Dutch voices | Small |
| Local notifications | Study reminders | Small |
| On-device speech model (e.g. Whisper tiny/base via a native runtime) | Fully offline recognition | Model download of roughly 75–150 MB, slower on older phones; needs your explicit go-ahead |
| On-device LLM for open conversation | The one thing scripts cannot do | Multi-GB models, high-end phone, slow responses; plug in through `js/ext/ai.js` |

None of these are required, and none introduce a paid service.
