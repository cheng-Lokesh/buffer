# Buffer V12 Product Contract

> **HISTORICAL / SUPERSEDED:** v0.34.0 is the direct V12 baseline. The only current authority is `docs/V12_1_PRODUCT_CONTRACT.md`; do not treat this file as the current product definition.

## Product purpose

Buffer is a personal reality-state and future-simulation product for periods of unstable income. It reflects the one real user's confirmed cash reality, derives a forecast, and compares explicit scenarios. It does not prescribe what the user should do.

Highest principle: **缓冲区负责反映，不负责指导。**

Buffer 永久只有用户本人一位真实用户。验收只使用本人真实的跨会话、跨设备证据，不招募参与者，不制造多人样本或合成活跃数据。

## Reality Capture Principle

Buffer 不追求完整账本。Buffer 只采集足以重新确认当前状态和足以改变未来预测的现实。

- 当前可用现金是 Reality 的状态锚点。
- 一次性、未结构化的生活变化可以通过余额重新确认被吸收，不要求分类或解释差额。
- 会持续影响未来的规律，以及本人确认的已知未来事项，才需要结构化。
- 不制造“未分类支出”“待整理账目”“记账完整度”或多账户维护压力。

## Core spaces and data boundaries

Now, Future, Conditions and Records remain the only first-level product spaces. REALITY, FORECAST, EXPECTED OCCURRENCE and SCENARIO retain their V11.1 semantics. Capture candidates are transient confirmation state, not a fifth data domain.

Unknown is not zero. Time passing never turns an expected occurrence into reality. Scenario never changes Reality.

## Unified entry

The Now surface exposes one entry: `现实有变化`. Its order is:

1. due expected occurrences, if any;
2. confirm current balance;
3. say one sentence about what changed;
4. precise edit as Level 3.

The daily path must not begin with a category grid or a long structured form.

## Balance checkpoint

Balance confirmation asks only for the actual total usable cash Buffer should use to calculate the future. It may show the last confirmed amount and time. It never asks the user to split bank, WeChat, Alipay or physical cash, and never requires an explanation of the difference.

A balance confirmation creates a neutral `balance_confirmation` record and re-anchors the balance condition. It must not invent an expense or income for the difference.

## Expected occurrence confirmation

For a due item, the product reuses its known name, amount, date and source condition. The only default choices are `如期发生`, `金额不同`, `日期不同`, and `这次没发生`. Amount/date alternatives ask for exactly one changed field. A non-occurrence does not end the source condition.

The same occurrence cannot be confirmed twice in one capture batch or duplicated as a new independent cash event.

## Reality Parser boundary

AI may parse. User must confirm. Only confirmed facts become Reality.

The parser may transform one user statement into schema-validated candidate facts. It cannot advise, judge, plan, execute tools, modify files, access unrelated data or write Reality. Invalid enum, amount, date, structure or target produces no write. The normal UI does not expose internal schema names.

Parser context is limited to current date, current balance, relevant confirmed active conditions and due occurrences. Full history, backups, identity data and unrelated records are excluded.

The current production adapter is deterministic and local. No external provider, request or API key is used. If a future external provider is authorized, it must sit behind the same adapter and server-side secret boundary, and its actual data handling must be documented before release.

## Confirmation and atomicity

Parsed facts appear under `我理解为`. Each candidate may be corrected or removed. Parsing and preview do not mutate Reality. Confirmation validates every candidate, applies the batch to an isolated copy and persists once. Any invalid item prevents the whole batch from writing.

### Balance Anchor Rule

When a statement contains both cash-flow facts and a final balance, the cash-flow facts remain useful for history and future condition meaning, while the final balance is the authoritative current-cash anchor. The events must not be added on top of the final balance.

## Scenario and uncertain future boundary

Statements containing obvious hypothetical framing such as `如果`, `假设`, `要是`, `万一` or `假如` are Scenario and write nothing. Statements such as `可能收到3000` require the smallest necessary clarification and write nothing. Only a user-confirmed future fact may become a known event or condition.

## Voice

Voice is only another way to supply natural-language text. Transcription never writes Reality and must proceed through candidate confirmation. Web and Mobile Web use runtime SpeechRecognition only when the browser provides it. Permission denial or unavailability leaves text fully usable. Mini Program currently provides the same text path and explicitly states that reliable voice transcription is unavailable.

## Provenance, migration and backup

Confirmed writes may retain internal provenance: `manual_balance`, `quick_occurrence`, `natural_language`, `voice`, or `precise_edit`. V0.33.0 data migrates without invented provenance. Schema 9 remains sufficient. Confirmed provenance round-trips through backup; candidates and in-progress capture transactions are excluded. Existing conditions, events, resolutions, snapshots, scenario drafts and old backups remain readable.

## Experience and accessibility

Desktop uses an adjacent side panel. Mobile uses a focused Bottom Sheet with safe-area protection. Touch targets are at least 44px, visible controls have labels, focus is trapped and returned, Escape closes the surface, errors use an announced status, and reduced motion is honored. Three-candidate confirmation keeps its primary action in the 390 by 844 first viewport.

## Permanent exclusions

V12 does not add bank sync, WeChat/Alipay reading, multi-account management, categorization, budgets, spending reports, financial advice, chat history, assistant personality, automatic bookkeeping or OCR.

After V12 is complete, stop. Do not automatically start OCR, bank sync, Final Hardening, V13 or new product functionality.
