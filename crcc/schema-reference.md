# CRCC Canonical Schema Reference

> **Caledonia Regional Chamber of Commerce** — Dedicated Neon project `crcc`
> Implements Aloomii Canonical Data Architecture v1.2
> Authoritative spec: `specs/aloomii-canonical-data-architecture-v1.2.md`

## Deployment Model

CRCC runs on a **dedicated Neon project** (database-per-tenant exception, Section 5.2) because the CRCC contract guarantees data ownership, chamber-owned Neon project, full export, point-in-time recovery, and chamber-as-legal-account-holder. The `crcc` project must **not** be bound to a GitHub or Vercel integration (blocks Neon project transfer).

- **Interim**: `crcc` provisioned under Aloomii's Neon account during build phase.
- **Handover**: Neon project transfer (preferred) or pg_dump → pg_restore clone.
- **Patterns table**: Lives in `aloomii-portal`, NOT in this database.

---

## Entity Relationship Diagram

```
┌──────────┐       ┌────────────┐       ┌──────────────┐
│  Tenant  │◄──────│   Party    │◄──────│   Party_     │
│          │       │            │───────│ Relationship │
└──────────┘       └──────┬─────┘       └──────────────┘
                          │
                 ┌────────┴────────┐
                 │                 │
           ┌─────▼─────┐   ┌──────▼──────────┐
           │ Membership │   │  Interaction     │◄─── Interaction_Party
           │            │   │                  │
           └─────┬──────┘   └──────┬───────────┘
                 │                 │
           ┌─────▼──────┐         │
           │ State_Event │         │
           └─────────────┘         │
                                   │
        ┌──────────┬───────────────┼──────────────┐
        │          │               │              │
  ┌─────▼────┐ ┌──▼──────┐ ┌──────▼─────┐ ┌──────▼──────────┐
  │  Signal  │ │Decision │ │  Outcome   │ │Generated_Artifact│
  └─────┬────┘ └──┬──────┘ └────────────┘ └─────────────────┘
        │         │
  ┌─────▼─────────▼──┐
  │      Task        │
  └──────────────────┘

  ┌─────────────┐    ┌───────────┐
  │ Transaction │    │ Audit_Log │
  └─────────────┘    └───────────┘
```

### Relationship Flows

| From | To | Relationship | Cardinality |
|------|----|-------------|-------------|
| Party | Membership | holds | 1:N |
| Party ↔ Party | Party_Relationship | relates to | M:N with attributes |
| Party | Interaction | participates in (primary_party_id) | 1:N |
| Interaction | Party | additional participants (Interaction_Party) | M:N |
| Membership | State_Event | lifecycle transitions | 1:N (append-only) |
| Signal | Party / Membership / Interaction | subject (exclusive-arc) | N:1 |
| Signal | Decision | triggers (triggered_by_signal_id) | N:1 |
| Decision | Outcome | produces (caused_by_decision_id) | 1:N |
| Interaction | Outcome | produces (caused_by_interaction_id) | 1:N |
| Generated_Artifact | Interaction | dispatched as | 1:1 |
| Generated_Artifact | Outcome | produces | 1:N |
| Signal / Decision | Task | triggers | 1:N |
| Task | Interaction | completed as (completed_as_interaction_id) | 1:1 |
| Transaction | Outcome | produces (produces_outcome_id) | 1:1 |

---

## Universal Metadata Header

Every tenant-owned table carries these provenance fields (Section 4.1):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | Yes | UUIDv7, generated in app code (not Postgres default) |
| `tenant_id` | UUID | Yes | FK to tenant; enforces isolation |
| `created_at` | TIMESTAMPTZ | Yes | Server-side timestamp at insert |
| `created_by` | TEXT | Yes | `user:<uuid>` \| `agent:<id>:<run_id>` \| `system:<process>` |
| `updated_at` | TIMESTAMPTZ | No | Null until first update |
| `updated_by` | TEXT | No | Same format as created_by |
| `source` | TEXT | Yes | MANUAL, IMPORT, AGENT, API, MIGRATION |
| `confidence` | DECIMAL(3,2) | Varies | Required on Signal, Outcome, Generated_Artifact |
| `version` | INTEGER | Yes | Increments on update; default 1 |

---

## Table Reference

