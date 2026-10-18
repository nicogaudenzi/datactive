# Map workflow M7 — interaction and presentation

M7 adds map-specific presentation controls on top of the M0–M6 geography contract.

## Included

- Inline chart-header selectors for the numeric measure and aggregation. Edits update the map query, rerender the existing map, preserve custom titles, update automatic titles, and persist with the dashboard.
- Region hover tooltips show the region name, selected measure, aggregation, aggregated value or explicit “No data” state, and row count.
- Wheel/pointer zoom and pan through D3 zoom, with a keyboard-operable reset control. Double-click zoom is disabled to avoid accidental zoom while interacting with regions.
- Existing click-to-toggle region filtering, map IDs, saved assignments, geometry, and no-data semantics remain unchanged.

## Verification notes

Run `npm test`, `npm run test:browser`, and `npm run build` from the project root. The authoring environment used for this checkpoint did not have `d3` and `xlsx` installed, so the full test command could not load two test files and browser/build checks were not run there.
