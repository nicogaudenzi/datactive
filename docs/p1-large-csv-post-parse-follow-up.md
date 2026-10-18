# Large CSV follow-up: parsed-table cache and allocation reduction

- Local CSV files still persist as Blob in IndexedDB under the import record.
- The first parse stores the parsed raw table in a separate IndexedDB record keyed by filename and Blob size. Reloads can restore the parsed table rather than reparsing the source file.
- Canonical column type inference now scans cells without allocating a full values array and filtered copy per column.
- Quality checks now build only compact per-column evidence (type examples, numeric values for outlier analysis, and string values for category-variant analysis) instead of multiple full row-wrapper arrays.
- Category-variant row-index evidence is capped at 100 indices per exact value to prevent repetitive categories from retaining unbounded index arrays. Findings remain advisory; the cap affects only the preview indices retained in evidence.

Validation in this environment: syntax checks passed. `npm test` executed 190 tests; 188 passed and 2 test files could not load because dependencies `d3` and `xlsx` were not installed after `npm install` timed out. Browser tests and production build were not run.
