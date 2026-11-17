# Installing on Android

The app must be served over **HTTPS** to be installable (or from `localhost` on the same device). Host it first — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Install

1. Open the app's URL in **Chrome** on your phone.
2. Wait a few seconds on first load so everything is cached for offline use.
3. Tap **⋮ → Add to Home screen → Install** (Chrome may also show an "Install app" banner).
4. Open **Dutch Coach** from the home screen. It runs full-screen like a native app.

Your progress lives in Chrome's storage for that site. Uninstalling the app or clearing Chrome's site data deletes it, so use **Settings → Export backup** now and then.

## Dutch voice (needed for listening, works offline)

1. Android **Settings → System → Languages & input → Text-to-speech output** (on Samsung: **General management → Text-to-speech**).
2. Preferred engine: **Speech Services by Google** → ⚙ → **Install voice data** → **Nederlands (Nederland)** → download.
3. In the app: **Meer → Instellingen → Test de stem**.

If the voice list in the app says "geen Nederlandse stem gevonden", the voice data is not installed yet.

## Speaking (speech recognition)

- Works in Chrome. The first time, the app asks for consent, then Chrome asks for microphone permission.
- Recognition normally needs an internet connection, because Chrome sends the audio to Google's speech service. Some phones support offline Dutch recognition if the language is downloaded under **Google app → Settings → Voice → Offline speech recognition**; this is not guaranteed.
- If recognition fails, type your answer. Say it aloud first — that is still speaking practice.
- Tap the microphone once to start and once to stop. You can correct the recognised text before sending.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No "Install" option | Use Chrome, make sure the URL starts with `https://`, reload once |
| No sound | Install the Dutch voice data; check media volume |
| Microphone blocked | Chrome → site settings (lock icon) → Microphone → Allow |
| Old version after an update | Close the app completely and open it again |
| Progress gone | Site data was cleared; restore a backup in Settings |
