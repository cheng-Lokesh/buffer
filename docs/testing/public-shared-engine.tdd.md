# Authoritative cash engine parity, 2026-10-11

The web engine `src/v8-cash-reality.js` is now the one authoritative source.
`scripts/build-mini-shared.mjs` generates the native CommonJS module and checks
it byte-for-byte after newline normalization. All 16 exports are available on
both platforms. This is engine parity, not completion of page or cloud parity.

## RED / GREEN

- ef44f27 first RED exposed independent native source, missing temporal API
  and unsupported multi-operation scenarios. One scenario fixture used a wrong
  field and was corrected in cd2a276 before production implementation;
  the corrected suite still failed 3/3 for the genuine missing capabilities.
- fc1eef3 RED exposed the optional Intl dependency on the native runtime.
- GREEN: `npm run test:public-parity`, 20/20, exit0. Both engines execute explicit
  expected-outcome tests for recurrence reconciliation, temporal comparisons,
  scenario isolation, saved drafts, typed events and malformed persisted records.
  Combined coverage lines/branches/functions 99.89/84.27/94.64%; each platform's
  branch coverage independently exceeds 80%. The original gates are not lowered.
- Native runtime compatibility fixtures deliberately omit structuredClone and
  Intl, and compare full JSON outputs including currency formatting.
- Mini Program regression 28/28; sync/lookup 41/41; `npm run build`, exit0.
- Full native-core coverage gate (unchanged thresholds) 90/90, exit0,
  lines/branches/functions 98.18/84.93/96.74%; release verifier 36/36.
- Parser/security regression 22/22. Historical governance suite 6/10:
  four failures concern private-checkout retired material, a whitelist excluding
  current public-service files, and an old one-commit-history assertion. They
  are not recorded as PASS; do not delete backups/history or loosen data gates
  to make them disappear. Public-root ancestry must be independently checked
  before selected commits are published.

Existing website layout, assets and motions are not edited. The web source adds
fallbacks only when optional APIs are absent. Financial facts, old backups and
the old engine's migration evidence are not deleted. The generated native engine
also preserves current web temporal fields instead of losing them in normalization.

Developer-tool compilation and live execution of the updated full engine remain
required. These unit/VM results are not a handset, durable-sync or public-release
PASS. The protected website must stay protected.