### `tenant`

Root of the tenancy tree. One row per customer organization.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | Canonical tenant identifier |
| `name` | TEXT | Yes | Display name ("Caledonia Regional Chamber of Commerce") |
| `short_name` | TEXT | Yes, unique | Slug-friendly ("crcc") |
| `vertical` | TEXT | Yes | CHAMBER, REAL_ESTATE, ASSOCIATION, etc. |
| `status` | tenant_status | Yes | ACTIVE, SUSPENDED, ARCHIVED, PENDING_DELETION |
| `schema_name` | TEXT | Yes | Postgres schema name |
| `onboarded_at` | TIMESTAMPTZ | Yes | When tenant became active |
| `metadata` | JSONB | No | Tenant-specific configuration |

### `party`

Canonical legal entity — Individual or Organization. Largely immortal.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | UUIDv7 |
| `tenant_id` | UUID | FK → tenant | Isolation |
| `party_type` | party_type | Yes | INDIVIDUAL or ORGANIZATION |
| `canonical_name` | TEXT | Yes | Display name |
| `canonical_email` | TEXT | No | Primary email (individuals) |
| `external_identifiers` | JSONB | No | `{"crm_id": "abc", "mls_id": "12345"}` |
| `metadata` | JSONB | No | Vertical-specific fields (see CRCC metadata below) |
| + provenance | | | Universal metadata header |

**CRCC Party.metadata schema:**
```json
{
  "business_type": "Restaurant",
  "employee_count": 12,
  "year_founded": 2005,
  "industry_naics": "722511",
  "website": "https://example.com",
  "phone": "555-0100",
  "address": {
    "street": "123 Main St",
    "city": "Caledonia",
    "province": "ON",
    "postal_code": "N3W 1A1"
  }
}
```

### `party_relationship`

Time-bound, typed relationships between Parties.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `from_party_id` | UUID | FK → party | Initiating party (e.g., employer) |
| `to_party_id` | UUID | FK → party | Receiving party (e.g., employee) |
| `relationship_type` | TEXT | Yes | EMPLOYS, OWNS, REPRESENTS, CONTACT_FOR, AFFILIATED_WITH |
| `started_at` | TIMESTAMPTZ | Yes | When relationship began |
| `ended_at` | TIMESTAMPTZ | No | Null for active relationships |
| `metadata` | JSONB | No | Role title, ownership %, etc. |
| + provenance | | | Universal metadata header |

### `membership`

Contractual container tying a Party to a tenant for a specific period.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `party_id` | UUID | FK → party | The party who holds this membership |
| `membership_type` | TEXT | Yes | Standard, Premier, Sponsor, etc. |
| `tier` | TEXT | Yes | Tier within type; drives pricing/benefits |
| `effective_start` | TIMESTAMPTZ | Yes | When membership began |
| `effective_end` | TIMESTAMPTZ | No | Null for open-ended |
| `current_status_cache` | TEXT | Yes | Trigger-refreshed from latest State_Event |
| `metadata` | JSONB | No | Contract terms, dues amount |
| + provenance | | | Universal metadata header |

**CRCC Membership.metadata schema:**
```json
{
  "dues_amount": 500.00,
  "payment_frequency": "annual",
  "benefits_package": "standard",
  "auto_renew": true,
  "tier_name": "Gold",
  "board_seat": false,
  "vote_eligible": true
}
```

**Lifecycle states:** PROSPECT → APPLICANT → ACTIVE → LAPSED → REINSTATED → TERMINATED

### `state_event`

Append-only lifecycle ledger for Membership transitions. **Never updated or deleted.**

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `membership_id` | UUID | FK → membership | |
| `from_state` | TEXT | No | Previous state (null for initial) |
| `to_state` | TEXT | Yes | New state |
| `transition_reason` | TEXT | Yes | Why this transition occurred |
| `effective_at` | TIMESTAMPTZ | Yes | When transition takes effect |
| `caused_by_decision_id` | UUID | FK → decision | If transition resulted from a decision |
| `metadata` | JSONB | No | Renewal terms, lapse reason details |
| + provenance | | | Universal metadata header |

**Trigger:** `trg_refresh_membership_status` — AFTER INSERT ON state_event, updates `membership.current_status_cache` with `to_state`.

