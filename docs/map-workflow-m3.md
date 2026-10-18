# Map workflow — M3: first choropleth chart

M3 adds a dashboard chart type that colors mapped regions by an aggregated numeric measure. It uses the M0 geography contract and M1/M2 column role and assignment workflow.

## Creating a map chart

From Dashboard, add a chart and select **Choropleth Map**. Choose a built-in map, a column annotated with a geographic role, a numeric value, and an aggregation (sum, average, minimum, maximum, or count). The chart uses saved assignments from the Maps workspace; it does not run matching during rendering.

## Data behavior

- Only explicitly mapped source values contribute to regions.
- Multiple source values can map to one region; the selected aggregation is applied across their raw rows.
- Unmapped source values are excluded and counted in the chart summary. The Maps workspace remains the place to fix them.
- Regions without a valid numeric result use the missing-data fill rather than zero.
- Clicking a region filters the dashboard to source values assigned to that region.
- The map chart configuration is stored in the existing dashboard visualization state and therefore participates in project export/import.

## Geometry limitations

At the end of M3, the initial North America country map used schematic polygons for Canada, Mexico, and the United States. M4 replaces those shapes with locally bundled Natural Earth country-boundary GeoJSON; see `map-workflow-m4.md` for provenance and remaining limitations. The map still does not provide state/province geometry or broad world coverage.
