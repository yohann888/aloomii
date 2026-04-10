-- Migration: 024_brand_profiles.sql
-- Create brand_profiles table and link to content_posts

CREATE TABLE IF NOT EXISTS brand_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner TEXT NOT NULL UNIQUE, -- 'yohann', 'jenny'
    display_name TEXT NOT NULL,
    archetypes TEXT[],
    core_position TEXT,
    creation_myth TEXT,
    phraseology JSONB DEFAULT '{}'::jsonb,
    channels TEXT[],
    behaviors TEXT[],
    maven_blocks JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add brand_profile_id to content_posts
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS brand_profile_id UUID REFERENCES brand_profiles(id);

-- Add updated_at trigger for brand_profiles
CREATE OR REPLACE FUNCTION update_brand_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_brand_profiles_updated_at ON brand_profiles;
CREATE TRIGGER trg_brand_profiles_updated_at
    BEFORE UPDATE ON brand_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_brand_profiles_updated_at();

-- Seed data
INSERT INTO brand_profiles (owner, display_name, archetypes, core_position, phraseology, behaviors)
VALUES 
('yohann', 'Yohann Calpu', ARRAY['The Signal Caller', 'Well-Placed Source', 'Researcher', 'Intellect'], 
 'Humans close deals. AI doesn''t. Precision and filtering signal from noise.', 
 '{"catchphrases": ["The last 20%", "AI scans. Humans judge. You act.", "Humans close deals. AI doesn''t."]}'::jsonb,
 ARRAY['Always has a data point', 'Short, staccato writing style', 'Never hypes AI']),
('jenny', 'Jenny Calpu', ARRAY['The Authentic Synthesizer', 'Self-Made Woman', 'The Synthesizer', 'Common Woman'],
 'You don''t need a team. You need the right tools and the emotional intelligence to use them.',
 '{"catchphrases": ["Wear what you feel", "I built this with a 4-year-old running around", "AI amplifies you. It doesn''t replace you."]}'::jsonb,
 ARRAY['Demonstrates rather than just explains', 'Connects AI to emotional outcomes', 'Warm and direct']);
