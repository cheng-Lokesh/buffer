# HTTP login host (2026-10-08)

User journey: a real HTTP request reaches the existing verified-code login
runtime; unauthorized origins, wrong routes, query-string credentials and
unsupported requests cannot reach the provider. This is a backend change,
not a redesign or proof of complete web/Mini Program login.

RED: `node --test test/public-login-http.test.js`, exit 1, 0/5. The host was
missing (explicit assertion). RED checkpoint: `db7d40a`.

GREEN: focused coverage run, exit 0, 5/5, lines/functions 100%, branches 92.11%.
Tests start actual loopback HTTP servers, submit network requests and clean up.
Their identity/provider responses are fixtures, never real WeChat users.
An additional full-runtime composition test uses real RSA signing with fixture
provider/RPC responses; it does not create a cloud user or validate a real ticket.

Cloud console independently showed 0 cloud functions and 0 hosted services.
The creation page was inspected without submitting or buying resources. Its
official HTTP Node template uses `scf_bootstrap` and a Node HTTP server; this
supports the host shape, but deployment source-IP, runtime/secrets, quota and
HTTPS routes still need platform verification. No proxy forwarding headers are
trusted automatically. The site server and protected deployment are unchanged.

Source: [CloudBase HTTP function access](https://docs.cloudbase.net/service/access-cloud-function).

Remaining: deploy with private secrets only on the server, verify gateway source
identity, obtain a real `wx.login` code on the authorized Mini Program, validate
ticket acceptance, implement durable financial sync and account linkage, then
accept both clients. Cloud secrets transmission/public routes require explicit
action-time scope; no browser or Git bundle may contain credentials.

Final rerun: 6/6 HTTP tests, exit0, lines/functions100%, branches92.11%.
Combined eight-file authentication run: 47/47, exit0, lines100%, branches97.05%,
functions96.97%. `npm run test:public-sync`: 41/41, exit0; these are local
protocol fixtures, not production financial synchronization.
Repeatable HTTP check: `npm run test:public-auth:http`.
