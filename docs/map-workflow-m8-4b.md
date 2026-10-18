# Map workflow M8.4b — custom-map catalog persistence

## Scope

M8.4b adds browser-local persistence for custom map definitions created in the Maps workspace. It builds on the versioned custom-map document contract from M8.4a.

## Behavior

- Custom maps are automatically loaded from browser `localStorage` during catalog module initialization.
- Adding a custom map, saving its ID/label property choices or aliases, and removing it saves the updated catalog.
- Map IDs and region IDs are restored verbatim; they are not regenerated from names.
- The saved record includes the original GeoJSON, selected ID and label properties, display names, and aliases.
- Stored data is validated before it replaces the active catalog. Invalid or unsupported stored data is ignored and does not clear an already active catalog.
- Built-in map IDs cannot be claimed by restored custom maps. Duplicate custom geometry inside a restored collection is rejected.
- Storage is best-effort: if browser storage is unavailable or full, the current in-memory session can continue, but changes may not survive reload.

## Catalog API

- `serializeCustomMaps()` returns a validated, portable custom-map collection.
- `restoreCustomMapCollection(collection)` validates and atomically replaces the in-memory custom catalog, preserving IDs.
- `saveCustomMaps(storage?)` writes the current collection to storage; a storage adapter may be supplied for tests.
- `loadCustomMaps(storage?)` loads and validates a collection from storage; a storage adapter may be supplied for tests.
- `CUSTOM_MAP_STORAGE_KEY` identifies the local storage entry.

## Deliberate exclusions

This stage does not include custom maps in dashboard/project export or import. That integration is reserved for a later stage. Geography assignment persistence remains separate, and this stage does not change the mapping format.
