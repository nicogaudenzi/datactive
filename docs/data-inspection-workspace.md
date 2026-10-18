# E3 — Data inspection workspace

The application now has separate **Dashboard** and **Data / Prepare** workspaces. The data workspace is read-only in this increment and consumes the same canonical dataset used by the DataEngine and charts.

## Capabilities

- Column profile table with inferred type/role, missing counts and percentage, distinct count, and observed value-type distribution.
- Selected-column detail with row/populated/missing counts, numeric or date summaries when available, observed type counts, and example values.
- Data-quality findings list sourced from `findDataQualityIssues()`.
- Finding detail with severity, type, column when applicable, serialized evidence, and a list of affected source rows.
- Row preview with 25 rows per page, 1-based display row numbers, selected-column emphasis, and affected-row highlighting/filtering for findings with row-index evidence.
- All displayed values are rendered as text; the inspection workspace does not execute transformations or mutate the dataset.

## Implementation

`src/data/data-inspection-view.js` mounts the UI and composes the existing `profileDataset()` and `findDataQualityIssues()` APIs. `getFindingRowIndices()` normalizes row-index evidence from mixed-type, category-variant, duplicate-row, and outlier findings.

The view is intentionally read-only. Transformation editing, validation rule authoring, source selection, and source refresh remain future work.

## F1 — Local CSV import

The header's **Import CSV** control accepts a local `.csv` file. The file is parsed through `CsvSourceAdapter.loadText()`, validated, and then the app reloads through the same adapter → preparation pipeline → canonical dataset bootstrap used for the bundled sample. The uploaded text is held in `sessionStorage` for the current browser tab, not uploaded to a server. Selecting a different CSV replaces the active dataset in that tab. Clearing the tab session returns to the bundled sample.

For schemas that do not match the sample's `month` / `revenue` / `cost` / `profit` fields, the starter dashboard is a data table containing all imported columns instead of attempting to render sample-specific charts. Sample-only `month` derivation is not applied to imported CSVs. Import failures are shown next to the import control; empty files, missing/blank headers, and duplicate column names are rejected. Cell values remain strings and are not cleaned during import.

`public/data/messy-quality.csv` is a small fixture for manually testing missing values, mixed types, category variants, duplicate rows, outliers, and date-like inconsistencies through the Data / Prepare workspace.

Use **Use sample data** to discard the current tab's imported CSV and return to the bundled sample dataset.


### Finding row preview behavior
Selecting a quality finding displays its evidence without changing the row preview or highlighting rows outside the current page. Use **Show affected rows** to filter the preview to the finding's evidence rows; in that mode those rows are highlighted and **Show all rows** restores the full dataset preview.
