// Ticket 095: logging out must not lose work silently. Before it, the app syncs
// once; only when that fails, or something is still unsent, does it ask.
// Pure: the sync and the pending check are injected.

/**
 * Resolves true when the user must be asked before logging out. `applicable`
 * is false when nothing is synced yet anyway (the phone before its first
 * sync): no question then. `runNow()` resolves the sync summary (or null when
 * no sync ran); `hasPending()` resolves whether rows or photos are still unsent.
 */
export async function needsLogoutConfirmation({ applicable, runNow, hasPending }) {
  if (!applicable) return false;
  let result = null;
  try {
    result = await runNow();
  } catch {
    result = null;
  }
  if (!result || result.error) return true;
  return Boolean(await hasPending());
}

export function unsyncedLogoutMessage(platform) {
  const consequence =
    platform === 'web'
      ? 'Sur le web elles seront perdues'
      : 'Sur ce téléphone elles restent en place et partiront à la prochaine synchronisation, une fois reconnecté';
  return `Des modifications n'ont pas encore été envoyées au serveur. ${consequence}. Se déconnecter quand même ?`;
}