### `interaction`

Immutable point-in-time behavioral fact. Densest table by row count.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `primary_party_id` | UUID | FK → party | Focal party (most queries filter on this) |
| `interaction_type` | TEXT | Yes | EMAIL_SENT, EVENT_ATTENDED, PORTAL_LOGIN, CALL_LOGGED |
| `channel` | channel | Yes | EMAIL, PHONE, IN_PERSON, PORTAL, SYSTEM_GENERATED, EXTERNAL |
| `direction` | direction | Yes | INBOUND, OUTBOUND, BIDIRECTIONAL, INTERNAL |
| `occurred_at` | TIMESTAMPTZ | Yes | When interaction happened |
| `subject` | TEXT | No | Short summary / email subject |
| `body_excerpt` | TEXT | No | Truncated content for preview (PII-redactable) |
| `generated_artifact_id` | UUID | FK → generated_artifact | If AI-drafted |
| `pii_redacted_at` | TIMESTAMPTZ | No | Set when PII tombstone applied |
| `metadata` | JSONB | No | Channel-specific details |
| + provenance | | | Universal metadata header |

**PII Redaction (Section 4.4):** `body_excerpt` and PII metadata fields can be replaced with `[REDACTED-PII]` under PIPEDA/GDPR right-to-be-forgotten. Structural facts survive; personal content does not. Redaction events logged in `audit_log`.

**CRCC Interaction.metadata schema:**
```json
{
  "event_name": "Annual Gala",
  "event_id": "<uuid>",
  "rsvp_status": "confirmed",
  "attendance_confirmed": true,
  "duration_minutes": 45,
  "location": "City Hall"
}
```

### `interaction_party`

Multi-party join table for interactions involving multiple Parties.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `interaction_id` | UUID | PK, FK → interaction | |
| `party_id` | UUID | PK, FK → party | |
| `role` | TEXT | Yes | PRIMARY, PARTICIPANT, MENTIONED, ORGANIZER, OBSERVER |
| `tenant_id` | UUID | FK → tenant | |
| `created_at` | TIMESTAMPTZ | Yes | When link was recorded |

### `signal`

Point-in-time inference or observation. Explicitly probabilistic.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `subject_party_id` | UUID | FK → party | **Exclusive-arc:** exactly one subject must be non-null |
| `subject_membership_id` | UUID | FK → membership | |
| `subject_interaction_id` | UUID | FK → interaction | |
| `signal_type` | TEXT | Yes | CHURN_RISK, COMPLIANCE_WARNING, OPPORTUNITY, RELATIONSHIP_DECAY |
| `severity` | signal_severity | Yes | LOW, MEDIUM, HIGH, CRITICAL |
| `confidence` | DECIMAL(3,2) | Yes | 0.00–1.00 (required) |
| `status` | signal_status | Yes | ACTIVE, ACTED_UPON, EXPIRED, DISMISSED |
| `generated_at` | TIMESTAMPTZ | Yes | When signal fired |
| `expires_at` | TIMESTAMPTZ | No | When it stops being relevant |
| `generated_by` | TEXT | Yes | Agent ID, rule ID, or external feed ID |
| `evidence` | JSONB | Yes | Structured pointers to supporting data |
| `acted_upon_by_decision_id` | UUID | FK → decision | If a decision responded |
| `dismissed_reason` | TEXT | No | Required if status is DISMISSED |
| + provenance | | | Universal metadata header |

**Constraint:** `signal_subject_arc` — CHECK exactly one of `subject_party_id`, `subject_membership_id`, `subject_interaction_id` is non-null.

**CRCC Signal.evidence schema:**
```json
{
  "missed_events_count": 3,
  "days_since_last_interaction": 90,
  "payment_overdue_days": 45,
  "rule_id": "churn-risk-v1",
  "source_interaction_ids": ["<uuid>", "<uuid>"]
}
```

### `decision`

