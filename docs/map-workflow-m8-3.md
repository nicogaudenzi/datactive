# M8.3 — Custom region aliases and mapping diagnostics

## Included

- Custom-map catalog entries can define aliases for each region, one alias per line (commas are also accepted).
- Aliases are stored in the in-memory custom-map definition and participate in the existing conservative, normalized exact-match suggestion flow.
- Alias collisions across regions remain ambiguous; the matcher never silently chooses a region.
- Choropleth footnotes show up to five distinct unmapped source values, in addition to the count, so users can identify which values need assignments in the Maps workspace.

## Matching behavior

Aliases are normalized with the same matching rules as names: case, accents, punctuation, apostrophes, and whitespace are normalized. Matching remains exact after normalization. Existing saved assignments take precedence over suggestions.

## Limitations

Custom map definitions and aliases are session-only. Saving region assignments still persists through the existing geography configuration, but custom geometry/definitions/aliases are not yet included in project export/import. If a custom map's region ID property is changed, prior region assignments for that map should be reviewed/remapped.
