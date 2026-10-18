# M8.4e — Custom-map project regression and hardening

## Scope

This checkpoint hardens the M8.4a–M8.4d custom-map document, browser persistence, and project import/export path. It does not introduce a new document version or change the public project format.

## Changes

- Project import now validates annotations, metadata overrides, and geography mappings before replacing the custom-map catalog or writing project metadata to browser storage.
- Catalog restoration remains atomic: every record is validated and staged before the in-memory catalog is replaced.
- Regression tests cover invalid collection imports, duplicate geometry, repeated JSON export/import cycles, stable map and region IDs, alias retention, geography mapping retention, and older project documents without a `customMaps` field.

## Import ordering

1. Parse and validate the dashboard project document.
2. Rebuild the selected raw source and validate its expected schema.
3. Validate processing definitions against the loaded dataset columns.
4. Validate annotations, metadata overrides, and geography mappings.
5. Restore the custom-map collection, if present.
6. Save the validated project processing settings and dashboard state.

The catalog restore itself is atomic. Browser storage writes span multiple keys and browser storage APIs do not provide a cross-key transaction; a quota/security failure during those writes can still interrupt the overall application of a project. This stage minimizes validation-related partial imports but does not claim transactional guarantees across browser storage.

## Verification performed

Focused Node test run:

```sh
node --test tests/maps/map-catalog-custom.test.js tests/maps/map-catalog.test.js tests/map-data-contract.test.js tests/dashboard-persistence.test.js
```

Result: 35 tests passed, 0 failed. JavaScript syntax checks across `src/` and `tests/` also passed. Full suite, browser tests, and production build were not run in this environment because project dependencies were not installed.
