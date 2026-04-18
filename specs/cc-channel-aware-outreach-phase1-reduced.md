# Command Center — Channel-Aware Outreach Phase 1 (Reduced Scope)

## Goal
Ship the smallest real version of channel-aware outreach in Command Center.

Phase 1 should enforce channel discipline without overbuilding queue systems, Reddit infrastructure, or warm-channel sending.

Core principle:
- Email is the only outbound channel in Phase 1
- Warm channels are recognized but not activated for cold outbound
- Reddit is policy-only in Phase 1, not a sendable channel
- API must block invalid channel behavior

---

## 1. Phase 1 product scope

### What Phase 1 includes
1. **Email outbound as the only active outbound channel**
2. **Warm reply as a queue classification**, not yet a fully integrated channel executor
3. **API hard blocks** for invalid channel use
4. **Single outreach queue UI with filter chips**, not multiple new queue surfaces
5. **Blocked-state visibility** in CC

### What Phase 1 explicitly does NOT include
- dedicated Reddit Index table
- Reddit send flow
- outbound Reddit DM support
- warm-channel send integrations for WhatsApp / Telegram / iMessage
- full consent engine
- complex channel preference modeling
- multiple new queue dashboards

---

## 2. Channel policy for Phase 1

### Allowed outbound
- email

### Recognized but blocked for outbound
- WhatsApp
- iMessage/text
- Telegram
- Reddit DM

### Policy handling
- if a queue item is tagged with a blocked outbound channel, CC must mark it `blocked`
- UI must show why it is blocked
- API must refuse execution

---

## 3. Minimal schema changes

### `outreach_queue`
Add only:
- `queue_type` (`outbound_email`, `warm_reply`)
- `channel` (existing or normalized)
- `block_reason` (nullable text)

**Hardening note:** `warm_reply` must not become a catch-all label for every non-email item. In the next hardening pass, distinguish true inbound/warm-reply items from unsupported non-email cold outbound attempts.

### Reuse existing status field where possible
Current status can continue to carry states like:
- `pending`
- `blocked`
- `sent`
- `replied`
- `skipped`

Do not add a large new review-state machine in Phase 1 unless current workflow proves it is required.

---

## 4. API guardrails

Add direct channel checks in the send/execute route.

### Rule set
1. If `channel = email`
   - allow execution

2. If `channel IN ('whatsapp','imessage','telegram')`
   - reject outbound execution
   - set / return `block_reason = 'warm channel not enabled for cold outbound'`

3. If `channel = 'reddit_dm'`
   - reject outbound execution
   - set / return `block_reason = 'reddit dm outbound disabled; use reddit for reputation/inbound only'`

4. Only allow execute when `status IN ('pending', 'approved')`
   - reject already processed rows

5. Write every `blocked` or `sent` transition to `activity_log`

This should be implemented inline in the route logic, not as a separate guardrail subsystem.

---

## 5. Command Center UI changes

## Keep one queue surface
Do not create 4 separate queue pages in Phase 1.

### Add filter chips or segmented controls
- All
- Email outbound
- Warm reply
- Blocked

### Each queue item must show
- channel badge
- queue type
- current status
- block reason if blocked
- draft preview

### Blocked items
Blocked items should:
- appear visibly in the queue
- show red treatment or warning treatment
- not show an active send button
- show exact block reason

---

## 6. Warm reply handling in Phase 1

Phase 1 does not need full WhatsApp / Telegram / iMessage sending.

What it needs is only the concept of:
- this item is a **warm reply**
- this item should not be treated like cold outbound

So `queue_type = warm_reply` exists now for future routing, but actual multi-channel execution can wait.

---

## 7. Reddit handling in Phase 1

Reddit is policy-only in this phase.

That means:
- no outbound Reddit DM path
- no Reddit send button
- no Reddit-specific schema beyond channel/block reason if an item is tagged that way

UI copy should make clear:
- Reddit is for reputation, contribution, and inbound discovery
- not cold outbound

If needed, add a simple note in the queue or help text. Do not build Reddit infrastructure yet.

---

## 8. Rollout order

### Step 1
Add minimal schema changes:
- `queue_type`
- `block_reason`

### Step 2
Patch outbound execution route with hard channel checks

### Step 3
Update CC queue rendering:
- channel badge
- queue type
- blocked-state render
- filter chips

### Step 4
Test with seeded items:
- email outbound allowed
- reddit_dm blocked
- whatsapp blocked
- telegram blocked
- imessage blocked

### Step 5
Observe actual usage before designing Phase 2

### Step 6 — Hardening before Phase 2
- fix non-email backfill semantics so unsupported cold channels do not masquerade as `warm_reply`
- add status validation before execute
- add `activity_log` writes for blocked/sent transitions
- make send semantics explicit until real provider delivery exists
- align blocked Reddit channel wording across spec and implementation

---

## 9. Success criteria

Phase 1 is successful if:
1. CC no longer treats all channels as equally sendable
2. Email items can still move through the queue normally
3. Invalid channels are blocked at the API layer
4. Operators can see blocked items and understand why
5. Warm replies are conceptually separated from cold outbound without requiring full channel integrations yet
6. The implementation is understood as **Phase 1 guardrail infrastructure**, not real multichannel execution

---

## 10. Phase 2 trigger

Only move to Phase 2 when one of these is true:
- meaningful warm-reply volume actually appears
- Reddit inbound becomes real enough to justify tracking
- WhatsApp / iMessage / Telegram are needed often enough to justify real execution support

Until then, keep the system simple.
