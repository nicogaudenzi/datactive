# Project reminders / deferred work

Keep this file updated as architectural follow-ups are deferred. Review it when preparing a project hand-off or deciding the next increment.

- [x] **Move the sample-specific `month` derived column into a reusable preparation transformation.** Implemented with `deriveColumn` in `src/data/preparation/transforms.js`; bootstrap now configures the transformation only when the sample `date` column exists.
- [x] Allow users to override inferred column types and roles in Annotate. Overrides are stored per active source/dataset in session storage and applied to canonical column metadata; they do not coerce values.
- [x] Extend E1 profiling with row-aware quality findings (duplicates, mixed types, suspicious numeric outliers, and likely category variants). Implemented as the read-only `findDataQualityIssues` API in `src/data/quality-findings.js`.
- [x] Present profiling and quality findings in a dedicated Data/Prepare workspace.
- [ ] Validate the same profiling results through a second real source adapter (Excel is the proposed first second adapter) before relying on multi-source equivalence beyond contract-level tests.
- [x] Establish raw/prepared separation and ordered transformation provenance. F5 copies raw input, replays JSON-serializable transformation definitions, and attaches ordered provenance to the prepared dataset. User-facing cleaning actions are implemented; durable project persistence remains pending.

- [ ] **Make starter dashboard defaults dataset-aware before adding selectable data sources.** `src/main.js` still starts with `/data/sales.csv` and its default charts/selectors assume fields such as `month`, `revenue`, and `cost`; choose valid defaults from canonical metadata or show an empty state when those fields are absent.

## Deferred data architecture / UX work
- [ ] Add user-selectable data sources; test a second adapter (initial target: Excel) against the same canonical raw-table and preparation contracts.
- [x] Move the sample-specific `month` derived field into a reusable preparation transformation definition that can be persisted/reapplied.
- [x] Allow users to override inferred column types and roles.
- [x] Keep raw imported values separate from prepared data and record transformation provenance (F5 foundation).
- [x] Add user-facing transformation editing, previews, apply/remove/reorder controls, and cleaning transformations (F6), including date conversion with invalid-value handling. Implemented in `src/data/preparation/cleaning-editor.js` and `transform-registry.js`; definitions remain tab-scoped.
- [x] Preserve Profile / Prepare as the active workspace after applying, removing, or reordering transformations.
- [x] Let users mark quality findings Reviewed or Ignored without changing source/prepared values; statuses are session-scoped and are not yet exported with projects.
- [ ] Include transformation definitions in dashboard/project export-import; current definitions are session-scoped.
- [x] Preserve dashboard chart definitions and layout across preparation-triggered reloads; reconcile charts against the newly prepared schema and remove only invalid chart configurations. Current dashboard preservation is tab-scoped, not durable project persistence; see `docs/cross-workspace-state-reconciliation.md`.
- [x] Add local CSV file selection and load arbitrary CSV data through the existing source adapter and preparation pipeline; use a dataset-aware table starter for non-sample schemas. Implemented in F1 with session-scoped import text and a messy-data fixture.
- [ ] Test the F1 CSV import workflow in a browser, including error feedback and replacing the active dataset; then use `public/data/messy-quality.csv` to review profiling and quality-finding gaps.
- [x] Replace the two-workspace navigation with a guided four-step workflow: Import Data, Profile / Prepare, Annotate, Dashboard. Implemented in the workflow-navigation checkpoint; Import Data is the initial workspace.
- [x] Add direct CSV URL import using browser `fetch`, with explicit HTTP(S) validation and CORS/network guidance. URL import still depends on the remote server permitting cross-origin browser requests; authenticated or non-direct download pages are not supported.
- [x] Implement a unified Annotate save action for all column descriptions and type/role overrides; descriptions appear in Prepare column profiles and chart field selector tooltips.
- [ ] Smoke-test local CSV and URL imports in a browser, including CORS/network failures, switching workflows, and returning to the bundled sample.

- Data-quality finding selection should remain informational until the user chooses **Show affected rows**; the filtered preview must expose a reliable **Show all rows** action.

- [ ] Browser-smoke-test metadata overrides for a local CSV, URL CSV, and sample dataset; confirm chart field options use the saved type/role and that source values remain unchanged.

## Browser test workflow navigation
- The guided workflow opens on `Import Data`. Browser tests that interact with charts must explicitly navigate to the `4. Dashboard` workspace after `page.goto('/')`; do not assume the dashboard is initially visible.
- The chart lifecycle Playwright tests now use an `openDashboardWorkspace(page)` helper and assert that `#dashboard-workspace` is visible before testing chart behavior.
- [x] Add a general serializable Derived Columns transformation with a safe expression parser, numeric arithmetic, date-part/month formatting, and basic text functions. The sample Month field now uses `FORMAT_MONTH([date])`.
- [x] Add conditional derived-column expressions: comparison operators (`>`, `>=`, `<`, `<=`, `==`, `!=`), `AND` / `OR` / `NOT`, nested `IF(condition, trueValue, falseValue)`, and `IS_MISSING(value)`. Unknown/missing conditions propagate blank results unless a logical short-circuit determines the result; `IS_MISSING` detects blank/null values, not arbitrary invalid text such as `not reported`.


## Cross-workspace dashboard state
- [x] Persist dashboard visualizations and layout in tab-scoped session storage so applying preparation changes does not clear the dashboard.
- [x] On startup after preparation changes, validate saved chart configurations against the current prepared schema, preserve valid charts, and show a notice for removed invalid charts.
- [ ] Browser-test the Prepare → Dashboard workflow, including removing a derived column referenced by only one of multiple charts.
- [x] Fix startup reconciliation error when the saved dashboard is restored after a preparation change: pass `validateVisualizationConfig` into `reconcileDashboardVisualizations` and provide a default validator in the helper.
