# V12.1 Daily Use Acceptance

## Acceptance setup

- One real user only; no participant recruitment or synthetic activity.
- Real application UI and real DeepSeek endpoint.
- Desktop baseline: 1280 × 850.
- Mobile baseline: 390 × 844.
- Isolated local origin used for write-path QA so existing user data was not changed.

## Daily cases 1–20

These are the first twenty cases in the final 50-case live evaluation; the machine-readable full results are in `live-ai-evaluation.json`.

| # | Case | Category | Verdict | Latency |
| ---: | --- | --- | --- | ---: |
| 1 | complex-01 | complex multi-fact | CORRECT | 1905 ms |
| 2 | complex-02 | complex multi-fact | CORRECT_WITH_CLARIFICATION | 1952 ms |
| 3 | complex-03 | complex multi-fact | CORRECT | 2652 ms |
| 4 | complex-04 | complex multi-fact | CORRECT_WITH_CLARIFICATION | 1736 ms |
| 5 | complex-05 | complex multi-fact | CORRECT | 1337 ms |
| 6 | complex-06 | mixed | CORRECT | 1320 ms |
| 7 | complex-07 | mixed | CORRECT_WITH_CLARIFICATION | 1921 ms |
| 8 | complex-08 | mixed | CORRECT | 1803 ms |
| 9 | complex-09 | mixed | CORRECT_WITH_CLARIFICATION | 1443 ms |
| 10 | complex-10 | mixed | CORRECT | 2036 ms |
| 11 | negation-01 | negation | CORRECT | 1347 ms |
| 12 | negation-02 | negation | CORRECT | 2560 ms |
| 13 | negation-03 | negation | CORRECT | 1436 ms |
| 14 | negation-04 | negation | CORRECT | 951 ms |
| 15 | negation-05 | negation | CORRECT_WITH_CLARIFICATION | 1536 ms |
| 16 | scenario-01 | scenario | CORRECT | 1625 ms |
| 17 | scenario-02 | scenario | CORRECT | 1347 ms |
| 18 | scenario-03 | scenario | CORRECT | 909 ms |
| 19 | scenario-04 | scenario | CORRECT | 1257 ms |
| 20 | scenario-05 | scenario | CORRECT | 1096 ms |

## Browser paths

The UI was exercised with typed complex language, not only parser functions. Verified paths: exact-balance Fast Path, real LLM multi-fact input, salary occurrence, partial clarification, mixed Scenario, condition change, balance anchor, provider failure, mobile three-candidate confirmation and confirmed completion.

The completion write was performed only on an isolated local origin. Existing browser data on the user's normal product origin was not mutated by acceptance testing.

## Outcome

- User can speak in ordinary Chinese without learning candidate types.
- Clear facts remain confirmable when a sibling clause is uncertain.
- Clarification asks only for the unresolved reference or amount/date.
- Three candidates and the confirmation action remain available in the 390 × 844 flow.
- Provider failure does not block the simple balance, due-item or exact-edit paths.
