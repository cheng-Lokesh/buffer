# Shared account lifecycle — 2026-10-11

Journeys derive from PUBLIC_SERVICE_PRD.md: login must not migrate device data,
confirmed operations automatically submit, offline operations retry on reconnect,
logout/account switching isolates views, conflicts require explicit resolution,
and migration/deletion require confirmation.

## Checkpoints

- `975d1d0`: initial RED, eight journeys fail for missing controller implementation.
- `22048d7`: additional concurrent-read RED, 12 pass / 2 fail. A confirmation
  arriving during refresh remains pending instead of being automatically drained.
- `117d59d`: GREEN, 14 pass / 0 fail. Shared controller drains trailing pending
  work, guarded by account lifecycle generation; offline failures do not busy-loop.

## Executed verification

`node --test test/public-account-controller.test.js test/public-account-sync.test.js test/public-account-session.test.js test/public-account-confirmation.test.js test/public-sync-transport.test.js test/public-sync-client.test.js test/public-sync-size.test.js`

Exit 0, 82 pass, no failures/skips.

`node --test --experimental-test-coverage --test-coverage-include=src/account-controller.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-account-controller.test.js`

Exit 0, lines 100%, branches 98%, functions 100%. The same command targeting
`miniprogram/core/account-controller.js` also exits 0 with identical coverage.
`node scripts/build-mini-shared.mjs` exits 0; native controller is generated from
the web/shared implementation.

## Guarantees covered (integration fixtures, not real users)

- Login does not read/upload legacy device state; invalid/unconfirmed input does not write.
- Confirmed domain operations use the exact queued operation ID and automatically flush.
- Offline queue survives and retries; simultaneous refresh requests coalesce.
- New confirmations during a foreground read are automatically submitted after the read.
- Logout or account switch hides prior facts and invalidates stale asynchronous work.
- Migration validates backup and needs explicit approval; deletion acknowledges only after flush.
- Conflicts retain pending changes until explicit cloud adoption.
- Invalid configuration/session and throwing observers fail safely.

## Boundaries / remaining work

At this checkpoint the controller was not mounted in production pages/App.
Subsequent native App composition is recorded in public-mini-account-lifecycle.tdd.md;
page/store confirmation wiring remains unfinished. Tests compose
real shared domain/client/service implementations with in-memory storage and
test identity/transport; they do not prove CloudBase deployment, trusted web/mini
account linking, rendered UX, five-second cross-device visibility, or handset use.
Cloud database synchronization schema and endpoint deployment remain pending the
separate permission-change confirmation. No existing user data was uploaded;
no website protection, visual baseline, billing, or cloud permissions were changed.
