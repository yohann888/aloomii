-- ============================================================
-- 024_planning_state_v2.sql
-- Adds planning_state to signals + entities for stale-signal quarantine
-- Date: 2026-04-11
-- Rollback: DROP columns + enum; safe, no data loss beyond the state tag
-- ============================================================

-- 1. Create planning_state enum
CREATE TYPE planning_state AS ENUM (
    'active',       -- normal, visible to PM/pipeline
    'suppressed',   -- manually or automatically hidden from briefs
    'quarantined',  -- flagged stale/invalid, excluded from all active views
    'archived'      -- historical only, not surfaced anywhere
);

-- 2. Add planning_state to signals
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS planning planning_state DEFAULT 'active';

-- 3. Add planning_state to entities
ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS planning planning_state DEFAULT 'active';

-- 4. Add suppression metadata (who/why/when)
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suppressed_by  TEXT,
    ADD COLUMN IF NOT EXISTS suppress_reason TEXT;

ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suppressed_by  TEXT,
    ADD COLUMN IF NOT EXISTS suppress_reason TEXT;

-- 5. Indexes for active-only queries (the PM read boundary)
CREATE INDEX IF NOT EXISTS idx_signals_planning_state
    ON signals (planning) WHERE planning = 'active';

CREATE INDEX IF NOT EXISTS idx_entities_planning_state
    ON entities (planning) WHERE planning = 'active';

-- 6. Composite index for PM brief queries: active signals by score
CREATE INDEX IF NOT EXISTS idx_signals_active_score
    ON signals (score DESC, created_at DESC)
    WHERE planning = 'active';

-- ============================================================
-- END 024_planning_state_v2.sql
-- ============================================================