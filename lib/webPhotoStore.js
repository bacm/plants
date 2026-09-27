// Web photo storage: keeps photo data out of localStorage (whose ~5MB quota
// a handful of photos exhausts — ticket 043) by putting it in IndexedDB
// instead. `lib/db.web.js` keeps only a small reference (`idb:<id>`) in the
// localStorage row.
//
// The IndexedDB access itself sits behind a tiny `adapter` interface
// (`get`/`set`/`delete` by key) so the store logic can be unit-tested with an
// in-memory adapter — jsdom/Jest has no real IndexedDB and this project adds
// no new dependency to fake one.

const IDB_REF_PREFIX = 'idb:';

/** Whether `ref` is a reference into this store. */
export function isIdbRef(ref) {
  return typeof ref === 'string' && ref.startsWith(IDB_REF_PREFIX);
}

function idOf(ref) {
  return ref.slice(IDB_REF_PREFIX.length);
}

function toRef(id) {
  return `${IDB_REF_PREFIX}${id}`;
}

/** A real IndexedDB-backed adapter: `get`/`set`/`delete` a value by key. */
export function createIndexedDbAdapter({
  dbName = 'garden_photos',
  storeName = 'photos',
  version = 1,
} = {}) {
  let connectionPromise = null;

  function openConnection() {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this browser.'));
    }
    if (!connectionPromise) {
      connectionPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return connectionPromise;
  }

  function runTransaction(mode, run) {
    return openConnection().then(
      (connection) =>
        new Promise((resolve, reject) => {
          const tx = connection.transaction(storeName, mode);
          const store = tx.objectStore(storeName);
          let result;
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          result = run(store);
        })
    );
  }

  return {
    get(key) {
      return openConnection().then(
        (connection) =>
          new Promise((resolve, reject) => {
            const tx = connection.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
          })
      );
    },
    set(key, value) {
      return runTransaction('readwrite', (store) => {
        store.put(value, key);
      });
    },
    delete(key) {
      return runTransaction('readwrite', (store) => {
        store.delete(key);
      });
    },
  };
}

/** A `Map`-backed adapter for tests: no IndexedDB semantics, just storage. */
export function createInMemoryAdapter() {
  const map = new Map();
  return {
    get: (key) => Promise.resolve(map.has(key) ? map.get(key) : null),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

/**
 * Builds the photo store used by lib/db.web.js: `storePhoto` saves data and
 * returns the reference to keep on the row; `loadPhoto` resolves a reference
 * back to data (or passes through anything that isn't one of its refs);
 * `deletePhoto` removes the stored data for a reference.
 */
export function createPhotoStore(adapter) {
  return {
    async storePhoto(id, data) {
      await adapter.set(id, data);
      return toRef(id);
    },
    async loadPhoto(ref) {
      if (!isIdbRef(ref)) return ref;
      const data = await adapter.get(idOf(ref));
      return data ?? ref;
    },
    async deletePhoto(ref) {
      if (!isIdbRef(ref)) return;
      await adapter.delete(idOf(ref));
    },
  };
}
