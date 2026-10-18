# Dashboard Builder

## Install and run

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
npx playwright install chromium
npm run test:browser
```

The browser suite includes registry-driven interaction tests and specialized cases for heatmap compound selections and categorical/numeric brush boundaries. The specialized tests use real Playwright mouse gestures for brushes and verify emitted filter events plus compound-filter toggle behavior.


### Inline multi-measure controls

Bar, line, area, and radar charts support selecting multiple numeric measures from their inline header controls. Combo charts retain their two explicit series selectors. Stacked bar charts use one measure with a second dimension for stack categories; pie, treemap, waterfall, and funnel charts use one measure by design. Tables support selecting multiple columns.


## Data sources

Datactive currently imports CSV files, direct CSV URLs, and Excel workbooks (`.xlsx` / `.xls`). Excel imports use the same data-source registry and raw-table contract as CSV. For workbooks with multiple worksheets, choose the worksheet to import. Cell values are passed to the preparation pipeline without automatic cleaning. Excel imports are stored as raw tabular data for the current browser tab; data-project exports can embed this table or retain a source reference.
## Geographic setup (M1)

Columns can be assigned a geographic role in **Annotate**. Saving at least one geographic role enables the **Maps** workspace between Annotate and Dashboard, where distinct values can be manually assigned to stable region IDs in the starter North America country map. Roles and assignments are preserved by project export/import. This stage configures mappings only; map rendering is a later stage. See [`docs/map-workflow-m1.md`](docs/map-workflow-m1.md).


## Geography workflow

M1 adds geographic-role annotation and persisted manual mappings. M2 adds conservative exact-match suggestions against map region names and aliases, with explicit ambiguous/unmatched reporting. See `docs/map-data-contract.md`, `docs/map-workflow-m1.md`, and `docs/map-workflow-m2.md`. Map rendering is not implemented yet.
