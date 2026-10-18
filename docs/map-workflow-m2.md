# Map workflow — M2: matching suggestions and review

M2 adds conservative automatic suggestions and a visible review report to the M1 geography setup flow. It still does not render a map chart.

## Matching rules

`src/maps/geography-matching.js` matches distinct source values against each map region's name and aliases after normalization:

- Unicode accents/diacritics are removed for comparison.
- Comparison is case-insensitive.
- Punctuation, apostrophes, and repeated whitespace are normalized.
- A match must be an exact normalized label or alias. Partial/fuzzy matching is not used.

The matcher returns one of:

- `matched`: exactly one region matched; the UI proposes that region.
- `ambiguous`: more than one region matched; no region is proposed, and candidate region names are shown.
- `unmatched`: no region matched; the user can assign it manually.
- `blank`: empty/missing value, kept separate from unmatched values.

Existing saved assignments take precedence over suggestions and are never overwritten by the suggestion action. Suggestions only modify the unsaved form controls; users review and click **Save region mappings** to persist changes. The persisted M0/M1 contract is unchanged.

## Limits

- Matching is deterministic and exact-after-normalization, not fuzzy or geographic inference.
- The current starter map has only Canada, Mexico, and the United States, so it is a workflow prototype rather than broad country coverage.
- Alias collisions are treated as ambiguous rather than resolved by ordering.
- M2 does not render choropleths, upload custom map files, or match state/county/city geometries.
