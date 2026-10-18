# Annotation workspace

The Annotate workspace edits descriptions and column type/role overrides in one form and persists them with a single **Save all metadata** action. Edits remain local to the current browser tab and active source/schema identity until saved. Save validates the complete set before writing either metadata store; validation errors are shown in the workspace. On success, the app reloads so type/role overrides are applied through the canonical dataset startup path, then returns to Annotate with a status message.

Descriptions are user-facing metadata, not transformations: they appear in the Prepare column profile table and selected-column details, and as native tooltips on chart field selector options and inline column choices. They do not modify source values, inferred type/role, profiling calculations, or chart aggregation behavior. Type/role overrides affect chart field eligibility but do not coerce values.
