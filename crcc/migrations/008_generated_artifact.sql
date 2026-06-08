-- 008_generated_artifact.sql
-- Generated_Artifact entity (Section 3.6, 4.2).
-- Any output produced by an Aloomii agent/model/AI-assisted process.
-- Heart of Moat 3 (learning loop): full trace from input to output to outcome.
-- Lifecycle: DRAFTED → REVIEWED → APPROVED → DISPATCHED | DISCARDED.
-- input_records is JSONB array of {"entity": "<table>", "id": "<uuid>"} (Section 6, v1.1 correction).
-- Uses exclusive-arc FK pattern for target_*_id.

CREATE TABLE generated_artifact (
  id                              UUID PRIMARY KEY,
  tenant_id                       UUID NOT NULL REFERENCES tenant(id),
  artifact_type                   TEXT NOT NULL,        -- EMAIL_DRAFT, CONTENT_DRAFT, RECOMMENDATION, SUMMARY, ALERT, etc.

  -- Exclusive-arc target FKs: at most one non-null (artifact may have no target)
  target_party_id                 UUID REFERENCES party(id),
  target_membership_id            UUID REFERENCES membership(id),
  target_event_id                 UUID,                 -- Kept as UUID; no FK since Event is not a canonical entity

  status                          artifact_status NOT NULL DEFAULT 'DRAFTED',

  -- Prompt provenance (Section 4.2)
  prompt_template_id              TEXT NOT NULL,
  prompt_template_version         TEXT NOT NULL,

  -- Model provenance
  model_used                      TEXT NOT NULL,         -- gemini-3.1-pro-preview, gpt-X, etc.
  model_parameters                JSONB NOT NULL,        -- Temperature, max_tokens, system prompt variant

  -- Input provenance
  input_records                   JSONB NOT NULL,        -- Array of {"entity": "Signal", "id": "uuid"} refs

  -- Output
  output_content                  TEXT NOT NULL,          -- The actual artifact content
  output_metadata                 JSONB,                  -- Token counts, generation time, cost

  -- Human-in-the-loop tracking
  human_reviewed                  BOOLEAN NOT NULL DEFAULT false,
  human_edits                     TEXT,                   -- Diff or full edited version

  -- Forward attribution (filled in later)
  dispatched_as_interaction_id    UUID REFERENCES interaction(id),
  outcome_id                      UUID REFERENCES outcome(id),
  outcome_score                   DECIMAL(5,2),

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1,

  -- Exclusive-arc constraint for target: zero or one non-null
  CONSTRAINT artifact_target_arc CHECK (
    (CASE WHEN target_party_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN target_membership_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN target_event_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);
