# V12 Deferred Hardening

## P0 / P1

None open.

## P2 / P3

None discovered in the final V12 scope.

Undo was evaluated and deliberately not implemented because complete rollback across linked events, resolutions, conditions, records and snapshots requires a durable transaction journal. This is a product/architecture decision documented in `05-undo-decision.md`, not authorization to start Final Hardening.

OCR, bank sync, external AI providers, full accounting, multi-account support and Mini Program voice transcription are explicitly outside V12.
