# Command Center — Phase 2 Copy-First Accountability Plan

## Goal
Turn Command Center into a copy-first execution and accountability surface.

Phase 2 does not expand channel sending. It improves the real operator loop:
- review signal
- review/copy outreach
- send manually outside CC
- mark sent manually
- choose reminder window
- surface overdue follow-up
- learn what actually converts

Reddit Index is moved to Phase 3 as a separate reputation/intel module.

---

## 1. Product scope

### Phase 2 includes
1. **Copy-first outreach workflow**
   - copy opener
   - copy full outreach text
   - copy confirmation feedback

2. **Manual send tracking**
   - mark sent manually
   - record which channel was actually used

3. **Reminder-based accountability loop**
   - when marking sent, operator chooses reminder window:
     - 48h
     - 7d
     - 14d
   - overdue follow-up items surface in CC when reminder window expires

4. **Event-level attribution**
   - log key operator actions so Aloomii can see which signals were actually acted on

### Phase 2 explicitly does NOT include
- email provider integration
- WhatsApp/iMessage/Telegram sending integrations
- Reddit outbound DMs
- Reddit Index module (moved to Phase 3)
- complex reply-state machinery beyond practical operator actions

---

## 2. Data model

### `outreach_queue`
Add or normalize:
- `copied_at TIMESTAMPTZ`
- `sent_manually_at TIMESTAMPTZ`
- `manual_send_channel TEXT`
- `reply_expected_by TIMESTAMPTZ`
- `outcome_status TEXT`
- `last_operator_action TEXT`

### Required enums
#### `manual_send_channel`
Allowed values:
- `email`
- `whatsapp`
- `imessage`
- `telegram`
- `other`

#### `outcome_status`
Allowed values:
- `draft`
- `copied`
- `sent_manual`
- `followup_due`
- `replied`
- `no_reply`
- `not_sending`
- `archived`

### `activity_log`
Write one event for each operator action:
- `outreach_copied`
- `outreach_sent_manual`
- `outreach_reply_logged`
- `outreach_no_reply`
- `outreach_followup_due`

Do not add a separate `outreach_events` table in this phase unless `activity_log` proves insufficient.

---

## 3. Command Center UI changes

## A. Replace/de-emphasize Send Now
Primary actions should become:
- `Copy opener`
- `Copy full text`
- `Mark sent`
- `Log reply`
- `Log no reply`

## B. Queue views / filters
Keep the UI tight.
Phase 2 should prioritize operator behavior, not excessive segmentation.

### First filters to ship
- Ready to send
- Follow-up due

### Later in Phase 2 if needed
- Copied not sent
- Waiting on reply
- Closed

## C. Queue card metadata
Each item should show:
- source signal context
- personalization status
- copied state
- sent-manual state
- reminder due date
- overdue warning if applicable
- last operator action

## D. Overdue surfacing
If `reply_expected_by < NOW()` and no closeout action exists:
- show item prominently in `Follow-up due`
- mark visually as overdue

---

## 4. Workflow logic

## A. Copy action
When operator clicks `Copy full text`:
- write `copied_at = NOW()`
- set `outcome_status = 'copied'`
- set `last_operator_action = 'copied'`
- log `outreach_copied`

## B. Mark sent
When operator clicks `Mark sent`:
- prompt for `manual_send_channel`
- prompt for reminder window:
  - 48h
  - 7d
  - 14d
- calculate `reply_expected_by`
- write:
  - `sent_manually_at = NOW()`
  - `manual_send_channel`
  - `reply_expected_by`
  - `outcome_status = 'sent_manual'`
  - `last_operator_action = 'sent_manual'`
- log `outreach_sent_manual`

## C. Log reply
When operator logs reply:
- set `outcome_status = 'replied'`
- set `last_operator_action = 'replied'`
- log `outreach_reply_logged`

## D. Log no reply
When operator logs no reply:
- set `outcome_status = 'no_reply'`
- set `last_operator_action = 'no_reply'`
- log `outreach_no_reply`

## E. Follow-up due job
Scheduled check should find:
- `outcome_status = 'sent_manual'`
- `reply_expected_by < NOW()`
- no reply / no closeout logged

Then:
- set `outcome_status = 'followup_due'`
- set `last_operator_action = 'followup_due'`
- log `outreach_followup_due`

This is the accountability loop.

---

## 5. Rollout sequence

### Phase 2 Sprint 1
Merge copy UX + accountability loop together:
- copy opener / full text
- mark sent manually
- reminder window prompt
- follow-up due surfacing
- event logging

### Phase 2 Sprint 2
Attribution visibility and operator pressure:
- clearer event visibility in CC
- pending / overdue visibility improvements
- optional lightweight reminder/escalation surface if needed

### Phase 3
Reddit Index / Reddit Intel module:
- subreddit tracking
- standing / notes
- cadence tracking
- research + reputation only

---

## 6. Success criteria

Phase 2 is successful if:
1. CC makes manual outreach execution faster than working from random notes
2. Every manual send becomes a tracked event
3. Reminder windows make follow-up responsibility visible and time-bound
4. Aloomii can see which signals were actually copied, sent, and replied to
5. The product improves human execution consistency without pretending to be a delivery engine

---

## 7. Non-goals
- real outbound delivery infrastructure
- warm-channel execution integrations
- Reddit DM tooling
- autonomous follow-up sending

Phase 2 is about execution accountability, not channel sprawl.
