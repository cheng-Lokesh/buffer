# Actual history account wiring — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md account-specific confirmation/recording, retained
backup boundaries and existing native six-skin behavior.

- `0c41ea3` RED: actual history record button invokes legacy writer, and account
  bridge has no isolated skin selection method. Two executed failures.
- `737b77d` GREEN: history reads own account state, awaits account event persistence,
  guards duplicate submissions and resets draft/display on account changes.
  Six skin preferences persist in a separate per-account local key; neither
  legacy financial state nor confirmed cloud facts are rewritten for skin choice.
  Restore/delete callbacks await actual results instead of inspecting Promise.ok.

Executed:
`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-history-account.test.cjs test/public-mini-account-store.test.cjs test/public-mini-storage-guard.test.cjs`

Exit 0, sixteen pass, no failures/skips. Bridge coverage: 100% lines, 83.16% branches,
85.19% functions. Backup controller regression fixtures now intercept the actual
new bridge import and await asynchronous confirmation callbacks; cancellation,
unreadable exports and explicit restore approval assertions remain intact.

`npm run test:miniprogram`: exit 0, twenty-nine pass.
Official WeChat CLI preview: exit 0, actual AppID, package 208620 bytes. Private
validation QR/info only; no review/submission/publication.

## Limits

All four declared native pages now use the account store for their active data
views and confirmed saves. This does not prove complete synchronization UX:
cloud-specific migration/delete consent, sync/conflict status controls, same-account
relogin epoch handling, archive-only legacy pages and native/web linking remain
unfinished. Old local prompts still cannot authorize account-wide restore/delete;
those account actions remain guarded rather than silently executed. Skin preference
is local per-account, not a newly claimed cross-device setting sync. No old data
upload, cloud permissions/billing change or website password removal occurred.
Tests use platform fixtures and compilation, not physical handset or live cloud
financial writes. Full public/dual-end acceptance remains pending.
