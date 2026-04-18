# ChamberCore — Scope Floor Addendum

## Purpose
This addendum removes the last major ambiguities from the ChamberCore builder checklist.

It defines the minimum phase 1 scope for:
- tier benefits + ledger rules
- join flow
- member content submission
- branding/seed realism priority

Use this document as the hard ceiling unless Yohann explicitly expands scope.

---

## 1. Benefits scope floor

### Phase 1 benefit types
Only support these benefit types in phase 1:
- `free_event_tickets`
- `hot_deal_posts`
- `directory_logo`
- `featured_directory_placement`

Do not add additional benefit types in phase 1 unless they are required to close the demo gap.

### Phase 1 benefit schema shape
Benefits should be typed at the application layer.
Recommended shape:

```ts
type TierBenefits = {
  free_event_tickets: number;
  hot_deal_posts: number;
  directory_logo: boolean;
  featured_directory_placement: boolean;
};
```

### Benefit ledger rules
The ledger is append-only.
Never overwrite a running counter.

Each ledger entry must include:
- `org_id`
- `tenant_id`
- `benefit_type`
- `delta`
- `reference_type`
- `reference_id`
- `note` (nullable)
- `created_at`

### Allowed phase 1 `reference_type` values
- `registration`
- `content_item`
- `manual_adjustment`

### Phase 1 ledger behaviors
- event registration that consumes a free ticket → writes a ledger debit
- hot deal submission that consumes a posting slot → writes a ledger debit
- admin correction/restoration → writes a ledger credit/debit as `manual_adjustment`

Do not build more benefit behaviors in phase 1.

---

## 2. Join flow scope floor

### Phase 1 join flow steps
The join flow is capped at:
1. visitor opens `/join`
2. completes organization/contact form
3. selects tier
4. submits application
5. sees success / pending confirmation state
6. admin can review / approve in chamber admin

### Explicit phase 1 rule
The join flow is an application + approval flow in phase 1.
It is **not** a full self-serve paid onboarding flow unless Yohann explicitly re-expands scope.

### What phase 1 join flow includes
- organization details
- primary contact details
- tier selection
- success / pending state
- admin review visibility

### What phase 1 join flow excludes by default
- full payment collection
- automated billing activation
- complex onboarding wizard
- password recovery/account setup complexity beyond chosen lightweight auth path

If payment status needs to appear in the demo, represent it in admin/member state without making payment collection the critical path.

---

## 3. Member content submission scope floor

### Phase 1 content ceiling
Member submission supports only:
- `hot_deal`

Do not build member-submitted:
- jobs
- RFPs
- classifieds
in phase 1.

### Phase 1 submission states
Use only:
- `draft`
- `pending_review`
- `published`
- `archived`

### Phase 1 member submission flow
1. member opens submission form
2. enters hot deal content
3. submits
4. item lands in `pending_review`
5. admin approves or archives

### Phase 1 submission rule
Keep this flow narrow and credible.
Do not add complex editorial workflows, revisions, or multi-step publishing states.

---

## 4. Branding and seed realism priority

### Branding rule
Branding is not a late admin detail.
Branding is part of foundation.

Seed and wire these early:
- chamber name
- chamber logo
- primary colors/theme
- hero copy/tagline
- contact information

### Seed realism rule
Realistic demo data is required before visual polish is considered complete.

The demo should include:
- believable Ontario chamber businesses
- real-looking categories
- realistic event titles and dates
- coherent chamber copy
- plausible member tiers and statuses
- logos/placeholders that do not feel broken or generic

### Priority rule
If tradeoffs are needed, prefer:
- stronger seed realism
over
- extra secondary features

---

## 5. Scope enforcement rule

If a requested feature falls outside this addendum, default response is:
- defer it
- note it as post-phase-1
- do not silently absorb it into the build

The goal is to protect the first sellable demo slice.
