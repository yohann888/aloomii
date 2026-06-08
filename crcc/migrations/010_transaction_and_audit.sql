-- 010_transaction_and_audit.sql
-- Transaction (Section 3.7) and Audit_Log (Section 3.7, 4.4).
-- Transaction: financial events (dues, sponsor fees, event registrations, refunds).
-- Audit_Log: cross-table append-only audit trail for compliance.
-- Patterns table intentionally NOT included here — it lives in aloomii-portal (Section 5.3).

CREATE TABLE transaction (
  id                        UUID PRIMARY KEY,
  tenant_id                 UUID NOT NULL REFERENCES tenant(id),
  membership_id             UUID REFERENCES membership(id),   -- FK if dues-related
  party_id                  UUID NOT NULL REFERENCES party(id),
  transaction_type          TEXT NOT NULL,          -- DUES_PAYMENT, SPONSOR_FEE, EVENT_REGISTRATION, REFUND, etc.
  gross_amount              DECIMAL(12,2) NOT NULL,
  net_amount                DECIMAL(12,2) NOT NULL,
  currency                  TEXT NOT NULL,           -- ISO currency code
  external_transaction_id   TEXT,                    -- Stripe charge ID, Zeffy ID, etc.
  transacted_at             TIMESTAMPTZ NOT NULL,
  produces_outcome_id       UUID REFERENCES outcome(id),
  metadata                  JSONB,

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1
);

-- Audit_Log: append-only, cross-table audit trail (Section 3.7, 4.4).
-- Captures every meaningful read/write against tenant data.
-- Redaction events (PII tombstone) are also logged here.

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  actor_type  audit_actor_type NOT NULL,     -- USER, AGENT, SYSTEM
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,                  -- READ, WRITE, UPDATE, DELETE, EXPORT, REDACT, etc.
  table_name  TEXT NOT NULL,
  record_id   UUID,
  query_hash  TEXT,                           -- Hash for similar-query analysis
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB                           -- Action-specific details (before/after values for writes)
);
