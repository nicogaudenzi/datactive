# Guided workflow and CSV URL import

The application now presents four workflow tabs in the expected order:

1. **Import Data** — select a local CSV or fetch a direct CSV URL.
2. **Profile / Prepare** — inspect column profiles, quality findings, and source rows.
3. **Annotate** — add human-readable descriptions to columns.
4. **Dashboard** — explore and build charts with cross-filtering.

Import Data is the initial workspace. The bundled sales dataset remains loaded as a fallback until a new source is imported. Imported CSV text is stored in `sessionStorage` for the current browser tab so the existing startup pipeline can construct the same canonical dataset after reload. No CSV upload endpoint or backend storage is involved.

## URL import limits

URL import uses browser `fetch` and accepts HTTP/HTTPS URLs that return CSV text directly. The remote server must allow the browser's origin through CORS. A failed request may be caused by CORS, connectivity, authentication, or a non-CSV response; the UI provides a useful general error but cannot bypass browser security restrictions. Users can download a file and use local upload if the host does not permit browser access.

## Annotations

Column descriptions and type/role overrides are stored in tab-scoped `sessionStorage`. Annotate has one Save all metadata action. Descriptions appear in Prepare column profiles and as tooltips in chart field selectors; they do not change raw values or calculations. Type/role overrides affect chart field eligibility but do not coerce values.
