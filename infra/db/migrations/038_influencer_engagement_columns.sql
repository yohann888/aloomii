-- Migration: 038_influencer_engagement_columns.sql
-- Adds engagement tracking columns for EnsembleData backfill pipeline
-- Date: 2026-04-30

BEGIN;

-- Activity recency (used to filter dead accounts)
ALTER TABLE influencer_pipeline
    ADD COLUMN IF NOT EXISTS last_post_at TIMESTAMPTZ;

-- Post velocity in last 30 days (quality signal)
ALTER TABLE influencer_pipeline
    ADD COLUMN IF NOT EXISTS posts_in_last_30_days INT DEFAULT 0;

-- Audience tier classification (A/B/C/D based on engagement rate)
ALTER TABLE influencer_pipeline
    ADD COLUMN IF NOT EXISTS audience_size_tier TEXT;

-- External platform ID (YouTube channel_id, TikTok sec_uid, etc.)
-- Needed for API calls during backfill
ALTER TABLE influencer_pipeline
    ADD COLUMN IF NOT EXISTS platform_external_id TEXT;

-- Index for efficient backfill queries
CREATE INDEX IF NOT EXISTS idx_influencer_pipeline_email_null
    ON influencer_pipeline(email)
    WHERE email IS NULL;

CREATE INDEX IF NOT EXISTS idx_influencer_pipeline_platform_icp
    ON influencer_pipeline(platform_primary, icp_target)
    WHERE email IS NULL;

COMMIT;
