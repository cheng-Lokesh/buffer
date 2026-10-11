# Native account fact-store bridge — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md, account isolation, no implicit migration, confirmed
facts only, equal backup/deletion rights. This is an implementation checkpoint,
not acceptance of all native page wiring.

## RED / GREEN

- `f383727`: three executed tests fail for missing account-store bridge.
- GREEN: five tests pass, including invalid/expired state and explicit local-mode
  regression paths. Initial branch coverage was 69.77%, so additional meaningful
  failure/local-mode cases were added; no threshold was lowered.

Executed command:

`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-store.test.cjs`

Exit 0. Five pass, no failures/skips; lines 100%, branches 98.11%, functions 100%.

## Guarantees covered by fixtures

- Signed-in view reads only own canonical account state; missing/malformed or
  expired account state never falls back to legacy cash storage.
- Explicit signed-out local mode retains old storage paths unchanged.
- Basics/capture/event confirmations become canonical confirmed operations via
  the App controller, not an implicit whole-device upload.
- Blank/invalid basics are rejected before enqueue; failures return sanitized feedback.
- Old local restore/delete consent does not authorize cloud overwrite/deletion.

## Remaining / limits

Factory is not yet mounted in pages: full page-store integration must cover
conditions, scenario drafts, export, migration and deletion together, including
account-aware consent wording and feedback. This avoids claiming that an unused
adapter has already fixed user-visible paths. Tests use App/storage fixtures;
they do not prove real cloud writes, account linking, rendered flow or handset UX.
Original local store, six skins and visual baseline remain unchanged. The bridge
is intentionally not a complete alternative product or an accepted reduced feature set.
