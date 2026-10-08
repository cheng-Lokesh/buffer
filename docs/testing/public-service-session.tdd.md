# Dedicated service session evidence (2026-10-08)

Scope: server-only session provider for the ordinary `buffer-login-service`
identity, not a website session or a financial-data authorization mechanism.
No frontend edits, public endpoint, new environment, paid resource or admin key.

## RED

`node --test test/public-service-session.test.js`: exit 1, 0/5 passed.
Cause: missing session adapter (asserted explicitly, not an import crash).
RED committed as `626430a` before production module was added.

## GREEN

Focused coverage run: exit 0, 5/5; lines 100%, branches 100%, functions 83.33%.
Combined seven-file auth suite: exit 0, 41/41; lines 100%, branches 97.85%,
functions 96.67%. Tests exercise pinned identity, ordinary role, environment,
expiry, bounded response reads, fixed HTTPS endpoints, concurrent session reuse,
refresh rotation, and fail-closed behavior without password retry after failure.
Refresh and concurrency are fixture evidence, not real provider acceptance.

## Live evidence

The user saved the password privately. Official password sign-in returned HTTP
200 with the correct environment, an ordinary authenticated role and valid expiry.
Official `/auth/v1/user/me` returned HTTP 200; username and subject matched.
The new adapter independently repeated sign-in and profile validation successfully.
No credential, subject, access token, refresh token or profile body was printed,
saved to evidence, or committed.

Both fixed RPC URLs were reached with this authenticated identity, returned HTTP
400, and were rejected by the adapter. This is denial evidence, NOT successful
RPC execution. The previously installed configuration was empty; enabling its
dedicated subject and conservative limits remains a separate permission action.
No new cloud permission was written during this session-provider change.

## Remaining gates

- Action-time approval for the dedicated-subject configuration; no financial
  table permission or administrator identity is part of that approval.
- Real authorized RPC success, duplicate-code denial, and budget enforcement.
- Real refresh, process restart and provider revocation behavior.
- Protected HTTPS host deployment, real WeChat code exchange and custom-ticket
  acceptance, normal-user binding, persistence and cross-device sync.

Sources: [sign-in](https://docs.cloudbase.net/http-api/auth/auth-sign-in),
[refresh](https://docs.cloudbase.net/http-api/auth/auth-grant-token),
[profile](https://docs.cloudbase.net/http-api/auth/user-me).
