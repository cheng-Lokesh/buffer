# V12 Undo Decision

V12 does not ship a short-lived Undo control.

Reason: a confirmed batch can create linked events, occurrence resolutions, condition changes, balance anchors, records and snapshots. A trustworthy Undo must restore the complete pre-commit Reality and derived evidence without leaving partial records. The current persistence layer does not yet expose a durable transaction journal that can guarantee that behavior across refresh and backup restore.

The safer V12 boundary is preview, per-candidate correction/removal, whole-batch validation and one atomic save before completion. This prevents the common error before it reaches Reality. Undo remains unapproved future work, not a hidden V12 gap and not authorization for Final Hardening.
