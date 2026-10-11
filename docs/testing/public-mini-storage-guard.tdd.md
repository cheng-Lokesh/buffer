# Native storage read guard — 2026-10-11

Requirement: public-service backup/offline paths must not lose confirmed facts.
Journeys derived from PUBLIC_SERVICE_PRD, not old product history.

Root cause: `miniprogram/utils/store.js:load` caught storage-read errors and
returned ordinary writable empty state; malformed/future stored values were
normalized into empty or partial facts. Every mutation then called load and save,
so a transient read failure could be followed by a successful destructive write.
Export also advertised this false empty value as a successful backup.

## RED / GREEN

- 03d6d9c: four executed regressions RED; missing storageError, writable
  failure state and export of empty data reproduced with isolated native storage.
- bd4f889: GREEN. Validate current data before normalization, retain raw keys,
  expose a sanitized read error, block every implicit mutation and export while
  unreadable. Retry remains available. Recovery uses restoreState only after
  explicit existing confirmation in both history and retained settings controller.

Actual commands:

- Storage guard + quality target with coverage: 13/13; store lines 100%, branches
  97.62%, functions 100%. Initial coverage 79.14/69.09 failed thresholds; added
  successful and failure paths rather than lowering thresholds.
- `npm run test:miniprogram`: 29/29.
- `npm run test:public-backup`: 25/25; lines 100%, branches 88.62%, functions 97.62%.
- `npm run verify:miniprogram`: 36/36 file/package checks, not public acceptance.
- Official WeChat CLI preview: exit 0, correct configured AppID, 186737 bytes;
  QR/info saved outside repo in local validation directory. No upload/review/release.

Reproduce the focused target:

```
node --experimental-test-coverage --test-coverage-include=miniprogram/utils/store.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test test/public-mini-storage-guard.test.cjs test/miniprogram-v1-quality.test.cjs
```

## Blast scope and limitations

All seven mutation paths in this store were covered: basics, typed events, skin,
condition edit/add, scenario and capture. Direct save rejects flagged/unreadable
current state. Both export callers stop before writing clipboard on failure.
Both recovery callers require their existing actual confirm result; controller
fixtures test cancel and confirm separately. Generated shared account cache
already rejects corruption instead of resetting; left unchanged.

Clear remains an explicitly confirmed destructive path and is not made an
implicit recovery action. Multi-key removal rollback is not covered by this fix.
Legacy migration retains the original legacy key; strict old-format compatibility
outside existing fixtures still requires broad acceptance. Read-error flags are
transient, not financial facts or backup fields. No browser baseline/layout change.
No real user storage was modified during tests; page-controller fixtures are not
handset UI acceptance. Live native failure rendering and actual cloud sync remain
unverified. No Tencent Cloud configuration or static site assets changed this run.

Hunt nonblocking update script and durable-context reference were not present at
their installed relative paths; current source/reproductions governed the repair.
