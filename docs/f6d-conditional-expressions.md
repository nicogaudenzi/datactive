# F6d — Conditional derived-column expressions

Derived-column expressions support row-wise conditional logic using the safe parser in `src/data/preparation/expression.js`. Expressions remain plain serializable strings in transformation definitions and replay from the raw source through the existing ordered preparation pipeline.

## Supported syntax

- Comparisons: `>`, `>=`, `<`, `<=`, `==`, `!=`
- Logical operators: `AND`, `OR`, `NOT`
- Conditional function: `IF(condition, trueValue, falseValue)`; branches may be nested
- Missing-value predicate: `IS_MISSING(value)`
- Existing arithmetic and functions remain available, including `YEAR`, `MONTH`, `DAY`, `FORMAT_MONTH`, `TRIM`, `LOWER`, `UPPER`, `CONCAT`, `ABS`, and `ROUND`.

Example:

```text
IF(IS_MISSING([Revenue]), "Unknown",
   IF([Revenue] >= 200, "High",
      IF([Revenue] >= 100, "Medium", "Low")))
```

## Missing and invalid inputs

- `IS_MISSING(value)` returns true for null, empty, and whitespace-only values. It does not treat arbitrary non-empty text such as `not reported` as missing.
- A comparison with a missing operand returns an unknown result (represented internally as null); an invalid numeric value in a numeric comparison also returns unknown.
- `IF` returns a blank result when its condition is unknown. This avoids silently routing invalid numeric values into the false branch.
- `AND` and `OR` short-circuit when the known left operand determines the result; otherwise, unknown operands propagate an unknown result.
- Derived-column result-type conversion remains unchanged: null/blank becomes an empty string; a numeric result requested as number must convert to a finite number.

The parser does not evaluate arbitrary JavaScript. Unsupported identifiers, characters, functions, and invalid function arity are rejected during validation.
