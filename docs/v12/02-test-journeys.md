# V12 Test Journeys

These journeys turn the product contract into observable acceptance checks. All times are measured in a real browser, not inferred from source code.

## Journey 1: balance only

Input intent: `现在余额是4360`.

Expected path:

1. Open `现实有变化`.
2. Choose `确认现在有多少钱`.
3. Enter `4360`.
4. Confirm.

Expected result: current balance is 4360, a neutral balance confirmation exists, the difference is unexplained and unclassified, Now and Future recalculate. Target is at most 10 seconds.

## Journey 2: due item as expected

Precondition: a due rent occurrence exists for 1500.

Expected path: open capture and choose `如期发生` on the existing rent card.

Expected result: exactly one resolution and one linked event exist. Name, amount, and date are not re-entered. Target is one or two operations and at most 5 seconds.

## Journey 3: due amount changed

Input intent: `工资到了，但是8500` with one uniquely matching due salary.

Expected result: the parser produces an existing-occurrence amount-change candidate matched to that salary. Confirmation stores actual amount 8500 once, preserves the last confirmed balance, and creates no duplicate independent income. Target is at most 20 seconds.

## Journey 4: multiple changes with final balance

Input: `今天房租1500，押金退了1300，现在4680`.

Expected candidates: one expense, one income, and one balance confirmation.

Expected result: all candidates are visible before writing. One confirmation writes the whole batch atomically. Events are stored for history, while 4680 is the final balance anchor. The final balance must not be 4480 or 5780.

## Journey 5: new recurring income

Input: `下个月15号开始，每个月工资12000` with as-of date 2026-08-25.

Expected result: a recurring income candidate displays 12000 per month and start date 2026-09-15 before confirmation.

## Journey 6: update existing rent

Input: `以后房租改成2000` with one existing recurring rent condition.

Expected result: a condition-update candidate identifies the existing rent. Confirmation changes it to 2000 and does not create a second rent condition.

## Journey 7: balance absorbs noise

Input intent: `现在只有3800，其他不想记录`.

Expected result: the user can confirm only 3800. No transaction, category, explanation, completeness warning, or follow-up question is required.

## Ambiguity and safety journeys

- `工资到账了` plus two matching due items asks which item and writes nothing.
- `工资到账了` plus no known amount asks for the missing amount. Unknown is never normalized to zero.
- `工资12000` asks whether this is one occurrence or a recurring rule.
- `如果下个月工资12000呢` is marked Scenario and writes nothing.
- `可能收到3000` asks whether this is confirmed or hypothetical and writes nothing.
- invalid adapter output, unknown enum, invalid amount, or invalid date writes nothing.
- provider failure offers retry and precise editing while balance and due-item flows remain available.
- prompt-injection-like text remains inert input data.

## Platform journeys

Desktop is checked at 1280 by 850. Mobile Web is checked at 390 by 844 with keyboard and safe-area behavior. Voice is tested for both a supported flow and permission denial. Mini Program support is reported exactly as implemented, with text remaining usable when transcription is unavailable.

## Skin journeys

The same semantic journey is completed in all six skins. Skins may change tone and surface treatment, but they must not change facts, hierarchy, field count, error behavior, or touch-target accessibility.
