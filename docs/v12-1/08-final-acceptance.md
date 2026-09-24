# Buffer V12.1 Final Acceptance

## Release identity

- Version: `v0.35.0`
- Start State: exact `v0.34.0` commit `8cdcc7aaa63e13757439cd94348258794a385839`
- Release verdict: **RELEASED**
- Product boundary: Reality Capture only. No OCR, bank sync, AI Chat, Final Hardening, V13, or new product surface was started.

## Previous parser reality

V12 supplied deterministic forms and direct numeric capture. It did not provide a provider-backed natural-language understanding layer. V12.1 adds that layer without replacing the existing Fast Path or changing the rule that only user-confirmed facts enter Reality.

## Architecture and provider

The production path is `browser → same-origin server adapter → DeepSeek → strict schema validation → deterministic resolver → candidate confirmation → existing V12 commit boundary`. The browser never receives the provider key. The server uses a bounded timeout, bounded body size, fixed provider endpoint, strict JSON schema and origin checks. DeepSeek is the configured provider; provider failure falls back to safe clarification or the deterministic Fast Path rather than writing guessed facts.

Only the current natural-language sentence and the minimum resolving context are sent. Complete history, backups, identity/profile data, unrelated records, browser storage and the API key are never sent to the provider. Prompt-injection text is treated as untrusted user content, not an instruction.

## Safety contract

- LLM understands; Code validates; User confirms; Code commits.
- The LLM has no Reality write capability.
- Scenario candidates remain Scenario and cannot cross into Reality.
- Balance Anchor replaces the confirmed current balance once; it is never also appended as income.
- Negative or cancelled statements remain non-events.
- Partial understanding preserves clear facts and asks only for the unresolved amount, date, direction, condition or occurrence reference.
- Existing condition changes and expected-item occurrences resolve by stable identity; ambiguous references remain clarification.
- Relative dates are normalized by deterministic code using the user-visible local date.
- Exact balance, exact due-item and exact edit paths still work without the provider.

## Language and live provider gate

The frozen language corpus covers simple, complex multi-fact, negation, Scenario, relative date, colloquial amount, condition change, occurrence, ambiguity, adversarial injection and malformed-provider cases. The real DeepSeek endpoint was exercised with all 50 live cases after the final resolver changes.

```text
TOTAL: 50
CORRECT: 40
CORRECT_WITH_CLARIFICATION: 10
WRONG_PARSE: 0
UNSUPPORTED: 0
UNSAFE_PARSE: 0
Wrong Amount: 0
Invented Amount: 0
Wrong Date/Direction/Condition/Occurrence: 0
Scenario→Reality: 0
Negation Error: 0
Extra Reality/Hallucination/Direct Write: 0
Balance duplicate: 0
Model Amount Miss recovered by code: 2
p50: 1265 ms
p95: 2036 ms
```

Daily cases 1–20 and their exact latencies are recorded in `06-daily-use-acceptance.md`; the complete machine-readable evidence is `live-ai-evaluation.json`.

## UI and browser acceptance

Desktop `1280 × 850` and mobile `390 × 844` were exercised in the real app. The accepted paths include Fast Path, natural-language entry, three LLM candidates, multi-fact parsing, partial clarification, mixed Scenario input, condition change, balance anchor, provider failure, confirmation and completion. The write-path browser test used an isolated local origin and did not alter the user's normal product data.

All 14 required screenshots exist at exact dimensions in `docs/testing/v12-1-after/`; the visual review found no clipped confirmation action, hidden candidate, horizontal overflow, unreadable skin state or mobile dead end.

## Regression, migration and platform parity

- Exact V10 complete gate: PASS, including desktop/mobile full loop and dense layouts.
- V9 complete gate: PASS.
- V8 core, persistence, browser and backup migration: PASS.
- Six full-product skins: 32/32 PASS.
- Mini Program product/core/experience: 28/28 PASS.
- Mini Program release verification: 35/36 checks pass, 0 failures, 1 expected warning because the local package still uses `touristappid`; no network, login or payment capability was introduced.
- Old backups, schema migration, local recovery, skin state and Scenario isolation remain intact.

## Automated quality gates

- V12.1 core parser and resolver: 61/61 PASS.
- Language safety corpus: 14/14 PASS.
- Server and security boundary: 21/21 PASS.
- Statement coverage: 98.40% lines, 75.00% branches, 98.61% functions.
- Production build: PASS.
- Main application chunk: 460.12 KiB, below the 500 KiB gate.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Cloudflare Worker dry run: PASS.
- Tracked secret scan: no API key literal.

## Deferred and stop state

P0: 0. P1: 0. P2: 0. P3: 0. Scope-excluded work is recorded in `DEFERRED.md` and is not silently promoted into a feature request. V12.1 stops here.

## Git and release governance

The V12 tag `v0.34.0` remains on the exact start commit. V12.1 is versioned as `v0.35.0`; the release commit, annotated tag, remote branch SHA and GitHub release are verified as the final publication step. User-owned untracked files are not added or deleted.

## 2026-09-21 readability and plain-language pass

- The four live spaces no longer expose internal labels such as `REALITY`, `FORECAST`, `TEMPORAL MEMORY`, `VISUAL SKIN`, “区间末解释”, “区间差额”, “末日构成”, “现实快照” or “预测快照”.
- Body and explanatory copy is at least 15px, labels and actions are at least 14px, and only dates or chart metadata may use 13px.
- No user-readable product copy relies on 12px text. Desktop compaction uses concise copy, spacing, and geometry rather than microtext.
- Repeated heading descriptions, field definitions, navigation subtitles, confirmation reminders, and empty-state explanations are not shown. Calculation assumptions, privacy boundaries, and confirmation boundaries remain visible where they affect interpretation or safety.
- The Now space is capped at 1680px on ultra-wide screens; its conclusion panel stays at or below 380px, the summary rail shares its top and bottom edges, and an empty upcoming-cashflow rail is removed rather than reserving blank space.
- The visible workflow now uses direct labels such as “更新情况”, “试算变化”, “估算依据”, “下一步核对” and “确认保存”.
- `1280 × 720`, `1440 × 900` and `375 × 812` were checked. All four desktop spaces still fit without whole-page vertical scrolling, and mobile has no horizontal overflow.
- `npm run test:v12-1:site`: 6/6 PASS. Product-truth checks: 6/6 PASS.

## Final verdict

Buffer V12.1 satisfies the product contract: natural language becomes reviewable candidate facts, deterministic code enforces the safety boundary, and Reality changes only after explicit user confirmation. Verdict: **RELEASED**.
