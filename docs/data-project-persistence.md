# Data project export and import

The header actions export/import a complete data project rather than a dashboard layout alone.

A project document contains:
- a CSV data-source reference and expected **raw** source columns;
- the ordered, replayable preparation/cleaning transformation definitions;
- column descriptions and type/role overrides;
- visualization configurations and grid layout;
- optionally, the original raw CSV text.

Export asks whether to embed a copy of the raw source CSV. Embedding creates a portable, self-contained JSON project. Without embedding, the project retains the source reference and expected raw column names. On import, the app uses the current dataset only after confirmation if it contains the expected columns; otherwise it asks the user to choose a CSV file with those columns.

Import stages the source and project settings in session storage, then reloads through the normal source adapter and preparation pipeline. This avoids persisting transformed rows as the source of truth. Transient chart filters and runtime chart objects are not exported.
