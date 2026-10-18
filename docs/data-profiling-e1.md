# E1 — Dataset profiling engine

E1 adds a read-only profiling API in `src/data/profiling.js`. It accepts the canonical dataset contract, so the profiler is independent of the source adapter and can be reused by future CSV, spreadsheet, or API connectors.

## API

- `profileDataset(dataset)` returns a versioned `dataset-profile` with dataset row/column counts and a profile for each column.
- `profileColumn(dataset, columnName)` returns one column profile and throws if the column is unknown.

Each column profile includes the canonical inferred type and suggested role, row/populated/missing counts, missing percentage, distinct count, observed value-type distribution, representative examples, numeric statistics when numeric values or numeric strings are present, and min/max for valid ISO date strings.

## Interpretation notes

- Null, undefined, empty strings, and whitespace-only strings count as missing.
- Numeric-looking strings are reported separately from numeric JavaScript values. Numeric statistics may summarize both, but the original values are never coerced or changed in the dataset.
- Distinct values are counted exactly, preserving spelling and whitespace differences so potential category inconsistencies remain visible.
- Type examples are unique within each observed type and capped at five values per type.
- This module reports observations only. It does not clean, normalize, validate against user-defined rules, or mutate data.

The profiler is an engine/API increment; a Data/Prepare UI and issue interpretation workflow are later increments.
