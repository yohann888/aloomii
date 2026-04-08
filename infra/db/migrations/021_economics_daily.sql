-- Migration: 021_economics_daily.sql
-- Economics daily snapshot table for Command Center live economics card

CREATE TABLE IF NOT EXISTS economics_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    input_tokens BIGINT DEFAULT 0,
    output_tokens BIGINT DEFAULT 0,
    cache_read_tokens BIGINT DEFAULT 0,
    cache_write_tokens BIGINT DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economics_daily_date ON economics_daily(date DESC);
