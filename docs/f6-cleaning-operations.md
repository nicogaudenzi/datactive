# F6 — Cleaning operations and UI

F6 adds a first user-facing editor to the Profile / Prepare workspace. Cleaning steps are explicit JSON-serializable definitions stored in tab-scoped session storage and replayed against the original raw table on each load.

## Available operations

- **Trim whitespace** in one column.
- **Normalize text case** to lower- or uppercase.
- **Replace a value** using an exact string match.
- **Fill missing values** with a user-provided string. Empty and whitespace-only strings count as missing.
- **Remove rows with missing values** in one selected column.
- **Remove duplicate rows**, either across all columns or by a selected key-column list at the API level. The UI currently exposes exact whole-row duplicate removal.

Each new operation must be previewed before it can be applied. The preview reports changed/removed row counts and shows a small before/after sample. Applied steps are ordered; users can move them up/down or remove them. Any edit rebuilds the prepared dataset from raw input, so removing a step does not need an inverse mutation.

## Boundaries

- Raw imported values are not mutated.
- All current CSV values remain strings; F6 does not perform type conversion.
- Preview is a sample-based confirmation, not a full audit diff.
- Step definitions and imported source text remain session-scoped; they are not yet included in dashboard export/import or durable project files.
- Browser smoke testing and production build still need to be performed locally after installing dependencies.


## F6 follow-up: date conversion and finding review

- `convert-to-date` is a serializable preparation step. It normalizes parseable values to `YYYY-MM-DD` and lets the user choose how invalid non-missing values are handled: replace with missing, keep the original value, or remove the row. Existing blank values remain blank.
- Applying, removing, or reordering preparation steps reloads the app but returns the user to Profile / Prepare rather than Import Data.
- Quality findings can be marked Reviewed or Ignored without modifying dataset values. Statuses are stored in session storage per source/schema and are shown in the finding list and summary. These statuses are local review metadata, not data transformations, and are not yet included in project export/import.

## Derived columns

The cleaning editor includes a serializable `derive-column` transformation. Set a new column name, an expression, and a result type (`number`, `text`, or `date`). Expressions use bracketed column references such as `[Revenue] - [Cost]`; column names with spaces are supported. The safe expression parser supports `+`, `-`, `*`, `/`, `%`, parentheses, numeric literals, quoted string literals, and `YEAR`, `MONTH`, `DAY`, `FORMAT_MONTH`, `TRIM`, `LOWER`, `UPPER`, `CONCAT`, `ABS`, and `ROUND` functions. No arbitrary JavaScript is evaluated.

Missing or invalid inputs produce a blank result. Numeric results are stored as numbers; text/date results are strings (dates normalized to `YYYY-MM-DD`). Steps are replayed in order from the raw table, so later derived columns can reference earlier derived columns. The sample `month` column now uses `FORMAT_MONTH([date])` through the same general transformation instead of the legacy sample-only transformation. Conditional expressions and richer formula support remain deferred.