Authoritative commitment to action. Central to institutional memory (Moat 2).

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `decision_type` | TEXT | Yes | RENEW, NON_RENEWAL, SUSPEND_ACCESS, GRANT_FELLOWSHIP, DEFER |
| `subject_party_id` | UUID | FK → party | **Exclusive-arc:** exactly one subject |
| `subject_membership_id` | UUID | FK → membership | |
| `subject_outcome_id` | UUID | FK → outcome | |
| `status` | decision_status | Yes | PROPOSED, RATIFIED, ENACTED, REVERSED, EXPIRED |
| `decided_at` | TIMESTAMPTZ | Yes | When decision was made |
| `decided_by_party_id` | UUID | FK → party | Who made the decision |
| `ratified_by_party_id` | UUID | FK → party | For two-stage decisions |
| `ratified_at` | TIMESTAMPTZ | No | When ratification occurred |
| `effect_start_date` | TIMESTAMPTZ | Yes | When decision takes effect |
| `effect_end_date` | TIMESTAMPTZ | No | Null for permanent |
| `reasoning` | TEXT | Yes | **Required.** Structured prose explaining why |
| `alternatives_considered` | JSONB | No | What other options were on the table |
| `evidence` | JSONB | Yes | Structured pointers to Interactions, Signals, prior Decisions |
| `triggered_by_signal_id` | UUID | FK → signal | If decision responds to a signal |
| `reversed_by_decision_id` | UUID | FK → decision | Self-referential reversal chain |
| + provenance | | | Universal metadata header |

**Constraint:** `decision_subject_arc` — CHECK exactly one of `subject_party_id`, `subject_membership_id`, `subject_outcome_id` is non-null.

**Lifecycle:** PROPOSED → RATIFIED → ENACTED → REVERSED | EXPIRED

### `outcome`

Actualized result. Feeds the learning loop (Moat 3). Immutable once written.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `outcome_type` | TEXT | Yes | REVENUE_BOOKED, ACCESS_REVOKED, EVENT_ATTENDED, EMAIL_REPLIED, NO_RESPONSE |
| `caused_by_decision_id` | UUID | FK → decision | **Exclusive-arc:** exactly one cause |
| `caused_by_interaction_id` | UUID | FK → interaction | |
| `caused_by_signal_id` | UUID | FK → signal | |
| `caused_by_artifact_id` | UUID | FK → generated_artifact | |
| `subject_party_id` | UUID | FK → party | **Exclusive-arc:** exactly one subject |
| `subject_membership_id` | UUID | FK → membership | |
| `attribution_share` | DECIMAL(3,2) | Yes | Default 1.00. ROI: `SUM(financial_value * attribution_share)` |
| `financial_value` | DECIMAL(12,2) | No | Monetary value; null if not financial |
| `financial_currency` | TEXT | No | ISO currency code |
| `realized_at` | TIMESTAMPTZ | Yes | When outcome happened in real world |
| `measured_at` | TIMESTAMPTZ | Yes | When we recorded it |
| `measurement_method` | TEXT | Yes | MANUAL_LOG, AUTOMATED_DETECTION, INFERRED, EXTERNAL_FEED |
| `confidence` | DECIMAL(3,2) | Yes | Required on Outcome |
| `score` | DECIMAL(5,2) | No | Quantitative score |
| `metadata` | JSONB | No | Outcome-type-specific details |
| + provenance | | | Universal metadata header |

**Constraints:**
- `outcome_caused_by_arc` — CHECK exactly one of `caused_by_decision_id`, `caused_by_interaction_id`, `caused_by_signal_id`, `caused_by_artifact_id` is non-null.
- `outcome_subject_arc` — CHECK exactly one of `subject_party_id`, `subject_membership_id` is non-null.

### `generated_artifact`

AI-produced output. Heart of the learning loop (Moat 3).

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `artifact_type` | TEXT | Yes | EMAIL_DRAFT, CONTENT_DRAFT, RECOMMENDATION, SUMMARY, ALERT |
| `target_party_id` | UUID | FK → party | **Exclusive-arc:** zero or one target |
| `target_membership_id` | UUID | FK → membership | |
| `target_event_id` | UUID | No FK | Event reference (not a canonical entity) |
| `status` | artifact_status | Yes | DRAFTED, REVIEWED, APPROVED, DISPATCHED, DISCARDED |
| `prompt_template_id` | TEXT | Yes | Which prompt template produced this |
| `prompt_template_version` | TEXT | Yes | Template version |
| `model_used` | TEXT | Yes | Model identifier |
| `model_parameters` | JSONB | Yes | Temperature, max_tokens, etc. |
| `input_records` | JSONB | Yes | `[{"entity": "Signal", "id": "uuid"}, ...]` |
| `output_content` | TEXT | Yes | The actual artifact content |
| `output_metadata` | JSONB | No | Token counts, generation time, cost |
| `human_reviewed` | BOOLEAN | Yes | Was this reviewed by a human before dispatch |
| `human_edits` | TEXT | No | Diff or full edited version |
| `dispatched_as_interaction_id` | UUID | FK → interaction | If dispatched |
| `outcome_id` | UUID | FK → outcome | Filled in when outcome is known |
| `outcome_score` | DECIMAL(5,2) | No | Artifact performance score |
| + provenance | | | Universal metadata header |

