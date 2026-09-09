# V12 Daily Use Acceptance

> Measured 2026-08-25 in Microsoft Edge's real browser engine at 390×844. Typing used a fixed 45–55ms per character delay. These are reproducible product-path timings, not a claim about human population behavior.

| Case | Clicks | Fields | Page jumps | Measured | Semantic result |
| --- | ---: | ---: | ---: | ---: | --- |
| 1. 余额 4360 | 3 | 1 | 0 | 2.24s | Neutral balance confirmation; no invented ¥640 expense |
| 2. 房租如期发生 | 2 | 0 | 0 | 0.48s | One existing occurrence resolution; no re-entry or duplicate event |
| 3. 工资实际 8500 | 4 | 1 | 0 | 1.59s | Unique due salary matched; actual amount changed once |
| 4. 房租、押金、余额 | 4 | 1 | 0 | 2.68s | Three candidates shown first; final balance anchored at 4680 |
| 5. 下月固定工资 | 4 | 1 | 0 | 2.15s | Recurring income candidate shows 12000/month from the correct date |
| 6. 房租改为 2000 | 4 | 1 | 0 | 1.59s | Existing recurring rent updated; no second rent |
| 7. 只确认余额 3800 | 3 | 1 | 0 | 1.17s | No explanation, transaction category or follow-up required |

All seven cases meet the V12 target. The automated run confirms the interface steps and response time; the single real user's future daily use remains the only source for human-friction evidence.
