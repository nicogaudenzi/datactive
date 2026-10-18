# Map workflow M8.1 — Custom GeoJSON import and preview

M8.1 adds an initial custom-map intake panel to the Maps workspace. It intentionally does not add uploaded geometry to the choropleth map catalog yet; that integration is reserved for a later substage.

## Supported input

- `.geojson` or `.json` containing a GeoJSON `FeatureCollection`
- `Polygon` and `MultiPolygon` features
- Up to 10 MiB and 10,000 features
- Coordinates must be finite longitude/latitude pairs in the ranges [-180, 180] and [-90, 90]
- Feature properties are used to select a region ID property and display label property

The preview reports feature count and warns about missing IDs, duplicate IDs, and missing labels. The user can change the chosen ID and label properties and inspect feature labels through SVG title tooltips. A map name is suggested from the uploaded filename.

## Safety and scope

GeoJSON is parsed as data; no feature property is executed. Files exceeding the configured size limit or feature limit are rejected. Unsupported geometry types and invalid coordinates are rejected rather than silently omitted. Geometry remains in memory for this preview; no custom map is persisted or made selectable in charts in M8.1.

## Known limitations

- No TopoJSON, shapefile, points, or line geometry support.
- The preview assumes geographic longitude/latitude coordinates (WGS84-style GeoJSON). Local projected coordinate systems are not automatically detected or reprojected.
- Validation is structural and coordinate-range based; it is not a full OGC topology validator.
- Custom geometry does not yet survive project export/import; later M8 stages will define catalog and persistence behavior.
