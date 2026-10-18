# M8.4a — Custom map document contract

This stage defines the portable data model for custom maps. It does not yet persist maps in browser storage or wire the records into dashboard project export/import; those are later M8.4 stages.

## Record shape

A custom map record uses schema `datactive/custom-map`, version `1`, and contains:

- `id`: stable map identifier copied from the catalog definition; import/restore must preserve it rather than regenerate it from the name.
- `name`: user-facing map name.
- `sourceGeoJSON`: validated source FeatureCollection, preserving source feature properties and geometry.
- `idProperty` / `labelProperty`: the selected source properties for region identity and display labels.
- `aliasesByRegion`: aliases keyed by stable region ID.
- `regions`: normalized region definitions with stable `id`, display `name`, and aliases.

A collection uses schema `datactive/custom-map-collection`, version `1`, and a `maps` array. Duplicate map IDs are rejected.

## Identity rules

- Region IDs are derived from the selected GeoJSON ID property and stored explicitly in `regions`.
- Region display labels and map names are not identity.
- Region assignments should continue to refer to map IDs and region IDs, not display labels.
- Editing the selected ID property can change region IDs; callers must treat this as an identity change and handle existing mappings explicitly.

## API

`src/maps/custom-map-document.js` exports `createCustomMapRecord`, `validateCustomMapRecord`, `createCustomMapCollection`, and `validateCustomMapCollection`, along with schema/version constants. The functions clone JSON-compatible values and validate GeoJSON, unique IDs, region identity, and alias references.

## Deliberately out of scope

No browser storage, automatic restore, project import/export integration, migration, or UI changes are introduced in M8.4a.
