-- Migration: Newsletter Owners + Partner Offers
-- Created: 2026-05-03

-- Step 1: Extend influencer_pipeline for newsletter fields
ALTER TABLE influencer_pipeline 
  ADD COLUMN IF NOT EXISTS influencer_type TEXT DEFAULT 'social',
  ADD COLUMN IF NOT EXISTS subscriber_count INTEGER,
  ADD COLUMN IF NOT EXISTS topic_focus TEXT,
  ADD COLUMN IF NOT EXISTS frequency TEXT,
  ADD COLUMN IF NOT EXISTS sponsorship_pricing TEXT,
  ADD COLUMN IF NOT EXISTS icp_fit_label TEXT,
  ADD COLUMN IF NOT EXISTS priority_rank INTEGER,
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS topics TEXT[];

-- Step 2: Backfill existing 469 rows as social
UPDATE influencer_pipeline SET influencer_type = 'social' WHERE influencer_type IS NULL;

-- Step 3: Create partner_offers table
CREATE TABLE IF NOT EXISTS partner_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  offer_type TEXT NOT NULL DEFAULT 'newsletter', -- 'social' | 'newsletter'
  commission_pct INTEGER NOT NULL DEFAULT 25,
  discount_pct INTEGER NOT NULL DEFAULT 20,
  discount_code TEXT,
  free_editions TEXT[] DEFAULT '{"Operator","Leader"}',
  studio_membership BOOLEAN DEFAULT true,
  co_marketing BOOLEAN DEFAULT false,
  sponsored_placement BOOLEAN DEFAULT false,
  custom_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft → sent → accepted → active → paused → declined
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Create offer_defaults table (static config, 2 rows)
CREATE TABLE IF NOT EXISTS offer_defaults (
  id SERIAL PRIMARY KEY,
  offer_type TEXT UNIQUE NOT NULL,
  commission_pct INTEGER NOT NULL DEFAULT 25,
  discount_pct INTEGER NOT NULL DEFAULT 20,
  free_editions TEXT[] DEFAULT '{"Operator","Leader"}',
  studio_membership BOOLEAN DEFAULT true,
  co_marketing BOOLEAN DEFAULT false,
  sponsored_placement BOOLEAN DEFAULT false,
  default_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: Seed offer_defaults with 2 rows
INSERT INTO offer_defaults (offer_type, commission_pct, discount_pct, free_editions, studio_membership, co_marketing, sponsored_placement, default_notes)
VALUES 
  ('social', 20, 15, '{"Founder","Solo","Operator"}', true, true, false, 'Social influencer default: all 3 playbook editions + studio + co-marketing'),
  ('newsletter', 25, 20, '{"Operator"}', true, false, true, 'Newsletter default: Operator Leader edition + studio + sponsored email placement')
ON CONFLICT (offer_type) DO NOTHING;

-- Step 6: Index for performance
CREATE INDEX IF NOT EXISTS idx_influencer_pipeline_type ON influencer_pipeline(influencer_type);
CREATE INDEX IF NOT EXISTS idx_influencer_pipeline_priority ON influencer_pipeline(priority_rank);
CREATE INDEX IF NOT EXISTS idx_partner_offers_influencer ON partner_offers(influencer_id);
CREATE INDEX IF NOT EXISTS idx_partner_offers_status ON partner_offers(status);
CREATE INDEX IF NOT EXISTS idx_partner_offers_type ON partner_offers(offer_type);
