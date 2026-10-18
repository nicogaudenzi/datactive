# Data quality findings (E2)

`src/data/quality-findings.js` exports `findDataQualityIssues(canonicalDataset, options?)`. It accepts the canonical dataset contract and returns a versioned `data-quality-findings` result. It is read-only: it does not mutate rows, normalize values in-place, or apply corrections.

## Finding types

- `mixed-types`: a column contains multiple observed value types. Evidence includes counts and row-indexed examples.
- `category-variants`: string values collapse to the same comparison form after Unicode decomposition, accent removal, trimming, and case folding. Original values and row indices are retained. This is only a suggestion; similarly spelled values can have different meanings.
- `duplicate-rows`: exact duplicate rows across the canonical dataset's declared columns, with row indices and a sample.
- `numeric-outlier`: numeric values outside the 1.5×IQR fences when at least four numeric observations are available and the IQR is nonzero. This is a review prompt, not a claim that the value is invalid.

Row indices are zero-based offsets in `dataset.rows`. Findings are source-independent; source metadata does not influence results. `options.maxExamples` controls evidence examples and is capped at 20.

## Deliberate limitations

- No automatic cleaning, type coercion, row deletion, or category merging occurs.
- Category normalization only groups likely variants; it does not assert semantic equivalence.
- Outlier detection is a simple univariate heuristic and may be inappropriate for skewed or naturally heavy-tailed data.
- Findings are currently an API, not yet displayed in the application. The Data/Prepare workspace is a later increment.
