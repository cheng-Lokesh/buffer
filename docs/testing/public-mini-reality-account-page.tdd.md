# Actual native reality-page account wiring — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md. Preserve the current visual baseline while routing
user-confirmed reality changes through the shared account lifecycle.

## Checkpoints

- `f7c1fea` RED: both actual page-controller tests invoke the old local writer,
  rather than the account bridge. Empty balance also reaches that writer as zero.
- `09fdcf8` GREEN: actual page now imports the account-store facade and awaits
  one guarded submit path for balance, reviewed candidates and due occurrences.
  Repeated taps while pending cannot enqueue another operation; empty balance fails.
- `3cabeb4` RED: logout during pending confirmation falsely acknowledges local-mode
  success (seven pass, one fail).
- `d17c5f4` GREEN: account status/identity and returned signed-out state are checked
  before feedback or reading a result view; no legacy read after that cancellation.

## Executed checks

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-store.test.cjs test/public-mini-reality-account-page.test.cjs test/v12-miniprogram-reality-capture.test.cjs`

Exit 0, 15 pass, no skips/failures. Bridge coverage: 100% lines, 85% branches,
90% functions. The page tests execute the actual page source using native contract
fixtures with deferred persistence; they are not screenshot/handset acceptance.

`npm run verify:miniprogram`: exit 0, 36/36 structural/package checks.
Official WeChat CLI preview of the real project/AppID: exit 0, 204381-byte package;
QR/info saved in the existing private validation temp directory. No review/publish.

## Scope and remaining gaps

Reality page is now mounted; other pages still need their account-store imports,
async guards, account-change re-rendering and transient-data reset. Account sync
feedback, full migration/deletion consent, skin preferences and same-account
logout/relogin race acceptance remain unfinished. Factory tests and official
compilation do not prove live cloud sync, trusted web identity linking, complete
visual parity or five-second real cross-device visibility. Cloud permission-change
confirmation is still pending. No existing data was uploaded, cloud permission or
billing changed, website password removed, or layout/style assets replaced.
