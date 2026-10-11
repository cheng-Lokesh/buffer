# Native App account lifecycle — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md identity, confirmation, reconnect and migration boundaries.

## Checkpoints and guarantees

- `57b3c52` RED: two executed tests fail because App has no confirmed-sync/status
  methods. Existing login fixtures now permit only account-scoped cache reads and
  return actual undeployed-endpoint status rather than pretending cloud readiness.
- `c9a03dc` GREEN: five tests pass. App composes real shared session, transport,
  sync client and controller with native wx request/storage adapters. A test fixture
  was corrected to accept wx request's object data contract (not a JSON string).
- Additional authentication fences pass: signed-out migration, deletion and
  conflict actions fail without network/storage reads; invalid adapters fail closed.

Confirmed operations persist in own account queue before sending; startup makes
no hidden requests, reads no legacy storage; tokens are not persisted. Foreground
and network recovery refresh/retry. Logout hides account facts and preserves queues.
Operation IDs are idempotency identifiers, not credentials.

## Commands actually run

`node --test test/public-mini-account-entry.test.cjs test/public-mini-sync-transport.test.cjs test/public-mini-account-lifecycle.test.cjs test/public-mini-account.test.cjs test/public-account-controller.test.js`

Exit 0, 25 pass before additional signed-out fence test.

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-controller.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-lifecycle.test.cjs test/public-mini-account.test.cjs`

Exit 0, 6 pass; adapter lines/branches/functions 100%.

Official WeChat CLI `preview --project C:/Users/clf04/缓冲区/miniprogram` with
QR/info output under the existing Codex validation temp directory: exit 0,
actual AppID wxc7f8da28fa006f64, total package 197214 bytes. No review/publish performed.

## Not proven / remaining

Tests use platform contract fixtures, not human/handset behavior. Cloud sync API
is not deployed; native login therefore may succeed while sync remains unavailable.
App API is mounted, but page/store confirmation buttons and account data views
still need wiring. Current local pages are not silently switched to empty cloud
state, and their old data is not auto-migrated. Account controls, conflict display,
backup migration UI, web identity linking and five-second cross-end visibility
still require implementation/real acceptance. No visual direction, cloud permission,
billing, legacy keys or website password protection was changed.
