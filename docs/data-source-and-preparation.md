# Data source and preparation boundaries (D3)

## Flow

`DataSourceAdapter.load(reference) -> raw table -> DataPreparationPipeline.run(raw table) -> canonical dataset -> DataEngine / filters / visualizations`

## Raw table contract

A raw table has `columns: string[]`, `rows: object[]`, and optional `source: { type, reference }`. The CSV adapter reads values as provided by D3 (normally strings); it does not trim, coerce, fill, deduplicate, or otherwise clean them. `validateRawTable` checks the shape and copies rows/columns to keep the pipeline from accidentally retaining the adapter's mutable arrays.

`DataSourceAdapter` is the common base contract. Implementations provide `type` and `load(reference)`. Future Excel, Sheets, or API adapters should return the same raw-table shape.

## Preparation pipeline

`DataPreparationPipeline` runs ordered async transformation functions. Each step accepts a raw-table value and must return a valid raw table. The default pipeline preserves values and derives a canonical dataset whose `columnMetadata` is the sole source of inferred column types and roles. Helpers such as `getMeasureColumns`, `getDateColumns`, and `getDimensionColumns` derive column selections from that metadata; duplicate column lists are not stored on the dataset. Reusable transformations such as `deriveColumn` can be added as ordered pipeline steps. This is a boundary for future profiling, validation, cleaning, and annotation features, not a cleaning feature by itself.

Keep validation and transformations explicit. Do not automatically equate missing numeric values with zero or merge category spellings without a user-defined rule. Future work should preserve source/raw values separately from transformed results and record applied transformations.

## Current limits

- The app still loads `/data/sales.csv` at startup.
- The sample dashboard still configures a derived `month` field from its `date` column, but the operation is implemented as a reusable preparation transformation.
- There are no legacy `loadCsv` or duplicate column-list fields; callers use the adapter, pipeline, and canonical metadata helpers.
