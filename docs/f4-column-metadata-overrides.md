# F4 — User-overridable column types and roles

The Annotate workspace now lets users edit each column's effective type (`number`, `date`, `string`, `boolean`, `unknown`) and role (`dimension`, `measure`, `identifier`, `ignore`). Descriptions remain available alongside those controls.

- Overrides are validated and applied to canonical `columnMetadata` during startup.
- Overrides are stored in `sessionStorage`, scoped by the active source identity and column list.
- Saving metadata reloads the app so the Data / Prepare workspace and chart field selectors use the updated metadata consistently.
- Source cell values are not coerced or cleaned by these controls.
- Automatic inference is retained separately at runtime to show the original suggestion next to the current value.
- Overrides are not yet part of dashboard export/import; persistence beyond the browser tab is deferred.

Tests cover valid overrides, invalid stored values, unknown columns, and preservation of raw values. Browser smoke testing remains a manual verification step.
