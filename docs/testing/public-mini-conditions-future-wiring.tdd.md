# Actual conditions/future account wiring — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md condition confirmation, scenario isolation and
account-switch privacy. No layout/style/media changes.

- `3f10370` RED: four actual button tests invoke old legacy writers rather than
  account persistence. Four executed failures.
- `e0aa72e` GREEN: conditions basics/recurring/future-event buttons and future
  scenario-save button await the account bridge. Shared per-page action guard
  prevents duplicate/concurrent saves. Both pages now read own account state and
  reset initial display/form/simulation data when the account scope changes.

Executed coverage command:
`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-view.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-other-account-pages.test.cjs test/public-mini-account-view.test.cjs test/public-mini-lookup.test.cjs`

Exit 0, nine pass, no failures/skips; helper 100% lines/functions, 94.74% branches.
During implementation an extra closing parenthesis was fixed; the page test reset
fixture was corrected to exercise each page's actual field (basicsDraft versus
simulationResult), rather than inventing a field on the conditions page.

`npm run test:miniprogram`: exit 0, 29 pass. Original local storage, migration,
six-skin, calculation and backup regressions remain passing.

Official WeChat CLI preview: exit 0, actual AppID, package 207114 bytes; private
QR/info output under the existing validation directory. No upload/review/publish.

## Limits

Reality/conditions/future are mounted; history/settings/changes still need
account-aware store and consent routing. Component/controller tests use native
contract fixtures, not real cloud writes or physical handset use. Account sync
feedback, same-account relogin epoch handling, migration/deletion UI, trusted web
identity linking and real propagation acceptance remain unfinished. Cloud sync
deployment still needs the pending permission-change confirmation. Existing data,
password protection, billing and cloud privileges were not changed.
