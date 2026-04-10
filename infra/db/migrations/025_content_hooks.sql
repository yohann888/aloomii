CREATE TABLE IF NOT EXISTS content_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_date DATE,
  source_signal_type TEXT,
  source_signal_score NUMERIC,
  source_title TEXT,
  source_body TEXT,
  source_url TEXT,
  brand_persona TEXT,
  topic_tag TEXT,
  pain_type TEXT,
  hook_text TEXT NOT NULL,
  linkedin_opener TEXT,
  outreach_opener TEXT,
  ad_headline TEXT,
  video_angle TEXT,
  hook_confidence NUMERIC,
  reuse_score NUMERIC,
  brand_fit_score NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_content_hooks_created_at ON content_hooks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_hooks_brand_persona ON content_hooks(brand_persona);
CREATE INDEX IF NOT EXISTS idx_content_hooks_topic_tag ON content_hooks(topic_tag);
CREATE INDEX IF NOT EXISTS idx_content_hooks_pain_type ON content_hooks(pain_type);
CREATE INDEX IF NOT EXISTS idx_content_hooks_hook_confidence ON content_hooks(hook_confidence DESC);
