# D5 integration hardening

## Completed in this increment

- Removed duplicated `numericColumns`, `dateColumns`, and `dimensionColumns` fields from the canonical dataset. `columnMetadata` is the source of truth; use helper functions to select columns by role or type.
- Migrated chart configuration validation, range filters, color assignment, and editor controls to canonical metadata helpers.
- Removed `inferDatasetMetadata` and `loadCsv` compatibility exports.
- Removed automatic conversion of obsolete layout-only dashboard exports. Import now requires the canonical dashboard document schema rather than guessing a source reference.
- Added reusable `deriveColumn` preparation transformation and moved the sample's `month` derivation out of direct dataset mutation in `main.js`.
- Tightened type inference: a column is numeric only if all populated values are numeric; all-empty columns have `unknown` type and `ignore` role.
- Added tests for metadata-only column grouping, mixed-type inference, empty columns, derived-column transformations, and obsolete dashboard import rejection.

## Verification

- `npm test`: 70 tests pass.
- `node --check` across all JavaScript files under `src` and `tests`: passed.
- `npm run build`: not run successfully because dependencies could not be installed in the environment (`vite: not found`; `npm install` timed out).
- `npm run test:browser`: not run successfully because Playwright is unavailable in the environment.

## Remaining work

- Run `npm install`, `npm run build`, and `npm run test:browser` in an environment with dependency access and the required browser binaries.
- The current app bootstrap still opens the sample `/data/sales.csv` and its starter chart defaults target that sample's fields. When user-selectable sources are introduced, starter chart creation must derive safe defaults from the loaded canonical dataset instead of assuming sample-specific columns.
- Data cleaning, user-overridden type/role annotations, raw-versus-prepared dataset retention, and transformation provenance remain deferred; see `project-reminders.md`.
