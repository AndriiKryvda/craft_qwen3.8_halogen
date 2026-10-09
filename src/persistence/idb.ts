/** Tiny IndexedDB wrapper with an in-memory fallback. */

const DB_NAME = 'craft-save';
const STORE = 'world';
const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
export let storageAvailable = true;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      storageAvailable = false;
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        storageAvailable = false;
        resolve(null);
      };
    } catch {
      storageAvailable = false;
      resolve(null);
    }
  });
  return dbPromise;
}

export async function putValue(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.set(key, JSON.parse(JSON.stringify(value)));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getValue<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return (memory.get(key) as T) ?? null;
  const out = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  return out;
}

export async function deleteValue(key: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.delete(key);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
