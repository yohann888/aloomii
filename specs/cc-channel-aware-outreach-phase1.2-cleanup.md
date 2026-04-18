# Command Center — Channel-Aware Outreach Phase 1.2 Cleanup

## Goal
Close the last obvious semantic and execution gaps in the Phase 1 / 1.1 slice without expanding scope.

This phase is a cleanup pass, not a new feature phase.

---

## Cleanup items

### 1. Fix awkward queue typing for edge cases
Problem:
- unsupported non-email items may still inherit awkward `queue_type` semantics

Cleanup direction:
- keep `outbound_email` for true email outbound
- keep `warm_reply` for actual warm-channel reply workflows
- for unsupported channels, rely on channel + blocked state rather than pretending the queue type is fully meaningful
- document this limitation clearly until a broader queue taxonomy is justified

### 2. Tighten execute semantics
Problem:
- execute can still look more final than it really is

Cleanup direction:
- return clearer execution metadata
- use wording that reflects command-center execution recording, not guaranteed external delivery
- keep this explicit in code comments and API response body

### 3. Make execution check more atomic
Problem:
- select-then-update leaves a cleaner but still imperfect race window

Cleanup direction:
- collapse status validation into the update path where practical
- prefer `UPDATE ... WHERE status IN (...) RETURNING ...`

---

## Success criteria
1. Remaining queue-type ambiguity is documented and minimized
2. Execute semantics are harder to misread as confirmed delivery
3. Execution path is slightly more atomic and safer
4. Phase 1 stop point is clear after this cleanup
