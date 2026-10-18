# P1 large CSV post-parse responsiveness fixes

This checkpoint addresses avoidable main-thread work after a CSV worker finishes parsing.

- Dataset profiling validates the canonical schema once and does not clone all rows during read-only analysis.
- Per-column profiling reuses that validated dataset instead of validating/cloning it once per column.
- Data-quality analysis also avoids cloning the full dataset.
- Duplicate-row analysis no longer retains a full sample object for every unique row; it creates sample objects only for actual duplicate groups.
- The Import Data status now reports `Profiling`, `Checking data quality`, and `Ready` phases after parsing. The inspection view yields to the browser before each analysis phase so status changes can paint.

Profiling and quality analysis still run synchronously within their individual phases. This is an incremental optimization, not a guarantee that every large dataset will be non-blocking. If the user's 147,209-row dataset still freezes within either phase, the next step is to move those analyses into a worker or chunk them with yielding, based on a measured profile.

Verification in this environment: focused profiling and quality-finding tests pass (17/17); JavaScript syntax checks pass. Full suite/build/browser tests were not run because project dependencies (`d3`, `xlsx`, and others) are not installed in this environment.
