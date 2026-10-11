# Native sync observation, 2026-10-11

Source: PUBLIC_SERVICE_PRD.md automatic sync and account switching. Existing page geometry,
styles and media are unchanged; status text now reports the actual account phase.

## RED and GREEN

- ce2e0c9: six pass, two fail. App has no subscription API; visible pages do not subscribe.
- 781f5c4: same eight pass. Controller notifications reach App listeners; callback exceptions
  are isolated and repeated unchanged protocol status is deduplicated. Page hide/unload detach.
- 5ac94d0: four pass, one fail. Conditions refresh overwrites a user's unsaved balance.
- 22ce669: same five pass. Pristine inputs update, dirty inputs stay until saved or account switch.
- 2afea2e: four pass, one fail. Account entry always reports old local-upload wording.
- e2f7041: same five pass. Entry shows synced/pending/offline/conflict/unavailable states;
  component hide/detach unsubscribe. Existing login consent and loading guards retained.

## Executed

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-view.js --test-coverage-include=miniprogram/utils/account-controller.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-view.test.cjs test/public-mini-account-lifecycle.test.cjs test/public-mini-account.test.cjs test/public-mini-other-account-pages.test.cjs test/public-mini-reality-account-page.test.cjs test/public-mini-history-account.test.cjs`

Exit 0, 24 pass. Controller adapter 100% lines/branches/functions.
View wrapper 100% lines/functions, 91.67% branches. Actual App and component are exercised
through native VM contract fixtures, not represented by those filtered coverage figures.

`npm run test:miniprogram`: exit 0, 29 pass.
`node --test test/public-mini-account-entry.test.cjs test/public-mini-account-view.test.cjs`:
exit 0, 10 pass. The old fixture without any sync provider now expects “同步尚未连接”,
not a fabricated cloud status. Other consent/identity/loading assertions are retained.

Official WeChat preview: exit 0, 215231 bytes, configured AppID.
No review submission or publication occurred.

## Remaining gates

These are event-driven own-account view updates, not yet a complete real two-device
five-second propagation proof. Foreground polling/push, interactive conflict reconciliation,
scenario-result refresh, real backend deployment and physical handset acceptance remain.
Cloud permission confirmation remains pending; no financial cloud schema, billing,
existing-data upload or password protection was changed.
