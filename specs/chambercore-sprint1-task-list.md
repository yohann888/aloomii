# ChamberCore — Sprint 1 Task List

## Goal
Start Sprint 1 by completing the foundation and seed-reality work that unlocks the rest of the build.

Sprint 1 is successful when:
- `chamber.*` schema exists
- migrations exist for the base chamber tables
- seed scripts populate believable chamber demo data
- transactional email choice is locked for magic links
- R2 asset path is provisioned or explicitly stubbed for local/dev
- role model is defined
- ledger compensating-entry behavior is defined

---

## 1. Day-1 unblockers

### 1.1 Transactional email decision
- [x] Choose transactional email provider for magic links: Resend
- [x] Recommended: Resend
- [x] Document sender/from address strategy in config scaffolding
- [ ] Confirm local/dev fallback strategy

### 1.2 Asset storage startup
- [x] Lock Cloudflare R2 as the asset storage provider in config
- [ ] Provision Cloudflare R2 bucket or confirm dev stub strategy
- [ ] Define bucket/path naming for:
  - chamber logos
  - member logos
  - event images
  - sponsor images
- [ ] Define file type + size rules
- [ ] Define missing asset fallback behavior

### 1.3 Basic auth/role model
- [x] Define `role` model on chamber users
- [x] Minimum phase 1 roles:
  - `super_admin`
  - `member_admin`
  - `member_rep`
- [ ] Confirm which routes/views each role can access in phase 1

### 1.4 Ledger edge-case rules
- [x] Define duplicate reference handling in helper/scaffold layer as explicit validation concern
- [x] Define cancellation / reversal behavior as compensating ledger entries
- [x] Confirm append-only rule holds in every case

---

## 2. Schema implementation

### 2.1 Migration file
- [x] Create initial ChamberCore migration in `infra/db/migrations/`
- [x] Use `chamber.*` schema only
- [x] Add UUID primary keys
- [x] Add `tenant_id` to chamber tables

### 2.2 Core tables
- [x] `chamber.organizations`
- [x] `chamber.users`
- [x] `chamber.tiers`
- [x] `chamber.benefit_ledger`
- [x] `chamber.content_items`
- [x] `chamber.events`
- [x] `chamber.ticket_types`
- [x] `chamber.registrations`
- [x] `chamber.page_views`
- [x] `chamber.settings`

### 2.3 Constraints / indexes
- [x] Add key uniqueness constraints
- [x] Add indexes for slug lookup, tenant lookup, status lookup, event date lookup
- [x] Ensure no accidental dependency on existing Aloomii operational tables

---

## 3. Seed implementation

### 3.1 Chamber identity
- [x] Seed chamber name
- [x] Seed chamber tagline
- [x] Seed chamber logo/path
- [x] Seed color/theme config
- [x] Seed contact details

### 3.2 Organizations + users
- [x] Seed 25–30 believable Ontario organizations
- [x] Seed users tied to those organizations
- [x] Seed role mix for admin/member demo flows
- [x] Seed tier assignments and statuses

### 3.3 Events + content
- [x] Seed 4–6 upcoming events
- [x] Seed 2–4 past/recent events
- [x] Seed Hot Deals content
- [x] Seed realistic event metadata and locations

### 3.4 Demo realism
- [x] Seed realistic logos/placeholders
- [x] Seed renewal/payment-state realism if shown later
- [ ] Seed activity/timeline realism if surfaced in admin CRM
- [ ] Review seed set for visual credibility, not just row count

---

## 4. Config + code scaffolding

### 4.1 App-level config
- [x] Add chamber-demo config surface or config file as needed
- [x] Add environment variable placeholders for:
  - DB URL
  - R2 credentials
  - email provider
  - app base URL

### 4.2 Data access scaffolding
- [x] Create shared DB access helpers for chamber schema work
- [x] Ensure queries are tenant-aware from day one in scaffolding
- [x] Add typed benefits schema helper
- [x] Add ledger helper scaffolding

### 4.3 Local dev readiness
- [ ] Confirm local app boot path for chamber-demo work
- [x] Confirm migrations can be applied locally
- [x] Confirm seed script can be run repeatedly/idempotently enough for dev

---

## 5. Done definition for Sprint 1

Sprint 1 is complete when:
- [ ] migration(s) exist and apply cleanly
- [ ] `chamber.*` schema exists in local PG
- [ ] core tables exist with UUID + `tenant_id`
- [ ] phase 1 roles are defined
- [ ] benefits schema is codified
- [ ] ledger edge-case rules are written down
- [ ] seed data loads successfully
- [ ] seeded data looks believable enough to support UI work
- [ ] transactional email choice is locked
- [ ] R2 path is provisioned or clearly stubbed for dev

---

## Validation plan after completion
After Sprint 1 work is done:
- ask GLM 5.1 to validate completion
- ask Gemini 3.1 Pro to validate completion
- confirm Sprint 2 can begin without foundation rework
