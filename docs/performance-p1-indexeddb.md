# P1 — IndexedDB storage foundation

## Goal

Remove Web Storage's small string quota from the large persistent payloads used by Datactive without redesigning the data-preparation or visualization engines.

## Storage layer

- Database: `datactive-storage`, schema version `1`.
- Object store: `records`, keyed by `key`; values are structured-cloneable records.
- API: `getPersistentValue`, `setPersistentValue`, `deletePersistentValue`, and `listPersistentValues` in `src/storage/indexeddb.js`.
- Browser quota is dynamic. `estimatePersistentStorage()` exposes `navigator.storage.estimate()` where supported, and startup requests persistent storage where the browser supports it. Neither operation guarantees unlimited capacity.

## Migrated payloads

- Imported CSV/XLSX session payloads, including CSV text and canonical raw tables.
- Pending project-import documents, which can contain embedded source data.
- Custom-map catalog, including source GeoJSON and aliases.
- Source/dataset-scoped geography mappings.

Legacy imported payloads in `sessionStorage` and map/geography values in `localStorage` are migrated on startup when possible. The old copy is removed only after a successful IndexedDB write. Small transient UI/workspace state and preparation/annotation metadata remain in sessionStorage for now; this stage is not a wholesale replacement of every Web Storage use.

## Failure behavior

- Imported payload writes use IndexedDB first. If IndexedDB fails, the app attempts the old sessionStorage fallback; if that also fails, the import displays an error rather than silently claiming the file was saved.
- Custom maps and geography mappings are cached in memory for the active page and saved asynchronously. User-triggered save actions await queued writes and report errors.
- Storage estimate and persistent-storage requests are best-effort. Quota may still be exhausted and users can clear browser data.
- Project export/import remains a portable JSON file workflow and does not depend on sharing the browser's IndexedDB database.

## Scope limits

P1 still parses imported files into the current in-memory table model. IndexedDB removes the Web Storage payload-size bottleneck but does not make parsing out-of-core, reduce the RAM needed for parsed rows, or improve chart performance by itself. Web Workers, chunked parsing, caching, and rendering optimizations remain separate future work.
