-- 006_decision.sql
-- Decision entity (Section 3.4).
-- Authoritative commitment to action or status change. Central to Moat 2 (institutional memory).
-- Append-only lifecycle: PROPOSED → RATIFIED → ENACTED → REVERSED/EXPIRED (Principle 2.4).
-- reasoning, alternatives_considered, and evidence are the institutional memory artifact.
-- Uses exclusive-arc FK pattern for subject_*_id.

CREATE TABLE decision (
  id                          UUID PRIMARY KEY,
  tenant_id                   UUID NOT NULL REFERENCES tenant(id),
  decision_type               TEXT NOT NULL,       -- RENEW, NON_RENEWAL, SUSPEND_ACCESS, GRANT_FELLOWSHIP, DEFER, etc.

  -- Exclusive-arc subject FKs: exactly one must be non-null
  subject_party_id            UUID REFERENCES party(id),
  subject_membership_id       UUID REFERENCES membership(id),
  subject_outcome_id          UUID,                -- FK added after outcome table (see 011)

  status                      decision_status NOT NULL DEFAULT 'PROPOSED',
  decided_at                  TIMESTAMPTZ NOT NULL,
  decided_by_party_id         UUID NOT NULL REFERENCES party(id),  -- Who made the decision
  ratified_by_party_id        UUID REFERENCES party(id),           -- For two-stage decisions
  ratified_at                 TIMESTAMPTZ,
  effect_start_date           TIMESTAMPTZ NOT NULL,
  effect_end_date             TIMESTAMPTZ,          -- Null for permanent
  reasoning                   TEXT NOT NULL,         -- Structured prose (required, non-negotiable)
  alternatives_considered     JSONB,                 -- What other options were on the table
  evidence                    JSONB NOT NULL,        -- Structured pointers to Interactions, Signals, prior Decisions
  triggered_by_signal_id      UUID REFERENCES signal(id),
  reversed_by_decision_id     UUID REFERENCES decision(id),  -- Self-referential: the decision that reversed this one

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1,

  -- Exclusive-arc constraint: exactly one subject must be non-null
  -- subject_outcome_id FK deferred to 011; constraint uses nullable check
  CONSTRAINT decision_subject_arc CHECK (
    (CASE WHEN subject_party_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN subject_membership_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN subject_outcome_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
