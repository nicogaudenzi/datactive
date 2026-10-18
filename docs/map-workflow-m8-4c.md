# M8.4c — Geography mapping persistence

Geography source-value-to-region assignments now persist in browser `localStorage`, independently of the custom-map catalog. Storage keys are scoped to the source identity and the active dataset columns, so unrelated sources do not share assignments.

The persistence helper validates configurations on save and load. Invalid stored configurations are removed and replaced with an empty valid configuration; unavailable or full browser storage fails safely. The current mapping contract continues to reference stable `mapId` and `regionId` values, never display labels.

This stage does not bundle custom map records and geography assignments into project export/import. That integration remains a later stage. Browser storage is local to this browser/profile and is not a cloud backup.
