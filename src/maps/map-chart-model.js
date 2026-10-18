import {getMapDefinition} from './map-catalog.js';
import {validateGeographyConfiguration} from './map-data-contract.js';

/** Build renderer-independent choropleth values from raw filtered rows and saved assignments. */
export function buildMapChartModel({rows, geographicColumn, measureColumn, aggregation = 'sum', mapId, geographyConfiguration}) {
  const map = getMapDefinition(mapId);
  if (!map) throw new TypeError(`Unknown map: ${mapId || '(missing)'}.`);
  if (!Array.isArray(rows)) throw new TypeError('Map chart rows must be an array.');
  const config = validateGeographyConfiguration(geographyConfiguration ?? null);
  const mapping = config.mappings.find(item => item.mapId === mapId && item.column === geographicColumn);
  const assignments = new Map((mapping?.values ?? []).map(item => [JSON.stringify(item.sourceValue), item.regionId]));
  const regionIds = new Set(map.regions.map(region => region.id));
  const grouped = new Map(map.regions.map(region => [region.id, []]));
  const unmapped = new Set();
  for (const row of rows) {
    const sourceValue = row?.[geographicColumn] ?? null;
    const key = JSON.stringify(sourceValue);
    const regionId = assignments.get(key);
    if (!regionId || !regionIds.has(regionId)) {
      if (sourceValue !== null && !(typeof sourceValue === 'string' && sourceValue.trim() === '')) unmapped.add(key);
      continue;
    }
    const raw = row?.[measureColumn];
    if (aggregation === 'count') {
      if (raw !== null && raw !== undefined && !(typeof raw === 'string' && raw.trim() === '')) grouped.get(regionId).push(1);
    } else {
      const number = typeof raw === 'boolean' || raw == null || (typeof raw === 'string' && raw.trim() === '') ? NaN : Number(raw);
      if (Number.isFinite(number)) grouped.get(regionId).push(number);
    }
  }
  const regions = map.regions.map(region => {
    const values = grouped.get(region.id);
    let value = null;
    if (values.length) {
      switch (aggregation) {
        case 'sum': value = values.reduce((sum, current) => sum + current, 0); break;
        case 'average': value = values.reduce((sum, current) => sum + current, 0) / values.length; break;
        case 'min': value = Math.min(...values); break;
        case 'max': value = Math.max(...values); break;
        case 'count': value = values.length; break;
        default: throw new TypeError(`Unsupported map aggregation: ${aggregation}.`);
      }
    }
    return {...region, value, rowCount: values.length};
  });
  return {map, regions, unmappedValueCount: unmapped.size, unmappedValues: [...unmapped].map(key => JSON.parse(key)), mappedRegionCount: regions.filter(region => region.value !== null).length};
}
