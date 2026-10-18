# Map workflow M8.2 — custom map catalog integration

M8.2 builds on M8.1's validated GeoJSON upload and preview.

## Added
- A validated GeoJSON collection can be explicitly added to an in-memory map catalog.
- Catalog entries are available in both the Maps workspace region-mapping selector and the Dashboard choropleth selector.
- Custom features are normalized to the existing stable `regionId` / display `name` geometry contract, while retaining their original properties.
- Missing or duplicate selected IDs block registration. Missing labels fall back to the region ID.
- Custom maps use generated `custom-...` IDs; name collisions receive a suffix rather than overwriting another map.
- Custom map geometry uses the existing choropleth aggregation, tooltip, legend, zoom, and click-to-filter behavior.

## Current limitations
- The catalog is in-memory for the current browser page/session only. Reloading the app clears custom maps.
- Custom geometry, map definitions, and custom-map references in charts are not yet included in project export/import. Avoid relying on a custom map chart after reload; persistence is a later stage.
- Only Polygon and MultiPolygon GeoJSON is supported. Coordinates are expected to be longitude/latitude.
- Custom map matching is explicit: map source values manually to region IDs in Maps. Built-in exact-match suggestions are not generalized to custom aliases yet.
