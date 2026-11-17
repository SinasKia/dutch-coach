// Optional AI extension layer — DISABLED by default and not needed for any feature.
//
// The app is fully functional without it. This file only defines the seam where a future
// provider could be plugged in (an on-device model, a self-hosted service, or an external API
// the user explicitly authorises). Rules enforced here:
//   * nothing is called unless settings.ai.enabled === true AND a provider was registered;
//   * no provider ships with the app, no API key is ever requested during setup;
//   * every hook returns null when disabled, and callers fall back to the local engine.
const providers = new Map();

/** provider: { id, label, costs: 'free-local'|'paid', reply?(ctx), feedback?(ctx) } */
export function registerProvider(provider) { providers.set(provider.id, provider); }
export const listProviders = () => [...providers.values()].map(({ id, label, costs }) => ({ id, label, costs }));

function active(settings) {
  if (!settings?.ai?.enabled) return null;
  return providers.get(settings.ai.provider) || null;
}
/** Free conversation reply. Returns null → the scripted scenario engine is used. */
export async function aiReply(settings, ctx) {
  const p = active(settings);
  try { return p?.reply ? await p.reply(ctx) : null; } catch { return null; }
}
/** Extra feedback on learner text. Returns null → rule-based analysis only. */
export async function aiFeedback(settings, ctx) {
  const p = active(settings);
  try { return p?.feedback ? await p.feedback(ctx) : null; } catch { return null; }
}
