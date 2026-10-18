import {BUILT_IN_MAPS, getBuiltInMap} from './builtin-maps.js';
import {validateMapDefinition} from './map-data-contract.js';
import {createCustomMapCollection, createCustomMapRecord, validateCustomMapCollection} from './custom-map-document.js';
import {getPersistentValue, setPersistentValue} from '../storage/indexeddb.js';

export const CUSTOM_MAP_STORAGE_KEY = 'datactive.custom-maps.v1';

const customMaps = new Map();
let persistenceQueue = Promise.resolve();
let initializingStorage = false;
let persistenceError = null;

export function getMapDefinition(mapId) { return getBuiltInMap(mapId) ?? customMaps.get(mapId)?.definition ?? null; }
export function getMapGeometry(mapId) { return customMaps.get(mapId)?.geojson ?? null; }
export function getAllMaps() { return [...BUILT_IN_MAPS, ...[...customMaps.values()].map(entry => entry.definition)]; }
export function getCustomMapDetails(mapId) {
  const entry = customMaps.get(mapId);
  return entry ? {definition: entry.definition, sourceGeoJSON: entry.sourceGeoJSON, idProperty: entry.idProperty, labelProperty: entry.labelProperty, aliasesByRegion: entry.aliasesByRegion ?? {}} : null;
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function findDuplicateCustomMap(geojson) {
  const signature = stableStringify(geojson);
  for (const entry of customMaps.values()) if (stableStringify(entry.sourceGeoJSON) === signature) return entry.definition;
  return null;
}
export function removeCustomMap(mapId) {
  const removed = customMaps.delete(mapId);
  if (removed) saveCustomMaps();
  return removed;
}

/** Return a validated, JSON-safe collection of all custom maps in the catalog. */
export function serializeCustomMaps() {
  return createCustomMapCollection([...customMaps.keys()].map(mapId => createCustomMapRecord(getCustomMapDetails(mapId))));
}

/** Replace the custom catalog from a portable collection, preserving every stable ID. */
export function restoreCustomMapCollection(collection) {
  const validated = validateCustomMapCollection(collection);
  const next = new Map();
  for (const record of validated.maps) {
    if (getBuiltInMap(record.id)) throw new TypeError(`Custom map ID "${record.id}" conflicts with a built-in map.`);
    const built = buildDefinition({name: record.name, geojson: record.sourceGeoJSON, idProperty: record.idProperty, labelProperty: record.labelProperty, mapId: record.id, aliasesByRegion: record.aliasesByRegion});
    // Check collisions before committing, so restoration is atomic.
    const signature = stableStringify(record.sourceGeoJSON);
    for (const existing of next.values()) {
      if (stableStringify(existing.sourceGeoJSON) === signature) throw new TypeError(`Duplicate custom map geometry in collection: "${record.name}".`);
    }
    next.set(record.id, {...built, sourceGeoJSON: JSON.parse(JSON.stringify(record.sourceGeoJSON)), idProperty: record.idProperty, labelProperty: record.labelProperty, aliasesByRegion: JSON.parse(JSON.stringify(record.aliasesByRegion))});
  }
  customMaps.clear();
  for (const [id, entry] of next) customMaps.set(id, entry);
  saveCustomMaps();
  return getAllMaps();
}

/** Persist the current custom-map collection. Storage can be injected for tests. */
/** Save to an injected synchronous adapter for tests/legacy migration, or queue an IndexedDB write. */
export function saveCustomMaps(storage = null) {
  let serialized;
  try { serialized = serializeCustomMaps(); } catch { return false; }
  if (storage) {
    try { storage.setItem(CUSTOM_MAP_STORAGE_KEY, JSON.stringify(serialized)); return true; }
    catch { return false; }
  }
  if (initializingStorage) return true;
  if (!globalThis.indexedDB) { persistenceError = new Error('IndexedDB is unavailable; custom maps cannot be saved across reloads.'); return false; }
  persistenceError = null;
  persistenceQueue = persistenceQueue.then(() => setPersistentValue(CUSTOM_MAP_STORAGE_KEY, serialized));
  persistenceQueue = persistenceQueue.catch(error => { persistenceError = error; console.warn('Could not persist custom maps in IndexedDB:', error); });
  return true;
}

/** Legacy synchronous adapter loader, retained for unit tests and migration tooling. */
export function loadCustomMaps(storage) {
  if (!storage) return false;
  let raw;
  try { raw = storage.getItem(CUSTOM_MAP_STORAGE_KEY); } catch { return false; }
  if (!raw) return false;
  try { initializingStorage = true; restoreCustomMapCollection(JSON.parse(raw)); return true; }
  catch { return false; }
  finally { initializingStorage = false; }
}

/** Hydrate the catalog from IndexedDB; migrate the former localStorage payload once. */
export async function initializeCustomMapStorage() {
  initializingStorage = true;
  try {
    let collection = null;
    try { collection = await getPersistentValue(CUSTOM_MAP_STORAGE_KEY); } catch (error) {
      console.warn('IndexedDB custom-map storage is unavailable:', error);
    }
    if (collection != null) {
      restoreCustomMapCollection(collection);
      return 'indexeddb';
    }
    let legacyRaw = null;
    try { legacyRaw = globalThis.localStorage?.getItem(CUSTOM_MAP_STORAGE_KEY) ?? null; } catch { /* browser storage may be blocked */ }
    if (legacyRaw) {
      const legacyCollection = JSON.parse(legacyRaw);
      restoreCustomMapCollection(legacyCollection);
      await setPersistentValue(CUSTOM_MAP_STORAGE_KEY, serializeCustomMaps());
      try { globalThis.localStorage?.removeItem(CUSTOM_MAP_STORAGE_KEY); } catch { /* migration succeeded; cleanup is best-effort */ }
      return 'migrated';
    }
    return 'empty';
  } catch (error) {
    console.warn('Saved custom maps could not be restored; keeping the active catalog:', error);
    return 'unavailable';
  } finally { initializingStorage = false; }
}

export async function flushCustomMapPersistence() { await persistenceQueue; if (persistenceError) { const error = persistenceError; persistenceError = null; throw error; } }


function buildDefinition({name, geojson, idProperty, labelProperty, mapId, aliasesByRegion = {}}) {
  const normalized = [];
  const ids = new Set();
  for (const [index, feature] of geojson.features.entries()) {
    const rawId = feature.properties?.[idProperty];
    if (rawId === null || rawId === undefined || String(rawId).trim() === '') throw new TypeError(`Feature ${index + 1} is missing its selected ID property.`);
    const id = String(rawId).trim();
    if (ids.has(id)) throw new TypeError(`Duplicate region ID "${id}". Choose a unique ID property.`);
    ids.add(id);
    const rawLabel = feature.properties?.[labelProperty];
    const label = rawLabel === null || rawLabel === undefined || String(rawLabel).trim() === '' ? id : String(rawLabel).trim();
    const aliases = [...new Set((aliasesByRegion[id] ?? []).map(value => String(value).trim()).filter(Boolean))];
    normalized.push({...feature, properties: {...(feature.properties ?? {}), regionId: id, name: label, regionAliases: aliases}});
  }
  const definition = validateMapDefinition({version: 1, id: mapId, name, regionType: 'custom-region', regions: normalized.map(feature => ({id: feature.properties.regionId, name: feature.properties.name, aliases: feature.properties.regionAliases ?? []}))});
  return {definition, geojson: {type: 'FeatureCollection', features: normalized}};
}

/** Register a validated custom polygon map for this browser session only. */
export function registerCustomMap({name, geojson, idProperty, labelProperty}) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw new TypeError('Enter a name for this map.');
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features) || !geojson.features.length) throw new TypeError('A validated GeoJSON FeatureCollection is required.');
  const duplicate = findDuplicateCustomMap(geojson);
  if (duplicate) throw new TypeError(`This GeoJSON is already in the catalog as “${duplicate.name}”.`);
  const slug = cleanName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'custom-map';
  let mapId = `custom-${slug}`;
  let suffix = 2;
  while (getMapDefinition(mapId)) mapId = `custom-${slug}-${suffix++}`;
  const built = buildDefinition({name: cleanName, geojson, idProperty, labelProperty, mapId});
  customMaps.set(mapId, {...built, sourceGeoJSON: JSON.parse(JSON.stringify(geojson)), idProperty, labelProperty, aliasesByRegion: {}});
  saveCustomMaps();
  return built.definition;
}

export function updateCustomMapProperties(mapId, {idProperty, labelProperty, aliasesByRegion = undefined}) {
  const entry = customMaps.get(mapId);
  if (!entry) throw new TypeError('This custom map is no longer in the catalog.');
  const nextAliases = aliasesByRegion === undefined ? (entry.aliasesByRegion ?? {}) : aliasesByRegion;
  const built = buildDefinition({name: entry.definition.name, geojson: entry.sourceGeoJSON, idProperty, labelProperty, mapId, aliasesByRegion: nextAliases});
  entry.definition = built.definition;
  entry.geojson = built.geojson;
  entry.idProperty = idProperty;
  entry.labelProperty = labelProperty;
  entry.aliasesByRegion = JSON.parse(JSON.stringify(nextAliases));
  saveCustomMaps();
  return entry.definition;
}

// Initialization is awaited by main.js before the Maps workspace is rendered.
