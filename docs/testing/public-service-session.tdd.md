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

## Approved live configuration and follow-up acceptance

After action-time user authorization, the existing environment was configured
for the dedicated subject, 5 requests/source/minute and 100 requests/app/day.
An atomic conflict-rejecting insert was used; the complete editor query was
checked against the intended SQL before execution. Independent SELECT returned
1 configured account, limits 5/100, private-table isolation true and anonymous
RPC isolation true. No financial table permissions were granted.

Official refresh returned HTTP200 and a rotated refresh token with the same
ordinary role, subject and environment. Actual session-provider plus RPC-guard
calls returned five admission successes followed by false; first random-code
digest insertion returned true, repeat false. Anonymous RPC returned HTTP401.
The follow-up verification command exited 0. No actual WeChat login code was used.
One earlier combined live command exited 1 with a sanitized generic failure;
its exact cause was not captured. Subsequent staged and complete checks passed.
Daily cap exhaustion, time-boundary reset, revocation and full user E2E remain
unverified. Earlier empty-config denial evidence above is historical, not the
current configuration. The public deployment and frontend remain unchanged.
