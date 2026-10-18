/**
 * Conservative, deterministic matching for geographic values.
 * Only normalized exact matches against region names and aliases are proposed;
 * fuzzy/partial matches are intentionally not auto-assigned.
 */
export function normalizeGeographicLabel(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchGeographicValue(value, mapDefinition) {
  const normalized = normalizeGeographicLabel(value);
  if (!normalized) return {status: 'blank', regionId: null, matchType: null, candidates: []};

  const candidates = new Map();
  for (const region of mapDefinition.regions ?? []) {
    const nameKey = normalizeGeographicLabel(region.name);
    if (nameKey === normalized) candidates.set(region.id, {regionId: region.id, regionName: region.name, matchType: 'name'});
    for (const alias of region.aliases ?? []) {
      if (normalizeGeographicLabel(alias) === normalized && !candidates.has(region.id)) {
        candidates.set(region.id, {regionId: region.id, regionName: region.name, matchType: 'alias'});
      }
    }
  }
  const matches = [...candidates.values()];
  if (matches.length === 1) return {status: 'matched', ...matches[0], candidates: matches};
  if (matches.length > 1) return {status: 'ambiguous', regionId: null, matchType: null, candidates: matches};
  return {status: 'unmatched', regionId: null, matchType: null, candidates: []};
}

/**
 * Inspect distinct values using explicit assignments first, then conservative
 * exact matching. Existing assignments are never replaced by suggestions.
 */
export function suggestGeographicMappings(values, mapping, mapDefinition) {
  const assigned = new Map((mapping?.values ?? []).map(entry => [JSON.stringify(entry.sourceValue), entry.regionId]));
  return [...new Map(values.map(value => [JSON.stringify(value), value])).values()].map(sourceValue => {
    const key = JSON.stringify(sourceValue);
    const manualRegionId = assigned.get(key);
    if (manualRegionId) {
      const region = mapDefinition.regions.find(item => item.id === manualRegionId);
      if (region) return {sourceValue, status: 'mapped', regionId: manualRegionId, matchType: 'existing', candidates: [{regionId: region.id, regionName: region.name, matchType: 'existing'}]};
      return {sourceValue, status: 'invalid-region', regionId: null, matchType: null, candidates: []};
    }
    return {sourceValue, ...matchGeographicValue(sourceValue, mapDefinition)};
  });
}
