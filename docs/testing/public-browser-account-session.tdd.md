# Browser account session prerequisite, 2026-10-11

Source: PUBLIC_SERVICE_PRD.md trusted cross-end identity and cancellation. This is a
verified-ticket session implementation, not a working browser pairing or login UI.

- 8ef3ae1 RED: four tests fail at missing browser session factory assertions.
- 16a2e74 GREEN: same four pass. Approved adapter ticket exchanges only with the
  configured official CloudBase custom sign-in endpoint. Returned token identity and
  official user profile must both match the paired account. Secrets remain in closure.
- Expanded tests reject malformed ticket/tokens, service account, inactive profiles,
  non-200 responses and arrays; refresh requests coalesce and revalidate the same owner.

Executed:

`node --test --experimental-test-coverage --test-coverage-include=src/browser-account-session.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-browser-account-session.test.js`

Exit 0: six pass; 100% lines/branches/functions.

`node --test test/public-browser-account-session.test.js test/public-account-session.test.js test/public-account-controller.test.js`

Exit 0: 32 pass, zero failures/skips. No production identity, token, local data or cloud
financial write was used; tests use transport fixtures.

## Completion boundaries

`getLoginTicket` must come from a future trusted, one-use pairing adapter with verified
small-program approval and browser challenge control. The factory has no fake/default
adapter, identity merging or nickname fallback. Supplying a client-selected account
identifier is not a substitute for that server proof. The adapter and durable pairing
service are not yet implemented or mounted. `site/app-entry.js` still uses its existing
local persistence; no claim of automatic web sync or visible login completion is made.

No site files, visual baseline, credentials, SQL permissions, deployment, billing or
password protection changed. Trusted browser authorization, UI mounting, real CloudBase
CORS/identity evidence and two-device acceptance remain required.
