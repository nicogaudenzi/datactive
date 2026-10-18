# M4 — Real country boundary geometry

M4 replaces the schematic starter polygons with locally bundled GeoJSON country boundaries. The current built-in map remains deliberately limited to Canada, the United States, and Mexico.

## Implementation

- `src/maps/geometry/north-america-countries.json` contains a three-feature GeoJSON `FeatureCollection`.
- Feature `properties.regionId` values are the stable region IDs from the M0 map contract. Display names are not used as identifiers.
- `src/visualizations/map-chart.js` projects the features with D3's conic conformal projection and draws Polygon/MultiPolygon geometry as SVG paths.
- Data aggregation, missing-value handling, geography assignments, and click-to-filter behavior remain in the existing renderer-independent model and geography configuration.
- Geometry is bundled locally; rendering does not make a network request.

## Data provenance

The geometry is a three-country subset of the Natural Earth low-resolution country-boundary dataset. Natural Earth provides its vector datasets for free use and states that its data is public domain. The available local source bundle did not expose a precise upstream release number, so this project does not claim a specific Natural Earth version. The project can replace the subset with a pinned upstream release in a future data-refresh task.

- Dataset page: https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/
- Terms: https://www.naturalearthdata.com/about/terms-of-use/

## Scope and limitations

- This is country-level geometry only. State/province and county/district boundaries are not included.
- Natural Earth low-resolution geometry is intended for small-scale maps, not precise local or cadastral work.
- Natural Earth uses de facto boundary representations and documents that disputed-boundary choices are part of its data model.
- Region IDs and user mappings are preserved; geometry is associated by stable region IDs.

## Verification

`tests/north-america-geometry.test.js` validates the GeoJSON structure, region coverage, polygon detail, and provenance. The browser map test checks that the renderer emits three non-empty SVG path geometries and retains the region-filter interaction.
