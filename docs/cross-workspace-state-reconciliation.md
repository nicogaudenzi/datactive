# Cross-workspace state preservation and schema reconciliation

## Behavior

- Dashboard visualization definitions and layout are saved to tab-scoped `sessionStorage` under a key derived from the active source identity.
- The key deliberately does not include the prepared column list, so adding or removing derived columns does not orphan the saved dashboard state.
- Chart definitions are persisted after chart creation, dialog edits, inline edits, removals, layout changes, and dashboard import.
- When the app reloads after a preparation-pipeline change, saved chart definitions are checked against the newly prepared dataset using `validateVisualizationConfig`. The validator is passed explicitly at the application entry point and also defaults safely in the reconciliation helper.
- Valid charts are restored with their saved IDs, query settings, titles, and layout. Only charts whose configurations are invalid are removed.
- Removed chart titles and reasons are shown in a notice on the Dashboard workspace.
- If every saved chart is invalid, the dashboard remains empty instead of silently replacing the user's dashboard with the default starter chart.

## Scope and limitations

- This is tab-session preservation, not durable project persistence. Closing the browser tab clears `sessionStorage`.
- Active filters and transient range-widget state are not persisted by this change.
- Dashboard state is associated with source identity. If a different dataset is imported under the same identity, each saved chart is still reconciled against the new schema before restoration.
- A chart is considered compatible when its configuration validates against the current dataset metadata. Data values can still produce empty results; that alone does not invalidate a chart.

## Verification

- Initial checkpoint had a regression: the startup reconciliation call omitted the validator argument, causing `validateConfig is not a function` when a preparation change triggered reload. Fixed by passing `validateVisualizationConfig` explicitly and providing a safe default in the helper.
- Automated tests and syntax checks were rerun after the fix; see the current checkpoint verification.
- `node --check src/main.js` and `node --check src/dashboard/dashboard-state.js`: passed.
- Production build and Playwright browser tests were not run in the current environment because project dependencies are not installed.

## Manual acceptance test

1. Open Dashboard, create two charts, and move or resize one of them.
2. Go to Profile / Prepare and apply a transformation that changes values but not columns. Return to Dashboard; both charts and their layout should remain.
3. Create a derived column and a chart that uses it. Remove that derived-column transformation. Return to Dashboard; the dependent chart should be removed with an explanatory notice, while unrelated charts remain.
4. Remove a transformation that is not referenced by any chart; no charts should be removed.
5. Verify the dashboard remains empty (rather than resetting to a default chart) if all saved charts become invalid.
