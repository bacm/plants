// Pure helpers for where a plant photo's file lives, shared by lib/db.js
// (native, files under the app's document directory) and lib/db.web.js
// (web, data resolved through IndexedDB — see lib/webPhotoStore.js). Kept
// dependency-free so it can be imported under Jest.

const OWNED_DIR_PREFIX = 'photos/';
const DEFAULT_EXTENSION = 'jpg';
const SAFE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp']);

function extractExtension(sourceUri) {
  if (typeof sourceUri !== 'string') return DEFAULT_EXTENSION;
  const withoutQueryOrHash = sourceUri.split('?')[0].split('#')[0];
  const match = withoutQueryOrHash.match(/\.([a-zA-Z0-9]+)$/);
  if (!match) return DEFAULT_EXTENSION;
  const ext = match[1].toLowerCase();
  return SAFE_EXTENSIONS.has(ext) ? ext : DEFAULT_EXTENSION;
}

/** File name to give a photo copied into the owned `photos/` directory. */
export function photoFileName(id, sourceUri) {
  return `${id}.${extractExtension(sourceUri)}`;
}

/** Whether `ref` is a path relative to the owned photos directory. */
export function isRelativePhotoRef(ref) {
  return typeof ref === 'string' && ref.startsWith(OWNED_DIR_PREFIX) && !ref.includes('://');
}

/**
 * Resolves a stored photo reference to a URI usable as an `<Image>` source.
 * A relative ref (`photos/<name>`) is joined to `documentDirUri`. Anything
 * else — `file://`, `data:`, `http(s)://`, `idb:<id>` — is already a usable
 * reference and is returned unchanged.
 */
export function resolvePhotoUri(ref, documentDirUri) {
  if (ref == null) return ref ?? null;
  if (!isRelativePhotoRef(ref)) return ref;
  const base = documentDirUri.endsWith('/') ? documentDirUri : `${documentDirUri}/`;
  return `${base}${ref}`;
}

/**
 * Decides, for a batch of photo rows, which need to be copied into the owned
 * directory, which point at a file that no longer exists, and which are
 * already owned (or point at something this migration does not manage, such
 * as a remote or data: URL).
 *
 * `fileExists(uri)` is a sync predicate so this stays pure and testable; the
 * caller supplies the real filesystem check.
 */
export function planPhotoMigration(rows, fileExists) {
  const toCopy = [];
  const missing = [];
  const alreadyOwned = [];

  for (const row of rows) {
    const uri = row?.uri;
    if (!uri || isRelativePhotoRef(uri)) {
      alreadyOwned.push(row);
      continue;
    }
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      if (fileExists(uri)) toCopy.push(row);
      else missing.push(row);
      continue;
    }
    // http(s):, data:, idb: or anything else this migration does not own.
    alreadyOwned.push(row);
  }

  return { toCopy, missing, alreadyOwned };
}
