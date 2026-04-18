# ChamberCore — Builder Checklist

## Goal
Ship `aloomii.com/chamber-demo` as a polished, production-shaped single-tenant chamber demo without overbuilding.

Execution rule:
- cut depth, not coherence

---

## 0. Pre-build decisions (must be resolved before implementation)

### 0.1 Auth
- [x] Choose final auth approach
- [x] Prefer lightweight magic-link-first flow
- [x] Confirm App Router compatibility as a hard requirement
- [x] Define shared auth foundation for admin + member flows
- [ ] Verify local dev auth flow works before feature work begins
- [x] Define admin login path
- [x] Define member login path

### 0.2 Storage
- [x] Choose asset storage provider: Cloudflare R2
- [ ] Define storage paths for:
  - [ ] chamber logo
  - [ ] member logos
  - [ ] event images
  - [ ] sponsor images (if used)
- [ ] Define upload size and file type constraints
- [ ] Define fallback behavior for missing/broken assets

### 0.3 Data model rules
- [x] Confirm all chamber tables live under `chamber.*`
- [x] Confirm UUID primary keys everywhere
- [x] Confirm `tenant_id` exists on chamber tables from day one
- [x] Define typed benefits schema
- [x] Lock phase 1 benefits to:
  - [ ] `free_event_tickets`
  - [ ] `hot_deal_posts`
  - [ ] `directory_logo`
  - [ ] `featured_directory_placement`
- [x] Define validation for benefits object at app boundary
- [x] Confirm benefit ledger remains append-only
- [x] Confirm ledger includes `reference_type` and `reference_id`
- [x] Lock phase 1 ledger `reference_type` values to:
  - [ ] `registration`
  - [ ] `content_item`
  - [ ] `manual_adjustment`

### 0.4 Demo-critical UX rules
- [x] Confirm QR flow includes manual fallback
- [x] Confirm admin scope stays limited to demo-supporting actions
- [x] Confirm content scope for phase 1
- [x] Decide phase 1 includes Hot Deals only for member-submitted content

---

## 1. Foundation / setup

### 1.1 Project structure
- [ ] Create or initialize app structure for `aloomii.com/chamber-demo`
- [ ] Confirm routing/path strategy for `/chamber-demo`
- [ ] Set environment variables
- [ ] Configure database connection
- [ ] Configure storage credentials
- [ ] Configure email provider if needed for auth/demo flows

### 1.2 Schema and migrations
- [ ] Create `chamber` schema
- [ ] Create base migration set
- [ ] Add tables:
  - [ ] `chamber.organizations`
  - [ ] `chamber.users`
  - [ ] `chamber.tiers`
  - [ ] `chamber.benefit_ledger`
  - [ ] `chamber.content_items`
  - [ ] `chamber.events`
  - [ ] `chamber.ticket_types`
  - [ ] `chamber.registrations`
  - [ ] `chamber.page_views`
  - [ ] `chamber.settings` (or equivalent branding/config table)
- [ ] Add indexes for primary query paths
- [ ] Add `tenant_id` to chamber tables
- [ ] Verify chamber schema has no dependency on Aloomii operational tables

### 1.3 Seed data
- [ ] Seed chamber branding/config first
- [ ] Seed chamber name, logo, colors/theme, tagline, and contact info
- [ ] Seed 25–30 organizations
- [ ] Seed 3 tiers
- [ ] Seed users for admin/member flows
- [ ] Seed 4–6 upcoming events
- [ ] Seed 2–4 past/recent events
- [ ] Seed 6–10 content items if content marketplace is shown
- [ ] Seed realistic payment/renewal states if surfaced in UI
- [ ] Seed realistic logos/images/placeholders
- [ ] Seed activity/timeline examples if CRM timeline is shown
- [ ] Verify the demo feels believable before adding secondary features

---

## 2. Public experience

### 2.1 Homepage
- [ ] Build chamber homepage
- [ ] Add hero section
- [ ] Add featured members section
- [ ] Add upcoming events section
- [ ] Add recent news/content section
- [ ] Add join CTA
- [ ] Pull branding from data source, not hardcoded text

### 2.2 Member directory
- [ ] Build directory listing page
- [ ] Add search
- [ ] Add category/tier filters if in scope
- [ ] Add organization cards with logo fallback
- [ ] Build organization detail page
- [ ] Ensure public data comes from `chamber.organizations`

### 2.3 Events
- [ ] Build events listing page
- [ ] Build event detail page
- [ ] Show date/time/location clearly
- [ ] Add registration CTA
- [ ] Show chamber/member context where useful

### 2.4 News / content
- [ ] Build content/news index
- [ ] Build content detail page
- [ ] Confirm phase 1 content type scope
- [ ] Default member-submitted content scope to Hot Deals only
- [ ] If simplifying, ship Hot Deals first and defer deeper content taxonomy

### 2.5 Join flow
- [ ] Build join page
- [ ] Define form fields for organization + primary contact + tier selection
- [ ] Connect to correct organization/user creation path
- [ ] Define success / pending state
- [ ] Make join flow admin-mediated approval in phase 1
- [ ] Do not expand phase 1 join flow into full self-serve paid onboarding unless explicitly re-approved

