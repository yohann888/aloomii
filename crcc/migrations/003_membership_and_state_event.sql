-- 003_membership_and_state_event.sql
-- Membership and State_Event (Section 3.1).
-- Membership is the contractual container tying a Party to a tenant for a specific period.
-- State_Event is the append-only ledger recording every lifecycle transition.
-- current_status_cache on Membership is trigger-refreshed (Section 8, resolved).
--
-- CRCC vertical metadata examples (in Membership.metadata JSONB):
--   {"dues_amount": 500.00, "payment_frequency": "annual", "benefits_package": "standard",
--    "auto_renew": true, "tier_name": "Gold", "board_seat": false}

CREATE TABLE membership (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  party_id              UUID NOT NULL REFERENCES party(id),
  membership_type       TEXT NOT NULL,           -- Standard, Premier, Sponsor, etc.
  tier                  TEXT NOT NULL,            -- Tier within type; drives pricing/benefits/reporting
  effective_start       TIMESTAMPTZ NOT NULL,
  effective_end         TIMESTAMPTZ,             -- Null for open-ended
  current_status_cache  TEXT NOT NULL DEFAULT 'PROSPECT',
    -- Materialized from latest State_Event. Values: PROSPECT, APPLICANT, ACTIVE, LAPSED, REINSTATED, TERMINATED
  metadata              JSONB,                   -- Contract terms, dues amount, special conditions

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1
);

-- State_Event: append-only lifecycle ledger for Membership (Section 3.1, Principle 2.4).
-- Rows are NEVER updated or deleted. Current state derived from the most recent event.
--
-- CRCC vertical metadata examples (in State_Event.metadata JSONB):
--   {"renewal_terms": "1 year", "lapse_reason": "non-payment", "grace_period_days": 30}

CREATE TABLE state_event (
  id                      UUID PRIMARY KEY,
  tenant_id               UUID NOT NULL REFERENCES tenant(id),
  membership_id           UUID NOT NULL REFERENCES membership(id),
  from_state              TEXT,                   -- Previous state; null for initial state
  to_state                TEXT NOT NULL,          -- PROSPECT, APPLICANT, ACTIVE, LAPSED, REINSTATED, TERMINATED
  transition_reason       TEXT NOT NULL,          -- Why this transition occurred (required)
  effective_at            TIMESTAMPTZ NOT NULL,   -- When the transition takes effect
  caused_by_decision_id   UUID,                   -- FK added after decision table exists (see 011)
  metadata                JSONB,

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1
);
