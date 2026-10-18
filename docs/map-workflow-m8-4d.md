# Map workflow M8.4d — Project export/import integration

## Purpose

A Datactive project now carries the custom map definitions needed by its geography mappings, instead of depending only on the browser's local custom-map catalog.

## Project document

`processing.customMaps` contains a versioned `datactive/custom-map-collection` document. Each custom map record carries its stable map ID, source GeoJSON, selected ID and label properties, stable region IDs, display labels, and aliases. `processing.geography` continues to contain the map/column mappings and source-value-to-region-ID assignments.

Both fields are included in the existing JSON project export. Import validation checks the custom-map collection and checks that geography assignments targeting a custom map refer to region IDs present in that map.

## Import ordering

When a project is imported, the pending project document is retained through the existing reload/source-selection workflow. During startup, its custom map collection is restored before its geography mappings are validated and persisted. This ensures mappings refer to the imported stable IDs, not newly generated IDs based on map names.

Projects created before M8.4d may omit `processing.customMaps`; these remain accepted and leave the browser's existing custom-map catalog in place. M8.4d projects include the collection (including an empty collection) so the project can describe the exact custom maps it requires.

## Scope and caveats

- The project remains portable with or without embedded raw source data; map definitions are included either way.
- Built-in maps remain bundled with Datactive and are not duplicated in the custom-map collection.
- Importing an M8.4d project replaces the active custom-map catalog with the project's custom-map collection. Export a separate project if you need to preserve a different catalog.
- Transient chart filters and runtime objects remain excluded.
