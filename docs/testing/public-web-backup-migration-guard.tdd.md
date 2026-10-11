# Web account backup migration guard, 2026-10-11

The user must not be invited to restore a backup into an account that already has cloud data or pending changes. The account scope is captured before the asynchronous file read and verified again before preview; a login or account switch cancels the import.

## RED and GREEN

- `7fff0d5` added the regression tests before implementation. RED: the required eligibility helper did not exist.
- `node --experimental-test-coverage --test-coverage-include=src/browser-migration-eligibility.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test test/public-browser-migration-eligibility.test.js`: 2 passed; helper lines, branches and functions 100%.
- Selected web account, capture-lifetime, conflict and native account-flow regression command: 22 passed, 0 failed.
- `python site/build_index.py`: exit 0, 29 modules; site bundle rebuilt.

## Remaining limit

The restore page is locally guarded and tested. An actual authenticated CloudBase account cannot be exercised while the Tencent Cloud browser is signed out; no real account backup was read or uploaded.
