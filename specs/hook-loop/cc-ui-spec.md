# Command Center UI Spec — Hook Lab (Phase 1)

## Goal
Keep phase-1 UI simple while building on a generic attention-line foundation underneath.

## User-facing naming
- Section name: `Hook Lab`
- Internal concept: `attention-line engine`

## Phase-1 scope
Only show LinkedIn hook sessions in the UI for now, even though the backend/data model is generalized.

## Placement
Add Hook Lab inside the existing draft review flow in Command Center.

## Primary object shown in UI
The UI should think in terms of a **session**, not raw orphaned candidates.

A session contains:
- platform
- asset type
- topic context
- 2-3 candidate lines
- winner / recommended line

## Default card layout
```text
Hook Lab
Latest session • LinkedIn • Hook
Topic: [topic or draft context]

Recommended
"...candidate text..."
[Use] [Edit]

Runner-up
"...candidate text..."
[Use] [Edit]

[Regenerate]
```

## Default visible info
- session context
- recommended candidate
- one or two alternatives
- compact score if useful

## Hidden by default
- critique text
- judge rationale
- prompt internals
- platform-specific tuning details

## Actions
### Use
- marks candidate selected
- updates `content_posts.selected_hook_id`
- injects selected hook into draft body if needed

### Edit
- opens inline edit state
- if edited and saved, marks `hook_was_edited = true`

### Regenerate
- creates a new `attention_line_sessions` row
- creates new candidates under that session
- latest session becomes the visible one

## Phase-1 constraints
- no platform picker
- no multi-platform comparison UI
- no YouTube/X/email views yet
- no analytics dashboard in this panel yet

## Future-safe UI rule
The panel text should not hardcode LinkedIn in labels except where it is displaying the current session context.

Good:
- `Latest session • LinkedIn • Hook`
- `Hook Lab`
- `Candidates`

Avoid:
- `LinkedIn Hook Generator`
- `Generate LinkedIn Hook`

## Minimal API shape
- `GET /api/command/attention-lines/sessions/:postId/latest`
- `POST /api/command/attention-lines/sessions/:sessionId/hooks/:hookId/use`
- `PATCH /api/command/attention-lines/sessions/:sessionId/hooks/:hookId/edit`
- `POST /api/command/attention-lines/regenerate`
