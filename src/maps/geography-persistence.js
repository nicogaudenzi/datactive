import {validateGeographyConfiguration} from './map-data-contract.js';
import {getPersistentValue, setPersistentValue} from '../storage/indexeddb.js';

export const GEOGRAPHY_STORAGE_PREFIX = 'dashboard-builder.geography.v1:';
const cache = new Map();
let persistenceQueue = Promise.resolve();
let persistenceError = null;

export function geographyStorageKey(sourceIdentity, datasetColumns = []) {
  return `${GEOGRAPHY_STORAGE_PREFIX}${encodeURIComponent(String(sourceIdentity ?? 'sample'))}:${datasetColumns.join('|')}`;
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Load one source-scoped geography record and migrate its old localStorage value. */
export async function initializeGeographyConfiguration(key, datasetColumns = null) {
  try {
    const stored = await getPersistentValue(key);
    if (stored != null) {
      const validated = validateGeographyConfiguration(stored, datasetColumns);
      cache.set(key, validated);
      return validated;
    }
  } catch (error) { console.warn('IndexedDB geography storage is unavailable:', error); }

  const legacyStorage = defaultStorage();
  let raw = null;
  try { raw = legacyStorage?.getItem(key) ?? null; } catch { /* blocked */ }
  if (raw != null) {
    try {
      const migrated = validateGeographyConfiguration(JSON.parse(raw), datasetColumns);
      cache.set(key, migrated);
      try {
        await setPersistentValue(key, migrated);
        try { legacyStorage?.removeItem(key); } catch { /* cleanup is best-effort */ }
      } catch (error) { console.warn('Could not migrate geography configuration to IndexedDB:', error); }
      return migrated;
    } catch {
      try { legacyStorage?.removeItem(key); } catch { /* read-only storage */ }
    }
  }
  const empty = validateGeographyConfiguration(null, datasetColumns);
  cache.set(key, empty);
  return empty;
}

/** Save validated mappings to the in-memory view immediately and IndexedDB asynchronously. */
export function saveGeographyConfiguration(key, configuration, datasetColumns = null, storage = undefined) {
  try {
    const validated = validateGeographyConfiguration(configuration, datasetColumns);
    if (storage !== undefined) {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(validated));
    } else {
      cache.set(key, validated);
      if (!globalThis.indexedDB) return false;
      persistenceError = null;
      persistenceQueue = persistenceQueue.then(() => setPersistentValue(key, validated));
      persistenceQueue = persistenceQueue.catch(error => { persistenceError = error; console.warn('Could not persist geography configuration in IndexedDB:', error); });
    }
    return true;
  } catch { return false; }
}

/** Synchronous read from the initialized cache; inject storage for legacy unit tests. */
export function loadGeographyConfiguration(key, datasetColumns = null, storage = undefined) {
  const empty = validateGeographyConfiguration(null);
  if (storage !== undefined) {
    if (!storage) return empty;
    let raw;
    try { raw = storage.getItem(key); } catch { return empty; }
    if (raw == null) return empty;
    try { return validateGeographyConfiguration(JSON.parse(raw), datasetColumns); }
    catch {
      try { storage.removeItem(key); } catch { /* storage may be read-only */ }
      return empty;
    }
  }
  try { return validateGeographyConfiguration(cache.get(key) ?? empty, datasetColumns); }
  catch { return empty; }
}

export async function flushGeographyPersistence() { await persistenceQueue; if (persistenceError) { const error = persistenceError; persistenceError = null; throw error; } }
