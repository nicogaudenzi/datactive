/**
 * Minimal geography contract (M0).
 * Map IDs and region IDs are stable identifiers owned by a map definition;
 * display names are presentation only. User mappings refer to IDs, never labels.
 */
export const MAP_DATA_CONTRACT_VERSION = 1;

export const GEOGRAPHIC_ROLES = Object.freeze([
  'country',
  'state-province',
  'county-district',
  'city',
  'postal-code',
  'custom-region'
]);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isScalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** Validate and clone the saved user-to-map region assignments. */
export function validateGeographyConfiguration(configuration, datasetColumns = null) {
  if (configuration == null) return {version: MAP_DATA_CONTRACT_VERSION, mappings: []};
  if (!isRecord(configuration)) throw new TypeError('Geography configuration must be an object.');
  if (configuration.version !== MAP_DATA_CONTRACT_VERSION) {
    throw new TypeError(`Unsupported geography configuration version: ${configuration.version ?? '(missing)'}.`);
  }
  if (!Array.isArray(configuration.mappings)) throw new TypeError('Geography mappings must be an array.');

  const knownColumns = Array.isArray(datasetColumns) ? new Set(datasetColumns) : null;
  const seenTargets = new Set();
  const mappings = configuration.mappings.map((mapping, index) => {
    if (!isRecord(mapping)) throw new TypeError(`Geography mapping ${index + 1} must be an object.`);
    if (typeof mapping.mapId !== 'string' || !mapping.mapId.trim()) throw new TypeError(`Geography mapping ${index + 1} requires a mapId.`);
    if (typeof mapping.column !== 'string' || !mapping.column.trim()) throw new TypeError(`Geography mapping ${index + 1} requires a column.`);
    if (knownColumns && !knownColumns.has(mapping.column)) throw new TypeError(`Geography mapping refers to unknown column "${mapping.column}".`);
    if (!Array.isArray(mapping.values)) throw new TypeError(`Geography mapping ${index + 1} values must be an array.`);

    const targetKey = `${mapping.mapId}\u0000${mapping.column}`;
    if (seenTargets.has(targetKey)) throw new TypeError(`Duplicate geography mapping for map "${mapping.mapId}" and column "${mapping.column}".`);
    seenTargets.add(targetKey);

    const seenSourceValues = new Set();
    const values = mapping.values.map((entry, valueIndex) => {
      if (!isRecord(entry)) throw new TypeError(`Geography mapping ${index + 1}, value ${valueIndex + 1} must be an object.`);
      if (!Object.hasOwn(entry, 'sourceValue') || !isScalar(entry.sourceValue)) {
        throw new TypeError(`Geography mapping ${index + 1}, value ${valueIndex + 1} requires a scalar sourceValue.`);
      }
      if (typeof entry.regionId !== 'string' || !entry.regionId.trim()) {
        throw new TypeError(`Geography mapping ${index + 1}, value ${valueIndex + 1} requires a regionId.`);
      }
      const sourceKey = JSON.stringify(entry.sourceValue);
      if (seenSourceValues.has(sourceKey)) throw new TypeError(`Duplicate source value in geography mapping for column "${mapping.column}".`);
      seenSourceValues.add(sourceKey);
      return {sourceValue: entry.sourceValue, regionId: entry.regionId};
    });
    return {mapId: mapping.mapId, column: mapping.column, values};
  });

  return {version: MAP_DATA_CONTRACT_VERSION, mappings};
}

/** Validate the stable, renderer-independent description of a map and its regions. */
export function validateMapDefinition(map) {
  if (!isRecord(map)) throw new TypeError('Map definition must be an object.');
  if (map.version !== MAP_DATA_CONTRACT_VERSION) throw new TypeError(`Unsupported map definition version: ${map.version ?? '(missing)'}.`);
  for (const field of ['id', 'name', 'regionType']) {
    if (typeof map[field] !== 'string' || !map[field].trim()) throw new TypeError(`Map definition ${field} is required.`);
  }
  if (!Array.isArray(map.regions)) throw new TypeError('Map definition regions must be an array.');
  const ids = new Set();
  const regions = map.regions.map((region, index) => {
    if (!isRecord(region) || typeof region.id !== 'string' || !region.id.trim()) throw new TypeError(`Map region ${index + 1} requires a stable id.`);
    if (typeof region.name !== 'string' || !region.name.trim()) throw new TypeError(`Map region ${index + 1} requires a display name.`);
    if (ids.has(region.id)) throw new TypeError(`Duplicate map region id: ${region.id}.`);
    ids.add(region.id);
    const aliases = region.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.some(alias => typeof alias !== 'string')) throw new TypeError(`Map region "${region.id}" aliases must be strings.`);
    return {id: region.id, name: region.name, aliases: [...aliases]};
  });
  return {version: MAP_DATA_CONTRACT_VERSION, id: map.id, name: map.name, regionType: map.regionType, regions};
}

/**
 * Return a deterministic mapping report for a column's distinct values.
 * This does not guess aliases: matching is explicit in M0; automatic matching
 * and ambiguity scoring are left to a later stage.
 */
export function inspectGeographyMapping(values, mapping, mapDefinition) {
  const validMap = validateMapDefinition(mapDefinition);
  const validMappings = validateGeographyConfiguration({version: MAP_DATA_CONTRACT_VERSION, mappings: mapping ? [mapping] : []});
  const selected = validMappings.mappings[0];
  if (selected && selected.mapId !== validMap.id) throw new TypeError('Geography mapping mapId does not match the selected map.');
  const regionIds = new Set(validMap.regions.map(region => region.id));
  const assigned = new Map((selected?.values ?? []).map(entry => [JSON.stringify(entry.sourceValue), entry.regionId]));
  const distinct = [...new Map(values.map(value => [JSON.stringify(value), value])).values()];
  return distinct.map(sourceValue => {
    const regionId = assigned.get(JSON.stringify(sourceValue));
    if (!regionId) return {sourceValue, status: 'unmapped', regionId: null};
    if (!regionIds.has(regionId)) return {sourceValue, status: 'invalid-region', regionId};
    return {sourceValue, status: 'mapped', regionId};
  });
}