---

## 3. Admin / chamber operations

### 3.1 Admin auth
- [ ] Implement admin login
- [ ] Verify session/access behavior
- [ ] Verify local dev flow

### 3.2 Chamber dashboard / CRM
- [ ] Build admin landing/dashboard view
- [ ] Add member/org summary cards
- [ ] Add recent activity or pending actions section
- [ ] Add renewal/payment visibility if part of demo story

### 3.3 Member management
- [ ] Build organizations/members list
- [ ] Build member/org detail view
- [ ] Show tier, status, renewal date, contact info
- [ ] Show benefit usage summary if in scope
- [ ] Add limited edit/update actions needed for demo

### 3.4 Content moderation / publishing
- [ ] Build content list for admin
- [ ] Build approve/publish/archive actions as needed
- [ ] Keep actions limited to what supports demo walkthrough

### 3.5 Event management
- [ ] Build admin events list
- [ ] Build create/edit flow for events
- [ ] Build ticket type setup if included in phase 1 demo
- [ ] Ensure registrations are visible in admin surface

### 3.6 Branding/settings
- [ ] Build chamber settings view
- [ ] Make name/logo/tagline/theme data-backed
- [ ] Avoid hardcoded chamber-specific strings in templates

---

## 4. Member experience

### 4.1 Member auth
- [ ] Implement member login
- [ ] Verify member session flow
- [ ] Keep auth lightweight

### 4.2 Member dashboard
- [ ] Build member dashboard
- [ ] Show organization summary
- [ ] Show tier/benefit summary
- [ ] Show upcoming events / registrations
- [ ] Show content submission entry point if included

### 4.3 Profile management
- [ ] Build organization/profile edit flow
- [ ] Support logo upload if included in phase 1
- [ ] Verify asset upload path works end-to-end

### 4.4 Content submission
- [ ] Build minimal member submission flow for Hot Deals only
- [ ] Use only states:
  - [ ] `draft`
  - [ ] `pending_review`
  - [ ] `published`
  - [ ] `archived`
- [ ] Connect submission to moderation state
- [ ] Do not add jobs, RFPs, classifieds, or complex editorial states in phase 1

---

## 5. Event registration and check-in

### 5.1 Registration flow
- [ ] Build event registration flow
- [ ] Connect registrations to member/user identity
- [ ] Confirm ticket type behavior if ticketing depth is included

### 5.2 QR check-in
- [ ] Generate QR/check-in identity
- [ ] Build check-in screen
- [ ] Implement camera scan flow
- [ ] Implement manual search fallback
- [ ] Implement tap-to-check-in fallback
- [ ] Verify demo works on actual phone/browser hardware

---

## 6. Benefits / billing / ledger

### 6.1 Tier benefits
- [ ] Implement typed benefits object
- [ ] Lock benefits to the phase 1 scope floor
- [ ] Validate benefits structure at API boundary
- [ ] Render benefit state in admin/member surfaces if shown

### 6.2 Benefit ledger
- [ ] Create ledger write helpers
- [ ] Ensure no counter-overwrite shortcuts exist
- [ ] Ensure every debit/credit carries reference fields
- [ ] Test at least one end-to-end benefit consumption flow

### 6.3 Billing visibility
- [ ] Decide minimum billing scope for phase 1
- [ ] Show visible dues/payment state if part of sales narrative
- [ ] Defer advanced automation if timeline gets tight

---

## 7. Tracking / analytics / polish

### 7.1 Page views / lightweight analytics
- [ ] Implement only if it directly supports visible demo value
- [ ] Avoid overbuilding analytics before core flows are solid

### 7.2 Visual polish
- [ ] Apply responsive styling across public/admin/member surfaces
- [ ] Ensure branding is coherent
- [ ] Replace weak placeholder copy/images
- [ ] Ensure chamber feels real, not scaffolded

### 7.3 Demo hardening
- [ ] Walk full public journey
- [ ] Walk admin journey
- [ ] Walk member journey
- [ ] Walk event registration + check-in journey
- [ ] Test broken asset fallbacks
- [ ] Test QR fallback path
- [ ] Test demo credentials/logins
- [ ] Prepare backup screenshots/video for live demo failure cases

---

## 8. If schedule slips

### Keep
- [ ] public polish
- [ ] admin credibility
- [ ] seeded realism
- [ ] schema correctness
- [ ] event/check-in story

### Cut or reduce first
- [ ] extra content types
- [ ] deep analytics/ROI detail
- [ ] advanced billing automation
- [ ] low-value integrations
- [ ] non-essential admin controls

---

## 9. Done definition

The build is ready when:
- [ ] it is live at `aloomii.com/chamber-demo`
- [ ] chamber data is isolated in `chamber.*`
- [ ] public flow feels complete and polished
- [ ] admin flow is credible and useful
- [ ] member flow is believable
- [ ] event registration/check-in demo works with fallback
- [ ] core architectural decisions are preserved
- [ ] the prospect can see a clear path from demo to production
