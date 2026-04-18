# ChamberCore — Sprint 0 Completion

## Status
Sprint 0 is complete at the decision/spec level.
Implementation can begin.

This completion covers the required decision locks before feature work:
- auth posture
- storage posture
- tenant posture
- benefits scope + ledger rules
- join flow scope
- member content scope
- QR fallback rule
- deploy/routing target

---

## Locked decisions

### 1. Routing / deploy target
- Build target remains: `aloomii.com/chamber-demo`

### 2. Auth posture
- Use a lightweight magic-link-first auth path
- Require App Router compatibility
- Use a shared auth foundation for admin + member flows
- Do not build heavy password reset / account recovery machinery in phase 1

### 3. Storage posture
- Use Cloudflare R2 for chamber demo assets
- Storage must support chamber logo, member logos, event images, and sponsor images if used
- Upload constraints + fallback behavior must be defined before asset UI work begins

### 4. Database posture
- Use existing PostgreSQL instance
- Isolate all demo data in `chamber.*`
- Use UUIDs everywhere
- Include `tenant_id` on chamber tables from day one
- Keep app logic single-tenant in phase 1

### 5. Benefit scope
Phase 1 benefit types are locked to:
- `free_event_tickets`
- `hot_deal_posts`
- `directory_logo`
- `featured_directory_placement`

### 6. Benefit ledger rules
- Ledger is append-only
- Never overwrite counters
- Ledger entries must include `reference_type` and `reference_id`
- Phase 1 `reference_type` values are locked to:
  - `registration`
  - `content_item`
  - `manual_adjustment`

### 7. Join flow scope
Phase 1 join is locked to:
1. visitor opens `/join`
2. submits organization/contact/tier application
3. sees success/pending state
4. admin reviews/approves in chamber admin

Phase 1 join is not a payment-led onboarding flow.

### 8. Member submission scope
Phase 1 member-submitted content is locked to:
- `hot_deal`

Allowed states:
- `draft`
- `pending_review`
- `published`
- `archived`

### 9. QR fallback rule
If QR check-in is built, it must also support:
- manual search
- tap-to-check-in fallback

If schedule pressure appears later, protect core member basics before deepening QR flow.

### 10. Admin scope rule
Admin exists to support the visible chamber-ops walkthrough.
Do not expand admin breadth into a second product in phase 1.

---

## Remaining pre-code check
These are not decision gaps, but they still must be verified during implementation startup:
- local dev auth flow actually works with the chosen auth stack
- R2 bucket/config is provisioned and accessible
- upload constraints/fallbacks are implemented consistently

---

## Sprint 0 verdict
Sprint 0 is complete enough to start Sprint 1.
There are no remaining scope ambiguities that should block schema, migration, or seed work.
