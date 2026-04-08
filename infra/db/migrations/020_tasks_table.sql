-- Migration 020: Tasks table for Fleet-to-Dashboard Bridge
-- Date: 2026-04-06
-- Creates tasks table + indexes for Command Center HQ tasks widget

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assignee TEXT,              
    source TEXT NOT NULL,       
    category TEXT,              
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
    priority TEXT DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    metadata JSONB,             
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE status != 'done';
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_tasks_updated_at();

COMMENT ON TABLE tasks IS 'Structured tasks from hunter-support and other fleet agents for Command Center HQ';
