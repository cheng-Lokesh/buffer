# Visible Mini Program account entry, 2026-10-11

Scope: the existing four spaces share one explicit login/retry/logout control.
No new navigation space, old-data upload, payment, web restyle or public release.

## RED and GREEN

- fef3701: entry absent; 3/3 tests fail.
- 312e3c2: stable native host selector absent; 1/3 fails.
- 515bc0b: repeated clicks can stack confirmation dialogs; 1/5 fails.
- GREEN: component tests 5/5; measured component lines/branches/functions
  100/100/100. VM source is explicitly named, so an empty coverage report is
  not accepted. Dialog reentrancy and page-show preserve pending state.
- Shared session/application suite 15/15 and Mini Program regression 28/28
  were independently rerun before the component guard change.

## Actual tool evidence and limitations

Official preview compilation succeeded, exit0, package 135287 bytes. The
developer-tool page header's rendered WXML contains the new account button.
The initial alias tag selector returned no match because the rendered custom
host uses its component path; this was an acceptance-probe error, not evidence
of a stale frontend. With `#accountEntry`, both official SDK and actual page
`selectComponent` return the mounted component with label 微信登录.

The official SDK screenshot captured an empty-data screen and the actual login
confirmation modal. No cash values, account identifiers or tokens were exported.
Tool-native confirmation did not yield a verified completed callback/session.
Therefore visible login/cancel/logout E2E is NOT PASS. The first cancellation
probe only checked signed-out state; it could pass while a modal remained open,
so it has been strengthened to await the component's confirmation completion.
The live checker uses no wx mocks and emits sanitized stage-only failures.

Real application-level authentication passed separately in
`public-account-session.tdd.md`; it does not substitute for visible flow or
handset acceptance. Web linkage, durable sync, all-page visual parity and public
release are still unfinished. Existing protected website is unchanged.
