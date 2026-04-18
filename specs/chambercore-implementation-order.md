# ChamberCore — Implementation Order / Sprint Plan

## Goal
Build `aloomii.com/chamber-demo` in the right order so the team preserves demo coherence, schema correctness, and sales value.

This plan assumes:
- `chambercore-final-tightened-execution-brief.md`
- `chambercore-builder-checklist.md`
- `chambercore-scope-floor-addendum.md`

are the governing scope documents.

---

## Sprint 0 — Lock the build rules

### Outcome
No coding starts until the build-critical decisions are locked.

### Tasks
- [ ] Finalize auth approach
- [ ] Finalize shared auth foundation for both admin and member flows
- [ ] Finalize storage provider and upload rules
- [ ] Finalize typed benefits schema
- [ ] Finalize ledger rules for phase 1
- [ ] Finalize join flow scope
- [ ] Confirm join remains application + approval in phase 1, not payment-led onboarding
- [ ] Finalize Hot Deals-only submission scope
- [ ] Confirm `tenant_id` posture across chamber tables
- [ ] Confirm QR check-in fallback behavior
- [ ] Confirm routing/deploy approach for `aloomii.com/chamber-demo`

### Deliverables
- auth decision written down
- storage decision written down
- typed benefits schema written down
- scope floor accepted as locked

### Exit criteria
No unresolved ambiguity remains around auth, storage, benefits, join flow, or content scope.

---

## Sprint 1 — Foundation and seed reality

### Outcome
The project has a working foundation with believable data before UI depth expands.

### Tasks
#### Schema + infra
- [ ] Create `chamber.*` schema
- [ ] Add base chamber tables
- [ ] Add UUID PKs everywhere
- [ ] Add `tenant_id` across chamber tables
- [ ] Add indexes for key reads
- [ ] Configure Prisma / DB access
- [ ] Configure storage integration

#### Seed layer
- [ ] Seed chamber branding first
- [ ] Seed chamber settings/config
- [ ] Seed 25–30 organizations
- [ ] Seed 3 tiers
- [ ] Seed admin/member users
- [ ] Seed events
- [ ] Seed content items
- [ ] Seed payment/renewal realism if shown
- [ ] Seed logos/placeholders
- [ ] Seed CRM/activity examples if surfaced

### Deliverables
- migrations committed
- seed scripts committed
- demo data visible in DB

### Exit criteria
The chamber data model is real and the seed layer already feels like a believable chamber.

---

## Sprint 2 — Public experience first

### Outcome
A prospect can land on `chamber-demo` and immediately understand the value.

### Tasks
#### Homepage
- [ ] Build homepage
- [ ] Wire branding from chamber settings
- [ ] Add hero, featured members, upcoming events, and join CTA

#### Directory
- [ ] Build member directory page
- [ ] Build organization detail page
- [ ] Add search/filtering if kept in scope
- [ ] Ensure logo fallback works

#### Events
- [ ] Build events listing
- [ ] Build event detail page
- [ ] Add registration CTA surface

#### Content/news
- [ ] Build content/news index
- [ ] Build content detail page
- [ ] Keep public content scope coherent with Hot Deals-first rule

#### Join page
- [ ] Build join page
- [ ] Implement org/contact/tier application flow
- [ ] Show success/pending state

### Deliverables
- public homepage
- directory
- org detail
- events pages
- content/news pages
- join page

### Exit criteria
The public experience already feels polished enough for a top-of-funnel demo.

---

## Sprint 3 — Admin credibility layer

### Outcome
The prospect can see that chamber staff can actually operate the system.

### Tasks
#### Shared auth foundation + admin auth
- [ ] Implement shared auth foundation for admin and member access
- [ ] Implement lightweight admin auth
- [ ] Verify stable local + deployed access
- [ ] Ensure auth choices made here do not require refactor when member auth is added

