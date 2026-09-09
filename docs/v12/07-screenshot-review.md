# V12 Human Screenshot Review

## Evidence set

The 14 required desktop/mobile images are in [`docs/testing/v12-after/`](../testing/v12-after/). Six skin images are in [`docs/testing/v12-after/skins/`](../testing/v12-after/skins/).

| Image | Most obvious action | Review |
| --- | --- | --- |
| 01 entry desktop | Confirm a due item, then balance or one sentence | Existing context is first; no internal model or category menu |
| 02 balance desktop | Enter one total and confirm | One field, no account split or difference explanation |
| 03 due desktop | Change only the known salary amount | Name/date/source are reused; the user supplies one difference |
| 04 language input desktop | Write one factual sentence | A parser input, not chat; no assistant avatar or suggestions |
| 05 language confirm desktop | Check two facts and confirm | Candidates are explicit, editable and still unwritten |
| 06 multi confirm desktop | Confirm three changes atomically | Final balance and cash-flow facts remain visibly separate |
| 07 complete desktop | View Now or Future | Neutral result, no praise, advice or retention prompt |
| 08 entry mobile | Resolve due items with one-thumb actions | Bottom Sheet preserves the same hierarchy without a new product shell |
| 09 balance mobile | Enter one total and confirm | One simple task, safe-area clear, no long form |
| 10 language mobile | Submit one sentence | Text and voice share one surface; no chat history |
| 11 confirm mobile | Confirm the visible three-fact batch | Compact cards keep the primary confirmation in the first 390×844 viewport |
| 12 voice mobile | Speak one factual sentence | Listening state is explicit; transcript still cannot write directly |
| 13 due mobile | Change only one occurrence date | The date is the only exposed field; known facts remain in view |
| 14 complete mobile | View Now or Future | Immediate value is visible without encouragement or extra task |

## Required questions

- **Does the user understand the main action?** Yes. Every surface has one dominant fact-confirmation action.
- **Must the user understand internal models?** No. Reality, Candidate, Condition and Reconciliation enums are absent from normal copy.
- **Is it a simple input task?** Yes. Balance and occurrence paths expose zero or one field; language exposes one sentence.
- **Does AI take over the product?** No. The interface labels its role as fact parsing and requires user confirmation.
- **Does it resemble a chat bot?** No. There is no persona, history, thread or conversational prompt carousel.
- **Does it resemble an accounting app?** No. There are no accounts, category taxonomy, completeness warnings or transaction ledger requirements.
- **Are there unnecessary classifications?** No. The default hierarchy is due context, balance, one sentence and Level 3 precise editing.
- **Are forms too long?** No. Visual QA found and fixed the only mobile issue: three candidate cards initially pushed confirmation below the first viewport. The compact layout now keeps it visible.

## Six skins

All six preserve identical order, facts and controls. Ink uses paper/serif restraint; wallet uses comic weight and outlined cards; pixel uses square geometry and offset shadows; felt uses soft rounded surfaces; riso uses heavy black/red screen-print treatment; sticker uses a dark neon field. No skin hides a path, changes field count or creates horizontal overflow.
