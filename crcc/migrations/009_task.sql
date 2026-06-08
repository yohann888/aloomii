-- 009_task.sql
-- Task entity (Section 3.9, added in v1.2).
-- Forward-looking work assigned to a Party (human) or agent.
-- Lifecycle: PENDING → IN_PROGRESS → COMPLETED | CANCELLED.
-- completed_as_interaction_id links planned work to historical record.
-- Assignment arc: exactly one of assigned_to_party_id or assigned_to_agent_id must be non-null.
-- About arc: exactly one of about_party_id, about_membership_id, about_decision_id must be non-null.
--
-- created_by prefix convention (Section 3.9):
--   "user:<party_id>"              — human-created
--   "agent:<agent_id>:<run_id>"    — autonomous-agent-created
--   "system:<process_name>"        — scheduled/rule-based process

CREATE TABLE task (
  id                              UUID PRIMARY KEY,        -- UUIDv7, generated in app code
  tenant_id                       UUID NOT NULL REFERENCES tenant(id),

  -- Assignment arc: exactly one must be non-null
  assigned_to_party_id            UUID REFERENCES party(id),
  assigned_to_agent_id            TEXT,                     -- Agent identifier string

  -- About arc: exactly one must be non-null
  about_party_id                  UUID REFERENCES party(id),
  about_membership_id             UUID REFERENCES membership(id),
  about_decision_id               UUID REFERENCES decision(id),

  task_type                       TEXT NOT NULL,            -- FOLLOW_UP, CALL, EMAIL, REVIEW, DRAFT, SCHEDULE, etc.
  description                     TEXT NOT NULL,            -- Human-readable task description (required)
  status                          task_status NOT NULL DEFAULT 'PENDING',
  priority                        task_priority DEFAULT 'MEDIUM',
  due_at                          TIMESTAMPTZ,             -- Null for open-ended
  completed_at                    TIMESTAMPTZ,
  completed_as_interaction_id     UUID REFERENCES interaction(id),
  triggered_by_signal_id          UUID REFERENCES signal(id),
  triggered_by_decision_id        UUID REFERENCES decision(id),
  cancelled_reason                TEXT,                     -- Required if status is CANCELLED
  metadata                        JSONB,                    -- Task-type-specific details

  -- Universal metadata header
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT,
  source      TEXT NOT NULL,
  confidence  DECIMAL(3,2),
  version     INTEGER NOT NULL DEFAULT 1,

  -- Assignment arc constraint: exactly one assignee
  CONSTRAINT task_assignment_arc CHECK (
    (CASE WHEN assigned_to_party_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN assigned_to_agent_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),

  -- About arc constraint: exactly one subject
  CONSTRAINT task_about_arc CHECK (
    (CASE WHEN about_party_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN about_membership_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN about_decision_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