#### Dashboard / CRM
- [ ] Build admin dashboard
- [ ] Show member/org summary blocks
- [ ] Show pending actions / moderation / renewals if in scope

#### Member management
- [ ] Build organization/member list
- [ ] Build member detail view
- [ ] Expose tier, status, renewal, contact, and benefit summary
- [ ] Add only the limited edit actions needed for demo credibility

#### Content moderation
- [ ] Build content review list
- [ ] Build approve/archive flow for Hot Deals

#### Settings/branding
- [ ] Build settings view
- [ ] Verify chamber branding is data-backed, not template-hardcoded

### Deliverables
- admin login
- admin dashboard
- member/org management
- content moderation
- branding/settings view

### Exit criteria
The admin side is credible enough to support a live chamber-ops walkthrough.

---

## Sprint 4 — Member experience and event story

### Outcome
The prospect can see the member side and the event/check-in narrative end to end.

### Sprint risk note
This is the most likely bottleneck sprint.
If schedule pressure appears, protect the core member flow first and defer QR/check-in depth before compromising the basic member experience.

### Tasks
#### Member auth
- [ ] Implement lightweight member auth
- [ ] Verify member access flow

#### Member dashboard
- [ ] Build member dashboard
- [ ] Show org summary
- [ ] Show tier/benefit state
- [ ] Show upcoming events / registrations

#### Profile management
- [ ] Build profile edit flow
- [ ] Verify asset upload path if logo editing is in scope

#### Hot Deal submission
- [ ] Build Hot Deal submit flow only
- [ ] Use states: draft / pending_review / published / archived
- [ ] Connect to admin moderation flow

#### Event registration
- [ ] Build registration flow
- [ ] Connect to member identity + ticketing model

#### Check-in
- [ ] Build QR check-in
- [ ] Build manual search fallback
- [ ] Build tap-to-check-in fallback
- [ ] Test on actual phone/browser hardware
- [ ] If Sprint 4 compresses, defer QR/check-in depth to Sprint 5 before cutting member basics

### Deliverables
- member login
- member dashboard
- minimal profile management
- Hot Deal submission
- registration flow
- QR + manual fallback check-in flow

### Exit criteria
The member and event story works well enough to be demoed without apology.

---

## Sprint 5 — Benefits, billing visibility, and polish

### Outcome
The demo has enough operational depth to feel production-shaped without unnecessary complexity.

### Tasks
#### Benefits
- [ ] Implement typed benefits object
- [ ] Implement ledger write helpers
- [ ] Verify append-only behavior
- [ ] Test registration/content/manual adjustment ledger flows

#### Billing visibility
- [ ] Add minimum dues/payment status visibility if part of the sales narrative
- [ ] Because join flow is application + approval in phase 1, do not pull payment complexity forward unless scope is explicitly re-expanded
- [ ] Do not expand into advanced billing automation unless phase 1 is otherwise complete

#### Demo polish
- [ ] Polish responsive states
- [ ] Replace weak placeholder content
- [ ] Fix broken visual edges
- [ ] Test asset fallbacks
- [ ] Prepare backup screenshots/video
- [ ] Prepare guided walkthrough order

### Deliverables
- benefit logic wired for phase 1 scenarios
- minimum billing visibility if needed
- polished demo flows
- backup demo assets

### Exit criteria
The demo is polished, believable, and robust enough for a prospect meeting.

---

## If schedule slips

### Protect first
- public polish
- seed realism
- admin credibility
- member/event story
- schema correctness

### Cut first
- extra content types
- advanced analytics
- advanced billing automation
- non-essential integrations
- non-essential admin controls

### Absolute rule
Never trade away the story coherence of the demo just to preserve technical breadth.

---

## Final build sequence summary
1. Lock decisions
2. Build schema + seed reality
3. Ship public experience
4. Ship admin credibility
5. Ship member + event story
6. Add benefits/billing minimums
7. Polish and harden demo

This is the order that best protects sales value and technical integrity at the same time.
