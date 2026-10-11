# Native account backup and deletion paths, 2026-10-11

Source: PUBLIC_SERVICE_PRD.md backup preview, explicit migration, account isolation,
offline deletion acknowledgement. Existing appearance and four-space navigation retained.

## Checkpoints

- d09b5a5 RED: account store suite nine pass, three fail, missing preview and cloud deletion result.
- d5272b4 GREEN: same twelve pass; private preview record binds exact payload, object and login generation.
- 2d841b4 RED: twelve pass, one fail, stale cloud consent falls back to signed-out local replacement.
- 7cdaf97 GREEN: thirteen pass, cloud consent can never authorize a local operation after logout.
- 4f9395b RED: history suite two pass, two fail, cloud scope and pending feedback missing from actual buttons.
- 2768300 GREEN: history callbacks use explicit account consent and preview; modal scope rechecked; duplicate transfer actions guarded until callbacks finish.

## Executed evidence

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-store.test.cjs test/public-mini-history-account.test.cjs test/public-mini-storage-guard.test.cjs`

Exit 0: 23 pass, zero failures/skips. Account store lines 100%, branches 83.45%, functions 89.66%.

`npm run verify:miniprogram`: exit 0, 36/36 checks pass.

Official WeChat developer tools `preview --project miniprogram` against the configured
AppID: exit 0, 213226 bytes. This is a compiled preview, not review submission,
physical handset acceptance, or live cloud finance verification.

## Guarantees and limits

- Backup preview contains display counts, not account identity; exact payload and
  current session must match before confirmation. Existing local data is untouched.
- Account restore currently imports only into an empty, fully synced account.
  Existing cloud data is not silently overwritten or merged. Large backup chunking is not implemented.
- Delete completion requires synced phase, zero pending operations and null server state.
  Offline/conflict result remains incomplete. Reconnection behavior is separately tested.
- Old local dialogs cannot authorize cloud writes; stale cloud dialogs cannot write local data.
- History UI wording follows Impeccable progressive disclosure and scoped destructive confirmation.
  No WXSS, layout, media or skin assets changed. Native rendered modal acceptance remains unverified.
- Cloud schema/deployment permission confirmation is still pending. No SQL permissions,
  cloud finance deployment, billing, password protection or existing-data upload changed.
