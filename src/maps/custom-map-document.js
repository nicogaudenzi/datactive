import {validateCustomGeoJSON} from './custom-geojson.js';
import {validateMapDefinition} from './map-data-contract.js';

/** Version of the portable custom-map record format (independent of dashboard documents). */
export const CUSTOM_MAP_DOCUMENT_VERSION = 1;
export const CUSTOM_MAP_DOCUMENT_SCHEMA = 'datactive/custom-map';
export const CUSTOM_MAP_COLLECTION_SCHEMA = 'datactive/custom-map-collection';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Create a JSON-safe custom-map record from catalog details. Map and region IDs
 * are copied verbatim: labels and names are presentation fields, not identity.
 */
export function createCustomMapRecord({definition, sourceGeoJSON, idProperty, labelProperty, aliasesByRegion = {}}) {
  const validDefinition = validateMapDefinition(definition);
  const checked = validateCustomGeoJSON(sourceGeoJSON);
  if (typeof idProperty !== 'string' || !idProperty.trim()) throw new TypeError('Custom map idProperty is required.');
  if (typeof labelProperty !== 'string' || !labelProperty.trim()) throw new TypeError('Custom map labelProperty is required.');
  const regionIds = new Set(validDefinition.regions.map(region => region.id));
  const aliases = normalizeAliases(aliasesByRegion, regionIds);
  const idsFromGeoJSON = checked.geojson.features.map((feature, index) => {
    const raw = feature.properties?.[idProperty];
    if (raw == null || !String(raw).trim()) throw new TypeError(`Feature ${index + 1} is missing the selected ID property.`);
    return String(raw).trim();
  });
  if (new Set(idsFromGeoJSON).size !== idsFromGeoJSON.length) throw new TypeError('Custom map ID property must produce unique region IDs.');
  if (idsFromGeoJSON.length !== validDefinition.regions.length || idsFromGeoJSON.some(id => !regionIds.has(id))) {
    throw new TypeError('Custom map region IDs must match the selected ID property in the GeoJSON.');
  }
  return {
    schema: CUSTOM_MAP_DOCUMENT_SCHEMA,
    version: CUSTOM_MAP_DOCUMENT_VERSION,
    id: validDefinition.id,
    name: validDefinition.name,
    sourceGeoJSON: clone(checked.geojson),
    idProperty: idProperty.trim(),
    labelProperty: labelProperty.trim(),
    aliasesByRegion: aliases,
    regions: validDefinition.regions.map(region => ({id: region.id, name: region.name, aliases: [...(aliases[region.id] ?? [])]}))
  };
}

/** Validate and normalize a portable custom-map record without mutating input. */
export function validateCustomMapRecord(record) {
  if (!isRecord(record) || record.schema !== CUSTOM_MAP_DOCUMENT_SCHEMA) throw new TypeError('Unrecognized custom map document schema.');
  if (record.version !== CUSTOM_MAP_DOCUMENT_VERSION) throw new TypeError(`Unsupported custom map document version: ${record.version ?? '(missing)'}.`);
  if (typeof record.id !== 'string' || !record.id.trim()) throw new TypeError('Custom map id is required.');
  if (typeof record.name !== 'string' || !record.name.trim()) throw new TypeError('Custom map name is required.');
  if (typeof record.idProperty !== 'string' || !record.idProperty.trim()) throw new TypeError('Custom map idProperty is required.');
  if (typeof record.labelProperty !== 'string' || !record.labelProperty.trim()) throw new TypeError('Custom map labelProperty is required.');
  if (!Array.isArray(record.regions)) throw new TypeError('Custom map regions must be an array.');
  const checked = validateCustomGeoJSON(record.sourceGeoJSON);
  const regionIds = new Set();
  const regions = record.regions.map((region, index) => {
    if (!isRecord(region) || typeof region.id !== 'string' || !region.id.trim()) throw new TypeError(`Custom map region ${index + 1} requires a stable id.`);
    if (typeof region.name !== 'string' || !region.name.trim()) throw new TypeError(`Custom map region ${index + 1} requires a display name.`);
    if (regionIds.has(region.id)) throw new TypeError(`Duplicate custom map region id: ${region.id}.`);
    regionIds.add(region.id);
    const aliases = region.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.some(alias => typeof alias !== 'string')) throw new TypeError(`Aliases for region "${region.id}" must be strings.`);
    return {id: region.id, name: region.name, aliases: [...aliases]};
  });
  const aliasesByRegion = normalizeAliases(record.aliasesByRegion ?? {}, regionIds);
  const derived = checked.geojson.features.map((feature, index) => {
    const rawId = feature.properties?.[record.idProperty];
    if (rawId == null || !String(rawId).trim()) throw new TypeError(`Feature ${index + 1} is missing the selected ID property.`);
    return String(rawId).trim();
  });
  if (new Set(derived).size !== derived.length) throw new TypeError('Custom map ID property must produce unique region IDs.');
  if (derived.length !== regions.length || derived.some(id => !regionIds.has(id))) throw new TypeError('Custom map region IDs must match the selected ID property in the GeoJSON.');
  const definition = validateMapDefinition({version: 1, id: record.id.trim(), name: record.name.trim(), regionType: 'custom-region', regions});
  return {
    schema: CUSTOM_MAP_DOCUMENT_SCHEMA,
    version: CUSTOM_MAP_DOCUMENT_VERSION,
    id: definition.id,
    name: definition.name,
    sourceGeoJSON: clone(checked.geojson),
    idProperty: record.idProperty.trim(),
    labelProperty: record.labelProperty.trim(),
    aliasesByRegion,
    regions: definition.regions
  };
}

/** Build a portable collection; duplicate map IDs are rejected. */
export function createCustomMapCollection(records = []) {
  if (!Array.isArray(records)) throw new TypeError('Custom map records must be an array.');
  const maps = records.map(validateCustomMapRecord);
  const ids = new Set();
  for (const map of maps) {
    if (ids.has(map.id)) throw new TypeError(`Duplicate custom map id: ${map.id}.`);
    ids.add(map.id);
  }
  return {schema: CUSTOM_MAP_COLLECTION_SCHEMA, version: CUSTOM_MAP_DOCUMENT_VERSION, maps};
}

export function validateCustomMapCollection(collection) {
  if (!isRecord(collection) || collection.schema !== CUSTOM_MAP_COLLECTION_SCHEMA) throw new TypeError('Unrecognized custom map collection schema.');
  if (collection.version !== CUSTOM_MAP_DOCUMENT_VERSION) throw new TypeError(`Unsupported custom map collection version: ${collection.version ?? '(missing)'}.`);
  return createCustomMapCollection(collection.maps);
}

function normalizeAliases(value, regionIds) {
  if (!isRecord(value)) throw new TypeError('aliasesByRegion must be an object.');
  const result = {};
  for (const [regionId, rawAliases] of Object.entries(value)) {
    if (!regionIds.has(regionId)) throw new TypeError(`Aliases refer to unknown region id "${regionId}".`);
    if (!Array.isArray(rawAliases) || rawAliases.some(alias => typeof alias !== 'string')) throw new TypeError(`Aliases for region "${regionId}" must be strings.`);
    result[regionId] = [...new Set(rawAliases.map(alias => alias.trim()).filter(Boolean))];
  }
  return result;
}
