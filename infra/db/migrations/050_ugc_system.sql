-- 050_ugc_system.sql — AI UGC Script Generation System
-- v2: Incorporates Kimi + Leo review. All must-fixes + recommended improvements applied.
-- Tables: ugc_prompts, ugc_prompt_history, ugc_scripts, ugc_script_versions, ugc_performance, ugc_feedback

-- ─── 1. PROMPT TEMPLATES ─────────────────────────────────────────────────────
-- Editable in DB — no code deploy needed for prompt changes.

CREATE TABLE IF NOT EXISTS ugc_prompts (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  template_body TEXT NOT NULL,       -- Full prompt with {{var}} placeholders
  model         TEXT DEFAULT 'anthropic/claude-opus-4-7',
  max_tokens    INTEGER DEFAULT 2048,
  temperature   NUMERIC(3,2) DEFAULT 0.85,
  -- Versioning
  version       INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    TEXT,
  -- Audit (checksum for quick equality checks)
  prompt_hash   TEXT GENERATED ALWAYS AS (MD5(template_body)) STORED
);

-- ─── 2. PROMPT HISTORY (MUST-FIX: old template bodies were lost) ─────────────
-- Every UPDATE to ugc_prompts.template_body snapshots the old version here.
-- Enables: "what did prompt v3 look like?" retroactively.

CREATE TABLE IF NOT EXISTS ugc_prompt_history (
  id            SERIAL PRIMARY KEY,
  prompt_id     INTEGER NOT NULL REFERENCES ugc_prompts(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  template_body TEXT NOT NULL,
  prompt_hash   TEXT GENERATED ALWAYS AS (MD5(template_body)) STORED,
  changed_at    TIMESTAMPTZ DEFAULT NOW(),
  changed_by    TEXT,
  change_note   TEXT,
  UNIQUE (prompt_id, version)
);

-- ─── 3. SCRIPT GENERATION JOBS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ugc_scripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id       INTEGER REFERENCES ugc_prompts(id),
  prompt_version  INTEGER NOT NULL DEFAULT 1,
  -- Pain signal source
  pain_signal_id  BIGINT REFERENCES pain_signals(id),
  -- Form inputs as submitted (JSONB: pov_lens, script_length, character vars, brand, etc.)
  form_data       JSONB NOT NULL DEFAULT '{}',
  -- The actual filled prompt sent to the model
  rendered_prompt TEXT,
  -- Output
  script_body     TEXT,
  hooks           TEXT[],       -- 3 alternate hooks
  ctas            TEXT[],       -- 2 alternate CTAs
  subtext_line    TEXT,
  -- Asset tracking (added post-review)
  asset_urls      JSONB,        -- {video_url, thumbnail_url, caption, platform_post_ids}
  -- Job tracking
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  model_used      TEXT,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd        NUMERIC(10,6),
  latency_ms      INTEGER,
  error_message   TEXT,
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      TEXT
);

-- ─── 4. SCRIPT VERSIONS / ITERATIONS ─────────────────────────────────────────
-- Structured diff approach (MUST-FIX: replaces wasteful full-prompt duplication)

CREATE TABLE IF NOT EXISTS ugc_script_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_script_id UUID NOT NULL REFERENCES ugc_scripts(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL DEFAULT 1,
  -- What changed (structured diff instead of full-text duplication)
  edit_type        TEXT CHECK (edit_type IN (
    'hook_rewrite', 'cta_change', 'tone_shift', 'length_adjust',
    'pain_reframe', 'character_swap', 'prompt_template_change', 'manual_edit'
  )),
  edit_summary     TEXT,        -- "Swapped hook from meeting stress → spreadsheet shame angle"
  variables_changed JSONB,      -- {"age": "29 → 34", "pov_lens": "confession → rant"}
  -- The actual prompt sent for this version (always stored — this is the model input)
  rendered_prompt  TEXT,
  -- Output
  script_body      TEXT,
  hooks            TEXT[],
  ctas             TEXT[],
  subtext_line     TEXT,
  asset_urls       JSONB,
  -- Job tracking
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  model_used       TEXT,
  tokens_in        INTEGER,
  tokens_out       INTEGER,
  cost_usd         NUMERIC(10,6),
  latency_ms       INTEGER,
  -- Timestamps
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT,
  UNIQUE (parent_script_id, version_number)
);

