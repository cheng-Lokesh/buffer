# V12.1 Legacy Capability Retirement — TDD Evidence

Date: 2026-09-09

## Intent

Make the default repository and runtime describe only the current V12.1 product: four spaces (现在、未来、条件、记录), confirmed Reality, derived Forecast, and isolated Scenario. Retire the superseded job/project/action, account, payment, cloud-sync and public-demo implementations without making old backups unreadable.

## RED checkpoint

Command:

```text
node --test test/v12-1-legacy-retirement.test.cjs
```

Result before production changes: 0 passed / 4 failed.

The failures established that the default web entry still contained retired capability names, `server/worker.js` still exposed account/payment/sync routes, no explicit legacy archive existed, and Vite still copied superseded product previews.

Checkpoint commit: `8e99558 test: add legacy capability retirement guard`.

## GREEN evidence

```text
npm run test:v12-1:legacy-retirement
npm run test:v12-1:legacy-retirement:coverage
npm run test:v12-1:core
npm run test:v12-1:governance
npm run test:v12:contract
npm run test:v12-1:browser
npm run build
git diff --check
```

Results:

- Retirement guard: 4/4 passed.
- Compatibility archive coverage: required line, branch and function thresholds (80%) passed.
- V12.1 core: 61/61 passed.
- Governance: 4/4 passed.
- V12 contract: 9/9 passed.
- Browser acceptance: 1/1 passed, covering desktop, mobile, six skins and the candidate-before-confirmation boundary.
- Production build and whitespace validation passed.

## Preserved boundary

Old payload fields are held only in `src/legacy-data-archive.js` while a legacy backup is opened or re-exported. The active interface neither renders nor operates those retired modules. The current worker exposes only `/api/reality/parse`; no account, payment, sync, feedback or upgrade route remains in its runtime or configuration.
