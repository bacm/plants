// Web only (ticket 095): the local store is a cache of ONE account's garden.
// Pure: the storage functions come from lib/db.web.js.
export const CACHE_OWNER_KEY = 'cache.owner';

/**
 * Makes the cache belong to `accountId`. When another account (or nobody) owns
 * it, the whole cache is emptied first and the new owner recorded. Resolves
 * true when it was emptied.
 */
export async function claimCache({ getSetting, resetLocalCache, accountId }) {
  const owner = await getSetting(CACHE_OWNER_KEY);
  if (owner === String(accountId)) return false;
  await resetLocalCache(accountId);
  return true;
}
