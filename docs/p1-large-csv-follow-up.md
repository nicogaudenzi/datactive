# P1 follow-up: large CSV import

## Changes

- Local CSV files are saved as their original `File` object in IndexedDB before parsing. This avoids expanding the file into JavaScript row objects before persistence and avoids relying on `localStorage`/`sessionStorage` for large binary payloads.
- On startup, the saved file is parsed in a module Web Worker. Worker status messages distinguish reading and parsing; failures return an import error instead of silently continuing.
- The app no longer stores a second full CSV string for this local-file path. Project export still creates a portable CSV source from the in-memory raw table when requested.
- Raw-table and canonical-dataset validation retain their defensive-copy defaults, but trusted internal pipeline stages can opt out of repeated row cloning and redundant row-by-row shape checks. Transformation operations that change rows still create new rows as before.
- If IndexedDB cannot store the `File`, the app reports a storage error instead of falling back to JSON serialization, which would lose the file bytes.

## Scope and limitations

This is a focused responsiveness and copy-reduction step, not a complete out-of-core data engine. Parsed rows still live in memory, canonical dataset metadata inference and profiling still run on the main thread, and transformations may allocate new row objects. If a large file still stalls after parsing, profiling or rendering is the next bottleneck to isolate. Excel parsing is unchanged.

## Tests

The browser test now verifies that a CSV larger than 5 MiB is stored as a `File`/`Blob` in IndexedDB rather than as a large text string or pre-expanded row table. Unit tests cover the option to avoid retaining source text and existing raw-table/canonical validation defaults.

## Follow-up: streamed worker parsing after a 48 MB freeze report

The first worker version still called `file.text()` and `d3.csvParse()` for the entire file, then returned the entire row array in one structured-clone message. That left a large transient memory peak and a long period with no useful progress feedback.

The follow-up changes the worker to:

- Read the source using `File.stream()` and `TextDecoder`, without materializing one full CSV text string.
- Parse CSV records incrementally, including quoted commas, escaped quotes, and newlines inside quoted fields.
- Send parsed rows to the main thread in bounded batches of 2,000 records rather than one enormous message.
- Report bytes processed and row counts so the import status can show progress during parsing.
- Preserve the raw string values and common d3-dsv behavior for missing/extra fields.

This reduces the worker's transient memory usage and avoids a single huge structured-clone transfer. The app still retains all parsed rows as objects in memory, and canonical type inference/profiling still occur after parsing. Those remain potential bottlenecks and this change does not promise that every 48 MB CSV will fit on every device. Excel parsing is unchanged.

### File payload persistence correction

The local-file import record now stores the source bytes as a plain `Blob` in IndexedDB and stores the original filename separately. When restoring, the app reconstructs a `File` with that name before passing it to the CSV adapter. This avoids relying on `File` metadata being preserved consistently in IndexedDB structured cloning while retaining the original bytes. The persistence error guard checks for a blob-like payload by its numeric `size`, rather than requiring `instanceof Blob`.
