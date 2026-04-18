-- ChamberCore follow-up fix
-- Adds user magic-link tracking column after initial foundation migration was already applied.

ALTER TABLE chamber.users
ADD COLUMN IF NOT EXISTS last_magic_link_sent_at TIMESTAMPTZ;
