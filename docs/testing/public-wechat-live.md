# Live WeChat login check — 2026-10-08

## Scope and privacy

User installed/logged into official DevTools and enabled the local service port.
Official CLI reported logged-in status, opened the current Mini Program project,
and enabled its test connection. The automation socket was independently checked
with Get-NetTCPConnection: it listened only on 127.0.0.1. No login-ticket access,
global project-trust setting, developer impersonation, mockWxMethod, visitor
AppID, financial-data import, upload, review submission or release was used.
The official miniprogram-automator SDK0.12.1 was installed outside the repository
with package scripts disabled; it is not a product/runtime dependency.

## Real identity test — PASS

Actual reproducible operations:

1. Connect SDK to the local automation socket and obtain the current page.
2. `callWxMethod('login')` obtains a real code from the authorized AppID.
3. POST that code to the deployed Shanghai `/api/auth/wechat` endpoint.
4. POST the returned ticket to this environment's official
   `/auth/v1/signin/custom` with provider_id custom.
5. GET official `/auth/v1/user/me` using the returned access token; compare
   its sub with the returned session and validate ordinary role/environment.

Actual results: connected=true; pageLoaded=true; wechatCodeObtained=true;
backend HTTP200/ticketReceived=true; platform custom sign-in HTTP200/
sessionIssued=true; profile HTTP200/identityVerified=true; process exit0.
Codes, tickets, tokens and identity are held only in process memory and never
printed, persisted or committed. These requests establish the actual WeChat
account session; they do not upload cash data or prove sync.

## Mini Program native transport — BLOCKED

The real native `wx.request` transport was checked separately, without disabling
domain/HTTPS validation. Calling the SDK request shortcut failed without a
serialized reason; a callback probe with an empty JSON body independently
returned exactly `request:fail url not in domain list`.

Root cause: the current Mini Program's request-domain allowlist does not yet
permit the new backend endpoint. This fits successful wx.login and successful
host-machine HTTP exchange, but failed Mini Program-native HTTP access.
No product code was changed; a regression-code guard is not applicable to this
platform configuration failure. Do not call this fixed before repeating native
request after configuration and verifying the real handset separately.

Required request domains in this authorized environment:

```
https://buffer-d4gz06df3a59dea88-1373773247.ap-shanghai.app.tcloudbase.com
https://buffer-d4gz06df3a59dea88.api.tcloudbasegateway.com
```

Use the authorized Mini Program's WeChat platform domain configuration; do not
turn off domain validation as a replacement. Both are actual existing endpoints,
not guessed URL variants. Real-device behavior/allowlist eligibility remain
unverified until the platform accepts configuration and the check is repeated.

Outstanding siblings: web/WeChat account control/linkage, durable financial
repository and confirmation transactions, two-client integration, cloud proxy
source identity, cost/public-service gates and true end-to-end data sync.
