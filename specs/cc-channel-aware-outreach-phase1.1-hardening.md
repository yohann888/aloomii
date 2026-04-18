# Command Center — Channel-Aware Outreach Phase 1.1 Hardening

## Goal
Harden the reduced Phase 1 guardrail slice so it is less misleading and safer to build on.

This phase does not add new channels. It corrects semantics and auditability in the existing Phase 1 implementation.

---

## 1. Hardening items

### A. Fix queue classification semantics
- stop treating every non-email item as `warm_reply`
- only classify as `warm_reply` when the item is actually reply/inbound-driven
- unsupported non-email cold items should remain visibly blocked or default to a safer label

### B. Add execute status validation
- execute should only run when status is `pending` or `approved`
- already processed rows should be rejected with a clear error

### C. Add audit trail
- when queue item transitions to `blocked` or `sent`, write to `activity_log`
- include queue id, channel, status transition, block_reason where relevant

### D. Clarify send semantics
- until a real provider integration exists, execution should be described as queue execution, not guaranteed delivery
- code comments/spec text should make this explicit

### E. Align Reddit block wording
- keep the same policy language everywhere:
  `reddit dm outbound disabled; use reddit for reputation/inbound only`

---

## 2. Code targets
- `scripts/dashboard/command-api.js`
- `command/app.js` only if UI copy needs clarification
- optional migration only if existing queue_type values must be corrected in bulk

---

## 3. Success criteria
1. Non-email queue items no longer imply they are valid warm replies by default
2. Execute endpoint rejects invalid statuses
3. `activity_log` records blocked/sent transitions
4. Code/comments no longer overstate actual delivery behavior
5. GLM review confirms the hardened slice is materially safer and clearer
