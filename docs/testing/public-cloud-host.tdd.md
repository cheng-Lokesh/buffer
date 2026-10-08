# Cloud login deployment evidence (2026-10-08)

## Development

RED `664b5b2`: `node --test test/public-cloud-host.test.js`, exit1, 0/3,
missing composition module. GREEN `a8e62ed`: focused host run exit0, 3/3,
lines/branches/functions100%. The first implementation run was 2/3 because the
test transport fixture treated the official WeChat URL object as a string;
normalizing that fixture with `String(input)` corrected the test harness, not
the production authorization or assertions.

Bootstrap RED `19a6a40`: `node --test test/public-cloud-bootstrap.test.js`,
exit1, 0/1. GREEN `fbc88aa`: exit0, 1/1. Startup now uses the documented
absolute Node20 executable; generated ZIP records Linux executable mode0755
and LF line endings. Build and archive checks exited0; code package contains
no credentials. Official guidance:
[SCF startup file](https://cloud.tencent.com/document/product/583/56126).

Final combined authentication run: 51/51, exit0; lines100%, branches97.59%,
functions97.06%. Providers in these tests remain fixtures, not live WeChat
identity or platform ticket acceptance.

## Authorized cloud deployment

The user explicitly approved transmitting existing server credentials into the
original Shanghai CloudBase environment and deploying login/isolation services.
Only the existing AppSecret, custom-login key and ordinary service password
were passed in the server environment configuration. No administrator API key
injection, resource purchase, auto-renewal, overage billing, financial-data upload
or website-password removal was performed.

Console verified the free experience plan, included cloud-function resources,
no pay-as-you-go activation, one newly created HTTP function
`buffer-wechat-login`, Node20.19, memory256MB, port9000, timeout15s, normal status.
The ZIP was selected again after bootstrap repair. Configuration is masked in
the console and is not part of the package or repository.

Only `/api/auth/wechat` was routed to that function on the environment's actual
default HTTPS domain, with path passthrough. Gateway-wide CORS is not used to
widen allowed origins: the application itself admits only the existing
protected site's origin; native clients without Origin still require a valid
WeChat authorization code and durable admission guard. No financial route exists.

Independent real external HTTP checks returned:

| Check | Actual result |
| --- | --- |
| GET at login path | 405 `method_not_allowed` |
| POST from untrusted origin | 403 `origin_denied` |
| Exact protected-origin JSON POST preflight | 204, exact allowed origin |
| Empty JSON login request from allowed origin | 400 `invalid_login_request` |

The last response means startup identity validation and the real database
admission RPC succeeded before input rejection. It does not validate AppSecret,
WeChat code exchange or ticket acceptance. Cache-Control is
`no-store, no-cache, must-revalidate, max-age=0`; Vary Origin and nosniff survived
the gateway. An initial exact-string cache assertion falsely reported failure;
inspection confirmed no-store remained present. No cache setting was changed.

Safe local screenshot evidence is in the task visualization folder:
`login-rpc/cloud-login-created.png` and `login-rpc/cloud-login-route.png`.
Console test-log lookup separately failed because its log topic did not exist;
this is not claimed repaired. Endpoint responses were independently checked.

## Outstanding gates

Real `wx.login` code, platform custom-ticket acceptance, verified web/WeChat
account linkage, durable financial repository, both client integrations and
true cross-end sync remain incomplete. The cloud socket source-IP contract
behind the proxy is unverified; forwarded client headers are not trusted, so
the current 5/min source budget may be shared behind the gateway. This remains
a protected trial, not public-service acceptance. No old local data migrated.