-- ─── 5. PERFORMANCE METRICS ───────────────────────────────────────────────────
-- Multi-row time-series per script (one row per hours_since_post checkpoint).
-- Supports growth curve tracking: 24h, 48h, 72h, 7d, 30d snapshots.

CREATE TABLE IF NOT EXISTS ugc_performance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id        UUID NOT NULL REFERENCES ugc_scripts(id) ON DELETE CASCADE,
  -- Platform
  platform         TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube_shorts', 'linkedin')),
  post_url         TEXT,
  -- Raw metrics
  views            INTEGER,
  likes            INTEGER,
  comments         INTEGER,
  shares           INTEGER,
  saves            INTEGER,
  watch_time_sec   NUMERIC(10,2),   -- Average watch time in seconds
  ctr              NUMERIC(5,4),    -- Click-through rate
  followers_gained INTEGER,
  profile_visits   INTEGER,
  -- Derived score (generated column)
  engagement_rate  NUMERIC(8,6) GENERATED ALWAYS AS (
    CASE WHEN COALESCE(views, 0) > 0
    THEN (COALESCE(likes,0) + COALESCE(comments,0)*2 + COALESCE(shares,0)*3)::NUMERIC / views
    ELSE 0 END
  ) STORED,
  viral_score      NUMERIC(6,2),    -- Custom weighted score (set by analytics agent)
  -- Conversion metrics
  clicks_to_site   INTEGER,
  signups          INTEGER,
  revenue_usd      NUMERIC(10,2),
  -- Time window (MUST-FIX: snapshot type for safe multi-row tracking)
  snapshot_type    TEXT CHECK (snapshot_type IN ('24h','48h','72h','7d','14d','30d','latest','manual')),
  hours_since_post INTEGER,
  recorded_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Data provenance
  data_source      TEXT DEFAULT 'manual' CHECK (data_source IN ('manual', 'api', 'analytics_export')),
  notes            TEXT,
  -- MUST-FIX: prevent duplicate snapshots
  CONSTRAINT uq_ugc_perf_snapshot UNIQUE (script_id, platform, hours_since_post)
);

-- ─── 6. FEEDBACK / RATINGS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ugc_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id       UUID REFERENCES ugc_scripts(id) ON DELETE CASCADE,
  version_id      UUID REFERENCES ugc_script_versions(id) ON DELETE SET NULL,
  -- Rater identity
  rated_by        TEXT NOT NULL,   -- 'jenny', 'yohann', 'ai_critic', 'panel'
  feedback_type   TEXT DEFAULT 'human_review'
    CHECK (feedback_type IN ('human_review', 'ai_critic', 'panel_vote', 'a_b_winner')),
  -- Dimension scores (1-10)
  hook_strength   INTEGER CHECK (hook_strength BETWEEN 1 AND 10),
  authenticity    INTEGER CHECK (authenticity BETWEEN 1 AND 10),
  pain_accuracy   INTEGER CHECK (pain_accuracy BETWEEN 1 AND 10),
  cta_clarity     INTEGER CHECK (cta_clarity BETWEEN 1 AND 10),
  overall_score   INTEGER CHECK (overall_score BETWEEN 1 AND 10),
  -- RECOMMENDED: Binary publish decision (training label for future auto-approve)
  would_publish      BOOLEAN,
  publish_decision   TEXT CHECK (publish_decision IN ('ship', 'edit', 'kill', 'test')),
  -- Freeform
  feedback_text   TEXT,
  suggested_edit  TEXT,           -- "Lead with the spreadsheet shame, not the meeting"
  -- Timestamp
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- One feedback row per rater per script/version
  CONSTRAINT uq_ugc_feedback_rater UNIQUE (script_id, version_id, rated_by, feedback_type)
);

-- ─── 7. CAMPAIGNS (OPTIONAL: brand/campaign grouping) ────────────────────────

CREATE TABLE IF NOT EXISTS ugc_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug      TEXT NOT NULL,   -- 'vibrnt', 'aloomii', 'pbn'
  campaign_name   TEXT NOT NULL,
  description     TEXT,
  target_icp_slug TEXT REFERENCES icp_definitions(slug),
  start_date      DATE,
  end_date        DATE,
  budget_usd      NUMERIC(10,2),
  goal            TEXT CHECK (goal IN ('awareness', 'signups', 'revenue', 'brand_lift', 'ugc_test')),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      TEXT
);

