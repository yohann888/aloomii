-- 005_signal.sql
-- Signal entity (Section 3.3).
-- Point-in-time inference or observation. Explicitly probabilistic with confidence score.
-- Uses exclusive-arc FK pattern: exactly one subject_*_id must be non-null.
--
-- CRCC vertical Signal examples:
--   signal_type: CHURN_RISK, RENEWAL_APPROACHING, ENGAGEMENT_DECAY, PAYMENT_OVERDUE
--   evidence JSONB: {"missed_events_count": 3, "days_since_last_interaction": 90,
--                    "payment_overdue_days": 45, "rule_id": "churn-risk-v1",
--                    "source_interaction_ids": ["<uuid>", ...]}

CREATE TABLE signal (
  id                            UUID PRIMARY KEY,
  tenant_id                     UUID NOT NULL REFERENCES tenant(id),

  -- Exclusive-arc subject FKs (Section 3.3): exactly one must be non-null
  subject_party_id              UUID REFERENCES party(id),
  subject_membership_id         UUID REFERENCES membership(id),
  subject_interaction_id        UUID REFERENCES interaction(id),

  signal_type                   TEXT NOT NULL,        -- CHURN_RISK, COMPLIANCE_WARNING, OPPORTUNITY, RELATIONSHIP_DECAY, etc.
  severity                      signal_severity NOT NULL,
  confidence                    DECIMAL(3,2) NOT NULL, -- 0.00 to 1.00 (required on Signal)
  status                        signal_status NOT NULL DEFAULT 'ACTIVE',
  generated_at                  TIMESTAMPTZ NOT NULL,  -- When the signal fired
  expires_at                    TIMESTAMPTZ,           -- When it stops being relevant
  generated_by                  TEXT NOT NULL,          -- Agent ID, rule ID, or external feed ID
  evidence                      JSONB NOT NULL,        -- Structured pointers to supporting data
  acted_upon_by_decision_id     UUID,                  -- FK added after decision table (see 011)
  dismissed_reason              TEXT,                   -- Required if status is DISMISSED

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,

  -- Exclusive-arc constraint: exactly one subject must be non-null
  CONSTRAINT signal_subject_arc CHECK (
    (CASE WHEN subject_party_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN subject_membership_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN subject_interaction_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
