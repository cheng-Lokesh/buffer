# Same-account relogin and queue resumption — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md account switching, stale responses and automatic
retry of previously confirmed offline work. No visual/media changes.

- `e2ee6f9` RED: eleven pass, two fail. App has no session-view generation and
  bridge acknowledges stale confirmation after logout/relogin to the same owner.
- `c618977` GREEN: explicit login/logout advance a memory-only view generation,
  concurrent login calls coalesce, and bridge verifies the captured generation
  before reading/displaying success. Twenty-one related tests pass.
- `68654ea` RED: shared web/native controllers leave own prior confirmed queue
  pending after relogin (twelve pass, two fail).
- GREEN: after account cache activation, pending confirmed work is retried;
  conflicts remain blocked. No legacy storage read or implicit migration occurs.

Executed:
`node scripts/build-mini-shared.mjs`
Exit 0; shared native controller regenerated.

`node --test --experimental-test-coverage --test-coverage-include=src/account-controller.js --test-coverage-include=miniprogram/core/account-controller.js --test-coverage-include=miniprogram/utils/account-store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-account-controller.test.js test/public-mini-account-store.test.cjs test/public-mini-account.test.cjs test/public-mini-account-lifecycle.test.cjs test/public-mini-history-account.test.cjs`

Exit 0, thirty-two pass, no failures/skips. Lines 100% for all three modules.
Controller branches: web 96.36%, native 96.49%, functions 100%. Store branches
83.33%, functions 85.19%. App source is exercised through native contract VM
fixtures, not falsely counted as covered by the filtered module coverage report.

## Limits

Tests prove fixtures/state-machine behavior, not physical handset or live cloud
financial writes. Full migration/deletion/conflict UI, rendered sync feedback,
web identity association and real five-second propagation still need completion.
The pending cloud permission-change confirmation was not treated as given.
No cloud privileges, billing, password protection or existing-device uploads changed.
