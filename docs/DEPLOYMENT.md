# Deployment

The app is a folder of static files. Any static host works; no server code, database or environment variables.

## What to upload

Everything in `dutch-coach/` except `tests/`, `tools/`, `docs/`, `package.json` (harmless if included).

## Free hosting options

All three have free tiers that need no credit card at the time of writing; check their current terms.

**GitHub Pages**
1. Create a repository and push the contents of `dutch-coach/` to it.
2. Repository **Settings → Pages → Deploy from a branch → main / root**.
3. The app appears at `https://<user>.github.io/<repo>/`. All paths in the app are relative, so a sub-path works.

Note: on a free GitHub account, Pages requires a public repository. The lesson content would then be public; your learning data never leaves your phone either way.

**Cloudflare Pages / Netlify**
Create a project, choose "upload a folder" (or connect the repository), no build command, output directory = the folder itself.

**No hosting at all (same Wi-Fi)**
`node tools/serve.mjs` on your PC lets the phone open `http://<pc-ip>:5180`, but without HTTPS the service worker, offline mode, installation and the microphone do not work on the phone. Use this only for a quick look.

## Releasing an update

1. Change files.
2. Bump `VERSION` in `sw.js` (for code) and/or the pack `version` plus `content/index.json` (for content).
3. `npm test && npm run validate`.
4. Upload. For the live site (https://sinaskia.github.io/dutch-coach/, repository `SinasKia/dutch-coach`, Pages from `main` / root): `git add -A && git commit -m "…" && git push`. Pages redeploys within about a minute. Phones pick up the new version on the next launch while online; the app shows a notice.

## API configuration

There is none. The app makes no API calls and has no keys.

### Optional AI extension (off by default)

`js/ext/ai.js` is an isolated seam for a future provider (on-device model, self-hosted service, or an external API you explicitly choose). Nothing ships with it:

- `settings.ai.enabled` is `false`, and no provider is registered, so no hook can run.
- A provider would be registered with `registerProvider({ id, label, costs, reply, feedback })` in a separate file you add yourself.
- Hooks return `null` when disabled or on any failure, and the app falls back to the local engine.
- Never put an API key in client code on a public host: anyone can read it. A paid provider would need your own proxy, which reintroduces a backend and costs. That is why it is not built.

## Recurring costs and dependencies

| Item | Cost | Dependency |
| --- | --- | --- |
| Hosting | €0 on a free tier | The host stays available; if it disappears, re-upload elsewhere |
| Speech recognition | €0 | Chrome's built-in service (Google); may change or need internet |
| Text-to-speech | €0 | The device's Dutch voice |
| Everything else | €0 | None — runs locally |
