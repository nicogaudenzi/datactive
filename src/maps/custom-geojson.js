const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FEATURES = 10000;
const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

function validPosition(position) {
  return Array.isArray(position) && position.length >= 2 &&
    Number.isFinite(position[0]) && Number.isFinite(position[1]) &&
    position[0] >= -180 && position[0] <= 180 && position[1] >= -90 && position[1] <= 90;
}

function geometryPositions(geometry) {
  const positions = [];
  const visit = value => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number') positions.push(value);
    else value.forEach(visit);
  };
  visit(geometry.coordinates);
  return positions;
}

/** Validate a user-provided GeoJSON FeatureCollection for a polygon choropleth preview. */
export function validateCustomGeoJSON(input, {maxBytes = DEFAULT_MAX_BYTES, maxFeatures = DEFAULT_MAX_FEATURES} = {}) {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > maxBytes) throw new Error(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB size limit.`);
    try { input = JSON.parse(input); } catch { throw new Error('The file is not valid JSON.'); }
  }
  if (!input || typeof input !== 'object' || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection with a features array.');
  }
  if (input.features.length === 0) throw new Error('The GeoJSON contains no features.');
  if (input.features.length > maxFeatures) throw new Error(`The GeoJSON contains ${input.features.length} features; the limit is ${maxFeatures}.`);
  const errors = [];
  const properties = new Set();
  let validFeatures = 0;
  input.features.forEach((feature, index) => {
    if (!feature || feature.type !== 'Feature' || !feature.geometry || !POLYGON_TYPES.has(feature.geometry.type)) {
      errors.push(`Feature ${index + 1}: expected Polygon or MultiPolygon geometry.`);
      return;
    }
    const positions = geometryPositions(feature.geometry);
    if (positions.length < 4 || positions.some(position => !validPosition(position))) {
      errors.push(`Feature ${index + 1}: geometry has invalid or insufficient coordinates.`);
      return;
    }
    if (feature.properties && typeof feature.properties === 'object' && !Array.isArray(feature.properties)) {
      Object.keys(feature.properties).forEach(key => properties.add(key));
    }
    validFeatures += 1;
  });
  if (errors.length) {
    const shown = errors.slice(0, 5);
    throw new Error(`${errors.length} invalid feature(s). ${shown.join(' ')}${errors.length > shown.length ? ` And ${errors.length - shown.length} more.` : ''}`);
  }
  return {geojson: input, featureCount: validFeatures, propertyNames: [...properties].sort(), bounds: calculateBounds(input.features)};
}

function calculateBounds(features) {
  const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
  for (const feature of features) for (const position of geometryPositions(feature.geometry)) {
    bounds[0][0] = Math.min(bounds[0][0], position[0]);
    bounds[0][1] = Math.min(bounds[0][1], position[1]);
    bounds[1][0] = Math.max(bounds[1][0], position[0]);
    bounds[1][1] = Math.max(bounds[1][1], position[1]);
  }
  return bounds;
}

export function inspectCustomGeoJSONFeatures(geojson, idProperty, labelProperty = idProperty) {
  const seen = new Set();
  const duplicateIds = new Set();
  const missingIds = [];
  for (const [index, feature] of geojson.features.entries()) {
    const raw = feature.properties?.[idProperty];
    const id = raw == null ? '' : String(raw).trim();
    if (!id) missingIds.push(index + 1);
    else if (seen.has(id)) duplicateIds.add(id);
    else seen.add(id);
  }
  const labelsMissing = geojson.features.filter(feature => {
    const value = feature.properties?.[labelProperty];
    return value == null || String(value).trim() === '';
  }).length;
  return {uniqueIds: seen.size, missingIds, duplicateIds: [...duplicateIds], labelsMissing};
}
