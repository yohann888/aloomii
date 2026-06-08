-- 007_outcome.sql
-- Outcome entity (Section 3.5).
-- Actualized result of a Decision, Interaction, Signal, or Generated Artifact.
-- Immutable once written. Feeds the learning loop (Moat 3).
-- Uses exclusive-arc FK pattern for caused_by_*_id and subject_*_id.
-- attribution_share DECIMAL(3,2) DEFAULT 1.00 prevents double-counting (Section 4.3).

CREATE TABLE outcome (
  id                          UUID PRIMARY KEY,
  tenant_id                   UUID NOT NULL REFERENCES tenant(id),
  outcome_type                TEXT NOT NULL,        -- REVENUE_BOOKED, ACCESS_REVOKED, EVENT_ATTENDED, EMAIL_REPLIED, NO_RESPONSE, etc.

  -- Exclusive-arc caused_by FKs: exactly one must be non-null
  caused_by_decision_id       UUID REFERENCES decision(id),
  caused_by_interaction_id    UUID REFERENCES interaction(id),
  caused_by_signal_id         UUID REFERENCES signal(id),
  caused_by_artifact_id       UUID,                 -- FK added after generated_artifact table (see 011)

  -- Exclusive-arc subject FKs: exactly one must be non-null
  subject_party_id            UUID REFERENCES party(id),
  subject_membership_id       UUID REFERENCES membership(id),

  attribution_share           DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    -- 0.00 to 1.00. ROI queries: SUM(financial_value * attribution_share)
  financial_value             DECIMAL(12,2),         -- Monetary value; null if not financial
  financial_currency          TEXT,                   -- ISO currency code if financial_value is set
  realized_at                 TIMESTAMPTZ NOT NULL,   -- When outcome happened in real world
  measured_at                 TIMESTAMPTZ NOT NULL,   -- When we recorded it (may lag realized_at)
  measurement_method          TEXT NOT NULL,           -- MANUAL_LOG, AUTOMATED_DETECTION, INFERRED, EXTERNAL_FEED
  confidence                  DECIMAL(3,2) NOT NULL,  -- Required on Outcome
  score                       DECIMAL(5,2),           -- Quantitative outcome score where applicable
  metadata                    JSONB,

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,

  -- Exclusive-arc constraint: exactly one cause must be non-null
  CONSTRAINT outcome_caused_by_arc CHECK (
    (CASE WHEN caused_by_decision_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN caused_by_interaction_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN caused_by_signal_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN caused_by_artifact_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),

  -- Exclusive-arc constraint: exactly one subject must be non-null
  CONSTRAINT outcome_subject_arc CHECK (
    (CASE WHEN subject_party_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN subject_membership_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
