# Authenticated sync transport candidate — 2026-10-11

Journeys derived from PUBLIC_SERVICE_PRD: authenticated requests use the current
account; expired/logout sessions cannot transmit or expose stale financial data;
native and web use the same protocol; oversized migration must not create an
unrecoverable queued operation. Existing local data is never automatically read
or uploaded by transport construction.

## RED / GREEN evidence

- f3b3806: six executed tests failed because authenticated transport was missing.
- 2135295: shared implementation; original six tests passed. Lines 100%, branches
  96%, functions 100%.
- 85df011: native request adapter test executed and failed for the missing module.
- 52b51c8: native adapter GREEN, no implicit requests or migration.
- 1b9aac3: web and native oversized-command tests failed with missing exceptions.
- e2fbd3f: reject UTF-8 commands above 32 KiB before persistent cache mutation.

## Actual checks

- `npm run test:public-sync-transport`: 13/13, coverage lines 100%, branches
  98.13%, functions 100%. Both shared outputs and native wx request contract.
- `npm run test:public-sync`: 56/56.
- `npm run test:public-confirmation`: 12/12.
- `npm run test:public-account`: 20/20.
- Sync client coverage with size/queue suites: 28/28, lines 96.40%, branches
  82.12%, functions 100%.
- `npm run build`: exit 0; website visual source unchanged.
- `npm run test:miniprogram:coverage`: 113/113; aggregate native core lines
  91.61%, branches 87.00%, functions 93.84%. Individual old modules may have
  lower coverage; this aggregate is not proof of every page or device flow.

These are isolated fixtures and compilation, not live financial sync acceptance.
Native adapter is available but not mounted as automatic synchronization. Actual
CloudBase SQL and sync-enabled backend deployment, page confirmation wiring,
trusted web/mini identity linkage, real device synchronization and public release
gates remain unfinished. Large backups are retained locally and refused before
queueing; bounded/chunked migration is not implemented. No truncation fallback.

CloudBase new SQL editor tab opened but binding/read via browser control timed
out at 20 seconds. This proves neither SQL execution nor cloud deployment. No
purchase, extra billing, authorization removal, or password-gate change was made.
This code-only candidate does not change the deployed static website assets or
enable its backend; unchanged protected site must not be called a sync release.