-- Add campaign FK to scripts (nullable — campaigns are optional)
ALTER TABLE ugc_scripts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES ugc_campaigns(id) ON DELETE SET NULL;

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ugc_scripts_status      ON ugc_scripts(status);
CREATE INDEX IF NOT EXISTS idx_ugc_scripts_pain_signal ON ugc_scripts(pain_signal_id);
CREATE INDEX IF NOT EXISTS idx_ugc_scripts_created     ON ugc_scripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_scripts_campaign    ON ugc_scripts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ugc_scripts_prompt      ON ugc_scripts(prompt_id, prompt_version);
CREATE INDEX IF NOT EXISTS idx_ugc_versions_parent     ON ugc_script_versions(parent_script_id);
CREATE INDEX IF NOT EXISTS idx_ugc_perf_script         ON ugc_performance(script_id);
CREATE INDEX IF NOT EXISTS idx_ugc_perf_platform       ON ugc_performance(platform, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_perf_views          ON ugc_performance(views DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ugc_feedback_script     ON ugc_feedback(script_id);
CREATE INDEX IF NOT EXISTS idx_ugc_feedback_score      ON ugc_feedback(overall_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ugc_prompt_history      ON ugc_prompt_history(prompt_id, version);

-- ─── VIEW: TOP PERFORMERS ─────────────────────────────────────────────────────
-- MUST-FIX: Uses LATERAL to pick latest snapshot per script (no phantom duplicate rows)

CREATE OR REPLACE VIEW v_ugc_top_performers AS
SELECT
  s.id                           AS script_id,
  s.campaign_id,
  uc.brand_slug,
  uc.campaign_name,
  s.pain_signal_id,
  ps.pain_category,
  ps.severity,
  s.script_body,
  s.hooks,
  s.form_data->>'pov_lens'        AS pov_lens,
  s.form_data->>'script_length'   AS script_length,
  s.form_data->>'brand_product'   AS brand_product,
  p.platform,
  p.views,
  p.engagement_rate,
  p.viral_score,
  p.signups,
  p.revenue_usd,
  p.snapshot_type,
  ROUND(AVG(f.overall_score), 2)  AS avg_human_score,
  COUNT(DISTINCT f.id)            AS feedback_count,
  BOOL_OR(f.would_publish)        AS any_approved,
  BOOL_AND(f.would_publish)       AS all_approved,
  s.cost_usd                      AS generation_cost_usd
FROM ugc_scripts s
LEFT JOIN pain_signals ps       ON ps.id = s.pain_signal_id
LEFT JOIN ugc_campaigns uc      ON uc.id = s.campaign_id
-- LATERAL: latest snapshot per (script, platform) — no duplicate rows
LEFT JOIN LATERAL (
  SELECT * FROM ugc_performance
  WHERE script_id = s.id
  ORDER BY recorded_at DESC
  LIMIT 1
) p ON true
LEFT JOIN ugc_feedback f        ON f.script_id = s.id AND f.overall_score IS NOT NULL
WHERE s.status = 'completed'
GROUP BY
  s.id, s.campaign_id, uc.brand_slug, uc.campaign_name,
  s.pain_signal_id, ps.pain_category, ps.severity,
  s.script_body, s.hooks, s.form_data, s.cost_usd,
  p.platform, p.views, p.engagement_rate, p.viral_score,
  p.signups, p.revenue_usd, p.snapshot_type
HAVING COALESCE(p.views, 0) > 1000 OR AVG(f.overall_score) >= 7
ORDER BY COALESCE(p.viral_score, AVG(f.overall_score) * 1000, 0) DESC NULLS LAST;

-- ─── TRIGGERS ────────────────────────────────────────────────────────────────
-- 1. Auto-increment prompt version + snapshot history on template_body change

CREATE OR REPLACE FUNCTION ugc_prompt_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.template_body IS DISTINCT FROM NEW.template_body THEN
    -- Archive the OLD version before overwriting
    INSERT INTO ugc_prompt_history (prompt_id, version, template_body, changed_at, changed_by)
    VALUES (OLD.id, OLD.version, OLD.template_body, NOW(), NEW.created_by);
    -- Increment version
    NEW.version    := OLD.version + 1;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ugc_prompt_version ON ugc_prompts;
CREATE TRIGGER trg_ugc_prompt_version
  BEFORE UPDATE ON ugc_prompts
  FOR EACH ROW
  EXECUTE FUNCTION ugc_prompt_on_update();

-- 2. Auto-set version_number on ugc_script_versions insert

CREATE OR REPLACE FUNCTION ugc_script_version_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number = 1 THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO NEW.version_number
    FROM ugc_script_versions
    WHERE parent_script_id = NEW.parent_script_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ugc_version_number ON ugc_script_versions;
CREATE TRIGGER trg_ugc_version_number
  BEFORE INSERT ON ugc_script_versions
  FOR EACH ROW
  EXECUTE FUNCTION ugc_script_version_number();

-- ─── SEED: DEFAULT PROMPT TEMPLATE ───────────────────────────────────────────

INSERT INTO ugc_prompts (slug, name, description, template_body, created_by)
VALUES (
  'screenwriter_v1',
  'Screenwriter V1 — First-Person UGC Monologue',
  'Master screenwriter prompt for short-form UGC. Infers deeper pain from verbatim research. Outputs script + 3 hooks + 2 CTAs + subtext line.',
  E'You are a master screenwriter who writes dialogue that sounds caught on tape, not written.\nYour specialty is short-form, first-person, camera-direct UGC monologue.\n\nHere is the raw pain signal research from a real user interview / Reddit post:\n---\nVERBATIM QUOTE: "{{verbatim_quote}}"\nRESEARCHER INSIGHT: {{insight}}\nCONTEXT SNIPPET: {{context_snippet}}\nPAIN CATEGORY: {{pain_category}}\nSEVERITY: {{severity}}/10\n---\n\nYour task: Find the nuance in this pain signal. Map it to the screenwriter template below.\nInfer the deeper pain, the duration, what they have tried, the concrete cost, and the hidden shame.\n\n# CHARACTER\n- Identity: {{name}}, {{age}}, {{occupation}}, {{life_stage}}, {{location}}\n- Personality: {{personality_traits}}\n- Speech DNA:\n  - Vocabulary level: {{vocabulary_level}}\n  - Verbal tics or signature phrases: {{verbal_tics}}\n  - Cadence: {{cadence}}\n- Emotional state RIGHT NOW: {{emotional_state}}\n\n# THE PAIN (infer from the research above)\n- Surface pain point: [derived from verbatim_quote]\n- The deeper pain underneath it: [derived from insight + context]\n- How long they have lived with it: [infer from tone]\n- What they have already tried that did not work: [infer from context]\n- The concrete cost: [hours, dollars, missed events]\n- The shame or frustration they do not say out loud: [subtext, not text]\n\n# THE STORY ANGLE\n- POV lens: {{pov_lens}}\n- Inciting moment: [what just happened that made them open the camera RIGHT NOW]\n- The turn: [how {{brand_product}} entered their life]\n- The payoff: [what is different now — concrete detail, not adjectives]\n- The topic: {{brand_product}}\n\n# THE CALL TO ACTION\n- Destination: {{cta_destination}}\n- Tone of the ask: {{cta_tone}}\n\n# OUTPUT SPEC\nWrite a {{script_length}}-second monologue (~{{word_count}} words).\n\nStructure:\n1. HOOK — first 7 words break a pattern. No "Have you ever," no "POV," no "Let me tell you."\n2. SPECIFIC ADMISSION — within first 15s, one concrete, slightly vulnerable detail only this character would say.\n3. THE TURN — discovery beat. Accidental or reluctant, not pitched.\n4. PAYOFF — show, do not summarize. One sensory detail beats five adjectives.\n5. CTA — woven in like an aside, not announced.\n\nAlso provide:\n- 3 alternate hooks (5-10 words each, completely different angles on the same pain)\n- 2 alternate CTAs (different tones: direct, reluctant, humorous)\n- 1 subtext line (the thing this character is REALLY saying without saying it)\n\nFormat your output as:\n---SCRIPT---\n[monologue here]\n\n---HOOKS---\n1. [hook]\n2. [hook]\n3. [hook]\n\n---CTAS---\n1. [cta]\n2. [cta]\n\n---SUBTEXT---\n[one sentence]',
  'system'
)
ON CONFLICT (slug) DO NOTHING;
