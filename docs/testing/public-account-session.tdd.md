# Account session integration — 2026-10-11

Scope: PUBLIC_SERVICE_PRD identity journey. Explicit native login, verified
profile, concurrent-call coalescing, rotation, logout/cancellation and recoverable
failure; credentials only in memory. No storage adapter, automatic old-data
upload, financial writes, UI redesign, payment or public-release change.

## RED / GREEN

- a1bab76: `node --test test/public-account-session.test.js`, exit1,
  12/12 fail because shared session implementation was absent.
- 260c3ee: same tests pass 12/12; shared source coverage 100% lines,
  97.06% branches, 100% functions. Browser-compatible source and generated
  CommonJS Mini Program module execute the same six guarantees each.
- 38012f8: `node --test test/public-mini-account.test.cjs`, exit1,
  3/3 fail because application login/status/logout methods were absent.
- Native application integration GREEN: session and app tests 15/15, exit0.
  Native adapter coverage 100% lines, 90% branches, 88.89% functions.
- `npm run test:miniprogram`: 28/28, exit0.
- `npm run test:public-sync`: 41/41, exit0; includes generated-source drift check.

Guarantees: signed-out startup does not request/login/read local data; explicit
login uses wx.login and wx.request with finite timeouts; official profile subject
must equal session subject. Refresh may not switch subjects. Logout invalidates
late responses; subsequent token access rejects. Failures are sanitized, with
explicit-login recovery. Tests use fixtures, never real credentials or users.

## Independent native runtime

Official developer CLI `auto` opened the current real-AppID project, exit0.
Official automation SDK called the actual mounted `getApp().loginWechat()` and
`getApp().getAccountAccessToken()`, then `getApp().logoutAccount()`; no mocked wx
methods. Actual output only: mounted=true, before=signed_out, signedIn=true,
after=signed_out, productVersion=0.35.0; command exit0. No codes/tickets/tokens/
account IDs were printed or saved; no financial data uploaded. No domain or HTTPS
validation bypass. This is developer-tool runtime, not a handset/release test.

## Remaining boundary

This supplies application methods, not a visible user login control. Web login,
both-identity control verification/linkage, durable financial transactions and
client sync mounting are still incomplete. The shared module's web test is not
real web authentication. Mini Program visual parity and handset acceptance are
also unfinished. Existing website/password protection are unchanged. Restoring
delegated low-code authorization remains gated by a paid console plan; no upgrade.
