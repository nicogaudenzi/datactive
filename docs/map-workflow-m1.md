# Map workflow — M1

M1 adds the first user-facing geography setup flow on top of the M0 contract.

## Column annotation

Every column in **Annotate** has an independent **Geographic role** selector. A geographic role is descriptive metadata; it does not require a match to a map and does not change source values. Saving column metadata preserves the role in `processing.metadataOverrides` on project export/import.

## Maps workspace

The **Maps** workflow tab sits between **Annotate** and **Dashboard**. It is disabled until at least one column has a saved geographic role. The workspace lets the user select an annotated column and a map definition, then explicitly assign each distinct prepared value to a region. Blank selections remain unmapped. The summary reports mapped and unmapped distinct values.

The first built-in map is `north-america-countries`, a starter country-region list containing Canada, Mexico, and the United States. Region IDs are stable and are what assignments store; display names are not identifiers. Aliases are catalog metadata only and are not automatically applied in M1.

Manual assignments are stored in `processing.geography.mappings` using the existing M0 contract:

- `mapId`: stable map identifier
- `column`: source/prepared column name
- `values`: typed `sourceValue` plus stable `regionId`

Saving mappings writes them to the current tab's project state, and the existing export/import flow preserves them. Mappings for other columns and maps are retained when editing one mapping.

## Deliberate limits

- This stage configures mappings; it does not render a map chart.
- Only one built-in starter map is available. It contains three country regions, not full world coverage.
- Matching is manual. Aliases do not silently auto-assign values.
- Uploading custom maps, automatic matching, ambiguity review, and map-chart rendering belong to later stages.
