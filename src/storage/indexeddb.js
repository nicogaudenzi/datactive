/** Small versioned IndexedDB key/value layer for persistent app-owned records. */
export const DATACTIVE_DB_NAME = 'datactive-storage';
export const DATACTIVE_DB_VERSION = 1;
export const DATACTIVE_STORE = 'records';

let databasePromise = null;

export function openDatactiveDatabase(indexedDBApi = globalThis.indexedDB) {
  if (!indexedDBApi) return Promise.reject(new Error('IndexedDB is unavailable in this browser context.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    let request;
    try { request = indexedDBApi.open(DATACTIVE_DB_NAME, DATACTIVE_DB_VERSION); }
    catch (error) { databasePromise = null; reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATACTIVE_STORE)) db.createObjectStore(DATACTIVE_STORE, {keyPath: 'key'});
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => { databasePromise = null; reject(request.error ?? new Error('Could not open IndexedDB.')); };
    request.onblocked = () => { databasePromise = null; reject(new Error('IndexedDB upgrade is blocked by another open tab.')); };
  });
  return databasePromise;
}

export async function getPersistentValue(key) {
  const db = await openDatactiveDatabase();
  return runRequest(db, 'readonly', store => store.get(String(key))).then(record => record?.value ?? null);
}

export async function setPersistentValue(key, value) {
  const db = await openDatactiveDatabase();
  await runRequest(db, 'readwrite', store => store.put({key: String(key), value}));
  return true;
}

export async function deletePersistentValue(key) {
  const db = await openDatactiveDatabase();
  await runRequest(db, 'readwrite', store => store.delete(String(key)));
  return true;
}

export async function listPersistentValues(prefix = '') {
  const db = await openDatactiveDatabase();
  const records = await runRequest(db, 'readonly', store => store.getAll());
  return records.filter(record => record.key.startsWith(prefix)).map(({key, value}) => ({key, value}));
}

function runRequest(db, mode, makeRequest) {
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let requestFailed = false;
    try {
      transaction = db.transaction(DATACTIVE_STORE, mode);
      const request = makeRequest(transaction.objectStore(DATACTIVE_STORE));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => {
        requestFailed = true;
        reject(request.error ?? new Error('IndexedDB request failed.'));
      };
      transaction.oncomplete = () => { if (!requestFailed) resolve(result); };
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    } catch (error) { reject(error); }
  });
}

/** Wait for IndexedDB's quota estimate where supported; never assumes a fixed quota. */
export async function estimatePersistentStorage() {
  if (!globalThis.navigator?.storage?.estimate) return null;
  try { return await globalThis.navigator.storage.estimate(); } catch { return null; }
}

export async function requestPersistentStorage() {
  if (!globalThis.navigator?.storage?.persist) return false;
  try { return await globalThis.navigator.storage.persist(); } catch { return false; }
}

/** Test-only hook to isolate independent fake IndexedDB instances. */
export function resetDatabaseConnectionForTests() { databasePromise = null; }
