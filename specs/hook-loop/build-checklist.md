# Attention-Line Engine Build Checklist

## Phase 1 principle
Build a generic attention-line engine now, but only execute it for `linkedin + hook` in phase 1.

## Phase 1.1 — Core engine
- [ ] Rename the concept from hook loop to attention-line engine in docs and service naming
- [ ] Keep the adversarial loop: A → critique → B → AB → judge
- [ ] Make the engine accept `platform` and `asset_type`
- [ ] Parameterize prompt rules by `platform` and `asset_type`
- [ ] Populate only `linkedin + hook` prompt config in phase 1
- [ ] Stub other platform/asset types as not implemented

## Phase 1.2 — Data model
- [ ] Add `platform` column to `content_hooks`
- [ ] Add `asset_type` column to `content_hooks`
- [ ] Add `loop_session_id` column to `content_hooks`
- [ ] Add `loop_role` column to `content_hooks`
- [ ] Add `judge_score` column to `content_hooks`
- [ ] Add `judge_rationale` column to `content_hooks`
- [ ] Add `post_id` column to `content_hooks`
- [ ] Add `selected_hook_id` to `content_posts`
- [ ] Add `hook_was_edited` to `content_posts`
- [ ] Create `attention_line_sessions` table
- [ ] Keep experimental detail in `content_hooks.metadata`

## Phase 1.3 — Backend wiring
- [ ] Add `scripts/content-engine/attention-line-loop.js`
- [ ] Return candidates grouped by one `loop_session_id`
- [ ] Insert candidate rows into `content_hooks`
- [ ] Mark winning candidate and score
- [ ] Attach winner to `content_posts.selected_hook_id`
- [ ] Wire weekly LinkedIn draft generation through this engine first

## Phase 1.4 — Command Center
- [ ] Keep phase-1 UI LinkedIn-only
- [ ] Add a simple Hook Lab panel in CC
- [ ] Show best 2-3 candidates only
- [ ] Add `Use`, `Edit`, `Regenerate`
- [ ] Keep internals hidden by default
- [ ] Label session context clearly: platform, asset type, topic

## Phase 1.5 — Measurement
- [ ] Track whether selected candidate was used as-is or edited
- [ ] Track adoption rate vs full rewrites
- [ ] Review weekly whether the engine is actually reducing rewrite work

## Explicit deferrals
- [ ] No X / YouTube / email execution in phase 1
- [ ] No platform picker in phase 1 UI
- [ ] No cross-platform analytics yet
- [ ] No autonomous publishing
- [ ] No separate standalone app
