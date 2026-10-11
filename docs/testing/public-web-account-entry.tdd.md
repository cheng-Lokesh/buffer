# Web account entry checkpoint — 2026-10-11

This is an implementation evidence record, not a new product definition or release approval.

## Scope and checkpoints

Journeys: open the account entry on the authoritative site; confirm cash through the shared scoped account protocol; reject closed, superseded or duplicate confirmations; preserve the approved site appearance.

- Runtime RED `90b9d5f`, GREEN `4ed7e35`: web account composition and offline confirmed queue tests.
- Site binding RED `2065741`, GREEN `07c90e5`: the actual site mounts the entry and binds confirmed operations and explicit backup migration.
- Dialog lifetime RED `1d8c67a`: executed test references the missing lifetime guard and fails with `ERR_MODULE_NOT_FOUND`.
- Dialog lifetime GREEN `907c5b5`: same test now passes; delayed parser results are ignored after dialog/account changes, confirmation awaits persistence, duplicate clicks are rejected.

## Commands actually run

`node --experimental-test-coverage --test-coverage-include=src/account-dialog-lifetime.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test test/public-site-confirmation-lifetime.test.js test/public-site-account-binding.test.js test/public-browser-account-runtime.test.js`

Result: 6 passed, 0 failed. Lifetime helper coverage: lines, branches and functions all 100%. This is not whole-application coverage.

`node --test test/public-browser-account-runtime.test.js test/public-browser-account-session.test.js test/public-browser-pairing-client.test.js test/public-site-account-binding.test.js test/public-site-confirmation-lifetime.test.js test/public-account-controller.test.js test/public-sync-loop.test.js`

Result: 28 passed, 0 failed. Provider adapters use test fixtures, not a successful real cloud login.

`python site/build_index.py`: exit 0, authoritative site bundle rebuilt (27 modules).

## Real browser evidence

Fresh local origin `http://127.0.0.1:8901/`, not the user's existing stored-data origin:

- Account button opens the login dialog. Requesting a code against the currently unavailable cloud endpoint shows a recoverable failure and does not show a signed-in identity.
- Synthetic cash amounts 4000 / 1000 / 30 confirmed through the existing local setup flow. The dashboard and chart update; these amounts are test data only.
- Chart ArrowRight changes its accessible output to the next day and corresponding balance.
- Requested responsive viewport 375×812, but actual browser reports width 560. Screenshot evidence therefore does **not** prove a 375 px layout or phone acceptance.
- Local screenshots: `.codex/tmp/account-entry-evidence/web-desktop.jpg` and `web-mobile.jpg`; excluded from publication.

## Not completed

Cloud financial/pairing SQL and routes are not deployed. Cloud console login has expired. Actual browser/mini-program account approval, cross-device sync, physical phone acceptance, conflict-resolution UI and public-release gates remain incomplete. Existing online password protection is retained; no existing local financial data was uploaded. Current UI still needs an account-entry mobile layout check at an actual 375 px width.
