-- Migration 035: Signal Idempotency + Metrics DB-Native
-- Date: 2026-04-25
-- Author: Leo (CoS)
-- 
-- Fixes two issues from MEMORY.md pending:
-- 1. Signal idempotency: inconsistent ON CONFLICT across ingest scripts
-- 2. export-metrics.js → DB: replaces multiple psql shell-outs with a single view

-- ============================================
-- PART 1: Signal Idempotency Fix
-- ============================================

-- Problem: ingest-run.js and ingest-signal.js use bare "ON CONFLICT DO NOTHING"
-- which catches ALL unique violations (including unexpected PK collisions).
-- lexi-b2b-signals.js and migrate-signals-md-to-db.js use partial index matching
-- but hn-signal-scout.js omits the WHERE clause.
--
-- Solution: Centralized upsert function. All ingest scripts should CALL this.

CREATE OR REPLACE FUNCTION upsert_signal(
  p_signal_type text,
  p_source_bu text,
  p_title text,
  p_body text DEFAULT NULL,
  p_score numeric(4,2) DEFAULT 3.0,
  p_confidence numeric(4,2) DEFAULT 0.8,
  p_raw_data jsonb DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_collection_method text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS TABLE(id uuid, is_new boolean) AS $$
DECLARE
  v_id uuid;
  v_is_new boolean := true;
BEGIN
  -- Deduplicate by source_url (the stable dedup key per idx_signals_source_url_dedup)
  IF p_source_url IS NOT NULL AND p_source_url <> '' THEN
    SELECT signals.id INTO v_id
    FROM signals
    WHERE signals.source_url = p_source_url
    LIMIT 1;
    
    IF FOUND THEN
      v_is_new := false;
      RETURN QUERY SELECT v_id, v_is_new;
      RETURN;
    END IF;
  END IF;
  
  -- Insert new signal
  INSERT INTO signals (
    signal_type, source_bu, title, body, score, confidence,
    raw_data, source_url, collection_method, expires_at
  ) VALUES (
    p_signal_type, p_source_bu, p_title, p_body, p_score, p_confidence,
    p_raw_data, p_source_url, p_collection_method,
    COALESCE(p_expires_at, NOW() + INTERVAL '7 days')
  )
  RETURNING signals.id INTO v_id;
  
  RETURN QUERY SELECT v_id, v_is_new;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_signal IS 
'Idempotent signal upsert. Deduplicates by source_url. 
All ingest scripts should call this instead of raw INSERT + ON CONFLICT.
Returns (id, is_new) so callers know if this was a duplicate.';

-- ============================================
-- PART 2: Metrics DB-Native Views
-- ============================================

-- Replaces export-metrics.js which shells out to psql 8+ times
-- Single query: SELECT * FROM v_public_metrics;

CREATE OR REPLACE VIEW v_public_metrics AS
WITH 
  signal_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE planning = 'active') AS total_active_signals,
      COUNT(*) FILTER (WHERE planning = 'active' AND score >= 4) AS hot_signals
    FROM signals
  ),
  contact_stats AS (
    SELECT 
      COUNT(*) AS total_contacts,
      COUNT(*) FILTER (WHERE lead_status IN ('hot', 'active', 'warm') OR status = 'active_conversation') AS active_opportunities
    FROM contacts
  ),
  outcome_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE logged_at > NOW() - INTERVAL '30 days') AS total_30d,
      COUNT(*) FILTER (WHERE logged_at > NOW() - INTERVAL '7 days') AS last_7d,
      COUNT(*) FILTER (WHERE logged_at > NOW() - INTERVAL '30 days' AND outcome IN ('replied','positive_response','booked','closed','attended','approved')) AS success_30d,
      COUNT(*) FILTER (WHERE logged_at > NOW() - INTERVAL '30 days' AND outcome = 'sent') AS sent_30d,
      COUNT(*) FILTER (WHERE logged_at > NOW() - INTERVAL '30 days' AND outcome = 'declined') AS declined_30d
    FROM outcome_log
  ),
  content_stats AS (
    SELECT COUNT(*) AS drafts_ready
    FROM content_posts
    WHERE published_at IS NULL AND status = 'draft'
  )
SELECT
  NOW() AS computed_at,
  ss.total_active_signals,
  ss.hot_signals,
  cs.total_contacts,
  cs.active_opportunities,
  os.total_30d,
  os.last_7d,
  os.success_30d,
  os.sent_30d,
  os.declined_30d,
  CASE WHEN os.total_30d > 0 THEN ROUND((os.success_30d::numeric / os.total_30d) * 100, 1) ELSE 0 END AS success_rate,
  CASE WHEN os.sent_30d > 0 THEN ROUND((os.success_30d::numeric / os.sent_30d) * 100, 1) ELSE 0 END AS conversion_rate,
  co.drafts_ready
FROM signal_stats ss
CROSS JOIN contact_stats cs
CROSS JOIN outcome_stats os
CROSS JOIN content_stats co;

COMMENT ON VIEW v_public_metrics IS 
'Single-query replacement for export-metrics.js psql shell-outs.
Run: SELECT * FROM v_public_metrics;
Or: SELECT jsonb_pretty(to_jsonb(v_public_metrics.*)) FROM v_public_metrics;';

-- ============================================
-- PART 3: Metrics Snapshots Table (for KV push pipeline)
-- ============================================

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,
  pushed_to_kv_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_created 
  ON metrics_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_unpushed 
  ON metrics_snapshots(pushed_to_kv_at) WHERE pushed_to_kv_at IS NULL;

COMMENT ON TABLE metrics_snapshots IS 
'Periodic snapshots of v_public_metrics for Cloudflare KV push.
Populated by export-metrics.js or a cron job.
Mark pushed_to_kv_at after successful KV upload.';

-- ============================================
-- PART 4: Backfill First Snapshot
-- ============================================

INSERT INTO metrics_snapshots (snapshot)
SELECT to_jsonb(v.*) FROM v_public_metrics v;

-- Verify
SELECT 'Migration 035 complete' AS status,
       (SELECT COUNT(*) FROM metrics_snapshots) AS snapshots,
       (SELECT COUNT(*) FROM signals WHERE source_url IS NOT NULL) AS signals_with_url;
