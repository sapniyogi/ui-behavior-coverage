# JSON report schema v1

JSON output includes `schemaVersion`, `toolVersion`, `reportType`, `summary`, and the complete analyzer `report`.

`reportType` is `project` for `scan` and `component` for `analyze`. New integrations should check `schemaVersion` and prefer the nested `report` and `summary` fields. Schema v1 also preserves pre-schema raw report fields at the top level for compatibility.

Incompatible machine-readable changes require a new schema version.