**Constraint:** `artifact_target_arc` — CHECK at most one of `target_party_id`, `target_membership_id`, `target_event_id` is non-null.

**Lifecycle:** DRAFTED → REVIEWED → APPROVED → DISPATCHED | DISCARDED

### `task`

Forward-looking work (Section 3.9, v1.2).

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | UUIDv7 |
| `tenant_id` | UUID | FK → tenant | |
| `assigned_to_party_id` | UUID | FK → party | **Assignment arc:** exactly one assignee |
| `assigned_to_agent_id` | TEXT | No | Agent identifier string |
| `about_party_id` | UUID | FK → party | **About arc:** exactly one subject |
| `about_membership_id` | UUID | FK → membership | |
| `about_decision_id` | UUID | FK → decision | |
| `task_type` | TEXT | Yes | FOLLOW_UP, CALL, EMAIL, REVIEW, DRAFT, SCHEDULE |
| `description` | TEXT | Yes | Human-readable (required) |
| `status` | task_status | Yes | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| `priority` | task_priority | No | LOW, MEDIUM (default), HIGH, URGENT |
| `due_at` | TIMESTAMPTZ | No | Null for open-ended |
| `completed_at` | TIMESTAMPTZ | No | When task was completed |
| `completed_as_interaction_id` | UUID | FK → interaction | Links to produced Interaction |
| `triggered_by_signal_id` | UUID | FK → signal | If created from a signal |
| `triggered_by_decision_id` | UUID | FK → decision | If enacting a decision |
| `cancelled_reason` | TEXT | No | Required if CANCELLED |
| `metadata` | JSONB | No | Task-type-specific details |
| + provenance | | | Universal metadata header |

**Constraints:**
- `task_assignment_arc` — CHECK exactly one of `assigned_to_party_id`, `assigned_to_agent_id` is non-null.
- `task_about_arc` — CHECK exactly one of `about_party_id`, `about_membership_id`, `about_decision_id` is non-null.

**Provenance permutations:**

| Created by | Assigned to | Pattern | Example |
|------------|-------------|---------|---------|
| Human | Human | Manual self-task | Staff adds personal reminder |
| Human | Agent | Delegated to agent | Staff assigns outreach drafting |
| Agent | Human | Agent escalation | Churn-signal agent flags for attention |
| Agent | Agent | Autonomous chain | One agent triggers another's work |

### `transaction`

Financial events. Dues, sponsor fees, event registrations, refunds.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `membership_id` | UUID | FK → membership | If dues-related |
| `party_id` | UUID | FK → party | Who paid |
| `transaction_type` | TEXT | Yes | DUES_PAYMENT, SPONSOR_FEE, EVENT_REGISTRATION, REFUND |
| `gross_amount` | DECIMAL(12,2) | Yes | Pre-fee amount |
| `net_amount` | DECIMAL(12,2) | Yes | Post-fee amount received |
| `currency` | TEXT | Yes | ISO currency code |
| `external_transaction_id` | TEXT | No | Stripe/Zeffy charge ID |
| `transacted_at` | TIMESTAMPTZ | Yes | When transaction cleared |
| `produces_outcome_id` | UUID | FK → outcome | Financial impact outcome |
| `metadata` | JSONB | No | |
| + provenance | | | Universal metadata header |

### `audit_log`

