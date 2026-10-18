# M5 — State and province choropleths

M5 extends the M0–M4 map contract and renderer with three subnational maps:

- `us-states`: 50 US states plus the District of Columbia (51 regions)
- `mexico-states`: 32 Mexican federal entities
- `canada-provinces`: 10 provinces and 3 territories (13 regions)

## Geometry source

Bundled geometry is derived from the Natural Earth 1:10m Admin 1 — States and Provinces shapefile, version 5.1.1, supplied for this checkpoint by the project owner. Upstream: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/. Natural Earth data is public domain. The geometry is filtered to USA, Mexico, and Canada and simplified with topology preservation at 0.025 degrees to keep the client bundle manageable.

## Stable IDs and aliases

Feature IDs are based on the ISO 3166-2 subdivision code, normalized to lowercase with a country prefix (`us-ca`, `mx-oax`, `ca-on`, etc.). Feature properties include the official subdivision code, postal abbreviation where available, display name, and alternate-name aliases. Saved user mapping records continue to reference stable map and region IDs, not display labels.

## Behavior

The same `MapChart` renderer, aggregation model, missing-data handling, and click-to-filter contract are reused. State/province labels use postal/ISO abbreviations to avoid crowding. Existing country map IDs and geometry remain unchanged.

## Scope and limitations

This is a static, locally bundled dataset; no network request is made at render time. Natural Earth geometry is generalized for cartography and is not a legal or cadastral boundary source. Canada includes provinces and territories; the US map includes DC; Mexico includes the 32 federal entities represented in the dataset.
