# F5 — Preparation pipeline foundation

F5 introduces the foundations for reproducible data preparation without exposing cleaning actions in the UI yet.

## Raw versus prepared data

- Source adapters produce a raw-table object.
- `DataPreparationPipeline.run()` validates and copies raw input before replaying transformations.
- Transformations operate on copies; the adapter's raw table is not mutated.
- The canonical dataset consumed by charts, profiling, and inspection is built from the prepared table.

## Serializable transformations

`src/data/preparation/transform-registry.js` defines a versionable list of transformation definitions and validates their IDs, types, parameters, and column dependencies. Definitions are plain JSON data rather than closures, so they can be persisted and replayed.

The first registered definition is `derive-month`, used to preserve the sample dashboard's derived `month` column. This is deliberately a minimal registry; user-facing cleaning operations will be added in F6 after this foundation is verified.

Definitions are scoped to the current browser tab and active source identity in `sessionStorage`. This is not durable project persistence yet. On each startup, the app loads the raw source, validates the definitions, and rebuilds prepared data from scratch.

## Provenance

The pipeline exposes `dataset.preparation.transformations`, an ordered record of transformation IDs, types, parameters, and execution order. Existing function-based pipeline steps remain supported for compatibility but are marked `runtime-function` and `replayable: false`; durable preparation actions should use registered serializable definitions.

## Current limitations

- No cleaning-action editor or preview/apply UI yet.
- Only `derive-month` is currently registered.
- Definitions are session-scoped and are not yet included in dashboard project export/import.
- Browser smoke testing is still required; unit tests cover copying, deterministic replay, ordering/provenance, and invalid definitions.