Cross-table append-only audit trail. Captures reads, writes, and redaction events.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenant | |
| `actor_type` | audit_actor_type | Yes | USER, AGENT, SYSTEM |
| `actor_id` | TEXT | Yes | Actor identifier |
| `action` | TEXT | Yes | READ, WRITE, UPDATE, DELETE, EXPORT, REDACT |
| `table_name` | TEXT | Yes | Which table was touched |
| `record_id` | UUID | No | Which record |
| `query_hash` | TEXT | No | For similar-query analysis |
| `timestamp` | TIMESTAMPTZ | Yes | When this occurred |
| `metadata` | JSONB | No | Action-specific details (before/after for writes) |

---

## ENUM Types

| Type | Values |
|------|--------|
| `party_type` | INDIVIDUAL, ORGANIZATION |
| `channel` | EMAIL, PHONE, IN_PERSON, PORTAL, SYSTEM_GENERATED, EXTERNAL |
| `direction` | INBOUND, OUTBOUND, BIDIRECTIONAL, INTERNAL |
| `signal_severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `signal_status` | ACTIVE, ACTED_UPON, EXPIRED, DISMISSED |
| `decision_status` | PROPOSED, RATIFIED, ENACTED, REVERSED, EXPIRED |
| `artifact_status` | DRAFTED, REVIEWED, APPROVED, DISPATCHED, DISCARDED |
| `task_status` | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| `task_priority` | LOW, MEDIUM, HIGH, URGENT |
| `tenant_status` | ACTIVE, SUSPENDED, ARCHIVED, PENDING_DELETION |
| `audit_actor_type` | USER, AGENT, SYSTEM |

---

## Exclusive-Arc Constraints Summary

| Table | Constraint | Columns | Rule |
|-------|-----------|---------|------|
| signal | `signal_subject_arc` | subject_party_id, subject_membership_id, subject_interaction_id | Exactly 1 non-null |
| decision | `decision_subject_arc` | subject_party_id, subject_membership_id, subject_outcome_id | Exactly 1 non-null |
| outcome | `outcome_caused_by_arc` | caused_by_decision_id, caused_by_interaction_id, caused_by_signal_id, caused_by_artifact_id | Exactly 1 non-null |
| outcome | `outcome_subject_arc` | subject_party_id, subject_membership_id | Exactly 1 non-null |
| generated_artifact | `artifact_target_arc` | target_party_id, target_membership_id, target_event_id | At most 1 non-null |
| task | `task_assignment_arc` | assigned_to_party_id, assigned_to_agent_id | Exactly 1 non-null |
| task | `task_about_arc` | about_party_id, about_membership_id, about_decision_id | Exactly 1 non-null |

---

## Migration Order

| # | File | Description |
|---|------|-------------|
| 001 | `extensions_and_types.sql` | pgcrypto, pgvector, all ENUM types |
| 002 | `tenant_and_party.sql` | tenant, party, party_relationship |
| 003 | `membership_and_state_event.sql` | membership, state_event |
| 004 | `interaction.sql` | interaction, interaction_party |
| 005 | `signal.sql` | signal (with exclusive-arc CHECK) |
| 006 | `decision.sql` | decision (with exclusive-arc CHECK) |
| 007 | `outcome.sql` | outcome (with exclusive-arc CHECKs) |
| 008 | `generated_artifact.sql` | generated_artifact (with target arc CHECK) |
| 009 | `task.sql` | task (with assignment + about arc CHECKs) |
| 010 | `transaction_and_audit.sql` | transaction, audit_log |
| 011 | `deferred_fks_and_triggers.sql` | Deferred FKs + current_status_cache trigger |
| 012 | `indexes.sql` | All performance indexes |

---

## Open Questions (from spec Section 8)

These are documented in the spec as unresolved and are flagged here for visibility:

1. **Encryption-at-rest**: Default Neon encryption may suffice. Verify against CRCC contract before production data lands.
2. **ORM choice**: How the application-layer ORM interacts with fully-qualified table names (T7 mitigation). Drives coding standards.
3. **Canonical type enumerations**: Final list of signal_types, decision_types, outcome_types, interaction_types needs ratification.
4. **JSONB metadata versioning**: Vertical-specific metadata JSON schemas need a versioning approach (semver in JSON vs. external tracking).
5. **PII detection rules**: Initial scope for redaction tombstone: names, emails, phones, addresses. Vertical-specific PII TBD.
6. **Read-side log storage**: S3+Athena, ClickHouse, or Datadog for operational read logging.
