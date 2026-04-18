# Phase 1 — Prospect Personalization Pass

## Goal
Improve conversion quality in the current outreach flow by inserting a grounded personalization pass before send.

## Scope
- manual-first research pass
- Command Center review surface
- no auto-send
- no fake personalization

## Grounding rule
Only generate personalization from a verified source:
- recent LinkedIn post
- recent company announcement
- hiring activity
- press quote
- website change
- podcast/interview quote

## Outputs
For each prospect in a batch:
- `personalization_source_type`
- `personalization_source_url`
- `personalization_note`
- `personalization_opener`
- review status

## Workflow
1. prospect enters outreach queue
2. researcher runs personalization pass on 5-10 prospects
3. opener is saved for review
4. Command Center reviewer approves / edits / rejects
5. approved opener is prepended to outreach draft before send

## Success metric
- better reply rate
- lower rewrite-from-scratch rate
- faster approval in CC
