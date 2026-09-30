// Web only (ticket 095): photos that live on the server. A photo pulled by the
// sync has no bytes in this browser; its row holds `remote:<id>`. On first
// display the image is fetched from GET /photos/{id} with the session cookie
// and shown from a blob: URL, kept in memory for the life of the page (the
// server's CSP allows blob: images). No persistent storage here, so this is
// not lib/db.* business. A missing photo or an unreachable server resolves to
// the ref itself, which fails to load like any other lost photo and shows the
// same placeholder; failures are not cached, so the next display retries.
import { apiUrl } from './apiUrl';

const PREFIX = 'remote:';

export function remoteRef(id) {
  return `${PREFIX}${id}`;
}

export function isRemoteRef(ref) {
  return typeof ref === 'string' && ref.startsWith(PREFIX);
}

const urls = new Map(); // photo id -> blob: URL
const pending = new Map(); // photo id -> Promise<blob URL | null>
let epoch = 0; // bumped on revoke: a fetch that finishes after it is discarded

async function fetchBlobUrl(id) {
  const url = apiUrl(`/photos/${encodeURIComponent(id)}`);
  if (!url) return null;
  const startedIn = epoch;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blobUrl = URL.createObjectURL(await res.blob());
    if (startedIn !== epoch) {
      URL.revokeObjectURL(blobUrl);
      return null;
    }
    urls.set(id, blobUrl);
    return blobUrl;
  } catch {
    return null;
  }
}

/** A displayable URL for `ref`: the blob: URL, or `ref` itself when unavailable. */
export async function resolveRemotePhoto(ref) {
  if (!isRemoteRef(ref)) return ref;
  const id = ref.slice(PREFIX.length);
  if (urls.has(id)) return urls.get(id);
  if (!pending.has(id)) {
    pending.set(
      id,
      fetchBlobUrl(id).finally(() => pending.delete(id))
    );
  }
  return (await pending.get(id)) ?? ref;
}

export function forgetRemotePhoto(id) {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

/** Sign-out: free every blob URL. */
export function revokeRemotePhotos() {
  epoch++;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  pending.clear();
}
