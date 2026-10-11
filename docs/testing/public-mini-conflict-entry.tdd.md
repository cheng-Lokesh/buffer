# Native conflict and retry entry, 2026-10-11

Source: PUBLIC_SERVICE_PRD.md explicit conflict confirmation and preservation of pending facts.
Impeccable progressive disclosure: no new normal-state actions or navigation; recovery
button only appears for conflict/offline/unavailable phases. Existing button style reused.

## Checkpoints and verification

- ece0cfe RED: three tests fail because the recovery entry is missing.
- ea82c3c GREEN: 18 entry/lifecycle tests pass. Conflict displays both cash versions,
  backup clipboard write must succeed, then a second explicit confirmation discards
  pending local work in favor of cloud state. Cancel/failed backup/session switch preserve work.
- c078224 attributes VM executions to their actual source filename for coverage.
  It does not alter assertions or production behavior.

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/components/account-entry/index.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-conflict-entry.test.cjs test/public-mini-account-entry.test.cjs test/public-mini-account-view.test.cjs`

Exit 0: 13 pass; component 100% lines, 88.51% branches, 95.83% functions.
`npm run verify:miniprogram`: exit 0, 36/36 pass.
Combined current account/controller/polling/page/store/entry suites: exit 0, 75 pass.
`npm run test:miniprogram`: exit 0, 29 pass.

Official preview: exit 0, 220416 bytes. Official `auto --project miniprogram --auto-port 9422`
returned successful automation port. SDK connected and read actual app phase signed_out
and product version 0.35.0. An attempted privacy-gated screenshot detected nonempty local
storage, so no screenshot was taken and no local amounts/records were logged.

## Boundaries

- Real SDK read is not proof of interactive conflict acceptance. Conflict tests are fixtures;
  no synthetic conflicts, mock login or real user data modifications were made in the simulator.
- Current choices keep pending local work unchanged or explicitly adopt cloud after backup.
  Per-field merge/rebase is not implemented. Clipboard success means copied, not durable save;
  the second prompt explicitly asks the user to retain the backup privately before proceeding.
- Cloud schema/deployment awaits the pending permission confirmation. No financial deployment,
  resource purchase, billing, existing-data upload or password protection changed.
- Four-space, media and style baseline retained; rendered exceptional-state layout and
  real two-device conflict/retry acceptance remain to be verified.
