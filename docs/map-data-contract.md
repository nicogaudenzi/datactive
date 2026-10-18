# Map data contract (M0)

Map charts consume a stable geography contract rather than matching directly against display labels or source-specific fields.

## Geographic column roles

`processing.metadataOverrides[column].geographicRole` is independent from the inferred data type and generic role (`dimension`, `measure`, etc.). Supported initial roles are `country`, `state-province`, `county-district`, `city`, `postal-code`, and `custom-region`. A role is a user declaration, not a claim that automatic matching will succeed.

## Map definition

A map definition has this renderer-independent shape:

```js
{
  version: 1,
  id: 'us-states',          // stable map identity
  name: 'United States',    // presentation label
  regionType: 'state-province',
  regions: [
    { id: 'US-CA', name: 'California', aliases: ['CA', 'Calif.'] }
  ]
}
```

Region IDs are stable within the map. Labels and aliases are for display and future matching; persisted user mappings target IDs, not names. A future uploaded map must provide or receive stable IDs for its regions.

## Persisted user mappings

The project document stores mappings under `processing.geography`:

```js
{
  version: 1,
  mappings: [
    {
      mapId: 'us-states',
      column: 'State',
      values: [
        { sourceValue: 'Calif.', regionId: 'US-CA' },
        { sourceValue: 'New York', regionId: 'US-NY' }
      ]
    }
  ]
}
```

`sourceValue` preserves its primitive type, so numeric `1` and string `'1'` are distinct values. Each map/column pair occurs once, and each source value occurs at most once within that mapping. The region ID is checked against the selected map when a map definition is available. A missing assignment is **unmapped**, not guessed. M0 reports unmapped and invalid-region values; automatic matching and ambiguity scoring are intentionally deferred.

Geography configuration is optional when importing older project documents. Export/import preserves it alongside the geographic role in `metadataOverrides`.
