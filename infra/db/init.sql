-- ============================================================
-- Aloomii CRM — PostgreSQL Init Script
-- Phase 0: Foundation + Extensions + Schema
-- Generated: 2026-02-25
-- DB: aloomii
-- Stack: PostgreSQL 18.2 + pgvector 0.8.1 + TimescaleDB 2.25.1
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb;  -- TimescaleDB 2.25.1 (must be first)
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector 0.8.1: semantic search
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy text search (trigram similarity, GIN index)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- Levenshtein distance, Soundex, Metaphone
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- UUID generation

-- ── Accounts (Companies) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    domain      TEXT,
    tier        SMALLINT CHECK (tier IN (1, 2, 3)) DEFAULT 3,
    industry    TEXT,
    location    TEXT,
    website     TEXT,
    metadata    JSONB DEFAULT '{}',               -- legacy YAML overflow
    embedding   vector(768),                       -- semantic embedding (gemini-embedding-001, 768-dim, normalized)
    content_hash TEXT,                             -- md5 of embedded text — skip re-embed if unchanged
    embedding_model TEXT DEFAULT 'gemini-embedding-001',
    embedding_updated_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_metadata ON accounts USING GIN (metadata);
-- HNSW index with inner product ops (faster than cosine on normalized vectors, better recall than IVFFlat)
CREATE INDEX IF NOT EXISTS idx_accounts_embedding ON accounts USING hnsw (embedding vector_ip_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_accounts_name_trgm ON accounts USING GIN (name gin_trgm_ops);
-- Dimension constraint: hard perimeter against silent corruption from model changes or truncated API responses
ALTER TABLE accounts ADD CONSTRAINT enforce_embedding_dims CHECK (embedding IS NULL OR vector_dims(embedding) = 768);

-- ── Contacts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,
    name              TEXT NOT NULL,
    email             TEXT,
    handle            TEXT,                        -- Twitter/LinkedIn handle
    role              TEXT,
    location          TEXT,
    tier              SMALLINT CHECK (tier IN (1, 2, 3)) DEFAULT 3,
    category          TEXT,                        -- prospect / investor / partner
    lead_status       TEXT,                        -- hot / warm / cold
    source            TEXT,                        -- how they were found
    mutual_connection TEXT,
    linkedin_status   TEXT,
    tags              JSONB DEFAULT '[]',           -- array of tag strings
    notes             TEXT,
    metadata          JSONB DEFAULT '{}',           -- arbitrary YAML fields
    embedding         vector(768),                  -- notes embedding for RAG (gemini-embedding-001, 768-dim, normalized)
    content_hash      TEXT,                          -- md5 of embedded text — skip re-embed if unchanged
    embedding_model   TEXT DEFAULT 'gemini-embedding-001', -- model used for this embedding
    embedding_updated_at TIMESTAMPTZ,               -- when embedding was last regenerated
    added_at          DATE DEFAULT CURRENT_DATE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_email      ON contacts (email);
CREATE INDEX IF NOT EXISTS idx_contacts_handle     ON contacts (handle);
CREATE INDEX IF NOT EXISTS idx_contacts_tags       ON contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_metadata   ON contacts USING GIN (metadata);
-- HNSW index with inner product ops (faster than cosine on normalized vectors, better recall than IVFFlat)
CREATE INDEX IF NOT EXISTS idx_contacts_embedding  ON contacts USING hnsw (embedding vector_ip_ops) WITH (m = 16, ef_construction = 64);
-- Dimension constraint: hard perimeter against silent corruption from model changes or truncated API responses
ALTER TABLE contacts ADD CONSTRAINT enforce_embedding_dims CHECK (embedding IS NULL OR vector_dims(embedding) = 768);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm  ON contacts USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_tier       ON contacts (tier);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON contacts (lead_status);

-- ── Opportunities ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunities (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
    account_id   UUID REFERENCES accounts(id) ON DELETE SET NULL,
    stage        TEXT DEFAULT 'prospect',          -- prospect / qualified / proposal / closed
    value        NUMERIC(12, 2),                   -- estimated deal value
    currency     TEXT DEFAULT 'USD',
    service_fit  TEXT,                             -- which Aloomii service
    signals      JSONB DEFAULT '[]',               -- array of signal references
    notes        TEXT,
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    closed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opps_stage     ON opportunities (stage);
CREATE INDEX IF NOT EXISTS idx_opps_contact   ON opportunities (contact_id);
CREATE INDEX IF NOT EXISTS idx_opps_signals   ON opportunities USING GIN (signals);

-- Enable RLS on opportunities (financial/confidential data)
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policy: only app contexts with authorized channel ID can read
-- Replace channel IDs with actual Discord/Telegram channel IDs
CREATE POLICY opps_channel_isolation ON opportunities
    FOR SELECT
    USING (
        current_setting('app.channel_id', TRUE) IN (
            '824304330340827198',  -- Discord #general
            'TELEGRAM_CHANNEL_ID'  -- Replace with actual Telegram channel ID
        )
    );

-- Allow all writes (RLS applies to SELECT only by default here)
CREATE POLICY opps_write_all ON opportunities
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);

-- ── Activity Log (TimescaleDB Hypertable) ────────────────────
-- Regular table first, then converted to hypertable
-- PG18 AIO workers + TimescaleDB hypertables = max ingest throughput
CREATE TABLE IF NOT EXISTS activity_log (
    id           UUID DEFAULT gen_random_uuid(),
    time         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type         TEXT NOT NULL,                    -- signal / cron_run / email / dm
    source       TEXT,                             -- signal-scout / relationship-monitor / manual
    contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
    account_id   UUID REFERENCES accounts(id) ON DELETE SET NULL,
    score        SMALLINT,                         -- signal score 1-5
    subreddit    TEXT,                             -- for Reddit signals
    payload      JSONB DEFAULT '{}'               -- full signal/event data
);

-- Convert to TimescaleDB hypertable (partition by 1 week)
SELECT create_hypertable('activity_log', by_range('time', INTERVAL '1 week'),
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_activity_time    ON activity_log (time DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type    ON activity_log (type);
CREATE INDEX IF NOT EXISTS idx_activity_contact ON activity_log (contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_score   ON activity_log (score);
CREATE INDEX IF NOT EXISTS idx_activity_payload ON activity_log USING GIN (payload);

-- ── Materialized View: Weekly Signal Volume ───────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_signals AS
SELECT
    DATE_TRUNC('week', time) AS week,
    subreddit,
    COUNT(*)                  AS total_signals,
    COUNT(*) FILTER (WHERE score >= 4) AS hot_signals,
    AVG(score)::NUMERIC(3,1)  AS avg_score
FROM activity_log
WHERE type = 'signal'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_weekly_signals
    ON mv_weekly_signals (week, subreddit);

-- ── Helper: auto-update updated_at timestamp ─────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_opps_updated_at
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Events (Phase A migration) ───────────────────────────────────────────────
-- Migration from YAML/JSON to PostgreSQL + pgvector
-- Generated: 2026-03-04

-- ── events ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  date            DATE,
  date_end        DATE,
  city            TEXT,
  country         TEXT DEFAULT 'Canada',
  url             TEXT,
  hashtag         TEXT,
  source          TEXT,
  status          TEXT DEFAULT 'upcoming',
  recurs_annually BOOLEAN DEFAULT FALSE,
  base_score      INT,
  crm_bonus_score INT DEFAULT 0,
  total_score     INT,
  audience        TEXT[],
  notes           TEXT,
  embedding       vector(1536),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, date)
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_total_score ON events(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_events_embedding ON events USING ivfflat (embedding vector_cosine_ops);

-- ── event_contacts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role             TEXT,
  confidence       TEXT,
  source           TEXT,
  outreach_window  DATE,
  outreach_drafted BOOLEAN DEFAULT FALSE,
  outreach_sent    BOOLEAN DEFAULT FALSE,
  discord_alerted  BOOLEAN DEFAULT FALSE,
  detected_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_event_contacts_event ON event_contacts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_contacts_contact ON event_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_event_contacts_window ON event_contacts(outreach_window)
  WHERE outreach_drafted = FALSE;

-- ── event_collisions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_collisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  contact_ids UUID[] NOT NULL,
  alerted     BOOLEAN DEFAULT FALSE,
  alerted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id)
);

-- ── outreach_queue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  channel     TEXT,
  draft       TEXT,
  status      TEXT DEFAULT 'pending',
  fire_date   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_queue_fire_date ON outreach_queue(fire_date)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outreach_queue_contact ON outreach_queue(contact_id);

-- ── Views ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_upcoming_event_intelligence AS
SELECT
  e.id,
  e.name,
  e.date,
  e.city,
  e.total_score,
  e.status,
  COUNT(ec.id) as crm_match_count,
  array_agg(c.name ORDER BY c.tier, c.name) FILTER (WHERE c.id IS NOT NULL) as matched_contacts,
  MIN(ec.outreach_window) as earliest_outreach
FROM events e
LEFT JOIN event_contacts ec ON ec.event_id = e.id
LEFT JOIN contacts c ON c.id = ec.contact_id
WHERE e.date > NOW()
GROUP BY e.id, e.name, e.date, e.city, e.total_score, e.status
ORDER BY e.total_score DESC NULLS LAST, e.date ASC;

-- ── Done ──────────────────────────────────────────────────────
-- Run with: psql -U <user> -d aloomii -f infra/db/init.sql

-- ICP column for signal routing (added 2026-03-22)
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS icp VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_activity_icp ON activity_log (icp);
