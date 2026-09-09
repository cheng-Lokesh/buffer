# V12 AI Architecture and Privacy

## Actual provider

V12 ships with `deterministic-local-v12`. It executes in the local application, makes no network request and uses no API key. The repository has no approved external Reality Parser proxy, so V12 does not claim online AI integration.

## Adapter boundary

`parseRealityMessage(text, context, adapter)` receives only the statement plus current date, current balance, relevant active confirmed conditions and due occurrences. It does not receive complete history, backups, scenario drafts, snapshots, identity or unrelated records.

Adapter output is treated as untrusted. Only allow-listed statuses and candidate fields survive normalization; enum, amount, date and target references are validated. Arbitrary fields and prototype-like content are discarded. The adapter has no tool or filesystem capability.

## Write boundary

Parsing returns transient candidates. Preview and correction do not mutate Reality. Only the explicit confirmation action calls the atomic commit and persistent save. Provider failure returns retry and manual fallbacks while balance and due-item paths remain available.

## Secrets and backups

No key is present in frontend code, localStorage, repository or backup. Confirmed capture provenance is backed up; candidates and in-progress capture state are stripped. Any later external provider requires new explicit authorization, a server-side secret boundary and an updated privacy disclosure.
