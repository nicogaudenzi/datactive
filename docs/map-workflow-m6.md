# M6 — Geographic matching and choropleth feedback

M6 builds on the M0–M5 map contracts and keeps the map catalog limited to North American countries, US states, Mexican states, and Canadian provinces/territories.

## Geographic matching

- Suggestions use normalized exact matches against each selected map's region names and aliases.
- The bundled Natural Earth Admin 1 metadata includes common names, alternate names, postal abbreviations, and ISO 3166-2 subdivision codes where available.
- Matching is map-specific: `US-CA` can match California on the US states map, but is not treated as a Mexican state.
- Ambiguous and unmatched values remain unresolved; there is no fuzzy or partial auto-assignment.
- Existing explicit assignments take precedence over suggestions. Users review and save assignments in the Maps workspace.

## Choropleth feedback

- The legend shows the numeric color-scale endpoints and a separate gray `No data` swatch.
- A valid numeric zero remains a data value and is colored by the scale; missing, blank, or invalid measures are gray.
- The chart summary reports regions with valid data and distinct unmapped source values. Unmapped values are excluded from aggregation.
- Region clicks continue to apply/toggle filters for the source values assigned to that region.

## Geometry provenance

Subnational geometry is bundled from Natural Earth 1:10m Admin 1 — States and Provinces, version 5.1.1, public domain. Geometry is simplified for browser rendering; it is intended for analytical visualization, not legal or cadastral boundary use.
