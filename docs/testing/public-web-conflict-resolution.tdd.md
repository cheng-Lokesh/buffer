# Web account conflict resolution checkpoint, 2026-10-11

This is verification evidence for the current web account flow, not proof of cloud or public release readiness.

## User flow

When the logged-in account has a version conflict, the account panel shows the local pending count and cloud revision. The user downloads a backup of the active account state before they can choose to adopt the cloud version. Adoption requires a second confirmation. Account changes or a changed conflict version cancel the action. Declining leaves the queue and cloud state intact.

## RED and GREEN

- `6887de7` added executable tests before implementation. RED: import failed because `src/browser-conflict-actions.js` did not yet exist.
- `50e5b92` implemented guarded backup-first adoption and the account panel controls.
- `node --experimental-test-coverage --test-coverage-include=src/browser-conflict-actions.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test test/public-browser-conflict-actions.test.js`: 5 passed; 100% lines, 90.91% branches, 100% functions for the helper.
- Account, session, pairing, controller, loop, web lifetime, mini entry and conflict regression selection: 39 passed, 0 failed.
- `python site/build_index.py`: exit 0, 28 modules; generated site bundle rebuilt.

## Limits

The conflict UI uses the existing account scoped state and backup export. A real cloud conflict was not created because the production sync endpoint is not deployed and the Tencent Cloud console session is signed out. No real account data was used or uploaded. Native Mini Program conflict UI exists separately and is covered by its own test record; cross-device conflict acceptance remains unverified.
