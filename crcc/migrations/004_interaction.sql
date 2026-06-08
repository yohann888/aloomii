-- 004_interaction.sql
-- Interaction and Interaction_Party join table (Section 3.2).
-- Immutable point-in-time behavioral fact. Densest table by row count.
-- Structural facts immutable; PII content redactable (tombstone pattern, Section 4.4).
--
-- CRCC vertical metadata examples (in Interaction.metadata JSONB):
--   {"event_name": "Annual Gala", "event_id": "<uuid>", "rsvp_status": "confirmed",
--    "attendance_confirmed": true, "duration_minutes": 45, "location": "City Hall"}

CREATE TABLE interaction (
  id                      UUID PRIMARY KEY,
  tenant_id               UUID NOT NULL REFERENCES tenant(id),
  primary_party_id        UUID NOT NULL REFERENCES party(id),
  interaction_type        TEXT NOT NULL,          -- EMAIL_SENT, EVENT_ATTENDED, PORTAL_LOGIN, CALL_LOGGED, etc.
  channel                 channel NOT NULL,
  direction               direction NOT NULL,
  occurred_at             TIMESTAMPTZ NOT NULL,   -- When the interaction happened (distinct from created_at)
  subject                 TEXT,                    -- Short summary / email subject line
  body_excerpt            TEXT,                    -- Truncated content for preview; full in metadata
  generated_artifact_id   UUID,                    -- FK added after generated_artifact table exists (see 011)
  metadata                JSONB,

  -- PII redaction support (Section 4.4)
  pii_redacted_at         TIMESTAMPTZ,            -- Set when PII tombstone applied

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1
);

-- Interaction_Party: multi-party join table (Section 3.2).
-- Some interactions involve multiple Parties (referrals, board meetings, etc.).

CREATE TABLE interaction_party (
  interaction_id  UUID NOT NULL REFERENCES interaction(id),
  party_id        UUID NOT NULL REFERENCES party(id),
  role            TEXT NOT NULL,              -- PRIMARY, PARTICIPANT, MENTIONED, ORGANIZER, OBSERVER
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (interaction_id, party_id)
);
