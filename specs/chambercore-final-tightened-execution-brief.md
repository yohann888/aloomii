# ChamberCore — Final Tightened Execution Brief

## Project
Build `aloomii.com/chamber-demo` as a polished single-tenant chamber demo that is production-shaped, but execution-disciplined.

This is not a toy mockup.
This is also not permission to build the full future SaaS in phase 1.

The objective is to ship a compelling, credible chamber demo that can close the client, while preserving the core architecture needed for later hardening and expansion.

---

## 1. Build posture

### Keep
- single-tenant now, multi-tenant later
- UUID primary keys from day one
- append-only benefit ledger with traceability
- modern app stack
- realistic seeded data
- polished public and admin-facing demo surfaces

### Do not overbuild
Do not let future SaaS ambitions delay the first sellable version.

If time pressure appears, preserve:
1. public experience
2. admin CRM / chamber operations view
3. believable member flow
4. architectural correctness in the schema

And cut depth before cutting coherence.

---

## 2. Locked architectural decisions

### App / stack
- Next.js 14
- Prisma
- PostgreSQL
- Tailwind CSS + shadcn/ui

### Database strategy
Use the existing PostgreSQL instance, but isolate all work in a dedicated schema:
- `chamber.*`

No demo table should live in Aloomii operational tables.
No chamber routes should depend on Aloomii CRM tables.

### Primary keys
- UUIDs everywhere

### Tenant strategy
Build as a single-tenant application now.
Do not build full multi-tenancy in phase 1.
But do not bake in assumptions that make tenant extraction painful later.

### Tenant ID decision
Include a `tenant_id` column on chamber tables from day one, even if Phase 1 only uses one tenant value.
This keeps the schema migration path additive instead of disruptive later.
App logic can remain single-tenant for now, but the data model should not pretend multi-tenant conversion will be free if tenant context is absent.

### Core hardening to preserve now
- benefit ledger remains append-only
- ledger entries keep `reference_type` and `reference_id`
- chamber branding/config should be data-backed, not hardcoded in templates

---

## 3. Decisions that must be locked before coding starts

### A. Auth choice
Sprint 0 lock:
- use a lightweight magic-link-first auth path
- use an App Router-compatible auth implementation
- establish a shared auth foundation for both admin and member flows before feature work begins

Requirement:
- admin login
- member login
- stable local dev workflow
- no heavy password-reset/account-recovery machinery in the demo phase unless it becomes strictly necessary

### B. File / asset storage
Sprint 0 lock:
- use Cloudflare R2 as the asset storage provider

This must cover:
- chamber logo
- member logos
- event images
- sponsor images if used

Implementation rule:
- define upload constraints and fallback behavior before UI upload work begins

### C. Tier benefits typing
Do not leave tier benefits as loose JSON.
If benefits are stored in JSONB, they must still have an enforced application schema.

Sprint 0 lock phase 1 benefits to:
- `free_event_tickets`
- `hot_deal_posts`
- `directory_logo`
- `featured_directory_placement`

Use a typed benefits object plus validation.

### D. Demo QR fallback
If QR check-in exists in the demo, it must also support:
- manual search
- tap-to-check-in fallback

Sprint 0 lock:
- QR is part of the event story, but core member experience takes priority if schedule pressure appears

Do not rely entirely on mobile camera permissions in a live demo environment.

---

## 4. Phase 1 scope

Phase 1 should be the first genuinely sellable slice.

### Public surfaces
Build:
- homepage
- member directory
- member profile pages
- events list
- event detail pages
- news/blog index
- news/blog detail pages
- join page

### Chamber/admin surfaces
Build:
- admin login
- chamber dashboard / CRM view
- members list + detail
- event management
- content moderation / publishing surface
- chamber settings / branding

Admin scope rule:
Admin exists to support the visible demo story and chamber operations walkthrough.
Do not let admin breadth turn into a second product inside the demo build.
If an admin feature does not materially improve the public/member walkthrough or operational credibility, defer it.

### Member surfaces
Build:
- member login
- member dashboard
- profile editing
- content submission entry point if included in scope

