# Foreground polling and scenario refresh, 2026-10-11

Source: PUBLIC_SERVICE_PRD.md automatic propagation, offline and scenario isolation.
No page layout, styles or assets changed.

## Checkpoints

- 90c7db8 RED: three missing-loop tests fail at the intended missing factory assertion.
- 1492e27 GREEN: three pass. Shared loop schedules at 3 seconds, coalesces lifecycle
  starts, stops on background/logout/conflict/expired session and backs off failures to 60 seconds.
- db4ea5f RED: four native lifecycle tests pass, foreground remote-observation test fails.
- c94a019 GREEN: native lifecycle/auth suites nine pass. App mounts foreground polling;
  hide, network disconnect and logout cancel future reads. Old auth VM fixture gained a
  deterministic timer adapter, not relaxed behavior assertions.
- 44b52bd RED: five page tests pass, stale scenario recomputation test fails.
- 666a3e7 production change: refresh reruns the last explicit patch, not unsent input;
  unavailable scenario clears stale result and reports a sanitized explanation.
  The immediate rerun still failed because its error fixture replaced a module property
  after destructuring. This commit alone is not a GREEN checkpoint.
- 06107d6 GREEN: fixture switches failure through the captured adapter; six page tests pass.
  No production code or assertion was weakened to repair the fixture.
- 5644539: both generated/native and web loop contracts expanded with cancelled callbacks,
  request exceptions and adapter validation. Thirteen polling/lifecycle tests pass.

## Executed verification

`node --test --experimental-test-coverage --test-coverage-include=src/account-sync-loop.js --test-coverage-include=miniprogram/core/account-sync-loop.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-account-sync-loop.test.js test/public-mini-account-lifecycle.test.cjs`

Exit 0: 13 pass, both loop implementations 100% lines/branches/functions.

`node scripts/build-mini-shared.mjs --check`: exit 0, no generated drift.

`node --test test/public-account-controller.test.js test/public-account-sync-loop.test.js test/public-mini-account.test.cjs test/public-mini-account-lifecycle.test.cjs test/public-mini-account-view.test.cjs test/public-mini-other-account-pages.test.cjs test/public-mini-reality-account-page.test.cjs test/public-mini-account-store.test.cjs test/public-mini-history-account.test.cjs test/public-mini-storage-guard.test.cjs test/public-mini-account-entry.test.cjs`

Exit 0: 72 pass, zero failures/skips.
`npm run test:miniprogram`: exit 0, 29 pass.
Official WeChat preview: exit 0, 217453 bytes against configured AppID.

## Limits

The tests advance deterministic timers and use native transport fixtures. Three-second
cadence is an implementation setting, not measured real two-device latency. Web scheduler
is shared and tested but not yet mounted into a trusted web account flow. Native simulator
and actual phone rendered acceptance remain unproven. Existing cloud sync backend has not
been deployed pending permission confirmation. No resource purchase, billing, legacy
upload or password protection change occurred. Interactive conflict comparison remains.
