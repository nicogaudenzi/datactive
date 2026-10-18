# Canonical dataset contract (D4/D5)

The preparation pipeline returns a source-independent canonical dataset identified by `kind: "canonical-dataset"`, `version: 1`.

## Required fields

- `kind`, `version`: identify the contract and allow explicit future migrations.
- `rows`: array of row objects keyed by column name. Values remain in their prepared JavaScript representation; the contract does not itself coerce or clean them.
- `columns`: unique ordered list of column names.
- `rowCount`: must equal `rows.length`.
- `columnMetadata`: exactly one metadata entry per column, containing `type`, `role`, `nullable`, and `missingCount`.
- `source`: optional source descriptor such as `{ type, reference }`.

Column `type` is one of `number`, `date`, `string`, `boolean`, or `unknown`; `role` is `dimension`, `measure`, `identifier`, or `ignore`. Inference emits `number` only when every non-empty value is numeric, `date` when every non-empty value is a valid ISO-like date, `string` for other populated columns, and `unknown` for entirely empty columns. Numeric columns receive the suggested `measure` role, string/date columns `dimension`, and empty columns `ignore`. These are initial guesses, not authoritative semantic claims.

`nullable` and `missingCount` report null, undefined, or blank-string cells. Numeric-looking values remain strings when the source adapter supplied strings. The metadata describes their inferred type without silently changing their values.

## Accessing column groups

The dataset does not duplicate column lists. Use `getMeasureColumns(dataset)`, `getDateColumns(dataset)`, and `getDimensionColumns(dataset)` from `src/data/dataset-schema.js`. These are derived from `columnMetadata`, which is the single source of type and role information.

## Validation boundary

`validateCanonicalDataset` checks contract shape and metadata consistency, not overall data quality. Profiling, validation rules, cleaning, annotation, and transformation history remain preparation-pipeline responsibilities. The application no longer exports the previous `inferDatasetMetadata` or `loadCsv` compatibility helpers, and dashboard import rejects the obsolete layout-only format rather than guessing its data source.