### Event flow
Build:
- event listing
- event registration path
- QR check-in with manual fallback

### Billing / benefits
Build only enough to support the demo story credibly.
Do not let billing complexity consume the build.

---

## 5. What must be real in Phase 1

These should be real, not fake:
- database schema in `chamber.*`
- seed data
- public directory data flow
- events data flow
- admin member management surface
- benefit ledger shape
- branding/config data source

These are foundational and worth doing properly.

---

## 6. What can be simplified in Phase 1

If time gets tight, simplify these before touching the core architecture:

### Simplify first
- number of content types
- billing automation depth
- ROI dashboard sophistication
- secondary integrations
- deep email sync/history logic
- advanced reporting

### Preferred content-scope reduction
If needed, start with:
- Hot Deals
and defer deeper support for:
- Jobs
- RFPs
- Classifieds

### Preferred billing simplification
Keep:
- dues / tier representation
- visible payment status
- believable admin billing state

Defer if needed:
- advanced renewal automation
- deep dunning logic
- accounting integrations

---

## 7. Recommended schema posture

Keep the schema production-shaped, but only as deep as needed for the first credible build.

Core tables likely required in phase 1:
- `chamber.organizations`
- `chamber.users`
- `chamber.tiers`
- `chamber.benefit_ledger`
- `chamber.content_items`
- `chamber.events`
- `chamber.ticket_types`
- `chamber.registrations`
- `chamber.page_views`
- `chamber.settings` or equivalent branding/config table

If any table is included, it must serve either:
- a visible demo flow, or
- a foundational architectural need

Do not add speculative tables "for later" without a phase 1 use.

---

## 8. Seed data requirements

The demo will only feel real if the seed data feels real.

Seed:
- 25–30 believable Ontario businesses
- 3 chamber tiers
- realistic chamber branding
- 4–6 upcoming events
- 2–4 recent/past events
- 8–10 realistic timeline/email/activity examples if activity history is shown
- 6–10 content items if content marketplace is shown
- mixed renewal/payment states
- realistic logos/images wherever possible

The seed layer is part of the product, not a cleanup task.

---

## 9. Recommended rollout sequence

### Phase 0 — foundation
- lock auth choice
- lock storage choice
- define typed benefit schema
- create `chamber.*` schema
- write migrations
- seed base data

### Phase 1 — public experience
- homepage
- directory
- profiles
- events
- news/blog
- join flow

### Phase 2 — chamber/admin operations
- admin auth
- CRM/member management view
- settings/branding
- content moderation/publishing

### Phase 3 — member experience + event operations
- member auth
- member dashboard
- event registration
- QR check-in + manual fallback
- ledger wiring for visible member benefits

### Phase 4 — polish + demo hardening
- responsive QA
- seed data polish
- visual polish
- smoke test live demo flows
- prepare walkthrough script

---

## 10. Risks to actively manage

### Highest-risk implementation areas
- auth friction in App Router
- asset storage ambiguity
- over-flexible JSONB benefit logic
- QR camera demo failure
- phase bleed from demo into full SaaS ambition
- timeline compression in event/ledger phase

### Mitigations
- resolve auth and storage before coding
- validate benefit schema at app layer
- add QR fallback
- cap phase 1 content scope if needed
- add explicit buffer in delivery expectation

---

## 11. Delivery rule if time gets squeezed

If the build starts to slip, do NOT cut the following:
- public polish
- admin credibility
- seed data quality
- schema correctness

Instead cut:
- extra content types
- advanced analytics depth
- advanced billing automation
- low-value integrations

The prospect must leave believing:
- this system is real
- this system is thoughtful
- this system can grow
- Aloomii can ship it cleanly

---

## 12. Final recommendation

Proceed with ChamberCore.

But build it with discipline:
- production-shaped architecture
- demo-first execution priorities
- no ambiguity on auth, storage, or benefits typing
- no overbuilding beyond the first compelling chamber walkthrough

The right outcome is not “we built every future feature.”
The right outcome is:

**we shipped a polished chamber system demo that is credible now and structurally ready for expansion later.**
