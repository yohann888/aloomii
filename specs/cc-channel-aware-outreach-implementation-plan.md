# Command Center — Channel-Aware Outreach Implementation Plan

## Goal
Turn Command Center from a generic outreach queue into a channel-aware system that enforces channel discipline.

Core principle:
- Email = primary outbound
- Reddit = reputation / discovery / inbound only
- WhatsApp / iMessage / Telegram = warm relationship continuation only
- UI should block invalid channel behavior instead of relying on operator memory

---

## 1. Product model

### Queue types
1. **Outbound Email Queue**
   - cold or warm first-touch email
   - source: signals, CRM triggers, manual queueing

2. **Warm Reply Queue**
   - replies or continuation threads from:
     - email replies
     - WhatsApp
     - iMessage/text
     - Telegram
     - inbound Reddit DMs

3. **Reddit Index / Reputation Queue**
   - not a DM queue
   - tracks:
     - subreddit targets
     - standing / karma / notes
     - daily comment task
     - weekly value-post task

4. **Review Queue**
   - all outbound-capable items pass here before send
   - also used for warm-channel replies when confidence is low or contact is sensitive

---

## 2. Channel policy

### Allowed outbound now
- email

### Allowed warm / continuation only
- WhatsApp
- iMessage/text
- Telegram

### Allowed inbound / reputation only
- Reddit
  - public comments/posts
  - inbound DMs only
  - no outbound Reddit DMs

### Hard blocks
- outbound Reddit DM
- cold WhatsApp
- cold iMessage/text
- cold Telegram

---

## 3. Schema changes

### `outreach_queue`
Add or normalize:
- `channel`
- `queue_type` (`outbound_email`, `warm_reply`, `reddit_index`, `review`)
- `channel_mode` (`outbound`, `warm_reply`, `inbound`, `reputation`)
- `consent_status` (`unknown`, `implicit`, `explicit`, `inbound_first`)
- `consent_basis`
- `source_signal_id`
- `source_channel`
- `review_status` (`draft`, `pending_review`, `approved`, `blocked`, `sent`, `replied`, `archived`)
- `block_reason`
- `thread_reference`

### `contacts`
Add if missing:
- `preferred_channel`
- `whatsapp_opt_in`
- `telegram_handle`
- `phone_number`
- `reddit_username`
- `channel_notes`

### New table: `reddit_index`
Columns:
- `id`
- `subreddit`
- `icp`
- `subscriber_count`
- `promo_rules`
- `account_name`
- `karma_snapshot`
- `last_comment_date`
- `last_post_date`
- `top_comment_url`
- `notes`
- `priority`
- `status`

This can be DB-native from day one. No need to keep this in Sheets if CC is going to own it.

---

## 4. Guardrail engine

Implement a channel guardrail layer in CC/API.

### Guardrail rules
1. If `channel = email`
   - allow outbound
   - require review unless explicitly approved sequence continuation

2. If `channel IN (whatsapp, imessage, telegram)`
   - require `consent_status IN ('explicit', 'inbound_first', 'implicit')`
   - otherwise set `review_status = 'blocked'`
   - set `block_reason = 'warm channel requires prior relationship or inbound trigger'`

3. If `channel = reddit_dm`
   - if initiated by us: always `blocked`
   - if inbound-first thread exists: route to `warm_reply`

4. If `queue_type = reddit_index`
   - do not show send button
   - show task completion / link tracking only

---

## 5. Command Center UI changes

### A. Replace generic outreach queue tabs with queue-aware views
Add views:
- Outbound Email
- Warm Replies
- Reddit Index
- Review

### B. Every queue item shows
- channel badge
- queue type
- consent status
- consent basis
- source signal / source channel
- last thread context
- review status
- block reason if blocked

### C. Review pane rules
- Outbound email: approve/edit/send
- Warm reply: approve/edit/send only if consent rule passes
- Reddit index: no send UI, only:
  - mark comment done
  - mark weekly post drafted
  - open source link

### D. Hard visual treatment
- blocked items must be red and explicit
- no hidden behavior
- operator should know exactly why sending is disallowed

---

## 6. Send/execution rules

### Email
- send-capable from CC
- first channel to fully operationalize

### WhatsApp / iMessage / Telegram
- not enabled for cold outbound
- can be enabled later only through warm-reply queue with review gate
- actual send integration should remain secondary to queue/rules first

### Reddit
- no outbound send path in CC
- only:
  - contribution tracking
  - inbound DM response queue if inbound exists

---

## 7. Rollout sequence

### Phase 1
- add queue_type / channel_mode / consent / review fields
- implement guardrail rules in API
- add blocked state to UI
- keep email as only send-capable outbound

### Phase 2
- split CC into 4 queue views
- move current outreach queue into channel-aware rendering
- add review queue behaviors

### Phase 3
- add `reddit_index` table + Reddit Index view
- support daily comment task + weekly post task tracking
- no Reddit DM initiation

### Phase 4
- wire warm-reply queue for WhatsApp / Telegram / iMessage
- only activate where prior relationship exists
- keep strict review requirement

### Phase 5
- only after proof of behavior: unify thread history and per-channel execution affordances

---

## 8. Success criteria

1. CC cannot initiate invalid channel behavior
2. Email outbound is clean and reviewable
3. Warm channels only appear when relationship basis exists
4. Reddit is represented as a reputation system, not a DM queue
5. Operators can tell why an item is blocked in one glance
6. The queue architecture matches channel reality instead of pretending all channels behave the same
