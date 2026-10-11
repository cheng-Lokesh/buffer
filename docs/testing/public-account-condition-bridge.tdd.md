# Account conditions, drafts and export — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md, complete condition/forecast semantics, confirmed
operations and equal backup rights. These checkpoints do not prove full page wiring.

## TDD checkpoints

- `ec6b16d` RED: both platform tests reject the valid recurring expense daily-floor
  inclusion flag at the account confirmation boundary.
- `00b99a9` GREEN: 23 relevant tests pass. Shared capture preserves a strictly boolean
  flag only for recurring expenses; invalid/string and income flags fail atomically.
- `b35b2d4` RED: native condition/draft/export methods missing; five pass, two fail.
- `6631375` GREEN: seven bridge tests pass. Precise conditions map to shared capture,
  edits/drafts use canonical operations and exports contain only the current account.

## Actual executed checks

`node --test --experimental-test-coverage --test-coverage-include=src/account-confirmation.js --test-coverage-include=src/v12-reality-capture.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-included-expense.test.js test/public-account-confirmation.test.js test/v12-reality-capture.test.js test/public-capture-parity.test.cjs test/public-confirmation-parity.test.cjs`

Exit 0, 30 pass. Confirmation: 100% lines/functions, 94.26% branches. Capture:
100% lines/functions, 97.18% branches.

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-store.test.cjs`

Exit 0, seven pass. 100% lines/functions, 84.21% branches.

`node --test test/public-included-expense.test.js test/public-mini-account-store.test.cjs`

Exit 0, nine pass after strengthening the financial outcome checks: an included
daily expense leaves forecast closing balance equal to baseline; the same expense
outside daily spending decreases it, on both shared web/native engines.

## Guarantees / limits

Bridge now covers basics, capture, occurrence/event confirmation, new recurring
conditions/known future events, precise condition edits, saved scenario drafts and
own-account backup export. This factory is not yet mounted in pages. Skin preferences,
account-aware migration/delete prompts and all asynchronous page actions remain to
be connected together. Existing local dialogs cannot authorize cloud changes.
Tests use fixtures; cloud sync deployment, real account linking, handset UX and
five-second propagation are not proven. No data was uploaded, cloud permissions
changed, billing enabled or visual direction replaced by these commits.
