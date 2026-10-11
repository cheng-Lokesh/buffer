# Account-change view reset — 2026-10-11

Source: PUBLIC_SERVICE_PRD.md account switching must not retain previous account
facts, candidates or transient input. No visual/layout changes in this checkpoint.

- `1f63817` RED: reset helper missing and actual account component does not notify
  the active page after approved login/logout. Two executed failures.
- `6b03c40` GREEN: helper resets a fresh clone of initial display/draft state on
  account scope changes; component notifies the actual current page after login or
  logout, not cancellation. Reality page is mounted. Same-scope page show preserves
  current drafts; scope changes clear them before refresh. Storage is never cleared.

Executed:
`node --test --experimental-test-coverage --test-coverage-include=miniprogram/utils/account-view.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 test/public-mini-account-view.test.cjs test/public-mini-account-entry.test.cjs test/public-mini-reality-account-page.test.cjs`

Exit 0, ten pass, no skips/failures. Helper coverage 100% lines/functions, 93.75%
branches. Initial 75% branches did not meet the gate; actual optional/default page
lifecycle paths were added and tested without weakening thresholds.

Tests execute real component/page controllers with native contract fixtures,
not physical handset interaction. Only Reality currently uses the helper;
future/conditions/history still need account-store and lifecycle wiring. This
does not prove full cross-page privacy, same-account logout/relogin race handling,
CloudBase deployment, web linking or complete dual-end acceptance. No billing,
cloud permissions, existing data upload or password protection changed.
