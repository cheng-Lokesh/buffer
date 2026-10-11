# Cash reconfirmation evidence preservation, 2026-10-11

Root cause: `miniprogram/core/state.js` / `applyCashChange` spread a new empty
base reality instead of the current reality. It explicitly copied events and
drafts but lost occurrence resolutions; the unified engine also made historical
snapshot collections visible, exposing the same data-loss pattern for them.

RED 50cd20e: a fixture with an explicitly reconciled occurrence and a historical
projection snapshot lost its resolution after cash reconfirmation; exit1.
GREEN: spread current normalized reality, replace only the three base conditions
and preserve all historical collections. Regression test verifies resolutions,
both snapshot collections, events, drafts and non-mutation of the source.

Blast check: the only baseReality spread was this operation. Other typed event,
condition and draft operations already spread current cashReality. Existing
28-test native regression and the focused test pass. This does not retroactively
recover evidence lost by a previous version, and no real user data was modified.
