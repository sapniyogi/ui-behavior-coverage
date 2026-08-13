# Contributing

Use Node.js 20 or newer. Before a pull request, run `npm ci`, `npm run check`, `npm test`, and `npm run pack:check`.

Prefer precision over recall. A VERIFIED result needs explicit evidence. New inference rules should include false-positive guards, and behavioral coverage must remain separate from design-system conformance.

JSON output is versioned with `schemaVersion`; incompatible machine-readable changes require a schema migration.

This project is independently implemented from research concepts. Reuse third-party material only when its license or permission has been verified.
