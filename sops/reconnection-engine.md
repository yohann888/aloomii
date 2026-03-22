# SOP: Reconnection Engine — Cold Lead Reactivation

## Purpose
Reactivate cold leads and dormant relationships to unlock hidden pipeline. Every Monday at 9 AM, select a dormant contact (90+ days), draft a personalized reconnection message, and deliver for human review before sending. A good SDR never lets a lead die permanently — this agent makes sure no relationship is truly dead.

## Trigger
- Cron: Every Monday 9:00 AM EST
- Model: flash (low cost, high volume)

## Step 0: Fleet Directives
Read `daily/fleet-directives.md` at the start of every run. Apply any directives targeting `[reconnection-engine]` or `[ALL]` before selecting a contact or drafting. Directives may override tone, angle, or contact selection criteria for that run.

## Step 0.1 — Load ICP Config
Read `config/signal-scout-icps.yaml`. Determine which ICPs are active — this shapes the outreach angle used in the message draft.
- `sprint.enabled: true` → Sprint angle available: founder GTM, marketing foundations, content visibility
- `ai_workforce.enabled: true` → AI Workforce angle available: client retention, relationship automation, renewal tracking
- Both active → use whichever angle best fits the individual contact's industry/role

## Selection Logic
1. Read `contacts.yaml` — filter contacts with `last_contacted` > 90 days ago (or never contacted)
2. If all contacts are recent, fall back to least-recently-contacted
3. Random selection from eligible pool — randomness is the point
4. Prefer contacts with `structural_hole_value: high` (3x weight) or `medium` (2x weight)

## Message Rules
- Under 4 sentences — brevity signals respect
- Reference something specific to them (industry, last interaction, shared context)
- NEVER pitch Aloomii — this is relationship maintenance, not sales
- Include a genuine question — invites dialogue
- Match tone to relationship (formal for execs, casual for old colleagues)

## ICP Angle Selection (apply when drafting)
After selecting the contact, classify them against active ICPs:

**Sprint angle** — use if contact is: a B2B SaaS founder, indie builder, startup founder, dev tool company, or anyone who sells to other businesses and has a small team. Angle: their GTM, how they're getting visible, what's working for growth, content + LinkedIn presence, founder-led marketing.

**AI Workforce angle** — use if contact is: insurance broker, financial advisor, wealth manager, professional services firm, or anyone whose revenue depends on long-term client relationships. Angle: client retention, relationship health, renewal automation, what they're doing to stay top-of-mind with their book of business.

**Neutral angle** — use if contact is an investor, media/podcast, or doesn't fit either ICP. Keep it relationship-first with no product angle at all.

**Rule:** Never force an angle. If the contact doesn't map cleanly to an active ICP, default to neutral.

## Output
- Draft message (subject line + body)
- Suggested channel (email / linkedin / twitter DM / text)
- Deliver to Discord #general for Yohann's review

## Post-Draft
- After generating the draft, update `relationships/[handle].md` with `last_reconnection_draft: [date]` so Relationship Monitor knows this contact was recently actioned.
- If `relationships/[handle].md` does not exist, create it as a minimal stub (source: reconnection-engine, last_reconnection_draft: [date]).

## Post-Send
- Update contact's `last_contacted` date
- Add brief `last_interaction_note`
- Log in `pipeline/attribution.yaml` as reconnection-engine chain

## Phase 2 Enhancements
- Cross-pollination introductions (monthly: connect 2 contacts from different networks)
- Signal Scout integration (reference industry news in messages)
- Weighted random selection by structural_hole_value
